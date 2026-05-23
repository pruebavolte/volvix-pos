-- Migration 01: Extender pos_products con catálogo universal
-- Generado: 2026-05-18 por Claude Code session autónoma
-- IMPORTANTE: NO ejecutar antes del pitch. Revisar primero.
--
-- Estrategia:
-- - Hard columns para los ~30 campos más usados (queries directas + indexes)
-- - JSONB `attributes` para los ~93 campos restantes (por giro específico)
--
-- BACKWARD COMPATIBLE: usa ADD COLUMN IF NOT EXISTS. Cero downtime.

BEGIN;

-- 1.2 PRECIOS extendidos
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS price_wholesale DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS price_retail DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS commission_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS cashback_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS price_min_allowed DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS price_max_allowed DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS requires_authorization_below DECIMAL(15,4);

-- 1.3 INVENTARIO extendido (los campos físicos comunes)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS max_stock DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS dim_height_cm DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS dim_width_cm DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS dim_length_cm DECIMAL(8,2);

-- 1.4 VARIANTES (flag y jsonb)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS variants_grid JSONB DEFAULT '[]'::jsonb;

-- 1.5 RECETAS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_recipe BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recipe_ingredients JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recipe_waste_pct DECIMAL(5,2);

-- 1.6 KITS / COMBOS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_kit BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kit_components JSONB DEFAULT '[]'::jsonb;

-- 1.7 SERVICIOS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS service_requires_appointment BOOLEAN DEFAULT FALSE;

-- 1.8 SUSCRIPCIONES
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_periodicity VARCHAR(20),
  ADD COLUMN IF NOT EXISTS subscription_auto_renewal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_free_trial_days INTEGER;

-- 1.9 IMPUESTOS extendidos
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS tax_ieps_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS sat_unit_key VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cfdi_4_clave VARCHAR(20);

-- 1.10 SERIALIZACIÓN
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS serial_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS serial_auto_generate BOOLEAN DEFAULT FALSE;

-- 1.11 LOTES / CADUCIDAD
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS lot_tracking BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER;

-- 1.12 GARANTÍAS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS warranty_has BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warranty_duration_months INTEGER,
  ADD COLUMN IF NOT EXISTS warranty_type VARCHAR(20);

-- JSONB CATCH-ALL para campos específicos por giro
-- (kitchen, médico, automotriz, rentas, hotel, educación, gimnasios, eventos,
--  activos, multisucursal, marketplace, ecommerce, permisos, blockchain, etc.)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_modules JSONB DEFAULT '[]'::jsonb;

-- INDEXES para queries en JSONB
CREATE INDEX IF NOT EXISTS idx_pos_products_attrs_gin
  ON pos_products USING GIN (attributes);

CREATE INDEX IF NOT EXISTS idx_pos_products_modules_gin
  ON pos_products USING GIN (active_modules);

-- INDEXES en columnas hard nuevas más usadas
CREATE INDEX IF NOT EXISTS idx_pos_products_is_service ON pos_products(tenant_id, is_service);
CREATE INDEX IF NOT EXISTS idx_pos_products_is_subscription ON pos_products(tenant_id, is_subscription);
CREATE INDEX IF NOT EXISTS idx_pos_products_serial_required ON pos_products(tenant_id, serial_required);
CREATE INDEX IF NOT EXISTS idx_pos_products_lot_tracking ON pos_products(tenant_id, lot_tracking);

COMMIT;

-- VERIFICACIÓN post-migration:
-- SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'pos_products';
-- Debe ser >= 60 columnas tras esta migration (+ las que ya existen)
-- Migration 02: Extender pos_customers con catálogo universal
-- Generado: 2026-05-18

BEGIN;

-- 2.1 Identidad extendida
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS gps_lat DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS gps_lng DECIMAL(10,7);

-- 2.2 Comercial extendido
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS discount_applicable_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER;

-- 2.3 Historial extendido (varios ya existen, agregar faltantes)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS purchase_frequency VARCHAR(20),
  ADD COLUMN IF NOT EXISTS avg_ticket DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS favorite_products JSONB DEFAULT '[]'::jsonb;

-- 2.4 Fiscal extendido
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS fiscal_address TEXT,
  ADD COLUMN IF NOT EXISTS cfdi_use_default VARCHAR(10),
  ADD COLUMN IF NOT EXISTS payment_method_preferred VARCHAR(20);

