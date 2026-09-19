import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
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
        <main className="min-w-0 flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
