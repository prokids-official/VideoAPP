# FableGlitch P1.2 Personal Creation Cockpit Implementation Plan

> 配套 spec：`docs/superpowers/specs/2026-05-02-p12-personal-creation-cockpit.md`
> 实施风格：TDD + 每 task 一次 commit + push，commit message 用 `feat/test/chore(p12-N): <task>`
> 工作分工：前端 = Claude，本地 SQLite + IPC + 后端依赖 = Codex，跨界面（Electron bridge）协作完成

---

## §10 开放问题锁定（用户已批准 "按 Claude 默认意见"）

1. **storyboard 字段简化**。P1.2 只存 `{number, summary, duration_s}` 三字段。type / qi_fu / luo_fu / refs 推 P1.3（接 AI 时一起加）。
2. **本地 png → 公司 R2** 路径已确认走通（P0-D 既有）。复用现有 `assetPushRequest` IPC，**source 字段加新枚举值** `'studio-export'`。
3. **本地项目删除 = 硬删 + 级联**。点删除立刻消失，relation cascade 到 studio_assets / studio_stage_state。**不做软删**（用户期待立即生效）。
4. **studio_projects 表加 `owner_id` 字段**（预留，P1.2 期间值固定为 `auth.uid()`，未来 P2 协作时启用）。
5. **本地容量警告**不做，等用户实际撞到再加。

下面 12 个 task 严格按这五条决策实施。

---

## Task 1：SQLite Schema + Studio Bridge 脚手架

**Owner**：Codex 主导（SQLite + main 进程），Claude 同步 type 定义。

**Files**：
- Modify: `electron/local-db.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/vite-env.d.ts`
- Create: `shared/types.ts`（追加 StudioProject / StudioAsset / StudioStageState 三个类型）

**Steps**：

1. `local-db.mjs` 加 3 张表（spec §8.1 完整 SQL 抄过来）+ 索引
2. `main.mjs` 注册 12 条 IPC handler（spec §8.2 列表）
3. `preload.cjs` 在 `contextBridge.exposeInMainWorld('fableglitch', ...)` 里加 `studio` 命名空间
4. `vite-env.d.ts` 加 `FableglitchStudio` interface
5. `shared/types.ts` 加：
   ```ts
   export interface StudioProject {
     id: string; name: string; size_kind: 'short'|'shorts'|'feature'|'unknown';
     inspiration_text: string|null; current_stage: StudioStage;
     owner_id: string; created_at: number; updated_at: number;
   }
   export type StudioStage = 'inspiration'|'script'|'character'|'scene'|'prop'
                            |'storyboard'|'prompt-img'|'prompt-vid'|'canvas'|'export';
   export interface StudioAsset { ... }     // 按 spec §8.1
   export interface StudioStageState { ... }
   ```

**Tests**：
- 集成 fixture：建项目 → 加 2 个 CHAR 资产 → list 返回 2 条 → delete 项目 → 资产被 cascade 删掉

**Commit**：`feat(p12-1): studio sqlite schema + ipc bridge`

---

## Task 2：HomeRoute + 路由重组

**Owner**：Claude

**Files**：
- Create: `src/routes/HomeRoute.tsx`
- Create: `src/routes/StudioPlaceholderRoute.tsx`（P1.2 完整 StudioRoute 落地前的占位，本 task 用）
- Modify: `src/App.tsx`
- Delete: `src/routes/ShellEmptyRoute.tsx`（被 HomeRoute 替代）

**Steps**：

1. HomeRoute 渲染：
   - 欢迎语：`欢迎回来，{display_name}`
   - "继续我的工作"区：调 `api.recentEpisodes({limit:5})` 显示卡片网格（无 recents 时显示空状态）
   - "创作空间"区：4 张大卡片
     - 📚 公司项目（→ /tree）— "团队协作的产出 · 已入库内容"
     - ✨ 个人创作舱（→ /studio）— "本地创作 · 资产可推送入公司项目"
     - 💡 芝兰点子王（→ /ideas）— "团队 idea 池"（P1.1 完成前显示"P1.1 上线后启用"占位 dialog）
     - 🎨 AI 工具（grayed out）— "P1.3 上线后启用"
2. App.tsx 路由表：
   - `/` 登录后 redirect → `/home`
   - `/home` → HomeRoute
   - `/tree` 保持
   - `/studio` → StudioPlaceholderRoute（Task 3 替换为真实 StudioRoute）
   - `/ideas` → IdeasPlaceholderRoute（P1.1 spec 完成时替换）
   - `/episode/:id/push-review` 保持
3. 删除 ShellEmptyRoute import，移除"空状态"逻辑

