export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RelatedUser = { display_name: string | null } | Array<{ display_name: string | null }> | null;

interface RevokedWhitelistRow {
  id: string;
  revoked_at: string;
  revoked_by_user?: RelatedUser;
}

interface ExistingWhitelistRow {
  id: string;
  revoked_at: string | null;
}

function displayName(user: RelatedUser | undefined): string | null {
  if (Array.isArray(user)) {
    return user[0]?.display_name ?? null;
  }

  return user?.display_name ?? null;
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAdmin(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { data: revoked, error: revokeError } = await admin
    .from('email_whitelist')
    .update({
      revoked_by: auth.user_id,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id,revoked_at,revoked_by_user:users!email_whitelist_revoked_by_fkey(display_name)')
    .maybeSingle<RevokedWhitelistRow>();

  if (revokeError) {
    return err('INTERNAL_ERROR', revokeError.message, undefined, 500);
  }

  if (revoked) {
    return ok({
      id: revoked.id,
      revoked_at: revoked.revoked_at,
      revoked_by_name: displayName(revoked.revoked_by_user),
    });
  }

  const { data: existing, error: existingError } = await admin
    .from('email_whitelist')
    .select('id,revoked_at')
    .eq('id', id)
    .maybeSingle<ExistingWhitelistRow>();

  if (existingError) {
    return err('INTERNAL_ERROR', existingError.message, undefined, 500);
  }

  if (!existing) {
    return err('PAYLOAD_MALFORMED', 'whitelist entry not found', undefined, 404);
  }

  return err('ALREADY_REVOKED', 'Whitelist entry already revoked', undefined, 410);
}
