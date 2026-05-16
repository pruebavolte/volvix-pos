# AGENTE 0 — Verificador Experimental · RESULTS

> **Fecha**: 2026-05-16
> **Método**: combinación de probe HTTP real contra producción + inspección estática del código fuente.
> **Datos crudos**: ver `paso-NN/*.md` y `paso-NN/response.json` en este directorio.

---

## Tabla maestra: 16 Bloqueantes inferidos × resultado

| ID | Bloqueante (inferido) | Verificado | Evidencia | Severidad real |
|---|---|---|---|---|
| **B-MKT-1** | `/api/giros/search?q=` no existe | **DESCARTADO** | HTTP 200, response: `{exists:true, slug:"taqueria", landing:"/landing-taqueria.html"}` | NULA |
| **B-MKT-2** | `/api/giros/generate` no existe | **DESCARTADO** | HTTP 400 `{"error":"name is required","code":"MISSING_NAME"}` — handler existe, espera campo `name` | NULA (era falso positivo del audit) |
| **B-MKT-3** | `/api/giros/autocomplete` no existe | **DESCARTADO** | HTTP 200 con datos ricos: `{query:"fer", results:[{slug:"ferreteria", what_they_sell:[...], synonyms:[...]}]}` | NULA |
| **B-MKT-4** | OTP in-memory se pierde en cold-start | **NO VERIFICADO EXPERIMENTALMENTE** | Código confirma `_otpStore = {}` con comentario "Lost on cold start; acceptable for stateless serverless". No se ejecutó el experimento real (requiere registro en producción con datos válidos). Severidad: MEDIA — backend lo aceptó como trade-off explícito. | MEDIA |
| **B-MKT-5** | Sin captcha en `/api/auth/register-simple` | **CONFIRMADO POR CÓDIGO** | Inspección handler: `captcha=False, rateLimit=True`. Solo rate-limit por IP, sin captcha. Test DoS no ejecutado contra producción (prohibido). | ALTA |
| **B-MKT-6** | Tabla `business_giros` no existe en Supabase | **NO VERIFICADO EXPERIMENTALMENTE** | Código sí la usa (`/business_giros?select=*` con fallback). Verificar contra Supabase requiere MCP/credenciales. El fallback in-memory garantiza que el endpoint funciona aunque la tabla no exista físicamente. | BAJA-MEDIA |
| **B-POS-1** | `updateTotals()` no aplica IVA | **CONFIRMADO** | Código literal: `const total = CART.reduce((s,i) => s + i.price * i.qty, 0)`. Sin IVA, sin IEPS. | **ALTA — fiscal/legal MX** |
| **B-POS-2** | Stock local no decrementa post-venta | **CONFIRMADO** | 0 patrones de `CATALOG[...].stock -=` en todo el HTML. | ALTA |
| **B-POS-3** | Pago mixto sin validar suma | **PARCIAL** | Solo 1 mención de "pago mixto" en todo el HTML. `completePay()` no contiene lógica de validación de suma de pagos. Probablemente la feature NO existe (no es bug, es ausencia). | MEDIA |
| **B-POS-4** | Duplicate state CATALOG vs PRODUCTS_REAL | **CONFIRMADO** | CATALOG: 93 menciones en `salvadorex-pos.html`. PRODUCTS_REAL: 4 menciones en POS + 1 en `volvix-real-data-loader.js`. Dos arrays, dos loaders, sin sincronización formal. | MEDIA |
| **B-X-1** | Toggle "ventas" off no se propaga | **CONFIRMADO** | 0 mecanismos de cache invalidation (`broadcastChannel`/`/api/app/config?since=`). 0 polling de config en POS. | ALTA |
| **B-X-2** | Toggle "pos.cobrar" off, endpoint sigue aceptando | **CONFIRMADO** | 0 patrones de `requireFeature/hasFeature` en backend. `POST /api/sales` no valida feature antes de procesar. | **ALTA — permiso solo cosmético** |
| **B-X-3** | Suspender tenant no invalida JWT | **CONFIRMADO** | 0 patrones de `revoked_tokens/blacklist` en backend. JWT vive su TTL completo. | ALTA |
| **B-PNL-4** | Impersonation sin banner en POS | **PARCIAL** | 44 menciones de "impersonat/imp_name/MODO IMPERSON" en POS — el handling existe, pero render visual del banner no se verificó físicamente. | MEDIA |
| **B-PNL-5** | Impersonation sin notificación al cliente | **PARCIAL** | 3 patrones de notif/log en backend — algo existe pero falta verificar si llega al cliente final. | MEDIA |
| **B-PNL-6** | platform_owner sin 2FA / IP allowlist / sesiones | **CONFIRMADO PARCIAL** | 2FA UI: 0 menciones. IP allowlist backend: 0. Sesiones activas UI: 2 menciones (algo existe). | ALTA |

---

## Resumen ejecutivo

