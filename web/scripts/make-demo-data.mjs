// Generates a FICTIONAL demo workbook (fake agents, customers, products) in the
// same shape the import wizard expects. Run: node scripts/make-demo-data.mjs
import * as XLSX from "xlsx";
import path from "node:path";
import { fileURLToPath } from "node:url";

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const agents = ["נועה דמו", "איתי דמו", "מיכל דמו", "רון דמו"];
const products = ["DemoSerum", "DemoFiller", "DemoGlow"];
const onlyInSheet = "DemoPeel"; // appears only in its own sheet, like LMNT
const months = [];
for (const y of [2025, 2026]) for (let m = 1; m <= 12; m++) if (y < 2026 || m <= 8) months.push(`${y}-${String(m).padStart(2, "0")}`);

// pattern -> multiplier for 2026 vs 2025
const patterns = ["stable", "declining", "growing", "vanished", "new", "stable", "declining", "growing"];
const rows = []; // {agent, id, name, product, qty:{ym:n}}
let idn = 1001;
for (const product of [...products, onlyInSheet]) {
  for (let i = 0; i < 18; i++) {
    const agent = agents[Math.floor(rnd() * agents.length)];
    const pattern = patterns[Math.floor(rnd() * patterns.length)];
    const base = Math.round(5 + rnd() * 60);
    const qty = {};
    for (const ym of months) {
      const y = Number(ym.slice(0, 4));
      const noise = 0.7 + rnd() * 0.6;
      let f = 1;
      if (y === 2026) f = { stable: 1, declining: 0.55, growing: 1.5, vanished: 0, new: 1, }[pattern];
      if (y === 2025 && pattern === "new") f = 0;
      const v = Math.round(base * f * noise);
      if (v > 0 && rnd() > 0.15) qty[ym] = v;
    }
    rows.push({ agent, id: `D${idn++}`, name: `לקוח דמו ${idn - 1000}`, product, qty });
  }
}
// unassigned rows (blank agent)
for (let i = 0; i < 4; i++) {
  rows.push({ agent: "", id: `D${idn++}`, name: `לקוח ללא שיוך ${i + 1}`, product: products[i % products.length], qty: { "2025-03": 12, "2025-09": 9, "2026-02": 15, "2026-06": 8 } });
}
// one negative (return-like) row
rows.push({ agent: agents[0], id: `D${idn++}`, name: "לקוח דמו עם החזרה", product: products[0], qty: { "2025-05": 30, "2026-04": -6, "2026-06": 20 } });

const head = (withProduct) => ["סוכן", "Entity Id", "לקוח", ...(withProduct ? ["שם המוצר"] : []), ...months];
const line = (r, withProduct) => [r.agent, r.id, r.name, ...(withProduct ? [r.product] : []), ...months.map((m) => r.qty[m] ?? null)];

const wb = XLSX.utils.book_new();
const unified = rows.filter((r) => r.product !== onlyInSheet);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(true), ...unified.map((r) => line(r, true))]), "כל המוצרים מאוחד");
// product sheets overlap the unified sheet (must NOT double count)
for (const p of products) {
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(false), ...unified.filter((r) => r.product === p).map((r) => line(r, false))]), p);
}
// product only in its own sheet
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(false), ...rows.filter((r) => r.product === onlyInSheet).map((r) => line(r, false))]), onlyInSheet);

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../demo/demo-sales-data.xlsx");
XLSX.writeFile(wb, out);
console.log("written", out, "rows:", rows.length);
