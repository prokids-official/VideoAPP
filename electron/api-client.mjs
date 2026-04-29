import { loadEnv } from './env.mjs';
import {
  getAccessToken,
  getRefreshToken,
  persistSession,
  clearSession,
} from './session.mjs';

const env = loadEnv();
const BASE = env.VITE_API_BASE_URL;
const REQUEST_TIMEOUT_MS = 15_000;

async function rawRequest(method, pathname, body, accessToken) {
  const headers = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (body !== undefined && body !== null) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const init = { method, headers, signal: controller.signal };
  if (body !== undefined && body !== null) init.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${BASE}${pathname}`, init);
  } catch (e) {
    if (e?.name === 'AbortError') {
      return {
        status: 0,
        body: { ok: false, error: { code: 'TIMEOUT', message: 'Request timed out. Please try again.' } },
      };
    }
    return { status: 0, body: { ok: false, error: { code: 'NETWORK', message: e.message ?? 'fetch failed' } } };
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json response — leave json as null */
  }
  return { status: res.status, body: json };
}

async function refreshAccess() {
  const rt = getRefreshToken();
  if (!rt) return null;
  const { status, body } = await rawRequest('POST', '/auth/refresh', { refresh_token: rt }, null);
  if (status !== 200 || !body?.ok) {
    clearSession();
    return null;
  }
  persistSession({
    access_token: body.data.access_token,
    refresh_token: body.data.refresh_token,
    expires_at: body.data.expires_at,
  });
  return body.data.access_token;
}

export async function apiRequest(payload) {
  const { method, path: pathname, body, requireAuth } = payload ?? {};
  if (!method || !pathname) {
    return { status: 0, body: { ok: false, error: { code: 'CLIENT_ERROR', message: 'method and path required' } } };
  }

  const access = requireAuth ? getAccessToken() : null;
  let attempt = await rawRequest(method, pathname, body, access);

  if (attempt.status === 401 && requireAuth) {
    const fresh = await refreshAccess();
    if (!fresh) return attempt;
    attempt = await rawRequest(method, pathname, body, fresh);
  }

  // Auto-persist session when an auth route succeeds
  if (
    attempt.status >= 200 &&
    attempt.status < 300 &&
    attempt.body?.ok &&
    attempt.body.data?.session
  ) {
    persistSession({
      access_token: attempt.body.data.session.access_token,
      refresh_token: attempt.body.data.session.refresh_token,
      expires_at: attempt.body.data.session.expires_at,
    });
  }

  return attempt;
}

export function hasSession() {
  return Boolean(getAccessToken());
}

export function dropSession() {
  clearSession();
}
