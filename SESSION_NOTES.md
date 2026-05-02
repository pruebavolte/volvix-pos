# Volvix POS · Session Notes (handoff comprimido)

**Última sesión:** 2026-05-02. Commit current = `3f78299` (live en producción).

## Estado del sistema

- Dominio canónico: `systeminternational.app` (Vercel) · `salvadorexoficial.com` redirige
- Vercel project: `prj_2f9m0VwArnqlGvlBZtxchvQl1a2t` en `grupo-volvixs-projects`
- Supabase project: `zhvwmzkcqngcaqpdxtwr`
- Branch tracking: `main` (NO `master` — eso causó meses de "Preview no promociona a Production")
- 186 URLs HTML servidas, 100% cable depth, 0 errores 5xx en producción
- 697 backend API paths registrados

## Stack y arquitectura

- Backend: monolito `api/index.js` (~32k líneas) + módulos en `api/*.js`
- `module.exports = { build }` factory pattern, `handlers['METHOD /path'] = fn` map
- `ctx.sendJson(res, body, status)` — orden (res, body, status). En módulos viejos era (res, status, body), tienen wrapper de traducción
- `supabaseRequest('GET'|'POST'|'PATCH'|'DELETE', path, body?)`
- `requireAuth()` middleware
- JWT con `role`, `email`, `tenant_id`
- Cache strategy: HTML max-age=0 must-revalidate, `/volvix-X.js?v=HASH` max-age=1y immutable
- `serveStaticFile(res, pathname, fullUrl)` reescribe `<script src="/volvix-*.js">` a `?v=COMMIT_SHA` automático

## Providers status (live `/api/payments/health`)

| Provider | Status | Nota |
|---|---|---|
| Email (Resend) | ✅ ON | RESEND_API_KEY |
| Stripe | ✅ ON | live keys cargadas |
| Mercado Pago | ✅ ON | live keys cargadas |
| AI Gateway (Vercel) | ✅ ON | `AI_GATEWAY_API_KEY` (vck_...), default `openai/gpt-4o-mini`, base `https://ai-gateway.vercel.sh/v1` |
| Twilio Verify | ⚠️ Trial | TWILIO_VERIFY_SERVICE_SID configurado pero cuenta en trial — sólo manda a números verificados. Bridge `dev_code` activo en respuesta. Para producción real: upgrade Twilio. |
| Recargas / Servicios | ✅ MP-bridge | Cobro vía MP, fulfillment manual hasta firmar reseller (Recargaki/Dimo/Speei) |
| CFDI (Facturama) | 🔴 OFF | Falta FACTURAMA_USER + FACTURAMA_PASSWORD |
| STP / CoDi | 🔴 OFF | Convenio corporativo, no urgente |

## Bugs cerrados en esta sesión (orden cronológico)

