import { test } from "node:test";
import assert from "node:assert/strict";

import { csvFilename, reorderListToCsv } from "./csv.ts";
import type { ReorderRow } from "./reorder.ts";

const row: ReorderRow = {
  sku: "SKU-1",
  variantId: "gid://shopify/ProductVariant/1",
  productTitle: "Widget",
  variantTitle: null,
  currentInventory: 12,
  unitsSold: 30,
  windowDays: 30,
  avgDailySales: 1,
  leadTimeDays: 7,
  safetyBufferUnits: 2,
  reorderCycleDays: 14,
  reorderPoint: 9,
  daysOfStockLeft: 12,
  needsReorder: false,
  suggestedOrderQty: 0,
  usingDefaultLeadTime: true,
  usingDefaultSafetyBuffer: true,
};

test("escapes CSV formulas in user-controlled fields", () => {
  const csv = reorderListToCsv([
    {
      ...row,
      sku: "=SUM(A1:A2)",
      productTitle: "+HYPERLINK(\"https://malicious.example\")",
      variantTitle: "@unsafe",
    },
  ]);
  assert.match(csv, /'=SUM\(A1:A2\)/);
  assert.match(csv, /'\+HYPERLINK/);
  assert.match(csv, /'@unsafe/);
});

test("quotes values containing commas, quotes, or newlines", () => {
  const csv = reorderListToCsv([
    {
      ...row,
      productTitle: "Large, \"Blue\"",
      variantTitle: "Line 1\nLine 2",
    },
  ]);
  assert.match(csv, /"Large, ""Blue"""/);
  assert.match(csv, /"Line 1\nLine 2"/);
});

test("omits Infinity days-of-stock for spreadsheet compatibility", () => {
  const csv = reorderListToCsv([{ ...row, daysOfStockLeft: Infinity }]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);
  assert.ok((lines[1] ?? "").includes(",,7,2,9,0"));
});

test("builds deterministic filenames from shop domains", () => {
  const name = csvFilename("example-shop.myshopify.com");
  assert.match(name, /^restock-radar-example-shop-\d{4}-\d{2}-\d{2}\.csv$/);
});
