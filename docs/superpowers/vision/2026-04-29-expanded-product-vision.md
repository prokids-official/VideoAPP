# FableGlitch Studio · 扩展产品 Vision

> 日期：2026-04-29
> 这份文档**不是** spec，是**产品愿景捕获**——把乐美林后续讨论中描述的功能蓝图存档，以便 P0 完工后 P1-P5 各阶段独立出 spec 时可以回查原意。
>
> P0（已基本完成）只覆盖"基础资产同步管理"（导入文件 + 一键推送 + 浏览他人资产）。本文记录的是 P0 之外的所有产品野心。

---

## 0. 产品分层（P0 → P5 完整图景）

| 阶段 | 用一句话 | 目标用户行为 |
|---|---|---|
| **P0 已基本完成** | "把已有资产从本地传上去 + 看到别人的" | 同事用 App 登录 → 导入文件 → 一键推送 → 浏览全公司资产 |
| **P0.5** | 分发 + NAS 冷备 + 自动更新 | 运维：每月给 NAS rclone 同步一次；用户：App 自动升级 |
| **P1** | "AI 帮我从零写一份合规剧本" | Agent 化剧本生成（详见 §1） |
| **P2** | "把剧本变成一组分镜 + 提示词" | 自动镜头切分 + 时长预算 + 提示词产出（详见 §2） |
| **P3** | "把提示词变成图 + 视频" | 接 nanobanana / gpt-image / 视频模型 API（详见 §3） |
| **P4** | "做配音 + 音乐 + 音效 + 最终交付" | 音频 4 板块 + 03_Export / 05_Deliver（详见 §4） |
| **P5** | 画布 / 3D 编排（探索） | 类 LibLib / Storyboard-Copilot 的可视化编排（详见 §5） |

---

## 1. P1 · 剧本 Agent

### 1.1 核心理念
剧本不是"AI 给个文本"，而是一个**Agent 走预设 skill** → 输出 → **自动评分** → ≥80 才放行（或人工 override）→ 落到 SCRIPT 资产板块。

### 1.2 新建剧本表单（UI 草案）

```
创作模式
  ○ 从零创作
  ○ 优化已有剧本（粘贴或上传 .md/.docx）

体量
  ○ 概念超短片 (single shot)
  ○ 叙事短片 (3 幕)
  ● 电影长片 (3 幕 + 结构表)
  ○ 多集剧集 (按集分章)

单集时长（仅当体量为短片/单集时显示）
  [ 30 秒 ] [ 1 分钟 ] [ 2 分钟 ] [ 3 分钟 ]

超短片路径（影响 STEP1 工作流）
  ○ 让 AI 判断
  ● What-If · 反常识假设
  ○ How-to-Tell · 换形式讲

高级选项（可选折叠）
  题材/大师风格：[输入框]
  一句话概念：[textarea, 18/建议 30-150 字]

[开始创作 → 进入第 1 步]
```

### 1.3 模型与认证（BYOK）

#### 默认提供商（公司付费）—— 双层

| 层级 | 模型 | 用在哪 | 配额 |
|---|---|---|---|
| **Pro** | Codex OAuth（基于乐美林的 Codex Pro 账号共享） | 仅剧本生成，每用户 3 次/账户 | 让用户体验 Pro，本质是 demo |
| **Standard** | **DeepSeek v4 Pro** API key | 所有 Agent 默认（写作/评分/分镜/提示词） | 每用户起始 ¥10 |
| **Standard 廉价档** | **DeepSeek Flash v4** API key | 同上，按需切（可由 admin 设为某些 skill 默认） | 同 ¥10 池 |

⚠️ "Codex OAuth" 的实际接入方式 P1 实施时需要进一步澄清——OpenAI 没有标准 OAuth 让第三方 App 共享 ChatGPT 账号配额。可行做法：
- (a) 实际是乐美林的 API key 当公司 default，限速 3 次/用户实现"Pro"配额错觉
- (b) 接 OpenAI Sign-In（仅做身份验证），背后还是 API key
- 二者都需要 P1 启动时与乐美林确认

#### BYOK（用户接自己的 key）

