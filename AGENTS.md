# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

VideoAPP Studio is a Windows-first Electron desktop app for planning AI-generated comic/narrative shorts. The renderer is React 19 + TypeScript built with Vite. The Electron main process is ESM (`.mjs`) and persists project data as JSON files under the user data directory; it can also scaffold a studio snapshot into an existing local Git clone and commit/push it via the `git` CLI.

## Commands

- `npm run dev` — runs Vite (renderer) and Electron concurrently. Vite binds to `127.0.0.1:5173`; Electron waits on that port, then launches with `VITE_DEV_SERVER_URL` set. Use this for normal development.
- `npm run dev:renderer` / `npm run dev:electron` — the individual halves of `dev`, in case you need to restart one without the other. `dev:electron` requires the renderer to already be serving on port 5173.
- `npm run build` — `tsc -b && vite build`. Type-checks the whole project graph (both tsconfig references) and emits the renderer bundle to `dist/`.
- `npm run start` — runs Electron against the built `dist/index.html` (no dev server).
- `npm run lint` — ESLint across the repo. No test runner is configured.
- `npm run dist` — builds the renderer and then produces a Windows NSIS installer via `electron-builder` into `release/`.

`git` must be on `PATH` for the repository publish features to work.

## Architecture

Three processes/layers you need to keep in sync:

1. **Electron main** (`electron/*.mjs`, ESM, Node APIs).
   - `main.mjs` — creates the `BrowserWindow`, chooses between `VITE_DEV_SERVER_URL` (dev) and `dist/index.html` (packaged), and registers all `ipcMain.handle(...)` channels.
   - `storage.mjs` — JSON persistence. Projects live under `app.getPath('userData')/videoapp-data/projects/<projectId>/project.json`. `ensureDataRoot`, `listProjects`, `getProject`, `createProject`, `updateProject`, plus defaults for `workflowStatus` and `providerProfiles`. IDs are `project_` + 8 hex chars from `randomUUID`.
   - `repository.mjs` — exports a project snapshot into `<repoPath>/<assetRoot>/<slug>/{script,storyboards,prompts,assets,exports}` with seeded `project.json`, `README.md`, `brief.md`, etc. Does not touch git.
   - `git.mjs` — shells out to the `git` binary via `execFile`. `getGitStatus` runs `status --short --branch`; `publishRepository` does `add .` + `commit -m <msg>` + optional `push`, and tolerates "nothing to commit".

2. **Preload bridge** (`electron/preload.cjs`).
   Exposes a single `window.fableglitch` object via `contextBridge` (context isolation is on, `nodeIntegration` is off). The preload is CommonJS so it runs under Electron's default sandboxed preload environment. Every renderer call to the main process goes through this bridge.

3. **Renderer** (`src/`).
   - `src/App.tsx` — single-component UI. Holds `boot`, `projects`, `projectDraft`, `gitStatus`, and `statusMessage` in local state, calls the bridge, and orchestrates the flow: select/create project → edit draft → `persistDraft` → `exportProjectToRepo` → `getGitStatus` / `publishRepository`.
   - `src/types.ts` — the `ProjectRecord` / `ExportTarget` / `ProviderProfile` / workflow types shared across layers.
   - `src/vite-env.d.ts` — declares the `window.fableglitch` bridge shape.

### Adding an IPC call

Any new renderer → main call requires changes in **three** files, in lockstep, or the call will fail silently or blow up the type-check:

1. `electron/main.mjs` — `ipcMain.handle('channel:name', ...)`.
2. `electron/preload.cjs` — add the method to the object passed to `contextBridge.exposeInMainWorld('fableglitch', ...)`.
3. `src/vite-env.d.ts` — add the method signature to `FableglitchBridge`.

### Data model notes

- `WorkflowStepId` is a closed union (`script | structure | storyboard | prompts | canvas | export`). The list and labels rendered in the UI come from the `workflowSteps` constant in `electron/main.mjs`, returned via `app:bootstrap` — the enum in `types.ts` and that list must agree.
- `providerCatalog` (also in `main.mjs`) drives the vendor dropdown; it is separate from the per-project `providerProfiles` seeded in `storage.mjs`.
- `durationMinutes` is clamped to `[1, 120]` in `storage.mjs#normalizeDuration` — the renderer also clamps in its inputs, but the main process is the source of truth.
- `projects` returned by `listProjects` are sorted by `updatedAt` descending; `updateProject` always rewrites `updatedAt`.

### TypeScript strictness

`tsconfig.app.json` has `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`, `noUnusedLocals`, and `noUnusedParameters` all on. Type-only imports must use `import type`, and unused bindings fail the build.
