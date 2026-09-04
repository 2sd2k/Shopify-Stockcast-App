import { test } from "node:test";
import assert from "node:assert/strict";

import { handleComplianceTopic } from "./compliance.ts";

test("SHOP_REDACT clears persisted shop data", async () => {
  const cleared: string[] = [];
  const logs: string[] = [];
  await handleComplianceTopic("SHOP_REDACT", "demo.myshopify.com", {
    clearShopData: async (shop) => {
      cleared.push(shop);
    },
    log: (message) => logs.push(message),
  });

  assert.deepEqual(cleared, ["demo.myshopify.com"]);
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? "", /SHOP_REDACT/);
});

test("customer privacy topics are acknowledged without deletion", async () => {
  const cleared: string[] = [];
  const logs: string[] = [];

  await handleComplianceTopic("CUSTOMERS_DATA_REQUEST", "demo.myshopify.com", {
    clearShopData: async (shop) => {
      cleared.push(shop);
    },
    log: (message) => logs.push(message),
  });

  await handleComplianceTopic("CUSTOMERS_REDACT", "demo.myshopify.com", {
    clearShopData: async (shop) => {
      cleared.push(shop);
    },
    log: (message) => logs.push(message),
  });

  assert.deepEqual(cleared, []);
  assert.equal(logs.length, 2);
});

test("unknown topics return a not-found response", async () => {
  await assert.rejects(
    () =>
      handleComplianceTopic("UNKNOWN_TOPIC", "demo.myshopify.com", {
        clearShopData: async () => {},
        log: () => {},
      }),
    (error: unknown) => error instanceof Response && error.status === 404,
  );
});
