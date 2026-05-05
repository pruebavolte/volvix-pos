-- ============================================================================
-- R17_APPOINTMENTS.sql
-- Volvix POS - Sistema de reservaciones / citas
-- Verticales: salón, spa, dental, gym, mecánica, barbería
-- Multi-tenant con RLS
-- ============================================================================

-- ---- services -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    price           NUMERIC(12,2) NOT NULL DEFAULT 0,
    category        TEXT,
    color           TEXT DEFAULT '#3b82f6',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_services_tenant      ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_active      ON services(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_services_category    ON services(tenant_id, category);

-- ---- appointments ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    customer_id     UUID,
    service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
    staff_id        UUID,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked','confirmed','canceled','completed','no_show')),
    notes           TEXT,
    price_snapshot  NUMERIC(12,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_appt_tenant_date     ON appointments(tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appt_staff_date      ON appointments(staff_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appt_customer        ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appt_status          ON appointments(tenant_id, status);

-- ---- staff_availability (recurring weekly schedule) -----------------------
CREATE TABLE IF NOT EXISTS staff_availability (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    staff_id        UUID NOT NULL,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_avail_staff          ON staff_availability(staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_avail_tenant         ON staff_availability(tenant_id);

-- ---- appointment_blocks (vacaciones, breaks, fuera-de-servicio) -----------
CREATE TABLE IF NOT EXISTS appointment_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    staff_id        UUID NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_blocks_staff_date    ON appointment_blocks(staff_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_blocks_tenant        ON appointment_blocks(tenant_id);

-- ---- RLS ------------------------------------------------------------------
ALTER TABLE services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability   ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_blocks   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_services_tenant      ON services;
DROP POLICY IF EXISTS p_appt_tenant          ON appointments;
DROP POLICY IF EXISTS p_avail_tenant         ON staff_availability;
DROP POLICY IF EXISTS p_blocks_tenant        ON appointment_blocks;

CREATE POLICY p_services_tenant ON services
    USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY p_appt_tenant ON appointments
    USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY p_avail_tenant ON staff_availability
    USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY p_blocks_tenant ON appointment_blocks
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- view: agenda diaria --------------------------------------------------
CREATE OR REPLACE VIEW v_agenda_today AS
SELECT a.id, a.tenant_id, a.staff_id, a.customer_id,
       a.starts_at, a.ends_at, a.status, a.notes,
       s.name AS service_name, s.duration_minutes, s.price, s.color
FROM appointments a
LEFT JOIN services s ON s.id = a.service_id
WHERE a.starts_at::date = CURRENT_DATE
  AND a.status IN ('booked','confirmed','completed');

-- ---- trigger: updated_at --------------------------------------------------
CREATE OR REPLACE FUNCTION fn_appt_touch_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appt_updated ON appointments;
CREATE TRIGGER trg_appt_updated BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION fn_appt_touch_updated();

DROP TRIGGER IF EXISTS trg_services_updated ON services;
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION fn_appt_touch_updated();
