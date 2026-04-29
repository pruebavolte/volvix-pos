# B37 — Comprehensive Regression Test Suite Report

**Date:** 2026-04-27
**Owner:** B37 (Regression Testing — Volvix POS)
**Target:** B35 + B36 features (5 phases)
**Status:** ✅ Test suite delivered. Backend coverage gated on endpoints being deployed (use `test.fixme()` auto-skip).

---

## 1. Summary

A new comprehensive Playwright regression suite was added under `tests/`, organized around the 10 feature-areas (A..J) shipped in B35 + B36. The suite is fully **idempotent**, **self-cleaning**, and runs against either a **local dev server** or **production** via the `TEST_TARGET` env switch.

**No existing tests were modified.** The suite is additive:

| Path (new) | Purpose |
|---|---|
| `tests/b36-regression.spec.js` | The 50+ test suite (groups A..J) |
| `tests/playwright.b36.config.js` | Dedicated config (local/prod target switch) |
| `tests/fixtures/auth.js` | `loginAs`, `getJWT`, `apiCall`, `loginViaAPI`, `clearAuthStorage` |
| `tests/fixtures/data.js` | `createTestProduct`, `createTestCustomer`, `createTestUser`, `cleanupTestData` |
| `tests/fixtures/seed-test-data.js` | Idempotent `seedProducts(10)`, `seedCustomers(5)` |

---

## 2. Total tests added

| Group | Tests | Description |
|---|---|---|
| **A** Authentication & Multi-tenant | 5  | A1–A5 |
| **B** Product CRUD | 5  | B1–B4 + B-error (negative validation) |
| **C** Inventory | 4  | C1–C4 |
| **D** Cuts/Cortes | 5  | D1–D5 |
| **E** Reports | 6  | E1–E6 (parameterized loop) |
| **F** User Management | 5  | F1–F5 |
| **G** Feature Flags | 5  | G1–G5 |
| **H** Landing Pages | 14 | H1 (×10 industries) + H2 + H3 + H4 + H5 |
| **I** Export/Import + Customer Credit | 4  | I1–I4 |
| **J** Owner + Admin SaaS | 5  | J1–J5 |
| **Total** | **58** | (10 H1 sub-tests counted individually) |

---

## 3. Coverage matrix (feature × test ID)

| Feature | Test IDs |
|---|---|
| Login + JWT in localStorage | A1, A2 |
| Role-based authorization | A3, A4, J5 |
| Cross-tenant RLS isolation | A5 |
| Product list / patch / delete / bulk | B1, B2, B3, B4 |
| Form validation (negative) | B-error |
| Inventory movements (entrada/ajuste) | C1, C2, C3 |
| Inventory UI (KPI cards) | C4 |
| Cut open / get / linked sale / close / summary | D1, D2, D3, D4, D5 |
| Reports — sales, top products/customers, turnover, profit, by-cashier | E1–E6 |
| User CRUD by owner | F1, F2, F3, F4 |
| Feature flag resolution per user | F5 |
| Feature modules registry (~25) | G1 |
| Tenant + per-user module override | G2, G3 |
| Module gating UI (Recargas, Tarjetas) | G4, G5 |
| 10 vertical landing pages | H1 (×10) |
| SEO (Schema.org JSON-LD) | H2 |
| CTA wiring (vertical=…) | H3 |
| Vanity URL redirect | H4 |
| Mobile no-overflow | H5 |
| CSV export / import preview | I1, I2 |
| Customer payments + balance | I3 |
| "Registrar abono" modal | I4 |
| Sub-tenant creation | J1, J3 |
| Admin SaaS kill switch (typed-word challenge) | J2 |
| Global feature-flag override | J4 |

---

## 4. How to run

### Local (default — http://localhost:3000)

```bash
# Start local server in another terminal:
npm run dev

# Run the B36 regression suite:
npx playwright test --config=tests/playwright.b36.config.js

# Or run a single group:
npx playwright test --config=tests/playwright.b36.config.js -g "A. Auth"
```

### Production (https://volvix-pos.vercel.app)

```bash
TEST_TARGET=prod npx playwright test --config=tests/playwright.b36.config.js
# or override fully:
BASE_URL=https://staging.volvix-pos.vercel.app npx playwright test --config=tests/playwright.b36.config.js
```

### Headed (debug visually)

```bash
npx playwright test --config=tests/playwright.b36.config.js --headed --workers=1
```

