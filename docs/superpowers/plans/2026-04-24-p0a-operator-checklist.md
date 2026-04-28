# P0-A 运维接入清单（乐美林手动操作）

> **目的**：把 P0-A 后端代码变成一个真跑在公网的 Vercel 服务，让前端能联调。
> **时长**：30–40 分钟（账号注册 + 控制台点击，无写代码）。
> **完成判定**：本清单走完后，Vercel 给你一个 `xxx.vercel.app` URL，访问 `https://xxx.vercel.app/api/auth/me`（不带 token）应返回 `{"ok":false,"error":{"code":"UNAUTHORIZED",...}}`，状态码 401——不是 500、不是连接错误。

完成每一步后回到这份文档勾掉 `[ ]`。所有"复制下来"的值统一先存到一个本地 txt（比如 `D:\VideoAPP\backend\.env.local`），最后一次性贴到 Vercel。

---

## 0. 准备

- [ ] **0.1** 准备一个独立邮箱当 GitHub bot 账号——推荐 `fableglitch-bot@beva.com`。如果公司 IT 不给开新邮箱，临时用你自己的 `meilinle+bot@beva.com`（Gmail/Outlook 的 `+xxx` 别名都进同一个收件箱，不影响）
- [ ] **0.2** 准备一个本地 txt 文件 `D:\VideoAPP\backend\.env.local` 用来收集 14 个环境变量。文件内容先写：
  ```
  SUPABASE_URL=
  SUPABASE_SERVICE_KEY=
  SUPABASE_ANON_KEY=
  SUPABASE_JWT_SECRET=
  UPSTASH_REDIS_URL=
  UPSTASH_REDIS_TOKEN=
  GITHUB_BOT_TOKEN=
  GITHUB_REPO_OWNER=fableglitch
  GITHUB_REPO_NAME=asset-library
  GITHUB_DEFAULT_BRANCH=main
  R2_ACCOUNT_ID=
  R2_ACCESS_KEY_ID=
  R2_SECRET_ACCESS_KEY=
  R2_BUCKET_NAME=fableglitch-assets
  R2_ENDPOINT=
  ```
- [ ] **0.3** 信用卡准备好（Cloudflare 启用 R2 必须绑卡，但每月免费额度内不扣钱）

---

## 1. Supabase（10 分钟）

### 1.1 注册 + 建项目

- [ ] 打开 https://supabase.com → 用 `meilinle@beva.com` GitHub OAuth 登录
- [ ] 右上角 **New project**：
  - Organization：默认或 New（名字 `fableglitch`）
  - Project name：`fableglitch-prod`
  - Database Password：**生成一个强密码并存到密码管理器**（这个值后面 migrations 会用）
  - Region：选 **Southeast Asia (Singapore)** —— 离深圳/北京最近
  - Pricing Plan：Free
- [ ] 等 ~2 分钟项目就绪

### 1.2 拿 4 个值

进 project → 左下角齿轮 **Project Settings**：

- [ ] **API** 标签页：
  - 复制 **Project URL** → 填到 `.env.local` 的 `SUPABASE_URL=`
  - **Project API Keys** 区域：
    - 复制 **anon public** → `SUPABASE_ANON_KEY=`
    - 点 **Reveal** 后复制 **service_role secret** → `SUPABASE_SERVICE_KEY=` ⚠️ 这个 key 等同管理员密码，绝不能提交进 git
- [ ] **API → JWT Settings**：
  - 复制 **JWT Secret** → `SUPABASE_JWT_SECRET=`

### 1.3 关闭邮箱确认

- [ ] **Authentication → Providers → Email**：
  - **Confirm email** 关闭（spec §5.1 说明：域名白名单已经是过滤层，不需要再走邮箱链接）
  - 保存

### 1.4 推 migrations + seed 到生产数据库

打开本地终端：
```bash
cd D:/VideoAPP/backend
npx supabase login   # 浏览器弹窗授权
npx supabase link --project-ref <从 SUPABASE_URL 里抠：https://abc.supabase.co 的 abc 就是 ref>
npx supabase db push  # 把 4 个本地 migration 推到云端
```
- [ ] `db push` 输出 4 个 migration 都 `Applied`，无报错

跑 seed.sql：
- [ ] Supabase 控制台 → **SQL Editor** → **New query**
- [ ] 把 `D:/VideoAPP/backend/supabase/seed.sql` 内容全粘进去 → **Run**
- [ ] 跑完应显示 `Success. 12 rows affected`（重跑会显示更新数）

验证：
- [ ] **Table Editor** 左侧应该看到 `users / asset_types / series / albums / contents / episodes / assets / usage_logs` 共 8 张表
- [ ] 点 `asset_types` 应该看到 12 行，前 3 行 `storage_backend` 是 `github`，后 9 行是 `r2`

---

