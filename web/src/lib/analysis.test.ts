import { describe, expect, it } from "vitest";
import {
  buildCustomerRows,
  derivePeriod,
  summarizeByAgent,
  summarizeUnassigned,
  UNASSIGNED_AGENT,
  type Fact,
} from "@/lib/analysis";

function fact(over: Partial<Fact>): Fact {
  return { product: "P", entity_id: "E1", customer: "לקוח", channel: null, agent: "דנה", ym: "2026-01", qty: 1, ...over };
}

describe("derivePeriod", () => {
  it("computes months elapsed/left from the latest source month, not today's date", () => {
    const p = derivePeriod("2026-06");
    expect(p.year).toBe(2026);
    expect(p.prevYear).toBe(2025);
    expect(p.monthsElapsed).toBe(6);
    expect(p.monthsLeft).toBe(6);
  });

  it("treats a fully-elapsed prior year as 12 months", () => {
    const p = derivePeriod("2026-06", { year: 2025 });
    expect(derivePeriod("2026-06").monthsElapsed).toBe(6);
    expect(p.monthsElapsed).toBe(12);
  });

  it("does not divide by zero when the year has already ended", () => {
    const p = derivePeriod("2026-12");
    expect(p.monthsLeft).toBe(0);
  });
});

describe("buildCustomerRows — classification boundaries", () => {
  it("classifies exactly 80% of prior average as ירד (strictly below, not equal)", () => {
    // Restrict the window to January on both sides so avgPrev/avgYtd compare 1 month to 1 month.
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025, fromMonth: 1, toMonth: 1 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 100 }), fact({ ym: "2026-01", qty: 80 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.group).toBe("יציב");
  });

  it("classifies just below 80% as ירד", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025, fromMonth: 1, toMonth: 1 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 100 }), fact({ ym: "2026-01", qty: 79 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.group).toBe("ירד");
  });

  it("classifies exactly 105% as יציב (strictly above, not equal)", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025, fromMonth: 1, toMonth: 1 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 100 }), fact({ ym: "2026-01", qty: 105 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.group).toBe("יציב");
  });

  it("classifies נעלם when prior period had sales and current has none", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 50 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.group).toBe("נעלם");
  });

  it("classifies חדש/חוזר when only the current period has sales", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [fact({ ym: "2026-01", qty: 50 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.group).toBe("חדש/חוזר");
  });

  it("reports pace change as unavailable (null), not Infinity/NaN, when the prior average is zero", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [fact({ ym: "2026-01", qty: 10 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.paceChange).toBeNull();
  });

  it("recommended target is prior full year * 1.15 and is unaffected by the month-range filter", () => {
    const period = derivePeriod("2026-03", { year: 2026, prevYear: 2025, fromMonth: 1, toMonth: 1 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 100 }), fact({ ym: "2025-06", qty: 100 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.annualTarget).toBeCloseTo(230);
  });

  it("never lets remaining-to-target go negative", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 10 }), fact({ ym: "2026-01", qty: 999 })];
    const rows = buildCustomerRows(facts, period);
    expect(rows[0]!.neededRest).toBe(0);
  });

  it("does not divide by zero for monthly pace when no months remain in the year", () => {
    const period = derivePeriod("2026-12", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [fact({ ym: "2025-01", qty: 100 })];
    const rows = buildCustomerRows(facts, period);
    expect(Number.isFinite(rows[0]!.monthlyNeed)).toBe(true);
  });
});

describe("summarizeByAgent — unassigned-agent exclusion (gap fix)", () => {
  it("excludes UNASSIGNED_AGENT from the ranking list by default", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [
      fact({ agent: "דנה", ym: "2026-01", qty: 10 }),
      fact({ agent: UNASSIGNED_AGENT, entity_id: "E2", ym: "2026-01", qty: 20 }),
    ];
    const rows = buildCustomerRows(facts, period);
    const summary = summarizeByAgent(rows);
    expect(summary.map((s) => s.agent)).toEqual(["דנה"]);
  });

  it("still includes it when includeUnassigned is explicitly requested", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [fact({ agent: UNASSIGNED_AGENT, ym: "2026-01", qty: 20 })];
    const rows = buildCustomerRows(facts, period);
    const summary = summarizeByAgent(rows, { includeUnassigned: true });
    expect(summary.map((s) => s.agent)).toEqual([UNASSIGNED_AGENT]);
  });

  it("summarizeUnassigned totals unassigned rows without touching agent rankings", () => {
    const period = derivePeriod("2026-01", { year: 2026, prevYear: 2025 });
    const facts: Fact[] = [
      fact({ agent: "דנה", ym: "2026-01", qty: 10 }),
      fact({ agent: UNASSIGNED_AGENT, entity_id: "E2", ym: "2026-01", qty: 20 }),
    ];
    const rows = buildCustomerRows(facts, period);
    expect(summarizeUnassigned(rows)).toEqual({ customers: 1, qtyPrev: 0, qtyYtd: 20 });
    expect(summarizeByAgent(rows).find((s) => s.agent === "דנה")?.qtyYtd).toBe(10);
  });
});
