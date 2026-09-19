import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Delta, GroupBadge, Kpi, MonthlyChart } from "@/components/sales/Bits";
import { FieldGuide } from "@/components/sales/FieldGuide";
import { emptyFilters, FiltersBar, toQuery, type FilterState } from "@/components/sales/FiltersBar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useAnalysis } from "@/lib/use-app-data";
import { fmt, monthlySeries, periodLabel, UNASSIGNED_AGENT } from "@/lib/analysis";

export function AgentDetailPage() {
  const { agent: rawAgent } = useParams<{ agent: string }>();
  const agent = decodeURIComponent(rawAgent ?? "");
  const { me, loading } = useAuth();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const query = useMemo(() => ({ ...toQuery(filters), agent }), [filters, agent]);
  const { derived, isLoading } = useAnalysis(query);

  const data = useMemo(() => {
    if (!derived) return null;
    // Unassigned rows are a work queue, not a rankable agent — this page never
    // shows a normal per-agent dashboard for it, matching the exclusion used
    // for agent rankings and targets everywhere else. derived.rows is already
    // scoped to `agent` via the query filter, so this agent's own summary is
    // just derived.agents (computed with includeUnassigned so this specific
    // page still works if ever pointed at a non-ranked agent name).
    const summary = agent === UNASSIGNED_AGENT ? undefined : derived.agents.find((a) => a.agent === agent);
    const series = monthlySeries(derived.facts, derived.period, { agent });
    return { rows: derived.rows, summary, series };
  }, [derived, agent]);

  if (loading || !me) return <Skeleton className="m-8 h-64" />;

  return (
    <AppShell me={me}>
      {agent === UNASSIGNED_AGENT ? (
        <div className="space-y-4">
          <Link to="/dashboard" className="text-xs text-primary hover:underline">
            ← חזרה לדשבורד
          </Link>
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm">
            <p className="font-semibold">«{UNASSIGNED_AGENT}» אינו סוכן</p>
            <p className="mt-2 text-muted-foreground">
              זהו תיוג ללקוחות שבקובץ המקור לא שויכו לסוכן. אין לו יעדים, דירוג או דשבורד אישי — הטיפול בלקוחות
              האלה נעשה ב
              <Link to="/work" className="text-primary underline">
                רשימת העבודה
              </Link>
              .
            </p>
          </div>
        </div>
      ) : isLoading || !derived || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          <div>
            <Link to="/dashboard" className="text-xs text-primary hover:underline">
              ← חזרה לדשבורד
            </Link>
            <h1 className="mt-2 text-2xl font-bold">{agent}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {derived.period.year} · {periodLabel(derived.period)} · השוואה מול {derived.period.prevYear}
            </p>
          </div>

          <FiltersBar
            value={filters}
            onChange={setFilters}
            agents={derived.agentNames}
            products={derived.productNames}
            years={derived.years}
            showAgent={false}
          />

          {!data.summary ? (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm">אין נתונים בסינון הנוכחי.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label={`יחידות ${derived.period.year}`} value={fmt(data.summary.qtyYtd)} hint={periodLabel(derived.period)} />
                <Kpi label={`יחידות ${derived.period.prevYear}`} value={fmt(data.summary.qtyPrev)} hint="אותם חודשים" />
                <Kpi label="יעד מומלץ" value={fmt(data.summary.recommended)} hint={`${derived.period.prevYear} + 15%`} />
                <Kpi
                  label="ירדו / נעלמו"
                  value={fmt(data.summary.groups["ירד"] + data.summary.groups["נעלם"])}
                  tone="warn"
                  hint={`מתוך ${fmt(data.summary.customers)} שורות לקוח-מוצר`}
                />
              </div>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">
                  יחידות לפי חודש — {derived.period.year} מול {derived.period.prevYear}
                </h2>
                <MonthlyChart data={data.series} prevYear={derived.period.prevYear} year={derived.period.year} />
              </section>

              <section className="rounded-xl border border-border bg-card shadow-sm">
                <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">פירוט לפי מוצר</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-right font-medium">מוצר</th>
                        <th className="px-4 py-2 text-right font-medium">יחידות {derived.period.prevYear}</th>
                        <th className="px-4 py-2 text-right font-medium">יחידות {derived.period.year}</th>
                        <th className="px-4 py-2 text-right font-medium">יעד מומלץ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.summary.byProduct)
                        .sort((a, b) => b[1].ytd - a[1].ytd)
                        .map(([product, p]) => (
                          <tr key={product} className="border-t border-border hover:bg-muted/40">
                            <td className="px-4 py-2 font-medium">{product}</td>
                            <td className="num px-4 py-2">{fmt(p.prev)}</td>
                            <td className="num px-4 py-2 font-semibold">{fmt(p.ytd)}</td>
                            <td className="num px-4 py-2">{fmt(p.recommended)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card shadow-sm">
                <h2 className="flex items-center justify-between border-b border-border px-5 py-3 text-sm font-semibold">
                  לקוחות לפי עדיפות
                  <Link to="/work" className="text-xs font-normal text-primary hover:underline">
                    מעבר לרשימת העבודה לעדכון ←
                  </Link>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium">עדיפות</th>
                        <th className="px-3 py-2 text-right font-medium">לקוח</th>
                        <th className="px-3 py-2 text-right font-medium">מוצר</th>
                        <th className="px-3 py-2 text-right font-medium">קבוצה</th>
                        <th className="px-3 py-2 text-right font-medium">{derived.period.prevYear}</th>
                        <th className="px-3 py-2 text-right font-medium">{derived.period.year}</th>
                        <th className="px-3 py-2 text-right font-medium">שינוי בקצב</th>
                        <th className="px-3 py-2 text-right font-medium">רכישה אחרונה</th>
                        <th className="px-3 py-2 text-right font-medium">חסר ליעד</th>
                        <th className="px-3 py-2 text-right font-medium">משימה</th>
                        <th className="px-3 py-2 text-right font-medium">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice(0, 300).map((r) => (
                        <tr key={r.key} className="border-t border-border hover:bg-muted/40">
                          <td className="num px-3 py-2 font-semibold">{r.score}</td>
                          <td className="px-3 py-2">{r.customer}</td>
                          <td className="px-3 py-2">{r.product}</td>
                          <td className="px-3 py-2">
                            <GroupBadge group={r.group} />
                          </td>
                          <td className="num px-3 py-2">{fmt(r.qtyPrev)}</td>
                          <td className="num px-3 py-2">{fmt(r.qtyYtd)}</td>
                          <td className="num px-3 py-2">
                            {r.paceChange === null ? <span className="text-muted-foreground">—</span> : <Delta value={r.paceChange} />}
                          </td>
                          <td className="num px-3 py-2">{r.lastPurchase ?? "—"}</td>
                          <td className="num px-3 py-2">{fmt(r.neededRest)}</td>
                          <td className="px-3 py-2 text-xs">{r.task ?? r.suggestedTask}</td>
                          <td className="px-3 py-2 text-xs">{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <FieldGuide />
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