- 永远**优先走 BYOK**（如果用户填了），公司 key 作为 fallback
- UI：每个用户在设置页"Provider Profiles"区域：
  - [ ] 用我自己的 key（toggle）
  - 选模型：DeepSeek v4 Pro / DeepSeek Flash v4 / Claude / GPT-4 / 第三方代理
  - API Key 输入框
  - **[测试连接] 按钮**——必备，按钮调一次最简单的 chat completion 验证 key 有效
- 存储：用户的 key 加密后存本地 SQLite（永远不上服务器；服务端永远不见 BYOK key）

#### 用量记录（admin 可见）

- 每次走默认模型的调用都记 `usage_logs`：user_id / provider / model / tokens / cost_usd
- BYOK 用户的调用**不记** cost_usd（公司没花钱），但仍记 tokens 用于审计
- 乐美林 admin 身份登录后看到全公司花费报表 + 每人花了多少
- 个人用户只看自己的花费（已实现：spec §5.5 GET /api/usage/me）

#### 配额 + 申请扩额

- 默认配额（admin 可调）：
  - 模型调用：每用户 ¥10/月
  - 生图：每用户 10 张/月
  - Codex Pro 体验：每用户 3 次/账户（生命周期总额，不重置）
- 用户超额 → 弹"申请扩额" → 按钮提交 → 写一条 `quota_requests` 表行 → admin 收到通知
- admin 在管理面板批准/拒绝/部分批准（如批 +¥20）
- 配额随时可调：admin 可全局调整默认值，或针对单个用户单独调

#### 数据模型增量（P1 实施时）

```sql
create table provider_profiles (
  user_id uuid references users(id) on delete cascade,
  provider text,                 -- 'deepseek-pro' | 'deepseek-flash' | 'codex-oauth' | 'claude' | ...
  use_byok boolean default false,
  byok_encrypted text,           -- 用本地 SQLite 不进此表；这里只为非 BYOK 用户的偏好默认
  primary key (user_id, provider)
);

create table user_quotas (
  user_id uuid primary key references users(id) on delete cascade,
  budget_usd numeric(10,2) default 1.40,    -- ~¥10
  budget_used_usd numeric(10,4) default 0,
  image_quota int default 10,
  image_used int default 0,
  codex_pro_uses int default 3,
  codex_pro_used int default 0,
  updated_at timestamptz default now()
);

create table quota_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  request_type text,             -- 'budget' | 'image' | 'codex-pro'
  current_value numeric,
  requested_value numeric,
  reason text,
  status text default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
```

### 1.4 Skill / Role 注入

Agent 的 system prompt 不是临时凑的，是**预定义的 skill 库**。乐美林给的"好莱坞级 3D 动画导演 & 顶级 AI 编剧"是首批 skill 之一。

每个 skill 文件包含：
- Role 定义（你是谁）
- 美学基调（Core Vibe）
- 剧本与台词技能
- 画面分镜提示词模板
- 视频生成提示词模板
- 交互法则

存储位置（建议）：`backend/skills/<skill-id>.md`，admin 可加可改可禁用，普通用户从下拉选。P1 实施时设计 `skills` 表（type_code='SCRIPT' 时可绑定一个 skill_id）。

### 1.5 自动评分门控

- 架构：**评分官就是另一个 Agent 角色**，共享同一套 provider 选择 + skill 注入基础设施（默认走公司 API，或用户 BYOK）
- 流程：写作 Agent 产出剧本 → 评分 Agent 跑评分提示词 → 输出 0-100 分 + 改进建议
- ≥ 80：直接落到 draft，可一键推送
- < 80：UI 显示评分 + 建议，按钮：[让 AI 重写] / [手动通过] / [我来改]
- **评分提示词**：由乐美林手写、维护，作为 `skills` 表里 `category='script-scorer'` 的一条 skill；admin 可改（同写作 Agent 的 skill 一样的管理路径）
- 评分维度（草案，由乐美林敲定最终版本）：节奏 / 台词新鲜度 / 反差感 / 现代化梗密度 / 视听细节 / 整体可读性
- **手动 override 默认开启**：UI 允许"手动通过"按钮即使 < 80 也能强行推过——理由：AI 评分是辅助不是裁判，作者总有 AI 看不出的好理由

### 1.6 剧本输出三种形式（同一份内容，三种视图）

