# FableGlitch Studio · P0 基建设计文档

**版本**：Design **v2**
**初稿日期**：2026-04-23
**v2 日期**：2026-04-24
**作者**：Claude Opus 4.7（与乐美林对谈敲定）
**实现分工**：前端 + 所有设计 = Claude；后端（Supabase schema / Vercel Functions / GitHub bot / R2 集成）= Codex GPT-5.4

### v2 相对 v1 的变化（Changelog）

1. **存储架构改为三层分离**：GitHub 仓库只放文本（.md），二进制文件（png/jpg/mp4 等）全部走 **Cloudflare R2**。NAS 做 P0.5 冷备份（不自动化进 P0）。删除所有 Git LFS 相关内容
2. 吸收 Codex 技术评审的全部修正（详见各节内联说明）
3. 认证模型补完：refresh token、关闭邮箱确认、rate limit
4. `/api/assets/push` 按后端分派、加入幂等与补偿逻辑、加入体积上限
5. 新增 **9.E 路径规范化规则**
6. 新增 **10.5 分发与自动更新（P0.5）** 章节
7. `users.id` 与 Supabase `auth.users.id` 强绑定；`assets` 表结构用 `storage_backend + storage_ref` 替代原 `git_path`

---

## 0. 文档性质与使用方式

这份 spec 是 P0（"基建"阶段）的**实现蓝图**。后续阶段（P1 剧本 AI、P2 分镜、P3 生图、P4 音频/交付）会各自生成独立 spec，不进本文。

精度要求：**Codex 读完这份文档后应该能直接写代码，不需要回来反问设计意图**。

---

## 1. Context & Goal

### 1.1 背景
FableGlitch Studios（菲博幻境）是 ProKids（`beva.com` 品牌）旗下新组建的 AI 漫剧业务部门。当前痛点：
- 30+ 创作者（编剧、美术、导演、后期）多数不懂 Git
- AI 生成的资产（剧本、提示词、图片、视频）长期散落在各自本地硬盘 / 飞书 / 网盘
- 已有一份**《AI 漫剧项目入库文件名称标准》**，但没有工具让非技术同事遵守它
- LLM / 生图 API 的费用由公司承担，但缺少谁花了多少的可见性

存储策略沿用工业界"**源代码用 Git、大资产走对象存储、索引走数据库**"的三层分工，**不走 Git LFS**（成本高、带宽受限、不适合工业级内容生产）。

### 1.2 P0 的单一目标
让任一 `@beva.com` 同事登录后，能够：
1. 看到全公司所有剧集的项目树
2. 创建新剧集的**标准 01-05 目录骨架**
3. 在**每个板块的专属入口**导入本地文件（板块强制限制文件类型）
4. 草稿积累后，在剧集级别勾选资产、**一键推送到公司存储**（文本 → GitHub；二进制 → R2）
5. 查看其他同事已推送的资产（按需下载，不预拉仓库）

**P0 完成的可量化标准**：任一新同事 15 分钟内可以完成"注册登录 → 新建剧集 → 导入 1 个剧本 + 3 张角色图 → 一键入库成功"的完整闭环。

### 1.3 P0 明确不做
- 任何 LLM 调用（P1 处理剧本生成 / 审核打分）
- 任何 AI 生图 / 视频（P3）
- 音频板块（Dialog / BGM / Song / SFX — P4）
- 03_Export / 05_Deliver 视频导出（P4）
- LibLib 画布嵌入（P3 方案 A）
- 硬配额 / 强制预算限制（未来，P0 只做用量日志）
- 移动端 / Web 端（始终只做 Windows Electron）
- 剧集间的项目协作（锁编辑、实时同步 —— 留待观察需要时再做）
- **自动更新机制**（P0.5 实施，见 §10.5）
- **NAS 自动同步**（P0.5 实施，同样见 §10.5）

---

## 2. 非协商约束（来自《入库标准》）

这些是 Codex 和 Claude 都不能违背的硬约束：

| 约束 | 来源 | App 的责任 |
|---|---|---|
| 层级是 **系列 → 专辑 → 内容 → 剧集** 四层 | 标准 3.1 | Supabase 对应 4 张表，UI 必须 4 层 wizard |
| 系列 / 专辑缺省用 `NA` 或 IP 缩写 | 标准 2.1.1-2 | `default 'NA'`，允许 `NA` 通过校验 |
| 剧集名必须唯一、必须是正式发布名 | 标准 3.1 | Supabase 加 unique 索引，新建时校验 |
| 版本号格式 `V001`, `V002`, …（按资产独立计数） | 标准 2.2.1 | 元数据记录 `version: int`，展示时格式化 |
| 阶段标识 `ROUGH / REVIEW / FINAL`（枚举） | 标准 2.2.2 推断 | Supabase 枚举类型，P0 默认 `ROUGH` |
| 语言 ISO 639-1 双字母大写（`ZH` / `EN` 等） | 标准 2.1.3 | 前后端各一道白名单校验（见 §4.4） |
| Export 文件名必须 7 字段全齐（`系列_专辑_剧集_版本_阶段_语言_分辨率`） | 标准 3 | P0 不导出，P4 实施时验证 |
| 五级目录结构 `01_Project / 02_Data / 03_Export / 04_Feedback / 05_Deliver` 固定不变 | 标准 3.2 | 新建剧集时 App 自动生成空骨架，同事不能自由改名 |
| DIALOG 文件夹必须附带台词序号剧本 | 标准 2.1.5 | P0 不涉及，P4 实施时校验 |

### 2.1 对标准的 5 处扩展（已与乐美林确认）

1. **文本资产统一转 `.md`**：剧本和提示词标准原文写 `.docx` / `.xlsx`，我们改成 `.md`（Git diff 友好、GitHub 网页直接渲染、体积小一个数量级）。需要 xlsx 时 App 保留"导出 docx/xlsx"按钮
2. **Prompt 拆分两子目录**：`02_Data/Prompt/Image/` + `02_Data/Prompt/Video/`，对应 UI 的两个板块
3. **Shot 拆分两子目录**：`02_Data/Shot/<剧集名>/Images/` + `02_Data/Shot/<剧集名>/Videos/`，对应 UI 的两个板块
4. **存储分层**：同一份剧集的 `02_Data/` 目录在 GitHub（文本）和 R2（二进制）中**镜像相同的路径结构**。用户看到的"剧集文件夹"是一个逻辑概念，物理上跨两个存储。App 对用户隐藏这个分离
5. **路径与文件名规范化**：所有写入存储的路径 / 文件名都经过 §9.E 的规范化步骤——去除非法字符、替换全角符号、截断长度

---

## 3. 架构总览

### 3.1 四层部署

