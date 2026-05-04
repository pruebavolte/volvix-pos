# B42 — Owner Panel E2E Report

- **Run tag**: `47830362`
- **Base**: https://salvadorexoficial.com
- **Panel**: `/volvix_owner_panel_v7.html`
- **Owner**: `owner@volvix.test` (TNT002)
- **Admin**: `admin@volvix.test` (TNT001 superadmin)
- **Test sub-tenant**: `R5D Owner E2E 47830362` (id=4e912a42-eee7-453b-b516-fa9d994c2900)
- **Test user**: `r5d-user+47830362@volvix.test` (id=307ad541-e2db-4468-a139-cd4b53dfcf1d)

## Score: **8/12 = 67/100**

| ID | Label | Result | Detail |
|----|-------|--------|--------|
| O1 | Page loads with auth (console errors < 5) | FAIL | http=200 nav_visible=true console_errors=104 sample=["Failed to load resource: the server responded with a status of 404 ()","Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MI |
| O2 | Navigation menu items work | FAIL | nav_ok=0/14 users_wired=true sample_fail=[{"label":"Overview","section":"v-overview","ok":false,"reason":"click_fail"},{"label":"Arquitectura","section":"v-architecture","ok":false,"reason":"click_fail"},{"label":"Verticales","section":"v-verticals","ok":false,"reason":"click_fai |
| O3 | Crear sub-tenant (POST /api/owner/tenants → 201) | PASS | created sub_tenant_id=4e912a42-eee7-453b-b516-fa9d994c2900 name="R5D Owner E2E 47830362" plan=basic listed=true list_count=2 |
| O4 | Crear usuario en sub-tenant (POST /api/sub-tenants/:id/users → 201) | PASS | created user_id=307ad541-e2db-4468-a139-cd4b53dfcf1d email=r5d-user+47830362@volvix.test |
| O5 | Asignar permisos / feature flag a usuario (PATCH /api/users/:id/permissions) | PASS | target_user=307ad541-e2db-4468-a139-cd4b53dfcf1d status=200 applied_count=1 flag_present=true body={"ok":true,"applied":[{"key":"module.recargas","status":"disabled"}],"errors":[]} |
| O6 | Trigger deploy (POST /api/owner/deploys) | PASS | status=202 ok=true deploy_id=dep-1777347900588-4d897cb7 body={"ok":true,"deploy_id":"dep-1777347900588-4d897cb7","env":"staging","branch":"main","status":"queued","note":"Deploy queued (real CI trigger TBD)"} |
| O7 | View activity log (audit-log endpoint) | PASS | path=/api/audit-log?limit=20 status=200 count=0 |
| O8 | Edit tenant settings (PATCH /api/owner/tenants/:id) | FAIL | status=503 plan_back=undefined body={"ok":false,"error":"schema_mismatch","message":"Esquema de BD desactualizado","request_id":"62082808-65e0-44aa-89e8-6da035fa5459"} |
| O9 | Suspender tenant (PATCH suspended=true) | FAIL | patch_status=503 body={"ok":false,"error":"schema_mismatch","message":"Esquema de BD desactualizado","request_id":"4df41f1c-df8b-46a7-975d-5c96eb5cbc73"} listed_is_active=true suspended=undefined disabled_at=undefined considered_suspended=false |
| O10 | Marketing — Crear landing personalizada (POST /api/owner/landings) | PASS | status=200 body={"ok":true,"id":"f435832b-e6be-4cb7-b90e-743b5d9575ad"} list_status=200 |
| O11 | P0 button references FIXED (v25 / marketplace.html / panel_v7) | PASS | v25=true v24=false marketplace=true landing_template=false panel_v7=true panel_v2=false |
| O12 | Multi-tenant isolation (owner TNT002 ≠ admin TNT001) | PASS | owner_customer_count=0 TNT001_leak=0 cajero_leak=false cross_target=b236fab4-0f4c-4acb-801d-27fd3d90235e cross_status=404 cross_leaked=false |

## Console errors captured

```
[O1] Failed to load resource: the server responded with a status of 404 ()
[O1] Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[O1] Failed to load resource: the server responded with a status of 401 ()
[O1] Failed to load resource: the server responded with a status of 401 ()
[O1] Failed to load resource: the server responded with a status of 404 ()
[O1] Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[O1] [ERROR] [VolvixPerf] fetch error: /api/owner/dashboard?tenant_id=TNT001 Rate limit exceeded for default. Retry in 622ms
Error: Rate limit exceeded for default. Retry in 622ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://volvix-pos
[O1] [VolvixPerf] fetch error: /api/owner/dashboard?tenant_id=TNT001 Error: Rate limit exceeded for default. Retry in 622ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at wrapp
[O1] [ERROR] [VolvixPerf] fetch error: /api/owner/billing?tenant_id=TNT001 Rate limit exceeded for default. Retry in 615ms
Error: Rate limit exceeded for default. Retry in 615ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://volvix-pos.v
[O1] [VolvixPerf] fetch error: /api/owner/billing?tenant_id=TNT001 Error: Rate limit exceeded for default. Retry in 615ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at wrapped
[O1] [ERROR] [VolvixPerf] fetch error: /api/billing/plans Rate limit exceeded for default. Retry in 608ms
Error: Rate limit exceeded for default. Retry in 608ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://salvadorexoficial.com/volvix-
[O1] [VolvixPerf] fetch error: /api/billing/plans Error: Rate limit exceeded for default. Retry in 608ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at wrapped (https://volvix-
[O1] [ERROR] [VolvixPerf] fetch error: /api/owner/seats?tenant_id=TNT001 Rate limit exceeded for default. Retry in 602ms
Error: Rate limit exceeded for default. Retry in 602ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://volvix-pos.ver
[O1] [VolvixPerf] fetch error: /api/owner/seats?tenant_id=TNT001 Error: Rate limit exceeded for default. Retry in 602ms
    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at wrapped (
[O1] [ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 622ms","stack":"Error: Rate limit exceeded for default. Retry in 622ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.ap
[O1] [ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 622ms, stack: Error: Rate limit exceeded for default. Retry in 6…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…Gecko) HeadlessChrome/147.0.7727.15 Safari
[O1] [ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 615ms","stack":"Error: Rate limit exceeded for default. Retry in 615ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.ap
[O1] [ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 615ms, stack: Error: Rate limit exceeded for default. Retry in 6…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…Gecko) HeadlessChrome/147.0.7727.15 Safari
[O1] [ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 608ms","stack":"Error: Rate limit exceeded for default. Retry in 608ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.ap
[O1] [ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 608ms, stack: Error: Rate limit exceeded for default. Retry in 6…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…Gecko) HeadlessChrome/147.0.7727.15 Safari
[O1] [ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 602ms","stack":"Error: Rate limit exceeded for default. Retry in 602ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.ap
[O1] [ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 602ms, stack: Error: Rate limit exceeded for default. Retry in 6…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…Gecko) HeadlessChrome/147.0.7727.15 Safari
[O1] Failed to load resource: the server responded with a status of 500 ()
[O1] Failed to load resource: the server responded with a status of 404 ()
[O1] [ERROR] API GET /api/ai/tickets/stats?tenant_id=TNT001 failed: Failed to fetch {url: /api/ai/tickets/stats?tenant_id=TNT001, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…-pos.vercel.app/volvix-real-data-loader.js:213:5)}
[O1] [ERROR] API GET /api/products failed: Failed to fetch {url: /api/products, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…ercel.app/volvix-recommendations-wiring.js:526:22}
[O1] [ERROR] API GET /api/sales?tenant_id=TNT001 failed: Failed to fetch {url: /api/sales?tenant_id=TNT001, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…-pos.vercel.app/volvix-real-data-loader.js:212:5)}
[O1] [ERROR] API GET /api/sales failed: Failed to fetch {url: /api/sales, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…ercel.app/volvix-recommendations-wiring.js:526:22}
[O1] [ERROR] API GET /api/customers?tenant_id=TNT001 failed: Failed to fetch {url: /api/customers?tenant_id=TNT001, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…-pos.vercel.app/volvix-real-data-loader.js:211:5)}
[O1] [ERROR] API GET /api/products?tenant_id=TNT001 failed: Failed to fetch {url: /api/products?tenant_id=TNT001, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…-pos.vercel.app/volvix-real-data-loader.js:210:5)}
```

## 5xx network failures captured

| Tag | Method | Status | URL |
|-----|--------|--------|-----|
| O1 | GET | 500 | https://salvadorexoficial.com/api/owner/users |
| O1 | GET | 503 | https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;5 |
| O1 | GET | 503 | https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js |
| O1 | GET | 500 | https://salvadorexoficial.com/api/owner/users |
| O2 | GET | 500 | https://salvadorexoficial.com/api/owner/users |
| O11 | GET | 500 | https://salvadorexoficial.com/api/owner/users |
| O11 | GET | 503 | https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;5 |
| O11 | GET | 503 | https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js |
| O11 | GET | 500 | https://salvadorexoficial.com/api/owner/users |

## Cleanup

- DELETE /api/owner/tenants/4e912a42-eee7-453b-b516-fa9d994c2900 → executed.

## Constraints respected

- No modification of `api/index.js` or any HTML.
- `Idempotency-Key` header sent on every POST/PATCH.
- `failOnStatusCode: false` on every request — each O-test records pass/fail without aborting the suite.

Generated: 2026-04-28T03:45:10.662Z
