#!/usr/bin/env node
/**
 * fill-all-curated-v2.js (V10.39)
 *
 * Reemplaza productos_plantilla en LOS 36 giros con:
 *  - Nombre en español MX coherente con el giro
 *  - Precio MXN realista del mercado
 *  - Imagen Wikimedia/CDN con HEAD verificada (fallback placehold.co)
 *
 * Tres datos requeridos por producto: nombre + precio + imagen. Si la URL
 * de imagen devuelve != 200 al HEAD, se reemplaza por placehold.co con el
 * nombre del producto como label.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');

// ───────────────────────────────────────────────────────────────────────
// HELPER: HEAD request para verificar que la imagen carga
function headOk(url, timeoutMs = 4000) {
  return new Promise(res => {
    if (!url || !url.startsWith('http')) return res(false);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { req.destroy(); } catch (_) { } res(false); } }, timeoutMs);
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0' } }, r => {
      if (!done) { done = true; clearTimeout(t); res(r.statusCode >= 200 && r.statusCode < 400); }
    });
    req.on('error', () => { if (!done) { done = true; clearTimeout(t); res(false); } });
    req.end();
  });
}

// Color por giro (placeholder fallback)
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

function placehold(name, giroSlug) {
  const c = GIRO_COLOR[giroSlug] || '6b7280';
  const txt = encodeURIComponent(name.slice(0, 30));
  return `https://placehold.co/400x300/${c}/ffffff?text=${txt}`;
}

// ES→EN keyword map para mejor búsqueda en Flickr
const KW_MAP = {
  'jugo': 'juice', 'naranja': 'orange', 'verde': 'green', 'detox': 'detox',
  'licuado': 'smoothie', 'plátano': 'banana', 'platano':'banana', 'avena': 'oats',
  'zanahoria': 'carrot', 'smoothie': 'smoothie', 'fresa': 'strawberry',
  'piña': 'pineapple', 'apio': 'celery', 'tropical': 'tropical', 'mango': 'mango',
  'agua': 'water', 'jamaica': 'hibiscus', 'horchata': 'horchata',
  'café': 'coffee', 'cafe': 'coffee', 'capuchino': 'cappuccino', 'latte': 'latte',
  'espresso': 'espresso', 'mocha': 'mocha', 'frappé': 'frappe', 'frappe':'frappe', 'té': 'tea', 'chai': 'chai',
  'croissant': 'croissant', 'bagel': 'bagel', 'brownie': 'brownie', 'donut': 'donut', 'dona':'donut',
  'pizza': 'pizza', 'margarita': 'margherita', 'pepperoni': 'pepperoni', 'hawaiana': 'hawaiian',
  'cuatro': 'four', 'quesos': 'cheese', 'alitas': 'wings', 'pasta': 'pasta', 'lasaña': 'lasagna',
  'taco': 'taco', 'pastor': 'al-pastor', 'bistec': 'beef-steak', 'carnitas': 'carnitas',
  'quesadilla': 'quesadilla', 'gringa': 'mexican-food', 'volcán': 'mexican-food', 'mulita': 'mexican-food',
  'consomé': 'beef-soup',
  'helado': 'ice-cream', 'banana':'banana', 'split':'banana-split', 'malteada':'milkshake',
  'nieve':'sorbet', 'limón':'lemon', 'paleta':'popsicle', 'sundae':'sundae', 'cono':'ice-cream-cone',
  'pastel': 'cake', 'chocolate': 'chocolate', 'tres leches': 'tres-leches-cake', 'cheesecake': 'cheesecake',
  'red velvet': 'red-velvet', 'tiramisú':'tiramisu', 'tiramisu':'tiramisu', 'cupcake':'cupcake', 'macarrones':'macarons',
  'galletas': 'cookies',
  'coctel': 'shrimp-cocktail', 'camarón': 'shrimp', 'camaron':'shrimp',
  'ceviche': 'ceviche', 'aguachile': 'aguachile', 'pulpo':'octopus', 'mojarra':'fried-fish',
  'pescado':'fish', 'caldo':'seafood-soup', 'tostada':'tostada', 'ostiones':'oysters',
  'roll': 'sushi-roll', 'california': 'california-roll', 'philadelphia': 'philadelphia-roll',
  'spicy tuna': 'spicy-tuna-roll', 'sashimi':'sashimi', 'nigiri':'nigiri', 'tempura':'tempura',
  'sopa miso': 'miso-soup', 'edamame': 'edamame',
  'hamburguesa': 'hamburger', 'cheeseburger':'cheeseburger', 'bacon':'bacon', 'bbq':'bbq',
  'papas': 'french-fries', 'gajo':'potato-wedges', 'aros':'onion-rings', 'hot dog':'hotdog',
  'boneless': 'chicken-wings',
  'plátano tabasco': 'banana', 'manzana': 'apple', 'aguacate':'avocado', 'hass':'avocado',
  'jitomate':'tomato', 'cebolla':'onion', 'papaya':'papaya', 'sandía':'watermelon',
  'naranja valencia':'orange', 'mango ataulfo':'mango',
  'res':'beef', 'arrachera':'arrachera', 'costilla':'beef-rib', 'pechuga':'chicken-breast',
  'pollo':'chicken', 'pierna':'chicken-leg', 'carne molida':'ground-beef', 'chuleta':'pork-chop',
  'cerdo':'pork', 'chorizo':'chorizo', 'milanesa':'milanesa', 'tocino':'bacon',
  'pollo entero':'whole-chicken', 'muslo':'chicken-thigh', 'alitas':'chicken-wings',
  'rostizado':'rotisserie-chicken', 'huevo':'eggs', 'nuggets':'nuggets',
  'tortilla': 'tortilla', 'maíz':'corn', 'harina':'flour-tortilla', 'nopal':'nopal',
  'integral':'whole-wheat', 'totopos':'tortilla-chips', 'tostadas':'tostada', 'masa':'masa',
  'azul':'blue-corn-tortilla', 'tamal':'tamales', 'atole':'atole',
  'playera':'tshirt', 'jeans':'jeans', 'camisa':'dress-shirt', 'vestido':'dress', 'sudadera':'hoodie',
  'chamarra':'jacket', 'falda':'skirt', 'suéter':'sweater', 'pantalón':'pants', 'calcetines':'socks',
  'tenis': 'sneakers', 'nike':'nike-sneakers', 'converse':'converse', 'sandalia':'sandals',
  'zapato':'shoes', 'bota':'boots', 'mocasines':'loafers', 'huarache':'huaraches',
  'pantufla':'slippers', 'betún':'shoe-polish', 'plantilla':'shoe-insole',
  'audífonos':'earbuds', 'cargador':'usb-charger', 'bocina':'bluetooth-speaker',
  'smartwatch':'smartwatch', 'power bank':'powerbank', 'memoria usb':'usb-drive',
  'hdmi':'hdmi-cable', 'mouse':'computer-mouse', 'teclado':'keyboard', 'funda':'phone-case',
  'cuaderno':'notebook', 'bolígrafo':'pen', 'lápiz':'pencil', 'borrador':'eraser',
  'tijeras':'scissors', 'pegamento':'glue', 'cartulina':'colored-paper', 'marcadores':'markers',
  'carpeta':'binder', 'engrapadora':'stapler',
  'anillo':'gold-ring', 'oro':'gold', 'cadena':'silver-chain', 'plata':'silver',
  'aretes':'earrings', 'pulsera':'bracelet', 'collar':'necklace', 'reloj':'wristwatch',
  'diamante':'diamond-ring', 'esclava':'bracelet', 'medalla':'medal', 'argolla':'hoop-earring',
  'ramo':'bouquet', 'rosas':'red-roses', 'tulipanes':'tulips', 'centro de mesa':'centerpiece',
  'girasoles':'sunflowers', 'novia':'bridal-bouquet', 'corona':'wreath', 'orquídea':'orchid',
  'suculenta':'succulent', 'globo':'balloon',
  'lavado':'laundry', 'edredón':'comforter', 'planchado':'ironing', 'tintorería':'dry-cleaning',
  'cortinas':'curtains', 'tapetes':'carpet', 'quitamanchas':'stain-removal',
  'sala':'living-room-set', 'comedor':'dining-table', 'cama':'bed', 'colchón':'mattress',
  'escritorio':'desk', 'silla':'office-chair', 'librero':'bookshelf', 'mesa':'coffee-table',
  'lámpara':'floor-lamp', 'espejo':'mirror',
  'habitación':'hotel-room', 'suite':'hotel-suite', 'desayuno':'hotel-breakfast',
  'cuarto':'room-service', 'estacionamiento':'parking', 'check-out':'hotel-checkout',
  'lavandería':'hotel-laundry', 'spa':'spa-resort', 'cama extra':'extra-bed',
  'aceite':'oil-change', 'afinación':'engine-tune-up', 'balatas':'brake-pads',
  'alineación':'wheel-alignment', 'diagnóstico':'car-diagnostic', 'batería':'car-battery',
  'suspensión':'car-suspension', 'clutch':'clutch', 'hojalatería':'auto-body', 'llantas':'car-tires',
  'lubricante':'lubricant', 'condones':'condoms', 'lencería':'lingerie', 'vibrador':'vibrator',
  'masaje':'massage-oil', 'disfraz':'costume', 'esposas':'handcuffs', 'antifaz':'eye-mask',
  'enchiladas':'enchiladas', 'filete':'steak', 'pimienta':'pepper-steak', 'sopa':'soup',
  'tortilla':'tortilla-soup', 'mole':'mole-poblano', 'ensalada':'caesar-salad',
  'veracruzana':'veracruz-fish', 'arroz con leche':'rice-pudding',
  'consulta veterinaria':'veterinarian', 'vacuna':'pet-vaccine', 'croqueta':'dog-food',
  'whiskas':'cat-food', 'desparasitante':'pet-medicine', 'pipeta':'flea-treatment',
  'baño':'pet-grooming', 'arena sanitaria':'cat-litter', 'esterilización':'vet-surgery',
  'cama':'pet-bed',
  'consulta dental':'dentist', 'limpieza dental':'dental-cleaning', 'resina':'dental-filling',
  'extracción':'tooth-extraction', 'blanqueamiento':'teeth-whitening', 'endodoncia':'root-canal',
  'brackets':'braces', 'implante':'dental-implant', 'corona':'dental-crown',
  'radiografía':'dental-xray',
  'paracetamol':'paracetamol', 'ibuprofeno':'ibuprofen', 'amoxicilina':'antibiotic',
  'vitamina':'vitamin-c', 'alcohol':'isopropyl-alcohol', 'termómetro':'thermometer',
  'curitas':'bandages', 'suero':'electrolyte-drink', 'voltaren':'topical-cream',
  'mascarilla':'face-mask',
  'examen visual':'eye-exam', 'armazón':'eyeglass-frames', 'lentes graduados':'eyeglasses',
  'progresivos':'progressive-lenses', 'lentes de contacto':'contact-lens', 'lentes de sol':'sunglasses',
  'estuche':'eyeglass-case', 'solución':'lens-solution', 'antirreflejo':'anti-glare',
  'deportivos':'sports-eyewear',
  'membresía':'gym-interior', 'entrenador':'personal-trainer', 'spinning':'spin-class',
  'yoga':'yoga-class', 'proteína':'whey-protein', 'pase':'gym-pass', 'casillero':'gym-locker',
  'pre-workout':'pre-workout', 'crossfit':'crossfit', 'evaluación':'body-fat-test',
  'corte':'haircut', 'mujer':'salon-haircut', 'tinte':'hair-color', 'manicure':'manicure',
  'pedicure':'pedicure', 'maquillaje':'makeup-artist', 'hidratante':'hair-treatment',
  'depilación':'waxing', 'facial':'facial-treatment', 'cejas':'eyebrow-shaping', 'keratina':'keratin',
  'coca cola':'coca-cola-bottle', 'sabritas':'potato-chips', 'maruchan':'instant-noodles',
  'pan bimbo':'sliced-bread', 'leche':'milk-carton', 'huevo':'eggs-carton', 'arroz':'white-rice',
  'frijol':'pinto-beans', 'aceite':'cooking-oil', 'azúcar':'sugar',
  'navaja':'straight-razor', 'cera':'hair-pomade', 'pomada':'pomade', 'aceite barba':'beard-oil',
  'infantil':'kid-haircut', 'shampoo':'shampoo',
  'bolillo':'mexican-bread', 'concha':'concha-pan', 'cuerno':'chocolate-croissant',
  'telera':'mexican-bread', 'rol':'cinnamon-roll', 'integral':'whole-wheat-bread',
  'empanada':'empanada', 'polvorón':'cookies',
  'martillo':'claw-hammer', 'desarmador':'screwdriver', 'taladro':'cordless-drill',
  'tornillo':'wood-screws', 'cinta métrica':'tape-measure', 'llave stilson':'pipe-wrench',
  'pintura':'paint-can', 'cemento':'cement-bag', 'cable eléctrico':'electrical-wire', 'foco led':'led-bulb',
};

function buildKeyword(name, giroSlug) {
  // 1) Try exact phrase matches first
  const n = name.toLowerCase();
  for (const [es, en] of Object.entries(KW_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (n.includes(es)) return en;
  }
  // 2) Fallback: first 2 words slugified + giroSlug context
  const slug = name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/).slice(0, 2).join('-');
  return slug || giroSlug;
}

function flickrUrl(name, giroSlug) {
  const kw = buildKeyword(name, giroSlug);
  return `https://loremflickr.com/640/480/${encodeURIComponent(kw)}`;
}

// ───────────────────────────────────────────────────────────────────────
// CURADO — 36 giros × 10 productos = 360 items
// Cada item: [nombre español MX, precio MXN, URL imagen Wikimedia]

const CURATED = {
  sex_shop: [
    ['Lubricante íntimo base agua 100ml', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Personal_lubricant.jpg/640px-Personal_lubricant.jpg'],
    ['Condones de látex caja con 12', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Condom.jpg/640px-Condom.jpg'],
    ['Lencería conjunto encaje negro', 650, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Lingerie_set.jpg/640px-Lingerie_set.jpg'],
    ['Vibrador clásico recargable', 890, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Vibrator_sex_toy.jpg/640px-Vibrator_sex_toy.jpg'],
    ['Aceite para masaje sensual 200ml', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Massage_oil.jpg/640px-Massage_oil.jpg'],
    ['Disfraz enfermera sexy talla M', 550, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Nurse_costume.jpg/640px-Nurse_costume.jpg'],
    ['Esposas de peluche rosa', 320, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Fuzzy_handcuffs.jpg/640px-Fuzzy_handcuffs.jpg'],
    ['Anillo vibrador desechable', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Vibrating_ring.jpg/640px-Vibrating_ring.jpg'],
    ['Bolas chinas plata silicona', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Ben_wa_balls.jpg/640px-Ben_wa_balls.jpg'],
    ['Antifaz de seda con encaje', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Sleep_mask.jpg/640px-Sleep_mask.jpg'],
  ],

  restaurante: [
    ['Enchiladas verdes con pollo', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Enchiladas.jpg/640px-Enchiladas.jpg'],
    ['Filete de res a la pimienta', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Steak_au_poivre.jpg/640px-Steak_au_poivre.jpg'],
    ['Sopa de tortilla tradicional', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Sopa_de_tortilla.jpg/640px-Sopa_de_tortilla.jpg'],
    ['Chiles en nogada (temporada)', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Chiles_en_nogada.jpg/640px-Chiles_en_nogada.jpg'],
    ['Mole poblano con pollo', 175, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Mole_poblano.jpg/640px-Mole_poblano.jpg'],
    ['Ensalada César con pollo', 135, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Caesar_salad.jpg/640px-Caesar_salad.jpg'],
    ['Pescado a la veracruzana', 245, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Pescado_a_la_veracruzana.jpg/640px-Pescado_a_la_veracruzana.jpg'],
    ['Arroz con leche tradicional', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Rice_pudding.jpg/640px-Rice_pudding.jpg'],
    ['Agua de horchata jarra 1L', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Horchata.jpg/640px-Horchata.jpg'],
    ['Café de olla taza', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Cafe_de_olla.jpg/640px-Cafe_de_olla.jpg'],
  ],

  veterinaria: [
    ['Consulta veterinaria general', 350, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Veterinarian_examining_dog.jpg/640px-Veterinarian_examining_dog.jpg'],
    ['Vacuna múltiple para perro', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Dog_vaccination.jpg/640px-Dog_vaccination.jpg'],
    ['Croqueta Pedigree adulto 8kg', 485, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Dog_food.jpg/640px-Dog_food.jpg'],
    ['Whiskas alimento gato 1.5kg', 165, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Cat_food.jpg/640px-Cat_food.jpg'],
    ['Desparasitante interno tableta', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Pet_medication.jpg/640px-Pet_medication.jpg'],
    ['Pipeta antipulgas Frontline', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Flea_treatment.jpg/640px-Flea_treatment.jpg'],
    ['Baño y corte para perro', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Dog_grooming.jpg/640px-Dog_grooming.jpg'],
    ['Arena sanitaria gato 5kg', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Cat_litter.jpg/640px-Cat_litter.jpg'],
    ['Esterilización canina hembra', 1850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Veterinary_surgery.jpg/640px-Veterinary_surgery.jpg'],
    ['Cama para mascota mediana', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Pet_bed.jpg/640px-Pet_bed.jpg'],
  ],

  dentista: [
    ['Consulta dental de valoración', 250, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Dental_consultation.jpg/640px-Dental_consultation.jpg'],
    ['Limpieza dental profesional', 650, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Dental_cleaning.jpg/640px-Dental_cleaning.jpg'],
    ['Resina dental por pieza', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Dental_filling.jpg/640px-Dental_filling.jpg'],
    ['Extracción dental simple', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tooth_extraction.jpg/640px-Tooth_extraction.jpg'],
    ['Blanqueamiento láser sesión', 3500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Tooth_whitening.jpg/640px-Tooth_whitening.jpg'],
    ['Endodoncia unirradicular', 2800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Root_canal_treatment.jpg/640px-Root_canal_treatment.jpg'],
    ['Brackets metálicos mensualidad', 950, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Dental_braces.jpg/640px-Dental_braces.jpg'],
    ['Implante dental titanio', 18500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Dental_implant.jpg/640px-Dental_implant.jpg'],
    ['Corona porcelana sobre metal', 4200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Dental_crown.jpg/640px-Dental_crown.jpg'],
    ['Radiografía panorámica', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Panoramic_radiograph.jpg/640px-Panoramic_radiograph.jpg'],
  ],

  farmacia: [
    ['Paracetamol 500mg caja 20 tab', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Paracetamol_tablets.jpg/640px-Paracetamol_tablets.jpg'],
    ['Ibuprofeno 400mg caja 30 tab', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Ibuprofen_tablets.jpg/640px-Ibuprofen_tablets.jpg'],
    ['Amoxicilina 500mg caja 12 cap', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Amoxicillin_capsules.jpg/640px-Amoxicillin_capsules.jpg'],
    ['Vitamina C 1g 30 tabletas', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Vitamin_C_tablets.jpg/640px-Vitamin_C_tablets.jpg'],
    ['Alcohol etílico 70° 1 litro', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Rubbing_alcohol.jpg/640px-Rubbing_alcohol.jpg'],
    ['Termómetro digital', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Digital_thermometer.jpg/640px-Digital_thermometer.jpg'],
    ['Curitas surtidas caja 100', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Adhesive_bandages.jpg/640px-Adhesive_bandages.jpg'],
    ['Suero rehidratante Electrolit', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Oral_rehydration_solution.jpg/640px-Oral_rehydration_solution.jpg'],
    ['Crema antiinflamatoria Voltaren', 175, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Topical_cream.jpg/640px-Topical_cream.jpg'],
    ['Mascarilla quirúrgica caja 50', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Surgical_mask.jpg/640px-Surgical_mask.jpg'],
  ],

  optica: [
    ['Examen visual computarizado', 350, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Eye_test.jpg/640px-Eye_test.jpg'],
    ['Armazón para lentes graduados', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Eyeglass_frames.jpg/640px-Eyeglass_frames.jpg'],
    ['Lentes graduados monofocales', 1450, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Eyeglasses.jpg/640px-Eyeglasses.jpg'],
    ['Lentes progresivos premium', 4500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Progressive_lenses.jpg/640px-Progressive_lenses.jpg'],
    ['Lentes de contacto blandos par', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Contact_lens.jpg/640px-Contact_lens.jpg'],
    ['Lentes de sol polarizados', 1280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Sunglasses.jpg/640px-Sunglasses.jpg'],
    ['Estuche rígido para lentes', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Eyeglass_case.jpg/640px-Eyeglass_case.jpg'],
    ['Solución para lentes contacto', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Contact_lens_solution.jpg/640px-Contact_lens_solution.jpg'],
    ['Tratamiento antirreflejo', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Anti-reflective_coating.jpg/640px-Anti-reflective_coating.jpg'],
    ['Lentes deportivos con micas', 1850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Sports_eyewear.jpg/640px-Sports_eyewear.jpg'],
  ],

  gimnasio: [
    ['Membresía mensual ilimitada', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Gym_interior.jpg/640px-Gym_interior.jpg'],
    ['Sesión entrenador personal', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Personal_trainer.jpg/640px-Personal_trainer.jpg'],
    ['Clase de spinning', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Spinning_class.jpg/640px-Spinning_class.jpg'],
    ['Clase de yoga grupal', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Yoga_class.jpg/640px-Yoga_class.jpg'],
    ['Proteína whey Gold 2lb', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Whey_protein.jpg/640px-Whey_protein.jpg'],
    ['Pase diario al gimnasio', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Treadmill.jpg/640px-Treadmill.jpg'],
    ['Casillero mensual', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Gym_locker.jpg/640px-Gym_locker.jpg'],
    ['Pre-workout 30 servicios', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Pre-workout_supplement.jpg/640px-Pre-workout_supplement.jpg'],
    ['Sesión de crossfit', 150, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Crossfit_workout.jpg/640px-Crossfit_workout.jpg'],
    ['Evaluación física inicial', 250, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Body_composition_analysis.jpg/640px-Body_composition_analysis.jpg'],
  ],

  salon_belleza: [
    ['Corte de cabello mujer', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Haircut_salon.jpg/640px-Haircut_salon.jpg'],
    ['Tinte completo de cabello', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Hair_dyeing.jpg/640px-Hair_dyeing.jpg'],
    ['Manicure profesional', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Manicure.jpg/640px-Manicure.jpg'],
    ['Pedicure spa con masaje', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Pedicure.jpg/640px-Pedicure.jpg'],
    ['Maquillaje profesional evento', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Makeup_application.jpg/640px-Makeup_application.jpg'],
    ['Tratamiento hidratante cabello', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Hair_treatment.jpg/640px-Hair_treatment.jpg'],
    ['Depilación cera piernas', 320, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Waxing.jpg/640px-Waxing.jpg'],
    ['Limpieza facial profunda', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Facial_treatment.jpg/640px-Facial_treatment.jpg'],
    ['Diseño de cejas con henna', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Eyebrow_shaping.jpg/640px-Eyebrow_shaping.jpg'],
    ['Alaciado permanente keratina', 1850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Keratin_treatment.jpg/640px-Keratin_treatment.jpg'],
  ],

  abarrotes: [
    ['Coca Cola 600ml', 18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Coca-Cola_bottle.jpg/640px-Coca-Cola_bottle.jpg'],
    ['Sabritas original 45g', 16, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Potato_chips.jpg/640px-Potato_chips.jpg'],
    ['Maruchan sabor camarón', 14, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Instant_noodles.jpg/640px-Instant_noodles.jpg'],
    ['Pan Bimbo grande blanco', 48, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Sliced_bread.jpg/640px-Sliced_bread.jpg'],
    ['Leche Lala entera 1L', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Milk_carton.jpg/640px-Milk_carton.jpg'],
    ['Huevo blanco docena', 42, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Eggs_carton.jpg/640px-Eggs_carton.jpg'],
    ['Arroz Verde Valle 1kg', 32, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/White_rice.jpg/640px-White_rice.jpg'],
    ['Frijol bayo 1kg', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Pinto_beans.jpg/640px-Pinto_beans.jpg'],
    ['Aceite Capullo 1L', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Cooking_oil.jpg/640px-Cooking_oil.jpg'],
    ['Azúcar estándar 1kg', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/White_sugar.jpg/640px-White_sugar.jpg'],
  ],

  barberia: [
    ['Corte de cabello clásico', 150, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Barbershop_haircut.jpg/640px-Barbershop_haircut.jpg'],
    ['Corte + barba completo', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Beard_trimming.jpg/640px-Beard_trimming.jpg'],
    ['Arreglo de barba con navaja', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Straight_razor_shaving.jpg/640px-Straight_razor_shaving.jpg'],
    ['Diseño de barba personalizado', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Beard_styling.jpg/640px-Beard_styling.jpg'],
    ['Mascarilla negra carbón activado', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Charcoal_face_mask.jpg/640px-Charcoal_face_mask.jpg'],
    ['Cera para cabello American Crew', 320, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Hair_pomade.jpg/640px-Hair_pomade.jpg'],
    ['Pomada efecto mate', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Matte_pomade.jpg/640px-Matte_pomade.jpg'],
    ['Aceite para barba 30ml', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Beard_oil.jpg/640px-Beard_oil.jpg'],
    ['Corte infantil 0-10 años', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Kid_haircut.jpg/640px-Kid_haircut.jpg'],
    ['Servicio premium con shampoo', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Hair_wash_barber.jpg/640px-Hair_wash_barber.jpg'],
  ],

  panaderia: [
    ['Bolillo blanco pieza', 4, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Bolillo.jpg/640px-Bolillo.jpg'],
    ['Concha de vainilla', 14, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Concha_pan_dulce.jpg/640px-Concha_pan_dulce.jpg'],
    ['Cuerno de chocolate', 16, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Croissant_chocolate.jpg/640px-Croissant_chocolate.jpg'],
    ['Telera mediana', 5, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Telera_bread.jpg/640px-Telera_bread.jpg'],
    ['Rol de canela glaseado', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Cinnamon_roll.jpg/640px-Cinnamon_roll.jpg'],
    ['Pan integral de caja', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Whole_wheat_bread.jpg/640px-Whole_wheat_bread.jpg'],
    ['Empanada de piña', 14, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Pineapple_empanada.jpg/640px-Pineapple_empanada.jpg'],
    ['Dona con chochitos', 16, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Donut_sprinkles.jpg/640px-Donut_sprinkles.jpg'],
    ['Polvorón de naranja', 12, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Polvoron.jpg/640px-Polvoron.jpg'],
    ['Bagel sencillo', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Bagel.jpg/640px-Bagel.jpg'],
  ],

  cafeteria: [
    ['Café americano grande', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/A_small_cup_of_coffee.JPG/640px-A_small_cup_of_coffee.JPG'],
    ['Capuchino con arte latte', 52, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Cappuccino_at_Sightglass_Coffee.jpg/640px-Cappuccino_at_Sightglass_Coffee.jpg'],
    ['Latte vainilla mediano', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Caf%C3%A9_latte.jpg/640px-Caf%C3%A9_latte.jpg'],
    ['Espresso doble', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Espresso.jpg/640px-Espresso.jpg'],
    ['Mocha chocolate caliente', 58, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Mocha_coffee.jpg/640px-Mocha_coffee.jpg'],
    ['Frappé caramelo', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Caramel_frappe.jpg/640px-Caramel_frappe.jpg'],
    ['Té chai latte', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Chai_latte.jpg/640px-Chai_latte.jpg'],
    ['Croissant de almendras', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Almond_croissant.jpg/640px-Almond_croissant.jpg'],
    ['Bagel con queso crema', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Bagel_cream_cheese.jpg/640px-Bagel_cream_cheese.jpg'],
    ['Brownie con nuez', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Brownie_with_walnuts.jpg/640px-Brownie_with_walnuts.jpg'],
  ],

  ferreteria: [
    ['Martillo de uña 16oz', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Claw_hammer.jpg/640px-Claw_hammer.jpg'],
    ['Desarmador plano set 6 piezas', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Screwdriver_set.jpg/640px-Screwdriver_set.jpg'],
    ['Taladro inalámbrico Truper 12V', 1850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Cordless_drill.jpg/640px-Cordless_drill.jpg'],
    ['Tornillo madera 2 pulgadas kg', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Wood_screws.jpg/640px-Wood_screws.jpg'],
    ['Cinta métrica 5m Stanley', 165, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Tape_measure.jpg/640px-Tape_measure.jpg'],
    ['Llave Stilson 14 pulgadas', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Pipe_wrench.jpg/640px-Pipe_wrench.jpg'],
    ['Pintura vinílica blanca 4L', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Paint_can.jpg/640px-Paint_can.jpg'],
    ['Cemento gris saco 50kg', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Cement_bag.jpg/640px-Cement_bag.jpg'],
    ['Cable eléctrico cal. 12 metro', 18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Electrical_wire.jpg/640px-Electrical_wire.jpg'],
    ['Foco LED 9W luz blanca', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/LED_lightbulb.jpg/640px-LED_lightbulb.jpg'],
  ],

  pizzeria: [
    ['Pizza margarita mediana', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Pizza-3007395.jpg/640px-Pizza-3007395.jpg'],
    ['Pizza pepperoni grande', 245, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg/640px-Eq_it-na_pizza-margherita_sep2005_sml.jpg'],
    ['Pizza hawaiana familiar', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Hawaiian_pizza.jpg/640px-Hawaiian_pizza.jpg'],
    ['Pizza mexicana picante', 265, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Mexican_pizza.jpg/640px-Mexican_pizza.jpg'],
    ['Pizza cuatro quesos', 275, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Four_cheese_pizza.jpg/640px-Four_cheese_pizza.jpg'],
    ['Alitas BBQ 12 piezas', 195, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Buffalo_wings.jpg/640px-Buffalo_wings.jpg'],
    ['Pasta Alfredo con pollo', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Fettuccine_Alfredo.jpg/640px-Fettuccine_Alfredo.jpg'],
    ['Lasaña tradicional porción', 165, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Lasagna.jpg/640px-Lasagna.jpg'],
    ['Pan de ajo con queso', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Garlic_bread.jpg/640px-Garlic_bread.jpg'],
    ['Refresco 600ml individual', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Coca-Cola_bottle.jpg/640px-Coca-Cola_bottle.jpg'],
  ],

  taqueria: [
    ['Taco de pastor con piña', 18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Tacos_al_pastor.jpg/640px-Tacos_al_pastor.jpg'],
    ['Taco de bistec con cebolla', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Tacos_de_bistec.jpg/640px-Tacos_de_bistec.jpg'],
    ['Taco de carnitas surtido', 20, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Carnitas_tacos.jpg/640px-Carnitas_tacos.jpg'],
    ['Quesadilla con flor de calabaza', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Quesadilla.jpg/640px-Quesadilla.jpg'],
    ['Gringa de pastor', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Gringa_pastor.jpg/640px-Gringa_pastor.jpg'],
    ['Volcán de bistec', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Volcan_taco.jpg/640px-Volcan_taco.jpg'],
    ['Mulita de pastor', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Mulita.jpg/640px-Mulita.jpg'],
    ['Consomé de res tazón', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Beef_consomme.jpg/640px-Beef_consomme.jpg'],
    ['Agua de jamaica jarra', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Hibiscus_tea.jpg/640px-Hibiscus_tea.jpg'],
    ['Refresco 600ml', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Coca-Cola_bottle.jpg/640px-Coca-Cola_bottle.jpg'],
  ],

  heladeria: [
    ['Bola helado vainilla', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Vanilla_ice_cream.jpg/640px-Vanilla_ice_cream.jpg'],
    ['Bola helado chocolate', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Chocolate_ice_cream.jpg/640px-Chocolate_ice_cream.jpg'],
    ['Banana split clásica', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Banana_split.jpg/640px-Banana_split.jpg'],
    ['Malteada de fresa grande', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Strawberry_milkshake.jpg/640px-Strawberry_milkshake.jpg'],
    ['Nieve de limón vaso', 32, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Lemon_sorbet.jpg/640px-Lemon_sorbet.jpg'],
    ['Paleta de fresa con crema', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Strawberry_popsicle.jpg/640px-Strawberry_popsicle.jpg'],
    ['Sundae caramelo con nuez', 78, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Caramel_sundae.jpg/640px-Caramel_sundae.jpg'],
    ['Cono helado doble', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Ice_cream_cone.jpg/640px-Ice_cream_cone.jpg'],
    ['Esquimal cubierto de chocolate', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Eskimo_pie.jpg/640px-Eskimo_pie.jpg'],
    ['Helado de cookies and cream litro', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Cookies_and_cream.jpg/640px-Cookies_and_cream.jpg'],
  ],

  pasteleria: [
    ['Pastel de chocolate 8 pers', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Chocolate_cake.jpg/640px-Chocolate_cake.jpg'],
    ['Pastel tres leches 10 pers', 485, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Tres_leches_cake.jpg/640px-Tres_leches_cake.jpg'],
    ['Cheesecake de zarzamora rebanada', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cheesecake.jpg/640px-Cheesecake.jpg'],
    ['Red velvet cuadrado', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Red_velvet_cake.jpg/640px-Red_velvet_cake.jpg'],
    ['Tiramisú porción individual', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tiramisu.jpg/640px-Tiramisu.jpg'],
    ['Cupcake de vainilla unidad', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Vanilla_cupcake.jpg/640px-Vanilla_cupcake.jpg'],
    ['Macarrones franceses caja 6', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Macarons.jpg/640px-Macarons.jpg'],
    ['Pay de limón 8 pers', 320, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Lemon_meringue_pie.jpg/640px-Lemon_meringue_pie.jpg'],
    ['Brazo de gitano relleno', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Swiss_roll.jpg/640px-Swiss_roll.jpg'],
    ['Galletas decoradas docena', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Decorated_cookies.jpg/640px-Decorated_cookies.jpg'],
  ],

  jugos_naturales: [
    ['Jugo de naranja natural 500ml', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Orange_juice_1.jpg/640px-Orange_juice_1.jpg'],
    ['Jugo verde detox 500ml', 50, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Green_juice.jpg/640px-Green_juice.jpg'],
    ['Licuado de plátano con avena', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Banana_smoothie.jpg/640px-Banana_smoothie.jpg'],
    ['Jugo de zanahoria con naranja', 40, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Carrot_juice.jpg/640px-Carrot_juice.jpg'],
    ['Smoothie de fresa con yogurt', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Strawberry_smoothie.jpg/640px-Strawberry_smoothie.jpg'],
    ['Agua de jamaica natural', 25, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Hibiscus_tea.jpg/640px-Hibiscus_tea.jpg'],
    ['Jugo de toronja fresco', 40, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Grapefruit_juice.jpg/640px-Grapefruit_juice.jpg'],
    ['Licuado proteico chocolate', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Protein_shake.jpg/640px-Protein_shake.jpg'],
    ['Jugo de piña con apio', 42, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Pineapple_juice.jpg/640px-Pineapple_juice.jpg'],
    ['Bowl de fruta con granola', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Fruit_bowl.jpg/640px-Fruit_bowl.jpg'],
  ],

  jugos_frescos: [
    ['Jugo prensado naranja+jengibre', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Cold_pressed_juice.jpg/640px-Cold_pressed_juice.jpg'],
    ['Jugo verde col rizada+manzana', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Green_juice.jpg/640px-Green_juice.jpg'],
    ['Shot de jengibre con limón', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Ginger_shot.jpg/640px-Ginger_shot.jpg'],
    ['Agua de pepino con menta', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Cucumber_water.jpg/640px-Cucumber_water.jpg'],
    ['Infusión de hierbas detox', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Herbal_tea.jpg/640px-Herbal_tea.jpg'],
    ['Kombucha sabor frutos rojos', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Kombucha.jpg/640px-Kombucha.jpg'],
    ['Smoothie açaí con frutos rojos', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Acai_bowl.jpg/640px-Acai_bowl.jpg'],
    ['Agua de coco natural 500ml', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Coconut_water.jpg/640px-Coconut_water.jpg'],
    ['Pack 6 jugos detox 24h', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Juice_cleanse.jpg/640px-Juice_cleanse.jpg'],
    ['Leche de almendras casera', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Almond_milk.jpg/640px-Almond_milk.jpg'],
  ],

  marisqueria: [
    ['Coctel de camarón mediano', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Shrimp_cocktail.jpg/640px-Shrimp_cocktail.jpg'],
    ['Ceviche de pescado tostada', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Ceviche.jpg/640px-Ceviche.jpg'],
    ['Aguachile de camarón', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Aguachile.jpg/640px-Aguachile.jpg'],
    ['Camarones al ajillo orden', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Garlic_shrimp.jpg/640px-Garlic_shrimp.jpg'],
    ['Pulpo a las brasas', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Grilled_octopus.jpg/640px-Grilled_octopus.jpg'],
    ['Mojarra frita entera', 195, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Fried_tilapia.jpg/640px-Fried_tilapia.jpg'],
    ['Filete de pescado empapelado', 245, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Fish_fillet.jpg/640px-Fish_fillet.jpg'],
    ['Caldo de mariscos tazón', 165, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Seafood_soup.jpg/640px-Seafood_soup.jpg'],
    ['Tostada de atún fresco', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Tuna_tostada.jpg/640px-Tuna_tostada.jpg'],
    ['Ostiones frescos media docena', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Oysters.jpg/640px-Oysters.jpg'],
  ],

  sushi: [
    ['Roll California 8 piezas', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/California_roll.jpg/640px-California_roll.jpg'],
    ['Roll Philadelphia 8 piezas', 165, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Philadelphia_roll.jpg/640px-Philadelphia_roll.jpg'],
    ['Spicy tuna roll 8 piezas', 175, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Spicy_tuna_roll.jpg/640px-Spicy_tuna_roll.jpg'],
    ['Sashimi salmón 6 piezas', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Salmon_sashimi.jpg/640px-Salmon_sashimi.jpg'],
    ['Nigiri atún 4 piezas', 165, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Tuna_nigiri.jpg/640px-Tuna_nigiri.jpg'],
    ['Tempura camarón orden', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Shrimp_tempura.jpg/640px-Shrimp_tempura.jpg'],
    ['Combo sushi 24 piezas', 385, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Sushi_combo.jpg/640px-Sushi_combo.jpg'],
    ['Sopa miso tradicional', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Miso_soup.jpg/640px-Miso_soup.jpg'],
    ['Edamame al vapor', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Edamame.jpg/640px-Edamame.jpg'],
    ['Té verde caliente', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Green_tea.jpg/640px-Green_tea.jpg'],
  ],

  hamburguesas: [
    ['Hamburguesa sencilla queso', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/RedDot_Burger.jpg/640px-RedDot_Burger.jpg'],
    ['Hamburguesa doble bacon', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Cheeseburger.jpg/640px-Cheeseburger.jpg'],
    ['Hamburguesa BBQ con piña', 135, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/BBQ_burger.jpg/640px-BBQ_burger.jpg'],
    ['Papas a la francesa grandes', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/French_fries.jpg/640px-French_fries.jpg'],
    ['Papas gajo con dip', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Potato_wedges.jpg/640px-Potato_wedges.jpg'],
    ['Aros de cebolla orden', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Onion_rings.jpg/640px-Onion_rings.jpg'],
    ['Malteada chocolate grande', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Chocolate_milkshake.jpg/640px-Chocolate_milkshake.jpg'],
    ['Hot dog jumbo con tocino', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Hot_dog_with_mustard.jpg/640px-Hot_dog_with_mustard.jpg'],
    ['Boneless BBQ orden', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Buffalo_wings.jpg/640px-Buffalo_wings.jpg'],
    ['Refresco grande con refill', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Coca-Cola_bottle.jpg/640px-Coca-Cola_bottle.jpg'],
  ],

  fruteria: [
    ['Plátano Tabasco kg', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/640px-Banana-Single.jpg'],
    ['Manzana roja kg', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/640px-Red_Apple.jpg'],
    ['Aguacate Hass kg', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Avocado_Hass_-_single_and_halved.jpg/640px-Avocado_Hass_-_single_and_halved.jpg'],
    ['Jitomate saladet kg', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/640px-Tomato_je.jpg'],
    ['Cebolla blanca kg', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Onion_white_cross_section.jpg/640px-Onion_white_cross_section.jpg'],
    ['Limón sin semilla kg', 42, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Lime-Whole-Split.jpg/640px-Lime-Whole-Split.jpg'],
    ['Papaya maradol kg', 32, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Carica_papaya_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-029.jpg/640px-Carica_papaya_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-029.jpg'],
    ['Sandía sin semilla kg', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Watermelons.jpg/640px-Watermelons.jpg'],
    ['Naranja Valencia kg', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Orange-Fruit-Pieces.jpg/640px-Orange-Fruit-Pieces.jpg'],
    ['Mango Ataulfo kg', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Mango_and_cross_section_edit1.jpg/640px-Mango_and_cross_section_edit1.jpg'],
  ],

  carniceria: [
    ['Bistec de res por kilo', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Beef_steak.jpg/640px-Beef_steak.jpg'],
    ['Arrachera marinada por kilo', 260, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Carne_asada.jpg/640px-Carne_asada.jpg'],
    ['Costilla de res por kilo', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Beef_rib.jpg/640px-Beef_rib.jpg'],
    ['Pechuga de pollo por kilo', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Chicken_breasts.jpg/640px-Chicken_breasts.jpg'],
    ['Pierna de pollo por kilo', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Chicken_drumstick.jpg/640px-Chicken_drumstick.jpg'],
    ['Carne molida especial kg', 160, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Ground_beef.jpg/640px-Ground_beef.jpg'],
    ['Chuleta de cerdo por kilo', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Pork_chop.jpg/640px-Pork_chop.jpg'],
    ['Chorizo argentino por kilo', 130, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Chorizo_argentino.jpg/640px-Chorizo_argentino.jpg'],
    ['Milanesa de res por kilo', 200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Milanesa_de_carne.jpg/640px-Milanesa_de_carne.jpg'],
    ['Tocino ahumado 200g', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Bacon.jpg/640px-Bacon.jpg'],
  ],

  polleria: [
    ['Pollo entero fresco kg', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Whole_chicken.jpg/640px-Whole_chicken.jpg'],
    ['Pechuga con hueso kg', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Chicken_breasts.jpg/640px-Chicken_breasts.jpg'],
    ['Pechuga sin hueso kg', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Boneless_chicken.jpg/640px-Boneless_chicken.jpg'],
    ['Muslo de pollo kg', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Chicken_thigh.jpg/640px-Chicken_thigh.jpg'],
    ['Alitas frescas kg', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Chicken_wing.jpg/640px-Chicken_wing.jpg'],
    ['Pierna y muslo kg', 78, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Chicken_drumstick.jpg/640px-Chicken_drumstick.jpg'],
    ['Pollo rostizado entero', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Rotisserie_chicken.jpg/640px-Rotisserie_chicken.jpg'],
    ['Milanesa de pollo kg', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Chicken_milanese.jpg/640px-Chicken_milanese.jpg'],
    ['Huevo blanco docena', 42, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Eggs_carton.jpg/640px-Eggs_carton.jpg'],
    ['Nuggets de pollo kg', 110, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Chicken_nuggets.jpg/640px-Chicken_nuggets.jpg'],
  ],

  tortilleria: [
    ['Tortilla de maíz kg', 22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Tortilla_de_ma%C3%ADz.jpg/640px-Tortilla_de_ma%C3%ADz.jpg'],
    ['Tortilla de harina paquete 10', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Flour_tortillas.jpg/640px-Flour_tortillas.jpg'],
    ['Tortilla de nopal kg', 38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Nopal_tortillas.jpg/640px-Nopal_tortillas.jpg'],
    ['Tortilla integral kg', 32, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Whole_wheat_tortilla.jpg/640px-Whole_wheat_tortilla.jpg'],
    ['Totopos bolsa 200g', 28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Tortilla_chips.jpg/640px-Tortilla_chips.jpg'],
    ['Tostadas paquete 12 piezas', 18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Tostada.jpg/640px-Tostada.jpg'],
    ['Masa para tortilla kg', 14, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Masa_dough.jpg/640px-Masa_dough.jpg'],
    ['Tortilla azul kg', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Blue_corn_tortilla.jpg/640px-Blue_corn_tortilla.jpg'],
    ['Tamal verde unidad', 18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Tamales_verdes.jpg/640px-Tamales_verdes.jpg'],
    ['Atole de masa vaso', 25, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Atole.jpg/640px-Atole.jpg'],
  ],

  ropa: [
    ['Playera básica de algodón', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Black_t-shirt.jpg/640px-Black_t-shirt.jpg'],
    ['Jeans corte recto azul', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Blue_jeans.jpg/640px-Blue_jeans.jpg'],
    ['Camisa de vestir blanca', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/White_shirt.jpg/640px-White_shirt.jpg'],
    ['Vestido casual floreado', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Floral_dress.jpg/640px-Floral_dress.jpg'],
    ['Sudadera con capucha', 450, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Hoodie.jpg/640px-Hoodie.jpg'],
    ['Chamarra de mezclilla', 680, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Denim_jacket.jpg/640px-Denim_jacket.jpg'],
    ['Falda corta de mezclilla', 320, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Denim_skirt.jpg/640px-Denim_skirt.jpg'],
    ['Suéter tejido cuello redondo', 420, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Knit_sweater.jpg/640px-Knit_sweater.jpg'],
    ['Pantalón de vestir negro', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Black_dress_pants.jpg/640px-Black_dress_pants.jpg'],
    ['Calcetines pack 3 pares', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Socks.jpg/640px-Socks.jpg'],
  ],

  zapateria: [
    ['Tenis deportivos Nike', 1485, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Nike_sneakers.jpg/640px-Nike_sneakers.jpg'],
    ['Tenis Converse Chuck Taylor', 985, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Converse_All_Star.jpg/640px-Converse_All_Star.jpg'],
    ['Sandalia mujer cuero', 485, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Womens_sandals.jpg/640px-Womens_sandals.jpg'],
    ['Zapato escolar negro', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/School_shoes.jpg/640px-School_shoes.jpg'],
    ['Bota industrial casquillo', 880, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Safety_boots.jpg/640px-Safety_boots.jpg'],
    ['Mocasines de vestir', 685, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Brown_loafers.jpg/640px-Brown_loafers.jpg'],
    ['Huarache artesanal', 280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Huaraches.jpg/640px-Huaraches.jpg'],
    ['Pantufla peluche unisex', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Slippers.jpg/640px-Slippers.jpg'],
    ['Crema betún negra lata', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Shoe_polish.jpg/640px-Shoe_polish.jpg'],
    ['Plantilla ortopédica par', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Insoles.jpg/640px-Insoles.jpg'],
  ],

  electronica: [
    ['Audífonos Bluetooth inalámbricos', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Bluetooth_earbuds.jpg/640px-Bluetooth_earbuds.jpg'],
    ['Cargador USB-C carga rápida', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/USB-C_charger.jpg/640px-USB-C_charger.jpg'],
    ['Bocina Bluetooth portátil', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Bluetooth_speaker.jpg/640px-Bluetooth_speaker.jpg'],
    ['Smartwatch fitness tracker', 1280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Smartwatch.jpg/640px-Smartwatch.jpg'],
    ['Power bank 10000mAh', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Power_bank.jpg/640px-Power_bank.jpg'],
    ['Memoria USB 64GB', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/USB_flash_drive.jpg/640px-USB_flash_drive.jpg'],
    ['Cable HDMI 4K 2 metros', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/HDMI_cable.jpg/640px-HDMI_cable.jpg'],
    ['Mouse inalámbrico ergonómico', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Wireless_mouse.jpg/640px-Wireless_mouse.jpg'],
    ['Teclado mecánico RGB', 880, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Mechanical_keyboard.jpg/640px-Mechanical_keyboard.jpg'],
    ['Funda silicón celular', 145, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Phone_case.jpg/640px-Phone_case.jpg'],
  ],

  papeleria: [
    ['Cuaderno profesional 100 hojas', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Spiral_notebook.jpg/640px-Spiral_notebook.jpg'],
    ['Bolígrafo BIC azul', 8, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Bic_Cristal_pen.jpg/640px-Bic_Cristal_pen.jpg'],
    ['Lápiz Mirado HB caja 12', 65, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/HB_pencils.jpg/640px-HB_pencils.jpg'],
    ['Borrador blanco grande', 12, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/White_eraser.jpg/640px-White_eraser.jpg'],
    ['Tijeras escolares', 35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/School_scissors.jpg/640px-School_scissors.jpg'],
    ['Pegamento Resistol 240ml', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/White_glue.jpg/640px-White_glue.jpg'],
    ['Cartulina fluorescente', 18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Color_cardstock.jpg/640px-Color_cardstock.jpg'],
    ['Marcadores Sharpie set 8', 185, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Sharpie_markers.jpg/640px-Sharpie_markers.jpg'],
    ['Carpeta tres argollas blanca', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Three_ring_binder.jpg/640px-Three_ring_binder.jpg'],
    ['Engrapadora con grapas', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Stapler.jpg/640px-Stapler.jpg'],
  ],

  joyeria: [
    ['Anillo de oro 14k liso', 4500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Gold_wedding_ring.jpg/640px-Gold_wedding_ring.jpg'],
    ['Cadena de plata 925 50cm', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Silver_chain.jpg/640px-Silver_chain.jpg'],
    ['Aretes de plata con circonia', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Silver_earrings.jpg/640px-Silver_earrings.jpg'],
    ['Pulsera de oro 14k tejido', 3200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Gold_bracelet.jpg/640px-Gold_bracelet.jpg'],
    ['Collar con dije corazón oro', 5800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Gold_necklace.jpg/640px-Gold_necklace.jpg'],
    ['Reloj de pulso acero inoxidable', 1800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Wristwatch.jpg/640px-Wristwatch.jpg'],
    ['Anillo compromiso diamante', 18500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Diamond_ring.jpg/640px-Diamond_ring.jpg'],
    ['Esclava de plata grabada', 650, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Silver_engraved_bracelet.jpg/640px-Silver_engraved_bracelet.jpg'],
    ['Medalla religiosa oro', 2200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Religious_medal.jpg/640px-Religious_medal.jpg'],
    ['Aretes argolla oro', 1450, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Gold_hoop_earrings.jpg/640px-Gold_hoop_earrings.jpg'],
  ],

  floreria: [
    ['Ramo de 12 rosas rojas', 380, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Red_roses_bouquet.jpg/640px-Red_roses_bouquet.jpg'],
    ['Ramo de tulipanes mixtos', 285, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tulips_bouquet.jpg/640px-Tulips_bouquet.jpg'],
    ['Centro de mesa floral', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Floral_centerpiece.jpg/640px-Floral_centerpiece.jpg'],
    ['Arreglo de girasoles', 320, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Sunflower_arrangement.jpg/640px-Sunflower_arrangement.jpg'],
    ['Bouquet de novia', 1280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Bridal_bouquet.jpg/640px-Bridal_bouquet.jpg'],
    ['Corona fúnebre', 950, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Funeral_wreath.jpg/640px-Funeral_wreath.jpg'],
    ['Maceta con orquídea', 480, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Orchid_pot.jpg/640px-Orchid_pot.jpg'],
    ['Suculenta decorativa pequeña', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Succulent.jpg/640px-Succulent.jpg'],
    ['Caja de chocolates con flores', 580, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Chocolate_flowers_box.jpg/640px-Chocolate_flowers_box.jpg'],
    ['Globo metálico con flores', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Mylar_balloon.jpg/640px-Mylar_balloon.jpg'],
  ],

  lavanderia: [
    ['Lavado y secado por carga', 75, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Washing_machine.jpg/640px-Washing_machine.jpg'],
    ['Lavado de edredón matrimonial', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Comforter.jpg/640px-Comforter.jpg'],
    ['Planchado de camisa', 25, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Ironing_shirt.jpg/640px-Ironing_shirt.jpg'],
    ['Tintorería de traje completo', 220, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Dry_cleaning.jpg/640px-Dry_cleaning.jpg'],
    ['Lavado de cortinas metro', 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Curtains.jpg/640px-Curtains.jpg'],
    ['Lavado a mano delicado', 95, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Hand_washing.jpg/640px-Hand_washing.jpg'],
    ['Servicio express 2 horas', 150, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Laundry_basket.jpg/640px-Laundry_basket.jpg'],
    ['Lavado de tenis deportivos', 85, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Sneakers.jpg/640px-Sneakers.jpg'],
    ['Lavado de tapetes', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Carpet_cleaning.jpg/640px-Carpet_cleaning.jpg'],
    ['Quitamanchas profesional', 45, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Stain_removal.jpg/640px-Stain_removal.jpg'],
  ],

  muebleria: [
    ['Sala 3 piezas tela gris', 12500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Sofa_set.jpg/640px-Sofa_set.jpg'],
    ['Comedor 6 sillas madera', 8500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Dining_table_set.jpg/640px-Dining_table_set.jpg'],
    ['Cama matrimonial con base', 5800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Bed_frame.jpg/640px-Bed_frame.jpg'],
    ['Colchón ortopédico individual', 3800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mattress.jpg/640px-Mattress.jpg'],
    ['Escritorio oficina madera', 2280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Office_desk.jpg/640px-Office_desk.jpg'],
    ['Silla ejecutiva ergonómica', 1880, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Office_chair.jpg/640px-Office_chair.jpg'],
    ['Librero 5 entrepaños', 1685, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Bookshelf.jpg/640px-Bookshelf.jpg'],
    ['Mesa de centro vidrio', 1280, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Coffee_table.jpg/640px-Coffee_table.jpg'],
    ['Lámpara de pie minimalista', 685, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Floor_lamp.jpg/640px-Floor_lamp.jpg'],
    ['Espejo de pared decorativo', 880, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Wall_mirror.jpg/640px-Wall_mirror.jpg'],
  ],

  hotel: [
    ['Noche en habitación sencilla', 850, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Hotel_room_single.jpg/640px-Hotel_room_single.jpg'],
    ['Noche en habitación doble', 1200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Hotel_room_double.jpg/640px-Hotel_room_double.jpg'],
    ['Suite ejecutiva', 2500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Hotel_suite.jpg/640px-Hotel_suite.jpg'],
    ['Desayuno buffet incluido', 180, 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Hotel_breakfast.jpg/640px-Hotel_breakfast.jpg'],
    ['Servicio a cuarto', 250, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Room_service.jpg/640px-Room_service.jpg'],
    ['Estacionamiento por noche', 150, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Hotel_parking.jpg/640px-Hotel_parking.jpg'],
    ['Late check-out', 200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Hotel_reception.jpg/640px-Hotel_reception.jpg'],
    ['Lavandería express', 120, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Laundry_service.jpg/640px-Laundry_service.jpg'],
    ['Acceso a spa', 350, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Hotel_spa.jpg/640px-Hotel_spa.jpg'],
    ['Cama extra en habitación', 300, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Extra_bed.jpg/640px-Extra_bed.jpg'],
  ],

  taller_mecanico: [
    ['Cambio de aceite y filtro', 650, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Oil_change_garage.jpg/640px-Oil_change_garage.jpg'],
    ['Afinación mayor', 1800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Car_engine_tune_up.jpg/640px-Car_engine_tune_up.jpg'],
    ['Cambio de balatas', 1200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Brake_pads.jpg/640px-Brake_pads.jpg'],
    ['Alineación y balanceo', 450, 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Wheel_alignment.jpg/640px-Wheel_alignment.jpg'],
    ['Diagnóstico computarizado', 350, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/OBD_scanner.jpg/640px-OBD_scanner.jpg'],
    ['Cambio de batería', 2200, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Car_battery.jpg/640px-Car_battery.jpg'],
    ['Reparación suspensión', 3500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Car_suspension.jpg/640px-Car_suspension.jpg'],
    ['Cambio de clutch', 4800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Clutch_plate.jpg/640px-Clutch_plate.jpg'],
    ['Hojalatería y pintura', 5500, 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Auto_body_repair.jpg/640px-Auto_body_repair.jpg'],
    ['Cambio de llantas par', 2800, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Car_tires.jpg/640px-Car_tires.jpg'],
  ],
};

// ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══ FILL ALL CURATED V10.39 — 360 productos coherentes ═══\n');
  const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));

  let totalUrlsChecked = 0, totalUrlsBad = 0;
  const CONCURRENCY = 12;

  for (const giroSlug of Object.keys(CURATED)) {
    const g = data.giros.find(x => x.slug === giroSlug);
    if (!g) { console.log('⚠️ '+giroSlug+' no existe en JSON, skip'); continue; }
    const items = CURATED[giroSlug];
    if (items.length !== 10) { console.log('⚠️ '+giroSlug+' tiene '+items.length+' items (esperado 10)'); }

    // Estrategia: usar loremflickr por keyword. HEAD-check para confirmar 2xx/3xx.
    const flickrUrls = items.map(([nombre]) => flickrUrl(nombre, giroSlug));
    const checks = [];
    for (let i = 0; i < flickrUrls.length; i += CONCURRENCY) {
      const batch = flickrUrls.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(u => headOk(u)));
      results.forEach((ok, j) => checks.push({ ok, idx: i+j }));
    }
    totalUrlsChecked += items.length;
    const badCount = checks.filter(c => !c.ok).length;
    totalUrlsBad += badCount;

    g.productos_plantilla = items.map(([nombre, precio, _wikUrl], i) => {
      const finalImg = checks[i].ok ? flickrUrls[i] : placehold(nombre, giroSlug);
      return { nombre, imagen: finalImg, precio, moneda: 'MXN', marca: null, source: 'curated_v2' };
    });

    console.log('  '+giroSlug.padEnd(20)+' → 10 productos · '+(items.length-badCount)+' flickr OK · '+badCount+' fallback placeholder');
  }

  data._meta.last_audit = new Date().toISOString();
  data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla||[]).length, 0);
  data._meta.curated_version = 'V10.39';
  fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));

  console.log('');
  console.log('═══ RESUMEN ═══');
  console.log('Total productos:', data._meta.products_total);
  console.log('URLs verificadas:', totalUrlsChecked);
  console.log('URLs OK (200):', totalUrlsChecked - totalUrlsBad);
  console.log('URLs fallback (404 → placehold):', totalUrlsBad);
  console.log('✅ Guardado en '+ECO_PATH);
})();
