import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectRole: vi.fn(),
  selectUsage: vi.fn(),
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
          gte: () => ({
            eq: () => ({
              order: () => ({ limit: async () => mocks.selectUsage() }),
            }),
            order: () => ({ limit: async () => mocks.selectUsage() }),
          }),
        }),
      };
    },
  }),
}));

import { GET } from './route';

describe('GET /api/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
  });

  it('403 for non-admin users', async () => {
    mocks.selectRole.mockResolvedValueOnce({ data: { role: 'member' }, error: null });

    const res = await GET(
      new Request('http://localhost/api/usage', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(403);
  });

  it('200 returns admin usage rows', async () => {
    mocks.selectRole.mockResolvedValueOnce({ data: { role: 'admin' }, error: null });
    mocks.selectUsage.mockResolvedValueOnce({
      data: [
        {
          user_id: 'u-2',
          provider: 'github',
          action: 'commit',
          bytes_transferred: 100,
          cost_usd: '0.10',
          model: null,
          at: '2026-04-27T00:00:00Z',
        },
      ],
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/usage?since=2026-04-01T00:00:00Z&user_id=u-2', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        rows: [
          {
            user_id: 'u-2',
            provider: 'github',
            action: 'commit',
            bytes_transferred: 100,
            cost_usd: '0.10',
            model: null,
            at: '2026-04-27T00:00:00Z',
          },
        ],
      },
    });
  });
});