```
┌──────────────────────────────────────────────────────────┐
│  CLIENT: Electron 桌面 App (Windows)                       │
│  ├ React 19 + TypeScript + Vite                            │
│  ├ Tailwind CSS + shadcn/ui + Framer Motion                │
│  ├ better-sqlite3 (本地草稿元数据 + 文件路径索引 + URL 缓存) │
│  └ 本地文件系统（草稿文件 + 已入库资产的工作副本）            │
└──────────────────────────────────────────────────────────┘
                          │ HTTPS (JWT access token)
                          ↓
┌──────────────────────────────────────────────────────────┐
│  BACKEND: Next.js 16 App Router on Vercel                 │
│  ├ Edge Runtime 路由：auth / tree / usage / 轻查询            │
│  ├ Node Runtime 路由：assets/push、assets/:id/content       │
│  │                    （需要大 body 解析 + S3 SDK + Octokit） │
│  ├ 凭证：GitHub PAT / R2 key / Supabase service key 全在 env │
│  └ 路由响应统一 JSON：{ ok, data?, error? }                 │
└──────────────────────────────────────────────────────────┘
        │                   │                   │
        ↓                   ↓                   ↓
  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐
  │ Supabase     │  │ GitHub Private   │  │ Cloudflare R2     │
  │ · Auth       │  │ repo             │  │ · fableglitch-    │
  │ · Postgres   │  │ fableglitch/     │  │   assets bucket   │
  │   （元数据）   │  │ asset-library    │  │ · S3-compatible   │
  │ · RLS        │  │ · bot 账号写      │  │ · 图片视频 binary  │
  │ · 事件日志    │  │ · 只放 .md 文本    │  │   $0.015/GB/月    │
  └──────────────┘  └──────────────────┘  └───────────────────┘

  [P0.5] 公司 NAS ← 定时 R2 全量同步（cold backup, 非实时）
```

### 3.2 各层职责边界（硬规则）

| 层 | 存什么 | 绝对不存什么 |
|---|---|---|
| 本地 SQLite | 草稿元数据、access token、refresh token、资产内容缓存路径 | 用户密码、bot PAT、R2 keys |
| 本地文件系统 | 草稿文件、已入库资产的工作副本、下载过的他人资产缓存 | — |
| Vercel Function | **零持久数据** (stateless) | 任何用户态 |
| Vercel Env Vars | `GITHUB_BOT_TOKEN` / `R2_*` / `SUPABASE_SERVICE_KEY` / 各 LLM/生图 keys（P1+ 用） | — |
| Supabase | 用户、项目元数据、asset 元数据、用量日志、asset_types 配置 | **任何资产文件本身** |
| GitHub 私有库 | **仅 `.md` / `.txt` 等纯文本资产** + 每剧集的 `01-05/` 骨架（以 `.gitkeep` 占位） | 图像、视频、二进制 |
| Cloudflare R2 | **所有二进制资产**（png / jpg / webp / mp4 / mov / webm / docx-原文件 / xlsx-原文件） | 文本（为保持可读性走 GitHub） |

### 3.3 关键不变式

1. **API Key 安全**：真实凭证（`OPENAI_API_KEY` / `GITHUB_BOT_TOKEN` / `R2_SECRET_ACCESS_KEY` / 生图 keys）**永远只在 Vercel 环境变量里**，客户端任何时候都不可读
2. **Supabase Service Role Key 只在 Vercel 服务端用**，客户端只用 anon key + JWT
3. **所有跨用户写入操作都通过 Vercel 代理**；客户端从不直接 `git push`、也不直接 PutObject 到 R2 （用 presigned URL 的情况见 §5.4）
4. **资产文件永远只在"本地 + GitHub（文本）+ R2（二进制）"这三处**；Supabase 只有元数据
5. **存储分派由 `asset_types.storage_backend` 驱动**，代码不硬编码

---

## 4. 数据模型

### 4.1 `users`（绑定 Supabase Auth）

```sql
-- public.users 与 auth.users 强绑定：每条 public.users 必须对应一条 auth.users
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email ~* '@beva\.com$'),
  display_name text not null,              -- 中文名，首次登录必填
  team text,                                -- 'FableGlitch' / 'ProKids-Animation' / ...
  role text not null default 'member'
    check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  is_active boolean not null default true
);

create index idx_users_email on public.users(email);
```

**签入流程**（Codex 侧）：
- 注册时，后端先 `supabase.auth.admin.createUser({ email_confirm: true })` 创建 `auth.users` 行（**email_confirm: true 绕过邮箱确认**，因为已限定公司域名）
- 然后 `insert into public.users` 写入扩展字段，`id` 必须等于 `auth.users.id`
- 两步在同一事务内执行；失败回滚

**RLS**：
- `select`：所有 authenticated 用户可读（同事能彼此看到 display_name）
- `update`：用户只能改自己的 `display_name` / `last_login_at`（基于 `auth.uid() = id`）
- `insert / delete`：仅 service role（后端代理）

### 4.2 `asset_types`（数据驱动的板块注册表）

```sql
create table asset_types (
  code text primary key,                         -- 'SCRIPT', 'SHOT_IMG', 'CHAR' ...
  name_cn text not null,
  icon text,
  folder_path text not null,                     -- 相对剧集根，如 '02_Data/Script'
  filename_tpl text not null,                    -- 如 '{series}_{content}_SCRIPT'
  file_exts text[] not null,                     -- 允许导入的扩展名，如 ['.md','.docx']
  storage_ext text not null,                     -- 'keep_as_is' 或 '.md'
  storage_backend text not null                  -- 'github' | 'r2'
    check (storage_backend in ('github', 'r2')),
  parent_panel text,                             -- '分镜' / '视觉资产' / null
  needs_before text[],                           -- ['SCRIPT'] 等依赖的 type code
  supports_paste boolean not null default false,
  allow_ai_generate boolean not null default false,
  sort_order int not null default 0,
  enabled boolean not null default true
);
```

P0 种子数据见 §9.A（**12 行种子，每行标明 storage_backend**）。

**RLS**：`select` 对所有 authenticated 用户开放；写入仅 service role（通过 Supabase 控制台或管理脚本）。

### 4.3 四层项目树

```sql
create table series (
  id uuid primary key default gen_random_uuid(),
  name_cn text not null,
  name_short text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create unique index idx_series_name on series(name_cn);

create table albums (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete restrict,
  name_cn text not null,
  name_short text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create unique index idx_albums_sc on albums(series_id, name_cn);

create table contents (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references albums(id) on delete restrict,
  name_cn text not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create unique index idx_contents_ac on contents(album_id, name_cn);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id) on delete restrict,
  name_cn text not null,                         -- 全局唯一的正式发布名
  sort_order int not null default 0,
  status text not null default 'drafting'
    check (status in ('drafting', 'review', 'published', 'archived')),
  created_by uuid not null references public.users(id),
  episode_path text not null unique,             -- 规范化后的目录名，同时用于 GitHub 与 R2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_episodes_name on episodes(name_cn);
create index idx_episodes_updated on episodes(updated_at desc);

-- 自动维护 updated_at
create or replace function touch_episodes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_episodes_touch_updated
  before update on episodes
  for each row execute function touch_episodes_updated_at();
```

**`episode_path` 示例**：`"童话剧_格林童话_侏儒怪"`。由 §9.E 的规范化算法从 `series.name_cn / album.name_cn / content.name_cn` 合成。App 与后端**一致使用此字段**拼装 GitHub 路径 + R2 对象 Key，确保两处同步。

**`updated_at` 推送触发**：资产推送成功后，后端显式 `UPDATE episodes SET updated_at = now() WHERE id = ?`，触发上述 trigger。

**RLS**：全局可读；写入仅 service role。

### 4.4 `assets`（资产元数据；不含文件本身）

