import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectRecent: vi.fn(),
  selectArgs: vi.fn(),
  orderArgs: vi.fn(),
  limitArg: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      expect(table).toBe('episodes');
      return {
        select: (columns: string) => {
          mocks.selectArgs(columns);
          return {
            order: (column: string, options: unknown) => {
              mocks.orderArgs(column, options);
              return {
                limit: async (count: number) => {
                  mocks.limitArg(count);
                  return mocks.selectRecent();
                },
              };
            },
          };
        },
      };
    },
  }),
}));

import { GET } from './route';

describe('GET /api/episodes/recent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
    mocks.selectRecent.mockResolvedValue({ data: [], error: null });
  });

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/episodes/recent'));

    expect(res.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.selectRecent).not.toHaveBeenCalled();
  });

  it('returns recent episodes with default limit 5 and pushed asset counts', async () => {
    mocks.selectRecent.mockResolvedValueOnce({
      data: [
        {
          id: 'e-new',
          name_cn: 'Episode Two',
          episode_path: 'Series_NA_Episode_Two',
          status: 'drafting',
          updated_at: '2026-05-02T10:00:00Z',
          assets: [{ count: 8 }],
          contents: {
            name_cn: 'Content A',
            albums: { name_cn: 'NA', series: { name_cn: 'Series A' } },
          },
        },
        {
          id: 'e-old',
          name_cn: 'Episode One',
          episode_path: 'Series_NA_Episode_One',
          status: 'review',
          updated_at: '2026-05-01T10:00:00Z',
          assets: [],
          contents: {
            name_cn: 'Content B',
            albums: { name_cn: 'Album B', series: { name_cn: 'Series B' } },
          },
        },
      ],
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/episodes/recent', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        episodes: [
          {
            id: 'e-new',
            name_cn: 'Episode Two',
            episode_path: 'Series_NA_Episode_Two',
            status: 'drafting',
            updated_at: '2026-05-02T10:00:00Z',
            series_name_cn: 'Series A',
            album_name_cn: 'NA',
            content_name_cn: 'Content A',
            asset_count_pushed: 8,
          },
          {
            id: 'e-old',
            name_cn: 'Episode One',
            episode_path: 'Series_NA_Episode_One',
            status: 'review',
            updated_at: '2026-05-01T10:00:00Z',
            series_name_cn: 'Series B',
            album_name_cn: 'Album B',
            content_name_cn: 'Content B',
            asset_count_pushed: 0,
          },
        ],
      },
    });
    expect(mocks.orderArgs).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(mocks.limitArg).toHaveBeenCalledWith(5);
  });

  it('clamps limit to maximum 20', async () => {
    const res = await GET(
      new Request('http://localhost/api/episodes/recent?limit=999', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.limitArg).toHaveBeenCalledWith(20);
  });

  it('falls back to limit 5 for invalid limits', async () => {
    const res = await GET(
      new Request('http://localhost/api/episodes/recent?limit=nope', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.limitArg).toHaveBeenCalledWith(5);
  });

  it('returns empty list', async () => {
    const res = await GET(
      new Request('http://localhost/api/episodes/recent', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { episodes: [] } });
  });
});
