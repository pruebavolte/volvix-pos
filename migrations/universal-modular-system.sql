-- ============================================================
-- UNIVERSAL MODULAR SYSTEM
-- Tablas para: recetas (compuestos), variantes, modificadores,
-- reglas dinámicas (horario/ley seca/precio), terminología.
-- ============================================================

-- ----------------------------------------------------
-- 1. PRODUCT_RECIPES — six = 6×lata, hamburguesa = 2×pan + 1×carne + ...
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS product_recipes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  parent_sku      text        NOT NULL,                     -- producto compuesto
  child_sku       text        NOT NULL,                     -- ingrediente / componente
  quantity        numeric(12,4) NOT NULL DEFAULT 1,
  unit            text        DEFAULT 'pieza',              -- pieza/kg/l/etc.
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parent_sku, child_sku)
);

CREATE INDEX IF NOT EXISTS idx_recipes_tenant_parent ON product_recipes(tenant_id, parent_sku);

-- ----------------------------------------------------
-- 2. PRODUCT_VARIANTS — talla/color/sabor/temperatura, c/u con su precio y stock
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  parent_sku      text        NOT NULL,
  variant_key     text        NOT NULL,                     -- "frio" | "caliente" | "M-rojo" | "350ml"
  variant_label   text        NOT NULL,                     -- "Frío" | "Caliente" | "Mediano Rojo"
  attributes      jsonb       DEFAULT '{}'::jsonb,          -- { size:"M", color:"rojo", temp:"frio" }
  price           numeric(12,2),                            -- precio override (NULL = hereda del padre)
  cost            numeric(12,2),
  stock           numeric(12,2) DEFAULT 0,
  barcode         text,
  active          boolean     NOT NULL DEFAULT true,
  sort_order      int         DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parent_sku, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_variants_tenant_parent ON product_variants(tenant_id, parent_sku);

-- ----------------------------------------------------
-- 3. PRODUCT_MODIFIERS — extra queso (+15), sin tomate (0), tocino (+25)
--   NOTA: variantes ≠ modificadores
--     variante  = define el producto que el usuario elige (frío/caliente)
--     modifier  = ajustes opcionales en la línea de venta (extra/sin)
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS product_modifiers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  parent_sku      text        NOT NULL,
  modifier_key    text        NOT NULL,                     -- "extra-queso"
  modifier_label  text        NOT NULL,                     -- "Extra queso"
  group_label     text,                                     -- "Extras" | "Sin" | "Cocción"
  price_delta     numeric(12,2) NOT NULL DEFAULT 0,         -- +15.00 | -0 | +25.00
  required        boolean     NOT NULL DEFAULT false,
  multiselect     boolean     NOT NULL DEFAULT true,
  max_qty         int         DEFAULT 1,
  active          boolean     NOT NULL DEFAULT true,
  sort_order      int         DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parent_sku, modifier_key)
);

CREATE INDEX IF NOT EXISTS idx_modifiers_tenant_parent ON product_modifiers(tenant_id, parent_sku);

-- ----------------------------------------------------
-- 4. PRODUCT_RULES — horarios, ley seca, pricing dinámico, días, restricciones
--   rule_type ejemplos:
--     'schedule_block'  → no se vende fuera de este horario (data: {from:"22:00", to:"06:00", action:"block"})
--     'schedule_price'  → cambia precio fuera de horario (data: {from:"02:00", to:"06:00", price:35})
--     'ley_seca'        → bloquea por bandera global (data: {label:"Ley seca electoral"})
--     'min_age'         → requiere edad (data: {age:18})
--     'volume_discount' → descuento por volumen (data: {min_qty:6, discount_pct:10})
--     'weekday_only'    → sólo días específicos (data: {days:["mon","tue","wed","thu","fri"]})
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS product_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  scope           text        NOT NULL DEFAULT 'sku',       -- 'sku' | 'category' | 'global'
  scope_value     text,                                     -- el sku o la categoría (NULL si global)
  rule_type       text        NOT NULL,                     -- ver comentarios arriba
  rule_data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  priority        int         NOT NULL DEFAULT 100,
  active          boolean     NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_tenant_scope ON product_rules(tenant_id, scope, scope_value);
CREATE INDEX IF NOT EXISTS idx_rules_tenant_type  ON product_rules(tenant_id, rule_type);

-- ----------------------------------------------------
-- 5. TENANT_TERMINOLOGY — diccionario per-tenant
--   key: "cliente" | "venta" | "ticket" | "producto" | "servicio"
--   value: lo que se renderiza en UI (Paciente, Consulta, Receta, …)
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_terminology (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  term_key        text        NOT NULL,
  term_value      text        NOT NULL,
  locale          text        NOT NULL DEFAULT 'es-MX',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, term_key, locale)
);

CREATE INDEX IF NOT EXISTS idx_terminology_tenant ON tenant_terminology(tenant_id, locale);

-- ----------------------------------------------------
-- 6. PRODUCT_FEATURE_FLAGS — qué flags universales tiene activos un producto
--   Alternativa: columna jsonb 'feature_flags' en pos_products. Esta tabla permite indexar y query.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS product_feature_flags (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  sku             text        NOT NULL,
  flag_key        text        NOT NULL,                     -- 'usa_receta', 'usa_variantes', etc.
  flag_value      boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_pff_tenant_sku  ON product_feature_flags(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_pff_tenant_flag ON product_feature_flags(tenant_id, flag_key);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_recipes_uat')   THEN CREATE TRIGGER trg_recipes_uat   BEFORE UPDATE ON product_recipes   FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_variants_uat')  THEN CREATE TRIGGER trg_variants_uat  BEFORE UPDATE ON product_variants  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_modifiers_uat') THEN CREATE TRIGGER trg_modifiers_uat BEFORE UPDATE ON product_modifiers FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_rules_uat')     THEN CREATE TRIGGER trg_rules_uat     BEFORE UPDATE ON product_rules     FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_terminology_uat') THEN CREATE TRIGGER trg_terminology_uat BEFORE UPDATE ON tenant_terminology FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at(); END IF;
END $$;

-- ============================================================
-- RLS — tenant isolation + service_role bypass
-- ============================================================
ALTER TABLE product_recipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_terminology     ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_feature_flags  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_recipes' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON product_recipes
      FOR ALL
      USING ( tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
              OR current_setting('request.jwt.claim.role', true) IN ('service_role','superadmin') );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_variants' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON product_variants
      FOR ALL
      USING ( tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
              OR current_setting('request.jwt.claim.role', true) IN ('service_role','superadmin') );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_modifiers' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON product_modifiers
      FOR ALL
      USING ( tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
              OR current_setting('request.jwt.claim.role', true) IN ('service_role','superadmin') );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_rules' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON product_rules
      FOR ALL
      USING ( tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
              OR current_setting('request.jwt.claim.role', true) IN ('service_role','superadmin') );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_terminology' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON tenant_terminology
      FOR ALL
      USING ( tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
              OR current_setting('request.jwt.claim.role', true) IN ('service_role','superadmin') );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_feature_flags' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON product_feature_flags
      FOR ALL
      USING ( tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
              OR current_setting('request.jwt.claim.role', true) IN ('service_role','superadmin') );
  END IF;
END $$;

-- ============================================================
-- DONE.
-- Aplicar en Supabase SQL editor o vía CLI:
--   psql $DATABASE_URL -f migrations/universal-modular-system.sql
-- ============================================================
