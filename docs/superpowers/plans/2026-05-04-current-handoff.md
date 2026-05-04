# 2026-05-04 Codex Handoff

> 接手对象：新 Codex 账号。仓库：`E:\VideoAPP`，分支：`main`，远程：`prokids-official/VideoAPP`。当前协作方式是直推 `main`。

## 当前产品总定位

VideoAPP 已从“公司素材库前端”升级为 **AI 漫剧生产驾驶舱**。它要同时覆盖三件事：

1. **公司项目库**：浏览公司项目、查看/下载/复制资产、把本地成果标准化入库。
2. **个人创作舱**：本地 SQLite 持久化，从灵感到剧本、角色、场景、道具、分镜、图片提示词、视频提示词、画布预览、入库。
3. **AI/Agent/Skills 工作流**：后续用内置 skills 和 agent 帮用户优化剧本、拆分镜、生成提示词，再接生图/生视频能力。

用户强调：这不是通用聊天工具，也不是单纯素材库，而是一个“导演驾驶舱”。画布很重要，但完整画布不是当前唯一主线。

## P0-P5 路线校正

参考 `docs/superpowers/vision/2026-04-29-expanded-product-vision.md`：

- P0：基础资产同步管理，已完成。
- P0.5：邮箱白名单、推送撤回、自动更新/NAS 冷备，核心项已完成。
- P1：AI 剧本 Agent / skills。
- P2：剧本变分镜 + 提示词。
- P3：提示词变图 + 视频。
- P4：配音、音乐、音效、最终交付。
- P5：画布 / 3D 编排。

2026-05-04 用户明确修正：**LibLib 画布必须真嵌入 App**，不能只跳浏览器。已在 vision 文档中修正为：Electron `BrowserView` 真嵌入为主，`shell.openExternal()` 只做兜底。

## 最近已经完成

最近关键 commits：

- `994ec88 feat(studio): locate export preflight gaps`
- `dd25b97 fix(electron): default packaged API to production`
- `b0c38a5 feat(studio): update export preflight from selection`
- `796fd71 feat(studio): add export preflight review`
- `90e0c3f feat(studio): show canvas storyboard timeline`
- `8e88542 feat(studio): preview and delete generated outputs`
- `a8f9286 feat(studio): attach generated outputs to prompts`
- `950222b feat(assets): persist prompt generation relations`
- `2d44ea7 feat(p12): show studio asset prompt links`
- `a09f859 feat(p12-11): export stage pushes studio assets`
- `944e956 feat(p12-10): canvas read-only preview stage`
- `4ec42a7 feat(p12-9): manual prompt-img and prompt-vid stages`

已落地能力：

- 登录后默认进入主页。
- 公司项目库已有返回主页/返回上级入口。
- 芝兰点子王补过 light/dark 模式问题。
- 公司资产预览支持复制/下载；图片预览支持右键复制图片。
- Electron packaged 登录 bug 已修：无 `.env` 的打包 App 默认连生产 API。
- 个人创作舱已具备项目列表、工作台、阶段流程、本地 SQLite/IPC、阶段资产保存。
- Prompt 与生成图/视频之间已有本地关联。
- Canvas 阶段目前是只读时间线/链路预览，不是编辑画布。
- Export 阶段可把本地 studio assets 推到公司项目库，source 为 `studio-export`。
- Export preflight 会检查全局资产与每个 SHOT 的 prompt/image/video 缺口。
- Export preflight 缺口现在可点击定位：Missing video prompt → `prompt-vid`，Missing image prompt → `prompt-img`，SHOT → `storyboard`。

