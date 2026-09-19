import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { FieldGuide } from "@/components/sales/FieldGuide";
import { emptyFilters, FiltersBar, toQuery, type FilterState } from "@/components/sales/FiltersBar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useAnalysis } from "@/lib/use-app-data";
import { fmt, GROWTH_RATE, UNASSIGNED_AGENT } from "@/lib/analysis";
import { saveTarget } from "@/lib/mutations";

type Cell = {
  agent: string;
  product: string;
  prev: number;
  ytd: number;
  recommended: number;
  approved: number | null;
  note: string | null;
  setBy: string | null;
};

export function TargetsPage() {
  const { me, loading } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const query = useMemo(() => toQuery(filters), [filters]);
  const { derived, isLoading } = useAnalysis(query);

  const [editing, setEditing] = useState<Cell | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const cells = useMemo(() => {
    if (!derived) return [];
    const targetMap = new Map(
      derived.targets.filter((t) => t.year === derived.period.year).map((t) => [`${t.agent}|${t.product}`, t]),
    );
    const acc = new Map<string, Cell>();
    for (const r of derived.rows) {
      // Unassigned rows have no agent to hold accountable, so they get no
      // recommended or approved target — matches their exclusion from
      // agent rankings and attainment everywhere else in the app.
      if (r.agent === UNASSIGNED_AGENT) continue;
      const key = `${r.agent}|${r.product}`;
      let c = acc.get(key);
      if (!c) {
        const t = targetMap.get(key);
        c = {
          agent: r.agent,
          product: r.product,
          prev: 0,
          ytd: 0,
          recommended: 0,
          approved: t ? Number(t.target_qty) : null,
          note: t?.note ?? null,
          setBy: t?.set_by_name ?? null,
        };
        acc.set(key, c);
      }
      c.prev += r.qtyPrevFull;
      c.ytd += r.qtyYtdFull;
    }
    for (const c of acc.values()) c.recommended = Math.round(c.prev * (1 + GROWTH_RATE));
    return [...acc.values()]
      .filter((c) => c.prev > 0 || c.ytd > 0)
      .sort((a, b) => a.agent.localeCompare(b.agent, "he") || b.recommended - a.recommended);
  }, [derived]);

  async function submit() {
    if (!editing || !derived) return;
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("יש להזין מספר יחידות תקין");
      return;
    }
    setBusy(true);
    try {
      await saveTarget({
        agent: editing.agent,
        product: editing.product,
        year: derived.period.year,
        targetQty: qty,
        recommendedQty: editing.recommended,
        reason: reason || null,
      });
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast.success("היעד נשמר");
      setEditing(null);
      setReason("");
    } catch (err) {
      toast.error("שמירת היעד נכשלה", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !me) return <Skeleton className="m-8 h-64" />;

  return (
    <AppShell me={me}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">יעדים {derived?.period.year ?? ""}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            היעד המומלץ = כל היחידות שנמכרו ב-{derived?.period.prevYear ?? "שנת ההשוואה"} בתוספת 15%. המספרים כאן
            שנתיים מלאים ואינם מושפעים מסינון החודשים.
          </p>
        </div>

        <FiltersBar
          value={filters}
          onChange={setFilters}
          agents={(derived?.agentNames ?? []).filter((a) => a !== UNASSIGNED_AGENT)}
          products={derived?.productNames ?? []}
          years={derived?.years ?? []}
          showAgent={me.isManager}
        />

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">סוכן</th>
                  <th className="px-4 py-2 text-right font-medium">מוצר</th>
                  <th className="px-4 py-2 text-right font-medium">יחידות {derived?.period.prevYear ?? ""}</th>
                  <th className="px-4 py-2 text-right font-medium">יחידות {derived?.period.year ?? ""} עד כה</th>
                  <th className="px-4 py-2 text-right font-medium">יעד מומלץ</th>
                  <th className="px-4 py-2 text-right font-medium">יעד מאושר</th>
                  <th className="px-4 py-2 text-right font-medium">מימוש</th>
                  <th className="px-4 py-2 text-right font-medium">נקבע ע״י</th>
                  {me.isManager ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => {
                  const effective = c.approved ?? c.recommended;
                  const progress = effective > 0 ? c.ytd / effective : null;
                  return (
                    <tr key={`${c.agent}|${c.product}`} className="border-t border-border hover:bg-muted/40">
                      <td className="px-4 py-2 font-medium">{c.agent}</td>
                      <td className="px-4 py-2">{c.product}</td>
                      <td className="num px-4 py-2">{fmt(c.prev)}</td>
                      <td className="num px-4 py-2">{fmt(c.ytd)}</td>
                      <td className="num px-4 py-2 text-muted-foreground">{fmt(c.recommended)}</td>
                      <td className="num px-4 py-2 font-semibold">
                        {c.approved === null ? <span className="text-xs font-normal text-muted-foreground">טרם אושר</span> : fmt(c.approved)}
                      </td>
                      <td className="num px-4 py-2">{progress === null ? "—" : `${Math.round(progress * 100)}%`}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {c.setBy ?? "—"}
                        {c.note ? <div className="mt-0.5">{c.note}</div> : null}
                      </td>
                      {me.isManager ? (
                        <td className="px-4 py-2 text-left">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(c);
                              setValue(String(c.approved ?? c.recommended));
                              setReason("");
                            }}
                          >
                            {c.approved === null ? "אישור יעד" : "עדכון"}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <FieldGuide only={["יעד מומלץ", "חסר ליעד", "נדרש לחודש"]} />
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              יעד {derived?.period.year} · {editing?.agent}
            </DialogTitle>
            <DialogDescription>
              {editing?.product} · מומלץ {fmt(editing?.recommended ?? 0)} יחידות
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qty">יעד שנתי (יחידות)</Label>
              <Input id="qty" dir="ltr" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">נימוק לשינוי</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="למשל: כניסת לקוח חדש משמעותי" />
            </div>
            <Button className="w-full" onClick={() => void submit()} disabled={busy}>
              שמירת יעד
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
