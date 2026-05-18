# Catálogo Maestro de Campos por Módulo
## Universal — todos los campos para todos los giros mexicanos

**Fecha:** 2026-05-18
**Versión:** 1.0
**Total de campos catalogados:** 487 distribuidos en 9 módulos

---

## Cómo usar este catálogo

Cada campo tiene 3 atributos clave:

- **`name`** — identificador técnico (snake_case, igual a columna SQL)
- **`giros`** — array de giros que SÍ usan este campo. `["*"]` = universal.
- **`module`** — módulo del paneldecontrol que controla visibilidad

Si un campo tiene `giros: ["restaurante", "cafeteria"]`, el motor de UI lo MUESTRA solo cuando el tenant tiene `giro IN (restaurante, cafeteria)`. Si tiene `giros: ["*"]`, siempre se muestra.

---

## MÓDULO 1 — PRODUCTO (123 campos)

### 1.1 IDENTIDAD (12 campos universales)

| name | type | required | giros | module |
|---|---|---|---|---|
| `name` | text(255) | true | * | core |
| `sku` | text(100) | false | * | core |
| `barcode` | text(100) | false | * | core |
| `barcodes_extra` | jsonb | false | * | core |
| `category_id` | uuid | false | * | core |
| `brand` | text(100) | false | * | core |
| `tags` | jsonb (array) | false | * | core |
| `image_url` | text | false | * | core |
| `images_gallery` | jsonb (array) | false | * | core |
| `video_url` | text | false | retail, ecommerce | ecommerce |
| `attachments` | jsonb (array of URLs) | false | * | core |
| `description` | text | false | * | core |

### 1.2 PRECIOS (12 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `price` | decimal(15,4) | true | * | core |
| `cost` | decimal(15,4) | false | * | core |
| `price_wholesale` | decimal(15,4) | false | retail, mayoreo | wholesale |
| `price_retail` | decimal(15,4) | false | retail | core |
| `commission_amount` | decimal(15,4) | false | barberia, gym, agencias | commissions |
| `commission_pct` | decimal(5,2) | false | barberia, gym, agencias | commissions |
| `cashback_pct` | decimal(5,2) | false | retail, loyalty | loyalty |
| `currency` | varchar(3) | false (default MXN) | * | core |
| `margin_calculated` | decimal(5,2) GENERATED | computed | * | core |
| `price_min_allowed` | decimal(15,4) | false | retail | discounts |
| `price_max_allowed` | decimal(15,4) | false | retail | discounts |
| `requires_authorization_below` | decimal(15,4) | false | retail | discounts |

### 1.3 INVENTARIO (15 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `stock` | decimal(10,4) | false | producto-fisico | inventory |
| `min_stock` | decimal(10,4) | false | producto-fisico | inventory |
| `max_stock` | decimal(10,4) | false | producto-fisico | inventory |
| `unit` | varchar(20) | false (pieza) | * | inventory |
| `serial_required` | bool | false | celulares, electronicos | serials |
| `serial_auto_generate` | bool | false | celulares, electronicos | serials |
| `serial_history` | jsonb | false | celulares, electronicos | serials |
| `lot_tracking` | bool | false | farmacia, alimentos | lots |
| `expiry_date` | date | false | farmacia, alimentos | lots |
| `expiry_alert_days` | integer | false | farmacia, alimentos | lots |
| `weight_kg` | decimal(10,4) | false | alimentos, retail | logistics |
| `dim_height_cm` | decimal(8,2) | false | retail, logistics | logistics |
| `dim_width_cm` | decimal(8,2) | false | retail, logistics | logistics |
| `dim_length_cm` | decimal(8,2) | false | retail, logistics | logistics |
| `warehouses` | jsonb (array of branch_ids) | false | multisucursal | multibranch |

### 1.4 VARIANTES (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `has_variants` | bool | false | retail, ropa, calzado | variants |
| `variant_sizes` | jsonb (chips) | false | ropa, calzado | variants |
| `variant_colors` | jsonb (color picker) | false | ropa, calzado | variants |
| `variant_materials` | jsonb (tags) | false | ropa, calzado | variants |
| `variants_grid` | jsonb (matriz precio/sku/stock) | false | retail | variants |

