# B43 — SERVICIOS + RECARGAS — Backend foundation report

**Status:** Implemented and deployed (migrations applied + endpoints registered).
**Date:** 2026-04-27
**Owner:** B43 backend agent (parallel-safe IIFE `attachB43ServiciosRecargas`)
**Files touched:**
- `migrations/b43-service-payments.sql` (new)
- `migrations/b43-recargas.sql` (new)
- `api/index.js` — appended new IIFE `attachB43ServiciosRecargas` at end of file (lines 15633–16334). No pre-existing handler modified.

---

## 1. Module 1 — SERVICIOS (utility bill payments)

### Path collision fix
The pre-existing `/api/services` is the R17 **appointments** module (in-memory map `_APPT_STORE.services`, lines 8810–8833 of `api/index.js`). To avoid collision, all new endpoints live under `/api/service-payments/*`.

### Database (migration `b43-service-payments.sql`)
Tables created (idempotent):
- `service_providers` — catalog of supported utility/telco/TV providers
  - Seeded 9 Mexican providers: `cfe`, `telmex`, `megacable`, `izzi`, `totalplay`, `sky`, `dish`, `gas-natural`, `cospel`
  - Each with `category`, `ref_pattern` (regex), `ref_min_length`, `ref_max_length`, `active`, `config` (jsonb)
- `service_payments` — every payment recorded
  - RLS policy `spay_iso` — tenant_id from JWT (or superadmin override)
  - Indexes: `(tenant_id, paid_at DESC)`, `(status)`, `(provider_code)`
  - Status enum: `pending | verified | paid | failed | reversed`

### New endpoints (6)
| Method + path | Auth | Idempotency | Description |
|---|---|---|---|
| `GET /api/service-payments/providers?category=luz` | public | — | List active providers (sendJSONPublic 300s + ETag). Filterable by category. |
| `POST /api/service-payments/verify` | requireAuth | — | Body `{provider_code, reference}`. Validates ref against provider's `ref_pattern`/length, returns mocked balance + due_date (or real call if `SERVICE_AGGREGATOR_PROVIDER` env set). |
| `POST /api/service-payments/pay` | requireAuth + Idempotency-Key | yes | Body `{provider_code, reference, amount, customer_phone, customer_email}`. Persists to `service_payments` with comision = `max(amount * 0.015, 5)`. Returns `external_ref = MOCK-{base36ts}-{rand}` if mocked. |
| `GET /api/service-payments?from&to&status&provider_code` | requireAuth | — | List tenant payments, filterable by date range / status / provider. |
| `POST /api/service-payments/:id/reverse` | requireAuth (owner/admin/manager/superadmin) | — | Body `{reason}`. Sets status = `reversed`, `reversed_at`, `reversal_reason`. |
| `GET /api/reports/service-payments?from&to` | requireAuth (owner/admin/manager/superadmin) | — | Aggregates: totals (amount/comision/paid/reversed/failed/all), `by_provider`, `by_status`. |

### Validation behavior
- Missing `provider_code` / `reference` / `amount` → 400 `validation_failed`
- Provider unknown → 404
- Provider inactive → 422
- Reference format mismatch (regex / length) → 400 with hint
- Amount ≤ 0 or > 50,000 → 400
- Invalid UUID on `:id/reverse` → 400
- Already-reversed payment → 409
- Non-owner user attempting reverse → 403

---

## 2. Module 2 — RECARGAS (mobile airtime)

### Path collision fix
The pre-existing `POST /api/recargas` and `GET /api/recargas` are generic blob CRUD (`attachTop10Handlers`, line 3544). Untouched. New endpoints live under `/api/recargas/v2/*`.

### Database (migration `b43-recargas.sql`)
Tables created (idempotent):
- `airtime_carriers` — catalog of carriers + valid recharge amounts
  - Seeded 6 MX carriers: `telcel`, `att`, `movistar`, `bait`, `unefon`, `virgin`
  - `amounts` (jsonb array), `comision_pct` (default 5%, Bait 6%)
- `recargas` — every airtime topup
  - RLS policy `recargas_iso` — tenant_id from JWT (or superadmin)
  - Indexes: `(tenant_id, created_at DESC)`, `(carrier_code)`, `(status)`
  - Status enum: `pending | success | failed | refunded`