## 2. Upstash Redis（5 分钟，rate limit 用）

- [ ] 打开 https://upstash.com → GitHub 登录
- [ ] **Redis → Create Database**：
  - Name：`fableglitch-ratelimit`
  - Type：**Regional**（不要 Global，省钱）
  - Region：**ap-southeast-1 (Singapore)**
  - Plan：Free
- [ ] 进入 database 页面 → **REST API** 标签：
  - 复制 **UPSTASH_REDIS_REST_URL** → `.env.local` 的 `UPSTASH_REDIS_URL=`
  - 复制 **UPSTASH_REDIS_REST_TOKEN** → `UPSTASH_REDIS_TOKEN=`

⚠️ 复制 URL 时确保是 `https://xxx.upstash.io` 这种 REST URL，不是 `redis://` 协议地址。

---

## 3. GitHub（5 分钟，不用建 bot 账号）

我们用 `prokids-official` 这个公司主账号 + 一个**仅锁定到 asset-library 仓库**的 fine-grained PAT 来完成 push。30 人内部工具不需要单独的 bot 账号——一个 PAT、最小权限、commit 作者显示为公司主号即可。

> 当前架构：
> - GitHub user `prokids-official` (邮箱 `prokids.digital@gmail.com`)
> - 该 user 拥有 organization `ProKids-digital`
> - VideoAPP 源代码：`prokids-official/VideoAPP`（已就绪）
> - 资产仓库：`ProKids-digital/asset-library`（已建好）

### 3.1 启用 fine-grained PAT 进 organization

GitHub org 默认禁止个人 PAT 访问，需要在 org 设置里开一下：

- [ ] 用 `prokids-official` 登录 → https://github.com/organizations/ProKids-digital/settings/personal-access-tokens
- [ ] 勾选 **Allow access via fine-grained personal access tokens** → Save
- [ ] （可选）勾 **Require administrator approval**——选了的话每次新 PAT 你要自己 approve；首次可以不勾省事

### 3.2 生成 PAT（最小权限）

- [ ] 用 `prokids-official` 登录 → https://github.com/settings/tokens?type=beta
- [ ] **Generate new token**：
  - Token name: `fableglitch-asset-pusher`
  - Expiration: **No expiration**（公司内部，省事）
  - **Resource owner**: 选 **ProKids-digital**（org，不是你的 user！下拉框里要能看到，看不到就回 §3.1 检查）
  - Repository access: **Only select repositories** → 选 `asset-library`
  - Permissions → Repository → 只开 **Contents: Read and write**（其他全部 No access）
- [ ] 生成后立刻复制 token（`github_pat_...`）→ `.env.local` 的 `GITHUB_BOT_TOKEN=`
  - ⚠️ 关掉页面就再也看不到了，必须现在存

### 3.3 验证 PAT 能写

```bash
cd D:/tmp  # 任意临时目录
git clone https://prokids-official:<那个 github_pat_>@github.com/ProKids-digital/asset-library.git
cd asset-library
echo "smoke" >> README.md
git add README.md
git -c user.email=prokids.digital@gmail.com -c user.name="ProKids" commit -m "chore: smoke test from PAT"
git push
```
- [ ] push 成功 → 权限 OK，回 GitHub 网页看到 commit 由 `prokids-official` 创建
- [ ] 删除本地临时 clone：`cd .. && rm -rf asset-library`

---

## 4. Cloudflare R2（5 分钟）

### 4.1 开账号 + 启用 R2

- [ ] 打开 https://dash.cloudflare.com/sign-up → 用 `meilinle@beva.com` 注册
- [ ] 左侧菜单 **R2 Object Storage** → 第一次进会要求绑定信用卡。绑（每月免费额度足够 P0 用，超出才扣）
- [ ] 启用后，从右上角"Account home"返回主页 → URL 里能看到 `accounts/<32 位 hex>/...` —— 这个 hex 就是 **Account ID** → `.env.local` 的 `R2_ACCOUNT_ID=`

### 4.2 创建 bucket

- [ ] R2 → **Create bucket**：
  - Name：`fableglitch-assets`
  - Location：**Asia-Pacific (APAC)** 自动路由
  - Storage Class：Standard
  - Public access：保持 **Disabled**（spec 走 presigned URL）

### 4.3 生成 R2 API Token

- [ ] R2 → **Manage R2 API Tokens** → **Create API token**：
  - Token name：`fableglitch-backend`
  - Permissions：**Object Read & Write**
  - Specify bucket(s)：选 `fableglitch-assets`（不要 All Buckets，最小权限）
  - TTL：保持默认（永不过期）
- [ ] 生成后页面会一次性显示三个值，**全都立刻复制**：
  - **Access Key ID** → `.env.local` 的 `R2_ACCESS_KEY_ID=`
  - **Secret Access Key** → `R2_SECRET_ACCESS_KEY=`
  - **Use jurisdiction-specific endpoints for S3 clients** 区域里的 `https://<account_id>.r2.cloudflarestorage.com` → `R2_ENDPOINT=`
  - ⚠️ 关页面就再看不到 secret，必须现在存

