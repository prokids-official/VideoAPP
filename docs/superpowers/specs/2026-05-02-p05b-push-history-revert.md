# FableGlitch P0.5-B 推送历史与撤回 Spec 增量

> 日期：2026-05-02
> 范围：在 P0-B 现有 `assets` + `idempotency_key` 基础上，引入 `pushes` 表把每次批量入库作为一个可追溯、可撤回的单元；新增推送历史查询与撤回 API；约定 GitHub revert + R2 trash 的实现机制。
> 关系：本文是 `2026-04-23-fableglitch-p0-foundation-design.md` v2 §4.4 + §5.4 + §6.5 的局部 amendment，其它部分不动。
> 工作分工：后端 = Codex，前端 = Claude。

---

## 1. 背景与目标

P0-B / P0-D 闭环让用户能"导入 → 一键推送 → GitHub + R2 + Supabase 三阶段入库"。但当前**没有任何撤回机制**：误推、错版本、命名错了、临时文件不小心 push 了 —— 唯一的"修复"路径是再 push 一个新版本盖掉、或者乐美林手工去 GitHub / R2 / Supabase 改三处。这不是产品该提供的体验。

本增量补三个能力：

1. **查看历史**：每个剧集能看到从开工至今所有的 push 列表，包含谁推的、推了什么、commit message、SHA、容量
2. **查看单次推送详情**：点进任意一次 push 看它包含的全部 assets
3. **撤回某次推送**：把一次 push 整体软删，包括反向 GitHub commit + R2 对象转入 trash + Supabase 标记 `withdrawn`，保持审计链不断

底层设计原则是"软删 + 审计"：永远不真删数据，让历史追溯成本可控。

---

## 2. 已锁定的产品决策

下面这些是 Claude 写本 spec 时按 30 人内部工具默认锁定的取舍。乐美林如有不同看法**在 Codex 开工前**告知改 spec，否则按此实施。

1. **撤回权限 = 原 pusher + admin**。任何 user 可以撤回自己 push 的批次；admin 可以撤回任何人的批次。其他人对该 push 调 withdraw → 403。
2. **无时间窗**。不限"X 小时内才能撤回"。三周前推的也能撤。审计链 + 可恢复 R2 trash 已经覆盖回退风险。
3. **撤回不可从 UI 反向恢复**。撤回是 forward-only 操作。如果撤错了，要么再 push 一次（创建新 asset），要么乐美林手工 SQL 把 `withdrawn_at` 字段清回 null + 从 R2 trash/ 拖回原 prefix。spec 不暴露 "restore" API。
4. **GET /api/assets 默认排除 withdrawn**。前端正常列表 / 预览看不到撤回的 assets。带 `?include_withdrawn=true` 可以看到（含 `withdrawn_at` 字段），用于历史查询、审计、admin 调查场景。
5. **R2 trash 保留 30 天**。撤回时把 R2 对象搬到 `trash/<original-prefix>/<file>` 命名空间，用 R2 lifecycle rule 30 天后自动删除。这给手工恢复留时间窗。
6. **GitHub revert 是 best-effort**。如果该 push 之后已经有别人改动了相同文件（GitHub 视角的 conflict），后端不强行解决，标记 `github_revert_failed` 并把 conflict 详情写入 push 行，前端提示乐美林手工去 GitHub 处理。Supabase + R2 的撤回不受影响。
7. **撤回的 push 内的 assets，其 `id` 保持不变**，不重排版本号、不删 row。新 push 进来如果命中相同 final_filename，按现有 supersede 逻辑递增 version。

---

## 3. 数据模型

### 3.1 新表：`pushes`

