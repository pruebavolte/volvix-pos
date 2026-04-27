-- R18_HR.sql — Recursos Humanos
CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  hours_worked NUMERIC(6,2),
  late_minutes INT DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, check_in);

CREATE TABLE IF NOT EXISTS time_off (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('vacation','sick','personal')),
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by BIGINT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timeoff_emp ON time_off(employee_id, status);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  reviewer_id BIGINT NOT NULL,
  period TEXT NOT NULL,
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  comments TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perfrev_emp ON performance_reviews(employee_id, period);

CREATE TABLE IF NOT EXISTS employee_documents (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empdocs_emp ON employee_documents(employee_id, type);
