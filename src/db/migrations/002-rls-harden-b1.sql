-- ============================================================
-- B1 — RLS hardening (denegar lectura a anon en tablas sensibles)
-- ============================================================
-- Estrategia: REVOKE select para rol anon en tablas que NO deben
-- ser accesibles desde browser con la ANON key. Service_role
-- sigue funcionando porque tiene BYPASSRLS implícito.
--
-- Idempotente: usa IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================

-- 1. pos_users — NUNCA debe leerse desde anon (PII + password_hash)
ALTER TABLE IF EXISTS public.pos_users ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON public.pos_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pos_users FROM anon;

-- 2. pos_sales — solo backend
ALTER TABLE IF EXISTS public.pos_sales ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_sales FROM anon;

-- 3. pos_companies — sólo backend
ALTER TABLE IF EXISTS public.pos_companies ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_companies FROM anon;

-- 4. pos_products — solo backend (catalogo se sirve via /api/products)
ALTER TABLE IF EXISTS public.pos_products ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_products FROM anon;

-- 5. customers — PII estricta
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.customers FROM anon;

-- 6. pos_credits, pos_quotations, pos_returns — operativas
ALTER TABLE IF EXISTS public.pos_credits ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_credits FROM anon;

ALTER TABLE IF EXISTS public.pos_quotations ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_quotations FROM anon;

ALTER TABLE IF EXISTS public.pos_returns ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_returns FROM anon;

-- 7. pos_cash_sessions, pos_login_events — operativas
ALTER TABLE IF EXISTS public.pos_cash_sessions ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_cash_sessions FROM anon;

ALTER TABLE IF EXISTS public.pos_login_events ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pos_login_events FROM anon;

-- 8. invoices, payments, audit_log — financieras / auditoría
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invoices FROM anon;

ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payments FROM anon;

ALTER TABLE IF EXISTS public.volvix_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.volvix_audit_log FROM anon;

-- 9. employees, payroll_*, attendance — datos de empleados
ALTER TABLE IF EXISTS public.employees ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employees FROM anon;

ALTER TABLE IF EXISTS public.payroll_periods ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods FROM anon;

ALTER TABLE IF EXISTS public.payroll_receipts ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payroll_receipts FROM anon;

-- 10. fraud_alerts, api_keys — sensitivo
ALTER TABLE IF EXISTS public.fraud_alerts ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fraud_alerts FROM anon;

ALTER TABLE IF EXISTS public.api_keys ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.api_keys FROM anon;

-- ============================================================
-- Tablas que SÍ pueden ser leídas por anon (catálogos públicos)
-- ============================================================
-- billing_plans (precios públicos), billing_configs si es público
-- NO se modifican aquí, conservan su política actual
-- ============================================================

-- Nota: estas REVOKE son a nivel TABLE-grant, NO a nivel RLS POLICY.
-- Bloquean al rol `anon` antes incluso de evaluar políticas.
-- Service_role sigue funcionando porque es superuser-like.
