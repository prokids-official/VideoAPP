# 给 Codex 的交接简报

> 日期：2026-04-29
> 上下文：Claude 之前一直在做 P0-C 前端 Tasks 1-6 + 邮箱验证后端改动。现在交接给你继续 P0-B 部署 + P0-C Tasks 7-12（前端 LoginRoute 到 TreeRoute）+ 一些后端测试更新。

---

## 0. 必读文件（开工前先看）

按顺序读完这 5 份：

1. **`docs/superpowers/specs/2026-04-23-fableglitch-p0-foundation-design.md`** v2 spec（§5.1 邮箱验证刚改了，§9.A 12 行 asset_types 是真理，§9.E 路径规范化）
2. **`docs/superpowers/plans/2026-04-27-p0c-frontend-shell.md`** P0-C 12 个 Task 的详细蓝图——你接 Task 7 起做
3. **`docs/design/mockups/login.html`** + `shell.html` + `tree.html` + `first-run-modal.html` 视觉真理（4 个 mockup 文件）
4. **`docs/superpowers/plans/2026-04-24-p0a-operator-checklist.md`** 运维清单（已全部跑完，乐美林那边账号都开了）
5. **`CLAUDE.md`** 项目结构总览

---

## 1. 当前进度快照

### ✅ 已完成

| 模块 | 状态 | 关键 commit |
|---|---|---|
| P0-A 后端基建（auth + schema + filename-resolver） | 部署到 Vercel `https://video-app-kappa-murex.vercel.app` | `2eae286` |
| P0-B 后端资产流（tree/episodes/assets/usage 路由 + GitHub/R2/idempotency 库） | 代码完成，**待你触发 Vercel redeploy 让 P0-B 路由也上线** | 14 个 commits up to `12244b2` |
| 邮箱验证开关 | 已改成"开启验证"模式（spec + signup + login + resend-verification 路由） | `2eae286` |
| P0-C 前端 Tasks 1-6 | 拆旧、tailwind tokens、SQLite IPC、API client、AuthContext、Button/Input/Card | `86c7c66` → `fc20f38` |
| 6 屏 UI 设计 | login / shell / tree / episode-wizard / push-review / first-run-modal | `5f2ee40` |
| 运维清单 | Supabase / Upstash / GitHub PAT / R2 / Vercel 全部到位 | — |

### ⏳ 你接手做的事

**A. Backend 收尾（小活，先做）**

1. **更新 signup/login 单元测试**：之前 mock 的返回值假设有 session，现在 signup 返回 `SignupPendingResult { user, email_verification_required: true }`，没有 session。需要更新 `app/api/auth/signup/route.test.ts` 和可能的 `login/route.test.ts`（针对 EMAIL_NOT_CONFIRMED 分支加一个 case）。验证 `npm test` 全绿。
2. **写 resend-verification 单元测试**：`app/api/auth/resend-verification/route.test.ts`，至少 3 个 case：
   - 200 happy path（mock supabase.auth.resend 成功）
   - 200 email 不存在时（防枚举：仍返回 sent:true）
   - 429 rate limit
3. **触发 Vercel redeploy**：current `main` HEAD `2eae286` 包含所有 P0-B 路由代码（tree/episodes/assets/usage）+ 新 resend-verification 路由，但 Vercel 上面的版本是 P0-A only。只要 git push 已经发生（已经发生了），Vercel 就会自动触发——你只需要去 Vercel dashboard 看一眼最新部署是不是从 `2eae286` 起的。如果不是，在 dashboard 点 "Redeploy"。然后远程冒烟新路由：

```bash
BASE="https://video-app-kappa-murex.vercel.app"
# tree 应返回 401（无 token）而不是 404
curl.exe -sS -i "$BASE/api/tree" | head -5
# resend-verification 应返回 200 sent:true（dummy email）
curl.exe -sS -X POST "$BASE/api/auth/resend-verification" \
  -H "content-type: application/json" \
  -d '{"email":"smoke@beva.com"}'
```

**B. P0-C 前端 Tasks 7–11（重点活）**

按 `docs/superpowers/plans/2026-04-27-p0c-frontend-shell.md` 的 plan 执行。每个 Task 完成后 commit + push。

⚠️ **Plan 里 Task 7 LoginRoute 的内容需要按邮箱验证调整**：

- 注册成功后**不再直接登录**——应该跳到一个"📬 验证邮件已发送到 xxx@beva.com 请查收并点击链接"的中间状态屏，提供"重发邮件"按钮（调 `/api/auth/resend-verification`）和"返回登录"按钮
- 登录时如果错误码是 `EMAIL_NOT_CONFIRMED`（不是 `INVALID_CREDENTIALS`），显示蓝色提示（不是红色错误）："邮箱还没验证，去邮箱点链接，或者 [重发验证邮件]"
- 视觉参考仍然是 `docs/design/mockups/login.html`，但你需要在那个组件里加一个 "verification pending" 模态/全屏中间态。如果有疑问，先做最干净的实现，跑起来给乐美林看，再调

