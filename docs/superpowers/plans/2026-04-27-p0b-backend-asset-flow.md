# FableGlitch P0-B · 后端资产流实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 P0-A（auth + schema + filename-resolver）基础上补完所有"创建剧集骨架 + 导入并推送资产"路由，让前端能完成"新建剧集 → 导入文件 → 一键入库 → 看到他人资产"的完整闭环。

**Architecture:**
- 在 `backend/lib/` 新增 GitHub（Octokit Git Data API）、R2（AWS S3 SDK + presigned URL）、idempotency（push_idempotency 表）、compensation（GitHub revert / R2 孤儿标记）、usage logging 五个 lib
- 路由按 spec §5 分 Edge / Node runtime（多大 body 解析 + 大依赖的走 Node）
- 写入路径严格走"GitHub 文本 → R2 二进制 → Supabase 元数据"三阶段，任一阶段失败按 spec §5.4"部分失败补偿"回滚
- 测试分两层：`*.test.ts` 用 mock client 跑单元；`*.integration.test.ts` 跑在 `vitest.integration.config.ts` 下打真实本地 Supabase + 一个 mock GitHub server（[msw](https://mswjs.io/)）+ 一个内存 R2 替身

**Tech Stack:**
- `@octokit/rest`（GitHub Git Data API）
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`（R2）
- `msw` + `msw/node`（mock HTTP for integration tests）
- 已有：`@supabase/supabase-js`、`zod`、`vitest`、`@upstash/ratelimit`

**Spec reference:** `docs/superpowers/specs/2026-04-23-fableglitch-p0-foundation-design.md`（v2）。本计划覆盖 §5.2、§5.3、§5.4、§5.5、§6.2、§6.3、§6.5、§6.6、§9.E 路径合成在路由层的应用、§9.F 语言白名单。

**前置依赖**：
- ✅ P0-A 全部完成（commit `38a45b0` 之前的 8 个 commit）
- ✅ filename-resolver 完成（commit `5e41081`，由 Codex 在 P0-A 后追加）
- ⏳ 运维清单跑完（Vercel / Supabase / GitHub bot / R2 / Upstash 全部就位）—— **integration test 与远程冒烟需要这一步，但 unit test 不需要**

---

## File Structure

新增（13 个文件）：
```
backend/
├── package.json                                       (MODIFY: 加依赖)
├── vitest.config.ts                                   (MODIFY: 排除 integration 测试)
├── vitest.integration.config.ts                       (NEW: integration 配置)
├── test/
│   ├── setup-env.ts                                   (MODIFY: 加 GitHub/R2 placeholder env)
│   ├── setup-msw.ts                                   (NEW: mock GitHub HTTP server)
│   └── factories.ts                                   (NEW: 创建测试用 user/episode/asset)
├── lib/
│   ├── github.ts                                      (NEW: Octokit Git Data API 封装)
│   ├── github.test.ts                                 (NEW)
│   ├── r2.ts                                          (NEW: S3 client + presigned URL)
│   ├── r2.test.ts                                     (NEW)
│   ├── idempotency.ts                                 (NEW: push_idempotency 表读写)
│   ├── idempotency.test.ts                            (NEW)
│   ├── compensation.ts                                (NEW: 部分失败回滚)
│   ├── compensation.test.ts                           (NEW)
│   ├── usage.ts                                       (NEW: usage_logs 写入助手)
│   ├── usage.test.ts                                  (NEW)
│   ├── language-codes.ts                              (NEW: ISO 639-1 白名单 §9.F)
│   └── path.ts                                        (NEW: episode_path 拼装、folder_path 模板填充)
├── supabase/
│   ├── migrations/
│   │   └── 20260427000005_push_idempotency.sql        (NEW)
│   └── seed.sql                                       (NO CHANGE)
└── app/api/
    ├── tree/
    │   ├── route.ts                                   (NEW, Edge)
    │   └── route.test.ts
    ├── episodes/
    │   ├── route.ts                                   (NEW POST + GET 列表; Node runtime — Octokit + S3)
    │   ├── route.test.ts
    │   └── [id]/
    │       ├── route.ts                               (NEW GET 详情; Edge)
    │       └── route.test.ts
    ├── assets/
    │   ├── route.ts                                   (NEW GET 列表; Edge)
    │   ├── route.test.ts
    │   ├── preview-filename/
    │   │   ├── route.ts                               (NEW POST; Edge)
    │   │   └── route.test.ts
    │   ├── check-collision/
    │   │   ├── route.ts                               (NEW POST; Edge)
    │   │   └── route.test.ts
    │   ├── push/
    │   │   ├── route.ts                               (NEW POST multipart; Node runtime, maxBodySize 200MB)
    │   │   ├── route.test.ts                          (unit, mocks GitHub/R2/Supabase)
    │   │   └── route.integration.test.ts              (real local Supabase + msw GitHub + memory R2)
    │   └── [id]/
    │       └── content/
    │           ├── route.ts                           (NEW GET; Node runtime — Octokit blob fetch + presigned)
    │           └── route.test.ts
    └── usage/
        ├── me/
        │   ├── route.ts                               (NEW GET; Edge)
        │   └── route.test.ts
        └── route.ts                                   (NEW GET admin; Edge)
        └── route.test.ts
```

**文件职责（lib 层）**：
- `lib/github.ts`：导出 4 个函数 —— `createCommitWithFiles({branch, message, files: [{path, content}]})`、`getBlobContent(sha)`、`getDefaultBranchHead()`、`getOctokit()`。所有 Git Data API 细节封装在此，不暴露 Octokit 实例给路由
- `lib/r2.ts`：导出 `putObject({key, body, contentType})`、`getPresignedDownloadUrl({key, ttlSec})`、`headObject(key)`、`deleteObject(key)`、`getS3Client()`。封装 R2 endpoint 拼装
- `lib/idempotency.ts`：导出 `lookupIdempotency(key, userId)`、`recordIdempotencySuccess(key, userId, result)`、`recordIdempotencyDeadLetter(key, userId, error)`、`cleanupExpiredIdempotency()` (cron 用，P0 不调)
- `lib/compensation.ts`：导出 `revertGithubCommit(sha, message)`、`markR2Orphans([keys])`（写到一个 `r2_orphans` 表留待运维清理）
- `lib/usage.ts`：导出 `logUsage({userId, provider, action, ...})`，failure 不抛错只 console.warn（usage 失败绝不能阻塞业务流）
- `lib/path.ts`：导出 `composeFolderPath({template, episode, content})`（解析 `02_Data/Shot/{episode}/Images` 之类）、`composeFullStorageRef({episodePath, folderPath, finalFilename})` —— spec §6.3 的最终 storage_ref 拼装公式
- `lib/language-codes.ts`：导出 `LANGUAGE_WHITELIST = new Set(['ZH', 'EN', ...])`、`isValidLanguage(code)`（spec §9.F）

---

## Task 1: 安装新依赖 + 配置 integration 测试隔离

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/vitest.config.ts`
- Create: `backend/vitest.integration.config.ts`
- Modify: `backend/test/setup-env.ts`

- [ ] **Step 1: 加依赖**

Edit `backend/package.json` 在 `dependencies` 加：
```json
"@octokit/rest": "^21.0.0",
"@aws-sdk/client-s3": "^3.700.0",
"@aws-sdk/s3-request-presigner": "^3.700.0"
```

在 `devDependencies` 加：
```json
"msw": "^2.6.0"
```

Run:
```bash
cd D:/VideoAPP/backend
npm install
```
Expected：成功安装。

- [ ] **Step 2: 配 integration 测试隔离**

Edit `backend/vitest.config.ts`，在 `test.exclude` 加 `'**/*.integration.test.ts'`：
```ts
exclude: ['**/node_modules/**', '**/.next/**', '**/*.integration.test.ts'],
```

Write `backend/vitest.integration.config.ts`：
```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    setupFiles: ['./test/setup-env.ts', './test/setup-msw.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
});
```

Edit `backend/test/setup-env.ts` 追加：
```ts
process.env.GITHUB_BOT_TOKEN ??= 'test-github-token';
process.env.GITHUB_REPO_OWNER ??= 'fableglitch';
process.env.GITHUB_REPO_NAME ??= 'asset-library';
process.env.GITHUB_DEFAULT_BRANCH ??= 'main';
process.env.R2_ACCOUNT_ID ??= 'testaccount';
process.env.R2_ACCESS_KEY_ID ??= 'test-r2-access';
process.env.R2_SECRET_ACCESS_KEY ??= 'test-r2-secret';
process.env.R2_BUCKET_NAME ??= 'fableglitch-assets-test';
process.env.R2_ENDPOINT ??= 'https://testaccount.r2.cloudflarestorage.com';
```

- [ ] **Step 3: 验证 unit 测试仍跑通**

Run:
```bash
cd D:/VideoAPP/backend
npm test
```
Expected：53 个测试全过（40 P0-A + 13 filename-resolver）。

- [ ] **Step 4: Commit**

```bash
cd D:/VideoAPP
git add backend/package.json backend/package-lock.json backend/vitest.config.ts backend/vitest.integration.config.ts backend/test/setup-env.ts
git commit -m "chore(backend): add Octokit + AWS S3 + msw deps; isolate integration tests"
```

---

## Task 2: msw setup + test factories

**Files:**
- Create: `backend/test/setup-msw.ts`
- Create: `backend/test/factories.ts`

- [ ] **Step 1: 写 msw setup**

Write `backend/test/setup-msw.ts`：
```ts
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Default handlers: empty — each integration test adds its own GitHub mocks
export const mswServer = setupServer(
  http.get('https://api.github.com/repos/:owner/:repo/git/refs/heads/main', () =>
    HttpResponse.json({ object: { sha: 'mock-head-sha' } }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
```

- [ ] **Step 2: 写 factories**

Write `backend/test/factories.ts`：
```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? '';

function admin() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestUser(opts: { email?: string; displayName?: string } = {}): Promise<{
  id: string; email: string; access_token: string;
}> {
  const email = opts.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@beva.com`;
  const password = 'TestPass123';
  const { data: created, error: e1 } = await admin().auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (e1 || !created.user) throw new Error(e1?.message);
  await admin().from('users').insert({
    id: created.user.id, email, display_name: opts.displayName ?? 'Test User',
    team: 'FableGlitch', role: 'member',
  });
  const { data: signIn } = await admin().auth.signInWithPassword({ email, password });
  if (!signIn.session) throw new Error('signin failed in factory');
  return { id: created.user.id, email, access_token: signIn.session.access_token };
}

export async function createTestEpisode(opts: { authorId: string; episodeName?: string }): Promise<{
  episode_id: string; episode_path: string;
}> {
  const series = await admin().from('series').insert({
    name_cn: '测试系列', created_by: opts.authorId,
  }).select().single();
  const album = await admin().from('albums').insert({
    series_id: series.data!.id, name_cn: 'NA', created_by: opts.authorId,
  }).select().single();
  const content = await admin().from('contents').insert({
    album_id: album.data!.id, name_cn: '测试内容', created_by: opts.authorId,
  }).select().single();
  const epName = opts.episodeName ?? `测试剧集_${Date.now()}`;
  const path = `测试系列_NA_${epName}`;
  const ep = await admin().from('episodes').insert({
    content_id: content.data!.id, name_cn: epName, episode_path: path,
    created_by: opts.authorId,
  }).select().single();
  return { episode_id: ep.data!.id, episode_path: path };
}

