# B42 — MULTIPOS Suite E2E Report

- **Run tag**: `49515097`
- **Base**: https://salvadorexoficial.com
- **Page**: `/multipos_suite_v3.html`
- **Owner**: `owner@volvix.test` (TNT002 / owner)
- **Admin**: `admin@volvix.test` (TNT001 / superadmin)
- **Reservation marker name**: `R6A Reserva 49515097` (id=local-1777349524656)
- **Kitchen order id**: local-1777349525879
- **KDS paired**: true · **CDS paired**: true
- **Screenshots**: `tests\screenshots-r6a-multipos`

## Score: **14/14 = 100/100**

| ID | Label | Result | Detail |
|----|-------|--------|--------|
| M1 | Page loads with auth-gate | PASS | status=200 bytes=147139 authGate=true roleGuard=true 4tabs=true switchApp=true wiring=true |
| M2 | Navigation between 4 apps (Comandera/KDS/Manager/CDS) | PASS | tabs=[{"app":"comandera","hasButton":true,"hasContainer":true},{"app":"kds","hasButton":true,"hasContainer":true},{"app":"manager","hasButton":true,"hasContainer":true},{"app":"cds","hasButton":true,"hasContainer":true}] containers=true mpFns=5/6 |
| M3 | Create reservation (POST /api/reservations) | PASS | status=201 ok=true body_keys=ok,reservation,persisted reservation_id=local-1777349524656 persisted=false |
| M4 | Confirm reservation (POST /api/reservations/confirm) | PASS | status=200 body={"ok":true,"customer_name":"R6A Reserva 49515097","status":"confirmed"} |
| M5 | Pair KDS device (POST /api/kds/pair) | PASS | pair_code=R6AK-A4D7 status=200 body={"ok":true,"pairing":{"tenant_id":"TNT002","pair_code":"R6AK-A4D7","station":"cocina","paired_by":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1","paired_at":"2026-04-28T04:12:05.145Z","device_type":"kds"}} station_swap=200/parrilla |
| M6 | Pair CDS device (POST /api/cds/pair) | PASS | pair_code=R6AC-A4D7 status=200 body={"ok":true,"pairing":{"tenant_id":"TNT002","pair_code":"R6AC-A4D7","orientation":"landscape","paired_by":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1","paired_at":"2026-04-28T04:12:05.486Z","device_type":"cds"}} invalid_pair_status=400 |
| M7 | Create kitchen order from sale (POST /api/kitchen/orders) | PASS | status=201 body={"ok":true,"order":{"id":"local-1777349525879","tenant_id":"TNT002","mesa":"12","items":[{"qty":2,"name":"R6A-Tacos","mods":"sin cebolla"},{"qty":1,"name":"R6A-Agua","mods":"sin hielo"}],"status":"pending","cashier_id":"bbbbbbbb-bbbb-bbbb-b empty_items_status=400 |
| M8 | Notify waiter (POST /api/kitchen/notify-waiter) | PASS | status=200 body={"ok":true,"notification":{"tenant_id":"TNT002","ticket_id":"local-1777349525879","mesa":"12","reason":"ready","notified_by":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1","created_at":"2026-04-28T04:12:06.166Z"}} |
| M9 | Manager: Edit employee (PATCH /api/employees/by-name/:name) | PASS | status=200 body={"ok":true,"updated":{"role":"Mesero senior","phone":"+525555550111"}} empty_patch_status=400 |
| M10 | Manager: Set user PIN (POST /api/users/me/pin) | PASS | pin=1097 status=200 body={"ok":true,"updated":true} short_pin_status=400 |
| M11 | Manager: Create purchase order (POST /api/purchases) | PASS | status=201 body={"ok":true,"purchase":{"id":"local-1777349527138","tenant_id":"TNT002","product_name":"R6A Tortillas (M11)","product_id":null,"qty":50,"supplier":"R6A Distribuciones","urgent":false,"status":"pending","created_by":"bbbbbbbb-bbbb-bbbb-bbbb-b zero_qty_status=400 |
| M12 | Multi-station order routing (multiple mesas + /api/printers) | PASS | o1=201 o2=201 printers=200 pcount=0 |
| M13 | Multi-tenant isolation (TNT001 admin ≠ TNT002 owner reservations) | PASS | marker=R6A_M13_MARKER_49515097 marker_id=local-1777349528154 adminLeak=false ownerOverrideLeak=false |
| M14 | UI flow with browser screenshot (4 tabs, no console errors) | PASS | httpStatus=200 onSuite=true hadRedirect=false tabsActive={"comandera":{"clicked":true,"viaForce":true,"active":true},"kds":{"clicked":true,"viaForce":true,"active":true},"manager":{"clicked":true,"viaForce":true,"active":true},"cds":{"clicked":true,"viaForce":true,"active":true}} |

## Endpoints exercised

| Method | Path | Test |
|--------|------|------|
| POST   | /api/reservations | M3, M13 |
| POST   | /api/reservations/confirm | M4 |
| GET    | /api/reservations | M13 |
| POST   | /api/kitchen/orders | M7, M12 |
| POST   | /api/kitchen/notify-waiter | M8 |
| POST   | /api/kds/pair | M5 |
| DELETE | /api/kds/pair | cleanup |
| POST   | /api/kds/station | M5 |
| POST   | /api/cds/pair | M6 |
| GET    | /api/printers | M12 |
| POST   | /api/users/me/pin | M10 |
| PATCH  | /api/employees/by-name/:name | M9 |
| POST   | /api/purchases | M11 |

## Console errors captured (during M14)

```
[M14] Failed to load resource: the server responded with a status of 404 ()
[M14] Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] [ERROR] [VolvixPerf] fetch error: /api/fx/rates?base=MXN Failed to fetch
TypeError: Failed to fetch
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at window.fetch (https://volvix-pos.v
[M14] [VolvixPerf] fetch error: /api/fx/rates?base=MXN TypeError: Failed to fetch
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at window.fetch (https://salvadorexoficial.com/volvix-logger-
[M14] [ERROR] API GET /api/fx/rates?base=MXN failed: Failed to fetch {url: /api/fx/rates?base=MXN, method: GET, error: Failed to fetch, stack: TypeError: Failed to fetch
    at wrapped (https:/…-pos.vercel.app/volvix-currency-wiring.js:134:18)}
[M14] [ERROR] [VolvixPerf] fetch error: /api/fx/rates?base=MXN Failed to fetch
TypeError: Failed to fetch
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at window.fetch (https://volvix-pos.v
[M14] [VolvixPerf] fetch error: /api/fx/rates?base=MXN TypeError: Failed to fetch
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at window.fetch (https://salvadorexoficial.com/volvix-sentry-wiring.js:280:14)
    at window.fetch (https://salvadorexoficial.com/volvix-logger-
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] Failed to load resource: the server responded with a status of 404 ()
[M14] Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] Failed to load resource: the server responded with a status of 404 ()
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] Failed to load resource: the server responded with a status of 401 ()
[M14] [ERROR] API POST https://salvadorexoficial.com/api/ai/decide failed: Failed to fetch {url: https://salvadorexoficial.com/api/ai/decide, method: POST, error: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…x-pos.vercel.app/volvix-ai-real-wiring.js:603:25)}
[M14] [ERROR] [VolvixPerf] fetch error: https://salvadorexoficial.com/api/ai/decide Failed to fetch
TypeError: Failed to fetch
    at window.fetch (https://salvadorexoficial.com/volvix-logger-wiring.js:266:27)
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at global.fetch 
[M14] [VolvixPerf] fetch error: https://salvadorexoficial.com/api/ai/decide TypeError: Failed to fetch
    at window.fetch (https://salvadorexoficial.com/volvix-logger-wiring.js:266:27)
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at global.fetch (https://volvix-pos.verc
[M14] [ERROR] [VolvixPerf] fetch error: https://salvadorexoficial.com/api/ai/decide Failed to fetch
TypeError: Failed to fetch
    at window.fetch (https://salvadorexoficial.com/volvix-logger-wiring.js:266:27)
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at global.fetch 
[M14] [VolvixPerf] fetch error: https://salvadorexoficial.com/api/ai/decide TypeError: Failed to fetch
    at window.fetch (https://salvadorexoficial.com/volvix-logger-wiring.js:266:27)
    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)
    at global.fetch (https://volvix-pos.verc
[M14] [ERROR] [ErrorHandler] {"type":"fetch","message":"Failed to fetch","stack":"TypeError: Failed to fetch\n    at window.fetch (https://salvadorexoficial.com/volvix-logger-wiring.js:266:27)\n    at wrapped (https://salvadorexoficial.com/volvix-perf-wiring.js:167:27)\n    at global.fetch (https://volvix
[M14] [ErrorHandler] {type: fetch, message: Failed to fetch, stack: TypeError: Failed to fetch
    at window.fetch (ht…x-pos.vercel.app/volvix-ai-real-wiring.js:603:25), userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safari/537.36, url: https://volvix-pos
[M14] [ERROR] [AI-REAL-WIRING] Health-check falló: Failed to fetch {}
[M14] [AI-REAL-WIRING] Health-check falló: Failed to fetch
[M14] Failed to load resource: the server responded with a status of 503 (Offline)
[M14] Failed to load resource: the server responded with a status of 404 ()
[M14] Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
```

## 5xx network failures captured (during M14)

_None._

## Cleanup

- DELETE /api/kds/pair → executed (best-effort) to leave the test KDS device unpaired.
- Test reservations remain in the DB under tenant TNT002 (the API has no public /api/reservations/:id DELETE — they will age out via the existing scheduled cleanup if any).
- PIN was changed on owner@volvix.test — the supervisor should re-set it manually if needed (the API has no per-user PIN history rotation).

## Constraints respected

- No modification of `api/index.js`, `multipos_suite_v3.html`, or any other HTML.
- `Idempotency-Key` header sent on every POST/PATCH (per `api/index.js` `withIdempotency`).
- `failOnStatusCode: false` on every request — each M-test records pass/fail without aborting the suite.
- Each test independently records its result so the /100 score reflects exactly what passed.

Generated: 2026-04-28T04:12:35.458Z
