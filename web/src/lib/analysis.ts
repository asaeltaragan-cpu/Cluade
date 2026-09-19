/**
 * Calculation engine — group classification, priority score, recommended targets.
 * Ported from the verified reference implementation. One behavioral change from
 * the reference: summarizeByAgent excludes UNASSIGNED_AGENT by default, since it
 * is a work queue for unassigned rows, not a real agent to rank or target.
 */

export const GROWTH_RATE = 0.15;

/** Virtual agent for source rows that have no agent assigned. */
export const UNASSIGNED_AGENT = "ללא סוכן";

export const GROUPS = ["ירד", "נעלם", "חדש/חוזר", "עלה", "יציב"] as const;
export type Group = (typeof GROUPS)[number];

export const STATUSES = ["טרם טופל", "בטיפול", "נוצר קשר", "הושלם", "לא רלוונטי"] as const;
export type Status = (typeof STATUSES)[number];

export type Fact = {
  product: string;
  entity_id: string;
  customer: string | null;
  channel: string | null;
  agent: string;
  ym: string;
  qty: number;
};

export type CustomerRow = {
  key: string;
  agent: string;
  entityId: string;
  product: string;
  customer: string;
  channel: string | null;
  /** Quantity in the selected months — comparison year */
  qtyPrev: number;
  /** Quantity in the selected months — analysis year */
  qtyYtd: number;
  /** Quantity across the full comparison year (ignores month filter) */
  qtyPrevFull: number;
  /** Quantity across the full analysis year (ignores month filter) */
  qtyYtdFull: number;
  avgPrev: number;
  avgYtd: number;
  paceChange: number | null;
  lastPurchase: string | null;
  monthsGap: number | null;
  group: Group;
  annualTarget: number;
  neededRest: number;
  monthlyNeed: number;
  score: number;
};

export function cleanName(value: unknown): string {
  return String(value ?? "")
    .replace(/[​-‏‪-‮﻿]/g, "")
    .trim();
}

export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-");
  return Number(y) * 12 + Number(m) - 1;
}

export type Period = {
  /** Latest month present in the source file */
  latestYm: string;
  /** Selected analysis year */
  year: number;
  /** Comparison year */
  prevYear: number;
  /** Months of the analysis year already present in the file */
  monthsElapsed: number;
  monthsLeft: number;
  fromMonth: number;
  toMonth: number;
  /** Active months in the window for the analysis year (average denominator) */
  curMonths: number;
  /** Active months in the window for the comparison year */
  prevMonths: number;
};

export function monthsElapsedIn(latestYm: string, year: number): number {
  const latestYear = Number(latestYm.slice(0, 4));
  if (year < latestYear) return 12;
  if (year > latestYear) return 0;
  return Number(latestYm.slice(5, 7));
}

export function derivePeriod(
  latestYm: string,
  opts?: {
    year?: number | undefined;
    prevYear?: number | undefined;
    fromMonth?: number | undefined;
    toMonth?: number | undefined;
  },
): Period {
  const latestYear = Number(latestYm.slice(0, 4));
  const year = opts?.year ?? latestYear;
  const prevYear = opts?.prevYear ?? year - 1;
  const monthsElapsed = monthsElapsedIn(latestYm, year);
  const from = Math.max(1, Math.min(12, opts?.fromMonth ?? 1));
  const to = Math.max(from, Math.min(12, opts?.toMonth ?? 12));
  const curMonths = Math.max(0, Math.min(to, monthsElapsed) - from + 1);
  return {
    latestYm,
    year,
    prevYear,
    monthsElapsed,
    monthsLeft: Math.max(0, 12 - monthsElapsed),
    fromMonth: from,
    toMonth: to,
    curMonths,
    prevMonths: to - from + 1,
  };
}

