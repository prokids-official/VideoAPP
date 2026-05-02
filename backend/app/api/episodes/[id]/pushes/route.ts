export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type RelatedUser = { id: string; display_name: string | null } | Array<{ id: string; display_name: string | null }> | null;

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
}

function firstUser(user: RelatedUser | undefined): { id: string; display_name: string | null } | null {
  if (Array.isArray(user)) {
    return user[0] ?? null;
  }

  return user ?? null;
}

function encodeCursor(pushedAt: string): string {
  return btoa(pushedAt);
}

function decodeCursor(cursor: string | null): string | null {
  if (!cursor) {
    return null;
  }

  try {
    return atob(cursor);
  } catch {
    return null;
  }
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
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
  const { data: episode, error: episodeError } = await admin
    .from('episodes')
    .select('id')
    .eq('id', id)
    .maybeSingle<{ id: string }>();

  if (episodeError) {
    return err('INTERNAL_ERROR', episodeError.message, undefined, 500);
  }

  if (!episode) {
    return err('PAYLOAD_MALFORMED', 'episode not found', undefined, 404);
  }

  const { data: roleRow, error: roleError } = await admin
    .from('users')
    .select('role')
    .eq('id', auth.user_id)
    .single<{ role: string }>();

  if (roleError) {
    return err('INTERNAL_ERROR', roleError.message, undefined, 500);
  }

  const url = new URL(req.url);
  const includeWithdrawn = url.searchParams.get('include_withdrawn') !== 'false';
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  let query = admin
    .from('pushes')
    .select(
      `
        id,idempotency_key,commit_message,github_commit_sha,github_revert_sha,github_revert_failed,
        pushed_by,pushed_at,asset_count,total_bytes,
        withdrawn_by,withdrawn_at,withdrawn_reason,
        pushed_by_user:users!pushes_pushed_by_fkey(id,display_name),
        withdrawn_by_user:users!pushes_withdrawn_by_fkey(id,display_name)
      `,
    )
    .eq('episode_id', id);

  if (!includeWithdrawn) {
    query = query.is('withdrawn_at', null);
  }

  if (cursor) {
    query = query.lt('pushed_at', cursor);
  }

  const { data, error } = await query.order('pushed_at', { ascending: false }).limit(limit + 1);

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  const rows = (data ?? []) as unknown as PushRow[];
  const page = rows.slice(0, limit);
  const extra = rows[limit];

  return ok({
    pushes: page.map((row) => mapPush(row, auth.user_id, roleRow?.role === 'admin')),
    next_cursor: extra ? encodeCursor(extra.pushed_at) : null,
  });
}
