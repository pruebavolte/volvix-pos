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

- **RLS Supabase — progreso 2026-05:**
  - **Estado inicial:** 154 tablas sin RLS (advisory crítico de mcp Supabase).
  - **Aplicado en sesion 2026-05:** **54 tablas** con RLS + policy `service_role-only`.
    - Migraciones aplicadas: `volvix_batch1_devoluciones_queue`, `volvix_create_generic_blobs`,
      `volvix_rls_pii_phase1` (7 tablas), `volvix_rls_phase2_business_tables` (47 tablas).
    - **Phase 1 (PII/auth/financial)**: customer_otps, mfa_attempts, pos_credit_payments,
      pos_customer_rfc_history, pos_customer_payment_log, pos_oversell_log, portal_customers.
    - **Phase 2 (business)**: whatsapp_messages, whatsapp_subscribers, accounting_*,
      crm_*, leads, pipeline_stages, attendance, time_off, performance_reviews,
      employee_documents, ml_oauth_tokens, ml_listings, ml_orders, gdpr_requests,
      referrals, customer_wishlist, shop_reviews, customer_segments, segment_*,
      email_campaigns, email_*, drip_*, newsletter_subscribers, abtest_*,
      system_error_logs, system_health_pings, system_incidents,
      volvix_audit_log_archive, volvix_backup_history, user_tutorials,
      user_academy_progress, loyalty_*, shop_orders, request_nonces,
      feature_flag_requests, _backup_* (3 tablas).
    - **Policy aplicada**: `FOR ALL TO service_role USING (true) WITH CHECK (true)`.
      El api/index.js usa `SUPABASE_SERVICE_KEY` que ES service_role, asi que el
      server sigue accediendo. El anon key del cliente deja de poder leer/escribir.
    - **Verificado**: API endpoints `/api/giros/*`, `/api/queue`, `/api/menu-digital`,
      `/api/exchange-rates`, `/api/best-sellers` y landings siguen HTTP 200.
  - **Pendiente — ~100 tablas con RLS aun deshabilitado**, agrupadas por motivo:
    - **NO aplicar** (requieren realtime con anon key): `pos_sales`, `pos_products`.
      Para estas hay que disenar policies que permitan SELECT al rol authenticated
      filtrado por tenant_id, sin romper el wiring de realtime client-side.
    - **Legacy schema (probablemente sin uso real)**: `categories`, `products`,
      `orders`, `order_items`, `sale_items`, `customers`, `domains`, `verticals`,
      `vertical_categories`, `landing_pages`, `roles`, `permissions`, `system_modules`.
      Validar usage antes de tocar — si no se usa, RLS permisivo es seguro.
    - **v3 schema**: tablas v3_* sin RLS deberian quedar en service_role-only,
      es schema interno.
    - **pos_* misc**: pos_employees, pos_companies, pos_sync_events,
      pos_login_events, pos_download_events, pos_license_events — server-side
      only, podran irse a service_role-only en Phase 3.
  - **Roadmap sugerido**:
    1. Fase 3: aplicar service_role-only a tablas pos_*/v3_* sin uso client.
    2. Fase 4: para pos_sales/pos_products + tablas usadas client-side (realtime,
       direct queries), disenar policies tenant-aware con auth.role() o JWT claim
       custom de Supabase Auth.
    3. Re-correr advisor para validar 0 tablas sin RLS.

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
