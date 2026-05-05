-- ============================================================================
-- R17_RETURNS_EXTENDED.sql — Devoluciones extendidas con workflow + restock
-- Idempotente. Requiere: pos_returns (R14), pos_products, pos_sales.
-- ============================================================================

-- 1) Extender columnas en pos_returns
alter table pos_returns
  add column if not exists processed_by         uuid,
  add column if not exists original_payment_id  uuid,
  add column if not exists restock_qty          boolean not null default true,
  add column if not exists approved_by          uuid,
  add column if not exists approved_at          timestamptz;

alter table pos_returns
  alter column refund_method set default 'cash';

update pos_returns set refund_method = 'cash'
  where refund_method in ('efectivo','EFECTIVO') or refund_method is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_returns_refund_method_chk'
  ) then
    alter table pos_returns
      add constraint pos_returns_refund_method_chk
      check (refund_method in ('cash','card','store_credit','gift_card'));
  end if;
end$$;

do $$
declare cn text;
begin
  select conname into cn
    from pg_constraint
    where conrelid='pos_returns'::regclass
      and conname like 'pos_returns_status%check%' limit 1;
  if cn is not null then
    execute 'alter table pos_returns drop constraint ' || quote_ident(cn);
  end if;
end$$;

alter table pos_returns
  add constraint pos_returns_status_check
  check (status in ('pending','approved','rejected','completed'));

create index if not exists pos_returns_approved_idx
  on pos_returns(approved_by, approved_at desc);

-- 2) Trigger: al aprobar/completar y restock_qty=true, suma stock a pos_products
create or replace function fn_after_return_approved()
returns trigger
language plpgsql
as $$
declare
  it jsonb;
  pid uuid;
  qty numeric;
begin
  if new.status in ('approved','completed')
     and (old.status is distinct from new.status)
     and coalesce(new.restock_qty, true) = true then
    for it in select * from jsonb_array_elements(coalesce(new.items_returned,'[]'::jsonb))
    loop
      pid := nullif(it->>'product_id','')::uuid;
      qty := coalesce((it->>'qty')::numeric, (it->>'quantity')::numeric, 0);
      if pid is not null and qty > 0 then
        update pos_products
          set stock = coalesce(stock,0) + qty,
              updated_at = now()
          where id = pid and tenant_id = new.tenant_id;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_return_approved on pos_returns;
create trigger trg_after_return_approved
  after update on pos_returns
  for each row
  execute function fn_after_return_approved();

-- 3) Vista de stats agregadas
create or replace view v_returns_stats as
select
  r.tenant_id,
  date_trunc('day', r.created_at) as day,
  count(*)                                       as total_returns,
  count(*) filter (where r.status='approved')    as approved_count,
  count(*) filter (where r.status='rejected')    as rejected_count,
  count(*) filter (where r.status='completed')   as completed_count,
  coalesce(sum(r.refund_amount) filter (where r.status in ('approved','completed')),0)
                                                 as refunded_total,
  mode() within group (order by r.reason)        as top_reason
from pos_returns r
group by r.tenant_id, date_trunc('day', r.created_at);
