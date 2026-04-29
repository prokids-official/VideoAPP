import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  getUserRow: vi.fn(),
  updateLastLogin: vi.fn(),
  consumeIp: vi.fn(),
  consumeEmail: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { signInWithPassword: mocks.signIn },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => mocks.getUserRow() }) }),
      update: () => ({ eq: async () => mocks.updateLastLogin() }),
    }),
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getLimiter: (name: string) => ({
    consume: name === 'login-ip' ? mocks.consumeIp : mocks.consumeEmail,
  }),
  extractClientIp: () => '1.2.3.4',
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeIp.mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 });
    mocks.consumeEmail.mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 4 });
    mocks.updateLastLogin.mockResolvedValue({ error: null });
  });

  it('401 on bad credentials', async () => {
    mocks.signIn.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });

    const res = await POST(makeReq({ email: 'a@beva.com', password: 'wrong123' }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 EMAIL_NOT_CONFIRMED when Supabase reports unverified email', async () => {
    mocks.signIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Email not confirmed' },
    });

    const res = await POST(makeReq({ email: 'a@beva.com', password: 'abcdefg1' }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(mocks.getUserRow).not.toHaveBeenCalled();
    expect(mocks.updateLastLogin).not.toHaveBeenCalled();
  });

  it('429 when IP limit hits', async () => {
    mocks.consumeIp.mockResolvedValueOnce({ allowed: false, retryAfterSec: 30, remaining: 0 });

    const res = await POST(makeReq({ email: 'a@beva.com', password: 'x1' }));

    expect(res.status).toBe(429);
  });

  it('429 when email limit hits', async () => {
    mocks.consumeEmail.mockResolvedValueOnce({ allowed: false, retryAfterSec: 15, remaining: 0 });

    const res = await POST(makeReq({ email: 'a@beva.com', password: 'x1' }));

    expect(res.status).toBe(429);
  });

  it('200 on success returns user + session', async () => {
    mocks.signIn.mockResolvedValueOnce({
      data: {
        user: { id: 'uid-1' },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 1_700_000_000 },
      },
      error: null,
    });
    mocks.getUserRow.mockResolvedValueOnce({
      data: {
        id: 'uid-1',
        email: 'a@beva.com',
        display_name: 'Le Meilin',
        team: 'FableGlitch',
        role: 'member',
      },
      error: null,
    });

    const res = await POST(makeReq({ email: 'a@beva.com', password: 'abcdefg1' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.display_name).toBe('Le Meilin');
    expect(body.data.session.access_token).toBe('at');
    expect(mocks.updateLastLogin).toHaveBeenCalled();
  });
});
