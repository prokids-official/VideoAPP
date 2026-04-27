import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectEpisode: vi.fn(),
  selectCounts: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'episodes'
            ? { single: async () => mocks.selectEpisode() }
            : mocks.selectCounts(),
      }),
    }),
  }),
}));

import { GET } from './route';

describe('GET /api/episodes/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 without token', async () => {
    const ctx = { params: Promise.resolve({ id: 'e1' }) };

    const res = await GET(new Request('http://x/api/episodes/e1'), ctx);

    expect(res.status).toBe(401);
  });

  it('200 returns episode + counts', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null });
    mocks.selectEpisode.mockResolvedValueOnce({
      data: {
        id: 'e1',
        name_cn: '侏儒怪',
        status: 'drafting',
        episode_path: '童话剧_NA_侏儒怪',
        contents: {
          name_cn: '侏儒怪',
          albums: { name_cn: 'NA', series: { name_cn: '童话剧' } },
        },
        created_by_user: { display_name: '乐美林' },
        created_at: '2026-04-27T00:00:00Z',
        updated_at: '2026-04-27T00:00:00Z',
      },
      error: null,
    });
    mocks.selectCounts.mockResolvedValueOnce({
      data: [
        { type_code: 'SCRIPT', status: 'pushed' },
        { type_code: 'SCRIPT', status: 'superseded' },
      ],
      error: null,
    });
    const ctx = { params: Promise.resolve({ id: 'e1' }) };

    const res = await GET(
      new Request('http://x/api/episodes/e1', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.episode.series_name).toBe('童话剧');
    expect(body.data.counts.by_type.SCRIPT).toEqual({ pushed: 1, superseded: 1 });
  });
});
