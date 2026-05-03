# FableGlitch P1.2 个人创作舱 MVP Spec 增量

> 日期：2026-05-02
> 范围：把 P1.0 中"个人沙盒（完全 ephemeral）"概念升级为"个人创作舱（本地持久化、资产 1:1 对应公司板块、可一键推送入库）"。覆盖 P1.0 §2 决策 2 和 §5.2。
> 关系：本文同时是 P1.0 sandbox 设计的 amendment + 一份独立 P1.2 实施 spec。
> 工作分工：前端 + 设计 = Claude（重头），后端 = Codex（轻量 SQLite + 复用 P0-D push），Electron bridge = 跨 Claude/Codex 协作。

---

## 1. 产品定位（重要，先看）

VideoAPP 的本质从这版 spec 起锁定为：**AI 漫剧生产驾驶舱**。不是公司素材库的前端、不是通用 AI 聊天工具、不是 Notion 类知识库。它由三个工作区构成：

| 工作区 | 入口 | 数据落地 | 用户场景 |
|---|---|---|---|
| **公司项目库** | `/tree` | GitHub asset-library + R2 + Supabase（已落地 P0/P0.5） | 团队协作、审计、入库标准化 |
| **个人创作舱** | `/studio` | 本地 SQLite + 用户电脑 | 个人创作，从灵感到分镜全流程，**完成后可推入公司项目** |
| **芝兰点子王** | `/ideas` | Supabase（P1.1 spec 落地） | 全员脑暴 idea pool，accepted 的可转项目 |

**P1.0 §2 决策 2 作废** —— 沙盒不再是 ephemeral playground，而是真实生产环境。本文锁定的新决策见 §2。

---

## 2. 已锁定的产品决策

1. **本地持久化**。创作舱的项目、阶段、生成资产**全部存本地 SQLite**（Electron `app.getPath('userData')`）。关闭 app + 重开后内容仍在。无 R2、无 GitHub、无 Supabase（除 usage_logs 在 P1.3 AI 集成时引入）。
2. **本地资产结构 1:1 对应公司板块**。本地生成的角色 → CHAR / 场景 → SCENE / 道具 → PROP / 图片提示词 → PROMPT_IMG / 视频提示词 → PROMPT_VID / 剧本 → SCRIPT / 分镜图 → SHOT_IMG / 分镜视频 → SHOT_VID。这样 §6 入库流程可以直接映射，不需要"格式转换"。
3. **9 阶段流程**（按用户列表）：
   `灵感 → 剧本 → 角色 → 场景 → 道具 → 分镜 → 图片提示词 → 视频提示词 → 画布 → 入库`
   阶段之间**线性建议但允许跳跃**（用户可以已有剧本但还没角色，直接跳到角色阶段填）。
4. **画布阶段（第 8 阶段）**在 P1.2 MVP 中**只做只读预览版**：把已生成的所有资产按类别陈列，不做 tldraw 类编辑。完整画布编辑器留 P1.5。
5. **AI 集成（自动生剧本 / 生图等）不在 P1.2**。P1.2 只做**结构 + 编辑器 + 入库流程**，所有内容由用户手输 / 粘贴 / 导入。AI 调用的占位 button 显示"P1.3 上线后启用"。
6. **入库 = 复用 P0-D push 流程**。本地草稿 → 选目标公司剧集 → 走 `/api/assets/preview-filename` + `/api/assets/push`。不引入新后端路由。
7. **个人创作舱项目 ≠ 公司剧集**。它有自己的简单结构（id / name / created_at / inspiration_text / current_stage），**不**走 series/album/content/episode 四层。入库时用户**选目标公司剧集**绑定。
8. **每个本地资产生成时即知道它"将来会进哪个板块"**。比如生成角色时直接选板块 = CHAR。不做后期归类。

---

## 3. 信息架构

```
/home                    HomeRoute（P1.0）
├── 公司项目库 → /tree
├── 个人创作舱 → /studio                      ★ 入口改名 + 文案
├── 芝兰点子王 → /ideas（P1.1）
└── AI 工具 → /ai（P1.3 占位）

/tree                    TreeRoute（P0 既有）
/ideas                   IdeasRoute（P1.1）
/push-review/:episodeId  PushReviewRoute（P0-D 既有）

NEW in P1.2:
/studio                                       项目列表 + 新建按钮
/studio/:projectId                            工作台（默认进 inspiration 阶段）
/studio/:projectId/:stage                     工作台 + 指定阶段
   stage ∈ inspiration / script / character / scene / prop /
           storyboard / prompt-img / prompt-vid / canvas / export
/studio/:projectId/export                     入库 review（stage 的别名路径）
```

