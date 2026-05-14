-- 2026-05-14 — R29: Tablas para Motor de Periféricos completo.
--
-- Cumple arquitectura: 1 solo sistema modular, todo configurable sin programar.
-- Periféricos persistentes en DB para sincronizacion cross-device.

-- 1. PRINTERS — Impresoras dadas de alta por tenant
CREATE TABLE IF NOT EXISTS printers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  name        text NOT NULL,                  -- Nombre amigable: "Cocina", "Barra"
  device_name text,                            -- Nombre del SO: "POS-80", "EPSON TM-T20"
  type        text NOT NULL DEFAULT 'thermal', -- thermal|a4|label|bluetooth|network
  connection  text NOT NULL DEFAULT 'system',  -- system|bluetooth|network|usb|serial
  paper_size  text DEFAULT '80mm',             -- 58mm|80mm|A4|letter|quarter|half|label
  config      jsonb,                           -- {ip, port, baudRate, btDeviceId, etc.}
  is_default  boolean DEFAULT false,
  active      boolean DEFAULT true,
  capabilities jsonb DEFAULT '{}'::jsonb,      -- {cut:true, drawer:true, beep:true}
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_printers_tenant ON printers(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_printers_tenant_name ON printers(tenant_id, name);

-- 2. PRINTER_ROUTES — Reglas de ruteo (categoria/tipo doc -> impresora)
CREATE TABLE IF NOT EXISTS printer_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  priority    int DEFAULT 100,
  rule_type   text NOT NULL,                  -- category|department|doc_type|product|always
  match_value text,                            -- valor a matchear ('cocina', 'bebidas', 'ticket', etc.)
  printer_id  uuid REFERENCES printers(id) ON DELETE CASCADE,
  format      text,                            -- ticket58|ticket80|A4|nota_quarter|nota_half
  copies      int DEFAULT 1,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routes_tenant ON printer_routes(tenant_id);

-- 3. PRINT_QUEUE — Cola de impresion con retry
CREATE TABLE IF NOT EXISTS print_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  printer_id   uuid REFERENCES printers(id) ON DELETE SET NULL,
  document_type text NOT NULL,                 -- ticket|nota|factura|cotizacion|comanda|etiqueta|label
  reference_id uuid,                            -- sale_id o equivalente
  payload      jsonb NOT NULL,                  -- contenido a imprimir (items, total, etc.)
  format       text,
  copies       int DEFAULT 1,
  status       text NOT NULL DEFAULT 'pending', -- pending|printing|done|failed|cancelled
  attempts     int DEFAULT 0,
  max_attempts int DEFAULT 3,
  last_error   text,
  user_id      uuid,
  created_at   timestamptz DEFAULT now(),
  started_at   timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_queue_tenant_status ON print_queue(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_ref ON print_queue(reference_id);

-- 4. PRINT_HISTORY — Log inmutable de impresiones
CREATE TABLE IF NOT EXISTS print_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  queue_id     uuid REFERENCES print_queue(id) ON DELETE SET NULL,
  printer_id   uuid,
  printer_name text,
  document_type text,
  reference_id uuid,
  status       text NOT NULL,                  -- success|failed|cancelled
  copies       int,
  user_id      uuid,
  error        text,
  duration_ms  int,
  printed_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_tenant_date ON print_history(tenant_id, printed_at DESC);

-- 5. FINGERPRINT_ENROLLMENTS — Huellas encriptadas
CREATE TABLE IF NOT EXISTS fingerprint_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  customer_id   uuid,                           -- para clientes (gimnasio)
  user_id       uuid,                           -- para empleados (asistencia)
  finger_index  int NOT NULL DEFAULT 0,         -- 0=pulgar der, 1=indice der, ... 5=pulgar izq, etc.
  template_b64  text NOT NULL,                  -- plantilla biometrica encriptada
  template_hash text,                            -- SHA256 del template para dedupe
  quality_score int,                             -- 0-100 calidad de la lectura
  device_model  text,                            -- 'HID_UareU_4500', 'Ingressio_URU_4500', etc.
  enrolled_by   uuid,
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_tenant ON fingerprint_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fp_customer ON fingerprint_enrollments(tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_user ON fingerprint_enrollments(tenant_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_template_hash ON fingerprint_enrollments(tenant_id, template_hash) WHERE template_hash IS NOT NULL;

-- 6. FINGERPRINT_LOGS — Auditoria accesos biometricos
CREATE TABLE IF NOT EXISTS fingerprint_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  enrollment_id   uuid REFERENCES fingerprint_enrollments(id) ON DELETE SET NULL,
  event_type      text NOT NULL,                -- enroll|verify_ok|verify_fail|access_granted|access_denied|membership_expired
  customer_id     uuid,
  user_id         uuid,
  device_model    text,
  match_score     numeric(5,2),                  -- 0-100
  ip              text,
  notes           text,
  ts              timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_logs_tenant_ts ON fingerprint_logs(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fp_logs_event ON fingerprint_logs(tenant_id, event_type);

-- 7. PRINTER_STATUS — Estado en tiempo real de cada impresora
CREATE TABLE IF NOT EXISTS printer_status (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  printer_id  uuid REFERENCES printers(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'unknown', -- ready|busy|offline|paper_out|error|low_battery
  last_seen   timestamptz DEFAULT now(),
  last_error  text,
  paper_level int,                              -- 0-100 estimado
  updated_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_printer_status ON printer_status(printer_id);

-- 8. MODULE_TERMINOLOGY — Personalizacion de etiquetas por giro
CREATE TABLE IF NOT EXISTS module_terminology (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  text NOT NULL,
  module_key text NOT NULL,                    -- 'customers' -> 'socios', 'sales' -> 'cobros', etc.
  custom_label text NOT NULL,
  giro       text,                              -- gym|farmacia|veterinaria|restaurante|tienda
  active     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminology ON module_terminology(tenant_id, module_key);

-- GRANTS
GRANT SELECT,INSERT,UPDATE,DELETE ON printers TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON printer_routes TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON print_queue TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON print_history TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON fingerprint_enrollments TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON fingerprint_logs TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON printer_status TO authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON module_terminology TO authenticated, service_role;

-- Verificacion
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('printers','printer_routes','print_queue','print_history','fingerprint_enrollments','fingerprint_logs','printer_status','module_terminology')
ORDER BY table_name;
