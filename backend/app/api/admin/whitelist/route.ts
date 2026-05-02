export const runtime = 'edge';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const postSchema = z.object({
  domain: z.string().trim().toLowerCase().regex(domainPattern),
  reason: z.string().trim().max(500).optional(),
});

interface InsertedWhitelistRow {
  id: string;
  domain: string;
  reason: string | null;
  added_at: string;
  added_by_user?: RelatedUser;
}

interface WhitelistListRow extends InsertedWhitelistRow {
  revoked_at: string | null;
  revoked_by_user?: RelatedUser;
}

type RelatedUser = { display_name: string | null } | Array<{ display_name: string | null }> | null;

function displayName(user: RelatedUser | undefined): string | null {
  if (Array.isArray(user)) {
    return user[0]?.display_name ?? null;
  }

  return user?.display_name ?? null;
}

function mapEntry(row: WhitelistListRow) {
  return {
    id: row.id,
    domain: row.domain,
    reason: row.reason,
    added_by_name: displayName(row.added_by_user),
    added_at: row.added_at,
    revoked_by_name: displayName(row.revoked_by_user),
    revoked_at: row.revoked_at,
  };
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdmin(req);

  if (auth instanceof Response) {
    return auth;
  }

  const includeRevoked = new URL(req.url).searchParams.get('include_revoked') === 'true';
  const admin = supabaseAdmin();
  let query = admin
    .from('email_whitelist')
    .select(
      'id,domain,reason,added_at,revoked_at,added_by_user:users!email_whitelist_added_by_fkey(display_name),revoked_by_user:users!email_whitelist_revoked_by_fkey(display_name)',
    );

  if (!includeRevoked) {
    query = query.is('revoked_at', null);
  }

  const { data, error } = await query
    .order('revoked_at', { ascending: true, nullsFirst: true })
    .order('added_at', { ascending: false });

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  const entries = ((data ?? []) as unknown as WhitelistListRow[]).map(mapEntry);
  return ok({ entries, total: entries.length });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAdmin(req);

  if (auth instanceof Response) {
    return auth;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400);
  }

  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const admin = supabaseAdmin();
  const { domain, reason } = parsed.data;
  const { data, error } = await admin
    .from('email_whitelist')
    .insert({
      domain,
      reason: reason || null,
      added_by: auth.user_id,
    })
    .select('id,domain,reason,added_at,added_by_user:users!email_whitelist_added_by_fkey(display_name)')
    .single<InsertedWhitelistRow>();

  if (error) {
    if (error.code === '23505') {
      return err('DOMAIN_ALREADY_WHITELISTED', 'Domain already whitelisted', undefined, 409);
    }

    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  return ok(
    {
      entry: {
          id: data.id,
          domain: data.domain,
          reason: data.reason,
          added_by_name: displayName(data.added_by_user),
          added_at: data.added_at,
        },
    },
    201,
  );
}
