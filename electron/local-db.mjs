import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

let db = null;

function ensureDb() {
  if (db) return db;
  const dir = path.join(app.getPath('userData'), 'FableGlitch');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'local.db'));
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
  `);
  ensureColumn(handle, 'local_drafts', 'storage_backend', "text not null default 'github'");
  ensureColumn(handle, 'local_drafts', 'storage_ref', "text not null default ''");
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
