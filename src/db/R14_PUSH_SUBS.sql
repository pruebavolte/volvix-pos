-- ============================================================
-- R14 · WEB PUSH SUBSCRIPTIONS
-- Suscripciones de Web Push (VAPID) por usuario / tenant.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  tenant_id   uuid,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  ua          text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subs_user
  on public.push_subscriptions (user_id);
create index if not exists idx_push_subs_tenant
  on public.push_subscriptions (tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY: cada user solo ve/gestiona sus propias subs.
-- service_role (backend) bypassea RLS automaticamente.
-- ============================================================
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_owner_select on public.push_subscriptions;
create policy push_subs_owner_select
  on public.push_subscriptions
  for select
  to authenticated
  using ( user_id = auth.uid() );

drop policy if exists push_subs_owner_insert on public.push_subscriptions;
create policy push_subs_owner_insert
  on public.push_subscriptions
  for insert
  to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists push_subs_owner_delete on public.push_subscriptions;
create policy push_subs_owner_delete
  on public.push_subscriptions
  for delete
  to authenticated
  using ( user_id = auth.uid() );

-- Admin/owner pueden listar todo (para enviar broadcast).
drop policy if exists push_subs_admin_select on public.push_subscriptions;
create policy push_subs_admin_select
  on public.push_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
    )
  );

comment on table public.push_subscriptions is
  'R14: Web Push subscriptions (VAPID). RLS owner-only, admin select-all.';