-- 2.5 Segmentación
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS segment VARCHAR(30),
  ADD COLUMN IF NOT EXISTS acquisition_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS referred_by_id UUID REFERENCES pos_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(15,4);

-- 2.6 Programas (loyalty)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS loyalty_level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cashback_accumulated DECIMAL(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_subscription_id UUID;

-- 2.7 Comunicación
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS prefers_whatsapp BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS prefers_email BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prefers_sms BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS optin_promos BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

-- 2.8-2.11 NICHO específico (jsonb único para evitar 20+ columnas raramente usadas)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS niche_attributes JSONB DEFAULT '{}'::jsonb;
-- niche_attributes incluye:
--   medical: { record_id, allergies, conditions, clinical_history, emergency_contact }
--   veterinary: { pets, vaccinations, sterilization, chronic_conditions }
--   education: { level, parents_tutors, grades, attendance_pct }
--   hotel: { passport, ine, preferences, stay_history }

-- Index GIN sobre niche_attributes para queries rápidas
CREATE INDEX IF NOT EXISTS idx_pos_customers_niche_gin ON pos_customers USING GIN (niche_attributes);
CREATE INDEX IF NOT EXISTS idx_pos_customers_tags_gin ON pos_customers USING GIN (tags);

COMMIT;
-- Migration 03: Extender pos_users (empleados) con catálogo universal
-- Generado: 2026-05-18

BEGIN;

-- 4.1 Identidad extendida
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS curp VARCHAR(18),
  ADD COLUMN IF NOT EXISTS rfc VARCHAR(13),
  ADD COLUMN IF NOT EXISTS nss VARCHAR(11),
  ADD COLUMN IF NOT EXISTS emergency_contact JSONB DEFAULT '{}'::jsonb;

-- 4.2 Contacto extendido
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS address TEXT;

-- 4.3 Laboral
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS position VARCHAR(100),
  ADD COLUMN IF NOT EXISTS department VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contract_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_branch_id UUID,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES pos_users(id) ON DELETE SET NULL;

-- 4.4 Compensación
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS commission_scheme JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bonuses_jsonb JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS benefits_jsonb JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vacation_days_available DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_raise_at DATE,
  ADD COLUMN IF NOT EXISTS payroll_period VARCHAR(20) DEFAULT 'biweekly';

-- 4.5 Permisos granulares (módulos)
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS modules_visible JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS can_discount BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_cancel_sales BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_see_costs BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_export_reports BOOLEAN DEFAULT FALSE;

-- 4.6 Acceso
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS fingerprint_registered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS face_id_registered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allowed_hours JSONB DEFAULT '{}'::jsonb;

-- 4.7 Desempeño
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS sales_this_month DECIMAL(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_accumulated DECIMAL(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS punctuality_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS last_evaluation_at DATE,
  ADD COLUMN IF NOT EXISTS last_evaluation_score DECIMAL(3,1);

-- 4.8 Documentos
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS ine_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_of_address_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_contract_url TEXT,
  ADD COLUMN IF NOT EXISTS nda_url TEXT,
  ADD COLUMN IF NOT EXISTS additional_docs JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pos_users_manager ON pos_users(manager_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_branch ON pos_users(assigned_branch_id);

COMMIT;
-- Migration 04: Extender volvix_vendors (proveedores) con catálogo universal
-- Generado: 2026-05-18

BEGIN;

-- 3.1 Identidad extendida (algunos campos pueden ya existir)
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS rfc VARCHAR(13),
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(80),
  ADD COLUMN IF NOT EXISTS state VARCHAR(80);

-- 3.2 Comercial
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS products_supplied JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50),
  ADD COLUMN IF NOT EXISTS credit_days INTEGER,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS discount_volume_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS discount_prompt_pay_pct DECIMAL(5,2);

-- 3.3 Logística
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS restock_frequency VARCHAR(20),
  ADD COLUMN IF NOT EXISTS restock_day_of_week VARCHAR(10),
  ADD COLUMN IF NOT EXISTS avg_delivery_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS min_purchase_amount DECIMAL(15,4);

-- 3.4 Historial
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avg_purchase_amount DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS total_purchased_annual DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS last_price_by_product JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(2,1),
  ADD COLUMN IF NOT EXISTS delivery_rating DECIMAL(2,1);

-- 3.5 Fiscal
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS fiscal_business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cfdi_emitido BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_method_preferred VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(30),
  ADD COLUMN IF NOT EXISTS clabe VARCHAR(18),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);

-- 3.6 Documentos
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS contracts_pdf JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_invoices JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_receipts JSONB DEFAULT '[]'::jsonb;

-- 3.7 Notas
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS alerts TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_volvix_vendors_tags_gin ON volvix_vendors USING GIN (tags);

COMMIT;
-- Migration 05: Crear tabla giros_terminologias (NUEVA)
-- Generado: 2026-05-18
--
-- Esta tabla es el corazón del sistema multi-giro:
-- - Define qué módulos están activos por giro
-- - Define qué terminologías reemplazar (cliente→paciente para dental, etc.)
-- - Permite override per-tenant (un tenant dental puede preferir "cliente" en vez de "paciente")

BEGIN;

CREATE TABLE IF NOT EXISTS giros_terminologias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_slug         VARCHAR(50) NOT NULL,         -- "navaja", "comandero", "discreto", etc.
  giro_name         VARCHAR(255),                  -- nombre humano "Barbería", "Restaurante"
  tenant_id         UUID,                          -- NULL = template global, UUID = override per-tenant
  terminologias     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"cliente":"paciente","producto":"servicio",...}
  modulos_activos   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["core","inventory","appointments",...]
  modulos_inactivos JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["kitchen","medical",...]
  campos_visibles   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"product":{"price_wholesale":false,...}}
  scian_code        VARCHAR(10),                   -- código SCIAN del INEGI
  version           INTEGER DEFAULT 1,
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT giros_terminologias_unique_per_tenant
    UNIQUE (giro_slug, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_giros_term_slug ON giros_terminologias(giro_slug);
CREATE INDEX IF NOT EXISTS idx_giros_term_tenant ON giros_terminologias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_giros_term_term_gin ON giros_terminologias USING GIN (terminologias);
CREATE INDEX IF NOT EXISTS idx_giros_term_modules_gin ON giros_terminologias USING GIN (modulos_activos);

-- Seed con los 30 giros prioritarios (basado en TERMINOLOGIAS.json)
-- NOTA: La carga completa la hace un script Node después de aprobar esta migration.
-- INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos) VALUES ...

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_giros_terminologias_updated_at ON giros_terminologias;
CREATE TRIGGER update_giros_terminologias_updated_at
  BEFORE UPDATE ON giros_terminologias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Para llenar después de la migration:
