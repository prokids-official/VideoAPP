# FableGlitch P0-C · 前端外壳实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 `D:/VideoAPP` 这套 Electron + Vite + React 19 脚手架改造成 FableGlitch Studio 的可运行前端外壳——实现登录/注册/会话刷新、主框架（顶导 + 项目树侧栏 + 内容区）、首次登录引导、剧集 dashboard 只读视图。完成后用户可以登录、看到全公司的项目树、点开一个剧集看到元数据 + 板块网格——但**还不能导入资产、不能 push、面板还点不进去**——那是 P0-D 的事。

**Architecture:**
- 渲染进程：React 19 + TypeScript + Vite + Tailwind CSS（design tokens 直接对应 spec §7.2 + 设计稿 `_tokens.css`）+ shadcn/ui（仅 Button / Input / Card / Tabs / Dialog / Toast）+ Framer Motion（页面切换 + modal 弹入）
- Electron 主进程：复用现有 `electron/main.mjs`，新增 IPC 通道：`db:*`（local SQLite CRUD）、`net:*`（HTTPS 调后端 API，把 token 持久化交给主进程）、`session:*`（access/refresh token 生命周期）；旧的 `app:*` / `git:*` 通道**全部删除**（VideoAPP 的旧业务逻辑废弃）
- Preload：`window.fableglitch` 替换原 `window.videoApp`，对外暴露干净的 RPC 表面
- 本地 SQLite：`%APPDATA%/FableGlitch/local.db` 存 session token + 已查看的他人资产缓存（draft 表的填充交给 P0-D）
- 状态管理：用 React `useReducer` + Context 即可，不引 redux/zustand —— 整个 P0-C 状态空间小

**Tech Stack:**
- 已有：React 19, Vite, Electron, TypeScript（strict）
- 新增依赖：tailwindcss + @tailwindcss/postcss、framer-motion、better-sqlite3、shadcn/ui 个别组件、zod（前端复用 backend 的同一份 schemas，从 `shared/types.ts` 引）

**Spec reference:**
- `docs/superpowers/specs/2026-04-23-fableglitch-p0-foundation-design.md` v2 §3.1（部署）、§4.5（本地 SQLite）、§5.1（auth 路由 — 调用契约）、§5.2（tree）、§5.3（episodes GET）、§6.1（注册首登）、§7（视觉规范）、§8.1（Claude 工程职责清单）
- `docs/design/mockups/login.html` / `shell.html` / `tree.html` / `first-run-modal.html`（视觉真理）
- `D:\VideoAPP\backend\` 下后端代码（API 形状真理；不修改）

**前置依赖：**
- ✅ P0-A 全部完成
- ✅ P0-B Tasks 1-15 完成（Codex commits 4c44a74 → 12244b2）
- ✅ 设计稿落盘（commit 5f2ee40）
- ⏳ P0-A 部署（Vercel preview URL）—— 仅 Task 16 远程冒烟需要，前 15 个任务可以用 `npm run dev` 起本地后端联调

**P0-C 不做（留 P0-D）：**
- 新建剧集 wizard
- 资产面板（8 个 enabled types）
- 资产导入对话框、docx/xlsx 转换
- 入库评审页 + push 调用
- 资产预览渲染器（md / image / video）
- 草稿表 `local_drafts` 的写入（schema 在本计划已建好，等 P0-D 用）

---

## File Structure

**保留**：`electron/main.mjs`（重写），`electron/preload.mjs`（重写），`src/main.tsx`，`vite.config.ts`，`tsconfig.*.json`

**删除**（VideoAPP 旧业务）：
- `electron/storage.mjs`（旧 project JSON 持久化）
- `electron/repository.mjs`（旧 git 导出）
- `electron/git.mjs`（旧 git CLI 包装）
- `src/App.tsx`（旧 UI，重写为路由/外壳）
- `src/App.css`、`src/types.ts`（替换为新文件）

**新增**：
```
electron/
├── main.mjs                          (重写: 只做窗口 + IPC dispatch)
├── preload.mjs                       (重写: window.fableglitch bridge)
├── local-db.mjs                      (new: better-sqlite3 wrapper)
├── api-client.mjs                    (new: 主进程发 HTTPS, 带 refresh)
└── session.mjs                       (new: token 生命周期管理)

src/
├── main.tsx                          (改: 套 ThemeProvider + AuthProvider + RouterRoot)
├── index.css                         (改: tailwind base + design tokens)
├── App.tsx                           (改: 路由表)
├── lib/
│   ├── api.ts                        (new: 调 window.fableglitch.net.* 的 wrapper)
│   ├── tokens.ts                     (new: 字面量映射 design tokens 到 TS const)
│   └── format.ts                     (new: 时间戳 / 字节 / 路径格式化)
├── stores/
│   └── auth-context.tsx              (new: AuthContext + useAuth hook)
├── components/
│   ├── theme/
│   │   └── ThemeProvider.tsx         (new: noop wrapper, 留扩展点)
│   ├── ui/
│   │   ├── Button.tsx                (new: shadcn-style + ghost/primary/gradient variants)
│   │   ├── Input.tsx                 (new: with label + hint)
│   │   ├── Card.tsx                  (new: 简单容器)
│   │   └── Toast.tsx                 (new: framer-motion-driven)
│   ├── chrome/
│   │   ├── TopNav.tsx                (new: 56px 顶导 + 用户胶囊)
│   │   └── ProjectTree.tsx           (new: 4 层递归侧栏)
│   └── modals/
│       └── FirstRunModal.tsx         (new: 复刻 first-run-modal.html)
├── routes/
│   ├── LoginRoute.tsx                (new: login.html → React)
│   ├── ShellEmptyRoute.tsx           (new: shell.html → React, 空状态欢迎)
│   ├── TreeRoute.tsx                 (new: tree.html → React，剧集 dashboard 只读)
│   └── NotFoundRoute.tsx             (new: 404 fallback)
├── styles/
│   └── globals.css                   (new: tailwind layers + 全局 reset)
└── types.ts                          (改: 共享类型从 ../../shared/types 重新导出)

shared/types.ts                       (改: 加 EpisodeDetail / TreeResponse 等 P0-C 用类型)

