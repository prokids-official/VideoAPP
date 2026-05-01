import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  deleteUser: vi.fn(),
  insert: vi.fn(),
  existingUserMaybeSingle: vi.fn(),
  whitelistMaybeSingle: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/supabase-public', () => ({
  supabasePublic: () => ({
    auth: {
      signUp: mocks.signUp,
    },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        deleteUser: mocks.deleteUser,
      },
    },
    from: (table: string) => {
      if (table === 'email_whitelist') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: mocks.whitelistMaybeSingle,
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: mocks.existingUserMaybeSingle,
          }),
        }),
        insert: mocks.insert,
      };
    },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getLimiter: () => ({ consume: mocks.consume }),
  extractClientIp: () => '1.2.3.4',
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('https://video-app-kappa-murex.vercel.app/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 });
    mocks.existingUserMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.whitelistMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.deleteUser.mockResolvedValue({ error: null });
  });

  it('400 on non-whitelisted email domain', async () => {
    const res = await POST(makeReq({ email: 'x@gmail.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(body.error.message).toBe('该邮箱域名暂未开通注册，请联系管理员');
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('201 on whitelisted external email domain', async () => {
    mocks.whitelistMaybeSingle.mockResolvedValueOnce({
      data: { id: 'whitelist-1' },
      error: null,
    });
    mocks.signUp.mockResolvedValueOnce({
      data: {
        user: { id: 'uid-vendor', email: 'x@vendor.com' },
        session: {
          access_token: 'access-vendor',
          refresh_token: 'refresh-vendor',
          expires_at: 1_777_777_777,
        },
      },
      error: null,
    });

    const res = await POST(makeReq({ email: 'x@vendor.com', password: 'abcdefg1', display_name: 'Vendor' }));

    expect(res.status).toBe(201);
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'x@vendor.com',
      password: 'abcdefg1',
      options: {
        emailRedirectTo: 'https://video-app-kappa-murex.vercel.app/auth/confirmed',
      },
    });
  });

  it('400 on revoked external email domain', async () => {
    mocks.whitelistMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await POST(makeReq({ email: 'x@revoked.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });

  it('400 on weak password', async () => {
    const res = await POST(makeReq({ email: 'x@beva.com', password: 'short', display_name: 'X' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('WEAK_PASSWORD');
  });

  it('400 on empty display_name', async () => {
    const res = await POST(makeReq({ email: 'x@beva.com', password: 'abcdefg1', display_name: '' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('DISPLAY_NAME_REQUIRED');
  });

  it('429 when rate-limited', async () => {
    mocks.consume.mockResolvedValueOnce({ allowed: false, retryAfterSec: 120, remaining: 0 });

    const res = await POST(makeReq({ email: 'x@beva.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
  });

  it('409 when public user row already exists', async () => {
    mocks.existingUserMaybeSingle.mockResolvedValueOnce({ data: { id: 'uid-existing' }, error: null });

    const res = await POST(makeReq({ email: 'x@beva.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('409 when Supabase Auth reports existing email', async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const res = await POST(makeReq({ email: 'x@beva.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('201 on success returns pending verification when confirmations are enabled', async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'x@beva.com' }, session: null },
      error: null,
    });

    const res = await POST(
      makeReq({ email: 'x@beva.com', password: 'abcdefg1', display_name: 'Le Meilin' }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        user: {
          id: 'uid-1',
          email: 'x@beva.com',
          display_name: 'Le Meilin',
          team: 'FableGlitch',
          role: 'member',
        },
        email_verification_required: true,
      },
    });
    expect(body.data.session).toBeUndefined();
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'x@beva.com',
      password: 'abcdefg1',
      options: {
        emailRedirectTo: 'https://video-app-kappa-murex.vercel.app/auth/confirmed',
      },
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      id: 'uid-1',
      email: 'x@beva.com',
      display_name: 'Le Meilin',
      team: 'FableGlitch',
      role: 'member',
    });
  });

  it('201 on success returns session when confirmations are disabled', async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: {
        user: { id: 'uid-2', email: 'y@beva.com' },
        session: {
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          expires_at: 1_777_777_777,
        },
      },
      error: null,
    });

    const res = await POST(
      makeReq({ email: 'y@beva.com', password: 'abcdefg1', display_name: 'Felix' }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        user: {
          id: 'uid-2',
          email: 'y@beva.com',
          display_name: 'Felix',
          team: 'FableGlitch',
          role: 'member',
        },
        session: {
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          expires_at: 1_777_777_777,
        },
      },
    });
    expect(body.data.email_verification_required).toBeUndefined();
  });
});