```sql
create type asset_status as enum ('draft', 'pushed', 'superseded');
create type asset_source as enum ('imported', 'pasted', 'ai-generated');
create type storage_backend as enum ('github', 'r2');

-- P0: asset_status = 'draft' 目前只在本地 SQLite 使用，不在此表写入
-- Supabase 中此表只存 'pushed' 或 'superseded' 的记录
-- 'draft' 值为未来"云端草稿同步"留口，不影响 P0 实现

create table assets (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  type_code text not null references asset_types(code),

  -- 命名变量：按 asset_types.filename_tpl 填充
  name text not null,                            -- 用户输入的角色名/场景名等
  variant text,                                  -- '白天' / '三视图' / null
  number int,                                    -- 只在有 {number} 占位符的 type 用
  version int not null default 1 check (version >= 1),
  stage text default 'ROUGH' not null
    check (stage in ('ROUGH', 'REVIEW', 'FINAL')),
  language text default 'ZH' not null
    check (language ~ '^[A-Z]{2}$'),             -- ISO 639-1 双字母大写；完整 184 种在 §9.E 附表

  original_filename text,                        -- 用户导入时的原始文件名（含扩展）
  final_filename text not null,                  -- 按命名模板 resolve 后的最终文件名（含存储扩展）

  -- 存储定位：两列完整表达"资产在哪"
  storage_backend storage_backend not null,
  storage_ref text not null,                     -- 对 GitHub: 仓库相对路径；对 R2: object key
  storage_metadata jsonb,                        -- GitHub 时存 { commit_sha, blob_sha }；R2 时存 { etag, version_id }

  file_size_bytes bigint,
  mime_type text,
  source asset_source not null,
  status asset_status not null default 'pushed',

  author_id uuid not null references public.users(id),
  superseded_by uuid references assets(id),      -- 指向替代它的 V002
  created_at timestamptz not null default now(),
  pushed_at timestamptz not null default now()
);

create index idx_assets_episode_type on assets(episode_id, type_code);
create index idx_assets_author on assets(author_id);

-- 同一 episode 下同一 storage_backend 同一 storage_ref 唯一（即：路径物理唯一）
create unique index idx_assets_storage_unique
  on assets(episode_id, storage_backend, storage_ref);

-- 同 episode 同文件名只允许一个 pushed（superseded 不算）
create unique index idx_assets_filename_pushed
  on assets(episode_id, final_filename)
  where status = 'pushed';
```

**RLS**：
- `select`：
  - `status = 'pushed'` 行：所有 authenticated 用户可读
  - `status = 'draft'` 行：仅 `author_id = auth.uid()`（但 P0 不在此表写 draft）
- `insert / update / delete`：仅 service role

### 4.5 本地 SQLite（Electron 管理，非 Supabase）

每个用户电脑上 `%APPDATA%/FableGlitch/local.db`（`better-sqlite3` 驱动）：

```sql
-- 本地草稿元数据，推送成功后删除
create table local_drafts (
  id text primary key,                           -- uuid 字符串
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
  local_file_path text not null,                 -- 绝对路径
  size_bytes integer,
  mime_type text,
  source text not null check (source in ('imported','pasted','ai-generated')),
  created_at text not null                       -- ISO 8601
);

-- 最近查看过的已入库资产（按需下载缓存）
create table view_cache (
  asset_id text primary key,
  storage_backend text not null,
  storage_ref text not null,
  local_cache_path text,
  last_fetched_at text,
  size_bytes integer,
  -- R2 presigned URL 临时缓存（避免重复请求签名）
  presigned_url text,
  presigned_expires_at text
);

-- 应用会话状态
create table session (
  key text primary key,
  value text not null
);
-- 常见 key: access_token / refresh_token / access_expires_at / user_id / display_name / last_episode_id
```

### 4.6 `usage_logs`

```sql
create table usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  provider text not null,                        -- 'github' | 'r2' | 'openai' | 'anthropic' | 'nanobanana' ...
  model text,
  action text not null,                          -- 'commit' | 'upload' | 'download' | 'chat' | 'image-gen' ...
  tokens_input int,
  tokens_output int,
  bytes_transferred bigint,                      -- 对 upload/download 有意义
  cost_usd numeric(10, 6),
  episode_id uuid references episodes(id) on delete set null,
  request_id text,                               -- 对应 Vercel request id
  at timestamptz not null default now()
);

create index idx_usage_user_at on usage_logs(user_id, at desc);
create index idx_usage_at on usage_logs(at desc);
```

**RLS**：admin 可读全部；普通 member 只可读 `user_id = auth.uid()` 的记录。

---

## 5. API 契约（Vercel Functions）

所有路由前缀 `/api`。除 auth 外均要求 `Authorization: Bearer <access_token>` 头。响应统一格式：
```
{ ok: true, data: T }    // 成功
{ ok: false, error: { code: string, message: string, details?: any } }  // 失败
```

### 5.1 认证

```
POST /api/auth/signup        [Edge Runtime]
  body: { email, password, display_name }
  校验：
    - email 必须以 @beva.com 结尾
    - password ≥ 8 位且包含至少一个数字和一个字母
    - display_name 非空，最长 32
  400  域名非法 / 密码弱 / display_name 空
  409  已存在
  201  Confirm email OFF（当前开发配置）:
       { user: {id,email,display_name,team,role}, session: {access_token,refresh_token,expires_at} }
       客户端立即持久化 session 并进入主框架
  201  Confirm email ON（未来配置公司 SMTP 后恢复）:
       { user: {id,email,display_name,team,role}, email_verification_required: true }
       不返回 session；Supabase 同时发送验证邮件；用户需点击邮件链接才能登录
  Rate limit: 每 IP 每小时 10 次（429 响应包含 Retry-After）

POST /api/auth/resend-verification    [Edge Runtime]
  body: { email }
  200  { sent: true }    （为防枚举攻击，无论 email 是否存在都返回 sent:true）
  Rate limit: 同 signup（IP 每小时 10 次）

POST /api/auth/login         [Edge Runtime]
  body: { email, password }
  401  凭证错误（INVALID_CREDENTIALS）
  401  邮箱未验证（EMAIL_NOT_CONFIRMED）—— 客户端应提示"去邮箱点验证链接，或 [重发验证邮件]"
  200  { user, session: { access_token, refresh_token, expires_at } }
  Rate limit: 每 IP 每分钟 10 次 + 每 email 每分钟 5 次；触发则 429

POST /api/auth/refresh       [Edge Runtime]
  body: { refresh_token }
  401  refresh_token 无效 / 过期
  200  { access_token, expires_at }
  （Supabase refresh_token 滚动，即每次 refresh 都返回新的；老的会失效）

POST /api/auth/logout        [Edge Runtime]
  body: { refresh_token }
  200  {}
  会调用 Supabase `auth.admin.signOut(user_id, 'global')` 撤销所有会话

GET  /api/auth/me            [Edge Runtime]
  200  { user }
  401  token 无效
```

**邮箱确认策略**：当前开发期 **关闭**（Supabase Dashboard: `Confirm email = OFF`）。后端 `signup` 路由仍走 Supabase public `auth.signUp()`；当 Supabase 返回 session 时，接口返回 `AuthResult`，客户端立即登录并跳过 pending 屏。若未来恢复 `Confirm email = ON`，`signup` 会兜底返回 `SignupPendingResult`，客户端才显示邮箱验证 pending 屏。

