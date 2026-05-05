# LibLib BrowserView Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a true in-app LibLib canvas embed for the Studio canvas stage using Electron `BrowserView`, with persistent LibLib login cookies and a browser fallback.

**Architecture:** The renderer owns the visible CanvasStage shell and reports the exact rectangle where the external canvas should appear. Electron main owns the `BrowserView` lifecycle, URL validation, cookie partition, bounds updates, hide/show behavior, and fallback external browser opening. The preload bridge exposes a small `window.fableglitch.canvas` API so React never touches Electron internals directly.

**Tech Stack:** Electron 41.2.2, React 19, TypeScript, Vite, Vitest, PowerShell on Windows.

---

## Scope

This is **not** P5 self-built canvas. This is a P1.2/P1.3 bridge for the current production workflow: let users use the real LibLib web canvas inside VideoAPP, while keeping our own read-only asset chain preview available.

In scope:

- Add a true Electron `BrowserView` embed for LibLib.
- Persist LibLib session with partition `persist:liblib`.
- Restrict loaded URLs to LibLib canvas/login origins.
- Add a CanvasStage tab: `链路预览` and `LibLib 画布`.
- Save the current LibLib share URL into local `studio_stage_state.canvas`.
- Hide/destroy the BrowserView whenever the user leaves the LibLib tab/stage/window.
- Provide a fallback “在浏览器打开” button.

Out of scope:

- Scraping or auto-exporting assets from LibLib.
- Self-built tldraw/fabric/3D canvas.
- New company asset types.
- Supabase/R2/GitHub writes from personal creation cockpit except existing export flow.

## File Structure

Create:

- `electron/liblib-canvas.mjs`  
  Pure-ish controller helpers for URL validation, bounds normalization, and creating/managing a LibLib BrowserView. Main process imports this.

- `electron/liblib-canvas.test.mjs`  
  Unit tests for URL allowlist and bounds normalization. These do not instantiate real Electron windows.

Modify:

- `electron/main.mjs`  
  Import `BrowserView` and `shell`; register `canvas:liblib:*` IPC handlers; create/destroy/hide view on window close.

- `electron/preload.cjs`  
  Expose `window.fableglitch.canvas.liblibShow`, `liblibHide`, `liblibSetBounds`, `liblibOpenExternal`.

- `src/vite-env.d.ts`  
  Add `FableglitchCanvas` interface and include it in `FableglitchBridge`.

- `src/components/studio/stages/CanvasStage.tsx`  
  Add two tabs, URL input, embedded view host, ResizeObserver bounds reporting, hide/show cleanup.

- `src/components/studio/stages/CanvasStage.test.tsx`  
  Add React tests for URL save, bridge calls, tab switching, and cleanup.

- `src/routes/StudioWorkspaceRoute.tsx`  
  Pass `stateJson` and `onSaveState` into `CanvasStage`.

- `src/routes/StudioWorkspaceRoute.test.tsx`  
  Verify canvas stage state can be saved through `studio.stageSave`.

## Data Contract

Canvas stage state remains a JSON blob in `studio_stage_state`:

```json
{
  "liblib_url": "https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd",
  "active_tab": "liblib"
}
```

Renderer bridge shape:

```ts
interface LiblibBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FableglitchCanvas {
  liblibShow: (input: { url: string; bounds: LiblibBounds }) => Promise<{ ok: true; url: string }>;
  liblibSetBounds: (bounds: LiblibBounds) => Promise<{ ok: true }>;
  liblibHide: () => Promise<{ ok: true }>;
  liblibOpenExternal: (url: string) => Promise<{ ok: true; url: string }>;
}
```

Allowed URL rules:

- Allow `https://www.liblib.tv/canvas/...`
- Allow `https://www.liblib.tv/canvas/share?...`
- Allow `https://www.liblib.tv/login...` if LibLib redirects to login.
- Allow `https://liblib.tv/...` only if it redirects to `www.liblib.tv`; otherwise normalize to `https://www.liblib.tv`.
- Reject `javascript:`, `file:`, `http:`, non-LibLib domains, empty values.

## Task 1: Electron LibLib Controller

**Files:**

- Create: `electron/liblib-canvas.mjs`
- Create: `electron/liblib-canvas.test.mjs`

