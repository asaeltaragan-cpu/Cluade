import type { ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pct, type Group } from "@/lib/analysis";

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-1 text-2xl font-bold",
          tone === "warn" && "text-warning-foreground",
          tone === "good" && "text-success",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone = value > 0 ? "good" : value < 0 ? "bad" : "muted";
  const sign = value > 0 ? "+" : "";
  return (
    <Badge tone={tone} className="num">
      {sign}
      {pct(value)}
    </Badge>
  );
}

const GROUP_TONE: Record<Group, "good" | "warn" | "bad" | "muted"> = {
  עלה: "good",
  "חדש/חוזר": "good",
  יציב: "muted",
  ירד: "warn",
  נעלם: "bad",
};

export function GroupBadge({ group }: { group: Group }) {
  return <Badge tone={GROUP_TONE[group]}>{group}</Badge>;
}

export function MonthlyChart({
  data,
  prevYear,
  year,
}: {
  data: { month: string; prev: number; current: number }[];
  prevYear: number;
  year: number;
}) {
  return (
    <div className="mt-3 h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="prev" name={String(prevYear)} stroke="var(--muted-foreground)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="current" name={String(year)} stroke="var(--primary)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
