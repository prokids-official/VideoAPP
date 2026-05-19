# FableGlitch Studio

[English](README.md) | [简体中文](README.zh-CN.md)

FableGlitch Studio 是一个 Windows 优先的桌面创作工具，用来规划、整理、预览和入库 AI 辅助的漫画、动画短片、叙事短片资产。它把公司项目资产库、本地个人创作舱、可复用 AI Skills、以及后端入库流程放在同一个 App 里。

当前定位是内部生产工具：创作者先在本机创作和整理资产，再把选中的剧本、角色、场景、道具、分镜、图片提示词、视频提示词、图片、视频等内容推送到公司共享项目库。

## 当前进度

**阶段：P1.3 进行中**

- **P0 / P0-D：** 公司项目资产库、文件导入、入库评审、资产预览、R2/GitHub 存储、用量记录、基础资产谱系已经具备。
- **P0.5：** 安装包发布、自动更新、运维分发还没有完成。
- **P1.1：** 点子池已经有早期版本，可用于团队故事想法沉淀。
- **P1.2：** 个人创作舱已经可用：本地项目、阶段流、剧本导入/编辑、角色/场景/道具资产卡、分镜单元、图片/视频提示词阶段、画布总览、入库到公司项目。
- **P1.3：** AI Provider、Agent、Skills 工作流正在接入和打磨。当前已经可以加载官方 skills、查看 skill 详情、运行剧本/分镜/prompt/资产库 Agent，并保存 Agent Run 元数据。

这还是内部 beta。安装包分发、配额管理、直接生图/生视频、自动更新、最终成片评分等能力还没有完全完成。

## Release 状态

目前还**没有发布任何 GitHub Release**。仓库已经可以给同事查看，但 Windows 安装包还需要打包、冒烟测试，并发布第一个内部版本。

当前建议：

- 普通同事先等待内部安装包链接或第一个 GitHub Release。
- 开发和测试人员可以用 `npm run dev` 本地运行。
- 维护者可以用 `npm run dist` 在本机生成 Windows 安装包。

计划中的第一个版本：**v0.1.0 internal beta**。

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

1. 第一个版本发布后，从内部发布链接或 GitHub Releases 下载最新 Windows 安装包。
2. 在 Windows 上运行安装包。
3. 打开 **FableGlitch Studio**。
4. 使用公司邮箱账号登录。
5. 从首页进入对应工作区：
   - **公司项目：** 查看剧集和共享资产。
   - **个人创作舱：** 在本机创建项目，完成后选择性入库。
   - **Skills Hub：** 查看、激活和复用 AI 创作技能。
   - **点子池：** 沉淀和浏览故事创意。

目前还没有公开/内部 GitHub Release。请找项目维护者获取当前测试包，或等待计划中的 `v0.1.0 internal beta`。开发者也可以用 `npm run dist` 在本机打包 Windows 安装程序。

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

## 产品 Roadmap

当前完整产品计划从 **P0 到 P5**，中间还有一个 **P4.5** 成片评审阶段。

| 阶段 | 主题 | 状态 |
| --- | --- | --- |
| P0 | 公司资产库：登录、项目树、资产面板、上传、预览、入库评审、R2/GitHub 存储 | 基本完成 |
| P0.5 | 分发和运维：Windows 安装包、自动更新、NAS/备份、发布检查清单 | 下一步基础设施重点 |
| P1 | 创作规划：点子、个人创作舱、剧本、角色/场景/道具、分镜、提示词、Skills Hub、Agent Runs | 进行中 |
| P2 | 分镜和提示词自动化：自动拆镜、提示词生成、时长预算、镜头结构化 | 计划中 |
| P3 | 生图和生视频：文生图、图生图、视频生成、模型接入、生成结果评审闭环 | 计划中 |
| P4 | 音频和交付：对白、BGM、歌曲、音效、导出包装、平台交付规格 | 计划中 |
| P4.5 | 成片评审：评分、时间码反馈、返工建议、回链到源资产 | 计划中 |
| P5 | 导演生产台：Shot Ledger、资产图谱、外部画布嵌入、轻量自建画布、可能的 3D 摆位 | 计划中 |

### 当前 P1 拆分

| 板块 | 状态 |
| --- | --- |
| P1.1 点子池 | 早期版本已存在 |
| P1.2 个人创作舱 | 核心流程已经可用 |
| P1.3 AI Provider + Agent + Skills | 当前重点 |
| P1.4 提示词知识库、模板、流程打磨 | 计划中 |
| P1.5 Canvas / Shot Ledger 类生产视图 | 计划中，可能和 P5 方向重叠 |

### 近期下一步

1. 发布第一个 Windows 内部 beta 安装包。
2. 用生产 Vercel 后端完整冒烟测试安装版 App。
3. 完成 P1.3 官方模型路由：DeepSeek Flash/Pro 负责文本，临时多模态模型负责视觉理解兜底。
4. 把公司资产详情做成更完整的资产卡：角色、场景、道具都有结构化字段。
5. 给已有图片增加反推 prompt、优化 prompt 的 skill 操作。
6. 打磨 Skills Hub：分类、激活状态、示例、兼容性说明。
7. 增加官方模型调用的用量和配额界面。

## 维护说明

- 不要提交本机 `.env` 文件或任何私有 API key。
- Codex/Claude handoff、superpowers 计划文档、agent 本地配置不应进入公司可见仓库。
- 给同事看的文档应集中在 `README.md`、`README.zh-CN.md` 或整理后的 `docs/` 文件里。

## License

见 [LICENSE.md](LICENSE.md)。
