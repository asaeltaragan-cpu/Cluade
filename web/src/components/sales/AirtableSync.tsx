import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { fmt } from "@/lib/analysis";

type SyncResult = {
  ok: boolean;
  finishedAt: string;
  rowCount?: number;
  latestMonth?: string;
  negativeRows?: number;
  warnings: string[];
  error?: string;
};

type Status = { running: boolean; last: SyncResult | null };

/**
 * Manual trigger + status for the automatic Airtable sync (server-side,
 * every 10 minutes when AIRTABLE_TOKEN is configured). Pulling the Airtable
 * base lands as a normal import batch, so it goes through the same
 * activation/work-item-preservation path as an Excel upload.
 */
export function AirtableSync() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["airtable-status"],
    queryFn: () => api.get<Status>("/api/airtable/status"),
    refetchInterval: 15_000,
    retry: false,
  });

  async function syncNow() {
    setBusy(true);
    try {
      const result = await api.post<SyncResult>("/api/airtable/sync");
      if (result.ok) {
        toast.success(`הסנכרון הושלם — ${fmt(result.rowCount ?? 0)} רשומות`);
        await qc.invalidateQueries();
      } else {
        toast.error("הסנכרון נכשל", { description: result.error });
      }
      await qc.invalidateQueries({ queryKey: ["airtable-status"] });
    } catch (err) {
      toast.error("הסנכרון נכשל", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  // The API itself is disabled when AIRTABLE_TOKEN isn't configured server-side.
  if (status.isError) return null;

  const last = status.data?.last;

  return (
    <section className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">סנכרון מ-Airtable</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            המערכת מסנכרנת אוטומטית מבסיס ה-Airtable כל 10 דקות. אפשר גם להריץ סנכרון מיידי.
          </p>
        </div>
        <Button size="sm" onClick={() => void syncNow()} disabled={busy || status.data?.running}>
          {busy || status.data?.running ? "מסנכרן…" : "סנכרון עכשיו"}
        </Button>
      </div>

      {last ? (
        <div className="mt-3 text-xs text-muted-foreground">
          <span className={last.ok ? "text-success" : "text-destructive"}>
            {last.ok ? "הצליח" : "נכשל"}
          </span>{" "}
          · {new Date(last.finishedAt).toLocaleString("he-IL")}
          {last.ok ? (
            <>
              {" "}
              · {fmt(last.rowCount ?? 0)} רשומות · חודש אחרון {last.latestMonth}
              {last.negativeRows ? ` · ${fmt(last.negativeRows)} כמויות שליליות` : ""}
            </>
          ) : (
            last.error ? ` · ${last.error}` : null
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">עוד לא בוצע סנכרון בסשן הנוכחי של השרת.</p>
      )}
    </section>
  );
}