1. **预告片式（trailer）**：含时间码 / BGM / 视觉描述 / VO / Title Card —— 例：
   ```
   【ACT I: The Despair】(0:00 - 0:35)
   - 0:00 - 0:08 [Visual] 极度阴暗的地牢，缓慢推轨...
   - 0:15 - 0:25 [VO] Queen: It all started with a lie...
   - [Title Card 1] IT STARTED WITH GREED
   ```
2. **纯台词式（dialogue-only）**：只有 Scene 标题 + 角色 + (Tone) + 台词，给配音演员看
3. **外包友好式（shooting-script）**：编号 1-5 + 场景描述 + △ 动作行 + 角色 + 中英对照台词 + 特殊镜头标注（Whip pan / Squash and Stretch / Snap fingers）

UI 一份剧本资产可在三种 view 间切换显示。

### 1.6 Skill 库的管理权限（Q4 决策方案）

三种实现方式 + 我的推荐：

#### 方案 A：纯 Markdown 文件（git tracked）

文件结构：
```
backend/skills/
├── script-writer/
│   ├── grim-fairy-3d.md          ← 你的好莱坞级 3D 动画导演 skill
│   ├── pixar-emotion.md
│   └── ...
├── script-scorer/
│   └── quality-gate.md            ← Q1 答案：你写的评分官提示词
├── prompt-image/
│   ├── volumetric-lighting.md
│   └── ...
└── prompt-video/
    └── ...
```

每个 .md 文件 YAML frontmatter：
```yaml
---
id: grim-fairy-3d
name_cn: 好莱坞级 3D 动画导演
category: script-writer
default_model: deepseek-v4-pro
enabled: true
version: 3
---

# Role: 好莱坞级 3D 动画导演 & 顶级 AI 编剧与视效工程师

1. 核心定位与美学基调...
（你已经写好的全部内容）
```

后端启动时把 `backend/skills/**` 全部加载进内存（或定时刷新）。

| 优 | 劣 |
|---|---|
| ✅ git 历史天然带版本（每次改都看 commit diff） | ❌ 改 skill 必须懂 git 或开发环境 |
| ✅ admin 之间用 PR 协作（如果未来不止你一人） | ❌ 修改后需要触发 Vercel redeploy 才生效（约 60 秒） |
| ✅ markdown 编辑器/IDE 体验最佳，长文本舒服 | ❌ 没法 hot-reload 在跑的 Agent 行为 |
| ✅ 零额外 UI 开发，直接 P1 起跑 | ❌ 不能给单个用户灰度分发 skill |
| ✅ 备份 = 仓库备份，不用单独管 | |

#### 方案 B：纯 UI 表单（数据库存）

App 内一个 admin-only 页面，表单：
- 名称 / 分类 / 默认模型 / enabled toggle
- 大 textarea 编辑 system prompt
- Save → 写 `skills` 表

| 优 | 劣 |
|---|---|
| ✅ 非技术 admin 也能改 | ❌ 修改无 git 历史（除非自己实现版本表） |
| ✅ 改完即时生效（下一次调用就用新版） | ❌ 长 prompt 在 textarea 里编辑很难受（无 syntax highlight、无搜索替换） |
| ✅ 可以做权限分级（A admin 只能改 X 类，B admin 改 Y 类） | ❌ 备份 = 数据库备份，比 git 麻烦 |
| ✅ 可以做灰度（某 skill 只对一部分用户开放） | ❌ Vercel 之外要建 admin UI、role 检查、CRUD 路由——**~3-4 个 task 的额外开发** |

#### 方案 C：混合（markdown 真理 + UI 仅做激活/测试）

- skill 内容在 markdown（git 真理）
- App 里一个 admin 页面读取所有 skill，可：
  - 看清单
  - 点 enable/disable（写一条 override 进数据库）
  - 点"测试运行"用样例 input 跑一次看输出
  - 看本周用了多少次（usage_logs 透视）
- **不能**在 UI 里改 prompt 内容——改要回 markdown / git

| 优 | 劣 |
|---|---|
| ✅ 编辑体验 = 方案 A 最佳 | ❌ 比 A 多一个简单 admin UI 要做 |
| ✅ 运行时仍可灵活 enable/disable + 测试 | ❌ 比 B 仍需 git 操作改内容 |
| ✅ git 历史 + 灰度能力都有 | |

#### Claude 推荐：**方案 A**（最简单，目前阶段够用）

