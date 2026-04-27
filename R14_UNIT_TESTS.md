# R14 — Unit Tests (backend)

## Resultado

**40 passed / 0 failed** en ~547 ms. Sin frameworks, sin dependencias externas.

```bash
node tests/unit/run.js
```

## Archivos creados

| Archivo | Tests | Cubre |
|---|---|---|
| `tests/unit/run.js` | runner | Carga env de test, registra `describe`/`test` como globals, descubre `*.test.js`, ejecuta y reporta. |
| `tests/unit/auth.test.js` | 16 | `signJWT`, `verifyJWT` (válido / tampered / malformed / expired), `verifyPassword` (scrypt OK/KO, bcrypt rechazado, legacy plaintext, null), `requireAuth` (401 sin header, 401 malformed, 401 token inválido, 200 OK + `req.user`, 403 rol insuficiente, 200 rol permitido). |
| `tests/unit/validation.test.js` | 8 | `isUuid` (canonical / case / negativos), `isInt` (positivos, negativos, decimales, exp, espacios), `pickFields` (whitelist productos / users, null body, prototype-pollution safe). |
| `tests/unit/rate-limit.test.js` | 4 | 5 hits OK + 6º rechazado, aislamiento por key, expiración de ventana, primera llamada en bucket frío. |
| `tests/unit/cors.test.js` | 5 | `ALLOWED_ORIGINS` parseado, echo de origen permitido + `Vary: Origin`, fallback en origen no listado, sin header `Origin`, `Allow-Credentials: true`. |
| `tests/unit/security-headers.test.js` | 7 | Inserta exactamente los **6 headers** (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP) con valores correctos (HSTS preload, frame-ancestors none, nosniff, DENY, etc.). |
| `tests/unit/README.md` | docs | Cómo correr y cómo agregar tests. |

## Cambio en `api/index.js`

Al final del archivo se agregó un bloque que sólo expone los símbolos internos cuando `NODE_ENV === 'test'`:

```js
if (process.env.NODE_ENV === 'test') {
  module.exports.__test = {
    signJWT, verifyJWT, verifyPassword,
    rateLimit, rateBuckets,
    isUuid, isInt, pickFields,
    setSecurityHeaders, applyCorsHeaders, requireAuth,
    ALLOWED_ORIGINS, ALLOWED_FIELDS_PRODUCTS, ALLOWED_FIELDS_CUSTOMERS,
    ALLOWED_FIELDS_SALES, ALLOWED_FIELDS_TENANTS, ALLOWED_FIELDS_USERS,
    JWT_SECRET, JWT_EXPIRES_SECONDS,
  };
}
```

En producción (`NODE_ENV !== 'test'`) ese bloque queda inerte: `module.exports` sigue siendo el handler serverless habitual y no se filtra nada.

## Cómo arranca el runner

`run.js` setea **antes** de requerir `api/index.js`:

- `NODE_ENV=test`
- `JWT_SECRET=test-secret-key-for-unit-tests-only-32bytes`
- `SUPABASE_SERVICE_KEY=test-service-key`
- `SUPABASE_URL=https://test.supabase.co`
- `ALLOWED_ORIGINS=https://volvix-pos.vercel.app,https://app.volvix.com`

Si faltan, `api/index.js` aborta el boot (validación R13 #1 / #3), por eso el runner los inyecta.

## Decisiones técnicas

- **Sin Jest / Mocha / Vitest** → cero dependencias nuevas en `package.json`.
- **`node:assert/strict`** → comparaciones estrictas, mensajes de error útiles.
- **Mocks inline** → `mockRes()` con `setHeader`/`end`/`statusCode`; `req` es objeto plano. No se requiere `http`.
- **Test del expirado**: se forja un JWT con `exp: 1` reusando `JWT_SECRET`, así se valida la rama de expiración sin esperar 8h.
- **Aislamiento de rate-limit**: cada test usa una key única (`test:${Date.now()}:${random}`) para no chocar entre corridas.
- **Window reset** (rate-limit) usa `setTimeout 70ms` con ventana de 50ms — rápido y determinista.

## Comandos

```bash
# Correr todos
node tests/unit/run.js

# Exit code 0 si todo pasa, 1 si algo falla → listo para CI
```
