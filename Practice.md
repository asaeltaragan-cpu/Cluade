# Practice — Project Update Log

A chronological record of every update pushed to the GitHub repository
`asaeltaragan-cpu/Cluade` (branch `main`). Newest entries are at the bottom.
See [SPEC.md](SPEC.md) for the build specification and [README.md](README.md) for setup.

Live site: https://asaeltaragan-cpu.github.io/Cluade/

## Summary

| # | Date | Commit | Update |
|---|------|--------|--------|
| 1 | 2026-09-16 | `62c291e` | Initial commit |
| 2 | 2026-09-17 | `a1cf81a` | Add files via upload (two images, later removed) |
| 3 | 2026-09-19 | `3eb1ef8` | Build Sweet Automation app, admin API, database schema |
| 4 | 2026-09-19 | `5b4c0c9` | Add fictional demo workbook and generator script |
| 5 | 2026-09-19 | `e755427` | Remove uploaded images |
| 6 | 2026-09-19 | `368b577` | Prepare GitHub Pages deployment and Render API config |
| 7 | 2026-09-19 | `7f0a263` | Make API self-diagnosing |
| 8 | 2026-09-19 | `946aa48` | Strip whitespace from service key; stop echoing errors |
| 9 | 2026-09-19 | `967cbee` | Add SPEC.md and link it from README |
| 10 | 2026-09-19 | `cad9915` | Fix `sync_work_item_flags` for Supabase safe-update guard |
| 11 | 2026-09-23 | `14e7817` | Add Airtable sync (10-min auto-sync + manual sync button) and this log |
| 12 | 2026-09-23 | `fa7aee7` | Add GitHub Actions cron trigger for Airtable sync (Render sleep workaround) |
| 13 | 2026-09-23 | `6f491c6` | Fix Airtable sync card disappearing on any status-check error |
| 14 | 2026-09-23 | `3b98714` | Align Airtable config handling with the Supabase tolerant-value pattern |
| 15 | 2026-09-23 | `982a302` | Remove Airtable sync entirely — Supabase is the only database |

## Details

### 1. Initial commit — `62c291e` (2026-09-16)
Repository created with a one-line README.

### 2. Add files via upload — `a1cf81a` (2026-09-17)
Two image files (`QR.jpeg` and a WhatsApp screenshot) were uploaded through the GitHub web interface.

### 3. Build Sweet Automation — `3eb1ef8` (2026-09-19)
The full application, in three parts:
- **`/web`** — Vite + React + TypeScript single-page app (Tailwind CSS, TanStack Query, Supabase client), Hebrew UI with full RTL.
  - Screens: login (with first-admin bootstrap), management dashboard, agent detail, work list, targets, import wizard, activity history, user administration, backup.
  - `analysis.ts`: calculation engine (15% growth target, customer groups, priority score).
  - `workbook-parse.ts`: flexible multi-sheet Excel import parser.
  - 21 unit tests covering classification boundaries, zero denominators, year-end behavior, deduplication, LMNT-only-in-its-own-sheet, blank-agent rows and negative quantities.
- **`/server`** — small Express API used only for operations that need the Supabase service-role key (user administration and full backup export).
- **`/supabase/migrations/0001_init.sql`** — schema, row-level-security policies, audit triggers, and the first-user-becomes-admin bootstrap.

Behavior decisions built in from the start:
- The unassigned agent (`ללא סוכן`) counts toward total sales but is excluded from agent rankings, agent detail pages, and automatic targets; it is shown as a separate dashboard summary.
- Negative import quantities are preserved exactly as read (totals still reconcile to the source) but flagged in their own preview card with a CSV export, so a business rule can be decided explicitly.

### 4. Fictional demo workbook — `5b4c0c9` (2026-09-19)
Added `demo/demo-sales-data.xlsx` and its generator `web/scripts/make-demo-data.mjs`: four fake agents, four fake products, unassigned rows, one negative quantity, overlapping product sheets, and a product that exists only in its own sheet. Used to preview the product before loading real data.

### 5. Remove uploaded images — `e755427` (2026-09-19)
Removed `QR.jpeg` and the WhatsApp screenshot from the working tree. They remain in git history (commit `a1cf81a`).

### 6. Prepare GitHub Pages deployment — `368b577` (2026-09-19)
- `web/vite.config.ts`, `web/src/main.tsx`, `web/index.html`: app served under `/Cluade/`.
- `.github/workflows/deploy.yml`: on every push to `main`, run tests, build, add an SPA `404.html` fallback, and publish to GitHub Pages. Build-time values come from repository Actions variables (public values only; never the service-role key).
- `render.yaml`: blueprint for hosting the admin API on Render.
- `server/src/index.ts`: CORS accepts a comma-separated origin list.

### 7. Make API self-diagnosing — `7f0a263` (2026-09-19)
Added a `/health/db` endpoint, made `SUPABASE_URL` tolerant of trailing slashes or a `/rest/v1` suffix, and improved the authentication error path. Added while diagnosing an "invalid token" error on user creation.

### 8. Strip whitespace from service key — `946aa48` (2026-09-19)
Root cause of the "invalid token" error: the service key stored on the host contained a pasted line break. The server now removes whitespace from the key. `/health/db` no longer echoes error text, because error messages can contain fragments of the configured key.

### 9. Add SPEC.md — `967cbee` (2026-09-19)
Added the English build specification (`SPEC.md`) and linked it from the README, replacing a reference to a file that did not exist.