理由：
1. **你是唯一 admin**——没有"非技术同事编 prompt"的需要
2. **你有 IDE + git workflow**——markdown 是你最擅长的格式（看你写 v2 spec 1100 行就知道）
3. **prompt 内容很长**（你给的好莱坞 skill 1500+ 字符）——textarea 里编辑等于自虐
4. **Vercel redeploy 60 秒**对内部工具是可接受的——又不是要秒级 hotfix
5. **将来真要多 admin / 灰度时再升级到方案 C**——A 升级到 C 简单（只是加个 UI 读 markdown），代价小；B 退回 A 难（数据迁回 git 是麻烦事）

简单说：**别为还没遇到的问题加复杂度**。等真有同事说"我也想加个 skill" 那天，再上方案 C 不迟。

#### P1 实施时的具体动作

- 建 `backend/skills/` 目录
- 把你给的"好莱坞级 3D 动画导演"作为第一个 skill：`backend/skills/script-writer/grim-fairy-3d.md`
- 写一个加载器 `backend/lib/skill-loader.ts`：启动时扫目录、解析 YAML frontmatter、按 category 索引到内存 Map
- API：`GET /api/skills?category=script-writer` 返回当前可用 skill 列表（仅含 id + name_cn + description，不返回完整 prompt）
- 调用 Agent 时：`POST /api/agents/script-writer/run` 带 `skill_id` 参数，后端组装 `system_prompt = skill.markdown_body + user_inputs`

### 1.8 用户个人 prompt 库（NEW）

公司 skill = 你把关质量的"成品"，存 markdown。**用户个人 prompt** 是同事日常累积的私人偏好——存数据库。

#### UI

每个 prompt 板块（剧本 / 分镜图 / 分镜视频）右上角 tab：
```
[ 公司 skills ]  [ 我的 prompts ]  [ 知识库 ]
```

"我的 prompts"页：列表 + 新增/编辑/删除/复制到剪贴板。

#### 数据模型

```sql
create table user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  category text,         -- 'script-writer' / 'prompt-image' / 'prompt-video'
  name text not null,
  description text,
  system_prompt text not null,
  enabled boolean default true,
  is_public boolean default false,    -- P1 默认 false；P2+ 可选共享给同事
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_user_skills_user_cat on user_skills(user_id, category);
```

#### 升级路径

- 同事写出特别好的 prompt → 标记 `is_public=true`
- 出现在"社区池"标签（P2+ 加）
- 你 admin 看到觉得好 → 手动 dump 进 `backend/skills/` 提到公司库
- 这个流程不自动化（避免 prompt 质量参差），由 admin 把关

### 1.7 数据模型增量（P1 实施时）

```sql
-- skills: 预设的 Agent role 库
create table skills (
  id text primary key,
  name_cn text,
  category text,          -- 'script' / 'image_prompt' / 'video_prompt' / 'review'
  system_prompt text,
  enabled boolean
);

-- script_inputs: 用户填的创作表单（生成参数留档可复现）
create table script_inputs (
  asset_id uuid references assets(id),
  mode text,              -- 'from-scratch' / 'optimize-existing'
  volume text,             -- 'concept-short' | 'narrative-short' | ...
  duration_sec int,
  path text,              -- 'AI-decide' | 'what-if' | 'how-to-tell'
  master_style text,
  one_line_concept text,
  skill_id text references skills(id),
  provider text,          -- 'company-default' | 'user-byok'
  model text,
  score int,
  ai_feedback text
);
```

---

## 2. P2 · 分镜 + 提示词流

### 2.1 自动镜头切分
剧本 → Agent 按视频时长预算（如 1 分钟 = 12-15 个镜头）切分。每个镜头分配秒数 + 摄影机运镜 + 关键动作。

### 2.2 提示词产出（双胞胎结构）
每个镜头产出**两条提示词**：
- **分镜图提示词**（PROMPT_IMG）—— 单帧静态构图，按 §1.4 模板的 [Style/Subject/Environment/Lighting/Negative]
- **分镜视频提示词**（PROMPT_VID）—— 动态运镜，按 §1.4 的 [运镜/动作/环境物理动态/音效/对话/时长留白]

两份独立资产，独立版本，独立评分。

### 2.3 镜头时长智能匹配
不写 "5 秒" 这种 magic number，按预告片节奏给指导：

