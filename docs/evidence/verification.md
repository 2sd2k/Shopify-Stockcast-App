# Verification Evidence

## Automated checks (local)

Command:

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

Result: PASS

- Test suites: 26 passed, 0 failed
- TypeScript: no errors
- ESLint: no errors
- Build check: passed (`tsc --noEmit -p tsconfig.build.json`)

## GitHub Actions

- Initial CI run: [passed](https://github.com/2sd2k/Shopify-Stockcast-App/actions/runs/33923772009)
- Job duration: 17 seconds
- Checks passed: install, tests, TypeScript, ESLint, and build

## Manual Shopify workflow status

Dev store: `restock-radar-3mropwwf.myshopify.com`, verified 2026-09-05 after the
Stockcast rename and the React Router merge.

- Install app on development store: **PASS** (offline session present, four
  read scopes auto-granted)
- Synchronize sales and inventory: **PASS** (7 tracked SKUs cached; units sold
  and stock per SKU match the Admin API exactly; `lastSyncError` null; the
  04:00 cron run also updated `lastSyncAt` unattended)
- Recommendation matches the formula: **PASS** (four rows shown with suggested
  quantities 68, 17, 11, 7; three healthy or zero-velocity SKUs hidden)
- Change inventory locations: **PASS** (switched to Shop location; cached
  stock matched that location's Admin API levels, including oversold
  negatives of -14, -8, and -40)
- Edit lead-time value: **PASS** (override of 8 days on `sku-managed-1`
  survived a full resync)
- Edit safety-buffer value: **PASS** (override of 4 units on `sku-managed-1`
  survived a resync)
- Export CSV: **PASS** (see `stockcast-restock-radar-3mropwwf-2026-09-05.csv`
  in this folder; 11 headers, one row matching cached data)
- Test uninstall and data deletion via `SHOP_REDACT`: pending manual run

## Suggested evidence artifacts to attach

- CI run screenshot
- Embedded app reorder table screenshot
- Inline override update screenshot
- Exported CSV screenshot
- Data-deletion proof (no rows remaining for `shop`)