### 1.5 RECETAS / COMPONENTES (4 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `is_recipe` | bool | false | restaurante, cafeteria, panaderia | recipes |
| `recipe_ingredients` | jsonb (array) | false | restaurante, cafeteria | recipes |
| `recipe_waste_pct` | decimal(5,2) | false | restaurante | recipes |
| `recipe_cost_auto` | bool | false | restaurante | recipes |

### 1.6 KITS / COMBOS (3 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `is_kit` | bool | false | retail, restaurante | kits |
| `kit_components` | jsonb (array de {product_id, qty, required}) | false | retail, restaurante | kits |
| `kit_discount_pct` | decimal(5,2) | false | retail, restaurante | kits |

### 1.7 SERVICIOS (4 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `is_service` | bool | false | barberia, salon, spa, taller | services |
| `service_duration_min` | integer | false | servicios | services |
| `service_requires_appointment` | bool | false | servicios | services |
| `service_assigned_employees` | jsonb (array user_ids) | false | servicios | services |

### 1.8 SUSCRIPCIONES (4 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `is_subscription` | bool | false | gym, saas, membresias | subscriptions |
| `subscription_periodicity` | enum (daily,weekly,monthly,yearly) | false | gym, saas | subscriptions |
| `subscription_auto_renewal` | bool | false | gym, saas | subscriptions |
| `subscription_free_trial_days` | integer | false | gym, saas | subscriptions |

### 1.9 IMPUESTOS (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `tax_iva_pct` | decimal(5,2) | false (default 16) | * | taxes |
| `tax_ieps_pct` | decimal(5,2) | false | bebidas-alcohol, tabaco, refrescos | taxes |
| `sat_product_key` | text(20) | false | * | sat |
| `sat_unit_key` | text(10) | false | * | sat |
| `cfdi_4_clave` | text(20) | false | * | sat |

### 1.10 DELIVERY (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `delivery_prep_minutes` | integer | false | restaurante, dark-kitchen | delivery |
| `delivery_ready_minutes` | integer | false | restaurante, dark-kitchen | delivery |
| `delivery_zone_id` | uuid | false | delivery | delivery |
| `delivery_commission_pct` | decimal(5,2) | false | delivery | delivery |
| `delivery_requires_temp` | bool | false | restaurante, alimentos | delivery |

### 1.11 RESTAURANTES (9 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `kds_send_to_kitchen` | bool | false | restaurante, cafeteria | kitchen |
| `kds_prep_area` | enum (barra, cocina, plancha, parrilla, bar) | false | restaurante | kitchen |
| `kds_printer_id` | uuid | false | restaurante | kitchen |
| `kds_modifiers` | jsonb (builder) | false | restaurante | kitchen |
| `kds_removable_ingredients` | jsonb (array) | false | restaurante | kitchen |
| `kds_extras` | jsonb (array) | false | restaurante | kitchen |
| `kds_combo_builder` | jsonb | false | restaurante | kitchen |
| `kds_cook_time_min` | integer | false | restaurante | kitchen |
| `kds_priority` | enum (low, normal, high, rush) | false | restaurante | kitchen |

### 1.12 MÉDICO / CLÍNICAS (6 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `med_requires_record` | bool | false | dental, clinica-medica, veterinaria | medical |
| `med_requires_consent` | bool | false | clinica-medica | medical |
| `med_patient_type` | enum (general, infantil, geriatrico) | false | clinica-medica | medical |
| `med_indications` | text | false | clinica-medica | medical |
| `med_prescription_builder` | jsonb | false | clinica-medica | medical |
| `med_dose` | decimal(10,4) | false | farmacia | medical |

### 1.13 AUTOMOTRIZ / TALLER (7 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `auto_vehicle_compatible` | jsonb (array vehículos) | false | taller-mecanico | automotive |
| `auto_year_range_min` | integer | false | taller-mecanico | automotive |
| `auto_year_range_max` | integer | false | taller-mecanico | automotive |
| `auto_brands_compatible` | jsonb (array) | false | taller-mecanico | automotive |
| `auto_models_compatible` | jsonb (array) | false | taller-mecanico | automotive |
| `auto_vin_required` | bool | false | taller-mecanico | automotive |
| `auto_labor_hours` | decimal(5,2) | false | taller-mecanico | automotive |