function classify(qtyPrev: number, qtyYtd: number, avgPrev: number, avgYtd: number): Group {
  if (qtyPrev > 0 && qtyYtd === 0) return "נעלם";
  if (qtyPrev === 0 && qtyYtd > 0) return "חדש/חוזר";
  if (qtyPrev > 0 && avgYtd < avgPrev * 0.8) return "ירד";
  if (qtyPrev > 0 && avgYtd > avgPrev * 1.05) return "עלה";
  return "יציב";
}

/** Suggested follow-up task — derived only from the source-file numbers. */
export function suggestTask(row: {
  group: Group;
  monthsGap: number | null;
  neededRest: number;
  qtyPrev: number;
}): string {
  if (row.group === "נעלם") return "ליצור קשר — לא רכש בתקופה";
  if (row.group === "ירד") return "פגישת שימור — ירידה בקצב הרכישה";
  if (row.monthsGap !== null && row.monthsGap >= 3) return "בדיקת מלאי והזמנה חוזרת";
  if (row.group === "חדש/חוזר") return "ליווי לקוח חדש והרחבת סל";
  if (row.neededRest > 0 && row.qtyPrev > 0) return "דחיפה לסגירת היעד";
  return "מעקב שוטף";
}

export function buildCustomerRows(facts: Fact[], period: Period): CustomerRow[] {
  type Acc = CustomerRow & { _lastAll: string | null };
  const map = new Map<string, Acc>();
  const latestIdx = monthIndex(period.latestYm);

  for (const f of facts) {
    const qty = Number(f.qty) || 0;
    const year = Number(f.ym.slice(0, 4));
    if (year !== period.year && year !== period.prevYear) continue;
    const month = Number(f.ym.slice(5, 7));
    const key = `${f.agent}|${f.entity_id}|${f.product}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        agent: f.agent,
        entityId: f.entity_id,
        product: f.product,
        customer: f.customer ?? f.entity_id,
        channel: f.channel ?? null,
        qtyPrev: 0,
        qtyYtd: 0,
        qtyPrevFull: 0,
        qtyYtdFull: 0,
        avgPrev: 0,
        avgYtd: 0,
        paceChange: null,
        lastPurchase: null,
        monthsGap: null,
        group: "יציב",
        annualTarget: 0,
        neededRest: 0,
        monthlyNeed: 0,
        score: 0,
        _lastAll: null,
      };
      map.set(key, row);
    }
    if (qty === 0) continue;

    if (year === period.prevYear) row.qtyPrevFull += qty;
    if (year === period.year) row.qtyYtdFull += qty;
    if (!row._lastAll || f.ym > row._lastAll) row._lastAll = f.ym;

    if (month < period.fromMonth || month > period.toMonth) continue;
    if (year === period.prevYear) row.qtyPrev += qty;
    if (year === period.year) row.qtyYtd += qty;
    if (year === period.year && (!row.lastPurchase || f.ym > row.lastPurchase)) {
      row.lastPurchase = f.ym;
    }
  }

  const rows: CustomerRow[] = [];
  for (const row of map.values()) {
    if (row.qtyPrev === 0 && row.qtyYtd === 0) continue;
    row.lastPurchase = row.lastPurchase ?? row._lastAll;
    row.avgPrev = row.qtyPrev / Math.max(1, period.prevMonths);
    row.avgYtd = row.qtyYtd / Math.max(1, period.curMonths);

    row.paceChange = row.avgPrev > 0 ? row.avgYtd / row.avgPrev - 1 : null;
    row.monthsGap = row.lastPurchase ? latestIdx - monthIndex(row.lastPurchase) : null;
    row.group = classify(row.qtyPrev, row.qtyYtd, row.avgPrev, row.avgYtd);
    row.annualTarget = Math.round(row.qtyPrevFull * (1 + GROWTH_RATE) * 100) / 100;
    row.neededRest = Math.max(0, Math.round((row.annualTarget - row.qtyYtdFull) * 100) / 100);
    row.monthlyNeed = period.monthsLeft
      ? Math.round((row.neededRest / period.monthsLeft) * 10) / 10
      : 0;

    const sizeScore = Math.min(1, row.qtyPrev / 300);
    const dropScore = row.paceChange === null ? 0 : Math.min(1, Math.max(0, -row.paceChange));
    const gapScore = row.monthsGap === null ? 1 : Math.min(1, row.monthsGap / 6);
    row.score = Math.round((sizeScore * 0.5 + dropScore * 0.3 + gapScore * 0.2) * 100);

    const { _lastAll, ...clean } = row;
    void _lastAll;
    rows.push(clean);
  }

  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export type AgentSummary = {
  agent: string;
  qtyPrev: number;
  qtyYtd: number;
  recommended: number;
  byProduct: Record<string, { prev: number; ytd: number; recommended: number }>;
  groups: Record<Group, number>;
  customers: number;
};

/**
 * Aggregates rows by agent for ranking/targets. UNASSIGNED_AGENT is excluded
 * by default — it is a work queue for unshipped-agent rows, not a rankable
 * agent, so it must never appear in agent leaderboards or attainment tables.
 * Pass includeUnassigned:true only for screens that intentionally show it
 * (e.g. a distinct "unassigned sales" summary card).
 */
export function summarizeByAgent(
  rows: CustomerRow[],
  opts?: { includeUnassigned?: boolean },
): AgentSummary[] {
  const map = new Map<string, AgentSummary>();
  for (const r of rows) {
    if (!opts?.includeUnassigned && r.agent === UNASSIGNED_AGENT) continue;
    let s = map.get(r.agent);
    if (!s) {
      s = {
        agent: r.agent,
        qtyPrev: 0,
        qtyYtd: 0,
        recommended: 0,
        byProduct: {},
        groups: { ירד: 0, נעלם: 0, "חדש/חוזר": 0, עלה: 0, יציב: 0 },
        customers: 0,
      };
      map.set(r.agent, s);
    }
    s.qtyPrev += r.qtyPrev;
    s.qtyYtd += r.qtyYtd;
    s.recommended += r.annualTarget;
    s.groups[r.group] += 1;
    s.customers += 1;
    const p = (s.byProduct[r.product] ??= { prev: 0, ytd: 0, recommended: 0 });
    p.prev += r.qtyPrev;
    p.ytd += r.qtyYtd;
    p.recommended += r.annualTarget;
  }
  return [...map.values()].sort((a, b) => b.qtyYtd - a.qtyYtd);
}

/** Totals for the rows belonging to UNASSIGNED_AGENT, shown as a distinct card. */
export function summarizeUnassigned(rows: CustomerRow[]) {
  const list = rows.filter((r) => r.agent === UNASSIGNED_AGENT);
  return {
    customers: list.length,
    qtyPrev: list.reduce((s, r) => s + r.qtyPrev, 0),
    qtyYtd: list.reduce((s, r) => s + r.qtyYtd, 0),
  };
}

export function monthlySeries(
  facts: Fact[],
  period: Period,
  opts?: { agent?: string; product?: string },
) {
  const out: { month: string; prev: number; current: number }[] = [];
  for (let m = period.fromMonth; m <= period.toMonth; m++) {
    out.push({ month: MONTH_SHORT[m - 1] ?? String(m), prev: 0, current: 0 });
  }
  for (const f of facts) {
    if (opts?.agent && f.agent !== opts.agent) continue;
    if (opts?.product && f.product !== opts.product) continue;
    const year = Number(f.ym.slice(0, 4));
    const m = Number(f.ym.slice(5, 7));
    if (m < period.fromMonth || m > period.toMonth) continue;
    const bucket = out[m - period.fromMonth];
    if (!bucket) continue;
    if (year === period.prevYear) bucket.prev += Number(f.qty) || 0;
    if (year === period.year) bucket.current += Number(f.qty) || 0;
  }
  return out;
}

export const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export const MONTH_SHORT = [
  "ינו",
  "פבר",
  "מרץ",
  "אפר",
  "מאי",
  "יונ",
  "יול",
  "אוג",
  "ספט",
  "אוק",
  "נוב",
  "דצמ",
];

export const QUARTERS = [
  { id: "q1", label: "רבעון 1 (ינו–מרץ)", from: 1, to: 3 },
  { id: "q2", label: "רבעון 2 (אפר–יונ)", from: 4, to: 6 },
  { id: "q3", label: "רבעון 3 (יול–ספט)", from: 7, to: 9 },
  { id: "q4", label: "רבעון 4 (אוק–דצמ)", from: 10, to: 12 },
] as const;

export function periodLabel(period: Period): string {
  if (period.fromMonth === 1 && period.toMonth === 12) return "כל השנה";
  const q = QUARTERS.find((x) => x.from === period.fromMonth && x.to === period.toMonth);
  if (q) return q.label;
  if (period.fromMonth === period.toMonth) return MONTH_NAMES[period.fromMonth - 1]!;
  return `${MONTH_NAMES[period.fromMonth - 1]}–${MONTH_NAMES[period.toMonth - 1]}`;
}

/** Field explanations shown to users on the work list / agent screens. */
export const FIELD_GUIDE: { label: string; desc: string }[] = [
  {
    label: "עדיפות",
    desc:
      "ציון 0–100 שמדרג כמה דחוף לטפל בשילוב לקוח+מוצר. מחושב משלושה רכיבים, כל אחד בסולם 0–1 ואז משוקלל: " +
      "גודל הלקוח (50%) = הכמות בשנת ההשוואה חלקי 300, מקסימום 1; " +
      "עוצמת הירידה (30%) = אחוז הירידה בקצב החודשי מול שנת ההשוואה (עלייה או אין נתון = 0), מקסימום 1; " +
      "זמן מאז הרכישה האחרונה (20%) = מספר החודשים מאז הרכישה האחרונה חלקי 6, מקסימום 1 (ללא רכישה כלל = 1). " +
      "התוצאה מוכפלת ב-100 ומעוגלת. 60 ומעלה = עדיפות גבוהה, 30–59 בינונית, מתחת ל-30 נמוכה.",
  },
  {
    label: "קבוצה",
    desc: "נעלם = קנה בשנת ההשוואה ולא בתקופה הנבחרת · ירד = ממוצע חודשי נמוך מ-80% מאשתקד · עלה = גבוה מ-105% · חדש/חוזר = קנה רק בשנה הנבחרת · יציב = כל השאר.",
  },
  { label: "כמות בתקופה", desc: "סכום היחידות בקובץ המקור עבור אותו לקוח, מוצר וסוכן, בחודשים שנבחרו בסינון." },
  { label: "ממוצע חודשי", desc: "הכמות בתקופה חלקי מספר החודשים שכבר קיימים בקובץ באותה תקופה." },
  { label: "שינוי בקצב", desc: "הממוצע החודשי בשנה הנבחרת חלקי הממוצע החודשי בשנת ההשוואה, פחות 1." },
  { label: "רכישה אחרונה", desc: "החודש האחרון שבו נרשמה כמות גדולה מאפס לאותו לקוח ומוצר." },
  { label: "פער חודשים", desc: "מספר החודשים בין הרכישה האחרונה לחודש האחרון שבקובץ." },
  { label: "יעד מומלץ", desc: "כל שנת ההשוואה בתוספת 15% צמיחה. אינו מושפע מסינון החודשים." },
  { label: "חסר ליעד", desc: "היעד המומלץ פחות כל מה שנמכר בשנה הנבחרת עד היום. לא יורד מתחת לאפס." },
  { label: "נדרש לחודש", desc: "החסר ליעד חלקי מספר החודשים שנותרו עד סוף השנה." },
  { label: "משימה", desc: "מה שהוזן ידנית. אם לא הוזן — מוצגת ההמלצה האוטומטית לפי הקבוצה והפער." },
  { label: "מעקב הבא", desc: "תאריך שנקבע ידנית. תאריך שעבר בשורה שאינה סגורה מסומן כ״באיחור״." },
];

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("he-IL", { maximumFractionDigits: digits });
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
