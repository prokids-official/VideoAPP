# 回公司电脑接手包

> 适用场景：2026-05-06 回公司电脑，用一个没有当前对话记忆的新 Codex / Claude 继续 VideoAPP Studio 开发。
> 仓库：`https://github.com/prokids-official/VideoAPP`
> 分支：`main` 直推
> 当前主线：P1.2 个人创作舱收尾 + P1.3 AI / Agent / Skills。外部 LibLib / RunningHub 画布已真嵌入；自建画布不急着复制无限画布，后续 P5 更像“导演生产台 / Shot Ledger / Asset Graph”。

---

## 1. 回公司电脑先做什么

在公司电脑打开 PowerShell：

```powershell
cd E:\VideoAPP
git status
git pull origin main
git log --oneline -12
npm install
npx electron-rebuild -f -w better-sqlite3
npm run lint
npm run build
npm test
```

如果公司电脑路径不是 `E:\VideoAPP`，换成实际 repo 路径即可。

本次回公司重点看最新提交是否已经到：

```text
7e72e69 fix(dev): avoid occupied vite port
642c445 docs: refresh office handoff setup
1ebde0e feat(canvas): embed external canvas browserview
f679422 docs(canvas): plan liblib browserview embed
b68cc54 feat(studio): highlight located preflight gaps
994ec88 feat(studio): locate export preflight gaps
```

`git status` 应该 clean。若不 clean，先让 Codex 读 diff，确认不是本机旧改动，不要直接 reset。

---

## 2. 环境和账号

前端 `.env` 推荐继续打线上 API：

```env
VITE_API_BASE_URL=https://video-app-kappa-murex.vercel.app/api
```

后端需要 Supabase / R2 / GitHub / Upstash env 时，用公司电脑已有的 `backend\.env.local`。如果丢了，从控制台重新取，不要写进 git。

Supabase CLI 已经 link 过项目：

```powershell
cd E:\VideoAPP\backend
npx supabase migration list --linked -p "FableGlitch-Prod"
```

如果提示密码，就填生产 DB password。之前遇到的迁移状态不一致已经通过 repair / push 处理过；不要随便重跑修复命令，除非新的 Codex 先读迁移列表和远程状态。

---

## 3. 当前已经完成的事情

P0-D / P0.5-A / P0.5-B 已完成并验收。

P1.0 已完成：
- 后端 `GET /api/episodes/recent`
- 登录后默认进主页
- 公司项目浏览
- 个人沙盒本地 SQLite 持久化
- 资产预览复制 / 下载

P1.1 / P1.2 已经推进到：
- Ideas board 后端和前端占位已做过一轮
- 个人创作舱 9 阶段工作台已落地
- 本地 SQLite studio 表 + IPC bridge 已落地
- 灵感、剧本、角色、场景、道具、分镜、图片 prompt、视频 prompt、画布、入库预检等阶段已具备可跑的基础流程
- prompt 生成物链路已落地：
  - `PROMPT_IMG` / `PROMPT_VID` 保存 `storyboard_asset_id`、`storyboard_number`、`prompt_text`
  - `SHOT_IMG` / `SHOT_VID` 保存 `source_prompt_asset_id`、`storyboard_asset_id`、`storyboard_number`
  - Canvas 阶段按 `SHOT 01` 串起 `Prompt -> Output`
  - Export 预检能定位缺失项，并跳回对应阶段高亮
- 外部生产画布已真嵌入：
  - Electron `BrowserView` 承载外部画布
  - 默认允许 LibLib / LibLib Art / RunningHub 域名
  - 可通过 `FG_CANVAS_ALLOWED_HOSTS` 追加新平台域名
  - Canvas 阶段新增 `链路预览 / LibLib 画布` 页签
- 画布产品方向已修正：
  - 外部 LibLib / RunningHub 是当前主要生产力，继续真嵌入
  - 自建部分不复制“无限画布大线团”
  - 后续 P5 只做更适合大工程的“导演生产台”：按 SHOT 管理剧本、prompt、图片、视频、评分和返工链路
- P4.5 成片评审 / 打分系统已记录进 vision：
  - App 内浏览最终视频
  - 人工或 Agent 按评分文档打分
  - 低分项能挂到时间码、资产、SHOT，并回流成返工任务

最新验证：

```text
npm run lint     PASS
npm run build    PASS
npm test         PASS, 29 files / 92 tests
npm run build    PASS after 7e72e69
```

---

## 4. 怎么测试 prompt 和生成物是否对应

在 App 里走个人创作舱：

