# R19 — Final Smoke Test (Post-SQL Apply + Redeploy)

**Fecha**: 2026-04-26
**Deploy**: `volvix-hnuqelr90-grupo-volvixs-projects.vercel.app` (prod)
**Token**: superadmin / TNT001 / plan=pro

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Endpoints probados | 43 |
| **Pass (2xx)** | **23 (53.5%)** |
| Fail 4xx | 7 (16.3%) |
| Fail 5xx | 13 (30.2%) |
| p50 latencia | 418 ms |
| p95 latencia | 738 ms |
| **Score final estimado** | **53/100** |

## Tabla de resultados

| # | Endpoint | Status | Latencia (ms) | Ronda |
|---|---|---|---|---|
| 1 | /api/health | 200 | 812 | core |
| 2 | /api/login | 200 | 642 | core |
| 3 | /api/products | 200 | 544 | core |
| 4 | /api/sales | 200 | 590 | core |
| 5 | /api/customers | 200 | 479 | core |
| 6 | /api/cash/current | **500** | 738 | R14 |
| 7 | /api/cash/history | **500** | 436 | R14 |
| 8 | /api/loyalty/customers/:id | 200 | 563 | R15 |
| 9 | /api/loyalty/tiers | 200 | 967 | R15 |
| 10 | /api/billing/plans | 200 | 516 | R15 |
| 11 | /api/billing/subscription | 200 | 330 | R15 |
| 12 | /api/currencies | **500** | 429 | R16 |
| 13 | /api/fx/rates | **500** | 484 | R16 |
| 14 | /api/mfa/setup | 404 | 339 | R16 |
| 15 | /api/inventory/locations | 200 | 383 | R16 |
| 16 | /api/inventory/stock | 200 | 381 | R16 |
| 17 | /api/audit-log | 200 | 418 | R16 |
| 18 | /api/webhooks | 200 | 426 | R16 |
| 19 | /api/payments/wallets/config | 200 | 374 | R17 |
| 20 | /api/ml/inventory/forecast | 400 | 473 | R17 |
| 21 | /api/warehouses | **500** | 448 | R17 |
| 22 | /api/promotions | **500** | 430 | R17 |
| 23 | /api/appointments | 200 | 336 | R17 |
| 24 | /api/services | 200 | 327 | R17 |
| 25 | /api/reviews | 200 | 383 | R17 |
| 26 | /api/gift-cards | 200 | 397 | R17 |
| 27 | /api/tips/by-staff | 200 | 421 | R17 |
| 28 | /api/bundles | 200 | 323 | R17 |
| 29 | /api/segments | **500** | 481 | R17 |
| 30 | /api/fraud/alerts | 200 | 428 | R17 |
| 31 | /api/customer-subscriptions | **500** | 436 | R17 |
| 32 | /api/employees | 200 | 410 | R18 |
| 33 | /api/payroll/periods | 404 | 368 | R18 |
| 34 | /api/hr/attendance | **500** | 369 | R18 |
| 35 | /api/crm/leads | 200 | 432 | R18 |
| 36 | /api/marketplace/vendors | **500** | 388 | R18 |
| 37 | /api/integrations/square/status | 503 | 344 | R18 |
| 38 | /api/integrations/shopify/sync-orders | 404 | 348 | R18 |
| 39 | /api/admin/backup/list | 503 | 351 | R18 |
| 40 | /api/accounting/journal | 404 | 362 | R18 |
| 41 | /api/accounting/balance-sheet | 404 | 370 | R18 |
| 42 | /api/nft/collections | 404 | 309 | R18 |
| 43 | /api/kds/tickets/active | **500** | 316 | R18 |

## Pass/Fail por ronda

| Ronda | Pass | Fail | Total |
|---|---|---|---|
| Core (R0–R13) | 5 | 0 | 5 |
| R14 cash | 0 | 2 | 2 |
| R15 loyalty/billing | 4 | 0 | 4 |
| R16 fx/mfa/inv/audit | 4 | 3 | 7 |
| R17 wallets/ml/etc | 9 | 5 | 14 |
| R18 HR/crm/integ | 1 | 10 | 11 |

## Hallazgos clave

- **Cash module sigue 500**: SQL `cash_sessions`/`cash_movements` quizás no aplicado o policy RLS falta.
- **R16 FX (500)**: tablas `currencies` / `fx_rates` no creadas o vacías → endpoint truena.
- **R18 catastrófico**: 10/11 endpoints fallan; backup, accounting, NFT, KDS, square, shopify devuelven 404/503 → handlers ausentes en deploy o tablas faltantes.
- **404 = handler no desplegado**: mfa, payroll, shopify-sync, accounting/*, nft, integrations/* probablemente nunca se subieron a este build.
- **Latencia**: p50 418ms / p95 738ms — aceptable para edge functions cold.

## Próximos pasos sugeridos

1. Aplicar SQL de R14 (cash) y R16 (currencies/fx_rates) en Supabase.
2. Verificar que los handlers R18 estén en `/api/` del deploy actual (puede ser un build viejo).
3. Re-correr smoke tras fixes para subir score a >85.

**Score final R19**: **53/100** — bloqueante para ir a Live.
