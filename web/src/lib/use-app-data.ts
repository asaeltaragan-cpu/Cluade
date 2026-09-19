import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildCustomerRows,
  derivePeriod,
  suggestTask,
  summarizeByAgent,
  summarizeUnassigned,
  type CustomerRow,
  type Fact,
} from "@/lib/analysis";
import type { Tables } from "@/lib/database.types";

export type WorkItem = Tables<"work_items">;
export type TargetRow = Tables<"targets">;
export type ImportRow = Tables<"imports">;

export type Snapshot = {
  importInfo: Pick<
    ImportRow,
    "id" | "file_name" | "latest_month" | "row_count" | "created_at" | "uploaded_by_name"
  > | null;
  facts: Fact[];
  workItems: WorkItem[];
  targets: TargetRow[];
};

async function fetchAllFacts(importId: string): Promise<Fact[]> {
  const all: Fact[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("sales_facts")
      .select("product, entity_id, customer, channel, agent, ym, qty")
      .eq("import_id", importId)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Fact[];
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}

export function useSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    staleTime: 30_000,
    queryFn: async (): Promise<Snapshot> => {
      const { data: imp } = await supabase
        .from("imports")
        .select("id, file_name, latest_month, row_count, created_at, uploaded_by_name")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!imp) return { importInfo: null, facts: [], workItems: [], targets: [] };

      const [facts, { data: workItems }, { data: targets }] = await Promise.all([
        fetchAllFacts(imp.id),
        supabase.from("work_items").select("*"),
        supabase.from("targets").select("*"),
      ]);

      return {
        importInfo: imp,
        facts,
        workItems: (workItems ?? []) as WorkItem[],
        targets: (targets ?? []) as TargetRow[],
      };
    },
  });
}

export type ActivityRow = Tables<"work_item_history">;

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    staleTime: 15_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from("work_item_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as ActivityRow[];
    },
  });
}

export type Filters = {
  agent?: string | undefined;
  product?: string | undefined;
  year?: number | undefined;
  compareYear?: number | undefined;
  fromMonth?: number | undefined;
  toMonth?: number | undefined;
  /** Row-inclusion filter: activity in any of these years. Empty/undefined = all years. */
  activeYears?: number[] | undefined;
};

export type EnrichedRow = CustomerRow & {
  status: string;
  note: string | null;
  managerNote: string | null;
  task: string | null;
  owner: string | null;
  nextFollowUp: string | null;
  handledAt: string | null;
  missingInLatest: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  suggestedTask: string;
  overdue: boolean;
};

export function useAnalysis(filters: Filters = {}) {
  const snapshot = useSnapshot();
  const { agent, product, year, compareYear, fromMonth, toMonth } = filters;
  const activeYearsKey = (filters.activeYears ?? []).join(",");

  const derived = useMemo(() => {
    const data = snapshot.data;
    if (!data?.importInfo?.latest_month) return null;

    const years = [...new Set(data.facts.map((f) => Number(f.ym.slice(0, 4))))].sort((a, b) => b - a);

    const period = derivePeriod(data.importInfo.latest_month, {
      year,
      prevYear: compareYear,
      fromMonth,
      toMonth,
    });

    const rowsAll = buildCustomerRows(data.facts, period);
    const statusByKey = new Map(data.workItems.map((w) => [`${w.agent}|${w.entity_id}|${w.product}`, w]));
    const today = new Date().toISOString().slice(0, 10);

    const enriched: EnrichedRow[] = rowsAll.map((r) => {
      const w = statusByKey.get(r.key);
      const status = w?.status ?? "טרם טופל";
      const nextFollowUp = w?.next_follow_up ?? null;
      return {
        ...r,
        status,
        note: w?.agent_note ?? null,
        managerNote: w?.manager_note ?? null,
        task: w?.task ?? null,
        owner: w?.owner ?? null,
        nextFollowUp,
        handledAt: w?.handled_at ?? null,
        missingInLatest: w?.missing_in_latest ?? false,
        updatedBy: w?.updated_by_name ?? null,
        updatedAt: w?.updated_at ?? null,
        suggestedTask: suggestTask(r),
        overdue: !!nextFollowUp && nextFollowUp < today && status !== "הושלם" && status !== "לא רלוונטי",
      };
    });

    const yearSet = new Set(activeYearsKey ? activeYearsKey.split(",") : []);
    const keysInYears = yearSet.size
      ? new Set(
          data.facts
            .filter((f) => Number(f.qty) > 0 && yearSet.has(f.ym.slice(0, 4)))
            .map((f) => `${f.agent}|${f.entity_id}|${f.product}`),
        )
      : null;

    const rows = enriched.filter(
      (r) =>
        (!agent || r.agent === agent) &&
        (!product || r.product === product) &&
        (!keysInYears || keysInYears.has(r.key)),
    );

    const facts = data.facts.filter(
      (f) => (!agent || f.agent === agent) && (!product || f.product === product),
    );

    return {
      period,
      years,
      rows,
      allRows: enriched,
      agents: summarizeByAgent(rows),
      unassigned: summarizeUnassigned(rows),
      agentNames: [...new Set(enriched.map((r) => r.agent))].sort(),
      productNames: [...new Set(data.facts.map((f) => f.product))].sort(),
      facts,
      targets: data.targets,
      importInfo: data.importInfo,
    };
  }, [snapshot.data, agent, product, year, compareYear, fromMonth, toMonth, activeYearsKey]);

  return { ...snapshot, derived };
}