1. 新建一个创作舱项目。
2. 进入 `分镜` 阶段，保存至少一个分镜，例如 `SHOT 01`。
3. 进入 `图片提示词` 阶段，选择 `SHOT 01`，保存一条图片 prompt。
4. 在同一阶段给这条 prompt 附加一个生成结果，也就是上传/保存一张 `分镜图`。
5. 进入 `视频提示词` 阶段，选择同一个 `SHOT 01`，保存一条视频 prompt。
6. 给视频 prompt 附加一个生成结果，也就是上传/保存一个 `分镜视频`。
7. 进入 `画布` 阶段，看 `链路预览`：
   - `SHOT 01`
   - `图片链路` 应该显示 `图片提示词 -> 分镜图`
   - `视频链路` 应该显示 `视频提示词 -> 分镜视频`
8. 进入 `入库` 阶段：
   - 如果漏了图片 prompt / 视频 prompt / 分镜图 / 分镜视频，会出现 Missing 项
   - 点 Missing 项会跳回对应阶段并高亮对应 SHOT

代码层对应字段在：

```text
src/routes/StudioWorkspaceRoute.tsx
src/lib/studio-asset-links.ts
src/components/studio/stages/CanvasStage.tsx
src/components/studio/stages/ExportStage.tsx
```

注意：这套链路目前主要在“个人创作舱”里可见；“公司项目浏览”的资产详情还没有做成强关联谱系视图。

---

## 5. 已发现但还没做的产品缺口

### 5.1 公司项目浏览需要资产谱系视图

现在公司项目里点角色 / 分镜图 / 分镜视频，主要看到的是文件预览。下一步应该增强成：

- 点 `PROMPT_IMG`：能看到它生成了哪些 `SHOT_IMG`
- 点 `SHOT_IMG`：能看到它来自哪个 `PROMPT_IMG`
- 点 `PROMPT_VID`：能看到它生成了哪些 `SHOT_VID`
- 点 `SHOT_VID`：能看到它来自哪个 `PROMPT_VID`
- 点角色三视图 / 角色图片：能看到对应的人设 prompt、生成 prompt、参考图来源

### 5.2 角色三视图 prompt 需要建模

现在 `CHAR` 更像一个角色资产结果，角色 prompt 没有像分镜 prompt 那样独立成一条可见链路。建议下一步先做轻量方案：

- 不急着新增公司 `asset_types`
- 先在本地 `CHAR.meta_json` 里标准化：
  - `profile_prompt`
  - `turnaround_prompt`
  - `source_reference_asset_ids`
  - `generated_asset_ids`
- 角色阶段 UI 显示“角色设定 prompt / 三视图 prompt / 结果图”
- 后续入库到公司库时，先把 prompt 写入角色资产 metadata 或 sidecar markdown，再决定是否新增 `CHAR_PROMPT` 类型

这个点需要乐美林拍板：公司资产库是否要新增独立 `CHAR_PROMPT` / `SCENE_PROMPT` / `PROP_PROMPT` 类型，还是继续把它们作为对应资产的 metadata。

### 5.3 成片评分系统需要单独落地

用户希望可以在 App 里浏览最终成片视频，并按已有评分文档打分。这个功能已记录为 vision 里的 `P4.5`，后续启动时必须先读取评分细则文档。

建议能力：
- 成片播放器：支持本地最终视频 / 公司库最终视频预览
- 评分面板：总分 + 多维度明细 + 文字点评
- 时间码批注：某个问题可以绑定到视频时间段
- 关联资产：问题可以指向 SHOT、分镜图、视频 prompt、角色、场景等资产
- 返工任务：低分项一键跳回个人创作舱对应阶段和 SHOT

### 5.4 自建画布方向不是复制 LibLib

当前结论：仍然需要自建能力，但不应该优先做一个完整无限画布平台。

更好的形态是三视图共存：
- `Stage Flow`：新手按 9 阶段往下走
- `Shot Ledger`：专业用户按 SHOT 查看剧本、prompt、图、视频、状态、评分
- `Asset Graph`：只在需要追溯时打开某个资产的上游 / 下游，不展示全项目所有连线

外部画布继续负责生产；FableGlitch 负责规划、检查、归档、资产谱系、评分、返工、入库。

---

## 6. 下一步建议顺序

### Next 1：外部画布资产回流

目标：LibLib / RunningHub 里生成的图片、视频、prompt 下载回来后，可以很顺手地挂回个人创作舱的对应 SHOT。

建议任务：
- 在 Canvas 阶段加“导入外部画布产物”
- 选择目标 SHOT、资产类型、来源 prompt
- 保存为 `SHOT_IMG` / `SHOT_VID`，并写入 `source_prompt_asset_id`
- 回到链路预览能立刻看到对应关系

### Next 2：公司项目资产谱系预览

目标：公司项目浏览里，用户点任意 prompt / 图 / 视频 / 角色资产，都能看到上下游。

建议任务：
- 后端资产 API 返回 metadata / related asset ids
- 前端预览 modal 增加“关联资产”区域
- 支持从 prompt 跳到生成物，从生成物跳回 prompt
- 角色资产先用 metadata 轻量展示 prompt

