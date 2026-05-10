# Volvix POS — Reglas de Oro para Claude (LEER SIEMPRE)

> Este archivo SOBREVIVE a la compactación de contexto. Si vuelves a este proyecto y NO recuerdas nada, lee esto PRIMERO.

---

## REGLA DE ORO #1 — NUNCA DECIDIR POR MI CUENTA

**Está PROHIBIDO** que yo (el agente) decida diseño, layout, pantallas, paleta de colores, flujos de UX, o interpretación visual por mi cuenta.

Flujo obligatorio:
1. Ir a Claude AI (URL exacto abajo)
2. Preguntar especificaciones exactas
3. Construir EXACTAMENTE como Claude AI dijo (al pie de la letra)
4. Mostrar resultado a Claude AI y preguntar: "¿Es lo que pediste?"
5. Si responde NO → rehacer hasta que diga SÍ

NUNCA decir frases tipo "Entiendo perfectamente, lo que construí es básico, voy a rehacerlo como X". Eso es decidir. Está prohibido.

---

## URL del chat de Claude AI (auditor del proyecto)

```
https://claude.ai/chat/455d7e93-082b-48d3-8f46-3e57301cd9fb
```

(Título: "Vista previa web". NO usar el chat viejo `067ada6a-a26d-4815-997c-bce232f5369c` — ese es de otra fase del proyecto.)

---

## REGLA DE ORO #2 — REPORTAR SIEMPRE A CLAUDE AI

Después de CADA cambio significativo:
1. Ir al chat de arriba
2. Reportar qué hice
3. Pedir auditoría / siguiente paso
4. NO quedarme idle

---

## REGLA DE ORO #3 — PROTEGERSE DE LA COMPACTACIÓN

La compactación la hace el sistema, no yo, cuando se llena el contexto. Para que NUNCA se pierda info crítica:
- Toda regla, URL, decisión de Claude AI → escribirla en este archivo
- Toda spec entregada por Claude AI → guardarla en `docs/specs/` con fecha
- Memoria global del usuario en `C:\Users\DELL\.claude\projects\D--github-COPIADOR-Y-PEGADOR\memory\MEMORY.md` (apuntar a este CLAUDE.md desde ahí)

---

## Stack del proyecto

- Backend: Node.js HTTP nativo (sin framework) — `server.js`
- DB: Supabase (PostgreSQL + Realtime + RLS)
- Deploy: Vercel serverless (`vercel.json`)
- Frontend: HTML/CSS/JS vanilla
- PWA: manifest + service worker
- Validación: Zod
- Rate limit: 100 req/min por IP (in-memory)
- Errores: Sentry opcional vía `SENTRY_DSN`

---

## Estado actual (snapshot — actualizar cuando cambie)

### **LIMPIEZA REPO 2026-05-04** ✅
Gran limpieza ejecutada. El repo ahora es coherente:
- `api/index.js` — servidor principal (~35K líneas, todos los endpoints)
- `public/` — TODOS los HTMLs (129 archivos), CSS, JS servibles
- `volvix-*.js`, `*.css` sueltos en root — módulos wiring activos (no tienen copia en public/)
- `giros-catalog.js` — catálogo activo (v1 es shim de compat)
- Root `.md` — solo los 10 esenciales (CLAUDE.md, CHANGELOG, SECURITY, etc.)
- `docs/` — docs de referencia
- `docs/reports/` — 200+ reportes de sesiones anteriores
- `scripts/` — herramientas de build/generate
- `docs/session-2026-05-03/` — handoff detallado de sesión 2026-05-03

**ARREGLOS CRÍTICOS en limpieza:**
- 6 archivos JS donde `public/` tenía versión INCOMPLETA vs root → reemplazados:
  - `sw.js`: 13KB → 19KB (service worker completo, background sync)
  - `volvix-modals.js`: 37KB → 44KB
  - `volvix-returns-wiring.js`: 3.5KB stub → 20KB completo
  - `volvix-stripe-wiring.js`: 7KB → 20KB
  - `volvix-perf-wiring.js`: 7KB → 16KB
  - `volvix-voice-wiring.js`: 7KB → 20KB
- `.env.production` removido de git tracking (tenía JWT_SECRET y ADMIN_API_KEY)
  **⚠️ ROTAR ESTAS KEYS** si no se ha hecho: ADMIN_API_KEY, JWT_SECRET en Vercel env
- 15 JS duplicados (root shadowed por public/) → eliminados del root

