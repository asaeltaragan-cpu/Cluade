import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { Delta, Kpi, MonthlyChart } from "@/components/sales/Bits";
import { FieldGuide } from "@/components/sales/FieldGuide";
import { emptyFilters, FiltersBar, toQuery, type FilterState } from "@/components/sales/FiltersBar";
import { useAuth } from "@/lib/auth";
import { useAnalysis } from "@/lib/use-app-data";
import { fmt, monthlySeries, periodLabel } from "@/lib/analysis";

export function DashboardPage() {
  const { me, loading } = useAuth();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const query = useMemo(() => toQuery(filters), [filters]);
  const { derived, isLoading } = useAnalysis(query);

  if (loading || !me) {
    return (
      <div className="min-h-screen space-y-4 bg-surface p-8">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <AppShell me={me}>
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !derived ? (
        <EmptyState isManager={me.isManager} />
      ) : (
        <div className="space-y-6">
          <FiltersBar
            value={filters}
            onChange={setFilters}
            agents={derived.agentNames}
            products={derived.productNames}
            years={derived.years}
            showAgent={me.isManager}
          />
          <Body derived={derived} isManager={me.isManager} />
        </div>
      )}
    </AppShell>
  );
}

function EmptyState({ isManager }: { isManager: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <h2 className="text-lg font-semibold">אין עדיין נתונים</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {isManager ? "העלו את קובץ המקור הדו-שבועי כדי להתחיל." : "מנהלת המכירות עדיין לא העלתה את קובץ המקור."}
      </p>
      {isManager ? (
        <Link to="/import" className="mt-4 inline-block text-sm font-medium text-primary underline">
          מעבר להעלאת נתונים
        </Link>
      ) : null}
    </div>
  );
}

type Derived = NonNullable<ReturnType<typeof useAnalysis>["derived"]>;