- [ ] **Step 1: Write failing URL validation tests**

Create `electron/liblib-canvas.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { normalizeLiblibUrl, normalizeBounds } from './liblib-canvas.mjs';

describe('liblib canvas helpers', () => {
  it('normalizes valid LibLib canvas URLs', () => {
    expect(normalizeLiblibUrl('https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd')).toBe(
      'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
    );
    expect(normalizeLiblibUrl('https://liblib.tv/canvas')).toBe('https://www.liblib.tv/canvas');
  });

  it('rejects non-LibLib and unsafe URLs', () => {
    expect(() => normalizeLiblibUrl('javascript:alert(1)')).toThrow('LibLib URL 不合法');
    expect(() => normalizeLiblibUrl('file:///C:/secret.txt')).toThrow('LibLib URL 不合法');
    expect(() => normalizeLiblibUrl('https://example.com/canvas')).toThrow('LibLib URL 不合法');
  });

  it('clamps bounds to safe integer rectangles', () => {
    expect(normalizeBounds({ x: 10.4, y: 20.8, width: 300.2, height: 200.9 })).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 201,
    });
    expect(normalizeBounds({ x: -4, y: -9, width: 0, height: 2 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 2,
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm test -- electron/liblib-canvas.test.mjs
```

Expected: FAIL because `electron/liblib-canvas.mjs` does not exist.

- [ ] **Step 3: Implement helpers and controller skeleton**

Create `electron/liblib-canvas.mjs`:

```js
const LIBLIB_HOSTS = new Set(['www.liblib.tv', 'liblib.tv']);
const ALLOWED_PATH_PREFIXES = ['/canvas', '/login', '/user', '/account'];

export function normalizeLiblibUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) throw new Error('LibLib URL 不合法');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('LibLib URL 不合法');
  }

  if (url.protocol !== 'https:' || !LIBLIB_HOSTS.has(url.hostname)) {
    throw new Error('LibLib URL 不合法');
  }

  if (!ALLOWED_PATH_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    throw new Error('LibLib URL 不合法');
  }

  url.hostname = 'www.liblib.tv';
  return url.toString();
}

export function normalizeBounds(input) {
  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  };
  return {
    x: Math.max(0, number(input?.x, 0)),
    y: Math.max(0, number(input?.y, 0)),
    width: Math.max(1, number(input?.width, 1)),
    height: Math.max(1, number(input?.height, 1)),
  };
}

export function createLiblibCanvasController({ BrowserView, shell }) {
  let view = null;
  let ownerWindow = null;

  function ensureView(win) {
    if (!view) {
      view = new BrowserView({
        webPreferences: {
          partition: 'persist:liblib',
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
    }
    if (ownerWindow !== win) {
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.removeBrowserView(view);
      }
      ownerWindow = win;
      ownerWindow.addBrowserView(view);
    }
    return view;
  }

  async function show(win, input) {
    if (!win || win.isDestroyed()) throw new Error('主窗口不可用');
    const url = normalizeLiblibUrl(input?.url);
    const bounds = normalizeBounds(input?.bounds);
    const current = ensureView(win);
    current.setBounds(bounds);
    current.setAutoResize({ width: false, height: false });
    if (current.webContents.getURL() !== url) {
      await current.webContents.loadURL(url);
    }
    return { ok: true, url };
  }

  function setBounds(input) {
    if (!view) return { ok: true };
    view.setBounds(normalizeBounds(input));
    return { ok: true };
  }

  function hide() {
    if (ownerWindow && view && !ownerWindow.isDestroyed()) {
      ownerWindow.removeBrowserView(view);
    }
    ownerWindow = null;
    return { ok: true };
  }

  async function openExternal(input) {
    const url = normalizeLiblibUrl(input);
    await shell.openExternal(url);
    return { ok: true, url };
  }

  function destroy() {
    hide();
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.close();
    }
    view = null;
  }

  return { show, setBounds, hide, openExternal, destroy };
}
```

- [ ] **Step 4: Run helper tests**

Run:

```powershell
npm test -- electron/liblib-canvas.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add electron/liblib-canvas.mjs electron/liblib-canvas.test.mjs
git commit -m "feat(canvas): add liblib browserview controller"
```

## Task 2: Main/Preload Bridge