```sql
create table pushes (
  id                    uuid primary key default gen_random_uuid(),
  episode_id            uuid not null references episodes(id) on delete cascade,

  idempotency_key       text not null,
  commit_message        text not null,
  github_commit_sha     text,                          -- 该批次 GitHub commit SHA；纯 R2 batch 可为空
  github_revert_sha     text,                          -- 撤回时产生的反向 commit SHA
  github_revert_failed  boolean not null default false,
  github_revert_error   text,                          -- 失败时记录 Octokit 返回的 message

  pushed_by             uuid not null references users(id),
  pushed_at             timestamptz not null default now(),

  asset_count           int not null,                  -- 含 withdrawn 在内的总数（不变）
  total_bytes           bigint not null,

  withdrawn_by          uuid references users(id),
  withdrawn_at          timestamptz,
  withdrawn_reason      text,                          -- 用户撤回时填的原因，可空

  -- 同 user 内 idempotency_key 唯一（与现有 push_idempotency 表对齐）
  constraint pushes_idem_unique unique (pushed_by, idempotency_key)
);

create index pushes_episode_pushed_at_idx
  on pushes (episode_id, pushed_at desc);

create index pushes_active_idx
  on pushes (episode_id) where withdrawn_at is null;
```

### 3.2 `assets` 表加字段

```sql
alter table assets
  add column push_id      uuid references pushes(id) on delete restrict,
  add column withdrawn_at timestamptz;

create index assets_push_id_idx on assets (push_id);
create index assets_active_idx
  on assets (episode_id, type_code) where withdrawn_at is null;
```

`on delete restrict`：不允许直接 delete pushes 行，只允许 update `withdrawn_at`。这是双保险，防止误操作造成 assets 行 cascade 删除。

### 3.3 RLS 策略

```sql
alter table pushes enable row level security;

-- 所有登录用户可读所有 push（与现有 assets 可读一致：30 人内部全可见）
create policy pushes_select_all on pushes for select
  using (auth.uid() is not null);

-- insert 由 service role / API 路由（after authz）执行，普通 user 不能直接 insert
create policy pushes_no_direct_insert on pushes for insert
  with check (false);

-- update 同理（撤回走路由），不允许 client 直接改
create policy pushes_no_direct_update on pushes for update
  using (false);

-- 永远不允许 delete
create policy pushes_no_delete on pushes for delete
  using (false);
```

API 路由用 service key 绕过 RLS 写入。

### 3.4 历史数据回填（迁移最后一步）

P0-D 之前推过的 assets 没有 `push_id`。回填策略：

```sql
-- 按 (idempotency_key, pushed_by) 把现有 assets 分组生成 pushes 行
insert into pushes (idempotency_key, commit_message, pushed_by, pushed_at,
                    episode_id, asset_count, total_bytes, github_commit_sha)
select
  coalesce(a.idempotency_key, 'legacy-' || a.id::text)  as idempotency_key,
  coalesce(a.commit_message, '(legacy import)')         as commit_message,
  a.pushed_by,
  min(a.pushed_at)                                       as pushed_at,
  a.episode_id,
  count(*)                                               as asset_count,
  sum(coalesce(a.file_size_bytes, 0))                    as total_bytes,
  null                                                   as github_commit_sha
from assets a
where a.push_id is null
group by a.idempotency_key, a.pushed_by, a.episode_id, a.commit_message;

-- 把 assets 链回 pushes
update assets a
set push_id = p.id
from pushes p
where a.push_id is null
  and a.pushed_by = p.pushed_by
  and a.episode_id = p.episode_id
  and coalesce(a.idempotency_key, 'legacy-' || a.id::text) = p.idempotency_key;
```

如果 `assets.commit_message` 列不存在（spec §4.4 没明确规定它是否存在），把上面 select 中 `a.commit_message` 改为 `'(legacy import)'` 字面量。Codex 实操时按当前 schema 现状灵活处理。

---

## 4. API 契约

所有路由前缀 `/api`。响应统一 `{ ok, data }` / `{ ok, error }`。

### 4.1 新增：`GET /api/episodes/:id/pushes` [Edge Runtime]

任意登录用户可调。

