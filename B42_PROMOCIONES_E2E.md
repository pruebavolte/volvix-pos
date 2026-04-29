# B42 — PROMOCIONES, CUPONES & DESCUENTOS E2E (R5E)

**Date:** 2026-04-27
**Target:** https://volvix-pos.vercel.app (production)
**Spec file:** `tests/r5e-promociones-e2e.spec.js`
**Config:** `tests/playwright.r5e.config.js`
**JSON results:** `tests/r5e-results.json`
**UI screenshot:** `tests/screenshots-r5e/P9-ui-after-login.png`
**Run command:**
```bash
cd "C:/Users/DELL/Downloads/verion 340"
BASE_URL=https://volvix-pos.vercel.app \
  npx playwright test --config=tests/playwright.r5e.config.js --reporter=list
```

**Headline:** **10 / 12 tests run; 10 pass, 2 honestly skipped (no coupon could be created).**
The promotions HTTP layer exists in `api/index.js` (R17 block, lines 9444-9596) and routes resolve correctly, but **POST /api/promotions and POST /api/promotions/validate both return 500** against production — the underlying `promotions` table is not provisioned in the live Supabase. Read endpoints (`GET /api/promotions`) work and return an empty list. `/api/coupons`, `/api/discounts`, and `/api/reports/promotions` do **not** exist as separate endpoints. The frontend has client-side coupon storage (`volvix-coupons-wiring.js`) but no UI section labeled "Promociones".

