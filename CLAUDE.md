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
- [x] Aplicar `supabase-rls.sql` en dashboard de Supabase — **HECHO 2026-04-25** (7 tablas rowsecurity=true, 15 políticas, user_id+owner_user_id añadidos)
- [x] Crear `public/config.js` real con credenciales — **HECHO 2026-04-25**
- [x] Implementar `public/login.html` — **HECHO 2026-04-25** (26262 bytes, entregado por Claude AI)
- [ ] Roles implementados: owner, cajero, soporte (auth-gate.js ya está listo)

### Pendiente P1
- [ ] Sentry DSN real configurado
- [ ] Testing cross-browser real

### Pendiente P2
- [ ] Impresión térmica
- [ ] Scanner barcode hardware
- [ ] Corte de caja Z
- [ ] Onboarding wizard

---

## Páginas existentes

| Ruta | Descripción | Estado |
|---|---|---|
| `/` | Landing principal | OK |
| `/pos.html` | Punto de venta | Estilo SalvadoreX (ver con Claude AI si está bien) |
| `/owner.html` | Dashboard propietario | Genérico — pendiente diseño |
| `/inventario.html` | Gestión stock | Genérico — pendiente diseño |
| `/ai.html` | Motor IA | Genérico — pendiente diseño |
| `/soporte.html` | Tickets soporte | Genérico — pendiente diseño |
| `/login.html` | Login | OK — entregado por Claude AI 2026-04-25 (26262 bytes) |
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

### 2026-04-24 — Pendiente
- Esperando respuesta de Claude AI sobre: pantalla de login, lista completa de pantallas, paleta visual oficial, auditoría de lo entregado.
