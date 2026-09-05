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

The following steps require a live Shopify Partner session + development store
and cannot be executed in this local, unauthenticated coding environment.

- Install app on development store: pending manual run
- Synchronize sales and inventory: pending manual run
- Change inventory locations: pending manual run
- Edit lead-time and safety-buffer values: pending manual run
- Export CSV: pending manual run
- Test uninstall and data deletion via `SHOP_REDACT`: pending manual run

## Suggested evidence artifacts to attach

- CI run screenshot
- Embedded app reorder table screenshot
- Inline override update screenshot
- Exported CSV screenshot
- Data-deletion proof (no rows remaining for `shop`)