function Body({ derived, isManager }: { derived: Derived; isManager: boolean }) {
  const { period, rows, agents, unassigned, facts, importInfo, productNames } = derived;

  const totals = useMemo(() => {
    const prev = rows.reduce((s, r) => s + r.qtyPrev, 0);
    const ytd = rows.reduce((s, r) => s + r.qtyYtd, 0);
    const recommended = rows.reduce((s, r) => s + r.annualTarget, 0);
    const ytdFull = rows.reduce((s, r) => s + r.qtyYtdFull, 0);
    const openTasks = rows.filter(
      (r) => r.status !== "הושלם" && r.status !== "לא רלוונטי" && (r.task || r.nextFollowUp),
    ).length;
    const overdue = rows.filter((r) => r.overdue).length;
    const untouched = rows.filter(
      (r) => (r.group === "ירד" || r.group === "נעלם") && r.status === "טרם טופל",
    ).length;
    const pacePrev = prev / Math.max(1, period.prevMonths);
    const paceNow = ytd / Math.max(1, period.curMonths);
    return {
      prev,
      ytd,
      recommended,
      openTasks,
      overdue,
      untouched,
      change: pacePrev > 0 ? paceNow / pacePrev - 1 : null,
      progress: recommended > 0 ? ytdFull / recommended : null,
    };
  }, [rows, period]);

  const series = useMemo(() => monthlySeries(facts, period), [facts, period]);

  const byProduct = useMemo(() => {
    return productNames
      .map((p) => {
        const list = rows.filter((r) => r.product === p);
        const prev = list.reduce((s, r) => s + r.qtyPrev, 0);
        const ytd = list.reduce((s, r) => s + r.qtyYtd, 0);
        const recommended = list.reduce((s, r) => s + r.annualTarget, 0);
        const pacePrev = prev / Math.max(1, period.prevMonths);
        const paceNow = ytd / Math.max(1, period.curMonths);
        return {
          product: p,
          prev,
          ytd,
          recommended,
          customers: list.length,
          change: pacePrev > 0 ? paceNow / pacePrev - 1 : null,
        };
      })
      .filter((p) => p.prev > 0 || p.ytd > 0)
      .sort((a, b) => b.ytd - a.ytd);
  }, [rows, period, productNames]);

  const groups = useMemo(() => {
    const g = { ירד: 0, נעלם: 0, "חדש/חוזר": 0, עלה: 0, יציב: 0 } as Record<string, number>;
    for (const r of rows) g[r.group] = (g[r.group] ?? 0) + 1;
    return g;
  }, [rows]);

  const label = periodLabel(period);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">
          דשבורד מכירות {period.year} · {label}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          השוואה מול {period.prevYear} באותם חודשים · נתונים עד {period.latestYm} · מקור: {importInfo?.file_name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`יחידות ${period.year} · ${label}`} value={fmt(totals.ytd)} hint={`מול ${fmt(totals.prev)} ב-${period.prevYear}`} />
        <Kpi
          label="שינוי בקצב מול שנת ההשוואה"
          value={<Delta value={totals.change} />}
          hint={`ממוצע ${fmt(totals.ytd / Math.max(1, period.curMonths), 1)} לחודש מול ${fmt(totals.prev / Math.max(1, period.prevMonths), 1)}`}
        />
        <Kpi
          label={`יעד מומלץ ${period.year}`}
          value={fmt(totals.recommended)}
          hint={`${period.prevYear} + 15% · מימוש ${totals.progress === null ? "—" : `${Math.round(totals.progress * 100)}%`}`}
        />
        <Kpi label="לקוחות לטיפול" value={fmt(totals.untouched)} tone={totals.untouched > 0 ? "warn" : "good"} hint="ירדו או נעלמו וטרם טופלו" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="משימות פתוחות" value={fmt(totals.openTasks)} hint="משימה או תאריך מעקב שהוזנו" />
        <Kpi label="משימות באיחור" value={fmt(totals.overdue)} tone={totals.overdue > 0 ? "warn" : "good"} hint="עבר תאריך המעקב" />
        <Kpi label="לקוחות חדשים / חוזרים" value={fmt(groups["חדש/חוזר"] ?? 0)} tone="good" />
        <Kpi label="לקוחות בצמיחה" value={fmt(groups["עלה"] ?? 0)} tone="good" />
      </div>

      {isManager && unassigned.customers > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold">מכירות ללא שיוך סוכן</p>
          <p className="mt-1 text-muted-foreground">
            <span className="num font-semibold text-foreground">{fmt(unassigned.customers)}</span> שילובי לקוח-מוצר,{" "}
            <span className="num font-semibold text-foreground">{fmt(unassigned.qtyYtd)}</span> יחידות בתקופה הנבחרת (מול{" "}
            <span className="num">{fmt(unassigned.qtyPrev)}</span> ב-{period.prevYear}). נכללות בסך המכירות הכללי למעלה, אך
            אינן חלק מדירוג הסוכנים או מיעדי הסוכנים — לטיפול ושיוך דרך{" "}
            <Link to="/work" className="text-primary underline">
              רשימת העבודה
            </Link>
            .
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">
          יחידות לפי חודש — {period.year} מול {period.prevYear}
        </h2>
        <MonthlyChart data={series} prevYear={period.prevYear} year={period.year} />
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
          {isManager ? "ביצועים לפי סוכן" : "הביצועים שלי"}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-right font-medium">סוכן</th>
                <th className="px-4 py-2 text-right font-medium">יחידות {period.prevYear}</th>
                <th className="px-4 py-2 text-right font-medium">יחידות {period.year}</th>
                <th className="px-4 py-2 text-right font-medium">שינוי בקצב</th>
                <th className="px-4 py-2 text-right font-medium">יעד מומלץ</th>
                <th className="px-4 py-2 text-right font-medium">ירדו / נעלמו</th>
                <th className="px-4 py-2 text-right font-medium">לקוחות</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const pacePrev = a.qtyPrev / Math.max(1, period.prevMonths);
                const paceNow = a.qtyYtd / Math.max(1, period.curMonths);
                const change = pacePrev > 0 ? paceNow / pacePrev - 1 : null;
                return (
                  <tr key={a.agent} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">
                      <Link to={`/agents/${encodeURIComponent(a.agent)}`} className="text-primary hover:underline">
                        {a.agent}
                      </Link>
                    </td>
                    <td className="num px-4 py-2">{fmt(a.qtyPrev)}</td>
                    <td className="num px-4 py-2 font-semibold">{fmt(a.qtyYtd)}</td>
                    <td className="num px-4 py-2">
                      <Delta value={change} />
                    </td>
                    <td className="num px-4 py-2">{fmt(a.recommended)}</td>
                    <td className="num px-4 py-2">{fmt(a.groups["ירד"] + a.groups["נעלם"])}</td>
                    <td className="num px-4 py-2">{fmt(a.customers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">ביצועים לפי מוצר</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-right font-medium">מוצר</th>
                <th className="px-4 py-2 text-right font-medium">יחידות {period.prevYear}</th>
                <th className="px-4 py-2 text-right font-medium">יחידות {period.year}</th>
                <th className="px-4 py-2 text-right font-medium">שינוי בקצב</th>
                <th className="px-4 py-2 text-right font-medium">יעד מומלץ</th>
                <th className="px-4 py-2 text-right font-medium">לקוחות</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((p) => (
                <tr key={p.product} className="border-t border-border hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{p.product}</td>
                  <td className="num px-4 py-2">{fmt(p.prev)}</td>
                  <td className="num px-4 py-2 font-semibold">{fmt(p.ytd)}</td>
                  <td className="num px-4 py-2">
                    <Delta value={p.change} />
                  </td>
                  <td className="num px-4 py-2">{fmt(p.recommended)}</td>
                  <td className="num px-4 py-2">{fmt(p.customers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FieldGuide only={["כמות בתקופה", "שינוי בקצב", "יעד מומלץ", "קבוצה", "עדיפות", "מעקב הבא"]} />
    </div>
  );
}
