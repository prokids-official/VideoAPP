import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  authUsers: [] as Array<{ id: string; email: string; password: string; token: string }>,
  users: [] as Row[],
  series: [] as Row[],
  albums: [] as Row[],
  contents: [] as Row[],
  episodes: [] as Row[],
  pushes: [] as Row[],
  assets: [] as Row[],
  asset_types: [] as Row[],
  idempotency: new Map<string, unknown>(),
  now: 0,
}));

const mocks = vi.hoisted(() => ({
  createCommitWithFiles: vi.fn(),
  revertCommitPaths: vi.fn(),
  putObject: vi.fn(),
  moveObjectToTrash: vi.fn(),
  logUsage: vi.fn(),
}));

function nextId(prefix: string): string {
  db.now += 1;
  return `${prefix}-${db.now}`;
}

function nowIso(): string {
  db.now += 1;
  return new Date(Date.UTC(2026, 4, 2, 0, 0, db.now)).toISOString();
}

function tableRows(table: string): Row[] {
  const rows = (db as unknown as Record<string, Row[]>)[table];

  if (!rows) {
    throw new Error(`unknown table ${table}`);
  }

  return rows;
}

function relatedEpisode(row: Row): Row {
  const content = db.contents.find((item) => item.id === row.content_id);
  const album = db.albums.find((item) => item.id === content?.album_id);
  const series = db.series.find((item) => item.id === album?.series_id);

  return {
    ...row,
    contents: {
      name_cn: content?.name_cn,
      albums: {
        name_cn: album?.name_cn,
        series: { name_cn: series?.name_cn },
      },
    },
  };
}

function relatedPush(row: Row): Row {
  const pushedBy = db.users.find((user) => user.id === row.pushed_by);
  const withdrawnBy = db.users.find((user) => user.id === row.withdrawn_by);
  const episode = db.episodes.find((item) => item.id === row.episode_id);

  return {
    ...row,
    pushed_by_user: pushedBy ? { id: pushedBy.id, display_name: pushedBy.display_name } : null,
    withdrawn_by_user: withdrawnBy ? { id: withdrawnBy.id, display_name: withdrawnBy.display_name } : null,
    episodes: episode
      ? {
          id: episode.id,
          name_cn: episode.name_cn,
          episode_path: episode.episode_path,
        }
      : null,
  };
}

class FakeQuery {
  private operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: unknown;
  private filters: Array<{ column: string; op: 'eq' | 'is' | 'neq'; value: unknown }> = [];
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private countExact = false;

  constructor(private readonly table: string) {}

  select(_columns?: string, opts?: { count?: string }): this {
    this.countExact = opts?.count === 'exact';
    return this;
  }

  insert(payload: unknown): this {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown): this {
    this.operation = 'upsert';
    this.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: 'is', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  in(_column: string, values: unknown[]): Promise<{ data: Row[]; error: null }> {
    const rows = tableRows(this.table).filter((row) => values.includes(row.code));
    return Promise.resolve({ data: rows, error: null });
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  async single<T = Row>(): Promise<{ data: T | null; error: { message: string } | null }> {
    const result = await this.execute();
    return { data: (result.data[0] as T | undefined) ?? null, error: result.error };
  }

  async maybeSingle<T = Row>(): Promise<{ data: T | null; error: { message: string } | null }> {
    return this.single<T>();
  }

  then<TResult1 = { data: Row[]; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.op === 'eq') return row[filter.column] === filter.value;
        if (filter.op === 'neq') return row[filter.column] !== filter.value;
        return row[filter.column] === filter.value;
      }),
    );
  }

  private shape(row: Row): Row {
    if (this.table === 'episodes') return relatedEpisode(row);
    if (this.table === 'pushes') return relatedPush(row);
    return row;
  }

  private async execute(): Promise<{ data: Row[]; error: null; count?: number }> {
    if (this.operation === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = rows.map((item) => this.insertRow(item as Row));
      return { data: inserted, error: null };
    }

    if (this.operation === 'upsert') {
      return { data: [this.upsertRow(this.payload as Row)], error: null };
    }

    if (this.operation === 'update') {
      const rows = this.applyFilters(tableRows(this.table));
      rows.forEach((row) => Object.assign(row, this.payload));
      return { data: rows.map((row) => this.shape(row)), error: null };
    }

    if (this.operation === 'delete') {
      const rows = tableRows(this.table);
      const keep = rows.filter((row) => !this.applyFilters([row]).length);
      rows.splice(0, rows.length, ...keep);
      return { data: [], error: null };
    }

    let rows = this.applyFilters(tableRows(this.table)).map((row) => this.shape(row));
    for (const order of this.orderBy) {
      rows = rows.sort((a, b) => {
        const left = String(a[order.column] ?? '');
        const right = String(b[order.column] ?? '');
        return order.ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    const count = rows.length;
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return { data: rows, error: null, count: this.countExact ? count : undefined };
  }

  private insertRow(input: Row): Row {
    const row: Row = { ...input };
    const rows = tableRows(this.table);

    if (!row.id) row.id = nextId(this.table);
    if (this.table === 'episodes') {
      row.status ??= 'drafting';
      row.created_at ??= nowIso();
      row.updated_at ??= row.created_at;
    }
    if (this.table === 'pushes') {
      row.pushed_at ??= nowIso();
      row.github_revert_sha ??= null;
      row.github_revert_failed ??= false;
      row.github_revert_error ??= null;
      row.withdrawn_by ??= null;
      row.withdrawn_at ??= null;
      row.withdrawn_reason ??= null;
    }
    if (this.table === 'assets') {
      row.pushed_at ??= nowIso();
      row.status ??= 'pushed';
      row.withdrawn_at ??= null;
    }
    rows.push(row);
    return row;
  }

  private upsertRow(input: Row): Row {
    const rows = tableRows(this.table);
    let existing: Row | undefined;

    if (this.table === 'series') {
      existing = rows.find((row) => row.name_cn === input.name_cn);
    } else if (this.table === 'albums') {
      existing = rows.find((row) => row.series_id === input.series_id && row.name_cn === input.name_cn);
    } else if (this.table === 'contents') {
      existing = rows.find((row) => row.album_id === input.album_id && row.name_cn === input.name_cn);
    }

    if (existing) {
      Object.assign(existing, input);
      return existing;
    }

    return this.insertRow(input);
  }
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: {
      getUser: async (token: string) => ({
        data: { user: db.authUsers.find((user) => user.token === token) ?? null },
        error: null,
      }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const user = db.authUsers.find((item) => item.email === email && item.password === password);
        return {
          data: {
            user: user ? { id: user.id, email: user.email } : null,
            session: user ? { access_token: user.token, refresh_token: `refresh-${user.id}`, expires_at: 1 } : null,
          },
          error: user ? null : { message: 'invalid credentials' },
        };
      },
      admin: {
        deleteUser: async () => ({ error: null }),
      },
    },
    from: (table: string) => new FakeQuery(table),
  }),
}));