理由（当前取舍）：公司 DNS / 正式 SMTP 尚未接入，Resend 测试域名无法稳定覆盖 `@beva.com` 收件人；为了开发期不被邮件投递和速率限制阻塞，注册暂不发确认邮件。域名白名单仍保留为第一道限制。

邮件投递：找回密码仍可低频使用 Supabase built-in email。未来准备公司内部试用前，需先配置公司认可的 SMTP / 域名 DNS，再把 `Confirm email` 打开。

### 5.2 项目树

```
GET /api/tree                [Edge Runtime]
  200  {
    series: [{
      id, name_cn,
      albums: [{
        id, name_cn,
        contents: [{
          id, name_cn,
          episodes: [{
            id, name_cn, status, updated_at,
            episode_path,
            asset_count_pushed: int
          }]
        }]
      }]
    }]
  }
```

### 5.3 剧集

```
POST /api/episodes           [Node Runtime]
  body: {
    series_name_cn: string,  // 可以是现有或新
    album_name_cn: string,
    content_name_cn: string,
    episode_name_cn: string  // 必须全局唯一
  }
  400  任一字段为空或含非法字符
  409  episode_name_cn 已存在
  201  {
    episode: { id, name_cn, status, episode_path, created_at, ... },
    github_commit_sha: string,
    r2_prefix_created: boolean
  }

  后端副作用：
    1. 若 series / album / content 不存在则创建（事务内）
    2. 执行 §9.E 规范化得到 episode_path
    3. GitHub：通过 Octokit 推送 5 个骨架目录（每个放一个 .gitkeep）+ 一个 README.md
       commit message: 'chore(<episode_name>): init skeleton by <display_name>'
    4. R2：创建 <episode_path>/02_Data/ 下各二进制子目录的占位对象（零字节 key：.keep）
    5. 返回 commit_sha + r2 前缀状态

  异常路径：
    - 骨架推送部分成功：记 TODO_cleanup 并返回 207 Multi-Status；运维手工补全
    - GitHub API 不可达：500，不创建 episode 行（事务回滚）

GET /api/episodes/:id        [Edge Runtime]
  200  {
    episode: { id, name_cn, status, episode_path, series_name, album_name, content_name, created_by_name, created_at, updated_at },
    counts: { by_type: { SCRIPT: {pushed: 2, superseded: 1}, SHOT_IMG: {...}, ... } }
  }
```

### 5.4 资产

```
POST /api/assets/preview-filename    [Edge Runtime]
  body: {
    episode_id: uuid,
    type_code: 'SCRIPT' | 'CHAR' | ...,
    name: string,                      // 如 '侏儒怪' / '皇宫大殿'
    variant?: string,
    number?: int,
    version?: int,                     // 默认 1
    stage?: 'ROUGH',
    language?: 'ZH',
    original_filename?: string         // 当 storage_ext='keep_as_is' 时必填（用于确定最终扩展名）
  }
  200  {
    final_filename: string,            // 含扩展，如 '童话剧_侏儒怪_SCRIPT.md'
    storage_backend: 'github' | 'r2',
    storage_ref: string,               // 最终路径，如 'projects/童话剧_格林童话_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md'
    collision?: { existing_asset_id: uuid, existing_version: int }
  }
  400  name 含非法字符 / 必填占位符缺失 / original_filename 未提供但 storage_ext='keep_as_is'

POST /api/assets/push                 [Node Runtime; maxBodySize: 200MB]
  Content-Type: multipart/form-data

  Form fields:
    payload: JSON string:
      {
        idempotency_key: string,       // 客户端生成的 uuid；服务端用此字段做幂等
        commit_message: string,
        items: [{
          local_draft_id: string,
          episode_id: uuid,
          type_code: string,
          name: string, variant?: string, number?: int, version: int,
          stage: 'ROUGH', language: 'ZH',
          source: 'imported' | 'pasted' | 'ai-generated',
          original_filename?: string,
          mime_type: string,
          size_bytes: int
        }, ...]
      }
    file__<local_draft_id>: binary (每个 item 对应一个)

  限制：
    单文件 ≤ 50MB
    单次 batch 总大小 ≤ 200MB
    单次 batch 最多 20 个 item
    所有 item 必须同属一个 episode_id

  201  {
    commit_sha?: string,               // 若此 batch 含文本资产
    assets: [{
      local_draft_id, id, storage_backend, storage_ref, final_filename, status: 'pushed'
    }, ...]
  }

  错误码（按优先级）:
    400 PAYLOAD_MALFORMED      payload JSON 解析失败
    400 ITEM_FILE_MISSING       payload 声明了某 local_draft_id 但没有对应 file__ 字段
    400 FILE_WITHOUT_ITEM       有 file__ 字段但没有匹配的 payload item
    400 DUPLICATE_DRAFT_ID      items 里 local_draft_id 有重复
    400 EMPTY_FILE              某文件 size = 0
    400 FILE_TOO_LARGE          某文件 > 50MB 或总 > 200MB
    400 CROSS_EPISODE           items 里出现多个 episode_id
    400 FILENAME_COLLISION      final_filename 在 episode 内与现有 pushed 资产冲突且不构成 supersede 链
    409 GITHUB_CONFLICT         base commit 过时（有并发 push）——详见"冲突处理"
    502 BACKEND_UNAVAILABLE     GitHub / R2 / Supabase 任一不可达
    200 IDEMPOTENT_REPLAY       idempotency_key 已处理，返回上次结果（**非错误**，仍是 200）

  幂等：
    服务端用一张 `push_idempotency` 表记录 (idempotency_key, user_id, result_json, completed_at)，
    TTL 24 小时。同 key 的二次调用：若先前已成功，直接返回 cached result；若先前失败，允许重试。

  冲突处理（GITHUB_CONFLICT）：
    - 后端自动重试 1 次：重新拉取 main HEAD + 重建 tree + 再 push
    - 仍冲突返回 409 + latest_commit_sha，提示客户端"同事已推送新内容"
    - 客户端可让用户手动 [重试] 或 [稍后]

  部分失败补偿：
    按此顺序执行：
      1. 先把所有文本写成 GitHub commit（原子：要么全成要么全失败）
      2. 再把所有二进制上传 R2（逐个；R2 天然支持并发）
      3. 最后在 Supabase 插入 assets 行（事务）
    
    如果第 2 步中途失败：已上传的 R2 对象保留（孤儿对象日后扫描清理）；Supabase 不插入；回滚 GitHub commit（revert）；返回 502
    如果第 3 步失败：GitHub commit 已成、R2 对象已传，但 Supabase 写失败 → 后端尝试重试 3 次；仍失败则写 `push_dead_letter` 表留档，返回 502，运维人工介入

POST /api/assets/check-collision      [Edge Runtime]
  body: { episode_id, final_filename }
  200  { existing?: { id, version, author_name, pushed_at } }
  用途：客户端在"保存为草稿"时就能提前检测冲突

GET /api/assets                       [Edge Runtime]
  query: ?episode_id=&type_code=&status=pushed (默认)
  200  { assets: [...], total: int }

GET /api/assets/:id/content           [Node Runtime]
  按 storage_backend 分派：
    - github: 后端通过 Octokit 读取 blob 二进制 → stream 回客户端（text/markdown 等）
    - r2: 后端生成 R2 presigned URL（15 分钟过期）→ 302 重定向
  
  304  客户端带 If-None-Match + etag 匹配时
  404  资产不存在 / 已删除
  用途：text 资产内联预览；binary 资产由客户端跟随 302 直接从 R2 下载
```

