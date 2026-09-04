/**
 * Restock Radar — reorder engine (Phase 2)
 *
 * Pure functions only. No Shopify calls, no DB access, no I/O.
 * Everything here is deterministic so it can be unit tested without a store.
 */

export const DEFAULT_LEAD_TIME_DAYS = 7;
export const DEFAULT_REORDER_CYCLE_DAYS = 14;
/** Safety buffer defaults to 20% of average WEEKLY sales. */
export const DEFAULT_SAFETY_BUFFER_WEEKS_PCT = 0.2;
/** Lookback window used to compute velocity. Keep <= 60: the Admin API only
 *  exposes the last 60 days of orders without the `read_all_orders` scope. */
export const DEFAULT_WINDOW_DAYS = 30;

export interface SkuVelocityInput {
  sku: string;
  variantId: string;
  productTitle: string;
  variantTitle?: string | null;
  /** Units currently available at the primary location. */
  currentInventory: number;
  /** Units sold across the lookback window. */
  unitsSold: number;
  /** Length of the lookback window in days. */
  windowDays: number;
  /** Merchant overrides. Null/undefined means "use the default". */
  leadTimeDays?: number | null;
  safetyBufferUnits?: number | null;
  reorderCycleDays?: number | null;
}

export interface ReorderRow {
  sku: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  currentInventory: number;
  unitsSold: number;
  windowDays: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyBufferUnits: number;
  reorderCycleDays: number;
  reorderPoint: number;
  /** Infinity when nothing is selling — render as "—", never as a number. */
  daysOfStockLeft: number;
  needsReorder: boolean;
  suggestedOrderQty: number;
  /** Set when the merchant has not overridden the value. Drives the UI hint. */
  usingDefaultLeadTime: boolean;
  usingDefaultSafetyBuffer: boolean;
}

/** 20% of average weekly sales, rounded up. */
export function defaultSafetyBuffer(avgDailySales: number): number {
  return Math.ceil(avgDailySales * 7 * DEFAULT_SAFETY_BUFFER_WEEKS_PCT);
}

export function calculateReorder(input: SkuVelocityInput): ReorderRow {
  const windowDays = input.windowDays > 0 ? input.windowDays : DEFAULT_WINDOW_DAYS;
  const unitsSold = Math.max(0, input.unitsSold);
  const currentInventory = input.currentInventory;

  const avgDailySales = unitsSold / windowDays;

  const usingDefaultLeadTime =
    input.leadTimeDays === null || input.leadTimeDays === undefined;
  const leadTimeDays = usingDefaultLeadTime
    ? DEFAULT_LEAD_TIME_DAYS
    : Math.max(0, input.leadTimeDays as number);

  const usingDefaultSafetyBuffer =
    input.safetyBufferUnits === null || input.safetyBufferUnits === undefined;
  const safetyBufferUnits = usingDefaultSafetyBuffer
    ? defaultSafetyBuffer(avgDailySales)
    : Math.max(0, input.safetyBufferUnits as number);

  const reorderCycleDays = Math.max(
    1,
    input.reorderCycleDays ?? DEFAULT_REORDER_CYCLE_DAYS,
  );

  const reorderPoint = avgDailySales * leadTimeDays + safetyBufferUnits;

  const daysOfStockLeft =
    avgDailySales > 0 ? currentInventory / avgDailySales : Infinity;

  // A SKU with no sales in the window has no demand signal — never recommend
  // reordering it, even at zero stock. Guessing here is how a forecasting tool
  // loses a merchant's trust.
  const needsReorder = avgDailySales > 0 && currentInventory <= reorderPoint;

  const rawQty =
    reorderPoint - currentInventory + avgDailySales * reorderCycleDays;
  const suggestedOrderQty = needsReorder ? Math.max(1, Math.ceil(rawQty)) : 0;

  return {
    sku: input.sku,
    variantId: input.variantId,
    productTitle: input.productTitle,
    variantTitle: input.variantTitle ?? null,
    currentInventory,
    unitsSold,
    windowDays,
    avgDailySales: round(avgDailySales, 3),
    leadTimeDays,
    safetyBufferUnits,
    reorderCycleDays,
    reorderPoint: round(reorderPoint, 2),
    daysOfStockLeft: Number.isFinite(daysOfStockLeft)
      ? round(daysOfStockLeft, 1)
      : Infinity,
    needsReorder,
    suggestedOrderQty,
    usingDefaultLeadTime,
    usingDefaultSafetyBuffer,
  };
}

/**
 * Most urgent first: fewest days of stock left. Ties break toward the
 * faster-selling SKU, then alphabetically so the order is stable across runs.
 */
export function sortByUrgency(rows: ReorderRow[]): ReorderRow[] {
  return [...rows].sort((a, b) => {
    if (a.daysOfStockLeft !== b.daysOfStockLeft) {
      return a.daysOfStockLeft - b.daysOfStockLeft;
    }
    if (b.avgDailySales !== a.avgDailySales) {
      return b.avgDailySales - a.avgDailySales;
    }
    return a.sku.localeCompare(b.sku);
  });
}

/** The main view: only SKUs that need reordering, most urgent first. */
export function buildReorderList(inputs: SkuVelocityInput[]): ReorderRow[] {
  return sortByUrgency(inputs.map(calculateReorder).filter((r) => r.needsReorder));
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
