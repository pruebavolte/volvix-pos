# B42 — Cotizaciones (Quotes) E2E Verification Report

**Date:** 2026-04-27
**Spec file:** `tests/r6e-cotizaciones-e2e.spec.js`
**Run target:** `https://volvix-pos.vercel.app` (production)
**Auth:** `admin@volvix.test` (TNT001) + `owner@volvix.test` (TNT002), password `Volvix2026!`
**Final score: 41 / 100**

---

## Executive summary

The Cotizaciones module **exists on paper but does not work end-to-end in production**.
A complete, well-designed Supabase-backed implementation is present in source code
(`api/index.js:3148-3225` plus the migration at `db/R14_QUOTATIONS.sql`), but at
boot time it is **shadowed by an in-memory stub** (`api/index.js:8962-8963`)
that mints fake UUIDs without ever writing to `pos_quotations`. As a result:

- Quotes **appear to be created** (`POST /api/quotations` returns `200` + a UUID)
- The same UUID is **rejected by every other endpoint** (`GET :id`, `PATCH :id`,
  `POST :id/convert`, list filters) because the row was never persisted
- The whole "quote → eventually sale" promise is therefore **non-functional**

In addition:

- The frontend screen `#screen-cotizaciones` in `salvadorex_web_v25.html` (line 2398)
  is a literal placeholder div — no list, no form, no convert button.
- No PDF / printable / customer-facing public URL exists.
- The login page (`/login.html`) does not surface the menu post-auth in our
  headless run, so the UI-flow test cannot reach the menu either.

Of 11 functional checks (Q1–Q11) plus 1 summary emitter, **all 12 pass on paper**
because the suite is designed to *document* gaps rather than fail on them — but only
**4 of the 11 checks reflect a working flow**. The remaining 7 are documented gaps.

---

## Per-check results

| # | Check | Endpoint(s) | Result | Notes |
|---|-------|-------------|--------|-------|
| Q1 | Discover endpoint | 12 routes probed | PASS-doc | `GET /api/quotations`, `POST /api/quotations`, `PATCH /api/quotations/:id`, `POST /api/quotations/:id/convert` exist. No detail/PDF/print/public endpoints. `/api/quotes` and `/api/cotizaciones` aliases do **not** exist. |
| Q2 | Create quote | `POST /api/quotations` | PARTIAL | `200 OK` returned. Response shape `{ ok, id, created_at }` matches the **stub at line 8963**, NOT the real handler. Quote **was not persisted** to `pos_quotations`. |
| Q3 | List quotes | `GET /api/quotations` | PARTIAL | `200 OK`. Response shape `{ ok:true, items:[], total:0 }` matches **stub** — always returns empty. The quote created in Q2 is **not visible**. |
| Q4 | View quote (PDF/print) | none of 5 candidates | FAIL | `/api/quotations/:id`, `…/pdf`, `…/print`, `…/printable`, `…/preview` all → `404 endpoint not found`. No way to render or download a quote. |
| Q5 | Edit quote | `PATCH /api/quotations/:id` | PARTIAL | Endpoint exists (`200`), but response body is `[]` (empty) because the row does not exist downstream — same root cause as Q2. |
| Q6 | Convert quote → sale | `POST /api/quotations/:id/convert` | FAIL | `404 {"error":"quotation_not_found"}`. The route exists, but cannot find any quote because Q2 didn't actually persist. **The single most important feature of this module is broken.** |
| Q7 | Auto-expire after `valid_until` | `POST /api/quotations` (past date) + `GET` | FAIL | Quote with yesterday's `valid_until` is created but vanishes from list — same stub shadow. Cannot test server-side auto-expiry. |
| Q8 | Customer-facing public URL/PDF | 7 candidates | FAIL | No public/share/link/pdf endpoint. Customers have **no way** to view their own quote from a sharable link. |
| Q9 | History per customer | 4 candidates | FAIL | `?customer_id=`, `?customer=`, `/customers/:id/quotations`, `/customers/:id/history` all return either 200-empty or 404. No real per-customer filter on the server side. |
| Q10 | Multi-tenant isolation | `GET /api/quotations` (admin vs owner) | INCONCLUSIVE | Admin and owner both see `[]` — list is always empty due to stub. Tenant scoping cannot be verified through this surface. Cross-tenant `POST` accepted with `tenant_id: 'TNT002'` body but stub does not echo it back, so coercion cannot be confirmed. |
| Q11 | UI flow (menu → screen) | `salvadorex_web_v25.html` | FAIL | After login the menu button `[data-menu="cotizaciones"]` is **not visible** in the rendered page — login flow keeps user on `/login.html`. Even if it were reachable, the screen at line 2398 of the HTML is a `<div class="placeholder">` only. |