### 5.5 用量

```
GET /api/usage/me                    [Edge Runtime]
  query: ?since=2026-04-01&group_by=provider
  200  {
    total_usd: 12.34,
    total_bytes: 123456,
    by_provider: { openai: {...}, r2: {...}, github: {...} },
    recent: [{ at, provider, model, cost_usd, action, bytes_transferred }, ...]
  }

GET /api/usage                       [Edge Runtime, admin only]
  query: ?user_id=&since=&group_by=
  403  非 admin
  200  同上 + by_user 维度
```

---

## 6. 核心用户流程（详细时序）

### 6.1 注册 + 首次登录

```
同事收到邀请邮件（或从公司分发页下载安装包）→ 打开 Electron App
  ├ 欢迎页：[邮箱] [密码] [中文姓名] [注册]
  ├ 客户端校验 email.endsWith('@beva.com') + 密码强度 + 中文姓名非空
  ├ POST /api/auth/signup
  │   后端：
  │   1. 二次校验域名、密码强度、display_name
  │   2. supabase.auth.admin.createUser({email, password, email_confirm:true})
  │   3. 同事务 insert public.users 行（id=auth.users.id, email, display_name, team='FableGlitch', role='member'）
  │   4. 返回 { user, session }
  ├ 客户端把 access_token + refresh_token + expires_at 存入本地 SQLite `session` 表
  └ 跳转主界面

首次登录后弹引导浮窗：
  "看起来是你第一次使用 FableGlitch Studio。"
  "选一个已有项目加入，或新建一个项目开始。"
  [浏览全公司项目树] [+ 新建我的第一个剧集]
```

### 6.2 新建剧集 wizard

```
用户点 [+ 新建剧集]
  → 4 步 wizard（大按钮、低密度 UI，符合 §7 视觉规范）

Step 1 "选系列"
  ├ GET /api/tree → 展示现有系列列表 + [+ 新建系列]
  └ 选现有或输入新名 → 下一步

Step 2 "选专辑"
  ├ 展示该系列下的专辑 + [+ 新建专辑]
  └ 如无或选 'NA' → 自动填 NA

Step 3 "填内容名"
  ├ 文本框必填
  └ 预览："你的剧集路径将是 童话剧 / NA / 侏儒怪"

Step 4 "填剧集名"
  ├ 文本框必填，全局唯一
  ├ 规范化后预览最终 episode_path："童话剧_NA_侏儒怪"
  └ 若 episode_name 客户端快速校验发现碰撞 → 红色提示（同时后端会二次校验）

点 [创建骨架] → POST /api/episodes
  后端：
    1. series/album/content 有则复用、无则创建（事务内）
    2. 规范化 episode_path（§9.E）
    3. insert episodes
    4. Octokit 批量创建 GitHub 骨架：
       <episode_path>/01_Project/.gitkeep
       <episode_path>/02_Data/Script/.gitkeep
       <episode_path>/02_Data/Prompt/Image/.gitkeep
       <episode_path>/02_Data/Prompt/Video/.gitkeep
       <episode_path>/03_Export/.gitkeep
       <episode_path>/04_Feedback/.gitkeep
       <episode_path>/05_Deliver/.gitkeep
       <episode_path>/README.md  （含剧集名、创建人、创建时间）
       一次 commit，message: 'chore(<episode_name>): init skeleton by <display_name>'
    5. R2 批量 PutObject 占位：
       <episode_path>/02_Data/Shot/<episode_name>/Images/.keep
       <episode_path>/02_Data/Shot/<episode_name>/Videos/.keep
       <episode_path>/02_Data/Assets/Characters/.keep
       ...（其他 binary 子目录）
    6. 返回 { episode, github_commit_sha, r2_prefix_created:true }
  客户端：跳转到剧集视图（默认进"剧本"板块）
```

### 6.3 导入资产

```
用户在"剧本"板块点 [📁 导入本地剧本文件]
  ├ Electron 原生文件对话框，filters 来自 asset_types.file_exts
  ├ 用户选 '侏儒怪剧本终稿.docx'（12MB）
  │
  ├ 客户端本地处理：
  │   - 若是 .docx：mammoth.js 转为 markdown 文本
  │   - 若是 .md/.txt：直接读
  │   - 计算字数、大小
  │   - 生成 local_draft_id (uuid)
  │
  ├ POST /api/assets/preview-filename
  │   body: { episode_id, type_code:'SCRIPT', name:<content_name>, version:1 }
  │   返回：
  │   {
  │     final_filename: '童话剧_侏儒怪_SCRIPT.md',
  │     storage_backend: 'github',
  │     storage_ref: 'projects/童话剧_格林童话_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
  │     collision?: {...}
  │   }
  │
  ├ 若返回 collision：弹对话框 "此资产已存在 V001，这次是新版本（V002）还是替换？"
  │
  ├ 显示"导入预览"对话框（§7 视觉规范）：
  │   - 紫色显示最终文件名，name 字段可点击编辑
  │   - 字数 / 大小 / 来源标注
  │   - 内容预览（md 渲染）
  │   - [保存为草稿] / [取消]
  │
  └ 用户点 [保存为草稿]
      - 把转换后的 .md 写到本地 drafts/<episode_id>/<local_draft_id>.md
      - 本地 SQLite 插入 draft 行
      - UI 刷新
```

对于图片（CHAR / PROP / SCENE / SHOT_IMG 等，`storage_backend='r2'`）：

```
流程同上，但客户端本地存的是原图文件（不转换），preview-filename 请求带 original_filename
storage_backend 返回 'r2'，storage_ref 是 R2 object key 预期值
保存草稿依然只是本地，不立即上传 R2
```

### 6.4 粘贴文本流

```
点 [📋 粘贴文本]
  → 弹 textarea 模态
  → 用户粘贴/输入 → 预览生成的 .md
  → [保存为草稿] → 与 6.3 同
  （此流只对 supports_paste=true 的 type 开放，P0 仅 SCRIPT / PROMPT_IMG / PROMPT_VID）
```

### 6.5 批量入库（一键 push）

