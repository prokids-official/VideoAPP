# FableGlitch P1.1 芝兰点子王 Spec 增量

> 日期：2026-05-02
> 范围：在 P1.0 主页基础上引入"团队想法墙"——任意员工可发布视频创作想法，admin 能聚合、打标签、推进状态。
> 关系：本文是 P1.0 主页 spec 的功能补充，依赖 `2026-05-02-p10-homepage-sandbox.md` 已落地。
> 工作分工：后端 = Codex，前端 + 设计 = Claude。

---

## 1. 背景与目标

视频内容创作的内核是"想法 → 落地"。P0/P0.5 解决了"落地"（剧本 / 资产管理 / 入库审计），但"想法"环节是空白：

- 同事日常脑暴的灵感分散在微信、笔记、聊天里，最终大部分丢失
- 乐美林想做新选题但不知道大家平时在想什么
- 没有跨部门触达机制（设计师 / 配音员 / 制片同事彼此看不到对方的灵感）

**芝兰点子王**是轻量级团队 idea collection。任意人能发布"想做什么样的视频"想法，admin 看到全部、聚合、打标签、决定哪些进 backlog。**未来（P3）会接入 agent 自动检索抖音 / B 站参考视频、图文资料**——本 spec 不实现，但数据模型预留口子。

---

## 2. 已锁定的产品决策

1. **任意登录用户可发布 idea**。无 quota，不限频次（P2 再加防滥用）。
2. **任意登录用户可看所有 ideas**（30 人内部全员可见）。**不**做"私人草稿"模式。
3. **删除 idea = soft delete**（保留审计行）。**仅作者本人 + admin** 可删；其他人调返回 403。
4. **状态扭转 + 打标签 = 仅 admin**。普通用户只能改自己 idea 的 title / description。
5. **不做评论 / 点赞 / 投票 / @ 通知**。避免社交媒体化稀释 signal-to-noise。如果以后想加，作为 P2+ 单独 spec。
6. **status 是 4 态固定值**：`pending`（默认）/ `accepted`（采纳，进 backlog）/ `rejected`（不做）/ `shipped`（已落地）。
7. **agent 自动搜参考资料 = P3**，不在 P1.1。但表结构 `idea_references` 预留好。
8. **快速发布入口在 `<TitleBar />`**（💡 小图标），任意页都能 quick add，不必先回主页。

---

## 3. 数据模型

### 3.1 新增表 `ideas`

```sql
create table ideas (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references users(id) on delete restrict,

  title           text not null check (length(title) between 1 and 120),
  description     text not null check (length(description) between 1 and 4000),

  status          text not null default 'pending'
                    check (status in ('pending','accepted','rejected','shipped')),
  tags            text[] not null default '{}',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  deleted_at      timestamptz,
  deleted_by      uuid references users(id),

  -- admin 改 status / tags 时记录
  status_changed_at  timestamptz,
  status_changed_by  uuid references users(id)
);

create index ideas_recent_idx
  on ideas (created_at desc) where deleted_at is null;
create index ideas_status_idx
  on ideas (status, created_at desc) where deleted_at is null;
create index ideas_author_idx
  on ideas (author_id, created_at desc) where deleted_at is null;
```

### 3.2 新增表 `idea_references`（P3 预留，P1.1 不实际使用）

```sql
create table idea_references (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas(id) on delete cascade,
  source      text not null check (source in ('douyin','bilibili','youtube','article','other')),
  url         text not null,
  title       text,
  thumbnail_url text,
  added_by    text not null check (added_by in ('user','agent')),
  added_at    timestamptz not null default now()
);

create index idea_references_by_idea on idea_references (idea_id);
```

P1.1 期间这张表是空的。P3 agent 集成时才会写入。Codex 在 P1.1 阶段建表 + 加 RLS（仅登录用户可读）即可，不实现写入。

### 3.3 RLS 策略

```sql
alter table ideas enable row level security;
alter table idea_references enable row level security;

-- 任意登录用户可读 active ideas
create policy ideas_read_all on ideas for select
  using (auth.uid() is not null and deleted_at is null);

-- 仅作者可 insert（API 层强制 author_id = auth.uid()）
create policy ideas_insert_own on ideas for insert
  with check (auth.uid() = author_id);

-- update / delete 由 API 层做权限校验，policy 允许 owner + admin
create policy ideas_update_own_or_admin on ideas for update
  using (
    auth.uid() = author_id
    or exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

-- 任意登录用户可读 references
create policy refs_read_all on idea_references for select
  using (auth.uid() is not null);
```

---

## 4. API 契约

所有路由前缀 `/api/ideas`。统一信封 `{ ok, data }` / `{ ok, error }`。

### 4.1 `POST /api/ideas` [Edge Runtime]

任意登录用户可调。

