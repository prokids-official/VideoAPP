import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectSeries: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ order: () => mocks.selectSeries() }) }),
  }),
}));

import { GET } from './route';

describe('GET /api/tree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/tree'));

    expect(res.status).toBe(401);
  });

  it('200 returns nested tree', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'u', email: 'a@beva.com' } },
      error: null,
    });
    mocks.selectSeries.mockResolvedValueOnce({
      data: [
        {
          id: 's1',
          name_cn: '童话剧',
          albums: [
            {
              id: 'a1',
              name_cn: 'NA',
              contents: [
                {
                  id: 'c1',
                  name_cn: '侏儒怪',
                  episodes: [
                    {
                      id: 'e1',
                      name_cn: '侏儒怪 第一集',
                      status: 'drafting',
                      updated_at: '2026-04-27T00:00:00Z',
                      episode_path: '童话剧_NA_侏儒怪',
                      assets: [{ count: 5 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/tree', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.series).toHaveLength(1);
    expect(body.data.series[0].albums[0].contents[0].episodes[0].asset_count_pushed).toBe(5);
  });
});
