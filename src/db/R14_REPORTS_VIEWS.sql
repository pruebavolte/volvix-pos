-- =====================================================================
-- Volvix POS — R14 Reports BI: Materialized Views + RPC Functions
-- Ejecutar en: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new
-- =====================================================================
-- Requiere las tablas: volvix_ventas, volvix_productos, volvix_tenants
-- Las MVs se filtran por tenant_id en el query (no requiere parámetros).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) MV_SALES_DAILY  — Ventas agregadas por día y tenant
-- ---------------------------------------------------------------------
drop materialized view if exists mv_sales_daily cascade;
create materialized view mv_sales_daily as
select
  v.tenant_id,
  date_trunc('day', v.created_at)::date as dia,
  count(*)               as tickets,
  sum(v.total)           as venta_total,
  sum(v.subtotal)        as subtotal_total,
  sum(v.iva)             as iva_total,
  sum(v.descuento)       as descuento_total,
  avg(v.total)           as ticket_promedio,
  min(v.total)           as ticket_min,
  max(v.total)           as ticket_max
from volvix_ventas v
where coalesce(v.estado,'completada') = 'completada'
group by v.tenant_id, date_trunc('day', v.created_at)::date;

create unique index if not exists mv_sales_daily_idx
  on mv_sales_daily(tenant_id, dia);

-- ---------------------------------------------------------------------
-- 2) MV_TOP_PRODUCTS  — Top productos por unidades e ingresos
--    Expande items jsonb: cada item esperado con {producto_id, nombre, cantidad, precio}
-- ---------------------------------------------------------------------
drop materialized view if exists mv_top_products cascade;
create materialized view mv_top_products as
select
  v.tenant_id,
  date_trunc('day', v.created_at)::date as dia,
  coalesce(item->>'producto_id', item->>'id') as producto_id,
  coalesce(item->>'nombre', 'desconocido')    as nombre,
  sum( coalesce((item->>'cantidad')::numeric, 1) ) as unidades,
  sum( coalesce((item->>'cantidad')::numeric, 1)
       * coalesce((item->>'precio')::numeric, 0) ) as ingreso,
  sum( coalesce((item->>'cantidad')::numeric, 1)
       * coalesce((item->>'costo')::numeric, 0) )  as costo
from volvix_ventas v,
     lateral jsonb_array_elements(coalesce(v.items, '[]'::jsonb)) as item
where coalesce(v.estado,'completada') = 'completada'
group by v.tenant_id, date_trunc('day', v.created_at)::date,
         coalesce(item->>'producto_id', item->>'id'),
         coalesce(item->>'nombre', 'desconocido');

create index if not exists mv_top_products_idx
  on mv_top_products(tenant_id, dia, producto_id);

-- ---------------------------------------------------------------------
-- 3) MV_INVENTORY_VALUE  — Valor de inventario por categoría
-- ---------------------------------------------------------------------
drop materialized view if exists mv_inventory_value cascade;
create materialized view mv_inventory_value as
select
  p.tenant_id,
  coalesce(p.categoria, 'sin_categoria') as categoria,
  count(*)                                as skus,
  sum(p.stock)                            as unidades_total,
  sum(p.stock * p.costo)                  as valor_costo,
  sum(p.stock * p.precio)                 as valor_venta,
  sum(p.stock * (p.precio - p.costo))     as margen_potencial
from volvix_productos p
where coalesce(p.activo, true) = true
group by p.tenant_id, coalesce(p.categoria, 'sin_categoria');

create index if not exists mv_inventory_value_idx
  on mv_inventory_value(tenant_id, categoria);

