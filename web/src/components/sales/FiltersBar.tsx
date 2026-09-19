import type { ReactNode } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/sales/MultiSelect";
import { MONTH_NAMES, QUARTERS } from "@/lib/analysis";

export const ALL = "all";
export const AUTO = "auto";

export type FilterState = {
  agent: string;
  product: string;
  /** "auto" = latest year in the file */
  year: string;
  /** "auto" = the year before the selected year */
  compareYear: string;
  /** year | q1..q4 | custom */
  preset: string;
  fromMonth: number;
  toMonth: number;
  /** Multi-select year row filter; empty = all years */
  activeYears: number[];
};

export const emptyFilters: FilterState = {
  agent: ALL,
  product: ALL,
  year: AUTO,
  compareYear: AUTO,
  preset: "year",
  fromMonth: 1,
  toMonth: 12,
  activeYears: [],
};

export function toQuery(f: FilterState) {
  const q = QUARTERS.find((x) => x.id === f.preset);
  const from = f.preset === "custom" ? f.fromMonth : (q?.from ?? 1);
  const to = f.preset === "custom" ? f.toMonth : (q?.to ?? 12);
  return {
    agent: f.agent === ALL ? undefined : f.agent,
    product: f.product === ALL ? undefined : f.product,
    year: f.year === AUTO ? undefined : Number(f.year),
    compareYear: f.compareYear === AUTO ? undefined : Number(f.compareYear),
    fromMonth: from,
    toMonth: to,
    activeYears: f.activeYears,
  };
}

type Props = {
  value: FilterState;
  onChange: (next: FilterState) => void;
  agents: string[];
  products: string[];
  years: number[];
  showAgent?: boolean;
  children?: ReactNode;
  onClearExtra?: () => void;
  extraDirty?: boolean;
};

export function FiltersBar({
  value,
  onChange,
  agents,
  products,
  years,
  showAgent = true,
  children,
  onClearExtra,
  extraDirty = false,
}: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const dirty = JSON.stringify(value) !== JSON.stringify(emptyFilters) || extraDirty;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const selectedYear = value.year === AUTO ? (years[0] ?? 0) : Number(value.year);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
      {showAgent ? (
        <Select
          value={value.agent}
          onChange={(e) => set({ agent: e.target.value })}
          aria-label="סוכן"
          className="w-40"
        >
          <option value={ALL}>כל הסוכנים</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      ) : null}

      <Select value={value.product} onChange={(e) => set({ product: e.target.value })} aria-label="מוצר" className="w-40">
        <option value={ALL}>כל המוצרים</option>
        {products.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">שנה</span>
        <Select value={value.year} onChange={(e) => set({ year: e.target.value })} aria-label="שנה" className="w-28">
          <option value={AUTO}>{years[0] ? `${years[0]} (אחרונה)` : "אחרונה"}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">מול</span>
        <Select
          value={value.compareYear}
          onChange={(e) => set({ compareYear: e.target.value })}
          aria-label="שנת השוואה"
          className="w-28"
        >
          <option value={AUTO}>{selectedYear ? selectedYear - 1 : "שנה קודמת"}</option>
          {years
            .filter((y) => y !== selectedYear)
            .map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
        </Select>
      </div>

      <MultiSelect
        allLabel="כל השנים"
        unit="שנים"
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        selected={value.activeYears.map(String)}
        onChange={(vals) => set({ activeYears: vals.map(Number).sort((a, b) => b - a) })}
        className="w-32"
      />

      <Select value={value.preset} onChange={(e) => set({ preset: e.target.value })} aria-label="תקופה" className="w-44">
        <option value="year">כל השנה</option>
        {QUARTERS.map((q) => (
          <option key={q.id} value={q.id}>
            {q.label}
          </option>
        ))}
        <option value="custom">טווח חודשים…</option>
      </Select>

      {value.preset === "custom" ? (
        <div className="flex items-center gap-1">
          <Select
            value={String(value.fromMonth)}
            onChange={(e) => set({ fromMonth: Number(e.target.value), toMonth: Math.max(Number(e.target.value), value.toMonth) })}
            aria-label="מחודש"
            className="w-28"
          >
            {months.map((m) => (
              <option key={m} value={String(m)}>
                {MONTH_NAMES[m - 1]}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">עד</span>
          <Select
            value={String(value.toMonth)}
            onChange={(e) => set({ toMonth: Number(e.target.value) })}
            aria-label="עד חודש"
            className="w-28"
          >
            {months
              .filter((m) => m >= value.fromMonth)
              .map((m) => (
                <option key={m} value={String(m)}>
                  {MONTH_NAMES[m - 1]}
                </option>
              ))}
          </Select>
        </div>
      ) : null}

      {children}

      {dirty ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange({ ...emptyFilters, activeYears: [] });
            onClearExtra?.();
          }}
        >
          ניקוי סינון
        </Button>
      ) : null}
    </div>
  );
}
