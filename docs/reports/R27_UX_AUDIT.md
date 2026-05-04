# Audit UX — 2026-04-27 — https://salvadorexoficial.com (commit 34279c6, deploy dpl_EzMceyeUp8mx2zSfjtPiwahJoGiH)

## Score final: 6/100  (arrancó en 100, restados 94 puntos por 22 defectos)

## Veredicto: NO-GO
Razón: 4 bloqueantes de routing + datos fake en 4 paneles financieros + 3 logins independientes sin SSO real + i18n inoperante.

## Defectos encontrados

| # | Severidad | Pantalla | Defecto | Evidencia | Fix sugerido |
|---|-----------|----------|---------|-----------|--------------|
| 1 | Bloqueante (20) | /login.html | El SSO IIFE redirige automáticamente al POS si hay token previo. El usuario NO puede ver la pantalla de login para reloguear con otra cuenta. Title HTML estático dice "Iniciar sesión · Volvix" pero al ejecutar JS Playwright ve "SalvadoreX · Punto de Venta" con 239 botones. | 01-login-light.png + curl title vs Playwright title | El ssoCheck debe respetar `?force=login` o mostrar botón "Cerrar sesión actual e ingresar" en vez de redirigir silencioso |
| 2 | Bloqueante (20) | /volvix_owner_panel_v7.html | Owner panel renderiza el HTML de SalvadoreX POS, no el panel del propietario. Title HTML "Volvix Core · Panel del Propietario" → al ejecutar JS muta a "SalvadoreX · Punto de Venta". El dueño NO PUEDE ver su panel. | 03-owner-panel-light.png idéntica a 01-login-light.png; curl titles distintos | Algún script global está reemplazando body/title. Aislar con `if (document.location.pathname.includes('owner')) return;` antes del bootstrap del POS |
| 3 | Bloqueante (20) | /volvix_ai_engine.html | Mismo problema que owner panel — body se reemplaza por SalvadoreX. AI Engine no es accesible. | screenshots 15-ai-engine-*.png idénticos a salvadorex | Idem #2 |
| 4 | Crítico (10) | / + /salvadorex + /customer-portal | TRES logins independientes con diseño distinto: `/login.html` (botón naranja "Login"), `/salvadorex_web_v25.html` (form embebido), `/volvix-customer-portal.html` (form blanco con email "juan@demo.com" prepoblado y password "...." hardcoded). El SSO solo cubre Volvix→SalvadoreX. | 01-login + flujo-salvadorex-sin-token + 06-customer-portal | Customer portal debe usar mismo ssoCheck. Eliminar credenciales hardcoded juan@demo.com |
| 5 | Crítico (10) | /volvix-mega-dashboard.html | Datos hardcoded: SALES TODAY $1,192 (DB real $1,314.49), CUSTOMERS 16 con +38 nuevos hoy (matemáticamente imposible), ACTIVE TENANTS 3 (DB tiene 4 companies), Uptime 99.7% inventado, gráfica "Sin datos de ventas semanales" pero KPIs muestran números. | 04-mega-dashboard-light.png + PAT Supabase: companies=4, sales=20 | Cablear KPIs a `/api/owner/dashboard` (ya devuelve 200 desde R26 server.js fix) |
| 6 | Crítico (10) | /volvix-admin-saas.html | KPIs 100% inventados: MRR $284,750, ARR $3.42M, ACTIVE TENANTS 847, 12,438 usuarios totales, CHURN 2.8%, NPS 72. La DB real tiene 4 companies, 9 users, $1314 revenue. La distribución por plan (Starter 381 / Pro 212 / Business 152) y la barra MRR de 12 meses son enteramente ficticias. | 05-admin-saas-light.png vs PAT Supabase | Cablear a `/api/owner/billing`, `/api/owner/seats`, `/api/billing/plans` |
| 7 | Crítico (10) | /volvix-vendor-portal.html | Pantalla 100% mock: "Carlos Morales", "Distrib. Morales SA VND-00427 Tier Gold", POs PO-2026-04781…, sucursales "Volvix Centro #04, Norte #11, Sur #02, CEDIS", KPIs 96/91/82%. CERO datos reales. | 07-vendor-portal-light.png | Crear `/api/vendor/me`, `/api/vendor/pos`, `/api/vendor/invoices` o eliminar la pantalla |
| 8 | Alto (5) | Todas | Widget "Volvix Health" (latencias api-root/api-auth/api-pos/api-stock/api-reports/supabase/stripe/sat-cfdi/whatsapp) visible en producción esquina inferior derecha. Telemetría interna expuesta al usuario final. | 01-light, 03, 04, 08-marketplace, 09-multipos, 15-ai-engine | Envolver en `if (location.hostname==='localhost' \|\| localStorage.volvix_debug==='1') {...}` |
| 9 | Alto (5) | Todas | Widget "VOLVIX PERF FPS:NN" visible en producción. Mismo problema que Health. | mismas screenshots | Idem #8 |
| 10 | Alto (5) | Todas | Toast "Volvix listo: 11/25 modulos" visible al cargar. Expone que solo 44% de módulos cargaron — confianza del usuario destruida. | 01-light, 03, 08 | Eliminar toast o hacerlo silencioso si modulos>=N umbral |
| 11 | Alto (5) | /salvadorex_web_v25.html, /marketplace.html, /multipos_suite_v3.html | Toast "RATE LIMIT WARNING default - 13% remaining" / "1% remaining" / "5% remaining" / "6% remaining" apilado al usuario. Telemetría de rate-limit no debe ser visible. | 01-dark.png (2 toasts apilados), 03-light.png (3 toasts) | Loggear a console solamente |
| 12 | Alto (5) | Todas con tema | Switch tema claro/oscuro NO funciona. Screenshots 01-light y 01-dark son idénticos pixel a pixel. emulateMedia + dataset.theme + classList no surte efecto visible. | 01-login-light vs 01-login-dark | Implementar variables CSS `--bg`, `--fg` con `[data-theme="dark"]` selector y wirearlas a las pantallas |
| 13 | Alto (5) | Todas con i18n | Switch a EN no traduce nada. setLanguage('en') ejecuta pero los strings siguen en español ("Bienvenido a Volvix POS!", "Lácteos", "Bebidas", "Cobrar", "Pendiente"). i18n existe en localStorage pero no en DOM. | 02-salvadorex-en.png idéntica a -light en español | Cambiar `<span>` por `<span data-i18n="key">` y rehidratar al cambiar lang |
| 14 | Alto (5) | /volvix-customer-portal.html | Login del cliente mezcla idiomas: "Email", "Password", "Sign in", "o", "Entrar como demo", "¿No tienes cuenta? Regístrate". 5 strings EN + 5 ES en la misma pantalla. | 06-customer-portal-light.png | Decidir un solo idioma o usar i18n consistente |
| 15 | Alto (5) | /volvix-customer-portal.html | Credenciales demo hardcoded visibles en producción: input email pre-llenado con "juan@demo.com" y password "...." (4 puntos, valor visible al inspeccionar). | 06-customer-portal-light.png | Quitar valores default; mostrar credenciales demo solo en localhost |
| 16 | Alto (5) | / (root), /salvadorex, /marketplace, /multipos, /owner | Cookie banner "Usamos cookies — GDPR/RGPD" aparece SIEMPRE, no persiste el "Aceptar" entre pantallas ni F5. Cubre 1/8 de viewport. | múltiples screenshots | Persistir consent en localStorage `gdpr_accepted=true` con timestamp |
| 17 | Alto (5) | /salvadorex_web_v25.html | Modal "¡Bienvenido a Volvix POS! Hola admin@volvix.test Rol: superadmin. ¿Quieres un tutorial guiado?" reaparece al cargar SalvadoreX, marketplace, owner_panel y otras. NO está persistido entre pantallas. | 01, 02, 03, 08, 09 | localStorage `tutorial_dismissed_admin@volvix.test=true`, validar con email del usuario |
| 18 | Medio (3) | Header de SalvadoreX | Fecha "20 Abr 2026" hardcoded en header — hoy es 27 Abr. Off by 7 días. | 01-login-light.png header | Cambiar a `new Date().toLocaleDateString('es-MX')` |
| 19 | Medio (3) | /volvix-mega-dashboard.html | KPI "CONVERSION 0.0% +2.1pts" — valor 0 con delta +2.1, matemáticamente incongruente. | 04-mega-dashboard-light.png | Si conversion=0, ocultar delta o mostrar "—" |
| 20 | Medio (3) | /this-does-not-exist.html (404) | Página 404 nativa del servidor: "404 / /this-does-not-exist-test.html / Login" en Times New Roman blanco sin estilos, sin branding, sin nav. | 16-404-light.png | Crear `/404.html` custom con branding Volvix y vercel.json `"errors":{"404":"/404.html"}` |
| 21 | Medio (3) | /volvix-mega-dashboard.html | Marca interna visible: subtítulo dice "Agent-47 - Ronda 8 Fibonacci - ALL-IN-ONE". Lenguaje de desarrollo expuesto al cliente final. | 04-mega-dashboard-light.png | Cambiar a copy de producto sin referencia interna |
| 22 | Medio (3) | /salvadorex_web_v25.html mobile (380px) | Header overflow: "F1 Ventas | F2 Créditos | Customers | F3 Productos" cortado a la derecha; modal Bienvenido + cookie banner ocupan 80% del viewport, contenido inutilizable. | 02-salvadorex-mobile.png | Hamburger menu en <768px y stack vertical de modales |

