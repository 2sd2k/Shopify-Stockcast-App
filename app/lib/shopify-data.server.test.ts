import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchCurrentInventory,
  fetchLocations,
  fetchSalesHistory,
} from "./shopify-data.server.ts";

type AdminResponse = Record<string, unknown>;

function createAdmin(pages: AdminResponse[]) {
  let call = 0;
  return {
    graphql: async () => {
      const data = pages[call];
      call += 1;
      return new Response(JSON.stringify({ data }));
    },
  };
}

test("sales pagination aggregates quantities across pages", async () => {
  const admin = createAdmin([
    {
      orders: {
        pageInfo: { hasNextPage: true, endCursor: "next" },
        nodes: [
          {
            id: "o1",
            lineItems: {
              pageInfo: { hasNextPage: false },
              nodes: [{ sku: "SKU-1", quantity: 2, name: "A", variant: { id: "v1" } }],
            },
            refunds: [],
          },
        ],
      },
    },
    {
      orders: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "o2",
            lineItems: {
              pageInfo: { hasNextPage: false },
              nodes: [{ sku: "SKU-1", quantity: 3, name: "A", variant: { id: "v1" } }],
            },
            refunds: [],
          },
        ],
      },
    },
  ]);

  const result = await fetchSalesHistory(admin, 30);
  assert.equal(result.get("SKU-1")?.unitsSold, 5);
});

test("refund line items reduce sold units and clamp at zero", async () => {
  const admin = createAdmin([
    {
      orders: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "o1",
            lineItems: {
              pageInfo: { hasNextPage: false },
              nodes: [{ sku: "SKU-1", quantity: 2, name: "A", variant: { id: "v1" } }],
            },
            refunds: [
              {
                refundLineItems: {
                  nodes: [
                    {
                      quantity: 1,
                      lineItem: { sku: "SKU-1", variant: { id: "v1" } },
                    },
                    {
                      quantity: 5,
                      lineItem: { sku: "SKU-2", variant: { id: "v2" } },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  ]);

  const result = await fetchSalesHistory(admin, 30);
  assert.equal(result.get("SKU-1")?.unitsSold, 1);
  assert.equal(result.get("SKU-2")?.unitsSold, 0);
});

test("inventory pagination filters untracked and archived variants", async () => {
  const admin = createAdmin([
    {
      productVariants: {
        pageInfo: { hasNextPage: true, endCursor: "next" },
        nodes: [
          {
            id: "v1",
            sku: "DUP",
            title: "Default Title",
            product: { title: "One", status: "ACTIVE" },
            inventoryItem: {
              tracked: true,
              inventoryLevel: { quantities: [{ name: "available", quantity: 4 }] },
            },
          },
          {
            id: "v2",
            sku: "SKIP-UNTRACKED",
            title: "Default Title",
            product: { title: "Two", status: "ACTIVE" },
            inventoryItem: { tracked: false, inventoryLevel: null },
          },
        ],
      },
    },
    {
      productVariants: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "v3",
            sku: "DUP",
            title: "Blue",
            product: { title: "One", status: "ACTIVE" },
            inventoryItem: {
              tracked: true,
              inventoryLevel: { quantities: [{ name: "available", quantity: 6 }] },
            },
          },
          {
            id: "v4",
            sku: "SKIP-ARCHIVED",
            title: "Default Title",
            product: { title: "Three", status: "ARCHIVED" },
            inventoryItem: {
              tracked: true,
              inventoryLevel: { quantities: [{ name: "available", quantity: 99 }] },
            },
          },
        ],
      },
    },
  ]);

  const result = await fetchCurrentInventory(admin, "loc1");
  assert.deepEqual([...result.keys()], ["DUP"]);
  assert.equal(result.get("DUP")?.available, 10);
});

test("fetchLocations keeps active locations and reports the primary id", async () => {
  const admin = createAdmin([
    {
      shop: { name: "Demo Shop" },
      primaryLocation: { id: "loc-merchant" },
      locations: {
        nodes: [
          {
            id: "loc-app",
            name: "App-managed",
            isActive: true,
            isFulfillmentService: true,
            hasActiveInventory: true,
          },
          {
            id: "loc-merchant",
            name: "Retail Store",
            isActive: true,
            isFulfillmentService: false,
            hasActiveInventory: true,
          },
          {
            id: "loc-closed",
            name: "Closed",
            isActive: false,
            isFulfillmentService: false,
            hasActiveInventory: false,
          },
        ],
      },
    },
  ]);

  const snapshot = await fetchLocations(admin);
  assert.equal(snapshot.shopName, "Demo Shop");
  assert.equal(snapshot.primaryLocationId, "loc-merchant");
  assert.deepEqual(
    snapshot.locations.map((location) => location.id),
    ["loc-app", "loc-merchant"],
  );
});

test("fetchLocations rejects a shop with no active location", async () => {
  const admin = createAdmin([
    {
      shop: { name: "Demo Shop" },
      primaryLocation: null,
      locations: { nodes: [] },
    },
  ]);

  await assert.rejects(
    () => fetchLocations(admin),
    /no active inventory location/,
  );
});
