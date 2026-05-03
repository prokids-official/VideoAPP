import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

let db = null;

const STUDIO_STAGES = new Set([
  'inspiration',
  'script',
  'character',
  'scene',
  'prop',
  'storyboard',
  'prompt-img',
  'prompt-vid',
  'canvas',
  'export',
]);

const STUDIO_SIZE_KINDS = new Set(['short', 'shorts', 'feature', 'unknown']);

function ensureDb() {
  if (db) return db;
  const dir = path.join(app.getPath('userData'), 'FableGlitch');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'local.db'));
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  applyMigrations(db);
  return db;
}

function applyMigrations(handle) {
  handle.exec(`
    create table if not exists local_drafts (
      id text primary key,
      episode_id text not null,
      type_code text not null,
      name text not null,
      variant text,
      number integer,
      version integer not null default 1,
      stage text default 'ROUGH',
      language text default 'ZH',
      original_filename text,
      final_filename text not null,
      storage_backend text not null default 'github',
      storage_ref text not null default '',
      local_file_path text not null,
      size_bytes integer,
      mime_type text,
      source text not null check (source in ('imported','pasted','ai-generated')),
      created_at text not null
    );

    create table if not exists view_cache (
      asset_id text primary key,
      storage_backend text not null,
      storage_ref text not null,
      local_cache_path text,
      last_fetched_at text,
      size_bytes integer,
      presigned_url text,
      presigned_expires_at text
    );

    create table if not exists session (
      key text primary key,
      value text not null
    );

    create table if not exists sandbox_drafts (
      id text primary key,
      title text not null,
      body text not null default '',
      kind text not null default 'note',
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_sandbox_drafts_updated_at
      on sandbox_drafts(updated_at desc);

    create table if not exists studio_projects (
      id text primary key,
      name text not null,
      size_kind text not null,
      inspiration_text text,
      current_stage text not null default 'inspiration',
      owner_id text not null default 'local',
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists studio_stage_state (
      project_id text not null references studio_projects(id) on delete cascade,
      stage text not null,
      state_json text not null,
      updated_at integer not null,
      primary key (project_id, stage)
    );

    create table if not exists studio_assets (
      id text primary key,
      project_id text not null references studio_projects(id) on delete cascade,
      type_code text not null,
      name text not null,
      variant text,
      version integer not null default 1,
      meta_json text not null,
      content_path text,
      size_bytes integer,
      mime_type text,
      pushed_to_episode_id text,
      pushed_at integer,
      created_at integer not null,
      updated_at integer not null
    );

    create index if not exists studio_projects_recent_idx
      on studio_projects(updated_at desc);

    create index if not exists studio_assets_by_project_type
      on studio_assets(project_id, type_code);
  `);
  ensureColumn(handle, 'local_drafts', 'storage_backend', "text not null default 'github'");
  ensureColumn(handle, 'local_drafts', 'storage_ref', "text not null default ''");
  ensureColumn(handle, 'studio_projects', 'owner_id', "text not null default 'local'");
}

