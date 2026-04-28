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
