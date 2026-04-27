# R13 — Security Audit

Fecha: 2026-04-26
Alcance: `C:\Users\DELL\Downloads\verion 340\`
Proyecto Supabase identificado: `zhvwmzkcqngcaqpdxtwr.supabase.co`

---

## Resumen ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL  | 3 |
| HIGH      | 4 |
| MEDIUM    | 4 |
| LOW       | 2 |

El sistema tiene **3 issues CRITICAL** que comprometen totalmente la base de datos: la `service_role` key de Supabase está hardcodeada como fallback en `api/index.js`, expuesta en texto plano dentro del repo en `TASKS_FOR_NEXT_AI.md`, y no existe ninguna validación de rol en los endpoints `/api/owner/*` ni en mutaciones admin. Cualquier request anónimo puede leer/escribir todas las tablas.

---

## 1. CRITICAL — Service Role Key hardcodeada en código servidor

**Archivo**: `api/index.js`
**Línea**: 15
**Comando**: `rg "service_role|SERVICE_ROLE" -n` y `rg "eyJ[A-Za-z0-9_-]{20,}" -n`

```js
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...rvPkcyE7Cu1BzAhM_GdZjmqXvQe67gIpPaI7tLESD-Q').trim()...
```

El JWT decodificado contiene `"role":"service_role"` y `exp: 2079743018` (≈ año 2035). Cualquiera con acceso a este archivo (zip, repo, despliegue accidental al cliente) puede:
- Leer/escribir/borrar TODAS las tablas saltándose RLS
- Crear/eliminar usuarios y empresas
- Robar passwords (que además están en plaintext, ver issue #4)

**Fix**:
1. Quitar el fallback. Que falle si no hay env var:
```js
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY no configurada');
```
2. **ROTAR YA** la service_role key en el dashboard de Supabase (Settings → API → reset).
3. Configurar la nueva key sólo como env var en Vercel/Railway.

---

## 2. CRITICAL — Service Role Key + Anon Key expuestas en archivo de texto del repo

**Archivo**: `TASKS_FOR_NEXT_AI.md`
**Líneas**: 23-24
**Comando**: `rg "eyJ[A-Za-z0-9_-]{20,}" -n`

El archivo contiene en texto plano:
```
Service Key: eyJhbGciOi...rvPkcyE7Cu1BzAhM_GdZjmqXvQe67gIpPaI7tLESD-Q
Anon Key:    eyJhbGciOi...ygTc754INgqYJEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk
```

Si este zip se distribuyó alguna vez, las llaves deben considerarse **comprometidas**.

**Fix**:
1. Eliminar líneas 23-24 del archivo (o todo el bloque de credenciales).
2. Rotar ambas keys en Supabase.
3. Añadir `TASKS_FOR_NEXT_AI.md` y patrón `eyJ*` a `.gitignore` / pre-commit hook (gitleaks).

---

## 3. CRITICAL — Endpoints admin/owner sin validación de rol ni auth

**Archivo**: `api/index.js`
**Líneas**: 244-513 (todo `/api/tenants/*`, `/api/owner/*`, `/api/products`, `/api/customers`, `/api/inventory/adjust`)
**Comando**: `rg "role|admin" api/index.js -n`

Ningún handler verifica:
- Token de sesión (no se valida cookie/Bearer alguno)
- Rol del usuario (`superadmin`, `owner`, `cajero`)
- Tenant ownership (cualquiera puede pasar `tenant_id`)

Ejemplos de endpoints totalmente abiertos:
- `POST /api/tenants` — crea empresas
- `DELETE /api/tenants/:id` — suspende cualquier tenant
- `POST /api/owner/users` — crea usuarios admin
- `PATCH /api/products/:id` — modifica productos de cualquier tenant
- `POST /api/inventory/adjust` — modifica stock arbitrario

`auth-gate.js` sólo redirige el navegador a login.html si no hay sesión en `localStorage`, pero **no protege la API en absoluto**: un `curl` directo al endpoint funciona.

**Fix**:
1. Emitir JWT firmado en `/api/login` (no devolver objeto sesión plano).
2. Middleware `requireAuth(req)` que verifique JWT en `Authorization: Bearer …` antes de cada handler.
3. `requireRole('superadmin')` para todos los `/api/owner/*` y `/api/tenants/*` (mutaciones).
4. Filtrar siempre por `tenant_id` del JWT, no del query string.

---

## 4. HIGH — Passwords almacenados y comparados en texto plano

**Archivo**: `api/index.js`
**Líneas**: 196, 448
**Comando**: `rg "password_hash" api/index.js -n`

```js
if (user.password_hash !== password) return sendJSON(res, { error: 'Credenciales inválidas' }, 401);
...
password_hash: body.password || 'changeme',
```

A pesar del nombre de columna `password_hash`, se compara igualdad directa con el password recibido y se inserta sin hashear. Significa que la BD contiene passwords en plaintext.

**Fix**: usar `bcrypt` (cost ≥ 10) o `argon2id`:
```js
const bcrypt = require('bcryptjs');
// login
const ok = await bcrypt.compare(password, user.password_hash);
// create
password_hash: await bcrypt.hash(body.password, 12),
```
Y migrar passwords existentes (forzar reset).

---

## 5. HIGH — CORS totalmente permisivo (`*`) sobre API con datos sensibles

**Archivo**: `api/index.js`
**Líneas**: 121, 169, 754
**Comando**: `rg "Access-Control-Allow-Origin" -n`

```js
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey');
```

Cualquier sitio web puede invocar la API desde el navegador del usuario. Combinado con la ausencia de auth (issue #3), un sitio malicioso puede leer/borrar datos del tenant simplemente cargando una página.

**Fix**: lista blanca de orígenes:
```js
const ALLOWED = ['https://volvix.app','https://app.volvix.com'];
const origin = req.headers.origin;
if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
res.setHeader('Vary','Origin');
```
Y `Access-Control-Allow-Credentials: true` si se usan cookies.

---

## 6. HIGH — SQL/PostgREST injection en filtros vía `tenant_id`, `user_id`, `product_id`

**Archivo**: `api/index.js`
**Líneas**: 282-287, 329-331, 651, 266, 273, 313, 320, 374, 381
**Comando**: `rg "eq\.\$\{" api/index.js -n`

Múltiples handlers concatenan input de usuario directamente en URLs PostgREST sin validación:
```js
const tenantId = parsed.query.tenant_id;
...
let qs = `?pos_user_id=eq.${userId}&select=...`;
const result = await supabaseRequest('PATCH', `/pos_companies?id=eq.${params.id}`, body);
```

Aunque PostgREST limita la sintaxis SQL nativa, un atacante puede inyectar operadores como `or=(role.eq.ADMIN)` o `not.is.null` modificando el valor para alterar la consulta y exfiltrar datos cruzados de tenants. Ejemplo:
`GET /api/sales?user_id=00000000-0000-0000-0000-000000000000&select=*` con un valor que rompa el filtro.

**Fix**:
1. Validar UUIDs con regex `/^[0-9a-f-]{36}$/i` antes de inyectar.
2. URL-encode siempre: `encodeURIComponent(userId)`.
3. Whitelist de tenant_id contra la sesión JWT.

(Sólo `/api/login` línea 191 usa `encodeURIComponent`; el resto no.)

---

## 7. HIGH — Endpoint `/api/debug` filtra topología de la base

**Archivo**: `api/index.js`
**Líneas**: 699-710
**Comando**: `rg "/api/debug" -n`

Devuelve `supabase_url`, lista de emails admin, conteos de tablas, productos, etc. — útil para reconnaissance.

**Fix**: borrar el handler en producción o protegerlo con `requireRole('superadmin')` + ofuscar URL.

---

## 8. MEDIUM — Anon Key hardcodeada en cliente (esperado pero verificar RLS)

**Archivo**: `volvix-realtime-wiring.js`
**Línea**: 24
**Comando**: `rg "eyJ" --glob "*.js" -n`

La anon key está embebida en el bundle cliente — esto es **el patrón esperado de Supabase** *siempre que* haya Row Level Security activa en todas las tablas. Dado que el backend usa `service_role` (que salta RLS), es muy probable que **RLS esté deshabilitado** en `pos_sales`, `pos_products`, `pos_users`, etc.

**Fix**: verificar en Supabase Studio que TODAS las tablas tienen `RLS enabled` con políticas que filtren por `tenant_id = auth.jwt()->>'tenant_id'`. Si no, cualquiera con la anon key puede leer todo via `https://zhvwmzkcqngcaqpdxtwr.supabase.co/rest/v1/pos_users`.

---

## 9. MEDIUM — XSS potencial: 113 usos de `innerHTML` en 30 archivos

**Archivos**: ver listado completo abajo
**Comando**: `rg "innerHTML\s*=" --count`

Top archivos:
- `salvadorex_web_v25.html` (15)
- `volvix-customer-portal.html` (11)
- `multipos_suite_v3.html` (11)
- `marketplace.html` (8)
- `volvix-email-wiring.js` (8)
- `volvix-charts-wiring.js` (7)
- `BITACORA_LIVE.html` (6)

No fue posible auditar cada uso individualmente en el alcance de esta revisión, pero al menos los que renderizan datos provenientes de `/api/*` (productos con `name`, customers con `email`/`phone`, tickets con `title`, AI responses) son vectores XSS si el atacante puede insertar HTML en esos campos via API (que actualmente no valida nada — issue #3).

**Fix**:
1. Reemplazar `innerHTML = userData` por `textContent = userData` cuando no se necesite HTML.
2. Cuando se necesite HTML, sanitizar con DOMPurify antes:
```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>
<script>el.innerHTML = DOMPurify.sanitize(html);</script>
```
3. Activar CSP estricta: `Content-Security-Policy: default-src 'self'; script-src 'self'`.

---

## 10. MEDIUM — `auth-gate.js` valida sesión sólo en cliente y por timestamp local

**Archivo**: `auth-gate.js`
**Líneas**: 28-42
**Comando**: `rg -n . auth-gate.js`

La sesión se guarda en `localStorage` y se valida con `session.expires_at > Date.now()`. Problemas:
- El usuario puede **falsificar `volvixSession`** en DevTools y entrar a cualquier panel admin (incluso `volvix-admin-saas.html`, `volvix_owner_panel_v7.html`).
- No hay verificación contra el servidor (no se llama a `/api/session/verify`).
- `expires_at` lo asigna el cliente cuando recibe la respuesta — manipulable.
- No hay refresh token, ni firma, ni httpOnly cookie.

**Fix**: combinar con issue #3. Emitir JWT firmado, guardarlo en `httpOnly Secure SameSite=Strict` cookie, y validar server-side en cada `/api/*`. `auth-gate.js` queda como UX hint, no como control.

---

## 11. MEDIUM — Status 500 expone mensajes de error de Supabase al cliente

**Archivo**: `api/index.js`
**Líneas**: múltiples (`} catch (err) { sendJSON(res, { error: err.message }, 500); }`)

Errores como `Supabase 500: duplicate key value violates unique constraint "pos_users_email_key"` revelan estructura interna. Útil para enumeration attacks.

**Fix**: log interno con `console.error`, devolver `{ error: 'Internal error', code: 'E500' }` al cliente.

---

## 12. LOW — `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` en docs

**Archivo**: `volvix-api-docs.html`
**Línea**: 382
**Comando**: `rg "eyJ" --glob "*.html" -n`

Es sólo el header del JWT (parte pública) seguido de `...`, no es secreto, pero da pista de que se usan JWT HS256 — útil para fuerza bruta del secret si éste es débil. Como en este sistema NO se firma JWT propiamente (issue #10), este "ejemplo" además es engañoso.

**Fix**: usar placeholder `<YOUR_TOKEN>`.

---

## 13. LOW — Cabeceras de seguridad ausentes

**Archivo**: `api/index.js` y `server.js`
**Comando**: `rg "X-Frame-Options|Content-Security-Policy|Strict-Transport" -n`

No se setea ninguno de:
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`
- `Referrer-Policy`

**Fix**: middleware de helmet-style en cada respuesta o configurar en `vercel.json`.

---

## Acciones inmediatas (orden recomendado)

1. **HOY**: Rotar `service_role` y `anon` keys en Supabase. Las actuales deben tratarse como públicas.
2. **HOY**: Eliminar el fallback hardcodeado de `api/index.js:15` y las líneas 23-24 de `TASKS_FOR_NEXT_AI.md`.
3. **Esta semana**: implementar JWT + middleware de auth+rol en todos los `/api/*` excepto `/api/login`, `/api/health`.
4. **Esta semana**: bcrypt para passwords + script de migración.
5. **Esta semana**: verificar/activar RLS en todas las tablas Supabase.
6. **Próximas 2 semanas**: CORS whitelist, sanitización XSS con DOMPurify, headers de seguridad.