```
0:00-0:08 推轨开场     → 8 秒视频，慢节奏
0:08-0:15 闪回剪辑     → 7 秒，快剪
0:15-0:25 旁白特写     → 10 秒，定格脸
0:25-0:35 反转 + 字幕  → 10 秒
```

UI 上拖拽时间轴可调。

---

## 3. P3 · 生图 / 生视频流

### 3.1 双轨道（板块化）

- **生图板块**（独立大板块）
  - **文生图**（text → image）：粘提示词 → 产出 → 落到 SHOT_IMG / CHAR / PROP / SCENE
  - **图生图**（image → image）：上传参考 + 提示词
  - **720° 全景图**：调用支持的 API（gpt-image-2 据说支持，nanobanana 有专门 mode）
  - 提供"在浏览器打开"按钮 → 跳转官网（用户用自己账号兜底）

- **生视频板块**（依赖分镜图 + 视频提示词）
  - 输入：SHOT_IMG (起始帧) + PROMPT_VID
  - 输出：SHOT_VID
  - 模型支持：Runway Gen-4 / 即梦 / Kling / Veo

### 3.2 API 集成

| 服务 | 用途 | 公司 key 还是 BYOK | 默认配额 |
|---|---|---|---|
| nanobanana pro | 文生图 / 图生图 / 720° | 公司 key | 10 张/用户/月 |
| gpt-image-2 | 文生图 / 720° | 公司 key | 同上池子 |
| Runway / Kling | 生视频 | BYOK 优先（费用高） | 不设默认 |

配额逻辑同 §1.3 user_quotas 表的 `image_quota` / `image_used` 字段。超额申请同样走 quota_requests 流程。

### 3.3 跳转兜底
对每种 API 类型，都放一个**"在 nanobanana 官网打开"** 类的小按钮，把当前提示词 query string 带过去——用户用自己账号生成完，手动下载 → 拖回 App 走"图片导入"路径。这是配额耗尽 / API 故障 / 用户想用更高画质设置时的逃生口。

### 3.4 提示词知识库（NEW）

乐美林手上有大量分镜提示词模板：光影模板 / 运镜提示词模板 / awesome-image2.0 这种 GitHub 库。需要内置成**知识库板块**让用户选用。

#### UI 设计
- 提示词面板（PROMPT_IMG / PROMPT_VID 板块）右侧加一个"📚 知识库"侧栏
- 折叠树状分类：
  - 光影
    - 顶光（Harsh top-light）
    - 体积光（Volumetric god-rays）
    - 底光（Underlighting）
    - ...
  - 运镜
    - 极速推轨（Fast dolly-in）
    - 子弹时间（Bullet time）
    - 手持呼吸感（Handheld breath）
    - ...
  - 风格参考库（来自 awesome-image2.0）
    - Pixar Cinematic
    - Spider-Verse
    - Studio Ghibli
    - ...
- 点条目：
  - [复制] 把这段贴到当前编辑的提示词
  - [插入] 在当前光标位置插入
  - 详情面板预览样图（如有）

#### 数据模型

```sql
create table prompt_kb_entries (
  id uuid primary key default gen_random_uuid(),
  category text,         -- 'lighting' | 'camera' | 'style' | 'character' | 'scene-fx' ...
  name_cn text,
  name_en text,
  prompt_snippet text,   -- 实际复制的英文片段
  description text,      -- 中文解释
  preview_image_url text, -- 可选样图（R2）
  source text,           -- '内部' | 'awesome-image2.0' | ...
  enabled boolean default true,
  sort_order int
);
```

#### 内容来源
- 乐美林手写填入大部分（光影 / 运镜模板）
- 一次性 import 自 awesome-image2.0 / awesome-prompts 等开源库
- admin 后续可加可改（admin 管理 UI 同 skills，详见 §1.6 Q4）

---

## 4. P4 · 音频 + 交付

### 4.1 4 个音频板块（spec §9.A 已建好但 disabled）
- DIALOG（对白）
- BGM（配乐）
- SONG（歌曲）
- SFX（音效）

P4 把 `enabled=false` 改成 `true`。具体生成流程（TTS / 音乐 AI / 音效库）单独出 spec。

### 4.2 03_Export + 05_Deliver
- 03_Export：渲染合并所有镜头视频 + 多语言字幕 + 旁白
- 05_Deliver：按平台规格（B 站 / 抖音 / YouTube / TikTok）切尺寸 + 转码（spec 入库标准 §3 列了 16 种规格）