### 10. Fix `sync_work_item_flags` — `cad9915` (2026-09-19)
Excel upload failed at its last step with "UPDATE requires a WHERE clause" (Supabase's safe-update guard). Added an explicit `where true` in `0001_init.sql` and a new migration, `0002_fix_sync_flags_where.sql`, applied to the live database via the Supabase SQL Editor.

### 11. Airtable sync — `14e7817` (2026-09-23)
Also includes `SPEC.md` (967cbee) and this file (not yet pushed at the time).

- `server/src/airtable.ts`: reads the Airtable customers + sales tables and maps them into the same fact shape as a parsed Excel workbook.
- `server/src/sync.ts`: lands the pulled rows as a normal import batch (create → chunked insert → atomic activate → work-item flag sync), so everything downstream treats it exactly like a manual upload. Deduplicates by agent + entity + product + month.
- `server/src/routes/airtable.ts` (`/api/airtable/status`, `/api/airtable/sync`, manager-only): status polling and an on-demand trigger.
- `server/src/index.ts`: runs the sync automatically every 10 minutes when `AIRTABLE_TOKEN` is set; otherwise the feature stays inert.
- `web/src/components/sales/AirtableSync.tsx`: a card on the Import screen (managers only) showing last-sync status and a "סנכרון עכשיו" button.
- `supabase/migrations/0003_allow_service_role_sync.sql`: `sync_work_item_flags` now also accepts calls made with the service-role key (the automated sync has no logged-in user), applied to the live database.

**Known limitation:** the Render free tier puts the server to sleep after ~15 minutes idle, which also stops the in-process 10-minute timer; it resumes on the next incoming request. Addressed in the next entry.

### 12. External cron trigger — `fa7aee7` (2026-09-23)
- `server/src/routes/airtable.ts` (`cronSyncHandler`) and `server/src/index.ts`: new `POST /api/airtable/cron-sync`, gated by a shared secret header (`x-cron-secret` / `CRON_SECRET`) instead of a user login, since a scheduler has no logged-in user.
- `.github/workflows/airtable-sync.yml`: calls that endpoint on a `*/10 * * * *` schedule (plus manual `workflow_dispatch`). This both wakes a sleeping Render instance and runs the sync.
- `render.yaml`: declares the new Airtable + `CRON_SECRET` environment variables.

**Still not a hard real-time guarantee:** GitHub does not promise exact timing for scheduled workflows — under low repository activity a run can slip by several minutes or occasionally be skipped. This is best-effort, not a substitute for a paid always-on host if exact 10-minute cadence is required.

**Manual setup still required (not done by the assistant):**
- Create a new Airtable Personal Access Token (the one pasted in chat during setup was treated as compromised and never used) scoped to the `Demo Sales Data` base only, and set it as `AIRTABLE_TOKEN` in Render.
- Generate a random `CRON_SECRET` value; set it identically in Render's environment and as a GitHub Actions **secret** named `CRON_SECRET`.
- Add a GitHub Actions **variable** named `AIRTABLE_SYNC_URL` = the Render service's base URL (e.g. `https://sweet-automation-api.onrender.com`, no trailing slash).
- Apply `supabase/migrations/0003_allow_service_role_sync.sql` to the live database (needed for the *unattended* sync — the manual "סנכרון עכשיו" button already worked without it, since a logged-in manager satisfies the original check).

### 13. Fix disappearing sync card — `6f491c6` (2026-09-23)
`web/src/components/sales/AirtableSync.tsx` hid the entire card, button included, on any status-check error — which is exactly what made it look missing before `AIRTABLE_TOKEN` was configured. The card now always renders, showing the error inline instead.

### 14. Align config handling with Supabase — `3b98714` (2026-09-23)
Applied the same tolerant-value treatment already used for `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`:
- `server/src/airtable.ts`: `AIRTABLE_TOKEN` has all whitespace stripped (a pasted line break silently breaks every request, as it did once for the Supabase key); base/table IDs are trimmed.
- `server/src/routes/airtable.ts`: `CRON_SECRET` comparison strips whitespace on both sides.
- `.github/workflows/airtable-sync.yml`: strips a trailing slash from the `AIRTABLE_SYNC_URL` variable.
- New `GET /health/airtable` (public, no secrets in the response), mirroring `/health/db`'s `{config, api}` shape exactly — surfaced on the sync card so a missing token or a failed connection is visible without needing to check server logs.

### 15. Remove Airtable sync — `982a302` (2026-09-23)
The user decided against using Airtable as a data source: Supabase should be the only database, and the only thing anything syncs against. Removed everything added in entries 11–14:
- Deleted `server/src/airtable.ts`, `server/src/sync.ts`, `server/src/routes/airtable.ts`, `web/src/components/sales/AirtableSync.tsx`, `.github/workflows/airtable-sync.yml`.
- `server/src/index.ts`: removed the `/health/airtable` endpoint, the `/api/airtable/*` routes, and the 10-minute in-process scheduler.
- `server/.env.example` and `render.yaml`: removed `AIRTABLE_*` and `CRON_SECRET`.
- `web/src/pages/Import.tsx`: removed the sync card.
- `supabase/migrations/0004_revert_service_role_sync.sql`: reverted `sync_work_item_flags` to manager-only (it was widened in 0003 solely so the unattended Airtable sync could call it).

Net effect: the app is back to exactly what entries 1–10 describe — Supabase + Excel import, nothing else. The Airtable base itself (`Demo Sales Data`) was left untouched; nothing in this project reads from it anymore.

## Operational notes (not code changes)
- Supabase project configured; migrations `0001` and `0002` applied.
- First administrator account created; role verified.
- API hosted on Render; site published on GitHub Pages.
- A new service key was issued after the previous one appeared in troubleshooting output; secrets live only in git-ignored `.env` files and host settings.

## Maintenance
Append a new row and a new detail section for each future push, newest last.