vi.mock('@/lib/supabase-public', () => ({
  supabasePublic: () => ({
    auth: {
      signUp: async ({ email, password }: { email: string; password: string }) => {
        const id = nextId('user');
        const token = `token-${id}`;
        db.authUsers.push({ id, email, password, token });
        return {
          data: {
            user: { id, email },
            session: { access_token: token, refresh_token: `refresh-${id}`, expires_at: 1 },
          },
          error: null,
        };
      },
    },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  extractClientIp: () => '127.0.0.1',
  getLimiter: () => ({
    consume: async () => ({ allowed: true, retryAfterSec: 0, remaining: 99 }),
  }),
}));

vi.mock('@/lib/github', () => ({
  GithubConflictError: class GithubConflictError extends Error {
    code = 'GITHUB_CONFLICT' as const;
  },
  createCommitWithFiles: mocks.createCommitWithFiles,
  revertCommitPaths: mocks.revertCommitPaths,
}));

vi.mock('@/lib/r2', () => ({
  putObject: mocks.putObject,
  moveObjectToTrash: mocks.moveObjectToTrash,
}));

vi.mock('@/lib/usage', () => ({
  logUsage: mocks.logUsage,
}));

vi.mock('@/lib/idempotency', () => ({
  lookupIdempotency: async (key: string, userId: string) => db.idempotency.get(`${userId}:${key}`) ?? null,
  recordIdempotencySuccess: async (key: string, userId: string, result: unknown) => {
    db.idempotency.set(`${userId}:${key}`, { status: 'success', result });
  },
  recordIdempotencyDeadLetter: async () => {},
}));

import { POST as signup } from '../../app/api/auth/signup/route';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as createEpisode } from '../../app/api/episodes/route';
import { POST as pushAssets } from '../../app/api/assets/push/route';
import { GET as listPushes } from '../../app/api/episodes/[id]/pushes/route';
import { GET as getPush } from '../../app/api/pushes/[id]/route';
import { POST as withdrawPush } from '../../app/api/pushes/[id]/withdraw/route';
import { GET as listAssets } from '../../app/api/assets/route';
import { GET as getContent } from '../../app/api/assets/[id]/content/route';

function jsonReq(path: string, body: unknown, token?: string): Request {
  return new Request(`http://localhost/api${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function authGet(path: string, token: string): Request {
  return new Request(`http://localhost/api${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function pushReq(episodeId: string, token: string): Request {
  const fd = new FormData();
  fd.append(
    'payload',
    JSON.stringify({
      idempotency_key: 'full-flow-key',
      commit_message: 'test: full flow',
      items: [
        {
          local_draft_id: 'draft-script',
          episode_id: episodeId,
          type_code: 'SCRIPT',
          name: '测试内容',
          version: 1,
          stage: 'FINAL',
          language: 'ZH',
          source: 'imported',
          original_filename: 'script.docx',
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size_bytes: 12,
        },
        {
          local_draft_id: 'draft-char',
          episode_id: episodeId,
          type_code: 'CHAR',
          name: '主角',
          variant: '烟测',
          version: 1,
          stage: 'ROUGH',
          language: 'ZH',
          source: 'imported',
          original_filename: 'char.png',
          mime_type: 'image/png',
          size_bytes: 4,
        },
      ],
    }),
  );
  fd.append('file__draft-script', new Blob(['hello script'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  fd.append('file__draft-char', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));

  return new Request('http://localhost/api/assets/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: fd,
  });
}

describe('integration: full auth to withdraw flow', () => {
  beforeEach(() => {
    db.authUsers.length = 0;
    db.users.length = 0;
    db.series.length = 0;
    db.albums.length = 0;
    db.contents.length = 0;
    db.episodes.length = 0;
    db.pushes.length = 0;
    db.assets.length = 0;
    db.asset_types.length = 0;
    db.idempotency.clear();
    db.now = 0;
    db.asset_types.push(
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
    );
    vi.clearAllMocks();
    mocks.createCommitWithFiles
      .mockResolvedValueOnce({ commit_sha: 'episode-commit', blobs: {} })
      .mockResolvedValueOnce({
        commit_sha: 'asset-commit',
        blobs: { '测试系列_NA_测试内容/02_Data/Script/测试系列_测试内容_SCRIPT.md': 'blob-script' },
      });
    mocks.revertCommitPaths.mockResolvedValue('revert-commit');
    mocks.putObject.mockResolvedValue({ etag: 'etag-r2' });
    mocks.moveObjectToTrash.mockResolvedValue('trash/key');
    mocks.logUsage.mockResolvedValue(undefined);
  });

  it('registers, logs in, creates an episode, pushes a batch, withdraws it, hides assets, and rejects content', async () => {
    const signupRes = await signup(
      jsonReq('/auth/signup', {
        email: 'test-full-flow@beva.com',
        password: 'TestPass123',
        display_name: 'Full Flow',
      }),
    );
    expect(signupRes.status).toBe(201);

    const loginRes = await login(jsonReq('/auth/login', { email: 'test-full-flow@beva.com', password: 'TestPass123' }));
    expect(loginRes.status).toBe(200);
    const token = (await loginRes.json()).data.session.access_token;

    const episodeRes = await createEpisode(
      jsonReq(
        '/episodes',
        {
          series_name_cn: '测试系列',
          album_name_cn: 'NA',
          content_name_cn: '测试内容',
          episode_name_cn: '第一集',
        },
        token,
      ),
    );
    expect(episodeRes.status).toBe(201);
    const episodeId = (await episodeRes.json()).data.episode.id;

    const pushRes = await pushAssets(pushReq(episodeId, token));
    expect(pushRes.status).toBe(201);
    const pushedAssets = (await pushRes.json()).data.assets;
    expect(pushedAssets).toHaveLength(2);

    const pushesRes = await listPushes(authGet(`/episodes/${episodeId}/pushes`, token), params(episodeId));
    expect(pushesRes.status).toBe(200);
    const push = (await pushesRes.json()).data.pushes[0];
    expect(push.asset_count).toBe(2);

    const pushDetailRes = await getPush(authGet(`/pushes/${push.id}`, token), params(push.id));
    expect(pushDetailRes.status).toBe(200);
    expect((await pushDetailRes.json()).data.assets).toHaveLength(2);

    const withdrawRes = await withdrawPush(jsonReq(`/pushes/${push.id}/withdraw`, { reason: 'integration smoke' }, token), params(push.id));
    expect(withdrawRes.status).toBe(200);
    const withdrawBody = await withdrawRes.json();
    expect(withdrawBody.data.push.github_revert_sha).toBe('revert-commit');
    expect(withdrawBody.data.trash_objects_moved).toBe(1);

    const defaultAssetsRes = await listAssets(authGet(`/assets?episode_id=${episodeId}`, token));
    expect(defaultAssetsRes.status).toBe(200);
    expect((await defaultAssetsRes.json()).data.assets).toHaveLength(0);

    const contentRes = await getContent(authGet(`/assets/${pushedAssets[0].id}/content`, token), params(pushedAssets[0].id));
    expect(contentRes.status).toBe(410);
    expect((await contentRes.json()).error.code).toBe('ASSET_WITHDRAWN');

    const secondWithdrawRes = await withdrawPush(jsonReq(`/pushes/${push.id}/withdraw`, { reason: 'again' }, token), params(push.id));
    expect(secondWithdrawRes.status).toBe(410);
    expect((await secondWithdrawRes.json()).error.code).toBe('ALREADY_WITHDRAWN');
  });
});
