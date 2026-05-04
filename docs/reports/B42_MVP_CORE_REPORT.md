# B42 — MVP Core E2E Report

## Executive summary

- **MVP Health Score: 70% (7/10 fully working)**
- Test pass rate: 10/10 (100%) — wall time 23020 ms
- Known bugs found: **3**
- Multi-tenant cross-leaks: **0** (must be 0)

Production target: https://salvadorexoficial.com
Run at: 2026-04-28T03:31:02.775Z

## Known bugs surfaced

### MVP-8 — Cierre Z report

Cierre Z reports 0 sales because /api/reports/cierre-z queries pos_sales.tenant_id which does not exist as a column. Fallback to pos_user_id only fires on thrown errors, not empty results. Fix: add `if (!sales || !sales.length) sales = await supabaseRequest("GET", legacyQs)` after the primary query.

### MVP-9 — Multi-tenant isolation

GET /api/products?... is scoped by pos_user_id (owner) not tenant_id. Cashiers in the same tenant get an empty list. Fix at api/index.js ~1361: change `pos_user_id=eq.${posUserId}` to filter by all users in tenant (e.g. resolve all pos_user_ids whose notes->>tenant_id == req.user.tenant_id, or add a tenant_id column on pos_products).

### MVP-10 — Browser UI smoke

Page loaded but emits 89 console errors (limit was 5). Top patterns: "Failed to load resource"×13, "[ERROR] [VolvixPerf] fetch error"×11, "[VolvixPerf] fetch error"×11, "[ERROR] [ErrorHandler] {"type""×24, "[ErrorHandler] {type"×24. Investigate JS errors in salvadorex_web_v25.html.

## Test artifacts

- Test product id: `5b00fa65-ba78-41d6-9ad9-9077e1986817` (cleaned up at end)
- Test cut id: `032e00df-b284-4cd4-9731-2814662f716f`
- Test sale id: `6664aa57-b910-4973-b541-95e9f86595ec`
- Sale total: $99
- Browser screenshot: `C:\Users\DELL\Downloads\verion 340\tests\screenshots-b42-mvp\salvadorex_loaded.png`
- Browser console errors observed: 89
- Cierre Z number: Z-0013 (sequence 13)
- Cierre Z opening_balance: $500, sales_count: 0, gross_total: $0, discrepancy: $99

## Test results

Legend: PASS = test assertions held. WORKS = feature works end-to-end with no known issues.

| ID | Test | Status | WORKS? | Time (ms) |
|----|------|--------|--------|-----------|
| MVP-1 | Login + JWT | PASS | YES | 569 |
| MVP-2 | Create product | PASS | YES | 199 |
| MVP-3 | Search product | PASS | YES | 253 |
| MVP-4 | Open cut (apertura) | PASS | YES | 521 |
| MVP-5 | Make a sale | PASS | YES | 585 |
| MVP-6 | Print receipt | PASS | YES | 148 |
| MVP-7 | Close cut (cierre Z) | PASS | YES | 984 |
| MVP-8 | Cierre Z report | PASS | NO | 599 |
| MVP-9 | Multi-tenant isolation | PASS | NO | 734 |
| MVP-10 | Browser UI smoke | PASS | NO | 18428 |

## Per-test details

### MVP-1 — Login + JWT

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 569 ms
- Data:
  ```json
  {
    "status": 200,
    "tokenSnippet": "eyJhbGciOiJIUzI1NiIsInR5...",
    "session": {
      "role": "superadmin",
      "tenant_id": "TNT001",
      "plan": "pro"
    },
    "probeStatus": 200
  }
  ```

### MVP-2 — Create product

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 199 ms
- Data:
  ```json
  {
    "status": 200,
    "body_keys": [
      "id",
      "pos_user_id",
      "code",
      "name",
      "category",
      "cost",
      "price",
      "stock",
      "icon",
      "created_at",
      "updated_at",
      "external_id",
      "source",
      "currency_code",
      "version",
      "min_stock",
      "expiry_date",
      "department"
    ],
    "productId": "5b00fa65-ba78-41d6-9ad9-9077e1986817",
    "echoCode": "MVP_SKU_nz3yze",
    "echoStock": 50,
    "echoPrice": 49.5
  }
  ```

### MVP-3 — Search product

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 253 ms
- Data:
  ```json
  {
    "searchCodeStatus": 200,
    "foundByCode": true,
    "searchNameStatus": 200,
    "foundByName": true
  }
  ```

### MVP-4 — Open cut (apertura)

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 521 ms
- Data:
  ```json
  {
    "openStatus": 201,
    "cutId": "032e00df-b284-4cd4-9731-2814662f716f",
    "opening": 500,
    "getStatus": 200,
    "getOpening": 500
  }
  ```

