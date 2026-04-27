# R13 — Auditoría de Datos Hardcodeados

**Fecha**: 2026-04-26
**Alcance**: `C:\Users\DELL\Downloads\verion 340\` (327 archivos, .html y .js)
**Objetivo**: identificar arrays/objetos/strings con datos de negocio embebidos que deberían vivir en Supabase.

## Resumen ejecutivo

| Severidad | Hallazgos | Notas |
|---|---|---|
| Crítico (datos reales de demo persistidos como fuente de verdad) | 3 archivos | `salvadorex_web_v25.html`, `server.js`, `multipos_suite_v3.html` |
| Alto (catálogos por vertical embebidos como `DEFAULT_*`) | ~25 archivos | Verticales `volvix-vertical-*.js` |
| Medio (datos de demo / fixtures de UI) | ~15 archivos | Wirings de pruebas, plantillas, ejemplos |
| Bajo (constantes legítimas: emojis, colores, columnas Kanban) | ~10 archivos | NO migrar |

Convención de tablas Supabase sugerida (multi-tenant, todas con `tenant_id uuid`):
`products, categories, customers, sales, sale_items, users, tickets (POS y soporte), kds_tickets, menu_items, services, packages, vehicle_types, subscriptions, treatments, cabins, therapists, retail_products, modifiers, combos, loyalty_tiers, loyalty_rewards, donation_causes, crm_stages, vertical_catalog, notary_procedures, knowledge_base, features_catalog`.

---

## 1. CRÍTICO — Bases completas hardcodeadas

| Archivo | Línea | Tipo de dato | Tabla Supabase destino |
|---|---|---|---|
| `salvadorex_web_v25.html` | 2420-2436 | `PRODUCTS` (ítems con code/name/price/stock) | `products` |
| `salvadorex_web_v25.html` | 2437-2441 | `CART` demo | (sesión cliente, no persistir) |
| `salvadorex_web_v25.html` | 2442-2447 | `CUSTOMERS` (4 clientes con nombre/tel/historial) | `customers` |
| `salvadorex_web_v25.html` | 2448-2455 | `CREDIT` (estado crediticio por cliente) | `customer_credit` (FK a customers) |
| `salvadorex_web_v25.html` | 2456-2462 | `SALES` (5 ventas demo `#000148-152`) | `sales` |
| `salvadorex_web_v25.html` | 2463-2468 | `USERS` (admin/cajeros @donchucho.mx) | `users` |
| `salvadorex_web_v25.html` | 2471-2479 | `CATEGORIES` (lácteos, bebidas...) | `categories` |
| `salvadorex_web_v25.html` | 2481-2518 | `QUICKPICK` (~30 productos catálogo) | `products` (flag `quick_pick`) |
| `server.js` | 80-89 | `features` catálogo FEAT-0001..0240 | `features_catalog` |
| `server.js` | 90-93 | `tickets` soporte (TKT-1046/47) | `support_tickets` |
| `server.js` | 94-98 | `knowledge` base (KB-001..003) | `knowledge_base` |
| `server.js` | 103-107 | `users` (admin/owner/cajero @volvix.test con password en claro) | `users` (urgente: passwords NUNCA hardcoded) |
| `multipos_suite_v3.html` | 1579-1584 | `kdsTickets` (4 tickets cocina con mesa/mesero/items) | `kds_tickets` + `kds_ticket_items` |
| `multipos_suite_v3.html` | 1588-1601 | `menu` (12 platillos con emoji/precio/categoría) | `menu_items` |

---

## 2. ALTO — Catálogos default por vertical

Patrón detectado: cada `volvix-vertical-*.js` define un `const CATALOGO_*` o `DEFAULT_*` que se inyecta en estado al primer arranque. Deben migrarse a una tabla `vertical_catalog_template` (templates por industria) y al onboarding del tenant copiarse a sus tablas reales.