(根)
├── tailwind.config.ts                (new)
├── postcss.config.mjs                (new)
└── package.json                      (改: 加依赖 + 改 main 入口)
```

---

## Task 1: 卸载 VideoAPP 旧代码 + 加新依赖

**Files:**
- Delete: `electron/storage.mjs`, `electron/repository.mjs`, `electron/git.mjs`
- Delete: `src/App.css`, `src/types.ts`（旧版）
- Modify: `package.json`（加依赖）
- Modify: `src/main.tsx`（暂时让它能跑空 App）
- Replace: `src/App.tsx`（占位"FableGlitch 启动中"）

- [ ] **Step 1: 删除 VideoAPP 旧业务模块**

```bash
cd D:/VideoAPP
rm electron/storage.mjs electron/repository.mjs electron/git.mjs
rm src/App.css src/types.ts
```

Edit `electron/main.mjs`：把所有 `import` 旧模块的行删掉、把所有 `ipcMain.handle('app:*')` / `ipcMain.handle('git:*')` 调用整段删掉，只保留 `BrowserWindow` 创建逻辑。临时让 main.mjs 长这样：

```mjs
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 960, minHeight: 600,
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

Replace `electron/preload.mjs` 整个文件内容为：
```mjs
import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('fableglitch', { __placeholder: true });
```

Replace `src/App.tsx` 为：
```tsx
export default function App() {
  return <div style={{ padding: 24, color: '#f5f5f7', background: '#0a0a0b', minHeight: '100vh', fontFamily: 'system-ui' }}>FableGlitch Studio · 启动中</div>;
}
```

Replace `src/index.css` 内容为：
```css
:root { color-scheme: dark; }
html, body, #root { margin: 0; padding: 0; height: 100%; }
body { background: #0a0a0b; }
```

- [ ] **Step 2: 加新依赖**

Run:
```bash
cd D:/VideoAPP
npm install --save react-router framer-motion zod
npm install --save-dev tailwindcss @tailwindcss/postcss postcss autoprefixer @types/better-sqlite3
npm install --save better-sqlite3
```

注意 `better-sqlite3` 是原生模块，Electron 必须 `electron-rebuild`：
```bash
npm install --save-dev electron-rebuild
npx electron-rebuild
```

Add `electron-rebuild` 到 `package.json` scripts：
```json
"postinstall": "electron-rebuild"
```

- [ ] **Step 3: 起 dev 验证空 App 能跑**

Run:
```bash
npm run dev
```
Expected：Electron 窗口打开，显示 "FableGlitch Studio · 启动中"，深色背景。Ctrl+C 关掉。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: tear down VideoAPP business code, prep FableGlitch foundation"
```

---

## Task 2: Tailwind + design tokens

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Modify: `src/index.css`（改名 `src/styles/globals.css`）
- Create: `src/lib/tokens.ts`

- [ ] **Step 1: postcss.config.mjs**

Write `postcss.config.mjs`：
```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: tailwind.config.ts**

Write `tailwind.config.ts`：
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0b',
        surface: { DEFAULT: '#131316', 2: '#18181d', 3: '#1e1e24' },
        border: { DEFAULT: '#25252c', hi: '#35353d' },
        text: { DEFAULT: '#f5f5f7', 2: '#a1a1a8', 3: '#6b6b72', 4: '#4a4a50' },
        accent: { DEFAULT: '#9b7cff', hi: '#b294ff' },
        good: '#4ade80',
        warn: '#fbbf24',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '15px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        md: ['16px', '24px'],
        lg: ['17px', '24px'],
        xl: ['22px', '28px'],
        '4xl': ['40px', '44px'],
      },
      borderRadius: {
        DEFAULT: '8px', lg: '12px', xl: '16px',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #9b7cff 0%, #e879f9 100%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(155, 124, 255, 0.35)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: 重命名 + 改 globals.css**

Run:
```bash
mkdir -p src/styles
mv src/index.css src/styles/globals.css
```

Edit `src/styles/globals.css` 写入：
```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

@import 'tailwindcss';

@theme {
  /* Tailwind v4 design tokens — duplicate of tailwind.config.ts for runtime CSS variables */
  --color-bg: #0a0a0b;
  --color-text: #f5f5f7;
  --color-accent: #9b7cff;
}

:root { color-scheme: dark; }
html, body, #root { margin: 0; padding: 0; height: 100%; }
body {
  background: theme(--color-bg);
  color: theme(--color-text);
  font-family: theme(--font-sans);
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
}
```

Edit `src/main.tsx` 把 `import './index.css'` 改为 `import './styles/globals.css'`.

- [ ] **Step 4: lib/tokens.ts（TS-side mirror，给非 className 场景用）**

Write `src/lib/tokens.ts`：
```ts
export const tokens = {
  color: {
    bg: '#0a0a0b',
    surface: '#131316', surface2: '#18181d', surface3: '#1e1e24',
    border: '#25252c', borderHi: '#35353d',
    text: '#f5f5f7', text2: '#a1a1a8', text3: '#6b6b72', text4: '#4a4a50',
    accent: '#9b7cff', accentHi: '#b294ff',
    accentBg: 'rgba(155,124,255,0.12)',
    accentBorder: 'rgba(155,124,255,0.35)',
    good: '#4ade80', warn: '#fbbf24', bad: '#f87171',
  },
  gradientBrand: 'linear-gradient(135deg, #9b7cff 0%, #e879f9 100%)',
} as const;
```

- [ ] **Step 5: 验证 tailwind 起作用**

Edit `src/App.tsx` 临时改成：
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold tracking-tight">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">tailwind verified</p>
    </div>
  );
}
```

Run `npm run dev`. Expected：标题字号 40，灰色 mono 副标题。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(frontend): tailwind v4 + design tokens (color/font/spacing/radius)"
```

---

## Task 3: Local SQLite (better-sqlite3) + IPC 通道 db:*

**Files:**
- Create: `electron/local-db.mjs`
- Modify: `electron/main.mjs`（注册 IPC handler）
- Modify: `electron/preload.mjs`（暴露 db.* 方法）

Spec reference: §4.5（本地 SQLite schema）。

设计：主进程独占 SQLite 句柄，渲染进程通过 IPC 调用。schema 启动时幂等创建。本任务只创建表 + 简单 KV API，复杂 query 后续按需加。

- [ ] **Step 1: 写 local-db.mjs**