```
用户点底部悬浮"一键入库"或侧边栏 ⚡
  → 跳转入库评审页
  → 显示当前 episode 所有本地草稿（按板块分组），每条复选框
  → 用户勾 3 条：1 个剧本（SCRIPT）+ 2 张角色图（CHAR）
  → 填 commit message，默认自动拼接
  → 点 [⚡ 推送]

客户端：
  1. 生成 idempotency_key = uuid
  2. 打包 multipart：payload + file__<uuid1> + file__<uuid2> + file__<uuid3>
  3. POST /api/assets/push

后端（Node Runtime）：
  1. 校验 JWT，映射 user_id
  2. 解析 payload，执行校验（文件在/无、重复、大小、同 episode、item 数）
  3. 检查 push_idempotency 表：若 key 已存在且成功 → 直接返回 cached result (200 IDEMPOTENT_REPLAY)
  4. 按 storage_backend 分组 items:
     text_items = items where asset_types[type_code].storage_backend = 'github'
     binary_items = items where asset_types[type_code].storage_backend = 'r2'
  
  5. 【阶段 A: GitHub 文本】
     - 拉 main HEAD sha
     - 为每个 text_item 用 Octokit 创建 blob（带内容）
     - 构建 tree（在旧 tree 基础上 patch）
     - 创建 commit，parent = HEAD
     - 更新 ref heads/main
     - 冲突 (409)：自动重试 1 次（重拉 HEAD + 重建 tree）；仍冲突 → 整个请求 409
     - 收集每个 text_item 的 { commit_sha, blob_sha }
  
  6. 【阶段 B: R2 二进制】
     - 对每个 binary_item：S3 PutObject → 记录 etag
     - 任一失败 → 详见"部分失败补偿" (§5.4)
  
  7. 【阶段 C: Supabase 元数据】
     - 事务内 insert assets 行（全部 items）
     - 如果 name+variant+number 已存在 pushed 版本 → 把 superseded_by 指向新版本 + 老版本 status='superseded'
     - UPDATE episodes SET updated_at = now()
     - INSERT usage_logs（provider='github' / 'r2' / 'supabase', bytes_transferred, cost_usd=估算）
     - INSERT push_idempotency 记录成功
  
  8. 返回 { commit_sha?, assets: [...] }

客户端：
  - 删除本地 drafts 文件 + SQLite 行
  - 刷新 UI：3 条变"✓ 已入库"
  - Toast 动效"3 项资产已入库"
  - 对应 assets 在 view_cache 里预缓存 presigned URL（若是 R2）
```

### 6.6 查看他人的已入库资产

```
用户进某板块 → "已入库" tab → GET /api/assets?episode_id=X&type_code=CHAR&status=pushed
  → 展示卡片列表

点某条 → 对预览/下载的路由：
  - 文本（storage_backend='github'）：
      GET /api/assets/:id/content
      后端用 Octokit 获取 blob content → stream 给客户端 → 内联 md 渲染
  - 二进制（storage_backend='r2'）：
      GET /api/assets/:id/content → 302 到 R2 presigned URL
      客户端 fetch 这个 URL，直接从 Cloudflare CDN 下载（不经过 Vercel）
      本地缓存到 %APPDATA%/FableGlitch/view_cache/...
      view_cache 表记录 presigned_url + 过期时间，下次同文件同会话内直接复用

  客户端在 UI 侧栏展示
  [下载到本地] 按钮：让用户选存盘位置后保存原文件
```

---

## 7. 视觉规范（Glitchcore · 大厂极简变体）

### 7.1 设计原则

1. **一屏一个主操作**：每板块有一个主 CTA（导入区），次要动作低调
2. **呼吸感**：主内容最大宽度 `880px` 居中，左右留白
3. **信息密度低**：相邻卡片间距 ≥10px，section 间距 ≥40px
4. **状态用彩色圆点**，不用 pill 徽章
5. **渐变仅用于 Logo + 主 CTA**，其他地方不出现
6. **字号跳跃大**：40 / 22 / 17 / 16 / 14 / 13 / 12 / 11 / 10
7. **技术元素用 mono 字体**：文件名、路径、字数、时间戳、邮箱、快捷键
8. **无装饰线**（scanline / glitch）

### 7.2 色板 (Tailwind tokens)

```
--bg            #0a0a0b
--surface       #131316
--surface-2     #18181d
--surface-3     #1e1e24
--border        #25252c
--border-hi     #35353d
--text          #f5f5f7
--text-2        #a1a1a8
--text-3        #6b6b72
--text-4        #4a4a50

--accent        #9b7cff
--accent-hi     #b294ff
--accent-bg     rgba(155, 124, 255, 0.12)
--accent-border rgba(155, 124, 255, 0.35)

--green         #4ade80    /* "已入库" 圆点 */
--amber         #fbbf24    /* "草稿" 圆点 + P4 徽章 */
--red           #f87171    /* 错误/删除 */

--gradient-brand  linear-gradient(135deg, #9b7cff 0%, #e879f9 100%)
```

### 7.3 字体

```
西文:    'Inter', system-ui, sans-serif
中文:    'Noto Sans SC' (dev) / 'HarmonyOS Sans SC' (prod)
mono:    'JetBrains Mono'

letter-spacing: -0.005em
-webkit-font-smoothing: antialiased
```

### 7.4 间距 · 圆角

- 间距 4px 基数：`4 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 / 40 / 48 / 56 / 72`
- 圆角：按钮 `8-10px`、卡片 `12px`、输入 `8px`、大容器 `16px`、徽章 `4-5px`、圆点/头像 `50%`

### 7.5 组件映射（shadcn/ui）

参考文件 `.superpowers/brainstorm/.../panel-script-v2.html`（v2 mockup）。基础：`Button / Card / Dialog / Tabs / Input / Select / Combobox / Dropdown-Menu / Toast / Skeleton`。所有组件覆盖 §7.2 的 token。

### 7.6 动效（Framer Motion）

- 页面切换：fade + 4px 位移，180ms ease-out
- 卡片 hover：border + bg 色变化，150ms
- 主 CTA hover：box-shadow 扩散 + 微 scale(1.01)
- 入库成功 toast：滑入 + 彩带动效（3 秒自消）
- 模态打开：背景模糊淡入 + spring 弹出

---

## 8. 工作分工

### 8.1 Claude（前端 + 所有设计）

| 目录 / 文件 | 内容 |
|---|---|
| `src/components/ui/` | shadcn/ui 组件 + FableGlitch 主题覆盖 |
| `src/components/panels/AssetPanel.tsx` | **一个通用 AssetPanel**，渲染 8 个 enabled asset_types（数据驱动） |
| `src/components/panels/preview/` | `MdPreview` / `ImagePreview` / `VideoPreview` 三个预览渲染器 |
| `src/components/wizards/` | 新建剧集 4 步 wizard + 导入预览对话框 |
| `src/components/push/` | 入库评审页 |
| `src/features/auth/` | 登录 / 注册 / 会话（含 refresh 轮转） |
| `src/features/tree/` | 项目树数据获取 + 渲染 |
| `src/features/assets/` | 本地 SQLite 层 + 草稿 CRUD + 导入解析 |
| `src/lib/api.ts` | Vercel 后端调用封装（含 refresh 拦截器） |
| `src/lib/docx.ts` | docx → md 转换（mammoth.js） |
| `src/lib/xlsx.ts` | xlsx → md 表格转换 |
| `src/styles/` | Tailwind config + 全局 + token |
| `electron/main.mjs` | 主进程改造 + 新 IPC 通道 |
| `electron/preload.mjs` | `window.videoApp` bridge 扩展 |
| `electron/local-db.mjs` | better-sqlite3 管理本地 SQLite |
| `electron/file-watcher.mjs` | 监控 drafts/ 目录 |
| `docs/superpowers/specs/` | 本 spec + 后续 phases spec |

### 8.2 Codex（后端）