-- =====================================================================
-- REFRESH STRATEGY
-- ---------------------------------------------------------------------
-- Recomendación:
--   * mv_sales_daily       → cada 15 min (CONCURRENTLY, requiere unique idx)
--   * mv_top_products      → cada 30 min
--   * mv_inventory_value   → cada 5 min (cambia con cada venta y compra)
--
-- Opción A — pg_cron (Supabase soporta extensión pg_cron):
--   create extension if not exists pg_cron;
--   select cron.schedule('refresh_mv_sales_daily',  '*/15 * * * *',
--     $$ refresh materialized view concurrently mv_sales_daily $$);
--   select cron.schedule('refresh_mv_top_products', '*/30 * * * *',
--     $$ refresh materialized view mv_top_products $$);
--   select cron.schedule('refresh_mv_inventory_value','*/5 * * * *',
--     $$ refresh materialized view mv_inventory_value $$);
--
-- Opción B — invocar refresh desde el backend Node tras cada venta/upsert
--   (POST /api/reports/refresh — sólo admin/owner).
-- =====================================================================

-- Función helper para refrescar todo (usada por endpoint admin)
create or replace function refresh_all_reports() returns void as $$
begin
  refresh materialized view concurrently mv_sales_daily;
  refresh materialized view mv_top_products;
  refresh materialized view mv_inventory_value;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 4) RPC: report_sales_by_cashier
-- ---------------------------------------------------------------------
create or replace function report_sales_by_cashier(
  p_tenant_id uuid,
  p_from      timestamptz default (now() - interval '30 days'),
  p_to        timestamptz default now()
) returns table (
  cajero          text,
  tickets         bigint,
  venta_total     numeric,
  ticket_promedio numeric
) as $$
  select
    coalesce(v.cajero, 'sin_cajero') as cajero,
    count(*)::bigint                  as tickets,
    sum(v.total)::numeric             as venta_total,
    avg(v.total)::numeric             as ticket_promedio
  from volvix_ventas v
  where v.tenant_id = p_tenant_id
    and v.created_at between p_from and p_to
    and coalesce(v.estado,'completada') = 'completada'
  group by coalesce(v.cajero, 'sin_cajero')
  order by venta_total desc nulls last;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 5) RPC: report_profit  (margen bruto = ingreso - costo)
-- ---------------------------------------------------------------------
create or replace function report_profit(
  p_tenant_id uuid,
  p_from      timestamptz default (now() - interval '30 days'),
  p_to        timestamptz default now()
) returns table (
  dia          date,
  ingreso      numeric,
  costo        numeric,
  utilidad     numeric,
  margen_pct   numeric
) as $$
  with line_items as (
    select
      date_trunc('day', v.created_at)::date as dia,
      coalesce((item->>'cantidad')::numeric, 1) as qty,
      coalesce((item->>'precio')::numeric, 0)   as pu,
      coalesce(
        (item->>'costo')::numeric,
        (select p.costo from volvix_productos p
          where p.id::text = coalesce(item->>'producto_id', item->>'id')
          limit 1),
        0
      ) as cu
    from volvix_ventas v,
         lateral jsonb_array_elements(coalesce(v.items, '[]'::jsonb)) as item
    where v.tenant_id = p_tenant_id
      and v.created_at between p_from and p_to
      and coalesce(v.estado,'completada') = 'completada'
  )
  select
    dia,
    sum(qty * pu)::numeric                             as ingreso,
    sum(qty * cu)::numeric                             as costo,
    (sum(qty * pu) - sum(qty * cu))::numeric           as utilidad,
    case when sum(qty * pu) > 0
         then ((sum(qty * pu) - sum(qty * cu)) / sum(qty * pu) * 100)::numeric(10,2)
         else 0 end                                    as margen_pct
  from line_items
  group by dia
  order by dia;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 6) RPC: report_abc_analysis
