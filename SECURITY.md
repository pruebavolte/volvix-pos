# Security Policy

## Versiones soportadas

| Version | Soporte |
|---------|---------|
| 7.3.x (R24) | si |
| 7.2.x (R23) | si (criticos) |
| 7.1.x (R21-R22) | parches criticos |
| <= 7.0.x | no |

## Reportar una vulnerabilidad

**No abras un issue publico.** Reporta privado a:

- Email: security@volvix.app
- PGP: bajo demanda

Incluye: descripcion, pasos repro, impacto, version (`/api/health`), PoC si tienes.

Respondemos en **48h habiles**. Disclosure coordinado: 90 dias o cuando hay parche, lo que ocurra primero.

## Scope

En scope:
- Autenticacion y autorizacion (JWT, roles, MFA).
- Aislamiento multi-tenant.
- Endpoints `/api/*` (250+ rutas).
- Sync engine offline / reconciliacion.
- Webhooks (Stripe, Shopify, QR, MercadoLibre).
- Manejo de secretos en server.js y api/*.

Fuera de scope:
- DoS volumetrico.
- Rate limiting de paneles publicos demo.
- Self-XSS.

## Practicas

- **Secretos**: solo en env vars. Nunca commitear `.env`. Ver `.env.example`.
- **Headers**: CSP + HSTS + X-Frame en R24 — `R24_SECURITY_HEADERS.md`.
- **HMAC**: webhooks verifican firma — `R16_WEBHOOK_VERIFY_EXAMPLES.md`.
- **JWT**: `JWT_SECRET` rotado por release. Tokens de 60min, refresh 30 dias.
- **Multi-tenant**: cada handler valida `tenant_id` del JWT vs recurso.
- **Seed users**: `SEED_USERS_JSON` solo dev. En prod los users viven en Supabase.
- **CORS**: `ALLOWED_ORIGINS` whitelist en prod.
- **Scan**: `node volvix-security-scan.js` corre en CI.

## Auditoria

Reportes publicos: `R13_SECURITY_AUDIT.md`, `R22_SECURITY_FIXES.md`, `R24_SECURITY_HEADERS.md`.

## Pendientes de seguridad — TODO

### CRITICAL (urgente, antes de prod escalable)

- **154 tablas Supabase sin RLS habilitado** (detectado 2026-05 via mcp Supabase advisor).
  - Impacto: cualquiera con la anon key puede leer/modificar todas las filas.
  - Tablas afectadas (parcial): `categories`, `products`, `pos_products`, `pos_sales`, `customers`, `verticals`, `vertical_templates`, `giros_synonyms`, `ingredients`, `recipes`, `volvix_audit_log_archive`, +144 mas.
  - Bloqueo: enabling RLS sin policies bloquea TODO acceso. Hay que disenar policies por tabla antes de habilitar.
  - Plan sugerido: empezar por las que contienen PII (`customers`, `pos_users`, `volvix_audit_log_archive`) — agregar policies `auth.uid()` + `tenant_id` match — luego enable.
  - SQL de remediacion (sin policies, NO ejecutar tal cual): disponible en log de mcp `list_tables` advisory `rls_disabled`.

### HIGH

- **Rotar Pexels API key + Google CSE API key** (committed en git history publico).
  - Pexels: rotar en https://www.pexels.com/api/ → reset key
  - Google CSE: rotar en https://console.cloud.google.com/apis/credentials?project=volvix-pos
  - Despues: agregar como Vercel env vars (NO en codigo).
  - Codigo ya gateado: si env var no existe, funcion retorna null (commit b570677).

### MEDIUM

- HTMLs en public/ asumen que `/auth-gate.js` valida roles client-side. Validar tambien server-side por endpoint (ya esta en la mayoria, auditar nuevos `/api/devoluciones`, `/api/queue`, `/api/marketing`, etc).
- Webhooks `/api/webhooks/uber-eats|rappi|didi-food` actualmente capturan payload sin validar firma. Antes de consumir en produccion, agregar HMAC verification por proveedor.

### Info Architecture / UX cleanup (skill ia-arquitectura)

- **Skill instalada:** `~/.claude/skills/ia-arquitectura/SKILL.md`
- **Quejas del usuario que motivan esto:**
  - "Alertas Stock" como boton hermano de "Inventario" -> deberia estar DENTRO
  - "Usuarios" como boton hermano de "Configuracion" -> deberia estar DENTRO
  - "Devoluciones" como boton hermano de "Historial Ventas" -> deberia estar DENTRO (flujo: ventas -> seleccionar venta -> Devolver)
  - Inputs de fecha pidiendo texto libre ("20-12-2026" o "veinte de diciembre") -> deberian ser date picker
  - Otros inputs mal usados (text donde deberia ser dropdown/radio/toggle/etc)
- **Reglas a aplicar:**
  - R1 Subconjunto: si A es parte de B, A va dentro de B
  - R2 Flujo de tarea: agrupar por flujo del usuario, no entidad tecnica
  - R3 Miller (7+-2): menu principal max 7 items, ideal 5
  - R4 Profundidad <= 3 niveles
  - R5 Lenguaje del usuario, no del programador
  - R6 Accion frecuente arriba, rara en submenus
  - R7 Una sola fuente de verdad (no duplicacion)
- **Proceso (sesion en curso):** FASE 1 mapeo -> FASE 2 analisis -> ESPERAR APROBACION -> FASE 3 plan commits -> FASE 4 aplicar uno a uno con OK individual

## Hall of Fame

Investigadores que reportaron responsablemente — bajo demanda, con permiso.
