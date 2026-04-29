import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/supabase-public', () => ({
  supabasePublic: () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getLimiter: () => ({ consume: mocks.consume }),
  extractClientIp: () => '1.2.3.4',
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('https://video-app-kappa-murex.vercel.app/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it('200 sends recovery email with reset redirect', async () => {
    const res = await POST(makeReq({ email: 'smoke@beva.com' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('smoke@beva.com', {
      redirectTo: 'https://video-app-kappa-murex.vercel.app/auth/reset-password',
    });
  });

  it('200 when email is missing to avoid account enumeration', async () => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { message: 'User not found' } });

    const res = await POST(makeReq({ email: 'missing@beva.com' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { sent: true } });
  });

  it('502 surfaces Supabase email errors so internal users can debug delivery', async () => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { message: 'For security purposes, you can only request this after 60 seconds' },
    });

    const res = await POST(makeReq({ email: 'smoke@beva.com' }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('SUPABASE_EMAIL_ERROR');
    expect(body.error.message).toContain('60 seconds');
  });

  it('400 on non-beva email', async () => {
    const res = await POST(makeReq({ email: 'x@gmail.com' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_EMAIL_DOMAIN');
  });

  it('429 when rate-limited', async () => {
    mocks.consume.mockResolvedValueOnce({ allowed: false, retryAfterSec: 60, remaining: 0 });

    const res = await POST(makeReq({ email: 'smoke@beva.com' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
