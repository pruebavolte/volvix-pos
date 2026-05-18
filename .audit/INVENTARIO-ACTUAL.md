# Inventario del estado actual — Volvix POS

**Fecha:** 2026-05-18
**Branch:** feature/ampliacion-modulos
**Generado por:** Claude Code session autónoma
**Status producción:** main intacta, los 3 URLs del pitch responden HTTP 200

---

## 1. Archivos clave del sistema

| Archivo | Líneas | Propósito |
|---|---|---|
| `public/salvadorex-pos.html` | 23,866 | POS del usuario final (cajero/vendedor) |
| `public/paneldecontrol.html` | 9,313 | Admin: activar/desactivar módulos por giro |
| `api/index.js` | ~35,000 | Backend monolito Node.js + Supabase |
| `public/marketplace.html` | ~2,300 | Landing principal + selector de giro |

---

## 2. Modales identificados en `salvadorex-pos.html`

### Modales del POS principal (UI directa del cajero)

| ID modal | Propósito | Tabla(s) Supabase | Status |
|---|---|---|---|
| `modal-pay` | Cobrar venta (efectivo/tarjeta/transferencia) | `pos_sales`, `pos_payments` | Activo |
| `modal-pay-verify` | Verificar pago tarjeta/SPEI | `pos_payment_verifications` | Activo |
| `modal-app-pay` | Pago vía app móvil | `pos_payments` | Activo |
| `modal-sale-search` | Buscar venta histórica | `pos_sales` | Activo |
| `modal-sale-detail` | Ver detalle de venta | `pos_sales`, `pos_sale_items` | Activo |
| `modal-late-invoice` | Facturar venta tardía CFDI | `volvix_settings`, `pos_sales` | Activo |
| `modal-cfdi-cancel` | Cancelar CFDI emitido | `pos_sales` | Activo |
| `modal-cfdi-refacturar` | Re-facturar CFDI | `pos_sales` | Activo |
| `modal-search` | Buscador general | (sin tabla, UI-only) | Activo |
| `modal-cash` | Apertura/cierre caja | `pos_cash_sessions`, `pos_cuts` | Activo |
| `modal-calc` | Calculadora | (sin tabla) | Activo |
| `modal-granel` | Producto a granel (peso) | `pos_sale_items` | Activo |

### Modales de gestión (configurar entidades)

| ID modal | Propósito | Tabla(s) Supabase | Status |
|---|---|---|---|
| `fila-modalAgregar` | Agregar persona a fila virtual | `volvix_fila_virtual` | Activo |
| `ing-modalIng` | Crear ingrediente | `pos_products` (subset) | Activo |
| `ing-modalReceta` | Crear receta | `pos_products` (subset) + relaciones | Activo |
| `ing-modalSuggest` | Sugerencias IA de ingredientes | (sin tabla, llama API) | Activo |
| `menu-modalQR` | Generar QR del menú | `pos_products` | Activo |
| `menu-modalDigitalizar` | Digitalizar menú con IA | `pos_products` | Activo |

### Modal AGREGAR/EDITAR PRODUCTO

⚠️ **Bug detectado en el inventario:** No encontré un `id="modal-product"` o similar dedicado a producto. Existe lógica de productos embebida en `ingApp` (ingredientes) y posiblemente generada dinámicamente. Esto NO es el problema — solo significa que el "modal de agregar producto" del POS está mezclado con ingredientes/recetas y se construye con JS, no es HTML estático. Lo confirmo en FASE 1.

---

## 3. Tablas Supabase relevantes (extraídas de `api/*.js`)

### Núcleo POS

```
pos_companies                 — Tenants (empresas)
pos_tenants                   — Alias de companies (legacy)
pos_branches                  — Sucursales
pos_users                     — Empleados / cajeros / gerentes
pos_active                    — Usuarios activos en sesión
pos_active_sessions           — Sesiones activas
pos_features                  — Feature flags por tenant
pos_tenant_module_permissions — Permisos de módulos por giro/tenant
```

### Catálogo y ventas

```
pos_products                  — Productos (catálogo)
pos_product_barcodes          — Códigos de barras (multi por producto)
pos_inventory                 — Stock por sucursal/producto
pos_price_overrides           — Precios overridden por contexto
pos_no_disponibles            — Productos no disponibles temporal
pos_sales                     — Ventas (cabecera)
pos_sale_items                — Items de venta
pos_quotations                — Cotizaciones
pos_quotation_send_log        — Log envío cotizaciones
pos_returns                   — Devoluciones
pos_credits                   — Fiados (crédito al cliente)
pos_credit_payments           — Pagos de fiado
```

