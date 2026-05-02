# FableGlitch Mockup Critique · 2026-05-02

> 范围：`docs/design/mockups/` 下 6 个 .html mockup（design-version 1）
> 前提：保留主视觉系统（Glitchcore · 紫粉渐变 · 深色底 · emoji icon），不做整体替换
> 目标：定位让用户觉得"可视化不太清晰"的具体细节，给出 surgical fix 清单
>
> **每条 issue 的格式**：严重度（H/M/L）· 描述 · 建议 · 改动量（min）
> **行动**：你看完勾选下方 ✅ / ❌，我按勾选项执行；不勾的全部不动

---

## 0. 跨页面共性诊断（先看这条）

读完 6 个 mockup 之后，我认为"觉得不清晰"的根因不是色彩或布局，而是**三个习惯性过度装饰**累积起来让信息被稀释了：

### 问题 A · Mono 字体用得过泛（H · 跨 6 页）

INDEX.md 自己写的"mono 用法"是：文件名 / 路径 / 时间戳 / 邮箱 / 版本号 / 容量 / commit。

实际 mockup 里 mono 还出现在：tagline、双语注释、整数计数（"12"、"3 项"）、状态描述（"drafting"、"暂无剧集"）、help 提示（"enter ↵ 创建"）、foot footer 文字、breadcrumbs、sub line 全文。

**为什么这是问题**：mono 字体在视觉上"指认"为代码 / 机器字符串，用户大脑会无意识地停下来辨认 → 当它实际只是装饰时，用户的认知带宽被浪费。这是为什么"看起来是设计感很强但用起来不清晰"的核心原因。

**建议**：把 mono 用法严格收回 INDEX.md 自己定的 7 类（filename / path / timestamp / email / version / bytes / commit）。其它一律普通 sans。

**改动量**：跨 6 页大约 25-30 处 class 替换，约 60-90 分钟。

### 问题 B · 中英双语装饰串（H · 跨 4 页）

mockup 里大量出现"中文 · // English"模式：
- shell.html · "looks like it's your first time here · 看起来是你第一次使用"
- shell.html sidebar · "暂无剧集 // no episodes yet"
- episode-wizard.html · "// 你的剧集路径将是"、"step 4 of 4 · final"
- first-run-modal.html · "// 加入已有的剧集"、"// 4 步骨架向导"

**为什么这是问题**：英文部分是"designer 自言自语"，对中国 30 人内部团队的用户没有任何信息增益 —— 用户的母语是中文，他们看完中文就够了。英文只是占视觉空间。`//` 注释符更糟，它把"代码注释"语义注入到产品文案里，用户每次扫到都得短暂判断"这是不是要我去看代码"。

**建议**：双语全部砍英文。`//` 注释符全删（包括它前后的英文字符串）。kicker / help 文字简化为纯中文。

**改动量**：跨 4 页约 10-12 处文案删除，约 20-30 分钟。

### 问题 C · h1 40px 在桌面工具语境下偏大（M · 跨 3 页）

tree.html / push-review.html / shell.html 的 h1 都是 40px。

**为什么这是问题**：40px h1 适合 marketing 落地页 / app 启动 splash —— "我希望你 wow 一下"。这是个内部生产力工具，用户每天看这个页面 5-10 次，40px 大字每次都"占满屏中心"，长期使用会觉得"喧宾夺主"。Apple 自家的工具类应用（Things 3、Linear、Notion）h1 普遍在 28-32px 区间。Notion 的页面标题就是 32px。

**建议**：所有 h1 从 40px 降到 32px。tree.html / push-review.html 还有 880px 内容区，32px 已经是足够主导的视觉锚点。

**改动量**：3 处 CSS 改动，5 分钟。

---

## 1. login.html

### 强项
- 480px 居中卡片，padding 层次合理
- 单 CTA + 单渐变 logo + tagline 信息层级清楚
- password 显示 / 隐藏切换符合规范

