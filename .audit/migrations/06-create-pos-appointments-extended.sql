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
