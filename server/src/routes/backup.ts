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

// ---------- Restore ----------

/** Delete children before parents; insert parents before children. */
const DELETE_ORDER = ["work_item_history", "work_items", "target_history", "targets", "sales_facts", "imports"] as const;
const INSERT_ORDER = ["imports", "sales_facts", "targets", "work_items", "target_history", "work_item_history"] as const;

/** Nullable columns that reference auth.users; nulled when the user does not exist in this project. */
const USER_FK_COLUMNS: Record<string, string[]> = {
  imports: ["uploaded_by"],
  targets: ["set_by"],
  target_history: ["changed_by"],
  work_items: ["updated_by"],
  work_item_history: ["changed_by"],
};

type Rows = Record<string, unknown>[];

function parseBackup(body: unknown): { tables: Record<string, Rows>; meta: { createdAt?: string } } {
  const b = body as { meta?: { version?: string; createdAt?: string }; tables?: Record<string, unknown>; stats?: { tableRows?: Record<string, number> } } | null;
  if (!b || typeof b !== "object" || !b.meta || !b.tables) throw new Error("קובץ הגיבוי אינו תקין");
  if (b.meta.version !== "1.0") throw new Error(`גרסת גיבוי לא נתמכת: ${String(b.meta.version)}`);
  const tables: Record<string, Rows> = {};
  for (const t of BACKUP_TABLES) {
    const rows = b.tables[t];
    if (!Array.isArray(rows)) throw new Error(`חסרה טבלה בקובץ: ${t}`);
    const expected = b.stats?.tableRows?.[t];
    if (expected !== undefined && expected !== rows.length) {
      throw new Error(`מספר השורות בטבלה ${t} לא תואם (${rows.length} מול ${expected})`);
    }
    tables[t] = rows as Rows;
  }
  return { tables, meta: { createdAt: b.meta.createdAt } };
}

async function existingUserIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("קריאת המשתמשים נכשלה");
    for (const u of data.users) ids.add(u.id);
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function currentCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const { count, error } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${t}: ${error.message}`);
    counts[t] = count ?? 0;
  }
  return counts;
}

backupRouter.post("/restore/preview", requireAdmin, async (req, res) => {
  try {
    const { tables, meta } = parseBackup(req.body);
    const users = await existingUserIds();
    const current = await currentCounts();
    const rows: Record<string, { inFile: number; current: number; skipped: number }> = {};
    for (const t of BACKUP_TABLES) {
      let skipped = 0;
      if (t === "profiles") skipped = tables[t].filter((r) => !users.has(String(r.id))).length;
      if (t === "user_roles") skipped = tables[t].filter((r) => !users.has(String(r.user_id))).length;
      rows[t] = { inFile: tables[t].length, current: current[t], skipped };
    }
    res.json({ createdAt: meta.createdAt ?? null, tables: rows });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "שגיאה לא ידועה" });
  }
});

backupRouter.post("/restore/apply", requireAdmin, async (req, res) => {
  try {
    const body = req.body as { confirm?: boolean; backup?: unknown } | null;
    if (body?.confirm !== true) {
      res.status(400).json({ error: "נדרש אישור מפורש לשחזור" });
      return;
    }
    const { tables } = parseBackup(body.backup);
    const users = await existingUserIds();

    // Business tables are replaced. profiles/user_roles are only upserted (never deleted) so the
    // current admin can never be locked out, and only for users that exist in this project.
    for (const t of DELETE_ORDER) {
      const { error } = await supabaseAdmin.from(t).delete().not("id", "is", null);
      if (error) throw new Error(`מחיקת ${t} נכשלה: ${error.message}`);
    }

    const restored: Record<string, number> = {};
    const batch = 1000;
    for (const t of INSERT_ORDER) {
      const fkCols = USER_FK_COLUMNS[t] ?? [];
      const rows = tables[t].map((r) => {
        const row = { ...r };
        // Let the sequence assign sales_facts ids so it can never collide with later imports.
        if (t === "sales_facts") delete row.id;
        for (const c of fkCols) if (row[c] && !users.has(String(row[c]))) row[c] = null;
        return row;
      });
      for (let i = 0; i < rows.length; i += batch) {
        const { error } = await supabaseAdmin.from(t).insert(rows.slice(i, i + batch));
        if (error) throw new Error(`הכנסת ${t} נכשלה (שורות ${i}+): ${error.message}`);
      }
      restored[t] = rows.length;
    }

    const profiles = tables.profiles.filter((r) => users.has(String(r.id)));
    const roles = tables.user_roles.filter((r) => users.has(String(r.user_id)));
    if (profiles.length) {
      const { error } = await supabaseAdmin.from("profiles").upsert(profiles, { onConflict: "id" });
      if (error) throw new Error(`שחזור profiles נכשל: ${error.message}`);
    }
    if (roles.length) {
      const { error } = await supabaseAdmin.from("user_roles").upsert(roles, { onConflict: "user_id,role" });
      if (error) throw new Error(`שחזור user_roles נכשל: ${error.message}`);
    }
    restored.profiles = profiles.length;
    restored.user_roles = roles.length;

    res.json({ ok: true, restored });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה לא ידועה" });
  }
});