--    Clase A: top 80% del ingreso, B: siguiente 15%, C: último 5%
-- ---------------------------------------------------------------------
create or replace function report_abc_analysis(
  p_tenant_id uuid,
  p_from      timestamptz default (now() - interval '90 days'),
  p_to        timestamptz default now()
) returns table (
  producto_id   text,
  nombre        text,
  unidades      numeric,
  ingreso       numeric,
  pct_ingreso   numeric,
  pct_acumulado numeric,
  clase         text
) as $$
  with prod as (
    select
      coalesce(item->>'producto_id', item->>'id') as producto_id,
      coalesce(item->>'nombre', 'desconocido')    as nombre,
      sum(coalesce((item->>'cantidad')::numeric, 1)) as unidades,
      sum(coalesce((item->>'cantidad')::numeric, 1)
        * coalesce((item->>'precio')::numeric, 0)) as ingreso
    from volvix_ventas v,
         lateral jsonb_array_elements(coalesce(v.items, '[]'::jsonb)) as item
    where v.tenant_id = p_tenant_id
      and v.created_at between p_from and p_to
      and coalesce(v.estado,'completada') = 'completada'
    group by 1, 2
  ),
  total as (select nullif(sum(ingreso),0) as t from prod),
  ranked as (
    select
      p.*,
      (p.ingreso / t.t * 100)::numeric(10,2) as pct_ingreso,
      (sum(p.ingreso) over (order by p.ingreso desc) / t.t * 100)::numeric(10,2)
        as pct_acumulado
    from prod p, total t
    where t.t is not null
  )
  select
    producto_id, nombre, unidades, ingreso, pct_ingreso, pct_acumulado,
    case
      when pct_acumulado <= 80  then 'A'
      when pct_acumulado <= 95  then 'B'
      else 'C'
    end as clase
  from ranked
  order by ingreso desc;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 7) RPC: report_customers_cohort
--    Retención 30/60/90 días basada en `cajero` como proxy de cliente
--    (no hay tabla volvix_clientes; si existe, reemplazar v.cajero por v.cliente_id).
-- ---------------------------------------------------------------------
create or replace function report_customers_cohort(
  p_tenant_id uuid
) returns table (
  cohorte_mes   date,
  clientes      bigint,
  retenidos_30  bigint,
  retenidos_60  bigint,
  retenidos_90  bigint,
  ret_30_pct    numeric,
  ret_60_pct    numeric,
  ret_90_pct    numeric
) as $$
  with first_seen as (
    select
      coalesce(cajero, 'anon') as cliente_key,
      min(created_at)          as primera_compra
    from volvix_ventas
    where tenant_id = p_tenant_id
      and coalesce(estado,'completada') = 'completada'
    group by coalesce(cajero, 'anon')
  ),
  cohorts as (
    select
      cliente_key,
      date_trunc('month', primera_compra)::date as cohorte_mes,
      primera_compra
    from first_seen
  ),
  activity as (
    select
      c.cohorte_mes,
      c.cliente_key,
      max(case when v.created_at between c.primera_compra + interval '1 day'
                                     and c.primera_compra + interval '30 days'
               then 1 else 0 end) as r30,
      max(case when v.created_at between c.primera_compra + interval '31 days'
                                     and c.primera_compra + interval '60 days'
               then 1 else 0 end) as r60,
      max(case when v.created_at between c.primera_compra + interval '61 days'
                                     and c.primera_compra + interval '90 days'
               then 1 else 0 end) as r90
    from cohorts c
    left join volvix_ventas v
      on v.tenant_id = p_tenant_id
     and coalesce(v.cajero,'anon') = c.cliente_key
    group by c.cohorte_mes, c.cliente_key
  )
  select
    cohorte_mes,
    count(*)::bigint                            as clientes,
    sum(r30)::bigint                            as retenidos_30,
    sum(r60)::bigint                            as retenidos_60,
    sum(r90)::bigint                            as retenidos_90,
    (sum(r30)::numeric / nullif(count(*),0) * 100)::numeric(5,2) as ret_30_pct,
    (sum(r60)::numeric / nullif(count(*),0) * 100)::numeric(5,2) as ret_60_pct,
    (sum(r90)::numeric / nullif(count(*),0) * 100)::numeric(5,2) as ret_90_pct
  from activity
  group by cohorte_mes
  order by cohorte_mes;
$$ language sql stable;

-- =====================================================================
-- FIN R14_REPORTS_VIEWS.sql
-- =====================================================================