数据流：

```
        ┌─────────────────────────────────────┐
        │  Electron 本地 SQLite（持久化）     │
        │                                      │
        │  studio_projects                     │
        │  studio_assets (按 type_code 分)    │
        │  studio_stage_state                  │
        └─────────┬───────────────────────────┘
                  │  IPC `studio:*`
                  ▼
        ┌─────────────────────────────────────┐
        │  React Renderer (StudioRoute)       │
        │                                      │
        │  - 项目 CRUD                         │
        │  - 阶段编辑器                        │
        │  - 资产篮子                          │
        └─────────┬───────────────────────────┘
                  │
                  ▼ (入库时)
        ┌─────────────────────────────────────┐
        │  既有 P0-D push 流程                │
        │                                      │
        │  preview-filename → multipart push  │
        │  → GitHub + R2 + Supabase 三阶段    │
        └─────────────────────────────────────┘
```

---

## 4. 核心用户流程

### 4.1 创建本地项目

1. `/home` 点 "个人创作舱"卡 → `/studio`
2. 看到项目列表（首次为空，引导卡片"开始你的第一个创作"）
3. 点击 "+ 新建项目" → 弹出 mini wizard：
   - 项目名（"创作舱草稿 #N" 默认值，可改）
   - 体量类型（短片 / 短视频 / 长片 / 待定）→ 影响后续流程默认参数（如时长、分镜数预设）
   - 灵感来源（可选：从 idea board 选 / 手动输入 / 留空）
4. 创建 → 跳转 `/studio/:id/inspiration`

### 4.2 阶段流程（典型路径）

用户在工作台顶部看到 9 阶段进度条。各阶段编辑后点 "→ 下一阶段" 按钮推进。

```
inspiration: 输入梗概 / 设定 / 题材标签 → 保存
   ↓
script: 输入剧本（粘贴 / 导入 .docx / 在编辑器写）→ 保存
   ↓
character: 列出主要角色，每个角色填外貌 / 服装 / 性格 / 视觉锚点 / 配色 / AI 提示词
   → 每个角色 = 一条 studio_assets 记录，type_code = CHAR
   ↓
scene: 同上，每条场景填氛围 / 材质 / 地标 / 色温 / 视觉锚点 / 提示词
   → 每个场景 = type_code = SCENE
   ↓
prop: 道具，type_code = PROP
   ↓
storyboard: 把剧本拆成 N 个分镜单元（参考 CineForge 截图）
   每个单元填：duration / 类型（环境 / 文戏 / 武戏...）/ summary / 起幅 / 落幅 / 角色场景道具引用
   → 每个单元 = 一个分镜数据结构（不直接落 SHOT_IMG/SHOT_VID，那是图视频本身）
   ↓
prompt-img: 每个分镜对应一个图片提示词（基于其角色 + 场景 + 视觉锚点自动拼）
   → 每条 prompt = type_code = PROMPT_IMG
   ↓
prompt-vid: 同上 → type_code = PROMPT_VID
   ↓
canvas (P1.2 MVP 只读): 浏览所有资产分类陈列；P1.5 加 tldraw 编辑
   ↓
export: 入库 review，详见 §4.3
```

### 4.3 入库流程

1. 阶段进入 export → 列出本地所有 assets 按 type_code 分组（CHAR / SCENE / PROP / SCRIPT / PROMPT_IMG / PROMPT_VID）
2. 用户**选目标公司项目**：series → album → content → episode（沿用 P0 树视图选择器；如果对应 episode 不存在可在选择器里调 wizard 创建）
3. 每条 asset 默认勾选；用户取消勾不想推的
4. 点 "预览最终文件名" → 调既有 `POST /api/assets/preview-filename` 拿 `final_filename` + `storage_ref`
5. 显示预览 + commit message 输入
6. 点 "推送 N 项" → 调既有 `POST /api/assets/push`（multipart，跟 P0-D 一致）
7. 成功 toast，本地 assets 标记 `pushed_to_episode_id` + `pushed_at`（**不删本地**，作者可以继续基于本地版本迭代后再推一轮，新版本走 supersede）

