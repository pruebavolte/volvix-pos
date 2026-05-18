/* ============================================================
   VOLVIX · BRANDS CONFIG (v2 — con liveDemo por giro)
   ============================================================ */

const BRAND_PAREO = {
  slug: 'pareo',
  brand: 'Pareo',
  tagline: 'El sistema para zapaterías que sí cuentan cada par',
  giro: 'zapatería',
  giroPlural: 'zapaterías',
  vibe: 'editorial',

  palette: {
    bg:'#F5EFE4', surface:'#FFFFFF', paper:'#FAF6EC',
    ink:'#100E0A', ink2:'#2A2520', muted:'#6B6359',
    line:'#D9D1BD', accent:'#7A1818', accent2:'#A82828',
  },
  fonts: {
    display:'Bodoni Moda', body:'Manrope', script:'Italianno', mono:'JetBrains Mono',
  },

  hero: {
    eyebrow:'El sistema para zapaterías mexicanas · 2026',
    h1:'Cada <em>par</em>.<br>Cada <em>talla</em>.<br>Contado.',
    deck:'El punto de venta hecho para que en tu zapatería no se pierda un solo par. Inventario por talla, apartados con anticipo, devoluciones con foto, comisiones por vendedor.',
    ctaPrimary:'Empezar gratis', ctaSecondary:'Ver el lookbook',
    metaLine:'$0 inicial · sin tarjeta · setup en 5 min',
  },

  images: {
    hero:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Tenis modernos sobre fondo amarillo',
    showcase:[
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
    context:[
      {url:'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=800&h=600&fit=crop&q=80',caption:'Stock por talla visible al instante'},
      {url:'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&h=600&fit=crop&q=80',caption:'Vendedor escanea y confirma'},
      {url:'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&h=600&fit=crop&q=80',caption:'Devolución con foto obligatoria'},
    ],
  },

  liveDemo: {
    type:'stock',
    eyebrow:'Inventario en vivo',
    title:'Tu stock, <em>por talla y color</em>, ahora mismo',
    deck:'Ningún par se "pierde mágicamente". Cada combinación tallaxcolor tiene su contador. Cuando una talla cae a 2 o menos, te avisa por WhatsApp. Cuando se acaba, se quita del catálogo digital solo.',
    secondary:'En las zapaterías chicas, perder el control de tallas significa decirle "no tengo" al cliente cuando sí tienes, o ofrecer un par que ya no existe. Pareo elimina ambos errores.',
    data:{
      product:'Nike Air Max 90',
      tallas:[23, 24, 25, 26, 27, 28, 29, 30],
      stock:[
        {color:'Negro', vals:[0, 2, 5, 8, 3, 1, 0, 0]},
        {color:'Blanco', vals:[1, 3, 7, 4, 6, 0, 0, 0]},
        {color:'Gris', vals:[2, 4, 6, 5, 2, 1, 0, 0]},
      ],
      lowThreshold:2,
    },
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
    {v:'247', l:'Pares en stock'},
    {v:'42', l:'Pares vendidos hoy'},
    {v:'5', l:'Min de setup', suffix:'min'},
    {v:'0', l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text:'Antes cerraba caja con calculadora y un cuaderno. <span class="hl">Las comisiones eran un drama cada quincena</span>. Con Pareo mi vendedor ve sus ventas en vivo y yo me voy a dormir tranquilo.',
    sig:'Roberto M.',
    role:'Zapatería en Apodaca, NL',
  },

  thefts: [
    {title:'Pares que "desaparecen" en mermas',
     rob:'El empleado mete pares a "mermas" o "regalo" sin justificar y se los lleva. En una zapatería promedio son 4 a 6 pares al mes — entre $1,500 y $3,000 perdidos.',
     fix:'Cada par tiene su <strong>número de serie único</strong>. Si sale del inventario sin venta registrada, te llega notificación al WhatsApp. Auditoría automática cada turno.'},
    {title:'"Cambio de talla" con par usado',
     rob:'Cliente compra unos tenis, los usa el fin de semana, los regresa diciendo "no me quedaron" y se lleva otros. Tú revendes los usados como nuevos sin saber.',
     fix:'Devolución exige <strong>foto obligatoria del par y la etiqueta</strong> con timestamp. Si fueron usados, alerta al gerente. Bloquea cambios después de 7 días sin foto de etiqueta intacta.'},
    {title:'Venta "por fuera" sin pasar por caja',
     rob:'Vendedor le hace "precio especial" a un conocido, cobra en efectivo y se queda con todo. Nunca pasó por el sistema, tú nunca te enteras del par perdido.',
     fix:'Comisiones se pagan <strong>solo sobre ventas registradas</strong>. Si no captura, no gana. Reporte diario: pares fuera de stock vs tickets emitidos.'},
  ],
};


const BRAND_COMANDERO = {
  slug:'comandero', brand:'Comandero',
  tagline:'El POS hecho para que tu cocina nunca pare',
  giro:'restaurante', giroPlural:'restaurantes', vibe:'vibrant',

  palette: {
    bg:'#FFFCF0', surface:'#FFFFFF', paper:'#FAF3DD',
    ink:'#0A0908', ink2:'#1F1D18', muted:'#6B6963',
    line:'#E8E2C8', accent:'#F9C829', accent2:'#DC2626',
  },
  fonts: { display:'Archivo Black', body:'Inter', script:'Caveat', mono:'Space Mono' },

  hero: {
    eyebrow:'Sistema POS para restaurantes mexicanos',
    h1:'Sírvelo <em>caliente</em>.<br>Cobra <em>rápido</em>.',
    deck:'El sistema que reemplaza los papelitos, los gritos y los platillos olvidados. Comandera digital, KDS, división de cuenta y propinas para que tu cocina no pare ni un segundo.',
    ctaPrimary:'Empezar gratis', ctaSecondary:'Ver cocina en vivo',
    metaLine:'$0 inicial · setup en 5 min · funciona offline',
  },

  images: {
    hero:'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Tacos al pastor mexicanos',
    showcase:[
      {url:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=1200&h=900&fit=crop&q=80',tag:'Pizza artesanal',size:'lg'},
      {url:'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=900&h=1200&fit=crop&q=80',tag:'Burger gourmet',size:'md'},
      {url:'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=900&h=1200&fit=crop&q=80',tag:'Al pastor',size:'sm'},
      {url:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&h=1200&fit=crop&q=80',tag:'Mariscos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=900&h=1200&fit=crop&q=80',tag:'Bowl saludable',size:'md'},
      {url:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&h=1200&fit=crop&q=80',tag:'Ensalada',size:'sm'},
      {url:'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1200&h=900&fit=crop&q=80',tag:'Desayuno',size:'md'},
      {url:'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=900&h=1200&fit=crop&q=80',tag:'Carne asada',size:'sm'},
      {url:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&h=900&fit=crop&q=80',tag:'Steak premium',size:'md'},
    ],
    context:[
      {url:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop&q=80',caption:'Mesera con tablet captura órdenes'},
      {url:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop&q=80',caption:'KDS muestra órdenes a cocina'},
      {url:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop&q=80',caption:'Pago con QR en la mesa'},
    ],
  },

  liveDemo: {
    type:'kds',
    eyebrow:'En vivo desde tu cocina',
    title:'Tu KDS, <em>operando</em> en tiempo real',
    deck:'Cada orden cae directo a la pantalla de cocina. Con su cronómetro, sus modificadores, su mesa. Cocina prepara lo que ve, no lo que recuerda. Si no está en el KDS, no sale del calor.',
    secondary:'En sábados ocupados, el KDS le salva la cocina al chef. Mesa 04 esperando 3 minutos? Roja. Mesa 11 lista? Verde. Sin gritos, sin papelitos, sin platillos perdidos.',
    data:{
      orders:[
        {mesa:4, time:'21:42', state:'urgent', wait:'03:24', items:['2× Tacos al pastor','1× Quesadilla|+ extra queso','3× Coca-Cola']},
        {mesa:7, time:'21:44', state:'prep', wait:'01:08', items:['1× Pizza pepperoni','2× Ensalada César','2× Té helado']},
        {mesa:11, time:'21:38', state:'ready', wait:'SERVIR', items:['1× Hamburguesa|+ extra queso','1× Papas francesas','1× Limonada']},
        {mesa:2, time:'21:44', state:'queue', wait:'00:42', items:['3× Tacos campechanos|- sin cebolla','1× Guacamole']},
      ],
    },
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
    {v:'100', l:'Comandas sin perderse', suffix:'%'},
    {v:'5', l:'Min de setup', suffix:'min'},
    {v:'0', l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text:'Antes los sábados eran un infierno. <span class="hl">Cocina con cinco papelitos al mismo tiempo y la mesera gritando</span>. Con Comandero todo va a la pantalla. El sábado pasado servimos 92 mesas sin un error.',
    sig:'Chef Roberto',
    role:'Taquería en San Pedro · Monterrey, NL',
  },

  thefts: [
    {title:'Comanda fantasma',
     rob:'Mesera no captura la orden, cocina la prepara igual, cliente paga en efectivo, mesera se queda con todo. En un restaurante de 30 mesas son $4,000 a $8,000 al mes mínimo.',
     fix:'Cocina solo prepara <strong>lo que está en el KDS</strong>. Si no está en el sistema, no sale del calor. Cero excepciones.'},
    {title:'Cancelaciones tras el cobro',
     rob:'Mesera cobra al cliente, después "cancela" el ticket diciendo que se equivocó, y se queda con el dinero.',
     fix:'Cancelar requiere <strong>PIN del gerente + razón escrita</strong>. Reporte semanal de cancelaciones por mesero.'},
    {title:'Cortesías sin autorización',
     rob:'"Eran amigos de mi prima", "se quejó del platillo y le regalé el postre". Empleados regalan comida para hacer amigos.',
     fix:'Cortesías exigen <strong>PIN del gerente + motivo + foto del cliente</strong>. Reporte mensual por mesero.'},
  ],
};


const BRAND_NAVAJA = {
  slug:'navaja', brand:'Navaja',
  tagline:'El sistema para barberías que sí cobran lo que cortan',
  giro:'barbería', giroPlural:'barberías', vibe:'darkPremium',

  palette: {
    bg:'#080706', surface:'#141210', paper:'#1E1B17',
    ink:'#F5F0E4', ink2:'#D9D2BC', muted:'#8A8377',
    line:'rgba(201,162,76,.25)', accent:'#C9A24C', accent2:'#8B1F1F',
  },
  fonts: { display:'Oswald', body:'Inter', script:'Italianno', mono:'JetBrains Mono' },

  hero: {
    eyebrow:'El sistema para barberías mexicanas · 2026',
    h1:'Cada <em>corte</em>,<br>cobrado.<br>Cada <em>propina</em>,<br>repartida.',
    deck:'Navaja es el punto de venta hecho para barberías serias. Agenda por barbero, comisiones automáticas, propinas digitales y control de productos — para que nada se cobre por fuera.',
    ctaPrimary:'Empezar gratis', ctaSecondary:'Ver agenda en vivo',
    metaLine:'$0 inicial · setup en 5 min · 100% offline',
  },

  images: {
    hero:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Sillón de barbería clásica',
    showcase:[
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
    context:[
      {url:'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&h=600&fit=crop&q=80',caption:'Barbero marca cita iniciada'},
      {url:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=600&fit=crop&q=80',caption:'Sillón con cliente activo'},
      {url:'https://images.unsplash.com/photo-1580618864180-f6d7d39b8ff6?w=800&h=600&fit=crop&q=80',caption:'Inventario de productos al cierre'},
    ],
  },

  liveDemo: {
    type:'booking',
    eyebrow:'Agenda en vivo · Hoy',
    title:'Tu agenda, <em>cita por cita</em>',
    deck:'Cada barbero con su calendario, sus citas y sus comisiones. Cliente reserva por WhatsApp, sistema confirma, recordatorio 1 hora antes. Sin doble cita, sin "se me olvidó", sin pelea por el turno.',
    secondary:'Y cuando el cliente se sienta en el sillón, marcas "iniciado" con un toque. Esa marca es la prueba: si se inició, se cobró.',
    data:{
      barberos:[
        {name:'Roberto', role:'senior', taken:[0,1,3,4,6,7,9,11], active:12},
        {name:'Diego', role:'junior', taken:[0,2,5,7,10,13], active:14},
        {name:'Manuel', role:'maestro', taken:[0,1,2,3,4,5,6,9,11,13,15], active:7},
      ],
      slots:['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'],
    },
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
    {v:'92', l:'Citas que llegaron', suffix:'%'},
    {v:'5', l:'Min de setup', suffix:'min'},
    {v:'0', l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text:'Antes los lunes eran <span class="hl">drama de comisiones</span>. Quién atendió a quién, qué cobré yo, qué cobró Diego. Con Navaja, cada quien ve sus cortes en su pantalla. Nunca más pizarrita de gises.',
    sig:'Roberto Méndez',
    role:'Barbería en San Pedro Garza García · NL',
  },

  thefts: [
    {title:'Cliente paga directo al barbero',
     rob:'Cliente conocido le paga al barbero en la mano. No pasa por caja. Tú no te enteras. En barberías chicas: $1,500 a $4,000 al mes por barbero.',
     fix:'Comisiones se pagan <strong>solo sobre tickets registrados</strong>. Si no captura, gana 0%. Reporte: corte registrado vs cita confirmada.'},
    {title:'Productos que "se gastan"',
     rob:'Cera, pomada, gel premium. El barbero "se llevó la muestra" o "se la regalé al cliente". En realidad la vendió afuera por la mitad.',
     fix:'Inventario obligatorio <strong>al inicio y al cierre del turno</strong>. Si falta producto, alguien firma. Comparativo semanal por barbero.'},
    {title:'Citas que sí se atendieron, "no llegaron"',
     rob:'El cliente llegó, le cortaron, pero el barbero dice "no llegó" porque ya cobró en efectivo. La cita aparece como ausente.',
     fix:'Cita confirmada se marca <strong>al iniciar el servicio con foto del cliente en el sillón</strong>. Si se inició, se cobró.'},
  ],
};


const BRAND_RECETA = {
  slug:'receta', brand:'Receta',
  tagline:'El sistema para farmacias que rastrea cada lote y cada caducidad',
  giro:'farmacia', giroPlural:'farmacias', vibe:'clinical',

  palette: {
    bg:'#F8FAFC', surface:'#FFFFFF', paper:'#F1F5F9',
    ink:'#0F172A', ink2:'#1E293B', muted:'#64748B',
    line:'#E2E8F0', accent:'#1D4ED8', accent2:'#0EA5E9',
  },
  fonts: { display:'Plus Jakarta Sans', body:'Inter', script:'Caveat', mono:'JetBrains Mono' },

  hero: {
    eyebrow:'Sistema POS para farmacias mexicanas',
    h1:'Cada <em>lote</em>.<br>Cada <em>caducidad</em>.<br>Bajo control.',
    deck:'Receta es el punto de venta hecho para farmacias. Control por lote, alertas de caducidad, recetas digitales y sustitutos sugeridos. Nada se vence en tu anaquel sin que lo sepas.',
    ctaPrimary:'Empezar gratis', ctaSecondary:'Ver demo',
    metaLine:'$0 inicial · setup en 5 min · COFEPRIS-friendly',
  },

  images: {
    hero:'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Estantes de farmacia',
    showcase:[
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
    context:[
      {url:'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&h=600&fit=crop&q=80',caption:'Despachador verifica receta'},
      {url:'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=800&h=600&fit=crop&q=80',caption:'Sistema alerta caducidad a 60 días'},
      {url:'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&h=600&fit=crop&q=80',caption:'Sustituto genérico sugerido'},
    ],
  },

  liveDemo: {
    type:'expiry',
    eyebrow:'Alerta de caducidades · En vivo',
    title:'Tus medicamentos, <em>antes que venzan</em>',
    deck:'El sistema escanea tu inventario cada noche. Cuando un lote está por vencer a 90, 60 o 30 días, te avisa. Y los pone en promoción automática para moverlos antes de que sean basura.',
    secondary:'Una farmacia chica pierde entre $8,000 y $15,000 al año en medicamentos vencidos que nadie notó. Receta convierte ese desperdicio en venta de descuento.',
    data:{
      meds:[
        {name:'Ibuprofeno 400mg', lote:'C9', days:12, state:'critical', stock:18},
        {name:'Amoxicilina 250mg', lote:'B2', days:28, state:'warning', stock:24},
        {name:'Paracetamol 500mg', lote:'A7', days:47, state:'soon', stock:62},
        {name:'Loratadina 10mg', lote:'D3', days:73, state:'ok', stock:35},
        {name:'Omeprazol 20mg', lote:'E1', days:120, state:'ok', stock:88},
      ],
    },
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
    {v:'14', l:'Por caducar (60d)'},
    {v:'5', l:'Min de setup', suffix:'min'},
    {v:'0', l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text:'Tenía $18,000 en medicamentos vencidos por no llevar el control. <span class="hl">El primer mes con Receta detecté 14 medicamentos próximos a vencer</span> y los puse en promoción. Recuperé $9,400 que iban a la basura.',
    sig:'Lic. Andrea',
    role:'Farmacia en Escobedo, NL',
  },

  thefts: [
    {title:'Medicamentos vencidos sin alerta',
     rob:'Productos caros vencen en el anaquel sin que nadie note. Una farmacia chica pierde $8,000 a $15,000 al año en vencimientos invisibles.',
     fix:'<strong>Alerta automática 90 / 60 / 30 días antes</strong> de caducidad. El sistema mueve a promoción solo. Cero pérdidas por descuido.'},
    {title:'"Mermas" sin justificar',
     rob:'Empleado registra medicamento como "merma" o "se rompió" y se lo lleva. Sin trazabilidad por lote, no puedes probar nada.',
     fix:'<strong>Cada unidad rastreada por lote</strong>. Toda merma exige foto + autorización del gerente.'},
    {title:'Venta "por fuera" de mostrador',
     rob:'Despachador cobra en efectivo, no registra la venta, se queda con el dinero. El stock baja "por arte de magia".',
     fix:'Inventario auditado <strong>al cierre de cada turno</strong>. Diferencia stock físico vs sistema dispara alerta.'},
  ],
};


const BRAND_TENDITO = {
  slug:'tendito', brand:'Tendito',
  tagline:'La tiendita de la esquina, con tecnología',
  giro:'abarrotes', giroPlural:'tiendas de abarrotes', vibe:'warmLocal',

  palette: {
    bg:'#FEF3E2', surface:'#FFFFFF', paper:'#FED7AA',
    ink:'#7C2D12', ink2:'#5C3815', muted:'#92715C',
    line:'#E7C9A5', accent:'#C2410C', accent2:'#16A34A',
  },
  fonts: { display:'Fraunces', body:'Inter', script:'Caveat', mono:'JetBrains Mono' },

  hero: {
    eyebrow:'El sistema para tiendas de abarrotes mexicanas',
    h1:'Tu <em>tiendita</em>.<br>Más rápida.<br>Más <em>al día</em>.',
    deck:'Tendito es el punto de venta hecho para abarrotes, fruterías y minisúpers mexicanos. Báscula, fiado, recargas, recibos por WhatsApp — pensado para la tienda de la esquina.',
    ctaPrimary:'Empezar gratis', ctaSecondary:'Ver demo',
    metaLine:'$0 inicial · funciona en cualquier impresora · gratis para tiendas chicas',
  },

  images: {
    hero:'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Tienda de abarrotes mexicana',
    showcase:[
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
    context:[
      {url:'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800&h=600&fit=crop&q=80',caption:'Doña cobra con báscula integrada'},
      {url:'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&h=600&fit=crop&q=80',caption:'Fiado registrado, recordatorio por WhatsApp'},
      {url:'https://images.unsplash.com/photo-1542838686-37da4a9fd1b3?w=800&h=600&fit=crop&q=80',caption:'Recargas de tiempo aire al instante'},
    ],
  },

  liveDemo: {
    type:'fiado',
    eyebrow:'Pizarra digital de fiado',
    title:'Tu libreta, <em>digital</em>. Tu cobranza, automática.',
    deck:'Doña Carmen no te va a pagar este viernes? El sistema le manda recordatorio por WhatsApp solo. Don Pedro lleva 2 semanas sin pasar? Recibe foto del fiado y mensaje amable. Sin que tú tengas que hacer nada incómodo.',
    secondary:'Y al cliente nuevo lo registras con foto desde tu celular. Fiado con prueba, no con confianza ciega.',
    data:{
      total:4820,
      customers:[
        {name:'Doña Carmen', amount:185, days:3, photo:'C'},
        {name:'Don Pedro', amount:240, days:7, photo:'P'},
        {name:'Tía Bertha', amount:89, days:1, photo:'B'},
        {name:'Lupita Reyes', amount:312, days:14, photo:'L'},
        {name:'Sra. Martha', amount:156, days:2, photo:'M'},
        {name:'Don Jorge', amount:478, days:9, photo:'J'},
        {name:'Vecina Lucía', amount:223, days:5, photo:'L'},
      ],
    },
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
    {v:'48', l:'Mil en ventas hoy', prefix:'$', suffix:'k'},
    {v:'5', l:'Min de setup', suffix:'min'},
    {v:'0', l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text:'Tengo 30 años con mi tiendita y nunca había visto algo tan fácil. <span class="hl">Mi nieto me lo configuró en 5 minutos</span>. Ahora cobro recargas de Telcel, fío con foto y mando recibos por WhatsApp. Mi tiendita en serio cambió.',
    sig:'Doña Carmen',
    role:'Abarrotes en la colonia · Apodaca, NL',
  },

  thefts: [
    {title:'Caja con menos de lo cobrado',
     rob:'Empleado cobra $200 al cliente, registra $150 en el sistema, se queda con $50. Sin conciliación diaria, no lo detectas hasta que faltan miles.',
     fix:'<strong>Corte de caja obligatorio al cierre</strong>. Diferencia entre cobrado y registrado dispara alerta. Reporte por empleado.'},
    {title:'Fiados inventados que nunca cobran',
     rob:'Empleado dice "fulano se llevó esto a fiado", pero fulano no existe o nunca pagó. La mercancía se la llevó el empleado.',
     fix:'Fiados exigen <strong>foto del cliente + firma digital</strong>. Cliente recibe SMS confirmando el monto.'},
    {title:'Recargas vendidas afuera del sistema',
     rob:'Empleado vende tiempo aire con su propio crédito y se queda la comisión. La tienda no se entera.',
     fix:'Recargas se hacen <strong>desde el sistema con tu saldo</strong>. Sin sistema, no hay recarga.'},
  ],
};


// =============================================================
// ============================================================
// VOLVIX · BRANDS EXTRA (Sectores 5-9 del catálogo)
// ============================================================
// 5 marcas hero — una por sector — con identidades únicas.
// Cubren los 200 giros "más identitarios" del catálogo de Erick:
//   - Salud y Bienestar (50 giros)
//   - Belleza y Estética (45 giros)
//   - Servicios Profesionales (35 giros)
//   - Deporte y Recreación (35 giros)
//   - Entretenimiento y Eventos (35 giros)
//
// Cada marca con paleta única, fuentes pre-aprobadas por vibe,
// 6 funcionalidades específicas, 3 robos típicos del sector,
// y un live demo del sistema operando.
// ============================================================

// ============================================================
// 1. PULSO — Salud y Bienestar (clinical / verde médico)
// ============================================================
const BRAND_PULSO = {
  slug:'pulso', brand:'Pulso',
  tagline:'El sistema para clínicas y consultorios que sí cobran cada consulta',
  giro:'clínica y consultorio',
  giroPlural:'clínicas y consultorios',
  vibe:'clinical',

  palette:{
    bg:'#F4FAF7', surface:'#FFFFFF', paper:'#E6F2EC',
    ink:'#052E1F', ink2:'#0F3C2C', muted:'#6B8278',
    line:'#D1E2DA', accent:'#047857', accent2:'#DC2626',
  },
  fonts:{display:'Plus Jakarta Sans', body:'Inter', script:'Caveat', mono:'JetBrains Mono'},

  hero:{
    eyebrow:'Sistema POS para clínicas y consultorios mexicanos',
    h1:'Cada <em>consulta</em>.<br>Cada <em>paciente</em>.<br>En su expediente.',
    deck:'Agenda por especialista, expediente clínico digital, recordatorios por WhatsApp y control de cobros. Para que tu clínica no pierda ni una consulta ni un copago.',
    ctaPrimary:'Empezar gratis',
    ctaSecondary:'Ver agenda en vivo',
    metaLine:'$0 inicial · setup en 5 min · cumple NOM-024',
  },

  images:{
    hero:'https://images.unsplash.com/photo-1666214280391-8ff5bd3c0bf0?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Consultorio médico moderno',
    showcase:[
      {url:'https://images.unsplash.com/photo-1631815589968-fdb09a223b1e?w=1200&h=900&fit=crop&q=80',tag:'Consultorio moderno',size:'lg'},
      {url:'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=900&h=1200&fit=crop&q=80',tag:'Doctor con paciente',size:'md'},
      {url:'https://images.unsplash.com/photo-1551884170-09fb70a3a2ed?w=900&h=1200&fit=crop&q=80',tag:'Consulta dental',size:'sm'},
      {url:'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=900&h=1200&fit=crop&q=80',tag:'Receta médica',size:'sm'},
      {url:'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=900&h=1200&fit=crop&q=80',tag:'Médico en consulta',size:'md'},
      {url:'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=900&h=1200&fit=crop&q=80',tag:'Recepción clínica',size:'sm'},
      {url:'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&h=900&fit=crop&q=80',tag:'Doctor con tablet',size:'md'},
      {url:'https://images.unsplash.com/photo-1583912267550-d6c2f3d05b48?w=900&h=1200&fit=crop&q=80',tag:'Instrumentos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=1200&h=900&fit=crop&q=80',tag:'Especialista',size:'md'},
    ],
    context:[
      {url:'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=600&fit=crop&q=80',caption:'Doctor confirma cita desde su tablet'},
      {url:'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&h=600&fit=crop&q=80',caption:'Recordatorio por WhatsApp 1hr antes'},
      {url:'https://images.unsplash.com/photo-1583912267550-d6c2f3d05b48?w=800&h=600&fit=crop&q=80',caption:'Cobro y expediente automáticos al cierre'},
    ],
  },

  features:[
    {ico:'calendar', h:'Agenda por especialista', d:'Cada doctor con su calendario. Paciente reserva por WhatsApp, sin doble cita, sin "se me olvidó".'},
    {ico:'edit',     h:'Expediente clínico digital', d:'Historial, alergias, medicamentos, signos vitales. Buscas por paciente en 2 segundos.'},
    {ico:'message',  h:'Recordatorios por WhatsApp', d:'Confirmación obligatoria 1 hr antes. Si no confirma, la cita se libera automáticamente.'},
    {ico:'percent',  h:'Comisiones por consulta', d:'Define el % por doctor y por tipo de consulta. Se calculan solas al cierre del día.'},
    {ico:'shield',   h:'Cumplimiento NOM-024', d:'Expedientes con los campos obligatorios. Reportes para auditorías de COFEPRIS/Salubridad.'},
    {ico:'star',     h:'Historial del paciente', d:'Qué tratamiento, qué dosis, qué fecha. Próxima consulta sale lista sin que el paciente lo recuerde.'},
  ],

  stats:[
    {v:'312', l:'Consultas este mes'},
    {v:'94',  l:'Citas que llegaron', suffix:'%'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote:{
    text:'Mi recepcionista cobraba la consulta y a veces "se le olvidaba" registrar. <span class="hl">Detecté $12,400 al mes que no entraban a caja</span>. Con Pulso, cada cobro pasa por sistema. Ya no hay magia.',
    sig:'Dr. Manuel Garza',
    role:'Clínica de medicina general · Apodaca, NL',
  },

  thefts:[
    {
      title:'Cobros que no pasan por caja',
      rob:'Recepcionista cobra al paciente en efectivo, no genera ticket, se queda con el dinero. En consultorios chicos: $5,000 a $12,000 al mes.',
      fix:'Toda consulta exige <strong>ticket digital antes de que el paciente salga</strong>. Si el doctor cierra consulta sin pago registrado, alerta al gerente.',
    },
    {
      title:'Recetas vendidas sin consulta',
      rob:'Asistente vende medicamentos por fuera del consultorio sin que el paciente vea al doctor. Tú pagas el inventario, otros se llevan la utilidad.',
      fix:'Cada salida de medicamento requiere <strong>folio de consulta válido</strong>. Sin consulta registrada, no hay venta. Reporte semanal cruza ambos.',
    },
    {
      title:'Cancelaciones de último minuto sin sanción',
      rob:'Paciente cancela 30 min antes, el espacio se pierde. En clínicas con agenda llena: 10-15% de ingresos perdidos por slots vacíos.',
      fix:'Confirmación obligatoria 1 hr antes por WhatsApp. <strong>Si no confirma, el slot se ofrece a la lista de espera</strong>. Cargo por no-show configurable.',
    },
  ],

  liveDemo:{
    type:'booking',
    eyebrow:'Agenda en vivo · Hoy',
    title:'Tu agenda, <em>doctor por doctor</em>',
    deck:'Cada especialista con su calendario. Paciente reserva por WhatsApp o web, recordatorio 1 hora antes, confirmación obligatoria.',
    secondary:'Si confirma → llega. Si no confirma → el slot se ofrece automáticamente al siguiente paciente en lista de espera.',
    data:{
      barberos:[
        {name:'Dr. Manuel', role:'general', taken:[0,1,3,4,6,7,9,11,13], active:12},
        {name:'Dra. Adriana', role:'pediatra', taken:[0,2,5,7,10,13], active:14},
        {name:'Dra. Sofía', role:'dental', taken:[0,1,2,3,4,5,6,9,11,13,15], active:7},
      ],
      slots:['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'],
    },
  },
};


// ============================================================
// 2. BRILLO — Belleza y Estética (editorial / champagne-cobre)
// ============================================================
const BRAND_BRILLO = {
  slug:'brillo', brand:'Brillo',
  tagline:'El sistema para estéticas y salones donde cada cliente sale brillando',
  giro:'estética',
  giroPlural:'estéticas y salones de belleza',
  vibe:'editorial',

  palette:{
    bg:'#FAF6EE', surface:'#FFFFFF', paper:'#F5EAD7',
    ink:'#1A1410', ink2:'#3D2E1F', muted:'#8B7355',
    line:'#E8D9BB', accent:'#B45309', accent2:'#E11D48',
  },
  fonts:{display:'Bodoni Moda', body:'Manrope', script:'Italianno', mono:'JetBrains Mono'},

  hero:{
    eyebrow:'Sistema POS para estéticas y salones mexicanos',
    h1:'Cada <em>cliente</em>.<br>Cada <em>servicio</em>.<br>Cada propina.',
    deck:'Agenda por estilista, paquetes prepagados, control de productos y propinas digitales con reparto justo. Para que tu estética se enfoque en hacer brillar, no en contar dinero.',
    ctaPrimary:'Empezar gratis',
    ctaSecondary:'Ver agenda en vivo',
    metaLine:'$0 inicial · setup en 5 min · funciona offline',
  },

  images:{
    hero:'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Salón de belleza elegante',
    showcase:[
      {url:'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&h=900&fit=crop&q=80',tag:'Hair styling',size:'lg'},
      {url:'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=900&h=1200&fit=crop&q=80',tag:'Brochas maquillaje',size:'md'},
      {url:'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=900&h=1200&fit=crop&q=80',tag:'Manicure detalle',size:'sm'},
      {url:'https://images.unsplash.com/photo-1571646034647-52e6ea84b28c?w=900&h=1200&fit=crop&q=80',tag:'Spa facial',size:'sm'},
      {url:'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=900&h=1200&fit=crop&q=80',tag:'Tratamiento facial',size:'md'},
      {url:'https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=900&h=1200&fit=crop&q=80',tag:'Detalle ceja',size:'sm'},
      {url:'https://images.unsplash.com/photo-1607103058027-4c5e2a9a8f6f?w=1200&h=900&fit=crop&q=80',tag:'Labial premium',size:'md'},
      {url:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=900&h=1200&fit=crop&q=80',tag:'Sillón estilista',size:'sm'},
      {url:'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=1200&h=900&fit=crop&q=80',tag:'Salón interior',size:'md'},
    ],
    context:[
      {url:'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&h=600&fit=crop&q=80',caption:'Estilista atendiendo a cliente'},
      {url:'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=600&fit=crop&q=80',caption:'Paquete prepagado canjeándose'},
      {url:'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&h=600&fit=crop&q=80',caption:'Producto registrado al cierre'},
    ],
  },

  features:[
    {ico:'calendar', h:'Agenda por estilista', d:'Cada estilista con su calendario. Cliente reserva por WhatsApp, recordatorio automático.'},
    {ico:'gift',     h:'Paquetes prepagados', d:'5 manicures con descuento. Se descuentan automático cuando la cliente regresa. Lealtad real.'},
    {ico:'package',  h:'Inventario de productos', d:'Esmaltes, tintes, cremas. Cada uso se registra. Sabes qué se mueve y qué se va.'},
    {ico:'percent',  h:'Comisiones por servicio', d:'Senior 60%, junior 40%. Define % por servicio Y estilista. Se calcula solo al cierre.'},
    {ico:'star',     h:'Historial del cliente', d:'Qué color, qué fórmula, qué corte. La próxima visita sale igual sin que la cliente lo recuerde.'},
    {ico:'message',  h:'Reparto justo de propinas', d:'Propina con tarjeta se reparte automático: estilista 60%, auxiliar 30%, shampoo 10%. Sin discusiones.'},
  ],

  stats:[
    {v:'247', l:'Servicios este mes'},
    {v:'96',  l:'Citas que llegaron', suffix:'%'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote:{
    text:'Cuando mi propina se cobraba en efectivo no había drama. Cuando empezamos con tarjeta, <span class="hl">una estilista se quedaba con toda la propina del equipo</span>. Con Brillo, el reparto es automático. Mi gente se quedó. Mi salón creció.',
    sig:'Sofía Reynoso',
    role:'Salón de belleza · San Pedro Garza García, NL',
  },

  thefts:[
    {
      title:'Productos "para una clienta"',
      rob:'Estilista se lleva esmaltes, tintes, cremas premium para "usarlos en una clienta especial". En realidad se los lleva a casa. Una estética chica pierde $2,000-5,000 al mes.',
      fix:'Inventario <strong>obligatorio al cierre de cada turno</strong>. Cada producto usado registra cliente y servicio. Si falta sin registro, alguien firma. Comparativo semanal por estilista.',
    },
    {
      title:'Servicios "regalados" sin facturar',
      rob:'"Es mi prima", "le hice manicure de paso", "fue una cortesía". Servicios ejecutados pero no facturados. La utilidad se va con las amistades del personal.',
      fix:'Comisiones se pagan <strong>solo sobre tickets registrados</strong>. Si no captura el servicio, gana 0%. Reporte cruzado: tiempo en sillón vs servicios cobrados.',
    },
    {
      title:'Propinas que no se reparten',
      rob:'Cliente deja propina con tarjeta para "todo el equipo". Estilista se queda con todo, no comparte con shampoo ni auxiliar. Genera resentimiento y rotación constante.',
      fix:'Propinas digitales con <strong>reparto automático configurable</strong>. Estilista 60%, auxiliar 30%, shampoo 10%. Cada quien ve su corte real al cierre.',
    },
  ],

  liveDemo:{
    type:'booking',
    eyebrow:'Agenda en vivo · Hoy',
    title:'Tu agenda, <em>estilista por estilista</em>',
    deck:'Cada estilista con su calendario. Cliente reserva por WhatsApp, confirma 1 hr antes, llega lista.',
    secondary:'Cuando se sienta en el sillón, marcas "iniciado". Esa marca registra el servicio: si se inició, se cobra.',
    data:{
      barberos:[
        {name:'Sofía', role:'senior', taken:[0,1,3,4,6,7,9,11,12], active:13},
        {name:'Karla', role:'junior', taken:[0,2,5,7,10,13], active:14},
        {name:'Ileana', role:'color', taken:[0,1,2,3,4,5,6,9,11,13,15], active:7},
      ],
      slots:['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'],
    },
  },
};


// ============================================================
// 3. FOLIO — Servicios Profesionales (editorial / navy B2B)
// ============================================================
const BRAND_FOLIO = {
  slug:'folio', brand:'Folio',
  tagline:'El sistema para despachos profesionales que sí facturan cada hora',
  giro:'despacho profesional',
  giroPlural:'despachos y servicios profesionales',
  vibe:'editorial',

  palette:{
    bg:'#F8F7F4', surface:'#FFFFFF', paper:'#EFECE2',
    ink:'#0F172A', ink2:'#1E293B', muted:'#64748B',
    line:'#E2E8F0', accent:'#1E3A8A', accent2:'#B45309',
  },
  fonts:{display:'Bodoni Moda', body:'Manrope', script:'Italianno', mono:'JetBrains Mono'},

  hero:{
    eyebrow:'Sistema POS para despachos profesionales mexicanos',
    h1:'Cada <em>hora</em>.<br>Cada <em>expediente</em>.<br>Facturado.',
    deck:'Agenda por profesional, control de retainer, cronómetro por caso y facturación SAT/CFDI 4.0. Para despachos que cobran lo que valen.',
    ctaPrimary:'Empezar gratis',
    ctaSecondary:'Ver agenda en vivo',
    metaLine:'$0 inicial · CFDI 4.0 · setup en 5 min',
  },

  images:{
    hero:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Despacho profesional moderno',
    showcase:[
      {url:'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&h=900&fit=crop&q=80',tag:'Escritorio',size:'lg'},
      {url:'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=900&h=1200&fit=crop&q=80',tag:'Reunión',size:'md'},
      {url:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&h=1200&fit=crop&q=80',tag:'Calculadora',size:'sm'},
      {url:'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=900&h=1200&fit=crop&q=80',tag:'Apretón de manos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1554224154-26032cdc0c4e?w=900&h=1200&fit=crop&q=80',tag:'Documentos',size:'md'},
      {url:'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=900&h=1200&fit=crop&q=80',tag:'Laptop trabajo',size:'sm'},
      {url:'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=900&fit=crop&q=80',tag:'Oficina',size:'md'},
      {url:'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=900&h=1200&fit=crop&q=80',tag:'Equipo',size:'sm'},
      {url:'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&h=900&fit=crop&q=80',tag:'Trabajo serio',size:'md'},
    ],
    context:[
      {url:'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&h=600&fit=crop&q=80',caption:'Reunión con cliente registrada'},
      {url:'https://images.unsplash.com/photo-1554224154-26032cdc0c4e?w=800&h=600&fit=crop&q=80',caption:'Cronómetro por expediente activo'},
      {url:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=600&fit=crop&q=80',caption:'Factura CFDI generada automática'},
    ],
  },

  features:[
    {ico:'calendar', h:'Agenda por profesional', d:'Cada lic./CP con su calendario. Cliente reserva consulta, sistema confirma.'},
    {ico:'edit',     h:'Expedientes digitales', d:'Cada caso con sus documentos, sus tiempos y sus notas. Sin papeles, sin "lo perdí".'},
    {ico:'shield',   h:'Facturación SAT / CFDI 4.0', d:'Factura electrónica con tu sello, tu RFC, tus conceptos. Timbrada al instante.'},
    {ico:'percent',  h:'Cronómetro por caso', d:'Cada acción en el expediente suma tiempo. Cobras lo que trabajaste, no lo que recuerdas.'},
    {ico:'star',     h:'Retainer y abonados', d:'Cliente prepaga $10k/mes. El sistema descuenta horas conforme se trabajan. Reporte mensual al cliente.'},
    {ico:'archive',  h:'Trazabilidad por caso', d:'Quién hizo qué, cuándo, en qué expediente. Logs auditables para casos sensibles.'},
  ],

  stats:[
    {v:'187', l:'Horas facturables', suffix:'h'},
    {v:'94',  l:'Cobranza al mes', suffix:'%'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote:{
    text:'Yo "trabajaba" 60 horas a la semana. Cuando vi el reporte de Folio, <span class="hl">solo había facturado 31</span>. Las demás se las regalé al cliente o se me perdieron en café. Hoy facturo 52 con la misma chamba. La diferencia es contabilidad real.',
    sig:'Lic. Andrea Mendoza',
    role:'Despacho jurídico · San Pedro Garza García, NL',
  },

  thefts:[
    {
      title:'Horas trabajadas sin facturar',
      rob:'Abogado/contador trabaja 12 horas en un caso pero solo registra 8. Las 4 horas "se las regaló" al cliente — o le pagaron en efectivo por fuera y se las queda el asociado.',
      fix:'Cronómetro integrado al expediente. <strong>Cada acción en el caso suma tiempo automáticamente</strong>. Reporte semanal: horas registradas vs documentos modificados.',
    },
    {
      title:'Retainer cobrado, servicios no entregados',
      rob:'Cliente paga $10,000 de retainer mensual. Mes ocupado, no le hacen nada. Cliente no se queja por meses, después se va con todo y peor reputación pública.',
      fix:'Reporte automático al cliente cada mes: <strong>horas consumidas del retainer, expediente actualizado, próximas acciones</strong>. Email + WhatsApp automáticos.',
    },
    {
      title:'Casos vendidos "por fuera"',
      rob:'Asociado junior contacta al cliente directamente, le ofrece servicio a la mitad del precio, no pasa por el despacho. El cliente Y los honorarios se van.',
      fix:'Acceso a expedientes con <strong>permisos jerárquicos y logs auditables</strong>. Datos del cliente solo visibles si el caso está activo y asignado. Quién accedió queda registrado.',
    },
  ],

  liveDemo:{
    type:'booking',
    eyebrow:'Agenda en vivo · Hoy',
    title:'Tu agenda, <em>cliente por cliente</em>',
    deck:'Cada profesional con su calendario, cada cita con su expediente. Cliente reserva consulta, sistema confirma 1 hr antes.',
    secondary:'Cuando inicia la junta, marcas "comenzada". El cronómetro arranca. Cobras lo que trabajaste — no lo que recordaste.',
    data:{
      barberos:[
        {name:'Lic. Mendoza', role:'jurídico', taken:[0,1,3,4,6,7,9,11], active:12},
        {name:'CP. Ortega', role:'contable', taken:[0,2,5,7,10,13], active:14},
        {name:'Lic. Robles', role:'asesor', taken:[0,1,2,3,4,5,6,9,11,13,15], active:7},
      ],
      slots:['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'],
    },
  },
};


// ============================================================
// 4. FORJA — Deporte y Recreación (vibrant / cream + naranja quemado)
// ============================================================
const BRAND_FORJA = {
  slug:'forja', brand:'Forja',
  tagline:'El sistema para gimnasios y centros deportivos donde nadie entra de gratis',
  giro:'gimnasio',
  giroPlural:'gimnasios y centros deportivos',
  vibe:'vibrant',

  palette:{
    bg:'#FAF8F3', surface:'#FFFFFF', paper:'#F5EBD8',
    ink:'#1A0F0A', ink2:'#3D2614', muted:'#8B6F47',
    line:'#E7C9A5', accent:'#EA580C', accent2:'#0F766E',
  },
  fonts:{display:'Archivo Black', body:'Inter', script:'Caveat', mono:'Space Mono'},

  hero:{
    eyebrow:'Sistema POS para gimnasios y centros deportivos mexicanos',
    h1:'Cada <em>repe</em>.<br>Cada <em>clase</em>.<br>Contada.',
    deck:'Membresías por huella, agenda de clases, control de acceso por torniquete y comisiones por instructor. Para gyms donde nadie entra de gratis.',
    ctaPrimary:'Empezar gratis',
    ctaSecondary:'Ver agenda en vivo',
    metaLine:'$0 inicial · setup en 5 min · compatible con torniquete',
  },

  images:{
    hero:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Gimnasio moderno con equipo',
    showcase:[
      {url:'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&h=900&fit=crop&q=80',tag:'Pesas libres',size:'lg'},
      {url:'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=900&h=1200&fit=crop&q=80',tag:'Kettlebell',size:'md'},
      {url:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&h=1200&fit=crop&q=80',tag:'Entrenamiento',size:'sm'},
      {url:'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=900&h=1200&fit=crop&q=80',tag:'Coach atento',size:'sm'},
      {url:'https://images.unsplash.com/photo-1605296867424-35fc25c9212a?w=900&h=1200&fit=crop&q=80',tag:'Yoga clase',size:'md'},
      {url:'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=900&h=1200&fit=crop&q=80',tag:'Cardio outdoor',size:'sm'},
      {url:'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=1200&h=900&fit=crop&q=80',tag:'CrossFit box',size:'md'},
      {url:'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=900&h=1200&fit=crop&q=80',tag:'Pilates',size:'sm'},
      {url:'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&h=900&fit=crop&q=80',tag:'Gym amplio',size:'md'},
    ],
    context:[
      {url:'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&h=600&fit=crop&q=80',caption:'Coach registra sesión privada'},
      {url:'https://images.unsplash.com/photo-1605296867424-35fc25c9212a?w=800&h=600&fit=crop&q=80',caption:'Cliente check-in por huella'},
      {url:'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=600&fit=crop&q=80',caption:'Reservación de clase vía app'},
    ],
  },

  features:[
    {ico:'shield',   h:'Acceso por huella', d:'Solo tu huella te deja pasar. Sin colarse con la credencial del amigo. Doble entrada dispara alerta.'},
    {ico:'calendar', h:'Agenda de clases', d:'Yoga, CrossFit, boxing, spinning. Cliente reserva, sistema confirma cupo. Cero peleas en recepción.'},
    {ico:'percent',  h:'Comisiones por instructor', d:'Coach personal cobra su % por sesión registrada. Sin sesión en sistema, sin comisión. Sin excepciones.'},
    {ico:'star',     h:'Membresías y paquetes', d:'Mensual, trimestral, anual, pase libre, 10 entradas. Cada paquete con su precio y sus reglas.'},
    {ico:'message',  h:'Recordatorios por WhatsApp', d:'1 hr antes de tu clase. Si no confirma, el lugar se libera para la lista de espera.'},
    {ico:'gift',     h:'Programa de referidos', d:'Trae a un amigo, te ganas 1 mes gratis. Cuando el amigo paga, automático se aplica tu crédito.'},
  ],

  stats:[
    {v:'247', l:'Miembros activos'},
    {v:'92',  l:'Asistencia promedio', suffix:'%'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote:{
    text:'Tenía 180 miembros pagados. <span class="hl">Pero entraban 240 personas al día</span>. Cuando puse Forja con huellas, en 1 semana caché 47 "entradas de gratis" por mes. Mis miembros legítimos no me dejaron porque el ambiente mejoró: ya no había mareo.',
    sig:'Coach Carlos Vázquez',
    role:'Gym de CrossFit · Apodaca, NL',
  },

  thefts:[
    {
      title:'Cliente metió a su amigo sin pase',
      rob:'Miembro avienta a su amigo por encima del torniquete o le presta su credencial. Sin huella obligatoria, no hay manera de saber. $1,000 a $3,000 al mes en accesos no pagados.',
      fix:'Acceso por <strong>huella obligatoria, no por credencial</strong>. Si la misma huella intenta entrar 2 veces en 5 minutos, sistema avisa. Reporte diario de patrones raros.',
    },
    {
      title:'Instructor cobra clase por fuera',
      rob:'Instructor le dice al alumno "yo te entreno por mi cuenta, ahorras dinero". Sale del horario del gym, se lleva al cliente. Con 3 instructores: $15,000-30,000 al mes.',
      fix:'Comisiones de instructor pagadas <strong>solo sobre sesiones que pasaron por el sistema</strong>. Si no captura, gana 0%. Reporte cruzado: alumnos del gym vs historial del instructor.',
    },
    {
      title:'Membresías vencidas que siguen entrando',
      rob:'Cliente renovó hace 2 meses, su membresía venció hace 1, pero el sistema viejo sigue dejándolo pasar porque "ya tiene huella". Tú pierdes la oportunidad de cobrarle.',
      fix:'Control de acceso <strong>sincronizado en tiempo real con el estado de la membresía</strong>. Si está vencida, el torniquete se traba. Notificación inmediata al gerente.',
    },
  ],

  liveDemo:{
    type:'booking',
    eyebrow:'Agenda de clases · Hoy',
    title:'Tu agenda, <em>clase por clase</em>',
    deck:'Cada instructor con su calendario. Miembro reserva por app, confirma 1 hr antes, llega listo. Sin cupos perdidos.',
    secondary:'Si no llega a la reservación, el lugar se libera 5 minutos antes para lista de espera. Cero asientos vacíos.',
    data:{
      barberos:[
        {name:'Coach Carlos', role:'CrossFit', taken:[0,1,3,4,6,7,9,11,13], active:12},
        {name:'Mtra. Adriana', role:'Yoga', taken:[0,2,5,7,10,13], active:14},
        {name:'Coach Diego', role:'Boxing', taken:[0,1,2,3,4,5,6,9,11,13,15], active:7},
      ],
      slots:['06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30'],
    },
  },
};


// ============================================================
// 5. TARIMA — Entretenimiento y Eventos (darkPremium / negro-magenta-oro)
// ============================================================
const BRAND_TARIMA = {
  slug:'tarima', brand:'Tarima',
  tagline:'El sistema para bares y salones de eventos donde no se pierde una sola comanda',
  giro:'bar y salón de eventos',
  giroPlural:'bares y salones de eventos',
  vibe:'darkPremium',

  palette:{
    bg:'#0A0612', surface:'#14081F', paper:'#1F0F2E',
    ink:'#F5F0E4', ink2:'#C4B8D6', muted:'#8B7B9E',
    line:'rgba(217,70,239,.25)', accent:'#D946EF', accent2:'#FACC15',
  },
  fonts:{display:'Oswald', body:'Inter', script:'Italianno', mono:'JetBrains Mono'},

  hero:{
    eyebrow:'Sistema POS para bares, antros y salones de eventos',
    h1:'Cada <em>copa</em>.<br>Cada <em>mesa</em>.<br>Cada <em>cover</em>.',
    deck:'Comandera por mesero, control de barra con KDS, reservas con depósito, división de cuenta múltiple. Para bares que cobran todo lo que sirven.',
    ctaPrimary:'Empezar gratis',
    ctaSecondary:'Ver barra en vivo',
    metaLine:'$0 inicial · setup en 5 min · cumple SAT y CFDI 4.0',
  },

  images:{
    hero:'https://images.unsplash.com/photo-1571266028243-d220bc1c5be9?w=1200&h=1600&fit=crop&q=85',
    heroAlt:'Bar moderno con iluminación neón',
    showcase:[
      {url:'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&h=900&fit=crop&q=80',tag:'Concierto en vivo',size:'lg'},
      {url:'https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=900&h=1200&fit=crop&q=80',tag:'Bar nocturno',size:'md'},
      {url:'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=900&h=1200&fit=crop&q=80',tag:'Luces y humo',size:'sm'},
      {url:'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=900&h=1200&fit=crop&q=80',tag:'Cocktail premium',size:'sm'},
      {url:'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=900&h=1200&fit=crop&q=80',tag:'Fiesta animada',size:'md'},
      {url:'https://images.unsplash.com/photo-1543349689-9a4d426bee8e?w=900&h=1200&fit=crop&q=80',tag:'Salón eventos',size:'sm'},
      {url:'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=1200&h=900&fit=crop&q=80',tag:'DJ en cabina',size:'md'},
      {url:'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=900&h=1200&fit=crop&q=80',tag:'Cocktail bar',size:'sm'},
      {url:'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1200&h=900&fit=crop&q=80',tag:'Mixología',size:'md'},
    ],
    context:[
      {url:'https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=800&h=600&fit=crop&q=80',caption:'Mesero toma orden con tablet'},
      {url:'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=600&fit=crop&q=80',caption:'KDS de barra muestra órdenes'},
      {url:'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=800&h=600&fit=crop&q=80',caption:'Cover cobrado con pulsera RFID'},
    ],
  },

  features:[
    {ico:'monitor',  h:'KDS de barra', d:'Cada bebida pedida cae directo a la barra. Sin papelitos, sin gritos, sin "se me olvidó".'},
    {ico:'grid',     h:'Plano de mesas con reservas', d:'Mesa 4 ocupada por X, mesa 7 reservada para fulano. Visual, drag-and-drop.'},
    {ico:'bookmark', h:'Reservas con depósito', d:'Cliente reserva mesa VIP con 50% de anticipo. No paga, no hay mesa. Cero no-shows que matan tu noche.'},
    {ico:'split',    h:'División de cuenta múltiple', d:'Por persona, por mesa, por consumo, por bote. Sin calculadora, sin discusiones a las 3am.'},
    {ico:'shield',   h:'Cover y pulseras RFID', d:'Cover cobrado en la entrada genera pulsera. Sin pulsera, sin barra. Sin escapatorias.'},
    {ico:'gift',     h:'Cortesías con autorización', d:'VIPs y cortesías exigen PIN del gerente desde su celular. Reporte mensual de cortesías por turno.'},
  ],

  stats:[
    {v:'47',  l:'Mesas operando'},
    {v:'92',  l:'Reservas confirmadas', suffix:'%'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote:{
    text:'Las noches buenas hacíamos $80,000 en barra. <span class="hl">Pero faltaban 30 botellas al final del mes que nadie cobró</span>. Con Tarima, cada bebida sale solo con folio. La merma bajó de 15% a 2% en 3 semanas.',
    sig:'Jorge Macedo',
    role:'Bar en Calzada del Valle · San Pedro, NL',
  },

  thefts:[
    {
      title:'Comandas que la barra "no recibió"',
      rob:'Mesero pide 5 cervezas, la barra sirve 6 (una se la lleva el mesero). O la barra sirve 5 pero solo cobra 4. En bares ocupados: $3,000-8,000 al mes en bebidas que nadie cobró.',
      fix:'<strong>Cada bebida sale solo con folio del KDS</strong>. Barra no sirve sin orden registrada. Cada noche se cuentan botellas vs comandas. Diferencia dispara alerta.',
    },
    {
      title:'Cover cobrado sin registrar',
      rob:'El que cobra cover en la puerta se queda con efectivo, deja entrar al cliente sin pulsera. Tú no sabes cuánta gente entró realmente. Pérdidas: $5,000-15,000 por noche buena.',
      fix:'Cover se cobra con <strong>terminal portátil que genera pulsera con código único</strong>. Pulsera obligatoria para barra. Sin pulsera, no hay servicio. Conteo automático en puerta.',
    },
    {
      title:'Cortesías a "amigos del dueño" sin autorización',
      rob:'"Es amigo del dueño, déjame entrar a la mesa VIP". Cliente consume $4,000 y se va porque "era cortesía". Tú no autorizaste nada. Pasa una vez a la semana.',
      fix:'VIPs y cortesías exigen <strong>autorización del gerente vía WhatsApp con foto del cliente</strong>. Sin código de autorización, mesa VIP cobra normal. Reporte mensual.',
    },
  ],

  liveDemo:{
    type:'kds',
    eyebrow:'En vivo desde tu barra',
    title:'Tu KDS de barra, <em>servida</em> en tiempo real',
    deck:'Cada orden cae directo a la barra. Con su cronómetro, sus mods, su mesa. Barra sirve lo que ve, no lo que recuerda.',
    secondary:'Mesa 04 esperando 3 minutos? Roja. Mesa 7 lista? Verde. Cero "se me chispoteó", cero comandas perdidas.',
    data:{
      orders:[
        {mesa:4, time:'23:42', state:'urgent', wait:'03:24', items:['3× Cerveza Modelo','2× Tequila Reposado','1× Margarita|+ sal']},
        {mesa:12, time:'23:44', state:'prep', wait:'01:08', items:['1× Mezcal Doble','2× Vodka Tonic','1× Whisky en las rocas']},
        {mesa:7, time:'23:38', state:'ready', wait:'SERVIR', items:['2× Cocktail Especial','1× Cerveza|+ limón y sal']},
        {mesa:15, time:'23:44', state:'queue', wait:'00:42', items:['1× Botella Tequila','4× Chasers']},
      ],
    },
  },
};


// ============================================================


// =============================================================
// SOCIAL PROOF — toasts que rotan en todas las landings
// =============================================================
const SOCIAL_PROOF = [
  {brand:'Comandero', biz:'Taquería El Pastor',  city:'Guadalajara, JAL', when:'hace 3 min'},
  {brand:'Navaja',    biz:'Barbershop Cuts',     city:'San Pedro, NL',    when:'hace 12 min'},
  {brand:'Pareo',     biz:'Calzado La Bota',     city:'Apodaca, NL',      when:'hace 28 min'},
  {brand:'Receta',    biz:'Farmacia Salud+',     city:'Escobedo, NL',     when:'hace 45 min'},
  {brand:'Tendito',   biz:'Abarrotes Doña Mary', city:'León, GTO',        when:'hace 1 hr'},
  {brand:'Pulso',     biz:'Consultorio Dr. Vega',city:'Mérida, YUC',      when:'hace 8 min'},
  {brand:'Brillo',    biz:'Salón Karla',         city:'Querétaro, QRO',   when:'hace 22 min'},
  {brand:'Folio',     biz:'Despacho Mendoza',    city:'CDMX',             when:'hace 35 min'},
  {brand:'Forja',     biz:'Gym El Box',          city:'Tijuana, BC',      when:'hace 50 min'},
  {brand:'Tarima',    biz:'Bar Calzada',         city:'San Pedro, NL',    when:'hace 1 hr'},
];

// =============================================================
// REGISTRO DE TODAS LAS MARCAS
// =============================================================
const BRANDS = {
  pareo:     BRAND_PAREO,
  comandero: BRAND_COMANDERO,
  navaja:    BRAND_NAVAJA,
  receta:    BRAND_RECETA,
  tendito:   BRAND_TENDITO,
  pulso:     BRAND_PULSO,
  brillo:    BRAND_BRILLO,
  folio:     BRAND_FOLIO,
  forja:     BRAND_FORJA,
  tarima:    BRAND_TARIMA,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BRANDS, SOCIAL_PROOF };
}
