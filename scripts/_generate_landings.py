"""
Generator for 10 industry-specific landing pages.
Self-contained, runs once, produces 10 HTML files.
"""
import os, json

BASE_DIR = r"C:\Users\DELL\Downloads\verion 340"

INDUSTRIES = [
    {
        "slug": "abarrotes",
        "name": "Abarrotes",
        "name_lower": "abarrotes",
        "vertical_param": "abarrotes",
        "emoji": "🛒",
        "accent": "#16A34A",
        "accent_dark": "#15803D",
        "accent_soft": "#F0FDF4",
        "tagline": "El POS hecho para tu tienda de abarrotes",
        "subhead": "Cobra rápido, controla inventario con caducidad y vende a crédito sin perder ni un peso. Volvix POS está pensado para abarroteros que quieren crecer.",
        "title_seo": "POS para Abarrotes | Punto de Venta Inventario y Crédito | Volvix",
        "meta_desc": "Sistema POS para tiendas de abarrotes con lector de códigos de barras universal, control de inventario, alertas de caducidad y manejo de crédito a clientes. Prueba 14 días gratis.",
        "keywords": "pos abarrotes, sistema punto de venta abarrotes, software tienda abarrotes, inventario abarrotes, crédito clientes abarrotes",
        "pains": [
            ("📦", "Inventario sin control", "No sabes qué se vende, qué caduca ni qué te están robando."),
            ("💸", "Clientes que no pagan", "Vendes a crédito en cuaderno y al final del mes nadie cuadra."),
            ("⏰", "Filas largas en hora pico", "El cobro manual te hace perder ventas cuando más necesitas atender."),
        ],
        "features": [
            ("📷", "Lector universal de códigos", "Escanea cualquier producto: si no está en tu catálogo, Volvix lo busca en bases públicas y lo agrega solo."),
            ("📊", "Inventario con caducidad", "Alertas automáticas de bajo stock y productos próximos a caducar para que jamás vendas algo vencido."),
            ("🤝", "Crédito a clientes (fiados)", "Lleva el control de cada cliente: cuánto debe, desde cuándo y manda recordatorios automáticos por WhatsApp."),
            ("💰", "Multi-precio mayoreo/menudeo", "Define precios distintos por cantidad o cliente. Volvix aplica el correcto automáticamente."),
            ("📈", "Reportes de rotación", "Sabe qué productos giran rápido, cuáles están parados y cuáles te dejan más margen."),
        ],
        "diff": [
            "Diseñado en español, con soporte técnico real desde Latinoamérica.",
            "Funciona offline: si se cae el internet, sigues vendiendo y luego sincroniza.",
            "Multi-tenant: maneja varias tiendas/sucursales desde un solo panel.",
            "IA integrada: predicciones de demanda y compras sugeridas automáticas.",
        ],
        "testimonials": [
            ("Don Rafael Hernández", "Abarrotes La Esperanza", "Puebla, MX", "Antes anotaba todo en cuaderno y al cierre del mes me faltaban miles. Con Volvix sé exactamente qué me deben y qué me sobra. Recuperé 8 mil pesos en fiados olvidados el primer mes."),
            ("María Elena Torres", "Mini Súper Doña Mary", "Guadalajara, MX", "El lector universal es magia. Llegan productos nuevos y los escaneo, ya están listos para vender. Antes me tardaba horas dándolos de alta."),
            ("Jorge Ramírez", "Abarrotes Familiar", "CDMX", "Volvix me dijo que tenía 40 cajas de leche por caducar. Las puse en oferta y vendí todo. Eso solo, pagó la suscripción del año."),
        ],
        "faq": [
            ("¿Funciona si se va el internet?", "Sí. Volvix opera 100% offline y sincroniza cuando vuelve la conexión. Jamás dejarás de vender."),
            ("¿Necesito comprar lector de códigos especial?", "No. Cualquier lector USB o Bluetooth funciona. También puedes usar la cámara del celular o tablet."),
            ("¿Puedo manejar varias sucursales?", "Sí, desde el plan Pro. Cada sucursal tiene su inventario y caja, pero los reportes se consolidan en un solo panel."),
            ("¿Cómo manejo el crédito a clientes?", "Cada cliente tiene su ficha con saldo, historial y límite de crédito. Volvix manda recordatorios automáticos por WhatsApp."),
            ("¿Qué pasa con productos sin código de barras?", "Volvix te permite crear códigos internos imprimibles, o usar productos por nombre/categoría sin código."),
            ("¿El precio incluye IVA?", "Sí. Todos los precios mostrados incluyen IVA. No hay costos ocultos."),
        ],
    },
    {
        "slug": "panaderia",
        "name": "Panadería",
        "name_lower": "panadería",
        "vertical_param": "panaderia",
        "emoji": "🥖",
        "accent": "#A16207",
        "accent_dark": "#854D0E",
        "accent_soft": "#FEFCE8",
        "tagline": "El POS hecho para tu panadería",
        "subhead": "Controla recetas, lotes diarios, mermas y pre-órdenes. Volvix entiende que tu producto se hace cada día y se vende fresco.",
        "title_seo": "POS para Panadería | Recetas, Lotes y Pre-Órdenes | Volvix",
        "meta_desc": "Sistema POS para panaderías con control de producción por lotes, costo de receta, manejo de mermas y pre-órdenes para eventos. Prueba 14 días gratis.",
        "keywords": "pos panadería, software panadería, sistema panadería, control producción panadería, pedidos pasteles",
        "pains": [
            ("🔥", "Producción sin medir", "No sabes cuánto te cuesta cada pieza ni cuánto margen real tienes."),
            ("🗑️", "Mermas no controladas", "Al final del día tiras pan y no sabes cuánto perdiste."),
            ("📋", "Pedidos en libreta", "Pasteles para fiestas, bocadillos para eventos, todo en papelitos que se pierden."),
        ],
        "features": [
            ("👨‍🍳", "Recetas y costo real", "Carga tu receta una vez. Volvix calcula costo por pieza y margen automáticamente, incluso si suben los insumos."),
            ("🥐", "Producción por lotes", "Programa hornadas diarias, controla cuánto sale del horno y compáralo con lo vendido."),
            ("🗑️", "Control de mermas", "Registra lo que tiras, lo que regalas, lo que se da al personal. Reportes por causa."),
            ("🎂", "Pre-órdenes y pasteles", "Captura pedidos especiales con foto de referencia, fecha, anticipo y entrega. WhatsApp automático."),
            ("🏷️", "Etiquetas térmicas", "Imprime etiquetas con código de barras y precio para autoservicio. Compatible con cualquier térmica."),
        ],
        "diff": [
            "Único POS con costeo de recetas en tiempo real para panadería.",
            "Soporte en español de personas que entienden de mostradores y vitrinas.",
            "Funciona offline: la pantalla del mostrador no se cae jamás.",
            "IA que predice cuánto producir según día de la semana y clima.",
        ],
        "testimonials": [
            ("Sandra Mendoza", "Panadería La Concha de Oro", "Querétaro, MX", "Volvix me dijo que estaba perdiendo 18% en mermas de bolillo. Ajusté la producción y en 3 meses recuperé esa pérdida. La IA me sugiere cuánto hornear cada día."),
            ("Luis Alberto Vega", "Pastelería Dulce Sueño", "Mérida, MX", "Las pre-órdenes de pasteles eran un caos. Ahora cada pedido tiene su ficha con foto, anticipo y recordatorio. Pasamos de 12 a 40 pasteles a la semana."),
            ("Carmen Ruiz", "Pan Artesanal Tía Carmen", "Monterrey, MX", "Cargué mis 80 recetas y Volvix me mostró que 6 productos los vendía a pérdida. Ajusté precios y mi margen subió 23%."),
        ],
        "faq": [
            ("¿Cómo cargo mis recetas?", "Una sola vez. Defines insumos, cantidades y rendimiento. Volvix calcula costo automáticamente cuando cambian los precios de insumos."),
            ("¿Funciona con báscula para pan a granel?", "Sí. Soporta básculas USB y Bluetooth. También puedes vender por pieza o por kilo en el mismo ticket."),
            ("¿Puedo aceptar pre-órdenes desde WhatsApp?", "Sí. El sistema genera un link que el cliente abre, escoge producto, fecha y paga anticipo. Llega solo a tu panel."),
            ("¿Maneja descuentos a empleados?", "Sí. Cada empleado tiene un PIN y un % de descuento configurable. Todo queda registrado."),
            ("¿Imprime etiquetas con código de barras?", "Sí. Diseñador integrado con tu logo, precio y código. Compatible con impresoras térmicas Zebra, Epson y compatibles."),
            ("¿Puedo controlar varias sucursales?", "Sí, desde el plan Pro. Cada sucursal tiene su producción y caja, con reportes consolidados."),
        ],
    },
    {
        "slug": "farmacia",
        "name": "Farmacia",
        "name_lower": "farmacia",
        "vertical_param": "farmacia",
        "emoji": "💊",
        "accent": "#0891B2",
        "accent_dark": "#0E7490",
        "accent_soft": "#ECFEFF",
        "tagline": "El POS hecho para tu farmacia",
        "subhead": "Búsqueda por principio activo, alertas de caducidad, recetas digitales y reportes de medicamentos controlados. Cumplimiento total y atención al paciente más rápida.",
        "title_seo": "POS para Farmacia | Principio Activo, Caducidad y Recetas | Volvix",
        "meta_desc": "Sistema POS para farmacias con búsqueda por principio activo, alertas de caducidad, recetas digitales, control de medicamentos controlados y estructura para seguros médicos.",
        "keywords": "pos farmacia, software farmacia, sistema farmacia, principio activo, medicamentos controlados, recetas digitales",
        "pains": [
            ("💊", "Cliente pide genérico", "No siempre encuentras la alternativa al medicamento de marca rápido."),
            ("📅", "Caducidad descontrolada", "Te encuentras lotes vencidos en estantes y pierdes inventario completo."),
            ("📋", "Recetas en papel", "Médicos firman, surtes a medias, no sabes si ya se completó la dosis."),
        ],
        "features": [
            ("🔍", "Búsqueda por principio activo", "Escribe paracetamol y ves todas las marcas, presentaciones y precios. Sugiere genéricos automáticamente."),
            ("⏰", "Alertas de caducidad", "Lotes próximos a vencer en rojo. Reportes mensuales y promociones automáticas para mover producto."),
            ("📄", "Recetas digitales", "Captura receta una vez, surte por dosis, ve historial completo del paciente. Cumple normativa."),
            ("🏥", "Estructura para seguros", "Preparado para integración con aseguradoras: cuenta del paciente, copago, autorización."),
            ("📊", "Medicamentos controlados", "Reporte automático de Grupo II, III, IV con folios y firmas. Listo para auditoría COFEPRIS."),
        ],
        "diff": [
            "Único POS en español con búsqueda por principio activo y sinónimos.",
            "Cumple con normativa COFEPRIS sin trámites adicionales.",
            "Soporte 24/7: una farmacia no puede parar.",
            "IA que detecta interacciones medicamentosas y avisa al farmacéutico.",
        ],
        "testimonials": [
            ("Dra. Patricia Solís", "Farmacia San José", "León, MX", "Antes mi auxiliar tardaba 2 minutos buscando el genérico. Ahora con principio activo es instantáneo. Atendemos 30% más pacientes en hora pico."),
            ("Mario Castillo", "Farmacéutica del Centro", "Toluca, MX", "Caducidades fue lo que me convenció. Recuperé 14 mil pesos en producto que iba a vencer, lo puse en promo y se vendió todo en una semana."),
            ("Lic. Roberto Aguilar", "Farmacias Aguilar (3 sucursales)", "CDMX", "El reporte de controlados para COFEPRIS lo generaba a mano, 2 días al mes. Ahora es 1 click. Y los inspectores quedan encantados."),
        ],
        "faq": [
            ("¿Maneja medicamentos del Grupo II?", "Sí. Folios, firmas digitales, libro de control y reportes para COFEPRIS automáticos."),
            ("¿Puede integrarse con seguros médicos?", "La estructura está lista. Configuramos la conexión específica con tu aseguradora bajo plan Enterprise."),
            ("¿Detecta interacciones medicamentosas?", "Sí. La IA cruza el historial del paciente y avisa al farmacéutico si hay interacciones conocidas."),
            ("¿Imprime tickets con datos fiscales?", "Sí. Ticket simple o factura electrónica CFDI 4.0 timbrada al instante."),
            ("¿Cómo cargo el catálogo inicial?", "Volvix incluye catálogo base de 18,000+ medicamentos en México. Solo ajustas tu inventario y precios."),
            ("¿Funciona offline en clínicas rurales?", "Sí, totalmente. Sincroniza cuando regresa el internet sin perder un solo registro."),
        ],
    },
    {
        "slug": "restaurant",
        "name": "Restaurante",
        "name_lower": "restaurante",
        "vertical_param": "restaurant",
        "emoji": "🍽️",
        "accent": "#DC2626",
        "accent_dark": "#B91C1C",
        "accent_soft": "#FEF2F2",
        "tagline": "El POS hecho para tu restaurante",
        "subhead": "Comandero de cocina, manejo de mesas, división de cuentas, modificadores y propinas. Volvix le da ritmo a tu cocina y orden a tu salón.",
        "title_seo": "POS para Restaurante | KDS, Mesas y División de Cuentas | Volvix",
        "meta_desc": "Sistema POS para restaurantes con comandero de cocina (KDS), manejo de mesas, división de cuentas, modificadores y propinas. Prueba 14 días gratis.",
        "keywords": "pos restaurante, sistema restaurante, software restaurante, comandero kds, dividir cuenta restaurante",
        "pains": [
            ("🍳", "Cocina y salón desconectados", "El mesero grita la orden, la cocina la pierde, el cliente se enoja."),
            ("💸", "Cuentas sin dividir", "4 amigos comen juntos y dividir la cuenta es un calvario."),
            ("📝", "Modificadores en papel", "Sin queso, sin cebolla, extra picante… y la cocina se equivoca igual."),
        ],
        "features": [
            ("📺", "Comandero KDS", "Pantalla en cocina con órdenes en tiempo real, tiempos por platillo y prioridades automáticas."),
            ("🪑", "Mapa de mesas", "Mesa 5 ocupada con propina del 12%, mesa 8 esperando bebidas. Ves todo el salón en un golpe."),
            ("💳", "Dividir cuenta", "Por persona, por platillo o porcentual. Imprime tickets separados o un solo ticket con detalle."),
            ("🌶️", "Modificadores", "Sin sal, extra queso, término medio. Configura una vez, úsalos siempre. Llegan claros a cocina."),
            ("📊", "Platillo más vendido", "Reportes de qué se vende, ticket promedio, mesero estrella, hora pico, día más fuerte."),
        ],
        "diff": [
            "Comandero KDS incluido sin costo extra (otros cobran $300+/mes solo por eso).",
            "Soporte 24/7: si se cae a las 9pm un sábado, hay alguien al teléfono.",
            "Funciona offline: la cocina no se detiene aunque se caiga el internet.",
            "Integración con Uber Eats, Rappi y DiDi Food en un solo panel.",
        ],
        "testimonials": [
            ("Chef Andrés Morales", "Cantina La Reserva", "Puebla, MX", "El KDS cambió todo. Antes la cocina recibía órdenes con 4 minutos de retraso. Ahora es instantáneo. Los tiempos bajaron 35%."),
            ("Lucía Hernández", "Bistró Lucía", "CDMX", "Dividir cuenta es lo más solicitado por mis clientes. Antes hacía cálculos a mano, ahora es 1 click. Las propinas subieron 18% solo por la opción sugerida."),
            ("Roberto Tapia", "Tacos El Compa (4 sucursales)", "Monterrey, MX", "Manejo 4 sucursales desde mi celular. Veo en tiempo real cuántos tacos al pastor se han vendido en cada una. La IA me dijo que la sucursal 3 necesitaba más cocineros los viernes."),
        ],
        "faq": [
            ("¿Necesito hardware especial para el KDS?", "No. Cualquier tablet, monitor con mini-PC o smart TV con navegador funciona."),
            ("¿Cómo se manejan las propinas?", "Volvix sugiere 10/15/20%, calcula automáticamente, separa por mesero y reporta al cierre del turno."),
            ("¿Se integra con apps de delivery?", "Sí. Uber Eats, Rappi y DiDi Food se conectan al mismo panel. Las órdenes llegan al KDS."),
            ("¿Maneja reservaciones?", "Sí. Calendario integrado con confirmación por WhatsApp y recordatorio 2 horas antes."),
            ("¿Imprime ticket en cocina y barra por separado?", "Sí. Configura impresoras por categoría (bebidas a barra, comida a cocina, postres a repostería)."),
            ("¿Cumple con factura electrónica?", "Sí. CFDI 4.0 timbrada al instante. Cliente puede pedir factura escaneando QR del ticket."),
        ],
    },
    {
        "slug": "cafe",
        "name": "Café",
        "name_lower": "cafetería",
        "vertical_param": "cafe",
        "emoji": "☕",
        "accent": "#78350F",
        "accent_dark": "#451A03",
        "accent_soft": "#FFFBEB",
        "tagline": "El POS hecho para tu café",
        "subhead": "Modo barra rápida, programa de lealtad, modificadores de bebida y reportes de horas pico. Volvix mantiene la fila moviéndose y los clientes regresando.",
        "title_seo": "POS para Cafetería | Modo Barra, Lealtad y Modificadores | Volvix",
        "meta_desc": "Sistema POS para cafeterías con modo barra rápida, programa de lealtad (5x1), modificadores de bebida y reportes de horas pico. Prueba 14 días gratis.",
        "keywords": "pos café, sistema cafetería, software café, programa lealtad café, modificadores bebida",
        "pains": [
            ("⏰", "Filas en hora pico", "8am: 12 personas esperando, tu barista cobrando lento, clientes que se van."),
            ("🎁", "Sin lealtad real", "Tarjetitas de cartón con sellos, se pierden, los clientes no regresan."),
            ("🥤", "Modificadores complejos", "Latte grande, leche de almendra, sin azúcar, extra shot… y el barista se equivoca."),
        ],
        "features": [
            ("⚡", "Modo barra rápida", "Bebidas favoritas en pantalla principal con 1 click. Sin menús, sin búsqueda. Cobras en 6 segundos."),
            ("⭐", "Programa de lealtad", "Cliente llega, da número, suma puntos. A los 5 cafés, el sexto gratis. Todo digital, sin tarjetas."),
            ("🥛", "Modificadores ilimitados", "Tamaño, leche, sirope, extra shot, sin azúcar. Configurables por bebida con precio extra automático."),
            ("📦", "Para llevar vs en local", "Toggle de un click. Aplica IVA correcto, manda a cocina con etiqueta visible y separa estadísticas."),
            ("📈", "Análisis de horas pico", "Sabes que de 8 a 9am vendes el 28% del día. Programa más baristas o lanza promo en horas valle."),
        ],
        "diff": [
            "Modo barra optimizado para cobrar en menos de 10 segundos por cliente.",
            "Lealtad sin app extra: solo el número de teléfono del cliente.",
            "Soporte humano en español sin filas de espera.",
            "Integración con Spotify para que tu playlist suene desde el mismo panel.",
        ],
        "testimonials": [
            ("Sofía Domínguez", "Café El Despertar", "CDMX", "Reduje el tiempo de cobro de 22 a 8 segundos. La fila ya no se sale a la calle. Mis ventas de la mañana subieron 26%."),
            ("Diego Salazar", "La Cafetera de Diego", "Oaxaca, MX", "El programa de lealtad enganchó a mis clientes. Pasamos de 40 a 180 clientes recurrentes en 4 meses. Ya conozco sus nombres."),
            ("Valeria Núñez", "Coffee Lab", "Tijuana, MX", "Los modificadores son perfectos. Mis 3 baristas hacen exactamente la misma bebida porque la receta llega clarísima. Las quejas bajaron a casi cero."),
        ],
        "faq": [
            ("¿Maneja inventario de granos?", "Sí. Cada bebida descuenta gramos del lote activo. Te avisa cuando vas a quedarte sin café."),
            ("¿Puedo vender pasteles y comida también?", "Sí. Combina barra rápida con menú completo. Mismo POS, mismo ticket."),
            ("¿La lealtad funciona con número de teléfono?", "Sí. Cliente da su número, suma puntos. Sin app, sin tarjeta, sin fricciones."),
            ("¿Imprime ticket con QR de WiFi?", "Sí. Personaliza tu ticket con QR de WiFi, redes sociales o reseña en Google."),
            ("¿Funciona en iPad?", "Sí. Web app, funciona en iPad, Android, PC, Mac y hasta en pantallas táctiles industriales."),
            ("¿Qué pasa si se cae el internet en hora pico?", "Sigues cobrando. Volvix funciona 100% offline y sincroniza después sin perder un solo ticket."),
        ],
    },
    {
        "slug": "barberia",
        "name": "Barbería y Salón",
        "name_lower": "barbería",
        "vertical_param": "barberia",
        "emoji": "💈",
        "accent": "#1E3A8A",
        "accent_dark": "#1E40AF",
        "accent_soft": "#EFF6FF",
        "tagline": "El POS hecho para tu barbería o salón",
        "subhead": "Agenda de citas con recordatorios automáticos, comisiones por estilista, productos y servicios. Volvix profesionaliza tu silla.",
        "title_seo": "POS para Barbería y Salón | Agenda, Comisiones y Servicios | Volvix",
        "meta_desc": "Sistema POS para barberías y salones con agenda de citas, recordatorios SMS/WhatsApp, comisiones por estilista y control de productos. Prueba 14 días gratis.",
        "keywords": "pos barbería, sistema salón belleza, agenda citas barbería, comisiones estilistas, software barbería",
        "pains": [
            ("📅", "Citas que no llegan", "El 30% de tus citas no se presenta y pierdes dinero todos los días."),
            ("💸", "Comisiones a mano", "Calcular cuánto le toca a cada estilista al final del mes es un dolor."),
            ("🧴", "Productos sin vender", "Tienes shampoo, ceras y geles en estante, pero los estilistas no los ofrecen."),
        ],
        "features": [
            ("📆", "Agenda inteligente", "Cliente reserva por link, recibe confirmación y recordatorio 2h antes por WhatsApp. Reduce no-shows un 40%."),
            ("✂️", "Servicios por estilista", "Cada estilista tiene sus servicios, precios y duración. La agenda calcula huecos automáticamente."),
            ("💰", "Comisiones automáticas", "Define % por servicio o producto. Al cierre del día/mes, Volvix te dice cuánto le pagas a cada uno."),
            ("🛍️", "Venta de productos", "Sugerencias automáticas: si vendiste corte, sugiere cera. Tus estilistas venden 3x más con prompts visuales."),
            ("📊", "Utilización de horarios", "Ves qué estilistas están saturados y cuáles tienen huecos. Optimiza tu plantilla con datos reales."),
        ],
        "diff": [
            "Agenda con link público compartible (Instagram, WhatsApp Business, Google).",
            "Recordatorios automáticos por WhatsApp incluidos sin costo extra.",
            "Soporte humano de verdad, no chatbots inservibles.",
            "Multi-sucursal con vista consolidada y comisiones por sede.",
        ],
        "testimonials": [
            ("Carlos 'El Maestro' Vega", "Barbería Vega Premium", "Guadalajara, MX", "Bajé los no-shows del 28% al 9% solo con los recordatorios automáticos. Eso son como 8 cortes extras a la semana, $4,800 más."),
            ("Estilista Yolanda Cruz", "Salón Yoli", "Mérida, MX", "Las comisiones automáticas me ahorran 6 horas al mes. Antes era cuaderno, calculadora y discusiones. Ahora es transparente para todas."),
            ("Iván Robles", "Barbería Brothers (2 sedes)", "Monterrey, MX", "El reporte de utilización me mostró que mi sede 2 estaba al 45% los lunes. Lancé promo de lunes y subí al 78%. Datos reales = dinero real."),
        ],
        "faq": [
            ("¿Cómo se manejan las cancelaciones?", "Cliente cancela desde el mismo link de confirmación. La hora se libera automática y notificas al estilista."),
            ("¿Puedo cobrar anticipo para asegurar la cita?", "Sí. Configurable: 0%, anticipo fijo o % del servicio. Cliente paga con tarjeta al reservar."),
            ("¿Se integra con Instagram y Google?", "Sí. Botón \"Reservar\" en tu Instagram y en Google Maps abre directo tu agenda Volvix."),
            ("¿Maneja paquetes y bonos?", "Sí. Vende paquetes de 5 cortes con descuento, Volvix lleva el saldo del cliente automáticamente."),
            ("¿Las comisiones consideran productos?", "Sí. Comisión separada por servicio y por producto, con porcentajes distintos si quieres."),
            ("¿Funciona en celular del estilista?", "Sí. Cada estilista ve su agenda en su celular, marca asistencia y cierra servicio sin tocar la caja."),
        ],
    },
    {
        "slug": "gasolinera",
        "name": "Gasolinera",
        "name_lower": "gasolinera",
        "vertical_param": "gasolinera",
        "emoji": "⛽",
        "accent": "#CA8A04",
        "accent_dark": "#854D0E",
        "accent_soft": "#FEFCE8",
        "tagline": "El POS hecho para tu gasolinera",
        "subhead": "Control por bomba, inventario de combustible, tienda de conveniencia integrada y pagos contactless. Volvix une tu pista y tu mini-súper.",
        "title_seo": "POS para Gasolinera | Bombas, Tienda y Flotillas | Volvix",
        "meta_desc": "Sistema POS para gasolineras con control por bomba, inventario de combustible, tienda de conveniencia integrada, pagos contactless y manejo de flotillas.",
        "keywords": "pos gasolinera, sistema gasolinera, software estación servicio, control bombas combustible, flotillas",
        "pains": [
            ("⛽", "Bombas sin sincronía", "Cada bomba reporta su forma, los cierres no cuadran, faltan litros en papel."),
            ("🏪", "Tienda y pista separadas", "Cliente carga gasolina y compra refresco: dos sistemas, doble fila, doble dolor."),
            ("🚚", "Flotillas sin control", "Empresas con 30 unidades, cada chofer pide vale, te tardas días en facturar."),
        ],
        "features": [
            ("🛢️", "Control por bomba", "Cada despachador tiene su pantalla. Litros, monto, turno, cierre. Volvix concilia todo en un panel."),
            ("📊", "Inventario de combustible", "Tanques con sensor o con lectura manual. Volvix detecta robos, mermas y diferencias por turno."),
            ("🏪", "Tienda integrada", "Cliente carga gasolina y agrega Coca + chetos en el mismo ticket. Pago único, ticket único."),
            ("💳", "Contactless y flotillas", "Acepta tarjetas, NFC, móviles. Empresas con flotilla pagan con vale digital y se factura mensual."),
            ("📈", "Reportes por turno", "Litros vendidos, efectivo en caja, diferencias, mermas. Cierre de turno en 90 segundos."),
        ],
        "diff": [
            "Único POS de gasolineras con tienda y pista en un solo software.",
            "Cumple con SAT controles volumétricos y CFDI complemento gasolinas.",
            "Soporte 24/7: una gasolinera no cierra, nosotros tampoco.",
            "Funciona offline: si se cae internet, sigues despachando y cobrando.",
        ],
        "testimonials": [
            ("Ing. Felipe Cárdenas", "Gasolinera Don Pepe", "León, MX", "Antes mis turnos tardaban 40 minutos en cerrar, con discusiones por diferencias. Ahora son 5 minutos sin pelea. Cuadra solo."),
            ("Lic. Adriana Pérez", "Combustibles del Norte", "Saltillo, MX", "El módulo de flotillas me ganó 3 clientes empresariales en un año. Empresa carga, factura llega solo el día 30. Ya no pierdo papelitos."),
            ("Don Memo Salinas", "Estación Memo", "Hermosillo, MX", "La tienda subió 60% sus ventas porque el cliente que carga gasolina ya no se baja: paga todo en pista. Eso solo paga Volvix 10 veces."),
        ],
        "faq": [
            ("¿Cumple con controles volumétricos del SAT?", "Sí. Genera el archivo .XML mensual y los reportes JSON requeridos automáticamente."),
            ("¿Integra con dispensarios existentes?", "Sí. Compatible con la mayoría de dispensarios Wayne, Gilbarco, Bennett. Nuestro equipo confirma tu modelo."),
            ("¿Maneja CFDI complemento gasolinas?", "Sí. Genera factura con complemento al instante, escaneando QR del ticket."),
            ("¿Cómo se manejan las flotillas?", "Cada empresa tiene cuenta. Choferes cargan con código, sistema acumula. Factura única el último día del mes."),
            ("¿Funciona si se va la luz?", "POS con UPS sigue cobrando offline. Cuando regresa luz e internet, sincroniza todo."),
            ("¿Maneja varios productos (Magna, Premium, Diésel)?", "Sí. Precios por producto, turno, día. Históricos completos para auditoría."),
        ],
    },
    {
        "slug": "ropa",
        "name": "Tienda de Ropa",
        "name_lower": "tienda de ropa",
        "vertical_param": "ropa",
        "emoji": "👗",
        "accent": "#DB2777",
        "accent_dark": "#9D174D",
        "accent_soft": "#FDF2F8",
        "tagline": "El POS hecho para tu tienda de ropa",
        "subhead": "Variantes por talla y color, cambios y devoluciones, inventario por temporada. Volvix entiende que un vestido azul talla M no es lo mismo que negro talla L.",
        "title_seo": "POS para Tienda de Ropa | Variantes, Cambios y Temporada | Volvix",
        "meta_desc": "Sistema POS para tiendas de ropa con variantes (talla/color), cambios y devoluciones, vales crédito, inventario por temporada y reportes por colección.",
        "keywords": "pos tienda ropa, sistema boutique, software ropa, variantes talla color, vale crédito devolución",
        "pains": [
            ("👕", "Variantes infinitas", "1 modelo, 4 colores, 6 tallas = 24 SKUs en otros sistemas. En el tuyo, caos."),
            ("🔄", "Cambios y devoluciones", "Cliente quiere cambiar talla, no tienes en stock, ¿le das vale? ¿le devuelves? Sin proceso claro."),
            ("📦", "Temporadas pasadas", "Te queda inventario de invierno en agosto y no sabes cuánto, ni cómo liquidarlo."),
        ],
        "features": [
            ("🎨", "Variantes inteligentes", "Un SKU madre con todas sus tallas y colores. Stock por variante, precio único o variable. Reportes claros."),
            ("🔄", "Cambios sin pelea", "Cliente regresa, escanea ticket, eliges nuevo producto. Diferencia se cobra o se da en vale digital."),
            ("🎫", "Vales crédito", "Generas vale digital con QR. Cliente lo usa cuando quiera, en cualquier sucursal. Sin papelitos perdidos."),
            ("📅", "Temporadas y colecciones", "Cada producto pertenece a una colección. Cierras temporada con 1 click y ves qué quedó por liquidar."),
            ("📊", "Reportes por colección", "Qué color vendió más, qué talla se acabó primero, qué prenda quedó muerta. Compras inteligentes."),
        ],
        "diff": [
            "Único POS con variantes nativas (otros lo simulan con SKUs separados).",
            "Vales crédito digitales con QR sin costo extra.",
            "Funciona online y offline en todos tus probadores y caja.",
            "IA que sugiere outfits complementarios al cliente en caja.",
        ],
        "testimonials": [
            ("Mariana López", "Boutique Mariana", "Guadalajara, MX", "Antes manejaba talla/color con SKUs distintos, era un infierno. Con variantes Volvix mi inventario es claro. Reduje quiebres de stock 60%."),
            ("Daniel Treviño", "Caballero Boutique", "Monterrey, MX", "Los vales digitales eliminaron las discusiones. Cliente pierde papel, no importa, está en su WhatsApp. La gente regresa más a usarlo."),
            ("Pamela Gutiérrez", "Tienda Pam (3 sucursales)", "CDMX", "Cierro temporada y veo en 5 segundos: invierno me quedaron 12 chamarras talla S color rojo. Las pongo en outlet, se van. No me como otro invierno con stock viejo."),
        ],
        "faq": [
            ("¿Cómo cargo variantes en bloque?", "Importas Excel con modelo, color, talla y stock. Volvix arma todo en segundos."),
            ("¿Imprime etiquetas con código por variante?", "Sí. Etiqueta única por talla/color con tu logo, precio y código. Compatible con cualquier térmica."),
            ("¿Puedo dar vales sin tope?", "Sí. Configuras vencimiento (30 días, 1 año, sin vencer), monto mínimo de uso y restricciones por categoría."),
            ("¿Maneja apartados?", "Sí. Cliente abona, Volvix lleva control de saldo y vencimiento. Si no paga en X días, regresa al inventario."),
            ("¿Se integra con tienda online?", "Sí. Conector con Shopify, WooCommerce y Tienda Nube. Inventario sincronizado en tiempo real."),
            ("¿Reportes de temporada anterior se mantienen?", "Sí. Histórico ilimitado. Compara temporada 2024 vs 2025 con un click."),
        ],
    },
    {
        "slug": "electronica",
        "name": "Electrónica",
        "name_lower": "electrónica",
        "vertical_param": "electronica",
        "emoji": "📱",
        "accent": "#2563EB",
        "accent_dark": "#1D4ED8",
        "accent_soft": "#EFF6FF",
        "tagline": "El POS hecho para tu tienda de electrónica",
        "subhead": "Garantías por número de serie, especificaciones técnicas en búsqueda, trade-in de equipos usados y soporte post-venta. Volvix profesionaliza tu tienda de tech.",
        "title_seo": "POS para Tienda de Electrónica | Garantías, Series y Trade-In | Volvix",
        "meta_desc": "Sistema POS para tiendas de electrónica con garantías por serial, especificaciones técnicas en búsqueda, trade-in de usados, soporte post-venta y reportes de reclamos.",
        "keywords": "pos electrónica, sistema tienda electrónicos, garantías serial, trade in, soporte post venta",
        "pains": [
            ("🔢", "Series sin trazabilidad", "Cliente regresa con celular en garantía y no sabes si lo vendiste tú."),
            ("🔍", "Búsqueda imprecisa", "Cliente pregunta por celular con 8GB RAM y batería 5000mAh, tu vendedor adivina."),
            ("🔧", "Soporte sin orden", "Equipos a reparar amontonados, clientes llamando, sin folios ni seguimiento."),
        ],
        "features": [
            ("🔐", "Garantía por serial", "Captura IMEI/serial al vender. Cliente regresa con equipo, escaneas, ves todo: fecha, garantía vigente, condiciones."),
            ("📋", "Specs en búsqueda", "Cliente quiere RAM 8GB+ batería 5000mAh+ pantalla 6.5\". Filtras y aparecen los modelos exactos."),
            ("♻️", "Trade-in inteligente", "Cliente trae equipo viejo, sistema sugiere valor según marca/modelo/condición. Aplica como descuento al nuevo."),
            ("🎫", "Tickets de soporte", "Equipo a reparar entra con folio, fecha estimada, costo, técnico. Cliente recibe WhatsApp con avances."),
            ("📊", "Reportes de reclamos", "Qué modelo se vuelve más en garantía, qué proveedor da más fallas, qué técnico cierra más rápido."),
        ],
        "diff": [
            "Único POS con trade-in nativo y catálogo de valores referenciales.",
            "Tickets de soporte integrados sin software extra.",
            "Funciona offline: red caída no detiene tus ventas ni tu taller.",
            "IA que sugiere accesorios cruzados (vendiste celular = sugiere funda + cargador).",
        ],
        "testimonials": [
            ("Gerardo Méndez", "TecnoMéndez", "Tijuana, MX", "El trade-in fue revolucionario. Antes calculaba precios a ojo, perdía dinero. Ahora con la base referencial gano $400 promedio en cada cambio."),
            ("Lic. Verónica Silva", "Mundo Digital", "CDMX", "Las garantías por serial cortaron las disputas. Cliente quiere garantía, escaneo IMEI, le digo exacto: vencida o vigente. Discusiones cero."),
            ("Andrés Pizarro", "Servicio Técnico A&P", "Querétaro, MX", "Mis tickets de soporte estaban en libreta. Hoy son digitales con fotos del equipo, presupuesto firmado y avances por WhatsApp. Mis ingresos del taller subieron 35%."),
        ],
        "faq": [
            ("¿Captura IMEI con la cámara?", "Sí. Escanea código de barras del IMEI o lo capturas manual. Validado contra base GSMA en plan Pro."),
            ("¿Cómo funciona el trade-in?", "Catálogo referencial con valores por marca/modelo/condición. Editable según tu mercado. Aplica como descuento al producto nuevo."),
            ("¿Imprime garantía con QR?", "Sí. Ticket incluye QR. Cliente escanea desde casa y ve garantía, fecha de compra, condiciones."),
            ("¿Manda actualizaciones de soporte por WhatsApp?", "Sí. Cliente recibe: \"Su equipo entró a diagnóstico\", \"Presupuesto: $X\", \"Listo para entregar\". Automático."),
            ("¿Se conecta con Mercado Libre y Amazon?", "Sí, en plan Pro. Inventario sincronizado, órdenes llegan al panel, etiquetas de envío en 1 click."),
            ("¿Maneja números de parte de proveedores?", "Sí. Cada producto puede tener tu SKU + número de parte fabricante + código de barras. Búsqueda por cualquiera."),
        ],
    },
    {
        "slug": "fitness",
        "name": "Gimnasio y Fitness",
        "name_lower": "gimnasio",
        "vertical_param": "fitness",
        "emoji": "🏋️",
        "accent": "#EA580C",
        "accent_dark": "#C2410C",
        "accent_soft": "#FFF7ED",
        "tagline": "El POS hecho para tu gimnasio",
        "subhead": "Membresías, control de asistencia con QR, clases grupales, pagos recurrentes y retención. Volvix mantiene tu gym lleno y tus socios pagando a tiempo.",
        "title_seo": "POS para Gimnasio y Fitness | Membresías, Asistencia y Clases | Volvix",
        "meta_desc": "Sistema POS para gimnasios y centros fitness con membresías, control de asistencia con QR/huella, clases grupales, pagos recurrentes y reportes de retención.",
        "keywords": "pos gimnasio, sistema gym, software fitness, membresías recurrentes, control asistencia gym",
        "pains": [
            ("💳", "Pagos manuales", "El día 5 persigues a 80 socios para que paguen. Pierdes tiempo y socios."),
            ("🚪", "Asistencia sin control", "Tarjetas que se prestan, socios que se cuelan, no sabes cuántos vienen realmente."),
            ("📉", "Retención baja", "Inscribes 30 socios al mes, se van 25. No ves la sangría hasta que es tarde."),
        ],
        "features": [
            ("💪", "Membresías flexibles", "Mensual, trimestral, anual, congelamiento, día completo, solo cardio. Diseña los planes que tu mercado quiere."),
            ("🔑", "Asistencia con QR/huella", "Socio entra, escanea QR o pone huella. Volvix valida membresía vigente. Si está vencida, lo manda a recepción."),
            ("👯", "Clases grupales", "Yoga, spinning, crossfit con cupo limitado. Socios reservan desde su app, recordatorio 1h antes, lista al instructor."),
            ("💸", "Cobros recurrentes", "Tarjeta del socio se cobra automático cada mes. Si falla, manda WhatsApp. Cobranza 80% más rápida."),
            ("📊", "Retención y churn", "Volvix detecta socios que dejaron de venir 14 días, manda WhatsApp automático con promo de regreso. Salva 30% de bajas."),
        ],
        "diff": [
            "Cobros recurrentes con tarjeta sin pasarela extra.",
            "Asistencia biométrica nativa (huella en lector USB barato).",
            "App del socio incluida en plan Pro: reserva clases, ve historial, paga.",
            "IA que predice quién va a darse de baja y te avisa antes.",
        ],
        "testimonials": [
            ("Coach Rodrigo Aldana", "Iron Box Gym", "CDMX", "Los cobros recurrentes cambiaron mi vida. Antes el día 5 tenía 60% pagado, hoy 92% al día 2. Mi flujo de caja es predecible por primera vez."),
            ("Lic. Camila Reyes", "Wellness Center", "Mérida, MX", "Las alertas de retención salvaron 40 socios el primer trimestre. Volvix detecta que llevan 14 días sin venir, manda WhatsApp con cupo de clase y vuelven."),
            ("Mauricio Salinas", "CrossFit Boulevard", "Monterrey, MX", "El control de cupos en clases acabó las quejas. Antes sobre vendía spinning y se enojaban. Hoy reservan, llegan, entrenan. NPS subió de 6 a 9."),
        ],
        "faq": [
            ("¿Cobra automático con tarjeta?", "Sí. Visa, Mastercard, AMEX. Sin necesidad de pasarela extra. Si falla, reintentos automáticos y notificación."),
            ("¿Maneja congelamiento de membresía?", "Sí. Socio congela hasta 30 días al año (configurable). Sistema reanuda automático. Sin pelea con recepción."),
            ("¿Necesito hardware especial para huella?", "Lector USB de huella ($800 MXN aprox). O usa QR en celular del socio sin hardware extra."),
            ("¿Tiene app para socios?", "Sí, en plan Pro. Socio reserva clases, ve historial de asistencia, paga con tarjeta y consulta su rutina."),
            ("¿Reportes de utilización por hora?", "Sí. Sabes que el lunes 6-8pm es saturado y el martes 10am está vacío. Optimiza staff y promociones."),
            ("¿Maneja entrenadores personales?", "Sí. Cada PT tiene su agenda, comisión por sesión, y los socios reservan con el instructor de su preferencia."),
        ],
    },
]


