// B17 fix: guard contra doble carga (giros_catalog.js + giros_catalog_v2.js)
(function() {
  if (typeof window !== 'undefined' && window.GIROS_V2 && window.GIROS_V2.length > 0) return;

/* ============================================================
   VOLVIX · Catálogo de Giros v2
   Cada giro tiene:
   - 3 a 6 PAIN POINTS específicos pensados como el DUEÑO del negocio
   - Visual único (colores, emoji hero, mockup)
   - Terminología correcta
   - Módulos recomendados
   - Testimonio y nombre del sistema personalizado
   ============================================================ */

const GIROS_V2 = [
  // ============== ALIMENTOS ==============
  {
    key: 'restaurante', name: 'Restaurante', plural: 'los restaurantes', icon: '🍽️',
    systemName: 'RestauPro', domain: 'restauranpro.com',
    category: 'alimentos', color: '#DC2626', accent: '#FEE2E2',
    hero: { bg: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 50%, #FFEDD5 100%)', emoji: '🍽️', pattern: 'food' },
    terms: { customer: 'Comensal', product: 'Platillo', sale: 'Comanda', ticket: 'Cuenta', location: 'Mesa', employee: 'Mesero' },
    pains: [
      { icon: '📋', title: 'Comandas sin errores', desc: 'Los meseros toman la orden en el celular, la cocina la imprime al instante. Sin malentendidos ni platillos perdidos.' },
      { icon: '💸', title: 'Control de merma', desc: 'Cuánta carne, bebida o insumo se perdió este mes. Detecta robos antes de que te vacíen la alacena.' },
      { icon: '🪑', title: 'Rotación de mesas', desc: 'Qué mesa lleva 40 min sin pedir, cuál ya pidió la cuenta, cuál está libre. Todo en un solo tablero en vivo.' },
      { icon: '💰', title: 'Propinas transparentes', desc: 'Cada mesero sabe cuánto llevó de propina este turno. Cero pleitos, cero dudas.' },
      { icon: '👨‍🍳', title: 'KDS en cocina', desc: 'Pantalla en cocina con timers. Si un platillo lleva más de 12 min, se pone en rojo.' },
      { icon: '📊', title: 'Platillo estrella / peor', desc: 'Qué se vende más, qué no se vende. Dejas de tener ese platillo muerto que solo te ocupa inventario.' },
    ],
    modules: ['pos', 'comandera', 'kds', 'mesas', 'inventario', 'reportes', 'corte', 'facturacion'],
  },
  {
    key: 'taqueria', name: 'Taquería', plural: 'las taquerías', icon: '🌮',
    systemName: 'TaquerosPro', domain: 'taqueriapro.com',
    category: 'alimentos', color: '#EA580C', accent: '#FFEDD5',
    hero: { bg: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)', emoji: '🌮', pattern: 'tacos' },
    terms: { customer: 'Cliente', product: 'Taco', sale: 'Orden', ticket: 'Ticket', employee: 'Taquero' },
    pains: [
      { icon: '⚡', title: 'Cobro al vuelo', desc: 'El cliente pide 5 de pastor, 3 de suadero, refrescos. Tú cobras en 15 segundos sin errores.' },
      { icon: '🔥', title: 'Control del trompo', desc: 'Cuántos kilos de pastor rendiste, cuánto dinero hiciste. Margen real por tipo de taco.' },
      { icon: '🌃', title: 'Turno nocturno', desc: 'Quién abrió, quién cerró, cuánto efectivo entregó. Corte automático al terminar turno.' },
      { icon: '📱', title: 'Pedidos por WhatsApp', desc: 'Tus clientes frecuentes piden por WhatsApp, tú cobras como cualquier venta. Todo queda registrado.' },
    ],
    modules: ['pos', 'reportes', 'corte', 'inventario', 'whatsapp'],
  },
  {
    key: 'pizzeria', name: 'Pizzería', plural: 'las pizzerías', icon: '🍕',
    systemName: 'PizzaPOS', domain: 'pizzapos.com',
    category: 'alimentos', color: '#B91C1C', accent: '#FEE2E2',
    hero: { bg: 'linear-gradient(135deg, #FEE2E2 0%, #FEF3C7 100%)', emoji: '🍕', pattern: 'pizza' },
    terms: { customer: 'Cliente', product: 'Pizza', sale: 'Orden', ticket: 'Ticket', employee: 'Pizzero' },
    pains: [
      { icon: '🛵', title: 'Delivery integrado', desc: 'Rappi, Uber Eats, DiDi + tu repartidor. Todas las órdenes en un solo tablero con timer.' },
      { icon: '🍕', title: 'Builder de pizza', desc: 'Masa + 3 ingredientes + 2 extras. Calcula el precio automático sin que el cajero se equivoque.' },
      { icon: '📞', title: 'Pedidos telefónicos', desc: 'El cliente habla, tú capturas, sale direccíon automática a la ruta del motorista.' },
      { icon: '🏆', title: 'Top combos del mes', desc: 'Qué combo sale más. Ajusta precios para subir margen sin perder clientes.' },
    ],
    modules: ['pos', 'delivery', 'cocina', 'reportes', 'whatsapp'],
  },
  {
    key: 'cafeteria', name: 'Cafetería', plural: 'las cafeterías', icon: '☕',
    systemName: 'CafeStudio', domain: 'cafestudio.com',
    category: 'alimentos', color: '#78350F', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)', emoji: '☕', pattern: 'coffee' },
    terms: { customer: 'Cliente', product: 'Bebida', sale: 'Orden', ticket: 'Ticket', employee: 'Barista' },
    pains: [
      { icon: '☕', title: 'Modificadores de bebida', desc: 'Latte + leche de almendra + 2 shots extra + descafeinado. Personalización total sin liarte.' },
      { icon: '🎟️', title: 'Tarjeta de 10 cafés', desc: 'Programa de lealtad automático. Al décimo café, gratis. Sin tarjetitas de papel.' },
      { icon: '📱', title: 'Pedir y pagar por QR', desc: 'El cliente escanea, pide desde su mesa, paga. Tú solo entregas.' },
      { icon: '🌅', title: 'Hora pico del desayuno', desc: 'Cuánto vendiste entre 7 y 10 am. Ajusta personal y prepara bebidas con anticipación.' },
    ],
    modules: ['pos', 'comandera', 'lealtad', 'reportes'],
  },
  {
    key: 'panaderia', name: 'Panadería', plural: 'las panaderías', icon: '🍞',
    systemName: 'PanaderoPro', domain: 'panaderopro.com',
    category: 'alimentos', color: '#D97706', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)', emoji: '🍞', pattern: 'bread' },
    terms: { customer: 'Cliente', product: 'Pan', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '🥖', title: 'Venta a granel y por pieza', desc: 'Pan dulce por pieza, pan integral por kilo, galletas por bolsa. Cada uno con su precio.' },
      { icon: '🌅', title: 'Producción del día', desc: 'Cuánto horneaste, cuánto vendiste, cuánto sobró. La merma de cada mañana clara.' },
      { icon: '📞', title: 'Pedidos para eventos', desc: 'Pasteles de cumpleaños, órdenes de bolillos para restaurantes. Con fecha de entrega y abono.' },
    ],
    modules: ['pos', 'granel', 'inventario', 'reportes', 'corte'],
  },
  {
    key: 'pasteleria', name: 'Pastelería', plural: 'las pastelerías', icon: '🎂',
    systemName: 'PastelMX', domain: 'pastelmx.com',
    category: 'alimentos', color: '#DB2777', accent: '#FCE7F3',
    hero: { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FFFFFF 100%)', emoji: '🎂', pattern: 'cake' },
    terms: { customer: 'Cliente', product: 'Pastel', sale: 'Pedido', ticket: 'Orden' },
    pains: [
      { icon: '📅', title: 'Agenda de entregas', desc: 'Qué pasteles entregas hoy, cuáles mañana. Con hora, dirección y teléfono del cliente.' },
      { icon: '💳', title: 'Anticipos y finiquitos', desc: 'El cliente dio el 50% al pedir. Registras el abono, controlas quién ya finiquitó.' },
      { icon: '🎨', title: 'Diseños personalizados', desc: 'Sube foto del pastel que quiere el cliente. Queda adjunto en la orden para tu repostero.' },
    ],
    modules: ['pos', 'pedidos', 'credito', 'clientes', 'reportes'],
  },
  {
    key: 'heladeria', name: 'Heladería', plural: 'las heladerías', icon: '🍦',
    systemName: 'HeladoMX', domain: 'heladomx.com',
    category: 'alimentos', color: '#EC4899', accent: '#FCE7F3',
    hero: { bg: 'linear-gradient(135deg, #FCE7F3 0%, #DBEAFE 100%)', emoji: '🍦', pattern: 'icecream' },
    terms: { customer: 'Cliente', product: 'Helado', sale: 'Orden', ticket: 'Ticket' },
    pains: [
      { icon: '🍨', title: 'Sabores y tamaños', desc: 'Bola, doble, triple, cono, vaso, nieve. Cada combinación con su precio automático.' },
      { icon: '🌡️', title: 'Ventas por temporada', desc: 'Qué tanto baja tu venta en invierno vs verano. Planea promociones según el clima.' },
      { icon: '🎁', title: 'Add-ons rentables', desc: 'Chispas, frutas, jarabes. Cuánto margen extra te da cada topping.' },
    ],
    modules: ['pos', 'modificadores', 'reportes'],
  },
  {
    key: 'tortilleria', name: 'Tortillería', plural: 'las tortillerías', icon: '🫓',
    systemName: 'TortiPro', domain: 'tortipro.com',
    category: 'alimentos', color: '#CA8A04', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)', emoji: '🫓', pattern: 'tortilla' },
    terms: { customer: 'Cliente', product: 'Tortilla', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '⚖️', title: 'Pesa y cobra', desc: 'Báscula integrada. El cliente dice medio kilo, la báscula pesa, el ticket sale solo.' },
      { icon: '📦', title: 'Masa diaria', desc: 'Cuánta masa usaste, cuántas tortillas salieron. Rendimiento real por saco.' },
      { icon: '🔔', title: 'Clientes de rutina', desc: 'Don Pepe compra 1 kg cada mañana. El sistema lo reconoce y agiliza el cobro.' },
    ],
    modules: ['pos', 'granel', 'reportes', 'clientes'],
  },

  // ============== BELLEZA ==============
  {
    key: 'barberia', name: 'Barbería', plural: 'las barberías', icon: '💈',
    systemName: 'BarberPro', domain: 'barberpro.com',
    category: 'belleza', color: '#1E40AF', accent: '#DBEAFE',
    hero: { bg: 'linear-gradient(135deg, #1E3A8A 0%, #000000 100%)', emoji: '💈', pattern: 'barber', dark: true },
    terms: { customer: 'Cliente', product: 'Servicio', sale: 'Cita', ticket: 'Ticket', location: 'Silla', employee: 'Barbero' },
    pains: [
      { icon: '📅', title: 'Agenda por barbero', desc: 'Cada barbero ve su agenda del día. El cliente llega, el sistema ya sabe a quién atenderlo.' },
      { icon: '💰', title: 'Comisiones claras', desc: 'Cada barbero sabe cuánto hizo del corte, cuánto de productos, cuánto de propinas. Se acaba el pleito de fin de semana.' },
      { icon: '📱', title: 'Reservas por WhatsApp', desc: 'El cliente reserva en línea. Le llega recordatorio 2 horas antes. Menos huecos en tu calendario.' },
      { icon: '⭐', title: 'Cliente VIP', desc: 'Don Juan viene cada 2 semanas. El sistema te avisa que no ha venido en 3, mandas mensaje automático.' },
    ],
    modules: ['pos', 'citas', 'empleados', 'comisiones', 'clientes', 'whatsapp', 'reportes'],
  },
  {
    key: 'estetica', name: 'Estética unisex', plural: 'las estéticas', icon: '✂️',
    systemName: 'EsteticaPro', domain: 'esteticapro.com',
    category: 'belleza', color: '#EC4899', accent: '#FCE7F3',
    hero: { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FEF3C7 100%)', emoji: '💇‍♀️', pattern: 'salon' },
    terms: { customer: 'Cliente', product: 'Servicio', sale: 'Cita', ticket: 'Comprobante', employee: 'Estilista' },
    pains: [
      { icon: '🗓️', title: 'Agenda visual por estilista', desc: 'Ves en un solo tablero quién está con cliente, quién libre, a qué hora viene el siguiente.' },
      { icon: '🎨', title: 'Historial de color', desc: 'Qué tinte usaste en Doña Martha la vez pasada, qué producto compró. Nada se te olvida.' },
      { icon: '💸', title: 'Comisiones mixtas', desc: 'Corte paga 40%, productos 15%, tintes 30%. Cada servicio con su comisión.' },
      { icon: '📸', title: 'Antes y después', desc: 'Sube fotos del trabajo. Perfecto para tu Instagram y para mostrar a clientes nuevos.' },
    ],
    modules: ['pos', 'citas', 'empleados', 'comisiones', 'clientes', 'inventario', 'whatsapp'],
  },
  {
    key: 'spa', name: 'Spa', plural: 'los spas', icon: '🧖',
    systemName: 'SpaWell', domain: 'spawell.mx',
    category: 'belleza', color: '#059669', accent: '#D1FAE5',
    hero: { bg: 'linear-gradient(135deg, #D1FAE5 0%, #DBEAFE 100%)', emoji: '🧖‍♀️', pattern: 'spa' },
    terms: { customer: 'Huésped', product: 'Tratamiento', sale: 'Reserva', ticket: 'Comprobante', employee: 'Terapeuta' },
    pains: [
      { icon: '🌿', title: 'Paquetes multi-tratamiento', desc: 'Facial + masaje + manicure. Un solo paquete, un solo precio, una sola reserva.' },
      { icon: '🎁', title: 'Gift cards', desc: 'Vendes un tratamiento como regalo. El que lo recibe canjea cuando quiere sin dramas.' },
      { icon: '⏰', title: 'Tiempo de cabina', desc: 'Cada tratamiento dura X. El sistema reserva esa cabina exactamente. No se traslapan.' },
    ],
    modules: ['pos', 'citas', 'empleados', 'giftcards', 'clientes', 'whatsapp'],
  },
  {
    key: 'nails', name: 'Salón de uñas', plural: 'los salones de uñas', icon: '💅',
    systemName: 'NailStudio', domain: 'nailstudio.mx',
    category: 'belleza', color: '#BE185D', accent: '#FCE7F3',
    hero: { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FFFFFF 100%)', emoji: '💅', pattern: 'nails' },
    terms: { customer: 'Cliente', product: 'Servicio', sale: 'Cita', ticket: 'Ticket', employee: 'Manicurista' },
    pains: [
      { icon: '🎨', title: 'Catálogo de diseños', desc: 'Muestra los diseños en tablet. La cliente elige, queda registrado en su historial.' },
      { icon: '⏱️', title: 'Tiempo por servicio', desc: 'Acrílicas 90 min, gelish 60 min, pedicure 45 min. Agenda se bloquea automático.' },
      { icon: '💎', title: 'Materiales usados', desc: 'Qué gel, qué decoración, qué glitter. Calculas margen real y reordenas a tiempo.' },
    ],
    modules: ['pos', 'citas', 'inventario', 'empleados', 'clientes'],
  },
  {
    key: 'tatuajes', name: 'Estudio de tatuajes', plural: 'los estudios de tatuajes', icon: '🖋️',
    systemName: 'InkStudio', domain: 'inkstudio.mx',
    category: 'belleza', color: '#0F172A', accent: '#E2E8F0',
    hero: { bg: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)', emoji: '🖋️', pattern: 'tattoo', dark: true },
    terms: { customer: 'Cliente', product: 'Tatuaje', sale: 'Sesión', ticket: 'Recibo', employee: 'Tatuador' },
    pains: [
      { icon: '📐', title: 'Cotización por tamaño', desc: 'Tatuaje pequeño $800, mediano $2,500, grande $8,000+. Cotiza y guarda.' },
      { icon: '📝', title: 'Liberación firmada', desc: 'Formato de responsabilidad digital. El cliente firma en tablet, queda en su expediente.' },
      { icon: '📸', title: 'Portfolio por tatuador', desc: 'Cada artista tiene su galería. Los clientes eligen a quién quieren antes de reservar.' },
    ],
    modules: ['pos', 'citas', 'empleados', 'comisiones', 'clientes', 'expedientes'],
  },

  // ============== SALUD ==============
  {
    key: 'farmacia', name: 'Farmacia', plural: 'las farmacias', icon: '💊',
    systemName: 'FarmaPro', domain: 'farmapro.com',
    category: 'salud', color: '#059669', accent: '#D1FAE5',
    hero: { bg: 'linear-gradient(135deg, #D1FAE5 0%, #FFFFFF 100%)', emoji: '💊', pattern: 'pharmacy' },
    terms: { customer: 'Cliente', product: 'Medicamento', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '📦', title: 'Control de caducidades', desc: 'El sistema te avisa 60 días antes cuál medicamento vence. Devuelves o rematas a tiempo.' },
      { icon: '🧾', title: 'Receta y factura SAT', desc: 'Vendes, emites factura, queda en la nube. Lo que el IMSS o cualquiera te pida.' },
      { icon: '🩺', title: 'Consulta médica integrada', desc: 'Doctor da consulta, receta, tú vendes los medicamentos. Todo en el mismo ticket.' },
      { icon: '⚕️', title: 'Control de controlados', desc: 'Libro de sustancias controladas digital. SSA te pide, tú imprimes en 10 segundos.' },
    ],
    modules: ['pos', 'inventario', 'caducidades', 'facturacion', 'clientes', 'consultas'],
  },
  {
    key: 'clinica_dental', name: 'Clínica dental', plural: 'las clínicas dentales', icon: '🦷',
    systemName: 'DentalPro', domain: 'dentalpro.mx',
    category: 'salud', color: '#0891B2', accent: '#CFFAFE',
    hero: { bg: 'linear-gradient(135deg, #CFFAFE 0%, #FFFFFF 100%)', emoji: '🦷', pattern: 'dental' },
    terms: { customer: 'Paciente', product: 'Tratamiento', sale: 'Consulta', ticket: 'Recibo', employee: 'Dentista' },
    pains: [
      { icon: '🦷', title: 'Odontograma digital', desc: 'Marca sobre el diagrama qué diente tiene caries, cuál ya se trató. Histórico completo.' },
      { icon: '💵', title: 'Tratamientos en pagos', desc: 'Ortodoncia $30,000 en 12 mensualidades. El sistema cobra cada mes automático.' },
      { icon: '📅', title: 'Citas de seguimiento', desc: 'Limpieza cada 6 meses. El sistema le avisa al paciente solo, tú no tienes que recordar.' },
      { icon: '📸', title: 'Radiografías y fotos', desc: 'Todas las radiografías del paciente en su expediente. No se pierden en papel.' },
    ],
    modules: ['pos', 'citas', 'expedientes', 'credito', 'facturacion', 'whatsapp'],
  },
  {
    key: 'veterinaria', name: 'Veterinaria', plural: 'las veterinarias', icon: '🐶',
    systemName: 'VetPro', domain: 'vetpro.mx',
    category: 'salud', color: '#CA8A04', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #D1FAE5 100%)', emoji: '🐶', pattern: 'pets' },
    terms: { customer: 'Dueño', product: 'Servicio', sale: 'Consulta', ticket: 'Recibo', employee: 'Veterinario' },
    pains: [
      { icon: '🐾', title: 'Expediente por mascota', desc: 'Firulais tiene su propio historial: vacunas, desparasitaciones, cirugías. Nada se pierde.' },
      { icon: '💉', title: 'Calendario de vacunas', desc: 'El sistema le avisa al dueño que su perro necesita refuerzo. Clientes agradecen.' },
      { icon: '💊', title: 'Farmacia veterinaria', desc: 'Vendes medicamento, tú mismo registras la receta. Control de stock automático.' },
      { icon: '🏠', title: 'Pensión y estética', desc: 'Servicios extra como baño, corte, hospedaje. Todo en el mismo expediente.' },
    ],
    modules: ['pos', 'citas', 'expedientes', 'inventario', 'clientes', 'whatsapp'],
  },
  {
    key: 'optica', name: 'Óptica', plural: 'las ópticas', icon: '👓',
    systemName: 'OpticaPro', domain: 'opticapro.mx',
    category: 'salud', color: '#7C3AED', accent: '#EDE9FE',
    hero: { bg: 'linear-gradient(135deg, #EDE9FE 0%, #FFFFFF 100%)', emoji: '👓', pattern: 'optic' },
    terms: { customer: 'Paciente', product: 'Lente', sale: 'Venta', ticket: 'Comprobante' },
    pains: [
      { icon: '👁️', title: 'Graduación del paciente', desc: 'Esfera, cilindro, eje, distancia interpupilar. Todo lo que el laboratorio necesita.' },
      { icon: '🕐', title: 'Tiempo de entrega', desc: 'Lentes listos en 5 días. El sistema notifica al cliente cuando llegan.' },
      { icon: '💳', title: 'Apartados con anticipo', desc: '30% anticipo, 70% al entregar. Control de saldos pendientes automático.' },
    ],
    modules: ['pos', 'pedidos', 'credito', 'clientes', 'inventario'],
  },

  // ============== RETAIL ==============
  {
    key: 'abarrotes', name: 'Abarrotes', plural: 'los abarrotes', icon: '🏪',
    systemName: 'SalvadoreX', domain: 'salvadorex.com',
    category: 'retail', color: '#EA580C', accent: '#FFEDD5',
    hero: { bg: 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%)', emoji: '🏪', pattern: 'store' },
    terms: { customer: 'Cliente', product: 'Producto', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '📦', title: 'Inventario sin papel', desc: 'Sabes exactamente cuánto Coca tienes, cuánto te falta. Se acabó el "creo que tengo".' },
      { icon: '💳', title: 'Fiados controlados', desc: 'Don Pepe te debe $840. Lo ves al instante, le mandas recordatorio por WhatsApp.' },
      { icon: '📱', title: 'Recargas y servicios', desc: 'Recargas Telcel, pago de luz, depósitos. Cada transacción te deja comisión.' },
      { icon: '🏆', title: 'Productos estrella', desc: 'Qué se vende más, qué está muerto. Dejas de comprar lo que no rota.' },
    ],
    modules: ['pos', 'inventario', 'credito', 'clientes', 'recargas', 'reportes', 'corte'],
  },
  {
    key: 'minisuper', name: 'Minisúper', plural: 'los minisúpers', icon: '🛒',
    systemName: 'MiniMarketPro', domain: 'minimarketpro.com',
    category: 'retail', color: '#0369A1', accent: '#DBEAFE',
    hero: { bg: 'linear-gradient(135deg, #DBEAFE 0%, #FFFFFF 100%)', emoji: '🛒', pattern: 'supermarket' },
    terms: { customer: 'Cliente', product: 'Producto', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '🏷️', title: 'Códigos de barras', desc: 'Imprime tus propias etiquetas. Producto sin código barata, con código rapidísimo.' },
      { icon: '👨‍👩‍👧', title: 'Varias cajas', desc: '2 o 3 cajas sincronizadas. Todas venden, todas tienen el mismo inventario en vivo.' },
      { icon: '📊', title: 'Ventas por categoría', desc: 'Qué deja más margen: abarrotes, bebidas, higiene. Enfocas compras en lo rentable.' },
    ],
    modules: ['pos', 'inventario', 'multicaja', 'reportes', 'corte'],
  },
  {
    key: 'papeleria', name: 'Papelería', plural: 'las papelerías', icon: '✏️',
    systemName: 'PapelMX', domain: 'papelmx.com',
    category: 'retail', color: '#6366F1', accent: '#E0E7FF',
    hero: { bg: 'linear-gradient(135deg, #E0E7FF 0%, #FFFFFF 100%)', emoji: '✏️', pattern: 'school' },
    terms: { customer: 'Cliente', product: 'Producto', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '📚', title: 'Temporada escolar', desc: 'En agosto vendes más. El sistema te sugiere qué comprar antes del regreso a clases.' },
      { icon: '📠', title: 'Impresiones y copias', desc: 'Cobra por hoja, por bloque, a color o B/N. Se integra con tu venta normal.' },
      { icon: '🎁', title: 'Kits escolares', desc: 'Combo de útiles para primero de primaria. Un solo código, precio fijo.' },
    ],
    modules: ['pos', 'inventario', 'kits', 'reportes'],
  },
  {
    key: 'fruteria', name: 'Frutería', plural: 'las fruterías', icon: '🍎',
    systemName: 'FruteroPro', domain: 'fruteropro.com',
    category: 'retail', color: '#65A30D', accent: '#ECFCCB',
    hero: { bg: 'linear-gradient(135deg, #ECFCCB 0%, #FFFFFF 100%)', emoji: '🍎', pattern: 'fruits' },
    terms: { customer: 'Cliente', product: 'Fruta', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '⚖️', title: 'Venta por kilo', desc: 'Cliente pone la bolsa en la báscula. El sistema pesa, cobra, imprime ticket.' },
      { icon: '🥑', title: 'Merma de frescos', desc: 'Cuántos aguacates se pudrieron esta semana. Ajusta pedidos para no perder dinero.' },
      { icon: '📅', title: 'Precios de temporada', desc: 'El mango está barato en mayo, caro en diciembre. Actualiza precios cada semana sin drama.' },
    ],
    modules: ['pos', 'granel', 'inventario', 'reportes'],
  },
  {
    key: 'carniceria', name: 'Carnicería', plural: 'las carnicerías', icon: '🥩',
    systemName: 'CarniPro', domain: 'carnipro.com',
    category: 'retail', color: '#991B1B', accent: '#FEE2E2',
    hero: { bg: 'linear-gradient(135deg, #FEE2E2 0%, #FFFFFF 100%)', emoji: '🥩', pattern: 'meat' },
    terms: { customer: 'Cliente', product: 'Carne', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '⚖️', title: 'Báscula conectada', desc: 'Pones la carne, el sistema lee el peso, calcula y cobra. Nada se teclea mal.' },
      { icon: '🥩', title: 'Cortes y rendimiento', desc: 'De 1 res sacas X kg de arrachera, Y kg de molida, Z kg de hueso. Margen real por corte.' },
      { icon: '🔪', title: 'Pedidos para carne asada', desc: 'Cliente pide 3kg arrachera, 2kg chorizo, 1kg chuleta. Empacas, cobras, entregas.' },
    ],
    modules: ['pos', 'granel', 'inventario', 'reportes', 'pedidos'],
  },
  {
    key: 'polleria', name: 'Pollería', plural: 'las pollerías', icon: '🐔',
    systemName: 'PollosExpress', domain: 'pollosexpress.mx',
    category: 'retail', color: '#CA8A04', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)', emoji: '🐔', pattern: 'chicken' },
    terms: { customer: 'Cliente', product: 'Pollo', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '🐔', title: 'Venta por pieza y kilo', desc: 'Pollo entero $180, medio $100, pechuga por kilo $70. Todo en un toque.' },
      { icon: '🌅', title: 'Pollo del día vs de ayer', desc: 'Lo del día vale más. Lo de ayer en promoción. El sistema te ayuda a rotar.' },
      { icon: '🔥', title: 'Rostizados y crudos', desc: 'Tienes dos negocios en uno. El sistema los separa pero te da el total general.' },
    ],
    modules: ['pos', 'granel', 'inventario', 'reportes', 'corte'],
  },

  // ============== SERVICIOS ==============
  {
    key: 'taller_mecanico', name: 'Taller mecánico', plural: 'los talleres mecánicos', icon: '🔧',
    systemName: 'TallerPro', domain: 'tallerpro.mx',
    category: 'servicios', color: '#1E3A8A', accent: '#DBEAFE',
    hero: { bg: 'linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)', emoji: '🔧', pattern: 'mechanic', dark: true },
    terms: { customer: 'Cliente', product: 'Servicio', sale: 'Orden', ticket: 'Orden de trabajo', employee: 'Mecánico' },
    pains: [
      { icon: '🚗', title: 'Orden por vehículo', desc: 'Cada carro con su placa, su historial, qué se le ha hecho, qué le toca.' },
      { icon: '📸', title: 'Fotos del problema', desc: 'El mecánico sube foto de la pieza dañada. El cliente la ve por WhatsApp antes de autorizar.' },
      { icon: '🔩', title: 'Refacciones usadas', desc: 'Qué pieza pusiste, costo, margen. Sabes cuánto ganas de verdad por servicio.' },
      { icon: '💬', title: 'Cotización aprobada', desc: 'Mandas cotización al WhatsApp del cliente. Él aprueba con un clic, tú empiezas a trabajar.' },
    ],
    modules: ['pos', 'ordenes_trabajo', 'inventario', 'clientes', 'whatsapp', 'empleados'],
  },
  {
    key: 'lavado_autos', name: 'Autolavado', plural: 'los autolavados', icon: '🚿',
    systemName: 'CarWashPro', domain: 'carwashpro.mx',
    category: 'servicios', color: '#0284C7', accent: '#DBEAFE',
    hero: { bg: 'linear-gradient(135deg, #DBEAFE 0%, #FFFFFF 100%)', emoji: '🚿', pattern: 'carwash' },
    terms: { customer: 'Cliente', product: 'Servicio', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '🚗', title: 'Paquetes de lavado', desc: 'Básico, premium, encerado, detallado. Cada uno con tiempo y precio fijo.' },
      { icon: '💳', title: 'Tarjetas de 10 lavados', desc: 'Compra 10, te regalo 1. Control automático en la base del cliente.' },
      { icon: '💼', title: 'Comisión al lavador', desc: 'Cada lavador ve cuánto hizo de comisión ese turno. Motivación y claridad.' },
    ],
    modules: ['pos', 'lealtad', 'empleados', 'comisiones', 'reportes'],
  },
  {
    key: 'servicio_celulares', name: 'Servicio técnico de celulares', plural: 'los servicios técnicos de celulares', icon: '📱',
    systemName: 'PhoneFix', domain: 'phonefix.mx',
    category: 'servicios', color: '#7C3AED', accent: '#EDE9FE',
    hero: { bg: 'linear-gradient(135deg, #EDE9FE 0%, #FFFFFF 100%)', emoji: '📱', pattern: 'phone' },
    terms: { customer: 'Cliente', product: 'Servicio', sale: 'Orden', ticket: 'Orden de servicio' },
    pains: [
      { icon: '📲', title: 'Orden por equipo', desc: 'IMEI, modelo, falla reportada, contraseña. Todo en la orden para evitar problemas.' },
      { icon: '💵', title: 'Presupuesto antes de reparar', desc: 'Cotizas, mandas al cliente. Solo si aprueba, procedes. Se acabaron los "no aprobé esto".' },
      { icon: '🔧', title: 'Garantía controlada', desc: '30 días de garantía por escrito. El sistema te avisa si el cliente vuelve en ese lapso.' },
    ],
    modules: ['pos', 'ordenes_trabajo', 'inventario', 'clientes'],
  },

  // ============== EDUCACIÓN ==============
  {
    key: 'colegio', name: 'Colegio', plural: 'los colegios', icon: '🏫',
    systemName: 'EduControl', domain: 'educontrol.mx',
    category: 'educacion', color: '#1D4ED8', accent: '#DBEAFE',
    hero: { bg: 'linear-gradient(135deg, #DBEAFE 0%, #FFFFFF 100%)', emoji: '🏫', pattern: 'school' },
    terms: { customer: 'Alumno', product: 'Colegiatura', sale: 'Pago', ticket: 'Recibo', employee: 'Maestro' },
    pains: [
      { icon: '💰', title: '¿Quién ya pagó, quién no?', desc: 'Lista clara de alumnos al corriente y morosos. Sabes a quién cobrarle esta semana.' },
      { icon: '📅', title: 'Mensualidades automáticas', desc: 'Cada primero de mes se generan los recibos. Mandas por WhatsApp al papá, él paga.' },
      { icon: '📈', title: 'Proyección de ingresos', desc: 'Cuánto recibirás el próximo mes si todos pagan. Planeación real de nómina.' },
      { icon: '👨‍👩‍👧', title: 'Descuentos por hermano', desc: '2º hijo 10%, 3º hijo 15%. El sistema aplica automático, sin errores.' },
      { icon: '📝', title: 'Pagos extra', desc: 'Uniforme, excursión, cuota de laboratorio. Además de la colegiatura normal.' },
      { icon: '🧾', title: 'Factura fiscal', desc: 'El papá pide factura deducible, tú emites con un clic. SAT contento.' },
    ],
    modules: ['pos', 'alumnos', 'colegiaturas', 'credito', 'facturacion', 'whatsapp'],
  },
  {
    key: 'gimnasio', name: 'Gimnasio', plural: 'los gimnasios', icon: '🏋️',
    systemName: 'GymPro', domain: 'gympro.mx',
    category: 'educacion', color: '#DC2626', accent: '#FEE2E2',
    hero: { bg: 'linear-gradient(135deg, #0F172A 0%, #DC2626 100%)', emoji: '🏋️', pattern: 'gym', dark: true },
    terms: { customer: 'Socio', product: 'Mensualidad', sale: 'Pago', ticket: 'Recibo' },
    pains: [
      { icon: '🔑', title: 'Acceso con huella/QR', desc: 'El socio pasa su huella o QR, el sistema checa si está al corriente y lo deja entrar.' },
      { icon: '💰', title: 'Mensualidades vencidas', desc: 'Quién ya se retrasó, a quién le toca renovar. Recordatorios automáticos por WhatsApp.' },
      { icon: '💪', title: 'Rutinas por entrenador', desc: 'Cada socio tiene su rutina asignada. El entrenador la actualiza desde su celular.' },
      { icon: '🥤', title: 'Tienda interna', desc: 'Suplementos, proteínas, ropa deportiva. Venta directa cargada a la cuenta del socio.' },
    ],
    modules: ['pos', 'socios', 'accesos', 'whatsapp', 'inventario'],
  },
  {
    key: 'escuela_idiomas', name: 'Escuela de idiomas', plural: 'las escuelas de idiomas', icon: '🗣️',
    systemName: 'IdiomasPro', domain: 'idiomaspro.mx',
    category: 'educacion', color: '#0891B2', accent: '#CFFAFE',
    hero: { bg: 'linear-gradient(135deg, #CFFAFE 0%, #FFFFFF 100%)', emoji: '🗣️', pattern: 'languages' },
    terms: { customer: 'Estudiante', product: 'Curso', sale: 'Inscripción', ticket: 'Recibo', employee: 'Profesor' },
    pains: [
      { icon: '📚', title: 'Niveles y grupos', desc: 'Básico, intermedio, avanzado. Cada grupo con su horario, profesor y lista de alumnos.' },
      { icon: '✅', title: 'Asistencia diaria', desc: 'El profesor pasa lista desde su celular. Los papás ven si el hijo fue o no.' },
      { icon: '💰', title: 'Pago por módulo', desc: 'Cada módulo de 3 meses. El sistema cobra antes de empezar el siguiente.' },
    ],
    modules: ['pos', 'alumnos', 'asistencia', 'colegiaturas', 'whatsapp'],
  },

  // ============== RENTAS ==============
  {
    key: 'renta_autos', name: 'Renta de autos', plural: 'las rentadoras de autos', icon: '🚙',
    systemName: 'RentCarPro', domain: 'rentcarpro.mx',
    category: 'rentas', color: '#1E40AF', accent: '#DBEAFE',
    hero: { bg: 'linear-gradient(135deg, #DBEAFE 0%, #FFFFFF 100%)', emoji: '🚙', pattern: 'car' },
    terms: { customer: 'Cliente', product: 'Vehículo', sale: 'Renta', ticket: 'Contrato' },
    pains: [
      { icon: '📅', title: 'Disponibilidad en vivo', desc: 'Qué auto está rentado, cuál libre, cuál en mantenimiento. Tablero visual tipo calendario.' },
      { icon: '📝', title: 'Contrato digital', desc: 'Datos del cliente, seguro, licencia, firma en tablet. Sin papeleo.' },
      { icon: '💳', title: 'Depósitos y extras', desc: 'Depósito en garantía, kilometraje extra, daños, gasolina. Cobro al final claro.' },
      { icon: '🔧', title: 'Servicios por auto', desc: 'Cada auto con su kilometraje, próximo servicio, última revisión. Flota cuidada.' },
    ],
    modules: ['pos', 'calendario', 'contratos', 'clientes', 'vehiculos'],
  },
  {
    key: 'renta_salones', name: 'Renta de salones', plural: 'los salones de eventos', icon: '🎊',
    systemName: 'SalonesPro', domain: 'salonespro.mx',
    category: 'rentas', color: '#DB2777', accent: '#FCE7F3',
    hero: { bg: 'linear-gradient(135deg, #FCE7F3 0%, #EDE9FE 100%)', emoji: '🎊', pattern: 'event' },
    terms: { customer: 'Cliente', product: 'Salón', sale: 'Reserva', ticket: 'Contrato' },
    pains: [
      { icon: '📅', title: 'Calendario de fechas', desc: 'Sábado 15 marzo, salón A, XV años. Todas las reservas del año en una vista.' },
      { icon: '💰', title: 'Anticipos y saldos', desc: '30% al reservar, 50% dos semanas antes, 20% el día. Control de pagos por evento.' },
      { icon: '📋', title: 'Paquetes todo-incluido', desc: 'Salón + mesas + sillas + mantelería + meseros. Un solo precio, todo armado.' },
    ],
    modules: ['pos', 'calendario', 'contratos', 'credito', 'clientes'],
  },

  // ============== PROFESIONALES ==============
  {
    key: 'foto_estudio', name: 'Estudio fotográfico', plural: 'los estudios fotográficos', icon: '📸',
    systemName: 'FotoPro', domain: 'fotopro.mx',
    category: 'profesionales', color: '#374151', accent: '#E5E7EB',
    hero: { bg: 'linear-gradient(135deg, #E5E7EB 0%, #FFFFFF 100%)', emoji: '📸', pattern: 'camera' },
    terms: { customer: 'Cliente', product: 'Sesión', sale: 'Servicio', ticket: 'Recibo' },
    pains: [
      { icon: '📅', title: 'Agenda de sesiones', desc: 'Bodas, XV, estudios. Cada sesión con su ubicación, hora y fotógrafo.' },
      { icon: '💾', title: 'Entrega digital', desc: 'Galería privada por cliente. Comparte el link, ellos descargan. Sin USBs perdidos.' },
      { icon: '💰', title: 'Paquetes y extras', desc: 'Paquete de 50 fotos, álbum físico, video highlight. Suma todo al final.' },
    ],
    modules: ['pos', 'agenda', 'credito', 'clientes'],
  },

  // ============== CONSTRUCCIÓN ==============
  {
    key: 'ferreteria', name: 'Ferretería', plural: 'las ferreterías', icon: '🔨',
    systemName: 'FerrePro', domain: 'ferrepro.mx',
    category: 'construccion', color: '#B45309', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)', emoji: '🔨', pattern: 'tools' },
    terms: { customer: 'Cliente', product: 'Producto', sale: 'Venta', ticket: 'Remisión' },
    pains: [
      { icon: '🔩', title: 'Inventario complejo', desc: 'Tornillos de 10 medidas, cables por metro, pintura por litro. Cada variante con su stock.' },
      { icon: '💳', title: 'Crédito a obras', desc: 'Maestros albañiles compran fiado. Control de saldos por cliente.' },
      { icon: '📋', title: 'Cotizaciones para obra', desc: 'Lista completa de materiales, descuentos por volumen, facturación a fin de mes.' },
    ],
    modules: ['pos', 'inventario', 'credito', 'cotizaciones', 'facturacion', 'proveedores'],
  },

  // ============== AUTOMOTRIZ ==============
  {
    key: 'gasolinera', name: 'Gasolinera', plural: 'las gasolineras', icon: '⛽',
    systemName: 'GasPro', domain: 'gaspro.mx',
    category: 'automotriz', color: '#065F46', accent: '#D1FAE5',
    hero: { bg: 'linear-gradient(135deg, #D1FAE5 0%, #FFFFFF 100%)', emoji: '⛽', pattern: 'gas' },
    terms: { customer: 'Cliente', product: 'Combustible', sale: 'Carga', ticket: 'Ticket' },
    pains: [
      { icon: '⛽', title: 'Litros por manguera', desc: 'Cada bomba reporta cuánto dispensó. Diferencia entre lo vendido y lo en tanque: merma real.' },
      { icon: '👨‍🏭', title: 'Despachador responsable', desc: 'Quién atendió cada carga. Si hay diferencia en corte, sabes exactamente quién.' },
      { icon: '🧾', title: 'Factura al momento', desc: 'Cliente pide factura, tú emites en 30 segundos. CFDI directo al SAT.' },
    ],
    modules: ['pos', 'inventario', 'facturacion', 'empleados', 'corte'],
  },

  // ============== ESPECIALES ==============
  {
    key: 'funeraria', name: 'Funeraria', plural: 'las funerarias', icon: '⚱️',
    systemName: 'ServiciosFunerariosPro', domain: 'serviciosfunerariospro.mx',
    category: 'otros', color: '#374151', accent: '#E5E7EB',
    hero: { bg: 'linear-gradient(135deg, #E5E7EB 0%, #FFFFFF 100%)', emoji: '⚱️', pattern: 'memorial' },
    terms: { customer: 'Familiar', product: 'Servicio', sale: 'Contrato', ticket: 'Comprobante' },
    pains: [
      { icon: '📋', title: 'Planes preventivos', desc: 'Familias contratan con anticipación. Control de pagos mensuales hasta completar.' },
      { icon: '🕯️', title: 'Servicios del día', desc: 'Velatorio, traslado, cremación, sepultura. Cada servicio con su costo claro.' },
    ],
    modules: ['pos', 'contratos', 'credito', 'clientes'],
  },
  {
    key: 'casa_empeño', name: 'Casa de empeño', plural: 'las casas de empeño', icon: '💰',
    systemName: 'EmpePro', domain: 'empepro.mx',
    category: 'otros', color: '#CA8A04', accent: '#FEF3C7',
    hero: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)', emoji: '💰', pattern: 'pawn' },
    terms: { customer: 'Cliente', product: 'Prenda', sale: 'Empeño', ticket: 'Boleta' },
    pains: [
      { icon: '💍', title: 'Prenda en garantía', desc: 'Foto de la prenda, descripción, avalúo. Todo en su boleta digital con código QR.' },
      { icon: '📅', title: 'Vencimientos', desc: 'Cuándo vence cada empeño, a quién cobrarle intereses, qué está por vencer.' },
      { icon: '💵', title: 'Intereses y refrendos', desc: 'Cliente paga interés, renueva el empeño. Control automático de saldos.' },
    ],
    modules: ['pos', 'empeños', 'clientes', 'vencimientos'],
  },
  {
    key: 'purificadora', name: 'Purificadora de agua', plural: 'las purificadoras', icon: '💧',
    systemName: 'AguaPura', domain: 'aguapurapro.mx',
    category: 'otros', color: '#0891B2', accent: '#CFFAFE',
    hero: { bg: 'linear-gradient(135deg, #CFFAFE 0%, #FFFFFF 100%)', emoji: '💧', pattern: 'water' },
    terms: { customer: 'Cliente', product: 'Garrafón', sale: 'Venta', ticket: 'Ticket' },
    pains: [
      { icon: '🚚', title: 'Rutas de reparto', desc: 'Cada repartidor con sus clientes del día, su ruta, su ticket de caja.' },
      { icon: '💳', title: 'Garrafón en depósito', desc: 'Cliente deja garrafón vacío, paga $20 por el lleno. Control de envases.' },
      { icon: '📞', title: 'Pedidos por WhatsApp', desc: 'Cliente pide por WhatsApp, tú asignas al repartidor más cercano.' },
    ],
    modules: ['pos', 'rutas', 'clientes', 'whatsapp', 'envases'],
  },
];

