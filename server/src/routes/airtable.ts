import { Router, type Request, type Response } from "express";
import { requireManager } from "../auth.js";
import { getLastSyncResult, isSyncRunning, runAirtableSync } from "../sync.js";

export const airtableRouter = Router();

airtableRouter.get("/status", requireManager, (_req, res) => {
  res.json({ running: isSyncRunning(), last: getLastSyncResult() });
});

airtableRouter.post("/sync", requireManager, async (_req, res) => {
  const result = await runAirtableSync();
  res.status(result.ok ? 200 : 500).json(result);
});

/**
 * Separate, unauthenticated-by-JWT route for an external scheduler (see
 * .github/workflows/airtable-sync.yml). It has no logged-in user, so it's
 * gated by a shared secret header instead of requireAuth/requireManager —
 * mounted directly in index.ts, not behind the router's normal auth.
 */
export async function cronSyncHandler(req: Request, res: Response) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    res.status(503).json({ error: "CRON_SECRET not configured" });
    return;
  }
  if (req.header("x-cron-secret") !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await runAirtableSync();
  res.status(result.ok ? 200 : 500).json(result);
}