**Files:**

- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Add bridge type first**

Modify `src/vite-env.d.ts` after `FableglitchClipboard`:

```ts
interface LiblibBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FableglitchCanvas {
  liblibShow: (input: { url: string; bounds: LiblibBounds }) => Promise<{ ok: true; url: string }>;
  liblibSetBounds: (bounds: LiblibBounds) => Promise<{ ok: true }>;
  liblibHide: () => Promise<{ ok: true }>;
  liblibOpenExternal: (url: string) => Promise<{ ok: true; url: string }>;
}
```

Then add `canvas: FableglitchCanvas;` to `FableglitchBridge`.

- [ ] **Step 2: Add preload bridge**

Modify `electron/preload.cjs`:

```js
  canvas: {
    liblibShow: (input) => ipcRenderer.invoke('canvas:liblib:show', input),
    liblibSetBounds: (bounds) => ipcRenderer.invoke('canvas:liblib:setBounds', bounds),
    liblibHide: () => ipcRenderer.invoke('canvas:liblib:hide'),
    liblibOpenExternal: (url) => ipcRenderer.invoke('canvas:liblib:openExternal', url),
  },
```

Place it between `clipboard` and `studio`.

- [ ] **Step 3: Register main IPC**

Modify imports in `electron/main.mjs`:

```js
import { app, BrowserView, BrowserWindow, Menu, clipboard, ipcMain, nativeImage, shell } from 'electron';
import { createLiblibCanvasController } from './liblib-canvas.mjs';
```

Add after `const appPaths = ...`:

```js
const liblibCanvas = createLiblibCanvasController({ BrowserView, shell });
```

Add IPC handlers near the other bridge handlers:

```js
ipcMain.handle('canvas:liblib:show', (event, input) => {
  const win = getSenderWindow(event);
  return liblibCanvas.show(win, input);
});
ipcMain.handle('canvas:liblib:setBounds', (_event, bounds) => liblibCanvas.setBounds(bounds));
ipcMain.handle('canvas:liblib:hide', () => liblibCanvas.hide());
ipcMain.handle('canvas:liblib:openExternal', (_event, url) => liblibCanvas.openExternal(url));
```

Add cleanup in `createMainWindow()` after `registerWindowDiagnostics(win);`:

```js
  win.on('closed', () => {
    liblibCanvas.destroy();
  });
```

