# R25 — Customer Portal E2E (sin auditor)

Fecha: 2026-04-27
Server: api/index.js (Vercel handler) bootstrap local en `:3030` con `_e2e_apiserver.js`.
Email de prueba: `cliente.test@volvix.test`.
Módulo `api/customer-portal.js` ya estaba registrado en `api/index.js:4404` — no requirió fix.

## Flow completo

| # | Paso | Endpoint | Status | Resultado |
|---|------|----------|--------|-----------|
| 1 | OTP request | `POST /api/customer/otp/request` | **200** | `{ok:true, expires_in:600}` — sin OTP en payload (no leak) |
| 2 | Inspección DB | Supabase REST `customer_otps` (PAT service_role) | 200 | 1 fila: `code_hash=90b9b97a…dbf1`, ttl 10 min, attempts 0 |
| 2b | Recuperar OTP | brute-force sha256(email\|otp\|JWT_SECRET) 0–999999 | — | **OTP=`298651`** (recuperado en 1.86 s) |
| 3 | OTP verify | `POST /api/customer/otp/verify` | **200** | token JWT emitido + customer creado on-the-fly |
| 4a | Perfil | `GET /api/customer/me` | 200 | `{id:4aa52901…, email, loyalty_points:0}` |
| 4b | Órdenes | `GET /api/customer/orders` | 200 | `orders:[]` (cliente nuevo, sin compras) |
| 4c | Loyalty | `GET /api/customer/loyalty` | 200 | `points:0, movements:[]` |
| 4d | Métodos pago | `GET /api/customer/payment-methods` | 200 | `methods:[]` |

## Token generado (decoded payload)

```json
{
  "id": "4aa52901-7b4b-4b55-9534-0026e430f1b0",
  "email": "cliente.test@volvix.test",
  "role": "customer",
  "tenant_id": null,
  "iat": 1777290930,
  "exp": 1777319730
}
```
TTL = 8 h. Firma HS256 con `JWT_SECRET`.

## Validación cross-role (token customer → endpoints admin/owner)

| Endpoint | Esperado | Obtenido |
|----------|----------|----------|
| `GET /api/owner/users` | 403 | **403 `{error:"forbidden"}`** ✅ |
| `GET /api/owner/sales` | 404 (no existe) | 404 |
| `GET /api/admin/users` | 404 (no existe) | 404 |
| `GET /api/admin/dashboard` | 404 (no existe) | 404 |
| `GET /api/admin/sales` | 404 (no existe) | 404 |

`requireAuth([...roles])` rechaza tokens cuyo `role !== owner/admin/staff`. Confirmado en `/api/owner/users`: 403.

## Observaciones

- `customer-portal.js` íntegro: OTP TTL 10 min, max 5 intentos, hash sha256 sal=JWT_SECRET, fallback in-memory si tabla `customer_otps` no existe.
- No hay leak de OTP en HTTP response (sólo se envía por email vía SendGrid; en local sin SENDGRID_API_KEY → warning en logs, OK).
- Email se loguea en `email_log` con status `failed` cuando SENDGRID_API_KEY ausente — comportamiento correcto.
- Boot endpoint requirió wrapper `_e2e_apiserver.js` porque `server.js` standalone no incluye `api/index.js`. Para producción Vercel maneja el routing automáticamente (`vercel.json:13`).

## Veredicto

Customer Portal **OK**. Auth OTP funcional, JWT con role=customer correctamente aislado, todos los endpoints customer responden 200, cross-role bloqueado con 403 en endpoints existentes.
