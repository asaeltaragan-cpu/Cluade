import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "good" | "warn" | "bad";
  className?: string;
}) {
  const toneClass = {
    muted: "bg-muted text-muted-foreground",
    good: "bg-success/15 text-success",
    warn: "bg-warning/20 text-warning-foreground",
    bad: "bg-destructive/15 text-destructive",
  }[tone];
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", toneClass, className)}>
      {children}
    </span>
  );
}