### Issues

| 严重度 | 描述 | 建议 | 改动量 |
|---|---|---|---|
| L | tagline "菲博幻境工作室·内部资产管理" 是 mono | 改 sans | 1 min |
| L | "@beva.com 内部邮箱" hint 是 mono（不是机器字符串） | 改 sans | 1 min |
| L | 卡片内还显示一行 v0.1.0 build 时间戳 | 移到外层底部（屏幕底而非卡片底） | 3 min |

⚠️ 注：登录页 A/B 改动（前缀输入 + 联系管理员）已经在 Task 7 落地，**这里 issue 是针对原 mockup 的**。落地的 React 组件如果有同样问题应一并修。

**勾选**：
- [ ] 修 login.html mockup（让 mockup 跟新组件保持一致）
- [ ] 修 LoginRoute.tsx 里残留的 mono hint（如果存在）
- [ ] 不动

---

## 2. shell.html · 空状态主框架

### 强项
- 顶导 + 侧栏 + 中央欢迎卡 三段式结构清晰
- 底部柔和 radial glow 不抢戏
- 两个 CTA（次要 + 主要）层级正确

### Issues

| 严重度 | 描述 | 建议 | 改动量 |
|---|---|---|---|
| M | h1 40px "欢迎来到 FableGlitch" 在 560px 卡片里偏大 | 改 32px | 1 min |
| M | sub line "looks like it's your first time here · 看起来是你第一次使用" 双语 mono | 删英文 + 改 sans，留 "看起来是你第一次使用" | 2 min |
| M | sidebar "暂无剧集 // no episodes yet" 双语 mono | 删 `// no episodes yet` 那行，留 "暂无剧集" 一行普通文字 | 2 min |
| L | topnav "FableGlitch" brand 用渐变填字 | 保留 / 或改为左边一颗紫色小方块 + 普通字 logo（参考新 TitleBar） | 5 min |
| L | "新建我的第一个剧集" CTA 字 "＋" 是全角加号 | 用真"+"或图标 | 1 min |

**勾选**：
- [ ] 全部 5 项一起改
- [ ] 只改 H/M（前 3 项），L 不动
- [ ] 不动

---

## 3. tree.html · 剧集 dashboard

### 强项
- 4-列瓦片网格信息密度合理
- 状态点（绿/琥珀）小而清楚
- P4 板块单独分组而非混排，结构上明确"这些是后续的"
- FAB 在右下角是 standard 位置

### Issues

| 严重度 | 描述 | 建议 | 改动量 |
|---|---|---|---|
| M | h1 "侏儒怪 第一集" 40px | 改 32px | 1 min |
| M | meta line "created by 乐美林 · 2026-04-15 · drafting" 全行 mono | 拆三段：`由 乐美林 创建`（sans）+ `2026-04-15`（mono）+ `drafting → 草稿中`（sans，配状态点） | 8 min |
| M | "drafting" 是英文 | 改"草稿中" | 30 sec |
| M | sidebar 项目计数 "12" / "3" / "8" 用 mono | 改 sans（整数不是版本号） | 2 min |
| L | tile stat "1 个草稿" / "12 个已入库" / "尚未开始" 用 mono | 改 sans（状态描述不是机器字符串） | 3 min |
| L | "板块" 和 "P4 · 后续板块" section title 是 uppercase letter-spacing 0.06em 风格，跟中文不太搭 | 改 normal case，去 letter-spacing | 2 min |
| L | P4 badge 琥珀色 + border 框较高调，跟"这些不可用"语义有点冲突 | 改为灰色弱信号（`text-text-3` + `bg-surface-2`），更"未开放"的感觉 | 5 min |
| L | tile 的 `min-height: 124px` 在 24 + emoji + name + stat 三行后空间挺富余 | 可以缩到 108px 让网格更紧凑 | 2 min |

