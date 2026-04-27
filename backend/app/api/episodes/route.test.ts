import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsertSeries: vi.fn(),
  upsertAlbum: vi.fn(),
  upsertContent: vi.fn(),
  insertEpisode: vi.fn(),
  selectUserDisplay: vi.fn(),
  deleteEpisode: vi.fn(),
  createCommit: vi.fn(),
  putR2: vi.fn(),
  logUsage: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'series') {
        return { upsert: () => ({ select: () => ({ single: async () => mocks.upsertSeries() }) }) };
      }

      if (table === 'albums') {
        return { upsert: () => ({ select: () => ({ single: async () => mocks.upsertAlbum() }) }) };
      }

      if (table === 'contents') {
        return { upsert: () => ({ select: () => ({ single: async () => mocks.upsertContent() }) }) };
      }

      if (table === 'episodes') {
        return {
          insert: () => ({ select: () => ({ single: async () => mocks.insertEpisode() }) }),
          delete: () => ({ eq: async () => mocks.deleteEpisode() }),
        };
      }

      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => mocks.selectUserDisplay() }) }) };
      }

      return {};
    },
  }),
}));
vi.mock('@/lib/github', () => ({
  createCommitWithFiles: mocks.createCommit,
  GithubConflictError: class extends Error {
    code = 'GITHUB_CONFLICT' as const;
  },
}));
vi.mock('@/lib/r2', () => ({ putObject: mocks.putR2 }));
vi.mock('@/lib/usage', () => ({ logUsage: mocks.logUsage }));

import { POST } from './route';

function makeReq(body: unknown, token = 't') {
  return new Request('http://localhost/api/episodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
    mocks.selectUserDisplay.mockResolvedValue({ data: { display_name: '乐美林' }, error: null });
    mocks.upsertSeries.mockResolvedValue({ data: { id: 's1' }, error: null });
    mocks.upsertAlbum.mockResolvedValue({ data: { id: 'a1' }, error: null });
    mocks.upsertContent.mockResolvedValue({ data: { id: 'c1' }, error: null });
    mocks.insertEpisode.mockResolvedValue({
      data: {
        id: 'e1',
        name_cn: '侏儒怪',
        status: 'drafting',
        episode_path: '童话剧_NA_侏儒怪',
        created_at: '2026-04-27T00:00:00Z',
      },
      error: null,
    });
    mocks.createCommit.mockResolvedValue({ commit_sha: 'sha-1', blobs: {} });
    mocks.putR2.mockResolvedValue({ etag: 'e' });
    mocks.logUsage.mockResolvedValue(undefined);
    mocks.deleteEpisode.mockResolvedValue({ error: null });
  });

  it('401 without token', async () => {
    const res = await POST(
      new Request('http://localhost/api/episodes', { method: 'POST', body: '{}' }),
    );

    expect(res.status).toBe(401);
  });

  it('400 on missing fields', async () => {
    const res = await POST(makeReq({ series_name_cn: '童话剧' }));

    expect(res.status).toBe(400);
  });

  it('201 creates episode + GitHub commit + R2 placeholders', async () => {
    const res = await POST(
      makeReq({
        series_name_cn: '童话剧',
        album_name_cn: 'NA',
        content_name_cn: '侏儒怪',
        episode_name_cn: '侏儒怪 第一集',
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.episode.episode_path).toBe('童话剧_NA_侏儒怪');
    expect(body.data.github_commit_sha).toBe('sha-1');
    expect(mocks.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('init skeleton'),
        files: expect.arrayContaining([
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/01_Project/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/02_Data/Script/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/02_Data/Prompt/Image/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/02_Data/Prompt/Video/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/03_Export/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/04_Feedback/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/05_Deliver/.gitkeep' }),
          expect.objectContaining({ path: '童话剧_NA_侏儒怪/README.md' }),
        ]),
      }),
    );
    expect(mocks.putR2.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('409 when episode_name unique constraint hits', async () => {
    mocks.insertEpisode.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'unique violation' },
    });

    const res = await POST(
      makeReq({
        series_name_cn: '童话剧',
        album_name_cn: 'NA',
        content_name_cn: '侏儒怪',
        episode_name_cn: 'dup',
      }),
    );

    expect(res.status).toBe(409);
  });
});
