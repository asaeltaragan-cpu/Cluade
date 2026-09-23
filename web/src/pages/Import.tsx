import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { fmt } from "@/lib/analysis";
import { parseWorkbook, type ParseResult } from "@/lib/workbook-parse";
import {
  activateImport,
  createImport,
  deleteImport,
  getImportContext,
  listImports,
  pushFacts,
  syncWorkItemFlags,
} from "@/lib/mutations";

type Ctx = { active: { file_name: string; latest_month: string | null } | null; workItemKeys: string[] };

function downloadCsv(name: string, rows: string[][]) {
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const { me, loading } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<Ctx | null>(null);

  const imports = useQuery({ queryKey: ["imports"], queryFn: listImports });

  const selected = useMemo(() => {
    if (!parsed) return null;
    const facts = parsed.facts.filter((f) => !excluded.has(f.sheet));
    const months = [...new Set(facts.map((f) => f.ym))].sort();
    const agents = [...new Set(facts.map((f) => f.agent))].sort();
    const products = [...new Set(facts.map((f) => f.product))].sort();
    const keys = new Set(facts.map((f) => `${f.agent}|${f.entity_id}|${f.product}`));
    const existing = new Set(ctx?.workItemKeys ?? []);
    let preserved = 0;
    existing.forEach((k) => {
      if (keys.has(k)) preserved++;
    });
    let created = 0;
    keys.forEach((k) => {
      if (!existing.has(k)) created++;
    });
    const allProducts = new Set(parsed.facts.map((f) => f.product));
    const droppedProducts = [...allProducts].filter((p) => !products.includes(p)).sort();
    return {
      facts,
      months,
      agents,
      products,
      droppedProducts,
      preserved,
      created,
      missing: existing.size - preserved,
      latestMonth: months[months.length - 1] ?? "",
    };
  }, [parsed, excluded, ctx]);

  async function handleFile(file: File) {
    setStatus("קורא את כל הגיליונות בקובץ…");
    setParsed(null);
    try {
      const [result, context] = await Promise.all([parseWorkbook(file), getImportContext()]);
      if (!result.facts.length) throw new Error("לא נמצאו שורות מכירה באף גיליון");
      setParsed(result);
      setCtx(context);
      setFileName(file.name);
      setExcluded(new Set());
      setStatus("");
    } catch (err) {
      setStatus("");
      toast.error("קריאת הקובץ נכשלה", { description: err instanceof Error ? err.message : "שגיאה לא ידועה" });
    }
  }

  async function confirmImport() {
    if (!selected || !parsed) return;
    setProgress(0);
    try {
      const rows = selected.facts.map(({ sheet: _sheet, ...f }) => f);
      const importId = await createImport({
        fileName,
        latestMonth: selected.latestMonth,
        rowCount: rows.length,
        agentsCount: selected.agents.length,
      });
      const chunk = 800;
      for (let i = 0; i < rows.length; i += chunk) {
        await pushFacts(importId, rows.slice(i, i + chunk));
        setProgress(Math.min(99, Math.round(((i + chunk) / rows.length) * 100)));
      }
      // Activation is the single atomic switch: everything above can fail or
      // be interrupted without ever affecting what users currently see.
      await activateImport(importId);
      await syncWorkItemFlags(importId);
      setProgress(100);
      setParsed(null);
      setStatus("הרענון הושלם והנתונים פעילים. כל ההערות, הסטטוסים והמשימות נשמרו.");
      toast.success("הנתונים עודכנו");
      await qc.invalidateQueries();
    } catch (err) {
      setProgress(null);
      toast.error("ההעלאה נכשלה", { description: err instanceof Error ? err.message : "שגיאה לא ידועה" });
    }
  }

  if (loading || !me) return <Skeleton className="m-8 h-64" />;
  if (!me.isManager) {
    return (
      <AppShell me={me}>
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm">רק מנהלת המכירות והמנכ״ל יכולים להעלות נתונים.</p>
      </AppShell>
    );
  }

  return (
    <AppShell me={me}>
      <div className="space-y-7">
        <div>
          <h1 className="text-2xl font-bold">העלאת קובץ מקור</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            המערכת סורקת את כל הגיליונות בקובץ, מזהה את העמודות והחודשים לבד, ומציגה תצוגה מקדימה לאישור. הנתונים
            הקיימים נשארים פעילים עד שתאשר.
          </p>
        </div>

        {!parsed ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={progress !== null && progress < 100}>
              בחירת קובץ אקסל
            </Button>
            {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
            {progress !== null ? <div className="mx-auto mt-4 h-2 max-w-sm overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div> : null}
          </div>
        ) : null}

        {parsed && selected ? (
          <div className="space-y-5">
            {selected.droppedProducts.length ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <p className="mb-1 font-semibold">מוצרים שלא ייקלטו בבחירה הנוכחית</p>
                <p className="text-muted-foreground">
                  המוצרים {selected.droppedProducts.join(", ")} קיימים בקובץ אך הגיליונות שלהם אינם מסומנים לקליטה. אם
                  תאשר כך — הם לא יופיעו בדשבורד.
                </p>
              </div>
            ) : null}

            {parsed.warnings.length ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
                <p className="mb-1 font-semibold">שים לב</p>
                <ul className="list-disc space-y-1 pr-5">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <section className="rounded-xl border border-border bg-card shadow-sm">
              <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">גיליונות שנסרקו ({parsed.sheets.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-right font-medium">לקליטה</th>
                      <th className="px-4 py-2 text-right font-medium">גיליון</th>
                      <th className="px-4 py-2 text-right font-medium">סוג</th>
                      <th className="px-4 py-2 text-right font-medium">שורות</th>
                      <th className="px-4 py-2 text-right font-medium">חודשים</th>
                      <th className="px-4 py-2 text-right font-medium">רשומות שייקלטו</th>
                      <th className="px-4 py-2 text-right font-medium">הערה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.sheets.map((s) => (
                      <tr key={s.name} className="border-t border-border">
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            disabled={s.kind === "ignored" || s.kind === "aggregate" || s.facts === 0}
                            checked={s.facts > 0 && !excluded.has(s.name)}
                            onChange={(e) => {
                              const next = new Set(excluded);
                              if (e.target.checked) next.delete(s.name);
                              else next.add(s.name);
                              setExcluded(next);
                            }}
                          />
                        </td>
                        <td className="px-4 py-2 font-medium">{s.name}</td>
                        <td className="px-4 py-2">
                          {s.kind === "unified" ? "מאוחד" : s.kind === "product" ? "מוצר" : s.kind === "aggregate" ? "תצוגה מקובצת" : "לא נקלט"}
                        </td>
                        <td className="num px-4 py-2">{fmt(s.dataRows)}</td>
                        <td className="num px-4 py-2">{s.months || "—"}</td>
                        <td className="num px-4 py-2">{fmt(s.facts)}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "רשומות מכירה", value: fmt(selected.facts.length) },
                { label: "טווח חודשים", value: selected.months.length ? `${selected.months[0]} — ${selected.latestMonth}` : "—" },
                { label: "סוכנים", value: fmt(selected.agents.length) },
                { label: "מוצרים", value: fmt(selected.products.length) },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="num mt-1 text-lg font-semibold">{c.value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 text-sm">
              <h2 className="mb-2 text-sm font-semibold">מוצרים בקובץ</h2>
              <div className="flex flex-wrap gap-2">
                {selected.products.map((p) => (
                  <span key={p} className={parsed.productsOnlyInSheets.includes(p) ? "rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning-foreground" : "rounded-full bg-muted px-3 py-1 text-xs"}>
                    {p}
                    {parsed.productsOnlyInSheets.includes(p) ? " · מגיליון מוצר בלבד" : ""}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 text-sm">
              <h2 className="mb-2 text-sm font-semibold">מה יקרה לעדכונים הקיימים</h2>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  <span className="num font-semibold text-foreground">{fmt(selected.preserved)}</span> רשומות עבודה
                  קיימות יישמרו כמו שהן — הערות, סטטוס, משימה, אחראי ותאריכים.
                </li>
                <li>
                  <span className="num font-semibold text-foreground">{fmt(selected.created)}</span> שורות עבודה
                  חדשות ייווצרו לפי הנתונים החדשים.
                </li>
                <li>
                  <span className="num font-semibold text-foreground">{fmt(selected.missing)}</span> רשומות לא
                  נמצאו בקובץ החדש — יסומנו «לא נמצא ברענון האחרון» ולא יימחקו.
                </li>
                <li>אפס רשומות נמחקות. יעדים והיסטוריית שינויים לא מושפעים.</li>
              </ul>
            </section>

            {parsed.unassignedRows.length ? (
              <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{fmt(parsed.unassignedRows.length)} שורות ללא סוכן — ייקלטו תחת «ללא סוכן»</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadCsv("שורות-ללא-סוכן.csv", [
                        ["גיליון", "שורה", "מזהה לקוח", "לקוח", "מוצר", "יחידות"],
                        ...parsed.unassignedRows.map((r) => [r.sheet, String(r.row), r.entityId, r.customer, r.product, String(r.qty)]),
                      ])
                    }
                  >
                    הורדה לאקסל
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  בקובץ המקור תא הסוכן ריק בשורות האלה. הן נכללות בסכומים הכלליים ומופיעות תחת הסוכן «ללא סוכן» לצורך
                  שיוך וטיפול, אך אינן נכללות ביעדים ובמדידת ביצועי הסוכנים.
                </p>
              </section>
            ) : null}

            {parsed.negativeRows.length ? (
              <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{fmt(parsed.negativeRows.length)} שורות עם כמות שלילית — דורשות החלטה עסקית</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadCsv("שורות-כמות-שלילית.csv", [
                        ["גיליון", "שורה", "מזהה לקוח", "לקוח", "מוצר", "חודש", "כמות"],
                        ...parsed.negativeRows.map((r) => [r.sheet, String(r.row), r.entityId, r.customer, r.product, r.ym, String(r.qty)]),
                      ])
                    }
                  >
                    הורדה לאקסל
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ייתכן שמדובר בהחזרות או בתיקוני מלאי — הקובץ לא מציין זאת במפורש. המערכת אינה ממציאה כלל טיפול
                  בהחזרות: הכמות נקלטת בדיוק כפי שהיא במקור ונכללת בסכומים, אך יש לבדוק את הרשימה ולקבוע מדיניות
                  עסקית מפורשת (למשל: להחריג מהיעדים, לתעד כזיכוי) לפני אישור סופי.
                </p>
              </section>
            ) : null}

            {parsed.rejected.length ? (
              <section className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">שורות שנפסלו ({fmt(parsed.rejected.length)})</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadCsv("שורות-שנפסלו.csv", [
                        ["גיליון", "שורה", "סיבה", "פרטים"],
                        ...parsed.rejected.map((r) => [r.sheet, String(r.row), r.reason, r.sample]),
                      ])
                    }
                  >
                    הורדה לאקסל
                  </Button>
                </div>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {parsed.rejected.slice(0, 50).map((r, i) => (
                    <li key={i}>
                      {r.sheet} · שורה {r.row} · {r.reason} {r.sample ? `· ${r.sample}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="flex items-center gap-3">
              <Button onClick={() => void confirmImport()} disabled={progress !== null}>
                אישור וטעינת הנתונים
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setParsed(null);
                  setProgress(null);
                }}
                disabled={progress !== null}
              >
                ביטול
              </Button>
              {ctx?.active ? (
                <span className="text-xs text-muted-foreground">
                  כרגע פעיל: {ctx.active.file_name} · {ctx.active.latest_month}
                </span>
              ) : null}
            </div>
            {progress !== null ? <div className="h-2 max-w-sm overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div> : null}
          </div>
        ) : null}

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">היסטוריית רענונים</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">קובץ</th>
                  <th className="px-4 py-2 text-right font-medium">חודש אחרון</th>
                  <th className="px-4 py-2 text-right font-medium">רשומות</th>
                  <th className="px-4 py-2 text-right font-medium">הועלה ע״י</th>
                  <th className="px-4 py-2 text-right font-medium">תאריך</th>
                  <th className="px-4 py-2 text-right font-medium">סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(imports.data ?? []).map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-2">{i.file_name}</td>
                    <td className="num px-4 py-2">{i.latest_month}</td>
                    <td className="num px-4 py-2">{fmt(i.row_count)}</td>
                    <td className="px-4 py-2">{i.uploaded_by_name ?? "—"}</td>
                    <td className="num px-4 py-2">{new Date(i.created_at).toLocaleDateString("he-IL")}</td>
                    <td className="px-4 py-2">
                      {i.is_active ? (
                        <span className="rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">פעיל</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">ארכיון</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-left">
                      {!i.is_active ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await activateImport(i.id);
                              await syncWorkItemFlags(i.id);
                              await qc.invalidateQueries();
                              toast.success("הרענון הופעל");
                            }}
                          >
                            הפעלה
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await deleteImport(i.id);
                              await qc.invalidateQueries();
                            }}
                          >
                            מחיקה
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
