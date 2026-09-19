import { useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) toast.error("ההתחברות נכשלה", { description: error.message });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setBusy(false);
      if (error) toast.error("יצירת החשבון נכשלה", { description: error.message });
      else toast.success("החשבון נוצר. אם מדובר בחשבון הראשון במערכת — הוא הפך אוטומטית למנהל מערכת.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-primary">ALMA LASERS ISRAEL</p>
        <h1 className="mt-1 text-xl font-bold">Sweet Automation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "כניסה למערכת יעדי מכירות" : "יצירת חשבון מנהל ראשוני"}
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">שם מלא</Label>
              <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "מעבד…" : mode === "signin" ? "כניסה" : "יצירת חשבון"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 text-xs text-primary hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "יצירת חשבון מנהל ראשוני (רק אם המערכת ריקה)" : "יש לי כבר חשבון — כניסה"}
        </button>
        <p className="mt-4 text-xs text-muted-foreground">
          החשבון הראשון שנרשם במערכת הופך אוטומטית למנהל מערכת. כל חשבון נוסף (הנהלה, סוכנים) נוצר דרך מסך
          ניהול המשתמשים על ידי מנהל המערכת — לא דרך הרשמה עצמית.
        </p>
      </div>
    </div>
  );
}