export async function cleanupTestData(): Promise<void> {
  // truncate everything created by tests; service role bypasses RLS
  await admin().from('assets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('episodes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('contents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('albums').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('series').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('usage_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('push_idempotency').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // users 由 auth cascade 删除：
  const { data: testUsers } = await admin().from('users').select('id').like('email', 'test-%@beva.com');
  for (const u of testUsers ?? []) {
    await admin().auth.admin.deleteUser(u.id).catch(() => {});
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/test/
git commit -m "test(backend): msw + Supabase factories for integration tests"
```

---

## Task 3: Migration 005 — push_idempotency 表

**Files:**
- Create: `backend/supabase/migrations/20260427000005_push_idempotency.sql`

Spec reference: §5.4 "幂等" 子小节（TTL 24h）。

- [ ] **Step 1: 写 migration 005**

Write `backend/supabase/migrations/20260427000005_push_idempotency.sql`：
```sql
-- Push idempotency: maps client-generated key to cached result for 24h
create table public.push_idempotency (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  result_json jsonb not null,
  status text not null check (status in ('success', 'dead_letter')),
  completed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create unique index idx_push_idempotency_key_user
  on public.push_idempotency(idempotency_key, user_id);

create index idx_push_idempotency_expires
  on public.push_idempotency(expires_at);

alter table public.push_idempotency enable row level security;

-- Optional: an orphan tracker for R2 cleanup when commit succeeds but Supabase fails
create table public.r2_orphans (
  id uuid primary key default gen_random_uuid(),
  storage_ref text not null,
  bytes bigint,
  reason text,
  created_at timestamptz not null default now(),
  cleaned_at timestamptz
);

create index idx_r2_orphans_pending
  on public.r2_orphans(created_at) where cleaned_at is null;

alter table public.r2_orphans enable row level security;

-- No policies: only service role touches these tables
```

- [ ] **Step 2: Apply 本地 + 验证**

Run:
```bash
cd D:/VideoAPP/backend
npx supabase db reset
```
Expected: 5 个 migration 都 apply 无错误。

- [ ] **Step 3: Commit**

```bash
cd D:/VideoAPP
git add backend/supabase/migrations/20260427000005_push_idempotency.sql
git commit -m "feat(backend): migration 005 — push_idempotency + r2_orphans tables"
```

---

## Task 4: lib/language-codes.ts + lib/path.ts

**Files:**
- Create: `backend/lib/language-codes.ts`
- Create: `backend/lib/language-codes.test.ts`
- Create: `backend/lib/path.ts`
- Create: `backend/lib/path.test.ts`

Spec reference: §9.F、§6.3 的最终 storage_ref 拼装。

- [ ] **Step 1: 写测试**

Write `backend/lib/language-codes.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { LANGUAGE_WHITELIST, isValidLanguage } from './language-codes';

describe('LANGUAGE_WHITELIST', () => {
  it('contains the 16 P0 languages', () => {
    expect(LANGUAGE_WHITELIST.size).toBe(16);
    for (const code of ['ZH','EN','JA','KO','FR','DE','ES','IT','RU','PT','AR','HI','TH','VI','ID','MS']) {
      expect(LANGUAGE_WHITELIST.has(code)).toBe(true);
    }
  });
});

describe('isValidLanguage', () => {
  it('accepts whitelisted codes', () => { expect(isValidLanguage('ZH')).toBe(true); });
  it('rejects unknown codes', () => { expect(isValidLanguage('XX')).toBe(false); });
  it('rejects lowercase / wrong format', () => {
    expect(isValidLanguage('zh')).toBe(false);
    expect(isValidLanguage('ZHO')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
  });
});
```

Write `backend/lib/path.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { composeFolderPath, composeFullStorageRef } from './path';

describe('composeFolderPath', () => {
  it('substitutes {episode} from asset_types.folder_path', () => {
    expect(composeFolderPath({
      template: '02_Data/Shot/{episode}/Images',
      episode: '童话剧_NA_侏儒怪',
    })).toBe('02_Data/Shot/童话剧_NA_侏儒怪/Images');
  });
  it('returns template as-is when no placeholders', () => {
    expect(composeFolderPath({
      template: '02_Data/Script',
    })).toBe('02_Data/Script');
  });
});

describe('composeFullStorageRef', () => {
  it('joins episode_path + folder_path + filename', () => {
    expect(composeFullStorageRef({
      episodePath: '童话剧_NA_侏儒怪',
      folderPath: '02_Data/Script',
      finalFilename: '童话剧_侏儒怪_SCRIPT.md',
    })).toBe('童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
npm test -- lib/language-codes.test.ts lib/path.test.ts
```
Expected: FAIL, modules not found.

- [ ] **Step 3: 实现 language-codes.ts**

Write `backend/lib/language-codes.ts`：
```ts
export const LANGUAGE_WHITELIST = new Set([
  'ZH', 'EN', 'JA', 'KO', 'FR', 'DE', 'ES', 'IT',
  'RU', 'PT', 'AR', 'HI', 'TH', 'VI', 'ID', 'MS',
]);

export function isValidLanguage(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && LANGUAGE_WHITELIST.has(code);
}
```

- [ ] **Step 4: 实现 path.ts**

Write `backend/lib/path.ts`：
```ts
import { normalize } from './filename-resolver';

const FOLDER_VAR = /\{(episode|content)\}/g;

export function composeFolderPath(opts: {
  template: string;
  episode?: string;
  content?: string;
}): string {
  return opts.template.replace(FOLDER_VAR, (_, key: 'episode' | 'content') => {
    const value = opts[key];
    if (!value) {
      throw new Error(`composeFolderPath: missing ${key} for template ${opts.template}`);
    }
    return normalize(value);
  });
}

export function composeFullStorageRef(opts: {
  episodePath: string;
  folderPath: string;
  finalFilename: string;
}): string {
  return `${opts.episodePath}/${opts.folderPath}/${opts.finalFilename}`;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run:
```bash
npm test -- lib/language-codes.test.ts lib/path.test.ts
```
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add backend/lib/language-codes.ts backend/lib/language-codes.test.ts backend/lib/path.ts backend/lib/path.test.ts
git commit -m "feat(backend): ISO-639-1 whitelist (§9.F) + storage path composition (§6.3)"
```

---

## Task 5: lib/github.ts

**Files:**
- Create: `backend/lib/github.ts`
- Create: `backend/lib/github.test.ts`

Spec reference: §3.2 GitHub 仓库职责、§5.3 episodes 创建骨架、§5.4 push 阶段 A、§6.5 后端阶段 A。

设计：用 Octokit 的 Git Data API（blob → tree → commit → ref）一次 commit 多文件。所有路径前缀 `<episode_path>/`。

- [ ] **Step 1: 写测试**

Write `backend/lib/github.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const octokitMocks = vi.hoisted(() => ({
  getRef: vi.fn(),
  getCommit: vi.fn(),
  createBlob: vi.fn(),
  createTree: vi.fn(),
  createCommit: vi.fn(),
  updateRef: vi.fn(),
  getBlob: vi.fn(),
  getRefRaw: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      git: {
        getRef: octokitMocks.getRef,
        getCommit: octokitMocks.getCommit,
        createBlob: octokitMocks.createBlob,
        createTree: octokitMocks.createTree,
        createCommit: octokitMocks.createCommit,
        updateRef: octokitMocks.updateRef,
        getBlob: octokitMocks.getBlob,
      },
    };
  },
}));

import { createCommitWithFiles, getBlobContent, getDefaultBranchHead } from './github';

describe('getDefaultBranchHead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns sha from refs/heads/main', async () => {
    octokitMocks.getRef.mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
    expect(await getDefaultBranchHead()).toBe('abc123');
    expect(octokitMocks.getRef).toHaveBeenCalledWith({
      owner: 'fableglitch', repo: 'asset-library', ref: 'heads/main',
    });
  });
});

describe('createCommitWithFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates blobs, tree, commit, and updates ref', async () => {
    octokitMocks.getRef.mockResolvedValueOnce({ data: { object: { sha: 'parent-sha' } } });
    octokitMocks.getCommit.mockResolvedValueOnce({ data: { tree: { sha: 'parent-tree' } } });
    octokitMocks.createBlob
      .mockResolvedValueOnce({ data: { sha: 'blob-1' } })
      .mockResolvedValueOnce({ data: { sha: 'blob-2' } });
    octokitMocks.createTree.mockResolvedValueOnce({ data: { sha: 'new-tree' } });
    octokitMocks.createCommit.mockResolvedValueOnce({ data: { sha: 'new-commit' } });
    octokitMocks.updateRef.mockResolvedValueOnce({ data: {} });

    const result = await createCommitWithFiles({
      branch: 'main',
      message: 'test commit',
      files: [
        { path: 'a/b.md', content: 'hello' },
        { path: 'a/c.md', content: 'world' },
      ],
    });

    expect(result).toEqual({
      commit_sha: 'new-commit',
      blobs: { 'a/b.md': 'blob-1', 'a/c.md': 'blob-2' },
    });
    expect(octokitMocks.createTree).toHaveBeenCalledWith(expect.objectContaining({
      base_tree: 'parent-tree',
      tree: [
        { path: 'a/b.md', mode: '100644', type: 'blob', sha: 'blob-1' },
        { path: 'a/c.md', mode: '100644', type: 'blob', sha: 'blob-2' },
      ],
    }));
    expect(octokitMocks.updateRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'heads/main', sha: 'new-commit',
    }));
  });

  it('retries once on update-ref 422 (conflict) by re-reading HEAD', async () => {
    octokitMocks.getRef
      .mockResolvedValueOnce({ data: { object: { sha: 'old-head' } } })
      .mockResolvedValueOnce({ data: { object: { sha: 'newer-head' } } });
    octokitMocks.getCommit
      .mockResolvedValueOnce({ data: { tree: { sha: 'tree-1' } } })
      .mockResolvedValueOnce({ data: { tree: { sha: 'tree-2' } } });
    octokitMocks.createBlob.mockResolvedValue({ data: { sha: 'b' } });
    octokitMocks.createTree
      .mockResolvedValueOnce({ data: { sha: 't1' } })
      .mockResolvedValueOnce({ data: { sha: 't2' } });
    octokitMocks.createCommit
      .mockResolvedValueOnce({ data: { sha: 'c1' } })
      .mockResolvedValueOnce({ data: { sha: 'c2' } });
    const conflictErr = Object.assign(new Error('Reference cannot be updated'), { status: 422 });
    octokitMocks.updateRef
      .mockRejectedValueOnce(conflictErr)
      .mockResolvedValueOnce({ data: {} });

    const result = await createCommitWithFiles({
      branch: 'main', message: 'm', files: [{ path: 'x.md', content: 'y' }],
    });

    expect(result.commit_sha).toBe('c2');
    expect(octokitMocks.updateRef).toHaveBeenCalledTimes(2);
  });

  it('throws GithubConflictError when retry also conflicts', async () => {
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: 'h' } } });
    octokitMocks.getCommit.mockResolvedValue({ data: { tree: { sha: 't' } } });
    octokitMocks.createBlob.mockResolvedValue({ data: { sha: 'b' } });
    octokitMocks.createTree.mockResolvedValue({ data: { sha: 't' } });
    octokitMocks.createCommit.mockResolvedValue({ data: { sha: 'c' } });
    const conflict = Object.assign(new Error('conflict'), { status: 422 });
    octokitMocks.updateRef.mockRejectedValue(conflict);

    await expect(createCommitWithFiles({
      branch: 'main', message: 'm', files: [{ path: 'x.md', content: 'y' }],
    })).rejects.toThrow(/GITHUB_CONFLICT/);
  });
});

