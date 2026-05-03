import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectAsset: vi.fn(),
  selectOutgoing: vi.fn(),
  selectIncoming: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'assets') {
        return {
          select: () => ({
            eq: () => ({ single: async () => mocks.selectAsset() }),
          }),
        };
      }

      if (table === 'asset_relations') {
        const query = {
          select: () => query,
          eq: (column: string) => ({
            order: async () => (column === 'source_asset_id' ? mocks.selectOutgoing() : mocks.selectIncoming()),
          }),
          or: () => query,
        };
        return query;
      }

      return {};
    },
  }),
}));

import { GET } from './route';

function ctx(id = 'asset-1') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/assets/:id/relations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
    mocks.selectAsset.mockResolvedValue({
      data: { id: 'asset-1', episode_id: 'episode-1', withdrawn_at: null },
      error: null,
    });
    mocks.selectOutgoing.mockResolvedValue({
      data: [
        {
          id: 'rel-1',
          relation_type: 'generated_from_prompt',
          metadata: { storyboard_number: 1 },
          created_at: '2026-05-03T00:00:00Z',
          source_asset_id: 'asset-1',
          target_asset_id: 'asset-prompt',
          target_asset: {
            id: 'asset-prompt',
            type_code: 'PROMPT_IMG',
            name: 'image prompt 01',
            final_filename: 'prompt.md',
            storage_backend: 'github',
            storage_ref: 'path/prompt.md',
            mime_type: 'text/markdown',
          },
        },
      ],
      error: null,
    });
    mocks.selectIncoming.mockResolvedValue({
      data: [
        {
          id: 'rel-2',
          relation_type: 'generated_from_prompt',
          metadata: {},
          created_at: '2026-05-03T00:01:00Z',
          source_asset_id: 'asset-generated',
          target_asset_id: 'asset-1',
          source_asset: {
            id: 'asset-generated',
            type_code: 'SHOT_IMG',
            name: 'shot image 01',
            final_filename: 'shot.png',
            storage_backend: 'r2',
            storage_ref: 'path/shot.png',
            mime_type: 'image/png',
          },
        },
      ],
      error: null,
    });
  });

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/assets/asset-1/relations'), ctx());

    expect(res.status).toBe(401);
  });

  it('returns outgoing and incoming relations for an asset', async () => {
    const res = await GET(
      new Request('http://localhost/api/assets/asset-1/relations', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        asset_id: 'asset-1',
        outgoing: [
          {
            id: 'rel-1',
            relation_type: 'generated_from_prompt',
            metadata: { storyboard_number: 1 },
            created_at: '2026-05-03T00:00:00Z',
            asset: {
              id: 'asset-prompt',
              type_code: 'PROMPT_IMG',
              name: 'image prompt 01',
              final_filename: 'prompt.md',
              storage_backend: 'github',
              storage_ref: 'path/prompt.md',
              mime_type: 'text/markdown',
            },
          },
        ],
        incoming: [
          {
            id: 'rel-2',
            relation_type: 'generated_from_prompt',
            metadata: {},
            created_at: '2026-05-03T00:01:00Z',
            asset: {
              id: 'asset-generated',
              type_code: 'SHOT_IMG',
              name: 'shot image 01',
              final_filename: 'shot.png',
              storage_backend: 'r2',
              storage_ref: 'path/shot.png',
              mime_type: 'image/png',
            },
          },
        ],
      },
    });
  });

  it('404 when asset does not exist', async () => {
    mocks.selectAsset.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    const res = await GET(
      new Request('http://localhost/api/assets/missing/relations', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx('missing'),
    );

    expect(res.status).toBe(404);
  });
});