**Tests**：
- `HomeRoute.test.tsx`：渲染 4 张卡片 + 点击各个卡片调对应回调
- `App.test.tsx` 调整 routing 断言

**Commit**：`feat(p12-2): home route + studio placeholder + remove shell-empty`

---

## Task 3：StudioRoute 项目列表

**Owner**：Claude

**Files**：
- Replace: `src/routes/StudioPlaceholderRoute.tsx` → `src/routes/StudioRoute.tsx`
- Create: `src/components/studio/ProjectCard.tsx`
- Create: `src/components/studio/NewProjectDialog.tsx`
- Create: `src/lib/studio-api.ts`（renderer 侧 wrapper for studio bridge）

**Steps**：

1. `studio-api.ts` 把 `window.fableglitch.studio.*` 调用包成 typed 函数
2. StudioRoute 顶部：标题 "个人创作舱" + "新建项目" 按钮 + 引言 "本地创作 · 完成后可推送入公司项目"
3. 主体：项目卡网格（每行 3 张，自适应）
4. 空状态：引导卡片 "开始你的第一个创作"
5. ProjectCard 显示：name / 当前 stage 进度环 / 资产数 / 待入库 dot / updated_at
6. NewProjectDialog：Framer Motion modal，含 name / size_kind / 可选 inspiration_text 三字段
7. 删除项目走 `confirm()` + 调 `studio.projectDelete(id)`，UI 立即移除卡片（spec 决策 3 = 硬删）

**Tests**：
- `StudioRoute.test.tsx`：mock studio bridge，渲染列表 / 点击新建 / 点击删除二次确认
- `NewProjectDialog.test.tsx`：表单提交输出正确 payload

**Commit**：`feat(p12-3): studio project list and creation dialog`

---

## Task 4：StudioWorkspace 工作台壳 + StageProgressBar

**Owner**：Claude

**Files**：
- Create: `src/routes/StudioWorkspaceRoute.tsx`
- Create: `src/components/studio/StageProgressBar.tsx`
- Create: `src/components/studio/StudioThreeColumn.tsx`（三栏 layout 组件）
- Modify: `src/App.tsx`（加 `/studio/:projectId/:stage?` 路由）

**Steps**：

1. `StageProgressBar` 渲染 9 个圆点 + label，每个 stage 三态（未触 / active / 已完成 ✓）
   - 已完成的判定：调 `studio.stageGet(projectId, stage)` 有非空 stateJson 即视为已完成（简化）
   - 点击切换 stage（保留当前阶段未保存内容时弹 confirm）
2. `StudioThreeColumn` 接 children：left（280px） / center（flex） / right（280px）。窄屏 `< 960px` 改单栏 + tabs
3. `StudioWorkspaceRoute` 拉项目 + 资产 + stage state，传给三栏。Stage 编辑器各组件挂在 center / left 区
4. 顶部面包屑：`/home > 创作舱 > {project.name}` + 顶部 `<TitleBar subtitle={project.name} />`

**Tests**：
- `StageProgressBar.test.tsx`：9 阶段渲染 + 状态切换 + click 回调
- 工作台路由断言

**Commit**：`feat(p12-4): studio workspace shell + stage progress`

---

## Task 5：inspiration 阶段编辑器

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/InspirationStage.tsx`

**Steps**：

1. left：textarea（最长 4000 字符）+ 题材标签输入 + "从想法墙引用" 按钮（P1.1 落地后激活，目前 disabled）
2. center：渲染当前 inspiration_text 的预览（markdown 风）
3. right：本阶段历史版本（P1.2 暂不做版本历史，留空 placeholder "P1.4 加版本对比"）
4. 底部按钮：[保存草稿] / [→ 下一阶段：剧本]
5. 保存调 `studio.stageSave(projectId, 'inspiration', stateJson)`，下一阶段调 `studio.projectUpdate(id, {current_stage: 'script'})` 然后 navigate

**Commit**：`feat(p12-5): inspiration stage editor`

---

## Task 6：script 阶段编辑器（含 docx 导入）

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/ScriptStage.tsx`

**Steps**：

1. left：参数 — 体量类型（继承项目 size_kind）/ 风格倾向 / 时长目标 / [导入 .docx] 按钮
2. center：markdown 编辑器（textarea + monospace 字体）
3. right：本阶段已生成的 SCRIPT 资产卡列表
4. [导入 .docx] 触发 `fs.openFileDialog([{name: '剧本', extensions: ['docx']}])` → `docxToMarkdown` → 写入 textarea
5. 底部：[保存为本阶段资产] 调 `studio.assetSave({project_id, type_code: 'SCRIPT', name, content_path, ...})`
6. [→ 下一阶段：角色] 切换 stage