describe('getBlobContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('decodes base64 blob content', async () => {
    octokitMocks.getBlob.mockResolvedValueOnce({
      data: { content: Buffer.from('hello world', 'utf8').toString('base64'), encoding: 'base64' },
    });
    expect(await getBlobContent('sha-1')).toBe('hello world');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
npm test -- lib/github.test.ts
```
Expected: FAIL, module not found.

- [ ] **Step 3: 实现 github.ts**

Write `backend/lib/github.ts`：
```ts
import { Octokit } from '@octokit/rest';
import { env } from './env';

export class GithubConflictError extends Error {
  code = 'GITHUB_CONFLICT' as const;
  constructor(message = 'GitHub ref update conflict after retry') {
    super(message);
    this.name = 'GithubConflictError';
  }
}

let _client: Octokit | null = null;
export function getOctokit(): Octokit {
  if (!_client) {
    _client = new Octokit({ auth: env.GITHUB_BOT_TOKEN });
  }
  return _client;
}

export interface CommitFile {
  path: string;       // relative to repo root, e.g. 'projects/abc/02_Data/Script/x.md'
  content: string;    // utf-8 text only — binary goes to R2
}

export interface CommitResult {
  commit_sha: string;
  blobs: Record<string, string>;  // path -> blob sha
}

export async function getDefaultBranchHead(branch?: string): Promise<string> {
  const ref = `heads/${branch ?? env.GITHUB_DEFAULT_BRANCH}`;
  const { data } = await getOctokit().rest.git.getRef({
    owner: env.GITHUB_REPO_OWNER, repo: env.GITHUB_REPO_NAME, ref,
  });
  return data.object.sha;
}

async function performCommit(opts: {
  branch: string;
  message: string;
  files: CommitFile[];
}): Promise<CommitResult> {
  const ok = getOctokit();
  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;

  const headSha = await getDefaultBranchHead(opts.branch);
  const { data: parentCommit } = await ok.rest.git.getCommit({
    owner, repo, commit_sha: headSha,
  });

  const blobs: Record<string, string> = {};
  for (const file of opts.files) {
    const { data: blob } = await ok.rest.git.createBlob({
      owner, repo, content: file.content, encoding: 'utf-8',
    });
    blobs[file.path] = blob.sha;
  }

  const { data: tree } = await ok.rest.git.createTree({
    owner, repo,
    base_tree: parentCommit.tree.sha,
    tree: opts.files.map((f) => ({
      path: f.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blobs[f.path],
    })),
  });

  const { data: commit } = await ok.rest.git.createCommit({
    owner, repo,
    message: opts.message,
    tree: tree.sha,
    parents: [headSha],
  });

  await ok.rest.git.updateRef({
    owner, repo,
    ref: `heads/${opts.branch}`,
    sha: commit.sha,
  });

  return { commit_sha: commit.sha, blobs };
}

export async function createCommitWithFiles(opts: {
  branch?: string;
  message: string;
  files: CommitFile[];
}): Promise<CommitResult> {
  const branch = opts.branch ?? env.GITHUB_DEFAULT_BRANCH;
  try {
    return await performCommit({ branch, message: opts.message, files: opts.files });
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 422) {
      // Retry once with fresh HEAD
      try {
        return await performCommit({ branch, message: opts.message, files: opts.files });
      } catch (e2) {
        const err2 = e2 as { status?: number };
        if (err2.status === 422) {
          throw new GithubConflictError();
        }
        throw e2;
      }
    }
    throw e;
  }
}

export async function getBlobContent(sha: string): Promise<string> {
  const { data } = await getOctokit().rest.git.getBlob({
    owner: env.GITHUB_REPO_OWNER, repo: env.GITHUB_REPO_NAME, file_sha: sha,
  });
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return data.content;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
npm test -- lib/github.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/github.ts backend/lib/github.test.ts
git commit -m "feat(backend): GitHub Git Data API wrapper with retry-on-conflict"
```

---

## Task 6: lib/r2.ts

**Files:**
- Create: `backend/lib/r2.ts`
- Create: `backend/lib/r2.test.ts`

Spec reference: §3.2 R2 职责、§5.4 push 阶段 B、§6.6 R2 presigned URL。

- [ ] **Step 1: 写测试**

Write `backend/lib/r2.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const s3Mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));
const presignerMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = s3Mocks.send; },
  PutObjectCommand: class { constructor(public input: any) {} },
  GetObjectCommand: class { constructor(public input: any) {} },
  HeadObjectCommand: class { constructor(public input: any) {} },
  DeleteObjectCommand: class { constructor(public input: any) {} },
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: presignerMock.getSignedUrl,
}));

import { putObject, getPresignedDownloadUrl, headObject, deleteObject } from './r2';

describe('putObject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends PutObjectCommand with bucket + key + body', async () => {
    s3Mocks.send.mockResolvedValueOnce({ ETag: '"abc123"', VersionId: 'v1' });
    const r = await putObject({ key: 'a/b.png', body: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
    expect(r).toEqual({ etag: 'abc123', version_id: 'v1' });
    expect(s3Mocks.send).toHaveBeenCalledTimes(1);
    const arg = s3Mocks.send.mock.calls[0][0];
    expect(arg.input).toMatchObject({
      Bucket: 'fableglitch-assets-test',
      Key: 'a/b.png',
      ContentType: 'image/png',
    });
  });
});

describe('getPresignedDownloadUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns signed URL with given TTL', async () => {
    presignerMock.getSignedUrl.mockResolvedValueOnce('https://r2.example/signed?...');
    const url = await getPresignedDownloadUrl({ key: 'x.png', ttlSec: 900 });
    expect(url).toBe('https://r2.example/signed?...');
    expect(presignerMock.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.objectContaining({ Key: 'x.png' }) }),
      { expiresIn: 900 },
    );
  });
});

describe('headObject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns size and etag when present', async () => {
    s3Mocks.send.mockResolvedValueOnce({ ContentLength: 1234, ETag: '"e"' });
    expect(await headObject('k')).toEqual({ size_bytes: 1234, etag: 'e' });
  });

  it('returns null on NotFound', async () => {
    const err = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    s3Mocks.send.mockRejectedValueOnce(err);
    expect(await headObject('missing')).toBeNull();
  });
});

describe('deleteObject', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sends DeleteObjectCommand', async () => {
    s3Mocks.send.mockResolvedValueOnce({});
    await deleteObject('k');
    expect(s3Mocks.send).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
npm test -- lib/r2.test.ts
```
Expected: FAIL, module not found.

- [ ] **Step 3: 实现 r2.ts**

Write `backend/lib/r2.ts`：
```ts
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  HeadObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return _client;
}

function bucket(): string {
  return env.R2_BUCKET_NAME;
}

function stripQuotes(s?: string): string {
  return (s ?? '').replace(/^"|"$/g, '');
}

export async function putObject(opts: {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
}): Promise<{ etag: string; version_id?: string }> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: opts.key,
    Body: opts.body,
    ContentType: opts.contentType,
  });
  const out = await getS3Client().send(cmd);
  return { etag: stripQuotes(out.ETag), version_id: out.VersionId };
}

export async function getPresignedDownloadUrl(opts: {
  key: string;
  ttlSec: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: opts.key });
  return getSignedUrl(getS3Client(), cmd, { expiresIn: opts.ttlSec });
}

export async function headObject(key: string): Promise<{ size_bytes: number; etag: string } | null> {
  try {
    const cmd = new HeadObjectCommand({ Bucket: bucket(), Key: key });
    const out = await getS3Client().send(cmd);
    return {
      size_bytes: out.ContentLength ?? 0,
      etag: stripQuotes(out.ETag),
    };
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const cmd = new DeleteObjectCommand({ Bucket: bucket(), Key: key });
  await getS3Client().send(cmd);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
npm test -- lib/r2.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/r2.ts backend/lib/r2.test.ts
git commit -m "feat(backend): R2 S3 client (put/head/delete + presigned download)"
```

---

## Task 7: lib/idempotency.ts + lib/usage.ts + lib/compensation.ts

**Files:**
- Create: `backend/lib/idempotency.ts`
- Create: `backend/lib/idempotency.test.ts`
- Create: `backend/lib/usage.ts`
- Create: `backend/lib/usage.test.ts`
- Create: `backend/lib/compensation.ts`
- Create: `backend/lib/compensation.test.ts`

- [ ] **Step 1: 写测试 idempotency.test.ts**

Write `backend/lib/idempotency.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const supaMocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('./supabase-admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ maybeSingle: async () => supaMocks.select() }) }) }) }),
      insert: supaMocks.insert,
    }),
  }),
}));

import { lookupIdempotency, recordIdempotencySuccess } from './idempotency';

describe('lookupIdempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no row', async () => {
    supaMocks.select.mockResolvedValueOnce({ data: null, error: null });
    expect(await lookupIdempotency('key', 'user')).toBeNull();
  });

  it('returns cached result when found', async () => {
    supaMocks.select.mockResolvedValueOnce({
      data: { result_json: { x: 1 }, status: 'success' }, error: null,
    });
    const r = await lookupIdempotency('key', 'user');
    expect(r).toEqual({ status: 'success', result: { x: 1 } });
  });
});

describe('recordIdempotencySuccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a success row', async () => {
    supaMocks.insert.mockResolvedValueOnce({ error: null });
    await recordIdempotencySuccess('k', 'u', { foo: 'bar' });
    expect(supaMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      idempotency_key: 'k', user_id: 'u', status: 'success',
    }));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
npm test -- lib/idempotency.test.ts
```
Expected: FAIL.

- [ ] **Step 3: 实现 idempotency.ts**

Write `backend/lib/idempotency.ts`：
```ts
import { supabaseAdmin } from './supabase-admin';

export interface IdempotencyHit {
  status: 'success' | 'dead_letter';
  result: unknown;
}

export async function lookupIdempotency(
  key: string, userId: string,
): Promise<IdempotencyHit | null> {
  const { data, error } = await supabaseAdmin()
    .from('push_idempotency')
    .select('result_json,status')
    .eq('idempotency_key', key)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return { status: data.status as 'success' | 'dead_letter', result: data.result_json };
}

export async function recordIdempotencySuccess(
  key: string, userId: string, result: unknown,
): Promise<void> {
  await supabaseAdmin().from('push_idempotency').insert({
    idempotency_key: key,
    user_id: userId,
    result_json: result as object,
    status: 'success',
  });
}

export async function recordIdempotencyDeadLetter(
  key: string, userId: string, error: unknown,
): Promise<void> {
  await supabaseAdmin().from('push_idempotency').insert({
    idempotency_key: key,
    user_id: userId,
    result_json: { error: String(error) },
    status: 'dead_letter',
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
npm test -- lib/idempotency.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: 写 usage.test.ts**

Write `backend/lib/usage.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const insertSpy = vi.hoisted(() => vi.fn());
vi.mock('./supabase-admin', () => ({
  supabaseAdmin: () => ({ from: () => ({ insert: insertSpy }) }),
}));

import { logUsage } from './usage';

describe('logUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a row with all provided fields', async () => {
    insertSpy.mockResolvedValueOnce({ error: null });
    await logUsage({
      userId: 'u', provider: 'r2', action: 'upload', bytesTransferred: 1024,
      episodeId: 'ep', requestId: 'req-1',
    });
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u', provider: 'r2', action: 'upload',
      bytes_transferred: 1024, episode_id: 'ep', request_id: 'req-1',
    }));
  });

  it('swallows insert errors (must not block business flow)', async () => {
    insertSpy.mockResolvedValueOnce({ error: { message: 'db down' } });
    await expect(logUsage({ userId: 'u', provider: 'r2', action: 'upload' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: 跑确认失败 + 实现 usage.ts**

Run: `npm test -- lib/usage.test.ts`（FAIL）

Write `backend/lib/usage.ts`：
```ts
import { supabaseAdmin } from './supabase-admin';

export interface UsageEntry {
  userId: string;
  provider: 'github' | 'r2' | 'supabase' | 'openai' | 'anthropic' | 'nanobanana' | 'gptimage';
  model?: string;
  action: 'commit' | 'upload' | 'download' | 'chat' | 'image-gen' | 'misc';
  tokensInput?: number;
  tokensOutput?: number;
  bytesTransferred?: number;
  costUsd?: number;
  episodeId?: string;
  requestId?: string;
}

export async function logUsage(entry: UsageEntry): Promise<void> {
  const row = {
    user_id: entry.userId,
    provider: entry.provider,
    model: entry.model ?? null,
    action: entry.action,
    tokens_input: entry.tokensInput ?? null,
    tokens_output: entry.tokensOutput ?? null,
    bytes_transferred: entry.bytesTransferred ?? null,
    cost_usd: entry.costUsd ?? null,
    episode_id: entry.episodeId ?? null,
    request_id: entry.requestId ?? null,
  };
  const { error } = await supabaseAdmin().from('usage_logs').insert(row);
  if (error) {
    // Never throw — usage logging must not break business flow.
    // eslint-disable-next-line no-console
    console.warn('logUsage failed:', error.message);
  }
}
```

Run: `npm test -- lib/usage.test.ts` → 2 passed.

- [ ] **Step 7: 写 compensation.test.ts + compensation.ts**

Write `backend/lib/compensation.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const githubMock = vi.hoisted(() => ({ getRef: vi.fn(), getCommit: vi.fn(), createCommit: vi.fn(), updateRef: vi.fn() }));
const supaInsert = vi.hoisted(() => vi.fn());

vi.mock('@octokit/rest', () => ({
  Octokit: class { rest = { git: githubMock }; },
}));
vi.mock('./supabase-admin', () => ({
  supabaseAdmin: () => ({ from: () => ({ insert: supaInsert }) }),
}));

import { revertGithubCommit, markR2Orphans } from './compensation';

describe('revertGithubCommit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an empty revert commit on top of HEAD', async () => {
    githubMock.getRef.mockResolvedValueOnce({ data: { object: { sha: 'head' } } });
    githubMock.getCommit.mockResolvedValueOnce({ data: { tree: { sha: 'tree' }, parents: [{ sha: 'prev' }] } });
    githubMock.createCommit.mockResolvedValueOnce({ data: { sha: 'rev-sha' } });
    githubMock.updateRef.mockResolvedValueOnce({ data: {} });

    const sha = await revertGithubCommit('bad-commit', 'revert: failed push');
    expect(sha).toBe('rev-sha');
    expect(githubMock.createCommit).toHaveBeenCalledWith(expect.objectContaining({
      message: 'revert: failed push',
      tree: 'tree',  // tree of the commit being reverted's PARENT — see below
    }));
  });
});

describe('markR2Orphans', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts one row per orphan key', async () => {
    supaInsert.mockResolvedValue({ error: null });
    await markR2Orphans([{ key: 'a', bytes: 100 }, { key: 'b', bytes: 200 }], 'push aborted');
    expect(supaInsert).toHaveBeenCalledTimes(2);
  });
});
```

Run: `npm test -- lib/compensation.test.ts`（FAIL）

Write `backend/lib/compensation.ts`：
```ts
import { Octokit } from '@octokit/rest';
import { env } from './env';
import { supabaseAdmin } from './supabase-admin';