- [ ] **Step 4: Build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add electron/main.mjs electron/preload.cjs src/vite-env.d.ts
git commit -m "feat(canvas): expose liblib embed bridge"
```

## Task 3: CanvasStage LibLib Tab UI

**Files:**

- Modify: `src/components/studio/stages/CanvasStage.tsx`
- Modify: `src/components/studio/stages/CanvasStage.test.tsx`
- Modify: `src/routes/StudioWorkspaceRoute.tsx`
- Modify: `src/routes/StudioWorkspaceRoute.test.tsx`

- [ ] **Step 1: Write CanvasStage tests**

Add to `src/components/studio/stages/CanvasStage.test.tsx`:

```tsx
it('opens and hides the embedded LibLib canvas tab', async () => {
  const canvasBridge = {
    liblibShow: vi.fn(async () => ({ ok: true as const, url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd' })),
    liblibSetBounds: vi.fn(async () => ({ ok: true as const })),
    liblibHide: vi.fn(async () => ({ ok: true as const })),
    liblibOpenExternal: vi.fn(async () => ({ ok: true as const, url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd' })),
  };
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: { canvas: canvasBridge },
  });
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 100,
    y: 120,
    width: 800,
    height: 500,
    top: 120,
    left: 100,
    right: 900,
    bottom: 620,
    toJSON: () => ({}),
  }));
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe, disconnect })));
  const onSaveState = vi.fn(async () => {});

  render(
    <CanvasStage
      project={project}
      assets={[]}
      stateJson={JSON.stringify({ liblib_url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd' })}
      onSaveState={onSaveState}
      onAdvance={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'LibLib 画布' }));
  fireEvent.click(screen.getByRole('button', { name: '嵌入打开' }));

  await waitFor(() => {
    expect(canvasBridge.liblibShow).toHaveBeenCalledWith({
      url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
      bounds: { x: 100, y: 120, width: 800, height: 500 },
    });
  });

  fireEvent.click(screen.getByRole('button', { name: '链路预览' }));
  await waitFor(() => expect(canvasBridge.liblibHide).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm test -- CanvasStage.test.tsx
```

Expected: FAIL because props and LibLib UI do not exist.

- [ ] **Step 3: Add CanvasStage props and state parsing**

Modify `CanvasStage` props:

```ts
interface CanvasStageState {
  liblib_url?: string;
  active_tab?: 'preview' | 'liblib';
}

export function CanvasStage({
  project,
  assets,
  stateJson,
  onSaveState,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  stateJson?: string | null;
  onSaveState?: (stateJson: string) => Promise<void>;
  onAdvance: () => void | Promise<void>;
}) {
```

Add:

```ts
const savedState = useMemo(() => parseCanvasStageState(stateJson), [stateJson]);
const [activeTab, setActiveTab] = useState<'preview' | 'liblib'>(savedState.active_tab ?? 'preview');
const [liblibUrl, setLiblibUrl] = useState(savedState.liblib_url ?? 'https://www.liblib.tv/canvas');
const [liblibStatus, setLiblibStatus] = useState<string | null>(null);
const [liblibError, setLiblibError] = useState<string | null>(null);
const hostRef = useRef<HTMLDivElement | null>(null);
```

Import `useEffect`, `useRef`, `useState`.

- [ ] **Step 4: Add bridge helpers in CanvasStage**

Add:

```ts
function currentBounds() {
  const rect = hostRef.current?.getBoundingClientRect();
  if (!rect) return null;
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

async function saveCanvasState(next: CanvasStageState) {
  await onSaveState?.(JSON.stringify(next));
}

async function openEmbeddedLiblib() {
  const bounds = currentBounds();
  if (!bounds) return;
  setLiblibStatus(null);
  setLiblibError(null);
  try {
    const result = await window.fableglitch.canvas.liblibShow({ url: liblibUrl, bounds });
    setLiblibUrl(result.url);
    await saveCanvasState({ liblib_url: result.url, active_tab: 'liblib' });
    setLiblibStatus('LibLib 画布已嵌入');
  } catch (cause) {
    setLiblibError(cause instanceof Error ? cause.message : 'LibLib 嵌入失败');
  }
}
```

Add effect:

```ts
useEffect(() => {
  if (activeTab !== 'liblib') {
    void window.fableglitch?.canvas?.liblibHide?.();
    return;
  }
  const target = hostRef.current;
  if (!target || !window.fableglitch?.canvas?.liblibSetBounds) return;
  const syncBounds = () => {
    const bounds = currentBounds();
    if (bounds) void window.fableglitch.canvas.liblibSetBounds(bounds);
  };
  const observer = new ResizeObserver(syncBounds);
  observer.observe(target);
  window.addEventListener('resize', syncBounds);
  syncBounds();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', syncBounds);
    void window.fableglitch?.canvas?.liblibHide?.();
  };
}, [activeTab]);
```

- [ ] **Step 5: Add tab UI**

In `CanvasStage` header, add buttons:

```tsx
<div className="flex gap-2">
  <Button type="button" variant={activeTab === 'preview' ? 'gradient' : 'secondary'} onClick={() => setActiveTab('preview')}>
    链路预览
  </Button>
  <Button type="button" variant={activeTab === 'liblib' ? 'gradient' : 'secondary'} onClick={() => setActiveTab('liblib')}>
    LibLib 画布
  </Button>
  <Button type="button" variant="gradient" onClick={() => void onAdvance()}>
    准备入库 →
  </Button>
</div>
```

Render preview when `activeTab === 'preview'`. Render this when `activeTab === 'liblib'`:

```tsx
<section className="flex min-h-0 flex-1 flex-col gap-3">
  <div className="rounded-lg border border-border bg-surface-2 p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <label className="min-w-0 flex-1">
        <span className="mb-2 block text-sm font-medium text-text-2">LibLib 画布地址</span>
        <input
          value={liblibUrl}
          onChange={(event) => setLiblibUrl(event.target.value)}
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none transition focus:border-accent/60"
        />
      </label>
      <Button type="button" variant="gradient" onClick={() => void openEmbeddedLiblib()}>
        嵌入打开
      </Button>
      <Button type="button" variant="secondary" onClick={() => void window.fableglitch.canvas.liblibOpenExternal(liblibUrl)}>
        在浏览器打开
      </Button>
    </div>
    {liblibStatus && <div className="mt-3 text-xs text-good">{liblibStatus}</div>}
    {liblibError && <div className="mt-3 text-xs text-bad">{liblibError}</div>}
    <p className="mt-3 text-xs leading-5 text-text-3">
      这里嵌入第三方 LibLib 服务，账号登录、生成费用和素材导出受 LibLib 条款约束。生成后的图片/视频请手动导出后挂回创作舱资产。
    </p>
  </div>
  <div ref={hostRef} className="min-h-[520px] flex-1 overflow-hidden rounded-lg border border-border bg-black">
    <div className="flex h-full items-center justify-center text-sm text-text-3">
      点击“嵌入打开”后，LibLib 画布会显示在这里。
    </div>
  </div>
</section>
```

- [ ] **Step 6: Wire route save state**

Modify `src/routes/StudioWorkspaceRoute.tsx` CanvasStage call:

```tsx
<CanvasStage
  project={project}
  assets={assets}
  stateJson={bundle.stage_state.canvas ?? null}
  onSaveState={(stateJson) => studioApi.saveStage(project.id, 'canvas', stateJson)}
  onAdvance={handleAdvance}
/>
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm test -- CanvasStage.test.tsx StudioWorkspaceRoute.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/components/studio/stages/CanvasStage.tsx src/components/studio/stages/CanvasStage.test.tsx src/routes/StudioWorkspaceRoute.tsx src/routes/StudioWorkspaceRoute.test.tsx
git commit -m "feat(canvas): add liblib embed tab"
```

## Task 4: Manual Electron Smoke

**Files:**

- No source changes expected unless smoke reveals a bug.

- [ ] **Step 1: Full checks**

Run:

```powershell
npm run lint
npm run build
npm test
```

Expected:

- lint PASS
- build PASS
- tests PASS

- [ ] **Step 2: Dev smoke**

Run:

```powershell
npm run dev
```

Manual smoke:

1. Login.
2. Open `个人创作舱`.
3. Open or create a project.
4. Go to `画布`.
5. Click `LibLib 画布`.
6. Paste `https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd`.
7. Click `嵌入打开`.
8. Confirm LibLib page appears inside the app.
9. Log into LibLib if prompted.
10. Leave CanvasStage and confirm the embedded page disappears.
11. Return to CanvasStage and confirm the URL persisted.
12. Restart app and confirm LibLib login cookie persists.

- [ ] **Step 3: Packaged smoke**

Run:

```powershell
npm run build
npm run start
```

Repeat steps 2.4 through 2.12.

- [ ] **Step 4: Commit smoke fixes**

Only if fixes were needed:

```powershell
git add <changed-files>
git commit -m "fix(canvas): stabilize liblib embedded view"
```

- [ ] **Step 5: Push**

```powershell
git push origin main
```

## Risks And Guardrails

- BrowserView overlays the renderer; it is not part of React DOM. Bounds must be updated whenever the host rectangle moves or resizes.
- Always hide the BrowserView when switching away from the LibLib tab, otherwise it can visually float over unrelated app screens.
- Do not inject scripts into LibLib pages.
- Do not bypass LibLib auth, billing, or export limitations.
- Do not store LibLib passwords or tokens in our DB.
- Do not attempt automatic asset sync in this milestone; users manually export from LibLib and attach files back into Studio.

## Verification Checklist

- `npm test -- electron/liblib-canvas.test.mjs`
- `npm test -- CanvasStage.test.tsx StudioWorkspaceRoute.test.tsx`
- `npm run lint`
- `npm run build`
- `npm test`
- Manual dev smoke with `npm run dev`
- Manual packaged smoke with `npm run build` and `npm run start`

## Completion Criteria

- CanvasStage has a working `LibLib 画布` tab.
- Clicking `嵌入打开` displays LibLib inside the app, not in an external browser.
- Clicking `在浏览器打开` still works as fallback.
- LibLib cookies persist across app restarts.
- Leaving the tab/stage hides the BrowserView.
- Local canvas stage state persists the last LibLib URL.
- All automated checks pass.
