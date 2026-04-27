# R14 — Reporte de integración de handlers en `api/index.js`

Fecha: 2026-04-26
Archivo modificado: `C:\Users\DELL\Downloads\verion 340\api\index.js`
Validación: `node --check api/index.js` → **OK**

## Endpoints agregados

| # | Método | Ruta | Auth | Notas |
|---|--------|------|------|-------|
| 1 | POST | `/api/payments/stripe/intent` | requireAuth | Crea PaymentIntent en Stripe; persiste en `payments`. 503 si falta `STRIPE_SECRET_KEY`. |
| 2 | POST | `/api/payments/stripe/webhook` | sin auth (Stripe) | Verifica `Stripe-Signature` con HMAC-SHA256 + `timingSafeEqual`. Actualiza `payments.status`. 503 si falta `STRIPE_WEBHOOK_SECRET`. |
| 3 | GET  | `/api/payments/:id/status` | requireAuth | Acepta UUID (`payments.id`/`sale_id`) o `pi_xxx` (`provider_payment_id`). |
| 4 | GET  | `/api/loyalty/customers/:id` | requireAuth | Devuelve customer + tier + history. |
| 5 | POST | `/api/loyalty/redeem` | requireAuth (cualquier rol) | Valida saldo; inserta tx tipo `redeem`; PATCH `customers.loyalty_points`. |
| 6 | GET  | `/api/loyalty/tiers` | requireAuth | Filtra por `tenant_id` resuelto. |
| 7 | POST | `/api/loyalty/tiers` | admin/owner/superadmin | Crea tier nuevo. |
| 8 | POST | `/api/loyalty/adjust` | x-admin-key | 503 si falta `ADMIN_API_KEY`. |
| 9 | GET  | `/api/reports/sales/daily` | admin/owner/superadmin | Lee `mv_sales_daily`. |
| 10 | GET  | `/api/reports/sales/by-product` | admin/owner/superadmin | Lee `mv_top_products`; `top` 1..100. |
| 11 | GET  | `/api/reports/sales/by-cashier` | admin/owner/superadmin | RPC `report_sales_by_cashier`. |
| 12 | GET  | `/api/reports/inventory/value` | admin/owner/superadmin | Lee `mv_inventory_value`. |
| 13 | GET  | `/api/reports/customers/cohort` | admin/owner/superadmin | RPC `report_customers_cohort`. |
| 14 | GET  | `/api/reports/profit` | admin/owner/superadmin | RPC `report_profit`. |
| 15 | GET  | `/api/reports/abc-analysis` | admin/owner/superadmin | RPC `report_abc_analysis`. |
| 16 | POST | `/api/reports/refresh` | admin/owner/superadmin | RPC `refresh_all_reports`. |
| 17 | GET  | `/api/audit-log` | admin/owner/superadmin | Filtros: from, to, user_id, action, tenant_id, resource, limit (≤5000). |
| 18 | POST | `/api/gdpr/access` | público (token verify en fase 2) | Art.15. Fase 1: crea `volvix_gdpr_requests`. Fase 2: verifica token + RPC `gdpr_export_customer`. |
| 19 | POST | `/api/gdpr/erasure` | público | Art.17. Fase 2: RPC `gdpr_anonymize_customer`. |
| 20 | POST | `/api/gdpr/portability` | público | Art.20. Mismo export que acceso. |
| 21 | POST | `/api/invoices/cfdi` | admin/owner/superadmin | Mock en `NODE_ENV !== 'production'` con `crypto.randomUUID()`, sello SHA-256, `xml=<mock/>`. En prod 503 (PAC SOAP fuera de alcance). Validadores RFC/CP/régimen/uso espejo del front. |
| 22 | POST | `/api/invoices/cfdi/cancel` | admin/owner/superadmin | Motivos `01..04`; `01` exige `folio_sustitucion`. |
| 23 | GET  | `/api/invoices/cfdi/:uuid/status` | admin/owner/superadmin | Devuelve `estatus_local` y `estatus_sat` (null en mock). |
| 24 | GET  | `/api/config/public` | público | Retorna `{supabase_url, supabase_anon_key}` solo si la key tiene `role=anon`. 503 si falta o role≠anon. |

