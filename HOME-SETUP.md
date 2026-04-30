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

## G. 当前进度速览（截至 commit `bd0785f`）

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
P0-D Task 10 dashboard FAB ⏳ 下一个（小，UI 强化）
P0-D Task 11 远程闭环冒烟 ⏳
P0-D Task 12 Electron 普通权限启动 bug ⏳ 收尾
```

**P0-D 关键里程碑达成**：commit `bd0785f` 起，整套"导入文件 → 一键推送 → 后端 GitHub/R2/Supabase 三阶段入库"流程已 wire-up + 测试通过。Tasks 10-12 都是小幅打磨。

---

## H. 你下一句话告诉 Codex

```
继续 P0-D Task 10：剧集 dashboard 浮动 FAB（强化入库评审入口）

参考 docs/design/mockups/tree.html 右下角的"⚡ 一键入库 (3)"FAB 设计：
- TreeRoute 剧集 dashboard 右下角加一个 sticky FAB
- 显示当前剧集的本地草稿数（来源：fableglitch.db.draftsList(episodeId).length）
- 草稿数为 0 时 FAB 隐藏
- 草稿数 ≥ 1 时显示，紫色 gradient 圆按钮 + emoji ⚡ + "(N)" 草稿数 mono 字体
- Framer Motion 微动效：mount 时 spring 弹入，hover 时 scale 1.05
- 点击 → 跳转 /episode/:id/push-review（同 Task 8 已有按钮）
- 移除 Task 8 临时放在 dashboard 顶部的"入库评审 (N 草稿)"按钮（FAB 接管这个角色）

测试：
- 草稿数 0 时 FAB 不渲染
- 草稿数 ≥ 1 时 FAB 渲染 + 显示数字
- 点击触发跳转

commit message: feat(p0d-10): floating push FAB on episode dashboard

完成停下报告。
```

---

**就这样。在家也能正常推进。** 假期愉快。