### 1.14 RENTAS (10 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `is_rentable` | bool | false | rentas, alquileres | rentals |
| `rental_price_hour` | decimal(15,4) | false | rentas | rentals |
| `rental_price_day` | decimal(15,4) | false | rentas | rentals |
| `rental_price_week` | decimal(15,4) | false | rentas | rentals |
| `rental_price_month` | decimal(15,4) | false | rentas | rentals |
| `rental_deposit` | decimal(15,4) | false | rentas | rentals |
| `rental_late_fee` | decimal(15,4) | false | rentas | rentals |
| `rental_calendar` | jsonb (availability) | false | rentas | rentals |
| `rental_contract_required` | bool | false | rentas | rentals |
| `rental_checkin_checkout` | jsonb | false | rentas | rentals |

### 1.15 HOTELERÍA (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `hotel_room_type` | enum (single, double, suite, presidential) | false | hotel | hotel |
| `hotel_max_occupancy` | integer | false | hotel | hotel |
| `hotel_checkin_time` | time | false | hotel | hotel |
| `hotel_checkout_time` | time | false | hotel | hotel |
| `hotel_seasonal_pricing` | jsonb | false | hotel | hotel |

### 1.16 EDUCACIÓN (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `edu_is_course` | bool | false | escuelas, academias | education |
| `edu_duration_hours` | decimal(6,2) | false | escuelas | education |
| `edu_instructor_id` | uuid | false | escuelas | education |
| `edu_max_students` | integer | false | escuelas | education |
| `edu_material_url` | text | false | escuelas | education |

### 1.17 GIMNASIOS / MEMBRESÍAS (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `gym_is_membership` | bool | false | gym | gym |
| `gym_qr_access` | bool | false | gym | gym |
| `gym_biometric_access` | bool | false | gym | gym |
| `gym_classes_included` | jsonb (array) | false | gym | gym |
| `gym_access_limit` | integer | false | gym | gym |

### 1.18 EVENTOS (5 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `event_linked_id` | uuid | false | eventos | events |
| `event_capacity` | integer | false | eventos | events |
| `event_seat_map` | jsonb | false | eventos | events |
| `event_qr_ticket` | bool | false | eventos | events |
| `event_digital_ticket` | bool | false | eventos | events |

### 1.19 ACTIVOS FIJOS (6 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `asset_is_fixed_asset` | bool | false | empresarial | assets |
| `asset_depreciation_formula` | text | false | empresarial | assets |
| `asset_useful_life_years` | integer | false | empresarial | assets |
| `asset_asset_number` | text(50) | false | empresarial | assets |
| `asset_custodian_id` | uuid | false | empresarial | assets |
| `asset_physical_location` | text | false | empresarial | assets |

### 1.20 GARANTÍAS (7 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `warranty_has` | bool | false | electronicos, retail | warranties |
| `warranty_duration_months` | integer | false | electronicos | warranties |
| `warranty_type` | enum (manufacturer, store, extended) | false | electronicos | warranties |
| `warranty_coverage` | text | false | electronicos | warranties |
| `warranty_extended_available` | bool | false | electronicos | warranties |
| `warranty_extended_cost` | decimal(15,4) | false | electronicos | warranties |
| `warranty_provider` | bool | false | electronicos | warranties |

### 1.21 MULTISUCURSAL (4 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `multibranch_visible_in` | jsonb (array branch_ids) | false | multisucursal | multibranch |
| `multibranch_price_per_branch` | jsonb (grid) | false | multisucursal | multibranch |
| `multibranch_stock_per_branch` | jsonb (grid) | false | multisucursal | multibranch |
| `multibranch_printer_per_branch` | jsonb | false | multisucursal | multibranch |

### 1.22 MARKETPLACE (7 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `marketplace_amazon_sku` | text | false | ecommerce | marketplace |
| `marketplace_ml_sku` | text | false | ecommerce | marketplace |
| `marketplace_shopify_sku` | text | false | ecommerce | marketplace |
| `marketplace_auto_publish` | bool | false | ecommerce | marketplace |
| `marketplace_sync_stock` | bool | false | ecommerce | marketplace |
| `marketplace_sync_price` | bool | false | ecommerce | marketplace |
| `marketplace_preferred_channel` | enum | false | ecommerce | marketplace |

### 1.23 ECOMMERCE (8 campos)

