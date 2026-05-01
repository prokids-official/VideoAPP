import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectRole: vi.fn(),
  insertWhitelist: vi.fn(),
  listWhitelist: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: async () => mocks.selectRole() }),
          }),
        };
      }

      return {
        select: () => ({
          is: () => ({
            order: () => ({
              order: async () => mocks.listWhitelist(),
            }),
          }),
          order: () => ({
            order: async () => mocks.listWhitelist(),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => mocks.insertWhitelist(),
          }),
        }),
      };
    },
  }),
}));

import { GET, POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/admin/whitelist', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/whitelist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@beva.com' } },
      error: null,
    });
    mocks.selectRole.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });
  });

  it('201 creates a normalized whitelist domain', async () => {
    mocks.insertWhitelist.mockResolvedValueOnce({
      data: {
        id: 'entry-1',
        domain: 'vendor.com',
        reason: 'Studio vendor',
        added_at: '2026-05-02T00:00:00Z',
        added_by_user: { display_name: '乐美林' },
      },
      error: null,
    });

    const res = await POST(makeReq({ domain: ' Vendor.COM ', reason: 'Studio vendor' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        entry: {
          id: 'entry-1',
          domain: 'vendor.com',
          reason: 'Studio vendor',
          added_by_name: '乐美林',
          added_at: '2026-05-02T00:00:00Z',
        },
      },
    });
  });

  it('400 rejects invalid domains', async () => {
    const res = await POST(makeReq({ domain: '@gmail.com' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
    expect(mocks.insertWhitelist).not.toHaveBeenCalled();
  });

  it('409 rejects duplicate active domains', async () => {
    mocks.insertWhitelist.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const res = await POST(makeReq({ domain: 'vendor.com' }));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('DOMAIN_ALREADY_WHITELISTED');
  });

  it('403 rejects non-admin users', async () => {
    mocks.selectRole.mockResolvedValueOnce({
      data: { role: 'member' },
      error: null,
    });

    const res = await POST(makeReq({ domain: 'vendor.com' }));

    expect(res.status).toBe(403);
    expect(mocks.insertWhitelist).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/whitelist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@beva.com' } },
      error: null,
    });
    mocks.selectRole.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });
  });

  it('200 returns only active entries by default', async () => {
    mocks.listWhitelist.mockResolvedValueOnce({
      data: [
        {
          id: 'entry-1',
          domain: 'vendor.com',
          reason: null,
          added_at: '2026-05-02T00:00:00Z',
          revoked_at: null,
          added_by_user: { display_name: '乐美林' },
          revoked_by_user: null,
        },
      ],
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/admin/whitelist', {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        entries: [
          {
            id: 'entry-1',
            domain: 'vendor.com',
            reason: null,
            added_by_name: '乐美林',
            added_at: '2026-05-02T00:00:00Z',
            revoked_at: null,
            revoked_by_name: null,
          },
        ],
        total: 1,
      },
    });
  });

  it('200 includes revoked history when requested', async () => {
    mocks.listWhitelist.mockResolvedValueOnce({
      data: [
        {
          id: 'entry-1',
          domain: 'vendor.com',
          reason: null,
          added_at: '2026-05-02T00:00:00Z',
          revoked_at: '2026-05-03T00:00:00Z',
          added_by_user: { display_name: '乐美林' },
          revoked_by_user: { display_name: 'Felix' },
        },
      ],
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/admin/whitelist?include_revoked=true', {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data.entries[0]).toMatchObject({
      id: 'entry-1',
      revoked_by_name: 'Felix',
      revoked_at: '2026-05-03T00:00:00Z',
    });
  });

  it('403 rejects non-admin users', async () => {
    mocks.selectRole.mockResolvedValueOnce({
      data: { role: 'member' },
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/admin/whitelist', {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(403);
    expect(mocks.listWhitelist).not.toHaveBeenCalled();
  });
});
