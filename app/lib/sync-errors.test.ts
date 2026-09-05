import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifySyncError,
  toSyncErrorDetail,
  toSyncErrorMessage,
} from "./sync-errors.ts";

test("error detail is stringified and truncated to 500 chars for logs", () => {
  const long = "x".repeat(800);
  assert.equal(toSyncErrorDetail(new Error(long)).length, 500);
  assert.equal(toSyncErrorDetail("timeout"), "timeout");
  assert.equal(toSyncErrorDetail({ reason: "bad" }), "[object Object]");
});

test("failures are sorted into causes a merchant can act on", () => {
  const cases: Array<[unknown, ReturnType<typeof classifySyncError>]> = [
    [new Error("This shop has no active inventory location."), "no_location"],
    [
      new Error("The selected inventory location is no longer available."),
      "location_unavailable",
    ],
    [new Error("Throttled"), "throttled"],
    [new Error("Request failed with status 429"), "throttled"],
    [new Error("Access denied for orders field"), "permission"],
    [new Error("HTTP 401 Unauthorized"), "permission"],
    [new Error("fetch failed"), "network"],
    [new Error("connect ECONNRESET 1.2.3.4:443"), "network"],
    [
      new Error(
        'Admin API error: [{"message":"Field \'bogus\' doesn\'t exist on type \'QueryRoot\'"}]',
      ),
      "app_bug",
    ],
    [new Error("Admin API returned no data"), "app_bug"],
    [new Error("something nobody anticipated"), "unknown"],
    ["a bare string", "unknown"],
  ];
  for (const [error, expected] of cases) {
    assert.equal(classifySyncError(error), expected, toSyncErrorDetail(error));
  }
});

test("merchant messages never leak API vocabulary and always say what to do", () => {
  const raw = new Error(
    "Admin API error: Field 'thisFieldDoesNotExist' doesn't exist on type 'QueryRoot'",
  );
  const message = toSyncErrorMessage(raw);
  assert.doesNotMatch(message, /QueryRoot|GraphQL|Admin API|thisFieldDoesNotExist/);
  assert.match(message, /try again|update again|reinstall|pick another|add or reactivate/i);

  const kinds = [
    "no active inventory location",
    "no longer available",
    "Throttled",
    "Access denied",
    "fetch failed",
    "Admin API error",
    "mystery",
  ];
  for (const text of kinds) {
    const m = toSyncErrorMessage(new Error(text));
    assert.ok(m.length > 20, text);
    // No shouting constants (ECONNRESET, QueryRoot-style names) and no "error".
    assert.doesNotMatch(m, /[A-Z_]{4,}/, `${text} -> ${m}`);
    assert.doesNotMatch(m, /\berror\b/i, `${text} -> ${m}`);
  }
});
