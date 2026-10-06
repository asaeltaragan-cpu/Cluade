import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

type RestorePreview = {
  createdAt: string | null;
  tables: Record<string, { inFile: number; current: number; skipped: number }>;
};

const CONFIRM_WORD = "שחזר";

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
  const [busy, setBusy] = useState<"json" | "excel" | "restore" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<unknown>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

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

  async function onPickFile(file: File | undefined) {
    setPreview(null);
    setBackup(null);
    if (!file) return;
    setBusy("restore");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await api.post<RestorePreview>("/api/backup/restore/preview", parsed);
      setBackup(parsed);
      setPreview(result);
    } catch (err) {
      toast.error("הקובץ לא נקלט", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function applyRestore() {
    setBusy("restore");
    try {
      // Safety net: save the current state to disk before anything is replaced.
      const current = await api.get<BackupPayload>("/api/backup/export");
      downloadFile(
        `sweet-automation-pre-restore-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
        new Blob([JSON.stringify(current)], { type: "application/json" }),
      );
      await api.post("/api/backup/restore/apply", { confirm: true, backup });
      toast.success("השחזור הושלם");
      setConfirmOpen(false);
      setConfirmText("");
      setPreview(null);
      setBackup(null);
      if (fileRef.current) fileRef.current.value = "";
      void stats.refetch();
    } catch (err) {
      toast.error("השחזור נכשל", { description: err instanceof Error ? err.message : undefined });
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
          <h1 className="text-xl font-bold sm:text-2xl">גיבוי ושחזור</h1>
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
              <strong className="text-foreground">שחזור:</strong> קובץ JSON שיוצא מכאן ניתן להעלאה בסקשן
              "שחזור מגיבוי" למטה. השחזור מחליף את הטבלאות העסקיות (רענונים, מכירות, יעדים, רשומות עבודה והיסטוריה).
              פרופילים והרשאות לא נמחקים, ומתעדכנים רק עבור משתמשים שקיימים בפרויקט.
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

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">שחזור מגיבוי</h2>
          <Input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            disabled={busy !== null}
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          {preview && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                גיבוי מתאריך {preview.createdAt ? new Date(preview.createdAt).toLocaleString("he-IL") : "לא ידוע"}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs text-muted-foreground">
                    <th className="py-1 text-start">טבלה</th>
                    <th className="py-1 text-start">בקובץ</th>
                    <th className="py-1 text-start">כרגע במערכת</th>
                    <th className="py-1 text-start">ידולגו</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(preview.tables).map(([t, v]) => (
                    <tr key={t} className="border-t border-border">
                      <td className="py-1">{TABLE_LABELS[t] ?? t}</td>
                      <td className="num py-1">{fmt(v.inFile)}</td>
                      <td className="num py-1">{fmt(v.current)}</td>
                      <td className="num py-1">{v.skipped ? fmt(v.skipped) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={busy !== null}>
                שחזור מהקובץ
              </Button>
            </div>
          )}
        </section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => busy === null && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>אישור שחזור</DialogTitle>
            <DialogDescription>
              הנתונים העסקיים הנוכחיים יוחלפו בתוכן הקובץ. לפני כן יורד קובץ גיבוי של המצב הנוכחי. להמשך הקלד "{CONFIRM_WORD}".
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <div className="mt-4 flex gap-3">
            <Button
              variant="destructive"
              disabled={confirmText.trim() !== CONFIRM_WORD || busy !== null}
              onClick={() => void applyRestore()}
            >
              {busy === "restore" ? "משחזר…" : "בצע שחזור"}
            </Button>
            <Button variant="outline" disabled={busy !== null} onClick={() => setConfirmOpen(false)}>
              ביטול
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