1. **B9/B10** `sendJson(res, status, body)` vs `(res, body, status)` en abtest.js + email-resend.js → wrapper traductor
2. **B7** alias `/api/admin/tenants` → `/api/admin/tenant` zombie removido
3. **9 endpoints faltantes cabledos**: /api/version, /api/giros/list, /api/marketplace/stores, /api/marketplace/products, /api/admin/tenants (GET), /api/recargas/health, /api/services/health, /api/errors/log, /api/academy-progress, /api/tenant/settings
4. **5 endpoints en español**: /api/clientes, /api/productos, /api/support/online, /api/academy/stats, /api/downloads/stats
5. **POS searchProduct cascade 4-niveles**: CATALOG → tenant DB → owner global lib → internet (OpenFoodFacts/UPCitemDB) → modal nuevo
6. **Modal Nuevo producto smart**: SKU oculto, auto-barcode 1,2,3, inline duplicate check rojo/verde/ámbar (fail-closed), Enter→next field, post-save panel "Imprimir etiqueta" (cantidad + 58/80/A4 + Diseñar+Imprimir)
7. **5 issues adversariales** en POS scan: SEC1 owner-lookup auth-gated, N1 const→let, S1 in-flight guard, S2 server-side dup-check, SEC2 credentials:include, S3 next-barcode O(200), S4 fail-closed, SEC4 leak prevention
8. **register-simple ReferenceError** `hasSmsFrom` indefinido tras refactor → `anyProviderAvailable`
9. **Twilio Verify integration**: `r12o3aTwilioVerifyStart/Check`, branch en register-simple cuando `TWILIO_VERIFY_SERVICE_SID` está
10. **Facturama Multi-Emisor** (`api/facturama.js`): cada tenant sube su CSD, 9 endpoints + portal autofactura público `/autofactura.html`
11. **AI giro classifier** público `POST /api/ai/giro-classify` con 3 niveles: literal → synonym → AI Gateway. Cabledo en marketplace + registro
12. **Force light mode**: `forceLightModeAlways()` en uplift wiring anula `@media (prefers-color-scheme:dark)`
13. **Cache busting**: hash `?v=COMMIT_SHA` inyectado en HTML, JS hashed = immutable 1 año
14. **Granular per-tenant 3 estados**: `enabled` / `hidden` (remueve DOM) / `locked` (overlay candado + modal con `lock_message` custom). 4 endpoints + frontend wiring `volvix-module-flags-wiring.js` + migration
15. **Bug crítico** `req.url` en serveStaticFile (no en scope) → reescribió signature `(res, pathname, fullUrl)`
16. **F12 calculadora**: billetes MX rápidos ($20-$1000), EXACTO, numpad 3x4, cambio gigante 22px verde
17. **22 industry schemas** (`data/industry-schemas.json`) con campos por giro, terminologías dinámicas, tipos (text/number/money/select/boolean/date/image/etc.)
18. **/api/industry-schema?giro=X** endpoint
19. **MP-bridge para recargas + services** (`createMercadoPagoPreference`, webhooks)
20. **Cache fix `serveStaticFile`** override que setea max-age=3600 manual

## Lo nuevo en este turno (lo que estoy construyendo)

**Concepto del usuario** (importante guardar):
> "Sistema universal modular basado en features. NO un modal por giro. UN modal que activa/desactiva: usa_receta, usa_lote, usa_caducidad, usa_serie, usa_motor, usa_variantes, usa_modificadores, usa_horarios, usa_compuestos, usa_insumos, usa_comision, usa_garantia, usa_peso, usa_color, usa_talla, usa_preparacion, usa_imei, usa_vin, usa_alergenos, usa_patente, usa_ingrediente_activo. Productos: simple vs compuesto/receta/kit (six = 6 latas, hamburguesa = 2 panes+carne+queso). Variantes ≠ Modificadores. Reglas dinámicas: horario, día, ley seca, precio premium fuera de horario. Terminología dinámica: cliente↔paciente↔huésped↔alumno↔miembro."

### Construyendo (pendiente de commit en este turno):
1. `data/industry-seed-products.json` — 40 giros × 10 productos comunes (deposito-cerveza, restaurante, taller, abarrotes, farmacia, etc.)
2. Extensión `industry-schemas.json`: feature flags universales (`usa_*`)
3. Migration SQL nueva: `product_recipes`, `product_variants`, `product_modifiers`, `product_rules` (horarios/precios), `tenant_terminology` (diccionario)
4. Endpoints: `GET /api/industry-seed/:giro`, `POST /api/products/recipe`, `POST /api/products/variants`, `POST /api/products/modifiers`, `POST /api/products/rules`, `GET /api/tenant/terminology`

## Pendientes (mañana o próxima sesión)

### Alta prioridad
- **Modal Nuevo producto dinámico**: leer `/api/industry-schema` + flags del tenant → renderizar campos dinámicos. Los `usa_*` flags activan secciones (recetas, variantes, modificadores, reglas)
- **Pre-load productos** desde `industry-seed-products.json` cuando el tenant elige giro al onboarding
- **Modelo Reseller white-label** (Alexis Nails): tabla `resellers`, campo `reseller_id` en pos_companies, panel filtrado, branding propio
- **Página admin para toggle granular** (tenants × módulos × botones × campos × terminología)
- **Diccionario terminología in-DOM**: wiring que reemplace "cliente" → "paciente" automático según giro

### Media prioridad
- Cuenta `claude@systeminternational.app` (staff de plataforma) — usuario lo pidió como "amiga / co-founder"
- Twilio upgrade a paid (acción del usuario)
- Cuenta Facturama Multi-emisor (acción del usuario)
- Aplicar migrations SQL en Supabase (acción del usuario): `tenant-module-button-flags.sql`, `facturama-multi-tenant.sql`, próximo: motor universal
- Reseller whitelabel completo

