export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { revertCommitPaths } from '@/lib/github';
import { moveObjectToTrash } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase-admin';

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

interface ActorRow {
  role: string;
  display_name: string | null;
}

interface PushRow {
  id: string;
  pushed_by: string;
  withdrawn_at: string | null;
  github_commit_sha: string | null;
}

interface PushWithdrawRow {
  id: string;
  withdrawn_at: string;
  withdrawn_by: string;
  withdrawn_reason: string | null;
  github_revert_sha: string | null;
  github_revert_failed: boolean;
  github_revert_error: string | null;
}

interface AssetRow {
  id: string;
  storage_backend: 'github' | 'r2';
  storage_ref: string;
}

type GithubStatus = 'reverted' | 'revert_failed' | 'no_github_assets';

function codedError(code: string, message: string, status: number): Response {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function revertMessage(pushId: string, displayName: string, reason?: string): string {
  const base = `revert: withdraw push ${pushId} by ${displayName}`;
  return reason ? `${base} (${reason})` : base;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await ctx.params;
  let body: unknown = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const reason = parsed.data.reason || null;
  const admin = supabaseAdmin();
  const { data: actor, error: actorError } = await admin
    .from('users')
    .select('role,display_name')
    .eq('id', auth.user_id)
    .single<ActorRow>();

  if (actorError || !actor) {
    return err('INTERNAL_ERROR', actorError?.message ?? 'actor lookup failed', undefined, 500);
  }

  const { data: push, error: pushError } = await admin
    .from('pushes')
    .select('id,pushed_by,withdrawn_at,github_commit_sha')
    .eq('id', id)
    .maybeSingle<PushRow>();

  if (pushError) {
    return err('INTERNAL_ERROR', pushError.message, undefined, 500);
  }

  if (!push) {
    return err('PAYLOAD_MALFORMED', 'push not found', undefined, 404);
  }

  if (push.pushed_by !== auth.user_id && actor.role !== 'admin') {
    return codedError('WITHDRAW_NOT_PERMITTED', 'withdraw not permitted', 403);
  }

  if (push.withdrawn_at) {
    return codedError('ALREADY_WITHDRAWN', 'push already withdrawn', 410);
  }

  const { data: assets, error: assetsError } = await admin
    .from('assets')
    .select('id,storage_backend,storage_ref')
    .eq('push_id', id)
    .order('id', { ascending: true });

  if (assetsError) {
    return err('INTERNAL_ERROR', assetsError.message, undefined, 500);
  }

  const assetRows = (assets ?? []) as AssetRow[];
  const withdrawnAt = new Date().toISOString();
  const { data: withdrawn, error: withdrawError } = await admin
    .from('pushes')
    .update({
      withdrawn_by: auth.user_id,
      withdrawn_at: withdrawnAt,
      withdrawn_reason: reason,
    })
    .eq('id', id)
    .is('withdrawn_at', null)
    .select(
      'id,withdrawn_at,withdrawn_by,withdrawn_reason,github_revert_sha,github_revert_failed,github_revert_error',
    )
    .maybeSingle<PushWithdrawRow>();

  if (withdrawError) {
    return err('INTERNAL_ERROR', withdrawError.message, undefined, 502);
  }

  if (!withdrawn) {
    return codedError('ALREADY_WITHDRAWN', 'push already withdrawn', 410);
  }

  const { data: affectedAssets, error: assetWithdrawError } = await admin
    .from('assets')
    .update({ withdrawn_at: withdrawn.withdrawn_at })
    .eq('push_id', id)
    .select('id');

  if (assetWithdrawError) {
    return err('INTERNAL_ERROR', assetWithdrawError.message, undefined, 502);
  }

  const githubAssets = assetRows.filter((asset) => asset.storage_backend === 'github');
  let githubStatus: GithubStatus = 'no_github_assets';
  let githubRevertSha: string | null = null;
  let githubRevertFailed = false;
  let githubRevertError: string | null = null;

  if (push.github_commit_sha && githubAssets.length > 0) {
    try {
      githubRevertSha = await revertCommitPaths({
        commitSha: push.github_commit_sha,
        paths: githubAssets.map((asset) => asset.storage_ref),
        message: revertMessage(id, actor.display_name ?? auth.email, reason ?? undefined),
      });
      await admin.from('pushes').update({ github_revert_sha: githubRevertSha }).eq('id', id);
      githubStatus = 'reverted';
    } catch (error) {
      githubRevertFailed = true;
      githubRevertError = (error as Error).message;
      await admin
        .from('pushes')
        .update({
          github_revert_failed: true,
          github_revert_error: githubRevertError,
        })
        .eq('id', id);
      githubStatus = 'revert_failed';
    }
  }

  let trashObjectsMoved = 0;

  for (const asset of assetRows.filter((row) => row.storage_backend === 'r2')) {
    try {
      await moveObjectToTrash(asset.storage_ref);
      trashObjectsMoved += 1;
    } catch (error) {
      console.warn(`R2 trash move failed for ${asset.storage_ref}:`, (error as Error).message);
    }
  }

  return ok({
    push: {
      id: withdrawn.id,
      withdrawn_at: withdrawn.withdrawn_at,
      withdrawn_by: withdrawn.withdrawn_by,
      withdrawn_reason: withdrawn.withdrawn_reason,
      github_revert_sha: githubRevertSha ?? withdrawn.github_revert_sha,
      github_revert_failed: githubRevertFailed || withdrawn.github_revert_failed,
      github_revert_error: githubRevertError ?? withdrawn.github_revert_error,
    },
    affected_asset_ids: ((affectedAssets ?? []) as Array<{ id: string }>).map((asset) => asset.id),
    trash_objects_moved: trashObjectsMoved,
    github_status: githubStatus,
  });
}
