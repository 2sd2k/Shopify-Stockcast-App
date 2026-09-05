import assert from "node:assert/strict";
import test from "node:test";
import {
  selectInventoryLocation,
  type ShopLocations,
} from "./location-selection.ts";

const snapshot: ShopLocations = {
  shopName: "Test shop",
  primaryLocationId: "gid://shopify/Location/shop",
  locations: [
    {
      id: "gid://shopify/Location/app",
      name: "Snow City Warehouse",
      isActive: true,
      isFulfillmentService: true,
      hasActiveInventory: true,
    },
    {
      id: "gid://shopify/Location/shop",
      name: "Shop location",
      isActive: true,
      isFulfillmentService: false,
      hasActiveInventory: true,
    },
  ],
};

test("uses an explicitly requested location, including an app-managed one", () => {
  assert.equal(
    selectInventoryLocation(
      snapshot,
      "gid://shopify/Location/app",
      "gid://shopify/Location/shop",
    ).name,
    "Snow City Warehouse",
  );
});

test("preserves a saved location when no new location is requested", () => {
  assert.equal(
    selectInventoryLocation(snapshot, null, "gid://shopify/Location/app").name,
    "Snow City Warehouse",
  );
});

test("defaults new shops to the primary merchant-managed location", () => {
  assert.equal(selectInventoryLocation(snapshot).name, "Shop location");
});

test("rejects a requested location that is no longer active", () => {
  assert.throws(
    () => selectInventoryLocation(snapshot, "gid://shopify/Location/missing"),
    /no longer available/,
  );
});
