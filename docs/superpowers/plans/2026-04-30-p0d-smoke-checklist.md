# FableGlitch P0-D Smoke Checklist

Date: 2026-04-30

Goal: verify the full P0-D desktop loop on a real Windows Electron session:
create episode -> save local drafts -> review -> push to backend -> verify GitHub/R2/Supabase -> preview pushed assets -> restart session.

Owner:
- Manual smoke: 乐美林
- Automated preflight: Codex

Important: walk the manual steps in order. Stop at the first failure, record the actual behavior in the Notes section, and decide whether to fix or explicitly skip.

## Automated Preflight

Run from `D:\VideoAPP`.

| Check | Command | Expected | Result |
| --- | --- | --- | --- |
| Full test suite | `npm test` | All Vitest suites pass | Passed: 13 files, 26 tests |
| Production build | `npm run build` | TypeScript + Vite build pass | Passed; Vite reported existing >500 kB chunk warning |
| Lint | `npm run lint` | ESLint exits 0 | Passed |

## Manual Smoke Steps

### 1. Start Electron

- [ ] Run: `cd D:\VideoAPP && npm run dev`
- Expected: Vite starts on `127.0.0.1:5173`; Electron window opens with FableGlitch title bar.
- If failed:
  - If Vite port is occupied, close old `node` / `electron` processes and retry.
  - If the login page says desktop bridge missing, fully quit Electron and rerun `npm run dev`.
  - If Electron does not open, check terminal output for preload or sandbox errors.

### 2. Login

- [ ] Login with `meilinle@beva.com / Admin1234`
- Expected: authenticated desktop session opens. If there are no projects, `ShellEmptyRoute` welcome screen appears; if data already exists, `TreeRoute` appears.
- If failed:
  - Confirm this is the Electron window, not a browser tab.
  - Confirm Supabase user `meilinle@beva.com` is active and role is `admin`.
  - If credentials fail, reset password in Supabase Auth or use the app reset flow.

### 3. Create Episode Skeleton

- [ ] Click `[+ 新建剧集]`.
- [ ] Step 1 series: `童话剧`.
- [ ] Step 2 album: `格林童话`.
- [ ] Step 3 content: `侏儒怪`.
- [ ] Step 4 episode: `侏儒怪 第一集`.
- [ ] Click `[创建骨架]`.
- Expected: app navigates to the new episode dashboard.
- External expected: GitHub `https://github.com/ProKids-digital/asset-library` contains an init skeleton commit for the episode.
- If failed:
  - If wizard validation blocks progress, screenshot the step and input values.
  - If dashboard does not open, check `/api/episodes` response in Vercel logs.
  - If GitHub commit is missing, check backend GitHub token/env vars and `usage_logs`.

### 4. Save Two SCRIPT Drafts

- [ ] In dashboard, click `SCRIPT`.
- [ ] Click `[📋 粘贴文本]`.
- [ ] Paste a short markdown script, continue preview, save as draft.
- [ ] Click `[📁 导入]`.
- [ ] Select a `.docx`, preview conversion, save as draft.
- Expected: SCRIPT AssetPanel shows 2 local drafts.
- If failed:
  - If paste button is missing, confirm `SCRIPT.supports_paste = true`.
  - If `.docx` import fails, verify `mammoth` conversion and selected file extension.
  - If draft does not appear, inspect local SQLite `local_drafts` and Electron `fs.saveDraftFile`.

### 5. Save One CHAR Draft

- [ ] Return to dashboard or panel grid.
- [ ] Click `CHAR`.
- [ ] Import a `.png` role image and save as draft.
- Expected: CHAR AssetPanel shows 1 local draft.
- If failed:
  - Confirm file dialog accepts `.png`.
  - Confirm `/api/assets/preview-filename` returns final filename and storage ref.
  - Confirm local draft file exists under Electron user data `FableGlitch/drafts`.

### 6. Verify Dashboard FAB

- [ ] Return to episode dashboard.
- Expected: bottom-right floating FAB appears as `⚡ 一键入库 (3)`.
- If failed:
  - Confirm `fableglitch.db.draftsList(episodeId)` returns 3 rows.
  - Re-select the episode in the tree to force dashboard reload.
  - If count is stale, inspect `TreeRoute` draft count refresh after draft creation.

