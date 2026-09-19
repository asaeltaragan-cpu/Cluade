import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "@/lib/workbook-parse";
import { UNASSIGNED_AGENT } from "@/lib/analysis";

function buildWorkbook(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([buf], "test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Header detection requires at least 3 recognized month columns.
const UNIFIED_HEADER = ["סוכן", "Entity Id", "לקוח", "שם המוצר", "2026-01", "2026-02", "2026-03"];
const PRODUCT_HEADER = ["סוכן", "Entity Id", "לקוח", "2026-01", "2026-02", "2026-03"];

describe("parseWorkbook — consolidated + product sheet dedup", () => {
  it("does not double-count a row present in both the unified and a product sheet", async () => {
    const file = buildWorkbook({
      "כל המוצרים מאוחד": [UNIFIED_HEADER, ["דנה", "C1", "לקוח א", "Hallura", 10, 5, 0]],
      Hallura: [PRODUCT_HEADER, ["דנה", "C1", "לקוח א", 10, 5, 0]],
    });
    const result = await parseWorkbook(file);
    const total = result.facts.reduce((s, f) => s + f.qty, 0);
    expect(total).toBe(15);
    expect(result.sheets.find((s) => s.name === "Hallura")?.included).toBe(false);
  });
});

describe("parseWorkbook — LMNT-only-in-its-own-sheet", () => {
  it("imports LMNT from its own sheet even though it is absent from the unified sheet", async () => {
    const file = buildWorkbook({
      "כל המוצרים מאוחד": [UNIFIED_HEADER, ["דנה", "C1", "לקוח א", "Hallura", 10, 5, 0]],
      LMNT: [PRODUCT_HEADER, ["דנה", "C2", "לקוח ב", 7, 3, 0]],
    });
    const result = await parseWorkbook(file);
    expect(result.products).toContain("LMNT");
    expect(result.productsOnlyInSheets).toContain("LMNT");
    expect(result.facts.filter((f) => f.product === "LMNT").reduce((s, f) => s + f.qty, 0)).toBe(10);
  });
});

describe("parseWorkbook — blank agent rows", () => {
  it("accepts a row with a valid entity id and product but a blank agent as UNASSIGNED_AGENT, not rejected", async () => {
    const file = buildWorkbook({
      "כל המוצרים מאוחד": [UNIFIED_HEADER, ["", "C3", "לקוח ג", "Hallura", 4, 0, 0]],
    });
    const result = await parseWorkbook(file);
    expect(result.rejected).toHaveLength(0);
    expect(result.agents).toContain(UNASSIGNED_AGENT);
    expect(result.unassignedRows).toHaveLength(1);
    expect(result.unassignedRows[0]!.entityId).toBe("C3");
  });

  it("still rejects a row missing entity id or product entirely", async () => {
    const file = buildWorkbook({
      "כל המוצרים מאוחד": [UNIFIED_HEADER, ["דנה", "", "לקוח ד", "Hallura", 1, 0, 0]],
    });
    const result = await parseWorkbook(file);
    expect(result.rejected).toHaveLength(1);
    expect(result.facts).toHaveLength(0);
  });
});

describe("parseWorkbook — negative-quantity ambiguity flag (gap fix)", () => {
  it("preserves a negative quantity in facts exactly as read, and separately flags it — never silently drops or reinterprets it", async () => {
    const file = buildWorkbook({
      "כל המוצרים מאוחד": [UNIFIED_HEADER, ["דנה", "C4", "לקוח ה", "Hallura", -3, 0, 0]],
    });
    const result = await parseWorkbook(file);
    expect(result.facts.find((f) => f.entity_id === "C4")?.qty).toBe(-3);
    expect(result.negativeRows).toHaveLength(1);
    expect(result.negativeRows[0]).toMatchObject({ entityId: "C4", qty: -3, ym: "2026-01" });
    expect(result.warnings.some((w) => w.includes("כמות שלילית"))).toBe(true);
  });

  it("does not flag ordinary positive-quantity rows as negative", async () => {
    const file = buildWorkbook({
      "כל המוצרים מאוחד": [UNIFIED_HEADER, ["דנה", "C5", "לקוח ו", "Hallura", 3, 0, 0]],
    });
    const result = await parseWorkbook(file);
    expect(result.negativeRows).toHaveLength(0);
  });
});
