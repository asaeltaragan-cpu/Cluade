import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABEL, type Me } from "@/lib/auth";

const NAV = [
  { to: "/dashboard", label: "דשבורד", roles: null },
  { to: "/work", label: "רשימת עבודה", roles: null },
  { to: "/targets", label: "יעדים", roles: null },
  { to: "/import", label: "העלאת נתונים", roles: "manager" as const },
  { to: "/activity", label: "היסטוריית פעילות", roles: null },
  { to: "/admin", label: "ניהול משתמשים", roles: "admin" as const },
  { to: "/backup", label: "גיבוי", roles: "admin" as const },
];

/** Re-fetches everything currently on screen straight from Supabase (bypassing cached staleness). */
function RefreshButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      await qc.invalidateQueries();
      setLastRefreshed(new Date());
      toast.success("הנתונים עודכנו מהמסד");
    } catch (err) {
      toast.error("הרענון נכשל", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {lastRefreshed ? (
        <span className="text-xs text-muted-foreground">עודכן {lastRefreshed.toLocaleTimeString("he-IL")}</span>
      ) : null}
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
        סנכרון עכשיו
      </button>
    </div>
  );
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const { signOut } = useAuth();

  const items = NAV.filter((n) => n.roles === null || (n.roles === "manager" ? me.isManager : me.isAdmin));

  return (
    <div className="min-h-screen bg-surface">
      <div className="flex min-h-screen">
        <aside className="flex w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
          <div className="px-5 py-5">
            <p className="text-xs font-semibold tracking-wide text-sidebar-primary">ALMA LASERS ISRAEL</p>
            <p className="mt-1 text-sm font-bold">Sweet Automation</p>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "block rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-sidebar-border px-3 py-4 text-xs">
            <p className="font-medium">{me.fullName ?? me.email}</p>
            <p className="mt-0.5 text-sidebar-foreground/70">{me.topRole ? ROLE_LABEL[me.topRole] : "ללא הרשאה"}</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 flex items-center gap-1.5 text-sidebar-foreground/80 hover:text-sidebar-foreground"
            >
              <LogOut className="size-3.5" />
              התנתקות
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex justify-end border-b border-border bg-card px-6 py-2">
            <RefreshButton />
          </div>
          <main className="overflow-x-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
