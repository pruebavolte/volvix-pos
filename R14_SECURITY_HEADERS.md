# R14 — Hardening de Security Headers HTTP

**Proyecto:** Volvix POS
**Fecha:** 2026-04-26
**Alcance:** `api/index.js` (helper `setSecurityHeaders`) + `vercel.json` (capa edge)
**Verificación CSP:** `grep "unsafe-eval"` en `api/index.js` y `vercel.json` → **0 matches** (correcto)

---

## 1. Resumen

Se agregó un helper `setSecurityHeaders(res)` en `api/index.js` que aplica 6 headers de seguridad a TODA respuesta (JSON, estática, errores, 404, OPTIONS). Adicionalmente, los mismos headers se declaran en `vercel.json` bajo `headers[].source = "/(.*)"`, de modo que el edge de Vercel los inyecte ANTES de invocar la lambda — más rápido y robusto frente a caches o respuestas que no pasen por `sendJSON`.

Se invoca `setSecurityHeaders(res)` en:
- Inicio del `module.exports` handler (cubre OPTIONS y rutas estáticas).
- `sendJSON()` (cubre todas las respuestas JSON de la API).
- `serveStaticFile()` en la rama 200 y en la rama 404 fallback.

No se rompe funcionalidad: los headers son aditivos, CORS y `Cache-Control` existentes se mantienen.

---

## 2. Headers agregados

| Header | Valor | Dónde |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | `api/index.js` (`setSecurityHeaders`) + `vercel.json` |
| `X-Content-Type-Options` | `nosniff` | `api/index.js` + `vercel.json` |
| `X-Frame-Options` | `DENY` | `api/index.js` + `vercel.json` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `api/index.js` + `vercel.json` |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), payment=()` | `api/index.js` + `vercel.json` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'` | `api/index.js` + `vercel.json` |

**Nota CSP:** se permite `'unsafe-inline'` solo en `script-src` y `style-src` por compatibilidad con los HTML actuales (login.html, dashboards y wirings inline). NO se incluye `'unsafe-eval'`. `connect-src` permite Supabase. `frame-ancestors 'none'` refuerza `X-Frame-Options: DENY`.

---

## 3. Verificación con curl

Producción (Vercel):

```bash
curl -sI https://volvix-pos.vercel.app/login.html | grep -iE "strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy|content-security-policy"
```

Headers individuales:

```bash
# HSTS
curl -sI https://volvix-pos.vercel.app/ | grep -i "strict-transport-security"
# Esperado: strict-transport-security: max-age=63072000; includeSubDomains; preload

# nosniff
curl -sI https://volvix-pos.vercel.app/api/health | grep -i "x-content-type-options"
# Esperado: x-content-type-options: nosniff

# Anti-clickjacking
curl -sI https://volvix-pos.vercel.app/ | grep -i "x-frame-options"
# Esperado: x-frame-options: DENY

# Referrer
curl -sI https://volvix-pos.vercel.app/ | grep -i "referrer-policy"
# Esperado: referrer-policy: strict-origin-when-cross-origin

# Permissions
curl -sI https://volvix-pos.vercel.app/ | grep -i "permissions-policy"
# Esperado: permissions-policy: geolocation=(), camera=(), microphone=(), payment=()

# CSP
curl -sI https://volvix-pos.vercel.app/ | grep -i "content-security-policy"
# Esperado: content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; ...
```

Verificar API JSON:

```bash
curl -sI https://volvix-pos.vercel.app/api/health
```

Test negativo de `unsafe-eval` (NO debe aparecer):

```bash
curl -sI https://volvix-pos.vercel.app/ | grep -i "unsafe-eval" && echo "FALLO: unsafe-eval detectado" || echo "OK: sin unsafe-eval"
```

Validador online recomendado:
- https://securityheaders.com/?q=https://volvix-pos.vercel.app
- https://csp-evaluator.withgoogle.com/

---

## 4. Verificación local (grep)

```bash
grep -n "unsafe-eval" api/index.js vercel.json
# Resultado: (vacío) → OK
```

---

## 5. Observaciones / próximos pasos

- Si en el futuro se eliminan los `<script>` y `<style>` inline de los HTML, se puede endurecer la CSP retirando `'unsafe-inline'` y/o pasando a `nonce`/`hash`.
- El dominio `https://cdn.jsdelivr.net` permanece en `script-src` porque varios HTML lo usan para librerías. Si se autohospedan, retirar.
- HSTS `preload` requiere envío a https://hstspreload.org una vez confirmado que TODOS los subdominios sirven HTTPS.
