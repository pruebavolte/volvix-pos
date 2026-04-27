# R16 Final Smoke Test

**Base URL:** https://volvix-pos.vercel.app
**Auth:** admin@volvix.test (superadmin, JWT bearer)
**Date:** 2026-04-26
**Tester:** automated curl, no sleep

## Resultados

| #  | Endpoint                          | Esperado   | Real | Latencia (ms) | OK |
|----|-----------------------------------|------------|------|---------------|----|
| 1  | GET /api/health                   | 200        | 200  | 255           | OK |
| 2  | GET /api/health/deep              | 200        | 200  | 274           | OK |
| 3  | POST /api/login (token)           | 200        | 200  | 313           | OK |
| 4  | GET /api/products (bearer)        | 200        | 200  | 255           | OK |
| 5  | GET /api/customers (bearer)       | 200        | 200  | 256           | OK |
| 6  | GET /api/sales/latest (bearer)    | 200        | 200  | 362           | OK |
| 7  | GET /api/sales/today (bearer)     | 200        | 200  | 207           | OK |
| 8  | GET /api/cash/current (bearer)    | 200 / 404  | 500  | 392           | FAIL |
| 9  | GET /api/owner/dashboard (bearer) | 200        | 200  | 319           | OK |
| 10 | GET /api/openapi.yaml             | 200        | 200  | 231           | OK |
| 11 | GET /api/metrics (bearer)         | 200        | 200  | 253           | OK |
| 12 | GET /sitemap.xml                  | 200        | 200  | 210           | OK |
| 13 | GET /robots.txt                   | 200        | 200  | 332           | OK |
| 14 | GET /volvix-qa-scenarios.html     | 404        | 404  | 220           | OK |
| 15 | GET /api/products SIN auth        | 401        | 401  | 243           | OK |
| 16 | GET /api/debug                    | 404        | 401  | 211           | NEAR (route auth-gated) |
| 17 | GET /api/docs                     | 200        | 200  | 273           | OK |
| 18 | POST /api/sales (bearer, qty)     | 200 / 201  | 200  | 251           | OK (con `qty`, no `quantity`) |
| 19 | GET /api/inventory/stock (bearer) | 200        | 200  | 357           | OK |
| 20 | GET /api/billing/plans            | 200        | 200  | 295           | OK |

## Resumen

- **PASS:** 18 / 20 (90%)
- **FAIL:** 2 / 20
  - #8 `/api/cash/current` → 500 `internal` (probablemente tabla `cash_sessions` no creada en Supabase; bloquea hasta migrar `db/R14_CASH_SESSIONS.sql`)
  - #16 `/api/debug` → 401 en lugar de 404 (la ruta sí existe pero está protegida por auth, no es un endpoint inexistente)
- **Latencia media (PASS):** ~272 ms (rango 207-392 ms)

## Notas

- Todas las rutas críticas POS (login, products, customers, sales, owner dashboard, metrics, inventory) responden 200 con auth válida.
- `/api/sales` espera campo `qty` (no `quantity`) en items — se corrigió en la prueba.
- El smoke test inicial usó `password=$ADMIN_API_KEY` (incorrecto). Las credenciales válidas son `admin@volvix.test` / `Volvix2026!` definidas en `R16_smoke.sh`.
- Tarea 1 (auto-migrate Supabase) **bloqueada**: `.env.local` no contiene `POSTGRES_URL`/`DATABASE_URL`, no hay `psql` disponible, ni módulo `pg` instalado. Requiere ejecución manual de `db/R14_ALL_COMBINED.sql` en el SQL Editor de Supabase Dashboard.
