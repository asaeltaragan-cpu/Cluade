import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/database.types";

export const ROLE_ORDER: AppRole[] = ["admin", "manager", "agent"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "מנהל מערכת",
  manager: "הנהלה",
  agent: "סוכן",
};

export function topRole(roles: AppRole[]): AppRole | null {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? null;
}

export type Me = {
  userId: string;
  email: string | null;
  fullName: string | null;
  agentName: string | null;
  roles: AppRole[];
  topRole: AppRole | null;
  isManager: boolean;
  isAdmin: boolean;
};

type AuthState = {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function loadMe(session: Session): Promise<Me> {
  const userId = session.user.id;
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, agent_name").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role as AppRole);
  return {
    userId,
    email: profile?.email ?? session.user.email ?? null,
    fullName: profile?.full_name ?? null,
    agentName: profile?.agent_name ?? null,
    roles,
    topRole: topRole(roles),
    isManager: roles.includes("admin") || roles.includes("manager"),
    isAdmin: roles.includes("admin"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setMe(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    loadMe(session)
      .then((m) => {
        if (active) setMe(m);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      me,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, me, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
