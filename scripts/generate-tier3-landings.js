/**
 * Generates 8 TIER 3 landing pages using a single template.
 * Run: node scripts/generate-tier3-landings.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const GIROS = [
  {
    file: 'landing-alimentos.html',
    GIRO_NAME: 'Alimentos preparados / Take-away',
    GIRO_SLUG: 'alimentos',
    GIRO_TITLE: 'Volvix POS para Alimentos preparados y Take-away',
    GIRO_KEYWORDS: 'pos take-away, software para fonda, sistema de comida para llevar, pos restaurante express, control de pedidos take-away, gestión de cocina',
    HERO_TAG: 'Comida lista. Despacho rápido.',
    HERO_HEADLINE: 'El POS pensado para <span>cocinas que no paran</span>',
    HERO_SUBTITLE: 'Toma pedidos en mostrador, app y delivery. Manda directo a cocina, controla mermas y cobra en 5 segundos.',
    FEATURES: [
      ['🥡', 'Pedidos para llevar', 'Cobra en mostrador, app o teléfono. Etiquetas con número de orden y hora estimada.'],
      ['🍳', 'KDS de cocina', 'Pantalla en cocina con tickets en tiempo real. Tiempos de preparación y prioridades.'],
      ['📦', 'Combos y paquetes', 'Crea menús del día, combos y promociones por hora con descuentos automáticos.'],
      ['🛵', 'Integración delivery', 'Conecta Uber Eats, DiDi Food y Rappi. Pedidos entran solos al sistema.'],
      ['📊', 'Control de mermas', 'Receta por platillo, descuento de ingredientes en cada venta y reporte de costos.'],
      ['💳', 'Cobros divididos', 'Divide cuenta entre comensales, propina automática y pago con tarjeta o transferencia.']
    ],
    TESTIMONIALS: [
      ['Lorena Vázquez', 'Cocina de la Abuela, Monterrey', 'Antes perdíamos pedidos a la hora pico. Ahora cocina ve todo en pantalla y sale doble en menos tiempo.'],
      ['Hugo Salinas', 'Pollo Express, CDMX', 'Conectamos Uber Eats y Rappi y se acabaron los errores de captura. El reporte de mermas ya solo me toma 10 minutos.'],
      ['Marisela Ortiz', 'Tortas El Chuy, Guadalajara', 'El KDS cambió la operación. Pasamos de 80 órdenes diarias a 140 sin contratar más personal.']
    ],
    FAQ: [
      ['¿Funciona sin internet?', 'Sí. El POS guarda los pedidos local y sincroniza cuando regresa la red.'],
      ['¿Puedo imprimir tickets en cocina?', 'Sí. Soporta impresoras térmicas USB, Bluetooth y de red. Configurable por estación.'],
      ['¿Se conecta con apps de delivery?', 'Conexión nativa con Uber Eats, DiDi Food y Rappi. Sin tarifas extra.'],
      ['¿Puedo manejar varias sucursales?', 'Sí. Plan Pro y Enterprise incluyen multi-sucursal con reportes consolidados.']
    ]
  },
  {
    file: 'landing-belleza.html',
    GIRO_NAME: 'Productos de Belleza',
    GIRO_SLUG: 'belleza',
    GIRO_TITLE: 'Volvix POS para tiendas de Productos de Belleza',
    GIRO_KEYWORDS: 'pos para tienda de belleza, software para venta de cosméticos, sistema de inventario maquillaje, control de muestras, pos perfumería',
    HERO_TAG: 'Para distribuidoras y boutiques de belleza',
    HERO_HEADLINE: 'Vende y controla tu <span>boutique de belleza</span> sin caos',
    HERO_SUBTITLE: 'Maneja miles de SKUs, lotes con caducidad, muestras gratis y promociones de combo. Todo desde una sola pantalla.',
    FEATURES: [
      ['💄', 'Catálogo masivo', 'Miles de productos por marca, categoría y tono. Búsqueda por código o foto.'],
      ['📅', 'Control de caducidad', 'Alertas automáticas por lote y fecha. Reporta vencimientos antes de perder mercancía.'],
      ['🎁', 'Muestras y promos', 'Regala muestras al alcanzar monto, 2x1, descuentos por marca o porcentaje.'],
      ['👤', 'CRM de clientas', 'Historial de compras, preferencias, marca favorita y descuentos personalizados.'],
      ['📦', 'Multi-almacén', 'Inventario por sucursal, traspasos automáticos y stock mínimo configurable.'],
      ['📲', 'WhatsApp marketing', 'Envía catálogo, promos y nuevos productos por WhatsApp directo desde el POS.']
    ],
    TESTIMONIALS: [
      ['Ana Karen Méndez', 'Glow Beauty Store, Querétaro', 'Antes anotaba en libreta cuándo vencían cremas. Ahora el sistema me avisa y ya no tiro producto.'],
      ['Daniela Reyes', 'Cosméticos La Sirena, Puebla', 'El CRM me cambió el negocio. Mis clientas reciben WhatsApp con sus marcas favoritas y vuelven 3x más.'],
      ['Sofía Castañeda', 'Boutique Aurora, Mérida', 'Tener inventario por sucursal me dejó abrir mi segunda tienda sin estresarme.']
    ],
    FAQ: [
      ['¿Soporta lotes y caducidades?', 'Sí. Cada producto puede tener múltiples lotes con su fecha y se descuenta el más antiguo primero.'],
      ['¿Puedo manejar muestras gratis?', 'Sí. Configura reglas: por monto de compra, por cantidad o por marca específica.'],
      ['¿Funciona con código de barras?', 'Sí. Compatible con lectores USB y Bluetooth. También código QR.'],
      ['¿Hay reportes de marcas más vendidas?', 'Sí. Reportes por marca, categoría, vendedora, hora y sucursal.']
    ]
  },
  {
    file: 'landing-educacion.html',
    GIRO_NAME: 'Educación / Cursos',
    GIRO_SLUG: 'educacion',
    GIRO_TITLE: 'Volvix POS para Escuelas, Academias y Cursos',
    GIRO_KEYWORDS: 'pos para escuela, sistema de cobro de colegiaturas, software para academia, control de alumnos, pos cursos online',
    HERO_TAG: 'Para academias, escuelas y cursos',
    HERO_HEADLINE: 'Cobra colegiaturas y <span>controla tu academia</span>',
    HERO_SUBTITLE: 'Mensualidades automáticas, lista de alumnos, recordatorios por WhatsApp y pagos en línea. Sin Excel.',
    FEATURES: [
      ['🎓', 'Gestión de alumnos', 'Expediente completo por alumno: tutor, contacto, plan, descuentos y avance.'],
      ['📆', 'Cobros recurrentes', 'Mensualidades automáticas, recargos por mora y descuentos por pronto pago.'],
      ['💬', 'Recordatorios WhatsApp', 'Avisa pagos pendientes y confirmaciones de inscripción sin mover un dedo.'],
      ['🧑‍🏫', 'Control de profesores', 'Asignación de grupos, pago por horas y reportes de productividad por maestro.'],
      ['📚', 'Cursos y paquetes', 'Vende cursos individuales, paquetes y suscripciones anuales con un clic.'],
      ['💳', 'Pagos en línea', 'Padres pagan con tarjeta, OXXO o SPEI desde un link. El sistema concilia solo.']
    ],
    TESTIMONIALS: [
      ['Patricia Domínguez', 'Academia Lumière, León', 'Pasamos de cobrar en efectivo a 80% pagos en línea. Mis colegiaturas vencidas bajaron de 22% a 4%.'],
      ['Roberto Cárdenas', 'Inglés Total, Veracruz', 'El sistema le manda WhatsApp al papá cuando se atrasa la mensualidad. Cobramos sin ser groseros.'],
      ['Luz Mendoza', 'Conservatorio San Pablo, Tijuana', 'Tener todos los expedientes de alumnos digitales me ahorra 12 horas a la semana.']
    ],
    FAQ: [
      ['¿Puedo cobrar mensualidades automáticas?', 'Sí. El sistema genera el cargo cada mes y manda link de pago por WhatsApp.'],
      ['¿Soporta becas y descuentos?', 'Sí. Configura becas por alumno, hermanos o pronto pago.'],
      ['¿Genero CFDI?', 'Sí. Facturación 4.0 con timbrado incluido en plan Pro y Enterprise.'],
      ['¿Funciona para cursos online?', 'Sí. Combinado con Stripe / MercadoPago para venta global de cursos digitales.']
    ]
  },
  {
    file: 'landing-gym.html',
    GIRO_NAME: 'Gimnasios',
    GIRO_SLUG: 'gym',
    GIRO_TITLE: 'Volvix POS para Gimnasios y Centros Fitness',
    GIRO_KEYWORDS: 'pos para gimnasio, sistema control de socios, software gym, cobro de membresías, control de acceso fitness, pos crossfit',
    HERO_TAG: 'Para gimnasios, crossfit y fitness',
    HERO_HEADLINE: 'Tu gym, <span>sin papeleo y sin morosidad</span>',
    HERO_SUBTITLE: 'Membresías que se cobran solas, control de acceso por huella o QR, clases con cupo y reportes en vivo.',
    FEATURES: [
      ['🏋️', 'Membresías recurrentes', 'Cobro automático mensual o anual con tarjeta. Cancelación con un clic.'],
      ['🔑', 'Control de acceso', 'Huella, tarjeta o QR. Bloquea automáticamente a socios morosos.'],
      ['📅', 'Reservas de clases', 'Spinning, yoga, crossfit con cupo y lista de espera. Socios reservan desde su celular.'],
      ['👥', 'CRM de socios', 'Historial, asistencia, métricas de progreso y campañas de retención.'],
      ['🛒', 'Tienda integrada', 'Vende suplementos, ropa y bebidas. Carga al recibo del socio o cobro inmediato.'],
      ['📊', 'Reportes diarios', 'Asistencia, ventas, retención, churn y proyección de ingresos del mes.']
    ],
    TESTIMONIALS: [
      ['Carlos Hinojosa', 'Iron Body Gym, Saltillo', 'Mis socios morosos pasaron de 30% a 6% gracias al cargo automático. Punto y aparte.'],
      ['Mariana Trejo', 'CrossFit Pulse, CDMX', 'La reserva de clases con cupo me dejó cobrar lo que valgo. Tengo lista de espera todos los días.'],
      ['Alex Domínguez', 'Power Zone, Guadalajara', 'El control de acceso por huella es plug and play. En 2 días estaba operando.']
    ],
    FAQ: [
      ['¿Funciona con torniquete o checador?', 'Sí. Compatible con lectores de huella USB y torniquetes con relé.'],
      ['¿Cobra automáticamente cada mes?', 'Sí. Configura el día de corte y el sistema cobra a la tarjeta del socio.'],
      ['¿Puedo vender clases sueltas?', 'Sí. Combina membresías, paquetes de clases y day passes.'],
      ['¿Hay app para socios?', 'Sí. Tus socios reservan clases y ven su saldo desde el celular.']
    ]
  },
  {
    file: 'landing-rentas.html',
    GIRO_NAME: 'Rentas en general',
    GIRO_SLUG: 'rentas',
    GIRO_TITLE: 'Volvix POS para Negocios de Renta y Alquiler',
    GIRO_KEYWORDS: 'pos para renta, software de alquiler, sistema control de equipos en renta, depósitos en garantía, pos para mobiliario',
    HERO_TAG: 'Mobiliario, equipo, herramienta, vehículos',
    HERO_HEADLINE: 'Renta sin perder <span>equipo ni dinero</span>',
    HERO_SUBTITLE: 'Cotiza, agenda, cobra depósito y entrega. Control de devoluciones, daños y disponibilidad en calendario.',
    FEATURES: [
      ['📋', 'Catálogo de rentas', 'Tarifa por hora, día o semana. Disponibilidad por unidad o lote.'],
      ['📅', 'Calendario visual', 'Agenda quién renta qué y cuándo. Evita doble reserva con bloqueo automático.'],
      ['💵', 'Depósitos en garantía', 'Captura depósito, devuelve al regreso y descuenta daños con foto evidencia.'],
      ['📸', 'Inspección con foto', 'Antes y después: registra estado del equipo con foto desde el celular.'],
      ['💼', 'Contratos en PDF', 'Genera contrato firmable en pantalla con datos del cliente y términos legales.'],
      ['📈', 'Reportes de uso', 'Equipo más rentado, días de inactividad, ingresos por categoría y rentabilidad real.']
    ],
    TESTIMONIALS: [
      ['Jorge Beltrán', 'Renta de Mobiliario El Sol, Toluca', 'Antes perdíamos sillas porque no había control. Ahora todo se firma con foto y bajamos pérdidas 90%.'],
      ['Verónica Salas', 'Equipos para Eventos VS, Cancún', 'Las cotizaciones que tardaban 1 hora ahora salen en 5 minutos. Cierro el doble.'],
      ['Iván Castro', 'Renta de Andamios MX, Monterrey', 'El depósito automático me ahorra discusiones con clientes. El sistema deja todo por escrito.']
    ],
    FAQ: [
      ['¿Soporta tarifas por hora, día y semana?', 'Sí. Configura la unidad de tiempo por producto y aplica descuentos por volumen.'],
      ['¿Maneja depósitos en garantía?', 'Sí. Cobra depósito al inicio, descuenta daños al final y devuelve la diferencia.'],
      ['¿Puedo subir fotos del equipo?', 'Sí. Antes y después de la renta. Las fotos quedan en el contrato.'],
      ['¿Genera contratos imprimibles?', 'Sí. PDF con datos del cliente, equipo, fechas, depósito y firma digital.']
    ]
  },
  {
    file: 'landing-retail.html',
    GIRO_NAME: 'Retail / Comercio Minorista',
    GIRO_SLUG: 'retail',
    GIRO_TITLE: 'Volvix POS para Retail y Comercio Minorista',
    GIRO_KEYWORDS: 'pos retail, sistema punto de venta tienda, software comercio minorista, control de inventario retail, multi-sucursal pos',
    HERO_TAG: 'Para tiendas con miles de SKUs',
    HERO_HEADLINE: 'El POS retail que <span>escala con tu cadena</span>',
    HERO_SUBTITLE: 'Multi-sucursal, multi-almacén, e-commerce conectado, cajeras rápidas y reportes ejecutivos en tiempo real.',
    FEATURES: [
      ['🏬', 'Multi-sucursal', 'Reportes consolidados, transferencias entre tiendas y precios por plaza.'],
      ['📦', 'Inventario inteligente', 'Punto de reorden automático, sugerencias de compra y rotación por SKU.'],
      ['🛒', 'E-commerce sincronizado', 'Conecta Shopify, MercadoLibre y tu tienda Volvix. Stock unificado.'],
      ['💳', 'Caja rápida', 'Lectura de código de barras, pagos divididos, monedero electrónico y CFDI al toque.'],
      ['👥', 'Programa de lealtad', 'Puntos, niveles, cashback y promos personalizadas. CRM con segmentación.'],
      ['📊', 'BI ejecutivo', 'Dashboard con ventas en vivo, comparativos vs año anterior y proyecciones.']
    ],
    TESTIMONIALS: [
      ['Eduardo Ramírez', 'Cadena El Buen Trato, 12 sucursales', 'Pasamos de cerrar mes en 6 días a cerrar en 1 día. El BI ejecutivo no tiene precio.'],
      ['Patricia Núñez', 'Boutique Núñez, 3 sucursales', 'Conectar mi tienda online con el POS evitó vender productos sin stock. Devoluciones bajaron 60%.'],
      ['Raúl Treviño', 'Súper Económico, Tampico', 'El programa de lealtad me devolvió 35% de clientes que ya no venían. ROI clarísimo.']
    ],
    FAQ: [
      ['¿Aguanta miles de productos?', 'Sí. Probado con catálogos de más de 80,000 SKUs sin lentitud.'],
      ['¿Se sincroniza con MercadoLibre?', 'Sí. Stock y pedidos en tiempo real, con conciliación automática.'],
      ['¿Maneja precios por sucursal?', 'Sí. Listas de precios independientes con descuentos por plaza.'],
      ['¿Soporta lectores y básculas?', 'Sí. Lectores USB/Bluetooth, básculas integradas y cajones de dinero automáticos.']
    ]
  },
  {
    file: 'landing-salud.html',
    GIRO_NAME: 'Productos de Salud',
    GIRO_SLUG: 'salud',
    GIRO_TITLE: 'Volvix POS para Tiendas de Productos de Salud y Suplementos',
    GIRO_KEYWORDS: 'pos farmacia natural, software para tienda naturista, sistema suplementos, control de caducidades, pos productos de salud',
    HERO_TAG: 'Naturistas, suplementos y bienestar',
    HERO_HEADLINE: 'Vende salud sin <span>perder de vista la caducidad</span>',
    HERO_SUBTITLE: 'Inventario por lote, recordatorios de re-compra, recetas guardadas y CRM de pacientes con historial.',
    FEATURES: [
      ['💊', 'Lotes y caducidad', 'Cada producto con sus lotes y fechas. Alertas a 60, 30 y 7 días.'],
      ['📋', 'Historial de pacientes', 'Compras, alergias, plan nutricional y notas privadas del asesor.'],
      ['🔔', 'Recordatorios de re-compra', 'WhatsApp automático cuando se calcula que el cliente está por terminar su producto.'],
      ['🌿', 'Combos terapéuticos', 'Crea paquetes recomendados por padecimiento con descuento.'],
      ['📦', 'Multi-almacén', 'Inventario por sucursal con traspasos rápidos y stock mínimo automático.'],
      ['💬', 'WhatsApp catalog', 'Envía catálogo y pide reposiciones por WhatsApp directo desde el POS.']
    ],
    TESTIMONIALS: [
      ['Brenda Lozano', 'Vida Natural, Hermosillo', 'Los avisos de caducidad me han salvado más de 80,000 pesos en producto que ya no tiré.'],
      ['Mario Becerra', 'Suplementos Pro Mx, Toluca', 'Los recordatorios de re-compra por WhatsApp me triplicaron las ventas recurrentes.'],
      ['Karla Espinoza', 'Herbolaria San Rafael, Oaxaca', 'Tener historial del paciente cambió mi atención. Ahora doy seguimiento como un pequeño consultorio.']
    ],
    FAQ: [
      ['¿Soporta caducidad por lote?', 'Sí. Cada lote con su fecha y se descuenta el más cercano a vencer primero.'],
      ['¿Maneja datos de pacientes?', 'Sí. Cumple Aviso de Privacidad. Datos cifrados y export bajo solicitud (LFPDPPP).'],
      ['¿Puedo emitir CFDI?', 'Sí. Facturación 4.0 con clave de producto SAT preconfigurada para suplementos.'],
      ['¿Funciona offline?', 'Sí. Las ventas se guardan local y sincronizan al volver internet.']
    ]
  },
  {
    file: 'landing-servicios.html',
    GIRO_NAME: 'Servicios profesionales',
    GIRO_SLUG: 'servicios',
    GIRO_TITLE: 'Volvix POS para Servicios Profesionales y Consultoría',
    GIRO_KEYWORDS: 'pos para consultoría, sistema cobro de servicios, software para despacho, agenda de citas profesional, factura por servicios',
    HERO_TAG: 'Despachos, consultoría, agencias y técnicos',
    HERO_HEADLINE: 'Cotiza, agenda y cobra <span>tu servicio profesional</span>',
    HERO_SUBTITLE: 'Manda cotizaciones serias, agenda citas, controla horas trabajadas y emite factura. Todo en un sistema.',
    FEATURES: [
      ['📝', 'Cotizaciones pro', 'PDF con tu logo, conceptos detallados, condiciones y firma digital del cliente.'],
      ['📅', 'Agenda de citas', 'Calendario por especialista con confirmación por WhatsApp y recordatorios.'],
      ['⏱️', 'Horas trabajadas', 'Registra horas por proyecto y cliente. Factura por avance o por entrega.'],
      ['💼', 'CRM de clientes', 'Historial de proyectos, contactos, contratos firmados y seguimiento.'],
      ['📄', 'CFDI por servicios', 'Genera factura 4.0 con clave SAT correcta para servicios profesionales.'],
      ['💰', 'Cobranza automática', 'Manda recordatorios de pago, cobra con link y concilia automáticamente.']
    ],
    TESTIMONIALS: [
      ['Lic. Andrés Mora', 'Mora & Asociados, Querétaro', 'Mis cotizaciones se ven 10x más profesionales. Cierro 40% más prospectos que antes.'],
      ['Dra. Yolanda Pacheco', 'Consultoría Empresarial YP', 'La agenda con WhatsApp redujo cancelaciones de citas en un 70%.'],
      ['Ing. Marcos Ruelas', 'Soluciones Técnicas MR, Tijuana', 'Llevar las horas por proyecto me hizo ver que estaba subcobrando. Subí mis tarifas con datos.']
    ],
    FAQ: [
      ['¿Genera CFDI para servicios?', 'Sí. Con clave SAT correcta para servicios profesionales y régimen fiscal del receptor.'],
      ['¿Puedo agendar varios profesionales?', 'Sí. Cada uno con su agenda, horarios y disponibilidad personalizable.'],
      ['¿Soporta facturación por avance?', 'Sí. Cobra anticipos, parcialidades y emite complemento de pago automáticamente.'],
      ['¿Manda recordatorios de cita?', 'Sí. WhatsApp 24h antes y SMS 2h antes. Configurable por servicio.']
    ]
  }
];

// ────────────────────────── TEMPLATE ──────────────────────────
function buildHTML(g) {
  const featureCards = g.FEATURES.map(([icon, title, desc]) => `
    <div class="card">
      <div class="card-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>`).join('');

  const testimonials = g.TESTIMONIALS.map(([name, business, quote]) => `
    <div class="testimonial">
      <p class="quote">"${quote}"</p>
      <div class="t-meta">
        <strong>${name}</strong>
        <span>${business}</span>
      </div>
    </div>`).join('');

  const faqItems = g.FAQ.map(([q, a]) => `
    <details class="faq-item">
      <summary>${q}</summary>
      <p>${a}</p>
    </details>`).join('');

  const desc = `Volvix POS especializado para ${g.GIRO_NAME}. ${g.GIRO_KEYWORDS}. Empieza gratis 30 días.`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${g.GIRO_TITLE}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${g.GIRO_KEYWORDS}, volvix pos, punto de venta mexico">
<meta property="og:title" content="${g.GIRO_TITLE}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0a0a0f">
<link rel="canonical" href="https://volvix.com/landing-${g.GIRO_SLUG}.html">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--primary:#e91e8c;--accent:#00d4aa;--bg:#0a0a0f;--bg2:#12121a;--bg3:#1a1a25;--text:#e8e8f0;--muted:#8888a8;--border:#2a2a3f}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;line-height:1.6}
a{color:inherit;text-decoration:none}
.container{max-width:1100px;margin:0 auto;padding:0 1.5rem}
nav{position:sticky;top:0;z-index:100;background:rgba(10,10,15,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:60px}
.logo{font-size:1.3rem;font-weight:800;color:#fff}.logo span{color:var(--primary)}
.nav-cta{background:var(--primary);color:#fff;padding:.5rem 1.1rem;border-radius:8px;font-size:.85rem;font-weight:700}
.hero{padding:5rem 1.5rem 4rem;text-align:center;background:radial-gradient(ellipse at top,rgba(233,30,140,.12),transparent 60%)}
.tag{display:inline-block;background:rgba(233,30,140,.15);border:1px solid rgba(233,30,140,.35);color:var(--primary);padding:.35rem 1rem;border-radius:20px;font-size:.78rem;font-weight:700;margin-bottom:1.4rem;text-transform:uppercase;letter-spacing:.5px}
h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:900;line-height:1.1;letter-spacing:-1.5px;margin-bottom:1rem;max-width:900px;margin-left:auto;margin-right:auto}
h1 span{color:var(--primary)}
.hero-sub{color:var(--muted);font-size:1.1rem;max-width:680px;margin:0 auto 2rem}
.btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
.btn{padding:.9rem 2rem;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;border:none;display:inline-block;transition:transform .15s ease,box-shadow .15s ease}
.btn-primary{background:var(--primary);color:#fff;box-shadow:0 6px 24px rgba(233,30,140,.3)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(233,30,140,.4)}
.btn-outline{background:transparent;color:#fff;border:1px solid var(--border)}
.btn-outline:hover{background:var(--bg2)}
section{padding:4rem 1.5rem}
.section-head{text-align:center;margin-bottom:3rem}
.section-head h2{font-size:clamp(1.5rem,3vw,2.4rem);font-weight:800;letter-spacing:-1px;margin-bottom:.6rem}
.section-head p{color:var(--muted);max-width:600px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;max-width:1100px;margin:0 auto}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.6rem;transition:transform .2s ease,border-color .2s ease}
.card:hover{transform:translateY(-4px);border-color:var(--primary)}
.card-icon{font-size:2rem;margin-bottom:1rem}
.card h3{font-size:1.05rem;font-weight:700;margin-bottom:.5rem}
.card p{color:var(--muted);font-size:.92rem}
.pricing{background:var(--bg2)}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;max-width:1000px;margin:0 auto}
.plan{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:2rem 1.6rem;text-align:center;position:relative}
.plan.featured{border-color:var(--primary);transform:scale(1.04)}
.plan.featured::before{content:'Más popular';position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:.25rem .9rem;border-radius:12px;font-size:.7rem;font-weight:700;letter-spacing:.5px}
.plan h3{font-size:1.2rem;font-weight:700;margin-bottom:.4rem}
.price{font-size:2.2rem;font-weight:900;margin:1rem 0;color:var(--primary)}
.price small{font-size:.85rem;color:var(--muted);font-weight:500}
.plan ul{list-style:none;text-align:left;margin:1.4rem 0}
.plan li{padding:.45rem 0;color:var(--text);font-size:.92rem;display:flex;gap:.5rem}
.plan li::before{content:'✓';color:var(--accent);font-weight:700}
.testimonials{background:var(--bg)}
.t-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.4rem;max-width:1100px;margin:0 auto}
.testimonial{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.8rem}
.testimonial .quote{font-style:italic;color:var(--text);margin-bottom:1.2rem;font-size:.95rem}
.t-meta{display:flex;flex-direction:column}
.t-meta strong{color:#fff;font-size:.95rem}
.t-meta span{color:var(--muted);font-size:.82rem;margin-top:2px}
.faq{background:var(--bg2)}
.faq-list{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:.8rem}
.faq-item{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:1rem 1.4rem}
.faq-item summary{cursor:pointer;font-weight:600;font-size:.98rem;padding:.4rem 0;outline:none;list-style:none;position:relative;padding-right:2rem}
.faq-item summary::after{content:'+';position:absolute;right:0;top:50%;transform:translateY(-50%);color:var(--primary);font-weight:800;font-size:1.4rem}
.faq-item[open] summary::after{content:'−'}
.faq-item p{color:var(--muted);font-size:.92rem;margin-top:.6rem}
.cta-final{text-align:center;background:linear-gradient(135deg,rgba(233,30,140,.18),rgba(0,212,170,.08));padding:5rem 1.5rem}
.cta-final h2{font-size:clamp(1.6rem,3.5vw,2.6rem);font-weight:900;margin-bottom:1rem}
.cta-final p{color:var(--muted);max-width:560px;margin:0 auto 2rem;font-size:1.05rem}
footer{padding:2.5rem 1.5rem;border-top:1px solid var(--border);text-align:center;color:var(--muted);font-size:.85rem}
footer a{color:#60a5fa;margin:0 .6rem}
@media (max-width:600px){
  nav{padding:0 1rem}
  .plan.featured{transform:none}
}
</style>
</head>
<body>
<nav>
  <a href="/" class="logo">Volvix<span>POS</span></a>
  <a href="/registro.html?giro=${g.GIRO_SLUG}" class="nav-cta">Empezar gratis</a>
</nav>

<header class="hero">
  <span class="tag">${g.HERO_TAG}</span>
  <h1>${g.HERO_HEADLINE}</h1>
  <p class="hero-sub">${g.HERO_SUBTITLE}</p>
  <div class="btns">
    <a href="/registro.html?giro=${g.GIRO_SLUG}" class="btn btn-primary">Empezar gratis 30 días</a>
    <a href="#features" class="btn btn-outline">Ver funciones</a>
  </div>
</header>

<section id="features">
  <div class="section-head">
    <h2>Todo lo que necesitas para tu negocio de ${g.GIRO_NAME}</h2>
    <p>Sin instalaciones eternas. Configura en 1 día y empieza a vender.</p>
  </div>
  <div class="cards">
    ${featureCards}
  </div>
</section>

<section id="pricing" class="pricing">
  <div class="section-head">
    <h2>Planes simples, sin sorpresas</h2>
    <p>Sin permanencia. Cancela cuando quieras. CFDI 4.0 incluido.</p>
  </div>
  <div class="plans">
    <div class="plan">
      <h3>Básico</h3>
      <div class="price">$299<small>/mes</small></div>
      <ul>
        <li>1 sucursal · 2 usuarios</li>
        <li>POS, inventario y reportes</li>
        <li>CFDI 4.0 (40 timbres/mes)</li>
        <li>Soporte por chat</li>
      </ul>
      <a href="/registro.html?giro=${g.GIRO_SLUG}&plan=basico" class="btn btn-outline">Empezar</a>
    </div>
    <div class="plan featured">
      <h3>Pro</h3>
      <div class="price">$499<small>/mes</small></div>
      <ul>
        <li>Hasta 3 sucursales · 8 usuarios</li>
        <li>Todo lo del Básico +</li>
        <li>CRM, lealtad y WhatsApp</li>
        <li>CFDI ilimitado · Soporte prioritario</li>
      </ul>
      <a href="/registro.html?giro=${g.GIRO_SLUG}&plan=pro" class="btn btn-primary">Empezar gratis</a>
    </div>
    <div class="plan">
      <h3>Enterprise</h3>
      <div class="price">$899<small>/mes</small></div>
      <ul>
        <li>Sucursales y usuarios ilimitados</li>
        <li>API, integraciones y BI</li>
        <li>SLA 99.9% · Onboarding dedicado</li>
        <li>Account manager personal</li>
      </ul>
      <a href="/registro.html?giro=${g.GIRO_SLUG}&plan=enterprise" class="btn btn-outline">Hablar con ventas</a>
    </div>
  </div>
</section>

<section class="testimonials">
  <div class="section-head">
    <h2>Negocios que ya confían en Volvix</h2>
    <p>Miles de empresas usan Volvix POS todos los días.</p>
  </div>
  <div class="t-grid">
    ${testimonials}
  </div>
</section>

<section class="faq">
  <div class="section-head">
    <h2>Preguntas frecuentes</h2>
  </div>
  <div class="faq-list">
    ${faqItems}
  </div>
</section>

<section class="cta-final">
  <h2>Empieza hoy. Sin tarjeta. Sin riesgo.</h2>
  <p>30 días gratis con todas las funciones del plan Pro. Si no te convence, simplemente no contratas.</p>
  <a href="/registro.html?giro=${g.GIRO_SLUG}" class="btn btn-primary">Empezar gratis 30 días</a>
</section>

<footer>
  <div>
    <a href="/aviso-privacidad.html">Aviso de Privacidad</a>·
    <a href="/terminos-condiciones.html">Términos</a>·
    <a href="/cookies-policy.html">Cookies</a>·
    <a href="mailto:soporte@volvix.com">Soporte</a>
  </div>
  <p style="margin-top:.8rem">© 2026 GrupoVolvix S.A. de C.V. — Volvix POS para ${g.GIRO_NAME}</p>
</footer>

<script defer src="/volvix-modules-wiring.js"></script>
</body>
</html>
`;
}

// ────────────────────── Generate ──────────────────────
let written = 0;
for (const g of GIROS) {
  const out = path.join(PUBLIC_DIR, g.file);
  fs.writeFileSync(out, buildHTML(g), 'utf8');
  const sz = fs.statSync(out).size;
  console.log(`✓ ${g.file}  ${sz} bytes`);
  written++;
}
console.log(`\nDone. ${written} files written to ${PUBLIC_DIR}`);
