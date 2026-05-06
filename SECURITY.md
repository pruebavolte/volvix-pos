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
  - **Phase 3 (~65 tablas, sesion 2026-05-06)**: pos_employees, pos_companies,
    pos_*_events, pos_cash_sessions, pos_credits, pos_tenants, pos_services,
    pos_staff, pos_appointments, pos_waitlist, v3_* (7 tablas internas),
    vertical_templates, giros_synonyms, verticals, vertical_template_products,
    vertical_categories, inventory_warehouses + warehouse_*, vendors + vendor_*,
    NFT/web3, companies, tenant_button_overrides, tenant_admin_notes, tenant_*,
    promotion_uses, loyalty_tiers, loyalty_transactions, feature_modules,
    module_pricing, service_providers, airtime_carriers, coupons, flash_sales,
    bundles, product_recipes, product_variants_v2, product_modifiers,
    product_rules, product_feature_flags, tenant_terminology, remote_terminals,
    remote_commands, user_recent_apps, user_favorites_order, cfdi_templates.
  - **Phase 4 (~28 tablas)**: legacy V1 schema (categories, global_products,
    ingredients, recipes, orders, order_items, order_item_variants,
    sale_item_variants, variant_types, product_variants, returns, return_items),
    auth/perm legacy (permissions, roles, role_permissions, user_tenants,
    system_modules), domains, landing_pages, subscription_plans, subscriptions,
    subscription_events, subscription_invoices, sat_clave_prodserv,
    sat_clave_unidad, sat_forma_pago, sat_metodo_pago, sat_uso_cfdi,
    sat_regimen_fiscal.

  - **Phase 5 (4 tablas con realtime, sesion 2026-05-06)**:
    pos_sales, pos_products, kds_tickets, kds_stations.
    Policy hibrida:
      - service_role: FOR ALL USING (true) WITH CHECK (true)
      - anon + authenticated: FOR SELECT USING (true)
    Esto cierra el advisor warning sin romper el wiring de Realtime client-side.
    NO es la solucion final tenant-aware (anon todavia puede leer todas las
    filas de todos los tenants), pero:
      1. Bloquea writes desde anon (antes podia INSERT/UPDATE/DELETE)
      2. Mantiene Realtime SELECT funcionando
      3. Service_role conserva control total via api/index.js

  - **TOTAL aplicado: 154 de 154 tablas con RLS habilitada.**
    **Advisor RLS_disabled CERRADO al 100% en sesion 2026-05-06.**

  - **Phase 6 (futura iteracion - tenant-aware policies)**:
    Para que un cliente con anon key SOLO vea sus propias ventas/productos:
    1. Implementar Supabase Auth (signInWithPassword/Magic Link) o
       firmar JWTs custom con `auth.uid()` y `tenant_id` claim.
    2. Reemplazar policies de las 4 tablas realtime con:
       FOR SELECT TO authenticated USING (
         tenant_id = (SELECT tenant_id FROM volvix_tenants
                      WHERE owner_user_id = auth.uid())
       )
    3. Anon role: revocar SELECT (ya no necesario si los clientes auth con Supabase).
    4. Re-correr advisor para validar que policies son tenant-strict.

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
