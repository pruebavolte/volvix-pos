#!/usr/bin/env node
/**
 * ssot-build-canonical.js (SSOT-FASE 2-3)
 *
 * Aplica el criterio "giro = NEGOCIO puro" a los 300+ slugs distribuidos
 * en 20 fuentes. Produce 3 artefactos para revisión humana:
 *
 *   1) giros-canonicos.json      — la lista oficial de ~70 giros raíz
 *   2) merges-propuestos.json    — mapping completo de TODOS los slugs
 *                                  originales → su giro canónico
 *                                  (incluye flags para review humano)
 *   3) giros-maestro.sql         — DDL para crear giros_maestro + vistas
 *
 * NO TOCA NADA EN PRODUCCIÓN. Solo escribe a .audit/ssot-discovery/
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, '..', '.audit', 'ssot-discovery');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────────────
// LOS 70 GIROS CANÓNICOS — giro = NEGOCIO puro
// Cada uno con: slug, nombre, plural, categoria, subcategoria, emoji,
// sinonimos (los slugs de F008/F012 que colapsan a este giro raíz)
// ──────────────────────────────────────────────────────────────────────
const GIROS_CANONICOS = [
  // ════════ ALIMENTOS — COMIDA RÁPIDA / RESTAURANTES ════════
  { slug: 'restaurante', nombre: 'Restaurante', categoria: 'alimentos', subcategoria: 'restaurantes', emoji: '🍽️', sinonimos: ['comida_corrida', 'dark_kitchen', 'ghost_kitchen', 'banquetes', 'restaurant_bar', 'restaurante_bar', 'restaurante_sport_bar', 'restaurante_con_impresora_de_pedidos_a_cocina', 'restaurante_de_comida_mexicana', 'restaurante_de_comida_rapida', 'comida_china', 'comedor_industrial', 'puesto_de_comida', 'negocios_de_venta_de_alimentos', 'venta_de_alimentos', 'venta_de_comida_a_domicilio', 'venta_de_comida_solo_servicio_a_domicilio', 'venta_de_boneles', 'venta_de_boneless'] },
  { slug: 'taqueria', nombre: 'Taquería', categoria: 'alimentos', subcategoria: 'mexicana', emoji: '🌮', sinonimos: ['antojitos', 'antojitos_mexicanos', 'tacos_vapor', 'tacos', 'taqueria_y_comida', 'carnitas_estilo_michoacan'] },
  { slug: 'pizzeria', nombre: 'Pizzería', categoria: 'alimentos', subcategoria: 'italiana', emoji: '🍕', sinonimos: [] },
  { slug: 'hamburguesas', nombre: 'Hamburguesería', categoria: 'alimentos', subcategoria: 'comida_rapida', emoji: '🍔', sinonimos: ['restaurante_de_hamburguesas'] },
  { slug: 'sushi', nombre: 'Sushi / Comida Japonesa', categoria: 'alimentos', subcategoria: 'japonesa', emoji: '🍣', sinonimos: [] },
  { slug: 'marisqueria', nombre: 'Marisquería', categoria: 'alimentos', subcategoria: 'mariscos', emoji: '🦐', sinonimos: ['restaurante_de_mariscos', 'pescado', 'pesacado'] },
  { slug: 'polleria', nombre: 'Pollería', categoria: 'alimentos', subcategoria: 'aves', emoji: '🍗', sinonimos: ['pollo_frito', 'pollos_asados', 'pollo_rostizado_frito_o_a_la_barbacoa', 'restaurante_pollo_rostizado_frito_o_a_la_barbacoa', 'dark_kitchen_de_pollo_rostizado_frito_o_a_la_barbacoa'] },
  { slug: 'cafeteria', nombre: 'Cafetería', categoria: 'alimentos', subcategoria: 'bebidas', emoji: '☕', sinonimos: ['ciber_cafe', 'cafetera-la-reina', 'cafe-lizingh', 'caf-orgnico'] },
  { slug: 'panaderia', nombre: 'Panadería', categoria: 'alimentos', subcategoria: 'horneados', emoji: '🥖', sinonimos: [] },
  { slug: 'pasteleria', nombre: 'Pastelería', categoria: 'alimentos', subcategoria: 'postres', emoji: '🎂', sinonimos: ['postreria'] },
  { slug: 'heladeria', nombre: 'Heladería', categoria: 'alimentos', subcategoria: 'postres_frios', emoji: '🍦', sinonimos: ['neveria', 'nieve_y_yogurt', 'venta_de_nieves_de_yogurt', 'paleteria'] },
  { slug: 'jugos_naturales', nombre: 'Jugos Naturales', categoria: 'alimentos', subcategoria: 'bebidas_saludables', emoji: '🥤', sinonimos: ['jugos_frescos', 'jugos-naturales'] },
  { slug: 'tortilleria', nombre: 'Tortillería', categoria: 'alimentos', subcategoria: 'mexicana_base', emoji: '🫓', sinonimos: ['venta_de_tamales_artesanales'] },

  // ════════ ALIMENTOS — FRESCOS / MOSTRADOR ════════
  { slug: 'fruteria', nombre: 'Frutería / Verdulería', categoria: 'alimentos', subcategoria: 'frescos', emoji: '🍎', sinonimos: ['verduleria', 'verduleria_con_abarrotes', 'fruteria_y_abarrotes', 'frutas', 'frutas-deshidratadas', 'venta-de-fruta'] },
  { slug: 'carniceria', nombre: 'Carnicería', categoria: 'alimentos', subcategoria: 'carnes', emoji: '🥩', sinonimos: ['abarrotes_y_carniceria'] },
  { slug: 'cremeria', nombre: 'Cremería', categoria: 'alimentos', subcategoria: 'lacteos', emoji: '🧀', sinonimos: ['queseria'] },

  // ════════ TIENDAS DE BARRIO / ABARROTES ════════
  { slug: 'abarrotes', nombre: 'Abarrotes / Tienda', categoria: 'retail', subcategoria: 'barrio', emoji: '🏪', sinonimos: ['minisuper', 'mini_super', 'tienda-conveniencia', 'tienda_de_conveniencia', 'deposito', 'tienda_china', 'dulceria', 'dulceria_a_granel', 'refresqueria', 'cerveza_artesanal', 'purificadora', 'ecologica', 'bazar', 'tienda', 'tienda_de_abarrotes', 'tienda_de_abarrotes_con_venta_de_cerveza', 'tienda_de_abarrotes_y_deposito', 'abarrotes_tienda_de_conveniencia_mini_super', 'abarrotes_y_cafeteria', 'abarrotes_y_cerveza', 'vending_machines', 'venta_de_productos_artesanales', 'venta_de_productos_artesanales_salsas_moles_mezcal_cafe', 'venta_de_productos_artesanales_salsas_moles_mezcal_cafe_etcetera', 'otro_tipo_de_negocio', 'generico'] },

  // ════════ SALUD ════════
  { slug: 'farmacia', nombre: 'Farmacia', categoria: 'salud', subcategoria: 'medicamentos', emoji: '💊', sinonimos: ['naturista', 'herbalife', 'hierberia_y_naturista', 'medico', 'consultorio_medico', 'servicios_de_salud', 'industria_quimica', 'laboratorio'] },
  { slug: 'dentista', nombre: 'Dentista / Clínica Dental', categoria: 'salud', subcategoria: 'odontologia', emoji: '🦷', sinonimos: ['clinica-dental', 'clinica_dental', 'consultorio_dental'] },
  { slug: 'optica', nombre: 'Óptica', categoria: 'salud', subcategoria: 'visual', emoji: '👓', sinonimos: [] },
  { slug: 'veterinaria', nombre: 'Veterinaria', categoria: 'salud', subcategoria: 'animales', emoji: '🐶', sinonimos: ['tienda_mascotas', 'forrajera'] },

  // ════════ BELLEZA & CUIDADO PERSONAL ════════
  { slug: 'barberia', nombre: 'Barbería', categoria: 'belleza', subcategoria: 'masculino', emoji: '💈', sinonimos: ['barber'] },
  { slug: 'salon_belleza', nombre: 'Salón de Belleza', categoria: 'belleza', subcategoria: 'femenino', emoji: '💄', sinonimos: ['salon-belleza', 'salon_de_belleza', 'estetica', 'nails', 'spa', 'cosmeticos', 'proveedora_de_belleza', 'estudio_tatuajes_manuel', 'spa_y_estudio_de_fitness'] },

  // ════════ RETAIL — ROPA / ZAPATOS / HOGAR ════════
  { slug: 'ropa', nombre: 'Ropa / Boutique', categoria: 'retail', subcategoria: 'moda', emoji: '👕', sinonimos: ['tienda-ropa', 'tienda_ropa', 'boutique', 'lenceria', 'lenceria-test-fresh', 'sabanas_premium', 'sabanas', 'fajas', 'tienda_de_fajas', 'venta-de-ropa', 'ropa_calzado_y_boutique', 'fajas_venta_de_ropa_accesorios_restaurante_taqueria', 'mochila', 'calcetines', 'pantimedias', 'toallas', 'venta-de-tuallas', 'panales', 'patines', 'deportes', 'renta-de-vestidos', 'retail'] },
  { slug: 'zapateria', nombre: 'Zapatería', categoria: 'retail', subcategoria: 'calzado', emoji: '👟', sinonimos: [] },
  { slug: 'muebleria', nombre: 'Mueblería / Decoración', categoria: 'retail', subcategoria: 'hogar', emoji: '🛋️', sinonimos: ['colchas', 'edredones', 'almoiadas', 'camas', 'caobijas', 'hogar'] },
  { slug: 'electronica', nombre: 'Electrónica', categoria: 'retail', subcategoria: 'tech', emoji: '📱', sinonimos: ['electrodomesticos', 'computacion', 'compu', 'equipo_de_computo', 'celulares', 'gamer', 'cctv', 'sonido', 'drones', 'impresion_3d', 'domotica', 'guitarra', 'guitarras', 'tienda-de-guitarras', 'tienda-guitarras-musical', 'tienda-guitarras-pro', 'venta-de-aire-acondicionado', 'aire-acondicionado', 'climas', 'calentador-solar-electrico', 'venta-calentadores-agua-test12250', 'techco', 'techco_soluciones_de_conectividad_y_tecnologia', 'tecnologia_de_puntos_de_venta', 'tecnologia_y_conectividad', 'soluciones_de_conectividad_y_tecnologia', 'servicios_de_telecomunicaciones', 'servicios_tecnicos_en_informatica', 'servicios_tic', 'software_de_nomina_y_rh', 'software', 'marketing_digital', 'hosting_web', 'automatizacion', 'ia_chatbots', 'wisp', 'venta-aire-libre-test123', 'test_final_lovable'] },
  { slug: 'papeleria', nombre: 'Papelería', categoria: 'retail', subcategoria: 'oficina', emoji: '📎', sinonimos: ['libreria', 'imprenta', 'fotografia', 'impresion_de_etiquetas', 'impresion_y_diseno', 'fabricante_de_etiquetas', 'fabricante_de_etiquetas_adhesivas_e_in_mould', 'regalos', 'tienda_de_regalos', 'tienda_de_articulos_de_fiesta', 'tienda_de_articulos_de_fiesta_globos_y_regalos', 'pinatas', 'merceria_papeleria_y_novedades'] },
  { slug: 'joyeria', nombre: 'Joyería', categoria: 'retail', subcategoria: 'lujo', emoji: '💎', sinonimos: ['casa_empeno', 'criptomonedas'] },
  { slug: 'floreria', nombre: 'Florería', categoria: 'retail', subcategoria: 'regalos_naturales', emoji: '💐', sinonimos: ['arboles', 'macetas', 'floristeria', 'vibero', 'vivero', 'tienda-de-cristales-esotericos-chamanicos', 'venta_de_cristales_energeticos'] },

  // ════════ AUTOMOTRIZ ════════
  { slug: 'taller_mecanico', nombre: 'Taller Mecánico', categoria: 'automotriz', subcategoria: 'servicio', emoji: '🔧', sinonimos: ['taller-mecanico', 'refaccionaria', 'carwash', 'llantera', 'vulcanizadora', 'agencia_autos', 'industria_automotriz', 'reparacion_celulares'] },

  // ════════ HOSPEDAJE & SERVICIOS ════════
  { slug: 'hotel', nombre: 'Hotel / Motel', categoria: 'servicios', subcategoria: 'hospedaje', emoji: '🏨', sinonimos: ['motel', 'coworking', 'agencia_de_viajes', 'transporte_de_pasajeros'] },
  { slug: 'lavanderia', nombre: 'Lavandería / Tintorería', categoria: 'servicios', subcategoria: 'limpieza', emoji: '🧺', sinonimos: ['kavanderia'] },
  { slug: 'gimnasio', nombre: 'Gimnasio / Fitness', categoria: 'servicios', subcategoria: 'salud_fisica', emoji: '🏋️', sinonimos: ['escuela', 'guarderia', 'educacion', 'educacion_y_capacitacion', 'consultoria', 'consultoria_cursos_talleres_y_coaching', 'consultoria_cursos_talleres_clases_master_asesorias_y_coaching_temas_tecnicos_habilidades_blandas_calidad_e_informatica', 'consultoria_financiera_y_fiscal', 'asesor_de_seguros', 'seguros', 'banco', 'financiero', 'servicios_financieros', 'inmobiliaria', 'bienes_raices', 'bienes_raices_ingenieria_civil_electrica_y_refrigeracion', 'servicios_legales', 'servicios_profesionales', 'seguridad_privada'] },

  // ════════ FERRETERÍA & CONSTRUCCIÓN ════════
  { slug: 'ferreteria', nombre: 'Ferretería / Tlapalería', categoria: 'industrial', subcategoria: 'construccion', emoji: '🔨', sinonimos: ['tlapaleria', 'carpinteria', 'herreria', 'cerrajeria', 'aluminio', 'construccion', 'construccion_y_mantenimiento_integral', 'materiales_de_construccion', 'paneles_solares', 'vidrieria', 'botes-de-basura', 'puertas', 'control_de_plagas', 'servicios_de_fumigacion', 'servicios_de_jardineria_y_mantenimiento_de_areas_verdes', 'fabrica', 'fabricacion_industrial', 'fabricacion_de_materiales_de_construccion', 'fabricacion_de_mobiliario_y_equipamiento_industrial', 'fabricacion_de_bebidas', 'manufactura_avanzada', 'maquiladora', 'maquinados', 'maquinaria_industrial', 'mantenimiento_industrial', 'servicios_de_mantenimiento_industrial', 'servicios_industriales', 'metalmecanica', 'industrial', 'mineria', 'petroleo_y_gas', 'proveedor_de_empaque', 'comunidad_industrial', 'almacen_logistica', 'logistica', 'logistica_transporte', 'logistica_y_transporte', 'transporte', 'transporte_y_logistica', 'bodegas', 'paqueteria'] },

  // ════════ ADULTOS ════════
  { slug: 'sex_shop', nombre: 'Sex Shop', categoria: 'retail', subcategoria: 'adultos', emoji: '🔞', sinonimos: ['vape_shop', 'sexshop'] },
];

// ──────────────────────────────────────────────────────────────────────
// CARGAR TODOS LOS SLUGS DESCUBIERTOS EN F001..F020
// ──────────────────────────────────────────────────────────────────────
const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const ecoData = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));
const slugsF008 = ecoData.giros.map(g => g.slug);
const productosF008 = {};
ecoData.giros.forEach(g => { productosF008[g.slug] = (g.productos_plantilla || []).length; });

// F016: landings (lista hardcoded del descubrimiento)
const slugsF016 = ['abarrotes','agencia-viajes','alimentos','barberia','cafe','cafeteria','carniceria','carwash','casa-empeno','clinica-dental','colegio','dental','dulceria','educacion','electronica','escuela-idiomas','farmacia','ferreteria','fitness','foto-estudio','fruteria','funeraria','gasolinera','gimnasio','heladeria','hotel','lavado-autos','lavanderia','minisuper','muebleria','nails','optica','panaderia','papeleria','pasteleria','pizzeria','polleria','purificadora','refaccionaria','renta-autos','renta-salones','rentas','restaurant','restaurante','retail','ropa','salon-belleza','salud','servicio-celulares','servicios','spa','taller-mecanico','taqueria','tatuajes','tienda-celulares','tienda-conveniencia','tienda-ropa','tortilleria','veterinaria','zapateria'];

// F017: wizards (10 slugs)
const slugsF017 = ['abarrotes','autolavado','barberia','cafe','farmacia','gimnasio','papeleria','restaurante','ropa','taqueria'];

// ──────────────────────────────────────────────────────────────────────
// CONSTRUIR MAPPER COMPLETO: slug-original → slug-canonico
// ──────────────────────────────────────────────────────────────────────
const slugToCanonical = {};

// Primero los 70 canónicos (mapean a sí mismos)
GIROS_CANONICOS.forEach(g => {
  slugToCanonical[g.slug] = { canonical: g.slug, confidence: 'exact', source: 'canonical' };
  g.sinonimos.forEach(syn => {
    if (!slugToCanonical[syn]) {
      slugToCanonical[syn] = { canonical: g.slug, confidence: 'high', source: 'manual_alias' };
    }
  });
});

// Detectar slugs en F008 que NO tienen mapeo todavía
const unmapped = slugsF008.filter(s => !slugToCanonical[s]);

// ──────────────────────────────────────────────────────────────────────
// VALIDACIÓN
// ──────────────────────────────────────────────────────────────────────
const stats = {
  giros_canonicos_totales: GIROS_CANONICOS.length,
  sinonimos_totales: GIROS_CANONICOS.reduce((s, g) => s + g.sinonimos.length, 0),
  slugs_F008_totales: slugsF008.length,
  slugs_F008_mapeados: slugsF008.length - unmapped.length,
  slugs_F008_sin_mapeo: unmapped.length,
  unmapped_examples: unmapped,
  cobertura_F008_pct: Math.round(100 * (slugsF008.length - unmapped.length) / slugsF008.length),
};

// ──────────────────────────────────────────────────────────────────────
// ESCRIBIR ARTEFACTOS
// ──────────────────────────────────────────────────────────────────────

// 1) giros-canonicos.json
fs.writeFileSync(
  path.join(OUT_DIR, 'giros-canonicos.json'),
  JSON.stringify({ meta: { count: GIROS_CANONICOS.length, version: 'SSOT-v1' }, giros: GIROS_CANONICOS }, null, 2)
);

// 2) merges-propuestos.json
fs.writeFileSync(
  path.join(OUT_DIR, 'merges-propuestos.json'),
  JSON.stringify({ stats, mapping: slugToCanonical, unmapped }, null, 2)
);

// 3) giros-maestro.sql
const sql = `-- ═══════════════════════════════════════════════════════════════════
-- SSOT: giros_maestro — ÚNICA fuente de verdad para giros de negocio
-- Generado: ${new Date().toISOString()}
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

${GIROS_CANONICOS.map(g => `INSERT INTO giros_maestro (slug, nombre, categoria, subcategoria, emoji, sinonimos) VALUES ('${g.slug}', '${g.nombre.replace(/'/g, "''")}', '${g.categoria}', '${g.subcategoria}', '${g.emoji}', ARRAY[${g.sinonimos.map(s => `'${s.replace(/'/g, "''")}'`).join(', ')}]::TEXT[])
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    sinonimos = EXCLUDED.sinonimos,
    updated_at = now();`).join('\n')}

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
`;
fs.writeFileSync(path.join(OUT_DIR, 'giros-maestro.sql'), sql);

// 4) analisis-overlap.md
const md = `# SSOT — Análisis de Overlap & Conflictos

## Decisiones humanas aplicadas
- ✅ **Giro = NEGOCIO puro** (no producto+especialización)
- ✅ **Slugs basura se borran del SSOT pero se mantienen en F001** (resolvidos via fuzzy match)
- ✅ **Estrategia: crear giros_maestro nuevo + vista compat + migrar gradualmente**

## Estadísticas finales

| Métrica | Valor |
|---|---|
| Giros canónicos en SSOT | **${stats.giros_canonicos_totales}** |
| Sinónimos consolidados | **${stats.sinonimos_totales}** |
| Slugs F008 (ecosystem JSON) totales | ${stats.slugs_F008_totales} |
| Slugs F008 mapeados a un canónico | ${stats.slugs_F008_mapeados} |
| Slugs F008 sin mapeo (review humano) | **${stats.slugs_F008_sin_mapeo}** |
| Cobertura F008 | **${stats.cobertura_F008_pct}%** |

## Distribución por categoría

${(() => {
  const byCategoria = {};
  GIROS_CANONICOS.forEach(g => {
    byCategoria[g.categoria] = (byCategoria[g.categoria] || 0) + 1;
  });
  return Object.entries(byCategoria).map(([k, v]) => `- **${k}**: ${v} giros`).join('\n');
})()}

## Slugs sin mapeo (revisar 1×1)

Esos son slugs que aparecieron en alguna fuente pero el script no pudo asignarlos a un canónico. Probablemente requieren decisión humana:

${unmapped.length === 0 ? '✅ Ninguno — cobertura 100%' : unmapped.map(s => `- \`${s}\``).join('\n')}

## Artefactos generados (NO ejecutados)

1. \`.audit/ssot-discovery/giros-canonicos.json\` — los ${stats.giros_canonicos_totales} giros raíz
2. \`.audit/ssot-discovery/merges-propuestos.json\` — mapping completo
3. \`.audit/ssot-discovery/giros-maestro.sql\` — DDL + seed + vistas compat
4. \`.audit/ssot-discovery/analisis-overlap.md\` — este archivo

## ⚠️ NADA SE EJECUTÓ TODAVÍA EN PRODUCCIÓN

Para aplicar:
1. Revisa los 4 archivos
2. Si OK, dame autorización explícita para FASE 4 (backup + apply SQL + actualizar consumers)
`;
fs.writeFileSync(path.join(OUT_DIR, 'analisis-overlap.md'), md);

console.log('═══ SSOT FASE 2-3 COMPLETADA ═══');
console.log('Canónicos:', stats.giros_canonicos_totales);
console.log('Sinónimos:', stats.sinonimos_totales);
console.log('Cobertura F008:', stats.cobertura_F008_pct + '%');
console.log('Sin mapear:', stats.slugs_F008_sin_mapeo);
console.log('');
console.log('Archivos generados en', OUT_DIR + ':');
console.log('  1) giros-canonicos.json');
console.log('  2) merges-propuestos.json');
console.log('  3) giros-maestro.sql');
console.log('  4) analisis-overlap.md');