**Commit**：`feat(p12-6): script stage editor with docx import`

---

## Task 7：character / scene / prop 三个相似阶段共享一个 StageEditor

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/AssetEntityStage.tsx`（通用化的"实体定义阶段"组件）
- Create: `src/components/studio/stages/CharacterStage.tsx`（继承 AssetEntityStage）
- Create: `src/components/studio/stages/SceneStage.tsx`
- Create: `src/components/studio/stages/PropStage.tsx`

**Steps**：

1. `AssetEntityStage` 接 `type_code` + `fieldSchema`，渲染：
   - left：列表 + "新建" 按钮，每条 entity 是一行
   - center：选中 entity 的属性表单（基于 fieldSchema 动态渲染）
   - right：(空，或资产篮子)
2. CHAR fieldSchema：name / variant / 外貌 / 服装 / 性格 / 配色 / 视觉锚点 / AI 提示词
3. SCENE fieldSchema：name / variant / 氛围 / 材质 / 地标 / 色温 / 视觉锚点 / AI 提示词
4. PROP fieldSchema：name / variant / 描述 / 视觉锚点 / AI 提示词
5. 保存调 `studio.assetSave({project_id, type_code, name, meta_json: form data})`
6. 每个 entity 一条 studio_assets

**注意**：P1.2 不接 AI 自动生成，所有字段用户手填。"AI 提示词"字段是用户手写的最终提示词文本（将来 P1.3 自动拼接时会算法生成）。

**Commit**：`feat(p12-7): character scene prop stage editors via shared base`

---

## Task 8：storyboard 阶段（简化版）

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/StoryboardStage.tsx`

**Steps**：

1. left：[+ 新建分镜单元] 按钮
2. center：分镜单元卡列表（垂直堆叠或 grid 4 列）
   - 每条单元：编号（自动）/ summary（一行 input）/ duration_s（数字 input）
   - **只这三字段**（决策 1 锁定）
3. right：剧本预览（从 SCRIPT 资产取最近一条），方便用户对照拆分
4. 单元保存：每个单元一条 studio_assets，type_code = `STORYBOARD_UNIT`（**新 type_code，本地 only，不入公司库**），meta_json = `{number, summary, duration_s}`

**注意**：STORYBOARD_UNIT 是本地概念，不在公司 asset_types 12 行里。它是 P1.2 创作舱**内部数据**，将来 P1.3 接 AI 自动拆分时这个结构会扩展。入库流程**不**推送 STORYBOARD_UNIT，只推派生出的 PROMPT_IMG / PROMPT_VID / SHOT_IMG / SHOT_VID。

**Commit**：`feat(p12-8): simplified storyboard stage`

---

## Task 9：prompt-img / prompt-vid 阶段（占位）

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/PromptImgStage.tsx`
- Create: `src/components/studio/stages/PromptVidStage.tsx`

**Steps**：

P1.2 这两个阶段做**最小占位版**：

1. center 列出所有 storyboard units
2. 每个 unit 旁边一个 textarea 让用户**手填**对应的图片 / 视频提示词
3. 保存：每个 prompt 一条 studio_assets，type_code = `PROMPT_IMG` / `PROMPT_VID`
4. 没有自动拼接逻辑（P1.3 才接 AI 自动生成）

**Commit**：`feat(p12-9): manual prompt-img and prompt-vid stages`

---

## Task 10：canvas 阶段（只读预览）

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/CanvasStage.tsx`

**Steps**：

1. 把当前项目所有资产按 type_code 分组陈列
2. 每组一个 section，section 内 grid 列出资产卡（含缩略图 / 名称 / size）
3. 没有编辑功能（决策 4 锁定，P1.5 才加 tldraw）
4. 顶部加一个"准备入库 →"主按钮，跳到 export 阶段

**Commit**：`feat(p12-10): canvas read-only preview stage`

---

## Task 11：export 阶段（入库 review）

**Owner**：Claude

**Files**：
- Create: `src/components/studio/stages/ExportStage.tsx`
- Create: `src/components/studio/PushTargetSelector.tsx`

**Steps**：

