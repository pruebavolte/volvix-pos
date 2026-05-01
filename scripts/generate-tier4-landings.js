/**
 * Generates 11 TIER 4 landing pages using the same template as TIER 3.
 * Output goes to the repo root (where the existing stubs live).
 * Run: node scripts/generate-tier4-landings.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..');

const GIROS = [
  {
    file: 'landing-casa-empeno.html',
    GIRO_NAME: 'Casas de Empeño',
    GIRO_SLUG: 'casa-empeno',
    GIRO_TITLE: 'Volvix POS para Casas de Empeño',
    GIRO_KEYWORDS: 'pos casa de empeño, software prendaria, sistema avalúos, control de boletas de empeño, intereses y refrendos, búsqueda de prendas',
    HERO_TAG: 'Avalúos, boletas, intereses y refrendos',
    HERO_HEADLINE: 'El sistema que <span>cobra refrendos solo</span> y no pierde una prenda',
    HERO_SUBTITLE: 'Avalúa, imprime boleta, cobra interés mensual y libera la prenda con su garantía. Búsqueda por foto, marca o número de serie.',
    FEATURES: [
      ['💍', 'Avalúos rápidos', 'Captura prenda con foto, peso, kilataje o marca. Tabla de avalúo configurable por categoría.'],
      ['📜', 'Boletas en segundos', 'Imprime boleta de empeño con foto de la prenda, monto, plazo, interés y firma del cliente.'],
      ['💰', 'Intereses y refrendos', 'Cobro de interés mensual automático, refrendos con un clic y recálculo de plazos.'],
      ['🔒', 'Control de bóveda', 'Ubicación física por gaveta y casillero. Inventario diario y alertas de prendas vencidas.'],
      ['🔎', 'Búsqueda por características', 'Encuentra una prenda por marca, modelo, peso, número de serie o foto similar en segundos.'],
      ['⚖️', 'Almoneda y desempeño', 'Marca prendas vencidas para venta, calcula precio mínimo y emite ticket de desempeño con CFDI.']
    ],
    TESTIMONIALS: [
      ['Ricardo Olvera', 'Empeños El Tesoro, Puebla', 'Antes buscaba prendas en cajones por 20 minutos. Hoy las localizo por número de boleta en 3 segundos.'],
      ['Mónica Vergara', 'Casa de Empeño Vergara, CDMX', 'El cobro automático de interés y los avisos por WhatsApp me bajaron las prendas vencidas en un 45%.'],
      ['Juan Pablo Lares', 'Préstamos Lares, Toluca', 'Las boletas con foto y firma digital me han salvado en 4 reclamaciones legales este año.']
    ],
    FAQ: [
      ['¿Cumple con normatividad PROFECO y CNBV?', 'Sí. Boletas con todos los requisitos legales: monto, interés, plazo, descripción de la prenda y firma.'],
      ['¿Puedo cobrar el interés automáticamente?', 'Sí. Al vencer el mes, el sistema genera el cargo y manda WhatsApp al cliente para refrendar o liquidar.'],
      ['¿Soporta avalúo de oro por kilataje?', 'Sí. Tabla de precios por gramo y kilataje (10K, 14K, 18K, 22K, 24K) actualizable diariamente.'],
      ['¿Cómo busco una prenda específica?', 'Por número de boleta, nombre del cliente, marca, modelo, número de serie o características.']
    ]
  },
  {
    file: 'landing-clinica-dental.html',
    GIRO_NAME: 'Clínicas Dentales',
    GIRO_SLUG: 'clinica-dental',
    GIRO_TITLE: 'Volvix POS para Clínicas y Consultorios Dentales',
    GIRO_KEYWORDS: 'software clínica dental, sistema odontograma, agenda dental, presupuesto por pieza, recordatorios pacientes, pos consultorio dental',
    HERO_TAG: 'Odontograma, agenda y cobros en una pantalla',
    HERO_HEADLINE: 'El sistema dental que <span>cobra y atiende</span> sin papeleo',
    HERO_SUBTITLE: 'Odontograma digital, agenda multi-doctor, presupuesto por pieza y recordatorios automáticos. Tu clínica corre sola.',
    FEATURES: [
      ['🦷', 'Odontograma digital', 'Marca tratamientos por pieza, color por estado y observaciones. Historial completo del paciente.'],
      ['📅', 'Agenda multi-doctor', 'Calendario por dentista con bloques de 15/30/60 min. Confirmación por WhatsApp y SMS.'],
      ['💰', 'Presupuesto por pieza', 'Genera plan de tratamiento con costo por diente y servicio. PDF firmable y plan de pagos.'],
      ['🔔', 'Recordatorios automáticos', 'Cita 24h antes, limpieza cada 6 meses y revisión de ortodoncia. Sin perder un paciente.'],
      ['📋', 'Expediente clínico', 'Historia médica, alergias, radiografías, fotos intraorales y notas privadas del odontólogo.'],
      ['💳', 'Cobros parciales', 'Cobra anticipos y mensualidades del tratamiento. Cierra el ciclo y emite CFDI 4.0.']
    ],
    TESTIMONIALS: [
      ['Dra. Marcela Ávila', 'Dental Sonríe, Guadalajara', 'El odontograma digital con foto antes/después convirtió 60% más presupuestos en tratamientos firmados.'],
      ['Dr. Iván Rosales', 'Clínica Rosales Ortodoncia, CDMX', 'Las citas confirmadas por WhatsApp bajaron mis "no-show" del 22% al 5%.'],
      ['Dra. Lucía Pérez', 'Centro Dental del Valle, Monterrey', 'Cobrar el tratamiento por mensualidades me dejó cerrar más casos grandes sin asustar al paciente.']
    ],
    FAQ: [
      ['¿Tiene odontograma para todas las piezas?', 'Sí. Sistema universal y FDI con marcado por superficie y estado (caries, obturación, prótesis, etc.).'],
      ['¿Maneja varios doctores y especialidades?', 'Sí. Cada doctor con agenda, comisión y reporte de productividad por especialidad.'],
      ['¿Manda recordatorios automáticos?', 'Sí. WhatsApp 24h antes, SMS 2h antes y aviso de revisión semestral preventiva.'],
      ['¿Puedo guardar radiografías y fotos?', 'Sí. Sube imágenes al expediente del paciente, con respaldo automático en la nube.']
    ]
  },
  {
    file: 'landing-colegio.html',
    GIRO_NAME: 'Colegios y Escuelas',
    GIRO_SLUG: 'colegio',
    GIRO_TITLE: 'Volvix POS para Colegios, Primarias y Secundarias',
    GIRO_KEYWORDS: 'software para colegio, sistema de inscripciones, control de mensualidades, calificaciones, lista de útiles, pos para escuela primaria',
    HERO_TAG: 'Inscripciones, mensualidades, calificaciones',
    HERO_HEADLINE: 'El colegio que se <span>administra solo</span>',
    HERO_SUBTITLE: 'Inscripciones digitales, cobro de mensualidades por hijo, calificaciones por bimestre y lista de útiles vendida desde el sistema.',
    FEATURES: [
      ['📝', 'Inscripciones digitales', 'Captura datos del alumno y tutor, valida documentos y genera contrato de inscripción al instante.'],
      ['💵', 'Mensualidades por familia', 'Hermanos con descuento, becas configurables y recargos por mora calculados automáticamente.'],
      ['📊', 'Calificaciones por bimestre', 'Captura por maestro, boletas en PDF, promedio acumulado y aviso al tutor por WhatsApp.'],
      ['📚', 'Lista de útiles vendida', 'Convierte la lista en paquete vendible. El padre pide y paga desde un link, tú entregas.'],
      ['👨‍👩‍👧', 'Portal del tutor', 'Padres consultan saldo, calificaciones y avisos en su celular sin llamar a la administración.'],
      ['🚌', 'Transporte escolar', 'Cobro de ruta de transporte, registro de subida/bajada y aviso al tutor cuando el bus llega.']
    ],
    TESTIMONIALS: [
      ['Lic. Verónica Sandoval', 'Colegio San Patricio, Querétaro', 'Cerramos el ciclo escolar con 0 mensualidades vencidas. Antes teníamos 18%.'],
      ['Profra. Carmen Ruiz', 'Escuela Primaria Benavente, Puebla', 'Vender la lista de útiles desde el sistema nos generó 380,000 pesos extra el primer año.'],
      ['Dir. Luis Cervantes', 'Instituto Cervantes, Aguascalientes', 'Las boletas digitales con WhatsApp ahorraron papel y los papás se enteran al momento.']
    ],
    FAQ: [
      ['¿Maneja descuentos por hermanos?', 'Sí. Configura descuento por 2do, 3er hijo en adelante. Aplica automáticamente al cobrar.'],
      ['¿Genera boletas oficiales?', 'Sí. Plantillas configurables por nivel (preescolar, primaria, secundaria) con formato SEP.'],
      ['¿Pueden los padres pagar en línea?', 'Sí. Tarjeta, OXXO o SPEI desde un link. La conciliación es automática.'],
      ['¿Soporta múltiples niveles educativos?', 'Sí. Un solo sistema para preescolar, primaria, secundaria y prepa con planes diferentes.']
    ]
  },
  {
    file: 'landing-escuela-idiomas.html',
    GIRO_NAME: 'Escuelas de Idiomas',
    GIRO_SLUG: 'escuela-idiomas',
    GIRO_TITLE: 'Volvix POS para Escuelas e Institutos de Idiomas',
    GIRO_KEYWORDS: 'software escuela de idiomas, sistema niveles CEFR, control de exámenes, profesores nativos, pos academia de inglés',
    HERO_TAG: 'Niveles CEFR, exámenes y horarios flexibles',
    HERO_HEADLINE: 'Tu academia de idiomas <span>profesional y al día</span>',
    HERO_SUBTITLE: 'Clasifica por niveles A1–C2, agenda exámenes, controla horarios de profesores nativos y cobra paquetes con un clic.',
    FEATURES: [
      ['🌎', 'Niveles CEFR (A1-C2)', 'Clasifica al alumno por nivel europeo, asigna grupo y avanza con examen de promoción.'],
      ['📝', 'Exámenes integrados', 'Examen diagnóstico al inscribirse, parciales por unidad y certificación final con constancia.'],
      ['👨‍🏫', 'Profesores nativos', 'Asignación por idioma materno, control de horas, pago por hora y reporte por maestro.'],
      ['🕒', 'Horarios flexibles', 'Grupos sabatinos, semanales, intensivos o uno-a-uno. Reagenda con cupo y lista de espera.'],
      ['🎓', 'Constancias y certificados', 'Genera certificado oficial de la escuela con QR de validación y firma digital del director.'],
      ['🎁', 'Paquetes y becas', 'Vende cursos por nivel, paquetes anuales, becas por examen y referidos con descuento.']
    ],
    TESTIMONIALS: [
      ['Robert Henderson', 'English Learning Center, CDMX', 'El examen diagnóstico digital nos ahorra 30 minutos por alumno y la asignación a grupo es automática.'],
      ['Sophie Martin', 'Le Petit Français, Mérida', 'Manejar 4 idiomas en un solo sistema con horarios distintos era imposible. Ahora es trivial.'],
      ['Yuki Tanaka', 'Sakura Japanese School, Guadalajara', 'Las constancias con QR de validación nos posicionaron como la escuela seria de la zona.']
    ],
    FAQ: [
      ['¿Soporta varios idiomas?', 'Sí. Inglés, francés, alemán, japonés, italiano y los que necesites. Cada uno con sus niveles y materiales.'],
      ['¿Puedo cobrar por nivel completo?', 'Sí. Configura paquetes por nivel CEFR (A1, A2…), por mes o por hora individual.'],
      ['¿Hay clases uno-a-uno?', 'Sí. Agenda 1:1 por hora, paquete de 10/20 horas y descuentos por adelantado.'],
      ['¿Genera certificados oficiales?', 'Sí. PDF con logo de la escuela, QR de validación y registro en base de datos.']
    ]
  },
  {
    file: 'landing-estetica.html',
    GIRO_NAME: 'Estéticas y Salones de Belleza',
    GIRO_SLUG: 'estetica',
    GIRO_TITLE: 'Volvix POS para Estéticas, Salones y Spas',
    GIRO_KEYWORDS: 'pos estetica, software para salón de belleza, sistema comisiones por servicio, paquetes spa, tarjetas de regalo, agenda estilistas',
    HERO_TAG: 'Comisiones, paquetes y tarjetas de regalo',
    HERO_HEADLINE: 'La estética que <span>paga comisión justa</span> y agenda sin enredos',
    HERO_SUBTITLE: 'Cobra servicios y productos, calcula comisión por estilista, vende paquetes y tarjetas de regalo. Cero hojas de Excel.',
    FEATURES: [
      ['💇', 'Comisiones por servicio', 'Configura % por estilista, por servicio o por producto. Reporte automático para pago de quincena.'],
      ['📅', 'Agenda por estilista', 'Cada profesional con su agenda, color y duración del servicio. Confirma cita por WhatsApp.'],
      ['🎁', 'Tarjetas de regalo', 'Vende gift cards físicas o digitales, con saldo, expiración y aviso al cumpleañero.'],
      ['💆', 'Paquetes y bonos', 'Vende 5 manicures, 3 facials o paquete novia. El sistema descuenta cada uso.'],
      ['🛍️', 'Productos y servicios', 'En un solo recibo: corte + tinte + producto. Comisión separada por venta y servicio.'],
      ['👤', 'Ficha del cliente', 'Historial de servicios, fórmula de tinte, alergias, foto de antes/después y preferencias.']
    ],
    TESTIMONIALS: [
      ['Karla Méndez', 'Bella Salón, Mérida', 'El cálculo automático de comisiones me ahorra 6 horas cada quincena y mis chicas confían en el número.'],
      ['Stefany Cruz', 'Spa Aurora, CDMX', 'Las tarjetas de regalo digitales en diciembre nos generaron 280,000 pesos extra. Locura.'],
      ['Naomi Castillo', 'Estética Glamour, Tijuana', 'La ficha del cliente con la fórmula de tinte salvó a mi salón cuando se enfermó la estilista titular.']
    ],
    FAQ: [
      ['¿Calcula comisiones por estilista?', 'Sí. % por servicio, por producto o mixto. Reporte para nómina con un clic.'],
      ['¿Puedo vender paquetes y bonos?', 'Sí. Define cuántas sesiones, expiración y precio. El sistema descuenta cada visita.'],
      ['¿Soporta cita en línea?', 'Sí. Tu cliente reserva desde tu link de WhatsApp o web, ve disponibilidad y confirma sola.'],
      ['¿Maneja varios profesionales?', 'Sí. Cada estilista con su agenda, comisión y reporte de productividad mensual.']
    ]
  },
  {
    file: 'landing-foto-estudio.html',
    GIRO_NAME: 'Estudios Fotográficos',
    GIRO_SLUG: 'foto-estudio',
    GIRO_TITLE: 'Volvix POS para Estudios Fotográficos y Foto-video',
    GIRO_KEYWORDS: 'pos estudio fotográfico, software para fotógrafos, control de sesiones, retoques, paquetes graduación, álbumes',
    HERO_TAG: 'Sesiones, retoques, álbumes y paquetes',
    HERO_HEADLINE: 'Tu estudio de fotografía <span>cobrado y entregado</span> a tiempo',
    HERO_SUBTITLE: 'Cotiza paquete, agenda sesión, controla retoques y entrega álbum. Bodas, XV años, graduaciones y producto.',
    FEATURES: [
      ['📸', 'Sesiones y agenda', 'Calendario por fotógrafo, ubicación y tipo de sesión (estudio, exterior, evento).'],
      ['🎨', 'Control de retoques', 'Estatus por foto: cruda, seleccionada, retocada, aprobada. Galería privada del cliente.'],
      ['🎓', 'Paquetes graduación', 'Paquete con fotos individuales, grupo, álbum y videos. Cobro escalonado.'],
      ['📖', 'Álbumes y fotolibros', 'Catálogo de álbumes con páginas, tamaños y costos. PDF de propuesta al cliente.'],
      ['💰', 'Anticipos y saldos', 'Cobro de 50% al apartar y 50% al entregar. Recordatorios automáticos del saldo.'],
      ['📦', 'Entregas físicas y digitales', 'USB, link de descarga con expiración o impresiones. Comprobante de recepción firmado.']
    ],
    TESTIMONIALS: [
      ['Andrés Solórzano', 'Foto Estudio Solórzano, León', 'Pasamos de Excel caótico a un sistema. Ya no se me pierde una sesión ni un anticipo.'],
      ['Dafne Ruelas', 'Memorias Foto-Video, Querétaro', 'Las galerías privadas con selección de fotos cambiaron la experiencia. Mis novias me recomiendan más.'],
      ['Iván Coronado', 'Coronado Photography, CDMX', 'Los paquetes de graduación con cobro por mensualidad me llenaron la agenda 4 meses antes.']
    ],
    FAQ: [
      ['¿Maneja sesiones por fotógrafo?', 'Sí. Cada uno con su agenda, equipo asignado y comisión por sesión o por venta.'],
      ['¿Cómo entrego las fotos al cliente?', 'Galería privada con clave, descarga con vencimiento o entrega física registrada en el sistema.'],
      ['¿Soporta cobros por mensualidad?', 'Sí. Paquetes de graduación o boda con plan de pagos automático y recordatorios.'],
      ['¿Puedo vender álbumes y prints?', 'Sí. Catálogo de productos físicos con costo, ganancia y proveedor.']
    ]
  },
  {
    file: 'landing-funeraria.html',
    GIRO_NAME: 'Funerarias',
    GIRO_SLUG: 'funeraria',
    GIRO_TITLE: 'Volvix POS para Funerarias y Servicios Funerarios',
    GIRO_KEYWORDS: 'software funeraria, plan preventivo funerario, servicios velorio, traslados, capillas, pos funeraria',
    HERO_TAG: 'Planes preventivos, velorios, traslados',
    HERO_HEADLINE: 'Atiende con dignidad, <span>sin perder un detalle</span>',
    HERO_SUBTITLE: 'Vende planes preventivos, gestiona servicios de velorio, traslados, capillas y trámites. Tu funeraria con orden y respeto.',
    FEATURES: [
      ['🕯️', 'Planes preventivos', 'Vende plan a futuro con pagos mensuales. Cobertura, beneficiarios y cláusulas en PDF firmable.'],
      ['🏛️', 'Servicios y capillas', 'Reserva capilla, servicio velorio, cremación o inhumación. Disponibilidad por turno.'],
      ['🚐', 'Traslados', 'Coordina traslado nacional o internacional con costos, kilometraje y conductor asignado.'],
      ['📋', 'Trámites legales', 'Checklist de documentos: acta, certificado de defunción, permisos. Recordatorios al equipo.'],
      ['👨‍👩‍👧', 'Expediente del doliente', 'Datos del fallecido, familia, decisiones y notas para que el siguiente turno continúe sin fallar.'],
      ['💐', 'Catálogo y servicios extra', 'Arreglos florales, esquelas, urnas, ataúdes. Cotización completa en una pantalla.']
    ],
    TESTIMONIALS: [
      ['Lic. Eduardo Pinto', 'Funeraria Pinto Hnos., Culiacán', 'Manejar planes preventivos con cobro mensual nos triplicó las ventas anticipadas en 2 años.'],
      ['Sra. Margarita López', 'Funeraria El Descanso, Veracruz', 'En momentos delicados, tener todo el expediente del doliente en una pantalla nos da claridad y respeto.'],
      ['Sr. Hugo Robles', 'Servicios Funerarios Robles, CDMX', 'La coordinación de traslados con costos pre-calculados eliminó las sorpresas para las familias.']
    ],
    FAQ: [
      ['¿Maneja planes preventivos a meses?', 'Sí. Vende a 12, 24 o 60 meses con cargo automático y cobertura activa al primer pago.'],
      ['¿Soporta múltiples capillas?', 'Sí. Reserva capilla, sala de velación o sala VIP con turnos y disponibilidad.'],
      ['¿Imprime documentos legales?', 'Sí. Acta, contrato, recibos y orden de servicio con membrete de tu funeraria.'],
      ['¿Es discreto y respetuoso?', 'Sí. Diseñado con sensibilidad para el trato con familias en duelo. Texto y flujo cuidados.']
    ]
  },
  {
    file: 'landing-lavado-autos.html',
    GIRO_NAME: 'Autolavados y Detallado',
    GIRO_SLUG: 'lavado-autos',
    GIRO_TITLE: 'Volvix POS para Autolavados y Centros de Detallado',
    GIRO_KEYWORDS: 'pos autolavado, software para car wash, paquetes de lavado, suscripciones autolavado, programa de lealtad lavado autos',
    HERO_TAG: 'Sencillo, completo, detallado y suscripciones',
    HERO_HEADLINE: 'Tu autolavado <span>vende más y cobra mejor</span>',
    HERO_SUBTITLE: 'Paquetes claros, suscripción mensual ilimitada, programa de lealtad y comisión por lavador. Carros entran y salen sin demora.',
    FEATURES: [
      ['🚗', 'Paquetes (sencillo/completo/detallado)', 'Cataloga servicios con precios fijos: solo exterior, completo, encerado, detallado interior.'],
      ['🔄', 'Suscripciones mensuales', 'Lavados ilimitados al mes con cargo automático a tarjeta. Tu cliente vuelve solo.'],
      ['⭐', 'Programa de lealtad', 'Sello digital o puntos. Lavado #10 gratis, descuento por antigüedad o cumpleaños.'],
      ['💵', 'Comisión por lavador', 'Asigna trabajo por turno, calcula propina y comisión. Reporte transparente para nómina.'],
      ['🚙', 'Tipo de vehículo', 'Precios por sedán, SUV, pickup o camioneta. Cobro correcto sin discusiones.'],
      ['📲', 'Reservas por WhatsApp', 'Tus clientes apartan turno desde su celular. Tú llegas y los esperas listos.']
    ],
    TESTIMONIALS: [
      ['Esteban Castillo', 'Auto Lavado Express, Saltillo', 'La suscripción de lavados ilimitados nos llenó con 320 clientes recurrentes. Ingreso fijo cada mes.'],
      ['Patricia Ortega', 'Detallado Premium, Monterrey', 'El programa de lealtad por sellos digitales recuperó 40% de clientes que ya no venían.'],
      ['Gerardo Mendoza', 'Car Wash La Plaza, Querétaro', 'Cobrar diferente por SUV y sedán acabó las discusiones del precio. Mis lavadores lo agradecen.']
    ],
    FAQ: [
      ['¿Maneja suscripciones mensuales?', 'Sí. Cargo automático a tarjeta, lavados ilimitados o limitados, cancelación con un clic.'],
      ['¿Cobra distinto por tipo de carro?', 'Sí. Catálogo por sedán, SUV, pickup, camioneta grande con precios y duración propios.'],
      ['¿Tiene programa de puntos?', 'Sí. Sellos digitales, puntos canjeables o cashback. Tu cliente lo ve en su celular.'],
      ['¿Calcula comisión a los lavadores?', 'Sí. Por servicio, por turno o por venta. Más propina capturada en el cobro.']
    ]
  },
  {
    file: 'landing-renta-autos.html',
    GIRO_NAME: 'Renta de Autos',
    GIRO_SLUG: 'renta-autos',
    GIRO_TITLE: 'Volvix POS para Renta de Autos y Vehículos',
    GIRO_KEYWORDS: 'pos renta de autos, software flotilla, kilometraje, depósitos, seguros, control de multas, sistema rent a car',
    HERO_TAG: 'Flota, kilometraje, depósitos y seguros',
    HERO_HEADLINE: 'Renta autos <span>sin perder dinero</span> en daños ni multas',
    HERO_SUBTITLE: 'Disponibilidad de flota en calendario, contrato firmado en pantalla, foto-inspección y cobro de daños y multas con evidencia.',
    FEATURES: [
      ['🚙', 'Catálogo de flota', 'Cada unidad con placas, VIN, kilometraje, mantenimiento y disponibilidad en tiempo real.'],
      ['📅', 'Calendario de reservas', 'Quién renta qué auto y cuándo. Bloqueo automático por mantenimiento o servicio.'],
      ['📸', 'Inspección con foto', 'Fotos al entregar y al recibir. Marca daños nuevos sobre la imagen y cobra automáticamente.'],
      ['💰', 'Depósitos y seguros', 'Captura depósito en garantía, deducible de seguro y cobro al regresar el auto.'],
      ['🛣️', 'Kilometraje y combustible', 'Lectura de odómetro al entregar y devolver. Cobro de excedente y combustible faltante.'],
      ['🚨', 'Multas y peajes', 'Registra multa con foto, asigna al cliente del periodo y cobra desde el sistema.']
    ],
    TESTIMONIALS: [
      ['Alfonso Méndez', 'Auto Rent Cancún', 'La foto-inspección en tablet eliminó el 95% de las disputas por daños. Cobranza limpia.'],
      ['Carolina Ríos', 'Renta de Autos del Norte, Monterrey', 'Antes tardaba 30 minutos por contrato. Ahora son 5 con firma digital y entrega expres.'],
      ['Fernando Quiroz', 'Quiroz Rent a Car, CDMX', 'Asignar multas automáticamente al cliente que rentaba el auto me recuperó 78,000 pesos en 6 meses.']
    ],
    FAQ: [
      ['¿Maneja flota grande?', 'Sí. Cientos de unidades con disponibilidad en vivo, mantenimiento y servicios programados.'],
      ['¿Cobra excedente de kilometraje?', 'Sí. Configura kms incluidos por día y costo por km extra. Cobro al recibir el auto.'],
      ['¿Genera contrato de renta?', 'Sí. PDF con datos del cliente, auto, fechas, depósito, seguro y firma digital del cliente.'],
      ['¿Asigna multas al cliente correcto?', 'Sí. Por fecha del comparendo se asocia al contrato activo de esa fecha y cobra al cliente.']
    ]
  },
  {
    file: 'landing-renta-salones.html',
    GIRO_NAME: 'Renta de Salones de Eventos',
    GIRO_SLUG: 'renta-salones',
    GIRO_TITLE: 'Volvix POS para Renta de Salones y Espacios para Eventos',
    GIRO_KEYWORDS: 'pos renta de salones, software para eventos, bloques horarios, depósito, paquetes con catering, sistema de eventos',
    HERO_TAG: 'Bloques horarios, depósitos y paquetes',
    HERO_HEADLINE: 'Tu salón de eventos <span>siempre rentado</span> y sin choques',
    HERO_SUBTITLE: 'Disponibilidad por bloques, paquetes con o sin catering, depósito en garantía y contrato firmado el mismo día.',
    FEATURES: [
      ['🏛️', 'Múltiples salones', 'Cada espacio con capacidad, tarifa por hora/día y características (jardín, terraza, salón cerrado).'],
      ['🕒', 'Bloques horarios', 'Renta por bloque (matutino, vespertino, nocturno, todo el día). Sin huecos, sin choques.'],
      ['🍽️', 'Paquetes con catering', 'Paquete sencillo (sin catering), con buffet, con plato fuerte. Costo y cobertura claros.'],
      ['💵', 'Depósito en garantía', 'Cobra depósito al apartar, devuelve al final si no hay daños o descuenta con foto evidencia.'],
      ['📋', 'Contrato firmado', 'Genera contrato con fechas, horario, capacidad, prohibiciones y firma digital del cliente.'],
      ['🎉', 'Servicios extra', 'DJ, mantelería, sillas Tiffany, mesas redondas. Cotización completa al armar el evento.']
    ],
    TESTIMONIALS: [
      ['Lourdes Aragón', 'Salón Gran Marquesa, Toluca', 'Los bloques horarios y la disponibilidad en vivo me dejaron rentar 3 eventos en un solo día.'],
      ['Diego Olvera', 'Hacienda Olvera, San Miguel de Allende', 'El depósito automático y el contrato firmado en pantalla acabaron las discusiones. Todo claro.'],
      ['Elena Rivas', 'Quinta Las Flores, Mérida', 'Los paquetes con catering listos para vender me hicieron cerrar 70% más bodas.']
    ],
    FAQ: [
      ['¿Renta por bloques o por hora?', 'Sí. Configura bloques (4h, 8h, 12h) o renta por hora con tarifa progresiva.'],
      ['¿Maneja varios salones a la vez?', 'Sí. Cada salón con su capacidad, tarifa, calendario y disponibilidad propia.'],
      ['¿Soporta paquetes con catering?', 'Sí. Define paquetes con menú, capacidad mínima, costo por persona y servicios incluidos.'],
      ['¿Imprime contrato del evento?', 'Sí. PDF con todos los detalles del evento, depósito, prohibiciones y firma digital.']
    ]
  },
  {
    file: 'landing-servicio-celulares.html',
    GIRO_NAME: 'Servicio Técnico de Celulares',
    GIRO_SLUG: 'servicio-celulares',
    GIRO_TITLE: 'Volvix POS para Servicio Técnico de Celulares',
    GIRO_KEYWORDS: 'pos servicio celulares, software reparación de celulares, control IMEI, refacciones, garantía de reparación, pos pantallas',
    HERO_TAG: 'IMEI, refacciones, garantías y pantallas',
    HERO_HEADLINE: 'Tu taller de celulares <span>profesional</span> y sin perder refacción',
    HERO_SUBTITLE: 'Captura por IMEI, control de refacciones, orden de servicio con diagnóstico, garantía de reparación y catálogo de pantallas.',
    FEATURES: [
      ['📱', 'Captura por IMEI', 'Registra el celular por IMEI/serie, modelo, color y daño visible al recibir. Foto antes y después.'],
      ['🔧', 'Refacciones e inventario', 'Pantallas, baterías, flex y micas por marca y modelo. Stock mínimo y proveedor por pieza.'],
      ['📋', 'Orden de servicio', 'Diagnóstico, cotización, autorización del cliente, fecha estimada de entrega y firma.'],
      ['🛡️', 'Garantía de reparación', 'Plazo configurable por tipo de servicio. Tracking de reincidencia y motivo si regresa.'],
      ['🖥️', 'Catálogo de pantallas', 'Pantalla iPhone 13, Samsung A14, Xiaomi Redmi… con compatibilidad y precio actualizado.'],
      ['💬', 'Avisos al cliente', 'WhatsApp automático: "ya está listo", "llegó la refacción", "cotización aprobada".']
    ],
    TESTIMONIALS: [
      ['Jonathan Estrada', 'Reparaciones JE, Tijuana', 'Captura por IMEI con foto eliminó las dudas de "este no es mi celular". Cero reclamos.'],
      ['Pamela Gómez', 'TecnoCell Service, Puebla', 'Saber qué refacción tengo y cuál pedir me dejó cumplir entregas en 24h. Mis Google reviews subieron.'],
      ['Adrián Sosa', 'iFix Mx, CDMX', 'La garantía con tracking me bajó el costo en reincidencias 60%. Datos que antes no tenía.']
    ],
    FAQ: [
      ['¿Soporta IMEI y número de serie?', 'Sí. Captura IMEI, serie, modelo, color y estado al recibir con foto adjunta.'],
      ['¿Maneja inventario de refacciones?', 'Sí. Pantallas, baterías, flex, mica y herramientas con stock mínimo y proveedor.'],
      ['¿Imprime orden de servicio?', 'Sí. PDF con diagnóstico, costo aprobado, plazo de entrega y firma digital del cliente.'],
      ['¿Manda avisos por WhatsApp?', 'Sí. Confirmación de recepción, autorización, llegada de refacción y "tu equipo está listo".']
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
  const out = path.join(OUT_DIR, g.file);
  fs.writeFileSync(out, buildHTML(g), 'utf8');
  const sz = fs.statSync(out).size;
  console.log(`✓ ${g.file}  ${sz} bytes`);
  written++;
}
console.log(`\nDone. ${written} files written to ${OUT_DIR}`);
