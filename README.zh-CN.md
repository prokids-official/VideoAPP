# FableGlitch Studio

[English](README.md) | [简体中文](README.zh-CN.md)

FableGlitch Studio 是一个 Windows 优先的桌面创作工具，用来规划、整理、预览和入库 AI 辅助的漫画、动画短片、叙事短片资产。它把公司项目资产库、本地个人创作舱、可复用 AI Skills、以及后端入库流程放在同一个 App 里。

当前定位是内部生产工具：创作者先在本机创作和整理资产，再把选中的剧本、角色、场景、道具、分镜、图片提示词、视频提示词、图片、视频等内容推送到公司共享项目库。

## 当前进度

**阶段：P1.3 进行中**

- **P0 / P0-D：** 公司项目资产库、文件导入、入库评审、资产预览、R2/GitHub 存储、用量记录、基础资产谱系已经具备。
- **P1.1：** 点子池已经有早期版本，可用于团队故事想法沉淀。
- **P1.2：** 个人创作舱已经可用：本地项目、阶段流、剧本导入/编辑、角色/场景/道具资产卡、分镜单元、图片/视频提示词阶段、画布总览、入库到公司项目。
- **P1.3：** AI Provider、Agent、Skills 工作流正在接入和打磨。当前已经可以加载官方 skills、查看 skill 详情、运行剧本/分镜/prompt/资产库 Agent，并保存 Agent Run 元数据。

这还是内部 beta。安装包分发、配额管理、直接生图/生视频、自动更新、最终成片评分等能力还没有完全完成。

## 现在能做什么

- 用公司账号登录。
- 浏览公司项目和剧集资产。
- 向公司项目导入文件或粘贴文本。
- 预览图片、视频、Markdown 文档。
- 在公司项目里编辑角色、场景、道具对应的 AI Prompt。
- 创建本地个人 Studio 项目。
- 按阶段完成灵感、剧本、角色、场景、道具、分镜、图片提示词、视频提示词、画布总览和入库。
- 在 Skills Hub 查看和激活可复用 AI skills。
- 调用剧本、分镜、图片提示词、视频提示词、视觉简报、资产库拆解等 Agent。
- 把本地 Studio 资产推送到公司共享项目库。

## Windows 使用方式

### 普通同事推荐方式

1. 从内部发布链接或 GitHub Releases 下载最新 Windows 安装包。
2. 在 Windows 上运行安装包。
3. 打开 **FableGlitch Studio**。
4. 使用公司邮箱账号登录。
5. 从首页进入对应工作区：
   - **公司项目：** 查看剧集和共享资产。
   - **个人创作舱：** 在本机创建项目，完成后选择性入库。
   - **Skills Hub：** 查看、激活和复用 AI 创作技能。
   - **点子池：** 沉淀和浏览故事创意。

如果暂时还没有正式安装包，请找项目维护者获取当前内部版本。开发者也可以用 `npm run dist` 在本机打包 Windows 安装程序。

### AI Provider 设置

大多数同事直接使用官方公司线路即可。如果需要接自己的模型 key，可以打开：

`设置 -> AI Provider -> 自带 Key / OpenAI-compatible`

官方后端当前以 DeepSeek 作为主要文本模型，并临时使用 CodingPlan/Qwen 作为多模态兜底。

## 开发环境

### 要求

- Windows 10/11
- Node.js 22+
- npm
- Git

### 前端桌面 App

```powershell
npm install
npm run dev
```

桌面端使用 Electron，界面使用 Vite + React。

常用命令：

```powershell
npm run lint
npm run build
npm test
npm run dist
```

`npm run dist` 会在 `release/` 下生成 Windows NSIS 安装包。

### 后端

后端是 `backend/` 目录下的 Next.js 项目。

```powershell
cd backend
npm install
npm run dev
```

生产后端部署在 Vercel。环境变量应该配置在 Vercel 项目里，不能提交到仓库。

常用后端命令：

```powershell
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
```

## 仓库结构

```text
backend/        Next.js 后端 API、Supabase、skills、资产入库流程
electron/       Electron 主进程、preload bridge、本地文件和 SQLite 能力
src/            React 桌面端界面
shared/         前后端共享 TypeScript 类型
docs/design/    设计笔记和静态 mockup
build/          Windows 图标和打包资源
```

## Roadmap

### 正在推进

- 稳定 P1.3 的 AI Agent 和 Skills 层。
- 把公司项目里的资产详情升级成完整资产卡：角色、场景、道具不只是一张图，而是有结构化设定和 prompt。
- 给已有图片增加反推 prompt、优化 prompt 的 skill 操作。
- 优化 DeepSeek Pro/Flash 与临时多模态模型之间的官方路由。
- 发布稳定 Windows 安装包和内部发布流程。

### 尚未完成

- Codex/OAuth 类高级模型登录或体验配额。
- Admin 配额管理、扩额申请、按用户预算控制。
- 光影、运镜、风格、角色、场景、视频提示词知识库。
- 直接生图/生视频 API，以及生成结果评审闭环。
- Shot Ledger、时间线、资产图谱、导演生产台。
- 嵌入 LibLib / RunningHub 等外部生产画布。
- 音频流程：对白、BGM、歌曲、音效。
- 最终成片导出、交付规格、成片评分。
- 自动更新、NAS 备份、正式 IT 分发流程。

## 维护说明

- 不要提交本机 `.env` 文件或任何私有 API key。
- Codex/Claude handoff、superpowers 计划文档、agent 本地配置不应进入公司可见仓库。
- 给同事看的文档应集中在 `README.md`、`README.zh-CN.md` 或整理后的 `docs/` 文件里。

## License

见 [LICENSE.md](LICENSE.md)。
