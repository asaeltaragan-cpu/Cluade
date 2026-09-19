import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireAuth } from "./auth.js";
import { adminRouter } from "./routes/admin.js";
import { backupRouter } from "./routes/backup.js";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/admin", requireAuth, adminRouter);
app.use("/api/backup", requireAuth, backupRouter);

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
