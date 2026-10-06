import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, RefreshCw, X } from "lucide-react";
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
        <span className="hidden text-xs text-muted-foreground sm:inline">עודכן {lastRefreshed.toLocaleTimeString("he-IL")}</span>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the drawer after navigating, and lock page scroll while it is open.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const items = NAV.filter((n) => n.roles === null || (n.roles === "manager" ? me.isManager : me.isAdmin));

  return (
    <div className="min-h-screen bg-surface">
      <div className="flex min-h-screen">
        {menuOpen ? (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden />
        ) : null}
        <aside
          className={cn(
            "flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
            // Mobile: off-canvas drawer (RTL, so it slides in from the right). Desktop: static sidebar.
            "fixed inset-y-0 start-0 z-50 transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0",
            menuOpen ? "translate-x-0" : "translate-x-full md:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between px-5 py-5">
            <p className="text-sm font-bold">Sweet Automation</p>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="סגירת תפריט"
              className="rounded-lg p-1 hover:bg-sidebar-accent/60 md:hidden"
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "block rounded-lg px-3 py-3 text-sm transition-colors md:py-2",
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
              className="mt-3 flex items-center gap-1.5 py-1 text-sidebar-foreground/80 hover:text-sidebar-foreground"
            >
              <LogOut className="size-3.5" />
              התנתקות
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="פתיחת תפריט"
              className="rounded-lg border border-border p-2 hover:bg-muted md:hidden"
            >
              <Menu className="size-4" />
            </button>
            <span className="truncate text-sm font-bold md:hidden">Sweet Automation</span>
            <div className="ms-auto">
              <RefreshButton />
            </div>
          </div>
          <main className="overflow-x-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
