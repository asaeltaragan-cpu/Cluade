import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const TABLE_LABELS: Record<string, string> = {
  imports: "רענוני קבצים",
  sales_facts: "רשומות מכירה",
  work_items: "רשומות עבודה",
  targets: "יעדים",
  target_history: "היסטוריית יעדים",
  work_item_history: "יומן שינויים",
  profiles: "פרופילים",
  user_roles: "הרשאות משתמשים",
};

type BackupPayload = {
  meta: { version: string; createdAt: string; exportedBy: string | null };
  tables: Record<string, Record<string, unknown>[]>;
  stats: { totalRows: number; tableRows: Record<string, number> };
};

function downloadFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fmt(n: number) {
  return n.toLocaleString("he-IL");
}

export function BackupPage() {
  const { me, loading } = useAuth();
  const [busy, setBusy] = useState<"json" | "excel" | null>(null);

  const stats = useQuery({
    queryKey: ["backup-stats"],
    queryFn: () => api.get<{ totalRows: number; tableRows: Record<string, number> }>("/api/backup/stats"),
    enabled: Boolean(me?.isAdmin),
  });

  async function downloadJson() {
    setBusy("json");
    try {
      const payload = await api.get<BackupPayload>("/api/backup/export");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadFile(`sweet-automation-backup-${new Date().toISOString().slice(0, 10)}.json`, blob);
      toast.success("קובץ הגיבוי הורד");
    } catch (err) {
      toast.error("הייצוא נכשל", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function downloadExcel() {
    setBusy("excel");
    try {
      const payload = await api.get<BackupPayload>("/api/backup/export");
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const [table, rows] of Object.entries(payload.tables)) {
        if (!rows.length) continue;
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, table.slice(0, 31));
      }
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadFile(`sweet-automation-backup-${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
      toast.success("קובץ האקסל הורד");
    } catch (err) {
      toast.error("הייצוא נכשל", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  if (loading || !me) return <Skeleton className="m-8 h-64" />;
  if (!me.isAdmin) {
    return (
      <AppShell me={me}>
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm">עמוד הגיבוי זמין למנהל המערכת בלבד.</p>
      </AppShell>
    );
  }

  return (
    <AppShell me={me}>
      <div className="space-y-7">
        <div>
          <h1 className="text-2xl font-bold">גיבוי ושחזור</h1>
          <p className="mt-1 text-sm text-muted-foreground">ייצוא מלא של כל הנתונים העסקיים לקובץ ניתן לשמירה ולבקרה.</p>
        </div>

        <section className="rounded-xl border border-border bg-card p-5 text-sm">
          <h2 className="mb-3 font-semibold">מה הייצוא הזה מכסה — ומה לא</h2>
          <div className="space-y-3 text-muted-foreground">
            <p>
              <strong className="text-foreground">כן:</strong> כל הטבלאות העסקיות — רענוני קבצים, רשומות מכירה,
              רשומות עבודה, יעדים והיסטוריית שינויים, פרופילים והרשאות. הייצוא שולף את כל השורות בכל טבלה
              (בדפים של 1,000 שורות), לא רק עמוד ברירת מחדל.
            </p>
            <p>
              <strong className="text-foreground">לא:</strong> זהו ייצוא ברמת האפליקציה בלבד — הוא אינו כולל את
              פרטי ההתחברות (סיסמאות) שנשמרים במנגנון האימות של Supabase, את קבצי המקור המקוריים שהועלו, את
              פונקציות/טריגרים/מדיניות ה-RLS של מסד הנתונים, או גיבויים מנוהלים ברמת הפלטפורמה. לגיבוי מלא כזה יש
              להשתמש בכלי הגיבוי/PITR של Supabase עצמו (Project Settings → Database → Backups).
            </p>
            <p>
              <strong className="text-foreground">שחזור:</strong> טרם נבנה במערכת. הקובץ שיורד כאן משמש לבקרה,
              דוחות ושמירה עצמאית — לא לכפתור "שחזור" עובד. שחזור עתידי, אם ייבנה, יצטרך לאמת תאימות סכימה,
              להציג תצוגה מקדימה של השינויים ולדרוש אישור מפורש לפני החלפת נתונים.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.isLoading ? (
            <Skeleton className="col-span-full h-24" />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">סך שורות לגיבוי</p>
                <p className="num mt-1 text-lg font-semibold">{fmt(stats.data?.totalRows ?? 0)}</p>
              </div>
              {Object.entries(stats.data?.tableRows ?? {}).map(([table, count]) => (
                <div key={table} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{TABLE_LABELS[table] ?? table}</p>
                  <p className="num mt-1 text-lg font-semibold">{fmt(count)}</p>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">ייצוא ידני</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void downloadJson()} disabled={busy !== null}>
              {busy === "json" ? "מכין קובץ JSON…" : "הורדת גיבוי JSON"}
            </Button>
            <Button variant="outline" onClick={() => void downloadExcel()} disabled={busy !== null}>
              {busy === "excel" ? "מכין קובץ Excel…" : "הורדת גיבוי לאקסל"}
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">הקובץ מכיל נתונים רגישים — יש לאחסן אותו במקום מאובטח ולא לשתף אותו.</p>
        </section>
      </div>
    </AppShell>
  );
}
