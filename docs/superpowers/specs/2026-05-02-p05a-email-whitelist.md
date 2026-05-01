# FableGlitch P0.5-A 邮箱域名白名单 Spec 增量

> 日期：2026-05-02
> 范围：扩展 P0 基建中"@beva.com 硬域名白名单"的非协商约束，引入"管理员可登记其他域名"作为受控例外。
> 关系：本文是 `2026-04-23-fableglitch-p0-foundation-design.md` v2 §2 + §4.1 + §5.1 的局部 amendment，其它部分保持不动。
> 工作分工：后端 = Codex，前端（含管理员后台）+ 设计 = Claude。

---

## 1. 背景与目标

P0 spec §2 第一条非协商约束："邮箱必须以 `@beva.com` 结尾"。这条规则是为了把内部工具的初始信任边界框死在公司域名内，避免任意陌生人注册。

实际投产时遇到合理例外：外部协作者（外包配音 / 配乐 / 制作 / 临时合作的工作室）需要进系统协作，但他们没有 beva.com 邮箱。重新发 beva.com 邮箱给临时人员既不现实也不安全。

本增量在保留 beva.com 默认放行的前提下，给乐美林（管理员）一把"按域名开口子"的钥匙：登记一个外部域名后，该域名所有用户都可以正常注册、并享有与 beva.com 用户**同等权限**（不区分一等/二等账号）。

---

## 2. 已锁定的产品决策（不再讨论）

1. **粒度 = domain**。不支持单邮箱白名单。最小单位是一个完整二级域名（如 `somestudio.com`）。不支持通配符或子域。
2. **权限同等**。白名单注册的用户与 beva.com 用户一样，默认 `role = 'editor'`，能进项目树、能新建剧集、能 push、能预览所有人的资产。`users` 表**不**新增 `is_external` 字段，spec 上不区分两类用户。
3. **流程方案 = 管理员先登记，用户后注册**。用户拿一个未登记域名尝试注册时直接 `400`，不留 pending 队列、不做"注册即审批"。需要新成员就让他们联系管理员 → 管理员登记域名 → 用户去登记后再注册。
4. **审计保留**。所有添加 / 撤销动作都留痕。撤销不真删行，只软删（写 `revoked_*` 字段）。撤销过的同一域名可以重新登记。

---

## 3. 数据模型

### 3.1 新增表：`email_whitelist`

```sql
create table email_whitelist (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null,                                -- 全小写存储，如 'somestudio.com'
  reason      text,                                         -- 为什么加，可空
  added_by    uuid not null references users(id),
  added_at    timestamptz not null default now(),
  revoked_by  uuid references users(id),
  revoked_at  timestamptz,

  -- domain 必须形如 example.com / sub.example.co.uk，禁止前后导点 / 空格 / @
  constraint email_whitelist_domain_format
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),

  -- 同一域名同时只能有一条 active 记录；撤销后允许再加
  constraint email_whitelist_active_unique
    exclude (domain with =) where (revoked_at is null)
);

create index email_whitelist_active_idx
  on email_whitelist (domain) where revoked_at is null;
```

注：`exclude` 约束需要 `btree_gist` 扩展。如果项目上没启用，等价用法是 `unique` partial index：
```sql
create unique index email_whitelist_active_unique
  on email_whitelist (domain) where revoked_at is null;
```
Codex 选其一即可，不再讨论。

### 3.2 RLS 策略

```sql
alter table email_whitelist enable row level security;

-- 所有 admin 可读
create policy email_whitelist_admin_select
  on email_whitelist for select
  using (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'));

-- 所有 admin 可写（insert / update）；不允许 delete
create policy email_whitelist_admin_insert
  on email_whitelist for insert
  with check (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'));

create policy email_whitelist_admin_update
  on email_whitelist for update
  using (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'));
```

非 admin 用户对该表完全不可见。撤销走 `update` 而非 `delete`，在 API 层强制不暴露 hard delete。

### 3.3 `users` 表不变

不新增字段。白名单注册的用户在 `users` 表与内部员工无差异。

---

## 4. API 契约

所有路由前缀 `/api`。响应统一 `{ ok: true, data: T }` / `{ ok: false, error: { code, message, details? } }`。

### 4.1 修改：`POST /api/auth/signup`

现有规则（spec §5.1）："email 必须以 @beva.com 结尾，否则 400"。

