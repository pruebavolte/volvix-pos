/* ============================================================
   VOLVIX · BRANDS CONFIG
   ----------------------------------------------------------------
   Cada marca = un objeto. El motor (motor.html) toma esto y
   renderiza la landing completa.

   Para agregar una marca nueva:
   1. Copia un objeto entero (ej. pareo) y dale nuevo slug
   2. Cambia paleta, fuentes, copy, imágenes
   3. Lista la marca nueva en BRANDS al final
   4. Visita motor.html?b=nuevo-slug
   ============================================================ */

const BRAND_PAREO = {
  slug: 'pareo',
  brand: 'Pareo',
  tagline: 'El sistema para zapaterías que sí cuentan cada par',
  giro: 'zapatería',
  giroPlural: 'zapaterías',
  vibe: 'editorial', // cream/burgundy refined

  palette: {
    bg:      '#F5EFE4',
    surface: '#FFFFFF',
    paper:   '#FAF6EC',
    ink:     '#100E0A',
    ink2:    '#2A2520',
    muted:   '#6B6359',
    line:    '#D9D1BD',
    accent:  '#7A1818',
    accent2: '#A82828',
  },
  fonts: {
    display: 'Bodoni Moda',
    body:    'Manrope',
    script:  'Italianno',
    mono:    'JetBrains Mono',
  },

  hero: {
    eyebrow: 'El sistema para zapaterías mexicanas · 2026',
    h1: 'Cada <em>par</em>.<br>Cada <em>talla</em>.<br>Contado.',
    deck: 'El punto de venta hecho para que en tu zapatería no se pierda un solo par. Inventario por talla, apartados con anticipo, devoluciones con foto, comisiones por vendedor.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver el lookbook',
    metaLine: '$0 inicial · sin tarjeta · setup en 5 min',
  },

  images: {
    hero: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&h=1600&fit=crop&q=85',
    heroAlt: 'Tenis modernos sobre fondo amarillo',
    showcase: [
      {url:'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=1200&h=900&fit=crop&q=80',tag:'Sneakers urbanos',size:'lg'},
      {url:'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=900&h=1200&fit=crop&q=80',tag:'Botas dama',size:'md'},
      {url:'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=900&h=1200&fit=crop&q=80',tag:'Sneakers blancos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=900&h=1200&fit=crop&q=80',tag:'Vestir caballero',size:'sm'},
      {url:'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=900&h=1200&fit=crop&q=80',tag:'Oxford clásico',size:'md'},
      {url:'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=900&h=1200&fit=crop&q=80',tag:'Pumps dama',size:'sm'},
      {url:'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1200&h=900&fit=crop&q=80',tag:'Casual moderno',size:'md'},
      {url:'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=900&h=1200&fit=crop&q=80',tag:'Detalle',size:'sm'},
      {url:'https://images.unsplash.com/photo-1571245840739-7e8d65116c8a?w=1200&h=900&fit=crop&q=80',tag:'Niños',size:'md'},
    ],
    context: [
      {url:'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=800&h=600&fit=crop&q=80', caption:'Stock por talla visible al instante'},
      {url:'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&h=600&fit=crop&q=80', caption:'Vendedor escanea y confirma'},
      {url:'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&h=600&fit=crop&q=80', caption:'Devolución con foto obligatoria'},
    ],
  },

  features: [
    {ico:'archive', h:'Stock por talla y color', d:'No solo "Nike Air"; "Nike Air negro talla 26 con 3 pares". Sabes qué tallas mueven, cuáles se quedan dormidas.'},
    {ico:'bookmark', h:'Apartados con anticipo', d:'Cliente aparta con $200, paga en 15 días. Notificación si pasa la fecha. Si no regresa, el par vuelve al stock solo.'},
    {ico:'percent', h:'Comisiones por vendedor', d:'Define el % por modelo o categoría. Se calculan solas al cierre. Cero peleas, cero cuentas a mano.'},
    {ico:'camera', h:'Devoluciones con foto', d:'El sistema obliga a fotografiar el par. Si está usado, alerta al gerente. Bloquea cambios después de 7 días.'},
    {ico:'barcode', h:'Etiquetas con código', d:'Genera etiquetas con código de barras desde el sistema. Imprime con cualquier térmica 58 o 80 mm.'},
    {ico:'truck', h:'Traspasos entre sucursales', d:'¿No tienes la talla? Búscala en otra sucursal. Traspaso con un toque, cliente notificado por WhatsApp.'},
  ],

  stats: [
    {v:'247',  l:'Pares en stock'},
    {v:'42',   l:'Pares vendidos hoy'},
    {v:'5',    l:'Min de setup', suffix:'min'},
    {v:'0',    l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text: 'Antes cerraba caja con calculadora y un cuaderno. <span class="hl">Las comisiones eran un drama cada quincena</span>. Con Pareo mi vendedor ve sus ventas en vivo y yo me voy a dormir tranquilo.',
    sig: 'Roberto M.',
    role: 'Zapatería en Apodaca, NL',
  },

  thefts: [
    {
      title: 'Pares que "desaparecen" en mermas',
      rob: 'El empleado mete pares a "mermas" o "regalo" sin justificar y se los lleva. En una zapatería promedio son 4 a 6 pares al mes — entre $1,500 y $3,000 perdidos.',
      fix: 'Cada par tiene su <strong>número de serie único</strong>. Si sale del inventario sin venta registrada, te llega notificación al WhatsApp. Auditoría automática cada turno.',
    },
    {
      title: '"Cambio de talla" con par usado',
      rob: 'Cliente compra unos tenis, los usa el fin de semana, los regresa diciendo "no me quedaron" y se lleva otros. Tú revendes los usados como nuevos sin saber.',
      fix: 'Devolución exige <strong>foto obligatoria del par y la etiqueta</strong> con timestamp. Si fueron usados, alerta al gerente. Bloquea cambios después de 7 días sin foto de etiqueta intacta.',
    },
    {
      title: 'Venta "por fuera" sin pasar por caja',
      rob: 'Vendedor le hace "precio especial" a un conocido, cobra en efectivo y se queda con todo. Nunca pasó por el sistema, tú nunca te enteras del par perdido.',
      fix: 'Comisiones se pagan <strong>solo sobre ventas registradas</strong>. Si no captura, no gana. Reporte diario: pares fuera de stock vs tickets emitidos.',
    },
  ],
};


const BRAND_COMANDERO = {
  slug: 'comandero',
  brand: 'Comandero',
  tagline: 'El POS hecho para que tu cocina nunca pare',
  giro: 'restaurante',
  giroPlural: 'restaurantes',
  vibe: 'vibrant',

  palette: {
    bg:      '#FFFCF0',
    surface: '#FFFFFF',
    paper:   '#FAF3DD',
    ink:     '#0A0908',
    ink2:    '#1F1D18',
    muted:   '#6B6963',
    line:    '#E8E2C8',
    accent:  '#F9C829',
    accent2: '#DC2626',
  },
  fonts: {
    display: 'Archivo Black',
    body:    'Inter',
    script:  'Caveat',
    mono:    'Space Mono',
  },

  hero: {
    eyebrow: 'Sistema POS para restaurantes mexicanos',
    h1: 'Sírvelo <em>caliente</em>.<br>Cobra <em>rápido</em>.',
    deck: 'El sistema que reemplaza los papelitos, los gritos y los platillos olvidados. Comandera digital, KDS, división de cuenta y propinas para que tu cocina no pare ni un segundo.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver cocina en vivo',
    metaLine: '$0 inicial · setup en 5 min · funciona offline',
  },

  images: {
    hero: 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=1200&h=1600&fit=crop&q=85',
    heroAlt: 'Tacos al pastor mexicanos',
    showcase: [
      {url:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=1200&h=900&fit=crop&q=80',tag:'Pizza artesanal',size:'lg'},
      {url:'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=900&h=1200&fit=crop&q=80',tag:'Burger gourmet',size:'md'},
      {url:'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=900&h=1200&fit=crop&q=80',tag:'Al pastor',size:'sm'},
      {url:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&h=1200&fit=crop&q=80',tag:'Mariscos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=900&h=1200&fit=crop&q=80',tag:'Bowl saludable',size:'md'},
      {url:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&h=1200&fit=crop&q=80',tag:'Ensalada fresca',size:'sm'},
      {url:'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1200&h=900&fit=crop&q=80',tag:'Desayuno',size:'md'},
      {url:'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=900&h=1200&fit=crop&q=80',tag:'Carne asada',size:'sm'},
      {url:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&h=900&fit=crop&q=80',tag:'Steak premium',size:'md'},
    ],
    context: [
      {url:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop&q=80', caption:'Mesera con tablet captura órdenes'},
      {url:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop&q=80', caption:'KDS muestra órdenes a cocina'},
      {url:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop&q=80', caption:'Pago con QR en la mesa'},
    ],
  },

  features: [
    {ico:'grid', h:'Plano de mesas visual', d:'Arrastra y suelta. La mesera ve qué mesa está libre, ocupada, esperando cuenta o disponible.'},
    {ico:'monitor', h:'Pantalla de cocina (KDS)', d:'La orden va directo a cocina. Sin papelitos, sin gritos, sin platillos olvidados.'},
    {ico:'split', h:'División de cuenta', d:'Por persona, por consumo, por mitades. Sin calculadora ni discusiones en la mesa.'},
    {ico:'edit', h:'Modificadores y notas', d:'"Sin cebolla", "término medio", combos. Todo configurable, todo se ve en cocina.'},
    {ico:'truck', h:'Reparto y delivery', d:'Pedidos de mesa, para llevar y delivery en el mismo sistema. Rappi y Uber Eats opcionales.'},
    {ico:'gift', h:'Propinas y cortesías', d:'Define cómo se reparten las propinas. Cortesías exigen autorización con PIN.'},
  ],

  stats: [
    {v:'18', l:'Min orden → mesa', suffix:'min'},
    {v:'100',l:'Comandas sin perderse', suffix:'%'},
    {v:'5',  l:'Min de setup', suffix:'min'},
    {v:'0',  l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text: 'Antes los sábados eran un infierno. <span class="hl">Cocina con cinco papelitos al mismo tiempo y la mesera gritando</span>. Con Comandero todo va a la pantalla. El sábado pasado servimos 92 mesas sin un error.',
    sig: 'Chef Roberto',
    role: 'Taquería en San Pedro · Monterrey, NL',
  },

  thefts: [
    {
      title: 'Comanda fantasma',
      rob: 'Mesera no captura la orden, cocina la prepara igual, cliente paga en efectivo, mesera se queda con todo. En un restaurante de 30 mesas son $4,000 a $8,000 al mes mínimo.',
      fix: 'Cocina solo prepara <strong>lo que está en el KDS</strong>. Si no está en el sistema, no sale del calor. Cero excepciones. La regla la conoce todo el equipo desde el día 1.',
    },
    {
      title: 'Cancelaciones tras el cobro',
      rob: 'Mesera cobra al cliente, después "cancela" el ticket diciendo que se equivocó, y se queda con el dinero. Tú ves el ticket cancelado y no preguntas.',
      fix: 'Cancelar requiere <strong>PIN del gerente + razón escrita</strong>. Reporte semanal de cancelaciones por mesero. Si Pedro cancela 8 a la semana y María 1, sabes algo está raro.',
    },
    {
      title: 'Cortesías sin autorización',
      rob: '"Eran amigos de mi prima", "se quejó del platillo y le regalé el postre". Empleados regalan comida para hacer amigos. Tú pagas la materia prima.',
      fix: 'Cortesías exigen <strong>PIN del gerente + motivo + foto del cliente</strong>. Reporte mensual de cortesías por mesero. Patrones raros saltan solos.',
    },
  ],
};


const BRAND_NAVAJA = {
  slug: 'navaja',
  brand: 'Navaja',
  tagline: 'El sistema para barberías que sí cobran lo que cortan',
  giro: 'barbería',
  giroPlural: 'barberías',
  vibe: 'darkPremium',

  palette: {
    bg:      '#080706',
    surface: '#141210',
    paper:   '#1E1B17',
    ink:     '#F5F0E4',
    ink2:    '#D9D2BC',
    muted:   '#8A8377',
    line:    'rgba(201,162,76,.25)',
    accent:  '#C9A24C',
    accent2: '#8B1F1F',
  },
  fonts: {
    display: 'Oswald',
    body:    'Inter',
    script:  'Italianno',
    mono:    'JetBrains Mono',
  },

  hero: {
    eyebrow: 'El sistema para barberías mexicanas · 2026',
    h1: 'Cada <em>corte</em>,<br>cobrado.<br>Cada <em>propina</em>,<br>repartida.',
    deck: 'Navaja es el punto de venta hecho para barberías serias. Agenda por barbero, comisiones automáticas, propinas digitales y control de productos — para que nada se cobre por fuera.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver agenda en vivo',
    metaLine: '$0 inicial · setup en 5 min · 100% offline',
  },

  images: {
    hero: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&h=1600&fit=crop&q=85',
    heroAlt: 'Sillón de barbería clásica',
    showcase: [
      {url:'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&h=900&fit=crop&q=80',tag:'Corte clásico',size:'lg'},
      {url:'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=900&h=1200&fit=crop&q=80',tag:'En acción',size:'md'},
      {url:'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=900&h=1200&fit=crop&q=80',tag:'Barba',size:'sm'},
      {url:'https://images.unsplash.com/photo-1580618864180-f6d7d39b8ff6?w=900&h=1200&fit=crop&q=80',tag:'Herramientas',size:'sm'},
      {url:'https://images.unsplash.com/photo-1567894340315-735d7c361db0?w=900&h=1200&fit=crop&q=80',tag:'Estilo',size:'md'},
      {url:'https://images.unsplash.com/photo-1521490878406-d9bff63a8bda?w=900&h=1200&fit=crop&q=80',tag:'Servicio',size:'sm'},
      {url:'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=1200&h=900&fit=crop&q=80',tag:'Interior',size:'md'},
      {url:'https://images.unsplash.com/photo-1593702275687-f8b402bf1c14?w=900&h=1200&fit=crop&q=80',tag:'Maestro',size:'sm'},
      {url:'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=1200&h=900&fit=crop&q=80',tag:'Atmósfera',size:'md'},
    ],
    context: [
      {url:'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&h=600&fit=crop&q=80', caption:'Barbero marca cita iniciada'},
      {url:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=600&fit=crop&q=80', caption:'Sillón con cliente activo'},
      {url:'https://images.unsplash.com/photo-1580618864180-f6d7d39b8ff6?w=800&h=600&fit=crop&q=80', caption:'Inventario de productos al cierre'},
    ],
  },

  features: [
    {ico:'calendar', h:'Agenda por barbero', d:'Cada barbero con su calendario. Cliente reserva por WhatsApp, sin doble cita ni "se me olvidó".'},
    {ico:'message', h:'Reservas por WhatsApp', d:'Bot conectado a WhatsApp. Cliente escribe "quiero corte", bot le muestra opciones y reserva.'},
    {ico:'percent', h:'Comisiones por servicio', d:'Define el % por servicio Y por barbero. Senior gana 60%, junior 40%. Se calcula solo al corte.'},
    {ico:'package', h:'Inventario de productos', d:'Pomadas, ceras, shampoos. Cada vez que se vende uno, baja del stock. Sabes qué se mueve.'},
    {ico:'star', h:'Historial del cliente', d:'Qué corte le hicimos, qué color, qué fórmula. La próxima vez sale igual sin que el cliente lo recuerde.'},
    {ico:'gift', h:'Paquetes prepagados', d:'Cliente paga 5 cortes con descuento. Se descuentan automático cuando viene. Lealtad real.'},
  ],

  stats: [
    {v:'247', l:'Cortes este mes'},
    {v:'92',  l:'Citas que llegaron', suffix:'%'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text: 'Antes los lunes eran <span class="hl">drama de comisiones</span>. Quién atendió a quién, qué cobré yo, qué cobró Diego. Con Navaja, cada quien ve sus cortes en su pantalla. Nunca más pizarrita de gises.',
    sig: 'Roberto Méndez',
    role: 'Barbería en San Pedro Garza García · NL',
  },

  thefts: [
    {
      title: 'Cliente paga directo al barbero',
      rob: 'Cliente conocido le paga al barbero en la mano. No pasa por caja. Tú no te enteras. En barberías chicas: $1,500 a $4,000 al mes por barbero.',
      fix: 'Comisiones se pagan <strong>solo sobre tickets registrados</strong>. Si no captura, gana 0%. Reporte: corte registrado vs cita confirmada.',
    },
    {
      title: 'Productos que "se gastan"',
      rob: 'Cera, pomada, gel premium. El barbero "se llevó la muestra" o "se la regalé al cliente". En realidad la vendió afuera por la mitad.',
      fix: 'Inventario obligatorio <strong>al inicio y al cierre del turno</strong>. Si falta producto, alguien firma. Comparativo semanal por barbero.',
    },
    {
      title: 'Citas que sí se atendieron, "no llegaron"',
      rob: 'El cliente llegó, le cortaron, pero el barbero dice "no llegó" porque ya cobró en efectivo. La cita aparece como ausente.',
      fix: 'Cita confirmada se marca <strong>al iniciar el servicio con foto del cliente en el sillón</strong>. Si se inició, se cobró.',
    },
  ],
};


const BRAND_RECETA = {
  slug: 'receta',
  brand: 'Receta',
  tagline: 'El sistema para farmacias que rastrea cada lote y cada caducidad',
  giro: 'farmacia',
  giroPlural: 'farmacias',
  vibe: 'clinical',

  palette: {
    bg:      '#F8FAFC',
    surface: '#FFFFFF',
    paper:   '#F1F5F9',
    ink:     '#0F172A',
    ink2:    '#1E293B',
    muted:   '#64748B',
    line:    '#E2E8F0',
    accent:  '#1D4ED8',
    accent2: '#0EA5E9',
  },
  fonts: {
    display: 'Plus Jakarta Sans',
    body:    'Inter',
    script:  'Caveat',
    mono:    'JetBrains Mono',
  },

  hero: {
    eyebrow: 'Sistema POS para farmacias mexicanas',
    h1: 'Cada <em>lote</em>.<br>Cada <em>caducidad</em>.<br>Bajo control.',
    deck: 'Receta es el punto de venta hecho para farmacias. Control por lote, alertas de caducidad, recetas digitales y sustitutos sugeridos. Nada se vence en tu anaquel sin que lo sepas.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver demo',
    metaLine: '$0 inicial · setup en 5 min · COFEPRIS-friendly',
  },

  images: {
    hero: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=1200&h=1600&fit=crop&q=85',
    heroAlt: 'Estantes de farmacia',
    showcase: [
      {url:'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1200&h=900&fit=crop&q=80',tag:'Interior farmacia',size:'lg'},
      {url:'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=900&h=1200&fit=crop&q=80',tag:'Medicamentos',size:'md'},
      {url:'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=900&h=1200&fit=crop&q=80',tag:'Frascos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=900&h=1200&fit=crop&q=80',tag:'Equipo médico',size:'sm'},
      {url:'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=900&h=1200&fit=crop&q=80',tag:'Anaquel',size:'md'},
      {url:'https://images.unsplash.com/photo-1583912086096-8c60d75a53f9?w=900&h=1200&fit=crop&q=80',tag:'Despacho',size:'sm'},
      {url:'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&h=900&fit=crop&q=80',tag:'Mostrador',size:'md'},
      {url:'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=900&h=1200&fit=crop&q=80',tag:'Lab',size:'sm'},
      {url:'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=1200&h=900&fit=crop&q=80',tag:'Inventario',size:'md'},
    ],
    context: [
      {url:'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&h=600&fit=crop&q=80', caption:'Despachador verifica receta'},
      {url:'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=800&h=600&fit=crop&q=80', caption:'Sistema alerta caducidad a 60 días'},
      {url:'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&h=600&fit=crop&q=80', caption:'Sustituto genérico sugerido'},
    ],
  },

  features: [
    {ico:'archive', h:'Control por lote', d:'Cada medicamento con su lote, caducidad y proveedor. Trazabilidad completa para auditorías de COFEPRIS.'},
    {ico:'bell', h:'Alerta de caducidad', d:'Avisa 90, 60 y 30 días antes. Mueve a promoción automáticamente. Cero pérdidas por vencimiento.'},
    {ico:'edit', h:'Recetas digitales', d:'Guarda la receta con foto. Buscas por paciente cuando regrese. Cumple obligaciones de medicamentos controlados.'},
    {ico:'shuffle', h:'Sustitutos sugeridos', d:'¿Sin el medicamento? El sistema sugiere su equivalente genérico al instante.'},
    {ico:'barcode', h:'Lectura de código', d:'Escanea el código del medicamento. Cobro inmediato. Compatible con scanners USB y Bluetooth.'},
    {ico:'shield', h:'Medicamentos controlados', d:'Libro de control automático. Reportes para auditorías. Sin papelería manual.'},
  ],

  stats: [
    {v:'247', l:'SKU activos'},
    {v:'14',  l:'Por caducar (60d)'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text: 'Tenía $18,000 en medicamentos vencidos por no llevar el control. <span class="hl">El primer mes con Receta detecté 14 medicamentos próximos a vencer</span> y los puse en promoción. Recuperé $9,400 que iban a la basura.',
    sig: 'Lic. Andrea',
    role: 'Farmacia en Escobedo, NL',
  },

  thefts: [
    {
      title: 'Medicamentos vencidos sin alerta',
      rob: 'Productos caros vencen en el anaquel sin que nadie note. Una farmacia chica pierde $8,000 a $15,000 al año en vencimientos invisibles.',
      fix: '<strong>Alerta automática 90 / 60 / 30 días antes</strong> de caducidad. El sistema mueve a promoción solo. Cero pérdidas por descuido.',
    },
    {
      title: '"Mermas" sin justificar',
      rob: 'Empleado registra medicamento como "merma" o "se rompió" y se lo lleva. Sin trazabilidad por lote, no puedes probar nada.',
      fix: '<strong>Cada unidad rastreada por lote</strong>. Toda merma exige foto + autorización del gerente. Comparativo semanal: si suben las mermas de Juan, lo sabes.',
    },
    {
      title: 'Venta "por fuera" de mostrador',
      rob: 'Despachador cobra en efectivo, no registra la venta, se queda con el dinero. El stock baja "por arte de magia".',
      fix: 'Inventario auditado <strong>al cierre de cada turno</strong>. Diferencia stock físico vs sistema dispara alerta. Reporte por despachador.',
    },
  ],
};


const BRAND_TENDITO = {
  slug: 'tendito',
  brand: 'Tendito',
  tagline: 'La tiendita de la esquina, con tecnología',
  giro: 'abarrotes',
  giroPlural: 'tiendas de abarrotes',
  vibe: 'warmLocal',

  palette: {
    bg:      '#FEF3E2',
    surface: '#FFFFFF',
    paper:   '#FED7AA',
    ink:     '#7C2D12',
    ink2:    '#5C3815',
    muted:   '#92715C',
    line:    '#E7C9A5',
    accent:  '#C2410C',
    accent2: '#16A34A',
  },
  fonts: {
    display: 'Fraunces',
    body:    'Inter',
    script:  'Caveat',
    mono:    'JetBrains Mono',
  },

  hero: {
    eyebrow: 'El sistema para tiendas de abarrotes mexicanas',
    h1: 'Tu <em>tiendita</em>.<br>Más rápida.<br>Más <em>al día</em>.',
    deck: 'Tendito es el punto de venta hecho para abarrotes, fruterías y minisúpers mexicanos. Báscula, fiado, recargas, recibos por WhatsApp — pensado para la tienda de la esquina.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver demo',
    metaLine: '$0 inicial · funciona en cualquier impresora · gratis para tiendas chicas',
  },

  images: {
    hero: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=1600&fit=crop&q=85',
    heroAlt: 'Tienda de abarrotes mexicana',
    showcase: [
      {url:'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=1200&h=900&fit=crop&q=80',tag:'Mostrador',size:'lg'},
      {url:'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=900&h=1200&fit=crop&q=80',tag:'Estantes',size:'md'},
      {url:'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=900&h=1200&fit=crop&q=80',tag:'Productos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1542838686-37da4a9fd1b3?w=900&h=1200&fit=crop&q=80',tag:'Mercancía',size:'sm'},
      {url:'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=900&h=1200&fit=crop&q=80',tag:'Refrescos',size:'md'},
      {url:'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=900&h=1200&fit=crop&q=80',tag:'Tiendita',size:'sm'},
      {url:'https://images.unsplash.com/photo-1584006515920-c4ad8a738fd0?w=1200&h=900&fit=crop&q=80',tag:'Mercancía',size:'md'},
      {url:'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=1200&fit=crop&q=80',tag:'Local',size:'sm'},
      {url:'https://images.unsplash.com/photo-1584006515920-c4ad8a738fd0?w=1200&h=900&fit=crop&q=80',tag:'Anaquel',size:'md'},
    ],
    context: [
      {url:'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800&h=600&fit=crop&q=80', caption:'Doña cobra con báscula integrada'},
      {url:'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&h=600&fit=crop&q=80', caption:'Fiado registrado, recordatorio por WhatsApp'},
      {url:'https://images.unsplash.com/photo-1542838686-37da4a9fd1b3?w=800&h=600&fit=crop&q=80', caption:'Recargas de tiempo aire al instante'},
    ],
  },

  features: [
    {ico:'archive', h:'Báscula y peso', d:'Compatible con básculas estándar. Vende a granel sin teclear. El precio se calcula automático.'},
    {ico:'edit', h:'Fiado / pizarra digital', d:'Apunta el fiado por cliente. Recordatorios automáticos por WhatsApp. Adiós a la libreta.'},
    {ico:'phone', h:'Recargas y servicios', d:'Tiempo aire, pagos de luz, agua, gas. Comisiones para tu tienda desde el primer día.'},
    {ico:'barcode', h:'Códigos de barras', d:'Escanea y cobra. Compatible con cualquier lector USB o Bluetooth. Funciona con tu impresora actual.'},
    {ico:'message', h:'Recibo por WhatsApp', d:'El cliente recibe su ticket por WhatsApp. Sin imprimir papel, sin ticket que se pierde.'},
    {ico:'gift', h:'Programa de puntos', d:'Por cada $100 gastados, 1 punto. 100 puntos = $10 descuento. Lealtad real, sin tarjeta de plástico.'},
  ],

  stats: [
    {v:'230', l:'Tickets hoy'},
    {v:'48',  l:'Mil en ventas hoy', prefix:'$', suffix:'k'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text: 'Tengo 30 años con mi tiendita y nunca había visto algo tan fácil. <span class="hl">Mi nieto me lo configuró en 5 minutos</span>. Ahora cobro recargas de Telcel, fío con foto y mando recibos por WhatsApp. Mi tiendita en serio cambió.',
    sig: 'Doña Carmen',
    role: 'Abarrotes en la colonia · Apodaca, NL',
  },

  thefts: [
    {
      title: 'Caja con menos de lo cobrado',
      rob: 'Empleado cobra $200 al cliente, registra $150 en el sistema, se queda con $50. Sin conciliación diaria, no lo detectas hasta que faltan miles.',
      fix: '<strong>Corte de caja obligatorio al cierre</strong>. Diferencia entre cobrado y registrado dispara alerta. Reporte por empleado.',
    },
    {
      title: 'Fiados inventados que nunca cobran',
      rob: 'Empleado dice "fulano se llevó esto a fiado", pero fulano no existe o nunca pagó. La mercancía se la llevó el empleado.',
      fix: 'Fiados exigen <strong>foto del cliente + firma digital</strong>. Cliente recibe SMS confirmando el monto. Si no existe, no hay fiado.',
    },
    {
      title: 'Recargas vendidas afuera del sistema',
      rob: 'Empleado vende tiempo aire con su propio crédito y se queda la comisión. La tienda no se entera porque "no pasó por el sistema".',
      fix: 'Recargas se hacen <strong>desde el sistema con tu saldo</strong>. Sin sistema, no hay recarga. Comisiones registradas por turno.',
    },
  ],
};


// =============================================================
// REGISTRO DE TODAS LAS MARCAS
// =============================================================
const BRANDS = {
  pareo:     BRAND_PAREO,
  comandero: BRAND_COMANDERO,
  navaja:    BRAND_NAVAJA,
  receta:    BRAND_RECETA,
  tendito:   BRAND_TENDITO,
  // Próximas marcas (agregar config arriba y registrar aquí):
  // espuma:    BRAND_ESPUMA,    // cafetería
  // petalo:    BRAND_PETALO,    // florería
  // pata:      BRAND_PATA,      // veterinaria
  // refacciona:BRAND_REFACCIONA,// taller
  // repe:      BRAND_REPE,      // gimnasio
  // bloque:    BRAND_BLOQUE,    // papelería
  // burbuja:   BRAND_BURBUJA,   // lavandería
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BRANDS };
}
