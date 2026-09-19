import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useActivity } from "@/lib/use-app-data";

const FIELD_LABELS: Record<string, string> = {
  status: "סטטוס",
  task: "משימה",
  owner: "אחראי",
  next_follow_up: "תאריך מעקב",
  agent_note: "הערת סוכן",
  manager_note: "הערת הנהלה",
  handled_at: "תאריך טיפול",
};

export function ActivityPage() {
  const { me, loading } = useAuth();
  const activity = useActivity();

  if (loading || !me) return <Skeleton className="m-8 h-64" />;

  return (
    <AppShell me={me}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">היסטוריית פעילות</h1>
          <p className="mt-1 text-sm text-muted-foreground">כל עדכון ידני שנעשה בשורות העבודה — מי, מתי, ומה השתנה.</p>
        </div>

        {activity.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">תאריך</th>
                  <th className="px-4 py-2 text-right font-medium">סוכן</th>
                  <th className="px-4 py-2 text-right font-medium">לקוח</th>
                  <th className="px-4 py-2 text-right font-medium">מוצר</th>
                  <th className="px-4 py-2 text-right font-medium">שדה</th>
                  <th className="px-4 py-2 text-right font-medium">שינוי</th>
                  <th className="px-4 py-2 text-right font-medium">בוצע ע״י</th>
                </tr>
              </thead>
              <tbody>
                {(activity.data ?? []).map((a) => (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/40">
                    <td className="num px-4 py-2 text-xs">{new Date(a.created_at).toLocaleString("he-IL")}</td>
                    <td className="px-4 py-2">{a.agent}</td>
                    <td className="px-4 py-2">{a.customer ?? a.entity_id}</td>
                    <td className="px-4 py-2">{a.product}</td>
                    <td className="px-4 py-2 text-xs">{FIELD_LABELS[a.field] ?? a.field}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {a.old_value ?? "—"} ← {a.new_value ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">{a.changed_by_name ?? "—"}</td>
                  </tr>
                ))}
                {(activity.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      אין עדיין עדכונים לתצוגה.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