**C. 不要做的事**

- ❌ 不要去碰存储架构。乐美林之前问过"图片音频也放 GitHub 行不行"——**不行**，会爆掉 GitHub 仓库。所有 12 行 `asset_types` 的 `storage_backend` 字段（3 个 github + 9 个 r2）是定死的，不许动。Claude 已经在 spec §9.A 锁定了。
- ❌ 不要做 Episode wizard / Push review / Asset import / docx 转换 —— 那是 P0-D，不是 P0-C
- ❌ 不要急着上 SAML / SSO / 2FA —— 简单内部工具

---

## 2. 关键工作约定

### 2.1 仓库 + 分支

- 仓库：`https://github.com/prokids-official/VideoAPP`（公司号）
- 分支：直接 commit 到 `main`，不开 feature branch（30 人内部工具，不需要审核流）
- 每完成一个 Task → commit + push（commit message 用 `feat(p0c-N): ...` / `test(backend): ...` 格式）
- **不要发 PR，不要 squash merge** —— 直推

### 2.2 工作目录 + 依赖

- 项目根：`D:\VideoAPP`
- 前端命令在根：`npm run dev`（Vite + Electron）/ `npx tsc -b --noEmit`
- 后端命令在 `backend/`：`npm test` / `npx tsc --noEmit` / `npm run lint`
- 后端 .env：`D:\VideoAPP\backend\.env.local`（云端 Supabase + GitHub PAT 已填好）
- 前端 .env：`D:\VideoAPP\.env`，当前指向 `https://video-app-kappa-murex.vercel.app/api`

### 2.3 测试 / 验证标准

- 写代码 = 写测试。每个新 lib 一份 `*.test.ts`，每个新路由一份 `*.test.ts`
- 提交前必跑：`npm test`（后端在 `backend/`）+ `npx tsc --noEmit` 前后端各一次
- UI 改动后 `npm run dev` 确认能起、能交互、视觉与 mockup 一致

### 2.4 设计语言（不允许偏离）

```
背景 #0a0a0b（永远不变）
紫渐变（135deg, #9b7cff → #e879f9）= 仅用于 Logo 文字 + 主 CTA + 用户头像
mono 字体 = 文件名 / 路径 / 时间戳 / 邮箱 / 版本号 V001 / commit sha
状态用 8px 实心圆点（绿=已入库 / 琥珀=草稿 / 红=错误）—— 不要 pill 徽章
最大内容宽度 880px / 720px / 560px / 480px（看 mockup INDEX.md）
emoji 当图标（📝🖼️👤🏰🗝️🎬）—— 不要画 SVG
hover 仅颜色变化，不要 scanline / glitch / 动效线
```

---

## 3. 你的执行顺序

按这个顺序做，每个完成后 commit + push + 跟乐美林说一声"X 完成"再做下一个：

```
[1] 后端：更新 signup test + 写 resend-verification test → npm test 全绿 → commit
[2] 后端：远程冒烟 Vercel 上 P0-B 路由（tree / resend-verification）能跑 → 截屏给乐美林看 status code
[3] 前端：P0-C Task 7 LoginRoute（含邮箱验证 pending 屏 + EMAIL_NOT_CONFIRMED 处理）
[4] 前端：P0-C Task 8 TopNav
[5] 前端：P0-C Task 9 ProjectTree（4 层递归）
[6] 前端:  P0-C Task 10 ShellEmptyRoute + FirstRunModal
[7] 前端：P0-C Task 11 TreeRoute + 剧集 Dashboard（只读卡片网格）
[8] 前端：P0-C Task 12 远程冒烟（连接 Vercel 后端跑完整 signup→verify→login→tree 闭环）
```

每个 Task 都在 `docs/superpowers/plans/2026-04-27-p0c-frontend-shell.md` 里有详细的 Steps、代码示范、验收方法。**完整代码骨架已经写好**，你只需要按 Steps 执行 + 验证。

---

## 4. 卡住时怎么办

- **类型错误 / lint 失败** → 自己修，别绕开
- **API 调用 401/500** → 先 `curl.exe` 直接打 Vercel 看后端是否健康，再排前端
- **Tailwind class 不生效** → 检查 `src/styles/globals.css` 的 `@theme` 块和 `tailwind.config.ts` 是否同步
- **better-sqlite3 报原生模块错** → `npx electron-rebuild -f -w better-sqlite3`
- **设计与 mockup 偏差** → 优先看 `docs/design/mockups/<screen>.html`，那是真理；plan 里的代码示范若与 mockup 冲突，以 mockup 为准
- **遇到设计取舍 / 业务逻辑歧义** → **停下问乐美林**，不要自己拍板

---

## 5. 完成 P0-C 之后

P0-C Task 12 远程冒烟过了 = P0-C 完成。下一步是 P0-D（Episode wizard + Asset panels + Push review），但**那时再问乐美林是否继续**——不要自动接 P0-D。

---

**简报结束。开始干活吧。**
