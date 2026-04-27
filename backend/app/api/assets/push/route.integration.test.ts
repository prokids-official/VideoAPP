import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { mswServer } from '../../../../test/setup-msw';

const LOCAL_SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1cGFiYXNlX2xvY2FsX2RldmVsb3BtZW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxOTU3MzQ1MjAwfQ.Xpt7sR_y7zlDbg8nwHWy5zhggb-xM6t-cvJrqToQ5rU';
const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1cGFiYXNlX2xvY2FsX2RldmVsb3BtZW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.Pf02VRpCfQIkPJvzawyQKS4sl_gKQ6HZs6f5pBr74N8';

const mocks = vi.hoisted(() => ({
  putObject: vi.fn(),
}));

vi.mock('@/lib/r2', () => ({
  putObject: mocks.putObject,
}));

function configureLocalSupabaseDefaults(): void {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL === 'https://test.supabase.co') {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_SERVICE_KEY = LOCAL_SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_ANON_KEY = LOCAL_SUPABASE_ANON_KEY;
    process.env.SUPABASE_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
  }
}

type PushRoute = typeof import('./route');
type Factories = typeof import('../../../../test/factories');
type SupabaseAdminModule = typeof import('@/lib/supabase-admin');

let POST: PushRoute['POST'];
let createTestUser: Factories['createTestUser'];
let createTestEpisode: Factories['createTestEpisode'];
let cleanupTestData: Factories['cleanupTestData'];
let supabaseAdmin: SupabaseAdminModule['supabaseAdmin'];

let user: Awaited<ReturnType<Factories['createTestUser']>>;
let episode: Awaited<ReturnType<Factories['createTestEpisode']>>;
let createCommitCalls = 0;
let blobCounter = 0;

async function loadRuntimeModules(): Promise<void> {
  configureLocalSupabaseDefaults();
  const routeModule = await import('./route');
  const factories = await import('../../../../test/factories');
  const supabase = await import('@/lib/supabase-admin');

  POST = routeModule.POST;
  createTestUser = factories.createTestUser;
  createTestEpisode = factories.createTestEpisode;
  cleanupTestData = factories.cleanupTestData;
  supabaseAdmin = supabase.supabaseAdmin;
}

async function seedAssetTypes(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('asset_types')
    .upsert(
      [
        {
          code: 'SCRIPT',
          name_cn: '剧本',
          icon: 'file-text',
          folder_path: '02_Data/Script',
          filename_tpl: '{series}_{content}_SCRIPT',
          file_exts: ['.md'],
          storage_ext: '.md',
          storage_backend: 'github',
          parent_panel: 'SCRIPT',
          needs_before: [],
          supports_paste: true,
          allow_ai_generate: false,
          sort_order: 1,
          enabled: true,
        },
        {
          code: 'CHAR',
          name_cn: '角色',
          icon: 'user',
          folder_path: '02_Data/Assets/Characters',
          filename_tpl: '{content}_CHAR_{name}_{variant}_v{version:03}',
          file_exts: ['.png'],
          storage_ext: 'keep_as_is',
          storage_backend: 'r2',
          parent_panel: 'CHAR',
          needs_before: [],
          supports_paste: false,
          allow_ai_generate: true,
          sort_order: 2,
          enabled: true,
        },
      ],
      { onConflict: 'code' },
    );

  if (error) {
    throw new Error(error.message);
  }
}

function githubHandlers() {
  return [
    http.get('https://api.github.com/repos/:owner/:repo/git/ref/heads/:branch', () =>
      HttpResponse.json({ object: { sha: 'mock-head' } }),
    ),
    http.get('https://api.github.com/repos/:owner/:repo/git/refs/heads/:branch', () =>
      HttpResponse.json({ object: { sha: 'mock-head' } }),
    ),
    http.get('https://api.github.com/repos/:owner/:repo/git/commits/:sha', () =>
      HttpResponse.json({ tree: { sha: 'mock-tree' }, parents: [{ sha: 'parent' }] }),
    ),
    http.post('https://api.github.com/repos/:owner/:repo/git/blobs', () => {
      blobCounter += 1;
      return HttpResponse.json({ sha: `blob-${blobCounter}` });
    }),
    http.post('https://api.github.com/repos/:owner/:repo/git/trees', () =>
      HttpResponse.json({ sha: 'new-tree' }),
    ),
    http.post('https://api.github.com/repos/:owner/:repo/git/commits', () => {
      createCommitCalls += 1;
      return HttpResponse.json({ sha: 'new-commit' });
    }),
    http.patch('https://api.github.com/repos/:owner/:repo/git/refs/heads/:branch', () =>
      HttpResponse.json({}),
    ),
  ];
}

function makePushRequest(idempotencyKey: string, draftId: string): Request {
  const fd = new FormData();
  fd.append(
    'payload',
    JSON.stringify({
      idempotency_key: idempotencyKey,
      commit_message: 'integration test',
      items: [
        {
          local_draft_id: draftId,
          episode_id: episode.episode_id,
          type_code: 'SCRIPT',
          name: '测试内容',
          version: 1,
          stage: 'ROUGH',
          language: 'ZH',
          source: 'imported',
          mime_type: 'text/markdown',
          size_bytes: 11,
        },
      ],
    }),
  );
  fd.append(`file__${draftId}`, new Blob(['hello world'], { type: 'text/markdown' }));

  return new Request('http://localhost/api/assets/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${user.access_token}` },
    body: fd,
  });
}

describe('integration: POST /api/assets/push', () => {
  beforeAll(async () => {
    await loadRuntimeModules();
    await cleanupTestData();
    user = await createTestUser();
    await seedAssetTypes();
    episode = await createTestEpisode({ authorId: user.id });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(() => {
    createCommitCalls = 0;
    blobCounter = 0;
    vi.clearAllMocks();
    mocks.putObject.mockResolvedValue({ etag: 'mock-etag' });
    mswServer.use(...githubHandlers());
  });

  it('happy path: 1 SCRIPT pushes successfully and lands in Supabase', async () => {
    const draftId = '11111111-1111-1111-1111-111111111111';
    const res = await POST(makePushRequest(`key-${Date.now()}`, draftId));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.commit_sha).toBe('new-commit');
    expect(body.data.assets).toHaveLength(1);
    expect(body.data.assets[0].storage_backend).toBe('github');

    const { data: asset, error } = await supabaseAdmin()
      .from('assets')
      .select('id,episode_id,type_code,storage_backend,storage_metadata,status')
      .eq('id', body.data.assets[0].id)
      .single();

    expect(error).toBeNull();
    expect(asset).toEqual(
      expect.objectContaining({
        episode_id: episode.episode_id,
        type_code: 'SCRIPT',
        storage_backend: 'github',
        status: 'pushed',
      }),
    );
    expect(asset?.storage_metadata).toEqual({ commit_sha: 'new-commit', blob_sha: 'blob-1' });
  });

  it('idempotent replay returns same result without re-committing', async () => {
    const key = `idem-${Date.now()}`;
    const first = await POST(makePushRequest(key, '22222222-2222-2222-2222-222222222222'));
    const firstBody = await first.json();
    const second = await POST(makePushRequest(key, '22222222-2222-2222-2222-222222222222'));
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondBody.data).toEqual(firstBody.data);
    expect(createCommitCalls).toBe(1);
  });
});
