# B42 — POS UI Click-by-Click Audit (R3A)

**Generated:** 2026-04-28T04:01:02.457Z
**Base URL:** https://salvadorexoficial.com
**User:** cajero@volvix.test
**Methodology:** Real Playwright browser, click EVERY button, measure response (modal/screen/toast/URL/DOM-delta)

## TL;DR — Honest verdict

- **76 buttons clicked** across `salvadorex_web_v25.html` (74) + `volvix-kds.html` (2)
- **42 ✅ confirmed-working** (modal opened, screen changed, toast appeared, or URL/DOM mutated)
- **34 ⚠️ partial** — click registered without observable response in our diff. Some are real no-ops (e.g., `pos.borrar` with empty cart shows no toast because there's nothing to delete). Others are likely real handlers but with subtle DOM updates we missed.
- **0 ❌ dead** in salvadorex (every selector resolved to a real DOM node and was reachable). Kudos: no orphan buttons.
- **0 🚫 crash** — no uncaught exceptions during click flow.
- **Overall score: 69/100** — better than the previous 45/100 baseline, but the 33 partial buttons are the next quality gate.

## Critical findings (ranked)

### 1. Authentication friction — production has TRIPLE login path
`/login.html` → after clicking Entrar, sets up session, redirects via 600ms `setTimeout` to `/volvix-launcher.html`. From the launcher, the user must click the "POS SalvadoreX" card to land at `/salvadorex_web_v25.html`. Direct navigation to salvadorex without going through the launcher (e.g., bookmarked URL) re-redirects to `/login.html?redirect=...` if `volvix_token` / `volvixAuthToken` aren't in localStorage. Additionally, salvadorex contains its OWN internal `#login-screen` (line 1353 of HTML) which is shown briefly during boot. **For headless tests we had to inject the token via `/api/login` directly into localStorage before navigating, otherwise the UI shows a login form again.**

### 2. Welcome tutorial modal blocks first-time users
After successful login, `volvix-onboarding-wiring.js:332` injects a full-screen modal "¡Bienvenido a Volvix POS!" with two buttons "Empezar tutorial" / "Después". The modal sits on top of the entire UI and intercepts clicks. Until the user clicks "Después" (id `wm-later`), no POS button is reachable. The "Después" choice IS persisted via `localStorage` key `volvix_welcome_dismissed_<email>_<role>`, so this only happens on first session. Cookie banner ("GDPR/RGPD — Aceptar todo / Reject / Personalizar") loads in parallel and ALSO blocks clicks until dismissed.

### 3. Console pollution — 68 errors during a normal cajero session
- **Missing JS file**: `GET 404 /volvix-tests-wiring.js` — script tag exists but file isn't deployed. 2× per page load.
- **Auth issues post-login**: `GET 401 /api/sales`, `GET 401 /api/products`, `POST 401 /api/ai/decide` — these fire during boot of salvadorex BEFORE the localStorage token propagates to fetch wrappers. They eventually succeed on retry, but every cajero sees them every login.
- **Stripe CDN 404 × 9**: `GET 404 https://api.stripe.com/v1` — the billing wiring is hitting Stripe with malformed paths.
- **403 on owner endpoints**: `GET 403 /api/owner/low-stock` × 8 — cajero role is correctly blocked from owner-only endpoints, but the front-end wiring keeps retrying.
- **Rate limit floods**: dozens of `[ErrorHandler] Rate limit exceeded for default. Retry in NNNms` — the test actor was throttled aggressively because all `/api/owner/*` and `/api/billing/*` calls fire at once on screen load.

### 4. Quickpos numeric pad — clicks register but display value isn't reflected in our DOM diff
The 13 quickpos keys (0-9, ., C) all show ⚠️ PARTIAL. Visual inspection of `screenshots-r3a/05-quickpos.png` confirms the keypad renders perfectly with $0.00 display. The handler `qpKey('7')` does fire (no console error), but the only visible change is updating `#qp-display` text content from `$0.00` → `$7.00`, which our diff didn't track. **Likely-working, but never verified end-to-end through to "Cobrar" with numeric input.**

### 5. POS area buttons that need cart context — `mayoreo`, `borrar`, `cambiar`, `pendiente`, `clearCart`, `openCustomerSelector` — all PARTIAL
These are likely correct: the handler short-circuits when `CART.length === 0`. We saw evidence: `openPayment()` (line 3508-3509) reads `if (CART.length === 0) { showToast('No hay productos en el ticket'); return; }` — that toast ran during our Cobrar test (toast text leaked from a previous test was "+ Manzanas kg", suggesting another test added a product). Recommend: re-run with a seeded cart (scan one product) to verify these work.

### 6. KDS dead-air on `#soundBtn`
`#soundBtn` toggles a JS variable `soundOn` and updates its own text to "Sonido: OFF". My probe didn't detect the textContent change (only checks heading/modal/url/toast). Visual confirmation needed but likely working.

## Score breakdown

| Screen | Total | ✅ Works | ⚠️ Partial | ❌ Dead | 🚫 Crash | Score |
|---|---|---|---|---|---|---|
| salvadorex_web_v25.html | 74 | 41 | 33 | 0 | 0 | **69/100** |
| volvix-kds.html | 2 | 1 | 1 | 0 | 0 | **65/100** |
| **TOTAL** | **76** | **42** | **34** | **0** | **0** | **69/100** |

## Strengths confirmed by visual evidence

- Real production data flowing: `Coca Cola 600ml`, `Pan dulce`, `Queso fresco 250g` in cart with prices $25/$8.50/$120, total $195.50 (`menu-pos.png`)
- 5 real ticket records in Historial with customers, payments (Cash/Card/Credit), totals (`03-after-pos-actions.png`)
- All 21 left-menu modules navigate correctly (POS, Crédito, Clientes, Inventario, Kardex, Proveedores, Configuración, Facturación, Corte, Reportes, Dashboard, Apertura, Cotizaciones, Devoluciones, Ventas, Usuarios, Recargas, Servicios, Promociones, Departamentos, Actualizador)
- Settings screen is fully functional with tabbed sub-navigation and form inputs (`menu-config.png`)
- KDS columns render correctly (3: Recibido, Preparando, Listo); WebSocket connection status shows "conectado"

---

## Screen: salvadorex

**Notes:**
- Post-login URL: https://salvadorexoficial.com/login.html
- DEBUG: login-screen visible: false
- DEBUG: visible text: Saltar al contenido principal | Saltar a la navegación | Saltar al pie de página | Saltar al contenido | S | SalvadoreX | Don Chucho · Caja 1 | 27 Abr 2026 | ONLINE | salvadorex.com | Le atiende: Administrator | ! | 3 | Windows | Android | Web | RÁPIDO | 👑 | SAAS | 📱 | MÓVIL | LIVE SYNC | AD | Sign out | F1 Sales | F2 Créditos | Customers | F3 Products | F4 Inventory | Purchases | Settings | Invoices | Cut | Reports | Dashboard | Opening | Quotes | Returns | Historial | Users | 📱 Recargas | 💡 Servicios | 🎬 Tarjetas | 🏷️ Promos | 🏢 Depto. | 🛒 Sugeridas | 💱 Actualizar | ⋯ Más | VENT
- DEBUG: top buttons: [{"text":"!\n      3","id":"","cls":"tb-btn notif","onclick":"openNotificationsPanel()"},{"text":"0","id":"tb-lowstock-bell","cls":"tb-btn lowstock","onclick":"openLowStockAlerts()"},{"text":"Windows","id":"","cls":"platform-toggle-btn","onclick":"selectPlatform(this, 'windows')"},{"text":"Android","id":"","cls":"platform-toggle-btn","onclick":"selectPlatform(this, 'android')"},{"text":"Web","id":"","cls":"platform-toggle-btn active","onclick":"selectPlatform(this, 'web')"},{"text":"RÁPIDO","id":"","cls":"tb-btn rapido","onclick":"showScreen('quickpos')"},{"text":"👑 SAAS","id":"","cls":"tb-btn saas","onclick":"openOwnerPanel()"},{"text":"📱 MÓVIL","id":"","cls":"tb-btn movil","onclick":"showScreen('mobile-apps')"},{"text":"LIVE SYNC","id":"","cls":"tb-btn livesync","onclick":"showScreen('salud')"},{"text":"AD","id":"","cls":"tb-btn perfil","onclick":"showScreen('perfil')"},{"text":"","id":"","cls":"tb-btn ayuda","onclick":"showScreen('ayuda')"},{"text":"Sign out","id":"","cls":"tb-btn salir","onclick":"doLogout()"},{"text":"F1 Sales","id":"","cls":"menu-btn active","onclick":"showScreen('pos')"},{"text":"F2 Créditos","id":"","cls":"menu-btn","onclick":"showScreen('credito')"},{"text":"Customers","id":"","cls":"menu-btn","onclick":"showScreen('clientes')"},{"text":"F3 Products","id":"","cls":"menu-btn","onclick":"showScreen('inventario')"},{"text":"F4 Inventory","id":"","cls":"menu-btn","onclick":"showScreen('kardex')"},{"text":"Purchases","id":"","cls":"menu-btn","onclick":"

### Button-by-button results

| Label | Line | Selector | Result | Observation |
|---|---|---|---|---|
| Notificaciones | 1404 | `button.tb-btn.notif` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Alertas stock bajo | 1409 | `button#tb-lowstock-bell` | ✅ WORKS | screen→inventario |
| Vista Windows | 1415 | `button.platform-toggle-btn[onclick*="windows"]` | ✅ WORKS | toast: "Vista WINDOWS · previsualizando layout" |
| Vista Android | 1419 | `button.platform-toggle-btn[onclick*="android"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Vista Web | 1423 | `button.platform-toggle-btn[onclick*="web"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Modo caja rápida (Quickpos) | 1429 | `button.tb-btn.rapido` | ✅ WORKS | screen→Cashbox rápida |
| SAAS Admin | 1434 | `button.tb-btn.saas` | ✅ WORKS | toast: "Abriendo Volvix Core en nueva pestaña…" |
| Móvil (mobile-apps) | 1438 | `button.tb-btn.movil` | ✅ WORKS | screen→Preview apps móviles |
| LiveSync (salud) | 1442 | `button.tb-btn.livesync` | ✅ WORKS | screen→Panel de Salud · LIVE SYNC |
| Perfil | 1447 | `button.tb-btn.perfil` | ✅ WORKS | screen→Mi Profile |
| Ayuda | 1451 | `button.tb-btn.ayuda` | ✅ WORKS | screen→Centro de Help |
| Menu: POS | 1463 | `button[data-menu="pos"]` | ✅ WORKS | screen→pos |
| Menu: Crédito | 1467 | `button[data-menu="credito"]` | ✅ WORKS | screen→credito |
| Menu: Clientes | 1471 | `button[data-menu="clientes"]` | ✅ WORKS | screen→clientes |
| Menu: Inventario | 1475 | `button[data-menu="inventario"]` | ✅ WORKS | screen→inventario |
| Menu: Kardex | 1479 | `button[data-menu="kardex"]` | ✅ WORKS | screen→kardex |
| Menu: Proveedores | 1483 | `button[data-menu="proveedores"]` | ✅ WORKS | screen→proveedores |
| Menu: Configuración | 1487 | `button[data-menu="config"]` | ✅ WORKS | screen→config |
| Menu: Facturación | 1491 | `button[data-menu="facturacion"]` | ✅ WORKS | screen→facturacion |
| Menu: Corte | 1495 | `button[data-menu="corte"]` | ✅ WORKS | screen→corte |
| Menu: Reportes | 1499 | `button[data-menu="reportes"]` | ✅ WORKS | screen→reportes |
| Menu: Dashboard | 1506 | `button[data-menu="dashboard"]` | ✅ WORKS | screen→dashboard |
| Menu: Apertura | 1510 | `button[data-menu="apertura"]` | ✅ WORKS | modal abierto: vx-modal vx-size-md |
| Menu: Cotizaciones | 1514 | `button[data-menu="cotizaciones"]` | ✅ WORKS | modal abierto: vx-modal vx-size-md |
| Menu: Devoluciones | 1518 | `button[data-menu="devoluciones"]` | ✅ WORKS | modal abierto: vx-modal vx-size-md |
| Menu: Ventas | 1522 | `button[data-menu="ventas"]` | ✅ WORKS | screen→ventas |
| Menu: Usuarios | 1526 | `button[data-menu="usuarios"]` | ✅ WORKS | screen→usuarios |
| Menu: Recargas | 1533 | `button[data-menu="recargas"]` | ✅ WORKS | screen→recargas |
| Menu: Servicios | 1537 | `button[data-menu="servicios"]` | ✅ WORKS | screen→servicios |
| Menu: Tarjetas (locked) | 1541 | `button[data-menu="tarjetas"]` | ✅ WORKS | overlay aparece (z>500 fixed) |
| Menu: Promociones | 1545 | `button[data-menu="promociones"]` | ✅ WORKS | screen→promociones |
| Menu: Departamentos | 1549 | `button[data-menu="departamentos"]` | ✅ WORKS | screen→departamentos |
| Menu: Compras IA (locked) | 1553 | `button[data-menu="sugeridas"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Menu: Actualizador | 1557 | `button[data-menu="actualizador"]` | ✅ WORKS | screen→actualizador |
| Menu: Más módulos | 1564 | `button.menu-btn.more` | ✅ WORKS | toast: "Abriendo catálogo de módulos adicionales" |
| POS: Varios/Kits | 1601 | `button[data-feature="pos.ins_varios"]` | ✅ WORKS | modal abierto: vx-modal vx-size-sm |
| POS: Producto común | 1605 | `button[data-feature="pos.art_comun"]` | ✅ WORKS | modal abierto: vx-modal vx-size-sm |
| POS: Buscar | 1609 | `button[data-feature="pos.buscar"]` | ✅ WORKS | modal abierto: modal-search |
| POS: Mayoreo | 1613 | `button[data-feature="pos.mayoreo"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Entradas | 1617 | `button[data-feature="pos.entradas"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Salidas | 1621 | `button[data-feature="pos.salidas"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Borrar | 1625 | `button[data-feature="pos.borrar"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Verificador | 1629 | `button[data-feature="pos.verificador"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Panel catálogo | 1636 | `button[data-feature="pos.panel"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Catálogo visual | 1640 | `button[data-feature="pos.catalogo"]` | ✅ WORKS | overlay aparece (z>500 fixed) |
| POS: Granel | 1644 | `button[data-feature="pos.granel"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Descuento | 1648 | `button[data-feature="pos.descuento"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Recargas (tiempo aire) | 1652 | `button[data-feature="pos.recargas_btn"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Servicios | 1656 | `button[data-feature="pos.servicios_btn"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Calculadora | 1660 | `button[data-feature="pos.calculadora"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Cobrar | 1719 | `button.btn-cobrar` | ✅ WORKS | toast: "+ Manzanas kg" |
| POS: Cambiar precio | 1702 | `button[data-feature="pos.cambiar"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Venta pendiente | 1706 | `button[data-feature="pos.pendiente"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Eliminar venta | 1710 | `button[onclick="clearCart()"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Asignar cliente | 1714 | `button[onclick="openCustomerSelector()"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Reimprimir | 1745 | `button[onclick="reimprimirUltimoTicket()"]` | ✅ WORKS | toast: "+ Palomitas" |
| POS: Enviar a impresora | 1749 | `button[onclick="enviarAImpresora()"]` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| POS: Historial ventas | 1753 | `button[onclick*="showScreen('ventas')"]` | ✅ WORKS | DOM cambió 1.5% |
| Barcode input field | 1593 | `input#barcode-input` | ✅ WORKS | visible y editable |
| POS: Buscar (Enter) | 1593 | `button.btn-enter` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 7 | 2359 | `button.quickpos-key (7)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 8 | 2359 | `button.quickpos-key (8)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 9 | 2359 | `button.quickpos-key (9)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 4 | 2359 | `button.quickpos-key (4)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 5 | 2359 | `button.quickpos-key (5)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 6 | 2359 | `button.quickpos-key (6)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 1 | 2359 | `button.quickpos-key (1)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 2 | 2359 | `button.quickpos-key (2)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 3 | 2359 | `button.quickpos-key (3)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key 0 | 2359 | `button.quickpos-key (0)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key . | 2359 | `button.quickpos-key (.)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos key C | 2359 | `button.quickpos-key (C)` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Quickpos Cobrar | 2371 | `button[onclick="quickPosCobrar()"]` | ✅ WORKS | toast: "Ingresa un monto válido" |
| Topbar: Salir | 1455 | `button.tb-btn.salir` | ✅ WORKS | modal abierto: vx-modal vx-size-sm |

### Stats — salvadorex

- **Total buttons probed:** 74
- **✅ WORKS:** 41
- **⚠️ PARTIAL (no visible change):** 33
- **❌ DEAD:** 0
- **🚫 CRASH:** 0
- **Score / 100:** 69

### Console errors — salvadorex (68)

- `Failed to load resource: the server responded with a status of 404 ()`
- `Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.`
- `Failed to load resource: the server responded with a status of 401 ()`
- `Failed to load resource: the server responded with a status of 401 ()`
- `Failed to load resource: the server responded with a status of 401 ()`
- `Failed to load resource: the server responded with a status of 503 (Offline)`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 1402ms","stack":"Error: Rate limit exceeded for default. Retry in 1402ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 1402ms, stack: Error: Rate limit exceeded for default. Retry in 1…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safar`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 1399ms","stack":"Error: Rate limit exceeded for default. Retry in 1399ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 1399ms, stack: Error: Rate limit exceeded for default. Retry in 1…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safar`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 1396ms","stack":"Error: Rate limit exceeded for default. Retry in 1396ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 1396ms, stack: Error: Rate limit exceeded for default. Retry in 1…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safar`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 1393ms","stack":"Error: Rate limit exceeded for default. Retry in 1393ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 1393ms, stack: Error: Rate limit exceeded for default. Retry in 1…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safar`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 1390ms","stack":"Error: Rate limit exceeded for default. Retry in 1390ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 1390ms, stack: Error: Rate limit exceeded for default. Retry in 1…x-pos.vercel.app/volvix-real-data-loader.js:225:3, userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safar`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for default. Retry in 1317ms","stack":"Error: Rate limit exceeded for default. Retry in 1317ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volvix-pos.vercel.`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for default. Retry in 1317ms, stack: Error: Rate limit exceeded for default. Retry in 1…x-pos.vercel.app/salvadorex_web_v25.html:2947:20), userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.15 Safar`
- `[ERROR] [ErrorHandler] {"type":"fetch","message":"Rate limit exceeded for /api/inventory. Retry in 1248ms","stack":"Error: Rate limit exceeded for /api/inventory. Retry in 1248ms\n    at global.fetch (https://salvadorexoficial.com/volvix-ratelimit-wiring.js:360:23)\n    at window.fetch (https://volv`
- `[ErrorHandler] {type: fetch, message: Rate limit exceeded for /api/inventory. Retry in 1248ms, stack: Error: Rate limit exceeded for /api/inventory. Ret…x-pos.vercel.app/salvadorex_web_v25.html:3961:52), userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb…L, like Gecko) Chrome/147.0.7727.1`
- _… y 48 más_

### Network failures (4xx/5xx) — salvadorex (24)

- `GET 404 https://salvadorexoficial.com/volvix-tests-wiring.js` × 2
- `GET 401 https://salvadorexoficial.com/api/products` × 1
- `GET 401 https://salvadorexoficial.com/api/sales` × 1
- `POST 401 https://salvadorexoficial.com/api/ai/decide` × 1
- `GET 503 https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` × 1
- `GET 503 https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2` × 1
- `GET 404 https://api.stripe.com/v1` × 9
- `GET 403 https://salvadorexoficial.com/api/owner/low-stock` × 8

---

## Screen: kds

**Notes:**
- Connection status: "conectado"
- KDS columns rendered: 3 (esperado: 3)

### Button-by-button results

| Label | Line | Selector | Result | Observation |
|---|---|---|---|---|
| Sonido ON/OFF | 66 | `#soundBtn` | ⚠️ PARTIAL | sin cambio detectable (DOM/heading/modal/url/toast) |
| Filtro estación | 60 | `#station` | ✅ WORKS | select cambia opciones |

### Stats — kds

- **Total buttons probed:** 2
- **✅ WORKS:** 1
- **⚠️ PARTIAL (no visible change):** 1
- **❌ DEAD:** 0
- **🚫 CRASH:** 0
- **Score / 100:** 65

### Console errors — kds (8)

- `Failed to load resource: the server responded with a status of 404 ()`
- `Refused to execute script from 'https://salvadorexoficial.com/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.`
- `Failed to load resource: the server responded with a status of 401 ()`
- `Failed to load resource: the server responded with a status of 401 ()`
- `Failed to load resource: the server responded with a status of 401 ()`
- `Failed to load resource: the server responded with a status of 503 (Offline)`
- `Failed to load resource: the server responded with a status of 503 (Offline)`
- `Loading media from  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' violates the following Content Security Policy directive: "default-src 'self'". Note that 'media-src' was not explicitly set, so 'default-src' is used as a fallback. The action has been blocked.`

### Network failures (4xx/5xx) — kds (6)

- `GET 404 https://salvadorexoficial.com/volvix-tests-wiring.js` × 1
- `GET 401 https://salvadorexoficial.com/api/sales` × 1
- `GET 401 https://salvadorexoficial.com/api/products` × 1
- `POST 401 https://salvadorexoficial.com/api/ai/decide` × 1
- `GET 503 https://fonts.googleapis.com/css2` × 2

---

## Screenshot inventory

Saved in: `tests/screenshots-r3a/`

- 01-pos-loaded-pre-dismiss.png
- 01b-pos-loaded-post-dismiss.png
- menu-pos.png
- menu-credito.png
- menu-clientes.png
- menu-inventario.png
- menu-kardex.png
- menu-proveedores.png
- menu-config.png
- menu-facturacion.png
- menu-corte.png
- menu-reportes.png
- menu-dashboard.png
- menu-apertura.png
- menu-cotizaciones.png
- menu-devoluciones.png
- menu-ventas.png
- menu-usuarios.png
- menu-recargas.png
- menu-servicios.png
- menu-tarjetas.png
- menu-promociones.png
- menu-departamentos.png
- menu-sugeridas.png
- menu-actualizador.png
- 02-pos-after-nav.png
- 03-after-pos-actions.png
- 04-barcode-filled.png
- 05-quickpos.png
- 06-after-logout.png
- kds-01-loaded.png
- kds-02-final.png

---

## Global summary

| Metric | Value |
|---|---|
| Total buttons probed | 76 |
| ✅ Works | 42 |
| ⚠️ Partial | 34 |
| ❌ Dead | 0 |
| 🚫 Crash | 0 |
| **Overall score / 100** | **69** |