```
query:
  ?include_withdrawn=true   // 默认 true（历史视图就是要看完整历史）
  ?limit=50                 // 默认 50，最大 200
  ?cursor=<base64-encoded-pushed_at>   // 分页游标

403  剧集不存在或无权限（P0 全员可见，理论不会出现，但保留）
404  episode_id 不存在
200  {
  pushes: [{
    id, idempotency_key, commit_message,
    github_commit_sha, github_revert_sha, github_revert_failed,
    pushed_by: { id, display_name },
    pushed_at,
    asset_count, total_bytes,
    withdrawn_by: { id, display_name } | null,
    withdrawn_at, withdrawn_reason,
    is_withdrawable_by_me: boolean      // = (auth.uid == pushed_by) || (role == 'admin')
  }, ...],
  next_cursor: string | null
}
```

排序：`pushed_at desc`。

### 4.2 新增：`GET /api/pushes/:id` [Edge Runtime]

任意登录用户可调。

```
404  push 不存在
200  {
  push: {
    ...全部 §4.1 字段...,
    episode: { id, name_cn, episode_path }
  },
  assets: [{
    id, type_code, name, variant, version, language,
    final_filename, storage_backend, storage_ref,
    file_size_bytes, mime_type,
    withdrawn_at      // 与 push.withdrawn_at 同步
  }, ...]
}
```

### 4.3 新增：`POST /api/pushes/:id/withdraw` [Node Runtime]

需要：`auth.uid == push.pushed_by` 或 `users.role == 'admin'`。否则 403。

```
body: {
  reason?: string              // 撤回原因，可空，最长 500
}

403  WITHDRAW_NOT_PERMITTED        非原 pusher 也非 admin
404  push 不存在
410  ALREADY_WITHDRAWN              已经撤回过
502  BACKEND_UNAVAILABLE            Supabase / GitHub / R2 任一不可达
200  {
  push: { id, withdrawn_at, withdrawn_by, withdrawn_reason,
          github_revert_sha, github_revert_failed, github_revert_error },
  affected_asset_ids: [uuid, ...],
  trash_objects_moved: int,
  github_status: 'reverted' | 'revert_failed' | 'no_github_assets'
}
```

**后端执行顺序（必须按此顺序）：**

```
1. SELECT push WHERE id=:id; if not found → 404
2. 校验权限：pushed_by == auth.uid() OR role == 'admin'，else 403
3. 校验 withdrawn_at IS NULL，else 410
4. BEGIN TRANSACTION (Supabase)
     UPDATE pushes SET withdrawn_by=auth.uid(), withdrawn_at=now(),
                       withdrawn_reason=:reason
            WHERE id=:id AND withdrawn_at IS NULL
     IF rowcount = 0 → ROLLBACK + 410（race condition：别人刚撤）
     UPDATE assets SET withdrawn_at=now() WHERE push_id=:id
   COMMIT
5. (best-effort) GitHub revert
   - 找该 push 的 assets 中 storage_backend='github' 的所有 path
   - Octokit: 创建一个新 commit 反向修改这些文件回到 push 之前的内容
     （或：用 'git revert <sha>' 模式，让 GitHub 自动处理；二选一，Codex 实操时择优）
   - commit message: 'revert: withdraw push <push_id> by <display_name>'
     若有 reason 则 append '(<reason>)'
   - 成功：写 pushes.github_revert_sha = <new_sha>
   - 失败（包括 conflict）：写 pushes.github_revert_failed=true,
     pushes.github_revert_error=<message>。不 throw，继续往下走。
6. (best-effort) R2 trash
   - 找该 push 的 assets 中 storage_backend='r2' 的所有 storage_ref
   - 对每个：S3 CopyObject 到 'trash/<storage_ref>'，然后 DeleteObject 原 ref
   - 成功统计：trash_objects_moved
   - 单个失败：log + 继续。返回前 trash_objects_moved 反映成功数。
7. 返回 200 + 完整结果
```

**幂等性**：同一 push id 二次调 withdraw → 410 ALREADY_WITHDRAWN。GitHub revert 步骤有副作用（产生新 commit），但因为 step 4 已经 atomic 把 push 标 withdrawn 了，二次调进不到 step 5。

### 4.4 修改：`GET /api/assets`

