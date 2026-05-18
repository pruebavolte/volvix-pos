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
