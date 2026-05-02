import { beforeEach, describe, expect, it, vi } from 'vitest';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectRole: vi.fn(),
  selectEpisode: vi.fn(),
  listPushes: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  filters: [] as Array<[string, string, unknown]>,
  limit: 0,
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

      if (table === 'episodes') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => mocks.selectEpisode() }),
          }),
        };
      }

      return {
        select: () => {
          const query = {
            eq: (column: string, value: unknown) => {
              queryState.filters.push(['eq', column, value]);
              return query;
            },
            is: (column: string, value: unknown) => {
              queryState.filters.push(['is', column, value]);
              return query;
            },
            lt: (column: string, value: unknown) => {
              queryState.filters.push(['lt', column, value]);
              return query;
            },
            order: () => query,
            limit: async (value: number) => {
              queryState.limit = value;
              return mocks.listPushes();
            },
          };
          return query;
        },
      };
    },
  }),
}));

import { GET } from './route';

function makeReq(path = `/api/episodes/${EPISODE_ID}/pushes`) {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer token' },
  });
}

function ctx(id = EPISODE_ID) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/episodes/:id/pushes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.filters = [];
    queryState.limit = 0;
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'u@beva.com' } },
      error: null,
    });
    mocks.selectRole.mockResolvedValue({ data: { role: 'member' }, error: null });
    mocks.selectEpisode.mockResolvedValue({ data: { id: EPISODE_ID }, error: null });
  });

  it('returns push history with withdraw permissions', async () => {
    mocks.listPushes.mockResolvedValueOnce({
      data: [
        {
          id: 'push-1',
          idempotency_key: 'k1',
          commit_message: 'push script',
          github_commit_sha: 'sha1',
          github_revert_sha: null,
          github_revert_failed: false,
          pushed_by: 'user-1',
          pushed_by_user: { id: 'user-1', display_name: 'Me' },
          pushed_at: '2026-05-02T01:00:00Z',
          asset_count: 2,
          total_bytes: 100,
          withdrawn_by: null,
          withdrawn_by_user: null,
          withdrawn_at: null,
          withdrawn_reason: null,
        },
        {
          id: 'push-2',
          idempotency_key: 'k2',
          commit_message: 'old push',
          github_commit_sha: null,
          github_revert_sha: null,
          github_revert_failed: false,
          pushed_by: 'user-2',
          pushed_by_user: { id: 'user-2', display_name: 'Other' },
          pushed_at: '2026-05-01T01:00:00Z',
          asset_count: 1,
          total_bytes: 10,
          withdrawn_by: 'admin-1',
          withdrawn_by_user: { id: 'admin-1', display_name: 'Admin' },
          withdrawn_at: '2026-05-01T02:00:00Z',
          withdrawn_reason: 'mistake',
        },
      ],
      error: null,
    });

    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        pushes: [
          expect.objectContaining({
            id: 'push-1',
            pushed_by: { id: 'user-1', display_name: 'Me' },
            is_withdrawable_by_me: true,
          }),
          expect.objectContaining({
            id: 'push-2',
            withdrawn_by: { id: 'admin-1', display_name: 'Admin' },
            is_withdrawable_by_me: false,
          }),
        ],
        next_cursor: null,
      },
    });
    expect(queryState.limit).toBe(51);
  });

  it('supports include_withdrawn=false and cursor pagination', async () => {
    const extraPushedAt = '2026-05-01T01:00:00Z';
    mocks.listPushes.mockResolvedValueOnce({
      data: [
        {
          id: 'push-1',
          idempotency_key: 'k1',
          commit_message: 'new push',
          github_revert_failed: false,
          pushed_by: 'user-2',
          pushed_by_user: { id: 'user-2', display_name: 'Other' },
          pushed_at: '2026-05-02T01:00:00Z',
          asset_count: 1,
          total_bytes: 10,
          withdrawn_by_user: null,
          withdrawn_at: null,
          withdrawn_reason: null,
        },
        {
          id: 'push-extra',
          idempotency_key: 'k-extra',
          commit_message: 'extra',
          github_revert_failed: false,
          pushed_by: 'user-2',
          pushed_by_user: { id: 'user-2', display_name: 'Other' },
          pushed_at: extraPushedAt,
          asset_count: 1,
          total_bytes: 10,
          withdrawn_by_user: null,
          withdrawn_at: null,
          withdrawn_reason: null,
        },
      ],
      error: null,
    });
    const cursor = btoa('2026-05-03T00:00:00Z');

    const res = await GET(
      makeReq(`/api/episodes/${EPISODE_ID}/pushes?include_withdrawn=false&limit=1&cursor=${cursor}`),
      ctx(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pushes).toHaveLength(1);
    expect(atob(body.data.next_cursor)).toBe(extraPushedAt);
    expect(queryState.filters).toContainEqual(['is', 'withdrawn_at', null]);
    expect(queryState.filters).toContainEqual(['lt', 'pushed_at', '2026-05-03T00:00:00Z']);
    expect(queryState.limit).toBe(2);
  });

  it('404 when episode does not exist', async () => {
    mocks.selectEpisode.mockResolvedValueOnce({ data: null, error: null });

    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(404);
    expect(mocks.listPushes).not.toHaveBeenCalled();
  });
});