现有路由（spec §5.4）默认返回所有 status='pushed' 的 assets。改为：

```
query:
  ?episode_id=&type_code=
  ?include_withdrawn=false   // 新增；默认 false

行为：
  默认只返回 withdrawn_at IS NULL
  ?include_withdrawn=true → 返回所有（含 withdrawn_at != null 的）
  返回的每个 asset 增加 withdrawn_at 字段（null 或时间戳）
```

### 4.5 修改：`GET /api/assets/:id/content`

现有路由按 storage_backend 分派内容。改为：

```
新增前置校验：
  如果 asset.withdrawn_at IS NOT NULL：
    返回 410 GONE，body: { ok: false, error: { code: 'ASSET_WITHDRAWN',
                                                message: '该资产已撤回',
                                                details: { withdrawn_at, push_id } } }
    （admin 调用时若带 ?include_withdrawn=true 可以照常返回内容；其他用户拒绝）
```

### 4.6 修改：`POST /api/assets/push`（既有路由）

现有路由把 idempotency_key 写 push_idempotency 表 + assets 表。需要把 push 元数据**也**写一行 pushes：

```
原流程：写 GitHub → 写 R2 → 事务插 assets 行 + 写 push_idempotency
新流程：
  事务里同时 INSERT pushes 一行 (id, episode_id, idempotency_key,
       commit_message, github_commit_sha, pushed_by, asset_count, total_bytes)
  然后 INSERT 每条 asset 时附 push_id = pushes.id
```

idempotent replay（同 key 二次调）逻辑不变，仍返回上次的 assets 列表，pushes 表不重复 insert（unique constraint 兜底）。

---

## 5. 前端工作（Claude，本 spec 不展开）

后端落地后我会另起一份 UI plan 处理。简要范围：

- 剧集 dashboard 加"推送历史"入口（顶部 tab 或右上角图标）
- 推送历史路由：按时间倒序列表，每行显示 commit message 一行 + pushed_by + pushed_at + asset_count + total_bytes + 状态徽章（已生效 / 已撤回）
- 撤回按钮：仅 `is_withdrawable_by_me=true` 的行可见；点击二次确认弹窗（显示影响摘要：N 个文件 + 总容量 + GitHub commit SHA + R2 对象数），可填撤回原因
- 推送详情路由：列出该 push 的全部 assets，已撤回则全部置灰、不可预览（点击文件触发 410 提示）
- 撤回成功后 toast + 列表刷新
- 撤回 GitHub 失败的 push：列表行有橙色徽章 "GitHub 反向 commit 未生成"，hover 提示"请管理员手工处理"

---

## 6. 后端工作清单（Codex）

每个 task 单独 commit + push，commit message 用 `feat(p05b-N): <task name>`。

- [ ] **Task 1：Migration**
  - 文件：`backend/supabase/migrations/<timestamp>_pushes_and_withdraw.sql`
  - 内容：
    - 建 `pushes` 表（§3.1）+ 索引 + RLS（§3.3）
    - alter `assets` 加 `push_id` + `withdrawn_at` + 索引（§3.2）
    - 回填 SQL（§3.4）
  - 本地验证：`supabase db reset` → 确认表 / 字段 / 索引 / RLS 都对
  - 远程：你 stop 报告，由乐美林手工跑 SQL Editor（参考 P0.5-A 的 unblock 流程）

- [ ] **Task 2：改造 `POST /api/assets/push` 写入 pushes 行**
  - 文件：`backend/app/api/assets/push/route.ts`（按现有路径）
  - 在事务里同时 INSERT pushes
  - 每个 asset row 附 push_id
  - 单元测试：单次 push 后 pushes 表有一行、assets.push_id 都指向它；idempotent replay 二次调不重复 insert pushes

- [ ] **Task 3：路由 `GET /api/episodes/:id/pushes`**
  - 文件：`backend/app/api/episodes/[id]/pushes/route.ts`
  - 默认 include_withdrawn=true、分页 limit=50 cursor=base64(pushed_at)
  - 单元测试：返回排序正确；分页游标可往返；is_withdrawable_by_me 计算正确

