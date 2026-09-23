import { supabaseAdmin } from "./supabaseAdmin.js";
import { fetchAirtableFacts, loadAirtableConfig, type AirtableFact } from "./airtable.js";

export type SyncResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  importId?: string;
  rowCount?: number;
  latestMonth?: string;
  agentsCount?: number;
  negativeRows?: number;
  warnings: string[];
  error?: string;
};

let running = false;
let lastResult: SyncResult | null = null;

export function getLastSyncResult(): SyncResult | null {
  return lastResult;
}

export function isSyncRunning(): boolean {
  return running;
}

function dedupe(rows: AirtableFact[]): AirtableFact[] {
  const seen = new Set<string>();
  const out: AirtableFact[] = [];
  for (const r of rows) {
    const key = `${r.agent}|${r.entity_id}|${r.product}|${r.ym}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Pulls the Airtable base and lands it as a new import batch, reusing the
 * exact same shape (imports + sales_facts + activation + work-item flag
 * sync) as an Excel upload, so everything downstream — dashboards, work
 * list, targets, history — treats it identically to a manual import.
 */
export async function runAirtableSync(): Promise<SyncResult> {
  if (running) {
    return {
      ok: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      warnings: [],
      error: "סנכרון כבר רץ ברקע — נסה שוב בעוד רגע.",
    };
  }
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const config = loadAirtableConfig();
    const { facts: raw, warnings } = await fetchAirtableFacts(config);
    const facts = dedupe(raw);
    if (!facts.length) throw new Error("לא נמצאו שורות מכירה תקינות ב-Airtable.");

    const negativeRows = facts.filter((f) => f.qty < 0).length;
    const latestMonth = facts.reduce((max, f) => (f.ym > max ? f.ym : max), facts[0]!.ym);
    const agentsCount = new Set(facts.map((f) => f.agent)).size;

    const { data: importRow, error: importErr } = await supabaseAdmin
      .from("imports")
      .insert({
        file_name: `סנכרון Airtable — ${new Date().toLocaleString("he-IL")}`,
        uploaded_by: null,
        uploaded_by_name: "סנכרון אוטומטי (Airtable)",
        row_count: facts.length,
        latest_month: latestMonth,
        agents_count: agentsCount,
        is_active: false,
      })
      .select("id")
      .single();
    if (importErr || !importRow) throw new Error(importErr?.message ?? "יצירת רשומת הייבוא נכשלה");

    const chunkSize = 800;
    for (let i = 0; i < facts.length; i += chunkSize) {
      const chunk = facts.slice(i, i + chunkSize).map((f) => ({ ...f, import_id: importRow.id }));
      const { error } = await supabaseAdmin.from("sales_facts").insert(chunk);
      if (error) throw new Error(`הוספת רשומות מכירה נכשלה: ${error.message}`);
    }

    // Activation stays last and atomic: if anything above throws, the
    // previously active import is untouched and still serves the app.
    await supabaseAdmin.from("imports").update({ is_active: false }).neq("id", importRow.id);
    const { error: activateErr } = await supabaseAdmin
      .from("imports")
      .update({ is_active: true })
      .eq("id", importRow.id);
    if (activateErr) throw new Error(activateErr.message);

    const { error: rpcErr } = await supabaseAdmin.rpc("sync_work_item_flags", { _import_id: importRow.id });
    if (rpcErr) throw new Error(`עדכון דגלי רשומות עבודה נכשל: ${rpcErr.message}`);

    lastResult = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      importId: importRow.id as string,
      rowCount: facts.length,
      latestMonth,
      agentsCount,
      negativeRows,
      warnings,
    };
    return lastResult;
  } catch (err) {
    lastResult = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      warnings: [],
      error: err instanceof Error ? err.message : "שגיאה לא ידועה בסנכרון",
    };
    return lastResult;
  } finally {
    running = false;
  }
}
