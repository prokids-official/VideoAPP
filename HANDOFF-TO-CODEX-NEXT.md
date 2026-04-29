# 给 Codex 的下一阶段简报（P0-C 收尾 + P0-D 全部）

> 日期：2026-04-29
> 上下文：你已经完成 P0-C Tasks 1-11（commit `00737a2`）。Claude 把 P0-D 的范围 + 设计取舍打包给你，你接下来连续做完 P0-C Task 12 + 整个 P0-D。
> Claude 资源即将耗尽，乐美林会全权监督你完成这阶段。

---

## A. 立即做：P0-C Task 12（Vercel 远程冒烟）

按 `docs/superpowers/plans/2026-04-27-p0c-frontend-shell.md` 第 12 节走：

1. 确认 `D:\VideoAPP\.env` 指向 `https://video-app-kappa-murex.vercel.app/api`
2. 运行 `npm run dev` 启 Electron
3. 用一个真实 `@beva.com` 邮箱测试完整闭环：注册 → 收邮件 → 点验证链接 → 登录 → 看到项目树（可能为空，正常）→ 点剧集（如果有）→ dashboard 渲染 → 退出登录 → 关闭重开 → 自动登录恢复
4. 出 bug 修 bug，每修一个 commit 一个
5. 全部通过后打 tag：
   ```bash
   git tag p0c-complete
   git push origin --tags
   ```

完成 P0-C Task 12 后**停下报告**，再继续 P0-D。

---

## B. 接着做：P0-D 全部（约 12-15 个 task）

**目标**：让用户完成"新建剧集 → 导入资产 → 一键推送 → 看到入库结果"的完整闭环。

### B.1 你需要先做的事：写 P0-D plan

Claude 没来得及写 P0-D 详细 plan。你按 P0-C plan 同样的 TDD 风格自己写一份 `docs/superpowers/plans/2026-04-29-p0d-asset-flow.md`，覆盖以下 task。先让乐美林审一遍 plan，再开工。

### B.2 P0-D Task 清单（建议顺序）

#### Task 1：mammoth.js docx 转换 lib
- 装 `mammoth` 依赖
- 写 `src/lib/docx.ts`：`docxToMarkdown(file: File | ArrayBuffer): Promise<string>`
- `*.test.ts` 用一个真实 .docx fixture 验证转换正确
- xlsx → md 也写：`src/lib/xlsx.ts` 用 `exceljs` 或 `xlsx` 库，把表转 markdown 表格

#### Task 2：本地草稿 SQLite 表 + IPC
- 已有 `electron/local-db.mjs` 的 `local_drafts` 表
- 加 IPC 通道：
  - `db:drafts:create(draft)` 写一行
  - `db:drafts:list(episode_id)` 列出某剧集的所有草稿
  - `db:drafts:delete(id)` 删一行（push 成功后调）
- 加 `electron/file-system.mjs` 处理本地文件保存：
  - `fs:saveDraftFile(localDraftId, content | Buffer)` → `%APPDATA%/FableGlitch/drafts/<localDraftId>.<ext>`
  - `fs:readDraftFile(path)` → 二进制流读
  - `fs:openFileDialog(filters)` → 包装 Electron `dialog.showOpenDialog`

#### Task 3：新建剧集 4 步 wizard（mockup `episode-wizard.html`）
- 路由：从 `ShellEmptyRoute` / `TreeRoute` 顶导按钮触发模态 wizard
- 4 步：选系列 → 选专辑 → 填内容名 → 填剧集名 + 路径预览
- 调 `POST /api/episodes` → 后端创建 GitHub 骨架 + R2 占位 + Supabase 行
- 完成后跳转到新建的剧集 dashboard

#### Task 4：通用 AssetPanel 组件（数据驱动）
- `src/components/panels/AssetPanel.tsx`
- 入参：`{ asset_type: AssetType, episode_id: string }`
- 渲染：
  - 顶部板块标题 + 资产数量
  - 主操作区：导入按钮（filters 来自 asset_type.file_exts）+ 粘贴按钮（仅 supports_paste 为 true）
  - 草稿列表（从 local_drafts 拉）
  - 已入库列表（从 GET /api/assets 拉）
- 不为每种 type 写不同组件——一个通用 panel + 数据驱动
- 路由：`/episode/:id/panel/:typeCode` → 渲染对应 type 的 AssetPanel

#### Task 5：导入预览对话框
- 用户选文件 → 先弹"预览"模态：
  - 调 `POST /api/assets/preview-filename` 拿最终文件名 + storage_ref
  - 显示在紫色 mono 框里，name 字段可点击编辑
  - 字数 / 大小 / 来源标注
  - 内容预览（md 渲染 / image 缩略 / video 元数据）
  - [保存为草稿] / [取消]

#### Task 6：粘贴文本流（仅 SCRIPT / PROMPT_IMG / PROMPT_VID）
- AssetPanel 上"粘贴文本"按钮 → 弹 textarea 模态
- 用户粘贴/输入 → 同导入预览流程，转 .md 草稿

#### Task 7：MdPreview / ImagePreview / VideoPreview 组件
- `src/components/panels/preview/MdPreview.tsx` 用 `marked` 或 `react-markdown` 渲染 .md
- `ImagePreview` 直接 img 标签
- `VideoPreview` HTML5 video 标签
- 已入库资产点击 → 调 `GET /api/assets/:id/content`：
  - github 返回 markdown 文本 → 内联渲染
  - r2 返回 302 → 跳到 presigned URL → 客户端 fetch 缓存到 view_cache 表

