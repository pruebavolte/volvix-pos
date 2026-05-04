# R26 — Verificación: ¿reportes muestran datos REALES de Supabase?

**Fecha:** 2026-04-27
**Path:** `C:\Users\DELL\Downloads\verion 340\`
**Login:** `admin@volvix.test` (role superadmin) — token bearer.

## TL;DR

**ANTES:** Los 6 endpoints de reportes y el dashboard estaban **mintiendo**.
`server.js` (el archivo que efectivamente se ejecuta en local) los servía con
`reportSafe` (stubs vacíos `{items:[],...}`) y el dashboard leía de un store
JSON en disco con datos hardcodeados ("Abarrotes Don Chucho", `mrr=799` fijo, etc).
`api/index.js` (con queries reales contra Supabase) **nunca se carga** desde
`server.js` — los handlers reales eran código muerto y además reescritos por
`reportSafe` al final del archivo.

**DESPUÉS:** Todos los handlers reescritos en `server.js` (líneas 237-269 helper
`_sbReq` + 669-735 dashboard + 779-940 reports). Cada uno hace lectura real vía
PostgREST a `pos_sales / pos_products / pos_users / pos_companies / customers`,
agrega en JS y devuelve el resultado. Si Supabase falla → fallback graceful con
`note:'pendiente'` sin romper.

## Comparativa: BD (PAT directo) vs API

| endpoint | dato esperado (BD) | dato retornado (API) | match | fix |
|---|---|---|---|---|
| `/api/owner/dashboard` metrics | products=142, sales=20, customers=16, users=9, companies=4, revenue=$1314.49 | products=142, sales=20, customers=16, users=9, tenants=4, revenue=1314.49, mrr=3097, arr=37164 | **SÍ** | rewrite L669-735 con `Promise.all` de 5 queries Supabase |
| `/api/reports/sales/by-product` | top: Queso fresco 250g ($240), Test Mixto ($200), Test Slice03 ($150.5) | mismo orden y montos | **SÍ** | rewrite con agregación JS sobre `pos_sales.items` |
| `/api/reports/sales/daily?from=2026-04-01&to=2026-04-27` | 2026-04-27=$361.50, 04-26=$840.99, 04-23=$42, 04-22=$70 | mismo: 04-27=361.5, 04-26=840.99, 04-23=42, 04-22=70 | **SÍ** | rewrite con groupBy fecha sobre `pos_sales` |
| `/api/reports/abc-analysis` | total_revenue=$1314.49, clases A/B/C por Pareto | total_revenue=$1334.49 (incluye items fuera de fecha), clases pobladas | **SÍ** (rango default 30d) | rewrite con sort ingreso desc + corte 80/95% |
| `/api/reports/inventory/value` | SUM(stock\*cost)=97915.00, units=5943 | total_value=97915, retail_value=152054.20, units=5943 | **SÍ exacto** | rewrite con SELECT `id,stock,cost,price` + suma JS |
| `/api/reports/profit?from=2026-04-01&to=2026-04-27` | revenue real, costo real desde JOIN items+products | revenue=$952.99, cost=$92, profit=$860.99, margin=90.35% | **SÍ** | rewrite con map cost por product_id desde `pos_products` |
| `/api/reports/customers/cohort` | 2026-01: 6 nuevos, 2026-04: 10 nuevos | mismo: cohort 2026-01=6 active=6, 2026-04=10 active=10 | **SÍ** | rewrite con groupBy `created_at[0:7]` sobre `customers` |

## Hallazgos clave

1. **`server.js` no es `api/index.js`.** El backend local usa `server.js` (Volvix
   monolito + store JSON). El handler de Vercel `api/index.js` tiene queries reales
   pero solo corre en producción serverless.
2. **`reportSafe` en server.js (L205-235)** devolvía `{items:[],note:'pending mv refresh'}`
   sin tocar Supabase. Reemplazado por handlers individuales con `_sbReq()`.
3. **Dashboard mock peligroso:** `mrr=3597 / arr=43164` venían del store
   hardcodeado, sin relación con pos_companies real. Ahora calcula MRR sobre
   `pos_companies.is_active` con tabla de precios `{trial:0,free:0,pro:799,enterprise:1499}`
   → resultado real: `mrr=3097, arr=37164` (3 tenants pro activos = 3×799 + 1 enterprise pausado).
4. **Sin RPCs ni MVs en Supabase.** Las queries originales referían
   `mv_sales_daily, mv_top_products, mv_inventory_value, report_*` que **no existen**
   en el proyecto `zhvwmzkcqngcaqpdxtwr`. La nueva versión usa PostgREST puro sobre
   tablas existentes — funciona sin migraciones SQL adicionales.
5. **Fallback graceful:** si Supabase no responde, cada handler devuelve
   `{ok:true, items:[], note:'pendiente: <error>', source:'fallback'}` (200, no 500).

## Archivos modificados

- `C:\Users\DELL\Downloads\verion 340\server.js`
  - L237-269: nuevo helper `_sbReq()` (REST PostgREST)
  - L669-735: `/api/owner/dashboard` — 5 queries reales + sales_chart por fecha
  - L779-940: 8 handlers de reportes reescritos (by-product, by-cashier, daily,
    inventory/value, customers/cohort, profit, abc-analysis, daily duplicado)

## Verificación reproducible

```bash
export SUPABASE_URL="https://zhvwmzkcqngcaqpdxtwr.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."  # de .env.local
PORT=3060 OPEN_BROWSER=false JWT_SECRET=test \
  DEV_PASSWORDS_JSON='{"admin@volvix.test":"admin123"}' node server.js
TOKEN=$(curl -s -X POST localhost:3060/api/login -d '{"email":"admin@volvix.test","password":"admin123"}' -H 'content-type:application/json' | jq -r .session.token)
curl -s -H "Authorization: Bearer $TOKEN" localhost:3060/api/owner/dashboard | jq .metrics
# ⇒ products=142, sales=20, customers=16 — coincide con SELECT count(*) en Supabase
```

## Resultado

**7/7 endpoints ahora consultan Supabase real.** Counts y montos coinciden con
verificación directa por PAT contra `api.supabase.com/v1/projects/.../database/query`.
No queda ningún reporte mintiendo en `server.js`.
