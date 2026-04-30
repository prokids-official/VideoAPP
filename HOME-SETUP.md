# 家里电脑开机包

> 适用场景：换一台没有记忆的新电脑（家里电脑、新同事入职、回工位）继续 FableGlitch 开发。
> 全程 30-40 分钟，包括环境搭建 + 让 Claude / Codex 接上上下文。

---

## A. 装环境（一次性，10 分钟）

家里电脑确认有这些（缺哪个去官网装）：
- **Node.js ≥ 22**（含 npm）—— https://nodejs.org
- **Git**（Windows 自带或 https://git-scm.com）
- **VS Code** 或其他 IDE
- **可选**：Claude Code 桌面端、Codex CLI

**不需要 Docker** —— 我们用云端 Supabase，本地不跑数据库。

---

## B. 把代码拿下来（5 分钟）

```bash
# 选个工作目录，比如 D:\projects 或 ~/projects
mkdir D:\projects
cd D:\projects

git clone https://github.com/prokids-official/VideoAPP.git
cd VideoAPP

npm install
cd backend
npm install
cd ..

# 重要：rebuild 原生模块给 Electron 用
npx electron-rebuild -f -w better-sqlite3
```

---

## C. 配置 env 文件（**这一步必须做**，10 分钟）

Git 不跟踪 `.env` 文件（敏感信息），你家里电脑需要重新创建两个：

### C.1 后端 env

新建 `D:\projects\VideoAPP\backend\.env.local`，内容（**值从你密码管理器或之前公司电脑的同名文件抄过来**）：
```
SUPABASE_URL=https://uqsxjykzzfesjwmplpxx.supabase.co
SUPABASE_SERVICE_KEY=<抄过来>
SUPABASE_ANON_KEY=<抄过来>
SUPABASE_JWT_SECRET=<抄过来>
UPSTASH_REDIS_URL=<抄过来>
UPSTASH_REDIS_TOKEN=<抄过来>
GITHUB_BOT_TOKEN=<抄过来>
GITHUB_REPO_OWNER=ProKids-digital
GITHUB_REPO_NAME=asset-library
GITHUB_DEFAULT_BRANCH=main
R2_ACCOUNT_ID=<抄过来>
R2_ACCESS_KEY_ID=<抄过来>
R2_SECRET_ACCESS_KEY=<抄过来>
R2_BUCKET_NAME=fableglitch-assets
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
```

如果你公司电脑没存好，去对应控制台重新拿（Supabase / Upstash / GitHub PAT 都能重新生成或查看；R2 secret 一次性显示，丢了得重生 token）。

### C.2 前端 env

新建 `D:\projects\VideoAPP\.env`：
```
VITE_API_BASE_URL=https://video-app-kappa-murex.vercel.app/api
```

这一行就够——前端直接打 Vercel 上跑着的后端，**不用本地起后端**。

---

## D. 启动 App 看看（30 秒）

```bash
cd D:\projects\VideoAPP
npm run dev
```

Electron 窗口应该打开，看到登录页。
用 `meilinle@beva.com` + `Admin1234` 登录（管理员账号）。

如果卡了：
- 报"桥接未加载"→ 完全关掉重启 `npm run dev`
- 普通权限启不来 → 右键 PowerShell"以管理员身份运行"再 npm run dev（这个 bug 在 P0-D Task 12 待修）

---

## E. 给家里 Claude Code 的开场白

打开新的 Claude Code 会话，在工作目录 `D:/projects/VideoAPP` 里，**把下面整段贴进去**：

```
我接手一个进行中的 Electron + Next.js 项目（FableGlitch Studio · 公司内部 AI 漫剧管理工具）。
请按顺序读完这 4 份文档，确认你理解上下文后告诉我，我再分配下一步。

必读：
1. HOME-SETUP.md（本机环境状态——你现在看的就是）
2. HANDOFF-TO-CODEX-NEXT.md（当前阶段交接给 Codex 的简报）
3. docs/superpowers/plans/2026-04-29-p0d-asset-flow.md（P0-D 12-task 实现计划）
4. docs/superpowers/specs/2026-04-23-fableglitch-p0-foundation-design.md v2（基建设计，特别是 §5 API 契约 + §9.A asset_types 12 行种子）

参考（按需读）：
5. docs/superpowers/vision/2026-04-29-expanded-product-vision.md（P1-P5 远期规划 + Q1-Q6 已答决策）
6. docs/design/mockups/ 下 6 个 .html（视觉真理）
7. CLAUDE.md（项目结构总览）

工作分工沿用：前端 + 设计 = Claude（我），后端 = Codex。
仓库在 prokids-official/VideoAPP，分支 main 直推。
当前进度看 git log --oneline -20 了解最近做到哪一步了。
```

它读完会汇报理解，然后你照常对话。

---

## F. 给家里 Codex 的开场白

打开新的 Codex CLI 会话，在工作目录 `D:/projects/VideoAPP` 里：

