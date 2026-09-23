import { Router } from "express";
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