let _ok: Octokit | null = null;
function octo() {
  if (!_ok) _ok = new Octokit({ auth: env.GITHUB_BOT_TOKEN });
  return _ok;
}

/** Creates a "revert" commit that resets the tree to badCommit's parent. */
export async function revertGithubCommit(badCommitSha: string, message: string): Promise<string> {
  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;
  const branch = env.GITHUB_DEFAULT_BRANCH;

  const { data: badCommit } = await octo().rest.git.getCommit({ owner, repo, commit_sha: badCommitSha });
  const parentSha = badCommit.parents[0]?.sha;
  if (!parentSha) throw new Error('Cannot revert root commit');
  const { data: parentCommit } = await octo().rest.git.getCommit({ owner, repo, commit_sha: parentSha });

  const { data: head } = await octo().rest.git.getRef({ owner, repo, ref: `heads/${branch}` });

  const { data: revertCommit } = await octo().rest.git.createCommit({
    owner, repo, message, tree: parentCommit.tree.sha, parents: [head.object.sha],
  });
  await octo().rest.git.updateRef({
    owner, repo, ref: `heads/${branch}`, sha: revertCommit.sha,
  });
  return revertCommit.sha;
}

export async function markR2Orphans(
  orphans: { key: string; bytes?: number }[],
  reason: string,
): Promise<void> {
  for (const o of orphans) {
    await supabaseAdmin().from('r2_orphans').insert({
      storage_ref: o.key, bytes: o.bytes ?? null, reason,
    });
  }
}
```

Run: `npm test -- lib/compensation.test.ts` → 2 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/lib/idempotency.ts backend/lib/idempotency.test.ts \
        backend/lib/usage.ts backend/lib/usage.test.ts \
        backend/lib/compensation.ts backend/lib/compensation.test.ts
git commit -m "feat(backend): idempotency, usage logging, and compensation helpers"
```

---

## Task 8: GET /api/tree

**Files:**
- Create: `backend/app/api/tree/route.ts`
- Create: `backend/app/api/tree/route.test.ts`

Spec reference: §5.2、§6.2 Step 1。

设计：一次查询用 Supabase REST 嵌套 select 把 4 层一次拉完，按 series → albums → contents → episodes 嵌套返回。`asset_count_pushed` 用 episode_id → assets 子查询统计。

- [ ] **Step 1: 写测试**

Write `backend/app/api/tree/route.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectSeries: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ order: () => mocks.selectSeries() }) }),
  }),
}));

import { GET } from './route';

describe('GET /api/tree', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/tree'));
    expect(res.status).toBe(401);
  });

  it('200 returns nested tree', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u', email: 'a@beva.com' } }, error: null });
    mocks.selectSeries.mockResolvedValueOnce({
      data: [{
        id: 's1', name_cn: '童话剧',
        albums: [{
          id: 'a1', name_cn: 'NA',
          contents: [{
            id: 'c1', name_cn: '侏儒怪',
            episodes: [{
              id: 'e1', name_cn: '侏儒怪 第一集', status: 'drafting',
              updated_at: '2026-04-27T00:00:00Z', episode_path: '童话剧_NA_侏儒怪',
              assets: [{ count: 5 }],
            }],
          }],
        }],
      }],
      error: null,
    });
    const res = await GET(new Request('http://localhost/api/tree', {
      headers: { authorization: 'Bearer t' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.series).toHaveLength(1);
    expect(body.data.series[0].albums[0].contents[0].episodes[0].asset_count_pushed).toBe(5);
  });
});
```

- [ ] **Step 2: 跑测试确认失败 + 实现**

Run: `npm test -- app/api/tree/route.test.ts`（FAIL）

Write `backend/app/api/tree/route.ts`：
```ts
export const runtime = 'edge';

import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RawEpisode {
  id: string; name_cn: string; status: string; updated_at: string; episode_path: string;
  assets: { count: number }[];
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { data, error } = await supabaseAdmin()
    .from('series')
    .select(`
      id, name_cn,
      albums (
        id, name_cn,
        contents (
          id, name_cn,
          episodes (
            id, name_cn, status, updated_at, episode_path,
            assets ( count )
          )
        )
      )
    `)
    .order('name_cn');

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  // Flatten the assets count
  const series = (data ?? []).map((s) => ({
    ...s,
    albums: s.albums.map((a: any) => ({
      ...a,
      contents: a.contents.map((c: any) => ({
        ...c,
        episodes: (c.episodes as RawEpisode[]).map((e) => ({
          id: e.id, name_cn: e.name_cn, status: e.status,
          updated_at: e.updated_at, episode_path: e.episode_path,
          asset_count_pushed: e.assets?.[0]?.count ?? 0,
        })),
      })),
    })),
  }));

  return ok({ series });
}
```

⚠️ Supabase 的嵌套 count 需要在 `assets` 表上建 RLS 让 authenticated 能看 `count`，或者改用 `assets!inner(count)` 显式 inner join。先按上述写，integration test 跑通后若不正确再调。