**勾选**：
- [ ] 全部 8 项一起改
- [ ] 只改 H/M（前 4 项）
- [ ] 只改前 2 项（h1 + meta line）
- [ ] 不动

---

## 4. push-review.html · 一键入库评审

### 强项
- 分组 + 复选框 + 单文件行 经典 review 模式
- sticky bottom + glass blur 顶栏视觉现代
- 文件名 mono + 容量 mono 是符合 INDEX.md 规则的正确用法

### Issues

| 严重度 | 描述 | 建议 | 改动量 |
|---|---|---|---|
| **H** | push 按钮的 pulse animation（无限脉冲光晕） | **删掉**。30 人内部工具，反复看到 pulse 动画的工程师 / 设计师用户会觉得"被催"，这是 marketing 落地页的语言不是 productivity tool。改成 静态 + 单层 box-shadow `0 4px 14px rgba(155,124,255,0.45)` 即可强调 | 3 min |
| M | h1 "入库评审 · 侏儒怪 第一集" 40px | 改 32px。也可以拆成两行：32px "入库评审" + 14px text-3 "侏儒怪 第一集" | 4 min |
| M | sub line "3 项待入库 · 总计 4.2 MB · 目标分支 main" 整行 mono | 拆：`3 项待入库`（sans）+ `4.2 MB`（mono）+ `main`（mono pill） | 5 min |
| M | back link "← 童话剧 / 格林童话 / ..." 用 mono | 改 sans（breadcrumb 不是路径） | 1 min |
| L | section name "📝 剧本" 17px 在 880px 宽度上偏小 | 改 19-20px 加重 weight | 2 min |
| L | tag "来自 .docx 转换" 用 accent 紫色 | 改中性灰（`text-text-3 bg-surface-2`），把 accent 紫色保留给"推送"这一处主语义 | 3 min |
| L | summary "已选 3 项 · 4.2 MB" 整段 mono | 拆 mono 只用在数字 | 3 min |

**勾选**：
- [ ] 全部 7 项一起改（强烈推荐至少删 pulse 动画）
- [ ] 只改 H/M（前 4 项）
- [ ] 只删 pulse 动画
- [ ] 不动

---

## 5. episode-wizard.html · 4 步新建剧集

### 强项
- step indicator + 实时路径预览（这个挺巧）
- modal 居中 720 宽合理
- 输入 → 路径预览 → 创建 流程顺

### Issues

| 严重度 | 描述 | 建议 | 改动量 |
|---|---|---|---|
| M | kicker "step 4 of 4 · final" 双语 mono | 改 "第 4 步 / 共 4 步"（sans） | 2 min |
| M | path preview 上方注释 "// 你的剧集路径将是" 是双语 mono | 改 "剧集路径预览"（sans，去 `//`） | 1 min |
| L | help 文字 "enter ↵ 创建" 双语 mono | 改 "回车 创建"（sans） | 1 min |
| L | 输入框 value="侏儒怪 第一集" 同时 placeholder="如：侏儒怪 第一集" | mockup 静态保留 value 即可，工程实施时 React 组件应只用 placeholder。这条不需要改 mockup，**写进工程注意事项** | 0 min |
| L | step 数字圆圈 done 状态 "✓" 实心 + active 状态 "4" 紫底 — 已 done 的 step 没用过去时颜色（仍然是亮紫） | done 用更暗的紫（`accent` 50% opacity），active 保持当前 | 3 min |

**勾选**：
- [ ] 全部 5 项
- [ ] 只改 M（前 2 项）
- [ ] 不动

---

## 6. first-run-modal.html · 首次登录浮窗

### 强项
- 👋 emoji + 大字标题 + 两个 choice 友好且清晰
- 主 / 次 CTA 视觉层级正确（紫渐变 vs 灰）
- 560 模态宽度合理

### Issues

