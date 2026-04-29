import { env } from './env';

const productionRedirectBase = 'https://video-app-kappa-murex.vercel.app';

export function authRedirectUrl(req: Request, pathname: string): string {
  const requestOrigin = new URL(req.url).origin;
  const base = env.AUTH_REDIRECT_BASE_URL
    ?? (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1')
      ? productionRedirectBase
      : requestOrigin);

  return new URL(pathname, base).toString();
}
