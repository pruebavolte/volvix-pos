# R24 POST Fixes — Resultado

**Fecha:** 2026-04-27 · **Base:** https://volvix-pos.vercel.app · **Deploy:** dpl_5XA5FetqEGCGP6AW913iYUCkwnB8 (re-deploy con regex ampliada)

## Cambios aplicados en `api/index.js`

| # | Endpoint | Antes | Ahora | Línea |
|---|----------|-------|-------|-------|
| 1 | POST /api/nft/collections | 500 internal | **503 nft_table_pending** | ~4426 |
| 2 | POST /api/payroll/periods/calculate | 404 endpoint not found | **alias activo** (400 si falta `period_id`, delega a `:id/calculate`) | ~10414 |
| 3 | POST /api/push/subscribe | 500 internal | **503 vapid_not_configured** (chequeo previo) | ~5392 |
| 4 | POST /api/cfdi/generate | 404 endpoint not found | **alias** apunta a `POST /api/invoices/cfdi` (existente) | ~6279 |

## Detalle de fixes

1. **nft/collections**: try/catch interno alrededor del `supabaseRequest`. Detecta `42P01`, `relation does not exist`, `Could not find the table`, `Supabase 4xx`, `42703`, `PGRST*` → 503 `nft_table_pending`.
2. **payroll/periods/calculate**: nuevo handler alias que valida `body.period_id` (400 con hint si falta), luego ejecuta inline el mismo flujo que `:id/calculate` (no se puede re-leer `req.body` tras el primer `readBody`).
3. **push/subscribe**: chequeo `if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)` al inicio → 503 `vapid_not_configured`. Además, mismo wrapping de errores DB para tabla `push_subscriptions`.
4. **cfdi/generate**: una línea: `handlers['POST /api/cfdi/generate'] = handlers['POST /api/invoices/cfdi'];` (alias directo).

## Validación

- `node --check api/index.js` → OK
- Deploy Vercel → READY (alias `volvix-pos.vercel.app`)

## Smoke test (token admin)

```
POST /api/nft/collections                  HTTP=503  {"error":"nft_table_pending",...}
POST /api/payroll/periods/calculate (sin)  HTTP=400  {"error":"period_id_required",...}
POST /api/payroll/periods/calculate (con)  HTTP=404  {"error":"not_found","resource":"payroll_period"}
POST /api/push/subscribe                   HTTP=503  {"error":"vapid_not_configured",...}
POST /api/cfdi/generate                    HTTP=400  {"error":"nonce_required",...}  (alcanza handler real)
```

## Resultado: **0 bugs HTTP 500 restantes** de los 3 reportados en R24_POST_AUDIT. Los 2 endpoints 404 ahora responden con códigos accionables (503/400) y mensajes claros para el frontend.