| 目录 / 文件 | 内容 |
|---|---|
| `backend/` | Next.js 16 App Router 项目，部署 Vercel |
| `backend/app/api/auth/` | signup / login / logout / refresh / me |
| `backend/app/api/tree/route.ts` | GET tree |
| `backend/app/api/episodes/` | POST + GET |
| `backend/app/api/assets/` | preview-filename / check-collision / push / [id]/content / GET list |
| `backend/app/api/usage/` | me + admin |
| `backend/lib/supabase.ts` | admin client (Service Role) |
| `backend/lib/github.ts` | Octokit 初始化 + Git Data API 封装（blob/tree/commit/ref） |
| `backend/lib/r2.ts` | AWS S3 SDK 配 Cloudflare R2 endpoint + presigned URL 生成 |
| `backend/lib/auth-guard.ts` | JWT 验证中间件 + rate limit |
| `backend/lib/filename-resolver.ts` | asset_types 模板 → 最终文件名；含 §9.E 规范化 |
| `backend/lib/idempotency.ts` | push_idempotency 表管理 + TTL |
| `backend/lib/compensation.ts` | 部分失败回滚逻辑（GitHub revert / R2 孤儿标记） |
| `supabase/migrations/*.sql` | §4 所有表 + RLS |
| `supabase/seed.sql` | asset_types §9.A 种子 |

### 8.3 协作边界

- **接口文档 = 本 spec 的 §5**。任何一方想改接口必须先改 spec，不能单边
- **共享类型**：`shared/types.ts`（asset / episode / user / api response 等 TS 类型），Codex 建立、Claude 消费
- **调试接入点**：后端部署 Vercel preview 环境，Claude 本地 Electron 配 `.env` 指向 preview URL 联调

---

## 9. 附录

### A. `asset_types` P0 种子数据

| code | name_cn | icon | folder_path | filename_tpl | file_exts | storage_ext | storage_backend | parent_panel | needs_before | supports_paste | allow_ai_gen | sort | enabled |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SCRIPT` | 剧本 | 📝 | `02_Data/Script` | `{series}_{content}_SCRIPT` | `.docx,.md,.txt` | `.md` | **github** | — | — | true | false | 10 | true |
| `PROMPT_IMG` | 分镜图提示词 | 🖼️ | `02_Data/Prompt/Image` | `{series}_{content}_PROMPT_IMG_{number:03}` | `.md,.txt,.xlsx` | `.md` | **github** | 分镜 | `[SCRIPT]` | true | false | 20 | true |
| `PROMPT_VID` | 分镜视频提示词 | 🎞️ | `02_Data/Prompt/Video` | `{series}_{content}_PROMPT_VID_{number:03}` | `.md,.txt,.xlsx` | `.md` | **github** | 分镜 | `[SCRIPT]` | true | false | 21 | true |
| `SHOT_IMG` | 分镜图 | 🖼️ | `02_Data/Shot/{episode}/Images` | `{episode}_SHOT_{number:03}_v{version:03}` | `.png,.jpg,.jpeg,.webp` | `keep_as_is` | **r2** | 分镜 | `[PROMPT_IMG]` | false | false | 22 | true |
| `SHOT_VID` | 分镜视频 | 🎬 | `02_Data/Shot/{episode}/Videos` | `{episode}_SHOT_{number:03}_v{version:03}` | `.mp4,.mov,.webm` | `keep_as_is` | **r2** | 分镜 | `[PROMPT_VID,SHOT_IMG]` | false | false | 23 | true |
| `CHAR` | 角色 | 👤 | `02_Data/Assets/Characters` | `{content}_CHAR_{name}_{variant}_v{version:03}` | `.png,.jpg,.jpeg,.webp` | `keep_as_is` | **r2** | 视觉资产 | — | false | false | 30 | true |
| `PROP` | 道具 | 🎒 | `02_Data/Assets/Props` | `{content}_PROP_{name}_{variant}_v{version:03}` | `.png,.jpg,.jpeg,.webp` | `keep_as_is` | **r2** | 视觉资产 | — | false | false | 31 | true |
| `SCENE` | 场景 | 🏞️ | `02_Data/Assets/Scenes` | `{content}_SCENE_{name}_{variant}_v{version:03}` | `.png,.jpg,.jpeg,.webp` | `keep_as_is` | **r2** | 视觉资产 | — | false | false | 32 | true |
| `DIALOG` | 对白 | 💬 | `02_Data/Audio/Dialog` | `{episode}_DIALOG_{number:03}_{language}` | `.mp3,.wav,.m4a` | `keep_as_is` | **r2** | 音频 | `[SCRIPT]` | false | false | 40 | **false** |
| `BGM` | 配乐 | 🎵 | `02_Data/Audio/BGM` | `{episode}_BGM_{number:03}_{name}` | `.mp3,.wav` | `keep_as_is` | **r2** | 音频 | — | false | false | 41 | **false** |
| `SONG` | 歌曲 | 🎤 | `02_Data/Audio/Song` | `{episode}_SONG_{number:03}_{name}` | `.mp3,.wav` | `keep_as_is` | **r2** | 音频 | — | false | false | 42 | **false** |
| `SFX` | 音效 | 🔊 | `02_Data/Audio/SFX` | `{episode}_SFX_{number:03}_{name}` | `.mp3,.wav` | `keep_as_is` | **r2** | 音频 | — | false | false | 43 | **false** |

`storage_ext = 'keep_as_is'` 表示保留原文件扩展（从 `original_filename` 提取）。
`storage_ext = '.md'` 表示文本类资产统一存成 markdown。

`variant = null` 时，filename_tpl 中 `_{variant}_` 自动简化为 `_`（单下划线，避免连续下划线）。
`variant` 非空时保留。

### B. 环境变量清单

**Vercel**（后端）：
```
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=           # 后端专用
SUPABASE_ANON_KEY=              # 给前端用
SUPABASE_JWT_SECRET=            # 验证客户端 JWT

# GitHub
GITHUB_BOT_TOKEN=               # fine-grained PAT generated by prokids-official, scoped to ProKids-digital/asset-library Contents:rw only
GITHUB_REPO_OWNER=ProKids-digital
GITHUB_REPO_NAME=asset-library  # 与代码侧保持完全一致
GITHUB_DEFAULT_BRANCH=main

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=fableglitch-assets
R2_ENDPOINT=                    # https://<account_id>.r2.cloudflarestorage.com

# Rate limit 存储（推荐 Upstash Redis；本 P0 也可降级为内存，单实例有限制）
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# P1+ 预留
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NANOBANANA_API_KEY=
GPTIMAGE_API_KEY=
```

**Electron 客户端**（打包进 App）：
```
# 后端 API
VITE_API_BASE_URL=https://fableglitch-studio.vercel.app/api

# Supabase anon（仅用于直接订阅实时变更，如果 P0 需要）
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### C. 乐美林的预置工作清单（P0 开工前必做）

按优先级：

1. **GitHub 组织 + 仓库 + 一个 fine-grained PAT**（无独立 bot 账号）
   - 公司主账号 `prokids-official`（邮箱 `prokids.digital@gmail.com`）
   - 该账号拥有 organization `ProKids-digital`（Free plan 即可，30 人内部工具用不到 Team）
   - 在 org 下创建私有仓库 `ProKids-digital/asset-library`
   - 在 org 设置启用 "Allow access via fine-grained PATs"
   - 用 `prokids-official` 生成 fine-grained PAT：Resource owner = `ProKids-digital`、Repository = `asset-library` only、Permissions = Contents Read+Write only
   - 该 PAT 即为环境变量 `GITHUB_BOT_TOKEN`（虽然名为"BOT"，实际持有者是公司主号；保留命名以兼容代码）
   - 不需要建独立 bot 账号——30 人的小工具，commit 作者显示为公司主号反而更直观；fine-grained scope 已经把权限锁死到一个仓库

