import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resend: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: {
      resend: mocks.resend,
    },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getLimiter: () => ({ consume: mocks.consume }),
  extractClientIp: () => '1.2.3.4',
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 });
    mocks.resend.mockResolvedValue({ data: {}, error: null });
  });

  it('200 happy path sends signup verification email', async () => {
    const res = await POST(makeReq({ email: 'smoke@beva.com' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'smoke@beva.com',
    });
  });

  it('200 when email does not exist to avoid account enumeration', async () => {
    mocks.resend.mockRejectedValueOnce(new Error('User not found'));

    const res = await POST(makeReq({ email: 'missing@beva.com' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { sent: true } });
  });

  it('429 when rate-limited', async () => {
    mocks.consume.mockResolvedValueOnce({ allowed: false, retryAfterSec: 60, remaining: 0 });

    const res = await POST(makeReq({ email: 'smoke@beva.com' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