```
body: {
  title: string,           // 1-120
  description: string,     // 1-4000
  tags?: string[]          // 默认 []，仅 admin 可设；非 admin 传忽略
}

400  IDEA_INVALID_TITLE / IDEA_INVALID_DESCRIPTION
401  未登录
201  {
  idea: {
    id, author_id, author_name, title, description,
    status, tags, created_at, updated_at
  }
}
```

### 4.2 `GET /api/ideas` [Edge Runtime]

```
query:
  ?status=pending|accepted|rejected|shipped       （可选过滤）
  ?author_id=<uuid>                                （可选过滤；e.g. ?author_id=me 表示当前用户）
  ?tag=<string>                                    （可选过滤）
  ?limit=20    （默认 20，最大 100）
  ?cursor=<base64-encoded-created_at>

200  {
  ideas: [{
    id, author_id, author_name, title, description,
    status, tags, created_at,
    is_editable_by_me: boolean      // = (auth.uid==author_id) || admin
  }, ...],
  total: int,
  next_cursor: string | null
}
```

排序：`created_at desc`。

### 4.3 `GET /api/ideas/:id` [Edge Runtime]

```
404  不存在或已删除
410  已删除（如果想区分；可合并到 404）
200  {
  idea: { ...4.1 字段..., status_changed_at?, status_changed_by_name? },
  references: [{ id, source, url, title, thumbnail_url, added_by, added_at }, ...]
}
```

### 4.4 `PATCH /api/ideas/:id` [Edge Runtime]

```
body 任选:
  title?, description?       （仅作者 + admin）
  status?, tags?             （仅 admin）

403  IDEA_NOT_PERMITTED  （试图改自己无权限的字段）
404  不存在
200  { idea: {...} }

副作用：
  - 改 status 时写 status_changed_at = now() / status_changed_by = auth.uid()
  - 任意改动写 updated_at = now()
```

### 4.5 `DELETE /api/ideas/:id` [Edge Runtime]

soft delete。仅作者本人 + admin 可调。

```
403  IDEA_NOT_PERMITTED
404  不存在
410  已删除
200  { id, deleted_at }
```

### 4.6 错误码常量

新增：`IDEA_INVALID_TITLE`、`IDEA_INVALID_DESCRIPTION`、`IDEA_NOT_PERMITTED`。

---

## 5. 前端工作（Claude）

### 5.1 `IdeasRoute.tsx`（新，替换 P1.0 占位）

路由 `/ideas`。布局：

```
[TitleBar · brand · 芝兰点子王]
─────────────────────────────────────────────────────────────
[全部 24] [pending 12] [accepted 6] [shipped 4] [rejected 2]    [+ 新想法]
─────────────────────────────────────────────────────────────
[只看我的]  [团队全部]
─────────────────────────────────────────────────────────────

┌─ idea card ────────────────────────────┐
│ 想做一个跟 AI 聊天的童话剧             │
│ description 一行 / 两行截断…           │
│ 由 张三 · 2 小时前 · pending           │
│ #剧本想法 #互动                        │
│ (hover: 编辑 / 删除)                    │
└────────────────────────────────────────┘

(grid 2-3 列 自适应)

底部：[加载更多]
```

筛选交互：
- 顶部状态 chip 行筛选 status
- 下面"只看我的 / 团队全部" tab 切换
- 点 chip 高亮 + URL search params 同步（便于刷新保留）

### 5.2 `IdeaDetail` 模态

点 idea 卡进入大模态：
- 完整 description（markdown 支持？P1.1 先用纯文本，P2 再加 markdown）
- 状态 + 标签 pill
- 编辑模式（仅 `is_editable_by_me=true` 显示编辑按钮）
- 底部 references 区（P1.1 显示空状态："P3 agent 集成后这里展示参考视频"）
- admin 看到额外的"改状态 / 改 tags"控件

### 5.3 `NewIdeaDialog`

简单模态：title input + description textarea + 提交 / 取消。
admin 还能在创建时直接打 tag。

### 5.4 顶导快速入口

`TitleBar` 加一颗 💡 小按钮（介于 traffic lights 和 brand 之间，或 brand 右侧），点击打开 `NewIdeaDialog`。任何页（`/home`、`/tree`、`/sandbox`、`/ideas` 自身、`/episode/:id/...`）都能用。

---

## 6. 后端工作清单（Codex）

每 task 单独 commit + push，message 用 `feat/test(p11-N): <task name>`。

- [ ] **Task 1：Migration**
  - 文件：`backend/supabase/migrations/<timestamp>_ideas.sql`
  - 内容：建 `ideas` + `idea_references` 表 + 索引 + RLS（§3）
  - 本地验证（如 Docker 不可用，按 P0.5 流程让乐美林手工 SQL Editor 跑）
  - commit: `feat(p11-1): ideas board migration`

- [ ] **Task 2：路由 POST /api/ideas**
  - 文件：`backend/app/api/ideas/route.ts`（POST）
  - 单测：合法创建、title 超长 400、非 admin 传 tags 被静默忽略
  - commit: `feat(p11-2): create idea route`