Run: `npm test -- app/api/tree/route.test.ts` → 2 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/tree/
git commit -m "feat(backend): GET /api/tree (nested 4-level project tree)"
```

---

## Task 9: POST /api/episodes

**Files:**
- Create: `backend/app/api/episodes/route.ts`
- Create: `backend/app/api/episodes/route.test.ts`

Spec reference: §5.3、§6.2 Step 4-6。

副作用：
1. series/album/content 缺则建（事务）
2. 用 §9.E 规范化 episode_path
3. insert episodes
4. GitHub 一次 commit 推 7 个骨架文件 + README
5. R2 占位 binary 子目录的 .keep（可异步，失败不影响主流程）

- [ ] **Step 1: 写测试**

Write `backend/app/api/episodes/route.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsertSeries: vi.fn(), upsertAlbum: vi.fn(), upsertContent: vi.fn(),
  insertEpisode: vi.fn(),
  selectUserDisplay: vi.fn(),
  createCommit: vi.fn(),
  putR2: vi.fn(async () => ({ etag: 'e' })),
  logUsage: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'series') return { upsert: () => ({ select: () => ({ single: async () => mocks.upsertSeries() }) }) };
      if (table === 'albums') return { upsert: () => ({ select: () => ({ single: async () => mocks.upsertAlbum() }) }) };
      if (table === 'contents') return { upsert: () => ({ select: () => ({ single: async () => mocks.upsertContent() }) }) };
      if (table === 'episodes') return { insert: () => ({ select: () => ({ single: async () => mocks.insertEpisode() }) }) };
      if (table === 'users') return { select: () => ({ eq: () => ({ single: async () => mocks.selectUserDisplay() }) }) };
      return {};
    },
  }),
}));
vi.mock('@/lib/github', () => ({
  createCommitWithFiles: mocks.createCommit,
  GithubConflictError: class extends Error { code = 'GITHUB_CONFLICT' as const; },
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
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@beva.com' } }, error: null });
    mocks.selectUserDisplay.mockResolvedValue({ data: { display_name: '乐美林' }, error: null });
    mocks.upsertSeries.mockResolvedValue({ data: { id: 's1' }, error: null });
    mocks.upsertAlbum.mockResolvedValue({ data: { id: 'a1' }, error: null });
    mocks.upsertContent.mockResolvedValue({ data: { id: 'c1' }, error: null });
    mocks.insertEpisode.mockResolvedValue({
      data: { id: 'e1', name_cn: '侏儒怪', status: 'drafting', episode_path: '童话剧_NA_侏儒怪', created_at: '...' },
      error: null,
    });
    mocks.createCommit.mockResolvedValue({ commit_sha: 'sha-1', blobs: {} });
  });

  it('401 without token', async () => {
    const res = await POST(new Request('http://localhost/api/episodes', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('400 on missing fields', async () => {
    const res = await POST(makeReq({ series_name_cn: '童话剧' }));
    expect(res.status).toBe(400);
  });

  it('201 creates episode + GitHub commit + R2 placeholders', async () => {
    const res = await POST(makeReq({
      series_name_cn: '童话剧', album_name_cn: 'NA',
      content_name_cn: '侏儒怪', episode_name_cn: '侏儒怪 第一集',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.episode.episode_path).toBe('童话剧_NA_侏儒怪');
    expect(body.data.github_commit_sha).toBe('sha-1');
    expect(mocks.createCommit).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
    // R2 occupies at least 4 binary subdirs
    expect(mocks.putR2.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('409 when episode_name unique constraint hits', async () => {
    mocks.insertEpisode.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'unique violation' } });
    const res = await POST(makeReq({
      series_name_cn: '童话剧', album_name_cn: 'NA',
      content_name_cn: '侏儒怪', episode_name_cn: 'dup',
    }));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: 实现 episodes/route.ts**

Run: `npm test -- app/api/episodes/route.test.ts`（FAIL）

Write `backend/app/api/episodes/route.ts`：
```ts
export const runtime = 'nodejs';
export const maxDuration = 30;

import { z } from 'zod';
import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { composeEpisodePath, normalize } from '@/lib/filename-resolver';
import { createCommitWithFiles, GithubConflictError } from '@/lib/github';
import { putObject } from '@/lib/r2';
import { logUsage } from '@/lib/usage';

const bodySchema = z.object({
  series_name_cn: z.string().trim().min(1),
  album_name_cn: z.string().trim().min(1),
  content_name_cn: z.string().trim().min(1),
  episode_name_cn: z.string().trim().min(1),
});

const SKELETON_DIRS = [
  '01_Project',
  '02_Data/Script',
  '02_Data/Prompt/Image',
  '02_Data/Prompt/Video',
  '03_Export',
  '04_Feedback',
  '05_Deliver',
];

const R2_PLACEHOLDER_DIRS = (episode: string) => [
  `02_Data/Shot/${episode}/Images`,
  `02_Data/Shot/${episode}/Videos`,
  '02_Data/Assets/Characters',
  '02_Data/Assets/Props',
  '02_Data/Assets/Scenes',
];

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return err('PAYLOAD_MALFORMED', parsed.error.issues[0].message, undefined, 400);
  }
  const { series_name_cn, album_name_cn, content_name_cn, episode_name_cn } = parsed.data;

  const admin = supabaseAdmin();
  let episodePath: string;
  try {
    episodePath = composeEpisodePath({
      series: series_name_cn, album: album_name_cn, content: content_name_cn,
    });
  } catch {
    return err('PAYLOAD_MALFORMED', 'Names contain only illegal characters', undefined, 400);
  }
  const episodeNormalized = normalize(episode_name_cn);

  // 1. upsert series
  const { data: series, error: e1 } = await admin
    .from('series')
    .upsert({ name_cn: series_name_cn, created_by: auth.user_id }, { onConflict: 'name_cn' })
    .select('id').single();
  if (e1 || !series) return err('INTERNAL_ERROR', e1?.message ?? 'series upsert failed', undefined, 500);

  // 2. upsert album
  const { data: album, error: e2 } = await admin
    .from('albums')
    .upsert({ series_id: series.id, name_cn: album_name_cn, created_by: auth.user_id },
      { onConflict: 'series_id,name_cn' })
    .select('id').single();
  if (e2 || !album) return err('INTERNAL_ERROR', e2?.message ?? 'album upsert failed', undefined, 500);

  // 3. upsert content
  const { data: content, error: e3 } = await admin
    .from('contents')
    .upsert({ album_id: album.id, name_cn: content_name_cn, created_by: auth.user_id },
      { onConflict: 'album_id,name_cn' })
    .select('id').single();
  if (e3 || !content) return err('INTERNAL_ERROR', e3?.message ?? 'content upsert failed', undefined, 500);

  // 4. insert episode
  const { data: episode, error: e4 } = await admin
    .from('episodes')
    .insert({
      content_id: content.id,
      name_cn: episode_name_cn,
      episode_path: episodePath,
      created_by: auth.user_id,
    }).select('id,name_cn,status,episode_path,created_at').single();
  if (e4 || !episode) {
    if (e4?.code === '23505') {
      return err('PAYLOAD_MALFORMED', 'Episode name already exists', undefined, 409);
    }
    return err('INTERNAL_ERROR', e4?.message ?? 'episode insert failed', undefined, 500);
  }

  // 5. lookup display_name for commit message
  const { data: userRow } = await admin
    .from('users').select('display_name').eq('id', auth.user_id).single();
  const displayName = userRow?.display_name ?? 'unknown';

  // 6. GitHub commit (skeleton + README)
  const readme = `# ${episode_name_cn}\n\n- 系列：${series_name_cn}\n- 专辑：${album_name_cn}\n- 内容：${content_name_cn}\n- 创建者：${displayName}\n- 创建时间：${episode.created_at}\n`;
  const skeletonFiles = [
    ...SKELETON_DIRS.map((d) => ({ path: `${episodePath}/${d}/.gitkeep`, content: '' })),
    { path: `${episodePath}/README.md`, content: readme },
  ];
  let commitSha: string | null = null;
  try {
    const result = await createCommitWithFiles({
      message: `chore(${episode_name_cn}): init skeleton by ${displayName}`,
      files: skeletonFiles,
    });
    commitSha = result.commit_sha;
    await logUsage({ userId: auth.user_id, provider: 'github', action: 'commit', episodeId: episode.id });
  } catch (e) {
    // Roll back episode row + parent if newly created — keep simple: just delete episode, leave parents
    await admin.from('episodes').delete().eq('id', episode.id);
    if (e instanceof GithubConflictError) {
      return err('INTERNAL_ERROR', 'GitHub conflict on skeleton commit; please retry', undefined, 502);
    }
    return err('INTERNAL_ERROR', `GitHub error: ${(e as Error).message}`, undefined, 502);
  }

  // 7. R2 placeholders (best-effort; failure logged but doesn't fail the request)
  let r2Created = true;
  for (const dir of R2_PLACEHOLDER_DIRS(episodeNormalized)) {
    try {
      await putObject({
        key: `${episodePath}/${dir}/.keep`,
        body: new Uint8Array(0),
        contentType: 'application/octet-stream',
      });
      await logUsage({ userId: auth.user_id, provider: 'r2', action: 'upload', bytesTransferred: 0, episodeId: episode.id });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`R2 placeholder failed for ${dir}:`, (e as Error).message);
      r2Created = false;
    }
  }

  return ok({
    episode,
    github_commit_sha: commitSha,
    r2_prefix_created: r2Created,
  }, 201);
}
```

Run: `npm test -- app/api/episodes/route.test.ts` → 4 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/episodes/
git commit -m "feat(backend): POST /api/episodes (skeleton commit + R2 placeholders)"
```

---

## Task 10: GET /api/episodes/[id]

**Files:**
- Create: `backend/app/api/episodes/[id]/route.ts`
- Create: `backend/app/api/episodes/[id]/route.test.ts`

Spec reference: §5.3 GET 部分。

- [ ] **Step 1: 写测试 + 实现**

Write `backend/app/api/episodes/[id]/route.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => mocks.select() }) }) }),
  }),
}));

import { GET } from './route';

describe('GET /api/episodes/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 without token', async () => {
    const ctx = { params: Promise.resolve({ id: 'e1' }) };
    const res = await GET(new Request('http://x/api/episodes/e1'), ctx);
    expect(res.status).toBe(401);
  });

  it('200 returns episode + counts', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null });
    mocks.select.mockResolvedValueOnce({
      data: {
        id: 'e1', name_cn: '侏儒怪', status: 'drafting',
        episode_path: '童话剧_NA_侏儒怪',
        contents: { name_cn: '侏儒怪', albums: { name_cn: 'NA', series: { name_cn: '童话剧' } } },
        created_by_user: { display_name: '乐美林' },
        created_at: '...', updated_at: '...',
      }, error: null,
    });
    const ctx = { params: Promise.resolve({ id: 'e1' }) };
    const res = await GET(new Request('http://x/api/episodes/e1', { headers: { authorization: 'Bearer t' } }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.episode.series_name).toBe('童话剧');
  });
});
```

Run: `npm test -- app/api/episodes/\[id\]/route.test.ts`（FAIL）

Write `backend/app/api/episodes/[id]/route.ts`：
```ts
export const runtime = 'edge';

import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin()
    .from('episodes')
    .select(`
      id, name_cn, status, episode_path, created_at, updated_at,
      contents:content_id ( name_cn, albums:album_id ( name_cn, series:series_id ( name_cn ) ) ),
      created_by_user:created_by ( display_name )
    `)
    .eq('id', id).single();

  if (error || !data) {
    return err('INTERNAL_ERROR', error?.message ?? 'not found', undefined, 404);
  }

  // Counts by type — separate query
  const { data: counts } = await supabaseAdmin()
    .from('assets')
    .select('type_code,status')
    .eq('episode_id', id);

  const countsByType: Record<string, { pushed: number; superseded: number }> = {};
  for (const a of counts ?? []) {
    if (!countsByType[a.type_code]) countsByType[a.type_code] = { pushed: 0, superseded: 0 };
    if (a.status === 'pushed') countsByType[a.type_code].pushed++;
    if (a.status === 'superseded') countsByType[a.type_code].superseded++;
  }

  const c = data as any;
  return ok({
    episode: {
      id: c.id, name_cn: c.name_cn, status: c.status, episode_path: c.episode_path,
      content_name: c.contents?.name_cn, album_name: c.contents?.albums?.name_cn,
      series_name: c.contents?.albums?.series?.name_cn,
      created_by_name: c.created_by_user?.display_name,
      created_at: c.created_at, updated_at: c.updated_at,
    },
    counts: { by_type: countsByType },
  });
}
```

Run: `npm test -- app/api/episodes/\[id\]/route.test.ts` → 2 passed.

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/episodes/\[id\]/
git commit -m "feat(backend): GET /api/episodes/:id (with parent names + asset counts)"
```

---

## Task 11: POST /api/assets/preview-filename + check-collision

**Files:**
- Create: `backend/app/api/assets/preview-filename/route.ts`
- Create: `backend/app/api/assets/preview-filename/route.test.ts`
- Create: `backend/app/api/assets/check-collision/route.ts`
- Create: `backend/app/api/assets/check-collision/route.test.ts`

Spec reference: §5.4 preview-filename + check-collision。

- [ ] **Step 1: 写测试 + 实现 preview-filename**

Write `backend/app/api/assets/preview-filename/route.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectAssetType: vi.fn(),
  selectEpisode: vi.fn(),
  selectCollision: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'asset_types') return { select: () => ({ eq: () => ({ single: async () => mocks.selectAssetType() }) }) };
      if (table === 'episodes') return { select: () => ({ eq: () => ({ single: async () => mocks.selectEpisode() }) }) };
      if (table === 'assets') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => mocks.selectCollision() }) }) }) }) };
      return {};
    },
  }),
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://x/api/assets/preview-filename', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/assets/preview-filename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  });

  it('returns final_filename + storage_ref for SCRIPT', async () => {
    mocks.selectAssetType.mockResolvedValueOnce({
      data: {
        code: 'SCRIPT', folder_path: '02_Data/Script',
        filename_tpl: '{series}_{content}_SCRIPT', storage_ext: '.md', storage_backend: 'github',
      }, error: null,
    });
    mocks.selectEpisode.mockResolvedValueOnce({
      data: {
        episode_path: '童话剧_NA_侏儒怪', name_cn: '侏儒怪 第一集',
        contents: { name_cn: '侏儒怪', albums: { name_cn: 'NA', series: { name_cn: '童话剧' } } },
      }, error: null,
    });
    mocks.selectCollision.mockResolvedValueOnce({ data: null, error: null });

    const res = await POST(makeReq({ episode_id: 'e1', type_code: 'SCRIPT', name: '侏儒怪' }));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.data.final_filename).toBe('童话剧_侏儒怪_SCRIPT.md');
    expect(b.data.storage_ref).toBe('童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md');
    expect(b.data.storage_backend).toBe('github');
  });

  it('400 when keep_as_is needs originalFilename but absent', async () => {
    mocks.selectAssetType.mockResolvedValueOnce({
      data: {
        code: 'CHAR', folder_path: '02_Data/Assets/Characters',
        filename_tpl: '{content}_CHAR_{name}_{variant}_v{version:03}',
        storage_ext: 'keep_as_is', storage_backend: 'r2',
      }, error: null,
    });
    mocks.selectEpisode.mockResolvedValueOnce({
      data: {
        episode_path: '童话剧_NA_侏儒怪', name_cn: '侏儒怪',
        contents: { name_cn: '侏儒怪', albums: { name_cn: 'NA', series: { name_cn: '童话剧' } } },
      }, error: null,
    });

    const res = await POST(makeReq({ episode_id: 'e1', type_code: 'CHAR', name: '主角', version: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
  });

  it('returns collision when filename already pushed', async () => {
    mocks.selectAssetType.mockResolvedValueOnce({
      data: {
        code: 'SCRIPT', folder_path: '02_Data/Script',
        filename_tpl: '{series}_{content}_SCRIPT', storage_ext: '.md', storage_backend: 'github',
      }, error: null,
    });
    mocks.selectEpisode.mockResolvedValueOnce({
      data: {
        episode_path: '童话剧_NA_侏儒怪', name_cn: '侏儒怪',
        contents: { name_cn: '侏儒怪', albums: { name_cn: 'NA', series: { name_cn: '童话剧' } } },
      }, error: null,
    });
    mocks.selectCollision.mockResolvedValueOnce({
      data: { id: 'a1', version: 1 }, error: null,
    });

    const res = await POST(makeReq({ episode_id: 'e1', type_code: 'SCRIPT', name: '侏儒怪' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.collision).toEqual({ existing_asset_id: 'a1', existing_version: 1 });
  });
});
```

Run: `npm test -- app/api/assets/preview-filename/route.test.ts`（FAIL）

Write `backend/app/api/assets/preview-filename/route.ts`：
```ts
export const runtime = 'edge';

import { z } from 'zod';
import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveFilename, OriginalFilenameRequiredError, MissingTemplateVarError } from '@/lib/filename-resolver';
import { composeFolderPath, composeFullStorageRef } from '@/lib/path';

const bodySchema = z.object({
  episode_id: z.uuid(),
  type_code: z.string().min(1),
  name: z.string().optional(),
  variant: z.string().optional(),
  number: z.number().int().nonnegative().optional(),
  version: z.number().int().min(1).default(1),
  stage: z.enum(['ROUGH', 'REVIEW', 'FINAL']).default('ROUGH'),
  language: z.string().regex(/^[A-Z]{2}$/).default('ZH'),
  original_filename: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err('PAYLOAD_MALFORMED', parsed.error.issues[0].message, undefined, 400);

  const admin = supabaseAdmin();

  const { data: at, error: atErr } = await admin.from('asset_types')
    .select('code,folder_path,filename_tpl,storage_ext,storage_backend')
    .eq('code', parsed.data.type_code).single();
  if (atErr || !at) return err('PAYLOAD_MALFORMED', `unknown type_code ${parsed.data.type_code}`, undefined, 400);

  const { data: ep, error: epErr } = await admin.from('episodes')
    .select(`episode_path, name_cn,
      contents:content_id ( name_cn, albums:album_id ( name_cn, series:series_id ( name_cn ) ) )`)
    .eq('id', parsed.data.episode_id).single();
  if (epErr || !ep) return err('PAYLOAD_MALFORMED', 'episode not found', undefined, 404);
  const epAny = ep as any;

  let final_filename: string;
  try {
    final_filename = resolveFilename({
      template: at.filename_tpl,
      series: epAny.contents?.albums?.series?.name_cn,
      album:  epAny.contents?.albums?.name_cn,
      content: epAny.contents?.name_cn,
      episode: epAny.name_cn,
      name: parsed.data.name,
      variant: parsed.data.variant,
      number: parsed.data.number,
      version: parsed.data.version,
      language: parsed.data.language,
      storageExt: at.storage_ext,
      originalFilename: parsed.data.original_filename,
    });
  } catch (e) {
    if (e instanceof OriginalFilenameRequiredError) {
      return err('PAYLOAD_MALFORMED', e.message, { code: e.code }, 400);
    }
    if (e instanceof MissingTemplateVarError) {
      return err('PAYLOAD_MALFORMED', e.message, { code: e.code }, 400);
    }
    return err('PAYLOAD_MALFORMED', (e as Error).message, undefined, 400);
  }

  const folderPath = composeFolderPath({
    template: at.folder_path,
    episode: epAny.name_cn,
    content: epAny.contents?.name_cn,
  });
  const storage_ref = composeFullStorageRef({
    episodePath: epAny.episode_path,
    folderPath,
    finalFilename: final_filename,
  });

  // collision lookup
  const { data: collision } = await admin.from('assets')
    .select('id,version')
    .eq('episode_id', parsed.data.episode_id)
    .eq('final_filename', final_filename)
    .eq('status', 'pushed')
    .maybeSingle();

  return ok({
    final_filename,
    storage_backend: at.storage_backend,
    storage_ref,
    collision: collision ? { existing_asset_id: collision.id, existing_version: collision.version } : undefined,
  });
}
```

Run: `npm test -- app/api/assets/preview-filename/route.test.ts` → 3 passed.

- [ ] **Step 2: 写 check-collision 路由**

Write `backend/app/api/assets/check-collision/route.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => mocks.select() }) }) }) }) }),
  }),
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://x/api/assets/check-collision', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/assets/check-collision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  });

  it('returns existing when collision', async () => {
    mocks.select.mockResolvedValueOnce({
      data: {
        id: 'a1', version: 2, pushed_at: '...',
        author:{ display_name: '林' },
      }, error: null,
    });
    const res = await POST(makeReq({ episode_id: 'e1', final_filename: 'x.md' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.existing.id).toBe('a1');
  });

  it('returns existing undefined when no collision', async () => {
    mocks.select.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(makeReq({ episode_id: 'e1', final_filename: 'x.md' }));
    expect((await res.json()).data.existing).toBeUndefined();
  });
});
```

Write `backend/app/api/assets/check-collision/route.ts`：
```ts
export const runtime = 'edge';

