import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, ROLE_LABEL, topRole } from "@/lib/auth";
import { useAnalysis } from "@/lib/use-app-data";
import { UNASSIGNED_AGENT } from "@/lib/analysis";
import { api } from "@/lib/api";
import type { AppRole } from "@/lib/database.types";

const ROLES: AppRole[] = ["admin", "manager", "agent"];
const NONE = "__none__";

type UserRecord = { id: string; email: string | null; full_name: string | null; agent_name: string | null; roles: AppRole[] };

export function AdminPage() {
  const { me, loading } = useAuth();
  const qc = useQueryClient();
  const { derived } = useAnalysis();
  const [savingId, setSavingId] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserRecord[]>("/api/admin/users"),
    enabled: Boolean(me?.isAdmin),
  });

  const agentNames = useMemo(
    () => [...new Set(derived?.agents.map((a) => a.agent) ?? [])].filter((a) => a !== UNASSIGNED_AGENT).sort(),
    [derived],
  );

  if (loading || !me) return <Skeleton className="m-8 h-64" />;
  if (!me.isAdmin) {
    return (
      <AppShell me={me}>
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm">העמוד זמין למנהל המערכת בלבד.</p>
      </AppShell>
    );
  }

  const myId = me.userId;

  async function save(userId: string, fullName: string, agentName: string | null, roles: AppRole[]) {
    setSavingId(userId);
    try {
      await api.patch(`/api/admin/users/${userId}`, { fullName, agentName, roles });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("הפרטים עודכנו");
    } catch (err) {
      toast.error("העדכון נכשל", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSavingId(null);
    }
  }

  async function remove(userId: string, label: string) {
    if (!window.confirm(`למחוק את המשתמש ${label}? הפעולה בלתי הפיכה.`)) return;
    setSavingId(userId);
    try {
      await api.delete(`/api/admin/users/${userId}`);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("המשתמש נמחק");
    } catch (err) {
      toast.error("המחיקה נכשלה", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AppShell me={me}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
          <p className="mt-1 text-sm text-muted-foreground">שייכו כל סוכן לשם הסוכן כפי שהוא מופיע בקובץ המקור — אחרת הוא לא יראה נתונים.</p>
        </div>

        <NewUserForm
          agentNames={agentNames}
          onCreate={async (payload) => {
            try {
              await api.post("/api/admin/users", payload);
              await qc.invalidateQueries({ queryKey: ["admin-users"] });
              toast.success("המשתמש נוצר");
              return true;
            } catch (err) {
              toast.error("יצירת המשתמש נכשלה", { description: err instanceof Error ? err.message : undefined });
              return false;
            }
          }}
        />

        {users.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-3">
            {(users.data ?? []).map((u) => (
              <UserRow key={u.id} user={u} agentNames={agentNames} busy={savingId === u.id} isSelf={u.id === myId} onSave={save} onDelete={remove} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function RolePicker({ roles, onToggle }: { roles: AppRole[]; onToggle: (role: AppRole, on: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 pt-1">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-2 text-sm">
          <Checkbox checked={roles.includes(r)} onChange={(e) => onToggle(r, e.target.checked)} />
          {ROLE_LABEL[r]}
        </label>
      ))}
    </div>
  );
}

function AgentPicker({ value, onChange, agentNames }: { value: string; onChange: (v: string) => void; agentNames: string[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-56">
      <option value={NONE}>ללא שיוך</option>
      {agentNames.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </Select>
  );
}

function NewUserForm({
  agentNames,
  onCreate,
}: {
  agentNames: string[];
  onCreate: (payload: { email: string; password: string; fullName: string; agentName: string | null; roles: AppRole[] }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agentName, setAgentName] = useState(NONE);
  const [roles, setRoles] = useState<AppRole[]>(["agent"]);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        הוספת משתמש
      </Button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await onCreate({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      agentName: agentName === NONE ? null : agentName,
      roles,
    });
    setBusy(false);
    if (ok) {
      setEmail("");
      setPassword("");
      setFullName("");
      setAgentName(NONE);
      setRoles(["agent"]);
      setOpen(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <Label className="text-xs">שם מלא</Label>
        <Input required className="w-48" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">אימייל</Label>
        <Input required type="email" dir="ltr" className="w-60" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">סיסמה ראשונית</Label>
        <Input required minLength={6} type="text" dir="ltr" className="w-44" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">שם הסוכן בקובץ</Label>
        <AgentPicker value={agentName} onChange={setAgentName} agentNames={agentNames} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">הרשאות</Label>
        <RolePicker roles={roles} onToggle={(role, on) => setRoles((prev) => (on ? [...new Set([...prev, role])] : prev.filter((r) => r !== role)))} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          יצירה
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  agentNames,
  busy,
  isSelf,
  onSave,
  onDelete,
}: {
  user: UserRecord;
  agentNames: string[];
  busy: boolean;
  isSelf: boolean;
  onSave: (id: string, fullName: string, agentName: string | null, roles: AppRole[]) => Promise<void>;
  onDelete: (id: string, label: string) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [agentName, setAgentName] = useState(user.agent_name ?? NONE);
  const [roles, setRoles] = useState<AppRole[]>(user.roles);

  function toggle(role: AppRole, on: boolean) {
    setRoles((prev) => (on ? [...new Set([...prev, role])] : prev.filter((r) => r !== role)));
  }

  const top = topRole(roles);

  return (
    <div className="flex flex-wrap items-end gap-5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="min-w-48 flex-1 space-y-1">
        <Label className="text-xs">שם מלא</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <div className="text-xs text-muted-foreground" dir="ltr">
          {user.email}
        </div>
        <div className="text-xs">
          הרשאה בפועל: <span className="font-medium">{top ? ROLE_LABEL[top] : "ללא הרשאה"}</span>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">שם הסוכן בקובץ</Label>
        <AgentPicker value={agentName} onChange={setAgentName} agentNames={agentNames} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">הרשאות</Label>
        <RolePicker roles={roles} onToggle={toggle} />
      </div>

      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => void onSave(user.id, fullName.trim(), agentName === NONE ? null : agentName, roles)}>
          שמירה
        </Button>
        <Button variant="ghost" size="icon" aria-label="מחיקת משתמש" disabled={busy || isSelf} onClick={() => void onDelete(user.id, user.full_name ?? user.email ?? "")}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

