# FableGlitch P0-D Asset Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete P0-D desktop workflow: create an episode, import/paste assets as local drafts, preview them, push selected drafts through the P0-B backend, and confirm the committed assets in the episode dashboard.

**Architecture:** Keep the renderer data-driven and small: one generic `AssetPanel` reads `asset_types`, local SQLite drafts, and remote pushed assets; import/paste flows both create the same local draft shape. Electron owns filesystem, SQLite, and multipart upload; React owns UI state, preview, and review screens. Backend APIs are already P0-B complete and must not be changed unless a discovered contract bug blocks the flow.

**Tech Stack:** Windows Electron main/preload, React 19 + Vite + Tailwind v4 tokens, Framer Motion, local SQLite via `better-sqlite3`, backend over Vercel API, `mammoth` for docx, `xlsx` for spreadsheets, `react-markdown` for markdown preview, Vitest for renderer/library tests.

---

## Scope Check

P0-D spans conversion libraries, Electron IPC, UI routes, previews, push review, and one Electron startup bug. These are tightly dependent in the single user workflow, so they belong in one plan. Work stays inside P0-D:

- Do: episode wizard, asset panels, draft storage, import/paste preview, pushed asset preview, push review, multipart push, dashboard draft badge/FAB, remote smoke, Electron normal-permission startup fix.
- Do not do: Agent-based script generation, image/video generation APIs, user prompt library, knowledge base, scorer agent, quotas, SAML/SSO/2FA, auto-update, SMTP customization.
- Storage split is fixed: do not change `asset_types.storage_backend`; GitHub remains text-only, R2 remains binary media.

---

## File Structure

New or modified files by responsibility:

```text
package.json                         add P0-D deps + test script
vitest.config.ts                     renderer/lib unit tests
src/test/fixtures/                   generated docx/xlsx fixtures for conversion tests

electron/local-db.mjs                add local_drafts CRUD + view_cache helpers
electron/file-system.mjs             save/read draft files, open file dialog, cache remote files
electron/api-client.mjs              add multipart push helper
electron/main.mjs                    register draft/fs/push IPC + startup path fix
electron/preload.mjs                 expose new IPC methods
src/vite-env.d.ts                    bridge types for drafts/fs/push

src/lib/docx.ts                      docx -> markdown
src/lib/xlsx.ts                      xlsx -> markdown table
src/lib/asset-types.ts               P0/P4 asset panel metadata mirror
src/lib/drafts.ts                    renderer draft API wrapper
src/lib/file-meta.ts                 file type, size, extension helpers
src/lib/routes.ts                    small internal route union (no external router)
src/lib/toast.tsx                    tiny toast provider for push feedback

src/components/wizards/EpisodeWizard.tsx
src/components/panels/AssetPanel.tsx
src/components/panels/ImportPreviewDialog.tsx
src/components/panels/PasteTextDialog.tsx
src/components/panels/preview/MdPreview.tsx
src/components/panels/preview/ImagePreview.tsx
src/components/panels/preview/VideoPreview.tsx
src/components/push/PushReviewRoute.tsx

src/routes/TreeRoute.tsx             dashboard opens wizard/panels/review, draft badge/FAB
src/routes/ShellEmptyRoute.tsx       opens EpisodeWizard instead of P0-D placeholder alert
src/App.tsx                          internal route switching
shared/types.ts                      add AssetRow, LocalDraft, PushResult frontend contracts
```

Global verification after every task:

```powershell
cd D:\VideoAPP
npx tsc -b --noEmit
npm run lint
```

For tasks with tests:

```powershell
cd D:\VideoAPP
npm run test -- <path-or-pattern>
```

Every task ends with `git commit` and `git push`. Do not include `.claude/settings.local.json` in commits.

---

## Task 1: Conversion Libs + Renderer Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/fixtures/make-fixtures.mjs`
- Create: `src/test/fixtures/script.docx`
- Create: `src/test/fixtures/shot-list.xlsx`
- Create: `src/lib/docx.ts`
- Create: `src/lib/docx.test.ts`
- Create: `src/lib/xlsx.ts`
- Create: `src/lib/xlsx.test.ts`

- [ ] **Step 1: Install dependencies**

Run:

```powershell
cd D:\VideoAPP
npm install mammoth xlsx react-markdown uuid
npm install -D vitest jsdom @testing-library/react @testing-library/user-event docx
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 2: Add test script and Vitest config**

Edit `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/backend/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
```

Create `src/test/setup.ts`:

```ts
import { afterEach } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
});
```

- [ ] **Step 3: Generate real fixture files**

Create `src/test/fixtures/make-fixtures.mjs`:

```mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import * as XLSX from 'xlsx';

const outDir = path.dirname(new URL(import.meta.url).pathname);

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ text: '侏儒怪 第一集', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('旁白：很久很久以前，有一座磨坊。'),
      new Paragraph('角色：磨坊主的女儿'),
    ],
  }],
});
await fs.writeFile(path.join(outDir, 'script.docx'), await Packer.toBuffer(doc));

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['镜号', '画面', '提示词'],
  ['001', '磨坊外景', 'moonlit mill, storybook style'],
  ['002', '室内纺线', 'girl spinning straw into gold'],
]);
XLSX.utils.book_append_sheet(wb, ws, 'shots');
XLSX.writeFile(wb, path.join(outDir, 'shot-list.xlsx'));
```

Run:

```powershell
node src/test/fixtures/make-fixtures.mjs
```

Expected: `script.docx` and `shot-list.xlsx` exist and are committed.

- [ ] **Step 4: Write failing conversion tests**

Create `src/lib/docx.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { docxToMarkdown } from './docx';