文件名 7 字段全齐：`系列_专辑_剧集_版本_阶段_语言_分辨率`。

---

## 5. P5 · 画布 / 3D 编排（双板块结构，已锁定 2026-04-29 v2）

### 5.1 两个独立板块

| 板块 | 主路径 | 备选路径 | 用户体验 |
|---|---|---|---|
| **画布 · LibLib** | Electron `BrowserView` 真嵌入 LibLib 网页（不是 iframe，绕过 X-Frame-Options） | 同板块顶部一个"在浏览器打开"按钮，点击 `shell.openExternal()` 跳系统默认浏览器（容灾 / 高画质大窗口需求） | 在 App 里直接用 LibLib 全部功能；用户登 LibLib 账号一次后 BrowserView 持久化 cookie |
| **画布 · 自建** | tldraw / Excalidraw / fabric.js 嵌入 React + Tailwind 自定义皮肤 | — | 在 App 里直接画 + 资产自动落到我们 R2 / GitHub，与剧本/分镜/角色板块联动 |

### 5.2 板块 1（LibLib）实施要点

- Electron 主进程开一个 `BrowserView`：
  ```js
  const { BrowserView } = require('electron');
  const view = new BrowserView({ webPreferences: { partition: 'persist:liblib' } });
  mainWindow.setBrowserView(view);
  view.setBounds({ x, y, width, height });  // 嵌进 React 页面的某个 div 区域
  view.webContents.loadURL('https://liblib.art/canvas');
  ```
- 用 `partition: 'persist:liblib'` 让 LibLib cookie 持久化，用户只登一次
- "在浏览器打开"按钮：
  ```js
  const { shell } = require('electron');
  shell.openExternal('https://liblib.art/canvas');
  ```
- 法律 / 隐私：在 App 设置页加一段免责声明"画布 · LibLib 板块嵌入第三方 LibLib 服务，使用受其条款约束"
- 资产同步：LibLib 没有公开 export API，用户画完手动导出 → 拖回 App 走"图片导入"流程（与"在浏览器打开"备选一致）

### 5.3 板块 2（自建）实施要点

- **UI 必须好看**——这是乐美林明确要求。设计稿 P5 启动时另起一份 Claude Design 任务。
- 技术选型（待 P5 启动时定）：
  - **tldraw** ⭐ 推荐：现代化白板，最像 Excalidraw，社区活跃，原生 React + TypeScript
  - **Excalidraw**：手绘风，著名但与 FableGlitch 极简风格略有冲突
  - **fabric.js**：底层最自由但需要自己写 UI shell
- 参考开源 repo（乐美林指）：
  - **xhongc/ai_story** — Python/Vue 故事生成 + 画布
  - **henjicc/Storyboard-Copilot** — JS 分镜板设计
  - 借鉴他们的 UX，但用 React + Tailwind 重写匹配 FableGlitch 设计语言
- 与 R2 / GitHub 联动：
  - 画布上的图片资产可拖入或选取 → 落到 SHOT_IMG / CHAR / PROP / SCENE 板块
  - 画布快照导出 PNG → 落到对应资产板块
  - 自建画布的"工程文件"本身（json）存为 `CANVAS` 类型资产（P5 时新增 asset_type）

### 5.4 进阶：3D 场景 + 小人摆位

- Three.js + react-three-fiber + drei
- 拖拽 3D 模特 + 调整姿势 + 调相机角度 → 截图作分镜图参考喂给 AI 生图
- 作为板块 2（自建画布）顶部的 toggle "2D / 3D" 模式，**不另开板块**
- P5 内部低优先级，P0-P4 跑稳后再考虑

### 5.2 自建画布的开源参考

乐美林指了两个 repo：
- **xhongc/ai_story** — Python/Vue，AI 故事生成 + 简单画布
- **henjicc/Storyboard-Copilot** — JS，分镜板设计

P5 启动时 fork / 借鉴他们的 UX，但用 React + Tailwind 重写以契合 FableGlitch 的设计语言。

### 5.3 进阶：3D 场景 + 小人摆位

