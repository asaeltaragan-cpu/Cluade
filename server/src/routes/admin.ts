import { Router } from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAdmin, type AuthedRequest } from "../auth.js";

export const adminRouter = Router();

const ROLES = ["admin", "manager", "agent"] as const;
type Role = (typeof ROLES)[number];

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

adminRouter.get("/users", requireAdmin, async (_req, res) => {
  const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, email, full_name, agent_name").order("created_at"),
    supabaseAdmin.from("user_roles").select("user_id, role"),
  ]);
  if (pErr) return res.status(500).json({ error: pErr.message });
  if (rErr) return res.status(500).json({ error: rErr.message });

  const result = (profiles ?? []).map((p) => ({
    ...p,
    roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
  }));
  res.json(result);
});

adminRouter.post("/users", requireAdmin, async (req, res) => {
  const { email, password, fullName, agentName, roles } = req.body ?? {};
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: "נדרשים אימייל, סיסמה ושם מלא" });
  }
  const cleanRoles: Role[] = Array.isArray(roles) ? roles.filter(isRole) : [];

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !created.user) {
    return res.status(400).json({ error: error?.message ?? "יצירת המשתמש נכשלה" });
  }

  const newId = created.user.id;
  await supabaseAdmin
    .from("profiles")
    .update({ full_name: fullName, agent_name: agentName ?? null, email })
    .eq("id", newId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
  if (cleanRoles.length) {
    await supabaseAdmin.from("user_roles").insert(cleanRoles.map((role) => ({ user_id: newId, role })));
  }
  res.json({ ok: true, id: newId });
});

adminRouter.patch("/users/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const targetUserId = req.params.id;
  const { fullName, agentName, roles } = req.body ?? {};
  const cleanRoles: Role[] = Array.isArray(roles) ? roles.filter(isRole) : [];

  if (targetUserId === req.userId && !cleanRoles.includes("admin")) {
    return res.status(400).json({ error: "לא ניתן להסיר לעצמך את הרשאת מנהל המערכת" });
  }

  const patch: { agent_name: string | null; full_name?: string } = { agent_name: agentName ?? null };
  if (typeof fullName === "string") patch.full_name = fullName;

  const { error: pErr } = await supabaseAdmin.from("profiles").update(patch).eq("id", targetUserId);
  if (pErr) return res.status(500).json({ error: pErr.message });

  await supabaseAdmin.from("user_roles").delete().eq("user_id", targetUserId);
  if (cleanRoles.length) {
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert(cleanRoles.map((role) => ({ user_id: targetUserId, role })));
    if (rErr) return res.status(500).json({ error: rErr.message });
  }
  res.json({ ok: true });
});

adminRouter.delete("/users/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const targetUserId = req.params.id;
  if (targetUserId === req.userId) {
    return res.status(400).json({ error: "לא ניתן למחוק את החשבון שלך" });
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
