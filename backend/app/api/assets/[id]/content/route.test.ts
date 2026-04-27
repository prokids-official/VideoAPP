import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectAsset: vi.fn(),
  getBlobContent: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  logUsage: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => mocks.selectAsset() }),
      }),
    }),
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
});