2. **Cloudflare R2 账户 + bucket**
   - 注册 Cloudflare 账号（免费）
   - 在 R2 面板启用（需绑信用卡，但免 10GB/月 + 免出网流量）
   - 创建 bucket `fableglitch-assets`
   - 生成 R2 API Token（Scopes: `Object Read & Write on fableglitch-assets`）
   - 记下 Account ID + Access Key ID + Secret + Endpoint

3. **Supabase 项目**
   - 注册 Supabase 账号
   - 创建免费 project（足够 P0 期间用）
   - 拿到 anon key + service key + project URL
   - Codex 实施时运行 `supabase/migrations/*.sql` 初始化 schema

4. **Vercel 项目**
   - 注册 Vercel 账号
   - 从 GitHub 仓库导入（Next.js 后端代码）
   - 配置所有 §9.B 的环境变量
   - 绑定域名（可选，不绑也能用默认 `.vercel.app`）

### D. 验收标准（P0 完成的判定清单）

- [ ] 新同事用 `@beva.com` 邮箱成功注册登录
- [ ] 非 `@beva.com` 邮箱注册被拒（400）
- [ ] access token 过期后自动刷新（用户无感）
- [ ] 登录后能看到项目树（含他人项目）
- [ ] 能新建剧集，GitHub 仓库收到骨架 commit，R2 收到占位对象
- [ ] 剧本板块能导入 .docx，App 自动转 md，保存为草稿
- [ ] 粘贴文本可保存为草稿
- [ ] 角色板块只接受 png/jpg（对话框文件类型过滤生效），拒绝其他类型
- [ ] 批量选择草稿一键入库：文本走 GitHub、图像走 R2，Supabase 元数据一致
- [ ] 同 key 幂等：重复 POST /api/assets/push 不会产生双份
- [ ] 推送后草稿状态变 "已入库"，新版本号正确显示
- [ ] 两个同事看得到彼此已 push 的资产；点击角色图时通过 R2 presigned URL 快速下载
- [ ] P4 板块（音频、交付）可见但禁用（灰 + P4 徽章）
- [ ] 用量日志在 push 后写入 Supabase（记 bytes_transferred + 估算 cost）
- [ ] 登录页 rate limit 生效：同 IP 连续失败 10 次触发 429
- [ ] 首次使用引导走完；15 分钟闭环

### E. 路径规范化规则

所有 `episode_path / series_name / album_name / content_name / episode_name / asset.name / asset.variant` 在写入存储前都走下面的流程：

```
normalize(s):
  1. Unicode NFKC 归一化
  2. 全角空格 → 半角空格
  3. 以下替换为下划线 '_'：
       半角空格  /  /  \  :  *  ?  "  <  >  |
       全角 《  》  ！  ？  （  ）  【  】  ：  ；  ，  "  "  '  '
       换行 / 制表符
  4. 多个连续下划线合并为 1 个
  5. 去除首尾下划线和空白
  6. 截断至 64 个"字符单元"（中文字符按 1 计，每个 emoji 按 1 计）
  7. 若结果为空字符串 → 抛 InvalidNameError
```

**episode_path 合成规则**：
```
episode_path = normalize(series.name_cn) + '_' + normalize(album.name_cn) + '_' + normalize(content.name_cn)
```
（不含 episode_name，因为同一 content 下可能有多剧集，episode_name 只出现在文件名里，不进目录名）

**filename 合成规则**：按 `asset_types.filename_tpl` 解析：
- `{series}` ← normalize(series.name_cn)
- `{album}`  ← normalize(album.name_cn)
- `{content}` ← normalize(content.name_cn)
- `{episode}` ← normalize(episode.name_cn)
- `{name}` ← normalize(asset.name)
- `{variant}` ← normalize(asset.variant) 或空（参见 §9.A 变量说明）
- `{number:03}` ← asset.number 的 3 位零填充
- `{version:03}` ← 'v' + version 的 3 位零填充（注意 v 是小写，见标准）
- `{language}` ← asset.language（大写双字母）

模板中若某段因变量为空被折叠为连续下划线，自动合并。

### F. ISO 639-1 语言代码白名单（后端校验用）

P0 接受以下常见子集；完整 184 种参考《入库标准》附件 1。后端 `check(language ~ '^[A-Z]{2}$')` 只做格式校验，接受下列白名单由后端 middleware 维护：

```
ZH EN JA KO FR DE ES IT RU PT AR HI TH VI ID MS
```

（更完整列表随 P0 需要再加；额外语种扩展属于一次 Supabase migration，不涉及代码改动。）

---

## 10. 后续阶段 roadmap

| 阶段 | 核心能力 | 依赖的 P0 模块 |
|---|---|---|
| **P0.5** | 分发打包 + 自动更新 + NAS 冷备份脚本 | P0 全部 |
| **P1** 剧本流 | LLM 代理 + 三幕剧结构化 + 剧本审核打分 | auth / 剧本板块 UI |
| **P2** 分镜流 | 自动镜头数计算 + 时长把控 + 提示词生成 | P1 剧本 |
| **P3** 生图流 | nanobanana / gpt-image-2.0 代理 + @角色召唤 + LibLib 嵌入 | P2 分镜 + 角色库 |
| **P4** 音频/视频 | 开启 DIALOG/BGM/SONG/SFX 板块 + 03_Export/05_Deliver | 所有前置 |

### 10.5 P0.5 分发与自动更新（spec 主体不实施，但此处定方案）

#### 打包
- `npm run dist` 已配置 electron-builder NSIS，产出 `release/FableGlitch Studio Setup x.y.z.exe`
- 每次发版：打包 → 上传到"分发位置" → 更新 manifest

#### 分发方案（按简单度）

**推荐：OneDrive for Business 共享链接**
- 维护一个文件夹 `FableGlitch/Releases/`
- 里面放历年 `.exe`
- 发一个**公司群公告**+直链
- 成本 0

**可选：Vercel 静态站**
- `fableglitch-install.vercel.app`
- 列出最新版、历史版、changelog
- 有仪式感，但多一步维护

#### 自动更新（`electron-updater`）
1. **Manifest**：部署在 Vercel 或 OneDrive 的一个 JSON：
   ```json
   {
     "version": "1.2.3",
     "installerUrl": "https://.../FableGlitch-1.2.3.exe",
     "releaseNotes": "修复导入崩溃 + 新增场景板块"
   }
   ```
2. **App 启动时**：后台读 manifest；如果 `manifest.version > 当前版本` → 弹提示 `[立即更新] [稍后]`
3. **用户点更新**：electron-updater 自动下载 + 安装 + 重启

#### NAS 冷备份（可选的小脚本）
- 单独一台办公室电脑跑 nightly cron
- Rclone 命令：`rclone sync r2:fableglitch-assets /mnt/nas/fableglitch/ --progress`
- GitHub 文本靠 nightly `git clone --mirror` 到同 NAS 路径
- 丢数据的最坏场景：损失 24h 增量

---

—— END ——