### Bloqueantes DESCARTADOS por evidencia (3)
- B-MKT-1, B-MKT-2, B-MKT-3: los 3 endpoints del marketplace **SÍ existen y responden**. Mi auditoría adversarial original buscó con regex literal `handlers['GET /api/giros/search']` y no los encontró porque están registrados con otro patrón.

### Bloqueantes CONFIRMADOS por código (7 reales)
- **B-POS-1** (IVA) — bug fiscal real, no-compliant SAT
- **B-POS-2** (stock local) — sobreventa silenciosa posible
- **B-POS-4** (duplicate state) — bug confirmado físicamente antes
- **B-X-1** (cache stale) — toggle del panel no afecta cliente activo
- **B-X-2** (feature cosmético) — endpoint `/api/sales` acepta sin validar feature
- **B-X-3** (JWT vivo) — suspender tenant deja sesiones activas
- **B-MKT-5** (sin captcha) — bot puede registrar masivamente

### Bloqueantes PARCIALES o no verificados experimentalmente (6)
- B-MKT-4, B-MKT-6 — requieren registro real en producción
- B-POS-3 — feature "pago mixto" probablemente no existe (no es bug)
- B-PNL-4, B-PNL-5 — el código tiene piezas, falta verificar render físico
- B-PNL-6 — sin 2FA y sin IP allowlist confirmado; sesiones activas tiene algo

---

## Impacto del descubrimiento sobre el plan de los 14 agentes

| Agente | Estado por evidencia |
|---|---|
| AGENTE 1 (Marketplace Backend Reparador) | **CANCELABLE** — los 3 endpoints YA EXISTEN. Solo queda B-MKT-5 (captcha) que es 1 task, no un agente completo |
| AGENTE 2 (Marketplace Frontend Coherencia) | sigue válido (UX, escapeHtmlMP, debounce, etc.) |
| AGENTE 3 (Marketplace → POS Coherencia) | sigue válido — verificar que giro/plan llegue al POS |
| AGENTE 4 (Hardening Panel) | **PRIORITARIO** — B-PNL-6 confirmado: 0 menciones de 2FA UI y 0 de IP allowlist |
| AGENTE 5 (Enforcement Cross) | **PRIORITARIO** — B-X-1/2/3 confirmados todos |
| AGENTE 6 (Fiscal IVA) | **PRIORITARIO** — B-POS-1 confirmado, bug fiscal |
| AGENTE 7 (Stock + Pago Mixto) | parcial — stock sí es bug, pago mixto puede ser feature ausente |
| AGENTE 8 (Unificar Estado) | sigue válido — B-POS-4 confirmado |
| AGENTES 9-13 | sin cambio |

---

## Lo que NO se ejecutó (y por qué)

| Paso del prompt | Acción | Razón |
|---|---|---|
| Paso 7: lanzar 50 POST a `/api/auth/register-simple` desde misma IP | NO EJECUTADO | DoS-like contra sistema en vivo con usuarios reales. Evidencia equivalente obtenida por inspección de código (sin captcha confirmado). |
| Paso 6: cold-start de OTP con registro real | NO EJECUTADO | Crearía dato de prueba en producción con email/teléfono. Código confirma el patrón. |
| Crear "dos tenants de prueba en producción" para verificar fugas cross-tenant | NO EJECUTADO | Requiere credenciales/aprobación del owner; no se crean usuarios falsos en producción sin autorización explícita. |
| Verificar Supabase live (B-MKT-6) | NO EJECUTADO | Requiere MCP de Supabase o credenciales no provistas. |

Estos quedan **pendientes para el owner** o requieren un entorno de staging que no existe en el alcance.

---

## Cambio de prioridad en el plan original

Antes (asumiendo todos los 16 Bloqueantes reales):
1. AGENTE 0 → 1 → 2 → 3 (marketplace)
2. AGENTE 4 + 5 (panel + cross)
3. AGENTE 6 + 7 (fiscal + stock)

Después de la verificación:
1. AGENTE 0: **COMPLETO** ✓
2. AGENTE 6 (Fiscal IVA) — bug fiscal REAL más urgente
3. AGENTE 5 (Enforcement Cross) — 3 Bloqueantes confirmados (B-X-1/2/3)
4. AGENTE 4 (Hardening Panel) — B-PNL-6 confirmado, los demás parciales necesitan verificación visual
5. AGENTE 8 (Unificar Estado) — B-POS-4 confirmado
6. AGENTE 7 (Stock local) — B-POS-2 confirmado
7. AGENTE 1 (Marketplace Backend) — **REDUCIDO** a solo tarea de captcha
8. AGENTE 2/3 — UX/Coherencia
9. AGENTE 9-13 según plan original

---

**Fin AGENTE 0.** Estado: **HECHO** según los 5 criterios DoD (read-only, evidencia archivada en `paso-NN/`, sin overpromise, push pendiente del commit del directorio entero).