```
我接手一个进行中的 Next.js 后端 + Electron 前端项目。
请按顺序读完：

1. HANDOFF-TO-CODEX-NEXT.md（你之前的角色 + 当前阶段）
2. docs/superpowers/plans/2026-04-29-p0d-asset-flow.md（P0-D 12 个 task，你已经做完了 1-8，下一个是 Task 9：push 调用 + 幂等）
3. docs/superpowers/specs/2026-04-23-fableglitch-p0-foundation-design.md（§5 API 契约）

读完后跑：
- npm run lint（前端 + 后端 cd backend 各一次）
- npx tsc -b --noEmit（前端）
- cd backend && npx tsc --noEmit（后端）
- npm run build（前端）

确认本地环境健康后停下报告，等我下一个指令（应该是 Task 9）。
```

---

## G. 当前进度速览（截至 commit `c20da17`）

```
P0-A 后端 auth + schema  ✅ 部署 Vercel
P0-B 后端资产流路由      ✅ 部署 Vercel
P0-C 前端外壳            ✅ 全部 12 task 完成
P0-D Task 1 docx/xlsx    ✅
P0-D Task 2 本地草稿     ✅
P0-D Task 3 Episode wizard ✅
P0-D Task 4 AssetPanel   ✅
P0-D Task 5 导入预览     ✅
P0-D Task 6 粘贴流       ✅
P0-D Task 7 资产预览组件 ✅
P0-D Task 8 入库评审页   ✅
P0-D Task 9 push 调用    ✅ 闭环跑通！
P0-D Task 10 dashboard FAB ✅
P0-D Task 11 远程闭环冒烟 ⏳ 下一个（真机端到端 + 打 tag）
P0-D Task 12 Electron 普通权限启动 bug ⏳ 收尾
```

**P0-D 关键里程碑达成**：commit `bd0785f` 起，整套"导入文件 → 一键推送 → 后端 GitHub/R2/Supabase 三阶段入库"流程已 wire-up + 测试通过。Tasks 10-12 都是小幅打磨。

---

## H. 你下一句话告诉 Codex

Task 11 是**乐美林手动+Codex 配合**的真机端到端冒烟，不是纯代码 task。Codex 主要做"列出步骤 + 跑能自动跑的"，关键操作步骤需要乐美林在 App 里真点。

```
继续 P0-D Task 11：真机端到端闭环冒烟 + 打 tag p0d-complete

测试目标（按这个顺序，每步乐美林确认通过才下一步）：
1. cd D:/VideoAPP && npm run dev 启动 Electron
2. 用 meilinle@beva.com / Admin1234 登录 → 看到 ShellEmptyRoute 欢迎屏（如有项目则 TreeRoute）
3. 点 [+ 新建剧集] → 4 步 wizard
   - Step 1 系列：童话剧
   - Step 2 专辑：格林童话
   - Step 3 内容：侏儒怪
   - Step 4 剧集：侏儒怪 第一集
   - 点 [创建骨架] → 应跳到剧集 dashboard
   - 验证：去 GitHub https://github.com/ProKids-digital/asset-library 应看到一个 init skeleton commit
4. 在 dashboard 点 SCRIPT 板块 → 进 AssetPanel
   - 点 [📋 粘贴文本] → 粘一段 markdown → 保存为草稿
   - 点 [📁 导入] 选一个 .docx → 保存为草稿
5. 点其他板块比如 CHAR → 导入一张 .png 角色图保存为草稿
6. 回 dashboard → 应该看到右下角 ⚡ FAB 显示 (3)
7. 点 FAB → 进入库评审页 → 看到 3 项按板块分组
8. 全选 → 编辑 commit message → 点 ⚡ 推送
9. 应看到上传遮罩 + 进度 → 成功 → 跳回 dashboard + 顶部紫色 toast"✓ 3 项资产已入库"
10. 验证后端：
    - GitHub asset-library 应有新 commit + 1 个 .md 文件（剧本）
    - Cloudflare R2 控制台应有 1 个 PNG 对象
    - Supabase Studio assets 表应有 3 行（status='pushed'）
    - usage_logs 应有 ~5 条新记录（github commit + r2 upload + supabase）
11. dashboard 卡片网格应显示新数字（SCRIPT: 1 已入库 / CHAR: 1 已入库 等）
12. 点已入库的剧本 → AssetPreviewModal 应渲染 markdown
13. 点已入库的角色图 → ImagePreview 应正确显示（presigned URL fetch）
14. 退出登录 → 关闭 App → 重开 → 应自动登录回到 TreeRoute（refresh token 流程）

Codex 你需要做：
- 写一份 D:/VideoAPP/docs/superpowers/plans/2026-04-30-p0d-smoke-checklist.md，
  包含上面 14 步 + 每步预期 + 失败时的排查指引
- 跑能自动跑的部分（npm test 全套 + npm run build + lint）确认绿
- 然后停下，让乐美林手动走 14 步
- 乐美林反馈结果后，如果全过 → 你打 tag p0d-complete 并 push

commit message（Codex 自动跑的那部分）：docs(p0d-11): smoke checklist + verify build green

如果发现 bug → 不修，记录到 checklist 文件 + 报告 → 等乐美林决定修 vs 跳过。

完成停下报告。
```

---

**就这样。在家也能正常推进。** 假期愉快。
