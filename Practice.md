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

## Operational notes (not code changes)
- Supabase project configured; migrations `0001` and `0002` applied.
- First administrator account created; role verified.
- API hosted on Render; site published on GitHub Pages.
- A new service key was issued after the previous one appeared in troubleshooting output; secrets live only in git-ignored `.env` files and host settings.

## Maintenance
Append a new row and a new detail section for each future push, newest last.
