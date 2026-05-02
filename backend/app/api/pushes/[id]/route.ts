export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RelatedUser = { id: string; display_name: string | null } | Array<{ id: string; display_name: string | null }> | null;
type RelatedEpisode =
  | { id: string; name_cn: string; episode_path: string }
  | Array<{ id: string; name_cn: string; episode_path: string }>
  | null;

interface PushRow {
  id: string;
  idempotency_key: string;
  commit_message: string;
  github_commit_sha: string | null;
  github_revert_sha: string | null;
  github_revert_failed: boolean;
  pushed_by: string;
  pushed_by_user?: RelatedUser;
  pushed_at: string;
  asset_count: number;
  total_bytes: number | string;
  withdrawn_by: string | null;
  withdrawn_by_user?: RelatedUser;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  episodes?: RelatedEpisode;
}

interface AssetRow {
  id: string;
  type_code: string;
  name: string;
  variant: string | null;
  version: number;
  language: string;
  final_filename: string;
  storage_backend: 'github' | 'r2';
  storage_ref: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  withdrawn_at: string | null;
}

function firstUser(user: RelatedUser | undefined): { id: string; display_name: string | null } | null {
  if (Array.isArray(user)) {
    return user[0] ?? null;
  }

  return user ?? null;
}

function firstEpisode(episode: RelatedEpisode | undefined): { id: string; name_cn: string; episode_path: string } | null {
  if (Array.isArray(episode)) {
    return episode[0] ?? null;
  }

  return episode ?? null;
}

function mapPush(row: PushRow, authUserId: string, isAdmin: boolean) {
  const pushedBy = firstUser(row.pushed_by_user) ?? { id: row.pushed_by, display_name: null };
  const withdrawnBy = firstUser(row.withdrawn_by_user);

  return {
    id: row.id,
    idempotency_key: row.idempotency_key,
    commit_message: row.commit_message,
    github_commit_sha: row.github_commit_sha,
    github_revert_sha: row.github_revert_sha,
    github_revert_failed: row.github_revert_failed,
    pushed_by: pushedBy,
    pushed_at: row.pushed_at,
    asset_count: row.asset_count,
    total_bytes: row.total_bytes,
    withdrawn_by: withdrawnBy,
    withdrawn_at: row.withdrawn_at,
    withdrawn_reason: row.withdrawn_reason,
    is_withdrawable_by_me: row.pushed_by === authUserId || isAdmin,
    episode: firstEpisode(row.episodes),
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { data: roleRow, error: roleError } = await admin
    .from('users')
    .select('role')
    .eq('id', auth.user_id)
    .single<{ role: string }>();

  if (roleError) {
    return err('INTERNAL_ERROR', roleError.message, undefined, 500);
  }

  const { data: push, error: pushError } = await admin
    .from('pushes')
    .select(
      `
        id,idempotency_key,commit_message,github_commit_sha,github_revert_sha,github_revert_failed,
        pushed_by,pushed_at,asset_count,total_bytes,
        withdrawn_by,withdrawn_at,withdrawn_reason,
        pushed_by_user:users!pushes_pushed_by_fkey(id,display_name),
        withdrawn_by_user:users!pushes_withdrawn_by_fkey(id,display_name),
        episodes:episode_id(id,name_cn,episode_path)
      `,
    )
    .eq('id', id)
    .maybeSingle<PushRow>();

  if (pushError) {
    return err('INTERNAL_ERROR', pushError.message, undefined, 500);
  }

  if (!push) {
    return err('PAYLOAD_MALFORMED', 'push not found', undefined, 404);
  }

  const { data: assets, error: assetsError } = await admin
    .from('assets')
    .select(
      'id,type_code,name,variant,version,language,final_filename,storage_backend,storage_ref,file_size_bytes,mime_type,withdrawn_at',
    )
    .eq('push_id', id)
    .order('type_code', { ascending: true });

  if (assetsError) {
    return err('INTERNAL_ERROR', assetsError.message, undefined, 500);
  }

  return ok({
    push: mapPush(push, auth.user_id, roleRow?.role === 'admin'),
    assets: (assets ?? []) as AssetRow[],
  });
}