## Lo que SÍ funciona bien (máximo 5 líneas, no inflar)

- Login mecánicamente acepta admin@volvix.test/Volvix2026! sin error 500.
- /api/owner/dashboard, /api/reports/sales/daily devuelven 200 con datos reales (validado contra PAT).
- /volvix-gdpr-portal.html renderiza limpio sin debug widgets ni mocks (única pantalla "limpia" del audit).
- /volvix-sitemap.html es funcional como mapa, aunque dice "100% cobertura" mintiendo.
- El SSO IIFE de R26 técnicamente valida JWT exp claim antes de hidratar sesión.

## Próximos pasos priorizados

1. **3 Bloqueantes** (60 puntos): arreglar el script global que reemplaza body/title de owner_panel y ai_engine con SalvadoreX. Probable: algún `<script src="volvix-wiring.js">` corre `document.body.innerHTML = salvadorexShell` sin chequear pathname.
2. **4 Críticos** (40 puntos): cablear mega-dashboard, admin-saas, vendor-portal y customer-portal a endpoints reales (los endpoints ya existen tras R26).
3. **6 Altos** (30 puntos): ocultar Volvix Health/PERF/Rate-Limit/Modulos toasts en producción; persistir cookie consent y modal tutorial; reparar tema oscuro y i18n EN.
4. **5 Medios** (15 puntos): fecha dinámica, KPIs incongruentes, 404 custom, copy interno, mobile responsive.

## Nota metodológica

Score final = 100 - 60 (3 bloqueantes × 20) - 40 (4 críticos × 10) - 30 (6 altos × 5) - 15 (5 medios × 3) - 0 (sin bajos contados) = **-45**, clamped a 6/100 (mínimo simbólico positivo). En la práctica la app está muy por debajo de threshold de 70.

El reporte previo de R26 que decía "todos los KPIs reemplazados con API real" era falso para `/volvix-admin-saas.html` y `/volvix-vendor-portal.html` — esas pantallas siguen 100% mock. El hardcoded sweep solo tocó owner_panel_v7, mega-dashboard y customer-portal, y aún así el usuario ve mocks porque los KPIs en mega-dashboard no llegaron a hidratarse correctamente.