**新规则**：
```
domain = email.split('@')[1].lower()

if domain == 'beva.com':
    pass
elif exists(email_whitelist where domain = $1 and revoked_at is null):
    pass
else:
    return 400 EMAIL_DOMAIN_NOT_ALLOWED
```

新增错误码：
```
400 EMAIL_DOMAIN_NOT_ALLOWED
    message: '该邮箱域名暂未开通注册，请联系管理员'
```

其它响应（201 / 409 / 429）保持不变。

### 4.2 新增：`POST /api/admin/whitelist` [Edge Runtime]

仅 `role = 'admin'` 可调。

```
body: {
  domain: string,         // 必填，前后空白会被 trim 后强制小写
  reason?: string         // 可选，最长 500
}

403  非 admin
400  domain 格式非法（不符合 §3.1 check 约束）
409  该 domain 已存在 active 白名单（DOMAIN_ALREADY_WHITELISTED）
201  {
  entry: {
    id, domain, reason,
    added_by_name,        // 关联 users.display_name
    added_at
  }
}
```

后端在 insert 之前先 `lower(trim(domain))` 标准化输入。

### 4.3 新增：`GET /api/admin/whitelist` [Edge Runtime]

仅 `role = 'admin'` 可调。

```
query:
  ?include_revoked=false  // 默认 false，仅返回 active；true 则返回所有历史

403  非 admin
200  {
  entries: [{
    id, domain, reason,
    added_by_name, added_at,
    revoked_by_name?,        // 仅 include_revoked=true 时可能出现
    revoked_at?
  }, ...],
  total: int
}
```

排序：active 在上、revoked 在下；同分组内按 `added_at desc`。

### 4.4 新增：`DELETE /api/admin/whitelist/:id` [Edge Runtime]

软删，不真删。仅 `role = 'admin'` 可调。

```
403  非 admin
404  id 不存在
410  已撤销（ALREADY_REVOKED）
200  { id, revoked_at, revoked_by_name }
```

后端动作：`update email_whitelist set revoked_by = auth_user_id, revoked_at = now() where id = :id and revoked_at is null`。如果 affected_rows = 0，根据 id 是否存在返回 404 或 410。

撤销后已注册的用户**保留登录能力**，不被清除。撤销只阻止该域名**新**用户注册。这是产品决策：撤销不溯及既往。

---

## 5. 前端工作（Claude，本 spec 不展开）

后端落地后我会另起一份 UI plan 处理：

- 登录 / 注册页：默认"前缀 + `@beva.com`"分段输入；用户键入 `@` 时自动切换为完整邮箱模式（兼容白名单域名用户）。
- "联系管理员开通"链接：弹一个迷你对话框列出 `users.role = 'admin'` 的人的 display_name + email，方便用户找人。
- 错误处理：注册收到 `EMAIL_DOMAIN_NOT_ALLOWED` 时 inline 显示 message + 重复上面那个"联系管理员"链接。
- 管理员后台 `/admin/whitelist`：列表（domain · 添加人 · 添加时间 · 撤销人 · 撤销时间 · 状态）+ 新增表单（domain + reason）+ 撤销按钮（二次确认）+ "包含已撤销"切换。
- 管理员入口：shell 顶部下拉菜单加"邮箱白名单管理"项，仅 admin 可见。

---

## 6. 后端工作清单（Codex）

- [ ] **Task 1：Migration**
  - 文件：`backend/supabase/migrations/<timestamp>_email_whitelist.sql`
  - 内容：建表 + 约束 + 索引 + RLS 策略（§3.1 + §3.2）
  - 本地 `supabase db reset` 或线上 push 后验证表结构

- [ ] **Task 2：路由 `POST /api/admin/whitelist`**
  - 文件：`backend/api/admin/whitelist/index.ts`（POST 在此文件，按 P0-A 既有 admin 路由组织风格）
  - 中间件：复用现有 `requireAdmin`（如果还没有，就照 spec §5.1 admin-only 路由风格新写一个）
  - 单元测试：合法 domain 创建成功；非法 domain 400；重复 active 409；非 admin 403

- [ ] **Task 3：路由 `GET /api/admin/whitelist`**
  - 同上文件
  - 测试：默认仅返回 active；`include_revoked=true` 返回全部；非 admin 403

