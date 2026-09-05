/**
 * Stockcast — sync + read model.
 *
 * syncShop() is the only thing that talks to Shopify. The UI reads
 * getReorderList(), which is pure DB + math, so page loads stay fast and we
 * never burn API credits on a refresh.
 */

import db from "../db.server";
import {
  fetchCurrentInventory,
  fetchLocations,
  fetchSalesHistory,
} from "./shopify-data.server";
import { selectInventoryLocation } from "./location-selection";
import {
  DEFAULT_WINDOW_DAYS,
  buildReorderList,
  calculateReorder,
  sortByUrgency,
  type ReorderRow,
  type SkuVelocityInput,
} from "./reorder";
import { toSyncErrorMessage } from "./sync-errors";

type AdminClient = Parameters<typeof fetchLocations>[0];
type DbClient = typeof db;
type CachedVelocityRow = {
  sku: string;
  variantId: string | null;
  productTitle: string;
  variantTitle: string | null;
  currentInventory: number;
  unitsSold: number;
  windowDays: number;
};
type ProductSettingRow = {
  sku: string;
  leadTimeDays: number | null;
  safetyBufferUnits: number | null;
};
type ShopLocationRow = {
  locationId: string;
  name: string;
  isFulfillmentService: boolean;
};
type SyncDeps = {
  dbClient: DbClient;
  fetchLocationsFn: typeof fetchLocations;
  fetchSalesHistoryFn: typeof fetchSalesHistory;
  fetchCurrentInventoryFn: typeof fetchCurrentInventory;
  logError: (message: string, error: unknown) => void;
};

const defaultSyncDeps: SyncDeps = {
  dbClient: db,
  fetchLocationsFn: fetchLocations,
  fetchSalesHistoryFn: fetchSalesHistory,
  fetchCurrentInventoryFn: fetchCurrentInventory,
  logError: (message: string, error: unknown) => console.error(message, error),
};

export async function getShopConfig(shop: string, dbClient: DbClient = db) {
  return dbClient.shopConfig.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

/**
 * Pull sales + inventory and cache the result. Safe to call repeatedly.
 *
 * `requestedLocationId` switches the shop to a different inventory location.
 * When omitted, the previously saved location is kept (or a sensible default
 * is chosen for a brand-new shop).
 */
export async function syncShop(
  admin: AdminClient,
  shop: string,
  requestedLocationId: string | null = null,
  deps: Partial<SyncDeps> = {},
) {
  const merged: SyncDeps = { ...defaultSyncDeps, ...deps };
  const config = await getShopConfig(shop, merged.dbClient);
  const windowDays = config.windowDays || DEFAULT_WINDOW_DAYS;

  try {
    const snapshot = await merged.fetchLocationsFn(admin);
    const location = selectInventoryLocation(
      snapshot,
      requestedLocationId,
      config.primaryLocationId,
    );
    const [sales, inventory] = await Promise.all([
      merged.fetchSalesHistoryFn(admin, windowDays),
      merged.fetchCurrentInventoryFn(admin, location.id),
    ]);

    // Inventory is the spine: a SKU with sales but no tracked stock record
    // can't be reordered against, so it is dropped.
    const rows = [...inventory.values()].map((inv) => ({
      shop,
      sku: inv.sku,
      variantId: inv.variantId,
      productTitle: inv.productTitle,
      variantTitle: inv.variantTitle,
      currentInventory: inv.available,
      unitsSold: sales.get(inv.sku)?.unitsSold ?? 0,
      windowDays,
    }));

    await merged.dbClient.$transaction([
      merged.dbClient.cachedVelocity.deleteMany({ where: { shop } }),
      ...(rows.length
        ? [merged.dbClient.cachedVelocity.createMany({ data: rows })]
        : []),
      merged.dbClient.shopLocation.deleteMany({ where: { shop } }),
      merged.dbClient.shopLocation.createMany({
        data: snapshot.locations.map((item) => ({
          shop,
          locationId: item.id,
          name: item.name,
          isActive: item.isActive,
          isFulfillmentService: item.isFulfillmentService,
        })),
      }),
      merged.dbClient.shopConfig.update({
        where: { shop },
        data: {
          primaryLocationId: location.id,
          primaryLocationName: location.name,
          lastSyncAt: new Date(),
          lastSyncError: null,
        },
      }),
    ]);

    return { ok: true as const, skuCount: rows.length };
  } catch (error) {
    const message = toSyncErrorMessage(error);
    merged.logError(`[stockcast] sync failed for ${shop}:`, message);
    await merged.dbClient.shopConfig.update({
      where: { shop },
      data: { lastSyncError: message },
    });
    return { ok: false as const, error: message };
  }
}

/** Join cached velocity with per-SKU overrides and run the reorder math. */
export async function getReorderList(
  shop: string,
  { includeHealthy = false } = {},
): Promise<{
  rows: ReorderRow[];
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  totalTrackedSkus: number;
  onboardedAt: Date | null;
  locationId: string | null;
  locationName: string | null;
  locations: Array<{ id: string; name: string; isFulfillmentService: boolean }>;
}> {
  const [config, cached, settings, locations] = await Promise.all([
    getShopConfig(shop),
    db.cachedVelocity.findMany({ where: { shop } }),
    db.productSetting.findMany({ where: { shop } }),
    db.shopLocation.findMany({
      where: { shop, isActive: true },
      orderBy: [{ isFulfillmentService: "asc" }, { name: "asc" }],
    }),
  ]);
  const cachedRows = cached as CachedVelocityRow[];
  const settingRows = settings as ProductSettingRow[];
  const locationRows = locations as ShopLocationRow[];

  const overrides = new Map(settingRows.map((setting) => [setting.sku, setting]));

  const inputs: SkuVelocityInput[] = cachedRows.map((row) => ({
    sku: row.sku,
    variantId: row.variantId ?? "",
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    currentInventory: row.currentInventory,
    unitsSold: row.unitsSold,
    windowDays: row.windowDays,
    leadTimeDays: overrides.get(row.sku)?.leadTimeDays ?? null,
    safetyBufferUnits: overrides.get(row.sku)?.safetyBufferUnits ?? null,
    reorderCycleDays: config.reorderCycleDays,
  }));

  const rows = includeHealthy
    ? sortByUrgency(inputs.map(calculateReorder))
    : buildReorderList(inputs);

  return {
    rows,
    lastSyncAt: config.lastSyncAt,
    lastSyncError: config.lastSyncError,
    totalTrackedSkus: cachedRows.length,
    onboardedAt: config.onboardedAt,
    locationId: config.primaryLocationId,
    locationName: config.primaryLocationName,
    locations: locationRows.map((location) => ({
      id: location.locationId,
      name: location.name,
      isFulfillmentService: location.isFulfillmentService,
    })),
  };
}

export async function saveProductSetting(
  shop: string,
  sku: string,
  patch: { leadTimeDays?: number | null; safetyBufferUnits?: number | null },
) {
  return db.productSetting.upsert({
    where: { shop_sku: { shop, sku } },
    update: patch,
    create: { shop, sku, ...patch },
  });
}

export async function clearShopData(shop: string) {
  await db.$transaction([
    db.cachedVelocity.deleteMany({ where: { shop } }),
    db.productSetting.deleteMany({ where: { shop } }),
    db.shopLocation.deleteMany({ where: { shop } }),
    db.shopConfig.deleteMany({ where: { shop } }),
  ]);
}