1. PushTargetSelector：四级下拉 series / album / content / episode（调既有 `api.tree()`），底部"+ 新建剧集"打开既有 EpisodeWizard
2. 选中 target 后渲染本地资产分组：每条带 checkbox
3. 调 `api.previewFilename` 拿每条资产的 final_filename + storage_ref，inline 展示
4. commit message 默认 `feat({episode_name}): 来自创作舱「{project_name}」推送`，可改
5. [推送 N 项] 触发：
   - 把每个本地 studio_asset 的 content_path 用 `fs.readFile` 读成 ArrayBuffer
   - 拼成 push payload，**source 字段填 `'studio-export'`**（决策 2 新枚举值）
   - 调既有 `net.assetPush()`
   - 成功后回调把每条 studio_asset 标记 `pushed_to_episode_id` + `pushed_at`（**不删本地**）

**注**：Codex 需要在后端 push route 接受 `source: 'studio-export'`。这是个小改动，跟 Task 1 的 schema 是同一批 Codex 工作。

**Commit**：`feat(p12-11): export stage pushes studio assets to company project`

---

## Task 12：远程冒烟全闭环

**Files**：仅修 bug

**Steps**：

1. `npm run dev` 起 Electron
2. 流程：
   - admin 登录 → 落地 /home
   - 点击"个人创作舱" → /studio
   - 新建项目 "冒烟测试" → 进入工作台
   - inspiration → 输入梗概 → 保存 → 下一阶段
   - script → 粘贴一段剧本 → 保存为资产 → 下一阶段
   - character → 新建 1 个角色"测试角色" → 填字段 → 保存
   - scene → 新建 1 个场景 → 填字段 → 保存
   - 跳到 export → 选公司测试剧集 → 勾上全部 → 推送
   - 推送成功 → 去 /tree 看到资产 → /api/assets 看到这些资产
3. 期间记录 bug 在小笔记，每修一个单独 commit

**完成后打 tag**：`p12-complete`

**Commit**：`test(p12-12): remote smoke + bug fixes`

---

## 排期

| Task | 工时 | Owner |
|---|---|---|
| 1. SQLite + IPC | 1 天 | Codex 主导 |
| 2. HomeRoute + 路由 | 0.5 天 | Claude |
| 3. 项目列表 | 1 天 | Claude |
| 4. 工作台壳 + 进度条 | 1.5 天 | Claude |
| 5. inspiration | 0.5 天 | Claude |
| 6. script | 1 天 | Claude |
| 7. character/scene/prop | 2 天 | Claude |
| 8. storyboard | 1 天 | Claude |
| 9. prompt-img/vid | 1 天 | Claude |
| 10. canvas 只读 | 0.5 天 | Claude |
| 11. export 入库 | 1.5 天 | Claude |
| 12. 冒烟 | 0.5 天 | 共同 |
| **总计** | **~12 天** | |

可并行的：

- P1.1 芝兰点子王后端（Codex）跟 P1.2 Task 2-7 并行
- P1.0 路由清理（已在 Task 2）+ P1.2 工作台前端（Task 3-11）跟 Codex 的 image copy / 入库 source 字段补丁并行

---

## 验收（P1.2 全完成判定）

- [ ] 登录 → /home 直达，4 个工作区入口都可点
- [ ] 个人创作舱可新建本地项目，刷新后还在
- [ ] 工作台 9 阶段流程条可切换，每阶段都能保存
- [ ] inspiration / script / character / scene / prop / storyboard / prompt-img / prompt-vid / canvas 9 个阶段 UI 都能用（手输模式）
- [ ] export 阶段能选目标公司剧集，预览最终文件名，一键推送，远端 /api/assets 能看到推送结果
- [ ] 推送后本地资产保留 + 标 `pushed_to_episode_id`
- [ ] 删除本地项目 = 立刻消失 + 资产 cascade 删
- [ ] 后端 push route 接受 `source: 'studio-export'`
- [ ] dark + light 主题在所有 P1.2 新页面都好看

---

## 不在本 plan 范围

- AI 集成（任何阶段的"自动生成"按钮）→ P1.3
- 模板系统 / idea-to-project 转换 → P1.4
- canvas 编辑器 → P1.5
- 三栏宽度可调 → P1.4
- 多人协作 → P2

---

## 给 Codex 的接口约定（避免冲突）

**他这一阶段的工作 = Task 1 + 在 P0-D push route 加 'studio-export' 枚举值**。其它都是前端我做。

具体 IPC 命名约定（在 §8.2 已经定，重申）：

```
window.fableglitch.studio = {
  projectCreate, projectList, projectGet, projectUpdate, projectDelete,
  assetSave, assetList, assetDelete, assetWriteFile, assetReadFile,
  stageSave, stageGet,
}
```

参数 / 返回值类型在 `shared/types.ts` 中（Task 1 同步定义）。

---

**plan 写完。下次会话进 Task 1（Codex）+ Task 2（Claude）并行启动**。