#### Task 8：入库评审页（mockup `push-review.html`）
- 路由：从剧集 dashboard 顶部 / FAB ⚡ 触发
- 列出当前剧集所有本地草稿，按板块分组
- 复选框、commit message 输入框（默认值自动拼接）
- 底部悬浮栏：[已选 N 项 · X.X MB] + 主按钮 "⚡ 推送"

#### Task 9：Push 调用 + 幂等
- 客户端生成 `idempotency_key = uuid`
- 主进程组 multipart：payload + 每个 file__<draftId>
- POST /api/assets/push（**runtime: nodejs**，主进程发，渲染层只触发）
- 进度反馈：上传中 → 成功（toast + 删除本地 draft + 刷新已入库列表）
- 错误码处理：
  - GITHUB_CONFLICT → "同事刚推过新内容，重试？"
  - FILE_TOO_LARGE → 在 UI 上预先验证，不应发到服务端
  - RATE_LIMITED → 显示 retry-after

#### Task 10：剧集 dashboard 加 ⚡ 入库 FAB（如有草稿）
- TreeRoute 当前是只读 dashboard——加上"草稿数 (N)"小徽章 + 悬浮 FAB 跳到入库评审
- 草稿数从 SQLite local_drafts 取

#### Task 11：远程冒烟全闭环
- 真机走完：登录 → 新建剧集 → 导入 1 docx + 1 png → 一键推送 → 去 GitHub 网页看 commit + Supabase Studio 看 assets 表
- 通过则打 tag `p0d-complete`

#### Task 12（housekeeping，从 P0-C 残留）：修 Electron 启动权限 bug

P0-C Task 12 冒烟时发现：普通权限下 Windows cache/Mojo 报"拒绝访问"，必须以管理员启动。生产用户装 .exe 后绝不能要求"以管理员运行"——必须修。

排查方向：
- 检查 `BrowserWindow` 的 `webPreferences` 是否指错了 partition 或 cache path
- 检查 `app.getPath('userData')` 在 Windows 下是否落到一个普通用户写不了的目录（应该默认是 `%APPDATA%/<appName>`）
- 检查是否有什么代码用了 `app.setPath('cache', ...)` 指到了奇怪位置
- electron-builder 打包时 NSIS 安装路径默认是 `Program Files\<AppName>` 但运行时 cache 应当落用户态目录

完成判定：普通用户在不以管理员运行时打开 .exe，能正常启动并交互。

### B.3 P0-D 不做（留 P1+）

- ❌ Agent 化剧本生成（→ P1，spec 中已规划，详见 `docs/superpowers/vision/2026-04-29-expanded-product-vision.md`）
- ❌ 生图 / 生视频 API 集成（→ P3）
- ❌ 用户个人 prompt 库（→ P1）
- ❌ 知识库（光影 / 运镜模板）（→ P3）
- ❌ 评分门控 / Codex OAuth / DeepSeek API（→ P1）
- ❌ 画布 / 3D 编排（→ P5）

---

## C. 关键约束（不要违反）

1. **存储分层不许动**：12 行 `asset_types` 的 `storage_backend` 字段是定死的（3 行 github + 9 行 r2）。不许改。乐美林之前问过能否把图片放 GitHub——不能，会爆仓库
2. **设计真理是 mockup**：`docs/design/mockups/` 下 6 个 .html 是视觉真理，不要自由发挥风格
3. **每完成一个 task commit + push**，不要批量
4. **Tailwind class 偏离 token 时立即停**——所有颜色 / 字号 / 间距走 `tailwind.config.ts` 的 token
5. **遇到产品取舍 / 业务歧义** → 停下问乐美林，不自己拍板
6. **触发类的事不做**：自动更新、邮件 SMTP 自定义、SAML SSO、quota request 审批 UI 等都属 P0.5+

---

## D. P1+ 决策已锁定的部分（P0-D 阶段不实现，但你需要知道）

详细在 `docs/superpowers/vision/2026-04-29-expanded-product-vision.md`：

- ✅ Q1 评分官 = 另一个 Agent 角色
- ✅ Q2 配额：每用户起始 ¥10 + 10 张图 + 3 次 Codex Pro
- ✅ Q3 模型层级：Codex Pro（剧本 3 次） / DeepSeek Pro（默认） / DeepSeek Flash（廉价档） / BYOK
- ✅ Q4 skill 库：纯 markdown in repo（无 admin UI）
- ✅ Q5 + 知识库：提示词 KB 板块（光影 / 运镜模板）+ awesome-image2.0 import
- ✅ Q6 画布双板块：自建（tldraw 类）+ LibLib（用 `shell.openExternal()` 打开浏览器，不嵌入）
- ✅ NEW 用户个人 prompt 库 = `user_skills` 表（数据库存）

---

## E. 工作约定

- 仓库：`https://github.com/prokids-official/VideoAPP`
- 分支：`main` 直推
- 测试：`npm test`（backend）+ `npx tsc --noEmit` 前后端各一次
- 运维清单 §1-§5：已全部完成（Supabase / Upstash / GitHub PAT / R2 / Vercel）
- 卡住找乐美林（不是 Claude）

---

**简报结束。先做 §A Task 12 收尾，停下汇报。再做 §B 的 P0-D plan + 11 个 task。**