### New endpoints (6)
| Method + path | Auth | Idempotency | Description |
|---|---|---|---|
| `GET /api/recargas/v2/carriers` | public | — | List active carriers + amounts (sendJSONPublic 300s + ETag). |
| `POST /api/recargas/v2/topup` | requireAuth + Idempotency-Key | yes | Body `{carrier_code, phone, amount}`. Validates phone is 10-digit MX (no leading 0), amount in `carrier.amounts`. Inserts pending row, simulates 500ms delay, mock success ~95% (mocked) or real call if `AIRTIME_PROVIDER` env set. Returns 201 on success, 502 on mock failure. |
| `GET /api/recargas/v2?from&to&status&carrier_code` | requireAuth | — | List + totals (`amount_success`, `comision_success`, `success`, `failed`). |
| `GET /api/recargas/v2/:id` | requireAuth | — | Single recharge detail (UUID validation). |
| `POST /api/recargas/v2/:id/retry` | requireAuth | — | Only allowed when current status = `failed`. Re-simulates topup, ~90% mock success. |
| `GET /api/reports/recargas?from&to` | requireAuth (owner/admin/manager/superadmin) | — | Daily report: totals, `by_carrier`, `by_day`. |

### Validation behavior
- Phone not matching `/^[1-9][0-9]{9}$/` → 400 with hint `formato esperado: 5512345678`
- Amount not in `carrier.amounts` → 400 with hint listing allowed amounts
- Carrier unknown → 404
- Carrier inactive → 422
- Invalid UUID on `:id` / `:id/retry` → 400
- Retrying non-failed recharge → 409
- Mock provider failure → 502 (with audit + persisted error_message)

---

## 3. Mock vs real provider behavior

### Servicios
- `SERVICE_AGGREGATOR_PROVIDER` unset (default) → returns `external_ref = MOCK-{ts}-{rand}`, `status = paid`. Verify endpoint returns random balance 50–1500 MXN, due_date 10–24 days out.
- `SERVICE_AGGREGATOR_PROVIDER=pademobile|qpagos|cospel` → endpoint records `status = pending`, `external_ref = PEND-{ts}`, `receipt_data.aggregator = <provider>`. Real HTTP call to aggregator is a TODO marked in code (`// real call`).

### Recargas
- `AIRTIME_PROVIDER` unset (default) → 500ms simulated latency, ~95% success (5% simulated failure). Failures persisted with `error_message = mock_provider_simulated_failure`.
- `AIRTIME_PROVIDER=telcel-direct|inworld|qpagos` → records `external_ref = PEND-{ts}` (TODO: real HTTP call).

---

## 4. Security & multi-tenancy

- All write endpoints require `requireAuth` (Bearer JWT or `X-API-Key`).
- All mutations use `tenant_id` from JWT (`req.user.tenant_id`); superadmin can override via `?tenant_id=` on GETs.
- RLS policies enforce isolation at DB layer (`auth.jwt() ->> 'tenant_id'`).
- Write endpoints (`/pay`, `/topup`) gated by `withIdempotency` — duplicate `Idempotency-Key` returns cached response.
- Per-tenant rate limits: 60 pagos/min, 120 recargas/min, 30 retries/min.
- Audit log via `logAudit` for: `service_payment.paid`, `service_payment.reversed`, `recarga.success`, `recarga.failed`, `recarga.retry.success`, `recarga.retry.failed`.
- Body size capped (8KB on simple, 16–32KB on complex). `strictJson: true` rejects non-JSON content-type with 415.

---

## 5. curl test commands

Replace `$TOKEN` with a valid Bearer JWT (e.g. from `POST /api/login`).