| 严重度 | 描述 | 建议 | 改动量 |
|---|---|---|---|
| M | choice desc "// 加入已有的剧集" / "// 4 步骨架向导" 双语注释 mono | 改 "加入已有的剧集" / "4 步骨架向导"（sans，去 `//`） | 2 min |
| L | h2 "看起来是你第一次使用 FableGlitch Studio" 较长 | 简化为 "首次使用 FableGlitch Studio" 或保留（取决于你想要的友好度） | 1 min |
| L | foot "首次使用引导 · 可关闭" 全行 mono | 改 sans | 1 min |
| L | 顶部 .topbar 占位条颜色 `#0d0d10` 跟 bg `#0a0a0b` 几乎不可分辨 | 加大对比或直接删（这条占位 bg 在实际使用中会被真实 dashboard 替代） | 0 min |

**勾选**：
- [ ] 全部 4 项
- [ ] 只改 M（第 1 项）
- [ ] 不动

---

## 7. 整体优先级建议（如果你只想做最小修复）

按 ROI 从高到低，我推荐按这个顺序砍工作量：

**Tier 1（强烈建议，约 30 分钟）**：
- 删 push-review.html 的 push button pulse animation
- 全 6 页 mono 用法收紧到 INDEX.md 的 7 类
- 全 6 页双语注释 / `//` 装饰串删英文

**Tier 2（推荐，约 30 分钟）**：
- 3 处 h1 从 40px 降到 32px
- tree.html 的 meta line / stat / sidebar count 从 mono 改 sans
- "drafting" → "草稿中"

**Tier 3（可选，约 30 分钟）**：
- P4 badge 改弱信号
- section name 调字号字重
- step indicator done 状态用更暗的紫
- 各种 button / kicker / help 文案简化

总计 1.5 小时左右能把 6 页全部 surgical 修一遍。**Tier 1 + Tier 2 是 60 分钟**，做这两层就能让"看起来不太清晰"的感觉消除大半，还不影响主视觉系统的认同感。

---

## 8. 你的回复方式

最简单的方式：直接回我类似这样：

> Tier 1 全做。tree.html 的 8 项里前 4 项做。其他不动。

或者如果想细到每页：

> 1. login: 不动
> 2. shell: 前 3 项做
> 3. tree: 前 4 项 + P4 badge 做
> 4. push-review: 全做
> 5. wizard: 前 2 项做
> 6. first-run: 第 1 项做

我会按你的勾选执行。每页一次 commit + push。

工程层（React 组件）跟 mockup 同步的部分会一起改，不会出现"mockup 改了组件没改"的偏差。

---

## 附录 · INDEX.md 上写的 mono 用法 vs 实际偏差

INDEX.md 第 23 行：
> `JetBrains Mono：文件名 / 路径 / 时间戳 / 邮箱 / 版本号 / 容量 / commit`

实际 mockup mono 出现位置：
- ✅ 文件名（push-review）
- ✅ 路径（episode-wizard 路径预览）
- ✅ 时间戳（"2026-04-15"）
- ✅ 邮箱（topnav user-name）
- ✅ 版本号（footer "v0.1.0 · build 2026.04.27"）
- ✅ 容量（"4.2 MB" / "12.5 KB"）
- ✅ commit message（push-review textarea）
- ❌ tagline（"菲博幻境工作室·内部资产管理"）
- ❌ hint 文案（"@beva.com 内部邮箱"）
- ❌ section uppercase title
- ❌ 整数计数（"12" "3" "8"）
- ❌ 状态描述（"drafting"、"尚未开始"、"1 个草稿"）
- ❌ kicker（"step 4 of 4"）
- ❌ 双语注释 `// xxx`
- ❌ help 文字（"enter ↵ 创建"）
- ❌ breadcrumb
- ❌ sub line（"3 项待入库 · 总计 4.2 MB · 目标分支 main"）
- ❌ summary
- ❌ foot 版权 / 引导提示

**理顺这一项就解决一大半问题**。