-- node .audit/scripts/seed-giros-terminologias.js (usa TERMINOLOGIAS.json)
-- Migration 06: Extender pos_appointments
-- Para barberías, salones, clínicas, talleres, gimnasios

BEGIN;

ALTER TABLE pos_appointments
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES pos_products(id),
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES pos_users(id),
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_notes TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS notes_post_service TEXT,
  ADD COLUMN IF NOT EXISTS rating_customer SMALLINT,
  ADD COLUMN IF NOT EXISTS rating_employee SMALLINT,
  ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS total_charged DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES pos_users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id UUID,
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS recurrence_until DATE,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS services_provided JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS products_used JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_appointment_id UUID;

CREATE INDEX IF NOT EXISTS idx_pos_appointments_employee ON pos_appointments(employee_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_pos_appointments_status ON pos_appointments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_appointments_scheduled ON pos_appointments(tenant_id, scheduled_at);

COMMIT;
-- Migration 08: FASE 6 — Tablas para los 11 módulos extraídos de audios de Erick
-- Generado: 2026-05-18 (sprint nocturno pre-pitch)
-- IMPORTANTE: NO ejecutar antes del pitch. Solo scaffolding.
--
-- Estas tablas son STUBS para que los módulos descritos en los audios
-- de Erick tengan donde guardar datos cuando se construyan post-pitch.
-- TODAS son seguras de crear (no afectan tablas existentes).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 6.1 OSINT LEAD ENRICHMENT (audios 2, 3)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospects_enrichment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  telefono              VARCHAR(30) NOT NULL,
  giro_detectado        VARCHAR(50),
  business_name_detected VARCHAR(255),
  fuentes               JSONB DEFAULT '{}'::jsonb,     -- {google_maps:..., facebook:..., uber_eats:..., didi:..., rappi:...}
  productos_detectados  JSONB DEFAULT '[]'::jsonb,
  menu_url              TEXT,
  ubicacion_lat         DECIMAL(10,7),
  ubicacion_lng         DECIMAL(10,7),
  rating_promedio       DECIMAL(3,2),
  ticket_promedio_est   DECIMAL(15,4),
  enriquecido_at        TIMESTAMPTZ DEFAULT now(),
  ultima_actualizacion  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT prospects_enrichment_tenant_phone_unique UNIQUE (tenant_id, telefono)
);
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_phone ON prospects_enrichment(tenant_id, telefono);
CREATE INDEX IF NOT EXISTS idx_prospects_giro ON prospects_enrichment(giro_detectado);