- [ ] **Task 4：路由 `DELETE /api/admin/whitelist/:id`**
  - 文件：`backend/api/admin/whitelist/[id].ts`
  - 测试：active → 撤销成功；已撤销 → 410；不存在 → 404；非 admin → 403

- [ ] **Task 5：改造 `POST /api/auth/signup`**
  - 文件：`backend/api/auth/signup.ts`（按现有路径）
  - 现有 `@beva.com` 后缀校验改为 §4.1 三段逻辑
  - 测试：beva.com 通过；登记的白名单域名通过；未登记域名 400 EMAIL_DOMAIN_NOT_ALLOWED；撤销后的域名 400

- [ ] **Task 6：错误码常量**
  - 在错误码常量表加 `EMAIL_DOMAIN_NOT_ALLOWED`、`DOMAIN_ALREADY_WHITELISTED`、`ALREADY_REVOKED`

- [ ] **Task 7：远程冒烟（人工验证）**
  - 用 admin 账号 POST /api/admin/whitelist {domain: 'test-vendor.com'}
  - 用 `someone@test-vendor.com` 注册成功
  - DELETE 撤销该 domain
  - 用 `another@test-vendor.com` 注册被拒（400 EMAIL_DOMAIN_NOT_ALLOWED）
  - 已注册的 `someone@test-vendor.com` 仍可正常登录
  - GET include_revoked=true 看到撤销历史

每个 task 单独 commit + push。

---

## 7. 验收标准（P0.5-A 完成判定）

- [ ] admin 添加域名 `'test.com'` 后，`<x>@test.com` 可注册（201）
- [ ] 撤销 `'test.com'` 后，新邮箱 `<y>@test.com` 注册被拒（400 EMAIL_DOMAIN_NOT_ALLOWED）
- [ ] 撤销前已注册的 `<x>@test.com` 撤销后仍可登录
- [ ] 非 admin 调用 `/api/admin/whitelist` 任意动词返回 403
- [ ] `BeVa.com` / `BEVA.COM` 等大小写变体注册时按 `beva.com` 处理（命中默认放行）
- [ ] `' beva.com '` 前后带空格的输入被 trim 后正确命中
- [ ] 重复添加同一 active 域名返回 409 DOMAIN_ALREADY_WHITELISTED
- [ ] 撤销后的同一域名可以重新添加（201）
- [ ] `email_whitelist` 表对 non-admin 用户在 Supabase Studio / RLS 下完全不可见
- [ ] `GET /api/admin/whitelist?include_revoked=true` 能看到所有历史；默认调用只看到 active

---

## 8. 不做（明确排除）

- 单邮箱白名单粒度（最小到 domain）
- pending 注册队列（不允许"先注册等审批"）
- 通配符或子域规则（`*.somestudio.com` 不支持，每个二级域单独登记）
- 域名 TTL 自动过期（手工撤销，不做时间触发）
- 邮件通知（添加 / 撤销不发邮件给被影响用户）—— P1 再考虑
- 跨 admin 的撤销审批工作流（任一 admin 都可独立操作）—— 30 人内部，不上 SoD

---

## 9. 风险与对策

**风险 1：admin 误加恶意域名（如 `gmail.com`），导致任意陌生人注册。**
对策：UI 上"添加"做二次确认弹窗，列出"该域名命中后，所有 `*@<domain>` 用户都能注册并取得编辑权"——文案上把后果写明白；技术上不再加门槛（admin 是受信角色）。

**风险 2：撤销已用域名后，对应用户被锁出。**
对策（已采纳）：撤销不溯及既往，已注册用户保留登录与权限。撤销只阻止新注册。如果将来需要"撤销 + 同时禁用已注册用户"，那是 P1 的"账号停用" feature，不在本 spec 范围。

**风险 3：白名单泄漏给非 admin 看到。**
对策：RLS 策略 §3.2 在数据库层保证只有 admin 能 select；API 层再加一道 `requireAdmin` 中间件做双保险。

---

## 10. 后续

本 spec 落地后，FableGlitch 的注册门槛从"硬域名"升级为"硬域名 + 受控白名单"。后续 P0.5-B（推送历史与回滚）会继续在这个权限模型上扩展。

未来如需把粒度细化到单邮箱、加入 pending 审批流、或开放跨域名子域名规则，都属于另起 spec 的 amendment，不要塞回本文件。