| Archivo | Línea | Tipo de dato | Tabla Supabase destino |
|---|---|---|---|
| `volvix-vertical-autolavado.js` | 24-32 | `DEFAULT_VEHICLE_TYPES` | `vehicle_types` |
| `volvix-vertical-autolavado.js` | 33-47 | `DEFAULT_PACKAGES` (paquetes de lavado) | `service_packages` |
| `volvix-vertical-autolavado.js` | 48-63 | `DEFAULT_SUBSCRIPTIONS` | `subscription_plans` |
| `volvix-vertical-bicicletas.js` | 17-27 | `CATALOGO_MODELOS` | `products` (vertical=bici) |
| `volvix-vertical-bicicletas.js` | 28-45 | `CATALOGO_REFACCIONES` | `products` (categoría=refacción) |
| `volvix-vertical-bicicletas.js` | 46-69 | `SERVICIOS_TALLER` | `services` |
| `volvix-vertical-cafe.js` | 56+ | `MENU` (bebidas/postres) | `menu_items` |
| `volvix-vertical-cremeria.js` | 12-37 | `CATALOGO` (productos lácteos) | `products` |
| `volvix-vertical-dental.js` | 21-43 | `CATALOGO_DEFAULT` (tratamientos) | `services` |
| `volvix-vertical-estetica.js` | 15-40 | `SERVICIOS_DEFAULT` | `services` |
| `volvix-vertical-estetica.js` | 41-73 | `PRODUCTOS_DEFAULT` (retail) | `products` |
| `volvix-vertical-floreria.js` | 21+ | `CATALOGO_ARREGLOS` | `products` |
| `volvix-vertical-fotografia.js` | 27-46 | `PAQUETES` | `service_packages` |
| `volvix-vertical-fruteria.js` | 13+ | `CATALOGO` | `products` |
| `volvix-vertical-muebleria.js` | 21-92 | `CATALOGO` (muebles) | `products` |
| `volvix-vertical-notaria.js` | 14-35 | `CATALOGO_TRAMITES` (TR001..TR020) | `notary_procedures` |
| `volvix-vertical-panaderia.js` | 26+ | `CATALOGO_BASE` | `products` |
| `volvix-vertical-papeleria.js` | 15+ | `CATALOGO_UTILES` | `products` |
| `volvix-vertical-pescaderia.js` | 14-24 | `CATALOGO_PESCADOS` | `products` |
| `volvix-vertical-pescaderia.js` | 25-36 | `CATALOGO_MARISCOS` | `products` |
| `volvix-vertical-pescaderia.js` | 37+ | `SERVICIOS_FILETEADO` | `services` |
| `volvix-vertical-spa.js` | 48-65 | `DEFAULT_TREATMENTS` | `treatments` / `services` |
| `volvix-vertical-spa.js` | 66-74 | `DEFAULT_CABINS` | `cabins` |
| `volvix-vertical-spa.js` | 75-82 | `DEFAULT_THERAPISTS` | `staff` (rol=therapist) |
| `volvix-vertical-spa.js` | 83-90 | `DEFAULT_PACKAGES` | `service_packages` |
| `volvix-vertical-spa.js` | 91+ | `DEFAULT_RETAIL` | `products` |
| `volvix-vertical-eventos.js` | 47+ | `CATEGORIAS_SERVICIO` | `service_categories` |
| `volvix-vertical-ropa.js` | 51 | array motivos devolución (DEFECTO, etc.) | `return_reasons` |

---

## 3. ALTO — Catálogos transversales

| Archivo | Línea | Tipo de dato | Tabla Supabase destino |
|---|---|---|---|
| `volvix-loyalty-wiring.js` | 14-24 | TIERS lealtad (Bronze/Silver/Gold/Platinum/Diamond) | `loyalty_tiers` |
| `volvix-loyalty-wiring.js` | 25-34 | REWARDS (R001..R008) | `loyalty_rewards` |
| `volvix-modifiers-wiring.js` | 47-52 | `DEFAULT_SIZES` | `modifiers` (tipo=size) |
| `volvix-modifiers-wiring.js` | 53-60 | `DEFAULT_EXTRAS` | `modifiers` (tipo=extra) |
| `volvix-modifiers-wiring.js` | 61-68 | `DEFAULT_REMOVABLE` | `modifiers` (tipo=removable) |
| `volvix-modifiers-wiring.js` | 69+  | `DEFAULT_COMBOS` | `combos` |
| `volvix-crm-wiring.js` | 52+ | `DEFAULT_STAGES` (pipeline ventas) | `crm_stages` |
| `volvix-donations-wiring.js` | 48+ | `DEFAULT_CAUSES` | `donation_causes` |
| `volvix-tags-wiring.js` | 280-285 | reglas tag "Producto premium" / "Cliente nuevo" | `tag_rules` |
| `volvix-tables-wiring.js` | 368 | layout default mesa "Cliente" | `table_layouts` |
| `volvix-pos-extra-wiring.js` | 785-794 | usuario seed `admin@volvix.com` | `users` |
| `volvix-categories-wiring.js` | 13-14 | estructura `categories/products` arrancando vacía | OK (state init), pero asegurar fetch de Supabase |

