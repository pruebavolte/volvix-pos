# DECISIONS.md — Volvix POS

## Decisiones técnicas + trade-offs

### D1. tenant_id como TEXT, no UUID
**Decisión**: tenant_id en JWT y columnas DB es TEXT (ej: "TNT001", "DEFAULT").
**Por qué**: El tenant slug es human-readable, fácil de debug, evita JOIN para mostrar nombre.
**Trade-off**: Tuvimos que migrar 5+ tablas que originalmente eran UUID:
- pos_quotations, cuts, customer_payments, tenant_users, inventory_counts
- user_module_overrides, tenant_module_overrides, role_module_permissions, feature_flag_audit
**Lección**: Si vuelves a empezar, define TEXT desde día 1 en TODAS las tablas tenant-scoped.

### D2. JWT custom, no Supabase Auth
**Decisión**: Login POS usa JWT firmado con JWT_SECRET local, no `supabase.auth`.
**Por qué**: POS necesita pos_user_id (no auth.users), roles propios, permisos por módulo, tenant_id en payload.
**Trade-off**: No podemos usar `auth.uid()` directo en RLS — usamos `auth.jwt() ->> 'tenant_id'` y workarounds.
**Resultado**: RLS funciona pero requiere policies WITH CHECK explícitas en cada migration.

### D3. resolveOwnerPosUserId(tenantId) helper
**Decisión**: Cuando user.role = 'cashier' o 'inventory', queries de productos/sales filtran por OWNER's pos_user_id, no por user.id.
**Por qué**: Cashiers necesitan ver TODOS los productos del tenant (no solo los que ELLOS crearon). Owner es dueño del catálogo.
**Trade-off**: Si owner cambia, hay que actualizar pos_products.created_by_pos_user_id (no implementado aún).
**Lección**: Mejor design sería `tenant_id` directo en pos_products (sin pos_user_id) — pendiente refactor.

### D4. Fibonacci agent strategy (1-1-2-3-5-8)
**Decisión**: Lanzar agentes en serie Fibonacci, parar antes de Round 7 (13 agentes).
**Por qué**: Más de 13 agentes simultáneos crashea Claude Code en Windows.
**Trade-off**: A veces 8 agentes paralelos saturan quota y los últimos no terminan reportes — pero el código SÍ se commitea.
**Lección**: 5 agentes paralelos es el sweet spot; 8 si las tareas son muy independientes.

### D5. Stub shadow pattern
**Problema descubierto**: Múltiples archivos registraban handlers con la misma key `POST /api/quotations` — el último ganaba (stub vacío).
**Decisión**: POSTKEYS array filtra rutas que tienen real handler — eliminamos `/api/credits`, `/api/quotations`, `/api/returns`.
**Trade-off**: Hay que recordar agregar/quitar de POSTKEYS al añadir nuevos handlers.
**Mitigación**: Tests E2E catchearon esto — hay que ampliar smoke test.

### D6. Audit triggers dropped masivamente
**Problema**: 10 triggers `*_audit` en tablas nuevas referenciaban columna `entity` inexistente en volvix_audit_log.
**Decisión**: Drop dynamic con loop PL/pgSQL en migration b42-fix-v2.sql.
**Trade-off**: Perdemos audit en esas tablas hasta reescribir triggers que usen columnas reales.
**Pendiente**: Reescribir triggers con `(entity_type, entity_id, action, before_state, after_state, tenant_id, user_id)`.

### D7. Service Worker manual versioning
**Decisión**: VERSION en sw.js se bumpea manualmente (v1.12.2-b43 actualmente).
**Por qué**: No hay build pipeline — esbuild/vite agregaría complejidad para un proyecto vanilla.
**Trade-off**: Devs olvidan bumpear → users no reciben updates hasta hard reload.
**TODO**: TODO(build-step) marcado en sw.js línea 13.

### D8. Capacitor en lugar de React Native
**Decisión**: Wrap web app con Capacitor para Android/iOS.
**Por qué**: Reusar 100% del código web, no rewrite.
**Trade-off**: Performance inferior a native, pero suficiente para POS (no game).
**Estado**: Android scaffold listo + 12 plugins; iOS pendiente Mac + Apple Dev account.

### D9. Idempotency-Key obligatorio
**Decisión**: POST/PATCH críticos requieren header `Idempotency-Key` (UUID por request).
**Por qué**: Offline queue puede reintentar — sin idempotency duplica ventas.
**Trade-off**: Cliente debe generar UUID, complica integraciones third-party.
**Mitigación**: Front genera automáticamente con crypto.randomUUID().

### D10. RLS WITH CHECK separado
**Decisión**: Toda policy tiene USING (read) + WITH CHECK (write) separados, nunca un solo predicate.
**Por qué**: B40 audit detectó 18 tablas con WITH CHECK faltante = inserts cross-tenant posibles.
**Trade-off**: Más boilerplate en migrations, pero zero leaks verificado en B41.

### D11. Cierre Z con secuencia per-tenant
**Decisión**: z_report_sequences table con número incremental por tenant.
**Por qué**: SAT México requiere consecutivo por punto de venta.
**Trade-off**: Race condition si dos cuts simultáneos — usamos `FOR UPDATE` lock.
**Verificado**: Funciona, pero MVP-8 reporta sales_count:0 (bug aparte).

### D12. Multi-DB seeded data (10 tenants demo)
**Decisión**: 10 tenants demo seeded para testing y demos.
**Por qué**: Mostrar cross-tenant isolation en producción real.
**Trade-off**: 8460 ventas mock pueden confundir si superadmin ve agregados.
**Mitigación**: ALLOW_SEED_PROD env var bloquea re-seed accidental.

### D13. Promotions + Returns en migrations B43
**Decisión**: pos_returns + promotions tables creadas tarde (B43-W1-A).
**Por qué**: Original schema no las tenía — devoluciones era stub.
**Trade-off**: Devoluciones POST aún no calcula refund_amount (items field shape mismatch).
**Pendiente**: Fix shape items vs items_returned.

### D14. AI modules con ANTHROPIC_API_KEY
**Decisión**: AI features (smart search, demand forecast, etc) requieren ANTHROPIC_API_KEY.
**Por qué**: Anthropic Claude es el único LLM con quality + privacy aceptable para retail.
**Trade-off**: Bloqueado hasta usuario set env var en Vercel.
**Score actual**: 39/100 — todo lo demás (UI, prompts, flow) está listo.

### D15. Quota cuts en agentes
**Observación**: Agentes hit usage quota antes de terminar reportes finales (~3 de 5).
**Decisión**: Continuar — el código se commitea ANTES del crash.
**Verificación**: Post-quota greppeamos api/index.js +1369 líneas, salvadorex +1817 líneas confirmado.
**Lección**: No depender de reportes finales — verificar diff manualmente.

## Reglas de Coherence Charter aplicadas

- **R1 Label↔Handler**: B34 + B43 reviews catchearon "ghost buttons" (37 + 33 partial)
- **R2 Form validation**: 4 P1 fixes en B40 (u-password, r-name, login-email, etc)
- **R3 Loading/Error states**: Toast system + skeleton + spinner en TODA llamada API
- **R4 RLS verification**: B40 + B41 audits → ZERO violations
- **R5 Self-walkthrough**: Cada bug fix incluye E2E test Playwright
- **R6 Adversarial pass**: 3 personas (Saboteur/NewHire/Security) en B42
- **R7 No mentir**: Score real 84/100 reportado honestamente, no inflado