def render_landing(ind):
    slug = ind["slug"]
    name = ind["name"]
    name_lower = ind["name_lower"]
    vp = ind["vertical_param"]
    emoji = ind["emoji"]
    accent = ind["accent"]
    accent_dark = ind["accent_dark"]
    accent_soft = ind["accent_soft"]

    pains_html = "\n".join(
        f'''      <article class="pain-card" data-aos="fade-up">
        <div class="pain-icon">{icon}</div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </article>'''
        for icon, title, desc in ind["pains"]
    )

    features_html = "\n".join(
        f'''      <article class="feat-card" data-aos="fade-up">
        <div class="feat-icon">{icon}</div>
        <div class="feat-body">
          <h3>{title}</h3>
          <p>{desc}</p>
          <div class="feat-mockup" aria-hidden="true">
            <div class="mockup-bar"></div>
            <div class="mockup-line w70"></div>
            <div class="mockup-line w50"></div>
            <div class="mockup-line w85"></div>
          </div>
        </div>
      </article>'''
        for icon, title, desc in ind["features"]
    )

    diff_html = "\n".join(
        f'<li><span class="check">✓</span> {item}</li>'
        for item in ind["diff"]
    )

    testimonials_html = "\n".join(
        f'''      <article class="testi-card" data-aos="fade-up">
        <div class="testi-stars">★★★★★</div>
        <blockquote>"{quote}"</blockquote>
        <div class="testi-author">
          <div class="testi-avatar">{author.split()[0][0]}{author.split()[-1][0] if len(author.split())>1 else ""}</div>
          <div>
            <strong>{author}</strong>
            <span>{business} · {location}</span>
          </div>
        </div>
      </article>'''
        for author, business, location, quote in ind["testimonials"]
    )

    faq_html = "\n".join(
        f'''      <details class="faq-item">
        <summary>{q}</summary>
        <p>{a}</p>
      </details>'''
        for q, a in ind["faq"]
    )

    schema_json = json.dumps({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": f"Volvix POS para {name}",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web, iOS, Android, Windows",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "MXN",
            "description": "Prueba 14 días gratis sin tarjeta de crédito"
        },
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "reviewCount": "847"
        },
        "description": ind["meta_desc"]
    }, ensure_ascii=False)

    canonical = f"https://salvadorexoficial.com/landing-{slug}.html"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{ind["title_seo"]}</title>
