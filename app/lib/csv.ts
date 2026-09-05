import type { ReorderRow } from "./reorder";

const HEADERS = [
  "SKU",
  "Product",
  "Variant",
  "Current stock",
  "Units sold (window)",
  "Avg daily sales",
  "Days of stock left",
  "Lead time (days)",
  "Safety buffer (units)",
  "Reorder point",
  "Suggested reorder qty",
];

function escape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Leading =, +, - or @ can be interpreted as a formula by Excel/Sheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function reorderListToCsv(rows: ReorderRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.sku,
        r.productTitle,
        r.variantTitle ?? "",
        r.currentInventory,
        r.unitsSold,
        r.avgDailySales,
        Number.isFinite(r.daysOfStockLeft) ? r.daysOfStockLeft : "",
        r.leadTimeDays,
        r.safetyBufferUnits,
        r.reorderPoint,
        r.suggestedOrderQty,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function csvFilename(shop: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `stockcast-${shop.replace(/\.myshopify\.com$/, "")}-${date}.csv`;
}
