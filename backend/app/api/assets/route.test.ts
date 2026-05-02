import { beforeEach, describe, expect, it, vi } from 'vitest';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectAssets: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  selectColumns: '',
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: (columns: string) => {
        queryState.selectColumns = columns;
        const query = {
          eq: (column: string, value: unknown) => {
            queryState.filters.push(['eq', column, value]);
            return query;
          },
          is: (column: string, value: unknown) => {
            queryState.filters.push(['is', column, value]);
            return query;
          },
          order: async () => mocks.selectAssets(),
        };
        return query;
      },
    }),
  }),
}));

import { GET } from './route';

describe('GET /api/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.selectColumns = '';
    queryState.filters = [];
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
  });

  it('401 without token', async () => {
    const res = await GET(new Request(`http://localhost/api/assets?episode_id=${EPISODE_ID}`));

    expect(res.status).toBe(401);
  });

  it('200 returns assets for an episode', async () => {
    mocks.selectAssets.mockResolvedValueOnce({
      data: [
        {
          id: 'asset-1',
          type_code: 'SCRIPT',
          final_filename: '童话剧_侏儒怪_SCRIPT.md',
          storage_backend: 'github',
          status: 'pushed',
        },
      ],
      error: null,
      count: 1,
    });

    const res = await GET(
      new Request(`http://localhost/api/assets?episode_id=${EPISODE_ID}`, {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        assets: [
          {
            id: 'asset-1',
            type_code: 'SCRIPT',
            final_filename: '童话剧_侏儒怪_SCRIPT.md',
            storage_backend: 'github',
            status: 'pushed',
          },
        ],
        total: 1,
      },
    });
    expect(queryState.selectColumns).toContain('withdrawn_at');
    expect(queryState.filters).toContainEqual(['is', 'withdrawn_at', null]);
  });

  it('includes withdrawn assets when include_withdrawn=true', async () => {
    mocks.selectAssets.mockResolvedValueOnce({
      data: [{ id: 'asset-1', withdrawn_at: '2026-05-02T00:00:00Z' }],
      error: null,
      count: 1,
    });

    const res = await GET(
      new Request(`http://localhost/api/assets?episode_id=${EPISODE_ID}&include_withdrawn=true`, {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(200);
    expect(queryState.filters).not.toContainEqual(['is', 'withdrawn_at', null]);
  });
});
