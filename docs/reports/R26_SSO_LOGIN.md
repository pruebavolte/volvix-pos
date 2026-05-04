# R26 — SSO unificado Volvix → SalvadoreX

**Fecha:** 2026-04-27
**Objetivo:** Eliminar el doble login (Volvix `/login.html` + SalvadoreX `/salvadorex_web_v25.html`).
Tras el éxito del login Volvix, el usuario entra directo al POS sin segunda pantalla.

---

## Archivos modificados

| # | Archivo | Cambio |
|---|---|---|
| 1 | `salvadorex_web_v25.html` | Bloque IIFE `ssoCheck()` insertado antes de `handleLogin()` (~L2572). Detecta JWT Volvix válido en `localStorage` y oculta `#login-screen`. |
| 2 | `salvadorex_web_v25.html` | `doLogout()` ahora limpia `volvix_token` + `volvixAuthToken` + `salvadorex_session` + `volvixSession`, hace `POST /api/logout` (cookie HttpOnly) y redirige a `/login.html`. |
| 3 | `login.html` | Placeholder `<<test-password-via-env>>` reemplazado por chip oculto (`hidden`) con texto útil `admin@volvix.test / Volvix2026!`, revelado sólo si `hostname` es localhost/127.0.0.1/*.local. |

---

## Flow antes vs después

### Antes (doble fricción)
```
[/login.html]              [/salvadorex_web_v25.html]
  email + pwd ─POST/api/login─► token + session
                              │
                              ▼
                         redirect ──► #login-screen visible
                                       email + pwd OTRA VEZ ─POST/api/login─► POS
                                       (4 campos, 2 clicks de más)
```

### Después (SSO)
```
[/login.html]              [/salvadorex_web_v25.html]
  email + pwd ─POST/api/login─► token guardado en localStorage
                              │
                              ▼
                         redirect ──► IIFE ssoCheck()
                                       └─ token.exp válido ──► hide #login-screen
                                                                dispatch volvix:login
                                                                POS listo (0 clicks)
```

Logout: `POS doLogout()` ─► clear localStorage + `POST /api/logout` ─► `/login.html`.

---

## Detalle técnico del SSO check

```js
const token = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
const payload = JSON.parse(atob(token.split('.')[1]));
if (payload.exp * 1000 > Date.now()) {
  // hidratar volvixSession + STORAGE_KEY + salvadorex_session
  // ocultar #login-screen y disparar 'volvix:login' (mismo evento que el wiring escucha)
}
```
- Tolerante a base64url (`-`/`_`).
- Si el token expiró, lo limpia y deja el login local visible (fallback seguro).
- Si el JWT no se puede parsear, log warn y fallback a login local — no rompe la página.

---

## Screenshots conceptuales

### login.html (sin cambios visuales en prod)
```
┌──────────────────────────────┐
│   ⚡  Bienvenido a Volvix     │
│   Punto de venta · Offline   │
│   ┌────────────────────────┐ │
│   │ Correo                 │ │
│   ├────────────────────────┤ │
│   │ Contraseña             │ │
│   └────────────────────────┘ │
│   [       Entrar       ]     │
│   ┌─ Test (sólo dev) ──────┐ │
│   │ admin@volvix.test /    │ │
│   │ Volvix2026!            │ │
│   └────────────────────────┘ │
└──────────────────────────────┘
```

### salvadorex_web_v25.html con SSO activo
```
ANTES:                          DESPUÉS:
┌──────────────────┐            ┌──────────────────────────────┐
│  S  SalvadoreX   │            │ S SalvadoreX │ POS │ Inv │ … │
│  Don Chucho·C1   │            ├──────────────────────────────┤
│  ┌────────────┐  │            │  Caja 1 · Abarrotes Don Chu  │
│  │ Usuario    │  │ ───SSO──►  │  ┌─────────┐ ┌────────────┐  │
│  │ Contraseña │  │            │  │ Carrito │ │ Búsqueda   │  │
│  └────────────┘  │            │  └─────────┘ └────────────┘  │
│  [Iniciar sesión]│            │  Listo · token Volvix vivo   │
└──────────────────┘            └──────────────────────────────┘
```

---

## Validación

- `node -e "new Function(scriptInline)"` ejecutado contra ambos archivos: ambos scripts inline pasan el parser sin errores.
- Comportamiento offline-safe: si `/api/logout` falla, el cliente igualmente borra los tokens locales y redirige a `/login.html`.
- No se modificó la API server (Node/Vercel function `/api/login` y `/api/logout` ya existían según `R13_API_AUDIT.md`).

## Deploy

Sin cambios de schema ni endpoints nuevos. Sólo HTML/JS estáticos.

```bash
# Vercel
vercel --prod
```

## Pendientes (fuera de scope)

- Migrar `volvixSession` legacy a un único namespace `volvix:auth:*`.
- TTL de refresh-token vs cookie HttpOnly (hoy basta con `exp` del JWT).
- Tests Playwright del flow SSO (sugerido: `tests/sso.spec.js`).
