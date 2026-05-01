export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const postSchema = z.object({
  domain: z.string().trim().toLowerCase().regex(domainPattern),
  reason: z.string().trim().max(500).optional(),
});

function whitelistError(code: string, message: string, status: number): Response {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

interface InsertedWhitelistRow {
  id: string;
  domain: string;
  reason: string | null;
  added_at: string;
  added_by_user?: { display_name: string | null } | null;
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
      return whitelistError('DOMAIN_ALREADY_WHITELISTED', 'Domain already whitelisted', 409);
    }

    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  return ok(
    {
      entry: {
        id: data.id,
        domain: data.domain,
        reason: data.reason,
        added_by_name: data.added_by_user?.display_name ?? null,
        added_at: data.added_at,
      },
    },
    201,
  );
}