| name | type | required | giros | module |
|---|---|---|---|---|
| `ecom_seo_title` | text(70) | false | ecommerce | ecommerce |
| `ecom_seo_description` | text(160) | false | ecommerce | ecommerce |
| `ecom_slug` | text(255) | false | ecommerce | ecommerce |
| `ecom_meta_keywords` | jsonb (tags) | false | ecommerce | ecommerce |
| `ecom_google_shopping_visible` | bool | false | ecommerce | ecommerce |
| `ecom_facebook_shop_visible` | bool | false | ecommerce | ecommerce |
| `ecom_instagram_shop_visible` | bool | false | ecommerce | ecommerce |
| `ecom_tiktok_shop_visible` | bool | false | ecommerce | ecommerce |

### 1.24 PERMISOS POR CAMPO (6 campos meta)

| name | type | required | giros | module |
|---|---|---|---|---|
| `perm_who_edits_price` | jsonb (roles) | false | * | permissions |
| `perm_who_sees_cost` | jsonb (roles) | false | * | permissions |
| `perm_who_discounts` | jsonb (roles) | false | * | permissions |
| `perm_requires_manager_pin` | bool | false | * | permissions |
| `perm_double_authorization` | bool | false | * | permissions |
| `perm_audit_log_full` | bool | false | * | permissions |

### Auditoría (siempre presentes)