### Open last HTML report

```bash
npx playwright show-report playwright-report-b36
```

---

## 5. How to debug failures

The config sets:

- `screenshot: 'only-on-failure'` — PNG saved next to the test
- `trace: 'on-first-retry'` — full Playwright trace zip
- `video: 'retain-on-failure'` — webm replay
- `reporter: ['list', 'html']` — HTML report at `playwright-report-b36/`

Steps:

1. Run with `--retries=0 --workers=1` to make failures deterministic.
2. Open `playwright-report-b36/index.html` and inspect the failed test.
3. For trace files: `npx playwright show-trace test-results/<dir>/trace.zip`.
4. For network-level debugging, add `DEBUG=pw:api` to the env.
5. To re-run only the failed test ID: `npx playwright test -g "B2: PATCH"`.

---

## 6. CI integration

Suggested file: `.github/workflows/playwright-b36.yml`

```yaml
name: B36 Regression
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  b36-prod:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: B36 regression vs production
        env:
          TEST_TARGET: prod
          CI: 'true'
        run: npx playwright test --config=tests/playwright.b36.config.js
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-b36
          path: playwright-report-b36/
          retention-days: 14
```

For PRs that ship preview URLs (Vercel), set `BASE_URL: ${{ steps.vercel.outputs.preview_url }}` instead of `TEST_TARGET=prod`.

---

## 7. Idempotency & cleanup

Every group registers an `afterAll` cleanup that:

1. Deletes any product / customer / user / cut created during the test using `cleanupTestData(...)`.
2. Falls back to soft-delete if hard delete is unavailable.
3. Uses a `b36test_` prefix on every name/SKU/email so manual cleanup is trivial:
   ```sql
   delete from products  where sku   like 'b36test_%';
   delete from customers where email like 'b36test_%@test.volvix.test';
   delete from users     where email like 'b36test_%@test.volvix.test';
   ```

The seed helpers (`seedProducts`, `seedCustomers`) detect existing rows by SKU/email and reuse them — re-running never duplicates data.

---

## 8. Known limitations

- **Endpoint discovery is best-effort.** Some endpoint paths may differ between `/api/...` and `/api/v1/...`. The fixtures try both. If neither responds 200 the test marks itself `test.fixme()` rather than failing, so you know what's *not deployed* vs what's *broken*.
- **B-bulk, C-inventory, D-cuts, E-reports, F-users, G-flags, J-owner endpoints** auto-skip if the backend returns 404. This avoids false negatives while B35/B36 backend rollout is staged.
- **UI tests for Inventario tab, Recargas menu, Kill switch, Registrar abono** assume specific text labels in Spanish (case-insensitive). If the labels are reworded, update the locator regex.
- **Mobile overflow test (H5)** uses 375×667. Add additional viewports (e.g. 414×896) in a follow-up PR if tablet coverage is needed.
- **Schema.org assertion (H2)** only verifies presence of `<script type="application/ld+json">` containing `schema.org`; deeper schema validation (Product/Service/LocalBusiness fields) is intentionally out of scope.
- **No Supabase direct queries.** All cleanup is done via the API layer, respecting RLS. If the API surface lacks a delete endpoint for a resource, the soft-delete will be the API's own (e.g., `deleted_at`).
- **Negative test for restart-workers (J5)** can return 404 in environments where the endpoint is gated behind a superadmin-only feature flag — that's accepted as "owner cannot reach" which preserves the security invariant.

---

## 9. Files NOT modified

Per the spec:
- `api/index.js` — untouched
- All HTML/JS/CSS under the project root — untouched
- Any prior test under `tests/e2e/`, `tests-e2e/`, `tests/browser/`, `tests/qa-autonomous/`, `tests/qa-destructive/`, `tests/load/`, `tests/unit/` — untouched
- Root `playwright.config.js` — untouched (the new config lives at `tests/playwright.b36.config.js`)

---

## 10. Next steps (suggested)

1. Wire `B36 Regression` workflow into branch-protection so PRs can't merge red.
2. Add a `seed:reset` npm script that calls `cleanupAllSeed` for batch wipe between manual QA runs.
3. Once B35/B36 backend endpoints are fully deployed, remove the auto-`fixme` guards (search for `test.fixme(r.status === 404`).
4. Add tablet viewport (768×1024) to landing-page H5 once the marketing team finalizes the breakpoint design.
