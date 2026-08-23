-- R41 — Gate de autorización manual del dueño (2026-08-23)
-- Modelo: el registro es abierto/gratis pero el alta NO entra hasta que el dueño autoriza.
-- Amplía el CHECK de pos_companies.status para admitir los estados del gate.
--
-- ANTES: CHECK (status = ANY (ARRAY['pending','active','suspended','deleted']))
-- Nuevos estados:
--   awaiting_approval = alta verificada, esperando autorización del dueño (BLOQUEA acceso)
--   rejected          = el dueño rechazó el alta (BLOQUEA acceso, revoca tokens)
--   revoked, expired  = ya usados por el kill-switch de requireAuth (antes no se podían escribir)
--
-- Widening = seguro: todas las filas existentes son 'pending'/'active' (siguen válidas).
-- YA APLICADO en prod vnruooisqnbqguavrdvd el 2026-08-23. Idempotente.

ALTER TABLE pos_companies DROP CONSTRAINT IF EXISTS pos_companies_status_check;
ALTER TABLE pos_companies ADD CONSTRAINT pos_companies_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'active'::text,
    'suspended'::text,
    'deleted'::text,
    'awaiting_approval'::text,
    'rejected'::text,
    'revoked'::text,
    'expired'::text
  ]));

-- Enforcement (código, no SQL):
--   requireAuth bloquea 403 si status in {suspended,revoked,expired,awaiting_approval,rejected}; fail-open sin fila.
--   verify-simple/verify-otp/verify-email-link: la company nace status='awaiting_approval', is_active=false.
--   POST /api/admin/tenant/:tid/authorize => status='active', is_active=true, expires_at=now()+TRIAL_DIAS.
--   POST /api/admin/tenant/:tid/reject    => status='rejected', is_active=false + revoca tokens.