---

## 4. MEDIO — Datos demo / fixtures de UI/marketing

| Archivo | Línea | Tipo de dato | Tabla Supabase destino |
|---|---|---|---|
| `volvix-sandbox.html` | 528-538 | 8 productos demo (Coca, Pan, Pizza...) | `products` (sandbox tenant) |
| `volvix_owner_panel_v7.html` | 2452-2469 | menú módulos (inventario/clientes/usuarios) | `app_modules` (config UI) |
| `volvix_owner_panel_v7.html` | 2757 | módulo CRM con `tenants:184` hardcoded | métrica derivada, NO hardcode |
| `volvix_owner_panel_v7.html` | 3963 | template etiqueta "Producto premium" | `label_templates` |
| `volvix_ai_engine.html` | 756 | catálogo features con `usage:945` | `features_catalog` |
| `volvix-tax-wiring.js` | 648 | `customer: {rfc:'XAXX010101000', name:'Cliente Demo'}` | (público general — config tenant) |
| `volvix-email-wiring.js` | 170 | `{nombre:'Cliente Demo', email:'demo@volvix.local'}` | demo solo, mover a fixture test |
| `volvix-zapier-wiring.js` | 269 | sample webhook `SKU-42 / Producto X` | OK (es ejemplo de payload) |
| `volvix-tests-wiring.js` | 161,189 | datos test runtime | OK (test) |
| `volvix-playwright-tests.js` | 277 | `Test Product SKU-TEST-` | OK (test) |
| `volvix-cypress-tests.js` | varios | datos test | OK (test) |
| `landing_dynamic.html` / `marketplace.html` | varios | textos marketing demo | OK (copy estática) |

---

## 5. BAJO / NO MIGRAR (constantes legítimas de UI)

Estos arrays son configuración de UI, NO datos de negocio. Dejar en código:

- `volvix-ui-colorpicker.js:9` `DEFAULT_SWATCHES` — paleta de colores
- `volvix-ui-kanban.js:10` `DEFAULT_COLUMNS` — columnas Kanban template
- `volvix-ui-emoji.js:21` `CATEGORIES` — categorías del picker emoji
- `volvix-sendgrid-wiring.js:25,263,275` `categories:['volvix']` — tags de envío
- Wirings de tests, mocks, sentry, hotjar, security-scan: contienen fixtures intencionales.

---

## 6. Hallazgos críticos de seguridad

1. **`server.js:103-107`** — Tres usuarios con `password: 'Volvix2026!'` en claro. Migrar YA a `auth.users` de Supabase con hash. Eliminar esa constante.
2. **`salvadorex_web_v25.html:2463-2468`** — Emails reales `@donchucho.mx` con cuentas demo. Si es producción, remover.
3. **`volvix-pos-extra-wiring.js:785`** — Seed user `admin@volvix.com` sin password pero con rol admin; cambiar a invitación vía Supabase Auth.

---

## 7. Recomendación de migración (orden sugerido)

1. **Fase 1 (seguridad)**: extirpar usuarios/passwords de `server.js` y `salvadorex_web_v25.html` → `auth.users` Supabase + RLS por `tenant_id`.
2. **Fase 2 (catálogos transversales)**: `loyalty_tiers`, `loyalty_rewards`, `modifiers`, `crm_stages`, `donation_causes`, `categories`.
3. **Fase 3 (POS principal)**: `products`, `customers`, `sales`, `tickets` desde `salvadorex_web_v25.html` y `multipos_suite_v3.html`.
4. **Fase 4 (verticales)**: crear tabla `vertical_catalog_template` con JSONB por industria; los `DEFAULT_*` de cada `volvix-vertical-*.js` se cargan vía `select` durante onboarding del tenant.
5. **Fase 5 (limpieza)**: borrar `server.js` features/knowledge/tickets demo cuando ya estén en `features_catalog` / `knowledge_base` / `support_tickets`.

---

**Total archivos auditados**: 327
**Archivos con datos hardcodeados a migrar**: ~45
**Archivos con datos legítimos (no migrar)**: 282