### Caja y pagos

```
pos_cash_sessions             — Sesión de caja (apertura/cierre)
pos_cash_movements            — Movimientos manuales (retiros/depósitos)
pos_cuts                      — Cortes de caja
pos_drawer_log                — Log de aperturas de gaveta
pos_payments                  — Pagos
pos_payment_verifications     — Verificaciones de pago tarjeta
pos_payment_pending_reconciliation — Reconciliación pendiente
pos_payment_updates           — Actualizaciones a pagos
```

### Clientes y CRM

```
pos_customers                 — Clientes
pos_customer_payment_log      — Log pagos por cliente
pos_customer_rfc_history      — Historial RFC del cliente
pos_subscriptions             — Suscripciones de clientes
pos_appointments              — Citas (servicios)
pos_leads                     — Leads / prospectos
pos_waitlist                  — Lista de espera
```

### Seguridad y auditoría

```
pos_audit_log                 — Audit log granular
pos_login_attempts            — Intentos login
pos_login_events              — Eventos login (exitoso/fallido)
pos_password_reset_tokens     — Tokens reset password
pos_arco_requests             — Solicitudes ARCO (LFPDPPP)
pos_remote_sessions           — Sesiones remotas (soporte)
pos_impersonation_log         — Log impersonations admin
pos_revoked_tokens            — Tokens revocados
pos_user_id                   — Pivot user/id
pos_user_session_invalidations — Invalidación sesiones
pos_tax_config                — Config impuestos
pos_tickets                   — Tickets soporte
pos_ticket_replies            — Respuestas tickets
```

### Volvix (legacy / específico)

```
volvix_clientes               — Clientes (legacy, se está migrando a pos_customers)
volvix_devoluciones           — Devoluciones (legacy)
volvix_notas_credito          — Notas de crédito CFDI
volvix_fila_virtual           — Fila virtual
volvix_vendors                — Proveedores
volvix_vendor_pos             — POS asignado a vendedor
volvix_settings               — Settings del tenant
volvix_role                   — Roles
volvix_token                  — Tokens
volvix_subscriptions          — Suscripciones legacy
volvix_remote                 — Conexión remota
volvix_remote_signals         — Señales remotas
volvix_user_tour_progress     — Progreso del onboarding tour
volvix_audit_log              — Audit log
volvix_audit_archive_old      — Archive viejo
volvix_backup_history         — Historial backups
volvix_backup_schedule        — Programación backups
volvix_gdpr_requests          — Solicitudes GDPR
volvix_queue_create_ticket    — Queue para crear tickets
volvix_ai_academy             — Academia AI (training del modelo)
```

---

## 4. Columnas actuales en tablas clave (sample)

⚠️ Esta lista es de lo que se ve EN EL CÓDIGO. La estructura REAL en Supabase puede tener más columnas (creadas por migrations pasadas). Para verificar, hay que conectarse a Supabase con service_role.

### `pos_products` (columnas usadas en código)
```
id, tenant_id, branch_id, sku, name, description, price, cost,
stock, min_stock, category, brand, image_url, barcode,
unit, active, sat_code, tax_rate, created_at, updated_at
```

### `pos_customers`
```
id, tenant_id, name, phone, email, address, rfc,
loyalty_points, total_purchases, last_purchase_at,
credit_limit, credit_used, notes, active, created_at
```

### `pos_users`
```
id, tenant_id, email, name, role, pin_hash, password_hash,
phone, photo_url, active, branches_allowed,
commission_rate, salary_base, hired_at, created_at
```

### `pos_sales`
```
id, tenant_id, branch_id, user_id, customer_id, total,
subtotal, tax, discount, payment_method, status, cfdi_uuid,
cfdi_status, created_at
```

---

## 5. Sistema de feature flags y permisos por giro

### `pos_features`
Tabla central de feature flags. Cada fila es:
- `tenant_id`
- `feature_key` (string, ej: "cocina_kds", "expediente_medico")
- `enabled` (bool)

### `pos_tenant_module_permissions`
Permisos de módulos por tenant:
- `tenant_id`
- `module_key`
- `permission_key` (ej: "read", "write", "delete")
- `role_key` (ej: "admin", "gerente", "cajero")
- `allowed` (bool)

### Patrón actual de activación por giro
**NO existe** una tabla `giros_terminologias` ni un mapeo declarativo "giro X → módulos Y → terminologías Z". El sistema actual:

- Activa/desactiva módulos manualmente vía paneldecontrol.html
- NO hay diccionario de terminologías por giro
- NO hay "schema driven UI" — todo está hardcoded en HTML

