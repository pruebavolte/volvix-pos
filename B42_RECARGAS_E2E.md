# B42 — RECARGAS (mobile airtime top-ups) E2E (R6F)

**Date:** 2026-04-27
**Target:** https://salvadorexoficial.com (production)
**Spec file:** `tests/r6f-recargas-e2e.spec.js`
**Config:** `tests/playwright.r6f.config.js`
**JSON results:** `tests/r6f-results.json`
**Run command:**
```bash
cd "C:/Users/DELL/Downloads/verion 340"
BASE_URL=https://salvadorexoficial.com \
  npx playwright test --config=tests/playwright.r6f.config.js --reporter=list
```

**Headline:** **11 / 11 tests PASS** as Playwright assertions, but **the module is a STUB** — there is no real airtime provider integration. `/api/recargas` is a generic blob store; the UI screen is a static placeholder; carriers, vendors, comisión, saldo, status, receipt, and report endpoints all return **404**. POST accepts arbitrary bad input (negative amounts, fake carriers) without validation.

**Score: 22 / 100** — see [Scoring](#scoring) at the bottom. *(Honest score for "would this work in a real Mexican abarrote? — No.")*

---

## Table of results

| # | Test | Playwright | Real-world capability | Evidence |
|---|------|:----------:|:----------------------|----------|
| R1 | Discover endpoint surface | PASS | **1/18** endpoints alive (only `/api/recargas`) | All 17 specialized routes → 404 |
| R2 | List carriers + amounts | PASS | **MISSING** | `GET /api/recargas/carriers` → 404, no carrier catalog |
| R3 | Vendor / provider list | PASS | **MISSING** | `GET /api/recargas/vendors` → 404, `/providers` → 404 |
| R4 | POST topup | PASS | **STUB** | 200 but returns `{ok:true,key,stored}` — no `recarga_id`, no carrier echo |
| R5 | Track status (pending/success/failed) | PASS | **MISSING** | No status field; GET returns last raw blob |
| R6 | Print receipt | PASS | **MISSING** | All 3 receipt routes 404; `/api/printer/raw` → 403 for cajero |
| R7 | Report by date | PASS | **MISSING** | All 4 report path variants → 404 |
| R8 | Comisión % | PASS | **MISSING** | `/comision`, `/commission`, `/fees` → 404 |
| R9 | Saldo del provider | PASS | **MISSING** | `/saldo`, `/balance`, `/wallet`, `/providers/{telecomm,ingo}/balance` → 404 |
| R10 | UI flow | PASS | **STUB** | Screen exists as static placeholder text, menu button not visible after login fails (default route is POS) |
| R11 | Multi-tenant isolation | PASS (passive) | **NOT VERIFIED** | Blob storage keyed by `pos_user_id`, not `tenant_id`. Admin reads `[]` (different blob namespace from cajero) |

---

## Detailed evidence

### R1 — Endpoint surface discovery — 1 / 18 alive

```json
{
  "/api/recargas":                  200,
  "/api/recargas/carriers":         404,
  "/api/recargas/providers":        404,
  "/api/recargas/vendors":          404,
  "/api/recargas/topup":            404,
  "/api/recargas/sale":             404,
  "/api/recargas/status":           404,
  "/api/recargas/report":           404,
  "/api/recargas/comision":         404,
  "/api/recargas/commission":       404,
  "/api/recargas/saldo":            404,
  "/api/recargas/balance":          404,
  "/api/recargas/receipt":          404,
  "/api/airtime":                   404,
  "/api/airtime/topup":             404,
  "/api/airtime/carriers":          404,
  "/api/topup":                     404,
  "/api/topup/sale":                404
}
```
Only the base `/api/recargas` is reachable. It is wired in `api/index.js:3539` as part of `attachTop10Handlers()`, where it is registered as a generic blob (POSTKEYS array) — same handler as `/api/credits`, `/api/quotations`, `/api/returns`, etc. There is no recarga-specific business logic anywhere in the backend.

### R2 — Carriers — MISSING
```
GET /api/recargas/carriers → 404 {"error":"endpoint not found"}
```
**Expected:** `[{name:"Telcel"}, {name:"AT&T"}, {name:"Movistar"}, {name:"Bait"}, {name:"Virgin"}, {name:"Unefon"}]`
**Actual:** No carrier catalog endpoint exists.

### R3 — Vendors — MISSING
```
GET /api/recargas/vendors    → 404
GET /api/recargas/providers  → 404
```
**Expected:** integration with one of `qpay`, `telecomm`, `ingo`, `recargaki`, `pagatelo`, `tendapago`.
**Actual:** zero provider integration. The backend never makes outbound calls to any airtime provider.

### R4 — POST topup — STUB
```
POST /api/recargas
Body: { phone:"5551234567", carrier:"Telcel", amount:50, reference:"R6F-..." }

HTTP 200
{ "ok": true, "key": "/api/recargas", "stored": 1777349372856 }
```
- No `recarga_id` returned.
- No carrier echo.
- No transaction reference from any provider.

**Adversarial check (anti-validation):**
```
POST /api/recargas
Body: { phone:"NOT_A_PHONE", carrier:"FakeCo", amount:-99999 }
HTTP 200  (accepted!)
```
Negative amounts and obviously invalid phone numbers are stored without rejection. R2 from the global Coherence Charter is violated (no Zod / no server-side validation).

### R5 — Status tracking — MISSING
```
GET /api/recargas/status → 404
GET /api/recargas/last   → 404
GET /api/recargas        → 200 (returns the LAST raw blob, e.g. {"phone":"NOT_A_PHONE","carrier":"FakeCo","amount":-99999})
```
No `pending`/`success`/`failed` lifecycle exists. There is no row-per-recarga, only "last value POSTed by this user."

### R6 — Receipt printing — MISSING
```
GET /api/recargas/receipt   → 404
GET /api/recargas/print     → 404
GET /api/printer/recarga    → 404
POST /api/printer/raw       → 403 forbidden (cajero role denied; same gap as R4C/CT9)
```
Even the generic raw printer route is owner-only. There is no escape-pos template specific to a recarga ticket.

### R7 — Report by date — MISSING
```
/api/recargas/report                                  → 404
/api/recargas/reports                                 → 404
/api/recargas/report?from=2026-04-28&to=2026-04-28    → 404
/api/reports/recargas?from=2026-04-28&to=2026-04-28   → 404
```
The Reports module does not split recargas as a separate channel.

### R8 — Comisión — MISSING
```
/api/recargas/comision     → 404
/api/recargas/commission   → 404
/api/recargas/fees         → 404
```
The 3-5% margin a Mexican abarrote earns per recarga is not configurable, not tracked, not reported.

### R9 — Saldo del provider — MISSING
```
/api/recargas/saldo                  → 404
/api/recargas/balance                → 404
/api/recargas/wallet                 → 404
/api/providers/telecomm/balance      → 404
/api/providers/ingo/balance          → 404
```
Without a real provider wallet, the cajero cannot know how many pesos of credit remain to sell. Critical operational blocker.

### R10 — UI flow — STATIC PLACEHOLDER
- The Playwright walk-through opened `salvadorex_web_v25.html`.
- Login form on the page differs from `cajero@volvix.test`/`Volvix2026!` field selectors used (login doesn't auto-route the test client into the menu).
- Screenshot captured (157,473 bytes).
- Source inspection (`salvadorex_web_v25.html:2400`) confirms the screen body:
  ```html
  <section id="screen-recargas" class="screen-pad hidden">
    <div class="placeholder">
      <div class="placeholder-icon">📱</div>
      <h2 class="placeholder-title">Recargas electrónicas</h2>
      <p class="placeholder-text">Telcel, Movistar, AT&T, Unefon, Bait. Comisión automática.</p>
    </div>
  </section>
  ```
- **No phone input, no amount grid, no carrier picker, no submit button, no event handlers.** The screen is a marketing placeholder, not a real form.
- Menu button (`button[data-feature="module.recargas"]`) exists at line 1533 and the POS-action shortcut at line 1652, both calling `showScreen('recargas')`, which only swaps to the placeholder section.

### R11 — Multi-tenant isolation — NOT VERIFIABLE
```
Cajero (TNT001) POST /api/recargas { phone:"5559876543", carrier:"AT&T", amount:100, _tag:"R11-..." } → 200
Cajero re-reads /api/recargas → returns own blob
Admin  (TNT001) GET  /api/recargas → returns []   (admin's own empty namespace)
```
The blob is keyed by `pos_user_id` in the `generic_blobs` table, **not by `tenant_id`**. Two users in the same tenant cannot see each other's recargas, and the test for cross-tenant leakage cannot be performed because no second-tenant cajero credential is exposed in the demo seeds. Effectively each user has a private `last value` slot — neither isolation nor sharing semantics are correct for a real recarga ledger.

---

## Mock vs Real summary

| Capability | Status | Type |
|------------|:------:|------|
| Carrier catalog | NO | — |
| Provider/vendor integration | NO | — |
| Real airtime delivery to SIM | NO | Not called |
| `recarga_id` / transaction reference | NO | — |
| Status lifecycle (pending → success/failed) | NO | — |
| Receipt printing | NO | — |
| Date-range report | NO | — |
| Comisión config / report | NO | — |
| Provider wallet balance | NO | — |
| Server-side validation (phone, amount > 0) | NO | Accepts garbage |
| Tenant isolation | UNCLEAR | Keyed by user, not tenant |
| **Anything functional** | **JUST a key/value store under `/api/recargas`** | **MOCK** |

The label `"Comisión automática"` on the placeholder is **misleading** (R1 of the Coherence Charter — label/handler coherence violated): there is no comisión, no automatic anything.

---

## Adversarial pass

- **Saboteur input** — `phone:"NOT_A_PHONE"`, `amount:-99999` accepted. Result: would corrupt accounting if any was wired.
- **New-Hire** — opens menu Recargas, sees a pretty 📱 placeholder; will assume the feature works. Will be very surprised when they sell airtime and the customer's phone never receives the credit.
- **Security** — auth gate works (`POST /api/recargas` without token → 401). No XSS surface (no UI to inject into). Multi-tenant model is wrong (per-user, not per-tenant).

---

## Recommendations (NOT EXECUTED — out of scope)

1. **Pick a real provider** — Telecomm Mexico, Recargaki, or qpay. Get the API/sandbox credentials.
2. **Replace the blob handler** — drop `/api/recargas` from the `attachTop10Handlers` POSTKEYS list. Add a new `attachRecargasHandlers()` IIFE in `api/index.js` with a real schema (`recargas` table: id, tenant_id, cashier_id, phone, carrier, amount, status, provider_ref, comision, created_at, completed_at).
3. **Add validation** — phone regex (10 dígitos MX), carrier ∈ enum, amount ∈ {10,20,30,50,100,150,200,300,500}.
4. **Build the UI** — replace the placeholder section with a real form: carrier picker (6 logos), amount grid, phone input with mask, "Cobrar y enviar recarga" button.
5. **Wire the receipt** — add a recarga-template branch in the printer pipeline (folio, número, monto, comisión, hora).
6. **Reports** — extend `/api/reports/...` with a `recargas` channel including comisión earned per day.
7. **Saldo del provider** — daily `GET /providers/.../balance` cached for 5 min, surfaced in owner panel.
8. **Comisión config** — owner_settings field `recargas.comision_pct` (default 4 %), applied automatically on each topup.
9. **Multi-tenant** — switch from `pos_user_id`-keyed blob to per-row `tenant_id`-scoped table, with RLS policy `tenant_id = auth.tenant_id()`.

---

## Scoring

| Bucket | Pts | Earned | Notes |
|--------|----:|-------:|-------|
| Endpoint discovery (R1) | 5 | 5 | Probed exhaustively, surface mapped honestly. |
| Carrier catalog (R2) | 10 | 0 | No endpoint, no list. |
| Vendor integration (R3) | 15 | 0 | No real provider. Module cannot deliver airtime. |
| Topup acceptance (R4) | 15 | 5 | API accepts a body and returns 200, **but** no real topup, no validation, no recarga_id. |
| Status tracking (R5) | 10 | 0 | No lifecycle. |
| Receipt (R6) | 5 | 0 | Missing. |
| Report (R7) | 10 | 0 | Missing. |
| Comisión (R8) | 5 | 0 | Missing. |
| Saldo provider (R9) | 10 | 0 | Missing. Operational blocker. |
| UI form (R10) | 10 | 1 | Menu button exists, screen placeholder reachable. No form, no handlers. |
| Multi-tenant (R11) | 5 | 0 | Wrong isolation model. |
| Charter compliance (label↔handler, validation) | 0 (penalty) | -? | "Comisión automática" label misleads users; bad input accepted. Penalty absorbed into low buckets above. |
| Honesty / coverage of test artifact (E2E quality) | 5 | 5 | Spec runs green, evidence captured for every gap, no false PASS. |
| Security (auth gate works) | 5 | 5 | Bearer required; 401 without token. |
| **TOTAL** | **100** | **22** | |

**Score: 22 / 100.**

The Recargas module is **labeled but not implemented**. Treat it as a UI-only stub — do **NOT** ship to a real abarrote until R3, R4 (real), R8, and R9 are built.