Write `electron/local-db.mjs`：
```mjs
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

function applyMigrations(db) {
  db.exec(`
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

// --- session KV ---
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
```

- [ ] **Step 2: 更新 main.mjs 注册 IPC**

Edit `electron/main.mjs`：
```mjs
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionGet, sessionSet, sessionDelete, sessionClear } from './local-db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

ipcMain.handle('db:session:get', (_, key) => sessionGet(key));
ipcMain.handle('db:session:set', (_, key, value) => { sessionSet(key, value); });
ipcMain.handle('db:session:delete', (_, key) => { sessionDelete(key); });
ipcMain.handle('db:session:clear', () => { sessionClear(); });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

- [ ] **Step 3: 更新 preload.mjs 暴露 fableglitch.db**

Replace `electron/preload.mjs`:
```mjs
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fableglitch', {
  db: {
    sessionGet:    (key)        => ipcRenderer.invoke('db:session:get', key),
    sessionSet:    (key, value) => ipcRenderer.invoke('db:session:set', key, value),
    sessionDelete: (key)        => ipcRenderer.invoke('db:session:delete', key),
    sessionClear:  ()           => ipcRenderer.invoke('db:session:clear'),
  },
});
```

- [ ] **Step 4: 验证 SQLite 链路通**

Edit `src/App.tsx`：
```tsx
import { useEffect, useState } from 'react';

declare global {
  interface Window { fableglitch: any }
}

export default function App() {
  const [echo, setEcho] = useState('(loading)');
  useEffect(() => {
    (async () => {
      await window.fableglitch.db.sessionSet('smoke', 'hello-' + Date.now());
      const v = await window.fableglitch.db.sessionGet('smoke');
      setEcho(v);
    })();
  }, []);
  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">SQLite echo: {echo}</p>
    </div>
  );
}
```

Run `npm run dev`。Expected：第二行显示 "SQLite echo: hello-<timestamp>"，每次重启时间戳变。

⚠️ 如果报 `electron-rebuild` 相关原生模块错误，跑：
```bash
npx electron-rebuild -f -w better-sqlite3
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(electron): better-sqlite3 + db:session:* IPC channel"
```

---

## Task 4: API client（主进程发 HTTP）+ refresh interceptor

**Files:**
- Create: `electron/api-client.mjs`
- Create: `electron/session.mjs`
- Modify: `electron/main.mjs`（注册 net:* IPC）
- Modify: `electron/preload.mjs`（暴露 fableglitch.net）
- Create: `.env`（本地 dev 配置）

设计：所有 HTTP 请求由主进程发，token 持久化由主进程处理。渲染进程只调 `fableglitch.net.fetch(method, path, body)`，永远不直接见 token。

- [ ] **Step 1: 创建 .env + .env.example**

Write `.env.example`（提交进 git）:
```
VITE_API_BASE_URL=http://localhost:3001/api
```

Write `.env`（gitignore）:
```
VITE_API_BASE_URL=http://localhost:3001/api
```

⚠️ 这里 `VITE_API_BASE_URL` 名字以 `VITE_` 开头看似要给渲染进程，但实际上**API 调用走主进程**——所以这只是个命名一致性。我们在主进程也读 `process.env.VITE_API_BASE_URL`（Electron 主进程会从 `.env` 读不到，需要 `dotenv` 或在 npm script 里 cross-env 注入）。

更好做法：在 main.mjs 用 Node `node:fs` 读 `.env` 文件：

Write `electron/env.mjs`：
```mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

let cached = null;
export function loadEnv() {
  if (cached) return cached;
  cached = {};
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      cached[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  // production override (打包时 build env 写死)
  if (process.env.FG_API_BASE_URL) cached.VITE_API_BASE_URL = process.env.FG_API_BASE_URL;
  return cached;
}
```

- [ ] **Step 2: 写 session.mjs**

Write `electron/session.mjs`:
```mjs
import { sessionGet, sessionSet, sessionClear } from './local-db.mjs';

export function getAccessToken()  { return sessionGet('access_token'); }
export function getRefreshToken() { return sessionGet('refresh_token'); }
export function getExpiresAt()    { return parseInt(sessionGet('access_expires_at') ?? '0', 10); }

export function persistSession({ access_token, refresh_token, expires_at }) {
  sessionSet('access_token', access_token);
  sessionSet('refresh_token', refresh_token);
  sessionSet('access_expires_at', String(expires_at));
}

export function clearSession() { sessionClear(); }
```

- [ ] **Step 3: 写 api-client.mjs**

Write `electron/api-client.mjs`:
```mjs
import { loadEnv } from './env.mjs';
import { getAccessToken, getRefreshToken, persistSession, clearSession } from './session.mjs';

const { VITE_API_BASE_URL: BASE } = loadEnv();

async function rawRequest(method, pathname, body, accessToken) {
  const isMultipart = body instanceof FormData;
  const headers = {
    ...(accessToken && { authorization: `Bearer ${accessToken}` }),
    ...(!isMultipart && body !== undefined && { 'content-type': 'application/json' }),
  };
  const init = { method, headers };
  if (body !== undefined) init.body = isMultipart ? body : JSON.stringify(body);
  const res = await fetch(`${BASE}${pathname}`, init);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function refreshAccess() {
  const rt = getRefreshToken();
  if (!rt) return null;
  const { status, body } = await rawRequest('POST', '/auth/refresh', { refresh_token: rt }, null);
  if (status !== 200 || !body?.ok) {
    clearSession();
    return null;
  }
  persistSession({
    access_token: body.data.access_token,
    refresh_token: body.data.refresh_token,
    expires_at: body.data.expires_at,
  });
  return body.data.access_token;
}

/** Public: every renderer-side API call goes through here. */
export async function apiRequest({ method, path: pathname, body, requireAuth }) {
  let access = requireAuth ? getAccessToken() : null;
  let attempt = await rawRequest(method, pathname, body, access);

  // If 401 with auth requirement → try refresh once
  if (attempt.status === 401 && requireAuth) {
    const fresh = await refreshAccess();
    if (!fresh) return attempt;
    attempt = await rawRequest(method, pathname, body, fresh);
  }

  // Special: signup/login/refresh return new sessions — auto-persist
  if (attempt.status >= 200 && attempt.status < 300 && attempt.body?.data?.session) {
    persistSession({
      access_token: attempt.body.data.session.access_token,
      refresh_token: attempt.body.data.session.refresh_token,
      expires_at: attempt.body.data.session.expires_at,
    });
  }

  return attempt;
}
```