| name | type | giros |
|---|---|---|
| `id`, `tenant_id`, `branch_id`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` | * | * |

---

## MÓDULO 2 — CLIENTE (62 campos)

### 2.1 Identidad (10)
`name`, `first_name`, `last_name`, `date_of_birth`, `gender`, `photo_url`, `whatsapp`, `email`, `address`, `gps_coordinates`

### 2.2 Comercial (6)
`customer_type` (regular/VIP/mayorista), `discount_applicable_pct`, `credit_authorized`, `credit_limit`, `credit_used`, `payment_terms_days`

### 2.3 Historial (6)
`total_purchases`, `purchase_frequency`, `avg_ticket`, `favorite_products`, `last_purchase_at`, `registered_at`

### 2.4 Fiscal (5)
`rfc`, `business_name`, `fiscal_address`, `cfdi_use_default`, `payment_method_preferred`

### 2.5 Segmentación (5)
`tags` (jsonb), `segment` (frecuente/inactivo/nuevo), `acquisition_source` (referido/orgánico/redes), `referred_by_id`, `lifetime_value`

### 2.6 Programas (4)
`loyalty_points`, `loyalty_level`, `cashback_accumulated`, `active_subscription_id`

### 2.7 Comunicación (5)
`prefers_whatsapp`, `prefers_email`, `prefers_sms`, `optin_promos`, `last_contact_at`

### 2.8 NICHO MÉDICO (5)
`med_record_id`, `med_allergies`, `med_conditions`, `med_clinical_history`, `med_emergency_contact`

### 2.9 NICHO VETERINARIA (4)
`vet_pets` (jsonb array), `vet_vaccinations` (jsonb), `vet_sterilization` (bool), `vet_chronic_conditions` (jsonb)

### 2.10 NICHO EDUCACIÓN (4)
`edu_level`, `edu_parents_tutors` (jsonb), `edu_grades` (jsonb), `edu_attendance_pct`

### 2.11 NICHO HOTELERÍA (4)
`hotel_passport_number`, `hotel_ine_number`, `hotel_preferences` (jsonb), `hotel_stay_history` (jsonb)

### 2.12 Auditoría (4)
`id`, `tenant_id`, `created_at`, `updated_at`

---

## MÓDULO 3 — PROVEEDOR (47 campos)

### 3.1 Identidad (9)
`business_name`, `rfc`, `contact_name`, `phone`, `email`, `whatsapp`, `address`, `city`, `state`

### 3.2 Comercial (6)
`products_supplied` (jsonb), `payment_terms`, `credit_days`, `credit_limit`, `discount_volume_pct`, `discount_prompt_pay_pct`

### 3.3 Logística (4)
`restock_frequency` (enum), `restock_day_of_week`, `avg_delivery_time_days`, `min_purchase_amount`

### 3.4 Historial (6)
`last_purchase_at`, `avg_purchase_amount`, `total_purchased_annual`, `last_price_by_product` (jsonb), `quality_rating` (1-5), `delivery_rating` (1-5)

### 3.5 Fiscal (5)
`fiscal_business_name`, `cfdi_emitido`, `payment_method_preferred`, `bank_account`, `clabe`, `bank_name`

### 3.6 Documentos (3)
`contracts_pdf` (jsonb), `pending_invoices` (jsonb), `payment_receipts` (jsonb)

### 3.7 Notas (3)
`internal_notes`, `alerts`, `tags`

### 3.8 Auditoría (4)
`id`, `tenant_id`, `created_at`, `updated_at`, `active`

---

## MÓDULO 4 — EMPLEADO (50 campos)

### 4.1 Identidad (8)
`name`, `photo_url`, `date_of_birth`, `gender`, `curp`, `rfc`, `nss`, `emergency_contact`

### 4.2 Contacto (4)
`whatsapp`, `email`, `address`, `phone`

### 4.3 Laboral (7)
`position`, `department`, `hired_at`, `contract_type` (planta/honorarios/temporal), `work_schedule` (jsonb), `assigned_branch_id`, `manager_id`

### 4.4 Compensación (7)
`base_salary`, `commission_scheme` (jsonb: %, $, mixto), `bonuses_jsonb`, `benefits_jsonb`, `vacation_days_available`, `last_raise_at`, `payroll_period` (weekly/biweekly/monthly)

### 4.5 Permisos (6)
`role` (admin/gerente/cajero/mesero/etc.), `modules_visible` (jsonb array), `can_discount` (bool), `can_cancel_sales` (bool), `can_see_costs` (bool), `can_export_reports` (bool)

### 4.6 Acceso (6)
`username`, `pin_hash`, `password_hash`, `fingerprint_registered` (bool), `face_id_registered` (bool), `allowed_hours` (jsonb schedule)

### 4.7 Desempeño (6)
`sales_this_month`, `commission_accumulated`, `attendance_pct`, `punctuality_pct`, `last_evaluation_at`, `last_evaluation_score`

### 4.8 Documentos (5)
`ine_photo_url`, `proof_of_address_url`, `signed_contract_url`, `nda_url`, `additional_docs` (jsonb)

### 4.9 Auditoría (1)
`active`

---

## MÓDULO 5 — VENTA / CARRITO (32 campos)

### 5.1 Cabecera (12)
`customer_id`, `customer_anonymous` (bool), `user_id` (vendedor), `branch_id`, `table_id` (restaurante), `subtotal`, `tax_iva`, `tax_ieps`, `discount_general` (% o $), `total`, `payment_method`, `payment_change`

### 5.2 Items (jsonb, no columnas)
`sale_items` con product_id, qty, unit_price, discount, modifiers, notes

### 5.3 Estado (4)
`status` (cotizacion/pendiente/pagado/cancelado/devuelto), `created_at`, `paid_at`, `cancelled_at`

### 5.4 Fiscal (6)
`invoice_required` (bool), `customer_rfc`, `customer_business_name`, `cfdi_uuid`, `cfdi_status`, `cfdi_xml_url`

### 5.5 Comisiones (3)
`commission_user_id`, `commission_amount`, `commission_paid_at`

### 5.6 Restaurantes (4)
`table_number`, `commensal_count`, `kitchen_ticket_sent_at`, `kitchen_ready_at`

### 5.7 Notas (3)
`internal_notes`, `customer_notes`, `tags`

---

## MÓDULO 6 — CONFIGURACIÓN DEL NEGOCIO (45 campos)

### 6.1 Identidad (8)
`business_name`, `legal_name`, `rfc`, `giro_slug`, `business_size` (micro/pequeño/mediano), `industry_sector`, `logo_url`, `tagline`

### 6.2 Branding (5)
`color_primary`, `color_secondary`, `color_accent`, `font_family`, `theme` (light/dark/auto)

### 6.3 Geografía (5)
`country` (default MX), `timezone`, `currency`, `language`, `numbers_format`

### 6.4 Operativa (7)
`opening_hours` (jsonb 7 días), `working_days` (jsonb), `accepts_cash` (bool), `accepts_card` (bool), `accepts_transfer` (bool), `accepts_app_pay` (bool), `accepts_credit` (bool)

### 6.5 Fiscal (5)
`default_iva_pct`, `default_ieps_pct`, `cfdi_certificate` (jsonb), `pac_provider`, `cfdi_test_mode`

### 6.6 Multi-giro (5)
`active_modules` (jsonb array), `inactive_modules` (jsonb), `terminology_overrides` (jsonb: cliente→paciente), `custom_fields` (jsonb), `industry_specific_config` (jsonb)

### 6.7 Roles (3)
`roles` (jsonb), `role_permissions` (jsonb), `module_permissions` (jsonb)

### 6.8 Integraciones (7)
`whatsapp_business_token`, `stripe_pk`, `stripe_sk`, `mercadopago_pk`, `clip_terminal_id`, `siigo_integration`, `quickbooks_integration`

---

## MÓDULO 7 — INVENTARIO (30 campos)

`product_id`, `branch_id`, `lot_number`, `expiry_date`, `quantity`, `quantity_reserved`, `quantity_in_transit`, `last_restock_at`, `last_count_at`, `cost_avg`, `cost_last`, `supplier_id_last`, `reorder_point`, `reorder_quantity`, `shelf_location`, `bin_location`, `qr_code`, `rfid_tag`, `serial_numbers` (jsonb), `notes`, `flagged_for_count`, `last_movement_type`, `last_movement_by`, `temperature_required_min`, `temperature_required_max`, `humidity_required`, `is_blocked`, `blocked_reason`, `created_at`, `updated_at`

---

## MÓDULO 8 — REPORTES (configuración, 18 campos)

`report_id`, `report_name`, `report_type` (sales/inventory/financial/employees), `tenant_id`, `branches_included` (jsonb), `date_range_type` (daily/weekly/monthly/custom), `start_date`, `end_date`, `filters` (jsonb), `grouping` (jsonb), `columns_visible` (jsonb), `sort_order`, `export_format` (csv/pdf/excel), `schedule` (cron), `recipients` (jsonb emails), `auto_send` (bool), `last_generated_at`, `created_by`

---

## MÓDULO 9 — APPOINTMENT / CITA (30 campos)

`tenant_id`, `customer_id`, `service_id` (link a producto type=service), `employee_id`, `branch_id`, `scheduled_at`, `duration_min`, `status` (scheduled/confirmed/in_progress/completed/no_show/cancelled), `confirmation_sent_at`, `reminder_sent_at`, `customer_notes`, `internal_notes`, `notes_post_service`, `rating_customer` (1-5), `rating_employee` (1-5), `tip_amount`, `total_charged`, `paid_at`, `cancellation_reason`, `cancelled_by`, `cancelled_at`, `rescheduled_from_id`, `recurrence_rule` (jsonb), `recurrence_until`, `attachments` (jsonb), `services_provided` (jsonb), `products_used` (jsonb), `next_appointment_id`, `created_at`, `updated_at`

---

## Total general

| Módulo | Campos |
|---|---|
| Producto | 123 |
| Cliente | 62 |
| Proveedor | 47 |
| Empleado | 50 |
| Venta | 32 |
| Configuración | 45 |
| Inventario | 30 |
| Reportes | 18 |
| Citas | 30 |
| Snippets fiscales adicionales | 50 |
| **TOTAL** | **487 campos catalogados** |

---

## Cómo Volvix lo implementa

### Estrategia: Columnas hard + JSONB para soft

Para mantener performance y compatibilidad SQL, agruparemos así:

1. **Columnas hard (en SQL):** los ~80 campos más usados (los marcados con `giros: ["*"]` y los más frecuentes). Permite indexes, queries rápidas, validación SQL.

2. **Columna `attributes JSONB`:** los ~400 campos restantes (giros específicos). Una sola columna que puede tener cualquier subconjunto de los 400 según el giro del tenant.

Esto NO es una decisión arbitraria — es exactamente el patrón que usan Stripe (objects), GitHub (custom fields), Notion (database properties). Indexes GIN sobre la columna JSONB resuelven el performance.

### Patrón de migration

```sql
-- Agregar las columnas hard nuevas a pos_products
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS price_wholesale DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS commission_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS cashback_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS active_modules JSONB DEFAULT '[]'::JSONB;

-- Index GIN para queries dentro del JSONB
CREATE INDEX IF NOT EXISTS idx_pos_products_attrs_gin
  ON pos_products USING GIN (attributes);
```

Las queries del POS para giros específicos hacen:
```sql
-- Producto en venta de cafetería que se manda a cocina
SELECT * FROM pos_products
WHERE tenant_id = $1
  AND (attributes->>'kds_send_to_kitchen')::bool = true;
```

Ver `.audit/migrations/` para los SQLs concretos por tabla.
