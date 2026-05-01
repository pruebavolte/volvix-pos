# R26 — Defect Found & Fixed

**Date:** 2026-04-27 · **Auditor:** Claude (deep search)
**Endpoint:** `POST /api/customers` · **Vector:** C (RFC validation)

## Vectors probed

| # | Vector | Result |
|---|---|---|
| A | Stock decrement on sale | PASS — `decrement_stock_atomic` RPC at `api/index.js:1330` |
| B | Total recalc server-side | PASS — server recomputes from items at `api/index.js:1304` |
| **C** | **RFC validation** | **DEFECT — accepted any string** |
| D | Fractional stock | PASS — `Number.isInteger` check at `api/index.js:1147` |
| E | Future `created_at` | PASS — silently dropped via `ALLOWED_FIELDS_SALES` whitelist |

## Defect

`POST /api/customers` (active handler at `api/index.js:6726`, override) accepted any value
in `rfc` without validation. The field was also missing from
`ALLOWED_FIELDS_CUSTOMERS`, so even valid RFCs were silently dropped before persistence —
a double-failure: invalid RFCs accepted with HTTP 200, valid RFCs lost.

### Repro pre-fix (production)

```bash
TOK=$(curl -s -X POST https://salvadorexoficial.com/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@volvix.test","password":"Volvix2026!"}' | jq -r .token)

curl -s -X POST https://salvadorexoficial.com/api/customers \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"name":"X","rfc":"INVALID-RFC"}'
# → HTTP 200 {"ok":true,"id":"...","rfc":"INVALID-RFC"}   ← BUG
```

## Fix applied

File: `api/index.js`

1. Added `rfc` to `ALLOWED_FIELDS_CUSTOMERS` (line 324).
2. Added `isValidRFC()` SAT-format validator (PF 13 chars / PM 12 chars, embedded YYMMDD,
   homoclave alfanum, dígito verificador A/0-9), lines ~327-345.
3. Wired validation into both POST `/api/customers` handlers (override at ~6741, original
   at ~1442). Returns HTTP 400 `{error:"invalid_rfc"}` on bad format. Persists uppercase
   trimmed RFC on success.

## Verification post-fix (production, deploy `dpl_7wkPXy2mZLzpN3DVbMQUAZpYJwv3`)

```
C1  rfc:"INVALID-RFC"     → HTTP 400  {"error":"invalid_rfc","message":"RFC no cumple formato SAT…"}
C2  rfc:"XAXX010101000"   → HTTP 200  {"ok":true,"id":"a9ccf116-…","rfc":"XAXX010101000"}
```

Both expected. Defect closed.

## Deploy

- Commit: `7f147e4` (local, no remote configured)
- Vercel: production alias `salvadorexoficial.com` → `dpl_7wkPXy2mZLzpN3DVbMQUAZpYJwv3` (READY)