import { z } from 'zod';
import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const bodySchema = z.object({
  episode_id: z.uuid(),
  final_filename: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err('PAYLOAD_MALFORMED', parsed.error.issues[0].message, undefined, 400);

  const { data } = await supabaseAdmin()
    .from('assets')
    .select('id,version,pushed_at,author:author_id(display_name)')
    .eq('episode_id', parsed.data.episode_id)
    .eq('final_filename', parsed.data.final_filename)
    .eq('status', 'pushed')
    .maybeSingle();

  if (!data) return ok({});
  return ok({
    existing: {
      id: (data as any).id, version: (data as any).version,
      author_name: (data as any).author?.display_name,
      pushed_at: (data as any).pushed_at,
    },
  });
}
```

Run: `npm test -- app/api/assets/check-collision/route.test.ts` → 2 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/assets/preview-filename/ backend/app/api/assets/check-collision/
git commit -m "feat(backend): preview-filename + check-collision endpoints"
```

---

## Task 12: POST /api/assets/push（核心多阶段路由）

**Files:**
- Create: `backend/app/api/assets/push/route.ts`
- Create: `backend/app/api/assets/push/route.test.ts`

Spec reference: §5.4 push（multipart, idempotency, 三阶段补偿）、§6.5 后端阶段 A/B/C。

**实现策略**：
1. 解析 multipart：先校验 `idempotency_key` 命中缓存 → 直接返回
2. 校验所有 items：cross-episode、size caps、duplicate IDs、文件存在
3. 按 storage_backend 分组：text → R2 binary → metadata
4. **阶段 A**：所有 text items 一次 GitHub commit（GithubConflictError → 重试 1 次 → 仍冲突返回 409）
5. **阶段 B**：每个 binary item 单独 R2 PutObject（任一失败 → revert GitHub commit + mark R2 orphans + 返回 502）
6. **阶段 C**：Supabase 事务插入 assets 行（含 supersede 链）、touch episode updated_at、log usage、record idempotency
7. 阶段 C 失败：尝试 3 次重试 → 仍失败写 dead_letter，返回 502

由于 Edge Runtime 不能解析 multipart 大 body，本路由必须 `runtime = 'nodejs'`。

- [ ] **Step 1: 写 unit 测试（mock 全部依赖）**

Write `backend/app/api/assets/push/route.test.ts`：

测试用例（共 8 个）：
1. 401 without token
2. 400 PAYLOAD_MALFORMED on bad JSON
3. 400 ITEM_FILE_MISSING when item declared but no file part
4. 400 FILE_TOO_LARGE when single > 50MB
5. 400 CROSS_EPISODE on multi-episode payload
6. 200 IDEMPOTENT_REPLAY when key already cached
7. 201 happy path: 1 SCRIPT (text) + 1 CHAR (image) succeeds, returns mixed
8. 502 GITHUB_CONFLICT after retry exhausted

测试代码框架：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  lookupIdem: vi.fn(),
  recordIdemSuccess: vi.fn(async () => {}),
  recordIdemDead: vi.fn(async () => {}),
  selectAssetType: vi.fn(),
  selectEpisode: vi.fn(),
  insertAssets: vi.fn(),
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
        return { select: () => ({ in: () => ({ then: (fn: any) => fn(mocks.selectAssetType()) }) }) };
      }
      if (table === 'episodes') {
        return {
          select: () => ({ eq: () => ({ single: async () => mocks.selectEpisode() }) }),
          update: () => ({ eq: async () => mocks.updateEpisode() }),
        };
      }
      if (table === 'assets') {
        return { insert: () => ({ select: async () => mocks.insertAssets() }) };
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
  GithubConflictError: class extends Error { code = 'GITHUB_CONFLICT' as const; },
}));
vi.mock('@/lib/r2', () => ({ putObject: mocks.putR2 }));
vi.mock('@/lib/usage', () => ({ logUsage: mocks.logUsage }));
vi.mock('@/lib/compensation', () => ({
  revertGithubCommit: mocks.revertCommit,
  markR2Orphans: mocks.markOrphans,
}));

import { POST } from './route';

function makeMultipart(payload: object, files: Record<string, { content: string | Uint8Array; type: string }>) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  for (const [name, file] of Object.entries(files)) {
    fd.append(name, new Blob([file.content], { type: file.type }));
  }
  return new Request('http://x/api/assets/push', {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: fd,
  });
}

describe('POST /api/assets/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mocks.lookupIdem.mockResolvedValue(null);
    mocks.selectAssetType.mockResolvedValue({
      data: [
        { code: 'SCRIPT', folder_path: '02_Data/Script', filename_tpl: '{series}_{content}_SCRIPT', storage_ext: '.md', storage_backend: 'github' },
        { code: 'CHAR', folder_path: '02_Data/Assets/Characters', filename_tpl: '{content}_CHAR_{name}_{variant}_v{version:03}', storage_ext: 'keep_as_is', storage_backend: 'r2' },
      ], error: null,
    });
    mocks.selectEpisode.mockResolvedValue({
      data: {
        episode_path: '童话剧_NA_侏儒怪', name_cn: '侏儒怪',
        contents: { name_cn: '侏儒怪', albums: { name_cn: 'NA', series: { name_cn: '童话剧' } } },
      }, error: null,
    });
    mocks.createCommit.mockResolvedValue({ commit_sha: 'commit-1', blobs: { 'p': 'b1' } });
    mocks.putR2.mockResolvedValue({ etag: 'e' });
    mocks.insertAssets.mockResolvedValue({
      data: [{ id: 'asset-1' }, { id: 'asset-2' }], error: null,
    });
  });

  it('401 without token', async () => {
    const res = await POST(new Request('http://x/api/assets/push', { method: 'POST', body: 'x' }));
    expect(res.status).toBe(401);
  });

  it('200 IDEMPOTENT_REPLAY when key already cached', async () => {
    mocks.lookupIdem.mockResolvedValueOnce({ status: 'success', result: { commit_sha: 'cached', assets: [] } });
    const req = makeMultipart({ idempotency_key: 'k1', commit_message: 'm', items: [] }, {});
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ commit_sha: 'cached', assets: [] });
    expect(mocks.createCommit).not.toHaveBeenCalled();
  });

  // ... 6 more cases for happy path, FILE_TOO_LARGE, CROSS_EPISODE, ITEM_FILE_MISSING, GITHUB_CONFLICT after retry, R2 fail compensation
});
```

完整 8 个用例的测试代码因长度原因省略——执行时按上述模式扩展，每个 case 单独一个 `it()`。

- [ ] **Step 2: 实现 push/route.ts**

Run: `npm test -- app/api/assets/push/route.test.ts`（FAIL）

Write `backend/app/api/assets/push/route.ts`：
```ts
export const runtime = 'nodejs';
export const maxDuration = 60;

import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  lookupIdempotency, recordIdempotencySuccess, recordIdempotencyDeadLetter,
} from '@/lib/idempotency';
import { createCommitWithFiles, GithubConflictError } from '@/lib/github';
import { putObject } from '@/lib/r2';
import { logUsage } from '@/lib/usage';
import { revertGithubCommit, markR2Orphans } from '@/lib/compensation';
import { resolveFilename } from '@/lib/filename-resolver';
import { composeFolderPath, composeFullStorageRef } from '@/lib/path';

const SINGLE_FILE_MAX = 50 * 1024 * 1024;     // 50 MB
const TOTAL_BATCH_MAX = 200 * 1024 * 1024;    // 200 MB
const ITEM_COUNT_MAX = 20;

interface PushItem {
  local_draft_id: string;
  episode_id: string;
  type_code: string;
  name?: string;
  variant?: string;
  number?: number;
  version: number;
  stage: 'ROUGH' | 'REVIEW' | 'FINAL';
  language: string;
  source: 'imported' | 'pasted' | 'ai-generated';
  original_filename?: string;
  mime_type: string;
  size_bytes: number;
}