- [ ] **Task 4：路由 `GET /api/pushes/:id`**
  - 文件：`backend/app/api/pushes/[id]/route.ts`
  - 返回 push + 关联 assets 列表
  - 单元测试：assets 全字段；不存在 → 404

- [ ] **Task 5：路由 `POST /api/pushes/:id/withdraw`**
  - 文件：`backend/app/api/pushes/[id]/withdraw/route.ts`
  - 严格按 §4.3 7 步执行顺序
  - 单元测试：原 pusher 撤回成功；非 pusher 非 admin 撤回 403；admin 撤回他人成功；二次撤回 410；不存在 404
  - 集成测试（可 mock GitHub / R2）：assert pushes.github_revert_sha 写入；R2 CopyObject + DeleteObject 各调用一次每个对象

- [ ] **Task 6：改造 `GET /api/assets` 加 include_withdrawn 过滤**
  - 文件：`backend/app/api/assets/route.ts`
  - 默认 `where withdrawn_at is null`
  - 加查询参数解析
  - 单元测试：默认排除 withdrawn；`?include_withdrawn=true` 包含

- [ ] **Task 7：改造 `GET /api/assets/:id/content` 拒绝 withdrawn**
  - 文件：`backend/app/api/assets/[id]/content/route.ts`
  - withdrawn 资产 → 410 ASSET_WITHDRAWN
  - admin 可以传 `?include_withdrawn=true` 照常拿
  - 单元测试：withdrawn → 410；admin override → 200；非 admin override → 仍 410

- [ ] **Task 8：错误码常量**
  - 加 `WITHDRAW_NOT_PERMITTED`、`ALREADY_WITHDRAWN`、`ASSET_WITHDRAWN`

- [ ] **Task 9：R2 lifecycle rule 配置（运维侧）**
  - 在 Cloudflare R2 Dashboard 配置：bucket `fableglitch-assets` 的 `trash/` 前缀 lifecycle rule = "delete after 30 days"
  - 由乐美林手工在 R2 控制台配（你给指引，不替他点）
  - 本 task 完成判定 = 你给乐美林一个 markdown 步骤清单 + 截图说明，他确认配完

- [ ] **Task 10：远程冒烟（人工验证）**
  - admin 账号登录
  - 用 admin 账号 push 一个新 batch（导入 1 docx + 1 png）
  - GET /api/episodes/:id/pushes 看到新增的 push 行
  - GET /api/pushes/:id 看到 assets 列表
  - POST /api/pushes/:id/withdraw 撤回，reason="冒烟测试"
  - 返回 200 + github_revert_sha 有值 + trash_objects_moved=1
  - GitHub 仓库看到 revert commit
  - R2 控制台看到原 prefix 没了、`trash/` 下有对应对象
  - GET /api/assets 默认调用看不到刚撤回的 assets
  - GET /api/assets?include_withdrawn=true 看到，含 withdrawn_at
  - GET /api/assets/:id/content 该 asset → 410
  - 二次 POST withdraw 同 push id → 410

每个 task 完成后单独 commit + push。Task 1 + 5 是核心，跑通这俩 spec 就能用。

---

## 7. 验收标准（P0.5-B 完成判定）

- [ ] migration 成功应用，`pushes` 表存在并被 RLS 保护
- [ ] 新 push 自动创建 pushes 行 + assets.push_id 链接
- [ ] 历史数据回填后所有现存 assets 都有 push_id
- [ ] `GET /api/episodes/:id/pushes` 返回排序、分页、is_withdrawable_by_me 都正确
- [ ] 原 pusher 撤回自己 push 成功 → 200
- [ ] 非 pusher 非 admin 撤回他人 push → 403
- [ ] admin 撤回任意人 push 成功 → 200
- [ ] 二次撤回同 push → 410
- [ ] 撤回后 GitHub 多一个 revert commit、SHA 写入 push 行
- [ ] 撤回后 R2 对象搬到 `trash/` 前缀
- [ ] 撤回后 `GET /api/assets` 默认看不到这些 assets
- [ ] 撤回后 `GET /api/assets/:id/content` 返回 410（admin override 例外）
- [ ] R2 lifecycle rule 已配置 `trash/` 30 天清理
- [ ] withdrawn_at 字段在 listing 响应里始终存在（null or timestamp）
- [ ] 撤回后该 final_filename 的命名空间释放，新 push 同名走 supersede 链不报冲突

