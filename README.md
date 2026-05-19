# FableGlitch Studio

[English](README.md) | [简体中文](README.zh-CN.md)

FableGlitch Studio is a Windows-first desktop app for planning, organizing, and reviewing AI-assisted comic, animation, and narrative short production. It combines a company asset library, a local personal creation cockpit, reusable AI skills, and a backend asset pipeline for scripts, characters, scenes, props, storyboards, prompts, images, videos, and future audio deliverables.

The app is currently built for an internal production workflow: creators work locally, generate or prepare assets, and push selected assets into the shared company project library.

## Current Status

**Phase:** P1.3 in progress

- **P0 / P0-D:** Company project library, asset upload, push review, asset preview, R2/GitHub-backed storage, usage logging, and basic asset lineage are in place.
- **P0.5:** The first Windows portable internal beta is being published. Signed installer, auto-update, and operational rollout are not complete yet.
- **P1.1:** Ideas board exists as an early team idea pool.
- **P1.2:** Personal creation cockpit is usable: local projects, stage flow, script import/editing, character/scene/prop cards, storyboard units, prompt stages, canvas overview, and export to company projects.
- **P1.3:** AI provider, Agent, and Skills workflow is actively being integrated. The app can load official skills, show skill details, run script/storyboard/prompt/asset-library agents, and preserve agent-run metadata.

This is still an internal beta. Some production polish, signed installer distribution, quota management, and advanced generation flows are not finished yet.

## Release Status

The first Windows internal beta is published as a **portable Windows x64 build**:

[v0.1.0-internal-beta](https://github.com/prokids-official/VideoAPP/releases/tag/v0.1.0-internal-beta)

For now:

- Regular users can download the portable zip, unzip it, and run `FableGlitch Studio.exe`.
- Developers and testers can run the app locally with `npm run dev`.
- Maintainers can build a portable Windows folder with `npm run dist:portable`.
- A signed NSIS installer is still planned. The current Windows build machine needs symlink/signing-tool support before `npm run dist` can complete the installer step.

Current first release: **v0.1.0-internal-beta**.

## What It Does Today

- Sign in with a company account.
- Browse company projects and shared episode assets.
- Import or paste files into company asset panels.
- Preview image, video, and markdown assets.
- Edit prompt metadata for character, scene, and prop assets.
- Create a personal Studio project on the local machine.
- Move through inspiration, script, character, scene, prop, storyboard, image prompt, video prompt, canvas, and export stages.
- Use Skills Hub to inspect and activate reusable AI skills.
- Run AI agents for scripts, storyboards, image prompts, video prompts, vision briefs, and asset-library extraction.
- Push selected local Studio assets into the shared company project library.

## Windows User Guide

### Recommended internal use

1. Download the latest Windows portable zip from [GitHub Releases](https://github.com/prokids-official/VideoAPP/releases).
2. Unzip it to a local folder.
3. Run `FableGlitch Studio.exe`.
4. Sign in with your company email account.
5. Start from one of the main workspaces:
   - **Company Projects:** Browse episodes and shared assets.
   - **Personal Studio:** Build a local creative project before pushing selected assets to the company library.
   - **Skills Hub:** View and activate reusable AI skills.
   - **Ideas:** Collect and review story ideas.

Windows may show a security warning because this first beta is unsigned. Choose to keep/run the app only if you trust this internal build.

### AI provider setup

Most users should use the official company provider. If a user needs to use their own compatible model key, open:

`Settings -> AI Provider -> Bring your own key / OpenAI-compatible`

The official backend currently uses DeepSeek for text and CodingPlan/Qwen as a temporary vision fallback.

## Development Setup

### Requirements

- Windows 10/11
- Node.js 22+
- npm
- Git

### Frontend desktop app

```powershell
npm install
npm run dev
```

The desktop app runs Electron with a Vite renderer.

Useful commands:

```powershell
npm run lint
npm run build
npm test
npm run dist
npm run dist:portable
```

`npm run dist` builds a Windows NSIS installer into `release/`.
`npm run dist:portable` builds an unsigned portable Windows app folder into `release/win-unpacked/`.

### Backend

The backend is a Next.js app under `backend/`.

```powershell
cd backend
npm install
npm run dev
```

Backend production deployment is handled separately on Vercel. Environment variables should be configured in the Vercel project, not committed to the repository.

Useful backend commands:

```powershell
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
```

## Repository Layout

```text
backend/        Next.js backend API, Supabase integration, skills, asset pipeline
electron/       Electron main process, preload bridge, local filesystem and SQLite helpers
src/            React renderer UI
shared/         Shared TypeScript contracts
docs/design/    Design notes and static mockups
build/          Windows app icon and packaging assets
```

## Product Roadmap

The full product plan currently runs from **P0 to P5**, with an extra **P4.5** review phase.

| Phase | Theme | Status |
| --- | --- | --- |
| P0 | Company asset library: auth, project tree, asset panels, upload, preview, push review, R2/GitHub storage | Mostly complete |
| P0.5 | Distribution and operations: portable Windows release, signed installer, auto-update, NAS/backup workflow, release checklist | Portable beta in progress |
| P1 | Creation planning: ideas, personal Studio projects, scripts, character/scene/prop cards, storyboard, prompts, Skills Hub, Agent runs | In progress |
| P2 | Storyboard and prompt automation: automatic shot breakdown, prompt generation, timing budget, reusable shot structure | Planned |
| P3 | Image and video generation: text-to-image, image-to-image, video generation, provider integrations, generation review loop | Planned |
| P4 | Audio and delivery: dialogue, BGM, songs, sound effects, export packaging, platform delivery formats | Planned |
| P4.5 | Finished-video review: scoring, timecoded feedback, revision suggestions, links back to source assets | Planned |
| P5 | Director production desk: shot ledger, asset graph, embedded external canvas, lightweight internal canvas, possible 3D blocking | Planned |

### Current P1 Breakdown

| Area | Status |
| --- | --- |
| P1.1 Ideas board | Early version exists |
| P1.2 Personal creation cockpit | Core workflow is usable |
| P1.3 AI Provider + Agent + Skills | Current focus |
| P1.4 Prompt knowledge base, templates, workflow polish | Planned |
| P1.5 Canvas/shot ledger style production views | Planned, likely to overlap with P5 direction |

### Near-Term Next Work

1. Smoke-test the first Windows portable beta with the production Vercel backend.
2. Fix Windows installer packaging by enabling symlink/signing-tool support or switching to a signing-free installer path.
3. Finish P1.3 official model routing: DeepSeek Flash/Pro for text, temporary multimodal fallback for vision.
4. Make company asset cards richer with structured character, scene, and prop metadata.
5. Add reverse-prompt and prompt-improvement actions for existing images.
6. Tighten Skills Hub: better skill categories, activation state, examples, and compatibility notes.
7. Add usage/quota surfaces for official model calls.

## Notes for Maintainers

- Do not commit local `.env` files or private API keys.
- Keep internal agent handoff notes out of the public/company-facing repository.
- Company-facing documentation should live in `README.md`, `README.zh-CN.md`, or curated files under `docs/`.

## License

See [LICENSE.md](LICENSE.md).
