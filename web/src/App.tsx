import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { AgentDetailPage } from "@/pages/AgentDetail";
import { WorkPage } from "@/pages/Work";
import { TargetsPage } from "@/pages/Targets";
import { ImportPage } from "@/pages/Import";
import { ActivityPage } from "@/pages/Activity";
import { AdminPage } from "@/pages/Admin";
import { BackupPage } from "@/pages/Backup";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen space-y-4 bg-surface p-8">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/agents/:agent" element={<RequireAuth><AgentDetailPage /></RequireAuth>} />
      <Route path="/work" element={<RequireAuth><WorkPage /></RequireAuth>} />
      <Route path="/targets" element={<RequireAuth><TargetsPage /></RequireAuth>} />
      <Route path="/import" element={<RequireAuth><ImportPage /></RequireAuth>} />
      <Route path="/activity" element={<RequireAuth><ActivityPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      <Route path="/backup" element={<RequireAuth><BackupPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
