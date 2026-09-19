import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseAdmin.js";

export type AuthedRequest = Request & { userId?: string; isAdmin?: boolean; isManager?: boolean };

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: no bearer token" });
    return;
  }
  const token = header.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    // eslint-disable-next-line no-console
    console.error("getUser failed:", error?.status, error?.message);
    // A 401/403 caused by the server's own key (not the caller's token) is a config problem, not a bad login.
    res.status(401).json({ error: `Unauthorized: invalid token${error?.message ? ` (${error.message})` : ""}` });
    return;
  }
  req.userId = data.user.id;
  next();
}

async function loadRoles(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  (async () => {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const roles = await loadRoles(req.userId);
    if (!roles.includes("admin")) {
      res.status(403).json({ error: "אין הרשאה — עמוד זה זמין למנהל המערכת בלבד" });
      return;
    }
    req.isAdmin = true;
    next();
  })().catch(next);
}

export function requireManager(req: AuthedRequest, res: Response, next: NextFunction) {
  (async () => {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const roles = await loadRoles(req.userId);
    if (!roles.some((r) => r === "admin" || r === "manager")) {
      res.status(403).json({ error: "אין הרשאה" });
      return;
    }
    req.isManager = true;
    next();
  })().catch(next);
}