-- ─────────────────────────────────────────────────────────────
-- 6.2 WHATSAPP MENU OCR (audio 3)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_ocr_jobs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL,
  cliente_id             UUID,
  imagen_url             TEXT NOT NULL,
  imagen_bytes_size      INTEGER,
  status                 VARCHAR(20) DEFAULT 'pending', -- pending|processing|done|failed
  productos_extraidos    JSONB DEFAULT '[]'::jsonb,     -- [{name, price, category, confidence}]
  texto_ocr_raw          TEXT,
  error_message          TEXT,
  procesado_at           TIMESTAMPTZ,
  costo_ai_usd           DECIMAL(8,4),
  created_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_ocr_status ON menu_ocr_jobs(tenant_id, status);

-- ─────────────────────────────────────────────────────────────
-- 6.3 COMUNIDAD B2B INTER-NEGOCIO (audios 9, 10)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b_marketplace_offers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_origen_id     UUID NOT NULL,
  producto_id           UUID,
  producto_nombre       VARCHAR(255) NOT NULL,
  cantidad              DECIMAL(15,4) NOT NULL,
  unidad                VARCHAR(20),
  precio_unidad         DECIMAL(15,4) NOT NULL,
  motivo                VARCHAR(255),                 -- "sobrestock", "descuento por volumen", "urgencia"
  estado                VARCHAR(20) DEFAULT 'activa', -- activa|expirada|aceptada|cancelada
  expira_at             TIMESTAMPTZ,
  destinatarios_jsonb   JSONB DEFAULT '[]'::jsonb,    -- IDs de tenants en radio geográfico
  zona_geografica       VARCHAR(100),
  aceptada_por          UUID,
  aceptada_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_offers_estado ON b2b_marketplace_offers(estado, expira_at);
CREATE INDEX IF NOT EXISTS idx_b2b_offers_origen ON b2b_marketplace_offers(negocio_origen_id);

CREATE TABLE IF NOT EXISTS b2b_marketplace_notificaciones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_destino_id    UUID NOT NULL,
  oferta_id             UUID REFERENCES b2b_marketplace_offers(id) ON DELETE CASCADE,
  leida                 BOOLEAN DEFAULT FALSE,
  leida_at              TIMESTAMPTZ,
  click_through         BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_notif_destino ON b2b_marketplace_notificaciones(negocio_destino_id, leida);

-- ─────────────────────────────────────────────────────────────
-- 6.4 FEE POR TRANSACCIÓN (audio 9)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_fees_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  tipo_evento           VARCHAR(50) NOT NULL,        -- "venta", "b2b_match", "compra_proveedor"
  porcentaje            DECIMAL(5,2),                 -- ej 5.00 = 5%
  monto_minimo          DECIMAL(15,4),
  monto_maximo          DECIMAL(15,4),
  fijo_amount           DECIMAL(15,4),                -- alt al porcentaje
  active                BOOLEAN DEFAULT TRUE,
  fecha_inicio          DATE,
  fecha_fin             DATE,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_fees_tenant ON transaction_fees_config(tenant_id, tipo_evento);

