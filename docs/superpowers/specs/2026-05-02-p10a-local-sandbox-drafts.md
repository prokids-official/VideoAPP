# FableGlitch P1.0-A Local Sandbox Drafts Spec Amendment

> Date: 2026-05-02
> Scope: Amends `2026-05-02-p10-homepage-sandbox.md`.
> Owner: Codex.

## 1. Decision Change

The personal sandbox is no longer fully ephemeral.

It remains isolated from company assets, but draft state should persist locally on the user's machine so closing and reopening the desktop app does not lose work.

## 2. Locked Decisions

1. Sandbox drafts are stored only in the Electron local SQLite database under the existing app user data directory.
2. Sandbox drafts do not create Supabase rows.
3. Sandbox drafts do not write R2 objects.
4. Sandbox drafts do not write GitHub commits or files.
5. Sandbox drafts are per desktop install, not synced between machines.
6. Clearing local app data or uninstalling with data removal may delete sandbox drafts.
7. Promoting sandbox work into a company project remains manual: users download/export local output, then import through the existing company project asset flow.

## 3. Local Data Model

Extend the existing Electron `local.db` with:

```sql
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
```

`kind` is reserved for future P1.2 AI tool outputs. P1.0 only writes `note`.

## 4. Electron Contract

Expose these preload methods under `window.fableglitch.db`:

```ts
sandboxDraftCreate(input: { title?: string; body?: string; kind?: string }): Promise<SandboxDraft>;
sandboxDraftsList(): Promise<SandboxDraft[]>;
sandboxDraftUpdate(id: string, input: { title?: string; body?: string }): Promise<SandboxDraft>;
sandboxDraftDelete(id: string): Promise<void>;
sandboxDraftsClear(): Promise<void>;
```

Renderer-only fallback is not allowed for desktop builds. If the preload bridge is missing, the UI should show a desktop bridge error.

## 5. UX Contract

`/sandbox` should behave like a lightweight local draft board:

- Opening the route lists local drafts ordered by `updated_at desc`.
- Users can create a draft, edit title/body, and delete a draft.
- Edits save to SQLite through the preload bridge.
- Closing and reopening the app preserves drafts.
- UI copy must say drafts are saved on this computer only and are not synced to the company asset library.

## 6. Out Of Scope

- Supabase migration.
- Cloud sync.
- R2/GitHub writes.
- AI generation.
- Quota accounting.
- Automatic promote-to-project API.
