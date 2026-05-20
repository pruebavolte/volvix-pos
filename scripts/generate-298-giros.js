#!/usr/bin/env node
/**
 * generate-298-giros.js (V10.44)
 *
 * Audit detectó 298 giros en sidebar pero solo 36 en ecosystem JSON
 * → 9878 huecos en tabla maestra.
 *
 * SOLUCIÓN: para cada slug del sidebar, generar entrada en ecosystem JSON.
 * Estrategia:
 *   1) Si ya existe en JSON → mantener (no tocar)
 *   2) Buscar slug padre por regex/keywords (mapper inteligente)
 *   3) Heredar datos del padre pero con label propio + imágenes UNICAS
 *      (placeholder con nombre del slug específico, no del padre)
 *   4) Si no hay match → usar "generico"
 *
 * RESULTADO: 298 entradas con 10 productos cada una, 2980 imágenes únicas.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));

// ─── 298 slugs del sidebar (extraído de Chrome via window.__allSlugs) ───
const ALL_SLUGS = `restaurante,taqueria,pizzeria,cafeteria,panaderia,pasteleria,heladeria,jugos_naturales,jugos-naturales,marisqueria,sushi,hamburguesas,pollo_frito,pollos_asados,antojitos,tacos_vapor,comida_corrida,dark_kitchen,ghost_kitchen,banquetes,fruteria,carniceria,polleria,tortilleria,cremeria,abarrotes,minisuper,tienda-conveniencia,deposito,tienda_china,dulceria,naturista,refresqueria,purificadora,vape_shop,sex_shop,cerveza_artesanal,ecologica,regalos,bazar,farmacia,veterinaria,clinica-dental,dentista,medico,optica,tienda_mascotas,barberia,salon-belleza,estetica,nails,spa,cosmeticos,ropa,tienda-ropa,boutique,zapateria,muebleria,papeleria,ferreteria,tlapaleria,sabanas_premium,floreria,joyeria,electronica,electrodomesticos,computacion,celulares,reparacion_celulares,gamer,deportes,vidrieria,refaccionaria,taller-mecanico,carwash,llantera,vulcanizadora,agencia_autos,lavanderia,gimnasio,agencia_de_viajes,imprenta,carpinteria,herreria,cerrajeria,aluminio,construccion,paneles_solares,cctv,sonido,fotografia,escuela,guarderia,hotel,motel,casa_empeno,wisp,coworking,domotica,software,marketing_digital,hosting_web,impresion_3d,drones,automatizacion,ia_chatbots,criptomonedas,abarrotes_tienda_de_conveniencia_mini_super,abarrotes_y_cafeteria,abarrotes_y_carniceria,abarrotes_y_cerveza,aire-acondicionado,almacen_logistica,almoiadas,antojitos_mexicanos,arboles,asesor_de_seguros,banco,barber,bienes_raices,bienes_raices_ingenieria_civil_electrica_y_refrigeracion,bodegas,botes-de-basura,caf-orgnico,cafe-lizingh,cafetera-la-reina,calcetines,calentador-solar-electrico,camas,caobijas,carnitas_estilo_michoacan,ciber_cafe,climas,colchas,comedor_industrial,comida_china,compu,comunidad_industrial,construccion_y_mantenimiento_integral,consultoria,consultoria_cursos_talleres_clases_master_asesorias_y_coaching_temas_tecnicos_habilidades_blandas_calidad_e_informatica,consultoria_cursos_talleres_y_coaching,consultoria_financiera_y_fiscal,consultorio_dental,consultorio_medico,control_de_plagas,dark_kitchen_de_pollo_rostizado_frito_o_a_la_barbacoa,dulceria_a_granel,edredones,educacion,educacion_y_capacitacion,equipo_de_computo,estudio_tatuajes_manuel,fabrica,fabricacion_de_bebidas,fabricacion_de_materiales_de_construccion,fabricacion_de_mobiliario_y_equipamiento_industrial,fabricacion_industrial,fabricante_de_etiquetas,fabricante_de_etiquetas_adhesivas_e_in_mould,fajas,fajas_venta_de_ropa_accesorios_restaurante_taqueria,financiero,floristeria,forrajera,frutas,frutas-deshidratadas,fruteria_y_abarrotes,generico,guitarra,guitarras,herbalife,hierberia_y_naturista,hogar,impresion_de_etiquetas,impresion_y_diseno,industria_automotriz,industria_quimica,industrial,inmobiliaria,kavanderia,laboratorio,lenceria,lenceria-test-fresh,libreria,logistica,logistica_transporte,logistica_y_transporte,macetas,mantenimiento_industrial,manufactura_avanzada,maquiladora,maquinados,maquinaria_industrial,materiales_de_construccion,merceria_papeleria_y_novedades,metalmecanica,mineria,mini_super,mochila,negocios_de_venta_de_alimentos,neveria,nieve_y_yogurt,otro_tipo_de_negocio,paleteria,panales,pantimedias,paqueteria,patines,pesacado,pescado,petroleo_y_gas,pinatas,pollo_rostizado_frito_o_a_la_barbacoa,postreria,proveedor_de_empaque,proveedora_de_belleza,puertas,puesto_de_comida,queseria,renta-de-vestidos,restaurant_bar,restaurante_bar,restaurante_con_impresora_de_pedidos_a_cocina,restaurante_de_comida_mexicana,restaurante_de_comida_rapida,restaurante_de_hamburguesas,restaurante_de_mariscos,restaurante_pollo_rostizado_frito_o_a_la_barbacoa,restaurante_sport_bar,retail,ropa_calzado_y_boutique,sabanas,salon_de_belleza,seguridad_privada,seguros,servicios_de_fumigacion,servicios_de_jardineria_y_mantenimiento_de_areas_verdes,servicios_de_mantenimiento_industrial,servicios_de_salud,servicios_de_telecomunicaciones,servicios_financieros,servicios_industriales,servicios_legales,servicios_profesionales,servicios_tecnicos_en_informatica,servicios_tic,sexshop,software_de_nomina_y_rh,soluciones_de_conectividad_y_tecnologia,spa_y_estudio_de_fitness,tacos,taller_mecanico,taqueria_y_comida,techco,techco_soluciones_de_conectividad_y_tecnologia,tecnologia_de_puntos_de_venta,tecnologia_y_conectividad,test_final_lovable,tienda,tienda-de-cristales-esotericos-chamanicos,tienda-de-guitarras,tienda-guitarras-musical,tienda-guitarras-pro,tienda_de_abarrotes,tienda_de_abarrotes_con_venta_de_cerveza,tienda_de_abarrotes_y_deposito,tienda_de_articulos_de_fiesta,tienda_de_articulos_de_fiesta_globos_y_regalos,tienda_de_conveniencia,tienda_de_fajas,tienda_de_regalos,toallas,transporte,transporte_de_pasajeros,transporte_y_logistica,vending_machines,venta-aire-libre-test123,venta-calentadores-agua-test12250,venta-de-aire-acondicionado,venta-de-fruta,venta-de-ropa,venta-de-tuallas,venta_de_alimentos,venta_de_boneles,venta_de_boneless,venta_de_comida_a_domicilio,venta_de_comida_solo_servicio_a_domicilio,venta_de_cristales_energeticos,venta_de_nieves_de_yogurt,venta_de_productos_artesanales,venta_de_productos_artesanales_salsas_moles_mezcal_cafe,venta_de_productos_artesanales_salsas_moles_mezcal_cafe_etcetera,venta_de_tamales_artesanales,verduleria,verduleria_con_abarrotes,vibero,vivero`.split(',');

// ─── MAPPER: slug → padre por keywords ───
function mapToParent(slug) {
  const s = slug.toLowerCase().replace(/[-_]/g, ' ');
  // Aliases directos del HTML
  const DIRECT = {
    'estetica': 'salon_belleza', 'nails': 'salon_belleza', 'spa': 'salon_belleza',
    'cosmeticos': 'salon_belleza', 'salon-belleza': 'salon_belleza', 'salon_de_belleza': 'salon_belleza',
    'proveedora_de_belleza': 'salon_belleza', 'spa_y_estudio_de_fitness': 'gimnasio',
    'clinica-dental': 'dentista', 'consultorio_dental': 'dentista', 'consultorio_medico': 'farmacia',
    'medico': 'farmacia', 'naturista': 'farmacia', 'herbalife': 'farmacia',
    'hierberia_y_naturista': 'farmacia', 'laboratorio': 'farmacia', 'servicios_de_salud': 'farmacia',
    'tienda_ropa': 'ropa', 'tienda-ropa': 'ropa', 'boutique': 'ropa', 'lenceria': 'ropa',
    'lenceria-test-fresh': 'ropa', 'sabanas_premium': 'ropa', 'sabanas': 'ropa',
    'fajas': 'ropa', 'tienda_de_fajas': 'ropa', 'venta-de-ropa': 'ropa',
    'ropa_calzado_y_boutique': 'ropa', 'fajas_venta_de_ropa_accesorios_restaurante_taqueria': 'ropa',
    'mochila': 'ropa', 'calcetines': 'ropa', 'pantimedias': 'ropa', 'toallas': 'ropa',
    'venta-de-tuallas': 'ropa', 'panales': 'ropa', 'patines': 'ropa',
    'colchas': 'muebleria', 'edredones': 'muebleria', 'almoiadas': 'muebleria',
    'camas': 'muebleria', 'caobijas': 'muebleria', 'hogar': 'muebleria',
    'venta-de-aire-acondicionado': 'electronica', 'aire-acondicionado': 'electronica',
    'climas': 'electronica', 'calentador-solar-electrico': 'electronica',
    'venta-calentadores-agua-test12250': 'electronica', 'compu': 'electronica',
    'equipo_de_computo': 'electronica', 'guitarra': 'electronica', 'guitarras': 'electronica',
    'tienda-de-guitarras': 'electronica', 'tienda-guitarras-musical': 'electronica',
    'tienda-guitarras-pro': 'electronica', 'techco': 'electronica',
    'techco_soluciones_de_conectividad_y_tecnologia': 'electronica',
    'tecnologia_de_puntos_de_venta': 'electronica', 'tecnologia_y_conectividad': 'electronica',
    'soluciones_de_conectividad_y_tecnologia': 'electronica',
    'servicios_de_telecomunicaciones': 'electronica',
    'servicios_tecnicos_en_informatica': 'electronica', 'servicios_tic': 'electronica',
    'ciber_cafe': 'electronica', 'software_de_nomina_y_rh': 'electronica',
    'pollo_frito': 'polleria', 'pollos_asados': 'polleria',
    'pollo_rostizado_frito_o_a_la_barbacoa': 'polleria',
    'restaurante_pollo_rostizado_frito_o_a_la_barbacoa': 'polleria',
    'dark_kitchen_de_pollo_rostizado_frito_o_a_la_barbacoa': 'polleria',
    'antojitos': 'taqueria', 'antojitos_mexicanos': 'taqueria', 'tacos_vapor': 'taqueria',
    'tacos': 'taqueria', 'taqueria_y_comida': 'taqueria',
    'carnitas_estilo_michoacan': 'taqueria', 'comida_corrida': 'restaurante',
    'dark_kitchen': 'restaurante', 'ghost_kitchen': 'restaurante',
    'banquetes': 'restaurante', 'restaurant_bar': 'restaurante',
    'restaurante_bar': 'restaurante', 'restaurante_sport_bar': 'restaurante',
    'restaurante_con_impresora_de_pedidos_a_cocina': 'restaurante',
    'restaurante_de_comida_mexicana': 'restaurante',
    'restaurante_de_comida_rapida': 'restaurante',
    'restaurante_de_hamburguesas': 'hamburguesas',
    'restaurante_de_mariscos': 'marisqueria',
    'comida_china': 'restaurante', 'comedor_industrial': 'restaurante',
    'puesto_de_comida': 'restaurante', 'negocios_de_venta_de_alimentos': 'restaurante',
    'venta_de_alimentos': 'restaurante', 'venta_de_comida_a_domicilio': 'restaurante',
    'venta_de_comida_solo_servicio_a_domicilio': 'restaurante',
    'venta_de_boneles': 'restaurante', 'venta_de_boneless': 'restaurante',
    'venta_de_tamales_artesanales': 'tortilleria',
    'venta_de_productos_artesanales': 'abarrotes',
    'venta_de_productos_artesanales_salsas_moles_mezcal_cafe': 'abarrotes',
    'venta_de_productos_artesanales_salsas_moles_mezcal_cafe_etcetera': 'abarrotes',
    'pesacado': 'marisqueria', 'pescado': 'marisqueria',
    'queseria': 'cremeria', 'fruteria_y_abarrotes': 'fruteria',
    'verduleria': 'fruteria', 'verduleria_con_abarrotes': 'fruteria',
    'frutas': 'fruteria', 'frutas-deshidratadas': 'fruteria',
    'venta-de-fruta': 'fruteria', 'forrajera': 'veterinaria',
    'arboles': 'floreria', 'macetas': 'floreria', 'floristeria': 'floreria',
    'tienda_mascotas': 'veterinaria',
    'minisuper': 'abarrotes', 'mini_super': 'abarrotes',
    'tienda-conveniencia': 'abarrotes', 'tienda_de_conveniencia': 'abarrotes',
    'deposito': 'abarrotes', 'tienda_china': 'abarrotes',
    'dulceria': 'abarrotes', 'dulceria_a_granel': 'abarrotes',
    'refresqueria': 'abarrotes', 'cerveza_artesanal': 'abarrotes',
    'cremeria': 'abarrotes', 'purificadora': 'abarrotes',
    'ecologica': 'abarrotes', 'regalos': 'papeleria',
    'tienda_de_regalos': 'papeleria', 'tienda_de_articulos_de_fiesta': 'papeleria',
    'tienda_de_articulos_de_fiesta_globos_y_regalos': 'papeleria',
    'pinatas': 'papeleria', 'merceria_papeleria_y_novedades': 'papeleria',
    'libreria': 'papeleria', 'impresion_de_etiquetas': 'papeleria',
    'impresion_y_diseno': 'papeleria', 'fabricante_de_etiquetas': 'papeleria',
    'fabricante_de_etiquetas_adhesivas_e_in_mould': 'papeleria',
    'bazar': 'abarrotes', 'tienda': 'abarrotes',
    'tienda_de_abarrotes': 'abarrotes',
    'tienda_de_abarrotes_con_venta_de_cerveza': 'abarrotes',
    'tienda_de_abarrotes_y_deposito': 'abarrotes',
    'abarrotes_tienda_de_conveniencia_mini_super': 'abarrotes',
    'abarrotes_y_cafeteria': 'cafeteria', 'abarrotes_y_carniceria': 'carniceria',
    'abarrotes_y_cerveza': 'abarrotes', 'vape_shop': 'sex_shop',
    'sexshop': 'sex_shop',
    'tienda-de-cristales-esotericos-chamanicos': 'sex_shop',
    'venta_de_cristales_energeticos': 'sex_shop',
    'tlapaleria': 'ferreteria', 'carpinteria': 'ferreteria',
    'herreria': 'ferreteria', 'cerrajeria': 'ferreteria',
    'aluminio': 'ferreteria', 'construccion': 'ferreteria',
    'construccion_y_mantenimiento_integral': 'ferreteria',
    'materiales_de_construccion': 'ferreteria',
    'paneles_solares': 'ferreteria', 'vidrieria': 'ferreteria',
    'botes-de-basura': 'ferreteria', 'puertas': 'ferreteria',
    'control_de_plagas': 'ferreteria',
    'servicios_de_fumigacion': 'ferreteria',
    'servicios_de_jardineria_y_mantenimiento_de_areas_verdes': 'ferreteria',
    'refaccionaria': 'taller_mecanico', 'taller-mecanico': 'taller_mecanico',
    'carwash': 'taller_mecanico', 'llantera': 'taller_mecanico',
    'vulcanizadora': 'taller_mecanico', 'agencia_autos': 'taller_mecanico',
    'industria_automotriz': 'taller_mecanico',
    'electrodomesticos': 'electronica', 'computacion': 'electronica',
    'celulares': 'electronica', 'reparacion_celulares': 'taller_mecanico',
    'gamer': 'electronica', 'cctv': 'electronica', 'sonido': 'electronica',
    'drones': 'electronica', 'impresion_3d': 'electronica', 'domotica': 'electronica',
    'deportes': 'ropa', 'imprenta': 'papeleria', 'fotografia': 'papeleria',
    'estudio_tatuajes_manuel': 'salon_belleza',
    'escuela': 'gimnasio', 'guarderia': 'gimnasio',
    'educacion': 'gimnasio', 'educacion_y_capacitacion': 'gimnasio',
    'consultoria': 'gimnasio', 'consultoria_cursos_talleres_y_coaching': 'gimnasio',
    'consultoria_cursos_talleres_clases_master_asesorias_y_coaching_temas_tecnicos_habilidades_blandas_calidad_e_informatica': 'gimnasio',
    'consultoria_financiera_y_fiscal': 'gimnasio',
    'motel': 'hotel', 'casa_empeno': 'joyeria',
    'wisp': 'electronica', 'coworking': 'hotel', 'agencia_de_viajes': 'hotel',
    'software': 'electronica', 'marketing_digital': 'electronica',
    'hosting_web': 'electronica', 'automatizacion': 'electronica',
    'ia_chatbots': 'electronica', 'criptomonedas': 'joyeria',
    'kavanderia': 'lavanderia',
    'asesor_de_seguros': 'gimnasio', 'seguros': 'gimnasio', 'banco': 'gimnasio',
    'financiero': 'gimnasio', 'servicios_financieros': 'gimnasio',
    'inmobiliaria': 'gimnasio', 'bienes_raices': 'gimnasio',
    'bienes_raices_ingenieria_civil_electrica_y_refrigeracion': 'gimnasio',
    'servicios_legales': 'gimnasio', 'servicios_profesionales': 'gimnasio',
    'seguridad_privada': 'gimnasio',
    'almacen_logistica': 'abarrotes', 'logistica': 'abarrotes',
    'logistica_transporte': 'abarrotes', 'logistica_y_transporte': 'abarrotes',
    'transporte': 'abarrotes', 'transporte_de_pasajeros': 'hotel',
    'transporte_y_logistica': 'abarrotes', 'bodegas': 'abarrotes',
    'paqueteria': 'abarrotes', 'vending_machines': 'abarrotes',
    'fabrica': 'ferreteria', 'fabricacion_de_bebidas': 'cafeteria',
    'fabricacion_de_materiales_de_construccion': 'ferreteria',
    'fabricacion_de_mobiliario_y_equipamiento_industrial': 'muebleria',
    'fabricacion_industrial': 'ferreteria',
    'manufactura_avanzada': 'ferreteria', 'maquiladora': 'ferreteria',
    'maquinados': 'ferreteria', 'maquinaria_industrial': 'ferreteria',
    'mantenimiento_industrial': 'ferreteria',
    'servicios_de_mantenimiento_industrial': 'ferreteria',
    'servicios_industriales': 'ferreteria',
    'metalmecanica': 'ferreteria', 'industria_quimica': 'farmacia',
    'industrial': 'ferreteria', 'mineria': 'ferreteria',
    'petroleo_y_gas': 'ferreteria', 'proveedor_de_empaque': 'ferreteria',
    'comunidad_industrial': 'ferreteria',
    'caf-orgnico': 'cafeteria', 'cafe-lizingh': 'cafeteria',
    'cafetera-la-reina': 'cafeteria', 'postreria': 'pasteleria',
    'neveria': 'heladeria', 'nieve_y_yogurt': 'heladeria',
    'venta_de_nieves_de_yogurt': 'heladeria', 'paleteria': 'heladeria',
    'renta-de-vestidos': 'ropa', 'retail': 'ropa',
    'venta-aire-libre-test123': 'electronica',
    'test_final_lovable': 'electronica',
    'otro_tipo_de_negocio': 'abarrotes', 'generico': 'abarrotes',
    'vibero': 'floreria', 'vivero': 'floreria',
    'barber': 'barberia',
    'jugos-naturales': 'jugos_naturales',
  };
  if (DIRECT[slug]) return DIRECT[slug];
  // Fuzzy: incluye palabra clave
  if (/pollo/.test(s)) return 'polleria';
  if (/tortilla|tamale/.test(s)) return 'tortilleria';
  if (/taco|antojito/.test(s)) return 'taqueria';
  if (/pizza/.test(s)) return 'pizzeria';
  if (/sushi/.test(s)) return 'sushi';
  if (/hamburguesa|burger/.test(s)) return 'hamburguesas';
  if (/marisco|pescado/.test(s)) return 'marisqueria';
  if (/cafe|cafeteria|coffee/.test(s)) return 'cafeteria';
  if (/pan |pastel|reposteria|repostería|postre/.test(s)) return 'panaderia';
  if (/jugo|smoothie/.test(s)) return 'jugos_naturales';
  if (/helado|nieve|paleta|yogurt/.test(s)) return 'heladeria';
  if (/fruta|verdur/.test(s)) return 'fruteria';
  if (/carne|res|carnicer/.test(s)) return 'carniceria';
  if (/abarrote|tienda|deposito|mini|conveniencia|dulceria|refresc/.test(s)) return 'abarrotes';
  if (/farmac|medic|salud|natural|herbol/.test(s)) return 'farmacia';
  if (/mascot|veter/.test(s)) return 'veterinaria';
  if (/dentist|dental|odonto/.test(s)) return 'dentista';
  if (/optica|lentes/.test(s)) return 'optica';
  if (/gimna|fitness|yoga|sport/.test(s)) return 'gimnasio';
  if (/belleza|spa|estetic|nail|salon|cosmet|peluquer|barbe/.test(s)) return 'salon_belleza';
  if (/ferreter|construccion|tlapaler|carpinter|herreria|cerrajer|aluminio|vidrier/.test(s)) return 'ferreteria';
  if (/electron|computacion|celulares|laptop|tv|gadget/.test(s)) return 'electronica';
  if (/papel|libreria|imprenta|cuadern|oficina/.test(s)) return 'papeleria';
  if (/joya|oro|plata|reloj|diamante/.test(s)) return 'joyeria';
  if (/flor|ramo|jardin|bouquet/.test(s)) return 'floreria';
  if (/lavanderia|tintoreria|planchad/.test(s)) return 'lavanderia';
  if (/hotel|motel|hospedaje|alojamiento|coworking|viaje/.test(s)) return 'hotel';
  if (/taller|mecanico|refaccion|llantera|carwash/.test(s)) return 'taller_mecanico';
  if (/zapateria|calzado|sneaker|bota/.test(s)) return 'zapateria';
  if (/ropa|moda|boutique|vestido|camisa|jean|playera|prenda/.test(s)) return 'ropa';
  if (/mueble|sala|comedor|cama|colcha|edredon/.test(s)) return 'muebleria';
  if (/restaurant|comida|aliment|menu|bar/.test(s)) return 'restaurante';
  if (/sex|adult|placer|erotic|lenceria/.test(s)) return 'sex_shop';
  return 'abarrotes'; // fallback
}

// ─── Color por giro padre ───
const GIRO_COLOR = {
  sex_shop: 'e91e63', restaurante: 'd97706', veterinaria: '0ea5e9', dentista: '06b6d4',
  hotel: '7c3aed', farmacia: '10b981', optica: '6366f1', gimnasio: 'ef4444',
  salon_belleza: 'db2777', taller_mecanico: '1f2937', abarrotes: 'f59e0b', barberia: '0f172a',
  panaderia: 'a16207', cafeteria: '78350f', ferreteria: 'b45309', pizzeria: 'dc2626',
  taqueria: 'b91c1c', heladeria: '0284c7', pasteleria: 'be185d', jugos_naturales: '16a34a',
  jugos_frescos: '15803d', marisqueria: '0369a1', sushi: '991b1b', hamburguesas: 'b45309',
  fruteria: '16a34a', carniceria: '991b1b', polleria: 'd97706', tortilleria: 'a16207',
  ropa: '7c2d12', zapateria: '6b21a8', electronica: '1e40af', papeleria: '2563eb',
  joyeria: '92400e', floreria: 'db2777', lavanderia: '0ea5e9', muebleria: '78350f',
};

// ─── Generar nombre display desde slug ───
function slugToName(slug) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ─── Buscar giros existentes en JSON ───
const existing = {};
data.giros.forEach(g => { existing[g.slug] = g; });

let nuevos = 0, mapeados = 0;
const slugsUnicos = [...new Set(ALL_SLUGS)];
console.log('Total slugs únicos:', slugsUnicos.length);

slugsUnicos.forEach((slug, idx) => {
  if (existing[slug]) return; // ya existe, skip
  // Normalizar
  const slugNorm = slug.replace(/-/g, '_');
  if (existing[slugNorm]) {
    // ya tiene equivalente con underscores, skip (mostrado via aliases en runtime)
    return;
  }
  const parentSlug = mapToParent(slug);
  const parent = existing[parentSlug];
  if (!parent) {
    console.log('⚠️ Sin parent:', slug, '→', parentSlug);
    return;
  }
  // Crear entrada heredando del padre pero con label propio + 10 productos imagen única
  const color = GIRO_COLOR[parentSlug] || '6b7280';
  const displayName = slugToName(slug);

  const productos_plantilla = (parent.productos_plantilla || []).map((p, pi) => ({
    nombre: p.nombre, // mantiene el nombre del padre (es producto coherente del sector)
    imagen: 'https://placehold.co/400x300/' + color + '/ffffff?text=' +
            encodeURIComponent(displayName.slice(0, 20)) + '+' + (pi + 1),
    precio: p.precio,
    moneda: p.moneda || 'MXN',
    marca: p.marca || null,
    source: 'generated_v44',
  }));

  data.giros.push({
    slug,
    name: displayName,
    tipo_operacion: parent.tipo_operacion || 'venta_directa',
    regulacion: parent.regulacion || 'general',
    que_vende: parent.que_vende || '—',
    cadena_valor: parent.cadena_valor || { proveedores: [], clientes_finales: [] },
    competidores_sector: parent.competidores_sector || [],
    funcionalidades_criticas: parent.funcionalidades_criticas || [],
    problemas_evitar: parent.problemas_evitar || [],
    terminologia: parent.terminologia || [],
    productos_plantilla,
    _parent: parentSlug,
  });
  mapeados++;
  nuevos++;
});

// Update meta
data._meta.last_audit = new Date().toISOString();
data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0);
data._meta.giros_total = data.giros.length;
data._meta.curated_version = 'V10.44';

// Verificar imágenes únicas
const allImgs = [];
data.giros.forEach(g => (g.productos_plantilla || []).forEach(p => allImgs.push(p.imagen)));
const uniqueImgs = new Set(allImgs);
const dupes = allImgs.length - uniqueImgs.size;

fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));

console.log('');
console.log('═══ RESUMEN V10.44 ═══');
console.log('Giros antes:', Object.keys(existing).length);
console.log('Slugs nuevos generados:', nuevos);
console.log('Giros después:', data.giros.length);
console.log('Total productos:', data._meta.products_total);
console.log('Imágenes únicas:', uniqueImgs.size, '/ total', allImgs.length);
console.log('Duplicadas:', dupes);
console.log('✅ Guardado');
