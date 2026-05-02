import { beforeEach, describe, expect, it, vi } from 'vitest';

const PUSH_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectActor: vi.fn(),
  selectPush: vi.fn(),
  selectAssets: vi.fn(),
  updatePushWithdraw: vi.fn(),
  updateAssetsWithdraw: vi.fn(),
  updatePushGithub: vi.fn(),
  revertGithub: vi.fn(),
  moveTrash: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: async () => mocks.selectActor() }),
          }),
        };
      }

      if (table === 'pushes') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => mocks.selectPush() }),
          }),
          update: (values: unknown) => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  maybeSingle: async () => mocks.updatePushWithdraw(values),
                }),
              }),
              then: (resolve: (value: unknown) => unknown) => resolve(mocks.updatePushGithub(values)),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            order: async () => mocks.selectAssets(),
          }),
        }),
        update: (values: unknown) => ({
          eq: () => ({
            select: async () => mocks.updateAssetsWithdraw(values),
          }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/github', () => ({
  revertCommitPaths: mocks.revertGithub,
}));

vi.mock('@/lib/r2', () => ({
  moveObjectToTrash: mocks.moveTrash,
}));

import { POST } from './route';

function makeReq(body: unknown = { reason: 'mistake' }) {
  return new Request(`http://localhost/api/pushes/${PUSH_ID}/withdraw`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function ctx(id = PUSH_ID) {
  return { params: Promise.resolve({ id }) };
}

function pushRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PUSH_ID,
    pushed_by: 'user-1',
    withdrawn_at: null,
    github_commit_sha: 'commit-1',
    ...overrides,
  };
}

function assetsRows() {
  return [
    {
      id: 'asset-github',
      storage_backend: 'github',
      storage_ref: 'path/script.md',
    },
    {
      id: 'asset-r2',
      storage_backend: 'r2',
      storage_ref: 'path/image.png',
    },
  ];
}

describe('POST /api/pushes/:id/withdraw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'u@beva.com' } },
      error: null,
    });
    mocks.selectActor.mockResolvedValue({
      data: { role: 'member', display_name: 'Me' },
      error: null,
    });
    mocks.selectPush.mockResolvedValue({ data: pushRow(), error: null });
    mocks.selectAssets.mockResolvedValue({ data: assetsRows(), error: null });
    mocks.updatePushWithdraw.mockResolvedValue({
      data: {
        id: PUSH_ID,
        withdrawn_at: '2026-05-02T01:00:00Z',
        withdrawn_by: 'user-1',
        withdrawn_reason: 'mistake',
        github_revert_sha: null,
        github_revert_failed: false,
        github_revert_error: null,
      },
      error: null,
    });
    mocks.updateAssetsWithdraw.mockResolvedValue({
      data: [{ id: 'asset-github' }, { id: 'asset-r2' }],
      error: null,
    });
    mocks.updatePushGithub.mockResolvedValue({ error: null });
    mocks.revertGithub.mockResolvedValue('revert-sha');
    mocks.moveTrash.mockResolvedValue(undefined);
  });

  it('allows the original pusher to withdraw and runs GitHub revert plus R2 trash', async () => {
    const res = await POST(makeReq(), ctx());

    expect(res.status).toBe(200);
    expect(mocks.revertGithub).toHaveBeenCalledWith({
      commitSha: 'commit-1',
      paths: ['path/script.md'],
      message: 'revert: withdraw push 33333333-3333-4333-8333-333333333333 by Me (mistake)',
    });
    expect(mocks.moveTrash).toHaveBeenCalledWith('path/image.png');
    expect(mocks.updatePushGithub).toHaveBeenCalledWith({ github_revert_sha: 'revert-sha' });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        push: {
          id: PUSH_ID,
          withdrawn_at: '2026-05-02T01:00:00Z',
          withdrawn_by: 'user-1',
          withdrawn_reason: 'mistake',
          github_revert_sha: 'revert-sha',
          github_revert_failed: false,
          github_revert_error: null,
        },
        affected_asset_ids: ['asset-github', 'asset-r2'],
        trash_objects_moved: 1,
        github_status: 'reverted',
      },
    });
  });

  it('allows admin to withdraw another user push', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'admin-1', email: 'admin@beva.com' } },
      error: null,
    });
    mocks.selectActor.mockResolvedValueOnce({
      data: { role: 'admin', display_name: 'Admin' },
      error: null,
    });

    const res = await POST(makeReq(), ctx());

    expect(res.status).toBe(200);
  });

  it('403 for non-pusher non-admin', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-2', email: 'other@beva.com' } },
      error: null,
    });

    const res = await POST(makeReq(), ctx());

    expect(res.status).toBe(403);
    expect(mocks.updatePushWithdraw).not.toHaveBeenCalled();
  });

  it('410 for already withdrawn push', async () => {
    mocks.selectPush.mockResolvedValueOnce({
      data: pushRow({ withdrawn_at: '2026-05-01T00:00:00Z' }),
      error: null,
    });

    const res = await POST(makeReq(), ctx());

    expect(res.status).toBe(410);
  });

  it('404 for missing push', async () => {
    mocks.selectPush.mockResolvedValueOnce({ data: null, error: null });

    const res = await POST(makeReq(), ctx());

    expect(res.status).toBe(404);
  });
});