- Three.js + react-three-fiber + drei
- 拖拽 3D 模特 + 调整姿势 + 调相机角度 → 截图作为分镜图参考喂给 AI 生图
- P5 内部**低优先级**——P0-P4 跑稳后再考虑
- 即使做也建议作为"自建画布"板块的一个进阶模式（比如顶部 toggle 2D/3D），不另开板块

---

## 6. 数据架构调整建议（不在 P0 内做）

### 6.1 NAS 替代 R2 方案（P2 之后再议）

乐美林希望 R2 的部分以后切到公司 NAS。**P0 阶段必须用 R2**（理由：Vercel 函数无法访问内网 NAS），但 P2 之后可以考虑：

- **方案 1（最干净）**：保持 R2 当生产存储，**NAS 做 nightly rclone 镜像**（已是 spec §10.5 的 P0.5 方案）
- **方案 2（激进）**：在公司机房部署 MinIO（开源 S3）+ Cloudflare Tunnel 暴露给 Vercel → 用 NAS 当后端 → 完全替代 R2
  - 优点：数据不出公司
  - 代价：你成为 IT，故障 oncall 自己背
- **方案 3（折衷）**：双写。R2 当面向用户的快通道，NAS 当主存储。Push 时同时写两边。
  - 复杂度高

P2/P3 阶段产出量大时再决策，不阻塞 P0/P1。

---

## 7. 待回答的关键问题（P1 启动前）

请乐美林后续找时间逐个回应（不急，P0-D 完工时再谈）：

1. ~~**评分 ≥80 才放行**——评分模型/提示词由谁产出？同时手动 override 的开关默认开还是关？~~
   ✅ 已回答 (2026-04-29)：评分官是另一个 Agent 角色（同一套 provider/skill 架构）；评分提示词由乐美林手写并存为 `skills` 表中 `category='script-scorer'` 的条目；手动 override 默认开启。详见 §1.5
2. ~~**公司默认模型预算**——一个用户一天能花公司多少钱（成本上限）？超过限额怎么处理~~
   ✅ 已回答 (2026-04-29)：每用户起始 ¥10 模型预算 + 10 张图配额 + 3 次 Codex Pro 体验；超额可申请，admin 审批；admin 可调；详细数据模型 + UI 见 §1.3
3. ~~**Codex OAuth 登录**——是给用户登录 App 还是给 Agent 调模型？~~
   ✅ 已回答 (2026-04-29)：Codex 当 Pro 模型用，仅剧本生成、3 次/账户；其他全用 DeepSeek v4 Pro / Flash v4。详见 §1.3。**实际接入方式（OAuth vs API key 共享）P1 启动时与乐美林二次确认**
4. ~~**Skill 库的管理权限**——markdown / UI / 混合？~~
   ✅ 已回答 (2026-04-29)：**方案 A 纯 markdown**——skill 内容存 `backend/skills/<category>/<id>.md`，git tracked，启动时加载到内存。详见 §1.6
   ⚠️ 同事的**个人 prompt 库** = `user_skills` 表（数据库存），与公司 skill 并存。详见 §1.8
5. ~~**生图 API 费用**——一张图的真实成本预算多少？要不要 quota？~~
   ✅ 已回答 (2026-04-29)：每用户 10 张/月初始配额，admin 可调，超额可申请。同时引入新概念**提示词知识库**（光影/运镜模板 + awesome-image2.0 类库），详见 §3.2 + §3.4
6. ~~**3D 编排 / LibLib 嵌入**——优先级和路径~~
   ✅ 已回答 (2026-04-29)：双板块结构。"画布 · 自建"用 tldraw / Excalidraw（真嵌入），"画布 · LibLib"用 `shell.openExternal()` 跳浏览器（不真嵌入，避开 X-Frame-Options 限制 + LibLib 改版风险）。3D 摆位作自建板块的进阶模式（Three.js + drei），P5 内部低优先级。详见 §5

---

## 8. 与现有 P0 spec 的关系

- 本文档**不修改** v2 spec（spec 是 P0 真理，被 P0 的 14 个 commit 实现）
- 本文档是 **P1+ 的输入草稿**——每个 P 阶段动手前各自产出独立 spec，那时再把本文档对应章节细化
- P0 必须先跑稳 1-2 周，让 30 个同事真用起来收集反馈，再启动 P1

---

**结尾**：本文档随项目迭代更新。P1 spec 落地时本节相关内容应该被那份 spec 取代或归档。
