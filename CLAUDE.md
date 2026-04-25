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

### Hecho
- `server.js` reescrito con Zod, rate limit, captureError, header nosniff
- `supabase-rls.sql` creado (RLS + Realtime publication; requiere `owner_user_id` en `volvix_tenants`)
- 8 landing pages por vertical
- Deploy en Vercel funcional
- E2E pasando 17/17
- **2026-04-24**: Claude AI entregó 7 archivos completos:
  - `public/config.example.js` — configuración Supabase
  - `public/volvix-tokens.css` — design tokens CSS (469 líneas)
  - `public/volvix-api.js` — API client Supabase (535 líneas)
  - `public/volvix-sync.js` — Sync Engine offline-first (602 líneas)
  - `public/volvix-sync-widget.js` — Widget flotante estado sync (415 líneas)
  - `public/auth-gate.js` — Auth Gate para todas las páginas protegidas (271 líneas)
  - `public/pos.html` — POS corregido completo con auth-gate (1812 líneas)

### Pendiente P0 (bloquea producción)
- [x] Aplicar `supabase-rls.sql` en dashboard de Supabase — **HECHO 2026-04-25**
- [x] Crear `public/config.js` real con credenciales — **HECHO 2026-04-25**
- [x] Implementar `public/login.html` — **HECHO 2026-04-25**
- [x] Roles implementados via auth-gate.js (superadmin, owner, cajero)
- [x] **FIX: Login infinito flasheo — HECHO 2026-04-25** ✅
  - Problema: `/api/login` endpoint implementado server-side
  - Antes: client-side async auth + buildVolvixSession() causaba timeout
  - Ahora: servidor maneja Supabase auth + queries en una sola respuesta
  - Pruebas: admin@volvix.test / Volvix2026! ✅ Funciona sin flasheo

### **SISTEMA BASE COMPLETO + DISEÑO OFICIAL — 2026-04-25** ✅
Claude AI confirmó: "El sistema base está completo."
Todos los archivos core entregados, verificados y en producción (Vercel).
**CRÍTICO ARREGLADO**: Login funciona con credenciales reales (sin inyección manual).
**DISEÑO ACTUALIZADO**: login.html reemplazado con diseño profesional oficial (glassmorphism, modern UI).

### Pendiente P1
- [ ] Sentry DSN real configurado
- [ ] Testing cross-browser real

### Pendiente P2 (Fase 4+ — bajo demanda, pedir a Claude AI con JSON spec)
- [ ] `public/volvix_ai_engine.html` — motor auto-evolución
- [ ] `public/volvix_ai_support.html` — soporte IA
- [ ] `public/volvix_ai_academy.html` — academia videos
- [ ] `public/volvix_remote.html` — control remoto VX-XXXX
- [ ] `public/marketplace.html` — landing captación
- [ ] `public/landing_dynamic.html` — 35 landings por giro
- [ ] `public/multipos_suite_v3.html` — 4 apps restaurante
- [ ] `public/etiqueta_designer.html` — diseñador etiquetas
- [ ] Impresión térmica
- [ ] Scanner barcode hardware
- [ ] Onboarding wizard

---

## Páginas existentes

| Ruta | Descripción | Estado |
|---|---|---|
| `/` | Landing principal | OK |
| `/login.html` | Login | ✅ 26262 bytes |
| `/pos.html` | Punto de venta | ✅ 1812 líneas |
| `/pos-inventario.html` | Gestión stock | ✅ 55618 bytes, 1496 líneas |
| `/pos-corte.html` | Corte de caja | ✅ 49726 bytes |
| `/pos-clientes.html` | CRM clientes | ✅ 52627 bytes, 1391 líneas |
| `/pos-reportes.html` | Reportes y analytics | ✅ 41813 bytes, 1000 líneas |
| `/pos-config.html` | Configuración | ✅ 74361 bytes, 1505 líneas |
| `/sw.js` | Service Worker PWA | ✅ 12747 bytes, 419 líneas |
| `/manifest.json` | PWA Manifest | ✅ 902 bytes |
| `/landing-*.html` | 8 verticales | OK |

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
- ✅ Redirección automática: owner → /volvix_owner_panel_v7.html
- ✅ Navegación entre páginas protegidas SIN re-login
- ✅ Todos los tabs (Ventas, Inventario, Clientes, etc) se cargan correctamente
- ✅ NO hay flasheo ni loops infinitos

**ARCHIVOS MODIFICADOS**:
- server.js: +schema login, +endpoint /api/login (45 líneas)
- login.html: modificado handleLogin() (simplificado ~15 líneas)
- Commit: 0c9da83 (pushed a master, auto-deploya Vercel)