---

## Root-cause analysis

### Bug #1 — Stub shadow over real handler (CRITICAL)

`api/index.js` registers the **real Supabase-backed** quotation handlers in the
top-level `handlers` object literal:

- Line **3149**: `'GET /api/quotations'` → reads from Supabase `/pos_quotations`
- Line **3161**: `'POST /api/quotations'` → writes to Supabase `/pos_quotations`
- Line **3185**: `'PATCH /api/quotations/:id'` → updates by id
- Line **3201**: `'POST /api/quotations/:id/convert'` → reads quote, creates sale,
  patches quote with `status='converted'` + `converted_sale_id`

Then later, inside the IIFE block "R15 API SWEEP: stubs for additional endpoints"
(line 8690+), the same keys are **overwritten** with no-op stubs:

```js
// api/index.js:8962-8963
handlers['GET /api/quotations']  = requireAuth(_emptyList);  // always { ok:true, items:[], total:0 }
handlers['POST /api/quotations'] = requireAuth(_createOk);   // always { ok:true, id:<random uuid>, created_at }
```

Because JavaScript object-property assignment is last-write-wins, the stubs win
over the real handlers. **Effect:** quotes never reach Supabase, the `pos_quotations`
table is never read or written, and `convert` always 404s because the random
UUID minted by `_createOk` never lives in the table.

**Fix:** delete lines 8962–8963 from `api/index.js`. The real handlers above
already work and have a graceful `42P01` (table-missing) catch.

### Bug #2 — Migration may not be applied

`db/R14_QUOTATIONS.sql` defines `pos_quotations` with the right schema
(`status check ('draft','sent','accepted','expired','converted')`,
`converted_sale_id`, `valid_until`, JSONB `items`, three indexes).
However, because Bug #1 currently masks the real handler, we **cannot verify** from
the production HTTP surface whether the migration has been applied. The backend
agent should run the migration after removing the stub override and re-test.

### Bug #3 — Frontend placeholder

`salvadorex_web_v25.html` line 2398:

```html
<section id="screen-cotizaciones" class="screen-pad hidden">
  <div class="placeholder">
    <div class="placeholder-icon">📝</div>
    <h2 class="placeholder-title">Cotizaciones</h2>
    <p class="placeholder-text">Genera cotizaciones y conviértelas en venta con un clic.</p>
  </div>
</section>
```

The button at line 1514 toggles this section's `.hidden` class but there are
no inputs, no form, no list, no "Convertir a venta" button. **The menu label
promises a feature that has zero UI.**

### Bug #4 — No PDF / no public link

Backend has zero endpoints for rendering a printable quote (`/pdf`, `/print`,
`/preview`) or serving an unauthenticated public view (`/public`, `/share/:token`).
A quote module without a sharable PDF is unusable for the customer.

### Bug #5 — No per-customer history filter

The list endpoint accepts no `customer_id` query parameter. UI would have to
fetch all quotes (limit 200) and filter client-side, which doesn't scale and
breaks once a tenant has > 200 quotes.

### Bug #6 — No server-side expiration logic

Migration defines `status='expired'` as a valid value but no code in
`api/index.js` ever transitions a quote to that status when `valid_until < today`.
Even if the stub shadow were removed, `Cierre Z` and other reports would still
treat past-valid-until quotes as `draft` until manually patched.

---

## Honest gaps recorded by the suite

These are the literal annotations emitted by `r6e-results.json` (`SUMMARY` test):

1. `POST /api/quotations response shape matches the R15 stub at api/index.js:8963`
2. `POST /api/quotations/:id/convert → 404 quotation_not_found` (stub shadow)
3. `No detail/PDF/print endpoint exists for quotes in production`
4. `No customer-facing public quote URL exists`
5. `No server-side endpoint exposes per-customer quote history`
6. `Q7 expiration test could not run — quote vanishes from list (stub shadow)`

---

## Score breakdown — 41 / 100

