# Restock Radar

Restock Radar is a focused Shopify embedded app for merchants who need a clear
weekly reorder recommendation without paying for a full inventory suite.

## Business problem

Small merchants often track reorder decisions manually. This creates two costly
failure modes:

- Under-ordering fast movers, causing stockouts and missed revenue.
- Over-ordering slow movers, tying up cash in dead inventory.

Restock Radar solves a narrow decision: which SKUs should be reordered now, and
how many units should be purchased for the next cycle.

## Technology stack

- Shopify Remix app template (embedded app shell)
- TypeScript
- Remix server routes + Shopify Admin GraphQL
- Prisma-backed app database
- Shopify Polaris for UI
- `node-cron` for scheduled sync
- Node `node:test` for tests
- TypeScript (`tsc`) + ESLint for static checks
- GitHub Actions for CI

## Reorder formula

```txt
avg_daily_sales     = units_sold_in_window / window_days
reorder_point       = avg_daily_sales * lead_time_days + safety_buffer_units
days_of_stock_left  = current_inventory / avg_daily_sales
needs_reorder       = avg_daily_sales > 0 AND current_inventory <= reorder_point
suggested_order_qty = reorder_point - current_inventory
                      + avg_daily_sales * reorder_cycle_days
```

Defaults:

- `window_days = 30`
- `lead_time_days = 7`
- `safety_buffer_units = ceil(avg_daily_sales * 7 * 0.2)` (20% weekly buffer)
- `reorder_cycle_days = 14`

## Architecture

1. `syncShop()` pulls orders and inventory from Shopify and writes cached
   SKU-level velocity rows.
2. `getReorderList()` joins cached velocity with per-SKU merchant overrides.
3. `calculateReorder()` and `buildReorderList()` run pure reorder math.
4. `app/routes/app._index.tsx` renders actionable rows and inline controls.
5. `app/routes/webhooks.compliance.tsx` handles GDPR topics for App Store
   compliance.

## Setup instructions

This repository is a feature overlay for a Shopify Remix app scaffold.

1. Scaffold the app:

```bash
npm init @shopify/app@latest -- --template remix
```

2. Copy this repository's files into the generated app.

3. Merge `shopify.app.toml.snippet` into `shopify.app.toml`, then deploy:

```bash
shopify app deploy
```

4. Apply Prisma schema additions and migrate:

```bash
cat prisma/schema.additions.prisma >> prisma/schema.prisma
npx prisma migrate dev --name restock_radar
```

5. Install dependencies and run validation:

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

6. Run local app:

```bash
shopify app dev
```

## CI

The workflow in `.github/workflows/ci.yml` runs on every push and PR:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Shopify workflow verification

Run this sequence on a development store:

1. Install the app in the development store.
2. Confirm first-load sync creates cached SKU velocity rows.
3. Create test orders and rerun sync to verify velocity changes.
4. Change inventory locations, rerun sync, and verify location display.
5. Edit lead-time and safety-buffer values inline and verify reorder updates.
6. Export CSV and verify it opens safely in Sheets/Excel.
7. Uninstall and validate `SHOP_REDACT` removes all persisted rows.

## Screenshots

Add these evidence images after verification:

- `docs/screenshots/reorder-table.png`
- `docs/screenshots/inline-overrides.png`
- `docs/screenshots/exported-csv.png`
- `docs/screenshots/sync-error-banner.png`

Markdown embed example:

```md
![Reorder table](docs/screenshots/reorder-table.png)
```

## Limitations

- Single-location strategy only (multi-location optimization is out of scope).
- Without `read_all_orders`, Shopify order history is limited to 60 days.
- Refunds are subtracted from sold units via order refund line items; returns
  outside the lookback window can still require policy tuning.
- SKU matching requires stable non-empty SKUs in catalog and order lines.
- Per-order line-item pagination beyond 100 line items is detected and logged,
  but not fully traversed in v1.

## Evidence to collect

Store release evidence in `docs/evidence/`:

- CI run URL and status screenshot
- `npm test` output log
- Typecheck/lint/build logs
- Development-store walkthrough screenshots (install, sync, edit, export)
- Uninstall + `SHOP_REDACT` data-deletion proof
