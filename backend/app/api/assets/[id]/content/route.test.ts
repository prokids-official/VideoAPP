import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectActor: vi.fn(),
  selectAsset: vi.fn(),
  getBlobContent: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  logUsage: vi.fn(async () => {}),
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

      return {
        select: () => ({
          eq: () => ({ single: async () => mocks.selectAsset() }),
        }),
      };
    },
  }),
}));
vi.mock('@/lib/github', () => ({ getBlobContent: mocks.getBlobContent }));
vi.mock('@/lib/r2', () => ({ getPresignedDownloadUrl: mocks.getPresignedDownloadUrl }));
vi.mock('@/lib/usage', () => ({ logUsage: mocks.logUsage }));

import { GET } from './route';

function ctx(id = 'asset-1') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/assets/:id/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
    mocks.selectActor.mockResolvedValue({ data: { role: 'member' }, error: null });
  });

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/assets/asset-1/content'), ctx());

    expect(res.status).toBe(401);
  });

  it('returns GitHub text content', async () => {
    mocks.selectAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-1',
        storage_backend: 'github',
        storage_ref: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
        storage_metadata: { commit_sha: 'commit-1', blob_sha: 'blob-1' },
        mime_type: 'text/markdown',
        episode_id: 'episode-1',
        file_size_bytes: 8,
      },
      error: null,
    });
    mocks.getBlobContent.mockResolvedValueOnce('# script');

    const res = await GET(
      new Request('http://localhost/api/assets/asset-1/content', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown');
    expect(await res.text()).toBe('# script');
    expect(mocks.getBlobContent).toHaveBeenCalledWith('blob-1');
    expect(mocks.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', action: 'download', bytesTransferred: 8 }),
    );
  });

  it('redirects R2 content to a presigned download URL', async () => {
    mocks.selectAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-2',
        storage_backend: 'r2',
        storage_ref: '童话剧_NA_侏儒怪/02_Data/Assets/Characters/x.png',
        storage_metadata: { etag: 'etag-1' },
        mime_type: 'image/png',
        episode_id: 'episode-1',
        file_size_bytes: 4,
      },
      error: null,
    });
    mocks.getPresignedDownloadUrl.mockResolvedValueOnce('https://r2.example.test/signed');

    const res = await GET(
      new Request('http://localhost/api/assets/asset-2/content', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx('asset-2'),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://r2.example.test/signed');
    expect(mocks.getPresignedDownloadUrl).toHaveBeenCalledWith({
      key: '童话剧_NA_侏儒怪/02_Data/Assets/Characters/x.png',
      ttlSec: 900,
    });
  });

  it('410 for withdrawn assets by default', async () => {
    mocks.selectAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-withdrawn',
        storage_backend: 'github',
        storage_ref: 'path/script.md',
        storage_metadata: { blob_sha: 'blob-1' },
        withdrawn_at: '2026-05-02T00:00:00Z',
        push_id: 'push-1',
      },
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/assets/asset-withdrawn/content', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx('asset-withdrawn'),
    );

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe('ASSET_WITHDRAWN');
    expect(body.error.details).toEqual({
      withdrawn_at: '2026-05-02T00:00:00Z',
      push_id: 'push-1',
    });
    expect(mocks.getBlobContent).not.toHaveBeenCalled();
  });

  it('410 for non-admin include_withdrawn=true override', async () => {
    mocks.selectAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-withdrawn',
        storage_backend: 'github',
        storage_ref: 'path/script.md',
        storage_metadata: { blob_sha: 'blob-1' },
        withdrawn_at: '2026-05-02T00:00:00Z',
        push_id: 'push-1',
      },
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/assets/asset-withdrawn/content?include_withdrawn=true', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx('asset-withdrawn'),
    );

    expect(res.status).toBe(410);
  });

  it('allows admin include_withdrawn=true override', async () => {
    mocks.selectActor.mockResolvedValueOnce({ data: { role: 'admin' }, error: null });
    mocks.selectAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-withdrawn',
        storage_backend: 'github',
        storage_ref: 'path/script.md',
        storage_metadata: { blob_sha: 'blob-1' },
        mime_type: 'text/markdown',
        withdrawn_at: '2026-05-02T00:00:00Z',
        push_id: 'push-1',
      },
      error: null,
    });
    mocks.getBlobContent.mockResolvedValueOnce('# withdrawn');

    const res = await GET(
      new Request('http://localhost/api/assets/asset-withdrawn/content?include_withdrawn=true', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx('asset-withdrawn'),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('# withdrawn');
  });
});