最近完整验证：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm test` 通过，28 files / 83 tests。

## 用户刚刚补充的创作方法论

用户给了一段 AI 影视工作流视频字幕和传统画布截图。产品应吸收这些原则：

- 剧本是核心，不鼓励无脑“一句话生成爆款”。AI 更适合作为导演助理、分析员、格式规范器。
- 标准流程应是：剧本 → 导演分镜脚本 → 角色/服化道/道具/声音/场景资产 → 首帧/分镜图 → 视频提示词 → 视频生成 → 下载剪辑 → 入库/交付。
- 分镜脚本文字非常重要，会被多次复用到生图、生视频。
- 分镜图有两种用法：
  - 导演分镜表：用于检查镜头合理性，不一定参与最终生产。
  - 强控制分镜图：作为视频生成参考，控制构图与连续性。
- 视频生成要检查参考图/提示词/音色是否接对。接错会造成空间关系错误和浪费积分。
- 外部画布能直观看到引用关系，但大工程会变乱。我们的自建方向应是“会检查连线关系的导演驾驶舱”，而不是单纯复刻无限白板。

## 下一步建议

不要马上跳完整 P5 自建画布。推荐顺序：

1. **先收尾 P1.2**：继续补个人创作舱手动流程的 UX 缺口，尤其是从预检点击缺口后，进入对应阶段时高亮对应 SHOT/资产。
2. **补一份 LibLib 真嵌入 spec/plan**：因为用户明确要真嵌入，而且这涉及 Electron `BrowserView`、窗口尺寸同步、cookie partition、安全边界、URL 白名单、退出/隐藏 BrowserView 等，不应边写边猜。
3. **进入 P1.3 AI/Agent/Skills 基础**：建 skills markdown 目录、skill loader、provider/quota 设计，先让“剧本/分镜/提示词助手”成为产品核心。
4. **再做 LibLib BrowserView MVP**：作为 Canvas 阶段里的“外部生产画布”页签，支持保存 share URL、打开嵌入画布、返回本地链路预览。先不做自动抓取 LibLib 资产。
5. **后续 P1.5/P5 自建画布**：做真正的节点/连线/资产自动落库，并把提示词、图片、视频关系可视化和可检查。

## 立刻可做的小任务

推荐下一任先做其中一个：

### A. 高亮定位缺口

目标：用户在 Export preflight 点 `Missing video prompt` 后，不只是跳到 `prompt-vid`，还要在目标阶段高亮对应 SHOT。

涉及文件：

- `src/components/studio/stages/ExportStage.tsx`
- `src/routes/StudioWorkspaceRoute.tsx`
- `src/components/studio/stages/PromptImgStage.tsx`
- `src/components/studio/stages/PromptVidStage.tsx`
- 对应 tests

思路：

- 在 workspace 保存 `locateTarget` state。
- 传给 prompt/img/vid/storyboard stages。
- Stage 内根据 `storyboardAssetId` 或 `storyboardNumber` 高亮对应卡片 2-3 秒。

### B. LibLib 真嵌入 spec/plan

目标：先写清楚 BrowserView 真嵌入方案，不急着实现。

应覆盖：

- Electron 主进程 BrowserView 生命周期。
- preload/IPC：`canvas:openExternalView`、`canvas:closeExternalView`、`canvas:setBounds`、`canvas:loadUrl`。
- React 侧 CanvasStage 容器如何上报 bounds。
- URL 白名单：只允许 `https://www.liblib.tv/canvas/...` 和必要登录域。
- Cookie partition：`persist:liblib`。
- fallback：在浏览器打开。
- 安全提示：第三方服务、账号、隐私、资产手动导出。

### C. P1.3 Skills 基础

目标：开始让 App 具备真正 AI 工具内核。

应先读：

- `docs/superpowers/vision/2026-04-29-expanded-product-vision.md` §1
- `docs/superpowers/specs/2026-05-02-p12-personal-creation-cockpit.md`

建议先做 markdown skills，不做复杂 admin UI。

## 注意事项

- 产品取舍不清楚时问用户，不要自由发挥。
- 用户非常重视 Apple 式极简、高端、大按钮、清晰流程。
- 用户希望 Claude 做前端时只在授权范围内改；Codex 现在是总控。
- 不要把 LibLib 简化成“跳浏览器”，用户明确否定。
- 当前路线里多人协作是 P2，但用户很喜欢这个方向，可以预留概念，不要现在大做。
- 当前个人创作舱内容是本地 SQLite，不写 Supabase/R2/GitHub；只有 Export 入库时才推公司资产库。
