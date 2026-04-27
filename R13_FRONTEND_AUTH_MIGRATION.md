# R13 — Frontend Auth Migration (JWT Bearer)

Fecha: 2026-04-26
Contexto: el backend (`api/index.js`) ahora exige `Authorization: Bearer <token>`
en todos los endpoints excepto `/api/login` y `/api/health`. Esta migración
adapta el frontend para guardar el token devuelto por `/api/login` y
adjuntarlo automáticamente en cada llamada.

---

## 1. Archivo creado

### `auth-helper.js` (nuevo, 145 líneas)

API expuesta en `window.Volvix.auth`:

| Método | Descripción |
|---|---|
| `saveToken(token)` | Guarda JWT en `localStorage` (key: `volvixAuthToken`). |
| `getToken()` | Devuelve el token (`string`) o `null`. |
| `clearToken()` | Borra el token. |
| `isLoggedIn()` | `true` si hay token y el claim `exp` (JWT) no ha expirado. |
| `fetch(url, opts)` | Wrapper de `fetch` que añade `Authorization: Bearer <token>`, fusiona headers existentes (`Headers`, `Array`, plain object), añade `Content-Type: application/json` si el body es string sin CT, y al recibir `401` limpia el token y redirige a `/login.html?expired=1&redirect=...`. La respuesta expone además `response.parsed()` con caché. |

Decoder JWT incluido (`_decodeJwtPayload`) sin verificar firma — sólo lee
`exp` para `isLoggedIn()`. Maneja UTF-8 y padding base64 ausente.

---

## 2. Archivos modificados

| Archivo | Cambios | Líneas afectadas (aprox.) |
|---|---|---|
| `login.html` | (a) inserta `<script src="auth-helper.js"></script>` antes del primer wiring. (b) en `handleLogin`, tras guardar `volvixSession`, lee `result.token` (o `result.session.token` como fallback) y llama `Volvix.auth.saveToken(jwt)`. | +12 / 0 |
| `auth-gate.js` | Reemplaza el chequeo legacy (`session.expires_at > Date.now()`) por `Volvix.auth.isLoggedIn()` con fallback al chequeo legacy si `auth-helper.js` no está cargado. Conserva la lógica de redirect con `expired` y `redirect`. | +14 / -8 |
| `volvix-loadtest-wiring.js` | `replace_all` `fetch(` → `Volvix.auth.fetch(`. **1 ocurrencia** (en comentario de docstring, línea 8). No hay llamadas `fetch` activas en este archivo. | 1 |

### HTMLs con `auth-helper.js` insertado (21 archivos)

Todos reciben `<script defer src="auth-helper.js"></script>` justo **antes**
del primer `<script ... src="...volvix-*-wiring.js"></script>`, conservando
indentación original.

| # | Archivo | Inserciones |
|---|---|---|
| 1 | `etiqueta_designer.html` | 1 |
| 2 | `landing_dynamic.html` | 1 |
| 3 | `login.html` (sin `defer`, antes del primer wiring) | 1 |
| 4 | `marketplace.html` | 1 |
| 5 | `multipos_suite_v3.html` | 1 |
| 6 | `salvadorex_web_v25.html` | 1 |
| 7 | `volvix-admin-saas.html` | 1 |
| 8 | `volvix-api-docs.html` | 1 |
| 9 | `volvix-customer-portal.html` | 1 |
| 10 | `volvix-grand-tour.html` | 1 |
| 11 | `volvix-hub-landing.html` | 1 |
| 12 | `volvix-mega-dashboard.html` | 1 |
| 13 | `volvix-onboarding-wizard.html` | 1 |
| 14 | `volvix-pwa-final.html` | 1 |
| 15 | `volvix-sandbox.html` | 1 |
| 16 | `volvix-sitemap.html` | 1 |
| 17 | `volvix-vendor-portal.html` | 1 |
| 18 | `volvix_ai_academy.html` | 1 |
| 19 | `volvix_ai_engine.html` | 1 |
| 20 | `volvix_ai_support.html` | 1 |
| 21 | `volvix_owner_panel_v7.html` | 1 |
| 22 | `volvix_remote.html` | 1 |

**Total HTML modificados:** 22 (21 + login.html).

### HTMLs excluidos (confidenciales)

- `BITACORA_LIVE.html`
- `volvix-qa-scenarios.html`

Identificados como confidenciales en `R13_I18N_ACTIVATION_REPORT.md`,
`R13_HTTP_AUDIT.md` y `.vercelignore`.

---

## 3. Búsqueda de `fetch('/api/...)` en wirings

Patrón buscado: `fetch\(['"]/api/` sobre `volvix-*-wiring.js`.

| Archivo | Coincidencias | Acción |
|---|---|---|
| `volvix-loadtest-wiring.js` | 1 (comentario de docstring) | Reemplazado por `Volvix.auth.fetch(` |

**No se encontraron más wirings con llamadas `fetch('/api/...')` directas.**
La mayoría de wirings usan Supabase REST (`/rest/v1/...`) directamente, no
los endpoints `/api/*` del backend Express. Esos siguen su propio camino de
autenticación (anon key) y no requieren cambio en esta migración.

---

## 4. Compatibilidad y no-rotura

- `auth-helper.js` se expone como `window.Volvix.auth` (namespacing seguro).
- `Volvix.auth.fetch` **fusiona** headers existentes (`Headers`, array, plain
  object) sin sobrescribir un `Authorization` ya presente — no rompe llamadas
  con auth custom.
- `auth-gate.js` mantiene fallback al chequeo legacy si `auth-helper.js` aún
  no se ha cargado, evitando race conditions en páginas donde el script se
  cargue tarde.
- `login.html` mantiene `localStorage.setItem('volvixSession', ...)` (legacy)
  y además guarda el token JWT en `volvixAuthToken`.
- En `401`, el helper limpia el token y redirige a `login.html` excepto si ya
  estamos en login, evitando loops.

---

## 5. Pendientes / siguientes pasos sugeridos

1. Verificar que `/api/login` realmente devuelve `result.token` en el JSON
   raíz (o ajustar fallback `result.session.token`).
2. Migrar wirings que llamen a Supabase directamente con anon key a usar
   `Volvix.auth.fetch` cuando el endpoint pase por el backend Express.
3. Añadir tests Playwright que verifiquen:
   - Login → token guardado en localStorage.
   - Petición protegida con token válido → 200.
   - Petición con token expirado → 401 → redirect a login.
4. Considerar mover el token de `localStorage` a `httpOnly cookie` en una
   próxima fase de hardening (XSS mitigation).

---

**Reporte generado:** 2026-04-26
**Tarea:** R13 — Migración frontend a JWT Bearer