---

## 5. 主要页面线框

### 5.1 `/studio` 项目列表

```
┌─[TitleBar · 个人创作舱]─────────────────────────────────────┐
│                                                              │
│  个人创作舱                                  [+ 新建项目]   │
│  本地创作 · 完成后可一键推送入公司项目                        │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  最近项目                                                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│  │ 末日机械人          │ │ 异界穿越          │ │ + 新建        │ │
│  │ 阶段: 角色 4/9     │ │ 阶段: 剧本 2/9   │ │              │ │
│  │ ●●●○○○○○○ 33%   │ │ ●●○○○○○○○ 22%  │ │              │ │
│  │ 本地资产 12 条    │ │ 本地资产 1 条    │ │              │ │
│  │ 待入库 5 项 ●     │ │ 待入库 0 项      │ │              │ │
│  │ 2 小时前更新      │ │ 昨天更新        │ │              │ │
│  └─────────────────┘ └─────────────────┘ └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

card 显示：name / 当前 stage / 进度环（9 阶段中完成几个）/ 本地资产数 / 待入库 dot / updated_at。

### 5.2 `/studio/:id/:stage` 工作台

```
┌─[TitleBar · 末日机械人]─────────────────────────────────────────┐
│                                                                   │
│  ← 返回项目列表                                                   │
│                                                                   │
│  [灵感]──[剧本]──[角色]──●角色 ──[场景]──[道具]──[分镜]──...   │
│   ✓     ✓      active    4/9                                      │
│  ───────────────────────────────────────────────────────────────  │
│                                                                   │
│  ┌─────────────┐ ┌──────────────────────────┐ ┌──────────────┐ │
│  │ 当前阶段    │ │ 主编辑区                 │ │ 资产篮子     │ │
│  │ 输入参数    │ │                          │ │              │ │
│  │             │ │  [角色: 李火旺]          │ │ 当前阶段 4   │ │
│  │ 角色名      │ │  外貌：青年男性...      │ │ ┌────────┐   │ │
│  │ [李火旺]    │ │  服装：深色古装...      │ │ │ 李火旺 │ ★ │ │
│  │             │ │  性格：警惕、偏执...    │ │ │ 主角   │   │ │
│  │ 类型        │ │  视觉锚点：...          │ │ └────────┘   │ │
│  │ ◉ 主角      │ │  AI 提示词：...         │ │ ┌────────┐   │ │
│  │ ○ 配角      │ │                          │ │ │ 陈明   │   │ │
│  │             │ │  [复制全文] [下载.md]    │ │ │ 配角   │   │ │
│  │ [+ 新角色]  │ │  [下一阶段 → 场景]       │ │ └────────┘   │ │
│  └─────────────┘ └──────────────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

三栏布局，宽度建议：left 280px / center flex / right 280px。
- **Left**：当前阶段的输入控件（每阶段不同 —— 灵感是 textarea；角色是表单 + 列表；分镜是单元卡 + 拆分按钮）
- **Center**：渲染当前选中条目的全文 / 编辑视图。markdown 编辑器为主，prompt 等 mono 内容用 mono 字体
- **Right**：本地资产篮子（仅当前阶段类型），点击切换显示在 center

顶部进度条阶段交互：点击切换 stage（保留当前阶段未保存内容时弹确认）；阶段标记 ✓ 表示有内容、active 是当前、未触及的灰显数字。

### 5.3 `/studio/:id/export` 入库 review

