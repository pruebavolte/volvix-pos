# R24_BROWSER_DEEP — Volvix POS Live QA

**Target:** https://salvadorexoficial.com | **Date:** 2026-04-27
**Tools:** Playwright 1.59 (chromium) — `C:\qa-playwright\tests\volvix-deep.spec.js`

## BLOQUEO CRITICO
**Login admin no autentica** contra el deployment Vercel con `admin@volvix.test / Volvix2026!`.
- El POST a `/api/auth/login` devuelve **401** (2 hits por intento, ver consoleErrs).
- El placeholder visible dice `<<test-password-via-env>>` -> la contraseña real vive en variable de entorno; la del CLAUDE.md ya no aplica.
- Sin login NO se pudieron ejecutar los pasos 2-5 (tabs, F3 alta producto, F1 venta, logout). Todos los `tabs[].status = "NOT_FOUND"` porque la SPA siguió en `/login.html`.

## Screenshots tomados (`C:\qa-playwright\evidence\deep\`)
- `01-login-page.png` — login renderiza OK (logo, email, password, banner GDPR).
- `02-after-login.png` — tras submit: **password field se vacia**, sigue en login.html (auth fail).
- 11 `tab-*.png` — todos identicos a la pantalla de login (no hubo navegacion).
- `03..09` — no se generaron (flujo abortado por falta de auth).

## Bugs encontrados

### JS Console errors (12 unicos)
1. **CSP viola Google Fonts**: `style-src 'self' 'unsafe-inline'` bloquea `fonts.googleapis.com/css2?family=Inter`. La fuente Inter nunca carga -> fallback a system font (afecta tipografia de toda la app).
2. **CSP bloquea ipify**: `connect-src` no incluye `https://api.ipify.org`. `volvix-audit-wiring.js:216 detectIp()` lanza TypeError "Failed to fetch" cada arranque.
3. **401 x2** en cada intento de login (`/api/auth/...`).

### Page errors (36 ocurrencias del MISMO bug)
**`Cannot read properties of null (reading 'length')`** se dispara repetidamente al cargar `login.html`. Es un null-deref en un `.length` sin guard. Origen probable: alguno de los `volvix-*-wiring.js` tocando un DOM que aun no existe (los 36 hits sugieren timer/intervalo o varios wirings cargados en serie sin verificar `el?.length`).

### Bugs visuales (login page)
- **Banner GDPR fixed-bottom solapa el formulario** en viewports cortos: el card de login queda parcialmente tapado por la barra `Usamos cookies` (visto en screenshot a 1280x720).
- **Widget VOLVIX PERF flotante (esquina inferior-derecha)** se muestra **en produccion** con datos de FPS/Mem/TTFB. Debe ocultarse fuera de modo dev.
- **Hint de credenciales literal** `<<test-password-via-env>>` visible al usuario final — fuga de info de testing en produccion.

### Botones / modales
- No verificable (sin sesion). Botones de tabs F1-Recargas: 0/11 encontrados. Modal "+ Nuevo" producto: no alcanzado. Modal de cobro: no alcanzado. Logout: no alcanzado.

## Recomendaciones (orden de impacto)
1. **FIX CSP**: agregar `https://fonts.googleapis.com https://fonts.gstatic.com` a `style-src`/`font-src` y `https://api.ipify.org` a `connect-src` — o eliminar la llamada a ipify si no se usa.
2. **FIX null-deref**: instrumentar `pageerror` en dev y agregar `?.` al `.length` ofensor en los wirings de login.
3. **Quitar VOLVIX PERF y el hint de password** del bundle de produccion (gating por `NODE_ENV` o flag).
4. **Proveer credencial de QA valida** (env var) o crear cuenta dummy estable; sin esto, ningun smoke E2E es posible contra produccion.

## Archivos
- Test: `C:\qa-playwright\tests\volvix-deep.spec.js`
- Evidencia: `C:\qa-playwright\evidence\deep\` (12 PNG + summary.json)
- Test base previo: `C:\qa-playwright\tests\volvix-real.spec.js`
