import { cleanName, UNASSIGNED_AGENT, type Fact } from "@/lib/analysis";

/* ---------------- helpers ---------------- */

function norm(v: unknown): string {
  return cleanName(v)
    .replace(/["'׳״]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const SYN = {
  product: ["שם המוצר", "מוצר", "product", "product name", "שם מוצר"],
  entity: ["entity id", "entityid", "entity", "מזהה", "מזהה לקוח", "קוד לקוח", "מספר לקוח"],
  customer: ["לקוח", "שם הלקוח", "customer", "customer name", "account"],
  agent: ["סוכן", "agent", "sales rep", "נציג"],
  channel: ["channel", "ערוץ"],
};

function matches(header: string, list: string[]): boolean {
  return list.some((s) => header === s);
}

const YM_RE = /^(\d{4})-(\d{1,2})$/;
const YEAR_RE = /^(20\d{2})$/;
const SLASH_RE = /^(\d{1,2})[/.](\d{4})$/;
const MONTH_NUM_RE = /^(\d{1,2})$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toQty(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw ?? "").replace(/[,\s]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------- types ---------------- */

export type SheetKind = "unified" | "product" | "aggregate" | "ignored";

export type SheetReport = {
  name: string;
  kind: SheetKind;
  product: string | null;
  dataRows: number;
  facts: number;
  months: number;
  reason: string;
  included: boolean;
};

export type RejectedRow = {
  sheet: string;
  row: number;
  reason: string;
  sample: string;
};

export type ColumnMap = {
  headerRow: number;
  product: number | null;
  entity: number | null;
  customer: number | null;
  channel: number | null;
  agent: number | null;
  months: { col: number; ym: string }[];
};

export type ParsedFact = Fact & { sheet: string };

export { UNASSIGNED_AGENT };

export type ParseResult = {
  sheets: SheetReport[];
  facts: ParsedFact[];
  rejected: RejectedRow[];
  warnings: string[];
  latestMonth: string;
  products: string[];
  agents: string[];
  /** Products only found in a product sheet, not in the unified sheet */
  productsOnlyInSheets: string[];
  /** Rows accepted under UNASSIGNED_AGENT because the agent cell was blank */
  unassignedRows: { sheet: string; row: number; entityId: string; customer: string; product: string; qty: number }[];
  /**
   * Rows with a negative parsed quantity. These are NOT rejected and NOT
   * auto-converted into a returns/credit rule — the source value is preserved
   * exactly as read and still summed into facts. This list exists purely to
   * surface the ambiguity so a manager can decide (and get) an explicit
   * business rule for returns, instead of the app silently inventing one.
   */
  negativeRows: { sheet: string; row: number; entityId: string; customer: string; product: string; ym: string; qty: number }[];
};

type Grid = unknown[][];

/* ---------------- header detection ---------------- */

function detectMonths(headers: string[]): { col: number; ym: string }[] {
  const out: { col: number; ym: string }[] = [];
  let pending: { col: number; month: number }[] = [];

  headers.forEach((h, col) => {
    if (!h) return;
    if (h.includes("סה״כ") || h.includes('סה"כ') || h.includes("total")) {
      pending = [];
      return;
    }
    const ym = YM_RE.exec(h);
    if (ym) {
      out.push({ col, ym: `${ym[1]}-${pad(Number(ym[2]))}` });
      return;
    }
    const slash = SLASH_RE.exec(h);
    if (slash) {
      out.push({ col, ym: `${slash[2]}-${pad(Number(slash[1]))}` });
      return;
    }
    const mn = MONTH_NUM_RE.exec(h);
    if (mn) {
      const m = Number(mn[1]);
      if (m >= 1 && m <= 12) pending.push({ col, month: m });
      return;
    }
    const yr = YEAR_RE.exec(h);
    if (yr) {
      // In product sheets: a run of 1..12 month columns followed by a year
      // cell means that run belongs to that year.
      for (const p of pending) out.push({ col: p.col, ym: `${yr[1]}-${pad(p.month)}` });
      pending = [];
      return;
    }
    pending = [];
  });

  return out;
}

function buildMap(grid: Grid): ColumnMap | null {
  const limit = Math.min(grid.length, 12);
  for (let r = 0; r < limit; r++) {
    const headers = (grid[r] ?? []).map(norm);
    const months = detectMonths(headers);
    if (months.length < 3) continue;

    let product: number | null = null;
    let entity: number | null = null;
    let channel: number | null = null;
    let agent: number | null = null;
    const customers: number[] = [];

    headers.forEach((h, i) => {
      if (!h || months.some((m) => m.col === i)) return;
      if (product === null && matches(h, SYN.product)) product = i;
      else if (entity === null && matches(h, SYN.entity)) entity = i;
      else if (agent === null && matches(h, SYN.agent)) agent = i;
      else if (channel === null && matches(h, SYN.channel)) channel = i;
      else if (matches(h, SYN.customer)) customers.push(i);
    });

    if (agent === null) continue;

    let customer: number | null = null;
    if (entity === null && customers.length >= 2) {
      // Sheets like LMNT / SkinkoE / Hdrobooster: two "customer" columns —
      // the first is the id, the second the display name.
      entity = customers[0]!;
      customer = customers[1]!;
    } else {
      customer = customers[0] ?? null;
    }

    if (entity === null) continue;

    return { headerRow: r, product, entity, customer, channel, agent, months };
  }
  return null;
}

/* ---------------- main ---------------- */

export async function parseWorkbook(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const sheets: SheetReport[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: string[] = [];
  const facts: ParsedFact[] = [];
  const seen = new Set<string>();
  const unifiedProducts = new Set<string>();
  const sheetOnlyProducts = new Set<string>();
  const unassignedRows: ParseResult["unassignedRows"] = [];
  const negativeRows: ParseResult["negativeRows"] = [];

  type Parsed = { name: string; map: ColumnMap; grid: Grid; unified: boolean; aggregate?: boolean };
  const parsed: Parsed[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
    const map = buildMap(grid);
    if (!map) {
      sheets.push({
        name,
        kind: "ignored",
        product: null,
        dataRows: Math.max(grid.length - 1, 0),
        facts: 0,
        months: 0,
        reason: "לא זוהתה טבלת מכירות (חסרה עמודת סוכן/מזהה או עמודות חודשים)",
        included: false,
      });
      continue;
    }
    parsed.push({ name, map, grid, unified: map.product !== null });
  }

  // Choose the primary unified sheet — other grouped views aren't loaded to
  // avoid double-counting the same data.
  const unifiedSheets = parsed.filter((p) => p.unified);
  let primary: Parsed | null = null;
  if (unifiedSheets.length) {
    primary =
      unifiedSheets.find((p) => p.name.includes("מאוחד") && !p.name.includes("מקובצ")) ??
      unifiedSheets.reduce((a, b) => (b.grid.length > a.grid.length ? b : a));
  }
  for (const p of unifiedSheets) {
    if (p !== primary) p.aggregate = true;
  }
  parsed.sort((a, b) => Number(b.unified && !b.aggregate) - Number(a.unified && !a.aggregate));

  for (const { name, map, grid, unified, aggregate } of parsed) {
    if (aggregate) {
      sheets.push({
        name,
        kind: "aggregate",
        product: null,
        dataRows: Math.max(grid.length - map.headerRow - 1, 0),
        facts: 0,
        months: map.months.length,
        reason: "תצוגה מקובצת של אותם נתונים — לא נקלטת כדי למנוע ספירה כפולה",
        included: false,
      });
      continue;
    }
    const sheetProduct = cleanName(name);
    let count = 0;
    let dataRows = 0;

    for (let r = map.headerRow + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const rawAgent = cleanName(row[map.agent!]);
      const entityId = cleanName(row[map.entity!]);
      const product = map.product !== null ? cleanName(row[map.product]) : sheetProduct;

      if (!rawAgent && !entityId) continue;
      dataRows++;

      const isTotalRow =
        /סה״כ|סה"כ|total/i.test(product) || /סה״כ|סה"כ|total/i.test(entityId);
      if (isTotalRow) continue;

      if (!entityId || !product) {
        if (rejected.length < 500) {
          rejected.push({
            sheet: name,
            row: r + 1,
            reason: !entityId ? "חסר מזהה לקוח" : "חסר שם מוצר",
            sample: [entityId, cleanName(map.customer !== null ? row[map.customer] : ""), rawAgent]
              .filter(Boolean)
              .join(" · "),
          });
        }
        continue;
      }

      const agent = rawAgent || UNASSIGNED_AGENT;
      const customer = map.customer !== null ? cleanName(row[map.customer]) || null : null;
      const channel = map.channel !== null ? cleanName(row[map.channel]) || null : null;

      let rowQty = 0;
      let rowAdded = 0;
      for (const m of map.months) {
        const qty = toQty(row[m.col]);
        if (!qty) continue;
        const key = `${agent}|${entityId}|${product}|${m.ym}`;
        if (seen.has(key)) continue;
        seen.add(key);
        facts.push({ sheet: name, product, entity_id: entityId, customer, channel, agent, ym: m.ym, qty });
        count++;
        rowQty += qty;
        rowAdded++;
        if (unified) unifiedProducts.add(product);
        else if (!unifiedProducts.has(product)) sheetOnlyProducts.add(product);

        if (qty < 0 && negativeRows.length < 500) {
          negativeRows.push({
            sheet: name,
            row: r + 1,
            entityId,
            customer: customer ?? "",
            product,
            ym: m.ym,
            qty,
          });
        }
      }

      if (!rawAgent && rowAdded) {
        unassignedRows.push({
          sheet: name,
          row: r + 1,
          entityId,
          customer: customer ?? "",
          product,
          qty: rowQty,
        });
      }
    }

    sheets.push({
      name,
      kind: unified ? "unified" : "product",
      product: unified ? null : sheetProduct,
      dataRows,
      facts: count,
      months: map.months.length,
      reason: unified
        ? "גיליון מאוחד — מקור האמת"
        : count > 0
          ? "גיליון מוצר — נקלט והוצלב מול המאוחד"
          : "גיליון מוצר — כל השורות כבר קיימות במאוחד",
      included: count > 0,
    });
  }

  const onlyInSheets = [...sheetOnlyProducts].filter((p) => !unifiedProducts.has(p));
  for (const p of onlyInSheets) {
    warnings.push(`המוצר «${p}» קיים בגיליון נפרד אך חסר בגיליון המאוחד — נקלט מגיליון המוצר.`);
  }
  if (unassignedRows.length)
    warnings.push(`${unassignedRows.length} שורות ללא סוכן בקובץ — נקלטו תחת «${UNASSIGNED_AGENT}».`);
  if (negativeRows.length)
    warnings.push(
      `${negativeRows.length} שורות עם כמות שלילית (יתכן שמדובר בהחזרות) — נקלטו כפי שהן מהמקור, ` +
        `אך דורשות החלטת מדיניות עסקית ולא הומרו אוטומטית. בדקו את הרשימה לפני אישור הטעינה.`,
    );
  if (rejected.length) warnings.push(`${rejected.length} שורות נפסלו ולא נקלטו.`);
  if (!facts.length) warnings.push("לא נמצאו שורות מכירה בקובץ.");

  let latestMonth = "";
  for (const f of facts) if (f.ym > latestMonth) latestMonth = f.ym;

  return {
    sheets,
    facts,
    rejected,
    warnings,
    latestMonth,
    products: [...new Set(facts.map((f) => f.product))].sort(),
    agents: [...new Set(facts.map((f) => f.agent))].sort(),
    productsOnlyInSheets: onlyInSheets,
    unassignedRows,
    negativeRows,
  };
}