CREATE TABLE IF NOT EXISTS transaction_fees_charged (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  sale_id               UUID,
  tipo_evento           VARCHAR(50) NOT NULL,
  monto_transaccion     DECIMAL(15,4) NOT NULL,
  fee_amount            DECIMAL(15,4) NOT NULL,
  fee_pct               DECIMAL(5,2),
  estado_cobro          VARCHAR(20) DEFAULT 'pending', -- pending|cobrado|fallido
  cobrado_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_fees_charged ON transaction_fees_charged(tenant_id, estado_cobro);

-- ─────────────────────────────────────────────────────────────
-- 6.5 REPORTES PERSONALIZADOS COBRADOS (audios 14, 16)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reportes_personalizados (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  nombre                VARCHAR(255) NOT NULL,
  descripcion           TEXT,
  sql_generado          TEXT,                          -- SQL que generó la IA
  schema_params         JSONB DEFAULT '{}'::jsonb,    -- parámetros que toma el reporte
  precio_renta_mensual  DECIMAL(15,4),
  precio_one_shot       DECIMAL(15,4),
  formato_default       VARCHAR(20) DEFAULT 'pdf',     -- pdf|excel|csv|dashboard
  schedule_cron         VARCHAR(50),                   -- "0 9 * * 1" = lunes 9am
  last_run_at           TIMESTAMPTZ,
  total_runs            INTEGER DEFAULT 0,
  total_revenue         DECIMAL(15,4) DEFAULT 0,
  active                BOOLEAN DEFAULT TRUE,
  created_by_ai         BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rep_pers_tenant ON reportes_personalizados(tenant_id, active);

-- ─────────────────────────────────────────────────────────────
-- 6.6 WHATSAPP CRM INTEGRADO (audios 17, 18)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_crm_threads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  telefono_cliente      VARCHAR(30) NOT NULL,
  cliente_id            UUID,                          -- FK a pos_customers cuando se identifique
  customer_name         VARCHAR(255),
  agente_asignado_id    UUID,                          -- FK a pos_users
  etiquetas             JSONB DEFAULT '[]'::jsonb,    -- ["VIP","prospect","pagado","atrasado"]
  estado                VARCHAR(30) DEFAULT 'abierto', -- abierto|esperando_cliente|esperando_agente|cerrado
  ultimo_mensaje_at     TIMESTAMPTZ,
  unread_count          INTEGER DEFAULT 0,
  intent_detected       VARCHAR(100),                  -- "compra", "queja", "consulta", "soporte"
  sentiment_score       DECIMAL(3,2),                  -- -1.0 a 1.0
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_crm_tenant ON whatsapp_crm_threads(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_wa_crm_phone ON whatsapp_crm_threads(telefono_cliente);

CREATE TABLE IF NOT EXISTS whatsapp_crm_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             UUID REFERENCES whatsapp_crm_threads(id) ON DELETE CASCADE,
  direction             VARCHAR(10) NOT NULL,         -- inbound|outbound
  tipo                  VARCHAR(20) DEFAULT 'text',   -- text|image|audio|video|file|location
  contenido             TEXT,
  media_url             TEXT,
  ai_summary            TEXT,
  enviado_por           UUID,                          -- user_id si outbound desde panel
  whatsapp_message_id   VARCHAR(100),
  status                VARCHAR(20) DEFAULT 'sent',   -- sent|delivered|read|failed
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_msg_thread ON whatsapp_crm_messages(thread_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 6.7 SOPORTE AUTÓNOMO REMOTO (audios 21, 22)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS soporte_sesiones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  cliente_id            UUID,
  problema_descrito     TEXT NOT NULL,
  categoria_problema    VARCHAR(50),                  -- impresora, internet, base_datos, hardware, software
  agente_tipo           VARCHAR(20),                  -- ai_autonomous|human_remote|hybrid
  acciones_tomadas      JSONB DEFAULT '[]'::jsonb,
  anydesk_session_id    VARCHAR(100),
  teamviewer_session_id VARCHAR(100),
  duracion_seg          INTEGER,
  resuelto              BOOLEAN DEFAULT FALSE,
  resolucion_descripcion TEXT,
  cliente_satisfecho    BOOLEAN,
  rating_1_5            SMALLINT,
  costo_estimado_usd    DECIMAL(8,4),
  fecha_inicio          TIMESTAMPTZ DEFAULT now(),
  fecha_fin             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_soporte_tenant ON soporte_sesiones(tenant_id, resuelto);

-- ─────────────────────────────────────────────────────────────
-- 6.8 BUSINESS PLAN GENERATOR (audio 26)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_plans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro                     VARCHAR(50) NOT NULL,
  generado_para_tenant_id  UUID,                       -- NULL si es plantilla global
  nombre_negocio_planeado  VARCHAR(255),
  ubicacion_planeada       JSONB DEFAULT '{}'::jsonb,
  plan_completo            JSONB DEFAULT '{}'::jsonb,  -- {executive_summary, mercado, marketing, operaciones, finanzas, etc}
  proveedores_sugeridos    JSONB DEFAULT '[]'::jsonb,
  productos_iniciales      JSONB DEFAULT '[]'::jsonb,
  costos_estimados         JSONB DEFAULT '{}'::jsonb,  -- {inversion_inicial, costos_mensuales, punto_equilibrio}
  roi_proyectado_pct       DECIMAL(8,2),
  tiempo_recuperacion_meses INTEGER,
  ai_model_used            VARCHAR(50),
  ai_tokens_consumed       INTEGER,
  created_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bplans_giro ON business_plans(giro);

CREATE TABLE IF NOT EXISTS proveedores_crowdsourced (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro                     VARCHAR(50) NOT NULL,
  nombre_proveedor         VARCHAR(255) NOT NULL,
  rfc                      VARCHAR(13),
  contacto_nombre          VARCHAR(100),
  contacto_telefono        VARCHAR(30),
  contacto_whatsapp        VARCHAR(30),
  contacto_email           VARCHAR(255),
  contacto_address         TEXT,
  productos_que_vende      JSONB DEFAULT '[]'::jsonb,
  productos_precios_referencia JSONB DEFAULT '{}'::jsonb,
  ciudad                   VARCHAR(80),
  estado                   VARCHAR(80),
  pais                     VARCHAR(50) DEFAULT 'México',
  valoraciones             JSONB DEFAULT '[]'::jsonb,  -- [{rating, comentario, aportado_por}]
  valoracion_promedio      DECIMAL(3,2),
  total_aportes            INTEGER DEFAULT 1,
  aportado_por_tenant_id   UUID,
  verificado               BOOLEAN DEFAULT FALSE,
  active                   BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prov_crowd_giro ON proveedores_crowdsourced(giro, active);

-- ─────────────────────────────────────────────────────────────
-- 6.9 FACEBOOK ADS AUTOMATION (audio 27)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ads_campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  meta_campaign_id      VARCHAR(50) NOT NULL,
  campaign_name         VARCHAR(255),
  objetivo              VARCHAR(50),                  -- leads|conversions|traffic|awareness
  status                VARCHAR(20),                  -- active|paused|deleted
  presupuesto_diario    DECIMAL(15,4),
  cpl_actual            DECIMAL(15,4),
  cpl_target            DECIMAL(15,4),
  cpa_actual            DECIMAL(15,4),
  cpa_target            DECIMAL(15,4),
  total_leads           INTEGER DEFAULT 0,
  total_conversiones    INTEGER DEFAULT 0,
  total_gastado         DECIMAL(15,4) DEFAULT 0,
  roas                  DECIMAL(8,2),
  last_check_at         TIMESTAMPTZ,
  auto_paused_at        TIMESTAMPTZ,
  auto_paused_reason    TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT meta_ads_unique UNIQUE (tenant_id, meta_campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_ads_tenant ON meta_ads_campaigns(tenant_id, status);

CREATE TABLE IF NOT EXISTS meta_ads_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  rule_name             VARCHAR(100),
  rule_type             VARCHAR(50),                  -- pause_if_cpl_above|pause_if_cpa_above|scale_if_roas_above
  threshold             DECIMAL(15,4),
  action                VARCHAR(50),                  -- pause|scale_up|scale_down|notify
  active                BOOLEAN DEFAULT TRUE,
  fires_count           INTEGER DEFAULT 0,
  last_fired_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_rules_tenant ON meta_ads_rules(tenant_id, active);

-- ─────────────────────────────────────────────────────────────
-- 6.10 SEGMENTACIÓN GEOGRÁFICA POR ZONA (audio 6)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zona_perfiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_nombre              VARCHAR(100) NOT NULL UNIQUE,
  zona_slug                VARCHAR(80),
  ciudad                   VARCHAR(80),
  estado                   VARCHAR(80) DEFAULT 'Nuevo León',
  pais                     VARCHAR(50) DEFAULT 'México',
  polygon_geo              JSONB,                       -- GeoJSON polygon
  centroid_lat             DECIMAL(10,7),
  centroid_lng             DECIMAL(10,7),
  temperamento             JSONB DEFAULT '{}'::jsonb,  -- {regatea: true, formal: false, paga_efectivo: 0.6, ...}
  tasa_conversion_promedio DECIMAL(5,2),
  ticket_promedio          DECIMAL(15,4),
  filtros_obligatorios     JSONB DEFAULT '[]'::jsonb,  -- ["requiere_fiado", "factura_obligatoria"]
  insights                 TEXT,                        -- notas de Erick sobre la zona
  data_fuente              VARCHAR(100),                -- "Erick 2026", "INEGI 2024"
  active                   BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zonas_ciudad ON zona_perfiles(ciudad, active);

-- Seed inicial con 3 zonas que Erick mencionó en audios
INSERT INTO zona_perfiles (zona_nombre, zona_slug, ciudad, estado, temperamento, insights, data_fuente)
VALUES
  ('Cumbres', 'cumbres', 'Monterrey', 'Nuevo León',
   '{"regatea": true, "exige_descuento": 0.8, "paga_efectivo": 0.7, "compras_promedio_baja": true}'::jsonb,
   'Erick reporta: los clientes de Cumbres regatean siempre. Exigen descuento por todo. Pago efectivo común. Tickets más bajos.',
   'Erick 2026 (audio 6)'),
  ('Centro Monterrey', 'centro-mty', 'Monterrey', 'Nuevo León',
   '{"formal": true, "exige_factura": true, "paga_tarjeta": 0.6, "compras_promedio_media": true}'::jsonb,
   'Centro MTY: profesionistas, oficinistas. Exigen factura. Pago mixto efectivo/tarjeta. Compras de tamaño medio.',
   'Erick 2026'),
  ('Central de Abastos', 'central-abastos', 'Monterrey', 'Nuevo León',
   '{"arrogantes": true, "compra_volumen": true, "paga_efectivo": 0.9, "exige_credito": true}'::jsonb,
   'Erick reporta: Central de Abastos = arrogantes, compra por volumen, paga efectivo casi exclusivamente, exige crédito a 30 días.',
   'Erick 2026 (audio 6)')
ON CONFLICT (zona_nombre) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 6.11 MIGRACIÓN DE CLIENTES DE 3ROS (audio 11)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS importacion_jobs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL,
  sistema_origen           VARCHAR(50) NOT NULL,        -- eleventa|sicar|loyverse|softrestaurant|csv_excel
  archivo_url              TEXT,
  archivo_tipo             VARCHAR(20),                  -- firebird|sqlserver|json_api|csv|xlsx
  archivo_size_mb          DECIMAL(8,2),
  status                   VARCHAR(20) DEFAULT 'pending', -- pending|analyzing|importing|done|failed
  productos_detectados     INTEGER,
  productos_importados     INTEGER DEFAULT 0,
  clientes_detectados      INTEGER,
  clientes_importados      INTEGER DEFAULT 0,
  ventas_detectadas        INTEGER,
  ventas_importadas        INTEGER DEFAULT 0,
  proveedores_detectados   INTEGER,
  proveedores_importados   INTEGER DEFAULT 0,
  errores                  JSONB DEFAULT '[]'::jsonb,
  warnings                 JSONB DEFAULT '[]'::jsonb,
  log_completo             TEXT,
  iniciado_at              TIMESTAMPTZ,
  completado_at            TIMESTAMPTZ,
  duracion_seg             INTEGER,
  created_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_tenant ON importacion_jobs(tenant_id, status);

COMMIT;

-- ROLLBACK script (en caso de emergencia):
-- BEGIN;
-- DROP TABLE IF EXISTS importacion_jobs;
-- DROP TABLE IF EXISTS zona_perfiles;
-- DROP TABLE IF EXISTS meta_ads_rules;
-- DROP TABLE IF EXISTS meta_ads_campaigns;
-- DROP TABLE IF EXISTS proveedores_crowdsourced;
-- DROP TABLE IF EXISTS business_plans;
-- DROP TABLE IF EXISTS soporte_sesiones;
-- DROP TABLE IF EXISTS whatsapp_crm_messages;
-- DROP TABLE IF EXISTS whatsapp_crm_threads;
-- DROP TABLE IF EXISTS reportes_personalizados;
-- DROP TABLE IF EXISTS transaction_fees_charged;
-- DROP TABLE IF EXISTS transaction_fees_config;
-- DROP TABLE IF EXISTS b2b_marketplace_notificaciones;
-- DROP TABLE IF EXISTS b2b_marketplace_offers;
-- DROP TABLE IF EXISTS menu_ocr_jobs;
-- DROP TABLE IF EXISTS prospects_enrichment;
-- COMMIT;