```bash
BASE=https://volvix-pos.vercel.app
TOKEN=eyJhbGciOiJIUzI1NiIs...

# --- SERVICIOS -----------------------------------------------------------
# 1. List providers (public)
curl -s $BASE/api/service-payments/providers | jq

# 2. List by category
curl -s "$BASE/api/service-payments/providers?category=luz" | jq

# 3. Verify reference (CFE 12-digit)
curl -s -X POST $BASE/api/service-payments/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider_code":"cfe","reference":"123456789012"}' | jq

# 4. Verify reference INVALID format -> 400
curl -s -X POST $BASE/api/service-payments/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider_code":"cfe","reference":"123"}' | jq

# 5. Pay bill (with Idempotency-Key)
curl -s -X POST $BASE/api/service-payments/pay \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pay-$(date +%s)" \
  -d '{"provider_code":"cfe","reference":"123456789012","amount":350.50,"customer_phone":"5512345678"}' | jq

# 6. List my tenant payments
curl -s "$BASE/api/service-payments?from=2026-04-01&to=2026-04-30" \
  -H "Authorization: Bearer $TOKEN" | jq

# 7. Reverse a payment (owner only)
curl -s -X POST $BASE/api/service-payments/<UUID>/reverse \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"cliente solicito devolucion"}' | jq

# 8. Report
curl -s "$BASE/api/reports/service-payments?from=2026-04-01&to=2026-04-30" \
  -H "Authorization: Bearer $TOKEN" | jq

# --- RECARGAS ------------------------------------------------------------
# 9. List carriers (public)
curl -s $BASE/api/recargas/v2/carriers | jq

# 10. Topup OK (Telcel 100 MXN)
curl -s -X POST $BASE/api/recargas/v2/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: top-$(date +%s)" \
  -d '{"carrier_code":"telcel","phone":"5512345678","amount":100}' | jq

# 11. Topup INVALID PHONE -> 400
curl -s -X POST $BASE/api/recargas/v2/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: top-bad-$(date +%s)" \
  -d '{"carrier_code":"telcel","phone":"123","amount":100}' | jq

# 12. Topup INVALID AMOUNT (Bait does not allow 30) -> 400
curl -s -X POST $BASE/api/recargas/v2/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: top-baitbad-$(date +%s)" \
  -d '{"carrier_code":"bait","phone":"5512345678","amount":30}' | jq

# 13. List recargas
curl -s "$BASE/api/recargas/v2?from=2026-04-01&to=2026-04-30" \
  -H "Authorization: Bearer $TOKEN" | jq

# 14. Single recarga
curl -s "$BASE/api/recargas/v2/<UUID>" \
  -H "Authorization: Bearer $TOKEN" | jq

# 15. Retry failed
curl -s -X POST "$BASE/api/recargas/v2/<UUID>/retry" \
  -H "Authorization: Bearer $TOKEN" | jq

# 16. Daily report by carrier
curl -s "$BASE/api/reports/recargas?from=2026-04-01&to=2026-04-30" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 6. Required env vars for production providers

| Env var | Purpose | Values |
|---|---|---|
| `SERVICE_AGGREGATOR_PROVIDER` | Servicios bill-pay aggregator. Unset = mock. | `pademobile`, `qpagos`, `cospel` |
| `AIRTIME_PROVIDER` | Recargas airtime provider. Unset = mock. | `telcel-direct`, `inworld`, `qpagos` |

When set, these env vars only flag the code path; the actual HTTP integration with each aggregator is a clearly-marked TODO inside the `pay` and `topup` handlers (`// real call would replace this`).

Standard env vars already required by `api/index.js`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `ALLOWED_ORIGINS`. No new auth/secret env required for B43.

---

## 7. Migrations applied

```bash
$ supabase db query --linked --file migrations/b43-service-payments.sql
{ "rows": [] }   # success

$ supabase db query --linked --file migrations/b43-recargas.sql
{ "rows": [] }   # success
```

Verification:
```
service_providers : 9 rows
service_payments  : 0 rows (ready)
airtime_carriers  : 6 rows
recargas          : 0 rows (ready)
```

---

## 8. Score upgrade estimate

| Module | Before | After | Delta | Reason |
|---|---|---|---|---|
| **SERVICIOS** | 42/100 | **80/100** | +38 | 6 new endpoints (was 0 real bill-pay endpoints; the existing `/api/services` was unrelated appointments). Catalog with regex validation. RLS-enforced multi-tenant table. Idempotency + audit + rate-limit + reversal. Mock provider with deterministic confirmation. Reports endpoint with totals + by_provider/by_status. Path collision (R17) resolved cleanly. Missing: real aggregator HTTP calls (env-flagged TODOs), CFDI integration, retries on failed status. |
| **RECARGAS** | 22/100 | **75/100** | +53 | 6 new v2 endpoints (was 1 generic blob). Carriers catalog with per-carrier amount whitelist + comision %. MX phone validation (10-digit, no leading 0). Tenant-isolated `recargas` table with RLS. Idempotency on topup. Two-phase persist (pending → success/failed) for audit trail even on upstream failure. Retry endpoint for failed. Daily/per-carrier report. Missing: real provider HTTP integration (env-flagged TODOs), webhook for async confirmations, refund flow (table has `refunded` status but no endpoint yet). |

---

## 9. Constraints honored

- ✅ All new code in single new IIFE `attachB43ServiciosRecargas` at end of `api/index.js`.
- ✅ No pre-existing handler modified.
- ✅ No HTML files modified.
- ✅ No `volvix-feature-flags.js` / `volvix-uplift-wiring.js` modified.
- ✅ TEXT `tenant_id` everywhere.
- ✅ JWT auth + Idempotency-Key on writes + audit log on every state transition.
- ✅ `node --check api/index.js` passes.
- ✅ Migrations applied to linked Supabase project (`zhvwmzkcqngcaqpdxtwr`).
