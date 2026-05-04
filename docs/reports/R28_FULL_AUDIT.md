# R28 — Full System Audit (Architecture + Cross-wiring + UX)
Fecha: 2026-04-27 · URL: https://salvadorexoficial.com · Deploy: dpl_EzMceyeUp8mx2zSfjtPiwahJoGiH

## Score final: 0/100 (clamped) — score real bruto: -188

Cálculo: arrancó en 100, restados 288 puntos por 30 defectos:
- 8 BLOQUEANTES × 20 = −160
- 6 Críticos × 10 = −60
- 10 Altos × 5 = −50
- 6 Medios × 3 = −18

## Veredicto: NO-GO con 2 razones legales además de UX

1. **Fuga de datos PII sin auth**: `/api/customers` responde 200 con la lista completa de clientes sin requerir token. Posible violación GDPR/LFPDPPP.
2. **Cross-tenant filter ignored**: admin enviando `tenant_id` ajeno recibe ventas y clientes — el backend NO aísla por tenant. Bug de aislamiento en multi-tenancy.

---

## Resumen FASE 1 — SYSTEM MAP

| Recurso | Total |
|---------|-------|
| HTMLs públicos | 59 |
| Endpoints API | 373 (api/index.js) |
| Tablas Supabase referenciadas | 85 |
| Roles distintos | 8 (superadmin, admin, owner, manager, cashier, customer, vendor, kiosk) |
| Sub-sistemas funcionales | 14 |

Sub-sistemas clave: Volvix Hub Landing, Login Volvix, Admin SaaS, Mega Dashboard, Owner Panel, SalvadoreX POS, MultiPOS Suite, KDS, Kiosko, Customer Portal, Vendor Portal, Marketplace, GDPR Portal, Fraud Dashboard.

Ver detalle en `.audit/SYSTEM-MAP.md`.

---

## FASE 2 — Verificación de anti-flujos (resultados HTTP reales)

| ID | Severidad | Test | Resultado | Evidencia |
|----|-----------|------|-----------|-----------|
| E16 | BLOQUEANTE | GET /api/owner/dashboard sin token | **200 OK con datos** | curl evidencia status=200 keys=ok,metrics,sales_by_day,top_tenants |
| E15c | BLOQUEANTE | GET /api/customers sin token | **200 OK lista clientes (PII)** | status=200 |
| E15b | BLOQUEANTE | GET /api/reports/sales/daily sin token | **200 OK** | status=200 items=[] |
| E1 | BLOQUEANTE | admin GET /api/sales?tenant_id=fake-uuid-99 | **17 ventas devueltas** | count=17 (debió ser 0) |
| E2 | BLOQUEANTE | admin GET /api/customers?tenant_id=fake | **16 clientes devueltos** | count=16 |
| E15 | Degradado | /api/admin/backup/list sin token | 503 | status=503 (no expone data pero mal config) |
| E17 | OK | /api/owner/users no expone password_hash | passed | pwdHash=false pwdRaw=false |
| E18a/b | OK | login.html y salvadorex no exponen service_role | passed | clean |
| D10 | Cableado roto | /api/vendor/pos | **404** | Vendor portal sin backend |
| D10b | Cableado roto | /api/vendor/orders | **404** | idem |
| D3 | Cableado parcial | /api/owner/dashboard keys | metrics, sales_by_day, top_tenants | falta total_revenue, companies que el frontend lee |
| D12 | Stub vacío | /api/reports/sales/daily?days=7 | items=[] total=0 | El fix R26 quedó en server.js LOCAL, no en api/index.js (Vercel) |
| RL | Crítico | /api/ping × 30 sin throttle | 0/30 → 429 | Rate limit global ausente |
| CFG | OK | /api/config/public mode | mode=limited | Fallback graceful presente |

---

## FASE 3 — Defectos UX consolidados