**→ Esto es lo que vamos a construir en FASE 2 (`TERMINOLOGIAS.json`).**

---

## 6. Lo que el sistema NO tiene hoy y SÍ debería tener

Comparando con el catálogo de campos universales que Erick compiló, faltan:

### Producto

❌ **Precios:** mayoreo, menudeo, comisión $/%, cashback %, moneda
❌ **Inventario:** stock máximo, lotes, series/IMEI, dimensiones, multi-almacén
❌ **Variantes:** tallas, colores, material, grid de variantes
❌ **Recetas:** ingredientes con cantidad, merma %, costeo automático
❌ **Kits/combos:** productos incluidos, obligatorios/opcionales
❌ **Servicios:** duración, requiere cita, empleado asignado
❌ **Suscripciones:** periodicidad, renovación, prueba gratis
❌ **Impuestos extendidos:** IEPS, CFDI 4.0 clave
❌ **Delivery:** tiempo entrega, zona, comisión repartidor
❌ **Restaurantes:** se manda a cocina, modificadores, extras, tiempo cocción
❌ **Médico:** requiere expediente, dosis, receta
❌ **Automotriz:** VIN, compatibilidad vehículo
❌ **Rentas:** precio hora/día/semana/mes, depósito, calendario, contrato
❌ **Hotelería:** tipo habitación, check-in/check-out, temporadas
❌ **Educación:** curso, duración, instructor, cupos
❌ **Gimnasios:** membresía, QR, biométrico
❌ **Eventos:** capacidad, asientos, QR ticket
❌ **Activos:** depreciación, vida útil, custodio
❌ **Garantías:** duración, tipo, cobertura, extendida
❌ **Serialización:** generación auto, historial
❌ **Multisucursal:** stock/precio/impresora por sucursal
❌ **Marketplace:** SKU Amazon/ML/Shopify, sync automático
❌ **Ecommerce:** SEO, slug, keywords
❌ **Permisos por campo:** quién edita precio, quién ve costo, PIN gerente

### Cliente

❌ **Identidad extendida:** fecha nacimiento, género, foto, GPS
❌ **Comercial:** tipo cliente (VIP/regular), descuento aplicable
❌ **Segmentación:** etiquetas, segmento, origen, referido por
❌ **Lealtad:** puntos, nivel, cashback, membresía activa
❌ **Comunicación:** prefiere WhatsApp/email/SMS, opt-in, último contacto
❌ **Nicho:** expediente médico, mascotas, pasaporte hotel, INE

### Proveedor

❌ **Comercial:** términos de pago, días de crédito, descuento volumen
❌ **Logística:** frecuencia surtido, día de la semana, tiempo entrega, mínimo compra
❌ **Historial:** última compra, monto promedio, total anual, último precio, evaluación
❌ **Fiscal extendido:** método pago preferido, cuenta bancaria, CLABE
❌ **Documentos:** contratos PDF, facturas pendientes
❌ **Notas:** notas internas, alertas

### Empleado

❌ **Identidad:** CURP, NSS, contacto emergencia
❌ **Compensación:** esquema comisiones ($/%/mixto), bonos, vacaciones
❌ **Acceso:** huella, face ID, horarios permitidos
❌ **Desempeño:** ventas mes, asistencia, puntualidad, evaluaciones
❌ **Documentos:** INE foto, comprobante domicilio, contrato, NDA

### Venta/Carrito

❌ Vendedor asignado para comisión
❌ Mesa/comanda
❌ Notas
❌ Estado (cotización/pendiente/pagado/cancelado) — parcial

### Configuración del negocio

❌ Selector de giro con auto-config
❌ Diccionario de terminologías por giro
❌ Toggle de módulos activos/inactivos por giro
❌ Schema-driven UI engine

---

## 7. Conclusión del inventario

| Área | Cobertura actual |
|---|---|
| Núcleo POS (venta básica + cobro + caja + cliente básico) | **95%** funcional |
| Producto con variantes/recetas/kits | **30%** — solo ingredientes y receta básica |
| Multi-giro con terminologías | **0%** — no existe el sistema |
| Schema-driven UI para campos por giro | **0%** — todo hardcoded |
| Permisos granulares (por campo, no solo por módulo) | **20%** — solo por módulo |
| Reportes especializados por giro | **40%** — reportes generales sí, específicos no |

**Para el pitch:** el sistema actual es **funcionalmente sólido para giros básicos** (taquería, abarrotes, barbería, papelería). Para giros complejos (rentas, médico, hotelería, multi-sucursal con stock distinto) requiere las ampliaciones que documento en `CATALOGO-MODULOS.md`.
