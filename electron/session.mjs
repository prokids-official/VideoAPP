import { sessionGet, sessionSet, sessionClear } from './local-db.mjs';

export function getAccessToken() {
  return sessionGet('access_token');
}

export function getRefreshToken() {
  return sessionGet('refresh_token');
}

export function getExpiresAt() {
  const raw = sessionGet('access_expires_at');
  return raw ? parseInt(raw, 10) : 0;
}

export function persistSession({ access_token, refresh_token, expires_at }) {
  sessionSet('access_token', access_token);
  sessionSet('refresh_token', refresh_token);
  sessionSet('access_expires_at', String(expires_at ?? 0));
}

export function clearSession() {
  sessionClear();
}
