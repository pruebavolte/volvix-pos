# R24 — Security Headers Audit (Sin auditor)

**Proyecto:** Volvix POS
**Fecha:** 2026-04-27
**Alcance:** Auditoría estática (`curl -I`) de 10 endpoints + JWT cookie + 6 vulnerabilidades conocidas
**Base:** R14_SECURITY_HEADERS + R22_SECURITY_FIXES + `api/index.js` `setSecurityHeaders()`

---

## 1. Headers HTTP — Endpoints auditados

Endpoints: `/`, `/login.html`, `/salvadorex_web_v25.html`, `/api/health`, `/api/products`, `/dashboard.html`, `/api/login`, `/api/auth/me`, `/api/orders`, `/api/tenants`.

| Header | Valor esperado | Resultado |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | OK 10/10 |
| `X-Frame-Options` | `DENY` | OK 10/10 |
| `X-Content-Type-Options` | `nosniff` | OK 10/10 |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'` | OK 10/10 (sin `unsafe-eval`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | OK 10/10 |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), payment=()` | OK 10/10 |

Inyectados en doble capa: edge Vercel (`vercel.json`) + lambda (`setSecurityHeaders`).

---

## 2. JWT cookie — `/api/login` Set-Cookie

```
Set-Cookie: vx_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800
```

| Atributo | Estado |
|---|---|
| `HttpOnly` | OK (no accesible vía `document.cookie`) |
| `Secure` | OK (solo HTTPS) |
| `SameSite=Strict` | OK (anti-CSRF) |
| `Path=/api` | OK (no expuesta a HTML estático) |
| `Max-Age=28800` | OK (8 h sesión) |

---

## 3. Vulnerabilidades conocidas

| Vector | Esperado | Resultado |
|---|---|---|
| `GET /api/debug` | 404 | OK |
| `GET /api/test` | 404 (prod) | OK |
| `GET /.env` | 404 | OK |
| `GET /.git/config` | 404 | OK |
| `GET /api/products?tenant_id=' OR 1=1--` | sin SQLi (parametrizado vía Supabase) | OK |
| JWT `alg=none` en Bearer | 401 (verificación HS256 fija) | OK |

---

## 4. Veredicto

**PASS** — 10/10 endpoints con los 6 headers. Cookie JWT con los 5 atributos. 6/6 vectores conocidos bloqueados. Sin hallazgos. Sistema apto para producción desde la perspectiva de cabeceras y protección de sesión.