```
┌─[TitleBar · 末日机械人 · 入库]─────────────────────────────┐
│                                                              │
│  入库到公司项目                                              │
│  把本地创作产物推送到团队资产库                              │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  目标公司项目                                                │
│  系列: [童话剧 ▾]  专辑: [NA ▾]  内容: [侏儒怪 ▾]          │
│  剧集: [侏儒怪 第一集 ▾]      [+ 新建剧集]                  │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  本地资产（12 条）        [全选] [全不选]                    │
│                                                              │
│  📝 剧本 (1)                                                 │
│    ☑ 末日机械人_主线.md                                     │
│        → 童话剧_侏儒怪_SCRIPT.md                            │
│                                                              │
│  👤 角色 (2)                                                 │
│    ☑ 李火旺_v1.png                                          │
│        → 侏儒怪_CHAR_李火旺_v001.png                        │
│    ☑ 陈明_v1.png                                            │
│        → 侏儒怪_CHAR_陈明_v001.png                          │
│                                                              │
│  🏞️ 场景 (1)                                                 │
│    ☑ 破庙.png                                                │
│        → 侏儒怪_SCENE_破庙_v001.png                         │
│                                                              │
│  ...                                                         │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  commit message                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ feat(侏儒怪 第一集): 来自创作舱「末日机械人」推送  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  [取消]                  已选 12 项 · 23.4 MB  [⚡ 推送]    │
└──────────────────────────────────────────────────────────────┘
```

每条本地资产显示原名 → 目标公司命名（实时调 `preview-filename`）。底部 sticky 推送按钮。

---

## 6. 设计系统方向

### 6.1 风格定位（明确不要什么）

参考三家：**Linear 的克制感**（productivity tool 的克制）+ **Things 3 的 Apple 极简**（简洁但有人情味）+ **Final Cut Pro 的密度感**（处理真实素材时该有的信息密度）。

**不要**：CineForge 那种霓虹粉黑、过度高对比、动效频繁的"营销级 dark UI"——长时间使用会累。**要**：安静、高级、信息层级清楚。

### 6.2 沿用现有 token

- 主色 token 沿用 `globals.css` 已落地的 dark + light 双主题
- macOS 风顶栏沿用（已落地）
- 字号语义 + mono 用法收回到 INDEX.md 7 类（critique 落地版）

### 6.3 新增组件（P1.2 MVP）

需要新建的组件清单：

| 组件 | 用处 | 复杂度 |
|---|---|---|
| `<StageProgressBar />` | 顶部 9 阶段进度条 | 中 |
| `<StudioWorkspace />` | 三栏布局壳 | 低 |
| `<AssetBasket />` | 右栏资产篮子 | 中 |
| `<StageEditor />` family | 每阶段一个变体（5-9 个 variants） | 高 |
| `<PushTargetSelector />` | 入库时选公司剧集（series/album/content/episode 四级） | 中 |
| `<FilenamePreview />` | 本地名 → 目标名映射展示 | 低 |
| `<ProjectCard />` | 项目列表卡 | 低 |
| `<NewProjectWizard />` | 创建项目 mini wizard | 低 |

### 6.4 关键视觉决策

- **流程进度条**：每阶段一个圆 + label，圆有三态（已完成 = 绿勾、active = 紫填、待开始 = 灰边）。**没有 hover 动效**（productivity tool 不需要）。
- **大按钮原则**：主操作 44-48px 高，次要操作 36-40px 高。所有按钮**有清晰 disabled 态**，不是降透明度而是 cursor-not-allowed + 灰色文本。
- **三栏宽度可调**：拖拽分栏 P1.2 不做（增加调试成本），只设固定值。P1.4 加分栏调整。
- **资产卡片**：white border 0.5px + 内部留白 + 主标题 14px medium + meta 12px 灰色。**不**用阴影做深度，Apple 极简偏好"扁平 + 单一 hairline"。

---

## 7. P1.2 MVP 范围（**严格限制，不超量**）

### 7.1 IN scope

| # | 内容 | 优先级 |
|---|---|---|
| 1 | `/home` 改名 "个人创作舱" + 文案更新 | H |
| 2 | `/studio` 项目列表 + 新建项目 mini wizard | H |
| 3 | `/studio/:id` 工作台壳（三栏 + 顶部进度条） | H |
| 4 | inspiration 阶段编辑器（textarea + tag 输入） | H |
| 5 | script 阶段编辑器（markdown editor + .docx 导入） | H |
| 6 | character / scene / prop 阶段（结构相似，复用同一 StageEditor 变体） | H |
| 7 | storyboard 阶段（基础版：拆分镜单元 + 元数据，不做 AI 拆分） | M |
| 8 | export 阶段（入库 review，复用现有 P0-D push） | H |
| 9 | 本地 SQLite schema 扩展 + IPC 通道 | H |
| 10 | 项目列表 progress 计算 + 待入库 dot 标识 | M |

