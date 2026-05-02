# FableGlitch P1.0 主页 + 个人沙盒 Spec 增量

> 日期：2026-05-02
> 范围：把登录后默认落地从"项目树"改为"主页"，并新增"个人沙盒"作为不与公司资产库挂钩的轻量创作空间。
> 关系：`2026-04-23-fableglitch-p0-foundation-design.md` v2 §6.1 + §3.2 的局部 amendment。
> 工作分工：后端 = Codex（轻量），前端 + 设计 = Claude（重头）。

---

## 1. 背景与目标

P0/P0.5 完成后，新登录用户被强制进入"公司项目树 → 加入已有 / 创建新"二选一。但实际上：

- 公司 30 人里只有 5-8 人是 AI 漫剧核心成员
- 其它 20+ 人想试用工具（生图、生剧本、记想法），被项目结构强制
- "创建新项目"立即在 GitHub `ProKids-digital/asset-library` 建文件夹 + 写元数据，**污染公司资产审计链**

P1.0 把工具从"单团队资产管理器"扩展为"任意员工可用的创作空间"：

1. **主页**（HomeRoute）作为登录后默认落地，多个入口可选
2. **个人沙盒**（SandboxRoute）作为不写任何后端的 ephemeral 创作空间
3. **公司项目流程**保留不变（既有 P0 流程从主页"公司项目"卡进入）

---

## 2. 已锁定的产品决策

下面这些是 Claude 写本 spec 时按 30 人内部工具默认锁定的取舍。乐美林如有不同看法**在 Codex / Claude 开工前**告知改 spec，否则按此实施。

1. **登录后默认落地 = `/home`，不是 `/tree`**。`ShellEmptyRoute` 退役（被 `HomeRoute` 替代）。`TreeRoute` 保留用于项目工作。
2. **个人沙盒完全 ephemeral**。**不写**任何后端持久化：
   - 不创建 Supabase 行（除了 `usage_logs` —— P1.2 引入 AI 调用时才有这个）
   - 不写 R2
   - 不写 GitHub
   - 刷新页面 = state 全丢，符合 "playground" 语义
3. **沙盒"提升到项目"** = 用户自己 download AI 生成物到本地 → 进入公司项目走 P0-D 既有 import 流程。**不做**自动 promote API。
4. **芝兰点子王（P1.1）的入口 button 在主页**。P1.0 里 button 占位指向 `/ideas`，路由渲染"P1.1 上线后启用"占位页；P1.1 spec 落地后激活实际功能。
5. **AI 工具入口**在主页存在但 P1.0 **不**含 AI 集成。Button 显示"敬请期待 · P1.2"灰态，点击 toast 提示。
6. **没有新数据表**。"最近工作"用现有 `episodes` 查；不引入新 schema。
7. **沙盒不消耗 quota**。P1.0 没 AI 调用 = 没 quota 问题；P1.2 加 AI 时再设计 quota 路径。

---

## 3. 数据模型

无新表、无新字段。

---

## 4. API 契约

### 4.1 新增：`GET /api/episodes/recent` [Edge Runtime]

任意登录用户可调。返回 user 有访问权的最近 N 个 episodes，按 `updated_at` 倒序。

```
query:
  ?limit=5    （默认 5，最大 20）

401  未登录
200  {
  episodes: [{
    id, name_cn, episode_path, status, updated_at,
    series_name_cn, album_name_cn, content_name_cn,    // 用于显示完整路径
    asset_count_pushed: int                              // 已入库资产计数
  }, ...]
}
```

实现：`SELECT episodes.*, series.name_cn AS series_name_cn, ... FROM episodes JOIN contents ON ... WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`

P0 全员可见的访问模型保留；P1+ 加细粒度时此路由也得过滤。

---

## 5. 前端工作（Claude）

### 5.1 `HomeRoute.tsx`（新）

路由 `/home`。布局结构：

```
[TitleBar · brand · 主页]
─────────────────────────────────────────────────
                  欢迎回来，{display_name}

[继续我的工作]                       [全部项目 →]
┌─ episode card ─┬─ episode card ─┬─ ─ ─┐
│ 童话剧 / 格林  │ 童话剧 / 格林  │     │
│ 侏儒怪 第一集  │ 白雪公主 第二集 │     │
│ 12 入库 · 2h前 │ 8 入库 · 1d前  │     │
└────────────────┴────────────────┴─────┘
（无 recents 时显示空状态："这是你第一次使用 FableGlitch · 选一个入口开始"）

[创作空间]
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ 📚 公司项目  │ ✨ 个人沙盒  │ 💡 芝兰点子王│ 🎨 AI 工具    │
│ 团队的产出   │ 私人创作空间 │ 想法墙       │ 敬请期待·P1.2 │
│ 已入库的内容 │ 不与公司同步 │ 团队脑暴     │ (灰态)       │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

四张创作空间卡片：
- 📚 公司项目 → `/tree`（既有 TreeRoute）
- ✨ 个人沙盒 → `/sandbox`（5.2）
- 💡 芝兰点子王 → `/ideas`（5.4 占位 / P1.1 落地后激活）
- 🎨 AI 工具 → 灰态卡片，hover 显示"敬请期待 · P1.2"，click 不跳转 + toast

视觉系统沿用原 Glitchcore（仿 `tree.html` 的 tile grid 风格）。

### 5.2 `SandboxRoute.tsx`（新）

路由 `/sandbox`。极简占位（P1.2 加 AI 后这里会大改）：

```
[TitleBar · brand · 个人沙盒]
─────────────────────────────────────────────────
                  ✨
                  个人沙盒
                  这里是只属于你的创作空间。
                  P1.2 上线后你能在这里调用 AI 生图、生剧本，
                  做出的内容**不会同步到公司资产库**——刷新或关闭后清空，
                  想保留就下载到电脑。

                  [创作空间敬请期待 · P1.2]   [回主页]