describe('docxToMarkdown', () => {
  it('converts a real docx script fixture into markdown text', async () => {
    const file = await readFile('src/test/fixtures/script.docx');
    const md = await docxToMarkdown(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

    expect(md).toContain('# 侏儒怪 第一集');
    expect(md).toContain('旁白：很久很久以前，有一座磨坊。');
    expect(md).toContain('角色：磨坊主的女儿');
  });
});
```

Create `src/lib/xlsx.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { xlsxToMarkdown } from './xlsx';

describe('xlsxToMarkdown', () => {
  it('converts a real xlsx fixture into a markdown table', async () => {
    const file = await readFile('src/test/fixtures/shot-list.xlsx');
    const md = await xlsxToMarkdown(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

    expect(md).toContain('| 镜号 | 画面 | 提示词 |');
    expect(md).toContain('| 001 | 磨坊外景 | moonlit mill, storybook style |');
    expect(md).toContain('| 002 | 室内纺线 | girl spinning straw into gold |');
  });
});
```

Run:

```powershell
npm run test -- src/lib/docx.test.ts src/lib/xlsx.test.ts
```

Expected: FAIL because `docx.ts` and `xlsx.ts` do not exist.

- [ ] **Step 5: Implement conversion libs**

Create `src/lib/docx.ts`:

```ts
import mammoth from 'mammoth';

export async function docxToMarkdown(input: File | ArrayBuffer): Promise<string> {
  const arrayBuffer = input instanceof File ? await input.arrayBuffer() : input;
  const result = await mammoth.convertToMarkdown({ arrayBuffer });
  return result.value.trim();
}
```

Create `src/lib/xlsx.ts`:

```ts
import * as XLSX from 'xlsx';

function escapeCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export async function xlsxToMarkdown(input: File | ArrayBuffer): Promise<string> {
  const arrayBuffer = input instanceof File ? await input.arrayBuffer() : input;
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return '';

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, blankrows: false });
  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => escapeCell(row[index])));
  const [header, ...body] = normalized;
  const divider = Array.from({ length: width }, () => '---');

  return [
    `| ${header.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/lib/docx.test.ts src/lib/xlsx.test.ts
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add package.json package-lock.json vitest.config.ts src/test src/lib/docx.ts src/lib/docx.test.ts src/lib/xlsx.ts src/lib/xlsx.test.ts
git commit -m "feat(p0d-1): docx and xlsx conversion libs"
git push
```

---

## Task 2: Local Draft SQLite + Filesystem IPC

**Files:**
- Modify: `electron/local-db.mjs`
- Create: `electron/file-system.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `src/vite-env.d.ts`
- Create: `src/lib/drafts.ts`
- Create: `src/lib/drafts.test.ts`
- Modify: `shared/types.ts`

- [ ] **Step 1: Add shared draft types**

Append to `shared/types.ts`:

```ts
export type AssetStage = 'ROUGH' | 'REVIEW' | 'FINAL';
export type AssetSource = 'imported' | 'pasted' | 'ai-generated';

export interface LocalDraft {
  id: string;
  episode_id: string;
  type_code: string;
  name: string;
  variant: string | null;
  number: number | null;
  version: number;
  stage: AssetStage;
  language: string;
  original_filename: string | null;
  final_filename: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  local_file_path: string;
  size_bytes: number;
  mime_type: string;
  source: AssetSource;
  created_at: string;
}

export type CreateLocalDraftInput = Omit<LocalDraft, 'created_at'>;
```

- [ ] **Step 2: Write renderer wrapper test**

Create `src/lib/drafts.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateLocalDraftInput } from '../../shared/types';
import { createDraft, listDrafts, deleteDraft } from './drafts';

const bridge = {
  db: {
    draftCreate: vi.fn(),
    draftsList: vi.fn(),
    draftDelete: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'fableglitch', { value: bridge, configurable: true });
});

describe('draft renderer wrapper', () => {
  it('forwards draft CRUD calls to Electron bridge', async () => {
    const input: CreateLocalDraftInput = {
      id: 'draft-1',
      episode_id: 'ep-1',
      type_code: 'SCRIPT',
      name: '侏儒怪',
      variant: null,
      number: null,
      version: 1,
      stage: 'ROUGH',
      language: 'ZH',
      original_filename: 'script.md',
      final_filename: '童话剧_侏儒怪_SCRIPT.md',
      storage_backend: 'github',
      storage_ref: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
      local_file_path: 'D:/drafts/draft-1.md',
      size_bytes: 12,
      mime_type: 'text/markdown',
      source: 'pasted',
    };
    bridge.db.draftCreate.mockResolvedValueOnce({ ...input, created_at: '2026-04-29T00:00:00Z' });
    bridge.db.draftsList.mockResolvedValueOnce([{ ...input, created_at: '2026-04-29T00:00:00Z' }]);

    await expect(createDraft(input)).resolves.toMatchObject({ id: 'draft-1' });
    await expect(listDrafts('ep-1')).resolves.toHaveLength(1);
    await deleteDraft('draft-1');

    expect(bridge.db.draftCreate).toHaveBeenCalledWith(input);
    expect(bridge.db.draftsList).toHaveBeenCalledWith('ep-1');
    expect(bridge.db.draftDelete).toHaveBeenCalledWith('draft-1');
  });
});
```

- [ ] **Step 3: Implement Electron draft/file IPC**

In `electron/local-db.mjs`, add:

```mjs
export function draftCreate(input) {
  const createdAt = new Date().toISOString();
  const row = { ...input, created_at: createdAt };
  ensureDb().prepare(`
    insert or replace into local_drafts (
      id, episode_id, type_code, name, variant, number, version, stage, language,
      original_filename, final_filename, local_file_path, size_bytes, mime_type, source, created_at
    ) values (
      @id, @episode_id, @type_code, @name, @variant, @number, @version, @stage, @language,
      @original_filename, @final_filename, @local_file_path, @size_bytes, @mime_type, @source, @created_at
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
```

Create `electron/file-system.mjs`:

```mjs
import { app, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

function draftsRoot() {
  return path.join(app.getPath('userData'), 'FableGlitch', 'drafts');
}

export async function saveDraftFile({ localDraftId, extension, content }) {
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  const dir = draftsRoot();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${localDraftId}${safeExt}`);
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  await fs.writeFile(filePath, data);
  return { path: filePath, size_bytes: data.byteLength };
}

export async function readDraftFile(filePath) {
  const data = await fs.readFile(filePath);
  return data;
}

export async function openFileDialog(filters) {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath);
  const stat = await fs.stat(filePath);
  return { path: filePath, name: path.basename(filePath), size_bytes: stat.size, content: data };
}
```

Register in `electron/main.mjs`:

```mjs
import { draftCreate, draftsList, draftDelete } from './local-db.mjs';
import { saveDraftFile, readDraftFile, openFileDialog } from './file-system.mjs';

