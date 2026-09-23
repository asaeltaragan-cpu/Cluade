import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireAuth } from "./auth.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { adminRouter } from "./routes/admin.js";
import { backupRouter } from "./routes/backup.js";
import { airtableRouter, cronSyncHandler } from "./routes/airtable.js";
import { runAirtableSync } from "./sync.js";

const app = express();
app.use(express.json());
app.use(
  cors({
    // Comma-separated list of allowed origins (scheme + host, no path).
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()),
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Reports whether this server's own Supabase URL + service key actually work. Returns no secrets.
app.get("/health/db", async (_req, res) => {
  const { error } = await supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" });
  const { error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  // Never echo error text: it can contain fragments of the configured key.
  res.json({ db: error ? "error" : "ok", auth: authError ? "error" : "ok" });
});

app.use("/api/admin", requireAuth, adminRouter);
app.use("/api/backup", requireAuth, backupRouter);
app.use("/api/airtable", requireAuth, airtableRouter);
// No user JWT here (external scheduler) — gated by CRON_SECRET inside the handler instead.
app.post("/api/airtable/cron-sync", cronSyncHandler);

// Central error handler — never leak internals, but keep the message in Hebrew-friendly text.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "שגיאת שרת" });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Sweet Automation admin API listening on http://localhost:${port}`);
});

const SYNC_INTERVAL_MS = 10 * 60 * 1000;
if (process.env.AIRTABLE_TOKEN) {
  setInterval(() => {
    runAirtableSync()
      .then((r) => {
        // eslint-disable-next-line no-console
        console.log("[airtable sync]", r.ok ? `ok, ${r.rowCount} rows` : `failed: ${r.error}`);
      })
      .catch((err) => console.error("[airtable sync] unexpected error", err));
  }, SYNC_INTERVAL_MS);
  console.log(`Airtable auto-sync enabled, every ${SYNC_INTERVAL_MS / 60000} minutes.`);
} else {
  console.log("AIRTABLE_TOKEN not set — auto-sync disabled; manual /api/airtable/sync still requires it.");
}
