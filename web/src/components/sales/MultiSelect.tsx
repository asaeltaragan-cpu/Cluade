import { Popover } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  unit,
  className,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel: string;
  unit: string;
  className?: string;
}) {
  const label = selected.length === 0 ? allLabel : `${selected.length} ${unit}`;

  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  return (
    <Popover
      trigger={({ toggle: open }) => (
        <button
          type="button"
          onClick={open}
          className={cn(
            "h-9 rounded-lg border border-input bg-card px-3 text-start text-xs",
            className,
          )}
        >
          {label}
        </button>
      )}
    >
      <div className="max-h-56 min-w-40 space-y-1 overflow-y-auto">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
            <Checkbox
              checked={selected.includes(o.value)}
              onChange={(e) => toggle(o.value, e.target.checked)}
            />
            {o.label}
          </label>
        ))}
        {options.length === 0 ? (
          <p className="px-1 py-1 text-xs text-muted-foreground">אין אפשרויות</p>
        ) : null}
      </div>
    </Popover>
  );
}