### Baja prioridad
- 16 migrations R14-R19 fixes (algunas redundantes con las que ya están aplicadas)
- Comprar número Twilio dedicado (cuando primer cliente pague)
- Convenios reseller real (Recargaki/Dimo/Speei) y CFE (BBVA Apps)

## Cuentas y URLs clave

- **Superadmin**: admin@volvix.test / Volvix2026! → /login.html
- **POS**: /salvadorex_web_v25.html (multipos_suite_v3.html alternativo)
- **Owner panel**: /volvix_owner_panel_v8.html (oculto excepto superadmin via `data-vlx-owner-only`)
- **Registro nuevo cliente**: /registro.html (phone + business + giro + pass + OTP)
- **Marketplace**: / o /marketplace.html (entry point, AI giro classifier)
- **Autofactura pública**: /autofactura.html?tenant=X&ticket=Y

## Files clave (para retomar)

- `api/index.js` — backend monolito (~32k líneas)
- `api/facturama.js` — multi-emisor CFDI (~450 líneas)
- `api/recargas-servicios.js` — recargas + servicios + MP bridge
- `api/labels.js` — etiquetas (POST /api/labels/print)
- `data/industry-schemas.json` — 22 giros con campos
- `data/industry-seed-products.json` — 40 giros × 10 productos (este turno)
- `migrations/tenant-module-button-flags.sql` — flags granulares 3 estados
- `migrations/facturama-multi-tenant.sql` — CSD multi-tenant + RLS
- `public/salvadorex_web_v25.html` — POS principal
- `public/volvix-module-flags-wiring.js` — frontend granular (hidden/locked/enabled)
- `volvix-uplift-wiring.js` — global wiring (force-light, no-floaters, module-flags loader)

## Convenciones data-* (para granular control)

- `data-module="X"` — módulo entero (whatsapp, etiquetas, inventario, ventas, etc.)
- `data-button="X.action"` — botón individual (ventas.refund, product.label-print, etc.)
- `data-field="X"` — campo específico del modal (planeado para próximo turno)
- `data-vlx-owner-only="systeminternational"` — visible solo a admin
- `data-vlx-locked="true"` — applied dinamico por wiring si state=locked
- `data-vlx-floater="diagnostic"` — oculto a usuarios, visible solo a admin

## Cache strategy resumen

- HTML servido con `Cache-Control: public, max-age=0, must-revalidate` + ETag
- `/volvix-X.js` SIN `?v=` → mismo header (back-compat)
- `/volvix-X.js?v=COMMIT_SHA` → `Cache-Control: public, max-age=31536000, immutable`
- `serveStaticFile` reescribe automático `<script src="/volvix-X.js">` a `?v=8charSHA` en HTML
- Resultado: deploy → HTML fresco al instante, JS cache local 1 año, cero Ctrl+Shift+R requerido

## Lecciones aprendidas (no repetir)

1. **Validar signature antes de tocar funciones**: `req.url` en `serveStaticFile(res, pathname)` rompió todo el sitio
2. **No paste keys en chat**: el usuario me pidió pegarle keys, declinć por seguridad. Las keys (Stripe, MP, AI Gateway, Twilio Verify) solo se pegan en Vercel UI
3. **Probar cada commit**: live HTTP probe antes de declarar "done"
4. **Cache headers**: `vercel.json` perdía vs `serveStaticFile` que setea manual. Solución: hardcode en serveStaticFile con detección de wirings
5. **Refactor sin cleanup**: cuando refactorizo `hasSmsFrom` a 3 vars, validar TODAS las referencias del archivo
6. **Skill ux-review** instalada en `~/.claude/skills/ux-review/SKILL.md` — usar antes de declarar production-ready
7. **AI Gateway URL**: `ai-gateway.vercel.sh/v1` (NO gateway.ai.vercel.com)
8. **Twilio Verify** = managed OTP service. NO requiere comprar número. Endpoint base `https://verify.twilio.com/v2/Services/{SID}/Verifications` + `VerificationCheck`
