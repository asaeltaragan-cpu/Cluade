const API_BASE = "https://api.airtable.com/v0";

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}. Set it in the server environment to enable Airtable sync.`);
  return v;
}

/** Fetches every record of a table, following Airtable's offset-based pagination. */
async function listAllRecords(baseId: string, tableId: string, token: string): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${API_BASE}/${baseId}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Airtable request failed (${res.status}) for table ${tableId}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

export type AirtableConfig = {
  token: string;
  baseId: string;
  customersTableId: string;
  salesTableId: string;
};

export function loadAirtableConfig(): AirtableConfig {
  return {
    token: requireEnv("AIRTABLE_TOKEN"),
    baseId: requireEnv("AIRTABLE_BASE_ID"),
    customersTableId: requireEnv("AIRTABLE_CUSTOMERS_TABLE_ID"),
    salesTableId: requireEnv("AIRTABLE_SALES_TABLE_ID"),
  };
}

export type AirtableFact = {
  product: string;
  entity_id: string;
  customer: string | null;
  channel: null;
  agent: string;
  ym: string;
  qty: number;
};

function firstLinkName(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null;
  const first = value[0] as { id?: string; name?: string };
  return typeof first?.name === "string" ? first.name : null;
}

function firstLinkId(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null;
  const first = value[0] as { id?: string };
  return typeof first?.id === "string" ? first.id : null;
}

/**
 * Reads the customers and sales tables and returns Fact-shaped rows, exactly
 * like a parsed Excel workbook. Field names are matched by Hebrew label
 * (the schema found when the base was first inspected), not by field ID, so
 * this keeps working if the base is duplicated.
 */
export async function fetchAirtableFacts(config: AirtableConfig): Promise<{ facts: AirtableFact[]; warnings: string[] }> {
  const warnings: string[] = [];
  const [customers, sales] = await Promise.all([
    listAllRecords(config.baseId, config.customersTableId, config.token),
    listAllRecords(config.baseId, config.salesTableId, config.token),
  ]);

  const customerById = new Map<string, { entityId: string; customerName: string | null; agent: string }>();
  for (const c of customers) {
    const entityId = String(c.fields["מזהה ישות"] ?? "").trim();
    const customerName = c.fields["שם לקוח"] ? String(c.fields["שם לקוח"]).trim() : null;
    const agent = firstLinkName(c.fields["סוכן"]) ?? "";
    if (!entityId) continue;
    customerById.set(c.id, { entityId, customerName, agent: agent || "ללא סוכן" });
  }

  const facts: AirtableFact[] = [];
  let skipped = 0;
  for (const s of sales) {
    const customerRecordId = firstLinkId(s.fields["לקוח"]);
    const product = firstLinkName(s.fields["מוצר"]);
    const month = s.fields["חודש"] ? String(s.fields["חודש"]) : null;
    const qty = typeof s.fields["כמות"] === "number" ? (s.fields["כמות"] as number) : Number(s.fields["כמות"]);

    const customer = customerRecordId ? customerById.get(customerRecordId) : undefined;
    if (!customer || !product || !month || !Number.isFinite(qty)) {
      skipped++;
      continue;
    }
    const ym = month.slice(0, 7);
    facts.push({
      product,
      entity_id: customer.entityId,
      customer: customer.customerName,
      channel: null,
      agent: customer.agent,
      ym,
      qty,
    });
  }
  if (skipped) warnings.push(`${skipped} שורות ב-Airtable דולגו — חסר לקוח, מוצר, חודש או כמות תקינה.`);
  return { facts, warnings };
}