// ============== CATEGORÍAS ==============
const GIROS_CATEGORIES_V2 = {
  alimentos: { name: 'Alimentos y Bebidas', icon: '🍴', color: '#DC2626' },
  belleza: { name: 'Belleza y Estética', icon: '💄', color: '#EC4899' },
  salud: { name: 'Salud y Bienestar', icon: '⚕️', color: '#059669' },
  retail: { name: 'Retail y Tiendas', icon: '🛒', color: '#EA580C' },
  servicios: { name: 'Servicios Técnicos', icon: '🔧', color: '#1E40AF' },
  educacion: { name: 'Educación', icon: '🎓', color: '#1D4ED8' },
  rentas: { name: 'Rentas', icon: '🔑', color: '#7C3AED' },
  profesionales: { name: 'Profesionales', icon: '💼', color: '#374151' },
  construccion: { name: 'Construcción', icon: '🏗️', color: '#B45309' },
  automotriz: { name: 'Automotriz', icon: '🚗', color: '#065F46' },
  otros: { name: 'Otros', icon: '✨', color: '#64748B' },
};

// ============== GENERAR IDs Y PRECIOS ==============
GIROS_V2.forEach((g, i) => {
  g.id = 'GIR' + String(i + 1).padStart(3, '0');
  g.pricing = g.pricing || [
    { plan: 'Básico', price: 399, seats: 1, features: ['1 dispositivo', 'Funciones esenciales', 'Soporte por email'] },
    { plan: 'Pro', price: 799, seats: 3, features: ['3 dispositivos', 'Todos los módulos del giro', 'WhatsApp integrado', 'Soporte prioritario'] },
    { plan: 'Enterprise', price: 1499, seats: 10, features: ['Dispositivos ilimitados', 'Multi-sucursal', 'API acceso', 'Soporte 24/7'] },
  ];
  g.published = true;
});

// ============== PLURAL GENERATOR (fallback) ==============
function giroPlural(name) {
  if (!name) return 'los negocios';
  const lower = name.toLowerCase();
  if (lower.endsWith('ía')) return 'las ' + lower.slice(0, -2) + 'ías';
  if (lower.endsWith('a')) return 'las ' + lower + 's';
  if (lower.endsWith('o')) return 'los ' + lower + 's';
  if (/[aeiouáéíóú]$/i.test(lower)) return 'los ' + lower + 's';
  return 'los ' + lower + 'es';
}

// ============== EXPORTS ==============
if (typeof window !== 'undefined') {
  window.GIROS_V2 = GIROS_V2;
  window.GIROS_CATEGORIES_V2 = GIROS_CATEGORIES_V2;
  window.GIROS_V2_COUNT = GIROS_V2.length;
  window.giroPlural = giroPlural;
}
if (typeof module !== 'undefined') {
  module.exports = { GIROS_V2, GIROS_CATEGORIES_V2, giroPlural };
}

})();
