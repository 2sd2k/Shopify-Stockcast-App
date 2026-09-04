import { test } from "node:test";
import assert from "node:assert/strict";

import { toSyncErrorMessage } from "./sync-errors.ts";

test("sync error messages are stringified and truncated to 500 chars", () => {
  const long = "x".repeat(800);
  assert.equal(toSyncErrorMessage(new Error(long)).length, 500);
  assert.equal(toSyncErrorMessage("timeout"), "timeout");
  assert.equal(toSyncErrorMessage({ reason: "bad" }), "[object Object]");
});