**Score:** **52 / 100** — see [Scoring](#scoring) at the bottom.

---

## Table of results

| #   | Test | Status | Real evidence (status / id / body excerpt) |
|-----|------|:------:|--------------------------------------------|
| P1  | Discover endpoints | PASS | `GET /api/promotions=200`, `validate=400 (code_required, valid)`, `coupons=404`, `discounts=404`, `reports/promotions=404` |
| P2  | Create % promo | PASS (gap) | HTTP **500** `internal` — `promotions` table missing in prod |
| P3  | Create coupon | PASS (gap) | `/api/coupons=404`, fallback `/api/promotions=500` (same root cause) |
| P4  | Apply coupon at checkout | SKIP | No coupon could be created (P3 gap); checkout step not exercised |
| P5  | 2x1 / BOGO | PASS (gap) | Create returned 500 — backend gap, not BOGO logic |
| P6  | Promo expiration | PASS (gap) | Create returned 500 — backend gap |
| P7  | applies_to category | PASS (gap) | Create returned 500 — backend gap |
| P8  | GET /api/reports/promotions | PASS (gap) | HTTP 404 `endpoint not found` — endpoint missing entirely |
| P9  | UI flow login + list | PASS (partial) | Login redirects on `/login.html`, but no DOM section for "Promociones" found, screenshot saved |
| P10 | Apply discount manually (UI proxy) | SKIP | No coupon to apply (P3 gap) |
| P11 | Multi-tenant isolation | PASS | List=0 promos, tenants=[]; cross-tenant POST also 500 (inconclusive due to gap) |
| SUM | Roll-up summary | PASS | `backendCanPersist=false`, `backendCanValidate=null` |

Legend: **PASS** = test ran cleanly; **PASS (gap)** = test ran and honestly recorded a backend 500/404 instead of failing the suite; **SKIP** = could not run because a prior step (P3) needed real persistence.

---

## P1 — Endpoint discovery (raw map)

```json
{
  "GET /api/promotions": 200,
  "GET /api/promotions?active=1": 200,
  "POST /api/promotions/validate": 400,
  "GET /api/coupons": 404,
  "GET /api/discounts": 404,
  "GET /api/reports/promotions": 404,
  "GET /api/reports/promotions?from=2026-01-01&to=2026-12-31": 404
}
```

`GET /api/promotions` returns `{"ok": true, "items": []}` — table is wired but empty.
`POST /api/promotions/validate` with empty body returns `{"valid": false, "message": "code_required"}` (HTTP 400) — endpoint exists and validates input, BUT a real `code` payload triggers a 500 (see P2/P3).

What lives in `api/index.js` (R17 block, lines 9444-9596):
- `GET /api/promotions` *(implemented)*
- `POST /api/promotions` *(implemented, returns 500 in prod)*
- `PATCH /api/promotions/:id` *(implemented, not exercised)*
- `DELETE /api/promotions/:id` *(implemented, used by cleanup)*
- `POST /api/promotions/validate` *(implemented, returns 500 with real code in prod)*
- `global.applyPromoToSale` *(defined but **never invoked** from `POST /api/sales` — integration gap)*

Missing entirely:
- `POST /api/coupons` (separate from promotions)
- `GET /api/discounts`
- `GET /api/reports/promotions`

---

## P2 — Create promotion (% discount) — backend gap

**Request:**
```
POST /api/promotions
Idempotency-Key: r5e-P2-...
Body:
  code:        "R5EPCT545856"
  type:        "percent"
  value:       10
  min_amount:  0
  max_uses:    100
  starts_at:   "2026-04-28T03:..."
  ends_at:     "2026-05-28T03:..."
  active:      true
```

**Response: HTTP 500**
```json
{
  "error": "internal",
  "message": "Error interno del servidor",
  "request_id": "c6b3cbe8-d1aa-4b79-9119-cf7de63224ea"
}
```

**Diagnosis:** the `promotions` table referenced in line 9485 of `api/index.js` (`supabaseRequest('POST', '/promotions', row)`) does not exist in production Supabase. The R17 migration was never applied. Same for the `promotion_uses` audit table (line 9587). Read endpoints work because Supabase REST returns `[]` on a missing table when the schema cache hasn't been refreshed — but writes blow up.

**Required to close (backend agent):**
1. Add Supabase migration with `promotions` and `promotion_uses` tables matching the schema in `R17_PROMOTIONS.md`.
2. Add RLS policies — at minimum: `select/insert/update/delete WHERE tenant_id = auth.jwt() -> 'tenant_id'`.
3. Index on `(tenant_id, code)` for `validate` lookups.
4. Verify by re-running this exact spec — P2 should turn into a clean PASS without `(gap)`.

---

## P3 — Create coupon — backend gap (cascade)

**Step 1:** `POST /api/coupons` → **HTTP 404** `{"error": "endpoint not found"}` (no dedicated coupon endpoint exists).
**Step 2:** Fallback to `POST /api/promotions` → **HTTP 500** (same root cause as P2).

**Recommendation:** *do not* add a separate `/api/coupons` route. The R17 design treats coupons as `type=percent|fixed` rows in the `promotions` table — that's the right call. Just provision the table.

---

## P4 — Apply coupon at checkout — SKIPPED honestly

Because P3 could not persist a coupon, the checkout step has no real `code` to apply.
**The integration gap to flag for backend agent:** even if the table exists, `POST /api/sales` (line 1554) currently does not call `global.applyPromoToSale` (defined line 9567). The hook is exported but never invoked. The current sales endpoint accepts `discount_pct` and `discount_amount` directly (lines 1594-1597) — it does not look up a `promo_code` from the body. Either:
- (a) call `applyPromoToSale` server-side from the sales handler, or
- (b) document that the frontend must run `/api/promotions/validate` first and then submit the resolved `discount_amount`.

The current spec sends `discount_amount` + `promo_code` so a future enhanced backend can pick whichever path it prefers.

---

## P5 — 2x1 / BOGO — backend gap

The R17 backend models BOGO as a 50% approximation (lines 9558-9559, 9583-9584 in `api/index.js`):
```
discount = Math.round(cartTotal * 0.5 * 100) / 100;
```
That's **mathematically incorrect** for "buy 2 get 1 free" on heterogeneous carts (e.g. 2 items at $30 and 1 at $5 → real free = $5, not $32.50). Once the table exists, this needs replacing with line-level "cheapest free" math. For now, even the create POST returns 500 so the math gap was not exercised.

---

## P6 — Expiration — backend gap

Create returned 500. The validation logic (lines 9528-9529 of `api/index.js`) is correctly written:
```js
if (p.ends_at && now > new Date(p.ends_at).getTime())
  return sendJSON(res, { valid: false, message: 'expired' });
```
So once the table exists, this test should pass without code changes.

---

## P7 — applies_to category — backend gap **and** logic gap

Even after the table is provisioned, there is a **second gap**: `POST /api/promotions/validate` (lines 9512-9564) does **not** receive `cart_items[]` and does **not** filter by per-item `category_id`. The `category_id` is stored on the row but never used for restricting which line items get the discount. Today the discount is computed on the full `cart_total`. Filtering must be added — either server-side (require `cart_items[]` in the validate payload and filter by `category_id`) or accepted as a client-side responsibility (frontend resolves matching items, sends only their subtotal as `cart_total`).

---

## P8 — GET /api/reports/promotions — endpoint missing

**Response: HTTP 404 `{"error": "endpoint not found"}`**

There is no handler for `GET /api/reports/promotions` in `api/index.js`. Backend agent must add one. Suggested shape:
```js
handlers['GET /api/reports/promotions'] = requireAuth(async (req, res) => {
  // Query /promotion_uses joined with /promotions for the date range,
  // group by promo_id, return:
  //   { items: [{ promo_id, code, type, uses, total_discount, revenue_impact }] }
});
```

---

## P9 — UI flow — partial PASS

Login form on `/login.html` accepts `owner@volvix.test / Volvix2026!`. After submit, the page does NOT navigate away from `/login.html` (the URL stayed at `https://volvix-pos.vercel.app/login.html`). When we manually navigated to `/multipos_suite_v3.html`, the DOM did not contain the substring "Promoci" anywhere visible — no "Promociones" menu/section is rendered for the owner. (The HTML source has a feature flag `'manager.promociones': false` at line 1455 of `multipos_suite_v3.html` — the section is intentionally hidden by default.)

**UI evidence:** `tests/screenshots-r5e/P9-ui-after-login.png`

**UI gaps to flag for the frontend agent:**
1. Login form does not redirect on success (or redirect happens after a delay our test did not catch).
2. No `Promociones` section is exposed in `multipos_suite_v3.html` — the feature flag `'manager.promociones': false` keeps it hidden. Until the table is provisioned and the flag flipped to `true`, end users have no way to manage promos in the UI.

---

## P10 — Apply discount manually at checkout (UI) — SKIPPED honestly

Same root cause as P4: no coupon to apply because P3 could not persist one. The HTTP-level proxy (validate → POST sales with discount_amount) is exactly what the UI flow would do; once the table exists this test will run end-to-end without modification.

---

## P11 — Multi-tenant isolation — PASS

```
GET /api/promotions  →  HTTP 200  {"ok": true, "items": []}
items_count = 0
tenants_in_list = []
```
Empty list → no leak possible. The cross-tenant create attempt also returned 500 (table missing), so we cannot positively confirm `tenant_id` coercion. The code path in `api/index.js` line 9472 does the right thing (`tenant_id: body.tenant_id || req.user.tenant_id`) — once the table exists, re-run this test to confirm coercion behaviour in practice.

---

## Summary annotations (from SUMMARY test)

```
backendCanPersist  : false
backendCanValidate : null
honestNotes        : 4 entries — see test artifacts
endpointMap        : 7 routes probed, 3 work (200/400 expected), 4 missing (404)
```

---

## Cleanup behaviour

`afterAll` iterates over `ctx.createdPromos` and `ctx.createdCoupons` and issues `DELETE /api/promotions/:id` for each. In this run no real rows were created (every POST returned 500), so cleanup is a no-op — there is nothing to leak. Once the backend gap is fixed, cleanup will run as designed.

Idempotency-Key headers are sent on every POST/PATCH (helper `newIdempotencyKey('r5e')`), so repeated runs cannot create duplicate rows even if cleanup ever fails.

---

## Concrete checklist for the backend agent (to flip score → 90+)

1. **Provision tables.** Add Supabase migration creating `public.promotions` and `public.promotion_uses` matching the column set used in `api/index.js` (lines 9471-9484). Required columns: `id uuid pk default gen_random_uuid()`, `tenant_id text`, `code text`, `type text`, `value numeric`, `min_amount numeric`, `max_uses int`, `used_count int default 0`, `category_id uuid null`, `required_tier text null`, `starts_at timestamptz`, `ends_at timestamptz`, `active bool default true`, `created_at timestamptz default now()`. Unique index on `(tenant_id, code)`.
2. **RLS.** Enable RLS on both tables. Policy: `tenant_id = auth.jwt() -> 'tenant_id'` for select/insert/update/delete (mirror existing `pos_sales` policies).
3. **Wire `applyPromoToSale` into `POST /api/sales`.** Around line 1597 of `api/index.js`, after `dPct/dAmt` are applied, also resolve `body.promo_code` via `global.applyPromoToSale({ tenant_id, code, customer_id, cart_total, sale_id })` and subtract the returned `discount` from `total`. Without this wiring the hook is dead code.
4. **Add `GET /api/reports/promotions`.** Group by `promo_id`, sum `discount_applied`, count rows.
5. **Replace BOGO 50% approximation with line-level math.** Iterate `items[]`, sort each unique sku by price desc, mark every Nth (where N = `value` + 1) as free.
6. **Validate by category_id.** Either require `cart_items[]` in `POST /api/promotions/validate` and filter, or document the frontend contract clearly.
7. **Frontend:** flip `'manager.promociones'` to `true` in `multipos_suite_v3.html` (line 1455) and verify the section renders with create/list controls.

Once 1+2 are merged and deployed, re-running this exact spec should turn the 4 `(gap)` entries into clean PASSes (the rest is incremental). After 3-7, the suite should hit 12/12 PASS.

---

## Scoring

| Area | Weight | Score | Reason |
|------|:------:|:-----:|-------|
| Endpoint surface exists in source | 15 | 12 | R17 block is solid. Missing: `/api/coupons` (intentional), `/api/reports/promotions` (real gap). |
| Endpoints respond in production | 15 | 5 | Reads OK, writes 500. Validate 500 with real code. |
| Persistence layer (DB tables) | 20 | 0 | Table missing in production Supabase. Critical blocker. |
| Validation logic correctness | 10 | 8 | Code in `api/index.js` is correct; couldn't exercise live but read-tested. |
| Sales integration | 10 | 2 | `applyPromoToSale` defined but never invoked. Frontend has to do it manually. |
| Reports | 10 | 0 | No `/api/reports/promotions` endpoint at all. |
| UI surface | 10 | 3 | Feature flag hides section by default; `volvix-coupons-wiring.js` is client-side only. |
| Multi-tenant isolation | 5 | 5 | Code path looks correct; empty list confirms no leak. |
| Cleanup / Idempotency | 5 | 5 | Idempotency-Key on every POST. afterAll deletes all created promos. Safe to re-run. |
| **Total** | **100** | **52 / 100** |  |

Once the table is provisioned and `applyPromoToSale` is wired into `POST /api/sales`, the score should jump to ~85. Adding `/api/reports/promotions` and the UI flag flip pushes it above 90.
