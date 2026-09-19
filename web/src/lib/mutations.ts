import { supabase } from "@/lib/supabase";
import type { Fact } from "@/lib/analysis";

async function currentProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("לא מחובר");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return { userId, who: profile?.full_name ?? profile?.email ?? null };
}

export async function saveWorkItem(input: {
  agent: string;
  entityId: string;
  product: string;
  customer: string | null;
  status: string;
  note: string | null;
  managerNote?: string | null;
  task?: string | null;
  owner?: string | null;
  nextFollowUp?: string | null;
  handledAt: string | null;
}) {
  const { userId, who } = await currentProfile();
  const { error } = await supabase.from("work_items").upsert(
    {
      agent: input.agent,
      entity_id: input.entityId,
      product: input.product,
      customer: input.customer,
      status: input.status,
      agent_note: input.note,
      manager_note: input.managerNote ?? null,
      task: input.task ?? null,
      owner: input.owner ?? null,
      next_follow_up: input.nextFollowUp ?? null,
      handled_at: input.handledAt,
      updated_by: userId,
      updated_by_name: who,
    },
    { onConflict: "agent,entity_id,product" },
  );
  if (error) throw new Error(error.message);
}

export async function saveTarget(input: {
  agent: string;
  product: string;
  year: number;
  targetQty: number;
  recommendedQty: number | null;
  reason: string | null;
}) {
  const { userId, who } = await currentProfile();

  const { data: existing } = await supabase
    .from("targets")
    .select("id, target_qty")
    .eq("agent", input.agent)
    .eq("product", input.product)
    .eq("year", input.year)
    .maybeSingle();

  const { data: saved, error } = await supabase
    .from("targets")
    .upsert(
      {
        agent: input.agent,
        product: input.product,
        year: input.year,
        target_qty: input.targetQty,
        recommended_qty: input.recommendedQty,
        note: input.reason,
        set_by: userId,
        set_by_name: who,
      },
      { onConflict: "agent,product,year" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("target_history").insert({
    target_id: saved.id,
    agent: input.agent,
    product: input.product,
    year: input.year,
    old_qty: existing?.target_qty ?? null,
    new_qty: input.targetQty,
    reason: input.reason,
    changed_by: userId,
    changed_by_name: who,
  });
}

export async function getTargetHistory(agent: string, product: string, year: number) {
  const { data, error } = await supabase
    .from("target_history")
    .select("old_qty, new_qty, reason, changed_by_name, created_at")
    .eq("agent", agent)
    .eq("product", product)
    .eq("year", year)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ---------------- imports ---------------- */

export async function listImports() {
  const { data, error } = await supabase
    .from("imports")
    .select("id, file_name, latest_month, row_count, agents_count, is_active, created_at, uploaded_by_name")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getImportContext() {
  const [{ data: imp }, { data: items }] = await Promise.all([
    supabase.from("imports").select("id, file_name, latest_month, row_count").eq("is_active", true).maybeSingle(),
    supabase.from("work_items").select("agent, entity_id, product"),
  ]);
  return {
    active: imp ?? null,
    workItemKeys: (items ?? []).map((i) => `${i.agent}|${i.entity_id}|${i.product}`),
  };
}

export async function createImport(input: {
  fileName: string;
  latestMonth: string;
  rowCount: number;
  agentsCount: number;
}) {
  const { userId, who } = await currentProfile();
  const { data: row, error } = await supabase
    .from("imports")
    .insert({
      file_name: input.fileName,
      latest_month: input.latestMonth,
      row_count: input.rowCount,
      agents_count: input.agentsCount,
      uploaded_by: userId,
      uploaded_by_name: who,
      is_active: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function pushFacts(importId: string, rows: Fact[]) {
  const payload = rows.map((r) => ({
    import_id: importId,
    product: r.product,
    entity_id: r.entity_id,
    customer: r.customer,
    channel: r.channel,
    agent: r.agent,
    ym: r.ym,
    qty: r.qty,
  }));
  const { error } = await supabase.from("sales_facts").insert(payload);
  if (error) throw new Error(error.message);
}

/**
 * Activation is the single atomic step that flips the "active" dataset —
 * everything before this call (create + chunked pushFacts) can fail or be
 * interrupted without ever touching what users see, since the previous
 * import keeps is_active=true until this succeeds.
 */
export async function activateImport(importId: string) {
  await supabase.from("imports").update({ is_active: false }).neq("id", importId);
  const { error } = await supabase.from("imports").update({ is_active: true }).eq("id", importId);
  if (error) throw new Error(error.message);
}

export async function deleteImport(importId: string) {
  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) throw new Error(error.message);
}

export async function syncWorkItemFlags(importId: string) {
  const { error } = await supabase.rpc("sync_work_item_flags", { _import_id: importId });
  if (error) throw new Error(error.message);
}
