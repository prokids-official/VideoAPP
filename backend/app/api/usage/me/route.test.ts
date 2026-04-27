import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectUsage: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: async () => mocks.selectUsage(),
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from './route';

describe('GET /api/usage/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
  });

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/usage/me'));

    expect(res.status).toBe(401);
  });

  it('200 returns current user usage summary', async () => {
    mocks.selectUsage.mockResolvedValueOnce({
      data: [
        {
          provider: 'github',
          action: 'commit',
          bytes_transferred: 100,
          cost_usd: '0.10',
          model: null,
          at: '2026-04-27T00:00:00Z',
        },
        {
          provider: 'r2',
          action: 'upload',
          bytes_transferred: 20,
          cost_usd: null,
          model: null,
          at: '2026-04-27T00:01:00Z',
        },
      ],
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/usage/me?since=2026-04-01T00:00:00Z', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total_usd).toBe(0.1);
    expect(body.data.total_bytes).toBe(120);
    expect(body.data.by_provider).toEqual({
      github: { usd: 0.1, bytes: 100, count: 1 },
      r2: { usd: 0, bytes: 20, count: 1 },
    });
    expect(body.data.recent).toHaveLength(2);
  });
});
