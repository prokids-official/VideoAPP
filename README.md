# FableGlitch Studio

[English](README.md) | [简体中文](README.zh-CN.md)

FableGlitch Studio is a Windows-first desktop app for planning, organizing, and reviewing AI-assisted comic, animation, and narrative short production. It combines a company asset library, a local personal creation cockpit, reusable AI skills, and a backend asset pipeline for scripts, characters, scenes, props, storyboards, prompts, images, videos, and future audio deliverables.

The app is currently built for an internal production workflow: creators work locally, generate or prepare assets, and push selected assets into the shared company project library.

## Current Status

**Phase:** P1.3 in progress

- **P0 / P0-D:** Company project library, asset upload, push review, asset preview, R2/GitHub-backed storage, usage logging, and basic asset lineage are in place.
- **P1.1:** Ideas board exists as an early team idea pool.
- **P1.2:** Personal creation cockpit is usable: local projects, stage flow, script import/editing, character/scene/prop cards, storyboard units, prompt stages, canvas overview, and export to company projects.
- **P1.3:** AI provider, Agent, and Skills workflow is actively being integrated. The app can load official skills, show skill details, run script/storyboard/prompt/asset-library agents, and preserve agent-run metadata.

This is still an internal beta. Some production polish, installer distribution, quota management, and advanced generation flows are not finished yet.

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

1. Download the latest Windows installer from the internal release link or GitHub Releases when a release is published.
2. Run the installer on Windows.
3. Open **FableGlitch Studio**.
4. Sign in with your company email account.
5. Start from one of the main workspaces:
   - **Company Projects:** Browse episodes and shared assets.
   - **Personal Studio:** Build a local creative project before pushing selected assets to the company library.
   - **Skills Hub:** View and activate reusable AI skills.
   - **Ideas:** Collect and review story ideas.

If no installer has been published yet, ask the project maintainer for the current internal build. Developers can also build the installer locally with `npm run dist`.

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
```

`npm run dist` builds a Windows NSIS installer into `release/`.

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

## Roadmap

### In progress

- Harden the P1.3 AI Agent and Skills layer.
- Make company asset cards richer: structured character, scene, and prop fields, not only images and prompts.
- Add reverse-prompt and prompt-improvement actions from existing images.
- Improve official model routing between DeepSeek Pro/Flash and temporary multimodal fallback models.
- Publish a stable Windows installer and internal release process.

### Not finished yet

- Codex/OAuth-style login or quota experience for premium model access.
- Admin quota management, approval requests, and per-user budget controls.
- Full prompt knowledge base for lighting, camera, style, character, scene, and video snippets.
- Direct image/video generation APIs and generated-output review loops.
- Shot ledger, timeline view, asset graph, and production dashboard.
- Embedded LibLib/RunningHub production canvas.
- Audio workflow: dialogue, BGM, song, sound effects.
- Final export/delivery packaging and finished-video scoring.
- Auto-update, NAS backup, and formal IT rollout flow.

## Notes for Maintainers

- Do not commit local `.env` files or private API keys.
- Keep internal agent handoff notes out of the public/company-facing repository.
- Company-facing documentation should live in `README.md`, `README.zh-CN.md`, or curated files under `docs/`.

## License

See [LICENSE.md](LICENSE.md).
