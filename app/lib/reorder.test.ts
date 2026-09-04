/**
 * Reorder engine tests. Run with:  node --test --experimental-strip-types app/lib/
 * (Node 22+). No test framework needed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LEAD_TIME_DAYS,
  buildReorderList,
  calculateReorder,
  defaultSafetyBuffer,
  sortByUrgency,
  type SkuVelocityInput,
} from "./reorder.ts";

const base: SkuVelocityInput = {
  sku: "SKU-1",
  variantId: "gid://shopify/ProductVariant/1",
  productTitle: "Test",
  currentInventory: 0,
  unitsSold: 0,
  windowDays: 30,
};

test("computes avg daily sales over the window", () => {
  const r = calculateReorder({ ...base, unitsSold: 60, currentInventory: 100 });
  assert.equal(r.avgDailySales, 2);
  assert.equal(r.daysOfStockLeft, 50);
});

test("applies the documented reorder-point formula", () => {
  // 2/day, lead 7 => 14, buffer 20% of weekly (14) => 3 (ceil of 2.8) => RP 17
  const r = calculateReorder({ ...base, unitsSold: 60, currentInventory: 10 });
  assert.equal(r.leadTimeDays, DEFAULT_LEAD_TIME_DAYS);
  assert.equal(r.safetyBufferUnits, defaultSafetyBuffer(2));
  assert.equal(r.safetyBufferUnits, 3);
  assert.equal(r.reorderPoint, 17);
  assert.equal(r.needsReorder, true);
  // 17 - 10 + (2 * 14) = 35
  assert.equal(r.suggestedOrderQty, 35);
});

test("does not flag a SKU with healthy stock", () => {
  const r = calculateReorder({ ...base, unitsSold: 30, currentInventory: 500 });
  assert.equal(r.needsReorder, false);
  assert.equal(r.suggestedOrderQty, 0);
});

test("a SKU with no sales is never recommended, even at zero stock", () => {
  const r = calculateReorder({ ...base, unitsSold: 0, currentInventory: 0 });
  assert.equal(r.avgDailySales, 0);
  assert.equal(r.needsReorder, false);
  assert.equal(r.daysOfStockLeft, Infinity);
  assert.equal(r.suggestedOrderQty, 0);
});

test("stocked out with real demand is maximally urgent", () => {
  const r = calculateReorder({ ...base, unitsSold: 90, currentInventory: 0 });
  assert.equal(r.daysOfStockLeft, 0);
  assert.equal(r.needsReorder, true);
  assert.ok(r.suggestedOrderQty > 0);
});

test("negative inventory (oversold) still produces a positive order qty", () => {
  const r = calculateReorder({ ...base, unitsSold: 30, currentInventory: -5 });
  assert.equal(r.needsReorder, true);
  assert.ok(r.suggestedOrderQty >= 1);
});

test("merchant overrides beat defaults", () => {
  const r = calculateReorder({
    ...base,
    unitsSold: 30,
    currentInventory: 20,
    leadTimeDays: 30,
    safetyBufferUnits: 50,
  });
  assert.equal(r.usingDefaultLeadTime, false);
  assert.equal(r.usingDefaultSafetyBuffer, false);
  assert.equal(r.reorderPoint, 1 * 30 + 50);
  assert.equal(r.needsReorder, true);
});

test("a zero-day lead time still respects the safety buffer", () => {
  const r = calculateReorder({
    ...base,
    unitsSold: 30,
    currentInventory: 4,
    leadTimeDays: 0,
    safetyBufferUnits: 5,
  });
  assert.equal(r.reorderPoint, 5);
  assert.equal(r.needsReorder, true);
});

test("sorts most urgent first and puts no-sales SKUs last", () => {
  const rows = [
    calculateReorder({ ...base, sku: "SLOW", unitsSold: 30, currentInventory: 100 }),
    calculateReorder({ ...base, sku: "DEAD", unitsSold: 0, currentInventory: 5 }),
    calculateReorder({ ...base, sku: "URGENT", unitsSold: 60, currentInventory: 4 }),
  ];
  assert.deepEqual(
    sortByUrgency(rows).map((r) => r.sku),
    ["URGENT", "SLOW", "DEAD"],
  );
});

test("buildReorderList returns only actionable rows, sorted", () => {
  const list = buildReorderList([
    { ...base, sku: "HEALTHY", unitsSold: 30, currentInventory: 900 },
    { ...base, sku: "DEAD", unitsSold: 0, currentInventory: 0 },
    { ...base, sku: "LOW", unitsSold: 60, currentInventory: 12 },
    { ...base, sku: "CRITICAL", unitsSold: 60, currentInventory: 1 },
  ]);
  assert.deepEqual(list.map((r) => r.sku), ["CRITICAL", "LOW"]);
});

test("window length is normalized, not trusted blindly", () => {
  const r = calculateReorder({ ...base, unitsSold: 30, currentInventory: 10, windowDays: 0 });
  assert.equal(r.windowDays, 30);
  assert.equal(r.avgDailySales, 1);
});

test("blank overrides are marked as defaults for UI hints", () => {
  const r = calculateReorder({
    ...base,
    unitsSold: 45,
    currentInventory: 20,
    leadTimeDays: null,
    safetyBufferUnits: undefined,
  });
  assert.equal(r.usingDefaultLeadTime, true);
  assert.equal(r.usingDefaultSafetyBuffer, true);
});

test("reorder cycle days is normalized to at least one day", () => {
  const r = calculateReorder({
    ...base,
    unitsSold: 30,
    currentInventory: 0,
    reorderCycleDays: 0,
  });
  assert.equal(r.reorderCycleDays, 1);
});

test("urgency tie-break uses higher velocity, then sku name", () => {
  const rows = [
    calculateReorder({
      ...base,
      sku: "BBB",
      unitsSold: 30,
      currentInventory: 30,
      leadTimeDays: 30,
      safetyBufferUnits: 0,
    }),
    calculateReorder({
      ...base,
      sku: "AAA",
      unitsSold: 60,
      currentInventory: 60,
      leadTimeDays: 30,
      safetyBufferUnits: 0,
    }),
  ];
  assert.deepEqual(sortByUrgency(rows).map((r) => r.sku), ["AAA", "BBB"]);
});
