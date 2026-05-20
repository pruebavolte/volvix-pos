-- ═══════════════════════════════════════════════════════════════════
-- SSOT: giros_maestro — ÚNICA fuente de verdad para giros de negocio
-- Generado: 2026-05-20T17:58:13.599Z
-- 70 giros canónicos consolidados desde 20 fuentes fragmentadas
-- ═══════════════════════════════════════════════════════════════════

-- TABLA MAESTRA
CREATE TABLE IF NOT EXISTS giros_maestro (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  nombre          TEXT NOT NULL,
  categoria       TEXT,
  subcategoria    TEXT,
  emoji           TEXT,
  sinonimos       TEXT[] DEFAULT '{}',
  landing_slug    TEXT,
  activo          BOOLEAN DEFAULT true,
  prioridad       INT DEFAULT 100,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_giros_maestro_slug ON giros_maestro(slug);
CREATE INDEX IF NOT EXISTS idx_giros_maestro_sinonimos ON giros_maestro USING GIN(sinonimos);
CREATE INDEX IF NOT EXISTS idx_giros_maestro_activo ON giros_maestro(activo) WHERE activo = true;

-- TABLA DE LANDING PAGES (FK al maestro)
CREATE TABLE IF NOT EXISTS landing_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_id       UUID NOT NULL REFERENCES giros_maestro(id) ON DELETE CASCADE,
  slug          TEXT UNIQUE NOT NULL,
  variant       TEXT DEFAULT 'default',
  html_path     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- TABLA DE PRODUCTOS POR GIRO (FK al maestro)
CREATE TABLE IF NOT EXISTS productos_por_giro (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_id       UUID NOT NULL REFERENCES giros_maestro(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  precio_mxn    INT,
  imagen_url    TEXT,
  posicion      INT,
  UNIQUE(giro_id, nombre)
);

-- ═══════════════════════════════════════════════════════════════════
-- VISTAS DE COMPATIBILIDAD — para código viejo que apunta a tablas legacy
-- ═══════════════════════════════════════════════════════════════════

-- Vista que emula giros_terminologias (F002 legacy)
CREATE OR REPLACE VIEW giros_terminologias_compat AS
SELECT
  id,
  slug AS giro,
  metadata->'terminologias' AS terminologias,
  metadata->'modulos_activos' AS modulos_activos,
  metadata->'campos_visibles' AS campos_visibles
FROM giros_maestro
WHERE activo = true;

-- Vista que emula vertical_templates (F003 legacy)
CREATE OR REPLACE VIEW vertical_templates_compat AS
SELECT
  id,
  slug AS vertical_slug,
  nombre AS label,
  metadata->'profile' AS profile,
  metadata->'terms' AS terms,
  metadata->'modules_enabled' AS modules_enabled
FROM giros_maestro
WHERE activo = true;

-- Vista que emula giros_synonyms (F004 legacy)
CREATE OR REPLACE VIEW giros_synonyms_compat AS
SELECT
  gm.slug AS giro_padre,
  syn AS sinonimo,
  1 AS weight
FROM giros_maestro gm,
     UNNEST(gm.sinonimos) AS syn
WHERE gm.activo = true;

-- ═══════════════════════════════════════════════════════════════════
-- SEED — los 70 giros canónicos
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('restaurante', 'Restaurante', 'alimentos', 'restaurantes', '🍽️', ARRAY['comida_corrida', 'dark_kitchen', 'ghost_kitchen', 'banquetes', 'restaurant_bar', 'restaurante_bar', 'restaurante_sport_bar', 'restaurante_con_impresora_de_pedidos_a_cocina', 'restaurante_de_comida_mexicana', 'restaurante_de_comida_rapida', 'comida_china', 'comedor_industrial', 'puesto_de_comida', 'negocios_de_venta_de_alimentos', 'venta_de_alimentos', 'venta_de_comida_a_domicilio', 'venta_de_comida_solo_servicio_a_domicilio', 'venta_de_boneles', 'venta_de_boneless']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('taqueria', 'Taquería', 'alimentos', 'mexicana', '🌮', ARRAY['antojitos', 'antojitos_mexicanos', 'tacos_vapor', 'tacos', 'taqueria_y_comida', 'carnitas_estilo_michoacan']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('pizzeria', 'Pizzería', 'alimentos', 'italiana', '🍕', ARRAY[]::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('hamburguesas', 'Hamburguesería', 'alimentos', 'comida_rapida', '🍔', ARRAY['restaurante_de_hamburguesas']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('sushi', 'Sushi / Comida Japonesa', 'alimentos', 'japonesa', '🍣', ARRAY[]::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('marisqueria', 'Marisquería', 'alimentos', 'mariscos', '🦐', ARRAY['restaurante_de_mariscos', 'pescado', 'pesacado']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('polleria', 'Pollería', 'alimentos', 'aves', '🍗', ARRAY['pollo_frito', 'pollos_asados', 'pollo_rostizado_frito_o_a_la_barbacoa', 'restaurante_pollo_rostizado_frito_o_a_la_barbacoa', 'dark_kitchen_de_pollo_rostizado_frito_o_a_la_barbacoa']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('cafeteria', 'Cafetería', 'alimentos', 'bebidas', '☕', ARRAY['ciber_cafe', 'cafetera-la-reina', 'cafe-lizingh', 'caf-orgnico']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('panaderia', 'Panadería', 'alimentos', 'horneados', '🥖', ARRAY[]::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('pasteleria', 'Pastelería', 'alimentos', 'postres', '🎂', ARRAY['postreria']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('heladeria', 'Heladería', 'alimentos', 'postres_frios', '🍦', ARRAY['neveria', 'nieve_y_yogurt', 'venta_de_nieves_de_yogurt', 'paleteria']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('jugos_naturales', 'Jugos Naturales', 'alimentos', 'bebidas_saludables', '🥤', ARRAY['jugos_frescos', 'jugos-naturales']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('tortilleria', 'Tortillería', 'alimentos', 'mexicana_base', '🫓', ARRAY['venta_de_tamales_artesanales']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('fruteria', 'Frutería / Verdulería', 'alimentos', 'frescos', '🍎', ARRAY['verduleria', 'verduleria_con_abarrotes', 'fruteria_y_abarrotes', 'frutas', 'frutas-deshidratadas', 'venta-de-fruta']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('carniceria', 'Carnicería', 'alimentos', 'carnes', '🥩', ARRAY['abarrotes_y_carniceria']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('cremeria', 'Cremería', 'alimentos', 'lacteos', '🧀', ARRAY['queseria']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('abarrotes', 'Abarrotes / Tienda', 'retail', 'barrio', '🏪', ARRAY['minisuper', 'mini_super', 'tienda-conveniencia', 'tienda_de_conveniencia', 'deposito', 'tienda_china', 'dulceria', 'dulceria_a_granel', 'refresqueria', 'cerveza_artesanal', 'purificadora', 'ecologica', 'bazar', 'tienda', 'tienda_de_abarrotes', 'tienda_de_abarrotes_con_venta_de_cerveza', 'tienda_de_abarrotes_y_deposito', 'abarrotes_tienda_de_conveniencia_mini_super', 'abarrotes_y_cafeteria', 'abarrotes_y_cerveza', 'vending_machines', 'venta_de_productos_artesanales', 'venta_de_productos_artesanales_salsas_moles_mezcal_cafe', 'venta_de_productos_artesanales_salsas_moles_mezcal_cafe_etcetera', 'otro_tipo_de_negocio', 'generico']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('farmacia', 'Farmacia', 'salud', 'medicamentos', '💊', ARRAY['naturista', 'herbalife', 'hierberia_y_naturista', 'medico', 'consultorio_medico', 'servicios_de_salud', 'industria_quimica', 'laboratorio']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('dentista', 'Dentista / Clínica Dental', 'salud', 'odontologia', '🦷', ARRAY['clinica-dental', 'clinica_dental', 'consultorio_dental']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('optica', 'Óptica', 'salud', 'visual', '👓', ARRAY[]::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('veterinaria', 'Veterinaria', 'salud', 'animales', '🐶', ARRAY['tienda_mascotas', 'forrajera']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('barberia', 'Barbería', 'belleza', 'masculino', '💈', ARRAY['barber']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('salon_belleza', 'Salón de Belleza', 'belleza', 'femenino', '💄', ARRAY['salon-belleza', 'salon_de_belleza', 'estetica', 'nails', 'spa', 'cosmeticos', 'proveedora_de_belleza', 'estudio_tatuajes_manuel', 'spa_y_estudio_de_fitness']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('ropa', 'Ropa / Boutique', 'retail', 'moda', '👕', ARRAY['tienda-ropa', 'tienda_ropa', 'boutique', 'lenceria', 'lenceria-test-fresh', 'sabanas_premium', 'sabanas', 'fajas', 'tienda_de_fajas', 'venta-de-ropa', 'ropa_calzado_y_boutique', 'fajas_venta_de_ropa_accesorios_restaurante_taqueria', 'mochila', 'calcetines', 'pantimedias', 'toallas', 'venta-de-tuallas', 'panales', 'patines', 'deportes', 'renta-de-vestidos', 'retail']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('zapateria', 'Zapatería', 'retail', 'calzado', '👟', ARRAY[]::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('muebleria', 'Mueblería / Decoración', 'retail', 'hogar', '🛋️', ARRAY['colchas', 'edredones', 'almoiadas', 'camas', 'caobijas', 'hogar']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('electronica', 'Electrónica', 'retail', 'tech', '📱', ARRAY['electrodomesticos', 'computacion', 'compu', 'equipo_de_computo', 'celulares', 'gamer', 'cctv', 'sonido', 'drones', 'impresion_3d', 'domotica', 'guitarra', 'guitarras', 'tienda-de-guitarras', 'tienda-guitarras-musical', 'tienda-guitarras-pro', 'venta-de-aire-acondicionado', 'aire-acondicionado', 'climas', 'calentador-solar-electrico', 'venta-calentadores-agua-test12250', 'techco', 'techco_soluciones_de_conectividad_y_tecnologia', 'tecnologia_de_puntos_de_venta', 'tecnologia_y_conectividad', 'soluciones_de_conectividad_y_tecnologia', 'servicios_de_telecomunicaciones', 'servicios_tecnicos_en_informatica', 'servicios_tic', 'software_de_nomina_y_rh', 'software', 'marketing_digital', 'hosting_web', 'automatizacion', 'ia_chatbots', 'wisp', 'venta-aire-libre-test123', 'test_final_lovable']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('papeleria', 'Papelería', 'retail', 'oficina', '📎', ARRAY['libreria', 'imprenta', 'fotografia', 'impresion_de_etiquetas', 'impresion_y_diseno', 'fabricante_de_etiquetas', 'fabricante_de_etiquetas_adhesivas_e_in_mould', 'regalos', 'tienda_de_regalos', 'tienda_de_articulos_de_fiesta', 'tienda_de_articulos_de_fiesta_globos_y_regalos', 'pinatas', 'merceria_papeleria_y_novedades']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('joyeria', 'Joyería', 'retail', 'lujo', '💎', ARRAY['casa_empeno', 'criptomonedas']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('floreria', 'Florería', 'retail', 'regalos_naturales', '💐', ARRAY['arboles', 'macetas', 'floristeria', 'vibero', 'vivero', 'tienda-de-cristales-esotericos-chamanicos', 'venta_de_cristales_energeticos']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('taller_mecanico', 'Taller Mecánico', 'automotriz', 'servicio', '🔧', ARRAY['taller-mecanico', 'refaccionaria', 'carwash', 'llantera', 'vulcanizadora', 'agencia_autos', 'industria_automotriz', 'reparacion_celulares']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('hotel', 'Hotel / Motel', 'servicios', 'hospedaje', '🏨', ARRAY['motel', 'coworking', 'agencia_de_viajes', 'transporte_de_pasajeros']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('lavanderia', 'Lavandería / Tintorería', 'servicios', 'limpieza', '🧺', ARRAY['kavanderia']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('gimnasio', 'Gimnasio / Fitness', 'servicios', 'salud_fisica', '🏋️', ARRAY['escuela', 'guarderia', 'educacion', 'educacion_y_capacitacion', 'consultoria', 'consultoria_cursos_talleres_y_coaching', 'consultoria_cursos_talleres_clases_master_asesorias_y_coaching_temas_tecnicos_habilidades_blandas_calidad_e_informatica', 'consultoria_financiera_y_fiscal', 'asesor_de_seguros', 'seguros', 'banco', 'financiero', 'servicios_financieros', 'inmobiliaria', 'bienes_raices', 'bienes_raices_ingenieria_civil_electrica_y_refrigeracion', 'servicios_legales', 'servicios_profesionales', 'seguridad_privada']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('ferreteria', 'Ferretería / Tlapalería', 'industrial', 'construccion', '🔨', ARRAY['tlapaleria', 'carpinteria', 'herreria', 'cerrajeria', 'aluminio', 'construccion', 'construccion_y_mantenimiento_integral', 'materiales_de_construccion', 'paneles_solares', 'vidrieria', 'botes-de-basura', 'puertas', 'control_de_plagas', 'servicios_de_fumigacion', 'servicios_de_jardineria_y_mantenimiento_de_areas_verdes', 'fabrica', 'fabricacion_industrial', 'fabricacion_de_materiales_de_construccion', 'fabricacion_de_mobiliario_y_equipamiento_industrial', 'fabricacion_de_bebidas', 'manufactura_avanzada', 'maquiladora', 'maquinados', 'maquinaria_industrial', 'mantenimiento_industrial', 'servicios_de_mantenimiento_industrial', 'servicios_industriales', 'metalmecanica', 'industrial', 'mineria', 'petroleo_y_gas', 'proveedor_de_empaque', 'comunidad_industrial', 'almacen_logistica', 'logistica', 'logistica_transporte', 'logistica_y_transporte', 'transporte', 'transporte_y_logistica', 'bodegas', 'paqueteria']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();
INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('sex_shop', 'Sex Shop', 'retail', 'adultos', '🔞', ARRAY['vape_shop', 'sexshop']::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();

-- ═══════════════════════════════════════════════════════════════════
-- POLICIES RLS — todos los autenticados pueden LEER, solo admins escriben
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE giros_maestro ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos_por_giro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "giros_select_all" ON giros_maestro FOR SELECT USING (true);
CREATE POLICY "landings_select_all" ON landing_pages FOR SELECT USING (true);
CREATE POLICY "productos_giro_select_all" ON productos_por_giro FOR SELECT USING (true);

-- (INSERT/UPDATE/DELETE solo via admin role — agregar policies aparte)
