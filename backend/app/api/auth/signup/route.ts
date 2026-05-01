export const runtime = 'edge';

import type { AuthResult, ErrorCode, SignupPendingResult } from '@shared/types';
import { err, ok } from '@/lib/api-response';
import { authRedirectUrl } from '@/lib/auth-redirect';
import { extractClientIp, getLimiter } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabasePublic } from '@/lib/supabase-public';
import { signupSchema } from '@/lib/validators';

function validationErrorCode(path: string): ErrorCode {
  if (path === 'email') {
    return 'INVALID_EMAIL_DOMAIN';
  }

  if (path === 'password') {
    return 'WEAK_PASSWORD';
  }

  if (path === 'display_name') {
    return 'DISPLAY_NAME_REQUIRED';
  }

  return 'PAYLOAD_MALFORMED';
}

function emailDomainNotAllowed(): Response {
  return err('EMAIL_DOMAIN_NOT_ALLOWED', '该邮箱域名暂未开通注册，请联系管理员', undefined, 400);
}

function domainFromEmail(email: string): string {
  return email.split('@')[1] ?? '';
}

export async function POST(req: Request): Promise<Response> {
  const ip = extractClientIp(req);
  const rateLimit = await getLimiter('signup-ip').consume(ip);

  if (!rateLimit.allowed) {
    const res = err('RATE_LIMITED', 'Too many signup attempts', undefined, 429);
    res.headers.set('retry-after', String(rateLimit.retryAfterSec));
    return res;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400);
  }

  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    return err(validationErrorCode(path), first?.message ?? 'Invalid payload', { path }, 400);
  }

  const { email, password, display_name } = parsed.data;
  const admin = supabaseAdmin();
  const domain = domainFromEmail(email);

  if (domain !== 'beva.com') {
    const { data: whitelistedDomain, error: whitelistError } = await admin
      .from('email_whitelist')
      .select('id')
      .eq('domain', domain)
      .is('revoked_at', null)
      .maybeSingle();

    if (whitelistError) {
      return err('INTERNAL_ERROR', whitelistError.message, undefined, 500);
    }

    if (!whitelistedDomain) {
      return emailDomainNotAllowed();
    }
  }

  const { data: existingUser, error: existingError } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingError) {
    return err('INTERNAL_ERROR', existingError.message, undefined, 500);
  }

  if (existingUser) {
    return err('EMAIL_ALREADY_EXISTS', 'Email already registered', undefined, 409);
  }

  // Use the public Auth signup flow. When Supabase "Confirm email" is OFF,
  // signUp returns a session immediately; when it is ON, session remains null
  // and the client should show the verification-pending screen.
  const { data: signupResult, error: signupError } = await supabasePublic().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authRedirectUrl(req, '/auth/confirmed'),
    },
  });

  if (signupError || !signupResult.user) {
    const message = signupError?.message ?? 'Unknown signup failure';

    if (/already.*registered|already.*exists/i.test(message)) {
      return err('EMAIL_ALREADY_EXISTS', 'Email already registered', undefined, 409);
    }

    return err('INTERNAL_ERROR', message, undefined, 500);
  }

  const userId = signupResult.user.id;
  const { error: insertError } = await admin.from('users').insert({
    id: userId,
    email,
    display_name,
    team: 'FableGlitch',
    role: 'member',
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return err('INTERNAL_ERROR', insertError.message, undefined, 500);
  }

  if (signupResult.session) {
    const result: AuthResult = {
      user: {
        id: userId,
        email,
        display_name,
        team: 'FableGlitch',
        role: 'member',
      },
      session: {
        access_token: signupResult.session.access_token,
        refresh_token: signupResult.session.refresh_token,
        expires_at: signupResult.session.expires_at ?? 0,
      },
    };

    return ok(result, 201);
  }

  // Fallback for projects where email confirmation is enabled.
  const result: SignupPendingResult = {
    user: {
      id: userId,
      email,
      display_name,
      team: 'FableGlitch',
      role: 'member',
    },
    email_verification_required: true,
  };

  return ok(result, 201);
}
