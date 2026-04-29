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

- **默认走公司模型**：`OPENAI_API_KEY` 在 Vercel env，公司付费
- **用户也能切自己的 key**：UI 上一个"用我自己的 key"toggle，然后填入；存在本地 SQLite，永远不上服务器
- **登录方式接入**：
  - Codex OAuth（让 Agent 用用户的 Codex 账号配额）
  - DeepSeek v4 Pro 直接 API key
  - Claude / GPT API key
  - 第三方代理（豆包、智谱）
- **配置入口**：App 设置页有一个"Provider Profiles"区域（现有 spec 已经有这张表预留 §4.5 之外的扩展位）

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

- Agent 产出剧本 → 同一个或第二个 Agent 跑评分提示词 → 输出 0-100 分 + 改进建议
- ≥ 80：直接落到 draft，可一键推送
- < 80：UI 显示评分 + 建议，按钮：[让 AI 重写] / [手动通过] / [我来改]
- 评分维度（草案）：节奏 / 台词新鲜度 / 反差感 / 现代化梗密度 / 视听细节 / 整体可读性

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

| 服务 | 用途 | 公司 key 还是 BYOK |
|---|---|---|
| nanobanana pro | 文生图 / 图生图 / 720° | 公司 key 默认 |
| gpt-image-2 | 文生图 / 720° | 公司 key 默认 |
| Runway / Kling | 生视频 | BYOK 优先（费用高） |

3.3 跳转兜底
对每种 API 类型，都放一个**"在 nanobanana 官网打开"** 类的小按钮，把当前提示词 query string 带过去——用户用自己账号生成完，手动下载 → 拖回 App 走"图片导入"路径。这样即使我们 API 集成出 bug、账号冻结，用户也能干活。

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

## 5. P5 · 画布 / 3D 编排（探索性）

### 5.1 选项 A：嵌入 LibLib 画布
最快路径——LibLib 有完整成熟画布，把网页用 webview / iframe 嵌进 Electron App。
- ✅ 零开发成本
- ❌ 用户必须各自有 LibLib 账号
- ❌ 资产无法和我们 R2 / GitHub 自动同步（除非 LibLib 有 export API）

### 5.2 选项 B：自建画布（参考开源）

乐美林指了两个 repo 作参考：
- **xhongc/ai_story** — Python/Vue，AI 故事生成 + 简单画布
- **henjicc/Storyboard-Copilot** — JS，分镜板设计

第三个想法（更野心）：**3D 场景 + 小人摆位**
- 简化版 Unreal/Unity 的 web 版（Three.js + drei）
- 拖拽 3D 模特 + 调整姿势 + 调相机角度 → 截图作为分镜图参考给 AI
- 适合开发能力有富余时尝试，不应阻塞 P0-P3

### 5.3 决策（建议）
- P5 之前先把 P0-P4 跑稳一年
- P5 真做时先选 A（LibLib 嵌入）验证用户用不用得起来
- 用得起来再考虑自建

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

1. **评分 ≥80 才放行**——评分模型/提示词由谁产出？同时手动 override 的开关默认开还是关？
2. **公司默认模型预算**——一个用户一天能花公司多少钱（成本上限）？超过限额怎么处理（弹窗提醒 / 自动切 BYOK）？
3. **Codex OAuth 登录**——这是给用户登录 App 的方式（替代邮箱密码），还是给 Agent 调用 Codex 模型用的 token？语义不同，做法不同
4. **Skill 库的管理权限**——admin 可加 skill 时，是手写 markdown，还是 UI 表单填？多语言（中英文双版本）？
5. **生图 API 费用**——nanobanana pro / gpt-image-2 一张图的真实成本预算多少？要不要 quota？
6. **3D 编排（P5 选项 C）**——这个想法的优先级在 P5 内部如何排？还是 P5 直接走 LibLib 嵌入？

---

## 8. 与现有 P0 spec 的关系

- 本文档**不修改** v2 spec（spec 是 P0 真理，被 P0 的 14 个 commit 实现）
- 本文档是 **P1+ 的输入草稿**——每个 P 阶段动手前各自产出独立 spec，那时再把本文档对应章节细化
- P0 必须先跑稳 1-2 周，让 30 个同事真用起来收集反馈，再启动 P1

---

**结尾**：本文档随项目迭代更新。P1 spec 落地时本节相关内容应该被那份 spec 取代或归档。
