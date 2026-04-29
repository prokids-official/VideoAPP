export const runtime = 'edge';

import { z } from 'zod';
import { ok, err } from '@/lib/api-response';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getLimiter, extractClientIp } from '@/lib/rate-limit';
import { emailSchema } from '@/lib/validators';

const bodySchema = z.object({ email: emailSchema });

export async function POST(req: Request): Promise<Response> {
  // Same rate limit as signup-ip — resend is just as spammable
  const ip = extractClientIp(req);
  const rl = await getLimiter('signup-ip').consume(ip);
  if (!rl.allowed) {
    const res = err('RATE_LIMITED', 'Too many resend attempts', undefined, 429);
    res.headers.set('retry-after', String(rl.retryAfterSec));
    return res;
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return err('INVALID_EMAIL_DOMAIN', parsed.error.issues[0]?.message ?? 'Invalid email', undefined, 400);
  }

  // Always return 200 even if the email doesn't exist — don't leak whether
  // a given address is registered. Supabase's resend is idempotent and only
  // emails truly-pending users.
  await supabaseAdmin().auth.resend({
    type: 'signup',
    email: parsed.data.email,
  }).catch(() => { /* swallow — don't leak existence */ });

  return ok({ sent: true });
}