- [ ] **Step 4: 注册 IPC + 暴露 bridge**

Edit `electron/main.mjs` 加：
```mjs
import { apiRequest } from './api-client.mjs';
import { clearSession, getAccessToken } from './session.mjs';

ipcMain.handle('net:request', (_, payload) => apiRequest(payload));
ipcMain.handle('session:has', () => Boolean(getAccessToken()));
ipcMain.handle('session:clear', () => { clearSession(); });
```

Edit `electron/preload.mjs` 加：
```mjs
contextBridge.exposeInMainWorld('fableglitch', {
  db: {
    // ... existing
  },
  net: {
    request: (payload) => ipcRenderer.invoke('net:request', payload),
  },
  session: {
    has:   () => ipcRenderer.invoke('session:has'),
    clear: () => ipcRenderer.invoke('session:clear'),
  },
});
```

- [ ] **Step 5: 写 src/lib/api.ts（渲染层 wrapper）**

Write `src/lib/api.ts`：
```ts
import type { ApiResponse, AuthResult, User } from '../../shared/types';

declare global {
  interface Window {
    fableglitch: {
      db: {
        sessionGet:    (key: string) => Promise<string | null>;
        sessionSet:    (key: string, value: string) => Promise<void>;
        sessionDelete: (key: string) => Promise<void>;
        sessionClear:  () => Promise<void>;
      };
      net: {
        request: (payload: {
          method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
          path: string;
          body?: unknown;
          requireAuth?: boolean;
        }) => Promise<{ status: number; body: ApiResponse<unknown> | null }>;
      };
      session: {
        has:   () => Promise<boolean>;
        clear: () => Promise<void>;
      };
    };
  }
}

async function call<T>(opts: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  requireAuth?: boolean;
}): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string; message: string }> {
  const { status, body } = await window.fableglitch.net.request(opts);
  if (status >= 200 && status < 300 && body?.ok) {
    return { ok: true, data: body.data as T };
  }
  const errBody = body && !body.ok ? body.error : { code: 'NETWORK', message: `HTTP ${status}` };
  return { ok: false, status, code: errBody.code, message: errBody.message };
}

export const api = {
  signup: (input: { email: string; password: string; display_name: string }) =>
    call<AuthResult>({ method: 'POST', path: '/auth/signup', body: input }),
  login: (input: { email: string; password: string }) =>
    call<AuthResult>({ method: 'POST', path: '/auth/login', body: input }),
  me: () =>
    call<{ user: User }>({ method: 'GET', path: '/auth/me', requireAuth: true }),
  logout: async () => {
    const rt = await window.fableglitch.db.sessionGet('refresh_token');
    if (rt) {
      await call({ method: 'POST', path: '/auth/logout', body: { refresh_token: rt } });
    }
    await window.fableglitch.session.clear();
  },
  tree: () =>
    call<{ series: any[] }>({ method: 'GET', path: '/tree', requireAuth: true }),
  episodeDetail: (id: string) =>
    call<{ episode: any; counts: any }>({ method: 'GET', path: `/episodes/${id}`, requireAuth: true }),
};
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(electron): API client + session token persistence + refresh interceptor"
```

---

## Task 5: AuthContext + boot 流程

**Files:**
- Create: `src/stores/auth-context.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: 写 AuthContext**

Write `src/stores/auth-context.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../../shared/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signup: (input: { email: string; password: string; display_name: string }) => Promise<{ ok: boolean; message?: string }>;
  login:  (input: { email: string; password: string }) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const has = await window.fableglitch.session.has();
      if (!has) { setLoading(false); return; }
      const r = await api.me();
      if (r.ok) setUser(r.data.user);
      else await window.fableglitch.session.clear();
      setLoading(false);
    })();
  }, []);

  const signup: AuthState['signup'] = async (input) => {
    const r = await api.signup(input);
    if (r.ok) { setUser(r.data.user); return { ok: true }; }
    return { ok: false, message: r.message };
  };

  const login: AuthState['login'] = async (input) => {
    const r = await api.login(input);
    if (r.ok) { setUser(r.data.user); return { ok: true }; }
    return { ok: false, message: r.message };
  };

  const logout: AuthState['logout'] = async () => {
    await api.logout();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, signup, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: 让 main.tsx 套上 Provider**

Edit `src/main.tsx`：
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { AuthProvider } from './stores/auth-context';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(frontend): AuthContext + boot flow (refresh on launch)"
```

---

## Task 6: shadcn-style 基础组件

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Card.tsx`

- [ ] **Step 1: Button.tsx**

Write `src/components/ui/Button.tsx`:
```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'gradient';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-surface-3 text-text border border-border hover:border-border-hi',
  secondary: 'bg-surface-2 text-text-2 border border-border hover:text-text hover:border-border-hi',
  ghost:     'bg-transparent text-text-2 hover:text-text hover:bg-surface-2',
  gradient:  'bg-gradient-brand text-white border-0 hover:brightness-110 active:translate-y-px shadow-glow',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-md font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className = '', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded transition font-medium tracking-tight cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    />
  );
});
```

- [ ] **Step 2: Input.tsx**

Write `src/components/ui/Input.tsx`:
```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, mono, className = '', id, ...rest }, ref,
) {
  const inputId = id ?? `i-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="mb-4">
      {label && <label htmlFor={inputId} className="block text-sm text-text-2 font-medium mb-2">{label}</label>}
      <input
        id={inputId}
        ref={ref}
        className={`w-full h-11 px-3.5 rounded bg-surface-2 border border-border text-text outline-none focus:border-accent/35 focus:bg-surface-3 transition placeholder:text-text-4 ${mono ? 'font-mono text-sm' : 'font-sans text-base'} ${error ? 'border-bad' : ''} ${className}`}
        {...rest}
      />
      {error ? (
        <div className="font-mono text-xs text-bad mt-2">{error}</div>
      ) : hint ? (
        <div className="font-mono text-xs text-text-3 mt-2">{hint}</div>
      ) : null}
    </div>
  );
});
```

- [ ] **Step 3: Card.tsx**

Write `src/components/ui/Card.tsx`:
```tsx
import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-surface border border-border rounded-xl ${className}`} {...rest} />;
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(frontend): shadcn-style Button / Input / Card"
```