<meta name="description" content="{ind["meta_desc"]}">
<meta name="keywords" content="{ind["keywords"]}">
<meta name="theme-color" content="{accent}">
<link rel="canonical" href="{canonical}">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="{canonical}">
<meta property="og:title" content="{ind["title_seo"]}">
<meta property="og:description" content="{ind["meta_desc"]}">
<meta property="og:locale" content="es_MX">
<meta property="og:site_name" content="Volvix POS">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{ind["title_seo"]}">
<meta name="twitter:description" content="{ind["meta_desc"]}">

<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='{accent.replace("#","%23")}'/%3E%3Ctext x='50%25' y='52%25' font-size='38' text-anchor='middle' dominant-baseline='middle' fill='white'%3E{emoji}%3C/text%3E%3C/svg%3E">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

<script type="application/ld+json">
{schema_json}
</script>

<style>
  * {{ margin:0; padding:0; box-sizing:border-box; font-family:'Inter', system-ui, sans-serif; -webkit-font-smoothing:antialiased; }}
  :root {{
    --vlx-primary: {accent};
    --vlx-primary-dark: {accent_dark};
    --vlx-primary-soft: {accent_soft};
    --vlx-brand: #2D5F8F;
    --vlx-text: #1C1917;
    --vlx-text-2: #44403C;
    --vlx-text-3: #78716C;
    --vlx-bg: #FFFFFF;
    --vlx-bg-2: #FAFAF9;
    --vlx-bg-3: #F5F5F4;
    --vlx-border: #E7E5E4;
    --vlx-success: #16A34A;
    --vlx-radius: 12px;
    --vlx-shadow-sm: 0 1px 3px rgba(0,0,0,.06);
    --vlx-shadow: 0 8px 24px rgba(0,0,0,.08);
    --vlx-shadow-lg: 0 20px 50px rgba(0,0,0,.12);
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --vlx-text: #e2e8f0;
      --vlx-text-2: #cbd5e1;
      --vlx-text-3: #94a3b8;
      --vlx-bg: #0b1220;
      --vlx-bg-2: #0f172a;
      --vlx-bg-3: #1e293b;
      --vlx-border: #334155;
    }}
  }}
  html {{ scroll-behavior: smooth; }}
  body {{ background: var(--vlx-bg); color: var(--vlx-text); line-height: 1.6; overflow-x: hidden; }}
  a {{ color: inherit; text-decoration: none; }}

  /* NAV */
  nav.top {{
    position: sticky; top: 0; z-index: 50;
    background: color-mix(in srgb, var(--vlx-bg) 92%, transparent);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--vlx-border);
    padding: 14px 6%;
    display: flex; align-items: center; justify-content: space-between;
  }}
  .brand {{ display:flex; align-items:center; gap:10px; font-weight:800; font-size:17px; letter-spacing:-.3px; }}
  .brand-logo {{
    width:38px; height:38px; border-radius:10px;
    background: linear-gradient(135deg, var(--vlx-primary), var(--vlx-primary-dark));
    color:white; display:flex; align-items:center; justify-content:center;
    font-size:20px; box-shadow:0 4px 14px rgba(0,0,0,.15);
  }}
  .nav-links {{ display:flex; gap:22px; align-items:center; }}
  .nav-links a {{ font-size:14px; font-weight:500; color: var(--vlx-text-2); }}
  .nav-links a:hover {{ color: var(--vlx-primary); }}
  .nav-cta {{
    padding: 9px 18px; background: var(--vlx-text); color: var(--vlx-bg) !important;
    border-radius: 8px; font-size: 13.5px; font-weight: 600;
  }}
  @media (max-width: 720px) {{
    .nav-links a:not(.nav-cta) {{ display: none; }}
  }}

  /* HERO */
  .hero {{
    padding: 80px 6% 70px;
    position: relative;
    overflow: hidden;
    background: radial-gradient(ellipse at top right, var(--vlx-primary-soft), transparent 60%);
  }}
  .hero-inner {{
    max-width: 1200px; margin: 0 auto;
    display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 60px; align-items: center;
  }}
  .hero-badge {{
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; background: var(--vlx-bg);
    border: 1px solid var(--vlx-border); border-radius: 100px;
    font-size: 12.5px; font-weight: 600; color: var(--vlx-primary);
    margin-bottom: 22px; box-shadow: var(--vlx-shadow-sm);
  }}
  .hero h1 {{
    font-size: clamp(36px, 5vw, 60px); font-weight: 900;
    letter-spacing: -2px; line-height: 1.05; margin-bottom: 22px;
  }}
  .hero h1 .accent {{
    background: linear-gradient(120deg, var(--vlx-primary), var(--vlx-primary-dark));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }}
  .hero p.sub {{ font-size: clamp(16px, 2vw, 19px); color: var(--vlx-text-2); margin-bottom: 32px; }}
  .hero-cta-row {{ display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }}
  .btn-primary {{
    padding: 15px 28px; background: var(--vlx-primary); color: white;
    border-radius: 10px; font-size: 15px; font-weight: 600; border: none;
    cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--vlx-primary) 35%, transparent);
    transition: all .15s;
  }}
  .btn-primary:hover {{ background: var(--vlx-primary-dark); transform: translateY(-2px); }}
  .btn-secondary {{
    padding: 15px 24px; background: var(--vlx-bg); color: var(--vlx-text);
    border: 1px solid var(--vlx-border); border-radius: 10px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
  }}
  .btn-secondary:hover {{ border-color: var(--vlx-text); }}
  .hero-trust {{ font-size: 13px; color: var(--vlx-text-3); display: flex; gap: 16px; flex-wrap: wrap; }}
  .hero-trust span::before {{ content: '✓ '; color: var(--vlx-success); font-weight: 700; }}

  .hero-visual {{
    position: relative; aspect-ratio: 1; max-width: 460px; margin-left: auto;
    background: linear-gradient(135deg, var(--vlx-primary-soft), color-mix(in srgb, var(--vlx-primary) 12%, white));
    border-radius: 32px; display: flex; align-items: center; justify-content: center;
    box-shadow: var(--vlx-shadow-lg);
  }}
  .hero-emoji {{ font-size: 200px; animation: float 4s ease-in-out infinite; filter: drop-shadow(0 12px 24px rgba(0,0,0,.18)); }}
  @keyframes float {{ 0%,100%{{transform:translateY(0)}} 50%{{transform:translateY(-14px)}} }}
  .hero-floaty {{
    position: absolute; padding: 12px 16px;
    background: var(--vlx-bg); border: 1px solid var(--vlx-border);
    border-radius: 14px; font-size: 13px; font-weight: 600;
    box-shadow: var(--vlx-shadow); display: flex; align-items: center; gap: 8px;
  }}
  .hero-floaty.b1 {{ top: 12%; left: -8%; animation: float 3.5s ease-in-out infinite; }}
  .hero-floaty.b2 {{ bottom: 18%; right: -8%; animation: float 3.5s .8s ease-in-out infinite; }}
  .hero-floaty.b3 {{ top: 50%; right: -6%; animation: float 4s .4s ease-in-out infinite; }}
  .floaty-dot {{ width:8px; height:8px; border-radius:50%; background: var(--vlx-success); box-shadow:0 0 0 4px color-mix(in srgb, var(--vlx-success) 25%, transparent); }}

  @media (max-width: 1024px) {{
    .hero-inner {{ grid-template-columns: 1fr; gap: 50px; }}
    .hero-visual {{ max-width: 380px; margin: 0 auto; }}
  }}

  /* SECTIONS COMMON */
  section {{ padding: 90px 6%; }}
  .section-inner {{ max-width: 1200px; margin: 0 auto; }}
  .section-head {{ text-align: center; margin-bottom: 56px; }}
  .section-head .eyebrow {{
    display: inline-block; padding: 5px 12px; background: var(--vlx-primary-soft);
    color: var(--vlx-primary); border-radius: 100px;
    font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    margin-bottom: 14px;
  }}
  .section-head h2 {{
    font-size: clamp(28px, 4vw, 44px); font-weight: 800;
    letter-spacing: -1.2px; line-height: 1.1; margin-bottom: 14px;
  }}
  .section-head p {{ font-size: 17px; color: var(--vlx-text-2); max-width: 640px; margin: 0 auto; }}

  /* PAINS */
  .pain-section {{ background: var(--vlx-bg-2); }}
  .pain-grid {{
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px;
  }}
  .pain-card {{
    padding: 32px 28px; background: var(--vlx-bg);
    border: 1px solid var(--vlx-border); border-radius: var(--vlx-radius);
    transition: transform .2s, box-shadow .2s;
  }}
  .pain-card:hover {{ transform: translateY(-4px); box-shadow: var(--vlx-shadow); }}
  .pain-icon {{
    width: 56px; height: 56px; border-radius: 14px;
    background: var(--vlx-primary-soft); display: flex;
    align-items: center; justify-content: center;
    font-size: 28px; margin-bottom: 18px;
  }}
  .pain-card h3 {{ font-size: 19px; font-weight: 700; margin-bottom: 8px; }}
  .pain-card p {{ font-size: 15px; color: var(--vlx-text-2); }}
  @media (max-width: 900px) {{ .pain-grid {{ grid-template-columns: 1fr; }} }}

  /* FEATURES */
  .feat-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }}
  .feat-card {{
    padding: 28px; background: var(--vlx-bg);
    border: 1px solid var(--vlx-border); border-radius: 16px;
    transition: transform .2s, box-shadow .2s, border-color .2s;
    position: relative; overflow: hidden;
  }}
  .feat-card::before {{
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--vlx-primary), var(--vlx-primary-dark));
    transform: scaleX(0); transform-origin: left; transition: transform .3s;
  }}
  .feat-card:hover {{ transform: translateY(-6px); box-shadow: var(--vlx-shadow-lg); border-color: var(--vlx-primary); }}
  .feat-card:hover::before {{ transform: scaleX(1); }}
  .feat-icon {{
    width: 56px; height: 56px; border-radius: 14px;
    background: linear-gradient(135deg, var(--vlx-primary), var(--vlx-primary-dark));
    color: white; display: flex; align-items: center; justify-content: center;
    font-size: 26px; margin-bottom: 18px;
    box-shadow: 0 8px 18px color-mix(in srgb, var(--vlx-primary) 35%, transparent);
  }}
  .feat-body h3 {{ font-size: 19px; font-weight: 700; margin-bottom: 8px; }}
  .feat-body p {{ font-size: 14.5px; color: var(--vlx-text-2); margin-bottom: 18px; }}
  .feat-mockup {{
    background: var(--vlx-bg-3); border-radius: 8px; padding: 14px;
    display: flex; flex-direction: column; gap: 8px;
  }}
  .mockup-bar {{ height: 8px; background: var(--vlx-primary); border-radius: 4px; width: 30%; }}
  .mockup-line {{ height: 6px; background: var(--vlx-border); border-radius: 3px; }}
  .mockup-line.w70 {{ width: 70%; }}
  .mockup-line.w50 {{ width: 50%; }}
  .mockup-line.w85 {{ width: 85%; }}

  /* DIFF */
  .diff-section {{ background: var(--vlx-bg-2); }}
  .diff-wrap {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center;
  }}
  .diff-list {{ list-style: none; padding: 0; margin: 0; }}
  .diff-list li {{
    padding: 16px 0; border-bottom: 1px solid var(--vlx-border);
    display: flex; gap: 14px; font-size: 16px; color: var(--vlx-text);
    line-height: 1.5;
  }}
  .diff-list li:last-child {{ border-bottom: none; }}
  .check {{
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--vlx-success); color: white;
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 13px; flex-shrink: 0;
  }}
  .diff-visual {{
    aspect-ratio: 1; max-width: 420px; margin: 0 auto;
    background: linear-gradient(135deg, var(--vlx-primary), var(--vlx-primary-dark));
    border-radius: 28px; display: flex; align-items: center; justify-content: center;
    color: white; font-size: 130px; box-shadow: var(--vlx-shadow-lg);
  }}
  @media (max-width: 900px) {{ .diff-wrap {{ grid-template-columns: 1fr; }} }}

  /* TESTIMONIALS */
  .testi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }}
  .testi-card {{
    padding: 30px 28px; background: var(--vlx-bg);
    border: 1px solid var(--vlx-border); border-radius: 16px;
    box-shadow: var(--vlx-shadow-sm); transition: transform .2s;
  }}
  .testi-card:hover {{ transform: translateY(-4px); box-shadow: var(--vlx-shadow); }}
  .testi-stars {{ color: #FBBF24; font-size: 16px; letter-spacing: 2px; margin-bottom: 14px; }}
  .testi-card blockquote {{
    font-size: 15.5px; line-height: 1.6; color: var(--vlx-text);
    margin-bottom: 22px; font-style: italic;
  }}
  .testi-author {{ display: flex; align-items: center; gap: 12px; }}
  .testi-avatar {{
    width: 46px; height: 46px; border-radius: 50%;
    background: linear-gradient(135deg, var(--vlx-primary), var(--vlx-primary-dark));
    color: white; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px;
  }}
  .testi-author strong {{ display: block; font-size: 14.5px; }}
  .testi-author span {{ font-size: 13px; color: var(--vlx-text-3); }}

  /* PRICING */
  .pricing-section {{ background: var(--vlx-bg-2); }}
  .pricing-grid {{
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1100px; margin: 0 auto;
  }}
  .price-card {{
    padding: 36px 30px; background: var(--vlx-bg);
    border: 1px solid var(--vlx-border); border-radius: 18px;
    position: relative;
  }}
  .price-card.featured {{
    border: 2px solid var(--vlx-primary);
    transform: scale(1.04); box-shadow: var(--vlx-shadow-lg);
  }}
  .price-card.featured::before {{
    content: 'RECOMENDADO'; position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
    background: var(--vlx-primary); color: white;
    padding: 6px 16px; border-radius: 100px;
    font-size: 11px; font-weight: 700; letter-spacing: 1.2px;
  }}
  .price-card h3 {{ font-size: 18px; font-weight: 700; margin-bottom: 8px; }}
  .price-card .tagline {{ font-size: 14px; color: var(--vlx-text-3); margin-bottom: 22px; min-height: 42px; }}
  .price-num {{ font-size: 44px; font-weight: 900; letter-spacing: -1.5px; line-height: 1; }}
  .price-num small {{ font-size: 16px; font-weight: 600; color: var(--vlx-text-3); }}
  .price-period {{ font-size: 13px; color: var(--vlx-text-3); margin-bottom: 26px; }}
  .price-features {{ list-style: none; padding: 0; margin: 0 0 28px; }}
  .price-features li {{
    padding: 9px 0; font-size: 14.5px; color: var(--vlx-text-2);
    display: flex; gap: 10px; align-items: flex-start;
  }}
  .price-features li::before {{ content: '✓'; color: var(--vlx-success); font-weight: 700; flex-shrink: 0; }}
  .price-cta {{
    width: 100%; padding: 13px; border-radius: 10px;
    font-size: 14.5px; font-weight: 600; cursor: pointer;
    border: 1px solid var(--vlx-border); background: var(--vlx-bg); color: var(--vlx-text);
    transition: all .15s;
  }}
  .price-cta:hover {{ background: var(--vlx-bg-2); border-color: var(--vlx-text); }}
  .price-card.featured .price-cta {{
    background: var(--vlx-primary); color: white; border: none;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--vlx-primary) 35%, transparent);
  }}
  .price-card.featured .price-cta:hover {{ background: var(--vlx-primary-dark); }}
  @media (max-width: 900px) {{
    .pricing-grid {{ grid-template-columns: 1fr; }}
    .price-card.featured {{ transform: none; }}
  }}

  /* FAQ */
  .faq-list {{ max-width: 800px; margin: 0 auto; }}
  .faq-item {{
    border-bottom: 1px solid var(--vlx-border);
    padding: 22px 0;
  }}
  .faq-item summary {{
    cursor: pointer; font-size: 17px; font-weight: 600;
    list-style: none; display: flex; justify-content: space-between; align-items: center;
  }}
  .faq-item summary::after {{
    content: '+'; font-size: 28px; font-weight: 300;
    color: var(--vlx-primary); transition: transform .2s;
  }}
  .faq-item[open] summary::after {{ transform: rotate(45deg); }}
  .faq-item p {{
    margin-top: 14px; font-size: 15.5px; color: var(--vlx-text-2);
    line-height: 1.65;
  }}

  /* CTA FINAL */
  .cta-final {{
    background: linear-gradient(135deg, var(--vlx-primary), var(--vlx-primary-dark));
    color: white; text-align: center;
  }}
  .cta-final h2 {{ color: white; font-size: clamp(28px, 4vw, 42px); font-weight: 800; letter-spacing: -1.2px; margin-bottom: 18px; }}
  .cta-final p {{ font-size: 18px; opacity: .92; margin-bottom: 32px; max-width: 640px; margin-left: auto; margin-right: auto; }}
  .cta-final .btn-primary {{
    background: white; color: var(--vlx-primary);
    box-shadow: 0 12px 36px rgba(0,0,0,.25);
  }}
  .cta-final .btn-primary:hover {{ background: var(--vlx-bg-2); }}
  .cta-final .btn-secondary {{
    background: transparent; color: white; border: 1px solid rgba(255,255,255,.4);
  }}
  .cta-final .btn-secondary:hover {{ border-color: white; background: rgba(255,255,255,.1); }}

  /* FOOTER */
  footer.site {{
    background: #0A0A0A; color: #94A3B8;
    padding: 60px 6% 30px;
  }}
  .footer-inner {{ max-width: 1200px; margin: 0 auto; }}
  .footer-grid {{
    display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 40px;
    margin-bottom: 40px;
  }}
  .footer-brand p {{ font-size: 14px; margin-top: 14px; max-width: 320px; }}
  .footer-col h4 {{ color: white; font-size: 14px; font-weight: 700; margin-bottom: 16px; }}
  .footer-col ul {{ list-style: none; padding: 0; }}
  .footer-col ul li {{ margin-bottom: 10px; }}
  .footer-col ul li a {{ font-size: 14px; color: #94A3B8; transition: color .15s; }}
  .footer-col ul li a:hover {{ color: white; }}
  .footer-bottom {{
    border-top: 1px solid #1F2937; padding-top: 24px;
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;
    font-size: 13px;
  }}
  .footer-social {{ display: flex; gap: 12px; }}
  .footer-social a {{
    width: 36px; height: 36px; border-radius: 8px;
    background: #1F2937; display: inline-flex; align-items: center; justify-content: center;
    font-size: 16px; transition: background .15s;
  }}
  .footer-social a:hover {{ background: var(--vlx-primary); }}
  @media (max-width: 900px) {{ .footer-grid {{ grid-template-columns: 1fr 1fr; }} }}
  @media (max-width: 540px) {{ .footer-grid {{ grid-template-columns: 1fr; }} }}

  /* AOS-lite */
  [data-aos] {{ opacity: 0; transform: translateY(20px); transition: opacity .6s ease, transform .6s ease; }}
  [data-aos].is-in {{ opacity: 1; transform: translateY(0); }}
  @media (prefers-reduced-motion: reduce) {{
    [data-aos] {{ opacity: 1; transform: none; transition: none; }}
    .hero-emoji, .hero-floaty {{ animation: none; }}
  }}
</style>
</head>
<body>

<nav class="top">
  <a href="/" class="brand">
    <span class="brand-logo">{emoji}</span>
    <span>Volvix POS</span>
  </a>
  <div class="nav-links">
    <a href="#features">Funciones</a>
    <a href="#pricing">Precios</a>
    <a href="#faq">FAQ</a>
    <a href="/login.html" class="nav-cta">Entrar</a>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <div class="hero-badge">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--vlx-success);display:inline-block"></span>
        Para {name_lower} en LATAM
      </div>
      <h1>{ind["tagline"].replace(name_lower, f'<span class="accent">{name_lower}</span>')}</h1>
      <p class="sub">{ind["subhead"]}</p>
      <div class="hero-cta-row">
        <a href="/volvix-onboarding-wizard.html?vertical={vp}" class="btn-primary cta-track" data-cta="hero-primary">
          Empezar gratis 14 días →
        </a>
        <a href="/volvix-grand-tour.html" class="btn-secondary cta-track" data-cta="hero-secondary">
          ▶ Ver demo en vivo
        </a>
      </div>
      <div class="hero-trust">
        <span>Sin tarjeta</span>
        <span>Cancela cuando quieras</span>
        <span>Soporte en español</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="hero-emoji">{emoji}</div>
      <div class="hero-floaty b1">
        <span class="floaty-dot"></span>
        Cobro en 6 segundos
      </div>
      <div class="hero-floaty b2">
        ⭐ 4.9/5 · 847 reseñas
      </div>
      <div class="hero-floaty b3">
        🚀 +30% ventas
      </div>
    </div>
  </div>
</section>

<!-- PAIN POINTS -->
<section class="pain-section" id="pains">
  <div class="section-inner">
    <div class="section-head">
      <span class="eyebrow">Problemas reales</span>
      <h2>3 dolores que vivimos contigo</h2>
      <p>No te vendemos software, te resolvemos lo que te quita el sueño.</p>
    </div>
    <div class="pain-grid">
{pains_html}
    </div>
  </div>
</section>

<!-- FEATURES -->
<section id="features">
  <div class="section-inner">
    <div class="section-head">
      <span class="eyebrow">Funciones top 5</span>
      <h2>Lo que tu {name_lower} necesita, listo desde el día 1</h2>
      <p>Sin configuraciones eternas. Sin módulos extra que cobran aparte.</p>
    </div>
    <div class="feat-grid">
{features_html}
    </div>
  </div>
</section>

<!-- DIFFERENTIATION -->
<section class="diff-section">
  <div class="section-inner">
    <div class="diff-wrap">
      <div>
        <span class="eyebrow" style="display:inline-block;padding:5px 12px;background:var(--vlx-primary-soft);color:var(--vlx-primary);border-radius:100px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">Por qué Volvix</span>
        <h2 style="font-size:clamp(26px,3.5vw,40px);font-weight:800;letter-spacing:-1.2px;line-height:1.15;margin-bottom:18px">Volvix vs cualquier otro POS</h2>
        <p style="font-size:16.5px;color:var(--vlx-text-2);margin-bottom:24px">Construido en LATAM, para LATAM. Por gente que entiende el mostrador, no solo el código.</p>
        <ul class="diff-list">
{diff_html}
        </ul>
      </div>
      <div class="diff-visual">{emoji}</div>
    </div>
  </div>
</section>

<!-- TESTIMONIALS -->
<section id="testimonials">
  <div class="section-inner">
    <div class="section-head">
      <span class="eyebrow">Casos reales</span>
      <h2>Negocios como el tuyo, ya creciendo con Volvix</h2>
      <p>Más de 4,000 {name_lower}s en México, Colombia, Perú y Argentina.</p>
    </div>
    <div class="testi-grid">
{testimonials_html}
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="pricing-section" id="pricing">
  <div class="section-inner">
    <div class="section-head">
      <span class="eyebrow">Precios</span>
      <h2>Empieza gratis. Crece sin sorpresas.</h2>
      <p>Sin contratos forzados. Sin costos ocultos. Cancela en cualquier momento.</p>
    </div>
    <div class="pricing-grid">
      <article class="price-card">
        <h3>Básico</h3>
        <p class="tagline">Para arrancar tu {name_lower} sin riesgo.</p>
        <div class="price-num">$0<small> /mes</small></div>
        <p class="price-period">14 días gratis · luego $299/mes</p>
        <ul class="price-features">
          <li>1 caja / 1 sucursal</li>
          <li>Productos ilimitados</li>
          <li>Inventario básico</li>
          <li>Tickets electrónicos</li>
          <li>Soporte por chat</li>
        </ul>
        <a href="/volvix-onboarding-wizard.html?vertical={vp}&plan=basico" class="price-cta cta-track" data-cta="price-basic" style="display:block;text-align:center">Empezar gratis</a>
      </article>
      <article class="price-card featured">
        <h3>Pro</h3>
        <p class="tagline">Para {name_lower}s que quieren crecer en serio.</p>
        <div class="price-num">$599<small> /mes</small></div>
        <p class="price-period">Por sucursal · facturación anual disponible</p>
        <ul class="price-features">
          <li>Hasta 5 cajas por sucursal</li>
          <li>Multi-sucursal con reportes consolidados</li>
          <li>Todas las funciones específicas para {name_lower}</li>
          <li>IA para predicciones y recomendaciones</li>
          <li>CFDI 4.0 ilimitados</li>
          <li>Soporte prioritario WhatsApp 24/7</li>
        </ul>
        <a href="/volvix-onboarding-wizard.html?vertical={vp}&plan=pro" class="price-cta cta-track" data-cta="price-pro" style="display:block;text-align:center">Empezar 14 días gratis</a>
      </article>
      <article class="price-card">
        <h3>Enterprise</h3>
        <p class="tagline">Cadenas, franquicias y operaciones grandes.</p>
        <div class="price-num">A medida</div>
        <p class="price-period">Contacta para cotización</p>
        <ul class="price-features">
          <li>Cajas y sucursales ilimitadas</li>
          <li>SLA dedicado · Account Manager</li>
          <li>Integraciones a medida (ERP, CRM, BI)</li>
          <li>Onboarding y capacitación on-site</li>
          <li>Customizaciones de software</li>
          <li>Soporte 24/7 con tiempos garantizados</li>
        </ul>
        <a href="mailto:enterprise@volvix.com" class="price-cta cta-track" data-cta="price-enterprise" style="display:block;text-align:center">Hablar con ventas</a>
      </article>
    </div>
  </div>
</section>

<!-- FAQ -->
<section id="faq">
  <div class="section-inner">
    <div class="section-head">
      <span class="eyebrow">Dudas frecuentes</span>
      <h2>Preguntas de {name_lower}s como tú</h2>
      <p>¿No encuentras tu duda? Escríbenos a <a href="mailto:hola@volvix.com" style="color:var(--vlx-primary);font-weight:600">hola@volvix.com</a></p>
    </div>
    <div class="faq-list">
{faq_html}
    </div>
  </div>
</section>

<!-- CTA FINAL -->
<section class="cta-final">
  <div class="section-inner">
    <h2>Tu {name_lower} merece un POS a la altura</h2>
    <p>Empieza hoy gratis. En 5 minutos estás cobrando. Sin tarjeta, sin contratos, sin pretextos.</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
      <a href="/volvix-onboarding-wizard.html?vertical={vp}" class="btn-primary cta-track" data-cta="final-primary">
        Empezar gratis 14 días →
      </a>
      <a href="/volvix-grand-tour.html" class="btn-secondary cta-track" data-cta="final-secondary">
        ▶ Ver demo en vivo
      </a>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer class="site">
  <div class="footer-inner">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="brand" style="color:white">
          <span class="brand-logo">{emoji}</span>
          <span>Volvix POS</span>
        </div>
        <p>El sistema POS multi-tenant para {name_lower}s y todo tipo de negocios. Hecho en LATAM.</p>
      </div>
      <div class="footer-col">
        <h4>Producto</h4>
        <ul>
          <li><a href="/">Inicio</a></li>
          <li><a href="#features">Funciones</a></li>
          <li><a href="#pricing">Precios</a></li>
          <li><a href="/volvix-grand-tour.html">Demo</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Industrias</h4>
        <ul>
          <li><a href="/landing-abarrotes.html">Abarrotes</a></li>
          <li><a href="/landing-restaurant.html">Restaurantes</a></li>
          <li><a href="/landing-farmacia.html">Farmacias</a></li>
          <li><a href="/landing-cafe.html">Cafeterías</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Soporte</h4>
        <ul>
          <li><a href="mailto:hola@volvix.com">Contacto</a></li>
          <li><a href="/login.html">Iniciar sesión</a></li>
          <li><a href="#faq">Preguntas</a></li>
          <li><a href="mailto:enterprise@volvix.com">Enterprise</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 Volvix POS · Todos los derechos reservados</span>
      <div class="footer-social">
        <a href="#" aria-label="Facebook">f</a>
        <a href="#" aria-label="Instagram">📷</a>
        <a href="#" aria-label="X">𝕏</a>
        <a href="#" aria-label="YouTube">▶</a>
      </div>
    </div>
  </div>
</footer>

<script src="/auth-gate.js"></script>
<script src="/volvix-uplift-wiring.js" defer></script>
<script>
  // ===== CONVERSION TRACKING =====
  (function() {{
    var pageStart = Date.now();
    var industry = '{vp}';

    function track(eventName, payload) {{
      try {{
        var data = Object.assign({{}}, payload || {{}}, {{
          event: eventName,
          industry: industry,
          page: location.pathname,
          referrer: document.referrer,
          ts: new Date().toISOString()
        }});
        // Try /api/log/client (server-side log endpoint), fall back to console
        if (window.fetch) {{
          fetch('/api/log/client', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json' }},
            body: JSON.stringify(data),
            keepalive: true
          }}).catch(function() {{ console.log('[track]', data); }});
        }} else {{
          console.log('[track]', data);
        }}
      }} catch (e) {{ /* silent */ }}
    }}

    // CTA click tracking
    document.querySelectorAll('.cta-track').forEach(function(el) {{
      el.addEventListener('click', function() {{
        track('cta_click', {{ cta: el.dataset.cta, label: el.textContent.trim() }});
      }});
    }});

    // Page view
    track('page_view', {{ title: document.title }});

    // Time on page (when leaving)
    window.addEventListener('beforeunload', function() {{
      track('page_leave', {{ duration_ms: Date.now() - pageStart }});
    }});

    // Scroll depth
    var maxScroll = 0;
    window.addEventListener('scroll', function() {{
      var pct = Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100);
      if (pct > maxScroll && pct % 25 === 0) {{
        maxScroll = pct;
        track('scroll_depth', {{ percent: pct }});
      }}
    }}, {{ passive: true }});
  }})();

  // ===== AUTH-AWARE CTAs =====
  (function() {{
    // If auth-gate.js sets window.VLX_USER, redirect logged-in users to dashboard
    function rewireCtaIfLoggedIn() {{
      var user = (window.VLX_USER || window.__VLX_USER__ || null);
      if (!user) return;
      document.querySelectorAll('a[href*="/volvix-onboarding-wizard.html"]').forEach(function(a) {{
        a.setAttribute('href', '/volvix-owner-panel.html');
        a.textContent = 'Ir a mi panel →';
      }});
    }}
    if (document.readyState === 'complete') rewireCtaIfLoggedIn();
    else window.addEventListener('load', rewireCtaIfLoggedIn);
  }})();

  // ===== AOS-LITE: scroll animations =====
  (function() {{
    if (!('IntersectionObserver' in window)) {{
      document.querySelectorAll('[data-aos]').forEach(function(el) {{ el.classList.add('is-in'); }});
      return;
    }}
    var io = new IntersectionObserver(function(entries) {{
      entries.forEach(function(entry) {{
        if (entry.isIntersecting) {{
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }}
      }});
    }}, {{ threshold: 0.12 }});
    document.querySelectorAll('[data-aos]').forEach(function(el) {{ io.observe(el); }});
  }})();
</script>
</body>
</html>
"""
    return html


def main():
    for ind in INDUSTRIES:
        path = os.path.join(BASE_DIR, f"landing-{ind['slug']}.html")
        html = render_landing(ind)
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        lines = html.count("\n") + 1
        print(f"WROTE {path}  ({lines} lines)")
    print("DONE")


if __name__ == "__main__":
    main()