interface PushPayload {
  idempotency_key: string;
  commit_message: string;
  items: PushItem[];
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Parse multipart
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return err('PAYLOAD_MALFORMED', 'multipart/form-data parse failed', undefined, 400); }

  const payloadStr = formData.get('payload');
  if (typeof payloadStr !== 'string') {
    return err('PAYLOAD_MALFORMED', 'payload field missing or not text', undefined, 400);
  }
  let payload: PushPayload;
  try { payload = JSON.parse(payloadStr); }
  catch { return err('PAYLOAD_MALFORMED', 'payload JSON invalid', undefined, 400); }

  if (!payload.idempotency_key || !Array.isArray(payload.items)) {
    return err('PAYLOAD_MALFORMED', 'payload shape invalid', undefined, 400);
  }
  if (payload.items.length === 0) {
    return err('PAYLOAD_MALFORMED', 'items must not be empty', undefined, 400);
  }
  if (payload.items.length > ITEM_COUNT_MAX) {
    return err('PAYLOAD_MALFORMED', `at most ${ITEM_COUNT_MAX} items`, undefined, 400);
  }

  // Idempotency check
  const cached = await lookupIdempotency(payload.idempotency_key, auth.user_id);
  if (cached?.status === 'success') {
    return ok(cached.result, 200);
  }

  // Validate cross-episode + duplicate ids + file presence + size
  const episodeIds = new Set(payload.items.map((i) => i.episode_id));
  if (episodeIds.size > 1) {
    return err('PAYLOAD_MALFORMED', 'all items must share one episode_id', { code: 'CROSS_EPISODE' }, 400);
  }
  const draftIds = new Set<string>();
  for (const it of payload.items) {
    if (draftIds.has(it.local_draft_id)) {
      return err('PAYLOAD_MALFORMED', `duplicate local_draft_id ${it.local_draft_id}`, { code: 'DUPLICATE_DRAFT_ID' }, 400);
    }
    draftIds.add(it.local_draft_id);
  }

  let totalBytes = 0;
  const filesByDraftId = new Map<string, { buf: Uint8Array; contentType: string }>();
  for (const it of payload.items) {
    const file = formData.get(`file__${it.local_draft_id}`);
    if (!(file instanceof Blob)) {
      return err('PAYLOAD_MALFORMED', `missing file__${it.local_draft_id}`, { code: 'ITEM_FILE_MISSING' }, 400);
    }
    if (file.size === 0) {
      return err('PAYLOAD_MALFORMED', `empty file ${it.local_draft_id}`, { code: 'EMPTY_FILE' }, 400);
    }
    if (file.size > SINGLE_FILE_MAX) {
      return err('PAYLOAD_MALFORMED', `file too large (>50MB)`, { code: 'FILE_TOO_LARGE', local_draft_id: it.local_draft_id }, 400);
    }
    totalBytes += file.size;
    if (totalBytes > TOTAL_BATCH_MAX) {
      return err('PAYLOAD_MALFORMED', `batch too large (>200MB)`, { code: 'FILE_TOO_LARGE' }, 400);
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    filesByDraftId.set(it.local_draft_id, { buf, contentType: file.type || it.mime_type });
  }

  const admin = supabaseAdmin();
  const episodeId = payload.items[0].episode_id;

  // Fetch episode + asset_types in batch
  const { data: ep, error: epErr } = await admin.from('episodes')
    .select(`id, episode_path, name_cn,
      contents:content_id ( name_cn, albums:album_id ( name_cn, series:series_id ( name_cn ) ) )`)
    .eq('id', episodeId).single();
  if (epErr || !ep) return err('PAYLOAD_MALFORMED', 'episode not found', undefined, 404);
  const epAny = ep as any;

  const typeCodes = Array.from(new Set(payload.items.map((i) => i.type_code)));
  const { data: types, error: typesErr } = await admin.from('asset_types')
    .select('code,folder_path,filename_tpl,storage_ext,storage_backend')
    .in('code', typeCodes);
  if (typesErr || !types) return err('INTERNAL_ERROR', 'asset_types lookup failed', undefined, 500);
  const typeByCode = new Map(types.map((t) => [t.code, t]));

  // Resolve final filenames + paths per item
  const resolved = payload.items.map((it) => {
    const t = typeByCode.get(it.type_code);
    if (!t) throw new Error(`unknown type_code ${it.type_code}`);
    const final_filename = resolveFilename({
      template: t.filename_tpl,
      series: epAny.contents?.albums?.series?.name_cn,
      album:  epAny.contents?.albums?.name_cn,
      content: epAny.contents?.name_cn,
      episode: epAny.name_cn,
      name: it.name, variant: it.variant,
      number: it.number, version: it.version,
      language: it.language,
      storageExt: t.storage_ext,
      originalFilename: it.original_filename,
    });
    const folderPath = composeFolderPath({
      template: t.folder_path,
      episode: epAny.name_cn,
      content: epAny.contents?.name_cn,
    });
    const storage_ref = composeFullStorageRef({
      episodePath: epAny.episode_path, folderPath, finalFilename: final_filename,
    });
    return { item: it, type: t, final_filename, storage_ref };
  });

  // Stage A: GitHub commit (text only)
  const textBatch = resolved.filter((r) => r.type.storage_backend === 'github');
  let commitSha: string | null = null;
  if (textBatch.length > 0) {
    try {
      const result = await createCommitWithFiles({
        message: payload.commit_message,
        files: textBatch.map((r) => ({
          path: r.storage_ref,
          content: new TextDecoder('utf-8').decode(filesByDraftId.get(r.item.local_draft_id)!.buf),
        })),
      });
      commitSha = result.commit_sha;
      await logUsage({ userId: auth.user_id, provider: 'github', action: 'commit', episodeId, bytesTransferred: textBatch.reduce((s, r) => s + r.item.size_bytes, 0) });
    } catch (e) {
      if (e instanceof GithubConflictError) {
        return err('INTERNAL_ERROR', 'GitHub conflict — retry later', { code: 'GITHUB_CONFLICT' }, 409);
      }
      return err('INTERNAL_ERROR', `GitHub failure: ${(e as Error).message}`, { code: 'BACKEND_UNAVAILABLE' }, 502);
    }
  }

  // Stage B: R2 binaries
  const binaryBatch = resolved.filter((r) => r.type.storage_backend === 'r2');
  const uploadedR2Keys: string[] = [];
  for (const r of binaryBatch) {
    try {
      const file = filesByDraftId.get(r.item.local_draft_id)!;
      await putObject({ key: r.storage_ref, body: file.buf, contentType: file.contentType });
      uploadedR2Keys.push(r.storage_ref);
      await logUsage({ userId: auth.user_id, provider: 'r2', action: 'upload', episodeId, bytesTransferred: r.item.size_bytes });
    } catch (e) {
      // Compensation: revert GitHub commit + mark R2 orphans
      if (commitSha) {
        await revertGithubCommit(commitSha, `revert: failed batch push (R2 error)`).catch(() => {});
      }
      await markR2Orphans(uploadedR2Keys.map((k) => ({ key: k })), 'push aborted at R2 stage');
      return err('INTERNAL_ERROR', `R2 failure: ${(e as Error).message}`, { code: 'BACKEND_UNAVAILABLE' }, 502);
    }
  }

  // Stage C: Supabase metadata insert (with retry)
  const assetRows = resolved.map((r) => ({
    episode_id: episodeId,
    type_code: r.item.type_code,
    name: r.item.name ?? '',
    variant: r.item.variant ?? null,
    number: r.item.number ?? null,
    version: r.item.version,
    stage: r.item.stage,
    language: r.item.language,
    original_filename: r.item.original_filename ?? null,
    final_filename: r.final_filename,
    storage_backend: r.type.storage_backend,
    storage_ref: r.storage_ref,
    storage_metadata: r.type.storage_backend === 'github'
      ? { commit_sha: commitSha }
      : { etag: 'set-by-r2' },
    file_size_bytes: r.item.size_bytes,
    mime_type: r.item.mime_type,
    source: r.item.source,
    status: 'pushed',
    author_id: auth.user_id,
  }));

  let insertedAssets: any[] | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await admin.from('assets').insert(assetRows).select('id');
    if (!error && data) { insertedAssets = data; break; }
    if (attempt === 3) {
      await recordIdempotencyDeadLetter(payload.idempotency_key, auth.user_id, error);
      // eslint-disable-next-line no-console
      console.error('Stage C dead-letter:', error?.message);
      return err('INTERNAL_ERROR', 'metadata persistence failed', { code: 'BACKEND_UNAVAILABLE' }, 502);
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }

  // Touch episode updated_at
  await admin.from('episodes').update({ updated_at: new Date().toISOString() }).eq('id', episodeId);

  const result = {
    commit_sha: commitSha ?? undefined,
    assets: resolved.map((r, i) => ({
      local_draft_id: r.item.local_draft_id,
      id: insertedAssets![i].id,
      storage_backend: r.type.storage_backend,
      storage_ref: r.storage_ref,
      final_filename: r.final_filename,
      status: 'pushed' as const,
    })),
  };

  await recordIdempotencySuccess(payload.idempotency_key, auth.user_id, result);
  return ok(result, 201);
}
```

Run: `npm test -- app/api/assets/push/route.test.ts` → all expected cases pass.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/assets/push/
git commit -m "feat(backend): POST /api/assets/push (multipart, idempotency, A/B/C compensation)"
```

---

## Task 13: GET /api/assets + GET /api/assets/[id]/content

**Files:**
- Create: `backend/app/api/assets/route.ts`
- Create: `backend/app/api/assets/route.test.ts`
- Create: `backend/app/api/assets/[id]/content/route.ts`
- Create: `backend/app/api/assets/[id]/content/route.test.ts`

Spec reference: §5.4 GET 列表 + content。

- [ ] **Step 1: 实现 GET /api/assets 列表**

Write `backend/app/api/assets/route.ts`：
```ts
export const runtime = 'edge';

import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const episodeId = url.searchParams.get('episode_id');
  const typeCode = url.searchParams.get('type_code');
  const status = url.searchParams.get('status') ?? 'pushed';

  if (!episodeId) return err('PAYLOAD_MALFORMED', 'episode_id required', undefined, 400);

  let query = supabaseAdmin().from('assets')
    .select('id,type_code,name,variant,version,stage,language,final_filename,storage_backend,storage_ref,file_size_bytes,author:author_id(display_name),pushed_at,status', { count: 'exact' })
    .eq('episode_id', episodeId)
    .eq('status', status);
  if (typeCode) query = query.eq('type_code', typeCode);
  query = query.order('pushed_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) return err('INTERNAL_ERROR', error.message, undefined, 500);
  return ok({ assets: data ?? [], total: count ?? 0 });
}
```

Write the matching test (2 cases: 401, 200 happy path).

- [ ] **Step 2: 实现 content/route.ts**

Write `backend/app/api/assets/[id]/content/route.ts`：
```ts
export const runtime = 'nodejs';
export const maxDuration = 30;

import { err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getBlobContent } from '@/lib/github';
import { getPresignedDownloadUrl } from '@/lib/r2';
import { logUsage } from '@/lib/usage';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;

  const { data: asset, error } = await supabaseAdmin()
    .from('assets')
    .select('id,storage_backend,storage_ref,storage_metadata,mime_type,episode_id,file_size_bytes')
    .eq('id', id).single();
  if (error || !asset) return err('PAYLOAD_MALFORMED', 'asset not found', undefined, 404);

  if (asset.storage_backend === 'github') {
    const sha = (asset.storage_metadata as { commit_sha?: string; blob_sha?: string })?.blob_sha;
    if (!sha) {
      // Fallback: fetch by path (slower) — implement later if blob_sha not stored
      return err('INTERNAL_ERROR', 'blob_sha not recorded', undefined, 500);
    }
    const content = await getBlobContent(sha);
    await logUsage({ userId: auth.user_id, provider: 'github', action: 'download', episodeId: asset.episode_id, bytesTransferred: asset.file_size_bytes ?? 0 });
    return new Response(content, {
      status: 200,
      headers: { 'content-type': asset.mime_type ?? 'text/markdown; charset=utf-8' },
    });
  }

  // r2 → 302 to presigned URL
  const url = await getPresignedDownloadUrl({ key: asset.storage_ref, ttlSec: 900 });
  await logUsage({ userId: auth.user_id, provider: 'r2', action: 'download', episodeId: asset.episode_id, bytesTransferred: asset.file_size_bytes ?? 0 });
  return Response.redirect(url, 302);
}
```

Write the matching test (3 cases: 401, github text returned, r2 → 302 redirect).

