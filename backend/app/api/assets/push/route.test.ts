import { beforeEach, describe, expect, it, vi } from 'vitest';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EPISODE_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  lookupIdem: vi.fn(),
  recordIdemSuccess: vi.fn(async () => {}),
  recordIdemDead: vi.fn(async () => {}),
  selectAssetType: vi.fn(),
  selectEpisode: vi.fn(),
  selectExistingPush: vi.fn(),
  selectExistingAssets: vi.fn(),
  insertPush: vi.fn(),
  insertAssets: vi.fn(),
  insertAssetRelations: vi.fn(),
  updateEpisode: vi.fn(async () => ({ error: null })),
  createCommit: vi.fn(),
  putR2: vi.fn(),
  logUsage: vi.fn(async () => {}),
  revertCommit: vi.fn(async () => 'revert-sha'),
  markOrphans: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'asset_types') {
        return { select: () => ({ in: async () => mocks.selectAssetType() }) };
      }

      if (table === 'episodes') {
        return {
          select: () => ({ eq: () => ({ single: async () => mocks.selectEpisode() }) }),
          update: () => ({ eq: async () => mocks.updateEpisode() }),
        };
      }

      if (table === 'assets') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => mocks.selectExistingAssets(),
            }),
          }),
          insert: (rows: unknown[]) => ({ select: async () => mocks.insertAssets(rows) }),
        };
      }

      if (table === 'asset_relations') {
        return {
          insert: async (rows: unknown[]) => mocks.insertAssetRelations(rows),
        };
      }

      if (table === 'pushes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => mocks.selectExistingPush(),
              }),
            }),
          }),
          insert: (row: unknown) => ({
            select: () => ({
              single: async () => mocks.insertPush(row),
            }),
          }),
        };
      }

      return {};
    },
  }),
}));
vi.mock('@/lib/idempotency', () => ({
  lookupIdempotency: mocks.lookupIdem,
  recordIdempotencySuccess: mocks.recordIdemSuccess,
  recordIdempotencyDeadLetter: mocks.recordIdemDead,
}));
vi.mock('@/lib/github', () => ({
  createCommitWithFiles: mocks.createCommit,
  GithubConflictError: class extends Error {
    code = 'GITHUB_CONFLICT' as const;
  },
}));
vi.mock('@/lib/r2', () => ({ putObject: mocks.putR2 }));
vi.mock('@/lib/usage', () => ({ logUsage: mocks.logUsage }));
vi.mock('@/lib/compensation', () => ({
  revertGithubCommit: mocks.revertCommit,
  markR2Orphans: mocks.markOrphans,
}));

import { GithubConflictError } from '@/lib/github';
import { POST } from './route';

function scriptItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    local_draft_id: 'draft-script',
    episode_id: EPISODE_ID,
    type_code: 'SCRIPT',
    name: '侏儒怪',
    version: 1,
    stage: 'FINAL',
    language: 'ZH',
    source: 'pasted',
    original_filename: 'script.md',
    mime_type: 'text/markdown',
    size_bytes: 12,
    ...overrides,
  };
}

function charItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    local_draft_id: 'draft-char',
    episode_id: EPISODE_ID,
    type_code: 'CHAR',
    name: '主角',
    variant: '白天',
    version: 1,
    stage: 'ROUGH',
    language: 'ZH',
    source: 'imported',
    original_filename: 'draft.png',
    mime_type: 'image/png',
    size_bytes: 4,
    ...overrides,
  };
}

function makeMultipart(
  payload: object,
  files: Record<string, { content: string | ArrayBuffer; type: string }>,
  token = 't',
) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));

  for (const [name, file] of Object.entries(files)) {
    fd.append(name, new Blob([file.content], { type: file.type }));
  }

  return new Request('http://localhost/api/assets/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: fd,
  });
}

function makeMalformedPayloadReq(payload: string) {
  const fd = new FormData();
  fd.append('payload', payload);

  return new Request('http://localhost/api/assets/push', {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: fd,
  });
}

