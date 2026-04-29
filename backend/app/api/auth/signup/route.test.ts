import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  insert: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser,
        deleteUser: mocks.deleteUser,
      },
    },
    from: () => ({
      insert: mocks.insert,
    }),
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getLimiter: () => ({ consume: mocks.consume }),
  extractClientIp: () => '1.2.3.4',
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.deleteUser.mockResolvedValue({ error: null });
  });

  it('400 on non-beva email', async () => {
    const res = await POST(makeReq({ email: 'x@gmail.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_EMAIL_DOMAIN');
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

  it('409 when email already exists', async () => {
    mocks.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });

    const res = await POST(makeReq({ email: 'x@beva.com', password: 'abcdefg1', display_name: 'X' }));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('201 on success, returns pending email verification without session', async () => {
    mocks.createUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'x@beva.com' } },
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
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'x@beva.com',
      password: 'abcdefg1',
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      id: 'uid-1',
      email: 'x@beva.com',
      display_name: 'Le Meilin',
      team: 'FableGlitch',
      role: 'member',
    });
  });
});