---

## 8. 不做（明确排除）

- ❌ UI 反向"恢复已撤回 push"（forward-only，spec 不暴露 restore API）
- ❌ 撤回单个 asset（粒度只到 push batch；要撤一个就撤整个 batch、然后重 push 剩余）
- ❌ 撤回时间窗（无限制）
- ❌ R2 trash 的"立即清空"按钮（30 天 lifecycle 唯一路径）
- ❌ 撤回审批工作流（任意 pusher 自助 + admin 兜底，不需要审批）
- ❌ 撤回时通知其他协作者（P1 再考虑）
- ❌ 跨剧集 / 全局推送历史聚合（按 episode 维度查询；admin 全局看走 Supabase Studio）

---

## 9. 风险与对策

**风险 1：GitHub revert 在该 push 之后的 commit 改动相同文件时会 conflict。**
对策：spec §2 决策 6 已锁定为 best-effort —— 后端不强行解决，标记 `github_revert_failed=true` 并保存错误信息，前端给 admin 一个手工处理的提示。Supabase + R2 的撤回不被这影响。审计链不断（pushes.withdrawn_at 仍写入），这是产品上的"软撤回"成立的核心。

**风险 2：R2 CopyObject / DeleteObject 部分失败。**
对策：逐个对象 best-effort 处理，trash_objects_moved 反映实际成功数。失败的对象保留在原位置且 Supabase 已经标记为 withdrawn —— 前端不再 surface（GET /api/assets 默认排除）+ /content 走 410 —— 用户视角是"撤回了"，但 R2 物理对象仍在原位。日后 admin 可以通过 Supabase 找出 withdrawn 但没进 trash 的 assets 手工处理。可以 P1 加扫描脚本。

**风险 3：assets.push_id 回填脚本对老数据按 idempotency_key 分组，但有些 P0-B 早期 assets 可能没记 idempotency_key。**
对策：§3.4 回填脚本对缺 key 的 row 用 `'legacy-' || a.id::text` 填，保证唯一。代价是这些"孤儿"在 pushes 表里每行 = 1 push。乐美林可以接受（早期数据少、纯过渡需要）。

**风险 4：撤回的 push 内 assets 与新 push 的命名冲突。**
spec §2 决策 7 锁定为：撤回的 final_filename 命名空间释放给新 push 用，新 push 走 supersede 链递增 version。这意味着撤回的 v001 + 新推 → 新推得到 v002，不是回滚到 v001。这避免了"撤回再推得到同 version 号"的混乱。

**风险 5：撤回事务粒度。**
Step 4 是 Supabase 事务，原子。Step 5 / 6 是事后副作用，不参与事务。如果 Supabase 事务后服务器崩溃，前端会拿到 502，但数据上 push 已经被 marked withdrawn —— 这是 forward-only 的 invariant，符合预期。GitHub / R2 的副作用要么由后端定时重试（暂不实施），要么 admin 手工补。

---

## 10. 后续

本 spec 落地后，FableGlitch 具备完整的"推 → 看 → 撤"闭环。后续想做的方向：

- P0.5-C 用户体验润色：撤回时实时显示 R2 trash 操作进度、邮件 / Slack 通知协作者
- P1 自动孤儿扫描：定时任务识别"Supabase withdrawn 但 R2 仍在原 prefix"或"R2 trash 但 Supabase 没标 withdrawn"的不一致，写报警表
- P1 部分撤回：撤回 push 中的某个 asset 而非整个 batch（要重新设计权限和 GitHub revert 粒度）

不在本 spec 范围。