describe('POST /api/assets/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@beva.com' } }, error: null });
    mocks.lookupIdem.mockResolvedValue(null);
    mocks.selectExistingPush.mockResolvedValue({ data: null, error: null });
    mocks.selectExistingAssets.mockResolvedValue({ data: [], error: null });
    mocks.selectAssetType.mockResolvedValue({
      data: [
        {
          code: 'SCRIPT',
          folder_path: '02_Data/Script',
          filename_tpl: '{series}_{content}_SCRIPT',
          storage_ext: '.md',
          storage_backend: 'github',
        },
        {
          code: 'CHAR',
          folder_path: '02_Data/Assets/Characters',
          filename_tpl: '{content}_CHAR_{name}_{variant}_v{version:03}',
          storage_ext: 'keep_as_is',
          storage_backend: 'r2',
        },
      ],
      error: null,
    });
    mocks.selectEpisode.mockResolvedValue({
      data: {
        id: EPISODE_ID,
        episode_path: '童话剧_NA_侏儒怪',
        name_cn: '侏儒怪',
        contents: { name_cn: '侏儒怪', albums: { name_cn: 'NA', series: { name_cn: '童话剧' } } },
      },
      error: null,
    });
    mocks.createCommit.mockResolvedValue({ commit_sha: 'commit-1', blobs: { p: 'blob-1' } });
    mocks.putR2.mockResolvedValue({ etag: 'etag-1' });
    mocks.insertPush.mockResolvedValue({
      data: { id: 'push-1' },
      error: null,
    });
    mocks.insertAssets.mockResolvedValue({
      data: [{ id: 'asset-script' }, { id: 'asset-char' }],
      error: null,
    });
    mocks.insertAssetRelations.mockResolvedValue({ error: null });
  });

  it('401 without token', async () => {
    const fd = new FormData();
    fd.append('payload', JSON.stringify({ idempotency_key: 'k1', commit_message: 'm', items: [] }));

    const res = await POST(new Request('http://localhost/api/assets/push', { method: 'POST', body: fd }));

    expect(res.status).toBe(401);
  });

  it('400 PAYLOAD_MALFORMED on bad JSON', async () => {
    const res = await POST(makeMalformedPayloadReq('{bad json'));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
  });

  it('400 ITEM_FILE_MISSING when item declared but no file part', async () => {
    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-missing',
          commit_message: 'push assets',
          items: [scriptItem()],
        },
        {},
      ),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.details.code).toBe('ITEM_FILE_MISSING');
  });

  it('400 FILE_TOO_LARGE when single file exceeds 50MB', async () => {
    const bigFile = new ArrayBuffer(50 * 1024 * 1024 + 1);
    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-large',
          commit_message: 'push assets',
          items: [scriptItem({ size_bytes: bigFile.byteLength })],
        },
        { 'file__draft-script': { content: bigFile, type: 'text/markdown' } },
      ),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.details.code).toBe('FILE_TOO_LARGE');
  });

  it('400 CROSS_EPISODE on multi-episode payload', async () => {
    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-cross',
          commit_message: 'push assets',
          items: [scriptItem(), charItem({ episode_id: OTHER_EPISODE_ID })],
        },
        {},
      ),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.details.code).toBe('CROSS_EPISODE');
    expect(mocks.selectEpisode).not.toHaveBeenCalled();
  });

  it('200 IDEMPOTENT_REPLAY when key already cached', async () => {
    const cached = { commit_sha: 'cached', assets: [] };
    mocks.lookupIdem.mockResolvedValueOnce({ status: 'success', result: cached });

    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-cached',
          commit_message: 'push assets',
          items: [scriptItem()],
        },
        { 'file__draft-script': { content: 'hello', type: 'text/markdown' } },
      ),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(cached);
    expect(mocks.createCommit).not.toHaveBeenCalled();
    expect(mocks.putR2).not.toHaveBeenCalled();
    expect(mocks.insertPush).not.toHaveBeenCalled();
  });

  it('200 replays from persisted pushes before side effects when short-lived cache expired', async () => {
    mocks.selectExistingPush.mockResolvedValueOnce({
      data: { id: 'push-existing', github_commit_sha: 'commit-existing' },
      error: null,
    });
    mocks.selectExistingAssets.mockResolvedValueOnce({
      data: [
        {
          id: 'asset-script-existing',
          storage_backend: 'github',
          storage_ref: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
          final_filename: '童话剧_侏儒怪_SCRIPT.md',
          status: 'pushed',
        },
      ],
      error: null,
    });

    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-expired-cache',
          commit_message: 'push assets',
          items: [scriptItem()],
        },
        {},
      ),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      commit_sha: 'commit-existing',
      assets: [
        {
          local_draft_id: 'draft-script',
          id: 'asset-script-existing',
          storage_backend: 'github',
          storage_ref: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
          final_filename: '童话剧_侏儒怪_SCRIPT.md',
          status: 'pushed',
        },
      ],
    });
    expect(mocks.createCommit).not.toHaveBeenCalled();
    expect(mocks.putR2).not.toHaveBeenCalled();
    expect(mocks.insertPush).not.toHaveBeenCalled();
    expect(mocks.insertAssets).not.toHaveBeenCalled();
    expect(mocks.recordIdemSuccess).toHaveBeenCalledWith('k-expired-cache', 'u-1', expect.any(Object));
  });

  it('201 happy path: 1 SCRIPT text + 1 CHAR image succeeds and returns mixed assets', async () => {
    const imageFile = new ArrayBuffer(4);
    new Uint8Array(imageFile).set([1, 2, 3, 4]);

    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-happy',
          commit_message: 'push assets',
          items: [scriptItem(), charItem()],
        },
        {
          'file__draft-script': { content: '# script', type: 'text/markdown' },
          'file__draft-char': { content: imageFile, type: 'image/png' },
        },
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.commit_sha).toBe('commit-1');
    expect(body.data.assets).toEqual([
      expect.objectContaining({
        local_draft_id: 'draft-script',
        id: 'asset-script',
        storage_backend: 'github',
        final_filename: '童话剧_侏儒怪_SCRIPT.md',
        storage_ref: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
      }),
      expect.objectContaining({
        local_draft_id: 'draft-char',
        id: 'asset-char',
        storage_backend: 'r2',
        final_filename: '侏儒怪_CHAR_主角_白天_v001.png',
        storage_ref: '童话剧_NA_侏儒怪/02_Data/Assets/Characters/侏儒怪_CHAR_主角_白天_v001.png',
      }),
    ]);
    expect(mocks.createCommit).toHaveBeenCalledWith({
      message: 'push assets',
      files: [
        {
          path: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
          content: '# script',
        },
      ],
    });
    expect(mocks.putR2).toHaveBeenCalledWith({
      key: '童话剧_NA_侏儒怪/02_Data/Assets/Characters/侏儒怪_CHAR_主角_白天_v001.png',
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: 'image/png',
    });
    expect(mocks.recordIdemSuccess).toHaveBeenCalledWith('k-happy', 'u-1', body.data);
    expect(mocks.updateEpisode).toHaveBeenCalled();
    expect(mocks.insertPush).toHaveBeenCalledWith({
      episode_id: EPISODE_ID,
      idempotency_key: 'k-happy',
      commit_message: 'push assets',
      github_commit_sha: 'commit-1',
      pushed_by: 'u-1',
      asset_count: 2,
      total_bytes: 16,
    });
    expect(mocks.insertAssets).toHaveBeenCalledWith([
      expect.objectContaining({ idempotency_key: 'k-happy', push_id: 'push-1' }),
      expect.objectContaining({ idempotency_key: 'k-happy', push_id: 'push-1' }),
    ]);
  });

  it('201 accepts studio-export source for personal creation cockpit pushes', async () => {
    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-studio-export',
          commit_message: 'push studio assets',
          items: [scriptItem({ source: 'studio-export' })],
        },
        { 'file__draft-script': { content: '# studio script', type: 'text/markdown' } },
      ),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertAssets).toHaveBeenCalledWith([
      expect.objectContaining({
        source: 'studio-export',
        idempotency_key: 'k-studio-export',
      }),
    ]);
  });

  it('201 persists same-batch asset relations for studio generated outputs', async () => {
    mocks.selectAssetType.mockResolvedValueOnce({
      data: [
        {
          code: 'PROMPT_IMG',
          folder_path: '02_Data/Prompts/Image',
          filename_tpl: '{content}_PROMPT_IMG_{number:03}',
          storage_ext: '.md',
          storage_backend: 'github',
        },
        {
          code: 'SHOT_IMG',
          folder_path: '03_Visual/Images',
          filename_tpl: '{content}_SHOT_IMG_{number:03}',
          storage_ext: 'keep_as_is',
          storage_backend: 'r2',
        },
      ],
      error: null,
    });
    mocks.insertAssets.mockResolvedValueOnce({
      data: [{ id: 'asset-prompt-img' }, { id: 'asset-shot-img' }],
      error: null,
    });

    const imageFile = new ArrayBuffer(4);
    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-relations',
          commit_message: 'push linked studio assets',
          items: [
            scriptItem({
              local_draft_id: 'local-prompt-img',
              type_code: 'PROMPT_IMG',
              name: 'image prompt 01',
              number: 1,
              source: 'studio-export',
              original_filename: 'prompt.md',
              mime_type: 'text/markdown',
              size_bytes: 12,
            }),
            charItem({
              local_draft_id: 'local-shot-img',
              type_code: 'SHOT_IMG',
              name: 'shot image 01',
              number: 1,
              source: 'studio-export',
              original_filename: 'shot.png',
              mime_type: 'image/png',
              size_bytes: 4,
              relations: [
                {
                  relation_type: 'generated_from_prompt',
                  target_local_draft_id: 'local-prompt-img',
                  metadata: { storyboard_number: 1 },
                },
              ],
            }),
          ],
        },
        {
          'file__local-prompt-img': { content: 'wide shot', type: 'text/markdown' },
          'file__local-shot-img': { content: imageFile, type: 'image/png' },
        },
      ),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertAssetRelations).toHaveBeenCalledWith([
      {
        episode_id: EPISODE_ID,
        source_asset_id: 'asset-shot-img',
        target_asset_id: 'asset-prompt-img',
        relation_type: 'generated_from_prompt',
        metadata: { storyboard_number: 1 },
        created_by: 'u-1',
      },
    ]);
  });

  it('502 GITHUB_CONFLICT after retry exhausted', async () => {
    mocks.createCommit.mockRejectedValueOnce(new GithubConflictError());

    const res = await POST(
      makeMultipart(
        {
          idempotency_key: 'k-conflict',
          commit_message: 'push assets',
          items: [scriptItem()],
        },
        { 'file__draft-script': { content: '# script', type: 'text/markdown' } },
      ),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.details.code).toBe('GITHUB_CONFLICT');
    expect(mocks.putR2).not.toHaveBeenCalled();
    expect(mocks.insertAssets).not.toHaveBeenCalled();
  });
});
