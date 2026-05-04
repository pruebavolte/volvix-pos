# R13 — Prueba física de login y endpoints (Volvix POS)

**Fecha:** 2026-04-26
**Target:** https://salvadorexoficial.com
**Endpoint login:** `POST /api/login` (verificado en `api/index.js` líneas 183-224)
**Método de auth:** El backend NO emite JWT/token. Devuelve un objeto `session` con `user_id`, `role`, `tenant_id`, `expires_at`. No hay cookie. No hay middleware de validación en endpoints protegidos.

---

## 1. Login físico — 3 usuarios

Comando base:
```
curl -i -X POST https://salvadorexoficial.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<USER>","password":"Volvix2026!"}'
```

### 1.1 admin@volvix.test

- **HTTP:** `200 OK`
- **Tiempo:** 409 ms
- **Cookies/Set-Cookie:** *ninguna*
- **Token devuelto:** *ninguno (no hay JWT)*
- **Headers relevantes:** `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `Strict-Transport-Security: max-age=63072000`, `X-Vercel-Id: cle1::iad1::29v84-...`
- **Body:**
```json
{"ok":true,"session":{"user_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","email":"admin@volvix.test","role":"superadmin","tenant_id":"TNT001","tenant_name":"Abarrotes Don Chucho","full_name":"Administrador Volvix","company_id":null,"expires_at":1777224274519,"plan":"pro"}}
```

### 1.2 owner@volvix.test

- **HTTP:** `200 OK`
- **Tiempo:** 415 ms
- **Cookies/Token:** ninguno
- **Body:**
```json
{"ok":true,"session":{"user_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1","email":"owner@volvix.test","role":"owner","tenant_id":"TNT002","tenant_name":"Restaurante Los Compadres","full_name":"Dueño Restaurante","company_id":null,"expires_at":1777224275325,"plan":"enterprise"}}
```

### 1.3 cajero@volvix.test

- **HTTP:** `200 OK`
- **Tiempo:** 324 ms
- **Cookies/Token:** ninguno
- **Body:**
```json
{"ok":true,"session":{"user_id":"cccccccc-cccc-cccc-cccc-ccccccccccc1","email":"cajero@volvix.test","role":"cajero","tenant_id":"TNT001","tenant_name":"Abarrotes Don Chucho","full_name":"Cajero Volvix","company_id":null,"expires_at":1777224276029,"plan":"pro"}}
```

**Resumen login:** 3/3 OK. Las contraseñas se comparan en plano contra `password_hash` (línea 196: `if (user.password_hash !== password)`), lo que confirma que no hay hashing real.

---

## 2. Endpoints "protegidos" — 5 pruebas con token admin

> Hallazgo crítico: revisé `api/index.js` y NO existe middleware de autorización. Los handlers nunca leen `Authorization`, `req.headers`, ni validan `session`. Cualquier petición pasa. La prueba siguiente envía `Authorization: Bearer fake-admin-token` (token inventado) y aún así todos responden 200.

### 2.1 GET /api/products?tenant_id=TNT001
- **HTTP:** `200 OK` — devuelve array de productos (Coca Cola, Leche, Pan, Queso, ...). Datos reales de Supabase.

### 2.2 GET /api/sales
- **HTTP:** `200 OK` — devuelve ventas reales (`total: 195.5`, items con códigos de barras, fecha 2026-04-26).

### 2.3 GET /api/customers
- **HTTP:** `200 OK` — devuelve clientes reales (Luis Fernandez, Ana Martinez, Carlos Rodriguez, ...) con email/teléfono.

### 2.4 GET /api/reports/daily
- **HTTP:** `200 OK` — `total_revenue` por día (4 fechas, máx 700.64).

### 2.5 GET /api/owner/dashboard  (config/panel admin)
- **HTTP:** `200 OK` — métricas globales: 8 usuarios, 4 tenants, MRR 3097, ARR 37164.

**Resumen endpoints:** 5/5 responden 200 con datos reales **sin validar token**. La cabecera `Authorization` se ignora por completo.

---

## 3. Hallazgos críticos

| # | Severidad | Hallazgo |
|---|-----------|----------|
| H1 | CRÍTICA | No hay middleware de auth. Cualquier cliente sin token lee productos/ventas/clientes/reportes/dashboard de cualquier tenant. |
| H2 | CRÍTICA | Contraseñas almacenadas en texto plano (`password_hash` se compara con `===` contra `password` recibido). |
| H3 | ALTA | El "session" devuelto al cliente no es firmado (no JWT, no HMAC). Cliente puede inventar `role: "superadmin"` localmente. |
| H4 | ALTA | `SUPABASE_SERVICE_KEY` (rol `service_role`) está hardcodeado como fallback en línea 15 del repo — bypassea RLS. |
| H5 | MEDIA | `expires_at` se calcula pero nadie lo verifica — no hay expiración real. |
| H6 | MEDIA | `GET /api/products` deriva el `pos_user_id` solo del query string (`tenant_id`), un cajero de TNT001 puede ver productos de TNT002 cambiando el query. |
| H7 | BAJA | Login emite `pos_login_events` con `ip: 'serverless'` (literal), no la IP real (`x-forwarded-for`). |

---

## 4. Fix concreto propuesto

### 4.1 Emitir JWT firmado en login

En `api/index.js` añadir helper:

```js
const crypto = require('crypto');
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig    = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token) {
  if (!token) return null;
  const [h,b,s] = token.split('.');
  if (!h || !b || !s) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
  if (expected !== s) return null;
  const payload = JSON.parse(Buffer.from(b,'base64url').toString());
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}
```

En `POST /api/login` (línea 212), agregar `token`:

```js
const token = signJWT({
  sub: user.id, email: user.email, role: volvixRole,
  tenant_id: tenantId, exp: Date.now() + 3600*1000
});
sendJSON(res, { ok:true, token, session:{...} });
```

### 4.2 Middleware de auth en MAIN HANDLER (línea 753)

```js
const PUBLIC = new Set(['/api/login','/api/logout','/api/health','/api/status']);
if (pathname.startsWith('/api/') && !PUBLIC.has(pathname)) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const claims = verifyJWT(token);
  if (!claims) return sendJSON(res, { error:'unauthorized' }, 401);
  req.user = claims;
  // Tenant scoping: forzar tenant_id del token, ignorar query
  if (pathname.startsWith('/api/owner/') && claims.role !== 'superadmin' && claims.role !== 'owner') {
    return sendJSON(res, { error:'forbidden' }, 403);
  }
}
```

### 4.3 Hashing real de password

Migrar `password_hash` a bcrypt en Supabase (`UPDATE pos_users SET password_hash = crypt(...)`). Reemplazar línea 196:

```js
const bcrypt = require('bcryptjs');
if (!bcrypt.compareSync(password, user.password_hash)) return sendJSON(res, { error:'Credenciales inválidas' }, 401);
```

### 4.4 Variables de entorno en Vercel

Mover de hardcoded → Vercel env vars:
- `SUPABASE_SERVICE_KEY` (quitar fallback línea 15)
- `JWT_SECRET` (nuevo, mínimo 32 bytes random)
- Rotar la `SUPABASE_SERVICE_KEY` actual porque ya está expuesta en git.

### 4.5 Tenant scoping en `/api/products`

Reemplazar línea 282-284 por:
```js
const tenantId = req.user.tenant_id; // del JWT, no del query
const posUserId = TENANT_USER_MAP[tenantId];
if (!posUserId) return sendJSON(res, { error:'tenant inválido' }, 400);
```

---

## 5. Conclusión

- Login: **funciona** los 3 usuarios (200 OK).
- Protección: **NO EXISTE**. Los 5 endpoints aceptan tokens falsos. La aplicación está, en la práctica, completamente abierta a internet con datos reales de clientes, ventas y métricas financieras.
- Acción recomendada inmediata: aplicar fix 4.1+4.2+4.4 antes de cualquier despliegue a producción real.
