import { beforeEach, describe, expect, it, vi } from 'vitest';

const PUSH_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectRole: vi.fn(),
  selectPush: vi.fn(),
  selectAssets: vi.fn(),
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

      if (table === 'pushes') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => mocks.selectPush() }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            order: async () => mocks.selectAssets(),
          }),
        }),
      };
    },
  }),
}));

import { GET } from './route';

function makeReq(path = `/api/pushes/${PUSH_ID}`) {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer token' },
  });
}

function ctx(id = PUSH_ID) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/pushes/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'u@beva.com' } },
      error: null,
    });
    mocks.selectRole.mockResolvedValue({ data: { role: 'admin' }, error: null });
  });

  it('returns push detail with episode and assets', async () => {
    mocks.selectPush.mockResolvedValueOnce({
      data: {
        id: PUSH_ID,
        idempotency_key: 'k1',
        commit_message: 'push assets',
        github_commit_sha: 'sha1',
        github_revert_sha: null,
        github_revert_failed: false,
        pushed_by: 'user-2',
        pushed_by_user: { id: 'user-2', display_name: 'Other' },
        pushed_at: '2026-05-02T01:00:00Z',
        asset_count: 2,
        total_bytes: 100,
        withdrawn_by: null,
        withdrawn_by_user: null,
        withdrawn_at: null,
        withdrawn_reason: null,
        episodes: {
          id: 'episode-1',
          name_cn: '第一集',
          episode_path: '童话剧_NA_侏儒怪',
        },
      },
      error: null,
    });
    mocks.selectAssets.mockResolvedValueOnce({
      data: [
        {
          id: 'asset-1',
          type_code: 'SCRIPT',
          name: '剧本',
          variant: null,
          version: 1,
          language: 'ZH',
          final_filename: 'script.md',
          storage_backend: 'github',
          storage_ref: 'path/script.md',
          file_size_bytes: 12,
          mime_type: 'text/markdown',
          withdrawn_at: null,
        },
      ],
      error: null,
    });

    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        push: expect.objectContaining({
          id: PUSH_ID,
          episode: {
            id: 'episode-1',
            name_cn: '第一集',
            episode_path: '童话剧_NA_侏儒怪',
          },
          pushed_by: { id: 'user-2', display_name: 'Other' },
          is_withdrawable_by_me: true,
        }),
        assets: [
          {
            id: 'asset-1',
            type_code: 'SCRIPT',
            name: '剧本',
            variant: null,
            version: 1,
            language: 'ZH',
            final_filename: 'script.md',
            storage_backend: 'github',
            storage_ref: 'path/script.md',
            file_size_bytes: 12,
            mime_type: 'text/markdown',
            withdrawn_at: null,
          },
        ],
      },
    });
  });

  it('404 when push does not exist', async () => {
    mocks.selectPush.mockResolvedValueOnce({ data: null, error: null });

    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(404);
    expect(mocks.selectAssets).not.toHaveBeenCalled();
  });
});
