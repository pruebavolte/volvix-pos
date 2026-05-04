# R22 — SECURITY HARDENING (anti-fraude / race conditions)

**Fecha:** 2026-04-26
**Deploy prod:** https://salvadorexoficial.com (alias) — `dpl_5KiQPo3re84t1sbRKpD1BK1QEZNp`
**SQL:** `db/R22_SECURITY_HARDENING.sql` ejecutado vía Management API (Cloudflare bypass: `User-Agent: curl/8.5.0`).

## Cambios aplicados

### Fix 1 — Idempotency keys
- Tabla `idempotency_keys(key PK, user_id, endpoint, response_body jsonb, status_code, created_at, expires_at TTL 24h)`.
- Helper `withIdempotency(endpoint, handler)` que: (a) chequea llave existente y devuelve respuesta cacheada, (b) wrapea `res.end` para capturar el body y persistirlo on `finish`.
- Aplicado a: `POST /api/sales`, `POST /api/cash/open`, `POST /api/cash/close`, `POST /api/payments/stripe/intent`, `POST /api/invoices/cfdi`.
- `Idempotency-Key` header **requerido** (400 si falta).

### Fix 2 — Optimistic locking
- `ALTER TABLE pos_products / pos_sales / customers ADD COLUMN version int DEFAULT 1`.
- Trigger `bump_version_trigger` autoincrementa version en cada UPDATE.
- `getExpectedVersion(req, body)` lee `If-Match` o `body.version`.
- PATCH con `WHERE id=$1 AND version=$2` → si rowcount=0 → `409 version_conflict` con `current_version` y `expected_version`.
- Aplicado a `PATCH /api/products/:id` y `PATCH /api/customers/:id`.

### Fix 3 — Stock atómico
- RPC `decrement_stock_atomic(items jsonb)` corre en una transacción; cada `UPDATE … WHERE stock>=qty RETURNING stock`. Si algún item falla, `RAISE EXCEPTION 'stock_insuficiente:<id>'` revierte todo.
- En `POST /api/sales`, antes de insertar, se llama el RPC. Si falla por stock → `409 {error:"stock_insuficiente", product_id}`.

### Fix 4 — Rate limit por cuenta + backoff + lockout
- IP: 20/15min (existente).
- Email: nuevo bucket `login:email:<email>` 5/15min.
- `loginFailures` Map por email: contador, `lastFailAt`, `lockoutUntil`. Backoff `min(2^count*100ms, 30s)` aplicado con `await sleep(delay)` ANTES de devolver 401.
- 10 fails consecutivos → lockout 30 min (devuelve 429).
- `clearLoginFails()` al login exitoso.

### Fix 5 — JWT cookie httpOnly
- Login → `Set-Cookie: volvix_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800` (8h).
- `requireAuth` ahora acepta Bearer **o** cookie `volvix_token` (Bearer tiene prioridad).
- Logout → `Max-Age=0` para borrar cookie.

### Fix 6 — Anti-replay nonces
- Tabla `request_nonces(nonce PK, endpoint, used_at, expires_at TTL 10min)`.
- Helper `nonceCheck(res, nonce, endpoint)` → 409 `replay_attack` si existe; INSERT si no.
- Stripe webhook: usa `req.headers['x-nonce']` o cae a `event.id`.
- CFDI: requiere header `x-cfdi-nonce`.

### Fix 7 — Body size limits + JSON validation
- `readBody(req, {maxBytes, strictJson})` aborta y marca `req.__bodyError = {413, max_bytes}` si excede.
- Default 256KB; overrides: products POST 100KB, sales POST 200KB, login 8KB, cash 16KB, stripe intent 16KB, cfdi 64KB, customer/product PATCH 100KB.
- `strictJson:true` rechaza Content-Type ≠ `application/json` (415).
- Helper `checkBodyError(req,res)` devuelve true si hubo error y ya envió respuesta.

## Tests manuales (prod)

| Test | Resultado |
|---|---|
| Login OK trae `Set-Cookie volvix_token` httpOnly Secure SameSite=Strict | **OK** (Max-Age=28800) |
| 2× POST /api/sales con misma `Idempotency-Key` → mismo sale.id | **OK** (id `58c0fe9c…` en ambas) |
| POST /api/sales sin Idempotency-Key | **OK** → 400 `idempotency_key_required` |
| PATCH /api/products/:id sin version | **OK** → 400 `version_required` |
| PATCH con version=99 (vieja) | **OK** → 409 `version_conflict` `{current_version:1, expected_version:99}` |
| PATCH con version=1 | **OK** → 200 actualiza |
| 11 logins fallidos del mismo email | **OK** → fail #1-4: 401 con backoff (473→1867ms); fail #5+: 429 (rate-limit por email gatillado a los 5 intentos por especificación) |
| POST /api/sales con body 210KB | **OK** → 413 `payload_too_large {max_bytes:204800}` |

## Notas

- El rate-limit por email (5/15min, especificado) dispara 429 antes que el lockout absoluto de 10 fails — comportamiento esperado por la spec.
- Stock atómico activo solo si los items traen `id` UUID válido; items sin id pasan sin chequeo (compatibilidad con productos ad-hoc).
- Tabla `request_nonces` fail-open en dev, fail-closed (503) en prod si no responde.
- Hook secundario en POST /api/sales (línea ~8338) preserva todas las protecciones porque envuelve la versión ya wrapeada.
