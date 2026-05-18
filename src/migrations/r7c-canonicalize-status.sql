-- ============================================================================
-- R7c — CANONICALIZE STATUS SPELLING ('canceled' → 'cancelled')
-- Idempotente. Cierra issue residual N1 del audit Round 7c.
-- ============================================================================
-- DECISION:
--   Canonical: 'cancelled' (British, doble L). Es el valor MÁS USADO
--   en el codebase (R1 state machine, R3a hardening, b43-pos-returns,
--   inventory-movements, owner-saas, b39-tables, etc).
--
--   El spelling 'canceled' (American, una L) era doble-aceptado en:
--     - pos_sales_status_check (r1 + r3a)
--     - kds_tickets_status_check (r5a)
--   Esta migration normaliza filas existentes, drop+recreate constraints
--   con sólo 'cancelled', y deja la state machine determinística.
--
-- IMPORTANTE: Stripe mantiene su spelling americano interno (status='canceled'
--   en Stripe API responses). Las columnas que sincronizan Stripe NO se tocan:
--     - subscriptions.status (sync directo de Stripe webhook)
--     - customer_subscriptions.status (idem)
--   Sólo se canonicaliza POS/KDS/RETURNS internos.
-- ============================================================================
-- Apply with: supabase db query --linked < migrations/r7c-canonicalize-status.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Normalizar filas existentes: 'canceled' → 'cancelled'
-- ---------------------------------------------------------------------------
do $$
declare
  pos_sales_migrated int := 0;
  pos_returns_migrated int := 0;
  kds_tickets_migrated int := 0;
begin
  -- pos_sales
  if exists (select 1 from information_schema.tables where table_name='pos_sales') then
    update pos_sales set status='cancelled' where status='canceled';
    get diagnostics pos_sales_migrated = row_count;
    raise notice 'R7c: pos_sales rows migrated canceled→cancelled: %', pos_sales_migrated;
  end if;

  -- pos_returns (no debería tener 'canceled' pero por seguridad)
  if exists (select 1 from information_schema.tables where table_name='pos_returns') then
    update pos_returns set status='cancelled' where status='canceled';
    get diagnostics pos_returns_migrated = row_count;
    raise notice 'R7c: pos_returns rows migrated canceled→cancelled: %', pos_returns_migrated;
  end if;

  -- kds_tickets (r5a aceptaba 'canceled' americano)
  if exists (select 1 from information_schema.tables where table_name='kds_tickets') then
    update kds_tickets set status='cancelled' where status='canceled';
    get diagnostics kds_tickets_migrated = row_count;
    raise notice 'R7c: kds_tickets rows migrated canceled→cancelled: %', kds_tickets_migrated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) pos_sales_status_check — drop ambigüedad ('canceled' fuera del set)
--    Replace con set canónico: solo 'cancelled' (sin 'canceled').
--    Estados válidos: pending, printed, paid, cancelled, refunded, partially_refunded
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_name='pos_sales') then
    begin
      alter table pos_sales drop constraint if exists pos_sales_status_check;
    exception when others then null;
    end;
    begin
      alter table pos_sales
        add constraint pos_sales_status_check
        check (status in (
          'pending',
          'printed',
          'paid',
          'cancelled',
          'refunded',
          'partially_refunded'
        ));
    exception when duplicate_object then null;
    end;
    raise notice 'R7c: pos_sales_status_check recreated (canonical: cancelled only)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) pos_returns_status_check — confirmar canonical ('cancelled' ya estaba bien)
--    Re-create defensivamente para asegurar consistencia post-migration.
--    Estados válidos: pending, approved, rejected, completed, cancelled
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_name='pos_returns') then
    begin
      alter table pos_returns drop constraint if exists pos_returns_status_check;
    exception when others then null;
    end;
    begin
      alter table pos_returns
        add constraint pos_returns_status_check
        check (status in (
          'pending',
          'approved',
          'rejected',
          'completed',
          'cancelled'
        ));
    exception when duplicate_object then null;
    end;
    raise notice 'R7c: pos_returns_status_check recreated (canonical: cancelled)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) kds_tickets_status_check — drop 'canceled' americano, replace con 'cancelled'
--    Estados válidos: received, preparing, ready, served, cancelled, needs_attention
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_name='kds_tickets') then
    begin
      alter table kds_tickets drop constraint if exists kds_tickets_status_check;
    exception when others then null;
    end;
    begin
      alter table kds_tickets
        add constraint kds_tickets_status_check
        check (status in (
          'received',
          'preparing',
          'ready',
          'served',
          'cancelled',
          'needs_attention'
        ));
    exception when duplicate_object then null;
    end;
    raise notice 'R7c: kds_tickets_status_check recreated (canonical: cancelled only)';
  end if;
end $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- SMOKE QUERIES (verificación manual post-aplicación):
--
--   -- Ver constraints actuales:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN (
--     'pos_sales_status_check',
--     'pos_returns_status_check',
--     'kds_tickets_status_check'
--   );
--
--   -- Verificar que NO hay filas con 'canceled' (americano):
--   SELECT 'pos_sales' AS tbl, count(*) AS bad FROM pos_sales WHERE status='canceled'
--   UNION ALL
--   SELECT 'pos_returns', count(*) FROM pos_returns WHERE status='canceled'
--   UNION ALL
--   SELECT 'kds_tickets', count(*) FROM kds_tickets WHERE status='canceled';
--   -- Esperado: bad=0 en todas las filas.
-- =============================================================================