### 7. Open Push Review

- [ ] Click the FAB.
- Expected: route changes to `/episode/:id/push-review`; review page shows 3 drafts grouped by asset panel.
- If failed:
  - Confirm App route state receives `{ id, name }`.
  - Confirm `PushReviewRoute` can call `draftsList(episodeId)`.
  - If the page is empty, confirm drafts have the same `episode_id`.

### 8. Push Assets

- [ ] Keep all 3 selected.
- [ ] Edit commit message to a recognizable test value.
- [ ] Click `⚡ 推送`.
- Expected: button changes to `推送中...`; non-dismissable overlay and animated progress bar appear.
- If failed:
  - If button remains disabled, confirm selected count is not 0.
  - If network toast appears, check Electron `net:asset-push` and Vercel `/api/assets/push`.
  - If GitHub conflict dialog appears, click `[重试]`; it should reuse the same idempotency key.

### 9. Verify Success UX

- [ ] Wait for push to finish.
- Expected: app returns to dashboard and shows purple gradient toast `✓ 3 项资产已入库`.
- If failed:
  - If stuck in overlay, check Vercel function logs for timeout.
  - If success but route does not change, inspect `onPushed` callback in `App.tsx`.
  - If local drafts remain, inspect `draftDelete` and `fs.deleteDraftFile`.

### 10. Verify Backend Side Effects

- [ ] GitHub `asset-library`: new commit exists and includes 1 pushed `.md` script file.
- [ ] Cloudflare R2: 1 PNG object exists for the role image.
- [ ] Supabase `assets`: 3 new rows with `status='pushed'`.
- [ ] Supabase `usage_logs`: approximately 5 new records.
- Expected: storage and metadata are consistent across GitHub/R2/Supabase.
- If failed:
  - GitHub missing: inspect GitHub provider logs and `GITHUB_*` env vars.
  - R2 missing: inspect `R2_*` env vars and backend putObject errors.
  - Supabase missing: inspect `/api/assets/push` response and dead-letter/idempotency tables.
  - Usage logs missing: inspect `logUsage` calls in backend push route.

### 11. Verify Dashboard Counts

- [ ] Return to dashboard if needed.
- Expected: panel cards show pushed counts, e.g. `SCRIPT: 1 已入库`, `CHAR: 1 已入库`.
- If failed:
  - Refresh/reselect the episode.
  - Confirm `GET /api/episodes/:id` returns updated `counts.by_type`.
  - Confirm inserted `assets.type_code` values match `asset_types.code`.

### 12. Preview Pushed Markdown

- [ ] Open SCRIPT panel.
- [ ] Click the pushed script asset.
- Expected: `AssetPreviewModal` renders markdown using `MdPreview`.
- If failed:
  - Confirm `GET /api/assets/:id/content` returns markdown text.
  - Confirm GitHub storage ref points to the committed `.md`.
  - Clear `view_cache` if stale content is suspected.

### 13. Preview Pushed Image

- [ ] Open CHAR panel.
- [ ] Click the pushed role image.
- Expected: `AssetPreviewModal` renders image through `ImagePreview` using a presigned R2 URL.
- If failed:
  - Confirm backend returns 302/presigned URL for R2 content.
  - Confirm browser/Electron can load the presigned URL.
  - Confirm object content type is `image/png`.

### 14. Restart Session

- [ ] Logout.
- [ ] Close the app.
- [ ] Re-run `npm run dev`.
- Expected: app opens cleanly and session behavior is correct. If logout was clicked, login is required. If testing automatic session restore instead, do not logout before closing; app should reopen into `TreeRoute`.
- If failed:
  - Confirm `session` table values in local SQLite.
  - Confirm refresh token works via `/api/auth/refresh`.
  - If the bridge is missing after restart, fully kill Electron and rerun.

## Notes

Record failures here before fixing:

- Automated preflight passed on 2026-04-30.
- Pending manual smoke by 乐美林.

## Tagging

Only after all manual steps pass:

```powershell
cd D:\VideoAPP
git tag p0d-complete
git push origin p0d-complete
```
