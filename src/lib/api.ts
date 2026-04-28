import type { ApiResponse, AuthResult, User } from '../../shared/types';

interface NetRequestPayload {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  requireAuth?: boolean;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; status: number; code: string; message: string };
export type ApiCallResult<T> = ApiOk<T> | ApiErr;

async function call<T>(opts: NetRequestPayload): Promise<ApiCallResult<T>> {
  const { status, body } = await window.fableglitch.net.request(opts);

  if (status >= 200 && status < 300 && body && body.ok) {
    return { ok: true, data: (body as ApiResponse<T> & { ok: true }).data };
  }

  if (body && !body.ok) {
    return { ok: false, status, code: body.error.code, message: body.error.message };
  }

  return { ok: false, status, code: 'NETWORK', message: `HTTP ${status}` };
}

export const api = {
  signup: (input: { email: string; password: string; display_name: string }) =>
    call<AuthResult>({ method: 'POST', path: '/auth/signup', body: input }),

  login: (input: { email: string; password: string }) =>
    call<AuthResult>({ method: 'POST', path: '/auth/login', body: input }),

  me: () =>
    call<{ user: User }>({ method: 'GET', path: '/auth/me', requireAuth: true }),

  logout: async () => {
    const rt = await window.fableglitch.db.sessionGet('refresh_token');
    if (rt) {
      await call({ method: 'POST', path: '/auth/logout', body: { refresh_token: rt } });
    }
    await window.fableglitch.session.clear();
  },

  tree: () =>
    call<unknown>({ method: 'GET', path: '/tree', requireAuth: true }),

  episodeDetail: (id: string) =>
    call<unknown>({ method: 'GET', path: `/episodes/${id}`, requireAuth: true }),
};