- [ ] **Task 3：路由 GET /api/ideas**
  - 同文件（GET handler）
  - 单测：分页、过滤、`is_editable_by_me` 计算正确、排序倒序
  - commit: `feat(p11-3): list ideas route`

- [ ] **Task 4：路由 GET /api/ideas/:id**
  - 文件：`backend/app/api/ideas/[id]/route.ts`（GET）
  - 单测：含 references 关联、404、410
  - commit: `feat(p11-4): idea detail route`

- [ ] **Task 5：路由 PATCH /api/ideas/:id**
  - 同文件（PATCH handler）
  - 单测：作者改 title 成功、非作者改 title 403、admin 改 status 成功、非 admin 改 status 403
  - commit: `feat(p11-5): update idea route`

- [ ] **Task 6：路由 DELETE /api/ideas/:id**
  - 同文件（DELETE handler）
  - 单测：作者删自己成功、admin 删任意成功、其他人删 403、二次删 410
  - commit: `feat(p11-6): soft delete idea route`

- [ ] **Task 7：错误码常量**
  - shared/types.ts 加 `IDEA_INVALID_TITLE`、`IDEA_INVALID_DESCRIPTION`、`IDEA_NOT_PERMITTED`
  - commit: `feat(p11-7): idea error codes`

- [ ] **Task 8：远程冒烟**（人工）
  - admin 登录 → POST 创建 idea → GET list 能看到 → admin 改 status → 非 admin 改 status 403 → 作者删 → list 默认看不到
  - 完成后报告

预期工作量 4-5 小时。

---

## 7. 验收标准

- [ ] migration 应用云端 Supabase 后表结构 / RLS 正确
- [ ] 任意登录用户可创建 idea
- [ ] GET /api/ideas 返回排序、分页、`is_editable_by_me` 计算正确
- [ ] 作者 PATCH 自己的 title/description 成功
- [ ] 非作者 PATCH 别人的 idea → 403
- [ ] 非 admin PATCH status / tags → 403
- [ ] admin PATCH status 后 `status_changed_at` / `status_changed_by` 写入
- [ ] 作者 DELETE 自己 idea → soft delete，list 不再返回
- [ ] admin DELETE 他人 idea 成功
- [ ] 其他人 DELETE 别人 → 403；二次 DELETE → 410
- [ ] `idea_references` 表存在且 RLS 启用（即便 P1.1 期间是空的）
- [ ] /ideas 路由前端 list / detail / new dialog 全部工作
- [ ] TitleBar 💡 quick add 按钮在任意路由可用

---

## 8. 不做（明确排除）

- ❌ 评论 / 点赞 / 投票 / @ 通知（决策 5 锁定，避免社交化）
- ❌ 私人草稿（决策 2，全员可见）
- ❌ Markdown / 富文本 description（P1.1 纯文本；P2 再加）
- ❌ 自动 agent 检索参考视频（P3）
- ❌ Idea 关联到 episode / project（决策没说要做；P2 再考虑"把 idea 转换成项目"流程）
- ❌ Idea 导出 / 报表（admin 想统计走 Supabase Studio）

---

## 9. 风险与对策

**风险 1：admin 是单人，长期看不过来 N 个 idea，状态会一直 pending。**
对策：本 spec 不解决 admin 处理速度问题，那是组织层面的事。但前端 list 可以默认按 `pending` + `created_at desc` 排，让最新的 pending 优先被看到。admin 改完 status 该 idea 自然从 pending 滚出。

**风险 2：恶意员工大量灌水（spam）。**
对策：30 人内部 + 实名制（绑 @beva.com 邮箱），社会规范本身就够。如果真出现，admin 用 DELETE 软删 + 走人事流程。**P2 再加 rate limit / 屏蔽机制**。

**风险 3：description 长文本上限 4000 字符可能被吐槽不够。**
对策：4000 中文字 ≈ 1000 英文 word，对"灵感卡片"已经够。真要写长文（编剧大纲 / 故事板）应该用项目里的 SCRIPT 板块，不该塞 idea 里。文案上提示用户"想法是种子，长文写到项目里"。

**风险 4：`tags` 是 text[]，没枚举约束 → 标签会发散。**
对策：admin 自由打 tag。如果发散到难管理（>30 个不同 tag），P2 加一张 `idea_tags` 字典表 + 加约束。P1.1 暂不做。

---

## 10. 后续

- **P2** idea 富文本 + comment + spam 防护
- **P2** 把 idea "promote" 成项目（流程草图：admin 看到一个 accepted idea → 一键创建对应剧集骨架，预填 idea title 为 episode_name_cn）
- **P3** agent 集成：每次 POST /api/ideas 触发后台 agent 调用 → 抖音 / B 站搜参考视频 → 写入 `idea_references` → 前端 detail 模态显示