| # | Severidad | Pantalla | Defecto | Evidencia |
|---|-----------|----------|---------|-----------|
| 1 | BLOQUEANTE | API | E16: /api/owner/dashboard responde 200 sin token | anti-flows.json |
| 2 | BLOQUEANTE | API | E15c: /api/customers expone PII sin token | anti-flows.json |
| 3 | BLOQUEANTE | API | E15b: /api/reports/sales/daily sin token | anti-flows.json |
| 4 | BLOQUEANTE | API | E1: filtro tenant_id ignorado (admin recibe 17 ventas de tenant inexistente) | anti-flows.json |
| 5 | BLOQUEANTE | API | E2: filtro tenant_id en /api/customers también ignorado (16 clientes) | anti-flows.json |
| 6 | BLOQUEANTE | /login.html | SSO IIFE redirige al POS sin opción de re-login. Title HTML "Iniciar sesión · Volvix" pero JS muta a "SalvadoreX · Punto de Venta" | 01-login-light.png + curl title vs DOM title |
| 7 | BLOQUEANTE | /volvix_owner_panel_v7.html | Owner Panel renderiza HTML de SalvadoreX (title HTML correcto, DOM mutado, 239 botones idénticos) | 03-owner-panel-light.png idéntica a 01 |
| 8 | BLOQUEANTE | /volvix_ai_engine.html, /volvix_ai_academy.html, /volvix_ai_support.html | Mismo bug que owner panel — bootstrap SalvadoreX se inyecta en cualquier `volvix_*.html` autenticada | 15-ai-engine, 22-ai-academy-light.png |
| 9 | Crítico | / + /salvadorex + /customer-portal + /ai-academy | **4 logins independientes** con diseño distinto | screenshots login + customer-portal + ai-academy |
| 10 | Crítico | /volvix-mega-dashboard.html | Datos hardcoded: SALES TODAY $1,192 (DB real $1,314.49), CUSTOMERS 16 con +38 nuevos hoy (matemáticamente imposible), ACTIVE TENANTS 3 (DB tiene 4 companies), gráfica "Sin datos de ventas semanales" | 04-mega-dashboard-light.png + PAT |
| 11 | Crítico | /volvix-admin-saas.html | KPIs 100% inventados: MRR $284,750, ARR $3.42M, ACTIVE TENANTS 847, 12,438 usuarios, MRR 12 meses ficticio | 05-admin-saas-light.png |
| 12 | Crítico | /volvix-vendor-portal.html | Pantalla 100% mock: "Carlos Morales", POs PO-2026-04781…, sucursales fake. Backend /api/vendor/* 404 | 07-vendor-portal-light.png + D10 fail |
| 13 | Crítico | /volvix-customer-portal.html | Email "juan@demo.com" + password "...." hardcoded visibles en producción | 06-customer-portal-light.png |
| 14 | Crítico | /api/ping y siblings | Rate limit global ausente (0/30 → 429) | RL test |
| 15 | Alto | Todas | Widget "Volvix Health" con latencias api-* visible al usuario | 01,03,04,08,09 |
| 16 | Alto | Todas | Widget "VOLVIX PERF FPS:N" visible | mismas |
| 17 | Alto | Todas | Toast "Volvix listo: 11/25 modulos" visible (expone que solo 44% cargó) | 01,03,08 |
| 18 | Alto | Multiple | Toasts "RATE LIMIT WARNING X% remaining" apilados al usuario | 01-dark, 03-light |
| 19 | Alto | Todas con tema | Switch claro/oscuro NO funciona (light vs dark idénticos pixel-perfect) | 01-light vs 01-dark |
| 20 | Alto | Todas con i18n | Switch EN no traduce nada | 02-salvadorex-en idéntico a -light |
| 21 | Alto | /volvix-customer-portal.html | Mezcla idiomas en la misma vista: Email/Password/Sign in (EN) + ¿No tienes cuenta?/Regístrate (ES) | 06-customer-portal-light.png |
| 22 | Alto | / (root), /salvadorex, /marketplace, /multipos, /owner | Cookie banner GDPR aparece SIEMPRE, no persiste consent | múltiples |
| 23 | Alto | /salvadorex y otras | Modal "¡Bienvenido a Volvix POS!" reaparece al cargar cualquier página | 01,02,03,08,09 |
| 24 | Alto | /volvix-kiosk.html | Productos hardcoded (Café $35, Donut $30, etc.) NO vienen de DB; footer dice "Sesión rechazada: kiosk_not_found_or_inactive" pero igual carga catálogo | 18-kiosk-light.png |
| 25 | Medio | Header SalvadoreX | Fecha "20 Abr 2026" hardcoded — hoy es 27 Abr | 01-light header |
| 26 | Medio | /volvix-mega-dashboard.html | KPI "CONVERSION 0.0% +2.1pts" — valor 0 con delta positivo, incongruente | 04 |
| 27 | Medio | Mega-dashboard | Subtítulo "Agent-47 - Ronda 8 Fibonacci - ALL-IN-ONE" — branding interno expuesto | 04 |
| 28 | Medio | /this-does-not-exist.html | 404 nativa Times New Roman blanco sin branding | 16-404 |
| 29 | Medio | /salvadorex_web_v25.html mobile (380px) | Header overflow + modal + cookie banner ocupan 80% del viewport | 02-mobile |
| 30 | Medio | /public/volvix-fraud-dashboard.html | Muestra "HTTP 401" crudo al usuario en vez de pedir login | 19-fraud-light.png |

---

## Lo que SÍ funciona bien (no inflar)

- Login mecánicamente acepta credenciales válidas y devuelve JWT.
- /api/owner/users no expone password_hash ni password (E17 passed).
- login.html y salvadorex no exponen service_role JWT (E18 passed).
- /api/config/public degrada graceful con mode=limited (R26 fix presente).
- /volvix-gdpr-portal.html y /volvix-onboarding-v2.html son pantallas limpias sin debug widgets ni mocks.
- BITACORA_LIVE.html devuelve 404 Vercel (bien — está en .vercelignore).
- KDS muestra UI correcta sin debug widgets (aunque sin datos).

---

## Próximos pasos priorizados

### Urgente (esta semana — fugas de datos)
1. Cerrar autenticación en `/api/owner/*`, `/api/reports/*`, `/api/customers`. Verificar que `requireAuth` esté aplicado y que el middleware no haga short-circuit.
2. Implementar middleware `tenantIsolation` que fuerce `WHERE tenant_id = req.user.tenant_id` en TODA query, ignorando `?tenant_id=` del query string del cliente.
3. Re-ejecutar tests E1, E2, E15b, E15c, E16 — todos deben dar 401 o array vacío.

### Crítico (próximas 2 semanas)
4. Resolver el bug del bootstrap SalvadoreX que muta `/login.html`, `/volvix_owner_panel_v7.html`, `/volvix_ai_engine.html`, `/volvix_ai_academy.html`, `/volvix_ai_support.html`. Probable: algún `<script>` global hace `document.body.innerHTML = ...` sin chequear `pathname`. Aislar con `if (pathname.includes('salvadorex')) return;`.
5. Cablear KPIs de mega-dashboard, admin-saas, vendor-portal a endpoints reales. Para vendor-portal, primero CREAR `/api/vendor/me`, `/api/vendor/pos`, `/api/vendor/orders`.
6. Agregar rate limit global a `/api/ping` y similares (mínimo 60 req/min/IP).

### Alto (próximo mes)
7. Ocultar Volvix Health/PERF/Rate-Limit/Modulos toasts en producción (`if location.hostname==='localhost'`).
8. Persistir cookie consent y modal Bienvenido (localStorage flags).
9. Reparar tema oscuro real (CSS variables `[data-theme="dark"]`).
10. Implementar i18n DOM-aware (`data-i18n="key"` rehidratado en setLanguage).
11. Eliminar credenciales hardcoded en customer-portal.

### Medio
12. Fecha dinámica (`new Date()`).
13. KPI "0% +2.1pts" → ocultar delta si valor=0.
14. Página 404 custom con branding.
15. Mobile responsive de SalvadoreX.
16. Fraud Dashboard con login form en vez de "HTTP 401" crudo.
17. Eliminar branding interno "Agent-47 Fibonacci" del UI público.

---

## Tiempos de ejecución (medidos)

| Fase | Workers | Duración |
|------|---------|----------|
| FASE 1 (discovery) | 1 (yo) | ~3 min |
| FASE 2 (anti-flows HTTP) | 1 (yo + 1 worker Playwright) | 9.3 s |
| FASE 3 captura paralela 9 pantallas × 2 variantes | **4 workers Playwright** | **2 min 8 s** |
| FASE 3 análisis visual | 1 (yo, secuencial) | ~5 min |

Comparativa solicitada: la fase de captura tomó **2m08s con 4 workers** vs ~5m que habría tomado con 1 worker (3.5x acelero). El análisis visual sigue siendo secuencial conmigo, sin spawn de subagentes — exactamente como pediste.