### 7.2 OUT of scope（推到后续阶段）

| 推到 | 内容 |
|---|---|
| **P1.3** | AI 集成（自动生剧本 / 生角色 / 生提示词 / 生图）+ usage_logs / quota |
| **P1.3** | prompt-img / prompt-vid 阶段（依赖 AI 拼接逻辑） |
| **P1.4** | 模板系统（"末日机械"风格预设、影视风格预设） |
| **P1.4** | 从 idea board accepted idea 直接创建项目的转换流程 |
| **P1.5** | canvas 阶段编辑器（tldraw 类） |
| **P1.5** | 三栏宽度可调 |
| **P2** | 本地项目协作（多人共编同一本地项目） |

### 7.3 关键 OUT 原则

P1.2 MVP **不**碰 AI 调用 + canvas 编辑 —— 这两个是后续大头。先把"骨架 + 编辑器 + 入库流"落地，让用户**手动也能从灵感走到推送**，再叠 AI 自动化。

---

## 8. Codex / Electron Bridge 支持需求

### 8.1 Electron 本地 SQLite schema（在 `electron/local-db.mjs` 扩展）

```sql
-- 创作舱项目
create table if not exists studio_projects (
  id text primary key,                    -- uuid
  name text not null,
  size_kind text not null,                -- 'short' | 'shorts' | 'feature' | 'unknown'
  inspiration_text text,
  current_stage text not null default 'inspiration',
  created_at integer not null,            -- ms timestamp
  updated_at integer not null
);

-- 阶段状态（扁平 KV，避免每阶段一张表）
create table if not exists studio_stage_state (
  project_id text not null references studio_projects(id) on delete cascade,
  stage text not null,                    -- 'inspiration' | 'script' | ...
  state_json text not null,               -- 阶段元数据（不存大文件内容，那走 studio_assets）
  updated_at integer not null,
  primary key (project_id, stage)
);

-- 本地资产（结构对应公司 asset_types 但简化）
create table if not exists studio_assets (
  id text primary key,
  project_id text not null references studio_projects(id) on delete cascade,
  type_code text not null,                -- 'CHAR' | 'SCENE' | 'PROP' | 'SCRIPT' | 'PROMPT_IMG' | 'PROMPT_VID'
  name text not null,
  variant text,
  version integer not null default 1,
  meta_json text not null,                -- 角色/场景的属性集合
  content_path text,                      -- 大文件落地路径（图片 / md 文件）
  size_bytes integer,
  mime_type text,
  pushed_to_episode_id text,              -- 推送后填，否则 null
  pushed_at integer,
  created_at integer not null,
  updated_at integer not null
);

create index if not exists studio_projects_recent_idx on studio_projects (updated_at desc);
create index if not exists studio_assets_by_project_type on studio_assets (project_id, type_code);
```

### 8.2 新 IPC 通道（`electron/preload.cjs` + `main.mjs`）

```
studio:project:create     (input: {name, size_kind, inspiration_text?}) → project
studio:project:list       () → project[]
studio:project:get        (id) → {project, assets[], stage_state{}}
studio:project:update     (id, patch) → project
studio:project:delete     (id) → void   // 软删（加 deleted_at 字段；本 spec 简化为硬删）

studio:asset:save         (input) → asset           // upsert
studio:asset:list         (projectId, typeCode?) → asset[]
studio:asset:delete       (id) → void
studio:asset:writeFile    (id, buffer) → {path, size_bytes}
studio:asset:readFile     (id) → buffer

studio:stage:save         (projectId, stage, stateJson) → void
studio:stage:get          (projectId, stage) → stateJson | null
```

### 8.3 后端依赖（Codex）

**没有新后端路由**。复用既有的：
- `POST /api/assets/preview-filename`（入库时 filename 预览）
- `POST /api/assets/push`（入库时实际推送）
- `GET /api/tree`（入库 target selector 用）
- `POST /api/episodes`（用户在入库时选"+ 新建剧集"用）

Codex 在 P1.2 阶段的工作：**确认现有路由能承接来自创作舱的 push 请求**（特别是 source = 'imported' 之外的来源标记，可能要加 `source: 'studio-export'` 这个枚举值），写少量回归测试。