ipcMain.handle('db:drafts:create', (_event, draft) => draftCreate(draft));
ipcMain.handle('db:drafts:list', (_event, episodeId) => draftsList(episodeId));
ipcMain.handle('db:drafts:delete', (_event, id) => draftDelete(id));
ipcMain.handle('fs:draft:save', (_event, payload) => saveDraftFile(payload));
ipcMain.handle('fs:draft:read', (_event, path) => readDraftFile(path));
ipcMain.handle('fs:file:open', (_event, filters) => openFileDialog(filters));
```

Expose in `electron/preload.mjs` under `db` and `fs`.

- [ ] **Step 4: Implement renderer wrapper**

Create `src/lib/drafts.ts`:

```ts
import type { CreateLocalDraftInput, LocalDraft } from '../../shared/types';

export function createDraft(input: CreateLocalDraftInput): Promise<LocalDraft> {
  return window.fableglitch.db.draftCreate(input);
}

export function listDrafts(episodeId: string): Promise<LocalDraft[]> {
  return window.fableglitch.db.draftsList(episodeId);
}

export function deleteDraft(id: string): Promise<void> {
  return window.fableglitch.db.draftDelete(id);
}
```

Update `src/vite-env.d.ts` bridge interfaces with `draftCreate`, `draftsList`, `draftDelete`, `fs.saveDraftFile`, `fs.readDraftFile`, and `fs.openFileDialog`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/lib/drafts.test.ts
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add shared/types.ts electron/local-db.mjs electron/file-system.mjs electron/main.mjs electron/preload.mjs src/vite-env.d.ts src/lib/drafts.ts src/lib/drafts.test.ts
git commit -m "feat(p0d-2): local draft storage and filesystem IPC"
git push
```

---

## Task 3: Episode Wizard

**Files:**
- Create: `src/components/wizards/EpisodeWizard.tsx`
- Create: `src/components/wizards/EpisodeWizard.test.tsx`
- Modify: `src/routes/ShellEmptyRoute.tsx`
- Modify: `src/routes/TreeRoute.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add API method**

Add to `src/lib/api.ts`:

```ts
createEpisode: (input: {
  series_name_cn: string;
  album_name_cn: string;
  content_name_cn: string;
  episode_name_cn: string;
}) => call<{ episode: { id: string; name_cn: string; episode_path: string } }>({
  method: 'POST',
  path: '/episodes',
  body: input,
  requireAuth: true,
}),
```

- [ ] **Step 2: Write wizard tests**

Create `src/components/wizards/EpisodeWizard.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EpisodeWizard } from './EpisodeWizard';

