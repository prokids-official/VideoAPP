import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectRole: vi.fn(),
  revokeWhitelist: vi.fn(),
  findWhitelist: vi.fn(),
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
        update: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => mocks.revokeWhitelist(),
              }),
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => mocks.findWhitelist(),
          }),
        }),
      };
    },
  }),
}));

import { DELETE } from './route';

function makeReq() {
  return new Request('http://localhost/api/admin/whitelist/entry-1', {
    method: 'DELETE',
    headers: { authorization: 'Bearer token' },
  });
}

function ctx(id = 'entry-1') {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/admin/whitelist/:id', () => {
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

  it('200 soft-revokes an active whitelist entry', async () => {
    mocks.revokeWhitelist.mockResolvedValueOnce({
      data: {
        id: 'entry-1',
        revoked_at: '2026-05-02T00:00:00Z',
        revoked_by_user: { display_name: '乐美林' },
      },
      error: null,
    });

    const res = await DELETE(makeReq(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        id: 'entry-1',
        revoked_at: '2026-05-02T00:00:00Z',
        revoked_by_name: '乐美林',
      },
    });
  });

  it('410 when the entry was already revoked', async () => {
    mocks.revokeWhitelist.mockResolvedValueOnce({ data: null, error: null });
    mocks.findWhitelist.mockResolvedValueOnce({
      data: { id: 'entry-1', revoked_at: '2026-05-01T00:00:00Z' },
      error: null,
    });

    const res = await DELETE(makeReq(), ctx());

    expect(res.status).toBe(410);
    expect((await res.json()).error.code).toBe('ALREADY_REVOKED');
  });

  it('404 when the entry does not exist', async () => {
    mocks.revokeWhitelist.mockResolvedValueOnce({ data: null, error: null });
    mocks.findWhitelist.mockResolvedValueOnce({ data: null, error: null });

    const res = await DELETE(makeReq(), ctx());

    expect(res.status).toBe(404);
  });

  it('403 rejects non-admin users', async () => {
    mocks.selectRole.mockResolvedValueOnce({
      data: { role: 'member' },
      error: null,
    });

    const res = await DELETE(makeReq(), ctx());

    expect(res.status).toBe(403);
    expect(mocks.revokeWhitelist).not.toHaveBeenCalled();
  });
});
