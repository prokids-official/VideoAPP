import { env } from './env';

export function authRedirectUrl(req: Request, pathname: string): string {
  const base = env.AUTH_REDIRECT_BASE_URL ?? new URL(req.url).origin;
  return new URL(pathname, base).toString();
}