---

## 5. Vercel（10 分钟）

### 5.1 注册 + 导入仓库

- [ ] https://vercel.com/signup → 用 GitHub OAuth 登录（用你自己账号，不是 bot）
- [ ] **Add New → Project** → 选 `loy27felix/VideoAPP` 仓库
- [ ] **Configure Project**：
  - **Framework Preset**：Next.js（应该自动识别）
  - **Root Directory**：点 **Edit** → 改成 `backend`（很重要！）
  - **Build Command**：默认 `next build`
  - **Output Directory**：默认 `.next`
  - **Install Command**：默认 `npm install`
- [ ] **Environment Variables** 区域：把 `.env.local` 的 14 个变量挨个粘进去
  - 对每个变量：Name 输入 key（如 `SUPABASE_URL`）、Value 输入 value、Environment 默认全选（Production / Preview / Development）
  - 14 个变量都填完 → 没填的会让首次 build 失败（Codex 写的 `env.ts` 启动时校验）

### 5.2 触发首次部署

- [ ] **Deploy** —— 等 ~2 分钟
- [ ] 如果失败：
  - 看 Build Logs 哪个 env 缺了 → 回 Settings → Environment Variables 补上 → Redeploy
  - 看到 `Cannot find module 'supabase'` 之类 → 应该不会发生，已经在 `package.json` 里
- [ ] 成功后 Vercel 给一个域名 `videoapp-xxx.vercel.app`

### 5.3 真机冒烟

打开 PowerShell：
```powershell
$BASE = "https://videoapp-xxx.vercel.app"   # 换成你的实际域名

# 1. 不带 token 调 me 应 401
curl.exe -sS -i $BASE/api/auth/me | Select-String "HTTP/"

# 2. 注册一个测试账号
curl.exe -sS -X POST $BASE/api/auth/signup `
  -H "content-type: application/json" `
  -d '{"email":"smoke@beva.com","password":"smoke1234","display_name":"冒烟测试"}'

# 3. 登录
$LOGIN = curl.exe -sS -X POST $BASE/api/auth/login `
  -H "content-type: application/json" `
  -d '{"email":"smoke@beva.com","password":"smoke1234"}'
$LOGIN
```

- [ ] step 1 看到 `HTTP/2 401`
- [ ] step 2 返回 201，body 含 `"ok":true`
- [ ] step 3 返回 200，body 含 access_token + refresh_token

冒烟通过 → P0-A 真正完成 ✅

---

## 6. 善后

- [ ] 把 `.env.local` 那 14 个值再次确认存到密码管理器（1Password / Bitwarden / 公司密码本）—— Vercel 里的可以编辑但不能整体导出
- [ ] 把 `D:/VideoAPP/backend/.env.local` 文件**保留在本地**（已经在 .gitignore 里），P0-C 前端开发本地起 `next dev` 时用同一份
- [ ] 在 Vercel 项目的 **Settings → Domains** 看一下默认域名，告诉 Claude / Codex 实际部署 URL，他们后续 P0-B 路由开发会用到这个 base URL 联调

---

## 故障排查

| 症状 | 多半原因 | 解决 |
|---|---|---|
| Vercel build 失败 `Invalid environment variables: SUPABASE_URL: Required` | env 没填或拼错 key 名 | Settings → Env Vars 检查 14 个变量名拼写完全一致 |
| `/api/auth/me` 返回 500 而不是 401 | Supabase migrations 没推上去 | 重跑 `npx supabase db push` |
| signup 返回 500 | seed.sql 没跑或 RLS 没启用 | SQL Editor 重新执行 seed.sql |
| signup 返回 400 `INVALID_EMAIL_DOMAIN` | 测试用的不是 @beva.com 邮箱 | 必须 @beva.com |
| Upstash 报错 `getaddrinfo ENOTFOUND` | URL 用了 `redis://` 协议 | 必须用 `https://xxx.upstash.io` REST URL |
| GitHub bot push 报 403 | bot 没加进 org 或 PAT scope 不含 `repo` | 重新生成 PAT 勾全 repo |
| R2 上传报 SignatureDoesNotMatch | endpoint 漏了 account_id 或多余斜杠 | endpoint 必须是 `https://<account_id>.r2.cloudflarestorage.com`（无尾斜杠、无 bucket 名） |

---

## 之后的事

清单走完后告诉 Claude 你的 Vercel URL 和冒烟结果，进入：
- **P0-B**（后端 episodes/assets 路由）：Codex 主写
- **P0-C**（前端外壳 + 登录页）：Claude 主写，可立即用你这个 Vercel URL 联调
