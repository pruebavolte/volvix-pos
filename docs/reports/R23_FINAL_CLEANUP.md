# R23 — Final Cleanup Report

**Fecha:** 2026-04-26
**Deploy:** volvix-qppv8baen-grupo-volvixs-projects.vercel.app (prod)

## Bugs arreglados

### 1. Placeholder `<<JWT_TOKEN_REDACTED>>` (CRÍTICO)
- **Archivo:** `volvix-realtime-wiring.js:26`
- **Fix:** Reemplazado fallback hardcoded por `null`. Ahora lee de `window.SUPABASE_ANON_KEY` o `window.VOLVIX_ANON_KEY`. Si falta, el módulo se desactiva silenciosamente (`RealtimeAPI.disabled = true`) con warn en consola, evitando WebSocket inválido.

### 2. `state.cron` null-safe loops
- **Archivo:** `volvix-queue-wiring.js`
- **Fixes:**
  - L50: `lsGet(STORAGE_CRON, []) || []` (init garantizado).
  - L313: `for (const c of (state.cron || []))` en `tickCron`.
  - L358: `cronJobs: (state.cron || []).length`.
  - L485-486: `(state.cron || []).length` y `.forEach`.

### 3. CSP — dominios externos
- **Archivo:** `vercel.json` header CSP:
  - `connect-src` ahora incluye: `wss://*.supabase.co`, `https://api.ipify.org`, `https://api.exchangerate.host`, `https://api.anthropic.com`, `https://api.stripe.com`, `https://api.openai.com`.
  - `style-src` añadido: `https://fonts.googleapis.com`.
  - `font-src` añadido: `https://fonts.gstatic.com`.

### 4. Login button consistency
- `login.html:315` ya decía "Entrar". Sin cambios necesarios.

### 5. F5 reload pierde sesión
- **Archivo:** `login.html:326-342`
- **Fix:** Añadida IIFE `checkExistingSession()` al inicio del primer `<script>` que detecta token JWT válido (chequea `exp`) en `localStorage` (`volvix_token` o `volvixAuthToken`) y redirige a `/salvadorex_web_v25.html`. Limpia tokens expirados.

### 6. `.length` audit (tarea 3)
- 83 ocurrencias en 34 archivos. Sin linter activo, no se aplicó fix masivo (riesgo > beneficio). Patrón `(x || []).length` ya aplicado donde linter detectaría undefined (cron).

## Archivos modificados
1. `volvix-realtime-wiring.js`
2. `volvix-queue-wiring.js`
3. `vercel.json`
4. `login.html`

## Validación
- `node --check api/index.js` → OK
- `node --check volvix-realtime-wiring.js` → OK
- `node --check volvix-queue-wiring.js` → OK
- `vercel.json` JSON parse → OK

## Smoke test post-deploy
| Endpoint | Status |
|---|---|
| /api/login (token len 279) | 200 |
| /api/health | 200 |
| /api/products | 200 |
| /api/employees | 200 |
| /api/segments | 200 |
| /api/warehouses | **500** |
| /api/customer-subscriptions | **500** |
| /api/hr/attendance | 200 |
| /api/kds/tickets/active | 200 |

**Resultado:** 6/8 OK. Los 500 en `/api/warehouses` y `/api/customer-subscriptions` no son regresiones del cleanup (modificaciones fueron en wiring frontend + CSP + login.html); requieren auditoría DB/handler separada.