| Aspect | Weight | Score | Rationale |
|--------|--------|-------|-----------|
| Endpoint discovery (Q1) | 10 | **8** | 4 of the expected routes exist; `/api/quotes` and `/api/cotizaciones` aliases missing. |
| Create persists (Q2) | 15 | **3** | Returns `200` but never writes to DB (stub shadow). |
| List works (Q3) | 10 | **2** | Always empty regardless of tenant; reflects no real data. |
| Detail / PDF (Q4) | 10 | **0** | No surface at all. |
| Edit (Q5) | 8 | **3** | Endpoint reachable but cannot affect a real row. |
| **Convert → Sale (Q6)** | **20** | **0** | **The reason this module exists. 100% broken.** |
| Auto-expiration (Q7) | 5 | **1** | Cannot test; expiration logic absent in code anyway. |
| Customer-facing URL (Q8) | 8 | **0** | Missing. |
| Per-customer history (Q9) | 5 | **1** | Client-side fallback works on demo (0 rows), no server filter. |
| Multi-tenant isolation (Q10) | 5 | **3** | No data overlap observed but inconclusive due to empty lists. |
| UI flow (Q11) | 4 | **0** | Placeholder + menu not reached after login. |
| **Total** | **100** | **41** | |

A 41 reflects: backend skeleton good (≈8 pts in Q1) + migration written (no
direct test reward, baked into Q2 expectations) + a working `/convert` design
in source (Q6 design = good, Q6 result = 0). The single biggest lever to move
the score above 80 is **deleting the two stub lines** at `api/index.js:8962-8963`.

---

## Recommended fix order (sprint-ready)

1. **[5 min]** Delete `api/index.js:8962-8963`. Smoke-test on a preview deploy
   that `POST /api/quotations` now returns `{ id, total, items, status, ... }`
   instead of `{ ok, id, created_at }`. Re-run this suite — Q2/Q3/Q5/Q6/Q7
   should all flip from PARTIAL/FAIL to a real PASS.
2. **[10 min]** Run `db/R14_QUOTATIONS.sql` against the production Supabase
   (idempotent — safe to re-run). Confirm via `\d pos_quotations`.
3. **[2 h]** Add `GET /api/quotations/:id` returning the row, plus
   `GET /api/quotations/:id/pdf` rendering a server-side PDF (puppeteer or
   pdfkit). Reuse the print template from `volvix-receipt-customizer-wiring.js`.
4. **[1 h]** Add `?customer_id=` filter to `GET /api/quotations`.
5. **[2 h]** Replace the placeholder at `salvadorex_web_v25.html:2398` with a
   real screen: list + "Nueva cotización" form + per-row "Convertir a venta"
   button calling `POST /api/quotations/:id/convert`.
6. **[1 h]** Add a daily cron (or read-time projection inside `GET`) that flips
   quotes to `status='expired'` when `valid_until < current_date`.
7. **[2 h]** Add `GET /api/quotations/:id/public?token=...` for customer-facing
   sharable URL, plus an entry in the email-templates module.

After steps 1–4 the score should land **≥ 78 / 100**. Steps 5–7 push it past 90.

---

## Artefacts

- Spec: `C:\Users\DELL\Downloads\verion 340\tests\r6e-cotizaciones-e2e.spec.js`
- Config: `C:\Users\DELL\Downloads\verion 340\tests\playwright.r6e.config.js`
- JSON results: `C:\Users\DELL\Downloads\verion 340\tests\r6e-results.json`
  (after each run, written by the `json` reporter)
- HTML report: `C:\Users\DELL\Downloads\verion 340\tests\r6e-report\index.html`
- UI screenshot (Q11): `C:\Users\DELL\Downloads\verion 340\tests\screenshots-r6e\Q11-cotizaciones-screen.png`
- Real handlers: `C:\Users\DELL\Downloads\verion 340\api\index.js` lines **3148–3225**
- Stub shadow:  `C:\Users\DELL\Downloads\verion 340\api\index.js` lines **8962–8963**
- DB schema:    `C:\Users\DELL\Downloads\verion 340\db\R14_QUOTATIONS.sql`
- UI placeholder: `C:\Users\DELL\Downloads\verion 340\salvadorex_web_v25.html` line **2398**

---

## Constraints honored

- ✅ No modifications to `api/index.js`
- ✅ No modifications to any HTML file
- ✅ Tests use only the public HTTP surface + 1 read-only UI walkthrough
- ✅ All created data is best-effort cleaned in `afterAll()`