### Next 3：角色 prompt 建模

目标：角色三视图不只是图片，还能保留生成它的 prompt 和参考关系。

建议任务：
- 先写 spec amendment
- 再决定是否新增公司 asset type
- 本地创作舱先落 metadata 方案

### Next 4：成片评分系统 spec

目标：把用户已有的评分文档变成 App 内的成片评审流程。

建议任务：
- 先让用户提供评分文档
- 写 P4.5 spec：评分 schema、数据库表、UI 流程、Agent 评分输入输出
- 确定评分是否先本地保存，还是直接入公司库
- 评分问题要能跳回 SHOT / prompt / 图片 / 视频

### Next 5：P1.3 AI / Agent / Skills

目标：把用户的内置 agent / skills 做成创作舱里的生产力，而不是单纯手填表单。

建议任务：
- Skills registry：剧本规范、分镜规范、角色设定、图片 prompt、视频 prompt
- Agent chat panel：能读当前项目上下文，生成/改写阶段内容
- 生成结果必须回写本地资产，并保留来源 prompt / skill / model metadata

---

## 7. 给新 Codex 的开场白

在公司电脑新开 Codex，会话目录设为 `E:\VideoAPP`，贴：

```text
你接手 prokids-official/VideoAPP，分支 main，直推。请先读：

1. HOME-SETUP.md
2. HANDOFF-TO-CODEX-NEXT.md
3. docs/superpowers/vision/2026-04-29-expanded-product-vision.md
4. docs/superpowers/specs/2026-05-02-p10-homepage-sandbox.md
5. docs/superpowers/specs/2026-05-02-p10a-local-sandbox-drafts.md
6. docs/superpowers/specs/2026-05-02-p11-ideas-board.md
7. docs/superpowers/specs/2026-05-02-p12-personal-creation-cockpit.md
8. docs/superpowers/plans/2026-05-02-p12-personal-creation-cockpit-plan.md

然后跑：
- git status
- git log --oneline -12
- npm run lint
- npm run build
- npm test

当前最新关键 commit 应该是：
- 7e72e69 fix(dev): avoid occupied vite port
- 642c445 docs: refresh office handoff setup
- 1ebde0e feat(canvas): embed external canvas browserview
- f679422 docs(canvas): plan liblib browserview embed
- b68cc54 feat(studio): highlight located preflight gaps
- 994ec88 feat(studio): locate export preflight gaps

当前产品方向：
- 这个 App 是公司素材库 + AI 聊天工具 + AI 漫剧生产驾驶舱
- 主线不是先做 P5 自建画布，而是 P1.2 创作舱收尾 + P1.3 AI/Agent/Skills
- 外部 LibLib / RunningHub 画布是目前主要生产力，已经通过 BrowserView 真嵌入
- 自建画布方向已调整：不要复制无限画布；后续做 Shot Ledger + Asset Graph + 导演生产台
- 下一步优先做外部画布资产回流，以及公司项目资产谱系预览
- 成片评分 / 打分系统已记录为 P4.5，启动前要先读用户已有评分文档

已知问题：
- 公司项目浏览里，prompt / 生成图 / 生成视频 / 角色三视图之间的上下游关系还不够可见
- 角色三视图 prompt 还没像分镜 prompt 一样建成清晰链路，需要先做轻量 metadata 方案或写 spec amendment
- 最终成片视频还没有 App 内评分、时间码批注、返工任务链路

请先只汇报你读到的当前状态和下一步计划，不要直接大改。如果要动代码，继续 TDD，小步 commit + push。
```

---

## 8. 给 Claude 的边界

Claude 可以继续做前端，但边界保持：

- 可以动：`src/routes/Studio*.tsx`、`src/components/studio/*`、`src/lib/studio-api.ts`、相关测试
- 不要动：Electron IPC / SQLite schema / backend migration / push route，除非 Codex 明确让它配合
- 如果需要新增 IPC 或新增 asset type，先停下问 Codex/乐美林

给 Claude 的任务可以这样说：

```text
你继续只做前端体验，不改 Electron / backend / shared schema。
下一步请设计“资产谱系预览”的前端体验：
- prompt 能看到生成图/视频
- 生成图/视频能回看 prompt
- 角色图能看到角色设定 prompt / 三视图 prompt
- 公司项目浏览和个人创作舱都要风格一致

先出 UI plan 和文件范围，不要直接改代码。
```

---

## 9. 最后提醒

- 不要把密钥写进 git。
- 不要随便改 Supabase 生产迁移状态。
- 公司资产库的数据结构不清楚时先问乐美林。
- 自建画布是 P5，当前只做外部画布嵌入和资产回流；P5 启动时做“导演生产台”，不要复制一个无限画布。
- 每次开始工作先 `git status`，每个小闭环结束跑 `npm run lint && npm run build && npm test`。
