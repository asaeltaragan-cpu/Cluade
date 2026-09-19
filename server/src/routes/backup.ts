import { Router } from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAdmin, type AuthedRequest } from "../auth.js";

export const backupRouter = Router();

const BACKUP_TABLES = [
  "imports",
  "sales_facts",
  "work_items",
  "targets",
  "target_history",
  "work_item_history",
  "profiles",
  "user_roles",
] as const;

/** Fetches every row of a table in 1000-row pages — never just the default query page. */
async function fetchAllRows(table: string): Promise<unknown[]> {
  const all: unknown[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown[];
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}

backupRouter.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const tableRows: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(`${table}: ${error.message}`);
      tableRows[table] = count ?? 0;
    }
    res.json({
      totalRows: Object.values(tableRows).reduce((a, b) => a + b, 0),
      tableRows,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה לא ידועה" });
  }
});

backupRouter.get("/export", requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", req.userId!)
      .maybeSingle();

    const tables: Record<string, unknown[]> = {};
    const tableRows: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const rows = await fetchAllRows(table);
      tables[table] = rows;
      tableRows[table] = rows.length;
    }
    const totalRows = Object.values(tableRows).reduce((a, b) => a + b, 0);

    res.json({
      meta: {
        version: "1.0",
        createdAt: new Date().toISOString(),
        exportedBy: profile?.full_name ?? profile?.email ?? null,
      },
      tables,
      stats: { totalRows, tableRows },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה לא ידועה" });
  }
});