function ensureColumn(handle, table, column, definition) {
  const columns = handle.prepare(`pragma table_info(${table})`).all();
  if (!columns.some((row) => row.name === column)) {
    handle.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

export function sessionGet(key) {
  const row = ensureDb().prepare('select value from session where key = ?').get(key);
  return row ? row.value : null;
}

export function sessionSet(key, value) {
  ensureDb().prepare('insert or replace into session (key, value) values (?, ?)').run(key, value);
}

export function sessionDelete(key) {
  ensureDb().prepare('delete from session where key = ?').run(key);
}

export function sessionClear() {
  ensureDb().prepare('delete from session').run();
}

export function draftCreate(input) {
  const createdAt = new Date().toISOString();
  const row = { ...input, created_at: createdAt };
  ensureDb().prepare(`
    insert or replace into local_drafts (
      id, episode_id, type_code, name, variant, number, version, stage, language,
      original_filename, final_filename, storage_backend, storage_ref, local_file_path,
      size_bytes, mime_type, source, created_at
    ) values (
      @id, @episode_id, @type_code, @name, @variant, @number, @version, @stage, @language,
      @original_filename, @final_filename, @storage_backend, @storage_ref, @local_file_path,
      @size_bytes, @mime_type, @source, @created_at
    )
  `).run(row);
  return row;
}

export function draftsList(episodeId) {
  return ensureDb()
    .prepare('select * from local_drafts where episode_id = ? order by created_at desc')
    .all(episodeId);
}

export function draftDelete(id) {
  ensureDb().prepare('delete from local_drafts where id = ?').run(id);
}

export function viewCacheGet(assetId) {
  const row = ensureDb().prepare('select * from view_cache where asset_id = ?').get(assetId);
  return row ?? null;
}

export function viewCacheSet(input) {
  ensureDb().prepare(`
    insert or replace into view_cache (
      asset_id, storage_backend, storage_ref, local_cache_path, last_fetched_at,
      size_bytes, presigned_url, presigned_expires_at
    ) values (
      @asset_id, @storage_backend, @storage_ref, @local_cache_path, @last_fetched_at,
      @size_bytes, @presigned_url, @presigned_expires_at
    )
  `).run({
    asset_id: input.asset_id,
    storage_backend: input.storage_backend,
    storage_ref: input.storage_ref,
    local_cache_path: input.local_cache_path ?? null,
    last_fetched_at: input.last_fetched_at ?? new Date().toISOString(),
    size_bytes: input.size_bytes ?? null,
    presigned_url: input.presigned_url ?? null,
    presigned_expires_at: input.presigned_expires_at ?? null,
  });
}

export function sandboxDraftCreate(input = {}) {
  const now = new Date().toISOString();
  const row = {
    id: `sandbox_${randomUUID()}`,
    title: String(input.title || '未命名草稿'),
    body: String(input.body || ''),
    kind: String(input.kind || 'note'),
    created_at: now,
    updated_at: now,
  };

  ensureDb().prepare(`
    insert into sandbox_drafts (id, title, body, kind, created_at, updated_at)
    values (@id, @title, @body, @kind, @created_at, @updated_at)
  `).run(row);
  return row;
}

export function sandboxDraftsList() {
  return ensureDb()
    .prepare('select * from sandbox_drafts order by updated_at desc')
    .all();
}

export function sandboxDraftUpdate(id, input = {}) {
  const existing = ensureDb().prepare('select * from sandbox_drafts where id = ?').get(id);
  if (!existing) {
    throw new Error('Sandbox draft not found');
  }

  const row = {
    ...existing,
    title: input.title === undefined ? existing.title : String(input.title),
    body: input.body === undefined ? existing.body : String(input.body),
    updated_at: new Date().toISOString(),
  };

  ensureDb().prepare(`
    update sandbox_drafts
    set title = @title, body = @body, updated_at = @updated_at
    where id = @id
  `).run(row);
  return row;
}

export function sandboxDraftDelete(id) {
  ensureDb().prepare('delete from sandbox_drafts where id = ?').run(id);
}

export function sandboxDraftsClear() {
  ensureDb().prepare('delete from sandbox_drafts').run();
}

export function studioProjectCreate(input = {}) {
  const now = Date.now();
  const sizeKind = normalizeStudioSizeKind(input.size_kind);
  const row = {
    id: `studio_${randomUUID()}`,
    name: normalizeRequiredString(input.name, 'Project name required'),
    size_kind: sizeKind,
    inspiration_text: input.inspiration_text == null ? null : String(input.inspiration_text),
    current_stage: normalizeStudioStage(input.current_stage ?? 'inspiration'),
    owner_id: input.owner_id == null ? 'local' : String(input.owner_id),
    created_at: now,
    updated_at: now,
  };

  ensureDb().prepare(`
    insert into studio_projects (
      id, name, size_kind, inspiration_text, current_stage, owner_id, created_at, updated_at
    ) values (
      @id, @name, @size_kind, @inspiration_text, @current_stage, @owner_id, @created_at, @updated_at
    )
  `).run(row);

  return row;
}

export function studioProjectsList() {
  return ensureDb()
    .prepare('select * from studio_projects order by updated_at desc')
    .all();
}

export function studioProjectGet(id) {
  const handle = ensureDb();
  const project = handle.prepare('select * from studio_projects where id = ?').get(id);
  if (!project) {
    return null;
  }

  const assets = studioAssetsList(id);
  const stageRows = handle
    .prepare('select stage, state_json from studio_stage_state where project_id = ? order by updated_at desc')
    .all(id);
  const stage_state = Object.fromEntries(stageRows.map((row) => [row.stage, row.state_json]));

  return { project, assets, stage_state };
}

export function studioProjectUpdate(id, patch = {}) {
  const handle = ensureDb();
  const existing = handle.prepare('select * from studio_projects where id = ?').get(id);
  if (!existing) {
    throw new Error('Studio project not found');
  }

  const row = {
    ...existing,
    name: patch.name === undefined ? existing.name : normalizeRequiredString(patch.name, 'Project name required'),
    size_kind: patch.size_kind === undefined ? existing.size_kind : normalizeStudioSizeKind(patch.size_kind),
    inspiration_text: patch.inspiration_text === undefined
      ? existing.inspiration_text
      : patch.inspiration_text == null ? null : String(patch.inspiration_text),
    current_stage: patch.current_stage === undefined ? existing.current_stage : normalizeStudioStage(patch.current_stage),
    owner_id: patch.owner_id === undefined ? existing.owner_id : String(patch.owner_id),
    updated_at: Date.now(),
  };

  handle.prepare(`
    update studio_projects
    set name = @name,
        size_kind = @size_kind,
        inspiration_text = @inspiration_text,
        current_stage = @current_stage,
        owner_id = @owner_id,
        updated_at = @updated_at
    where id = @id
  `).run(row);

  return row;
}

export function studioProjectDelete(id) {
  ensureDb().prepare('delete from studio_projects where id = ?').run(id);
}

export function studioAssetSave(input = {}) {
  const handle = ensureDb();
  const existing = input.id ? handle.prepare('select * from studio_assets where id = ?').get(input.id) : null;
  const now = Date.now();
  const row = {
    id: existing?.id ?? input.id ?? `studio_asset_${randomUUID()}`,
    project_id: normalizeRequiredString(input.project_id ?? existing?.project_id, 'Project id required'),
    type_code: normalizeRequiredString(input.type_code ?? existing?.type_code, 'Asset type required'),
    name: normalizeRequiredString(input.name ?? existing?.name, 'Asset name required'),
    variant: input.variant === undefined ? existing?.variant ?? null : input.variant == null ? null : String(input.variant),
    version: normalizePositiveInteger(input.version ?? existing?.version ?? 1),
    meta_json: normalizeJsonString(input.meta_json ?? existing?.meta_json ?? '{}'),
    content_path: input.content_path === undefined
      ? existing?.content_path ?? null
      : input.content_path == null ? null : String(input.content_path),
    size_bytes: input.size_bytes === undefined ? existing?.size_bytes ?? null : normalizeNullableInteger(input.size_bytes),
    mime_type: input.mime_type === undefined ? existing?.mime_type ?? null : input.mime_type == null ? null : String(input.mime_type),
    pushed_to_episode_id: input.pushed_to_episode_id === undefined
      ? existing?.pushed_to_episode_id ?? null
      : input.pushed_to_episode_id == null ? null : String(input.pushed_to_episode_id),
    pushed_at: input.pushed_at === undefined ? existing?.pushed_at ?? null : normalizeNullableInteger(input.pushed_at),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  handle.prepare(`
    insert into studio_assets (
      id, project_id, type_code, name, variant, version, meta_json, content_path,
      size_bytes, mime_type, pushed_to_episode_id, pushed_at, created_at, updated_at
    ) values (
      @id, @project_id, @type_code, @name, @variant, @version, @meta_json, @content_path,
      @size_bytes, @mime_type, @pushed_to_episode_id, @pushed_at, @created_at, @updated_at
    )
    on conflict(id) do update set
      project_id = excluded.project_id,
      type_code = excluded.type_code,
      name = excluded.name,
      variant = excluded.variant,
      version = excluded.version,
      meta_json = excluded.meta_json,
      content_path = excluded.content_path,
      size_bytes = excluded.size_bytes,
      mime_type = excluded.mime_type,
      pushed_to_episode_id = excluded.pushed_to_episode_id,
      pushed_at = excluded.pushed_at,
      updated_at = excluded.updated_at
  `).run(row);

  touchStudioProject(row.project_id);
  return row;
}

export function studioAssetsList(projectId, typeCode = null) {
  const handle = ensureDb();
  if (typeCode) {
    return handle
      .prepare('select * from studio_assets where project_id = ? and type_code = ? order by updated_at desc')
      .all(projectId, typeCode);
  }

  return handle
    .prepare('select * from studio_assets where project_id = ? order by updated_at desc')
    .all(projectId);
}

export function studioAssetDelete(id) {
  const handle = ensureDb();
  const existing = handle.prepare('select project_id from studio_assets where id = ?').get(id);
  handle.prepare('delete from studio_assets where id = ?').run(id);
  if (existing) {
    touchStudioProject(existing.project_id);
  }
}

export function studioStageSave(projectId, stage, stateJson) {
  const row = {
    project_id: projectId,
    stage: normalizeStudioStage(stage),
    state_json: normalizeJsonString(stateJson),
    updated_at: Date.now(),
  };

  ensureDb().prepare(`
    insert into studio_stage_state (project_id, stage, state_json, updated_at)
    values (@project_id, @stage, @state_json, @updated_at)
    on conflict(project_id, stage) do update set
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(row);

  touchStudioProject(projectId);
}

export function studioStageGet(projectId, stage) {
  const row = ensureDb()
    .prepare('select state_json from studio_stage_state where project_id = ? and stage = ?')
    .get(projectId, normalizeStudioStage(stage));
  return row?.state_json ?? null;
}

export function studioAssetWriteFile(id, content) {
  const handle = ensureDb();
  const asset = handle.prepare('select * from studio_assets where id = ?').get(id);
  if (!asset) {
    throw new Error('Studio asset not found');
  }

  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  const dir = studioAssetsRoot();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, id);
  fs.writeFileSync(filePath, data);

  handle.prepare(`
    update studio_assets
    set content_path = ?, size_bytes = ?, updated_at = ?
    where id = ?
  `).run(filePath, data.byteLength, Date.now(), id);
  touchStudioProject(asset.project_id);

  return { path: filePath, size_bytes: data.byteLength };
}

export function studioAssetReadFile(id) {
  const asset = ensureDb().prepare('select content_path from studio_assets where id = ?').get(id);
  if (!asset?.content_path) {
    throw new Error('Studio asset file not found');
  }

  return fs.readFileSync(asset.content_path);
}

function studioAssetsRoot() {
  return path.join(app.getPath('userData'), 'FableGlitch', 'studio-assets');
}

function touchStudioProject(id) {
  ensureDb().prepare('update studio_projects set updated_at = ? where id = ?').run(Date.now(), id);
}

function normalizeRequiredString(value, message) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function normalizeStudioSizeKind(value) {
  const sizeKind = String(value ?? 'unknown');
  if (!STUDIO_SIZE_KINDS.has(sizeKind)) {
    throw new Error('Invalid studio size kind');
  }
  return sizeKind;
}

function normalizeStudioStage(value) {
  const stage = String(value ?? 'inspiration');
  if (!STUDIO_STAGES.has(stage)) {
    throw new Error('Invalid studio stage');
  }
  return stage;
}

function normalizeJsonString(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? {});
  JSON.parse(text);
  return text;
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Invalid positive integer');
  }
  return number;
}

function normalizeNullableInteger(value) {
  if (value == null) {
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error('Invalid integer');
  }
  return number;
}