**Total: 24 endpoints nuevos.**

## Líneas insertadas

Bloque agregado entre el último handler preexistente (`...low-stock-alert`/`push notify`) y la sección `MAIN HANDLER`. Aproximadamente **520 líneas** (~líneas 3419–3960 del archivo final). El archivo cierra con tamaño estable ~3960+ líneas.

## Variables de entorno requeridas

| Var | Usada por | Comportamiento si falta |
|-----|-----------|-------------------------|
| `STRIPE_SECRET_KEY` | Stripe intent | 503 |
| `STRIPE_PUBLISHABLE_KEY` | Stripe intent (pasthrough al cliente) | retorna `null` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook | 503 |
| `ADMIN_API_KEY` | Loyalty adjust | 503 |
| `SUPABASE_ANON_KEY` | `/api/config/public` | 503 |
| `FINKOK_HOST` / `FINKOK_USER` / `FINKOK_PASS` / `CFDI_EMISOR_RFC` | CFDI en producción | 503 (mock funciona sin ellas en dev) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `JWT_SECRET` | base (ya existían) | throw al boot |

## Decisiones de implementación

- **Solo Node built-ins**: `https`, `crypto`, `url`. Cero dependencias npm añadidas.
- **STRIPE_SECRET_KEY** ya estaba declarado en el bloque de Subscriptions/Billing R14; se reutiliza (comentario en el código). `readRawBody`, `stripeApiCall` son nuevos para webhooks (cuerpo crudo).
- **Webhook Stripe**: parsea header `t=...,v1=...`, computa HMAC-SHA256 hex sobre `t.payload`, compara con `crypto.timingSafeEqual`. NO requiere auth (correcto: viene de Stripe).
- **CFDI mock** (NODE_ENV != 'production'): `crypto.randomUUID()`, sello = base64 SHA-256 de `uuid+total+rfc`, `xml='<mock/>'`, `estatus='vigente'`, `modo_test=true`. Persiste en `invoices` (best-effort, no bloquea respuesta). En producción retorna 503 hasta integrar SOAP real.
- **GDPR** flujo de 2 fases (request → email con verify_token TTL 60min → confirm). Token compara con `timingSafeEqual`. Ejecuta RPCs PostgreSQL `gdpr_export_customer` / `gdpr_anonymize_customer`.
- **Reports**: usa MVs (`mv_sales_daily`, `mv_top_products`, `mv_inventory_value`) vía REST y RPCs (`report_*`) vía POST `/rpc/...`. `tenant_id` resuelto desde JWT (admin puede override).
- **Realtime config**: parsea el JWT de `SUPABASE_ANON_KEY`, valida claim `role === 'anon'` en Node antes de devolverla. Defensa en profundidad para no leakear service_role por error.
- **ADMIN_API_KEY** se renombró localmente como `ADMIN_API_KEY_R14` para evitar colisión con futuras declaraciones del mismo nombre en otros bloques R14.

## Validación

```
$ node --check "C:/Users/DELL/Downloads/verion 340/api/index.js"
(sin output → OK)
```

## Pendiente / fuera de alcance

- SOAP real Finkok para CFDI en producción (timbrado, cancelación, consulta SAT).
- Generación de PDF para CFDI (`pdf_url` siempre `null`).
- Envío SMTP del email con el `verify_url` de GDPR (actualmente solo lo retorna en la respuesta de fase 1).
- RLS de tabla `payments`/`invoices`/`volvix_audit_log`/`volvix_gdpr_requests`: el código asume las tablas existen con los campos esperados (definidos en los SQL del repo).