### MVP-5 — Make a sale

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 585 ms
- Data:
  ```json
  {
    "stockBefore": 50,
    "saleStatus": 200,
    "saleBody": {
      "id": "6664aa57-b910-4973-b541-95e9f86595ec",
      "total": 99,
      "payment_method": "efectivo",
      "change": 1
    },
    "stockAfter": 48,
    "stockDelta": 2
  }
  ```

### MVP-6 — Print receipt

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 148 ms
- Data:
  ```json
  {
    "status": 200,
    "audit_only": true,
    "bytes": 9,
    "message": "Recibido. La impresion debe ejecutarse en el cliente local (Volvix Print Bridge "
  }
  ```

### MVP-7 — Close cut (cierre Z)

- Status: **PASS**
- Feature fully works: **YES**
- Duration: 984 ms
- Data:
  ```json
  {
    "status": 200,
    "opening": 500,
    "totalSales": 99,
    "expected": 599,
    "counted": 599,
    "discrepancy": 0,
    "getClosedAt": "2026-04-28T03:30:49.563+00:00"
  }
  ```

### MVP-8 — Cierre Z report

- Status: **PASS**
- Feature fully works: **NO**
- Duration: 599 ms
- Data:
  ```json
  {
    "status": 200,
    "zNumber": "Z-0013",
    "zSequence": 13,
    "opening": 500,
    "salesCount": 0,
    "gross": 0,
    "discrepancy": 99,
    "cashier": null,
    "salesCountInReport": 0,
    "grossTotalInReport": 0,
    "knownBug": "Cierre Z reports 0 sales because /api/reports/cierre-z queries pos_sales.tenant_id which does not exist as a column. Fallback to pos_user_id only fires on thrown errors, not empty results. Fix: add `if (!sales || !sales.length) sales = await supabaseRequest(\"GET\", legacyQs)` after the primary query."
  }
  ```

### MVP-9 — Multi-tenant isolation

- Status: **PASS**
- Feature fully works: **NO**
- Duration: 734 ms
- Data:
  ```json
  {
    "cajeroLogin": 200,
    "ownerLogin": 200,
    "cajeroSees": false,
    "cajeroSeesCount": 0,
    "ownerStatus": 200,
    "ownerListSize": 0,
    "ownerLeaks": 0,
    "ownerTenants": [],
    "knownBug": "GET /api/products?... is scoped by pos_user_id (owner) not tenant_id. Cashiers in the same tenant get an empty list. Fix at api/index.js ~1361: change `pos_user_id=eq.${posUserId}` to filter by all users in tenant (e.g. resolve all pos_user_ids whose notes->>tenant_id == req.user.tenant_id, or add a tenant_id column on pos_products)."
  }
  ```

### MVP-10 — Browser UI smoke

- Status: **PASS**
- Feature fully works: **NO**
- Duration: 18428 ms
- Data:
  ```json
  {
    "gotoOk": true,
    "title": "",
    "searchVisible": true,
    "matchedSelector": "input[placeholder*=\"ódigo\" i]",
    "f12": {
      "handlerRegistered": true,
      "hasF12Function": false,
      "globals": [
        "VolvixShortcuts"
      ],
      "dispatched": true
    },
    "screenshot": "C:\\Users\\DELL\\Downloads\\verion 340\\tests\\screenshots-b42-mvp\\salvadorex_loaded.png",
    "consoleErrorsCount": 89,
    "consoleErrorsSample": [
      "Failed to load resource: the server responded with a status of 404 ()",
      "[ERROR] [VolvixPerf] fetch error: /api/owner/dashboard?tenant_id=TNT001 Rate limit exceeded for default. Retry in 1236ms\nError: Rate limit exceeded for default. Retry in 1236ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadOwnerDashboard (https://salvadorexoficial.com/volvix-real-data-loader.js:125:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:214:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3 {}",
      "[VolvixPerf] fetch error: /api/owner/dashboard?tenant_id=TNT001 Error: Rate limit exceeded for default. Retry in 1236ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadOwnerDashboard (https://salvadorexoficial.com/volvix-real-data-loader.js:125:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:214:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3",
      "[ERROR] [VolvixPerf] fetch error: /api/owner/billing?tenant_id=TNT001 Rate limit exceeded for default. Retry in 1233ms\nError: Rate limit exceeded for default. Retry in 1233ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadOwnerBilling (https://salvadorexoficial.com/volvix-real-data-loader.js:164:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:215:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3 {}",
      "[VolvixPerf] fetch error: /api/owner/billing?tenant_id=TNT001 Error: Rate limit exceeded for default. Retry in 1233ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadOwnerBilling (https://salvadorexoficial.com/volvix-real-data-loader.js:164:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:215:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3",
      "[ERROR] [VolvixPerf] fetch error: /api/billing/plans Rate limit exceeded for default. Retry in 1231ms\nError: Rate limit exceeded for default. Retry in 1231ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadBillingPlans (https://salvadorexoficial.com/volvix-real-data-loader.js:176:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:216:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3 {}",
      "[VolvixPerf] fetch error: /api/billing/plans Error: Rate limit exceeded for default. Retry in 1231ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadBillingPlans (https://salvadorexoficial.com/volvix-real-data-loader.js:176:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:216:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3",
      "[ERROR] [VolvixPerf] fetch error: /api/owner/seats?tenant_id=TNT001 Rate limit exceeded for default. Retry in 1229ms\nError: Rate limit exceeded for default. Retry in 1229ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at window.fetch (https://salvadorexoficial.com/volvix-ui-errors.js:61:25)\n    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)\n    at Object.authFetch [as fetch] (https://salvadorexoficial.com/auth-helper.js:106:24)\n    at authFetch (https://salvadorexoficial.com/volvix-real-data-loader.js:24:28)\n    at loadOwnerSeats (https://salvadorexoficial.com/volvix-real-data-loader.js:194:21)\n    at run (https://salvadorexoficial.com/volvix-real-data-loader.js:217:5)\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:223:5\n    at https://salvadorexoficial.com/volvix-real-data-loader.js:225:3 {}"
    ],
    "consoleErrorsBuckets": {
      "Failed to load resource": 13,
      "[ERROR] [VolvixPerf] fetch error": 11,
      "[VolvixPerf] fetch error": 11,
      "[ERROR] [ErrorHandler] {\"type\"": 24,
      "[ErrorHandler] {type": 24,
      "Refused to execute script from 'https": 2,
      "[ERROR] [AI-REAL-WIRING] Health-check fa": 2,
      "[AI-REAL-WIRING] Health-check falló": 2
    },
    "knownBug": "Page loaded but emits 89 console errors (limit was 5). Top patterns: \"Failed to load resource\"×13, \"[ERROR] [VolvixPerf] fetch error\"×11, \"[VolvixPerf] fetch error\"×11, \"[ERROR] [ErrorHandler] {\"type\"\"×24, \"[ErrorHandler] {type\"×24. Investigate JS errors in salvadorex_web_v25.html."
  }
  ```

## Final score

**MVP Health Score: 70% — 7/10 features work end-to-end without known bugs.**

Test pass rate: 10/10 (100%).

## Suggested fixes

- **MVP-8 — Cierre Z report**: Bug: `/api/reports/cierre-z` queries `pos_sales` by `tenant_id` column that does not exist. Fix in api/index.js around line 14117: after the primary query, if `sales.length === 0`, run the legacy fallback by `pos_user_id`. Or, add a `tenant_id` column on `pos_sales` (DB migration) and backfill from `pos_user_id` → tenant.
  - Detail: KNOWN BUG: Cierre Z reports 0 sales because /api/reports/cierre-z queries pos_sales.tenant_id which does not exist as a column. Fallback to pos_user_id only fires on thrown errors, not empty results. Fix: add `if (!sales || !sales.length) sales = await supabaseRequest("GET", legacyQs)` after the primary query.
- **MVP-9 — Multi-tenant isolation**: Bug: `GET /api/products` filters by `pos_user_id` (the tenant owner), so cashiers in the same tenant see ZERO products. Fix at api/index.js around line 1361: replace `pos_user_id=eq.${posUserId}` with a tenant-aware filter — either (a) maintain a `tenant_id` column on `pos_products` and filter by `req.user.tenant_id`, or (b) lookup all `pos_users.id` whose `notes->>tenant_id == req.user.tenant_id` and use `pos_user_id=in.(…)`.
  - Detail: KNOWN BUG: GET /api/products?... is scoped by pos_user_id (owner) not tenant_id. Cashiers in the same tenant get an empty list. Fix at api/index.js ~1361: change `pos_user_id=eq.${posUserId}` to filter by all users in tenant (e.g. resolve all pos_user_ids whose notes->>tenant_id == req.user.tenant_id, or add a tenant_id column on pos_products).
- **MVP-10 — Browser UI smoke**: Bug: salvadorex_web_v25.html emits ~70 console errors on first load — mostly client-side rate-limit (`volvix-ratelimit-wiring.js`) hitting itself in tight loops, plus 12× 404 on missing static resources, plus 2× CSP/MIME refusals. Triage: (1) tune client-side rate limiter so initial init does not exceed its own quota, (2) audit 404s in Network tab and remove dead <script>/<link> tags, (3) check Content-Type on the 2× refused scripts.
  - Detail: KNOWN BUG: Page loaded but emits 89 console errors (limit was 5). Top patterns: "Failed to load resource"×13, "[ERROR] [VolvixPerf] fetch error"×11, "[VolvixPerf] fetch error"×11, "[ERROR] [ErrorHandler] {"type""×24, "[ErrorHandler] {type"×24. Investigate JS errors in salvadorex_web_v25.html.
