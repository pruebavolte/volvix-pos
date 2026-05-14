-- R30: Añadir columnas faltantes a pos_users para el flujo de "creación rápida estilo Excel"
-- Endpoint: POST /api/admin/users/inline-quick (paneldecontrol.html)
-- Fecha: 2026-05-14
-- Idempotente: usa IF NOT EXISTS

BEGIN;

-- 1) business_type: tipo de giro del usuario (cafeteria, ropa, etc.)
ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS business_type text;

-- 2) must_change_password: bandera para forzar cambio de contraseña en primer login
ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;

-- 3) Índices útiles (sólo si no existen)
CREATE INDEX IF NOT EXISTS idx_pos_users_business_type
  ON public.pos_users (business_type)
  WHERE business_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_users_must_change_password
  ON public.pos_users (must_change_password)
  WHERE must_change_password = true;

-- 4) Comentarios para documentación
COMMENT ON COLUMN public.pos_users.business_type IS
  'Giro/categoría de negocio del usuario (cafeteria, ropa, gimnasio, etc.) — usado en bootstrap de productos demo';
COMMENT ON COLUMN public.pos_users.must_change_password IS
  'Si es true, el usuario debe cambiar su contraseña en el próximo login (típico de creación rápida con password temporal)';

COMMIT;

-- Verificación (correr manualmente para confirmar)
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='pos_users'
--   AND column_name IN ('business_type','must_change_password');
