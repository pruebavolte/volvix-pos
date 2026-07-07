-- R39 — Campos de producto personalizados por giro (product_fields)
-- 2026-07-07
--
-- Feature: el super-admin define campos extra por giro (ej. farmacia → lote,
-- caducidad). El POS los renderiza en el modal de alta de producto y los guarda
-- en el producto. Multi-tenant: los campos viven en giros_campos por giro y
-- cascadean a todos los tenants de ese giro (vía PATCH /api/admin/giros/:slug).
--
-- Idempotente. Correr en el SQL editor de Supabase (proyecto zhvwmzkcqngcaqpdxtwr).

-- 1) giros_campos: metadatos del campo (tipo/opciones/placeholder/help).
--    Ya existía con giro_slug, modal, campo, visible, requerido, orden, label_override.
ALTER TABLE public.giros_campos ADD COLUMN IF NOT EXISTS tipo        text NOT NULL DEFAULT 'text';
ALTER TABLE public.giros_campos ADD COLUMN IF NOT EXISTS opciones    jsonb;       -- solo para tipo='select': ["a","b"]
ALTER TABLE public.giros_campos ADD COLUMN IF NOT EXISTS placeholder text;
ALTER TABLE public.giros_campos ADD COLUMN IF NOT EXISTS help        text;

-- 2) pos_products: valores capturados por producto (jsonb { campo: valor }).
ALTER TABLE public.pos_products ADD COLUMN IF NOT EXISTS industry_fields jsonb;

-- Nota: el paso 1 ya fue aplicado vía Management API el 2026-07-07.
-- El paso 2 quedó PENDIENTE porque el proyecto se pausó (org Free al límite de
-- 2 proyectos). Reactivar el proyecto y correr este archivo completo.
