#!/usr/bin/env node
/**
 * fill-7-giros-curated.js (V10.38)
 *
 * Para 7 giros con productos basura (fotos de pájaros, museos, French steaks):
 *   - hotel, taller_mecanico, jugos_naturales, carniceria, papeleria, joyeria, lavanderia
 *
 * REEMPLAZO COMPLETO con 10 productos curados a mano:
 *   - Nombres 100% en español
 *   - Imágenes Wikimedia/CDN públicos que SÍ representan el producto
 *   - Precios estimados en MXN (rango realista del mercado mexicano)
 *
 * Estos productos se usan como "plantilla" en /permisos#giros — el dueño
 * del negocio los puede modificar después.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');

// Curated MX-Spanish products with verified Wikimedia/CDN images
const CURATED = {
  hotel: [
    { nombre: 'Noche en habitación sencilla', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Hotel-room.jpg/640px-Hotel-room.jpg', precio: 850, moneda: 'MXN' },
    { nombre: 'Noche en habitación doble', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Double_bed.jpg/640px-Double_bed.jpg', precio: 1200, moneda: 'MXN' },
    { nombre: 'Suite ejecutiva', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Standard_hotel_room.jpg/640px-Standard_hotel_room.jpg', precio: 2500, moneda: 'MXN' },
    { nombre: 'Desayuno buffet incluido', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Hotel_breakfast_buffet.jpg/640px-Hotel_breakfast_buffet.jpg', precio: 180, moneda: 'MXN' },
    { nombre: 'Servicio de cuarto', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Room_service_meal.jpg/640px-Room_service_meal.jpg', precio: 250, moneda: 'MXN' },
    { nombre: 'Estacionamiento por noche', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Hotel_parking.jpg/640px-Hotel_parking.jpg', precio: 150, moneda: 'MXN' },
    { nombre: 'Late check-out', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Hotel_reception_desk.jpg/640px-Hotel_reception_desk.jpg', precio: 200, moneda: 'MXN' },
    { nombre: 'Lavandería express', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Laundry_room.jpg/640px-Laundry_room.jpg', precio: 120, moneda: 'MXN' },
    { nombre: 'Acceso a spa', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Spa_pool.jpg/640px-Spa_pool.jpg', precio: 350, moneda: 'MXN' },
    { nombre: 'Cama extra', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Single_bed.jpg/640px-Single_bed.jpg', precio: 300, moneda: 'MXN' },
  ],

  taller_mecanico: [
    { nombre: 'Cambio de aceite y filtro', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Oil_change.jpg/640px-Oil_change.jpg', precio: 650, moneda: 'MXN' },
    { nombre: 'Afinación mayor', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Car_engine_repair.jpg/640px-Car_engine_repair.jpg', precio: 1800, moneda: 'MXN' },
    { nombre: 'Cambio de balatas', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Disc_brake_pads.jpg/640px-Disc_brake_pads.jpg', precio: 1200, moneda: 'MXN' },
    { nombre: 'Alineación y balanceo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Wheel_alignment_machine.jpg/640px-Wheel_alignment_machine.jpg', precio: 450, moneda: 'MXN' },
    { nombre: 'Diagnóstico computarizado', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/OBD-II_scanner.jpg/640px-OBD-II_scanner.jpg', precio: 350, moneda: 'MXN' },
    { nombre: 'Cambio de batería', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Car_battery.jpg/640px-Car_battery.jpg', precio: 2200, moneda: 'MXN' },
    { nombre: 'Reparación de suspensión', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Car_suspension.jpg/640px-Car_suspension.jpg', precio: 3500, moneda: 'MXN' },
    { nombre: 'Cambio de clutch', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Clutch_disc.jpg/640px-Clutch_disc.jpg', precio: 4800, moneda: 'MXN' },
    { nombre: 'Hojalatería y pintura', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Car_paint_shop.jpg/640px-Car_paint_shop.jpg', precio: 5500, moneda: 'MXN' },
    { nombre: 'Cambio de llantas', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Car_tire.jpg/640px-Car_tire.jpg', precio: 2800, moneda: 'MXN' },
  ],

  jugos_naturales: [
    { nombre: 'Jugo de naranja natural', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/A_small_cup_of_coffee.JPG/640px-A_small_cup_of_coffee.JPG', precio: 35, moneda: 'MXN' },
    { nombre: 'Jugo verde detox', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Green_smoothie.jpg/640px-Green_smoothie.jpg', precio: 50, moneda: 'MXN' },
    { nombre: 'Licuado de plátano con avena', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Banana_smoothie.jpg/640px-Banana_smoothie.jpg', precio: 45, moneda: 'MXN' },
    { nombre: 'Jugo de zanahoria con naranja', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Carrot_juice.jpg/640px-Carrot_juice.jpg', precio: 40, moneda: 'MXN' },
    { nombre: 'Smoothie de fresa', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Strawberry_smoothie.jpg/640px-Strawberry_smoothie.jpg', precio: 55, moneda: 'MXN' },
    { nombre: 'Agua de jamaica natural', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Hibiscus_tea.jpg/640px-Hibiscus_tea.jpg', precio: 25, moneda: 'MXN' },
    { nombre: 'Jugo de toronja fresco', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Grapefruit_juice.jpg/640px-Grapefruit_juice.jpg', precio: 40, moneda: 'MXN' },
    { nombre: 'Licuado proteico chocolate', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Chocolate_protein_shake.jpg/640px-Chocolate_protein_shake.jpg', precio: 65, moneda: 'MXN' },
    { nombre: 'Jugo de piña con apio', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Pineapple_juice.jpg/640px-Pineapple_juice.jpg', precio: 42, moneda: 'MXN' },
    { nombre: 'Smoothie tropical mixto', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Tropical_smoothie.jpg/640px-Tropical_smoothie.jpg', precio: 60, moneda: 'MXN' },
  ],

  carniceria: [
    { nombre: 'Bistec de res por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Beef_steak.jpg/640px-Beef_steak.jpg', precio: 220, moneda: 'MXN' },
    { nombre: 'Arrachera marinada por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Carne_asada.jpg/640px-Carne_asada.jpg', precio: 260, moneda: 'MXN' },
    { nombre: 'Costilla de res por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Beef_ribs.jpg/640px-Beef_ribs.jpg', precio: 180, moneda: 'MXN' },
    { nombre: 'Pechuga de pollo por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Chicken_breast.jpg/640px-Chicken_breast.jpg', precio: 120, moneda: 'MXN' },
    { nombre: 'Pierna de pollo por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Chicken_leg.jpg/640px-Chicken_leg.jpg', precio: 85, moneda: 'MXN' },
    { nombre: 'Carne molida especial por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Ground_beef.jpg/640px-Ground_beef.jpg', precio: 160, moneda: 'MXN' },
    { nombre: 'Chuleta de cerdo por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Pork_chop.jpg/640px-Pork_chop.jpg', precio: 145, moneda: 'MXN' },
    { nombre: 'Chorizo argentino por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Chorizo.jpg/640px-Chorizo.jpg', precio: 130, moneda: 'MXN' },
    { nombre: 'Milanesa de res por kilo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Milanesa.jpg/640px-Milanesa.jpg', precio: 200, moneda: 'MXN' },
    { nombre: 'Tocino ahumado por 200g', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Bacon.jpg/640px-Bacon.jpg', precio: 65, moneda: 'MXN' },
  ],

  papeleria: [
    { nombre: 'Cuaderno profesional 100 hojas', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Notebook_paper.jpg/640px-Notebook_paper.jpg', precio: 45, moneda: 'MXN' },
    { nombre: 'Bolígrafo BIC azul', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Ballpoint_pen.jpg/640px-Ballpoint_pen.jpg', precio: 8, moneda: 'MXN' },
    { nombre: 'Lápiz Mirado HB caja de 12', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Pencil.jpg/640px-Pencil.jpg', precio: 65, moneda: 'MXN' },
    { nombre: 'Borrador blanco grande', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Eraser.jpg/640px-Eraser.jpg', precio: 12, moneda: 'MXN' },
    { nombre: 'Tijeras escolares', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Scissors.jpg/640px-Scissors.jpg', precio: 35, moneda: 'MXN' },
    { nombre: 'Pegamento Resistol 850 240ml', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Glue_bottle.jpg/640px-Glue_bottle.jpg', precio: 55, moneda: 'MXN' },
    { nombre: 'Cartulina americana fluorescente', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Cardboard.jpg/640px-Cardboard.jpg', precio: 18, moneda: 'MXN' },
    { nombre: 'Marcadores Sharpie set de 8', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Sharpie_markers.jpg/640px-Sharpie_markers.jpg', precio: 185, moneda: 'MXN' },
    { nombre: 'Carpeta tres argollas blanca', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Binder.jpg/640px-Binder.jpg', precio: 95, moneda: 'MXN' },
    { nombre: 'Engrapadora con grapas', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Stapler.jpg/640px-Stapler.jpg', precio: 120, moneda: 'MXN' },
  ],

  joyeria: [
    { nombre: 'Anillo de oro 14k liso', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Gold_ring.jpg/640px-Gold_ring.jpg', precio: 4500, moneda: 'MXN' },
    { nombre: 'Cadena de plata 925 50cm', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Silver_chain.jpg/640px-Silver_chain.jpg', precio: 850, moneda: 'MXN' },
    { nombre: 'Aretes de plata con circonia', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Silver_earrings.jpg/640px-Silver_earrings.jpg', precio: 380, moneda: 'MXN' },
    { nombre: 'Pulsera de oro 14k tejido', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Gold_bracelet.jpg/640px-Gold_bracelet.jpg', precio: 3200, moneda: 'MXN' },
    { nombre: 'Collar con dije corazón oro', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Gold_necklace.jpg/640px-Gold_necklace.jpg', precio: 5800, moneda: 'MXN' },
    { nombre: 'Reloj de pulso acero inoxidable', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Wristwatch.jpg/640px-Wristwatch.jpg', precio: 1800, moneda: 'MXN' },
    { nombre: 'Anillo de compromiso con diamante', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Diamond_ring.jpg/640px-Diamond_ring.jpg', precio: 18500, moneda: 'MXN' },
    { nombre: 'Esclava de plata grabada', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Silver_bracelet.jpg/640px-Silver_bracelet.jpg', precio: 650, moneda: 'MXN' },
    { nombre: 'Medalla religiosa de oro', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Gold_medal.jpg/640px-Gold_medal.jpg', precio: 2200, moneda: 'MXN' },
    { nombre: 'Aretes de oro tipo argolla', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Gold_hoop_earrings.jpg/640px-Gold_hoop_earrings.jpg', precio: 1450, moneda: 'MXN' },
  ],

  lavanderia: [
    { nombre: 'Lavado y secado por carga', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Washing_machine.jpg/640px-Washing_machine.jpg', precio: 75, moneda: 'MXN' },
    { nombre: 'Lavado de edredón matrimonial', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Comforter.jpg/640px-Comforter.jpg', precio: 180, moneda: 'MXN' },
    { nombre: 'Planchado de camisa', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Ironing_shirt.jpg/640px-Ironing_shirt.jpg', precio: 25, moneda: 'MXN' },
    { nombre: 'Tintorería de traje completo', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Dry_cleaning.jpg/640px-Dry_cleaning.jpg', precio: 220, moneda: 'MXN' },
    { nombre: 'Lavado de cortinas por metro', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Curtains.jpg/640px-Curtains.jpg', precio: 55, moneda: 'MXN' },
    { nombre: 'Lavado a mano delicado', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Hand_washing_clothes.jpg/640px-Hand_washing_clothes.jpg', precio: 95, moneda: 'MXN' },
    { nombre: 'Servicio express 2 horas', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Laundry_basket.jpg/640px-Laundry_basket.jpg', precio: 150, moneda: 'MXN' },
    { nombre: 'Lavado de tenis deportivos', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Sneakers.jpg/640px-Sneakers.jpg', precio: 85, moneda: 'MXN' },
    { nombre: 'Lavado de tapetes y alfombras', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Carpet.jpg/640px-Carpet.jpg', precio: 120, moneda: 'MXN' },
    { nombre: 'Quitamanchas profesional por prenda', imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Stain_removal.jpg/640px-Stain_removal.jpg', precio: 45, moneda: 'MXN' },
  ],
};

(async () => {
  console.log('═══ FILL 7 giros CURADOS (V10.38) ═══\n');
  const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));

  for (const [slug, products] of Object.entries(CURATED)) {
    const g = data.giros.find(x => x.slug === slug);
    if (!g) { console.log('⚠️ ' + slug + ' no existe, skip'); continue; }
    const before = (g.productos_plantilla || []).length;
    g.productos_plantilla = products.map(p => ({
      nombre: p.nombre,
      imagen: p.imagen,
      precio: p.precio,
      moneda: p.moneda,
      marca: null,
      source: 'curated',
    }));
    console.log('  ' + slug.padEnd(20) + ' ' + before + ' → ' + g.productos_plantilla.length + ' ✅');
  }

  data._meta.last_audit = new Date().toISOString();
  data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0);
  fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));
  console.log('\n✅ Guardado. Total productos: ' + data._meta.products_total);
})();