```

布局：560px 居中，padding 64px。预留 `<SandboxToolGrid />` 的 slot 给 P1.2 嵌入 AI 工具面板。

### 5.3 路由改造

`src/App.tsx`：
- 登录成功后默认 `navigate('/home')`，不再走 `hasProjects` 判断
- 新路由：`/home` → `HomeRoute`、`/sandbox` → `SandboxRoute`、`/ideas` → `IdeasPlaceholderRoute`（P1.1 落地后替换）
- `/tree` 保持不变，从主页"公司项目"卡跳进
- 删除 `ShellEmptyRoute`（用 `HomeRoute` 的空状态替代）+ 删除其 import

### 5.4 `IdeasPlaceholderRoute.tsx`（新，临时）

```
[TitleBar · brand · 芝兰点子王]
─────────────────────────────────────────────────
                  💡
                  芝兰点子王
                  团队想法墙正在建设中。
                  P1.1 上线后这里能写 / 看 / 点赞 大家的视频想法。
                  
                  [回主页]
```

P1.1 spec 落地后整体替换为真正的 `IdeasRoute.tsx`。

### 5.5 顶导 subtitle

`<TitleBar subtitle="主页" />` / `<TitleBar subtitle="个人沙盒" />` / `<TitleBar subtitle="侏儒怪 第一集" />` 等。`TitleBar` 已经预留 `subtitle` prop（窗口顶栏改造时落地的）；路由层各 Route 传入。

---

## 6. 后端工作清单（Codex）

每个 task 单独 commit + push，commit message 用 `feat/test(p10-N): <task name>`。

- [ ] **Task 1：路由 `GET /api/episodes/recent`**
  - 文件：`backend/app/api/episodes/recent/route.ts`
  - 实现 §4.1，含 limit clamp、JOIN series/album/content、`asset_count_pushed` 子查询
  - 单测覆盖：默认 limit=5、limit clamp 到 20、空结果、未登录 401、按 updated_at 倒序
  - commit: `feat(p10-1): recent episodes route`

- [ ] **Task 2：远程冒烟**（手动验证）
  - admin 登录，调 GET /api/episodes/recent，确认返回结构 + 排序正确
  - 完成后报告，不需要单独 commit

预期工作量：1.5-2 小时。

---

## 7. 验收标准

- [ ] 登录成功后落地到 `/home`，不是 `/tree`
- [ ] `/home` 显示用户最近 5 个剧集（或空状态）
- [ ] 4 个入口卡片可点击：公司项目 → /tree、个人沙盒 → /sandbox、芝兰点子王 → /ideas（占位）、AI 工具 → 灰态 + toast
- [ ] `/sandbox` 显示占位 UI，"回主页"按钮工作
- [ ] 刷新 `/sandbox` 不丢失任何"持久化数据"（因为本来就没有）
- [ ] `/ideas` 显示占位"P1.1 上线后启用"
- [ ] 顶导 `subtitle` 在不同路由下正确显示
- [ ] `ShellEmptyRoute` 文件已删除，App.tsx 不再 import 它

---

## 8. 不做（明确排除）

- ❌ AI 工具实际集成（P1.2）
- ❌ 沙盒持久化（决策 2 锁定，纯客户端）
- ❌ Promote to company project API（决策 3）
- ❌ 项目细粒度访问控制（P0 全员可见模型保留）
- ❌ 主页 widget 自定义 / 拖拽（P1.3+）
- ❌ 通知中心 / 公告（P2+）
- ❌ 多个 admin 共享配额（quota 是 P1.2 引入时再考虑）

---

## 9. 风险与对策

**风险 1：用户期待沙盒能保存内容。**
对策：UI 文案明确"刷新会清空"+"想保留就下载"。决策 2 锁定 ephemeral 是产品意图，不是技术限制。如反馈强烈再考虑给沙盒加可选的 IndexedDB 持久化（仍不上 R2/GitHub），那是 P1.3 的事。

**风险 2：HomeRoute 替代 ShellEmptyRoute 的迁移成本。**
对策：ShellEmptyRoute 当前主要功能是"邀请你创建第一个剧集"。把这个 CTA 移到 HomeRoute 的"公司项目"卡片即可。删除 + 替换 = ~30 行变更。

**风险 3：`/api/episodes/recent` 在团队规模扩到 100+ 时性能。**
对策：30 人内部 episodes 总数约 100-300 条，`order by updated_at desc limit 5` 加 partial index 即可。Codex 在 Task 1 实现时确认有 `episodes(updated_at desc)` 索引。

---

## 10. 后续

- **P1.1** 芝兰点子王（紧接本 spec）
- **P1.2** AI 工具集成（沙盒里的实际生图 / 生剧本，含 quota 框架）
- **P1.3** 主页 widget 化（让用户自己组合主页内容）
