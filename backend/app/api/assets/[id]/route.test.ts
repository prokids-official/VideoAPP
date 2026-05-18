import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectAsset: vi.fn(),
  updateAsset: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  updatePayload: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => mocks.selectAsset() }),
      }),
      update: (payload: Record<string, unknown>) => {
        queryState.updatePayload = payload;
        return {
          eq: () => ({
            select: () => ({ single: async () => mocks.updateAsset() }),
          }),
        };
      },
    }),
  }),
}));

import { PATCH } from './route';

function ctx(id = 'asset-1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/assets/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.updatePayload = null;
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@beva.com' } },
      error: null,
    });
    mocks.selectAsset.mockResolvedValue({
      data: {
        id: 'asset-1',
        storage_metadata: { etag: 'r2-etag', ai_prompt: 'old prompt' },
        withdrawn_at: null,
      },
      error: null,
    });
    mocks.updateAsset.mockResolvedValue({
      data: {
        id: 'asset-1',
        type_code: 'CHAR',
        name: '主角',
        variant: null,
        version: 1,
        stage: 'FINAL',
        language: 'ZH',
        final_filename: 'hero.png',
        storage_backend: 'r2',
        storage_ref: 'path/hero.png',
        storage_metadata: { etag: 'r2-etag', ai_prompt: 'new prompt' },
        file_size_bytes: 12,
        mime_type: 'image/png',
        pushed_at: '2026-05-18T00:00:00Z',
        status: 'pushed',
        withdrawn_at: null,
      },
      error: null,
    });
  });

  it('401s without token', async () => {
    const res = await PATCH(new Request('http://localhost/api/assets/asset-1'), ctx());

    expect(res.status).toBe(401);
  });

  it('merges an editable ai_prompt into existing storage metadata', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/assets/asset-1', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer t',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ storage_metadata: { ai_prompt: '  new prompt  ' } }),
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(queryState.updatePayload).toEqual({
      storage_metadata: { etag: 'r2-etag', ai_prompt: 'new prompt' },
    });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        asset: {
          id: 'asset-1',
          type_code: 'CHAR',
          name: '主角',
          variant: null,
          version: 1,
          stage: 'FINAL',
          language: 'ZH',
          final_filename: 'hero.png',
          storage_backend: 'r2',
          storage_ref: 'path/hero.png',
          storage_metadata: { etag: 'r2-etag', ai_prompt: 'new prompt' },
          file_size_bytes: 12,
          mime_type: 'image/png',
          pushed_at: '2026-05-18T00:00:00Z',
          status: 'pushed',
        },
      },
    });
  });

  it('clears ai_prompt without removing storage backend metadata', async () => {
    mocks.updateAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-1',
        type_code: 'CHAR',
        name: '主角',
        variant: null,
        version: 1,
        stage: 'FINAL',
        language: 'ZH',
        final_filename: 'hero.png',
        storage_backend: 'r2',
        storage_ref: 'path/hero.png',
        storage_metadata: { etag: 'r2-etag' },
        file_size_bytes: 12,
        mime_type: 'image/png',
        pushed_at: '2026-05-18T00:00:00Z',
        status: 'pushed',
        withdrawn_at: null,
      },
      error: null,
    });

    const res = await PATCH(
      new Request('http://localhost/api/assets/asset-1', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer t',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ storage_metadata: { ai_prompt: '' } }),
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(queryState.updatePayload).toEqual({ storage_metadata: { etag: 'r2-etag' } });
  });

  it('410s when editing a withdrawn asset', async () => {
    mocks.selectAsset.mockResolvedValueOnce({
      data: {
        id: 'asset-1',
        storage_metadata: {},
        withdrawn_at: '2026-05-18T00:00:00Z',
      },
      error: null,
    });

    const res = await PATCH(
      new Request('http://localhost/api/assets/asset-1', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer t',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ storage_metadata: { ai_prompt: 'new prompt' } }),
      }),
      ctx(),
    );

    expect(res.status).toBe(410);
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });
});
