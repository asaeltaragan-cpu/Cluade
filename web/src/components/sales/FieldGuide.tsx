import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FIELD_GUIDE } from "@/lib/analysis";
import { cn } from "@/lib/utils";

export function FieldGuide({ only }: { only?: string[] }) {
  const [open, setOpen] = useState(false);
  const items = only ? FIELD_GUIDE.filter((f) => only.includes(f.label)) : FIELD_GUIDE;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold"
      >
        מדריך שדות — איך מחושבים המספרים
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <dl className="space-y-3 border-t border-border px-5 py-4 text-sm">
          {items.map((f) => (
            <div key={f.label}>
              <dt className="font-medium">{f.label}</dt>
              <dd className="mt-0.5 text-muted-foreground">{f.desc}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