### Hecho (sistema completo en producción)
- Sistema base: login, POS, inventario, corte, clientes, reportes, config ✅
- Owner panel v7 (`/volvix-owner-panel.html`) — panel principal negocio ✅
- Owner panel v8 (`/volvix_owner_panel_v8.html`) — dashboard SaaS para @systeminternational.app ✅
- Marketplace con selector de giro y autocomplete ✅
- 59 landing pages en `public/` ✅
- Registration wizard + OTP (`/registro.html`) ✅
- Service Worker PWA con background sync ✅
- 178 giros + 1068 productos en Supabase ✅
- Launcher (`/volvix-launcher.html`) — hub de acceso por rol ✅

### Pendiente P1
- [ ] Sentry DSN real configurado
- [ ] Testing cross-browser real
- [ ] **ROTAR** JWT_SECRET y ADMIN_API_KEY (estuvieron en git)

### Pendiente P2 (Fase 4+ — bajo demanda)
- [ ] Impresión térmica (hardware)
- [ ] Scanner barcode hardware
- [ ] Onboarding wizard paso a paso

---

## Páginas existentes (todas en public/)

| Ruta | Descripción | Estado |
|---|---|---|
| `/` → `/marketplace.html` | Landing con selector de giro | ✅ |
| `/login.html` | Login glassmorphism | ✅ |
| `/registro.html` | Registro wizard + OTP | ✅ |
| `/pos.html` | Punto de venta | ✅ |
| `/pos-inventario.html` | Gestión stock | ✅ |
| `/pos-corte.html` | Corte de caja | ✅ |
| `/pos-clientes.html` | CRM clientes | ✅ |
| `/pos-reportes.html` | Reportes y analytics | ✅ |
| `/pos-config.html` | Configuración | ✅ |
| `/volvix-owner-panel.html` | Panel owner (negocio) | ✅ 264KB |
| `/volvix_owner_panel_v8.html` | Dashboard SaaS (@systeminternational.app) | ✅ 48KB |
| `/volvix-launcher.html` | Hub acceso por rol | ✅ |
| `/volvix-user-management.html` | Gestión usuarios | ✅ |
| `/multipos-suite.html` | Multi-sucursales | ✅ |
| `/etiqueta_designer.html` | Diseñador etiquetas | ✅ |
| `/landing-*.html` | 59 landings por giro | ✅ |
| `/sw.js` | Service Worker PWA completo | ✅ 19KB |
| `/manifest.json` | PWA Manifest | ✅ |

**Nota owner panel**: `/volvix-owner-panel.html` es el panel de negocios.
`/volvix_owner_panel_v8.html` es el dashboard de plataforma (solo para superadmin/@systeminternational.app).
La navegación en pos.html, pos-inventario, etc. apunta a v7. auth-gate redirige v8 solo a superadmins.

---

## Tablas Supabase

```
volvix_tenants    — empresas registradas (necesita owner_user_id)
volvix_productos  — catálogo por tenant
volvix_ventas     — historial de ventas
volvix_features   — feature flags
volvix_licencias  — planes activos
volvix_tickets    — soporte
volvix_usuarios   — usuarios por tenant
```

---

## Comandos útiles

```bash
# Local
node server.js                                # → http://localhost:3000

# E2E
node scripts/e2e.mjs                          # contra producción
node scripts/e2e.mjs http://localhost:3000    # contra local

# Deploy
git push                                       # Vercel auto-deploya main
```

---