⚠️ 注意：上面 github 路径假设 push 时 storage_metadata 存了 `blob_sha`。回看 Task 12 的 Stage C，当前只存了 `commit_sha`。**需要在 Task 12 实现里把 blob_sha 也写进去**——这是 self-review 要抓的 bug，下一个 self-review section 会改。

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/assets/route.ts backend/app/api/assets/route.test.ts \
        backend/app/api/assets/\[id\]/content/
git commit -m "feat(backend): GET /api/assets list + GET /api/assets/:id/content"
```

---

## Task 14: GET /api/usage/me + GET /api/usage (admin)

**Files:**
- Create: `backend/app/api/usage/me/route.ts`
- Create: `backend/app/api/usage/me/route.test.ts`
- Create: `backend/app/api/usage/route.ts`
- Create: `backend/app/api/usage/route.test.ts`

Spec reference: §5.5。

- [ ] **Step 1: 实现两个 usage 路由**

Write `backend/app/api/usage/me/route.ts`：
```ts
export const runtime = 'edge';

import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin()
    .from('usage_logs')
    .select('provider,action,bytes_transferred,cost_usd,model,at')
    .eq('user_id', auth.user_id)
    .gte('at', since)
    .order('at', { ascending: false });

  if (error) return err('INTERNAL_ERROR', error.message, undefined, 500);

  const rows = data ?? [];
  const total_usd = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const total_bytes = rows.reduce((s, r) => s + Number(r.bytes_transferred ?? 0), 0);
  const by_provider: Record<string, { usd: number; bytes: number; count: number }> = {};
  for (const r of rows) {
    if (!by_provider[r.provider]) by_provider[r.provider] = { usd: 0, bytes: 0, count: 0 };
    by_provider[r.provider].usd += Number(r.cost_usd ?? 0);
    by_provider[r.provider].bytes += Number(r.bytes_transferred ?? 0);
    by_provider[r.provider].count++;
  }
  return ok({ total_usd, total_bytes, by_provider, recent: rows.slice(0, 50) });
}
```

Write `backend/app/api/usage/route.ts`（admin 版，多一道 role 检查）：
```ts
export const runtime = 'edge';

import { ok, err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { data: me } = await supabaseAdmin().from('users').select('role').eq('id', auth.user_id).single();
  if (me?.role !== 'admin') return err('UNAUTHORIZED', 'admin only', undefined, 403);

  const url = new URL(req.url);
  const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const userId = url.searchParams.get('user_id');

  let query = supabaseAdmin().from('usage_logs')
    .select('user_id,provider,action,bytes_transferred,cost_usd,model,at')
    .gte('at', since);
  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.order('at', { ascending: false }).limit(1000);
  if (error) return err('INTERNAL_ERROR', error.message, undefined, 500);
  return ok({ rows: data ?? [] });
}
```

Write 4 tests total (each route 2 cases: 401/403, 200 happy).

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/usage/
git commit -m "feat(backend): GET /api/usage/me + GET /api/usage (admin)"
```

---

## Task 15: Integration test —— push 全链路

**Files:**
- Create: `backend/app/api/assets/push/route.integration.test.ts`

跑在 `vitest.integration.config.ts` 下，需要 `supabase start` 跑着。GitHub 用 msw mock，R2 用一个内存替身（或者直接 mock putObject）。

- [ ] **Step 1: 写 integration 测试**

Write `backend/app/api/assets/push/route.integration.test.ts`：
```ts
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../../../../test/setup-msw';
import { createTestUser, createTestEpisode, cleanupTestData } from '../../../../test/factories';
import { POST } from './route';

describe('integration: POST /api/assets/push', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let episode: Awaited<ReturnType<typeof createTestEpisode>>;

  beforeAll(async () => {
    user = await createTestUser();
    episode = await createTestEpisode({ authorId: user.id });
  });

  afterAll(async () => { await cleanupTestData(); });

  beforeEach(() => {
    // Mock GitHub: head, getCommit, createBlob, createTree, createCommit, updateRef
    mswServer.use(
      http.get('https://api.github.com/repos/:owner/:repo/git/refs/heads/main', () =>
        HttpResponse.json({ object: { sha: 'mock-head' } }),
      ),
      http.get('https://api.github.com/repos/:owner/:repo/git/commits/:sha', () =>
        HttpResponse.json({ tree: { sha: 'mock-tree' }, parents: [{ sha: 'p' }] }),
      ),
      http.post('https://api.github.com/repos/:owner/:repo/git/blobs', () =>
        HttpResponse.json({ sha: `blob-${Math.random().toString(36).slice(2, 8)}` }),
      ),
      http.post('https://api.github.com/repos/:owner/:repo/git/trees', () =>
        HttpResponse.json({ sha: 'new-tree' }),
      ),
      http.post('https://api.github.com/repos/:owner/:repo/git/commits', () =>
        HttpResponse.json({ sha: 'new-commit' }),
      ),
      http.patch('https://api.github.com/repos/:owner/:repo/git/refs/heads/main', () =>
        HttpResponse.json({}),
      ),
    );
  });

  it('happy path: 1 SCRIPT pushes successfully and lands in Supabase', async () => {
    const fd = new FormData();
    const draftId = '11111111-1111-1111-1111-111111111111';
    fd.append('payload', JSON.stringify({
      idempotency_key: `key-${Date.now()}`,
      commit_message: 'integration test',
      items: [{
        local_draft_id: draftId,
        episode_id: episode.episode_id,
        type_code: 'SCRIPT',
        name: '测试内容',
        version: 1, stage: 'ROUGH', language: 'ZH',
        source: 'imported',
        mime_type: 'text/markdown',
        size_bytes: 11,
      }],
    }));
    fd.append(`file__${draftId}`, new Blob(['hello world'], { type: 'text/markdown' }));

    const res = await POST(new Request('http://localhost/api/assets/push', {
      method: 'POST',
      headers: { authorization: `Bearer ${user.access_token}` },
      body: fd,
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.commit_sha).toBe('new-commit');
    expect(body.data.assets).toHaveLength(1);
    expect(body.data.assets[0].storage_backend).toBe('github');
  });

  it('idempotent replay returns same result without re-committing', async () => {
    const key = `idem-${Date.now()}`;
    // ... call twice, expect both return same body
  });
});
```

- [ ] **Step 2: 跑 integration 测试**

Run（确保 `supabase start` 已启动）:
```bash
cd D:/VideoAPP/backend
npm run db:start  # 若未启动
npm run test:integration
```
Expected: integration 测试通过。

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/assets/push/route.integration.test.ts
git commit -m "test(backend): integration test for push pipeline (Supabase + msw GitHub)"
```

---

## Task 16: Self-review fix — push 时记录 blob_sha

**Files:**
- Modify: `backend/app/api/assets/push/route.ts`

发现 Task 13 content 路由依赖 `storage_metadata.blob_sha`，但 Task 12 push 没存。修。

- [ ] **Step 1: 修 push/route.ts Stage C**

在 push/route.ts 的 `assetRows` 构造里，把 GitHub 路径的 storage_metadata 改为：
```ts
storage_metadata: r.type.storage_backend === 'github'
  ? { commit_sha: commitSha, blob_sha: githubResult.blobs[r.storage_ref] }
  : { etag: r.r2Result?.etag, version_id: r.r2Result?.version_id },
```

需要把 `createCommitWithFiles` 返回的 `result` 改名为 `githubResult` 并保留供下游用，且把 `putObject` 返回的 etag/version_id 缓存到 `r.r2Result`。

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/assets/push/route.ts
git commit -m "fix(backend): record blob_sha + etag in storage_metadata for content fetch"
```

---

## Task 17: Vercel preview 远程冒烟

依赖：运维清单跑完，Vercel preview URL 能访问。

- [ ] **Step 1: 远程跑 push 闭环**

PowerShell 脚本：
```powershell
$BASE = "https://videoapp-xxx.vercel.app"
$ACCESS = "<从 login 接口拿到>"
$EP_ID = "<从 POST /api/episodes 拿到>"

# 1. preview-filename
curl.exe -sS -X POST "$BASE/api/assets/preview-filename" `
  -H "authorization: Bearer $ACCESS" `
  -H "content-type: application/json" `
  -d '{"episode_id":"'$EP_ID'","type_code":"SCRIPT","name":"侏儒怪"}'

# 2. push (multipart)
curl.exe -sS -X POST "$BASE/api/assets/push" `
  -H "authorization: Bearer $ACCESS" `
  -F 'payload={"idempotency_key":"smk-001","commit_message":"smoke","items":[{"local_draft_id":"d1","episode_id":"'$EP_ID'","type_code":"SCRIPT","name":"侏儒怪","version":1,"stage":"ROUGH","language":"ZH","source":"imported","mime_type":"text/markdown","size_bytes":11}]}' `
  -F 'file__d1=@D:/tmp/test.md;type=text/markdown'

# 3. tree
curl.exe -sS "$BASE/api/tree" -H "authorization: Bearer $ACCESS"
```

- [ ] **Step 2: 验收**

- [ ] preview-filename 返回正确 final_filename
- [ ] push 返回 201 + commit_sha
- [ ] 去 GitHub `fableglitch/asset-library` 应看到这次 commit
- [ ] tree 返回新增的 episode + asset_count_pushed=1
- [ ] 去 Supabase Studio 看 assets 表应有 1 行

- [ ] **Step 3: 打 tag**

```bash
cd D:/VideoAPP
git tag p0b-complete
git push origin --tags
```

**P0-B 完成判定**：所有 unit 测试通过 + integration 测试通过 + Vercel preview 远程冒烟 push 闭环 OK。

---

## 后续衔接

P0-B 完成后：
- **P0-C**（前端外壳）：可消费本计划产出的全部 12 个 endpoint。前端 plan 单独写。
- **P0-D**（前端业务 UI）：需要先做 UI 设计冲刺再写 plan。

---

## Self-Review

完成最后一步前再次扫一遍：

**Spec 覆盖检查（spec §5 路由清单 vs 本计划任务）**：
- [x] §5.1 auth 路由（5 个） — P0-A 已完成
- [x] §5.2 GET /api/tree — Task 8
- [x] §5.3 POST /api/episodes — Task 9
- [x] §5.3 GET /api/episodes/:id — Task 10
- [x] §5.4 POST /api/assets/preview-filename — Task 11
- [x] §5.4 POST /api/assets/check-collision — Task 11
- [x] §5.4 POST /api/assets/push — Task 12（最大）
- [x] §5.4 GET /api/assets — Task 13
- [x] §5.4 GET /api/assets/:id/content — Task 13
- [x] §5.5 GET /api/usage/me — Task 14
- [x] §5.5 GET /api/usage（admin） — Task 14

**已知 placeholder / TODO**（写出来 + 留给执行人决定）：
- Task 12 push 的 unit 测试只列了 8 个用例的框架，2 个完整代码 + 6 个简短描述。执行时按模板扩展即可，但**必须每个 case 真正实现**，不能只跑那 2 个。
- Task 12 Stage C 的"3 次重试 + 死信"用 setTimeout 模拟退避；P0 简单实现即可，不需要 BullMQ
- Task 13 content 路由 fallback `blob_sha 缺失` 走 500 而不是 fallback by path——理由是 push 强制写入 blob_sha（Task 16 修），所以走到这分支说明数据脏，500 合理

**Type 一致性扫描**：
- `storage_backend` 在 enum / shared/types / lib / 路由层全部用 `'github' | 'r2'` 字面量（一致）
- `final_filename`、`storage_ref`、`storage_metadata` 在 spec / migration / shared/types / 路由 一致
- `idempotency_key` 在 spec / lib / push payload 一致
- `local_draft_id` 在 push payload / asset 返回结构 一致

**测试粒度检查**：
- 每个路由 ≥ 2 unit 测试用例（401 + happy path），多数 4-6 个
- push 路由独享 8 unit cases + integration test
- 5 个 lib 文件都有专属 test 文件

**预期 commit 数**：约 17 次（每个 Task 一次 + Task 7 内部 3 次小 commit + Task 11 / 13 / 14 内部各 1 次合并 commit）。
