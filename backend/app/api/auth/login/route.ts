export const runtime = 'edge';

import type { AuthResult } from '@shared/types';
import { err, ok } from '@/lib/api-response';
import { extractClientIp, getLimiter } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loginSchema } from '@/lib/validators';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400);
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const { email, password } = parsed.data;
  const ip = extractClientIp(req);
  const ipRateLimit = await getLimiter('login-ip').consume(ip);

  if (!ipRateLimit.allowed) {
    const res = err('RATE_LIMITED', 'Too many login attempts (IP)', undefined, 429);
    res.headers.set('retry-after', String(ipRateLimit.retryAfterSec));
    return res;
  }

  const emailRateLimit = await getLimiter('login-email').consume(email);

  if (!emailRateLimit.allowed) {
    const res = err('RATE_LIMITED', 'Too many login attempts (email)', undefined, 429);
    res.headers.set('retry-after', String(emailRateLimit.retryAfterSec));
    return res;
  }

  const admin = supabaseAdmin();
  const { data: signIn, error: signInError } = await admin.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn.session || !signIn.user) {
    // Supabase returns "Email not confirmed" for unverified accounts.
    // Surface it as a distinct error code so the client can prompt
    // "check your email" instead of "wrong password".
    const msg = signInError?.message ?? '';
    if (/email not confirmed|email_not_confirmed/i.test(msg)) {
      return err(
        'EMAIL_NOT_CONFIRMED',
        'Please verify your email — check your inbox for the verification link',
        undefined,
        401,
      );
    }
    return err('INVALID_CREDENTIALS', 'Email or password is wrong', undefined, 401);
  }

  const { data: userRow, error: rowError } = await admin
    .from('users')
    .select('id,email,display_name,team,role')
    .eq('id', signIn.user.id)
    .single();

  if (rowError || !userRow) {
    return err('INTERNAL_ERROR', 'User row missing', undefined, 500);
  }

  await admin
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', signIn.user.id);

  const result: AuthResult = {
    user: {
      id: userRow.id,
      email: userRow.email,
      display_name: userRow.display_name,
      team: userRow.team,
      role: userRow.role as 'member' | 'admin',
    },
    session: {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      expires_at: signIn.session.expires_at ?? 0,
    },
  };

  return ok(result);
}
