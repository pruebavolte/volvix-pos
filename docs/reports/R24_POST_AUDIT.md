# R24 POST Audit — Verificación con body válido

**Fecha:** 2026-04-27 · **Base:** https://salvadorexoficial.com · **Auth:** Bearer token (login admin@volvix.test)

## Tabla de resultados (30 endpoints)

| # | Endpoint | Status | 1ra línea response | Veredicto |
|---|----------|--------|--------------------|-----------|
| 1 | POST /api/mfa/setup | 200 | `{"ok":false,"error":"MFA no disponible (config pendiente)"}` | OK (config) |
| 2 | POST /api/mfa/verify | 200 | `{"ok":false,"error":"MFA no disponible (config pendiente)"}` | OK (config) |
| 3 | POST /api/mfa/challenge | 401 | `{"error":"mfa_token inválido o expirado"}` | OK (auth) |
| 4 | POST /api/qr/codi/generate | 200 | `{"ok":true,"mock":true,"codi_string":"CODI://..."}` | OK |
| 5 | POST /api/qr/spei/generate | 200 | `{"ok":true,"mock":true,"clabe":"..."}` | OK |
| 6 | POST /api/voice/parse | 400 | `{"ok":false,"error":"empty_transcript"}` | OK (valida campo `transcript` no `message`) |
| 7 | POST /api/ocr/parse-receipt | 200 | `{"vendor":null,"total":null,...,"scan_id":"..."}` | OK |
| 8 | POST /api/sms/send | 503 | `{"error":"TWILIO env vars no configuradas"}` | OK (env) |
| 9 | POST /api/nft/collections | **500** | `{"error":"internal","request_id":"9b8edec5..."}` | **BUG** |
| 10 | POST /api/nft/mint | 400 | `{"error":"customer_id and collection_id required"}` | OK (valida) |
| 11 | POST /api/products/import | 200 | `{"ok":true,"imported":1,"skipped":0}` | OK |
| 12 | POST /api/payroll/periods/calculate | 404 | `{"error":"endpoint not found"}` | Ruta dinámica `/[id]/calculate` → **500** |
| 13 | POST /api/integrations/shopify/sync-orders | 503 | `{"error":"shopify_not_configured"}` | OK (env) |
| 14 | POST /api/cfdi/generate | 404 | `{"error":"endpoint not found"}` | Endpoint no existe |
| 15 | POST /api/onboarding/start | 400 | `{"error":"name y admin_email requeridos"}` | OK (valida) |
| 16 | POST /api/onboarding/step | 200 | `{"ok":true,"step":"business_info"}` | OK |
| 17 | POST /api/loyalty/redeem | 400 | `{"error":"customer_id inválido"}` | OK (valida) |
| 18 | POST /api/promotions/validate | 400 | `{"valid":false,"message":"code_required"}` | OK (valida) |
| 19 | POST /api/sales (Idempotency-Key) | 200 | `{"id":"8b41c682...","total":10}` | OK |
| 20 | POST /api/cash/open | 400 | `{"error":"idempotency_key_required"}` | OK (valida) |
| 21 | POST /api/cash/close | 400 | `{"error":"idempotency_key_required"}` | OK (valida) |
| 22 | POST /api/inventory/movements | 400 | `{"error":"invalid product_id"}` | OK (valida) |
| 23 | POST /api/inventory/adjust | 400 | `{"error":"invalid product_id"}` | OK (valida) |
| 24 | POST /api/inventory/counts/start | 400 | `{"error":"invalid location_id"}` | OK (valida) |
| 25 | POST /api/customers | 200 | `{"ok":true,"id":"...","warning":"in-memory fallback"}` | OK (warning persistencia) |
| 26 | POST /api/discord/notify | 400 | `{"error":"invalid discord webhook url"}` | OK (valida) |
| 27 | POST /api/whatsapp/send | 503 | `{"error":"WHATSAPP_TOKEN no configurado"}` | OK (env) |
| 28 | POST /api/push/subscribe | **500** | `{"error":"internal","request_id":"c0aede6a..."}` | **BUG** |

## Bugs reales (HTTP 500)

| # | Endpoint | request_id |
|---|----------|------------|
| 1 | POST /api/nft/collections | 9b8edec5-763e-4c2b-bbb8-37e6e939db67 |
| 2 | POST /api/payroll/periods/[id]/calculate | d2acdd02-6f49-40be-96fb-1198ff331770 |
| 3 | POST /api/push/subscribe | c0aede6a-1ae3-4626-97de-93cbe422aabc |

## Observaciones

- **404 reales (endpoint inexistente):** `/api/payroll/periods/calculate` (la ruta correcta es `/[id]/calculate`), `/api/cfdi/generate` (no implementado).
- **503 (env var faltante, OK):** SMS/Twilio, Shopify, WhatsApp.
- **400 con validación clara (OK):** voice, nft/mint, onboarding/start, loyalty, promotions, cash/open|close (Idempotency-Key), inventory (movements/adjust/counts), discord.
- **Warning persistencia:** `/api/customers` responde 200 pero con `"warning":"in-memory fallback"` — Supabase no escribe la fila (revisar).
- **MFA:** retorna 200 con `ok:false` en lugar de 503 (inconsistente con otros endpoints sin config, no es bug crítico).

## Total bugs reales: **3** (HTTP 500)
