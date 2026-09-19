import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { GroupBadge } from "@/components/sales/Bits";
import { FieldGuide } from "@/components/sales/FieldGuide";
import { emptyFilters, FiltersBar, toQuery, type FilterState } from "@/components/sales/FiltersBar";
import { MultiSelect } from "@/components/sales/MultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useActivity, useAnalysis, type EnrichedRow } from "@/lib/use-app-data";
import { fmt, GROUPS, pct, periodLabel, STATUSES } from "@/lib/analysis";
import { saveWorkItem } from "@/lib/mutations";

type Draft = {
  task: string;
  owner: string;
  nextFollowUp: string;
  note: string;
  managerNote: string;
};

const FIELD_LABELS: Record<string, string> = {
  status: "סטטוס",
  task: "משימה",
  owner: "אחראי",
  next_follow_up: "תאריך מעקב",
  agent_note: "הערת סוכן",
  manager_note: "הערת הנהלה",
  handled_at: "תאריך טיפול",
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Follow-up window — from today through the end of the selected range. */
function followWindow(mode: string): { from: string; to: string } | null {
  const now = new Date();
  const from = iso(now);
  if (mode === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return { from, to: iso(d) };
  }
  if (mode === "month") return { from, to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (mode === "quarter") {
    const endMonth = Math.floor(now.getMonth() / 3) * 3 + 3;
    return { from, to: iso(new Date(now.getFullYear(), endMonth, 0)) };
  }
  return null;
}

export function WorkPage() {
  const { me, loading } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const query = useMemo(() => toQuery(filters), [filters]);
  const { derived, isLoading } = useAnalysis(query);
  const activity = useActivity();

  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [followFilter, setFollowFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({ task: "", owner: "", nextFollowUp: "", note: "", managerNote: "" });

  const followRange = useMemo(() => followWindow(followFilter), [followFilter]);
  const groupKey = groupFilter.join(",");

  const rows = useMemo(() => {
    if (!derived) return [];
    const groups = groupKey ? new Set(groupKey.split(",")) : null;
    return derived.rows.filter((r) => {
      if (groups && !groups.has(r.group)) return false;
      if (followRange) {
        if (!r.nextFollowUp) return false;
        if (r.nextFollowUp < followRange.from || r.nextFollowUp > followRange.to) return false;
      }
      if (statusFilter === "overdue" ? !r.overdue : statusFilter !== "all" && r.status !== statusFilter) return false;
      if (priorityFilter === "high" && r.score < 60) return false;
      if (priorityFilter === "mid" && (r.score < 30 || r.score >= 60)) return false;
      if (priorityFilter === "low" && r.score >= 30) return false;
      if (search && !`${r.customer} ${r.entityId}`.includes(search)) return false;
      return true;
    });
  }, [derived, groupKey, followRange, statusFilter, priorityFilter, search]);

  function exportCsv() {
    const header = ["לקוח", "מזהה", "סוכן", "מוצר", "קבוצה", "כמות קודמת", "כמות נוכחית", "עדיפות", "סטטוס", "משימה", "מעקב הבא"];
    const body = rows.map((r) => [
      r.customer,
      r.entityId,
      r.agent,
      r.product,
      r.group,
      String(r.qtyPrev),
      String(r.qtyYtd),
      String(r.score),
      r.status,
      r.task ?? r.suggestedTask,
      r.nextFollowUp ?? "",
    ]);
    const csv = "﻿" + [header, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "רשימת-עבודה.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const openRow = (r: EnrichedRow) => {
    setOpenKey(openKey === r.key ? null : r.key);
    setDraft({
      task: r.task ?? "",
      owner: r.owner ?? r.agent,
      nextFollowUp: r.nextFollowUp ?? "",
      note: r.note ?? "",
      managerNote: r.managerNote ?? "",
    });
  };

  async function persist(row: EnrichedRow, patch: Partial<Draft> & { status?: string }) {
    const status = patch.status ?? row.status;
    setBusy(true);
    try {
      await saveWorkItem({
        agent: row.agent,
        entityId: row.entityId,
        product: row.product,
        customer: row.customer,
        status,
        note: patch.note !== undefined ? patch.note || null : row.note,
        managerNote: patch.managerNote !== undefined ? patch.managerNote || null : row.managerNote,
        task: patch.task !== undefined ? patch.task || null : row.task,
        owner: patch.owner !== undefined ? patch.owner || null : row.owner,
        nextFollowUp: patch.nextFollowUp !== undefined ? patch.nextFollowUp || null : row.nextFollowUp,
        handledAt: status === "טרם טופל" ? null : (row.handledAt ?? new Date().toISOString().slice(0, 10)),
      });
      await Promise.all([qc.invalidateQueries({ queryKey: ["snapshot"] }), qc.invalidateQueries({ queryKey: ["activity"] })]);
      toast.success("נשמר");
    } catch (err) {
      toast.error("השמירה נכשלה", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !me) return <Skeleton className="m-8 h-64" />;
  const isManager = me.isManager;
  const cols = isManager ? 15 : 14;

  return (
    <AppShell me={me}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">רשימת עבודה</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {derived ? `${derived.period.year} · ${periodLabel(derived.period)} · השוואה מול ${derived.period.prevYear}` : "לקוחות מתועדפים לטיפול"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            ייצוא לאקסל (מסונן)
          </Button>
        </div>

        <FiltersBar
          value={filters}
          onChange={setFilters}
          agents={derived?.agentNames ?? []}
          products={derived?.productNames ?? []}
          years={derived?.years ?? []}
          showAgent={isManager}
          extraDirty={groupFilter.length > 0 || followFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all" || search !== ""}
          onClearExtra={() => {
            setGroupFilter([]);
            setFollowFilter("all");
            setStatusFilter("all");
            setPriorityFilter("all");
            setSearch("");
          }}
        >
          <MultiSelect allLabel="כל הקבוצות" unit="קבוצות" options={GROUPS.map((g) => ({ value: g, label: g }))} selected={groupFilter} onChange={setGroupFilter} className="w-32" />
          <Select value={followFilter} onChange={(e) => setFollowFilter(e.target.value)} aria-label="מעקב הבא" className="w-36">
            <option value="all">כל המעקבים</option>
            <option value="week">מעקב השבוע</option>
            <option value="month">מעקב החודש</option>
            <option value="quarter">מעקב הרבעון</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="סטטוס" className="w-32">
            <option value="all">כל הסטטוסים</option>
            <option value="overdue">באיחור</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="עדיפות" className="w-32">
            <option value="all">כל העדיפויות</option>
            <option value="high">גבוהה (60+)</option>
            <option value="mid">בינונית (30-59)</option>
            <option value="low">נמוכה (עד 30)</option>
          </Select>
          <Input placeholder="חיפוש לקוח…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-44 text-xs" />
          <span className="text-xs text-muted-foreground">{fmt(rows.length)} שורות</span>
        </FiltersBar>

        {isLoading || !derived ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">עדיפות</th>
                  <th className="px-3 py-2 text-right font-medium">לקוח</th>
                  <th className="px-3 py-2 text-right font-medium">מוצר</th>
                  {isManager ? <th className="px-3 py-2 text-right font-medium">סוכן</th> : null}
                  <th className="px-3 py-2 text-right font-medium">קבוצה</th>
                  <th className="px-3 py-2 text-right font-medium">{derived.period.prevYear}</th>
                  <th className="px-3 py-2 text-right font-medium">{derived.period.year}</th>
                  <th className="px-3 py-2 text-right font-medium">ממוצע חודשי</th>
                  <th className="px-3 py-2 text-right font-medium">שינוי בקצב</th>
                  <th className="px-3 py-2 text-right font-medium">רכישה אחרונה</th>
                  <th className="px-3 py-2 text-right font-medium">חסר ליעד</th>
                  <th className="px-3 py-2 text-right font-medium">משימה</th>
                  <th className="px-3 py-2 text-right font-medium">מעקב הבא</th>
                  <th className="px-3 py-2 text-right font-medium">סטטוס</th>
                  <th className="px-3 py-2 text-right font-medium">עודכן</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 400).map((r) => {
                  const log = (activity.data ?? []).filter((a) => a.agent === r.agent && a.entity_id === r.entityId && a.product === r.product);
                  return (
                    <Fragment key={r.key}>
                      <tr className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => openRow(r)}>
                        <td className="num px-3 py-2 font-semibold">{r.score}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            {r.customer}
                            {r.missingInLatest ? (
                              <span title="לא נמצא ברענון האחרון" className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                לא ברענון האחרון
                              </span>
                            ) : null}
                          </div>
                          <div className="num text-xs text-muted-foreground">{r.entityId}</div>
                        </td>
                        <td className="px-3 py-2">{r.product}</td>
                        {isManager ? <td className="px-3 py-2">{r.agent}</td> : null}
                        <td className="px-3 py-2">
                          <GroupBadge group={r.group} />
                        </td>
                        <td className="num px-3 py-2">{fmt(r.qtyPrev)}</td>
                        <td className="num px-3 py-2 font-semibold">{fmt(r.qtyYtd)}</td>
                        <td className="num px-3 py-2">{fmt(r.avgYtd, 1)}</td>
                        <td className="num px-3 py-2">{r.paceChange === null ? "—" : pct(r.paceChange)}</td>
                        <td className="num px-3 py-2">{r.lastPurchase ?? "—"}</td>
                        <td className="num px-3 py-2">{fmt(r.neededRest)}</td>
                        <td className="max-w-48 px-3 py-2 text-xs">{r.task ?? <span className="text-muted-foreground">{r.suggestedTask}</span>}</td>
                        <td className="num px-3 py-2 text-xs">
                          {r.nextFollowUp ? <span className={r.overdue ? "font-semibold text-warning-foreground" : ""}>{r.nextFollowUp}</span> : "—"}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Select value={r.status} onChange={(e) => void persist(r, { status: e.target.value })} className="w-32">
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.updatedAt ? (
                            <>
                              <div>{new Date(r.updatedAt).toLocaleDateString("he-IL")}</div>
                              <div>{r.updatedBy ?? "—"}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>

                      {openKey === r.key ? (
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={cols} className="px-4 py-4">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <Label className="text-xs">משימה</Label>
                                <Input value={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.value })} placeholder={r.suggestedTask} />
                                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDraft({ ...draft, task: r.suggestedTask })}>
                                  שימוש בהמלצה: {r.suggestedTask}
                                </button>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">אחראי</Label>
                                <Input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">תאריך מעקב הבא</Label>
                                <Input type="date" value={draft.nextFollowUp} onChange={(e) => setDraft({ ...draft, nextFollowUp: e.target.value })} />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <Label className="text-xs">הערת הסוכן</Label>
                                <Textarea rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">הערת ההנהלה</Label>
                                <Textarea rows={3} disabled={!isManager} value={draft.managerNote} onChange={(e) => setDraft({ ...draft, managerNote: e.target.value })} />
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <Button size="sm" disabled={busy} onClick={() => void persist(r, draft)}>
                                שמירה
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setOpenKey(null)}>
                                סגירה
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                ערוץ: {r.channel ?? "—"} · ממוצע {derived.period.prevYear}: {fmt(r.avgPrev, 1)} · פער חודשים: {r.monthsGap ?? "—"} · נדרש לחודש: {fmt(r.monthlyNeed, 1)}
                              </span>
                            </div>

                            <div className="mt-4">
                              <div className="text-xs font-semibold">היסטוריית עדכונים ידניים</div>
                              {log.length === 0 ? (
                                <p className="mt-1 text-xs text-muted-foreground">אין עדיין עדכונים לשורה זו.</p>
                              ) : (
                                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                                  {log.slice(0, 10).map((a) => (
                                    <li key={a.id}>
                                      {new Date(a.created_at).toLocaleString("he-IL")} · {a.changed_by_name ?? "—"} · {FIELD_LABELS[a.field] ?? a.field}: {a.old_value ?? "—"} ← {a.new_value ?? "—"}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <FieldGuide />
      </div>
    </AppShell>
  );
}
