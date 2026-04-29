export const runtime = 'edge';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { authRedirectUrl } from '@/lib/auth-redirect';
import { extractClientIp, getLimiter } from '@/lib/rate-limit';
import { supabasePublic } from '@/lib/supabase-public';
import { emailSchema } from '@/lib/validators';

const bodySchema = z.object({ email: emailSchema });

export async function POST(req: Request): Promise<Response> {
  const ip = extractClientIp(req);
  const rateLimit = await getLimiter('signup-ip').consume(ip);

  if (!rateLimit.allowed) {
    const res = err('RATE_LIMITED', 'Too many password reset attempts', undefined, 429);
    res.headers.set('retry-after', String(rateLimit.retryAfterSec));
    return res;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400);
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return err('INVALID_EMAIL_DOMAIN', parsed.error.issues[0]?.message ?? 'Invalid email', undefined, 400);
  }

  // Always return 200 so the endpoint cannot be used to enumerate accounts.
  await supabasePublic().auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authRedirectUrl(req, '/auth/reset-password'),
  }).catch(() => {});

  return ok({ sent: true });
}
