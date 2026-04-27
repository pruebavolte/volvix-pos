# R26 — Bugs Críticos Detectados por Playwright (FIXED)

**Fecha**: 2026-04-27
**Deploy**: https://volvix-pos.vercel.app (alias) · https://volvix-8t396tlla-grupo-volvixs-projects.vercel.app
**Deploy ID**: `dpl_G27DGJetvqDQ899CP3kLCaxEi9Mg`

## Smoke test post-deploy

| Endpoint | Esperado | Obtenido |
|---|---|---|
| `/api/config/public` | 200 | 200 OK |
| `/volvix-cypress-tests.js` | 404 | 404 OK |
| `/volvix-playwright-tests.js` | 404 | 404 OK |
| `/volvix-tests-wiring.js` | 404 | 404 OK |
| `/volvix-loadtest-wiring.js` | 404 | 404 OK |

---

## Bug 1 — Test files en producción (`Cypress is not defined`, `CONFIG already declared`)

**Antes**: `volvix-cypress-tests.js`, `volvix-playwright-tests.js`, `volvix-tests-wiring.js`, `volvix-loadtest-wiring.js` se servían y ejecutaban en runtime (referenciados desde 9 HTMLs).

**Después**: agregados a `.vercelignore` Y removidos los `<script src=...>` de los HTMLs. 404 confirmados.

**Archivos modificados**:
- `.vercelignore` (+7 líneas: 4 archivos test + `tests/`, `playwright.config.*`, `cypress.config.*`)
- `marketplace.html`, `salvadorex_web_v25.html`, `volvix_owner_panel_v7.html`, `etiqueta_designer.html`, `multipos_suite_v3.html`, `volvix_ai_academy.html`, `volvix_ai_engine.html`, `volvix_remote.html`, `volvix_ai_support.html` (script tags removidos)

## Bug 2 — WebSocket loop infinito reconnect cada 3s

**Antes**: backoff exponencial sin techo de intentos → loop forever cuando `SUPABASE_ANON_KEY` falta o auth falla.

**Después**: tope de **5 reintentos**; tras agotarse → `setStatus('error')` y log warn. El usuario puede reanudar manualmente click en el indicador WS.

**Archivos modificados**:
- `volvix-realtime-wiring.js`: nuevo `RECONNECT_MAX_ATTEMPTS = 5`; guard en `scheduleReconnect()`.

(Nota: el guard de "ANON_KEY missing → realtime disabled" ya existía en líneas 28-32; no requería cambio.)

## Bug 3 — Rate limit agotado al 1% tras login

**Antes**: login IP=20/15min, login email=5/15min. Oficinas con NAT compartido + reintentos del frontend agotaban los buckets.

**Después**: login IP=**60/15min** (3x), login email=**15/15min** (3x).

**Archivos modificados**:
- `api/index.js` líneas 948 y 959.

(No existe rate-limit global de 100/min; los buckets son por endpoint.)

## Bug 4 — Modal "Novedades v3.4.0" reaparece cada login

**Antes**: `setSeenVersion()` escribía solo `volvix_changelog_seen_version`. Si el logout limpiaba esa clave, el modal volvía.

**Después**: doble persistencia — escribe legacy `volvix_changelog_seen_version` + clave per-versión `volvix_news_seen_v<X.Y.Z>`. `getSeenVersion()` busca ambas y devuelve la mayor.

**Archivos modificados**:
- `volvix-changelog-auto.js`: `getSeenVersion()` y `setSeenVersion()` actualizados.

## Bug 5 — Supabase ENV vars missing en cliente

**Estado**: el endpoint `/api/config/public` ya implementa degradación suave (devuelve `200 OK` con `mode: "limited"` y `supabase_anon_key: null` si falta). NO retorna 503. Smoke test confirma `200`.

**Acción documental**: para activar Realtime full, configurar en Vercel Dashboard → Settings → Environment Variables:
- `SUPABASE_URL` (obligatoria)
- `SUPABASE_ANON_KEY` (obligatoria, role=`anon`)

Si falta alguna, el frontend cargará en modo limitado sin loop de reconexión (Bug 2 ya cubre el silencio).

---

## Verificación

```bash
node --check api/index.js                # OK
node --check volvix-realtime-wiring.js   # OK
node --check volvix-changelog-auto.js    # OK
```

Deploy URL producción: **https://volvix-pos.vercel.app**
