/**
 * Restock Radar — data layer (Phase 1)
 *
 * Thin wrappers over the Admin GraphQL API. These do paging and aggregation
 * only; no reorder math lives here (see app/lib/reorder.ts).
 *
 * `admin` is the client returned by `authenticate.admin(request)` or
 * `unauthenticated.admin(shop)` from app/shopify.server.
 */

import {
  INVENTORY_QUERY,
  PRIMARY_LOCATION_QUERY,
  SALES_HISTORY_QUERY,
} from "./queries.ts";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const MAX_PAGES = 100; // hard stop so a runaway cursor can never loop forever

export interface PrimaryLocation {
  id: string;
  name: string;
  shopName: string;
  timezone: string;
  currencyCode: string;
}

export interface SkuSales {
  sku: string;
  variantId: string | null;
  name: string;
  unitsSold: number;
}

export interface SkuInventory {
  sku: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  available: number;
}

async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors) {
    throw new Error(`Admin API error: ${JSON.stringify(body.errors)}`);
  }
  if (!body.data) throw new Error("Admin API returned no data");
  return body.data;
}

/**
 * v1 is single-location by design. We take the first active location and treat
 * it as primary. Multi-location is explicitly out of scope.
 */
export async function fetchPrimaryLocation(
  admin: AdminClient,
): Promise<PrimaryLocation> {
  const data = await gql<{
    shop: {
      name: string;
      ianaTimezone: string;
      currencyCode: string;
    };
    locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> };
  }>(admin, PRIMARY_LOCATION_QUERY);

  const location = data.locations.nodes[0];
  if (!location) {
    throw new Error("This shop has no active inventory location.");
  }

  return {
    id: location.id,
    name: location.name,
    shopName: data.shop.name,
    timezone: data.shop.ianaTimezone,
    currencyCode: data.shop.currencyCode,
  };
}

/**
 * Units sold per SKU over the last `daysBack` days.
 *
 * NOTE: without the `read_all_orders` scope the Admin API only returns orders
 * from the last 60 days. Keep daysBack <= 60 unless that scope is approved.
 */
export async function fetchSalesHistory(
  admin: AdminClient,
  daysBack: number,
): Promise<Map<string, SkuSales>> {
  const since = new Date(Date.now() - daysBack * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // Cancelled orders never shipped, so they are not demand signal.
  const searchQuery = `created_at:>=${since} AND status:any AND -financial_status:voided`;

  const totals = new Map<string, SkuSales>();
  let cursor: string | null = null;
  let pages = 0;

  do {
    const data: any = await gql(admin, SALES_HISTORY_QUERY, {
      cursor,
      query: searchQuery,
    });

    for (const order of data.orders.nodes) {
      for (const li of order.lineItems.nodes) {
        const sku: string | null = li.sku?.trim() || null;
        if (!sku) continue; // SKU-less line items can't be matched to inventory
        applySkuDelta(totals, {
          sku,
          variantId: li.variant?.id ?? null,
          name: li.name,
          quantityDelta: li.quantity,
        });
      }

      // Refunds reduce realized demand. We subtract refunded units from velocity
      // so we don't over-order on SKUs with significant returns.
      for (const refund of order.refunds ?? []) {
        for (const rli of refund.refundLineItems?.nodes ?? []) {
          const sku: string | null = rli.lineItem?.sku?.trim() || null;
          if (!sku) continue;
          applySkuDelta(totals, {
            sku,
            variantId: rli.lineItem?.variant?.id ?? null,
            name: `${sku} (refunded)`,
            quantityDelta: -Math.max(0, rli.quantity ?? 0),
          });
        }
      }
      if (order.lineItems.pageInfo.hasNextPage) {
        console.warn(
          `[restock-radar] order ${order.id} has >100 line items; tail ignored`,
        );
      }
    }

    cursor = data.orders.pageInfo.hasNextPage
      ? data.orders.pageInfo.endCursor
      : null;
    pages += 1;
  } while (cursor && pages < MAX_PAGES);

  // Clamp to zero to avoid negative-demand recommendations when refunds exceed
  // sales inside the lookback window.
  for (const sku of totals.keys()) {
    const row = totals.get(sku);
    if (row) row.unitsSold = Math.max(0, row.unitsSold);
  }

  return totals;
}

/** Available units per SKU at the primary location. */
export async function fetchCurrentInventory(
  admin: AdminClient,
  locationId: string,
): Promise<Map<string, SkuInventory>> {
  const levels = new Map<string, SkuInventory>();
  let cursor: string | null = null;
  let pages = 0;

  do {
    const data: any = await gql(admin, INVENTORY_QUERY, { cursor, locationId });

    for (const variant of data.productVariants.nodes) {
      const sku: string | null = variant.sku?.trim() || null;
      if (!sku) continue;
      if (!variant.inventoryItem?.tracked) continue; // untracked = no stock number
      if (variant.product?.status === "ARCHIVED") continue;

      const available =
        variant.inventoryItem.inventoryLevel?.quantities?.find(
          (q: { name: string }) => q.name === "available",
        )?.quantity ?? 0;

      // Duplicate SKUs across variants: sum, since they draw from one shelf.
      const existing = levels.get(sku);
      if (existing) {
        existing.available += available;
      } else {
        levels.set(sku, {
          sku,
          variantId: variant.id,
          productTitle: variant.product?.title ?? variant.title,
          variantTitle:
            variant.title && variant.title !== "Default Title"
              ? variant.title
              : null,
          available,
        });
      }
    }

    cursor = data.productVariants.pageInfo.hasNextPage
      ? data.productVariants.pageInfo.endCursor
      : null;
    pages += 1;
  } while (cursor && pages < MAX_PAGES);

  return levels;
}

function applySkuDelta(
  totals: Map<string, SkuSales>,
  row: {
    sku: string;
    variantId: string | null;
    name: string;
    quantityDelta: number;
  },
) {
  const existing = totals.get(row.sku);
  if (existing) {
    existing.unitsSold += row.quantityDelta;
    if (!existing.variantId && row.variantId) existing.variantId = row.variantId;
    return;
  }

  totals.set(row.sku, {
    sku: row.sku,
    variantId: row.variantId,
    name: row.name,
    unitsSold: row.quantityDelta,
  });
}