预期 Codex 后端工作量 1-2 小时。

---

## 9. 不做（明确排除）

- ❌ 个人创作舱内容上 R2 / GitHub / Supabase（决策 1）
- ❌ AI 自动生成（任何阶段，决策 5）
- ❌ canvas 编辑器（决策 4）
- ❌ 三栏宽度拖拽（推 P1.4）
- ❌ 多人协作 / 实时同步（推 P2）
- ❌ 项目模板 / 影视风格预设（推 P1.4）
- ❌ 在 export 流程里"创建新公司剧集"的内联 wizard（要么用既有 `/studio/:id/export` 跳到既有 EpisodeWizard，要么用户先去 /tree 创建好再回来）

---

## 10. 风险与开放问题

**开放问题（需要乐美林拍板）**：

1. **storyboard 阶段的数据结构怎么落？** 一个分镜单元 = `{number, type, duration_s, summary, qi_fu, luo_fu, character_refs[], scene_ref, prop_refs[]}`。这 8 个字段一开始是不是过度设计？要不要 P1.2 简化到 `{number, summary, duration_s}` 三字段，等 P1.3 加 AI 时再扩？我倾向后者。你定。
2. **入库时本地 png 怎么变成公司 R2 对象？** 现有 P0-D push 流程接 multipart，是 ArrayBuffer 上传。本地 png 要先 `fs.readFile` 读出来转 ArrayBuffer，再走 push。这条路径已经在 P0-D 跑通过（导入 .png 走的就是这个），创作舱 export 复用即可。**确认没疑问**。
3. **本地项目能删除吗？** 决策上倾向"软删 + 30 天后 GC"，跟 P0.5-B 的 R2 trash 思路一致；但本地数据用户期待"我点删除就立刻没了"。建议用户操作"删除"= 立刻 hard delete + 关联资产一起 cascade，不留软删。**待确认**。
4. **创作舱项目能不能转给同事？** P1.2 不做，留 P2。但 schema 上要不要预留 `owner_id` 字段以便将来加？我倾向**预留**（一行字段不加白不加）。
5. **本地资产容量上限？** 本地 SQLite 没有硬上限，但用户电脑硬盘有。要不要做"本地资产 > 1GB 时提醒"？**P1.2 不做**，等用户实际撞到再说。

**实施风险**：

- StageEditor 9 个变体里 character / scene / prop 结构相似可以共享 ~70% 代码；但 storyboard / inspiration / script 各不相同 —— 注意不要为了"组件复用"硬把它们抽象到一起，产生 over-abstraction。
- 进度条 + 三栏布局看起来简单，但**响应式**（窗口窄时怎么压缩？）是个常见问题。P1.2 MVP 假设用户用 ≥1280px 桌面，窗口缩到 ≤960px 时三栏改成单栏 + tab 切换（**简化方案**）。

---

## 11. 实施排期（初步建议）

| 阶段 | 工作量 | 责任人 |
|---|---|---|
| P1.0 主页 + Sandbox 改名为创作舱壳 | 2 天 | Claude |
| P1.2 SQLite schema + IPC 通道 | 1 天 | Codex/Claude 协作 |
| P1.2 项目列表 + 新建 wizard | 1 天 | Claude |
| P1.2 工作台壳 + StageProgressBar | 1.5 天 | Claude |
| P1.2 inspiration / script / character / scene / prop 五个 StageEditor | 3 天 | Claude |
| P1.2 storyboard 简化版 | 1 天 | Claude |
| P1.2 export 入库 review | 1.5 天 | Claude |
| P1.2 本地→远程 push 回归测试 | 0.5 天 | Codex |
| **总计** | **~11.5 天** | 主要 Claude |

P1.1 芝兰点子王（spec 已有）跟 P1.2 是**并行 track**：Codex 后端做 P1.1 期间 Claude 做 P1.2 前端。两件互不阻塞。

---

## 12. 后续

- P1.3 AI 集成（生剧本 → DeepSeek / 生图 → NanoBanana / 生视频 → 待选）+ quota / usage_logs
- P1.4 模板系统 + idea-to-project 转换
- P1.5 canvas 编辑器
- P2 创作舱多人协作