describe('EpisodeWizard', () => {
  it('submits four-step episode creation payload', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 'ep-1' });
    const onCreated = vi.fn();
    render(<EpisodeWizard open onClose={() => {}} onCreate={onCreate} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('系列'), { target: { value: '童话剧' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.change(screen.getByLabelText('专辑'), { target: { value: 'NA' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.change(screen.getByLabelText('内容'), { target: { value: '侏儒怪' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.change(screen.getByLabelText('剧集'), { target: { value: '第一集' } });
    expect(screen.getByText('童话剧_NA_侏儒怪')).toBeInTheDocument();
    fireEvent.click(screen.getByText('创建剧集'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      series_name_cn: '童话剧',
      album_name_cn: 'NA',
      content_name_cn: '侏儒怪',
      episode_name_cn: '第一集',
    }));
    expect(onCreated).toHaveBeenCalledWith('ep-1');
  });
});
```

Run: `npm run test -- src/components/wizards/EpisodeWizard.test.tsx`
Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement wizard**

Create `EpisodeWizard.tsx` with a Framer Motion modal matching `episode-wizard.html`:

```tsx
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

type Step = 0 | 1 | 2 | 3;

export function EpisodeWizard({
  open,
  onClose,
  onCreate,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { series_name_cn: string; album_name_cn: string; content_name_cn: string; episode_name_cn: string }) => Promise<{ id: string }>;
  onCreated: (episodeId: string) => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [series, setSeries] = useState('');
  const [album, setAlbum] = useState('NA');
  const [content, setContent] = useState('');
  const [episode, setEpisode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pathPreview = useMemo(() => [series, album, content].filter(Boolean).join('_'), [series, album, content]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const result = await onCreate({ series_name_cn: series, album_name_cn: album, content_name_cn: content, episode_name_cn: episode });
    setSubmitting(false);
    onCreated(result.id);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="w-[560px] bg-surface border border-border rounded-2xl p-8" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="font-mono text-2xs text-text-3 mb-3">step {step + 1}/4</div>
            <h2 className="text-xl font-bold mb-6">新建剧集</h2>
            {step === 0 && <Input label="系列" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="童话剧" />}
            {step === 1 && <Input label="专辑" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="NA" />}
            {step === 2 && <Input label="内容" value={content} onChange={(e) => setContent(e.target.value)} placeholder="侏儒怪" />}
            {step === 3 && (
              <>
                <Input label="剧集" value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="第一集" />
                <div className="font-mono text-xs text-accent bg-accent/10 border border-accent/30 rounded-lg p-3">{pathPreview}</div>
              </>
            )}
            {error && <div className="font-mono text-xs text-bad mt-3">{error}</div>}
            <div className="flex justify-between mt-8">
              <Button variant="secondary" onClick={step === 0 ? onClose : () => setStep((step - 1) as Step)}>返回</Button>
              {step < 3 ? (
                <Button variant="gradient" onClick={() => setStep((step + 1) as Step)}>下一步</Button>
              ) : (
                <Button variant="gradient" disabled={submitting} onClick={() => void submit()}>{submitting ? '创建中...' : '创建剧集'}</Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Wire ShellEmpty/Tree**

In `ShellEmptyRoute` and `TreeRoute`, clicking "新建我的第一个剧集" opens `EpisodeWizard`. The `onCreate` callback calls `api.createEpisode`; after success, close wizard, refresh `api.tree()`, select the new episode, and show the dashboard.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/components/wizards/EpisodeWizard.test.tsx
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add src/components/wizards src/routes/ShellEmptyRoute.tsx src/routes/TreeRoute.tsx src/App.tsx src/lib/api.ts
git commit -m "feat(p0d-3): episode creation wizard"
git push
```

---

## Task 4: Data-Driven AssetPanel

**Files:**
- Create: `src/lib/asset-types.ts`
- Create: `src/lib/file-meta.ts`
- Create: `src/components/panels/AssetPanel.tsx`
- Create: `src/components/panels/AssetPanel.test.tsx`
- Modify: `src/routes/TreeRoute.tsx`
- Modify: `src/lib/api.ts`
- Modify: `shared/types.ts`

- [ ] **Step 1: Add asset contracts**

Append to `shared/types.ts`:

```ts
export interface AssetRow {
  id: string;
  type_code: string;
  name: string;
  variant: string | null;
  version: number;
  stage: AssetStage;
  language: string;
  final_filename: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  file_size_bytes: number | null;
  pushed_at: string;
  status: 'draft' | 'pushed' | 'superseded';
}

export interface AssetsListResult {
  assets: AssetRow[];
  total: number;
}
```

Add API methods:

```ts
assets: (input: { episode_id: string; type_code?: string }) => {
  const qs = new URLSearchParams({ episode_id: input.episode_id });
  if (input.type_code) qs.set('type_code', input.type_code);
  return call<AssetsListResult>({ method: 'GET', path: `/assets?${qs.toString()}`, requireAuth: true });
},
```

- [ ] **Step 2: Asset metadata**

Create `src/lib/asset-types.ts` with the 12 fixed rows from spec §9.A. Example shape:

```ts
import type { AssetType } from '../../shared/types';

export const ASSET_TYPES: AssetType[] = [
  { code: 'SCRIPT', name_cn: '剧本', icon: '📝', folder_path: '02_Data/Script', filename_tpl: '{series}_{content}_SCRIPT', file_exts: ['.docx', '.md', '.txt'], storage_ext: '.md', storage_backend: 'github', parent_panel: 'SCRIPT', needs_before: [], supports_paste: true, allow_ai_generate: false, sort_order: 10, enabled: true },
  { code: 'PROMPT_IMG', name_cn: '分镜图提示词', icon: '🖼️', folder_path: '02_Data/Prompt/Image', filename_tpl: '{content}_PROMPT_IMG_{number:03}_v{version:03}', file_exts: ['.xlsx', '.md', '.txt'], storage_ext: '.md', storage_backend: 'github', parent_panel: 'PROMPT', needs_before: ['SCRIPT'], supports_paste: true, allow_ai_generate: false, sort_order: 20, enabled: true },
  { code: 'PROMPT_VID', name_cn: '分镜视频提示词', icon: '🎞️', folder_path: '02_Data/Prompt/Video', filename_tpl: '{content}_PROMPT_VID_{number:03}_v{version:03}', file_exts: ['.xlsx', '.md', '.txt'], storage_ext: '.md', storage_backend: 'github', parent_panel: 'PROMPT', needs_before: ['SCRIPT'], supports_paste: true, allow_ai_generate: false, sort_order: 21, enabled: true },
  { code: 'SHOT_IMG', name_cn: '分镜图', icon: '🖼️', folder_path: '02_Data/Shot/{episode}/Images', filename_tpl: '{content}_SHOT_{number:03}_v{version:03}', file_exts: ['.png', '.jpg', '.jpeg', '.webp'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'SHOT', needs_before: ['PROMPT_IMG'], supports_paste: false, allow_ai_generate: true, sort_order: 22, enabled: true },
  { code: 'SHOT_VID', name_cn: '分镜视频', icon: '🎬', folder_path: '02_Data/Shot/{episode}/Videos', filename_tpl: '{content}_SHOT_{number:03}_v{version:03}', file_exts: ['.mp4', '.mov', '.webm'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'SHOT', needs_before: ['SHOT_IMG'], supports_paste: false, allow_ai_generate: true, sort_order: 23, enabled: true },
  { code: 'CHAR', name_cn: '角色', icon: '👤', folder_path: '02_Data/Assets/Characters', filename_tpl: '{content}_CHAR_{name}_{variant}_v{version:03}', file_exts: ['.png', '.jpg', '.jpeg', '.webp'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'ASSET', needs_before: [], supports_paste: false, allow_ai_generate: true, sort_order: 30, enabled: true },
  { code: 'PROP', name_cn: '道具', icon: '🎒', folder_path: '02_Data/Assets/Props', filename_tpl: '{content}_PROP_{name}_{variant}_v{version:03}', file_exts: ['.png', '.jpg', '.jpeg', '.webp'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'ASSET', needs_before: [], supports_paste: false, allow_ai_generate: true, sort_order: 31, enabled: true },
  { code: 'SCENE', name_cn: '场景', icon: '🏞️', folder_path: '02_Data/Assets/Scenes', filename_tpl: '{content}_SCENE_{name}_{variant}_v{version:03}', file_exts: ['.png', '.jpg', '.jpeg', '.webp'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'ASSET', needs_before: [], supports_paste: false, allow_ai_generate: true, sort_order: 32, enabled: true },
  { code: 'DIALOG', name_cn: '对白', icon: '💬', folder_path: '02_Data/Audio/Dialog', filename_tpl: '{content}_DIALOG_{language}_v{version:03}', file_exts: ['.wav', '.mp3'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'AUDIO', needs_before: [], supports_paste: false, allow_ai_generate: false, sort_order: 40, enabled: false },
  { code: 'BGM', name_cn: '配乐', icon: '🎵', folder_path: '02_Data/Audio/BGM', filename_tpl: '{content}_BGM_{name}_v{version:03}', file_exts: ['.wav', '.mp3'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'AUDIO', needs_before: [], supports_paste: false, allow_ai_generate: false, sort_order: 41, enabled: false },
  { code: 'SONG', name_cn: '歌曲', icon: '🎤', folder_path: '02_Data/Audio/Song', filename_tpl: '{content}_SONG_{name}_v{version:03}', file_exts: ['.wav', '.mp3'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'AUDIO', needs_before: [], supports_paste: false, allow_ai_generate: false, sort_order: 42, enabled: false },
  { code: 'SFX', name_cn: '音效', icon: '🔊', folder_path: '02_Data/Audio/SFX', filename_tpl: '{content}_SFX_{name}_v{version:03}', file_exts: ['.wav', '.mp3'], storage_ext: 'keep_as_is', storage_backend: 'r2', parent_panel: 'AUDIO', needs_before: [], supports_paste: false, allow_ai_generate: false, sort_order: 43, enabled: false },
];

export function getAssetType(code: string): AssetType | undefined {
  return ASSET_TYPES.find((type) => type.code === code);
}
```

- [ ] **Step 3: Write panel test**

Create `src/components/panels/AssetPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetPanel } from './AssetPanel';
import { ASSET_TYPES } from '../../lib/asset-types';

describe('AssetPanel', () => {
  it('renders import, paste, drafts, and pushed lists from data', () => {
    render(
      <AssetPanel
        assetType={ASSET_TYPES[0]}
        episodeId="ep-1"
        drafts={[{ id: 'd1', name: '剧本草稿', final_filename: 'a.md' } as any]}
        pushedAssets={[{ id: 'a1', name: '剧本入库', final_filename: 'b.md' } as any]}
        onImport={vi.fn()}
        onPaste={vi.fn()}
        onPreviewAsset={vi.fn()}
      />,
    );

    expect(screen.getByText('剧本')).toBeInTheDocument();
    expect(screen.getByText('导入文件')).toBeInTheDocument();
    expect(screen.getByText('粘贴文本')).toBeInTheDocument();
    expect(screen.getByText('剧本草稿')).toBeInTheDocument();
    expect(screen.getByText('剧本入库')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Implement AssetPanel**

Create `src/components/panels/AssetPanel.tsx`:

```tsx
import type { AssetRow, AssetType, LocalDraft } from '../../../shared/types';
import { Button } from '../ui/Button';

export function AssetPanel({
  assetType,
  episodeId,
  drafts,
  pushedAssets,
  onImport,
  onPaste,
  onPreviewAsset,
}: {
  assetType: AssetType;
  episodeId: string;
  drafts: LocalDraft[];
  pushedAssets: AssetRow[];
  onImport: () => void;
  onPaste: () => void;
  onPreviewAsset: (asset: AssetRow) => void;
}) {
  return (
    <div className="max-w-[880px] mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-4xl mb-3">{assetType.icon}</div>
          <h1 className="text-4xl font-bold tracking-tight">{assetType.name_cn}</h1>
          <div className="font-mono text-xs text-text-3 mt-2">{episodeId} · {drafts.length} drafts · {pushedAssets.length} pushed</div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onImport}>导入文件</Button>
          {assetType.supports_paste && <Button variant="gradient" onClick={onPaste}>粘贴文本</Button>}
        </div>
      </div>
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-3">本地草稿</h2>
        <div className="space-y-2">{drafts.map((draft) => <AssetListRow key={draft.id} label={draft.name} filename={draft.final_filename} />)}</div>
      </section>
      <section>
        <h2 className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-3">已入库</h2>
        <div className="space-y-2">
          {pushedAssets.map((asset) => (
            <button key={asset.id} type="button" onClick={() => onPreviewAsset(asset)} className="w-full text-left">
              <AssetListRow label={asset.name} filename={asset.final_filename} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AssetListRow({ label, filename }: { label: string; filename: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3">
      <div className="text-sm text-text">{label}</div>
      <div className="font-mono text-xs text-text-3 mt-1">{filename}</div>
    </div>
  );
}
```

- [ ] **Step 5: Wire dashboard cards**

In `TreeRoute`, panel cards call `openPanel(typeCode)` for enabled P0 cards. The view state renders `AssetPanel` with drafts from `listDrafts(episodeId)` filtered by `type_code`, and pushed assets from `api.assets({ episode_id, type_code })`.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/components/panels/AssetPanel.test.tsx
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add shared/types.ts src/lib/asset-types.ts src/lib/file-meta.ts src/components/panels/AssetPanel.tsx src/components/panels/AssetPanel.test.tsx src/routes/TreeRoute.tsx src/lib/api.ts
git commit -m "feat(p0d-4): data-driven AssetPanel"
git push
```

---

## Task 5: Import Preview Dialog

**Files:**
- Create: `src/components/panels/ImportPreviewDialog.tsx`
- Create: `src/components/panels/ImportPreviewDialog.test.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/routes/TreeRoute.tsx`
- Modify: `src/lib/drafts.ts`

- [ ] **Step 1: Add preview filename API**

Add to `src/lib/api.ts`:

```ts
previewFilename: (input: {
  episode_id: string;
  type_code: string;
  name?: string;
  variant?: string;
  number?: number;
  version?: number;
  stage?: 'ROUGH' | 'REVIEW' | 'FINAL';
  language?: string;
  original_filename?: string;
}) => call<{ final_filename: string; storage_backend: 'github' | 'r2'; storage_ref: string; collision?: unknown }>({
  method: 'POST',
  path: '/assets/preview-filename',
  body: input,
  requireAuth: true,
}),
```

- [ ] **Step 2: Write dialog test**

Create `ImportPreviewDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportPreviewDialog } from './ImportPreviewDialog';
import { ASSET_TYPES } from '../../lib/asset-types';

describe('ImportPreviewDialog', () => {
  it('shows final filename and saves draft', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportPreviewDialog
        open
        assetType={ASSET_TYPES[5]}
        episodeId="ep-1"
        file={{ name: 'hero.png', size: 4, mime_type: 'image/png', content: new ArrayBuffer(4) }}
        preview={{ final_filename: '侏儒怪_CHAR_主角_v001.png', storage_backend: 'r2', storage_ref: 'x/y.png' }}
        onClose={() => {}}
        onSaveDraft={onSave}
      />,
    );

    expect(screen.getByText('侏儒怪_CHAR_主角_v001.png')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '主角' } });
    fireEvent.click(screen.getByText('保存为草稿'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
```

- [ ] **Step 3: Implement dialog**

Create `ImportPreviewDialog.tsx`:

```tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AssetType, CreateLocalDraftInput } from '../../../shared/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export interface PendingImportFile {
  name: string;
  size: number;
  mime_type: string;
  content: ArrayBuffer;
}

export function ImportPreviewDialog({
  open,
  assetType,
  episodeId,
  file,
  preview,
  onClose,
  onSaveDraft,
}: {
  open: boolean;
  assetType: AssetType;
  episodeId: string;
  file: PendingImportFile;
  preview: { final_filename: string; storage_backend: 'github' | 'r2'; storage_ref: string };
  onClose: () => void;
  onSaveDraft: (draft: Omit<CreateLocalDraftInput, 'id' | 'local_file_path'>, content: ArrayBuffer) => Promise<void>;
}) {
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ''));
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="w-[720px] bg-surface border border-border rounded-2xl p-8" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xl font-bold mb-6">导入预览 · {assetType.name_cn}</h2>
            <Input label="名称" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="font-mono text-xs text-accent bg-accent/10 border border-accent/30 rounded-lg p-3 mb-4">{preview.final_filename}</div>
            <div className="font-mono text-xs text-text-3 mb-6">{file.name} · {file.size} bytes · {preview.storage_ref}</div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button variant="gradient" onClick={() => void onSaveDraft({
                episode_id: episodeId,
                type_code: assetType.code,
                name,
                variant: null,
                number: null,
                version: 1,
                stage: 'ROUGH',
                language: 'ZH',
                original_filename: file.name,
                final_filename: preview.final_filename,
                storage_backend: preview.storage_backend,
                storage_ref: preview.storage_ref,
                size_bytes: file.size,
                mime_type: file.mime_type,
                source: 'imported',
              }, file.content)}>保存为草稿</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Wire import flow**

In `TreeRoute`/panel controller:

1. Call `window.fableglitch.fs.openFileDialog([{ name: assetType.name_cn, extensions: assetType.file_exts.map(ext => ext.slice(1)) }])`.
2. Convert `.docx` through `docxToMarkdown`; convert `.xlsx` through `xlsxToMarkdown`; store converted markdown as `.md`.
3. Call `api.previewFilename` with `episode_id`, `type_code`, `name`, `original_filename`.
4. Open `ImportPreviewDialog`.
5. On save, generate `crypto.randomUUID()`, call `fs.saveDraftFile`, then `createDraft`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/components/panels/ImportPreviewDialog.test.tsx
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add src/components/panels/ImportPreviewDialog.tsx src/components/panels/ImportPreviewDialog.test.tsx src/routes/TreeRoute.tsx src/lib/api.ts src/lib/drafts.ts
git commit -m "feat(p0d-5): import preview dialog and draft save flow"
git push
```

---

## Task 6: Paste Text Flow

**Files:**
- Create: `src/components/panels/PasteTextDialog.tsx`
- Create: `src/components/panels/PasteTextDialog.test.tsx`
- Modify: `src/routes/TreeRoute.tsx`

- [ ] **Step 1: Write paste dialog test**

Create `PasteTextDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PasteTextDialog } from './PasteTextDialog';
import { ASSET_TYPES } from '../../lib/asset-types';

describe('PasteTextDialog', () => {
  it('saves pasted markdown text as a draft', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PasteTextDialog open assetType={ASSET_TYPES[0]} onClose={() => {}} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '剧本' } });
    fireEvent.change(screen.getByLabelText('文本内容'), { target: { value: '# hello' } });
    fireEvent.click(screen.getByText('继续预览'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: '剧本', markdown: '# hello' }));
  });
});
```

- [ ] **Step 2: Implement paste dialog**

Create `PasteTextDialog.tsx`:

```tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AssetType } from '../../../shared/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export function PasteTextDialog({
  open,
  assetType,
  onClose,
  onSave,
}: {
  open: boolean;
  assetType: AssetType;
  onClose: () => void;
  onSave: (input: { name: string; markdown: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [markdown, setMarkdown] = useState('');

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="w-[720px] bg-surface border border-border rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-6">粘贴文本 · {assetType.name_cn}</h2>
            <Input label="名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="剧本 / 提示词" />
            <label className="block text-sm text-text-2 font-medium mb-2" htmlFor="paste-text">文本内容</label>
            <textarea id="paste-text" className="w-full min-h-64 bg-surface-2 border border-border rounded-lg p-3 font-mono text-sm outline-none focus:border-accent/35" value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button variant="gradient" onClick={() => void onSave({ name, markdown })}>继续预览</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Wire paste flow**

In `AssetPanel`, the paste button is visible only when `assetType.supports_paste`. In `TreeRoute`, paste save:

1. Convert pasted text to `ArrayBuffer` via `new TextEncoder().encode(markdown).buffer`.
2. Call `api.previewFilename` with `original_filename: `${name}.md``.
3. Reuse `ImportPreviewDialog` by passing a synthetic file `{ name: `${name}.md`, mime_type: 'text/markdown', content }`.
4. Save as `source: 'pasted'`.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/components/panels/PasteTextDialog.test.tsx
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add src/components/panels/PasteTextDialog.tsx src/components/panels/PasteTextDialog.test.tsx src/routes/TreeRoute.tsx src/components/panels/AssetPanel.tsx
git commit -m "feat(p0d-6): paste text assets into local drafts"
git push
```

---

## Task 7: Markdown/Image/Video Preview

**Files:**
- Create: `src/components/panels/preview/MdPreview.tsx`
- Create: `src/components/panels/preview/ImagePreview.tsx`
- Create: `src/components/panels/preview/VideoPreview.tsx`
- Create: `src/components/panels/preview/AssetPreviewDialog.tsx`
- Create: `src/components/panels/preview/MdPreview.test.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/routes/TreeRoute.tsx`

- [ ] **Step 1: Add content fetch API**

Add to `src/lib/api.ts`:

```ts
assetContent: (id: string) =>
  call<string>({ method: 'GET', path: `/assets/${id}/content`, requireAuth: true }),
```

If the backend returns a redirect for R2, Electron `fetch` follows it and returns the final body. Binary preview for R2 should use `window.fableglitch.net.downloadAssetContent(id)` if raw binary is needed; add that IPC only if image/video cannot be displayed through a presigned URL in smoke.

- [ ] **Step 2: Write markdown preview test**

Create `MdPreview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MdPreview } from './MdPreview';

describe('MdPreview', () => {
  it('renders markdown headings and paragraphs', () => {
    render(<MdPreview markdown="# 标题\n\n正文" />);
    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument();
    expect(screen.getByText('正文')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement preview components**

Create `MdPreview.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';

export function MdPreview({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert max-w-none text-sm">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}
```

Create `ImagePreview.tsx`:

```tsx
export function ImagePreview({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="max-h-[70vh] max-w-full object-contain rounded-lg border border-border" />;
}
```

Create `VideoPreview.tsx`:

```tsx
export function VideoPreview({ src }: { src: string }) {
  return <video src={src} controls className="max-h-[70vh] max-w-full rounded-lg border border-border" />;
}
```

Create `AssetPreviewDialog.tsx` as a Framer Motion modal that switches by `asset.mime_type`: markdown uses `MdPreview`, image uses `ImagePreview`, video uses `VideoPreview`.

- [ ] **Step 4: Wire pushed asset preview**

In `AssetPanel`, clicking a pushed asset calls `onPreviewAsset`. In `TreeRoute`, fetch `/assets/:id/content`, open `AssetPreviewDialog`, and show loading/error states. Draft preview remains local and is handled in Task 8/9 if needed for review.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/components/panels/preview/MdPreview.test.tsx
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add src/components/panels/preview src/routes/TreeRoute.tsx src/lib/api.ts
git commit -m "feat(p0d-7): asset content previews"
git push
```

---

## Task 8: Push Review Route

**Files:**
- Create: `src/components/push/PushReviewRoute.tsx`
- Create: `src/components/push/PushReviewRoute.test.tsx`
- Modify: `src/routes/TreeRoute.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write review test**

Create `PushReviewRoute.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LocalDraft } from '../../../shared/types';
import { PushReviewRoute } from './PushReviewRoute';

const draft = {
  id: 'd1',
  episode_id: 'ep-1',
  type_code: 'SCRIPT',
  name: '剧本',
  final_filename: 'script.md',
  size_bytes: 12,
  source: 'pasted',
} as LocalDraft;

describe('PushReviewRoute', () => {
  it('selects drafts and submits selected ids with commit message', () => {
    const onPush = vi.fn();
    render(<PushReviewRoute drafts={[draft]} onBack={() => {}} onPush={onPush} pushing={false} />);

    fireEvent.click(screen.getByLabelText('选择 script.md'));
    fireEvent.change(screen.getByLabelText('commit message'), { target: { value: 'push script' } });
    fireEvent.click(screen.getByText('推送'));

    expect(onPush).toHaveBeenCalledWith({ draftIds: ['d1'], commitMessage: 'push script' });
  });
});
```

- [ ] **Step 2: Implement review route**

Create `PushReviewRoute.tsx` matching `push-review.html`: grouped by `type_code`, checkbox per draft, commit message input, fixed bottom bar with selected count and total bytes.

Core submit shape:

```ts
export interface PushReviewSubmit {
  draftIds: string[];
  commitMessage: string;
}
```

The button text is `推送`; disabled when no drafts are selected or `pushing`.

- [ ] **Step 3: Wire from TreeRoute**

Tree dashboard top action and FAB open `PushReviewRoute` for the current episode when `drafts.length > 0`. The route can be a local state branch in `TreeRoute`; no external router is required.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/components/push/PushReviewRoute.test.tsx
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add src/components/push src/routes/TreeRoute.tsx src/App.tsx
git commit -m "feat(p0d-8): push review route"
git push
```

---

## Task 9: Multipart Push + Idempotency

**Files:**
- Modify: `electron/api-client.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `src/vite-env.d.ts`
- Modify: `src/components/push/PushReviewRoute.tsx`
- Modify: `src/routes/TreeRoute.tsx`
- Modify: `src/lib/drafts.ts`
- Modify: `shared/types.ts`

- [ ] **Step 1: Add push result types**

Append to `shared/types.ts`:

```ts
export interface PushAssetResult {
  local_draft_id: string;
  id: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  final_filename: string;
  status: 'pushed';
}

export interface PushResult {
  commit_sha?: string;
  assets: PushAssetResult[];
}
```

- [ ] **Step 2: Implement Electron multipart helper**

Add to `electron/api-client.mjs`:

```mjs
export async function pushAssets({ payload, files }) {
  const access = getAccessToken();
  if (!access) return { status: 401, body: { ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing session' } } };

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const file of files) {
    form.append(`file__${file.local_draft_id}`, new Blob([file.content], { type: file.mime_type }), file.original_filename ?? file.local_draft_id);
  }

  const res = await fetch(`${BASE}/assets/push`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
```

Register IPC:

```mjs
ipcMain.handle('net:assets:push', (_event, payload) => pushAssets(payload));
```

Expose `window.fableglitch.net.pushAssets`.

- [ ] **Step 3: Wire selected draft push**

In `TreeRoute`, `onPush`:

1. Generate `idempotency_key` via `crypto.randomUUID()`.
2. Load selected draft file bytes with `fs.readDraftFile`.
3. Build `payload.items` from draft fields.
4. Call `window.fableglitch.net.pushAssets`.
5. On success, delete each selected draft via `deleteDraft`.
6. Refresh drafts, assets, and episode detail.
7. On `GITHUB_CONFLICT`, show message `同事刚推过新内容，请重试。`
8. On `FILE_TOO_LARGE`, show message `文件超过大小限制。`
9. On `RATE_LIMITED`, show retry-after text if present in backend message/details.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add shared/types.ts electron/api-client.mjs electron/main.mjs electron/preload.mjs src/vite-env.d.ts src/components/push/PushReviewRoute.tsx src/routes/TreeRoute.tsx src/lib/drafts.ts
git commit -m "feat(p0d-9): multipart asset push with idempotency"
git push
```

---

## Task 10: Dashboard Draft Badge + Push FAB

**Files:**
- Modify: `src/routes/TreeRoute.tsx`
- Modify: `src/components/chrome/ProjectTree.tsx`

- [ ] **Step 1: Add dashboard draft affordances**

In `TreeRoute` dashboard:

```tsx
{draftCount > 0 && (
  <div className="font-mono text-xs text-warn mb-6">
    <span className="inline-block w-2 h-2 rounded-full bg-warn mr-1.5" />
    {draftCount} 个本地草稿待入库
  </div>
)}
```

Add fixed FAB:

```tsx
{draftCount > 0 && (
  <button
    type="button"
    onClick={openPushReview}
    className="fixed right-10 bottom-10 h-13 px-5 rounded-full bg-gradient-brand text-white font-semibold shadow-glow"
  >
    ⚡ 入库 <span className="font-mono text-xs bg-white/20 rounded-full px-2 py-0.5">{draftCount}</span>
  </button>
)}
```

- [ ] **Step 2: Refresh draft count consistently**

When selecting an episode, saving a draft, deleting a draft, or finishing push, call `listDrafts(episodeId)` and update `draftCountByEpisode`. Pass counts into `ProjectTree` if the sidebar should show draft hints.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npx tsc -b --noEmit
npm run lint
```

Commit:

```powershell
git add src/routes/TreeRoute.tsx src/components/chrome/ProjectTree.tsx
git commit -m "feat(p0d-10): dashboard draft badge and push FAB"
git push
```

---

## Task 11: Remote Smoke Full P0-D Loop

**Files:**
- No code files unless bugs are found

- [ ] **Step 1: Build and run Electron**

Run:

```powershell
cd D:\VideoAPP
npm run build
npm run start
```

Expected: Electron starts as normal user after Task 12 fix if Task 12 has already been executed; if normal launch still fails, stop and execute Task 12 before tagging.

- [ ] **Step 2: Full manual workflow**

Use `meilinle@beva.com` admin test account:

1. Login.
2. Create new episode: 系列 `童话剧`, 专辑 `NA`, 内容 `侏儒怪`, 剧集 `第一集`.
3. Open new episode dashboard.
4. Open `SCRIPT` panel.
5. Import `src/test/fixtures/script.docx`; verify converted markdown preview; save as draft.
6. Open `CHAR` panel.
7. Import a small `.png` fixture; verify image preview; save as draft.
8. Return dashboard; verify draft badge shows `2`.
9. Open push review; select both drafts; push.
10. Verify success toast, drafts disappear, pushed asset counts refresh.
11. Verify GitHub asset-library received a commit for the markdown file.
12. Verify Supabase `assets` table contains both asset rows.

- [ ] **Step 3: Tag if full loop passes**

Run:

```powershell
git tag p0d-complete
git push origin --tags
```

Commit only if bug fixes were required:

```powershell
git add <bug-fix-files>
git commit -m "fix(p0d-11): remote smoke fixes"
git push
```

---

## Task 12: Fix Electron Normal-Permission Startup Bug

**Files:**
- Modify: `electron/main.mjs`
- Modify: `package.json` if builder config needs per-user install/cache settings
- Create: `electron/startup-paths.mjs`

**Problem:** During P0-C smoke, launching Electron as a normal user failed with Windows cache/Mojo `拒绝访问`; launching elevated worked. Production users must not need "Run as administrator".

- [ ] **Step 1: Add startup path module**

Create `electron/startup-paths.mjs`:

```mjs
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function ensureWritable(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
  return dir;
}

export function configureWritableAppPaths() {
  const base = path.join(app.getPath('appData'), 'FableGlitch Studio');
  const userData = ensureWritable(path.join(base, 'userData'));
  const cache = ensureWritable(path.join(base, 'cache'));
  const logs = ensureWritable(path.join(base, 'logs'));

  app.setPath('userData', userData);
  app.setPath('cache', cache);
  app.setPath('logs', logs);

  return { userData, cache, logs, temp: os.tmpdir() };
}
```

- [ ] **Step 2: Call before BrowserWindow creation**

In `electron/main.mjs`:

```mjs
import { configureWritableAppPaths } from './startup-paths.mjs';

app.whenReady().then(async () => {
  configureWritableAppPaths();
  await createMainWindow();
  ...
});
```

If failure happens before `ready`, move `configureWritableAppPaths()` immediately after imports and before any `BrowserWindow`/session usage; `app.setPath` is legal before ready.

- [ ] **Step 3: Verify normal launch**

Run without elevation:

```powershell
cd D:\VideoAPP
npm run build
& .\node_modules\electron\dist\electron.exe .
```

Expected: no `platform_channel.cc:108` fatal, no cache access denied, window stays open.

Then run packaged app smoke:

```powershell
npm run dist
```

Install generated NSIS as current user if possible; launch without administrator. Expected: app starts and login screen is usable.

- [ ] **Step 4: Commit**

```powershell
git add electron/main.mjs electron/startup-paths.mjs package.json
git commit -m "fix(p0d-12): use writable Electron userData and cache paths"
git push
```

---

## Self-Review

**Spec coverage:**
- Episode wizard: Task 3
- Asset import conversion docx/xlsx: Task 1 + Task 5
- Local draft persistence: Task 2
- Data-driven AssetPanel: Task 4
- Paste text assets: Task 6
- Pushed asset content preview: Task 7
- Push review page: Task 8
- Multipart push/idempotency: Task 9
- Dashboard draft badge/FAB: Task 10
- Remote smoke and `p0d-complete` tag: Task 11
- Electron normal-permission startup bug: Task 12

**Placeholder scan:**
- No banned placeholder phrases remain.
- P1+ items are explicitly excluded, not deferred inside tasks.
- The only manual verification is Task 11 remote smoke because it requires real GitHub/Supabase observation.

**Type consistency:**
- Drafts use `LocalDraft` and `CreateLocalDraftInput`.
- Asset stages and sources reuse `AssetStage` / `AssetSource`.
- Push uses backend field names exactly: `idempotency_key`, `local_draft_id`, `episode_id`, `type_code`, `final_filename`, `storage_ref`.
- Renderer bridge names are stable: `db.draftCreate`, `db.draftsList`, `db.draftDelete`, `fs.saveDraftFile`, `fs.readDraftFile`, `fs.openFileDialog`, `net.pushAssets`.

**Execution notes:**
- Execute tasks in order. Task 11 should run after Task 12 if normal-permission Electron launch still fails before the smoke can start.
- Stop and ask 乐美林 before changing storage_backend rules, adding generation APIs, inventing new asset types, or broadening P0-D into P1 features.