## Variables de entorno

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SENTRY_DSN=                          # opcional
```

---

## Bitácora de decisiones de Claude AI

> Anotar AQUÍ cada respuesta importante de Claude AI con fecha, para que sobreviva la compactación.

### 2026-04-25 — SISTEMA BASE COMPLETO ✅
- Claude AI confirmó: "El sistema base está completo."
- Entregados y en producción: login.html, pos.html, pos-inventario.html, pos-corte.html, pos-clientes.html, pos-reportes.html, pos-config.html, sw.js, manifest.json
- Fase 4+ pendiente bajo demanda (8 archivos opcionales listados arriba)
- Para pedir Fase 4+: mandar JSON spec `{"task":"spec_screen","screen":"NOMBRE.html","question":"..."}` a Claude AI

### 2026-04-25 — FIX CRÍTICO #1: Login infinite redirect (flasheo) ✅
**SOLUCIONADO**: Implementación de /api/login server-side

### 2026-04-25 — FIX CRÍTICO #2: Login page congelamiento ("flasheo") ✅
**PROBLEMA**: Cuando usuario ingresaba credenciales, página se congelaba (renderer inresponsive)
**ROOT CAUSE**: `checkExistingSession()` llamaba a función antigua `buildVolvixSession()` que hacía queries complejas a Supabase y se colgaba
**SOLUCIÓN**:
- Removido el llamado a `buildVolvixSession()` desde `checkExistingSession()`
- Simplificado `buildVolvixSession()` para no hacer queries complejas
- /api/login maneja toda la lógica de roles y tenants server-side

**RESULTADO**:
- ✅ Login responde instantáneamente
- ✅ Sin congelamiento, sin "flasheo"
- ✅ Credenciales se ingresan sin problemas
- ✅ Redirige automáticamente al entrar
- Commit: 5984258
**PROBLEMA**: Cuando usuario ingresa credenciales en login.html:
- Se entraba en loop: login.html?expired=1&redirect=%2Fpos.html
- Página se "flasheaba" constantemente sin permitir entrada
- Session nunca se guardaba en localStorage
- auth-gate.js siempre encontraba sessión expirada y redirigía a login

**ROOT CAUSE IDENTIFICADO**:
- buildVolvixSession() en login.html es async
- Queries a volvix_usuarios y volvix_tenants tardaban/fallaban
- saveAndRedirect() nunca se ejecutaba
- Resultado: No había session en localStorage

**SOLUCIÓN IMPLEMENTADA**:
- Endpoint `/api/login` POST en server.js (línea 220-293)
- Server-side: Supabase auth + queries en UNA sola respuesta
- login.html: cambiado para llamar /api/login en lugar de buildVolvixSession()
- Session completa retornada en 1 roundtrip al cliente

**VALIDACIÓN**:
- ✅ Credenciales: admin@volvix.test / Volvix2026! FUNCIONAN
- ✅ Session se guarda en localStorage correctamente
- ✅ Redirección automática: owner → /volvix-owner-panel.html
- ✅ Navegación entre páginas protegidas SIN re-login
- ✅ Todos los tabs (Ventas, Inventario, Clientes, etc) se cargan correctamente
- ✅ NO hay flasheo ni loops infinitos

**ARCHIVOS MODIFICADOS**:
- server.js: +schema login, +endpoint /api/login (45 líneas)
- login.html: modificado handleLogin() (simplificado ~15 líneas)
- Commit: 0c9da83 (pushed a master, auto-deploya Vercel)

### 2026-04-28 — IMPLEMENTACIÓN COMPLETA: Registration Wizard + OTP ✅
**SITUACIÓN ANTERIOR**: Sesión anterior implementó flujo de registro E2E pero se perdió por error de JSON.

**BUGS DETECTADOS Y ARREGLADOS**:
1. **BUG-T1 (P0)**: Phone duplicate expone error SQL crudo
   - ❌ Antes: `code:23505, duplicate key violates pos_users_phone_key`
   - ✅ Ahora: `"Este teléfono ya está registrado, intenta otro o haz login"`
   - Ubicación: `/api/auth/send-otp` valida duplicados ANTES de intentar insertar

2. **BUG-T2 (P0)**: Bootstrap cargaba TODOS los productos sin filtrar
   - ❌ Antes: Tenant café → recibía [Aceite Barba, Aceite Mobil, Corte Cabello, ...]
   - ✅ Ahora: Tenant café → recibe [Café Americano] (solo giro=cafeteria)
   - Ubicación: Query a `pos_products_demo` filtra por `.eq('giro', giro)`

3. **BUG-T3 (P1)**: Productos duplicados x3-x4 en bootstrap
   - ❌ Antes: Café Americano × 3, Café Americano × 4
   - ✅ Ahora: Café Americano × 1 (sin duplicados)
   - Ubicación: Query con `group by` + ON CONFLICT en insert

**ARCHIVOS CREADOS**:
- ✅ `public/registro.html` (1200+ líneas) — Wizard 4 pasos profesional
- ✅ `db/R15_REGISTRATION.sql` — Tablas pos_users + pos_products_demo
- ✅ `SETUP_REGISTRATION.md` — Guía completa de configuración
- ✅ `test-e2e-registro.sh` — Script de pruebas E2E

**ENDPOINTS NUEVOS**:
- ✅ `POST /api/auth/send-otp` — Enviar OTP via Resend + Twilio
- ✅ `POST /api/auth/verify-otp` — Verificar OTP + crear tenant + bootstrap

**DEPENDENCIAS AGREGADAS**:
- `resend@^3.0.0` — Email OTP
- `twilio@^4.0.0` — WhatsApp OTP

**COMMIT**: 986a239

**ESTADO**: Listo para testing en producción. Requiere:
1. Ejecutar `db/R15_REGISTRATION.sql` en Supabase
2. Configurar `RESEND_API_KEY` + `TWILIO_*` en `.env`
3. `npm install` + `npm start`
4. Abrir `http://localhost:3000/registro.html`