---

## Task 7: LoginRoute（复刻 login.html）

**Files:**
- Create: `src/routes/LoginRoute.tsx`
- Modify: `src/App.tsx`（条件渲染：未登录 → LoginRoute）

参考：`docs/design/mockups/login.html`。

- [ ] **Step 1: 写 LoginRoute**

Write `src/routes/LoginRoute.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../stores/auth-context';

export function LoginRoute() {
  const { signup, login } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const r = tab === 'login'
      ? await login({ email, password })
      : await signup({ email, password, display_name: displayName });
    if (!r.ok) setError(r.message ?? '未知错误');
    setSubmitting(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-12"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 30% 0%, rgba(155,124,255,0.06), transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(232,121,249,0.04), transparent 55%)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
        className="w-[480px] bg-surface border border-border rounded-xl pt-12 px-10 pb-8"
      >
        <div className="text-center mb-10">
          <div className="text-[28px] font-bold tracking-tight bg-gradient-brand bg-clip-text text-transparent inline-block">
            FableGlitch&nbsp;Studio
          </div>
          <div className="font-mono text-xs text-text-3 mt-2.5">菲博幻境工作室 · 内部资产管理</div>
        </div>

        <div className="flex bg-surface-2 border border-border rounded-[10px] p-1 mb-7">
          {(['login', 'signup'] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-base font-medium rounded transition ${
                tab === t ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
              }`}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit}>
          <Input
            label="邮箱" type="email" mono required
            placeholder="name@beva.com"
            hint="@beva.com 内部邮箱"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="密码" type="password" required
            placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {tab === 'signup' && (
            <Input
              label="中文姓名" required
              placeholder="如：乐美林"
              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          {error && <div className="font-mono text-xs text-bad mt-1 mb-3">{error}</div>}
          <Button type="submit" variant="gradient" size="lg" className="w-full mt-3" disabled={submitting}>
            {submitting ? (tab === 'login' ? '登录中…' : '注册中…') : (tab === 'login' ? '登录' : '注册')}
          </Button>
        </form>

        {tab === 'login' && (
          <div className="text-center text-sm text-text-3 mt-4">
            还没有账号？ <button onClick={() => setTab('signup')} className="text-text-2 border-b border-border hover:text-text">注册</button>
          </div>
        )}

        <div className="text-center font-mono text-2xs text-text-4 mt-7">v0.1.0 · build 2026.04.27</div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: 修 App.tsx 路由**

Replace `src/App.tsx`:
```tsx
import { useAuth } from './stores/auth-context';
import { LoginRoute } from './routes/LoginRoute';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading…
      </div>
    );
  }
  if (!user) return <LoginRoute />;
  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <h1 className="text-2xl">已登录：{user.display_name}（{user.email}）</h1>
      <p className="font-mono text-xs text-text-3">下一步：实现 Shell + Tree</p>
    </div>
  );
}
```

- [ ] **Step 3: 真机冒烟（需要本地后端 + Supabase 起着）**

Run（3 个终端）:
```bash
# T1: backend
cd D:/VideoAPP/backend && npm run db:start && npm run dev

# T2: 前端 + Electron
cd D:/VideoAPP && npm run dev
```

操作：
- App 打开 → 显示登录页
- 点 [注册] tab，填 `smoke@beva.com` / `test1234` / `烟测` → [注册]
- 应跳到"已登录：烟测"
- 重启 Electron（Ctrl+C，重跑 `npm run dev`）→ 应该自动登录（refresh 流程跑通）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(frontend): LoginRoute (login + signup tab) wired to backend"
```

---

## Task 8: TopNav

**Files:**
- Create: `src/components/chrome/TopNav.tsx`

参考：`shell.html` / `tree.html` 的 `.topnav` 区块。

- [ ] **Step 1: 写 TopNav**

Write `src/components/chrome/TopNav.tsx`:
```tsx
import { useState } from 'react';
import { useAuth } from '../../stores/auth-context';

export function TopNav() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;
  const initial = user.display_name?.charAt(0) ?? user.email.charAt(0);

  return (
    <nav className="h-14 flex-none border-b border-border bg-surface flex items-center px-6 gap-6">
      <div className="text-md font-bold tracking-tight bg-gradient-brand bg-clip-text text-transparent">
        FableGlitch
      </div>
      <div className="flex-1" />
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2.5 py-1.5 pr-2.5 pl-1.5 rounded-full hover:bg-surface-2 transition"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-semibold">
            {initial}
          </div>
          <div className="font-mono text-xs text-text-2">{user.display_name}</div>
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-48 bg-surface-2 border border-border rounded-lg overflow-hidden shadow-lg z-50"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="px-3 py-2 border-b border-border">
              <div className="text-sm">{user.display_name}</div>
              <div className="font-mono text-xs text-text-3">{user.email}</div>
            </div>
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              className="block w-full text-left px-3 py-2 text-sm text-text-2 hover:bg-surface-3 hover:text-text transition"
            >
              退出登录
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit（本任务在 Task 9 之后会一起测试）**

```bash
git add -A
git commit -m "feat(frontend): TopNav with user capsule + logout"
```

---

## Task 9: ProjectTree（4 层递归）

**Files:**
- Create: `src/components/chrome/ProjectTree.tsx`
- Modify: `shared/types.ts`（加 TreeResponse 类型）

参考：`tree.html` 左侧 `.tree`。

- [ ] **Step 1: 加 TreeResponse 类型**

Edit `shared/types.ts` 末尾追加：
```ts
export interface TreeEpisode {
  id: string;
  name_cn: string;
  status: 'drafting' | 'review' | 'published' | 'archived';
  updated_at: string;
  episode_path: string;
  asset_count_pushed: number;
}

export interface TreeContent {
  id: string; name_cn: string; episodes: TreeEpisode[];
}

export interface TreeAlbum {
  id: string; name_cn: string; contents: TreeContent[];
}

export interface TreeSeries {
  id: string; name_cn: string; albums: TreeAlbum[];
}

export interface TreeResponse {
  series: TreeSeries[];
}
```

- [ ] **Step 2: 写 ProjectTree**

Write `src/components/chrome/ProjectTree.tsx`:
```tsx
import { useState } from 'react';
import type { TreeSeries, TreeAlbum, TreeContent, TreeEpisode } from '../../../shared/types';

interface Props {
  series: TreeSeries[];
  selectedEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
}

const STATUS_DOT: Record<TreeEpisode['status'], string> = {
  drafting: 'bg-warn', review: 'bg-accent', published: 'bg-good', archived: 'bg-text-4',
};

export function ProjectTree({ series, selectedEpisodeId, onSelectEpisode }: Props) {
  return (
    <aside className="w-[280px] flex-none border-r border-border bg-surface overflow-y-auto">
      <div className="px-5 py-4 text-xs font-semibold text-text-3 uppercase tracking-widest">项目树</div>
      {series.length === 0 ? (
        <div className="px-5 py-3 text-sm text-text-3">暂无剧集</div>
      ) : (
        <div className="pb-6">
          {series.map((s) => (
            <SeriesNode key={s.id} series={s} selectedEpisodeId={selectedEpisodeId} onSelectEpisode={onSelectEpisode} />
          ))}
        </div>
      )}
    </aside>
  );
}

function SeriesNode({ series, selectedEpisodeId, onSelectEpisode }: { series: TreeSeries; selectedEpisodeId: string | null; onSelectEpisode: (id: string) => void; }) {
  const [open, setOpen] = useState(true);
  const epCount = series.albums.flatMap((a) => a.contents.flatMap((c) => c.episodes)).length;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-5 py-2 hover:bg-surface-2 transition">
        <span className="text-text-3 text-xs">{open ? '▾' : '▸'}</span>
        <span className="text-sm text-text font-medium">{series.name_cn}</span>
        <span className="ml-auto font-mono text-2xs text-text-4">{epCount}</span>
      </button>
      {open && series.albums.map((a) => (
        <AlbumNode key={a.id} album={a} selectedEpisodeId={selectedEpisodeId} onSelectEpisode={onSelectEpisode} />
      ))}
    </div>
  );
}

function AlbumNode({ album, selectedEpisodeId, onSelectEpisode }: { album: TreeAlbum; selectedEpisodeId: string | null; onSelectEpisode: (id: string) => void; }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 pl-9 pr-5 py-1.5 hover:bg-surface-2 transition">
        <span className="text-text-3 text-2xs">{open ? '▾' : '▸'}</span>
        <span className="text-sm text-text-2">{album.name_cn}</span>
      </button>
      {open && album.contents.map((c) => (
        <ContentNode key={c.id} content={c} selectedEpisodeId={selectedEpisodeId} onSelectEpisode={onSelectEpisode} />
      ))}
    </div>
  );
}

function ContentNode({ content, selectedEpisodeId, onSelectEpisode }: { content: TreeContent; selectedEpisodeId: string | null; onSelectEpisode: (id: string) => void; }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 pl-13 pr-5 py-1.5 hover:bg-surface-2 transition">
        <span className="text-text-3 text-2xs">{open ? '▾' : '▸'}</span>
        <span className="text-sm text-text-2">{content.name_cn}</span>
      </button>
      {open && content.episodes.map((e) => (
        <button
          key={e.id} onClick={() => onSelectEpisode(e.id)}
          className={`w-full flex items-center gap-2 pl-17 pr-5 py-1.5 transition ${
            selectedEpisodeId === e.id ? 'bg-accent/10 text-text border-l-2 border-accent' : 'hover:bg-surface-2 text-text-2'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[e.status]}`} />
          <span className="text-sm truncate">{e.name_cn}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(frontend): recursive ProjectTree component (4-level)"
```

---

## Task 10: ShellEmptyRoute + FirstRunModal

**Files:**
- Create: `src/components/modals/FirstRunModal.tsx`
- Create: `src/routes/ShellEmptyRoute.tsx`

参考：`shell.html` + `first-run-modal.html`。

- [ ] **Step 1: FirstRunModal**

Write `src/components/modals/FirstRunModal.tsx`:
```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  onBrowse: () => void;
}

export function FirstRunModal({ open, onClose, onCreate, onBrowse }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center backdrop-blur-md bg-bg/70"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[560px] bg-surface border border-border rounded-2xl px-10 pt-12 pb-8"
          >
            <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-surface-2 text-text-3 hover:text-text">×</button>
            <div className="text-[80px] text-center leading-none mb-6">👋</div>
            <h2 className="text-xl font-bold text-center mb-2.5 tracking-tight">看起来是你第一次使用 FableGlitch Studio</h2>
            <p className="text-sm text-text-3 text-center mb-9">选一个已有项目加入，或新建一个项目开始</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Button variant="secondary" size="lg" onClick={onBrowse} className="flex-col items-center !h-24 gap-2">
                <span className="text-2xl">📂</span>
                <span>浏览全公司项目树</span>
              </Button>
              <Button variant="gradient" size="lg" onClick={onCreate} className="flex-col items-center !h-24 gap-2">
                <span className="text-2xl">✨</span>
                <span>新建我的第一个剧集</span>
              </Button>
            </div>
            <div className="text-center font-mono text-2xs text-text-4">首次使用引导 · 可关闭</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: ShellEmptyRoute**

Write `src/routes/ShellEmptyRoute.tsx`:
```tsx
import { useState } from 'react';
import { TopNav } from '../components/chrome/TopNav';
import { ProjectTree } from '../components/chrome/ProjectTree';
import { FirstRunModal } from '../components/modals/FirstRunModal';
import { Button } from '../components/ui/Button';

export function ShellEmptyRoute({ onCreateEpisode, onBrowse }: { onCreateEpisode: () => void; onBrowse: () => void; }) {
  const [showFirstRun, setShowFirstRun] = useState(true);
  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <TopNav />
      <div className="flex-1 flex overflow-hidden">
        <ProjectTree series={[]} selectedEpisodeId={null} onSelectEpisode={() => {}} />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-[640px] text-center">
            <div className="text-4xl font-bold tracking-tight mb-3">欢迎来到 FableGlitch</div>
            <p className="font-mono text-sm text-text-3 mb-12">看起来是你第一次使用</p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" size="lg" onClick={onBrowse}>浏览全公司项目树</Button>
              <Button variant="gradient" size="lg" onClick={onCreateEpisode}>+ 新建我的第一个剧集</Button>
            </div>
          </div>
        </main>
      </div>
      <FirstRunModal
        open={showFirstRun} onClose={() => setShowFirstRun(false)}
        onCreate={() => { setShowFirstRun(false); onCreateEpisode(); }}
        onBrowse={() => { setShowFirstRun(false); onBrowse(); }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(frontend): ShellEmptyRoute + FirstRunModal"
```

---

## Task 11: TreeRoute（带数据） + Episode dashboard 只读

**Files:**
- Create: `src/routes/TreeRoute.tsx`
- Modify: `src/App.tsx`（路由分发）

参考：`tree.html`。Dashboard 只读 — 卡片网格不点击进入面板，只显示数据；底部 P4 灰掉的 4 个按钮加 P4 徽章。

- [ ] **Step 1: 写 TreeRoute**

Write `src/routes/TreeRoute.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { TopNav } from '../components/chrome/TopNav';
import { ProjectTree } from '../components/chrome/ProjectTree';
import { api } from '../lib/api';
import type { TreeResponse } from '../../shared/types';

interface AssetType {
  code: string; name_cn: string; icon: string; sort_order: number; enabled: boolean;
}

const PANELS_P0: AssetType[] = [
  { code: 'SCRIPT',     name_cn: '剧本',         icon: '📝', sort_order: 10, enabled: true },
  { code: 'PROMPT_IMG', name_cn: '分镜图提示词', icon: '🖼️', sort_order: 20, enabled: true },
  { code: 'PROMPT_VID', name_cn: '分镜视频提示词',icon: '🎞️', sort_order: 21, enabled: true },
  { code: 'SHOT_IMG',   name_cn: '分镜图',       icon: '🖼️', sort_order: 22, enabled: true },
  { code: 'SHOT_VID',   name_cn: '分镜视频',     icon: '🎬', sort_order: 23, enabled: true },
  { code: 'CHAR',       name_cn: '角色',         icon: '👤', sort_order: 30, enabled: true },
  { code: 'PROP',       name_cn: '道具',         icon: '🎒', sort_order: 31, enabled: true },
  { code: 'SCENE',      name_cn: '场景',         icon: '🏞️', sort_order: 32, enabled: true },
];
const PANELS_P4: AssetType[] = [
  { code: 'DIALOG', name_cn: '对白', icon: '💬', sort_order: 40, enabled: false },
  { code: 'BGM',    name_cn: '配乐', icon: '🎵', sort_order: 41, enabled: false },
  { code: 'SONG',   name_cn: '歌曲', icon: '🎤', sort_order: 42, enabled: false },
  { code: 'SFX',    name_cn: '音效', icon: '🔊', sort_order: 43, enabled: false },
];

interface EpisodeDetail {
  episode: {
    id: string; name_cn: string; status: string; episode_path: string;
    series_name: string; album_name: string; content_name: string;
    created_by_name: string; created_at: string; updated_at: string;
  };
  counts: { by_type: Record<string, { pushed: number; superseded: number }> };
}

export function TreeRoute() {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [selectedEpId, setSelectedEpId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await api.tree();
      if (r.ok) setTree(r.data as TreeResponse);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedEpId) { setDetail(null); return; }
    (async () => {
      const r = await api.episodeDetail(selectedEpId);
      if (r.ok) setDetail(r.data as EpisodeDetail);
    })();
  }, [selectedEpId]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">loading…</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <TopNav />
      <div className="flex-1 flex overflow-hidden">
        <ProjectTree series={tree?.series ?? []} selectedEpisodeId={selectedEpId} onSelectEpisode={setSelectedEpId} />
        <main className="flex-1 overflow-y-auto px-10 py-12">
          {detail ? <Dashboard detail={detail} /> : <EmptyHint />}
        </main>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="max-w-[880px] mx-auto text-center pt-24">
      <div className="text-xl text-text-2 mb-2">从左侧选一个剧集</div>
      <p className="font-mono text-sm text-text-3">点击项目树里的任意剧集查看详情</p>
    </div>
  );
}

function Dashboard({ detail }: { detail: EpisodeDetail }) {
  const ep = detail.episode;
  const counts = detail.counts.by_type;
  return (
    <div className="max-w-[880px] mx-auto">
      <h1 className="text-4xl font-bold tracking-tight mb-3.5">{ep.name_cn}</h1>
      <div className="font-mono text-sm text-text-3 mb-12">
        {ep.series_name} <span className="text-text-4">/</span>{' '}
        {ep.album_name} <span className="text-text-4">/</span>{' '}
        {ep.content_name}
      </div>
      <div className="font-mono text-xs text-text-3 mb-10">
        created by {ep.created_by_name} · {new Date(ep.created_at).toLocaleString('zh-CN')} · status: {ep.status}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3">
        {PANELS_P0.map((p) => <PanelCard key={p.code} panel={p} count={counts[p.code]?.pushed ?? 0} disabled={false} />)}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {PANELS_P4.map((p) => <PanelCard key={p.code} panel={p} count={0} disabled={true} />)}
      </div>
    </div>
  );
}

function PanelCard({ panel, count, disabled }: { panel: AssetType; count: number; disabled: boolean }) {
  return (
    <div className={`relative bg-surface border border-border rounded-lg p-5 transition ${disabled ? 'opacity-50' : 'hover:border-border-hi cursor-pointer'}`}>
      {disabled && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-2xs font-mono text-warn border border-warn/40 bg-warn/10">P4</div>
      )}
      <div className="text-3xl mb-3">{panel.icon}</div>
      <div className="text-base font-medium mb-1">{panel.name_cn}</div>
      <div className="font-mono text-xs text-text-3">
        {disabled ? '即将推出' : count > 0 ? `${count} 个已入库` : '暂无资产'}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 修 App.tsx 路由分发**

Replace `src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useAuth } from './stores/auth-context';
import { LoginRoute } from './routes/LoginRoute';
import { ShellEmptyRoute } from './routes/ShellEmptyRoute';
import { TreeRoute } from './routes/TreeRoute';
import { api } from './lib/api';

export default function App() {
  const { user, loading } = useAuth();
  const [hasProjects, setHasProjects] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setHasProjects(null); return; }
    (async () => {
      const r = await api.tree();
      setHasProjects(r.ok && (r.data as any).series.length > 0);
    })();
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">loading…</div>;
  }
  if (!user) return <LoginRoute />;
  if (hasProjects === null) {
    return <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">fetching tree…</div>;
  }
  if (!hasProjects) {
    return <ShellEmptyRoute
      onCreateEpisode={() => alert('新建剧集 wizard — P0-D 实现')}
      onBrowse={() => setHasProjects(true)}
    />;
  }
  return <TreeRoute />;
}
```

- [ ] **Step 3: 真机冒烟**

需要本地后端 + Supabase 跑着。先用 `seed.sql` 之外手动塞几条 series/albums/contents/episodes 测试数据（直接 SQL Editor）：

```sql
-- 假设已有 user id = '<your-uuid>'，从 auth.users 表查
insert into series (id, name_cn, created_by) values
  ('11111111-1111-1111-1111-111111111111', '童话剧', '<your-uuid>'),
  ('22222222-2222-2222-2222-222222222222', '民间故事', '<your-uuid>');
insert into albums (id, series_id, name_cn, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '格林童话', '<your-uuid>');
insert into contents (id, album_id, name_cn, created_by) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '侏儒怪', '<your-uuid>');
insert into episodes (id, content_id, name_cn, episode_path, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '侏儒怪 第一集', '童话剧_格林童话_侏儒怪', '<your-uuid>');
```

然后 `npm run dev` 跑前端 → 应该看到：
- 左侧项目树有 "童话剧" + "民间故事"
- 展开"童话剧" → "格林童话" → "侏儒怪" → "侏儒怪 第一集"
- 点选"侏儒怪 第一集" → 中间显示 dashboard，标题"侏儒怪 第一集"，路径"童话剧 / 格林童话 / 侏儒怪"，8 个 P0 卡片 + 4 个 P4 灰掉

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(frontend): TreeRoute + read-only episode dashboard with panel grid"
```

---

## Task 12: 远程冒烟（依赖运维清单）

**Files:** 无新建。改 `.env` 指向 Vercel preview URL。

- [ ] **Step 1: 改 .env**

Edit `.env`：
```
VITE_API_BASE_URL=https://videoapp-xxx.vercel.app/api
```

- [ ] **Step 2: 重启 Electron**

```bash
npm run dev
```
（不再需要本地 backend / supabase）

- [ ] **Step 3: 闭环测试**
  - [ ] 用一个真实 `@beva.com` 账号登录（清单 Step 5.3 创建的）
  - [ ] 看到项目树
  - [ ] 点开剧集看到 dashboard
  - [ ] 退出登录 → 重启 → 自动登录失败（因为 logout 清了 session）
  - [ ] 重新登录成功 → 关闭 Electron → 再开 → 自动登录成功（refresh 流程）

- [ ] **Step 4: 打 tag**

```bash
git tag p0c-complete
git push origin --tags
```

**P0-C 完成判定**：
- [x] Electron 启动后看到登录页
- [x] 注册 / 登录 / 自动登录 / 退出登录 全链路 OK
- [x] 项目树渲染 4 层
- [x] 剧集 dashboard 只读视图正确
- [x] FirstRunModal 在新用户首次出现
- [x] 视觉与 mockup 像素级一致（背景色、卡片圆角、字号节奏）

---

## Self-Review

**Spec 覆盖（spec §8.1 Claude 工程清单 vs 本计划）**：
- [x] `src/components/ui/` shadcn + 主题覆盖 — Task 6
- [x] `src/components/panels/AssetPanel.tsx` — **延后到 P0-D**（本计划只做 dashboard 卡片网格，点击不进面板）
- [x] `src/components/panels/preview/` — **延后到 P0-D**
- [x] `src/components/wizards/` — **延后到 P0-D**
- [x] `src/components/push/` — **延后到 P0-D**
- [x] `src/features/auth/` — Task 5 (AuthContext) + Task 7 (LoginRoute)
- [x] `src/features/tree/` — Task 11 (TreeRoute)
- [x] `src/features/assets/` — **延后到 P0-D**
- [x] `src/lib/api.ts` — Task 4
- [x] `src/lib/docx.ts`、`src/lib/xlsx.ts` — **延后到 P0-D**
- [x] `src/styles/` — Task 2
- [x] `electron/main.mjs` — Task 1 + 3 + 4
- [x] `electron/preload.mjs` — Task 1 + 3 + 4
- [x] `electron/local-db.mjs` — Task 3
- [ ] `electron/file-watcher.mjs` — **延后到 P0-D**（本计划不需要）

**Type 一致性**：
- `User` / `AuthResult` 在 `shared/types.ts` 定义，前后端共用
- `ApiResponse<T>` envelope 一致
- `TreeSeries / TreeAlbum / TreeContent / TreeEpisode` 在 `shared/types.ts` 新加，前后端共消费（后端 tree route 已使用，本计划前端引）

**Placeholder 扫描**：
- Task 11 dashboard 的 panel card 当前不可点击（disabled=false 的也只 hover）— **这是有意的**，P0-C 范围内没有面板路由
- Task 11 ShellEmpty 的 `onCreateEpisode` 暂时 `alert(...)`，是显式 P0-D 接入点

**已知风险/留意点**：
- `better-sqlite3` 是原生模块，每次 `npm install` 后需要 `electron-rebuild`。Task 1 加了 `postinstall` script 自动跑，但 CI 上可能要单独配
- Tailwind v4 的 `@theme` 语法相对新，IDE / linter 可能报警。Vite 6+ + `@tailwindcss/postcss` 默认支持
- 渲染进程和主进程的 IPC 用 JSON 序列化，不能传 `File / Blob` —— P0-D 实现资产导入时要把文件用 `Buffer` / `Uint8Array` 中转

---

## 后续衔接

P0-C 完成后：
- **P0-D**：本计划留出的 6 个 mockup 中还有 2 个未实现：`episode-wizard.html` + `push-review.html`。P0-D 单独写 plan，覆盖：
  - Episode wizard（4-step modal）
  - 8 个 AssetPanel（数据驱动）
  - 资产导入对话框 + docx/xlsx 转换
  - 资产预览渲染器
  - 入库评审页 + push 调用 + idempotency_key 生成
  - `local_drafts` 表的写入
  - 资产 view_cache 的填充
- **P0.5**：分发 + 自动更新

---

**预期 commit 数**：12 次（每个 Task 一次）。
