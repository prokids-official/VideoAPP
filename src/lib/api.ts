import type { ApiResponse, AuthResult, SignupPendingResult, TreeResponse, UsageMeResponse, User } from '../../shared/types';

interface NetRequestPayload {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  requireAuth?: boolean;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; status: number; code: string; message: string };
export type ApiCallResult<T> = ApiOk<T> | ApiErr;

function bridgeMissing<T>(): ApiCallResult<T> {
  return {
    ok: false,
    status: 0,
    code: 'DESKTOP_BRIDGE_MISSING',
    message: '桌面桥接未加载。请在 Electron 桌面端登录，不要直接用浏览器打开 127.0.0.1:5173；如果已经在桌面端，请完全退出后重新运行 npm run dev。',
  };
}

async function call<T>(opts: NetRequestPayload): Promise<ApiCallResult<T>> {
  if (!window.fableglitch?.net?.request) {
    return bridgeMissing<T>();
  }

  let status: number;
  let body: ApiResponse<unknown> | null;

  try {
    const result = await Promise.race([
      window.fableglitch.net.request(opts),
      new Promise<{ status: 0; body: ApiResponse<unknown> }>((resolve) =>
        setTimeout(
          () => resolve({
            status: 0,
            body: { ok: false, error: { code: 'TIMEOUT', message: '请求超时，请稍后再试。' } },
          }),
          18_000,
        ),
      ),
    ]);
    status = result.status;
    body = result.body;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK',
      message: error instanceof Error ? error.message : '网络请求失败',
    };
  }

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
    call<SignupPendingResult>({ method: 'POST', path: '/auth/signup', body: input }),

  login: (input: { email: string; password: string }) =>
    call<AuthResult>({ method: 'POST', path: '/auth/login', body: input }),

  resendVerification: (input: { email: string }) =>
    call<{ sent: true }>({ method: 'POST', path: '/auth/resend-verification', body: input }),

  resetPassword: (input: { email: string }) =>
    call<{ sent: true }>({ method: 'POST', path: '/auth/reset-password', body: input }),

  me: () =>
    call<{ user: User }>({ method: 'GET', path: '/auth/me', requireAuth: true }),

  logout: async () => {
    if (!window.fableglitch?.db || !window.fableglitch?.session) {
      return;
    }

    const rt = await window.fableglitch.db.sessionGet('refresh_token');
    if (rt) {
      await call({ method: 'POST', path: '/auth/logout', body: { refresh_token: rt } });
    }
    await window.fableglitch.session.clear();
  },

  tree: () =>
    call<TreeResponse>({ method: 'GET', path: '/tree', requireAuth: true }),

  episodeDetail: (id: string) =>
    call<unknown>({ method: 'GET', path: `/episodes/${id}`, requireAuth: true }),

  usageMe: () =>
    call<UsageMeResponse>({ method: 'GET', path: '/usage/me', requireAuth: true }),
};
