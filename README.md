# Sweet Automation

Sales target and performance management app for Alma Lasers Israel — replaces
the recurring Excel analysis with a shared system for sales performance,
customer follow-up, recommended targets, and management oversight.

Hebrew UI, full RTL. The full build specification is in [SPEC.md](SPEC.md).
See `/web/src/lib/analysis.ts` and `/web/src/lib/workbook-parse.ts` for the
calculation engine and import parser.

## Structure

- `/web` — Vite + React + TypeScript SPA (Tailwind, TanStack Query, Supabase client)
- `/server` — small Express API used only for service-role operations (admin user management, full backup export)
- `/supabase/migrations` — Postgres schema, RLS policies, functions, triggers

## Setup

1. Create a Supabase project (https://supabase.com).
2. Run `/supabase/migrations/0001_init.sql` against it (via the SQL editor, or `supabase db push` with the Supabase CLI linked to your project).
3. Copy `web/.env.example` to `web/.env.local` and fill in your project's URL + anon key.
4. Copy `server/.env.example` to `server/.env` and fill in your project's URL + **service-role** key (never expose this key to the browser).
5. Install dependencies and run both apps:

   ```bash
   cd server && npm install && npm run dev
   ```

   ```bash
   cd web && npm install && npm run dev
   ```

6. Open the web app, use "יצירת חשבון מנהל ראשוני" once to create the first account — it automatically becomes the system admin. Every other account (management, agents) is created afterward from the ניהול משתמשים (Admin) screen with real email addresses, never invented ones.
7. Upload the source workbook from העלאת נתונים (Import) to populate the dashboard.

## Notes on two fixes vs. the original reference implementation

- **Unassigned agent (`ללא סוכן`)** is counted in overall totals but excluded from agent rankings, agent-detail pages, and automatic targets everywhere (`summarizeByAgent` in `analysis.ts` excludes it by default), with a distinct "מכירות ללא שיוך" summary on the dashboard instead.
- **Negative quantities** found during import are never silently summed away or auto-converted into a returns rule. They're preserved exactly as read (so totals still reconcile to the source file) but surfaced in their own preview card with a CSV export, so a manager can review them and decide an explicit business rule.
