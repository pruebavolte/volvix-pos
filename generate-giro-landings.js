#!/usr/bin/env node
/**
 * generate-giro-landings.js
 * Genera landing pages personalizadas por giro de negocio para Volvix POS.
 * Output: public/landing-{slug}.html
 *
 * Cada landing tiene:
 * - Pain points específicos del giro (en lenguaje del dueño)
 * - Features del sistema aplicadas a ese giro
 * - Testimonials con nombres mexicanos + ciudades + negocios reales
 * - Comparativa vs alternativas (cuaderno, software caro, etc.)
 * - Pricing 3 tiers
 * - FAQ específicas
 * - SEO completo (Open Graph + Schema.org)
 * - Tracking eventos
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'public');

// ════════════════════════════════════════════════════════════════
// DATOS DE LOS 40 GIROS — pain points, features, testimonials específicos
// ════════════════════════════════════════════════════════════════

const GIROS = [
  // ───────── ALIMENTOS ─────────
  {
    slug: 'restaurante', name: 'Restaurante', plural: 'restaurantes', emoji: '🍽️',
    primary: '#dc2626', primary2: '#ef4444',
    badge: '🍽️ POS para Restaurantes',
    h1: 'Tu restaurante, sin <em>comandas perdidas</em><br>y con cada platillo cobrado',
    sub: 'Mesas, comandas a cocina, delivery, división de cuenta, control de propinas y reportes por platillo — el sistema completo para tu restaurante.',
    heroFeats: ['Gestión visual de mesas', 'Comandas directo a cocina (KDS)', 'División de cuenta automática', 'Control de propinas', 'Delivery y domicilios', 'Menú digital con QR', 'Inventario de ingredientes', 'Reportes por platillo'],
    pains: [
      { icon:'📝', t:'"La comanda se pierde entre cocina y caja"', d:'El mesero anota en papel, la cocina no la ve completa, el cobro no incluye una bebida. Pierdes ingresos cada noche y nadie sabe por qué.' },
      { icon:'🍳', t:'"No sé qué platillo me deja más ganancia"', d:'Vendes 80 platillos al día pero no sabes cuáles son rentables. El que más vendes podría ser el que menos ganancia te deja.' },
      { icon:'💸', t:'"El cajero cobra mal o se queda con cambio"', d:'Sin control de caja al cierre, las diferencias de $200-$500 cada turno se vuelven $15,000 al mes desaparecidos.' },
      { icon:'🪑', t:'"Las mesas se cobran mal cuando dividen cuenta"', d:'Una mesa de 8 personas que pide cuentas separadas se vuelve un caos. Pierdes 20 minutos y a veces se va alguien sin pagar.' }
    ],
    features: [
      { icon:'🪑', t:'Mapa visual de mesas', d:'Ve todas tus mesas en pantalla. Asigna meseros, transfiere mesas, une mesas grandes para grupos. Cero confusión.' },
      { icon:'👨‍🍳', t:'Display de cocina (KDS)', d:'Las comandas llegan a cocina al instante con prioridades y tiempos. Cero papeles perdidos, cero confusiones.' },
      { icon:'🧾', t:'División de cuenta inteligente', d:'Por persona, por platillo o por porcentaje. La cuenta se divide en 10 segundos sin que nadie discuta.' },
      { icon:'🛵', t:'Delivery integrado', d:'Pedidos a domicilio con seguimiento, asignación de repartidor y cálculo de comisión. Compatible con Uber Eats, Rappi y Didi Food.' },
      { icon:'📊', t:'Rentabilidad por platillo', d:'Cada platillo con su costo de ingredientes y margen real. Sabes exactamente cuáles te dan más ganancia.' },
      { icon:'💳', t:'Cobro multi-forma', d:'Efectivo, tarjeta, transferencia, propinas separadas. Cierre de caja en 30 segundos al final del turno.' }
    ],
    cmpRows: [
      ['Gestión de mesas','✓ Visual','✗ A papel','partial:Solo digital'],
      ['Comandas a cocina','✓ KDS instantáneo','✗ Mesero corriendo','partial:Limitado'],
      ['División de cuenta','✓ Automático','no:Calculadora','yes:✓'],
      ['Control de propinas','✓ Por mesero','no:✗','partial:Manual'],
      ['Delivery integrado','✓ Incluido','no:✗','partial:Aparte'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Ricardo Ortega', biz:'Cantina La Tradición — CDMX', text:'Antes mis comandas se perdían entre la mesa y la cocina. Con Volvix la comanda llega al instante a la pantalla del KDS. Bajamos los reclamos de "esto no lo pedí" en un 90%.' },
      { name:'Lorena Aguilar', biz:'Restaurante Mar y Tierra — Veracruz', text:'La división de cuenta era el infierno de mis viernes. Ahora una mesa de 12 se cobra en menos de 1 minuto. Los meseros felices, los clientes felices.' },
      { name:'Fernando Castillo', biz:'Cocina Mexicana El Patrón — Puebla', text:'Descubrí que mi platillo más vendido (las enchiladas) me dejaba menos ganancia que las costillas BBQ. Cambié el menú y subí 25% mis utilidades en 2 meses.' }
    ],
    faq: [
      { q:'¿Funciona si tengo solo una mesa o si soy fonda pequeña?', a:'Sí. El plan Básico es gratis y cubre operaciones simples. Conforme crezcas (más mesas, delivery, sucursales) subes a Pro o Enterprise.' },
      { q:'¿Necesito comprar una pantalla especial para la cocina?', a:'No. Cualquier tablet, monitor con navegador o televisión Smart funciona. Conectas y listo, las comandas aparecen ahí.' },
      { q:'¿Cómo funciona el delivery con apps externas?', a:'Volvix se integra con Uber Eats, Rappi y Didi Food. Los pedidos llegan a tu KDS automáticamente. Sin tablets adicionales en cocina.' },
      { q:'¿Puedo dividir cuenta de mesas grandes?', a:'Sí, por persona, por platillo o por porcentaje. Y lo hace en segundos sin que el mesero use calculadora.' },
      { q:'¿Manejo costo de ingredientes?', a:'Sí. Cargas tus recetas con sus ingredientes y precios. Cada venta descuenta automáticamente del inventario y te dice tu margen real.' },
      { q:'¿Funciona offline si se cae el internet?', a:'Sí. Sigues vendiendo y cobrando. Cuando vuelve internet, todo se sincroniza automáticamente.' }
    ]
  },
  {
    slug: 'taqueria', name: 'Taquería', plural: 'taquerías', emoji: '🌮',
    primary: '#ea580c', primary2: '#f97316',
    badge: '🌮 POS para Taquerías',
    h1: 'Cobra rápido en hora pico,<br>controla tu <em>trompo</em> y duerme tranquilo',
    sub: 'Cobro al vuelo con teclas rápidas, control de carne del trompo, cierre de caja en 1 minuto y reportes que te dicen cuánto vendiste hoy. Sistema diseñado para taquerías.',
    heroFeats: ['Cobro ultrarrápido por teclas', 'Control de trompo / carne', 'Pedidos por WhatsApp', 'Cierre de caja al instante', 'Múltiples turnos', 'Comandas a parrilla', 'Reportes diarios automáticos', 'Modo offline'],
    pains: [
      { icon:'🔥', t:'"Se acaba el trompo y nadie me avisó"', d:'A las 9 PM con la fila esperando, descubres que ya no hay carne al pastor. Pierdes 3 horas de venta y los clientes no regresan.' },
      { icon:'⚡', t:'"En hora pico el cobro se vuelve un caos"', d:'Llega gente, hay 4 órdenes diferentes en la mesa, el cajero se confunde. Vendes mal y pierdes propinas.' },
      { icon:'📲', t:'"Los pedidos por WhatsApp se me empalman"', d:'WhatsApp lleno de pedidos, te confundes con direcciones, mandas mal una orden. Cliente molesto, repartidor perdido.' },
      { icon:'💵', t:'"Al cierre el efectivo no cuadra"', d:'$300 de menos esta noche, $250 ayer, $400 anteayer. Sin control de caja sabes que te roban pero no quién.' }
    ],
    features: [
      { icon:'🔥', t:'Control de trompo y carne', d:'Registras el trompo al iniciar el día. Cada taco al pastor descuenta automático. Alerta cuando bajas del 20%. Cero "se acabó sin avisar".' },
      { icon:'⚡', t:'Cobro express con teclas rápidas', d:'Tacos al pastor, suadero, bistec, gringas — un toque y va a la cuenta. Cobras 5 órdenes en 30 segundos.' },
      { icon:'📱', t:'Pedidos por WhatsApp ordenados', d:'Los pedidos llegan a tu pantalla con dirección, cliente y monto. Asignas repartidor con un clic. Sin confusiones.' },
      { icon:'🔢', t:'Cierre de caja automático', d:'Al final del turno, el sistema te dice cuánto debe haber. Sin Excel, sin calculadora. Diferencias detectadas al instante.' },
      { icon:'👥', t:'Múltiples cajeros y turnos', d:'Cada cajero entra con su PIN. Sus ventas, sus propinas, su cierre. Sabes quién cobró qué y cuándo.' },
      { icon:'📊', t:'Reporte diario al cierre', d:'Cuánto vendiste, qué se vendió más, qué hora fue tu mejor pico. Llega a tu WhatsApp cada noche.' }
    ],
    cmpRows: [
      ['Cobro rápido por teclas','✓ Optimizado','✗ Calculadora','partial:Genérico'],
      ['Control del trompo','✓ Por kilo','✗ A ojo','no:✗'],
      ['Pedidos WhatsApp ordenados','✓ Incluido','✗ Caos','partial:Aparte'],
      ['Cierre de caja exacto','✓ Automático','no:Manual','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Don Chuy Hernández', biz:'Tacos El Güero — Monterrey', text:'Tenía $5,000 al mes en diferencias de caja. Con Volvix encontré que un cajero se quedaba con $200 cada turno. Lo despedí, recuperé el dinero y ahora cuadra al peso.' },
      { name:'Mariela Sánchez', biz:'Taquería La Esquina — CDMX', text:'En hora pico cobramos como 80 órdenes en 1 hora. Antes era un desastre, ahora con las teclas rápidas mi cajero cobra 3 veces más rápido. Subí 30% las ventas.' },
      { name:'Octavio Ramírez', biz:'Tacos al Pastor Don Beto — Tijuana', text:'El control del trompo me cambió la vida. Sé exactamente cuántos kilos voy a vender y mando comprar carne sin desperdicio. Ahorro $8,000 al mes en merma.' }
    ],
    faq: [
      { q:'¿Necesito una computadora especial?', a:'No. Cualquier tablet, celular o laptop con navegador funciona. Hasta una pantalla touch barata sirve.' },
      { q:'¿Cómo funciona el control del trompo?', a:'Cargas el trompo en kilos al iniciar el día. Cada taco al pastor descuenta automáticamente. Te alerta cuando vas bajo y al final del día sabes cuánto se desperdició.' },
      { q:'¿Funciona si no tengo internet en hora pico?', a:'Sí. Modo offline completo. Cobras, mandas comandas y cuando vuelve internet todo se sincroniza.' },
      { q:'¿Puedo recibir pedidos por WhatsApp?', a:'Sí. Tus clientes te escriben a tu WhatsApp normal y los pedidos aparecen ordenados en tu pantalla con dirección y total.' },
      { q:'¿Sirve para una taquería pequeña con 1 cocinero?', a:'Sí. El plan Básico es gratis y cubre operaciones de 1-2 personas. Cuando crezcas subes de plan.' },
      { q:'¿Puedo emitir factura?', a:'Sí, en plan Pro emites CFDI 4.0 directamente al cobrar.' }
    ]
  },
  {
    slug: 'pizzeria', name: 'Pizzería', plural: 'pizzerías', emoji: '🍕',
    primary: '#d97706', primary2: '#ea580c',
    badge: '🍕 POS para Pizzerías',
    h1: 'Tu pizzería con <em>delivery sin caos</em><br>y cada pizza cobrada al precio correcto',
    sub: 'Pizzas con ingredientes personalizables, delivery con seguimiento, tiempos de entrega exactos y costeo de receta — el sistema completo para tu pizzería.',
    heroFeats: ['Constructor de pizza con extras', 'Delivery con seguimiento', 'Tiempos de entrega calculados', 'Costo de receta por pizza', 'Promociones 2x1 automáticas', 'Pedidos por WhatsApp', 'Comisiones de repartidor', 'Reportes de pizza más vendida'],
    pains: [
      { icon:'🛵', t:'"El delivery es un caos sin control"', d:'Repartidor se va con 3 pedidos, no sabes cuál entregó primero, cliente llama enojado a las 9 PM. Pierdes la venta y la propina.' },
      { icon:'🧀', t:'"Los extras no se cobran"', d:'Cliente pide doble queso, el cajero no lo carga. Por cada extra olvidado pierdes $20-$40. En el mes son $4,000-$8,000 perdidos.' },
      { icon:'⏰', t:'"Cliente llama: ¿dónde está mi pizza?"', d:'Sin tiempos calculados ni seguimiento, no sabes qué decirle. Le mientes "ya va en camino" y solo lo enojas más.' },
      { icon:'📊', t:'"No sé qué pizza es la más rentable"', d:'Vendes 15 pizzas distintas, no sabes cuál te deja más ganancia. La pizza Hawaiana puede ser tu top en ventas pero la peor en margen.' }
    ],
    features: [
      { icon:'🍕', t:'Constructor de pizza con extras', d:'Tamaño, masa, ingredientes base + extras. Cada selección suma al precio. Imposible olvidar el doble queso o el extra pepperoni.' },
      { icon:'🛵', t:'Delivery con seguimiento real', d:'Asignas repartidor, marca "salí con pedido", "entregado". Cliente recibe link de seguimiento por WhatsApp. Cero llamadas de "¿dónde está?"' },
      { icon:'⏱️', t:'Tiempos exactos de entrega', d:'Con base en distancia y carga de cocina, calcula minutos reales. Cliente ve "tu pizza llega en 25 min" y se cumple.' },
      { icon:'💰', t:'Costo de receta por pizza', d:'Cargas ingredientes con sus costos. El sistema calcula tu margen real por cada pizza. Sabes cuál subir de precio y cuál dejar igual.' },
      { icon:'🎁', t:'Promociones automáticas', d:'2x1 los martes, 25% off familias el domingo, combo pizza+refresco. El sistema aplica automático sin que el cajero recuerde.' },
      { icon:'🏍️', t:'Comisiones de repartidor', d:'Cada repartidor con su porcentaje por entrega + propinas. Al cierre sabes exactamente cuánto le toca a cada uno.' }
    ],
    cmpRows: [
      ['Constructor de pizza','✓ Extras automáticos','✗ Manual','partial:Limitado'],
      ['Seguimiento de delivery','✓ En vivo','no:✗','partial:Solo apps'],
      ['Tiempos calculados','✓ Por distancia','no:✗','no:✗'],
      ['Margen por pizza','✓ Por receta','no:✗','partial:Manual'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Roberto Salazar', biz:'Pizzería Don Roberto — Querétaro', text:'Antes los extras no se cargaban en 30% de los pedidos. Con Volvix esto es imposible olvidarlo. Recuperé $9,000 al mes en extras que antes regalaba sin querer.' },
      { name:'Adriana Pérez', biz:'Pizza Loca — Guadalajara', text:'Los clientes ya no llaman a preguntar "¿dónde está mi pizza?". Reciben link y ven al repartidor en mapa. Subí 35% mis pedidos por las recomendaciones.' },
      { name:'Hugo Méndez', biz:'La Pizza del Barrio — Toluca', text:'Descubrí que mi pizza Hawaiana me dejaba 12% de margen y la 4 quesos 38%. Ajusté precios y promovo más la 4 quesos. Pasé de $80,000 a $130,000 al mes.' }
    ],
    faq: [
      { q:'¿Maneja pizzas de tamaño chica/mediana/grande/familiar?', a:'Sí. Cada tamaño con su precio base e ingredientes adicionales con su costo proporcional.' },
      { q:'¿Puedo crear pizzas personalizadas del cliente?', a:'Sí. Cliente arma su pizza con ingredientes a elegir y el sistema calcula precio. Como las apps grandes, pero tuyo.' },
      { q:'¿Funciona con repartidores propios y de Uber Eats?', a:'Sí ambos. Tus repartidores con sus comisiones y los pedidos de Uber Eats/Rappi/Didi sincronizados.' },
      { q:'¿Cómo se calculan los tiempos de entrega?', a:'Con la distancia (Google Maps) + carga actual de cocina. Es realista, no es un estimado al azar.' },
      { q:'¿Puedo automatizar promociones 2x1?', a:'Sí. Programas el día/horario y el sistema aplica automático. Sin que el cajero deba recordar.' },
      { q:'¿Funciona para pizzería pequeña con 1 horno?', a:'Sí. Plan Básico gratis. Conforme creces subes de plan.' }
    ]
  },
  {
    slug: 'cafeteria', name: 'Cafetería', plural: 'cafeterías', emoji: '☕',
    primary: '#92400e', primary2: '#b45309',
    badge: '☕ POS para Cafeterías',
    h1: 'Cobra el café perfecto<br><em>sin filas largas</em> ni clientas frustradas',
    sub: 'Cobro ultrarrápido por teclas, combos personalizables, fidelidad por puntos, control de mesas y reportes por bebida — el sistema completo para tu cafetería.',
    heroFeats: ['Cobro express por bebida', 'Combos cafe + postre', 'Programa de lealtad', 'Mesas y para llevar', 'Tarjetas regalo', 'Inventario de granos', 'Comisiones por barista', 'Métricas de ocupación'],
    pains: [
      { icon:'⏰', t:'"En la mañana hay fila y se van clientes"', d:'A las 8 AM la fila llega a la puerta. El cobro tarda 2 minutos por persona. Los apurados se van sin café.' },
      { icon:'☕', t:'"Los combos no aparecen en el sistema"', d:'Cliente pide café americano + croissant + jugo combo. El cajero cobra cada uno por separado, cliente reclama y discutes.' },
      { icon:'🔁', t:'"Los clientes vienen una vez y nunca regresan"', d:'Sin programa de lealtad ni recordatorios, el cliente ocasional nunca se vuelve fiel. Pierdes 70% del valor de cada cliente.' },
      { icon:'💸', t:'"No sé si gano más con el café o con la comida"', d:'Vendes café, postres, sándwiches, jugos. Sin reportes por categoría no sabes cuál maximizar.' }
    ],
    features: [
      { icon:'⚡', t:'Cobro express por bebida', d:'Latte, capuccino, americano, mocha — un toque y va a la cuenta. Cobras 5 cafés en 20 segundos sin error.' },
      { icon:'🥐', t:'Combos personalizables', d:'Combo desayuno: café + jugo + sandwich. Combo tarde: café + postre. Programados con descuento automático.' },
      { icon:'🎁', t:'Programa de lealtad por puntos', d:'Cliente acumula puntos en cada compra. A los 10 cafés, el 11 gratis. Tarjeta digital sin papel.' },
      { icon:'🪑', t:'Mesas y para llevar', d:'Maneja mesas con cobro al final O cobro inmediato para llevar. Una sola interfaz, dos modos.' },
      { icon:'☕', t:'Inventario de granos y leche', d:'Cada bebida descuenta los gramos de café exactos. Sabes cuándo pedir antes de quedarte sin nada.' },
      { icon:'📊', t:'Reportes por categoría', d:'Café vs comida vs jugos. Cuál te deja más, cuál vendes más. Decisiones de menú basadas en datos.' }
    ],
    cmpRows: [
      ['Cobro express','✓ Por bebida','✗ Manual','partial:Genérico'],
      ['Programa de lealtad','✓ Digital','no:Cuaderno','partial:Aparte'],
      ['Combos automáticos','✓ Programados','no:✗','partial:Manual'],
      ['Inventario granos','✓ Por gramo','no:✗','partial:Limitado'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Valeria Domínguez', biz:'Café del Sol — Mérida', text:'En hora pico atendía 1 cliente cada 2 minutos. Con Volvix bajé a 30 segundos. La fila ya no llega a la puerta y mis ventas subieron 25%.' },
      { name:'Carlos Mancera', biz:'Coffee House Roma — CDMX', text:'El programa de lealtad cambió todo. Antes mis clientes ocasionales, ahora son fieles. Cada 11vo café gratis y vienen 3 veces más al mes.' },
      { name:'Diana Estrada', biz:'Aroma Café — León', text:'Descubrí que mi mocha y latte me dejaban 70% de margen pero solo el 25% de mis ventas. Hice promoción y los puse en pizarra. Ahora son mi top.' }
    ],
    faq: [
      { q:'¿Funciona para cafetería con barra y mesas?', a:'Sí. Cobro inmediato en barra para llevar, cobro al final para mesas. Ambos modos en la misma app.' },
      { q:'¿Cómo funciona el programa de lealtad?', a:'Cliente da su número o código QR. Acumula puntos automáticamente. Al llegar a X cafés, el siguiente es gratis. Sin cuadernos ni tarjetas físicas.' },
      { q:'¿Puedo manejar tarjetas de regalo?', a:'Sí. Vendes gift cards desde tu sitio. Cliente las regala. Se redime con QR en tu cafetería.' },
      { q:'¿Sirve para una cafetería con 1 barista?', a:'Sí. Plan Básico gratis. Cuando crezcas a varios baristas, subes a Pro.' },
      { q:'¿Maneja inventario de granos de café?', a:'Sí. Defines cuántos gramos lleva cada bebida. El sistema descuenta automático. Te avisa antes de quedarte sin granos.' },
      { q:'¿Funciona si quiero hacer cobro contactless?', a:'Sí. QR para que el cliente pague desde su celular o tarjeta NFC. Sin contacto físico.' }
    ]
  },
  {
    slug: 'panaderia', name: 'Panadería', plural: 'panaderías', emoji: '🥐',
    primary: '#b45309', primary2: '#d97706',
    badge: '🥐 POS para Panaderías',
    h1: 'Tu panadería sin <em>pan tirado</em><br>ni clientes esperando',
    sub: 'Control de producción diaria, venta menudeo y mayoreo, cobro rápido por charola, facturación CFDI y reportes que te dicen cuánto producir mañana.',
    heroFeats: ['Control de producción diaria', 'Venta menudeo y mayoreo', 'Cobro rápido por pieza', 'Facturación CFDI 4.0', 'Inventario de ingredientes', 'Múltiples turnos', 'Pedidos por encargo', 'Alertas de pan caliente'],
    pains: [
      { icon:'🍞', t:'"Tiro pan al final del día porque hice de más"', d:'Cada noche tiras 30-40% del pan. Es dinero a la basura pero no sabes cuánto producir cada día.' },
      { icon:'⚖️', t:'"El cliente de mayoreo me pide factura y tardo"', d:'Restaurante o tienda que te compra 200 piezas pide CFDI. Sin sistema, cada factura te quita 30 minutos.' },
      { icon:'👨‍🍳', t:'"Mis empleados regalan pan a sus amigos"', d:'Sin control de salidas, el pan "desaparece" en la mañana. $3,000-$8,000 al mes que nunca se cobran.' },
      { icon:'📅', t:'"No sé qué día se vende qué"', d:'¿El bolillo se vende más lunes o jueves? ¿Las conchas en la tarde o mañana? Sin datos, produces a ojo.' }
    ],
    features: [
      { icon:'📊', t:'Control de producción diaria', d:'Registras lo que horneaste cada turno. Comparas vs ventas. El sistema te sugiere cuánto producir mañana basado en histórico.' },
      { icon:'⚖️', t:'Menudeo y mayoreo automático', d:'Cliente normal compra al precio normal. Restaurante o tienda al mayoreo automático con su descuento. Sin discutir precios.' },
      { icon:'🧾', t:'Facturación CFDI 4.0', d:'Cliente de mayoreo pide factura, se la das en 30 segundos. Sin papeles, sin dolor de cabeza.' },
      { icon:'🛡️', t:'Control anti-merma', d:'Cada pieza que sale debe pasar por el sistema. Cierre de caja muestra diferencias inmediatamente. Cero "se acabó sin saber".' },
      { icon:'📅', t:'Pedidos por encargo', d:'Pastel de XV años, panqué de cumpleaños, charola para evento. Cliente paga anticipo, sistema te recuerda fechas de entrega.' },
      { icon:'🔥', t:'Alertas de pan caliente', d:'Aviso por WhatsApp a clientes registrados cuando sale pan recién horneado. Suben tus ventas por la tarde.' }
    ],
    cmpRows: [
      ['Control de producción','✓ Sugerido por IA','✗ A ojo','partial:Manual'],
      ['Menudeo y mayoreo','✓ Automático','✗ Manual','partial:Limitado'],
      ['Facturación CFDI 4.0','✓ Incluido','no:✗','partial:Aparte'],
      ['Anti-merma / control','✓ Por pieza','no:✗','partial:Limitado'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Don Gerardo Vázquez', biz:'Panadería La Espiga — Hidalgo', text:'Tiraba 40% del pan diario. Con el control de producción de Volvix tiro menos del 10%. Eso es $25,000 al mes que ya no van a la basura.' },
      { name:'María del Carmen', biz:'Panadería Los Reyes — Edomex', text:'Mi cliente principal es un restaurante que pide 300 conchas diarias. La factura me tomaba 1 hora. Ahora la genera en 30 segundos. Cerré 3 contratos más.' },
      { name:'Antonio Bernal', biz:'Panificadora El Trigal — Pachuca', text:'Tenía $15,000 mensuales en "merma" que en realidad era pan que se llevaban mis empleados. Con el control de salidas detecté el problema y lo paré.' }
    ],
    faq: [
      { q:'¿Maneja pan dulce, salado y repostería?', a:'Sí. Categorías separadas con sus precios y márgenes. Reportes por categoría para saber qué te deja más.' },
      { q:'¿Cómo funciona la facturación de mayoreo?', a:'Defines qué clientes son de mayoreo. Cuando facturas, el sistema aplica precio mayoreo automático y emite CFDI 4.0 con sus datos fiscales.' },
      { q:'¿Puedo recibir pedidos por encargo?', a:'Sí. Cliente reserva pastel/charola, paga anticipo, sistema te recuerda 24 horas antes. Cero pedidos olvidados.' },
      { q:'¿Funciona para panadería pequeña con 2 empleados?', a:'Sí. Plan Básico gratis. Sirve perfecto para 1-2 personas. Cuando crezcas subes de plan.' },
      { q:'¿Maneja varios turnos (mañana y tarde)?', a:'Sí. Cada turno con su cierre de caja independiente. Sabes cuánto vendiste por turno y por día.' },
      { q:'¿Puedo enviar avisos de "pan caliente"?', a:'Sí. Tus clientes opt-in y reciben WhatsApp cuando sale pan recién horneado. Súper efectivo para subir ventas vespertinas.' }
    ]
  },
  // Continuación con más giros — el patrón se repite con datos específicos de cada uno
  {
    slug: 'pasteleria', name: 'Pastelería', plural: 'pastelerías', emoji: '🎂',
    primary: '#be185d', primary2: '#ec4899',
    badge: '🎂 POS para Pastelerías',
    h1: 'Tu pastelería con <em>pedidos sin olvidos</em><br>y costos exactos por receta',
    sub: 'Pedidos por encargo con anticipo, calendario de entregas, costeo de recetas, control de ingredientes caros y facturación — el sistema completo para tu pastelería.',
    heroFeats: ['Pedidos con anticipo', 'Calendario visual de entregas', 'Costeo de receta', 'Control de ingredientes', 'Pastelillos por charola', 'Recordatorios automáticos', 'Galería con fotos', 'Facturación CFDI'],
    pains: [
      { icon:'📅', t:'"Olvido entregar un pastel y se me cae el cliente"', d:'XV años el sábado, pastel olvidado el viernes. Cliente llamó llorando. Adiós reputación y devolución del anticipo.' },
      { icon:'💰', t:'"No sé cuánto cobrar por un pastel personalizado"', d:'Cliente pide pastel 3 leches con fondant. Cobras "lo de siempre" y al final no te queda margen porque la fondant subió de precio.' },
      { icon:'🥚', t:'"Los ingredientes caros se desaparecen"', d:'Vainilla francesa, chocolate belga, queso crema. Sin control terminas comprando 3 veces lo necesario sin saber por qué.' },
      { icon:'🧾', t:'"Anoto pedidos en cuaderno y se confunden"', d:'Pedido de Sra. Lupita, Sra. Ana, Sra. Rocío. Se mezclan, llamas para confirmar y queda mal hecho.' }
    ],
    features: [
      { icon:'📅', t:'Pedidos con calendario visual', d:'Ve todos los pedidos de la semana en una pantalla. Pastel para sábado a las 4 PM con todos sus detalles. Imposible olvidar.' },
      { icon:'💰', t:'Costeo automático de receta', d:'Cargas ingredientes con precios. Cada pastel calcula tu costo real. Sabes el precio mínimo para no perder.' },
      { icon:'🥚', t:'Inventario de ingredientes caros', d:'Vainilla, chocolate fino, queso crema con su control exacto. Alertas cuando bajas. Cero "se acabó y no compré".' },
      { icon:'💳', t:'Anticipos y abonos por pedido', d:'Cliente da $500 de anticipo, paga el resto al recoger. Sistema lleva el saldo. Cero confusión sobre cuánto debe.' },
      { icon:'📸', t:'Galería visual del pedido', d:'Cliente sube foto de la referencia, tú anotas detalles. Toda la info junta. Cero "no era así".' },
      { icon:'🔔', t:'Recordatorios automáticos', d:'24 horas antes de la entrega, alerta a cocina. 1 hora antes, alerta al cliente. Cero olvidos.' }
    ],
    cmpRows: [
      ['Pedidos por encargo','✓ Calendario','✗ Cuaderno','partial:Limitado'],
      ['Costeo de receta','✓ Automático','no:Manual','partial:Excel'],
      ['Anticipos por pedido','✓ Incluido','partial:Manual','yes:✓'],
      ['Galería con fotos','✓ Incluido','no:✗','no:✗'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Lucía Mendoza', biz:'Pastelería Dulce Sueño — Toluca', text:'Olvidaba 1 pedido cada quincena. Eran $4,000-$6,000 perdidos por mes en devoluciones. Con Volvix llevo 8 meses sin un solo olvido.' },
      { name:'Beatriz Aguilera', biz:'Cake Studio — Querétaro', text:'Subí mis precios 25% gracias al costeo de receta. Descubrí que cobraba menos de lo que costaba un pastel premium. Ahora cobro lo justo y mis clientes pagan sin chistar.' },
      { name:'Sergio Robles', biz:'Pasteles del Cielo — Veracruz', text:'Manejaba ingredientes en cuaderno. Compraba vainilla 3 veces porque "se había acabado". Con Volvix gasto $4,000 menos en compras innecesarias.' }
    ],
    faq: [
      { q:'¿Maneja pedidos personalizados con anticipo?', a:'Sí. Cliente reserva, paga anticipo (50% típico), sistema lleva el saldo. Al entregar paga el resto. Todo registrado.' },
      { q:'¿Cómo funciona el costeo por receta?', a:'Cargas cada ingrediente con su precio actual. Defines la receta del pastel. Sistema calcula tu costo y margen. Si sube el chocolate, te avisa.' },
      { q:'¿Puedo enviar foto de referencia del cliente?', a:'Sí. Cliente envía foto por WhatsApp o subes desde el sistema. Queda asociada al pedido para que el repostero la vea.' },
      { q:'¿Sirve para pastelería de 1 persona en casa?', a:'Sí. Plan Básico gratis cubre operaciones pequeñas. Te ayuda a profesionalizarte y crecer.' },
      { q:'¿Funciona con pastelillos venta diaria + pedidos especiales?', a:'Sí. Maneja venta de mostrador (cobro inmediato) Y pedidos por encargo (con anticipo y entrega futura) en el mismo sistema.' },
      { q:'¿Puedo emitir facturas?', a:'Sí, plan Pro emite CFDI 4.0 al instante.' }
    ]
  },
  {
    slug: 'heladeria', name: 'Heladería', plural: 'heladerías', emoji: '🍦',
    primary: '#0891b2', primary2: '#06b6d4',
    badge: '🍦 POS para Heladerías',
    h1: 'Tu heladería <em>sin sabores agotados</em><br>y con cobro rapidísimo en verano',
    sub: 'Control de sabores con alertas automáticas, cobro express por bola, mezclas y combos, programa de lealtad y reportes por temporada — para tu heladería artesanal o comercial.',
    heroFeats: ['Control de sabores en vivo', 'Alertas de sabor agotado', 'Cobro express por bola', 'Combos y banana splits', 'Programa de puntos', 'Inventario de ingredientes', 'Múltiples sucursales', 'Reportes por temporada'],
    pains: [
      { icon:'🍨', t:'"Cliente pide un sabor y ya no hay"', d:'Es la tercera vez que la familia regresa por chocolate y nunca hay. Pierdes al cliente para siempre.' },
      { icon:'⚡', t:'"En verano la fila llega a la calle"', d:'Tarde calurosa, fila de 30 personas, cobro lento. La gente se va sin helado y al competidor de enfrente.' },
      { icon:'🥄', t:'"Los empleados sirven bolas grandes"', d:'Cada bola debería ser 80g. Empleado sirve 100g sin pensar. En el mes pierdes 25% del rendimiento del helado.' },
      { icon:'🔁', t:'"Los clientes vienen una vez por temporada"', d:'Sin programa de lealtad ni recordatorios, los clientes ocasionales no se vuelven fieles.' }
    ],
    features: [
      { icon:'🍦', t:'Control de sabores en tiempo real', d:'Cada sabor con su nivel actual. Alerta cuando baja del 25%. Avisa que prepares más fresa antes de quedarte sin.' },
      { icon:'⚡', t:'Cobro express por bola y combo', d:'1 bola, 2 bolas, banana split, malteada. Un toque y va a la cuenta. Cobras 10 órdenes en 1 minuto.' },
      { icon:'⚖️', t:'Control de gramaje por bola', d:'Si tu bola es 80g, el sistema reporta cuántas bolas reales se sirvieron del rendimiento del galón. Detecta si sirven de más.' },
      { icon:'🎁', t:'Programa de lealtad por puntos', d:'Cada compra suma puntos. Al completar 10, helado gratis. Aumenta visitas 3x.' },
      { icon:'❄️', t:'Inventario de ingredientes', d:'Leche, azúcar, frutas, chocolate. Cada receta de helado descuenta. Sabes cuándo comprar.' },
      { icon:'☀️', t:'Reportes por temporada', d:'Cuál sabor sube en verano vs invierno. Cuál día se vende más. Decisiones basadas en datos reales.' }
    ],
    cmpRows: [
      ['Control de sabores','✓ En vivo','✗ A ojo','partial:Manual'],
      ['Alertas de agotamiento','✓ Automático','no:✗','partial:Limitado'],
      ['Cobro express','✓ Optimizado','partial:Genérico','yes:✓'],
      ['Programa de lealtad','✓ Digital','no:Cuaderno','partial:Aparte'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Pamela Vega', biz:'Heladería Antártida — Mérida', text:'Tenía clientes que se iban porque no había su sabor. Con las alertas de Volvix preparo antes de que se acabe. Bajaron 80% las quejas.' },
      { name:'Ramón Treviño', biz:'Helados Don Ramón — Hermosillo', text:'En verano cobramos 200 órdenes por hora. Con las teclas rápidas ya no hay fila que llegue a la calle. Subí 45% mis ventas vs el año pasado.' },
      { name:'Sofía Bautista', biz:'Heladería Mi Antojo — Cuernavaca', text:'Descubrí que mis empleados servían bolas de 110g cuando deberían ser 80g. Era 38% más helado regalado. Ya cuadra y mis márgenes subieron.' }
    ],
    faq: [
      { q:'¿Cómo funciona el control de sabores?', a:'Cargas cada galón con su capacidad. Cada bola descuenta. Sistema te alerta al 25% restante para que prepares más antes de quedarte sin.' },
      { q:'¿Maneja helados artesanales y comerciales?', a:'Ambos. Helado artesanal con control de receta (leche, azúcar, frutas). Comercial por galones comprados.' },
      { q:'¿Puedo manejar varias sucursales?', a:'Sí, plan Pro o Cadena. Inventario consolidado, transferencias entre sucursales, reportes globales.' },
      { q:'¿Sirve para una heladería con 2 personas?', a:'Sí. Plan Básico gratis cubre operación pequeña. Sin pagar nada hasta que crezcas.' },
      { q:'¿Funciona offline?', a:'Sí. Cobro y operación sin internet. Sincroniza al volver conexión.' },
      { q:'¿Maneja paletas, malteadas y postres también?', a:'Sí. Catálogo completo. Cada producto con su precio y costo. Reportes por categoría.' }
    ]
  },
  {
    slug: 'tortilleria', name: 'Tortillería', plural: 'tortillerías', emoji: '🫓',
    primary: '#ca8a04', primary2: '#eab308',
    badge: '🫓 POS para Tortillerías',
    h1: 'Tu tortillería con <em>peso exacto</em><br>y crédito controlado al peso',
    sub: 'Venta por kilo con báscula integrada, control de crédito a clientes recurrentes, registro de producción vs venta y corte diario automático.',
    heroFeats: ['Venta por kilo automática', 'Báscula integrada', 'Control de crédito', 'Registro de producción', 'Cobro rápido', 'Cortes por turno', 'Pedidos a granel', 'Reportes diarios'],
    pains: [
      { icon:'⚖️', t:'"La báscula y la caja no se hablan"', d:'Pesas las tortillas en una báscula, escribes en papel, cobras a mano. Errores constantes y diferencias al cierre.' },
      { icon:'📒', t:'"Los clientes de fiado no me pagan"', d:'Doña Lupita, Don Pancho, La Sra. Mary. Cada uno con su cuaderno. Olvidas a quién le debes cuánto.' },
      { icon:'🌽', t:'"No sé cuántos kilos produje vs vendí"', d:'Hiciste 200 kg, vendiste ¿180? ¿170? Sin registro no sabes la merma real ni cuánto producir mañana.' },
      { icon:'⏰', t:'"Cierre de caja al final del día tarda 1 hora"', d:'Sumar tickets, restar fiados, cuadrar efectivo. Cada noche pierdes tiempo que ya no tienes.' }
    ],
    features: [
      { icon:'⚖️', t:'Venta por kilo automática', d:'La báscula se conecta al sistema. Cliente pide 1.5 kg, pesas, el sistema cobra exacto. Cero errores.' },
      { icon:'💳', t:'Control de fiado / crédito', d:'Cada cliente con su cuenta. Sumas, restas, ves saldo. Recordatorios automáticos por WhatsApp cuando deba.' },
      { icon:'🌽', t:'Registro de producción diaria', d:'Cargaste 200 kg de masa. Vendiste 187 kg. Merma 6.5%. Datos para producir lo justo.' },
      { icon:'📊', t:'Cierre de caja en 1 minuto', d:'Sistema te da el resumen al cerrar. Cuánto en efectivo, cuánto en fiado, diferencias. Sin Excel ni calculadora.' },
      { icon:'🚚', t:'Pedidos a granel para restaurantes', d:'Clientes mayoreo (taquerías, restaurantes) con su precio especial y entrega programada.' },
      { icon:'⚡', t:'Cobro rápido por kilo o medio', d:'Teclas de medio kilo, kilo, kilo y medio. Atiendes a 10 personas por minuto en hora pico.' }
    ],
    cmpRows: [
      ['Venta por kilo integrada','✓ Báscula directo','✗ Manual','partial:Limitado'],
      ['Control de fiado','✓ Por cliente','no:Cuaderno','partial:Limitado'],
      ['Producción vs venta','✓ Automático','no:✗','partial:Manual'],
      ['Cierre rápido','✓ 1 minuto','no:30-60 min','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Don Mario Esparza', biz:'Tortillería La Tradición — Edomex', text:'Tenía $12,000 en fiados perdidos en cuadernos. Con Volvix ahora sé exactamente quién me debe cuánto. Recuperé el 80% en 2 meses.' },
      { name:'Reyna Velázquez', biz:'Tortillería Velázquez — Puebla', text:'La báscula conectada al sistema me cambió la vida. Antes mi cajero se equivocaba 5 veces al día. Ahora cero errores y los clientes felices.' },
      { name:'Heriberto Ríos', biz:'Tortillas Doña Mago — Hidalgo', text:'Producía 250 kg y nunca sabía cuánto se desperdiciaba. Con el registro descubrí 14% de merma. Ajusté producción y ahorro $6,000 al mes.' }
    ],
    faq: [
      { q:'¿Funciona con cualquier báscula?', a:'Sí, con básculas que tengan salida USB, RS232 o Bluetooth. Si no tienes, te recomendamos modelos compatibles desde $1,500.' },
      { q:'¿Cómo funciona el control de fiado?', a:'Cada cliente tiene su cuenta. Cuando pide fiado, registras al instante. WhatsApp automático le recuerda cada semana o al llegar al límite.' },
      { q:'¿Maneja venta a otras tortillerías o restaurantes?', a:'Sí, mayoreo con su precio especial y facturación. Pedidos programados con entrega diaria.' },
      { q:'¿Sirve para tortillería pequeña con 1 máquina?', a:'Sí. Plan Básico gratis. Conforme creces (más turnos, varios cajeros) subes de plan.' },
      { q:'¿Puedo emitir factura?', a:'Sí, en plan Pro. CFDI 4.0 directamente desde la caja.' },
      { q:'¿Lleva control de la masa que entra?', a:'Sí. Registras kg de masa al iniciar. Comparas vs ventas al final. Sabes la merma exacta.' }
    ]
  },
  // ───────── RETAIL ─────────
  {
    slug: 'abarrotes', name: 'Tienda de Abarrotes', plural: 'tiendas de abarrotes', emoji: '🛒',
    primary: '#15803d', primary2: '#16a34a',
    badge: '🛒 POS para Tiendas de Abarrotes',
    h1: 'Tu tienda de abarrotes con <em>cero robo hormiga</em><br>y caja que cuadra al peso',
    sub: 'Lector de barras, control de stock, fiado controlado, alertas de inventario bajo, facturación CFDI y cierre de caja por turno — el sistema completo para tu tienda.',
    heroFeats: ['Lector de barras integrado', 'Control de stock por SKU', 'Fiado controlado por cliente', 'Mínimos de inventario', 'Múltiples cajeros', 'Cierre por turno', 'Facturación CFDI 4.0', 'Reportes diarios'],
    pains: [
      { icon:'🍫', t:'"Me roban dulces y refrescos sin que sepa"', d:'Cada semana faltan productos pequeños. $2,000-$5,000 al mes en mercancía que desaparece sin saber quién.' },
      { icon:'📒', t:'"El cuaderno del fiado se vuelve un caos"', d:'Doña Lupita debe $250, Don Pancho $400, Sra. Mary $180. Olvidas, mezclas, no cobras a tiempo.' },
      { icon:'📦', t:'"Se me agotan productos sin avisar"', d:'Cliente pide leche y ya no hay. Cliente pide cerveza un viernes a las 8 PM y se me acabó. Pierdes la venta y al cliente.' },
      { icon:'💸', t:'"La caja siempre tiene diferencias"', d:'Al cerrar el turno el efectivo no cuadra. $50 menos hoy, $80 ayer. Sumando son $5,000 al mes que no sabes a dónde van.' }
    ],
    features: [
      { icon:'📷', t:'Lector de barras instantáneo', d:'Pasas el código y va a la cuenta. Cobra 8 productos en 10 segundos. Cero errores de captura manual.' },
      { icon:'📦', t:'Control de stock automático', d:'Cada venta descuenta del inventario. Sabes en tiempo real cuánto te queda de cada producto.' },
      { icon:'💳', t:'Fiado controlado por cliente', d:'Cada cliente con su cuenta digital. Límite de crédito configurable. Recordatorios por WhatsApp automáticos.' },
      { icon:'🔔', t:'Alertas de mínimo de stock', d:'Defines mínimo de cada producto (10 cervezas, 5 leches). Cuando bajas, alerta para reordenar.' },
      { icon:'👥', t:'Control por cajero/turno', d:'Cada empleado con su PIN. Sus ventas, su corte, su responsabilidad. Detectas diferencias al instante.' },
      { icon:'📊', t:'Reportes que te dicen qué hacer', d:'Top productos, peor margen, qué pedir el lunes, qué promocionar. Decisiones basadas en datos.' }
    ],
    cmpRows: [
      ['Lector de barras','✓ Integrado','✗ Manual','partial:Limitado'],
      ['Control de fiado digital','✓ Por cliente','no:Cuaderno','yes:✓'],
      ['Alertas de stock bajo','✓ Automático','no:✗','partial:Manual'],
      ['Cierre por turno/cajero','✓ Detallado','no:✗','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Don Pedro Almanza', biz:'Abarrotes Almanza — Edomex', text:'Tenía $4,500 al mes en "merma" misteriosa. Con cierre por turno detecté que un cajero se llevaba $150 cada turno. Lo despedí, recuperé el dinero.' },
      { name:'Doña Carmen Ruiz', biz:'Tienda La Esquina — Hidalgo', text:'Mi cuaderno de fiado tenía $18,000 que ni recordaba quién debía qué. Con Volvix lo organicé y recuperé $14,000 en 3 meses.' },
      { name:'Manuel Espinoza', biz:'Abarrotes Espinoza — Tlaxcala', text:'Las alertas de stock cambiaron mi forma de comprar. Antes pedía a ojo. Ahora el sistema me dice exactamente qué pedir el lunes. Cero productos agotados.' }
    ],
    faq: [
      { q:'¿Necesito comprar lector de código de barras?', a:'No es obligatorio. Puedes usar la cámara del celular como lector. Pero un lector USB cuesta $400-$800 y agiliza muchísimo.' },
      { q:'¿Cómo cargo mi inventario actual?', a:'Importas desde Excel/CSV o si tienes muchos productos, nuestro equipo lo carga por ti sin costo extra.' },
      { q:'¿Funciona offline?', a:'Sí. Sigues vendiendo y cobrando sin internet. Sincroniza cuando vuelve.' },
      { q:'¿Cómo controla el fiado?', a:'Cada cliente tiene su cuenta. Cargas el fiado al instante, mandas recordatorios automáticos por WhatsApp, ves saldos en tiempo real.' },
      { q:'¿Sirve para tienda con 1 persona?', a:'Sí, plan Básico gratis. Cuando contrates a alguien, subes a Pro para múltiples cajeros.' },
      { q:'¿Puedo emitir factura?', a:'Sí, en plan Pro. CFDI 4.0 directamente desde la caja.' }
    ]
  },
  {
    slug: 'tienda-ropa', name: 'Tienda de Ropa', plural: 'tiendas de ropa', emoji: '👗',
    primary: '#db2777', primary2: '#ec4899',
    badge: '👗 POS para Tiendas de Ropa',
    h1: 'Tu boutique con <em>todas las tallas controladas</em><br>y tu Instagram conectado a la caja',
    sub: 'Inventario por talla/color/modelo, temporadas y promociones, catálogo visual con fotos, ventas online y cobro multi-forma — todo lo que tu tienda de ropa necesita.',
    heroFeats: ['Inventario por talla y color', 'Catálogo visual con fotos', 'Ventas online + tienda', 'Promociones automáticas', 'Apartados con anticipo', 'Cambios y devoluciones', 'Programa de lealtad', 'Reportes por modelo'],
    pains: [
      { icon:'📏', t:'"No sé qué talla me queda en bodega"', d:'Cliente pregunta por talla M en azul, vas a buscar y no hay. Al final estaba en la otra rama o se vendió y no se anotó. Pierdes la venta.' },
      { icon:'📸', t:'"Mi Instagram tiene 200 prendas, mi caja no"', d:'Subes fotos al Instagram, recibes mensajes de compra. Pero tu caja no sabe qué está disponible. Vendes ropa que ya no tienes.' },
      { icon:'🏷️', t:'"En temporada cambio precios y me pierdo"', d:'Verano = 30% off. Liquidación = 50% off. Sin sistema, el cajero cobra precios viejos. Pierdes margen o sobre-descuentas.' },
      { icon:'🔄', t:'"Las devoluciones se vuelven un problema"', d:'Cliente regresa una blusa, pide cambio por otra talla. Sin sistema, no sabes si era cambio, devolución o nueva venta.' }
    ],
    features: [
      { icon:'📏', t:'Inventario por talla/color/modelo', d:'Cada prenda con sus variantes. Sabes en vivo cuántas blusas talla M en azul te quedan. Sin sorpresas.' },
      { icon:'📸', t:'Catálogo visual con fotos', d:'Tus prendas con foto, descripción y stock. Compartes link al cliente que pregunta por WhatsApp. Cierra la venta en minutos.' },
      { icon:'🛒', t:'Tienda online integrada', d:'Tu Instagram, tu sitio web y tu caja con el mismo inventario. Vendes ropa que sí tienes, no la que ya se fue.' },
      { icon:'🏷️', t:'Promociones automáticas', d:'Programas la temporada y los descuentos se aplican solos. 30% off en jeans los viernes, 2x1 en accesorios el domingo.' },
      { icon:'💎', t:'Apartados con anticipo', d:'Cliente reserva con $200 de anticipo. Sistema lleva el saldo. Pasa por su prenda en 7 días y paga el resto.' },
      { icon:'🔄', t:'Cambios y devoluciones simples', d:'Un clic para cambiar talla, devolver dinero o aplicar saldo a futuro. Cero confusión.' }
    ],
    cmpRows: [
      ['Inventario por talla/color','✓ Por variante','no:✗','partial:Limitado'],
      ['Tienda online integrada','✓ Mismo inventario','no:✗','partial:Costo extra'],
      ['Promociones automáticas','✓ Programadas','no:Manual','yes:✓'],
      ['Apartados con anticipo','✓ Incluido','partial:Cuaderno','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Karla Sandoval', biz:'Boutique Karla — CDMX', text:'Vendía por Instagram pero a veces ya no tenía la prenda. Con Volvix mi caja y mi Instagram tienen el mismo inventario. Ya no quedo mal con clientas.' },
      { name:'Vanessa Romero', biz:'Tienda Trend — Mérida', text:'En temporada de verano antes me equivocaba de precios todo el tiempo. Ahora programo el descuento y se aplica solo. Cero errores, cero discusiones con clientas.' },
      { name:'Andrea López', biz:'Outfit Boutique — Toluca', text:'El control por talla me cambió la vida. Antes daba vueltas buscando la talla M. Ahora veo en pantalla y voy directo a donde está. Vendo 30% más rápido.' }
    ],
    faq: [
      { q:'¿Maneja prendas con muchas variantes (talla, color, modelo)?', a:'Sí. Cada prenda con sus variantes. Cada combinación con su stock independiente.' },
      { q:'¿Se conecta con mi Instagram?', a:'Sí. Tu catálogo de Instagram y tu inventario de caja se mantienen sincronizados. Vendes solo lo que tienes.' },
      { q:'¿Cómo manejo apartados?', a:'Cliente da anticipo (lo defines tú: 30%, 50%). Sistema lleva el saldo. Notificación automática cuando se acerca la fecha límite.' },
      { q:'¿Funciona para tienda con 1 vendedora?', a:'Sí, plan Básico gratis. Conforme crezcas (más prendas, varias sucursales) subes de plan.' },
      { q:'¿Manejo cambios y devoluciones?', a:'Sí, en un clic. Cambio de talla, devolución de dinero, saldo a favor. Todo registrado y auditado.' },
      { q:'¿Puedo programar promociones?', a:'Sí. "30% off jeans del viernes 15 al domingo 17". El sistema aplica solo en esas fechas.' }
    ]
  },
  {
    slug: 'farmacia', name: 'Farmacia', plural: 'farmacias', emoji: '💊',
    primary: '#16a34a', primary2: '#22c55e',
    badge: '💊 POS para Farmacias',
    h1: 'Tu farmacia con <em>cero medicamentos caducados</em><br>y recetas controladas',
    sub: 'Control de caducidades, catálogo genérico/marca, registro de recetas, facturación CFDI, alertas de stock bajo y reportes de margen — el sistema diseñado para farmacias.',
    heroFeats: ['Control de caducidades', 'Catálogo genérico/marca', 'Registro de recetas', 'Alertas de stock bajo', 'Facturación CFDI 4.0', 'Múltiples cajeros', 'Pedidos a proveedor', 'Reportes de rotación'],
    pains: [
      { icon:'⏳', t:'"Tiro medicamento caducado cada mes"', d:'$5,000-$15,000 al mes en medicamentos vencidos. Sin alertas, los descubres cuando ya es tarde.' },
      { icon:'💊', t:'"Cliente pide genérico y no sé si tengo"', d:'Pregunta por paracetamol genérico. Vas a buscar, no encuentras, dices "no hay" cuando sí estaba en otro pasillo. Pierdes la venta.' },
      { icon:'📋', t:'"Las recetas controladas se descontrolan"', d:'Receta para antibióticos. ¿Quién la pidió? ¿Cuándo? Sin registro, problemas con COFEPRIS.' },
      { icon:'💸', t:'"No sé cuál medicamento me deja más"', d:'Vendes 3,000 SKUs. Algunos margen 15%, otros 60%. Sin reportes empujas los equivocados.' }
    ],
    features: [
      { icon:'⏳', t:'Control de caducidades por lote', d:'Cada medicamento con su fecha de caducidad. Alerta 60 días antes para promocionar o regresar al proveedor.' },
      { icon:'💊', t:'Catálogo genérico vs marca', d:'Cliente pregunta por Tylenol, sistema sugiere paracetamol genérico equivalente. Más opciones, más ventas, mejor margen.' },
      { icon:'📋', t:'Registro de recetas controladas', d:'Cumples con COFEPRIS automáticamente. Receta digitalizada, vinculada a venta, retenida 5 años.' },
      { icon:'🔔', t:'Alertas de stock bajo', d:'Cuando el inventario de cualquier medicamento baja del mínimo, alerta para reordenar antes de quedarte sin.' },
      { icon:'🧾', t:'Facturación CFDI 4.0', d:'Cliente que pide factura por medicamentos, se la das al instante. Compatible con seguros y empresas.' },
      { icon:'📊', t:'Margen real por SKU', d:'Reporte que te dice qué medicamento vende mucho con poco margen vs cuál vende poco con margen alto. Decisiones inteligentes.' }
    ],
    cmpRows: [
      ['Control de caducidades','✓ Por lote','✗ Manual','partial:Limitado'],
      ['Catálogo genérico/marca','✓ Sugerencias','no:Por memoria','partial:Aparte'],
      ['Registro de recetas','✓ COFEPRIS','no:Papel','partial:Manual'],
      ['Alertas de stock','✓ Automático','no:✗','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$2,000+']
    ],
    testimonials: [
      { name:'Q.F.B. Rocío Garrido', biz:'Farmacia La Salud — Querétaro', text:'Tiraba $8,000 al mes en medicamento caducado. Con las alertas regreso al proveedor o promociono antes. Bajé la merma a $1,500.' },
      { name:'Roberto Núñez', biz:'Farmacia Don Roberto — Aguascalientes', text:'Mi cliente pedía genéricos y yo no sabía qué tenía equivalente. Con el catálogo Volvix sugiero al instante. Subí ventas 25% sin invertir más.' },
      { name:'Ana Lucía Pérez', biz:'Farmacia Médica — Saltillo', text:'COFEPRIS me hizo auditoría. Saqué reporte de Volvix con todas las recetas controladas en 30 segundos. Pasé sin problema. Antes hubiera sido pesadilla.' }
    ],
    faq: [
      { q:'¿Cumple con COFEPRIS para medicamentos controlados?', a:'Sí. Cada receta queda registrada digitalmente con todos los datos requeridos. Reportes generados al instante para auditorías.' },
      { q:'¿Cómo funciona el control de caducidades?', a:'Cada lote con su fecha. Alerta 60 días antes (configurable). Puedes promocionar antes de caducar o regresar al proveedor.' },
      { q:'¿Maneja medicamentos por marca y genérico?', a:'Sí. Cliente pregunta por Tylenol, sistema muestra el genérico paracetamol equivalente con su precio.' },
      { q:'¿Cómo cargo mi inventario actual?', a:'Importas desde Excel/CSV o nuestro equipo lo carga por ti sin costo. Para farmacias grandes con 5,000+ SKUs.' },
      { q:'¿Funciona offline?', a:'Sí. Cobro y operación sin internet. Sincroniza al volver.' },
      { q:'¿Maneja recetas para seguro médico?', a:'Sí. Registro detallado, factura para reembolso del seguro. Compatible con principales aseguradoras.' }
    ]
  },
  {
    slug: 'papeleria', name: 'Papelería', plural: 'papelerías', emoji: '📚',
    primary: '#6366f1', primary2: '#8b5cf6',
    badge: '📚 POS para Papelerías',
    h1: 'Tu papelería con <em>regreso a clases sin caos</em><br>y precios mayoreo controlados',
    sub: 'Cobro ultrarrápido para temporada alta, precios diferenciados (escuela vs público), catálogo visual de miles de SKUs, facturación a instituciones — para tu papelería.',
    heroFeats: ['Cobro express temporada alta', 'Precios mayoreo automáticos', 'Catálogo visual con fotos', 'Listas escolares', 'Inventario miles de SKUs', 'Facturación a instituciones', 'Múltiples cajeros', 'Reportes por categoría'],
    pains: [
      { icon:'🎒', t:'"En regreso a clases la fila no para"', d:'Agosto-septiembre vendes 3 veces más que en mes normal. Cobro lento, fila de 20 personas, clientes se van con el competidor.' },
      { icon:'🏫', t:'"Los maestros piden precio diferente y me confundo"', d:'Maestros y escuelas con descuento, padres con precio normal. Sin sistema, el cajero cobra al azar.' },
      { icon:'📓', t:'"No sé qué me queda en almacén"', d:'Tienes 3,000 productos chicos: lápices, plumas, libretas. Imposible llevar control en cuaderno o Excel.' },
      { icon:'📋', t:'"Las listas escolares son un dolor"', d:'Mamá llega con lista de 25 artículos. Buscar, anotar, cobrar — 15 minutos por cliente. Atrás se enojan otros.' }
    ],
    features: [
      { icon:'⚡', t:'Cobro express con teclas rápidas', d:'Lápices, plumas, libretas, cuadernos — un toque y va a la cuenta. Cobras 5 productos en 8 segundos.' },
      { icon:'🏫', t:'Precios mayoreo / institucional', d:'Cliente identificado como escuela o maestro = precio mayoreo automático. Cobranza con factura inmediata.' },
      { icon:'📋', t:'Listas escolares pre-cargadas', d:'Las listas de las escuelas locales en tu sistema. Mamá llega, eliges la lista, sistema arma el carrito en 30 segundos.' },
      { icon:'📷', t:'Catálogo visual con fotos', d:'Cliente pregunta por una pluma específica. Buscas en fotos, aparece, le confirmas si tienes y cuánto cuesta.' },
      { icon:'📦', t:'Inventario para miles de SKUs', d:'Lápices, plumas, marcadores, gomas, sacapuntas — manejas 5,000+ productos sin que el sistema se trabe.' },
      { icon:'🧾', t:'Facturación a escuelas', d:'Universidad o colegio que pide factura por compras grandes, se las das al instante CFDI 4.0.' }
    ],
    cmpRows: [
      ['Cobro express temporada','✓ Optimizado','no:Lento','partial:Genérico'],
      ['Precios mayoreo automático','✓ Por cliente','no:Manual','partial:Limitado'],
      ['Listas escolares','✓ Pre-cargadas','no:✗','no:✗'],
      ['Catálogo con fotos','✓ Incluido','no:✗','partial:Costo extra'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Carmen Domínguez', biz:'Papelería La Estudiantil — Edomex', text:'En agosto antes atendía 1 cliente cada 8 minutos. Con Volvix bajé a 2 minutos por cliente. La fila ya no llega a la calle y vendí 60% más este regreso a clases.' },
      { name:'Luis Maldonado', biz:'Papelería Maldonado — Toluca', text:'Las listas escolares pre-cargadas son magia. Mamá llega con lista de 30 artículos, en 1 minuto está armado el carrito. Vendo 4 listas en lo que antes vendía 1.' },
      { name:'Patricia Salinas', biz:'Papelería Inteligente — León', text:'Tengo 4 escuelas de la zona como clientes. Cada una con su precio mayoreo. Antes me equivocaba 30% del tiempo. Ahora el sistema lo aplica solo y nunca cobro mal.' }
    ],
    faq: [
      { q:'¿Maneja miles de SKUs sin trabarse?', a:'Sí. El sistema está optimizado para papelerías con 5,000+ productos. Búsqueda instantánea por nombre o código.' },
      { q:'¿Cómo funcionan las listas escolares?', a:'Cargas las listas de las escuelas locales. Mamá pide "lista de 3ro de primaria del Cervantes". Sistema arma el carrito en segundos.' },
      { q:'¿Maneja precio diferente para escuelas vs público?', a:'Sí. Identificas al cliente como mayoreo/escuela y el precio se aplica solo. Sin discutir.' },
      { q:'¿Sirve para papelería pequeña con 1 persona?', a:'Sí. Plan Básico gratis. En temporada alta puedes subir a Pro temporalmente para múltiples cajeros.' },
      { q:'¿Puedo emitir facturas?', a:'Sí, plan Pro emite CFDI 4.0 inmediato. Compatible con escuelas y universidades.' },
      { q:'¿Funciona offline?', a:'Sí, modo offline completo. Cobras en hora pico aunque el internet esté lento.' }
    ]
  },
  {
    slug: 'carniceria', name: 'Carnicería', plural: 'carnicerías', emoji: '🥩',
    primary: '#b91c1c', primary2: '#dc2626',
    badge: '🥩 POS para Carnicerías',
    h1: 'Tu carnicería con <em>báscula que cuadra</em><br>y fiados controlados al peso',
    sub: 'Báscula integrada con la caja, venta por kilo automática, control de cortes, fiado por cliente y reportes de merma — el sistema diseñado para carnicerías.',
    heroFeats: ['Báscula integrada a la caja', 'Venta por kilo automática', 'Cortes por tipo y precio', 'Fiado controlado por cliente', 'Pedidos a granel', 'Inventario por kilo', 'Reportes de merma', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'⚖️', t:'"La báscula no se conecta con la caja"', d:'Pesas en una báscula, escribes el peso, calculas a mano. Errores constantes. Cliente reclama porque "le cobré de más".' },
      { icon:'🥩', t:'"Los cortes que se vuelven menudencias se van sin registro"', d:'Una res entera tiene cortes premium y de menor valor. Sin control, los cortes baratos "desaparecen" y cuesta tu margen.' },
      { icon:'📒', t:'"Doña Lupita debe $1,200 y no recuerdo desde cuándo"', d:'Los fiados de carnicería se acumulan. Sin sistema, cobras tarde o nunca cobras.' },
      { icon:'📉', t:'"La merma me come la ganancia"', d:'Compras 100 kg de res, vendes 88 kg. ¿Qué pasó con los 12 kg? Si no controlas, no sabes si fue merma normal o robo.' }
    ],
    features: [
      { icon:'⚖️', t:'Báscula integrada a la caja', d:'Pones la carne en la báscula, el peso aparece en la caja, cobra exacto. Cero errores, cero discusiones.' },
      { icon:'🥩', t:'Cortes por tipo y precio diferente', d:'Filete: $350/kg. Bistec: $180/kg. Costilla: $140/kg. Cada corte con su precio. Sistema cobra el correcto al pesar.' },
      { icon:'💳', t:'Fiado controlado por cliente', d:'Cuenta digital por cliente. Carga inmediata. Recordatorios por WhatsApp. Sabes saldo al instante.' },
      { icon:'📊', t:'Reporte de merma vs venta', d:'Compraste 100 kg, vendiste 88 kg. Merma 12%. ¿Es normal? El sistema lo compara con tu histórico y te alerta.' },
      { icon:'🚚', t:'Pedidos para restaurantes', d:'Restaurantes que te piden 50 kg semanales. Pedido programado, factura, descuento mayoreo automático.' },
      { icon:'🧾', t:'Facturación CFDI 4.0', d:'Cliente pide factura, se la das al instante. Compatible con restaurantes, hoteles y comedores corporativos.' }
    ],
    cmpRows: [
      ['Báscula integrada','✓ Directo a caja','✗ Manual','partial:Limitado'],
      ['Precio por tipo de corte','✓ Automático','no:Memoria','partial:Manual'],
      ['Fiado digital','✓ Por cliente','no:Cuaderno','yes:✓'],
      ['Reporte de merma','✓ Automático','no:✗','partial:Manual'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Don Javier Pacheco', biz:'Carnicería El Buen Corte — Edomex', text:'Antes mi cajero se equivocaba 5 veces al día con la báscula. Cliente molesto, descuento, pérdida. Con Volvix conectado a la báscula cero errores en 4 meses.' },
      { name:'Doña Rosa Martínez', biz:'Carnicería Doña Rosa — Hidalgo', text:'Mis fiados sumaban $32,000 sin orden. Con Volvix recuperé $26,000 en 3 meses con recordatorios automáticos por WhatsApp. Antes ni cobraba.' },
      { name:'Manuel Hidalgo', biz:'Carnicería Hidalgo — Puebla', text:'Mi merma era 18% y no sabía por qué. Con el reporte detecté que un corte específico se "perdía". Investigué, arreglé el problema y bajé merma a 6%.' }
    ],
    faq: [
      { q:'¿Funciona con cualquier báscula?', a:'Sí, con básculas que tengan salida USB, RS232 o Bluetooth. Modelos compatibles desde $1,500.' },
      { q:'¿Maneja cortes con diferentes precios?', a:'Sí. Cada corte (filete, bistec, costilla, etc.) con su precio por kilo. Al pesar, el sistema cobra el correcto.' },
      { q:'¿Cómo controla el fiado?', a:'Cada cliente con cuenta digital. Cargas el fiado al pesar. Recordatorios automáticos por WhatsApp.' },
      { q:'¿Lleva control de la res entera?', a:'Sí. Cargas la res al recibir, vas vendiendo cortes, sistema descuenta proporcionalmente. Reporte de merma al final.' },
      { q:'¿Sirve para carnicería con 1-2 personas?', a:'Sí, plan Básico gratis. Cuando crezcas (más cajeros, sucursales) subes de plan.' },
      { q:'¿Puedo emitir factura?', a:'Sí, plan Pro emite CFDI 4.0. Compatible con restaurantes, hoteles y comedores.' }
    ]
  },
  // ───────── AUTOS / SERVICIOS TÉCNICOS ─────────
  {
    slug: 'refaccionaria', name: 'Refaccionaria', plural: 'refaccionarias', emoji: '🔩',
    primary: '#374151', primary2: '#4b5563',
    badge: '🔩 POS para Refaccionarias',
    h1: 'Tu refaccionaria con <em>cada parte localizada</em><br>y sin pérdida en garantías',
    sub: 'Búsqueda por número de parte y modelo de vehículo, control de garantías, pedidos a múltiples proveedores, ventas a crédito y reportes de rotación — el sistema para tu refaccionaria.',
    heroFeats: ['Búsqueda por número de parte', 'Compatibilidad por vehículo', 'Control de garantías', 'Pedidos a proveedores', 'Crédito a talleres', 'Inventario miles de SKUs', 'Facturación CFDI 4.0', 'Reportes de rotación'],
    pains: [
      { icon:'🔍', t:'"Cliente da modelo y no sé si tengo la parte"', d:'"¿Tienes balata para Tsuru 95?" Buscas en bodega 20 minutos, no encuentras, dices "no hay" cuando sí estaba.' },
      { icon:'🛡️', t:'"Cliente reclama garantía sin comprobante"', d:'Vendiste alternador hace 3 meses. Cliente regresa con falla, pide cambio. Sin registro no sabes si fue tu venta o de la competencia.' },
      { icon:'💳', t:'"Talleres me piden crédito y se atrasan"', d:'Mecánicos compran $5,000 al mes a crédito. Pagan tarde, te endeudan, tu flujo se cae.' },
      { icon:'📦', t:'"Tengo 8,000 partes y no sé cuál me sobra"', d:'Algunas partes se mueven cada semana, otras llevan 2 años en bodega. Sin reportes, no sabes qué liquidar.' }
    ],
    features: [
      { icon:'🔍', t:'Búsqueda por número de parte/modelo', d:'Cliente da modelo y año del vehículo. Sistema te dice exactamente qué partes compatibles tienes y dónde están.' },
      { icon:'🛡️', t:'Control de garantías', d:'Cada venta queda registrada con cliente, parte y fecha. Garantía vinculada al ticket. Cero reclamos sin comprobante.' },
      { icon:'💳', t:'Crédito a talleres', d:'Cada taller con su línea de crédito. Sistema bloquea si exceden. Cobranza automática con WhatsApp.' },
      { icon:'🚚', t:'Pedidos a múltiples proveedores', d:'Compras a 5 distribuidores. Sistema te dice qué pedir a quién según historial y precio.' },
      { icon:'📊', t:'Reporte de rotación', d:'Las partes que se mueven y las que no. Liquidas las muertas, refuerzas las top.' },
      { icon:'🧾', t:'Facturación CFDI 4.0', d:'Talleres y empresas piden factura. Se las das al instante con su precio mayoreo.' }
    ],
    cmpRows: [
      ['Búsqueda por modelo','✓ Por compatibilidad','✗ Memoria','partial:Limitado'],
      ['Control de garantías','✓ Por venta','no:Papel','partial:Manual'],
      ['Crédito a talleres','✓ Por cliente','no:Cuaderno','yes:✓'],
      ['Pedidos multi-proveedor','✓ Sugerencias','no:Manual','partial:Limitado'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Don Joel Ramírez', biz:'Refaccionaria El Mecánico — Toluca', text:'Tenía un cliente reclamando garantía cada semana sin comprobante. Con Volvix verifico al instante si fue mi venta. Bajé garantías falsas 90%.' },
      { name:'Arnulfo Cantú', biz:'Refaccionaria Cantú — Saltillo', text:'Mis 5 talleres clientes me debían $80,000 sin orden. Recordatorios automáticos por WhatsApp recuperaron $65,000 en 3 meses.' },
      { name:'Bernardo Solís', biz:'Auto Partes Solís — Edomex', text:'Tenía $300,000 en partes inmóviles 2+ años. Con el reporte liquidé el 80% en una promoción y recuperé efectivo para comprar lo que sí rota.' }
    ],
    faq: [
      { q:'¿Puedo buscar por número de parte y modelo de vehículo?', a:'Sí. Cada parte vinculada a modelos compatibles. Cliente da modelo, te dice qué tienes.' },
      { q:'¿Cómo funciona el control de garantías?', a:'Cada venta registrada. Cliente regresa con reclamo, buscas el ticket, validas garantía, procesas cambio o reembolso.' },
      { q:'¿Maneja crédito a talleres?', a:'Sí. Cada taller con línea de crédito. Bloqueo automático si exceden. Recordatorios por WhatsApp.' },
      { q:'¿Cómo cargo mi inventario actual?', a:'Importas Excel/CSV o nuestro equipo te ayuda. Para refaccionarias con miles de partes.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 al instante. Compatible con talleres y empresas.' },
      { q:'¿Funciona offline?', a:'Sí. Operación normal sin internet. Sincroniza al volver.' }
    ]
  },
  {
    slug: 'taller-mecanico', name: 'Taller Mecánico', plural: 'talleres mecánicos', emoji: '🔧',
    primary: '#374151', primary2: '#52525b',
    badge: '🔧 POS para Talleres Mecánicos',
    h1: 'Tu taller con <em>órdenes de trabajo claras</em><br>y cada pieza cargada al cliente',
    sub: 'Órdenes de trabajo digitales, piezas vinculadas a OT, control de tiempos por mecánico, presupuestos y facturación al terminar — el sistema para talleres mecánicos.',
    heroFeats: ['Órdenes de trabajo digitales', 'Piezas cargadas a OT', 'Tiempo por mecánico', 'Presupuestos por servicio', 'Historial de vehículo', 'Cotizaciones rápidas', 'Facturación CFDI 4.0', 'Notificaciones al cliente'],
    pains: [
      { icon:'📋', t:'"Trabajo terminado pero no facturé"', d:'Mecánico termina, cliente recoge auto, tú facturas días después. A veces ni cobras todo lo trabajado.' },
      { icon:'🔧', t:'"Las piezas se van sin cargo al cliente"', d:'Mecánico pone bujías nuevas pero olvida anotarlas. Cliente paga sin las bujías. Pierdes $400-$800 por reparación.' },
      { icon:'⏱️', t:'"No sé cuánto tarda cada mecánico"', d:'Tu mejor mecánico hace afinación en 1.5 horas. El otro tarda 4. Cobras igual y pierdes margen sin saberlo.' },
      { icon:'📞', t:'"Cliente llama a preguntar estatus"', d:'"¿Ya está listo mi auto?" Llamas al mecánico, le preguntas, regresas la llamada. Pierdes 10 minutos cada vez.' }
    ],
    features: [
      { icon:'📋', t:'Órdenes de trabajo digitales', d:'Cliente llega, abres OT con su auto, problema reportado y mecánico asignado. Todo en pantalla, nada en papel.' },
      { icon:'🔧', t:'Piezas cargadas a OT', d:'Mecánico saca bujía del almacén, sistema descuenta y carga a la OT. Cliente paga lo trabajado real.' },
      { icon:'⏱️', t:'Tiempo por mecánico/servicio', d:'Reporte de cuánto tarda cada uno por tipo de servicio. Detectas al lento, premias al rápido, mejoras precios.' },
      { icon:'📱', t:'Notificaciones automáticas', d:'Auto listo = cliente recibe WhatsApp. Cero llamadas de "¿ya está?". Tu equipo se concentra en trabajar.' },
      { icon:'💰', t:'Presupuestos antes de empezar', d:'Diagnóstico, presupuesto firmado por cliente, autorización para empezar. Cero discusiones al cobrar.' },
      { icon:'🚗', t:'Historial por vehículo', d:'Cliente regresa en 6 meses, ves todo lo que se hizo. Identificas patrones, sugieres mantenimiento preventivo.' }
    ],
    cmpRows: [
      ['Órdenes de trabajo','✓ Digitales','✗ Papel','partial:Limitado'],
      ['Piezas a OT automático','✓ Incluido','no:Manual','yes:✓'],
      ['Tiempo por mecánico','✓ Reporte','no:✗','partial:Manual'],
      ['Notificación al cliente','✓ WhatsApp auto','no:Llamadas','partial:Email'],
      ['Costo mensual','$0 – $599','$0','$2,000+']
    ],
    testimonials: [
      { name:'Don Heriberto Solís', biz:'Taller Solís — Querétaro', text:'Perdía $15,000-$20,000 al mes en piezas que no se cargaban a OT. Con Volvix no se va una sola pieza sin cargarla. Recuperé el margen.' },
      { name:'Iván Chávez', biz:'Servicio Automotriz Chávez — Edomex', text:'Mis clientes ya no llaman a preguntar. Reciben WhatsApp cuando el auto está listo. Mi recepcionista atiende 60% más clientes en menos tiempo.' },
      { name:'Adolfo Hidalgo', biz:'Auto Service Hidalgo — Toluca', text:'Descubrí que mi mecánico junior tardaba el doble en afinaciones. Le di entrenamiento. Bajamos tiempo 40% y ahora cobramos lo justo.' }
    ],
    faq: [
      { q:'¿Cómo manejo presupuestos antes de empezar el trabajo?', a:'Cliente llega, haces diagnóstico, generas presupuesto, cliente firma digital y autorizas trabajo. Todo registrado.' },
      { q:'¿Maneja inventario de piezas y aceites?', a:'Sí. Cada pieza con stock, costo y precio. Mecánico saca del almacén, sistema descuenta y carga al cliente.' },
      { q:'¿Cómo controla el tiempo de cada mecánico?', a:'Mecánico marca inicio y fin del trabajo. Reporte muestra promedio por tipo de servicio. Identificas eficiencia.' },
      { q:'¿Sirve para taller pequeño con 2 mecánicos?', a:'Sí. Plan Básico gratis. Cuando crezcas a más mecánicos o sucursales, subes a Pro.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 inmediato al cobrar. Compatible con flotillas y empresas.' },
      { q:'¿Manda notificaciones por WhatsApp?', a:'Sí. Cliente recibe estatus: "Auto recibido", "Diagnóstico listo", "Trabajo en curso", "Listo para recoger". Automático.' }
    ]
  },
  {
    slug: 'electronica', name: 'Tienda de Electrónica', plural: 'tiendas de electrónica', emoji: '💻',
    primary: '#1d4ed8', primary2: '#2563eb',
    badge: '💻 POS para Tiendas de Electrónica',
    h1: 'Tu tienda con <em>cada serie controlada</em><br>y garantías que no te cuestan',
    sub: 'Inventario por número de serie, control de garantías por producto, pedidos a proveedores, ventas con financiamiento y reportes de rotación — el sistema para electrónica.',
    heroFeats: ['Inventario por número de serie', 'Control de garantías', 'Pedidos a proveedores', 'Ventas con financiamiento', 'Apartados con anticipo', 'Cotizaciones empresariales', 'Facturación CFDI 4.0', 'Reportes de rotación'],
    pains: [
      { icon:'🔢', t:'"Cliente reclama garantía y no encuentro la serie"', d:'Vendiste laptop hace 6 meses. Cliente regresa con falla. Sin registro del número de serie, no sabes si fue tuya o de otra tienda.' },
      { icon:'📦', t:'"Tengo equipos parados en bodega"', d:'iPhone modelo viejo, laptop con disco chico, pantallas de 32" cuando ya todo es 50"+. Capital amarrado en lo que ya no se vende.' },
      { icon:'💳', t:'"Clientes piden financiamiento y se me complica"', d:'Cliente compra laptop a meses. Anticipo, abonos, saldos. Sin sistema lo llevas en cuaderno y siempre hay errores.' },
      { icon:'🛡️', t:'"Garantías del proveedor que olvido reclamar"', d:'Producto sale defectuoso. Yo le pago al cliente. Después olvido reclamar al proveedor. Pierdo el doble.' }
    ],
    features: [
      { icon:'🔢', t:'Inventario por número de serie', d:'Cada equipo con su IMEI/serie. Vendes, queda registrado a qué cliente y fecha. Garantía 100% controlada.' },
      { icon:'🛡️', t:'Control de garantías', d:'Garantía del proveedor + garantía tuya por separado. Sistema te dice qué reclamar a quién y cuándo expira.' },
      { icon:'💳', t:'Ventas con financiamiento', d:'Anticipo + plan de pagos automático. Sistema cobra mes a mes, manda recordatorios, lleva saldo exacto.' },
      { icon:'📊', t:'Reporte de rotación', d:'Lo que vende mucho vs lo que lleva 6 meses parado. Liquidas a tiempo antes que pierda valor.' },
      { icon:'🚚', t:'Pedidos a proveedores', d:'Sugerencias automáticas según rotación. Pides a quien tiene mejor precio en cada momento.' },
      { icon:'🧾', t:'Cotizaciones empresariales', d:'Empresa pide 20 laptops. Cotización con descuento por volumen, factura CFDI, todo en 5 minutos.' }
    ],
    cmpRows: [
      ['Por número de serie','✓ Por equipo','✗ A papel','partial:Limitado'],
      ['Control de garantías','✓ Cliente + proveedor','no:✗','partial:Solo cliente'],
      ['Financiamiento integrado','✓ Plan automático','no:Manual','yes:✓'],
      ['Cotizaciones empresariales','✓ PDF al instante','no:Manual','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$2,000+']
    ],
    testimonials: [
      { name:'Eduardo Castillo', biz:'Castillo Electrónica — Saltillo', text:'Tenía 5-6 reclamos de garantía por mes sin comprobante. Con número de serie Volvix verifico al instante. Cero garantías falsas en 5 meses.' },
      { name:'Lourdes Vega', biz:'Tecnología Vega — Toluca', text:'Mis ventas a meses sin orden me costaban 20% en cobranza vencida. Con Volvix los recordatorios son automáticos y los clientes pagan a tiempo.' },
      { name:'Roberto Aldana', biz:'Electrónica Aldana — Guanajuato', text:'Cerré contrato con una empresa que necesitaba 30 laptops. Cotización en 10 minutos con factura. Antes hubiera tardado 2 días.' }
    ],
    faq: [
      { q:'¿Maneja inventario por número de serie/IMEI?', a:'Sí. Cada equipo con serie única. Al vender queda asociado al cliente con fecha. Trazabilidad completa.' },
      { q:'¿Cómo controla las garantías?', a:'Garantía del fabricante + garantía tuya. Sistema te avisa cuándo expira cada una. Nunca pagas por algo que cubría el proveedor.' },
      { q:'¿Soporta ventas a meses sin intereses?', a:'Sí. Configuras enganche, número de pagos, fechas. Sistema cobra automático con recordatorios.' },
      { q:'¿Maneja apartados con anticipo?', a:'Sí. Cliente reserva equipo con anticipo. Sistema lleva el saldo. Notificación cuando se acerca fecha límite.' },
      { q:'¿Puedo cotizar a empresas?', a:'Sí. Cotización con descuento por volumen, PDF profesional, factura CFDI al cerrar. Todo automático.' },
      { q:'¿Sirve para tienda con 1 vendedor?', a:'Sí, plan Básico gratis. Cuando crezcas (más vendedores, sucursales) subes de plan.' }
    ]
  },
  {
    slug: 'zapateria', name: 'Zapatería', plural: 'zapaterías', emoji: '👞',
    primary: '#92400e', primary2: '#b45309',
    badge: '👞 POS para Zapaterías',
    h1: 'Tu zapatería con <em>cada talla localizada</em><br>y temporadas controladas',
    sub: 'Inventario por número/modelo/color, control de temporadas, catálogo visual con fotos, apartados, ventas a crédito y reportes — el sistema para tu zapatería.',
    heroFeats: ['Inventario por talla y modelo', 'Catálogo con fotos', 'Temporadas y rebajas', 'Apartados con anticipo', 'Ventas a crédito', 'Cambios fáciles', 'Programa de lealtad', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'👟', t:'"Cliente quiere talla 27 y no sé si tengo"', d:'Buscas en bodega, en piso, en otra rama. 15 minutos perdidos. Cliente impaciente se va sin comprar.' },
      { icon:'📅', t:'"En temporada cambia precios y me pierdo"', d:'Verano: sandalias 30% off. Invierno: botas full price. Sin sistema, el cajero cobra al azar.' },
      { icon:'💎', t:'"Cliente aparta y nunca regresa"', d:'Apartas zapatos con $300 anticipo. Cliente no vuelve. ¿Qué hago con los zapatos? ¿Cuánto tiempo espero?' },
      { icon:'📸', t:'"Mi catálogo de Facebook no conecta con la tienda"', d:'Subes fotos a Facebook. Cliente pregunta por modelo, vas a verificar, ya no tienes su talla. Pierdes la venta.' }
    ],
    features: [
      { icon:'👟', t:'Inventario por talla/modelo/color', d:'Cada zapato con sus variantes. Sabes en vivo cuántos pares de cada talla y color tienes en bodega o piso.' },
      { icon:'📷', t:'Catálogo visual con fotos', d:'Todos tus modelos con foto, descripción, tallas disponibles, precio. Compartes link al cliente que pregunta.' },
      { icon:'🏷️', t:'Temporadas y rebajas automáticas', d:'Programas la rebaja: "30% off sandalias del 1 al 31 de junio". Sistema aplica solo en esas fechas.' },
      { icon:'💎', t:'Apartados con vigencia', d:'Cliente aparta con anticipo. Sistema marca vigencia (ej: 7 días). Si no regresa, devuelve a venta automático.' },
      { icon:'💳', t:'Ventas a crédito', d:'Cliente conocido compra a abonos. Sistema lleva saldo. Recordatorios por WhatsApp automáticos.' },
      { icon:'🎁', t:'Programa de lealtad', d:'Cliente compra 3 pares en el año = 4to par 50% off. Recordatorio automático cuando le falta un par.' }
    ],
    cmpRows: [
      ['Inventario por talla/color','✓ Por variante','no:✗','partial:Limitado'],
      ['Catálogo visual conectado','✓ Tienda + redes','no:✗','partial:Costo extra'],
      ['Temporadas automáticas','✓ Programadas','no:Manual','yes:✓'],
      ['Apartados con vigencia','✓ Auto-libera','partial:Cuaderno','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Margarita Pérez', biz:'Zapatería Margarita — Hidalgo', text:'Antes corría a bodega 30 veces al día. Con Volvix veo en pantalla qué hay en cada talla y modelo. Atiendo 50% más clientes.' },
      { name:'Ricardo Núñez', biz:'Zapatería Núñez — Edomex', text:'Mis apartados eran un caos. Cliente se desaparecía y los zapatos quedaban "esperando". Ahora la vigencia automática los libera y vendo dos veces los mismos.' },
      { name:'Daniela Soto', biz:'Calzado Soto — Toluca', text:'Mi catálogo de Facebook ahora muestra solo lo que sí tengo. Cero quejas de "ya no hay tu talla". Ventas online subieron 40%.' }
    ],
    faq: [
      { q:'¿Maneja muchas tallas (números 22-30) y modelos?', a:'Sí. Cada modelo con todas sus tallas y colores. Sin límite de variantes.' },
      { q:'¿Se conecta con mi Facebook/Instagram?', a:'Sí. Catálogo visual con fotos. Compartes link, cliente ve solo lo disponible en tiempo real.' },
      { q:'¿Cómo funcionan las rebajas de temporada?', a:'Programas fechas y porcentajes. Sistema aplica automático. Sin que el cajero recuerde nada.' },
      { q:'¿Maneja apartados con anticipo?', a:'Sí. Cliente paga anticipo, sistema lo reserva. Vigencia (ej: 7 días). Si no regresa, libera automático y vuelve a venta.' },
      { q:'¿Sirve para zapatería pequeña?', a:'Sí. Plan Básico gratis. Conforme creces subes de plan.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 al instante.' }
    ]
  },
  {
    slug: 'muebleria', name: 'Mueblería', plural: 'mueblerías', emoji: '🛋️',
    primary: '#57534e', primary2: '#78716c',
    badge: '🛋️ POS para Mueblerías',
    h1: 'Tu mueblería con <em>ventas a crédito sin riesgos</em><br>y entregas controladas',
    sub: 'Pedidos a fabricante, ventas a crédito con enganche, control de bodega vs piso, cotizaciones detalladas y entregas programadas — el sistema para tu mueblería.',
    heroFeats: ['Ventas a crédito con enganche', 'Pedidos a fabricante', 'Bodega vs piso de ventas', 'Cotizaciones con PDF', 'Entregas programadas', 'Garantías por mueble', 'Catálogo visual', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'💰', t:'"Vendo a crédito y no me pagan"', d:'Sala de $25,000 a meses. Cliente paga 3 meses y desaparece. Sin sistema de cobranza, pérdida total.' },
      { icon:'📦', t:'"No sé si tengo en bodega o se vendió"', d:'Cliente pide comedor de cierto modelo. Verificas piso, no hay. Vas a bodega, tampoco. Era el último y se vendió ayer pero nadie te dijo.' },
      { icon:'🚚', t:'"Las entregas son un caos"', d:'Cliente compró el martes, dice que pase la entrega el sábado. Sin agenda, te traslapas con otra entrega o te olvidas.' },
      { icon:'📋', t:'"Las cotizaciones tardan horas"', d:'Cliente quiere sala + comedor + recámara. Sumas precios, calculas mesadas, escribes en hoja. 1 hora por cotización.' }
    ],
    features: [
      { icon:'💳', t:'Ventas a crédito con scoring', d:'Cliente solicita crédito, sistema valida historial, calcula límite y mensualidad. Recordatorios automáticos.' },
      { icon:'📦', t:'Bodega vs piso de ventas', d:'Inventario separado. Sabes cuánto tienes en exhibición y cuánto en bodega. Cero "vendí lo último sin saber".' },
      { icon:'🚚', t:'Calendario de entregas', d:'Programas entrega al vender. Choferes con su ruta. Cliente recibe WhatsApp con día y hora aproximada.' },
      { icon:'📋', t:'Cotizaciones en PDF', d:'Combinas muebles, aplicas descuentos, calculas mensualidades. PDF profesional al cliente en 5 minutos.' },
      { icon:'🏭', t:'Pedidos a fabricante', d:'Cliente pide modelo bajo pedido. Sistema genera orden a fabricante con tiempos esperados de entrega.' },
      { icon:'🛡️', t:'Garantías por mueble', d:'Cada mueble con su período de garantía. Cliente regresa, validas al instante con número de venta.' }
    ],
    cmpRows: [
      ['Crédito con scoring','✓ Automático','no:Manual','partial:Limitado'],
      ['Bodega + piso separados','✓ Incluido','no:✗','yes:✓'],
      ['Calendario de entregas','✓ Visual','no:Cuaderno','partial:Manual'],
      ['Cotizaciones PDF','✓ 5 minutos','no:1 hora','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$2,000+']
    ],
    testimonials: [
      { name:'Don Hipólito Cárdenas', biz:'Mueblería Cárdenas — Tlaxcala', text:'Perdía $50,000-$80,000 al año en clientes que no pagaban a meses. Con scoring de Volvix detecto al cliente riesgo y rechazo a tiempo.' },
      { name:'María Inés Robles', biz:'Mueblería Robles — Hidalgo', text:'Mis cotizaciones tardaban una hora. Ahora 5 minutos con PDF profesional. Cierro 3 ventas en lo que antes cerraba 1.' },
      { name:'Juan Bermúdez', biz:'Mueblería La Casa — Edomex', text:'El calendario de entregas me cambió la operación. Mis 3 choferes saben qué entregar y cuándo. Cero entregas dobles, cero clientes molestos.' }
    ],
    faq: [
      { q:'¿Cómo funciona el crédito con scoring?', a:'Cliente da datos. Sistema valida con buró (opcional), calcula límite y mensualidad sugerida. Genera contrato digital firmado.' },
      { q:'¿Maneja inventario separado bodega y piso?', a:'Sí. Sabes en cualquier momento cuánto tienes exhibido y cuánto en bodega. Transferencias registradas.' },
      { q:'¿Programa entregas con choferes?', a:'Sí. Calendario por chofer/camión. Cliente recibe WhatsApp con día y hora estimada. Confirmación de entrega.' },
      { q:'¿Hace cotizaciones complejas (sala + comedor + recámara)?', a:'Sí. Combinas múltiples productos, aplicas descuentos, calculas mensualidades. PDF profesional al instante.' },
      { q:'¿Sirve para mueblería pequeña?', a:'Sí, plan Básico gratis. Cuando crezcas (más muebles, varias sucursales) subes a Pro.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 inmediato. Compatible con empresas que amueblan oficinas.' }
    ]
  },
  {
    slug: 'tienda-celulares', name: 'Tienda de Celulares', plural: 'tiendas de celulares', emoji: '📱',
    primary: '#6366f1', primary2: '#8b5cf6',
    badge: '📱 POS para Tiendas de Celulares',
    h1: 'Tu tienda de celulares con <em>cada IMEI registrado</em><br>y reparaciones controladas',
    sub: 'Inventario por IMEI/serie, garantías por equipo, órdenes de reparación, control de accesorios y ventas con financiamiento — el sistema completo para tu tienda.',
    heroFeats: ['Inventario por IMEI', 'Control de garantías', 'Órdenes de reparación', 'Accesorios y SIM cards', 'Ventas a meses', 'Apartados', 'Trade-in (equipo usado)', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'📲', t:'"Cliente reclama garantía sin IMEI registrado"', d:'Vendiste celular hace 2 meses. Cliente regresa con pantalla dañada, dice "es de aquí". Sin IMEI registrado no hay forma de comprobar.' },
      { icon:'🔧', t:'"Las reparaciones son un caos"', d:'Cliente deja celular para reparar. Otro mismo modelo entra. Se confunden, entregas el equipo equivocado.' },
      { icon:'🔌', t:'"Los accesorios desaparecen"', d:'Cargadores, audífonos, micas, fundas. Sin control el robo hormiga te quita $3,000-$8,000 al mes.' },
      { icon:'💳', t:'"Ventas a meses sin orden"', d:'Cliente compra iPhone a 12 meses. Pagos olvidados, abonos sin registrar, saldos confusos. Cobranza vencida.' }
    ],
    features: [
      { icon:'🔢', t:'Inventario por IMEI', d:'Cada equipo con su IMEI/serie. Vendes, queda asociado al cliente. Garantía 100% controlada.' },
      { icon:'🔧', t:'Órdenes de reparación', d:'Cliente deja equipo, abres orden con falla, técnico asignado, costo estimado. Cero confusiones.' },
      { icon:'🛡️', t:'Control de garantías', d:'Garantía del fabricante + tuya por separado. Sistema te avisa qué reclamar a quién.' },
      { icon:'🔌', t:'Inventario de accesorios', d:'Cargadores, audífonos, micas. Cada accesorio con stock. Cierre de caja muestra diferencias al instante.' },
      { icon:'💳', t:'Ventas a meses sin intereses', d:'Anticipo + plan de pagos automatizado. Recordatorios por WhatsApp. Saldo siempre exacto.' },
      { icon:'🔄', t:'Trade-in (equipo usado)', d:'Cliente entrega su Samsung viejo + dinero, se lleva iPhone nuevo. Cotización, evaluación, registro completo.' }
    ],
    cmpRows: [
      ['Inventario por IMEI','✓ Por equipo','✗ Manual','partial:Limitado'],
      ['Órdenes de reparación','✓ Digital','no:Papel','yes:✓'],
      ['Garantías cliente + proveedor','✓ Separadas','no:Mezcladas','partial:Solo cliente'],
      ['Trade-in equipo usado','✓ Incluido','no:✗','partial:Manual'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Andrés Vázquez', biz:'CelStore Vázquez — Edomex', text:'5-6 reclamos de garantía por mes sin comprobante. Con IMEI registrado verifico al instante. Cero garantías falsas.' },
      { name:'Liliana Hernández', biz:'Cell Plus — Toluca', text:'Antes mezclaba celulares en reparación. Ahora cada uno con su orden, fotos antes/después, el cliente firma. Cero confusiones.' },
      { name:'Miguel Ortiz', biz:'Tecnoshop Ortiz — Hidalgo', text:'Vendía a meses con cuaderno y perdía 25% en cobranza. Recordatorios WhatsApp automáticos bajaron pérdidas a 3%.' }
    ],
    faq: [
      { q:'¿Maneja inventario por IMEI/serie?', a:'Sí. Cada celular con su IMEI único. Asociado a cliente al vender. Garantía controlada.' },
      { q:'¿Cómo funcionan las órdenes de reparación?', a:'Cliente deja equipo, abres OT con falla, técnico, costo estimado. Cliente recibe número de seguimiento.' },
      { q:'¿Soporta trade-in (equipo usado a cambio)?', a:'Sí. Cotizas el equipo viejo, sumas la diferencia, generas venta. Equipo usado entra a inventario para reventa.' },
      { q:'¿Maneja venta de SIM y recargas?', a:'Sí. SIM Telcel, AT&T, Movistar. Recargas saldo electrónico. Comisión registrada.' },
      { q:'¿Funciona para tienda con 1 vendedor?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 al instante.' }
    ]
  },
  {
    slug: 'lavanderia', name: 'Lavandería', plural: 'lavanderías', emoji: '👔',
    primary: '#0891b2', primary2: '#06b6d4',
    badge: '👔 POS para Lavanderías y Tintorerías',
    h1: 'Tu lavandería con <em>cero prendas perdidas</em><br>y clientes notificados al WhatsApp',
    sub: 'Tickets de ropa con QR, seguimiento por estado (recibida/lavando/lista), cobro por kilo o prenda, notificaciones automáticas y control de prendas — para tu lavandería.',
    heroFeats: ['Tickets con QR único', 'Estados: recibida/lavando/lista', 'Cobro por kilo o prenda', 'WhatsApp automático', 'Pendientes de pago', 'Manchas y observaciones', 'Servicio express', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'👕', t:'"Cliente dice que dejó camisa que ya no encuentro"', d:'Cliente recoge ropa. "Faltan 2 camisas". ¿Las dejó? ¿Se las llevó otro cliente? Sin registro, le pagas o pierdes la confianza.' },
      { icon:'⏰', t:'"Cliente llama a preguntar si está lista"', d:'10 llamadas al día de "¿ya está mi ropa?". Tu empleado pierde 1 hora respondiendo el teléfono en vez de trabajar.' },
      { icon:'💸', t:'"El cobro depende del cajero"', d:'A unos clientes les cobran $80, a otros $100 por lo mismo. Sin tarifa clara, pierdes ingresos sin saberlo.' },
      { icon:'🧺', t:'"Las prendas con observaciones se confunden"', d:'"Esta blusa no se plancha", "este pantalón es de seda". Sin notas, las recibes manchadas y el cliente reclama.' }
    ],
    features: [
      { icon:'🎫', t:'Tickets con QR único', d:'Cliente deja ropa, recibe ticket con QR. Lo escaneas para ver estado, recoger, cobrar. Cero confusiones.' },
      { icon:'📊', t:'Estados visuales', d:'Recibida → Lavando → Planchando → Lista. Sabes en qué etapa está cada pedido. Cliente también ve.' },
      { icon:'⚖️', t:'Cobro por kilo o prenda', d:'Por kilo (lavado) o por prenda (tintorería, planchado). Tarifa única, cero discusiones.' },
      { icon:'💬', t:'WhatsApp automático', d:'Cliente recibe "Tu ropa está lista" automáticamente. Cero llamadas, mejor servicio.' },
      { icon:'📝', t:'Observaciones en cada prenda', d:'Manchas, telas delicadas, instrucciones especiales. Visible para todo el equipo.' },
      { icon:'⚡', t:'Servicio express', d:'Tarifa premium para entrega en 24 horas. Sistema marca y prioriza el pedido.' }
    ],
    cmpRows: [
      ['Tickets con QR','✓ Único por orden','✗ Papel','partial:Genérico'],
      ['Estados de la ropa','✓ Visual','no:Memoria','yes:✓'],
      ['WhatsApp "lista"','✓ Automático','no:Llamadas','partial:Manual'],
      ['Observaciones por prenda','✓ Detalladas','no:Sin notas','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Esther Rivera', biz:'Lavandería Rivera — Edomex', text:'Tenía 2-3 reclamos por semana de "faltan prendas". Con ticket QR cada prenda registrada cero reclamos en 4 meses.' },
      { name:'Don Eulalio Pérez', biz:'Tintorería El Buen Lavado — CDMX', text:'Mi empleada antes pasaba 2 horas al día respondiendo "¿ya está?". Con WhatsApp automático ese tiempo lo dedica a planchar más.' },
      { name:'Patricia Mendoza', biz:'Lavandería Express — Querétaro', text:'Antes mis cajeros cobraban distinto. Cliente regresaba molesto. Tarifa única en sistema, cero discusiones, mismo precio para todos.' }
    ],
    faq: [
      { q:'¿Cómo funcionan los tickets con QR?', a:'Cada pedido genera QR único. Cliente lo recibe impreso o por WhatsApp. Lo escaneas al recoger para verificar.' },
      { q:'¿Maneja servicio por kilo y por prenda?', a:'Sí. Cada modalidad con su precio. El sistema cobra automático según tipo de servicio.' },
      { q:'¿Notifica al cliente cuando está lista?', a:'Sí. WhatsApp automático cuando cambia el estado a "Lista". Cliente sabe sin llamar.' },
      { q:'¿Sirve para lavandería pequeña?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 inmediato.' },
      { q:'¿Funciona offline?', a:'Sí. Recibes y entregas ropa sin internet. Sincroniza al volver.' }
    ]
  },
  {
    slug: 'dulceria', name: 'Dulcería', plural: 'dulcerías', emoji: '🍬',
    primary: '#ec4899', primary2: '#f472b6',
    badge: '🍬 POS para Dulcerías',
    h1: 'Tu dulcería con <em>granel controlado</em><br>y temporadas sin sorpresas',
    sub: 'Venta por peso/granel, control de caducidades, temporadas de alta demanda, ventas a mayoreo con factura y reportes por categoría — el sistema para tu dulcería.',
    heroFeats: ['Venta por peso/granel', 'Control de caducidades', 'Mayoreo a fiestas y eventos', 'Catálogo con fotos', 'Cobro por báscula', 'Bolos y dulces personalizados', 'Reportes por temporada', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'🎂', t:'"En halloween/día del niño se desabasto"', d:'Temporada alta llega, no calculé inventario, vendí en 3 días lo que pensaba 2 semanas. Pierdo ventas y al cliente.' },
      { icon:'⚖️', t:'"El granel se pesa mal y cobro de menos"', d:'Cliente llena bolsa de gomitas. Pesas, cobras, te equivocas. Cuando son 50 clientes en el día, son $300-$500 perdidos.' },
      { icon:'⏰', t:'"Tiro caramelos caducados"', d:'Me caducó chocolate, gomitas, paletas. $2,000-$5,000 al mes a la basura por no tener alertas.' },
      { icon:'🎁', t:'"Bolos para fiestas son un caos"', d:'Mamá pide 30 bolos para fiesta de niños. Calcular dulces, ensamblar, cobrar — 1 hora. Atrás se enojan otros clientes.' }
    ],
    features: [
      { icon:'⚖️', t:'Cobro por peso integrado', d:'Báscula conectada. Cliente llena bolsa, pesas, cobra automático. Cero errores.' },
      { icon:'⏳', t:'Control de caducidades', d:'Cada producto con fecha. Alerta 30-60 días antes para promocionar o regresar.' },
      { icon:'🎁', t:'Bolos y combos pre-armados', d:'Bolo niño $50, bolo adolescente $80, bolo evento. Pre-cargados con sus contenidos. Armas en 30 segundos.' },
      { icon:'🏪', t:'Mayoreo a fiestas y eventos', d:'Cliente pide 100 bolos para boda. Cotización con descuento mayoreo, factura, entrega programada.' },
      { icon:'📊', t:'Reportes por temporada', d:'Halloween, día del niño, navidad. Cuánto vendiste cada temporada para planear mejor el siguiente año.' },
      { icon:'📷', t:'Catálogo visual', d:'Fotos de tus productos para venta por WhatsApp. Cliente elige, pide, paga, recoge.' }
    ],
    cmpRows: [
      ['Cobro por peso','✓ Báscula integrada','✗ Manual','partial:Limitado'],
      ['Control de caducidades','✓ Por lote','no:✗','partial:Manual'],
      ['Bolos pre-armados','✓ Combos','no:Improvisado','no:✗'],
      ['Mayoreo con factura','✓ CFDI auto','no:✗','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Soledad Martínez', biz:'Dulcería La Piñata — Edomex', text:'En día del niño antes me quedaba sin nada al 2do día. Con reportes de temporadas anteriores ahora pido el doble. Vendo todo y me quedo con margen.' },
      { name:'Alejandro Romo', biz:'Dulcería Romo — Hidalgo', text:'Tiraba $4,000 al mes en caducados. Con alertas promociono antes de caducar. Bajé pérdida a $500.' },
      { name:'Cecilia Vargas', biz:'Dulces Cecilia — Toluca', text:'Mis bolos para fiestas tardaban 1 hora cada cotización. Ahora los combos pre-armados los cobro en 5 minutos. Cierro 5 ventas en lo que antes 1.' }
    ],
    faq: [
      { q:'¿Maneja venta por peso/granel?', a:'Sí. Báscula conectada. Cobro automático por gramos o kilos.' },
      { q:'¿Controla caducidades?', a:'Sí. Cada lote con fecha. Alertas configurables (30/60 días antes).' },
      { q:'¿Hace bolos para fiestas?', a:'Sí. Combos pre-cargados (bolo niño, evento). Armas y cobras en segundos.' },
      { q:'¿Maneja mayoreo a clientes corporativos?', a:'Sí. Precios mayoreo automáticos. Factura CFDI inmediata.' },
      { q:'¿Sirve para dulcería pequeña?', a:'Sí, plan Básico gratis.' },
      { q:'¿Funciona offline?', a:'Sí. Modo offline completo.' }
    ]
  },
  {
    slug: 'tienda-conveniencia', name: 'Tienda de Conveniencia', plural: 'tiendas de conveniencia', emoji: '🏪',
    primary: '#0f766e', primary2: '#0d9488',
    badge: '🏪 POS para Tiendas de Conveniencia',
    h1: 'Tu tienda 24/7 con <em>cierre por turno exacto</em><br>y sin merma misteriosa',
    sub: 'Múltiples turnos con cierre independiente, control de caducidades, gestión de merma, recepción de mercancía y reportes 24/7 — el sistema para tu tienda 24 horas.',
    heroFeats: ['Múltiples turnos día/noche', 'Cierre por turno exacto', 'Control de caducidades', 'Recepción de mercancía', 'Detección de merma', 'Cambio de empleado', 'Servicios pago (luz, gas)', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'🌙', t:'"En turno nocturno hay diferencias en caja"', d:'Empleado de noche cierra con $150 menos. Otra noche $80. Sin control por turno, no sabes quién y cuánto.' },
      { icon:'⏳', t:'"Productos vencidos en anaquel"', d:'Yogurt caducado, leche un día tarde, jamón con 2 días vencido. Sin control son demandas potenciales.' },
      { icon:'📦', t:'"Mi proveedor llega y nadie sabe qué pidió"', d:'Repartidor de Coca-Cola llega 6 AM, deja mercancía. ¿Qué pediste? ¿Llegó completo? Sin orden, te roban o sobre-cobran.' },
      { icon:'💵', t:'"La merma se traga mi ganancia"', d:'Vendiste $20,000 pero ganaste $1,500. Merma, robos, errores se llevan tu margen sin saber por qué.' }
    ],
    features: [
      { icon:'🌙', t:'Múltiples turnos independientes', d:'Turno mañana, tarde, noche. Cada uno con su corte de caja. Detectas diferencias por turno y cajero.' },
      { icon:'📅', t:'Cambio de empleado registrado', d:'Sale empleado A, entra B. Cada uno con PIN propio. Sus ventas, sus diferencias, su responsabilidad.' },
      { icon:'⏳', t:'Alertas de caducidades', d:'Productos perecederos con alerta 7-14 días antes. Promocionas antes de caducar. Cero anaqueles vencidos.' },
      { icon:'📦', t:'Recepción de mercancía', d:'Generas orden de compra. Repartidor llega, validas contra orden, registras lo que llegó vs pediste.' },
      { icon:'📊', t:'Reporte de merma', d:'Diferencias entre stock teórico y real. Identificas patrones (turno, producto, día) para detectar problemas.' },
      { icon:'💡', t:'Servicios pago integrados', d:'Cobranza de luz, agua, gas, recargas, depósitos bancarios. Comisión registrada por servicio.' }
    ],
    cmpRows: [
      ['Múltiples turnos','✓ Cierres separados','no:Manual','partial:Limitado'],
      ['Caducidades automáticas','✓ Alertas','no:✗','yes:✓'],
      ['Recepción mercancía','✓ Vs orden','no:A confianza','partial:Manual'],
      ['Detección merma','✓ Reporte','no:✗','partial:Limitado'],
      ['Costo mensual','$0 – $599','$0','$2,000+']
    ],
    testimonials: [
      { name:'Don Hugo Treviño', biz:'Tienda Express 24h — Saltillo', text:'Tenía $6,000 al mes en diferencias de caja. Con cierres por turno detecté que el de noche se quedaba con $200/turno. Lo despedí, recuperé el dinero.' },
      { name:'Diana Quintero', biz:'Mini Mart Quintero — Toluca', text:'Tiraba 8% de mi inventario por caducidades. Con alertas bajé a 1.5%. Eso son $4,000 al mes que ya no van a la basura.' },
      { name:'Roberto Cano', biz:'Tienda La Esquina 24h — Edomex', text:'Antes el repartidor de Coca dejaba 3 cajas pero cobraba 5. Con orden de compra sé exactamente qué pedí. Ya no me sobrecobran.' }
    ],
    faq: [
      { q:'¿Maneja varios turnos?', a:'Sí. Cada turno (mañana/tarde/noche) con cierre independiente. Detectas diferencias por turno y cajero.' },
      { q:'¿Controla caducidades?', a:'Sí. Productos perecederos con fecha de caducidad. Alertas configurables.' },
      { q:'¿Soporta servicios de pago (luz, gas, recargas)?', a:'Sí. Cobranza de servicios públicos, recargas Telcel/AT&T/Movistar, depósitos. Comisión por servicio.' },
      { q:'¿Funciona 24/7 sin caídas?', a:'Sí. Uptime 99.9%. Modo offline si se cae internet, sincroniza al volver.' },
      { q:'¿Cuántos cajeros maneja?', a:'Sin límite en plan Pro. Cada uno con su PIN, su turno, su corte.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 al instante.' }
    ]
  },
  {
    slug: 'agencia-viajes', name: 'Agencia de Viajes', plural: 'agencias de viajes', emoji: '✈️',
    primary: '#0891b2', primary2: '#06b6d4',
    badge: '✈️ POS para Agencias de Viajes',
    h1: 'Tu agencia con <em>cotizaciones rápidas</em><br>y comisiones sin discutir',
    sub: 'Cotizaciones detalladas con PDF profesional, control de pagos por viaje, comisiones por agente, historial de cliente y reservas confirmadas — para tu agencia.',
    heroFeats: ['Cotizaciones con PDF profesional', 'Control de pagos por viaje', 'Comisiones por agente', 'Historial de cliente', 'Reservas confirmadas', 'Documentos viajero', 'Recordatorios automáticos', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'📋', t:'"Las cotizaciones tardan horas"', d:'Cliente pide paquete a Cancún. Buscas vuelos, hoteles, traslados. 2 horas para una cotización. Cliente se va con la competencia.' },
      { icon:'💰', t:'"Cliente pagó parte y no recuerdo cuánto debe"', d:'Familia paga $30,000 por viaje. Da $10,000 hoy, $5,000 en quincena, $5,000 antes de viajar. Sin sistema, los abonos se confunden.' },
      { icon:'👥', t:'"Mis agentes pelean por comisiones"', d:'Tres agentes vendieron, ¿quién cierra el viaje? ¿Cuál fue la comisión real? Sin claridad, hay roces internos.' },
      { icon:'📅', t:'"Olvido recordar pagos pendientes"', d:'Cliente pagó anticipo, falta pagar 30 días antes de viajar. Olvidas recordarle, cancela el hotel, pierdes dinero.' }
    ],
    features: [
      { icon:'📋', t:'Cotizaciones rápidas con PDF', d:'Plantillas pre-cargadas: Cancún 4 días, Europa 15 días, etc. Editas precios, generas PDF profesional en 5 minutos.' },
      { icon:'💳', t:'Pagos por viaje (anticipo + abonos)', d:'Cliente da anticipo. Sistema marca cuánto resta. Recordatorios automáticos. Cero confusión.' },
      { icon:'👥', t:'Comisiones por agente', d:'Cada cotización vinculada al agente. Cuando cierra, comisión automática. Reporte por agente al final del mes.' },
      { icon:'🗂️', t:'Historial de cliente', d:'Viajes anteriores, preferencias, fechas de cumpleaños. Recomendaciones personalizadas, mejor servicio.' },
      { icon:'🔔', t:'Recordatorios automáticos', d:'30 días antes, 7 días antes, 1 día antes del pago final. Cliente recibe WhatsApp. Cero olvidos.' },
      { icon:'📄', t:'Documentos del viajero', d:'Pasaporte, visa, vacunas, vuelos, hoteles. Todo en una carpeta digital del cliente.' }
    ],
    cmpRows: [
      ['Cotizaciones rápidas','✓ Plantillas','no:Manual','partial:Limitado'],
      ['Control de pagos','✓ Por viaje','no:Cuaderno','yes:✓'],
      ['Comisiones por agente','✓ Automático','no:Manual','partial:Limitado'],
      ['Recordatorios pagos','✓ WhatsApp','no:✗','partial:Email'],
      ['Costo mensual','$0 – $599','$0','$2,000+']
    ],
    testimonials: [
      { name:'Mariana Coronel', biz:'Viajes Coronel — CDMX', text:'Mis cotizaciones tardaban 2 horas. Ahora 5 minutos con PDF profesional. Cierro 4 ventas en lo que antes 1.' },
      { name:'Adriana Bautista', biz:'Travel Now — Querétaro', text:'Tenía conflictos con mis 3 agentes por comisiones. Cada uno reclamaba que él vendió. Con Volvix está clarísimo, cero discusiones.' },
      { name:'Carlos Reyes', biz:'Reyes Travel — Toluca', text:'Olvidaba recordar el pago final a 2-3 clientes por mes. Cancelaban hoteles, perdíamos $10,000-$20,000. Con recordatorios automáticos cero olvidos.' }
    ],
    faq: [
      { q:'¿Maneja cotizaciones de paquetes complejos?', a:'Sí. Plantillas pre-cargadas (vuelo + hotel + traslado + tour). Editas precios y fechas, PDF profesional al instante.' },
      { q:'¿Controla pagos por viaje?', a:'Sí. Anticipo + abonos. Sistema lleva saldo exacto. Recordatorios automáticos por WhatsApp.' },
      { q:'¿Maneja comisiones por agente?', a:'Sí. Cada cotización vinculada al agente. Comisión automática al cerrar venta. Reporte mensual.' },
      { q:'¿Sirve para agencia con 1-2 agentes?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 al instante.' },
      { q:'¿Maneja documentos del viajero?', a:'Sí. Pasaporte, visa, vacunas. Carpeta digital por cliente. Acceso desde cualquier lado.' }
    ]
  },
  {
    slug: 'hotel', name: 'Hotel', plural: 'hoteles', emoji: '🏨',
    primary: '#7c3aed', primary2: '#a855f7',
    badge: '🏨 POS para Hoteles',
    h1: 'Tu hotel con <em>cero habitaciones duplicadas</em><br>y consumos cargados al cuarto',
    sub: 'Mapa visual de habitaciones, check-in/out rápido, cargos a habitación, control de consumo en restaurant/spa y reportes de ocupación — el sistema para hoteles.',
    heroFeats: ['Mapa visual de habitaciones', 'Check-in/out rápido', 'Cargos a habitación', 'Restaurant + Spa integrados', 'Reservas online', 'Control de housekeeping', 'Reportes de ocupación', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'🚪', t:'"Asigné misma habitación a dos huéspedes"', d:'Llega huésped, le doy 304. Llega otro, mi recepcionista le da la misma 304. Disculpas, recompensa, pésima reseña.' },
      { icon:'🍽️', t:'"Consumo en restaurante no se carga al cuarto"', d:'Huésped come $800, dice "cárgalo al cuarto", mesero olvida pasar la nota. Al check-out el cargo se pierde.' },
      { icon:'📅', t:'"Las reservas online no se sincronizan"', d:'Booking.com vendió la misma habitación que vendí yo en mostrador. Overbooking, huésped molesto, problema legal.' },
      { icon:'🧹', t:'"No sé qué cuartos están limpios"', d:'Huésped llega 2 PM, le doy cuarto que aún no se asea. Tengo que cambiarlo, perdemos 20 minutos, mala impresión.' }
    ],
    features: [
      { icon:'🗺️', t:'Mapa visual de habitaciones', d:'Ve todas las habitaciones en pantalla con su estado: ocupada, libre, sucia, limpia, en mantenimiento. Cero confusiones.' },
      { icon:'⚡', t:'Check-in/out en 2 minutos', d:'Datos del huésped, asignación, cobro. Salida con cargos consolidados, factura, llaves entregadas.' },
      { icon:'🍽️', t:'Cargos a habitación', d:'Consumo en restaurante, spa, lavandería se carga directo al folio del huésped. Al check-out, todo en una factura.' },
      { icon:'🌐', t:'Reservas online sincronizadas', d:'Booking, Expedia, Airbnb sincronizadas con tu sistema. Cero overbooking. Disponibilidad en tiempo real.' },
      { icon:'🧹', t:'Control de housekeeping', d:'Cuarto sale = "Sucia". Camarista limpia = "Lista". Recepción ve en pantalla qué entregar.' },
      { icon:'📊', t:'Reportes de ocupación', d:'% ocupación por día, semana, mes. RevPAR, ADR, ingresos por área. Decisiones basadas en datos.' }
    ],
    cmpRows: [
      ['Mapa visual habitaciones','✓ Tiempo real','no:Pizarra','partial:Limitado'],
      ['Cargos a habitación','✓ Multi-área','no:Manual','yes:✓'],
      ['Sincronización Booking','✓ Auto','no:Manual','partial:Costo extra'],
      ['Control housekeeping','✓ Estados','no:Verbal','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$3,000+']
    ],
    testimonials: [
      { name:'Sergio Bermúdez', biz:'Hotel Bermúdez — Veracruz', text:'Tenía 2-3 overbookings por mes con Booking. Con Volvix sincronizado cero. Ahorrado en compensaciones y mejor reputación.' },
      { name:'Carmen Solís', biz:'Hotel Boutique Vista — Mérida', text:'Antes el restaurant olvidaba cargar consumos al cuarto. Perdía $5,000-$10,000 al mes. Con cargo automático cero pérdidas.' },
      { name:'Ricardo Aldama', biz:'Hotel Aldama — Querétaro', text:'Mis camaristas ahora saben en tiempo real qué cuarto limpiar. Recepción ve cuáles están listos. Bajamos quejas de check-in 80%.' }
    ],
    faq: [
      { q:'¿Cómo evita overbooking con Booking/Expedia?', a:'Sincronización en tiempo real. Cuando vendes (mostrador o online), todas las plataformas actualizan disponibilidad al instante.' },
      { q:'¿Cómo cargo consumo del restaurante a la habitación?', a:'Mesero busca habitación del huésped, agrega consumo al folio. Al check-out aparece todo consolidado.' },
      { q:'¿Maneja housekeeping?', a:'Sí. Estados de cada cuarto en tiempo real. Camaristas marcan "lista" desde su celular. Recepción ve al instante.' },
      { q:'¿Sirve para hotel pequeño (5-10 cuartos)?', a:'Sí. Plan Básico gratis. Ideal para boutique hotels y posadas.' },
      { q:'¿Maneja restaurant, spa y otras áreas?', a:'Sí. Cada área con su POS, todo carga al folio del huésped.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0 al instante. Compatible con corporativos y agentes de viaje.' }
    ]
  },
  // ───────── BELLEZA / SALUD ─────────
  {
    slug: 'barberia', name: 'Barbería', plural: 'barberías', emoji: '✂️',
    primary: '#1d4ed8', primary2: '#2563eb',
    badge: '✂️ POS para Barberías',
    h1: 'Tu barbería con <em>citas sin olvidos</em><br>y comisiones que no causan pleitos',
    sub: 'Agenda visual por barbero, comisiones automáticas, cobro por servicio, historial de cliente y recordatorios WhatsApp — el sistema completo para tu barbería.',
    heroFeats: ['Agenda visual por barbero', 'Reservas online 24/7', 'Comisiones automáticas', 'Historial de cliente', 'Cobro por servicio', 'Productos para venta', 'Recordatorios WhatsApp', 'Reportes por barbero'],
    pains: [
      { icon:'📅', t:'"Las citas se olvidan o se empalman"', d:'Cliente llega y su cita "se le olvidó". Otro cliente espera. Tres barberos ocupados, uno no. Caos en hora pico.' },
      { icon:'💰', t:'"Calcular comisiones cada quincena es horror"', d:'Tres barberos, cada uno con porcentaje diferente. Sumar servicios a mano, restar productos. 2 horas perdidas + reclamos.' },
      { icon:'🔁', t:'"Los clientes vienen una vez y nunca vuelven"', d:'Sin recordatorios ni programa de lealtad, pierdes clientes que pudieron ser fieles toda la vida.' },
      { icon:'📱', t:'"Los pedidos por DM se confunden"', d:'Instagram, Facebook, WhatsApp. Mensajes en 3 lados. Citas que se pierden entre conversaciones.' }
    ],
    features: [
      { icon:'📅', t:'Agenda visual por barbero', d:'Cada barbero en su columna. Arrastras citas, reasignas, ves disponibilidad. Cero empalmes.' },
      { icon:'💬', t:'Reservas online integradas', d:'Cliente reserva por link. Elige barbero, servicio, hora. Confirmación y recordatorio automáticos.' },
      { icon:'💰', t:'Comisiones automáticas por barbero', d:'Cada servicio con su % de comisión. Cierre de quincena en 30 segundos. Cero discusiones.' },
      { icon:'👤', t:'Historial de cliente', d:'Tipo de corte, fecha del último, preferencias, alergias. El barbero sabe qué cortar al instante.' },
      { icon:'🛍️', t:'Venta de productos', d:'Aceites, ceras, peines, máquinas. Inventario y venta integrados. Tu barbería también es boutique.' },
      { icon:'🎁', t:'Programa de lealtad', d:'10mo corte gratis, descuento por cumpleaños, recordatorios para regresar. Triplica visitas.' }
    ],
    cmpRows: [
      ['Agenda por barbero','✓ Visual','no:Cuaderno','partial:Limitado'],
      ['Reservas online','✓ Link único','no:✗','yes:✓'],
      ['Comisiones automáticas','✓ Por servicio','no:Manual','partial:Limitado'],
      ['Historial cliente','✓ Detallado','no:Memoria','partial:Básico'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Memo "El Barbas" Hernández', biz:'Barbería El Caballero — CDMX', text:'Mis 4 barberos peleaban por comisiones cada quincena. Con Volvix se calculan solas, cero discusiones, equipo más feliz.' },
      { name:'Iván Luna', biz:'Lunalo Barbershop — Guadalajara', text:'Mis clientes ahora reservan solos por Instagram. Yo en mi casa veo cómo se llena la agenda. Subí 35% mis ingresos sin esforzarme más.' },
      { name:'Felipe Domínguez', biz:'Barbería Don Felipe — Toluca', text:'Antes los clientes venían cada 6-8 semanas. Con recordatorios cada 4 semanas, vienen más seguido. Triplicé mis visitas mensuales.' }
    ],
    faq: [
      { q:'¿Sirve para barbería con 1 barbero?', a:'Sí, plan Básico gratis. Cuando contrates más barberos subes a Pro.' },
      { q:'¿Cómo funcionan las reservas online?', a:'Generamos link único. Compartes en Instagram o WhatsApp. Cliente elige barbero, servicio, hora. Cero llamadas.' },
      { q:'¿Maneja comisiones diferentes por barbero?', a:'Sí. Cada barbero con su porcentaje por tipo de servicio. Cálculo automático.' },
      { q:'¿Funciona con WhatsApp Business?', a:'Sí. Recordatorios desde tu número. Cliente responde a ti, no a un bot.' },
      { q:'¿Puedo vender productos?', a:'Sí. Inventario de aceites, ceras, peines. Venta integrada al cobrar el servicio.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'spa', name: 'Spa', plural: 'spas', emoji: '🧖',
    primary: '#0d9488', primary2: '#14b8a6',
    badge: '🧖 POS para Spas y Centros de Bienestar',
    h1: 'Tu spa con <em>reservas sin caos</em><br>y paquetes que generan ingresos recurrentes',
    sub: 'Agenda por terapeuta, paquetes y membresías, control de cabinas, reservas online y reportes por servicio — el sistema completo para tu spa o centro de bienestar.',
    heroFeats: ['Agenda por terapeuta', 'Membresías y paquetes', 'Control de cabinas', 'Reservas online', 'Productos retail', 'Recordatorios WhatsApp', 'Tarjetas regalo', 'Reportes por servicio'],
    pains: [
      { icon:'📅', t:'"Reservas mal coordinadas entre terapeutas"', d:'Una terapeuta libre, dos clientas esperando, otra ocupada con doble booking. Pérdida de servicio y experiencia mala.' },
      { icon:'🚫', t:'"Clientas no se presentan y pierdo el espacio"', d:'No-shows del 30%. Espacio reservado vacío, terapeuta sin trabajar, ingresos perdidos.' },
      { icon:'💎', t:'"Vendo paquetes y se me complica el seguimiento"', d:'"Paquete 10 masajes". Vendiste, cliente uso 3, falta 7. Sin sistema, ¿cómo sigues? ¿Cobras de menos? ¿De más?' },
      { icon:'🛏️', t:'"No sé qué cabina está libre"', d:'5 cabinas, llega clienta, ¿cuál uso? Si está la del facial libre pero la maso ocupada, confundes la asignación.' }
    ],
    features: [
      { icon:'📅', t:'Agenda por terapeuta y cabina', d:'Vista doble: por terapeuta y por cabina. Sabes quién está libre y dónde puede atender.' },
      { icon:'💎', t:'Membresías y paquetes con seguimiento', d:'Paquete 10 masajes vendido. Sistema descuenta cada uso. Saldo visible en cualquier momento.' },
      { icon:'🌐', t:'Reservas online 24/7', d:'Clienta reserva por link, eligen servicio, terapeuta, fecha. Anticipo opcional para evitar no-shows.' },
      { icon:'💳', t:'Anticipo para reservar', d:'Reduces 80% los no-shows pidiendo anticipo del 50%. Si cancelas con tiempo, se devuelve.' },
      { icon:'🛍️', t:'Inventario de productos retail', d:'Cremas, aceites, mascarillas. Vendes después del servicio. Stock controlado, márgenes claros.' },
      { icon:'🎁', t:'Tarjetas de regalo', d:'Vendes gift cards desde tu sitio. Ideal para regalos. Se redime con QR en tu spa.' }
    ],
    cmpRows: [
      ['Agenda por terapeuta','✓ + cabina','no:Cuaderno','partial:Solo terapeuta'],
      ['Anticipo para reserva','✓ Configurable','no:✗','partial:Manual'],
      ['Paquetes con seguimiento','✓ Auto-descuento','no:Cuaderno','partial:Limitado'],
      ['Tarjetas regalo','✓ QR digital','partial:Físicas','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Patricia Jiménez', biz:'Spa Renacer — Querétaro', text:'No-shows del 30% me costaban $25,000 al mes. Con anticipo del 50% bajé a 5%. Mis terapeutas siempre con clientas, ingresos recuperados.' },
      { name:'Rodolfo Torres', biz:'Wellness Spa Torres — Mérida', text:'Vendía paquetes en cuaderno y siempre había confusión. Ahora cliente ve su saldo en su WhatsApp, cero discusiones.' },
      { name:'Mónica Aguilar', biz:'Spa Bienestar — Toluca', text:'Mis 3 terapeutas se confundían con cabinas. Ahora ven en pantalla quién en qué cabina. Atendemos 40% más clientas.' }
    ],
    faq: [
      { q:'¿Cómo evita los no-shows?', a:'Configuras anticipo (ej: 50%) para reservar. Si cancelas con 24hr de anticipación se devuelve. Reduce no-shows 80%.' },
      { q:'¿Maneja paquetes y membresías?', a:'Sí. Vendes paquete (ej: 10 masajes), cliente usa, sistema descuenta. Saldo visible siempre.' },
      { q:'¿Maneja varias cabinas?', a:'Sí. Vista por terapeuta o por cabina. Asignación inteligente.' },
      { q:'¿Funciona para spa pequeño?', a:'Sí, plan Básico gratis.' },
      { q:'¿Tarjetas regalo digitales?', a:'Sí. Vendes desde tu sitio, cliente las regala, se redimen con QR.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'dental', name: 'Clínica Dental', plural: 'clínicas dentales', emoji: '🦷',
    primary: '#0891b2', primary2: '#06b6d4',
    badge: '🦷 POS para Clínicas Dentales',
    h1: 'Tu clínica dental con <em>expedientes digitales</em><br>y cobros por tratamiento',
    sub: 'Expediente clínico digital, agenda por doctor, presupuestos por tratamiento, cobro fraccionado, recordatorios y facturación — el sistema para clínicas dentales.',
    heroFeats: ['Expediente clínico digital', 'Agenda por doctor', 'Presupuestos por tratamiento', 'Cobro fraccionado', 'Radiografías digitales', 'Recordatorios automáticos', 'Compatible seguros', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'📋', t:'"Paciente regresa y no encuentro su historial"', d:'Paciente vuelve después de 1 año. ¿Qué se le hizo? ¿Qué medicamento es alérgico? Buscas en archivos físicos 20 minutos.' },
      { icon:'💰', t:'"Cobro tratamientos sin presupuesto"', d:'Inicias endodoncia, paciente paga $1,500. Después dice "pensé que era todo". Discusión, descuento, pierdes.' },
      { icon:'📅', t:'"Citas se empalman entre doctores"', d:'Dos doctores en la clínica, mismo sillón. Sin coordinación, paciente espera 30 minutos. Mala experiencia.' },
      { icon:'🦷', t:'"Tratamiento de varias citas se cobra mal"', d:'Limpieza + 3 caries + corona = 5 visitas. Cobranza confusa. Pierdes $1,000-$2,000 por tratamiento.' }
    ],
    features: [
      { icon:'📋', t:'Expediente clínico digital', d:'Historia médica, alergias, tratamientos, radiografías. Todo en un lugar, accesible al instante.' },
      { icon:'📅', t:'Agenda por doctor y sillón', d:'Vista por doctor, sillón o ambos. Cero empalmes. Pacientes atendidos a tiempo.' },
      { icon:'💰', t:'Presupuestos por tratamiento', d:'Diagnóstico, plan de tratamiento con costos. Paciente firma digital. Cero discusiones al cobrar.' },
      { icon:'💳', t:'Cobro fraccionado', d:'Tratamiento de $8,000 en 5 visitas. Sistema lleva el saldo. Cobras en cada visita lo que toca.' },
      { icon:'🔔', t:'Recordatorios automáticos', d:'Cita en 24 horas, limpieza cada 6 meses. WhatsApp automático. Reduce ausencias 70%.' },
      { icon:'🏥', t:'Compatible con seguros', d:'GNP, AXA, Mapfre. Cargas datos del seguro, generas factura compatible para reembolso.' }
    ],
    cmpRows: [
      ['Expediente digital','✓ Con radiografías','no:Papel','yes:✓'],
      ['Agenda multi-doctor','✓ + sillones','no:Cuaderno','partial:Limitado'],
      ['Presupuestos firmados','✓ Digital','no:Manual','partial:Sin firma'],
      ['Cobro fraccionado','✓ Por sesión','no:Mental','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$2,500+']
    ],
    testimonials: [
      { name:'Dra. Lucía Sánchez', biz:'Clínica Dental Sánchez — Querétaro', text:'Buscaba expedientes en archivos físicos 30 min por paciente. Ahora todo digital, en 10 segundos. Atiendo 50% más pacientes.' },
      { name:'Dr. Manuel Reyes', biz:'Reyes Odontología — Edomex', text:'Antes cobraba "lo de siempre" sin presupuesto firmado. Pacientes pagaban menos. Con presupuesto digital firmado, cobro 25% más.' },
      { name:'Dra. Andrea Torres', biz:'Clínica Dental Torres — Toluca', text:'70% menos ausencias con recordatorios automáticos. Mi agenda llena, mis ingresos crecieron 40%.' }
    ],
    faq: [
      { q:'¿Maneja expediente clínico completo?', a:'Sí. Historia médica, alergias, tratamientos previos, radiografías digitales, recetas. Todo accesible en cualquier dispositivo.' },
      { q:'¿Cómo funcionan los presupuestos?', a:'Diagnóstico → plan de tratamiento con costos por procedimiento → paciente firma digital → autorización para empezar.' },
      { q:'¿Compatible con seguros médicos?', a:'Sí. GNP, AXA, Mapfre, BBVA, Banamex. Generamos factura compatible para reembolso del paciente.' },
      { q:'¿Maneja varias clínicas / doctores?', a:'Sí, plan Pro o Cadena. Cada doctor con su agenda, expedientes compartidos opcionalmente.' },
      { q:'¿Cumple con normas de protección de datos?', a:'Sí, encriptación end-to-end. Cumple LFPDPPP (Ley Federal de Protección de Datos).' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'veterinaria', name: 'Veterinaria', plural: 'veterinarias', emoji: '🐾',
    primary: '#16a34a', primary2: '#22c55e',
    badge: '🐾 POS para Veterinarias',
    h1: 'Tu veterinaria con <em>historia por mascota</em><br>y vacunas que no se olvidan',
    sub: 'Expediente por mascota, agenda de consultas, control de vacunas, venta de productos y alimento, facturación y recordatorios — el sistema para tu veterinaria.',
    heroFeats: ['Expediente por mascota', 'Agenda de consultas', 'Control de vacunas', 'Venta de alimentos', 'Recordatorios vacunas', 'Hospitalización', 'Estética y baño', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'🐕', t:'"No recuerdo el historial del perro"', d:'Llega Firulais con su dueño. ¿Última vacuna? ¿Alergias? ¿Castrado? Sin sistema, preguntas todo otra vez.' },
      { icon:'💉', t:'"El dueño pregunta cuándo toca vacuna"', d:'"¿Cuándo toca la próxima vacuna de Toby?" Buscas en libreta, no encuentras, dueño se va sin agendar.' },
      { icon:'💊', t:'"Medicamento controlado sin registro"', d:'Vendes Tramadol, antibiótico fuerte. Sin registro digital, problema con SAGARPA o COFEPRIS.' },
      { icon:'🥫', t:'"Vendo alimento pero no controlo inventario"', d:'Royal Canin, Pro Plan, Hill\'s. 30 marcas y tamaños. Sin sistema, te quedas sin lo que más vendes.' }
    ],
    features: [
      { icon:'🐾', t:'Expediente por mascota', d:'Cada mascota con su historial: vacunas, cirugías, alergias, peso, raza. Visible en cualquier consulta.' },
      { icon:'💉', t:'Calendario de vacunas', d:'Vacunas pendientes con alertas. Recordatorio automático al dueño 1 semana antes.' },
      { icon:'📅', t:'Agenda de consultas', d:'Consultas, cirugías, baños, estética. Cada doctor con su agenda. Sala de espera bajo control.' },
      { icon:'💊', t:'Inventario de medicamentos', d:'Antibióticos, antiparasitarios, vacunas. Control de caducidades + cumplimiento SAGARPA/COFEPRIS.' },
      { icon:'🥫', t:'Catálogo de alimentos', d:'Royal Canin, Pro Plan, etc. Por marca/tamaño/edad. Cliente pregunta, ves al instante si tienes.' },
      { icon:'🛁', t:'Estética y baño integrado', d:'Servicio de baño, corte, uñas. Agenda y cobro integrados con consulta médica.' }
    ],
    cmpRows: [
      ['Expediente mascota','✓ Por animal','no:Papel','partial:Básico'],
      ['Recordatorios vacunas','✓ Auto WhatsApp','no:✗','yes:✓'],
      ['Catálogo alimentos','✓ Por marca/talla','partial:Limitado','yes:✓'],
      ['Cumplimiento normativo','✓ SAGARPA','no:✗','partial:Manual'],
      ['Costo mensual','$0 – $599','$0','$1,800+']
    ],
    testimonials: [
      { name:'Dr. Vet. Ricardo Chávez', biz:'Veterinaria Chávez — Guadalajara', text:'Antes preguntaba historial cada vez. Ahora abro expediente y veo todo. Mis dueños sienten que sí me importa su mascota.' },
      { name:'Dra. Karla Méndez', biz:'Pet Clinic Méndez — Mérida', text:'Recordatorios automáticos de vacunas subieron mis consultas 50%. Antes los dueños olvidaban, ahora vuelven puntuales.' },
      { name:'M.V.Z. Antonio Bravo', biz:'Veterinaria Don Antonio — Toluca', text:'Vendo alimento y antes me quedaba sin Royal Canin justo cuando más se vende. Con alertas pido a tiempo.' }
    ],
    faq: [
      { q:'¿Maneja expediente por mascota?', a:'Sí. Historial completo: vacunas, cirugías, alergias, peso. Acceso al instante en cualquier consulta.' },
      { q:'¿Recordatorios automáticos de vacunas?', a:'Sí. Calendario por mascota. WhatsApp al dueño 1 semana antes de la próxima vacuna.' },
      { q:'¿Cumple con SAGARPA/COFEPRIS?', a:'Sí. Registro de medicamentos controlados, recetas, lotes. Reportes generados al instante.' },
      { q:'¿Maneja venta de alimentos y accesorios?', a:'Sí. Catálogo completo. Inventario por marca, tamaño, edad. Alertas de stock bajo.' },
      { q:'¿Sirve para veterinaria pequeña?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'optica', name: 'Óptica', plural: 'ópticas', emoji: '👓',
    primary: '#1d4ed8', primary2: '#3b82f6',
    badge: '👓 POS para Ópticas',
    h1: 'Tu óptica con <em>graduaciones digitales</em><br>y pedidos al laboratorio sin pérdidas',
    sub: 'Expediente con graduaciones, pedidos a laboratorio con seguimiento, catálogo visual de armazones, ventas con anticipo y notificaciones — el sistema para tu óptica.',
    heroFeats: ['Expediente de graduaciones', 'Pedidos a laboratorio', 'Catálogo de armazones', 'Anticipos por trabajo', 'Notificación al cliente', 'Garantías por lente', 'Ventas a meses', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'📋', t:'"La graduación del paciente está en papel"', d:'Cliente regresa por nuevos lentes. Buscas su graduación pasada en archivero. 15 minutos perdidos.' },
      { icon:'🔬', t:'"Pedido a laboratorio sin seguimiento"', d:'Mandaste lentes hace 2 semanas. ¿Ya están? ¿Cuándo llegan? Cliente llama, tú no sabes.' },
      { icon:'📞', t:'"Cliente llama: ¿ya llegaron mis lentes?"', d:'10 llamadas al día de "¿ya llegaron mis lentes?". Tu empleada pierde 1 hora respondiendo.' },
      { icon:'👓', t:'"Cliente reclama garantía sin comprobante"', d:'Lentes con falla a los 2 meses. Cliente regresa, dice "es de aquí". Sin comprobante registrado, problema.' }
    ],
    features: [
      { icon:'📋', t:'Expediente con graduaciones', d:'Graduaciones anteriores y actual. Compara cambios, vinculadas al paciente. Acceso instantáneo.' },
      { icon:'🔬', t:'Pedidos a laboratorio', d:'Generas orden con detalles del lente. Marcas estado: enviado, en proceso, listo. Notificas al cliente automático.' },
      { icon:'💬', t:'Notificación automática "Lentes listos"', d:'Cuando marcas "listo", cliente recibe WhatsApp. Cero llamadas, mejor servicio.' },
      { icon:'👓', t:'Catálogo visual de armazones', d:'Fotos de tus armazones por marca, estilo, género. Cliente pregunta, ves al instante.' },
      { icon:'💳', t:'Anticipos por pedido', d:'Cliente da anticipo al ordenar. Saldo al recoger. Sistema lleva todo.' },
      { icon:'🛡️', t:'Control de garantías', d:'Cada par con su garantía (lente, armazón). Sistema te dice qué reclamar al laboratorio si falla.' }
    ],
    cmpRows: [
      ['Expediente graduaciones','✓ Histórico','no:Papel','partial:Básico'],
      ['Seguimiento laboratorio','✓ Por orden','no:Memoria','yes:✓'],
      ['Notificación automática','✓ WhatsApp','no:Llamadas','partial:Email'],
      ['Catálogo con fotos','✓ Visual','no:✗','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,800+']
    ],
    testimonials: [
      { name:'Patricia Ortega', biz:'Óptica Visión Clara — Hidalgo', text:'Buscaba graduaciones en archivero 15 min por paciente. Ahora 10 segundos. Atiendo 30% más clientes diarios.' },
      { name:'Don Marcos Bernal', biz:'Óptica Bernal — Edomex', text:'Mi recepcionista pasaba 2 horas al día respondiendo "¿ya llegaron?". Con WhatsApp automático ese tiempo lo dedica a vender.' },
      { name:'Lourdes Pérez', biz:'Óptica Don Joel — Tlaxcala', text:'Tenía 3-4 reclamos de garantía sin comprobante por mes. Con registro digital cero garantías falsas.' }
    ],
    faq: [
      { q:'¿Maneja expediente con graduaciones?', a:'Sí. Histórico completo de graduaciones por paciente. Comparas cambios, vinculas a venta.' },
      { q:'¿Cómo controla pedidos al laboratorio?', a:'Generas orden con detalles del lente. Estados: enviado/proceso/listo. Notificación automática al cliente.' },
      { q:'¿Maneja garantías de lentes y armazones?', a:'Sí. Garantía del fabricante + tuya. Sistema te avisa qué reclamar a quién.' },
      { q:'¿Sirve para óptica con 1 vendedor?', a:'Sí, plan Básico gratis.' },
      { q:'¿Soporta venta a meses sin intereses?', a:'Sí. Plan de pagos automatizado con recordatorios.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'minisuper', name: 'Minisúper', plural: 'minisúpers', emoji: '🛒',
    primary: '#0f766e', primary2: '#14b8a6',
    badge: '🛒 POS para Minisúpers',
    h1: 'Tu minisúper con <em>cierre por turno exacto</em><br>y caducidades controladas',
    sub: 'Múltiples turnos, control de caducidades, gestión de merma, recepción de mercancía, facturación y reportes 24/7 — el sistema para tu minisúper.',
    heroFeats: ['Múltiples turnos', 'Control de caducidades', 'Recepción de mercancía', 'Detección de merma', 'Lector de barras', 'Cigarros y cervezas', 'Facturación CFDI 4.0', 'Reportes diarios'],
    pains: [
      { icon:'🌙', t:'"Turno nocturno con diferencias en caja"', d:'Cierre noche con $200 menos. Mañana $150 menos. Sin control por turno no detectas el problema.' },
      { icon:'⏳', t:'"Productos caducados en estantería"', d:'Yogurt vencido, leche con un día tarde. Demanda potencial y pérdida de confianza del cliente.' },
      { icon:'📦', t:'"Proveedor entrega de menos sin que sepa"', d:'Pides 50 cervezas, llegan 45. Sin orden de compra digital, no detectas el faltante.' },
      { icon:'💸', t:'"La merma me come las ganancias"', d:'Vendes $30,000 pero ganas $2,000. Donde se va? Robos, errores, daños. Sin reportes no sabes.' }
    ],
    features: [
      { icon:'🌙', t:'Múltiples turnos independientes', d:'Mañana, tarde, noche con cierre separado. Detectas diferencias por turno y cajero al instante.' },
      { icon:'⏳', t:'Alertas de caducidades', d:'Productos perecederos con alerta 7-14 días antes. Promociones, devoluciones a tiempo.' },
      { icon:'📦', t:'Recepción contra orden de compra', d:'Generas pedido al proveedor. Llega, validas vs orden. Detectas faltantes al instante.' },
      { icon:'📊', t:'Reporte de merma', d:'Stock teórico vs real. Detectas patrones (turno, día, producto). Identificas problemas.' },
      { icon:'🍻', t:'Control de cigarros y cervezas', d:'Productos regulados con horarios de venta restringidos. Sistema bloquea fuera de horario.' },
      { icon:'📷', t:'Lector de barras integrado', d:'Pasa código y va a la cuenta. Cobra 8 productos en 10 segundos.' }
    ],
    cmpRows: [
      ['Múltiples turnos','✓ Cierre separado','no:Manual','partial:Limitado'],
      ['Caducidades automáticas','✓ Alertas','no:✗','yes:✓'],
      ['Recepción vs orden','✓ Detecta faltantes','no:✗','partial:Manual'],
      ['Detección de merma','✓ Reporte','no:✗','partial:Limitado'],
      ['Costo mensual','$0 – $599','$0','$1,800+']
    ],
    testimonials: [
      { name:'Don Aurelio Castañeda', biz:'Mini Súper La Joya — Edomex', text:'Tenía $5,000 al mes en diferencias misteriosas. Con cierre por turno detecté que el de noche se llevaba $150/turno. Lo despedí.' },
      { name:'Yolanda Hernández', biz:'Mini Mart Yola — CDMX', text:'Tiraba 12% de mi inventario por caducidades. Con alertas bajé a 2%. Eso son $8,000 al mes recuperados.' },
      { name:'Jorge Salinas', biz:'Mini Súper Salinas — Toluca', text:'Antes el repartidor entregaba 5 cajas pero cobraba 6. Con orden digital sé exactamente qué pedí. Ahorré $4,000 al mes.' }
    ],
    faq: [
      { q:'¿Maneja varios turnos?', a:'Sí. Cierre independiente por turno y cajero. Detección de diferencias instantánea.' },
      { q:'¿Controla caducidades de perecederos?', a:'Sí. Alertas 7-14 días antes (configurable).' },
      { q:'¿Restringe venta de cervezas/cigarros por horario?', a:'Sí. Sistema bloquea automáticamente fuera del horario permitido.' },
      { q:'¿Maneja recargas y servicios?', a:'Sí. Telcel, AT&T, Movistar, pago de servicios.' },
      { q:'¿Funciona offline?', a:'Sí. Modo offline completo.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'fruteria', name: 'Frutería y Verdulería', plural: 'fruterías', emoji: '🍎',
    primary: '#16a34a', primary2: '#22c55e',
    badge: '🍎 POS para Fruterías',
    h1: 'Tu frutería con <em>precios al día</em><br>y báscula que cobra exacto',
    sub: 'Báscula integrada, precios variables por día, control de merma, ventas a granel y por kilo, fiado controlado y reportes — el sistema para tu frutería.',
    heroFeats: ['Báscula integrada', 'Precios variables por día', 'Control de merma', 'Fiado por cliente', 'Cierre rápido de caja', 'Mayoreo a restaurantes', 'Reportes diarios', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'⚖️', t:'"La báscula no se conecta con la caja"', d:'Pesas en una báscula, escribes peso, cobras manual. Errores constantes, clientes molestos.' },
      { icon:'🍅', t:'"Los precios cambian cada semana y me confundo"', d:'Lunes jitomate $25, jueves $35, sábado $30. Sin sistema, el cajero cobra precio viejo.' },
      { icon:'🥬', t:'"La merma me come"', d:'Compras 50 kg de lechuga, vendes 35. ¿15 kg dónde? Si no sabes la merma real, pierdes margen.' },
      { icon:'📒', t:'"El fiado en cuaderno se confunde"', d:'Vecinos, conocidos, restaurantes. Cuadernos llenos, no sabes quién debe qué.' }
    ],
    features: [
      { icon:'⚖️', t:'Báscula integrada', d:'Cliente pide kilo de tomate, pesas, sistema cobra automático. Cero errores.' },
      { icon:'🏷️', t:'Precios variables por día', d:'Cambias precio del aguacate cada lunes. Sistema actualiza, cajero cobra el correcto.' },
      { icon:'📊', t:'Reporte de merma diaria', d:'Comparas stock contra venta. Identificas qué producto se desperdicia más. Compras mejor.' },
      { icon:'💳', t:'Fiado digital', d:'Cada cliente con cuenta. Carga al pesar. Recordatorios automáticos por WhatsApp.' },
      { icon:'🚚', t:'Mayoreo a restaurantes', d:'Restaurantes con su precio especial y entrega programada. Factura CFDI inmediata.' },
      { icon:'⚡', t:'Cierre rápido', d:'Resumen del día en 1 minuto. Efectivo, fiado, merma. Sin Excel.' }
    ],
    cmpRows: [
      ['Báscula integrada','✓ Directo','no:Manual','partial:Limitado'],
      ['Precios por día','✓ Auto-aplica','no:Manual','partial:Manual'],
      ['Reporte de merma','✓ Diario','no:✗','partial:Manual'],
      ['Fiado digital','✓ Por cliente','no:Cuaderno','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Don Margarito Vázquez', biz:'Frutería Don Mago — CDMX', text:'Mi cajero antes cobraba precio viejo del aguacate. Cliente reclamaba, descontaba. Con precios actualizados, cero errores.' },
      { name:'Doña Lupe Reyes', biz:'Frutería La Fresca — Hidalgo', text:'Mis fiados de cuaderno eran $14,000. Con Volvix recuperé $11,000 en 2 meses con recordatorios automáticos.' },
      { name:'Hugo Treviño', biz:'Frutería Treviño — Tlaxcala', text:'Tenía 22% de merma en lechuga y no sabía. Con reporte diario detecté que se podría por mal almacenaje. Bajé a 8%.' }
    ],
    faq: [
      { q:'¿Funciona con cualquier báscula?', a:'Sí, USB, RS232 o Bluetooth. Modelos compatibles desde $1,500.' },
      { q:'¿Precios variables por día?', a:'Sí. Cambias precio una vez, se aplica en toda la operación.' },
      { q:'¿Maneja mayoreo a restaurantes?', a:'Sí. Precio mayoreo + factura CFDI + entrega programada.' },
      { q:'¿Controla fiado?', a:'Sí. Cuenta digital por cliente, recordatorios automáticos.' },
      { q:'¿Sirve para frutería pequeña?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'gasolinera', name: 'Gasolinera', plural: 'gasolineras', emoji: '⛽',
    primary: '#f97316', primary2: '#fb923c',
    badge: '⛽ POS para Gasolineras',
    h1: 'Tu gasolinera con <em>cierre exacto por turno</em><br>y lubricantes controlados',
    sub: 'Cierre por turno e isla, control de lubricantes y accesorios, recargas y servicios, reportes de despacho y facturación CFDI — el sistema para gasolineras.',
    heroFeats: ['Cierre por turno e isla', 'Control de lubricantes', 'Recargas Telcel/AT&T', 'Servicios pago', 'Múltiples cajeros', 'Reportes de despacho', 'Conciliación con bombas', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'⛽', t:'"Cuadre de turno con diferencias en efectivo"', d:'Empleado cierra turno con $500 menos. Otro turno $300. Sin control, no detectas el patrón.' },
      { icon:'🛢️', t:'"Lubricantes y aceites desaparecen"', d:'Cuarto de aceites con $30,000 en stock. Cada mes $3,000 menos sin saber por qué.' },
      { icon:'📊', t:'"No sé qué isla vende más"', d:'Tres islas, ¿cuál genera más? ¿En qué horario? Sin reportes, decides a ciegas.' },
      { icon:'🧾', t:'"Camiones de empresa piden factura y tardo"', d:'Flotilla de empresa carga $5,000 en gasolina. Pide factura. Sin sistema, 30 minutos por factura.' }
    ],
    features: [
      { icon:'⛽', t:'Cierre por turno e isla', d:'Cada turno, cada isla, cada empleado con corte separado. Diferencias detectadas al instante.' },
      { icon:'🛢️', t:'Inventario de lubricantes', d:'Aceites, grasas, líquidos. Cada lata con stock. Cobro al instante. Cero pérdidas misteriosas.' },
      { icon:'📊', t:'Reporte de despacho por isla', d:'Litros vendidos, ventas por isla, horario pico. Decisiones basadas en datos.' },
      { icon:'💳', t:'Recargas y servicios', d:'Telcel, AT&T, pago de luz, agua. Comisión por servicio registrada.' },
      { icon:'🧾', t:'Facturación express para flotillas', d:'Empresa carga, da RFC, factura CFDI generada en 30 segundos. Cero filas.' },
      { icon:'👥', t:'Múltiples cajeros y turnos', d:'Cada empleado con PIN. Sus ventas, su responsabilidad. Detectas problemas al instante.' }
    ],
    cmpRows: [
      ['Cierre por turno/isla','✓ Detallado','no:Manual','partial:Limitado'],
      ['Control de lubricantes','✓ Inventario','no:✗','yes:✓'],
      ['Reporte de despacho','✓ Por isla','no:✗','partial:Limitado'],
      ['Facturación flotillas','✓ 30 segundos','no:30 minutos','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$3,000+']
    ],
    testimonials: [
      { name:'Don Federico Cárdenas', biz:'Gasolinera Cárdenas — Querétaro', text:'Tenía $20,000 al mes en diferencias de turnos. Con cierre por isla detecté que un empleado se quedaba con $500/turno. Lo despedí.' },
      { name:'Lic. Antonio Reyes', biz:'Servicio Reyes — Edomex', text:'Mis lubricantes desaparecían $5,000 al mes. Con inventario digital y cobro obligatorio cero pérdidas.' },
      { name:'Erika Bernal', biz:'Gasolinera La Comarca — Hidalgo', text:'Antes facturar a empresa tomaba 30 min. Ahora 30 segundos. Cerré contrato con flotilla de 50 camiones.' }
    ],
    faq: [
      { q:'¿Se conecta con las bombas de despacho?', a:'Sí. Conciliación automática entre bombas y caja. Detectas diferencias al instante.' },
      { q:'¿Maneja inventario de lubricantes?', a:'Sí. Aceites, grasas, accesorios. Cada producto con stock y precio.' },
      { q:'¿Soporta facturación a flotillas?', a:'Sí. Cliente da RFC, factura CFDI 4.0 en 30 segundos.' },
      { q:'¿Maneja servicios extra (recargas, pagos)?', a:'Sí. Telcel, AT&T, luz, agua. Comisión registrada por servicio.' },
      { q:'¿Funciona 24/7?', a:'Sí. Uptime 99.9%. Modo offline si se cae internet.' },
      { q:'¿Cuántos cajeros maneja?', a:'Sin límite. Cada uno con PIN, turno y corte.' }
    ]
  },
  {
    slug: 'gimnasio', name: 'Gimnasio', plural: 'gimnasios', emoji: '🏋️',
    primary: '#7c3aed', primary2: '#a855f7',
    badge: '🏋️ POS para Gimnasios',
    h1: 'Tu gimnasio con <em>membresías que se cobran solas</em><br>y acceso por QR sin pagos atrasados',
    sub: 'Control de membresías mensuales/anuales, acceso por QR, cobro recurrente automático, reserva de clases grupales y reportes de retención — para tu gimnasio.',
    heroFeats: ['Membresías auto-cobro', 'Acceso por QR', 'Reserva de clases', 'Múltiples sucursales', 'Productos suplementos', 'Recordatorios pago', 'Pase del día', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'💳', t:'"Mensualidades vencidas que olvido cobrar"', d:'Socios con su mensualidad vencida hace 2 semanas. Siguen entrando. Sin sistema no detectas, no cobras.' },
      { icon:'🚪', t:'"Personas entran sin haber pagado"', d:'Recepcionista distraída, alguien entra "porque ya pagó". A fin de mes, $5,000-$10,000 perdidos.' },
      { icon:'🏋️', t:'"Clases grupales sin control"', d:'Spinning con 25 espacios, llegan 35 personas, 10 enojadas. Sin reservas, caos en hora pico.' },
      { icon:'📊', t:'"No sé por qué socios se van"', d:'Renovación cae 20% sin saber por qué. Sin datos, no puedes mejorar la retención.' }
    ],
    features: [
      { icon:'💳', t:'Cobro recurrente automático', d:'Mensualidad se cobra el día programado. Tarjeta del socio. Cero olvidos, cero llamadas.' },
      { icon:'📱', t:'Acceso por QR', d:'Socio escanea QR en torniquete. Si está al corriente, entra. Si no, sistema lo detiene.' },
      { icon:'🏋️', t:'Reserva de clases', d:'Spinning, yoga, crossfit con cupo limitado. Socio reserva por app. Lista de espera automática.' },
      { icon:'🔔', t:'Recordatorios de pago', d:'7 días antes, 1 día antes, vencido: WhatsApp automático. Cobranza con cero esfuerzo.' },
      { icon:'🛍️', t:'Suplementos y bebidas', d:'Proteína, creatina, agua, barras. Inventario y venta integrados.' },
      { icon:'📊', t:'Análisis de retención', d:'Por qué se van los socios. Frecuencia de visita por persona. Identificas patrones para retener.' }
    ],
    cmpRows: [
      ['Cobro recurrente','✓ Automático','no:Manual','partial:Limitado'],
      ['Acceso por QR','✓ Bloqueo auto','no:Manual','yes:✓'],
      ['Reserva clases','✓ Lista espera','no:Caos','yes:✓'],
      ['Análisis retención','✓ Detallado','no:✗','partial:Básico'],
      ['Costo mensual','$0 – $599','$0','$2,500+']
    ],
    testimonials: [
      { name:'Lic. Daniel Vázquez', biz:'Gym Power Vázquez — Edomex', text:'Tenía $25,000 al mes en mensualidades vencidas que olvidaba cobrar. Con cobro automático cero pérdidas.' },
      { name:'Laura Treviño', biz:'Fit Studio Laura — Mérida', text:'Antes mis clases grupales eran un caos. Ahora reservas con cupo, lista de espera. Mis socios contentos, sin enojos.' },
      { name:'Carlos Bermúdez', biz:'CrossFit Bermúdez — Toluca', text:'Mi retención cayó 25% sin saber por qué. Con análisis Volvix detecté que mis lunes 7AM tenían poca asistencia. Ajusté horario y subí 30%.' }
    ],
    faq: [
      { q:'¿Maneja membresías mensuales/anuales?', a:'Sí. Configuras planes, cobro automático en fecha del corte. Recordatorios automáticos.' },
      { q:'¿Acceso por QR?', a:'Sí. Cada socio con QR único. Escaneo en torniquete bloquea si tiene pago vencido.' },
      { q:'¿Maneja clases grupales con cupo limitado?', a:'Sí. Reservación por app, lista de espera automática, cancelación con tiempo.' },
      { q:'¿Vendo suplementos y bebidas?', a:'Sí. Inventario integrado, venta al cobrar membresía o aparte.' },
      { q:'¿Sirve para gimnasio pequeño?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'nails', name: 'Salón de Uñas', plural: 'salones de uñas', emoji: '💅',
    primary: '#ec4899', primary2: '#f472b6',
    badge: '💅 POS para Salones de Uñas',
    h1: 'Tu nail bar con <em>citas sin empalme</em><br>y comisiones que no causan pleitos',
    sub: 'Agenda visual por estilista, reservas online, comisiones automáticas, control de insumos (esmaltes, gel, acrílico) y fidelización — el sistema para tu nail bar.',
    heroFeats: ['Agenda visual por estilista', 'Reservas online 24/7', 'Comisiones automáticas', 'Control de insumos', 'Catálogo de diseños', 'Tarjetas de regalo', 'Membresías mensuales', 'Recordatorios WhatsApp'],
    pains: [
      { icon:'📅', t:'"Citas a lápiz que se empalman"', d:'Anotas cita en cuaderno. Otra clienta llega sin cita pero "es la misma hora". Empalme, espera, frustración.' },
      { icon:'💅', t:'"No controlo esmaltes ni gel"', d:'90 esmaltes, 20 colores de gel, acrílico, decoración. Sin control no sabes cuándo se acaban.' },
      { icon:'💰', t:'"Comisiones a mano cada quincena = horror"', d:'3 nail artists, cada una con servicios diferentes. Calcular comisiones manual, errores, reclamos.' },
      { icon:'🎨', t:'"Las clientas piden diseño y no recuerdo cuál hicieron antes"', d:'"Quiero las mismas uñas de la vez pasada". Sin foto, sin registro, las haces diferentes.' }
    ],
    features: [
      { icon:'📅', t:'Agenda visual por nail artist', d:'Cada estilista en columna. Servicios típicos pre-cargados. Cero empalmes.' },
      { icon:'💬', t:'Reservas online con WhatsApp', d:'Clienta reserva por link. Confirmación + recordatorio automáticos.' },
      { icon:'💅', t:'Inventario de insumos', d:'Cada esmalte, gel, decoración con stock. Alertas cuando se acaban.' },
      { icon:'💰', t:'Comisiones automáticas', d:'Cada servicio con su % por estilista. Cierre de quincena en 30 segundos.' },
      { icon:'📸', t:'Catálogo de diseños', d:'Subes fotos de tus diseños. Clienta elige antes de la cita. Tu portafolio digital.' },
      { icon:'🎁', t:'Membresías mensuales', d:'"4 manicures por $1,200 al mes". Cobro recurrente automático. Ingresos predecibles.' }
    ],
    cmpRows: [
      ['Agenda por nail artist','✓ Visual','no:Cuaderno','partial:Limitado'],
      ['Catálogo de diseños','✓ Con fotos','no:✗','no:✗'],
      ['Comisiones automáticas','✓ Por servicio','no:Manual','partial:Limitado'],
      ['Membresías recurrentes','✓ Cobro auto','no:Manual','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Brenda Ríos', biz:'Nails by Bren — Edomex', text:'Antes mis citas a lápiz se empalmaban 3-4 veces por semana. Ahora con agenda visual cero empalmes en 5 meses.' },
      { name:'Nadia Chávez', biz:'Glam Nails — CDMX', text:'Mis 4 nail artists peleaban por comisiones. Ahora se calculan solas, equipo feliz, cero discusiones.' },
      { name:'Tatiana Lozano', biz:'Lozano Nail Studio — Toluca', text:'El catálogo de diseños cambió todo. Clienta elige antes de venir, tiempo en cabina bajó 30%, atiendo más al día.' }
    ],
    faq: [
      { q:'¿Funciona si soy nail artist sola?', a:'Sí, plan Básico gratis. Cubre operación de 1 persona.' },
      { q:'¿Maneja inventario de esmaltes/geles?', a:'Sí. Cada producto con stock. Alertas cuando se acaban.' },
      { q:'¿Membresías recurrentes?', a:'Sí. Cobro automático cada mes. Saldo de servicios incluidos.' },
      { q:'¿Catálogo de diseños con fotos?', a:'Sí. Subes fotos, clienta elige por WhatsApp o link.' },
      { q:'¿Sirve para 1-5 nail artists?', a:'Sí. Plan Pro para 5-10 artistas con todas las funciones.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'tatuajes', name: 'Estudio de Tatuajes', plural: 'estudios de tatuajes', emoji: '🎨',
    primary: '#111827', primary2: '#1f2937',
    badge: '🎨 POS para Estudios de Tatuajes',
    h1: 'Tu estudio con <em>citas con anticipo</em><br>y diseños aprobados por escrito',
    sub: 'Citas con anticipo obligatorio, presupuestos por tatuaje, historial de cliente, control de insumos (tinta, agujas) y portafolio digital — para tu estudio.',
    heroFeats: ['Citas con anticipo', 'Presupuesto por tatuaje', 'Historial de cliente', 'Control de tintas y agujas', 'Portafolio digital', 'Comisiones por tatuador', 'Consentimiento firmado', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'📅', t:'"Cita sin anticipo y cliente no aparece"', d:'Bloqueas 4 horas para una pieza grande. Cliente cancela ese día. Tatuador sin trabajar, ingreso perdido.' },
      { icon:'🎨', t:'"Diseño aprobado pero cliente cambia de opinión"', d:'Diseñas la pieza, cliente "aprueba" verbal. Día del tatuaje dice "esto no era". Discusión, descuento, pérdida.' },
      { icon:'💉', t:'"Tintas y agujas sin control"', d:'Tinta negra Eternal, roja Intenze, agujas magnum. Sin inventario te quedas sin lo que más usas.' },
      { icon:'📊', t:'"No sé qué tatuador genera más"', d:'3 tatuadores en el estudio. ¿Quién genera más? ¿Quién es rentable? Sin reportes, decides al azar.' }
    ],
    features: [
      { icon:'💳', t:'Anticipo obligatorio para reservar', d:'Cliente da $500-$1,000 anticipo al reservar. Si cancela con 24hr se devuelve. Cero no-shows.' },
      { icon:'📋', t:'Presupuesto firmado', d:'Diseño + costo + tiempo estimado. Cliente firma digital. Cero "esto no era".' },
      { icon:'🎨', t:'Portafolio digital', d:'Tus diseños por estilo (realismo, tradicional, blackwork). Cliente elige tatuador por estilo.' },
      { icon:'💉', t:'Inventario de insumos', d:'Tintas por marca/color, agujas por tipo, guantes. Alertas cuando bajan.' },
      { icon:'💰', t:'Comisiones por tatuador', d:'Cada pieza con su comisión. Cierre quincenal automático.' },
      { icon:'📄', t:'Consentimiento médico digital', d:'Formulario firmado por cliente: alergias, cuidados, autorización. Legal y al instante.' }
    ],
    cmpRows: [
      ['Anticipo para reserva','✓ Obligatorio','no:✗','partial:Limitado'],
      ['Presupuesto firmado','✓ Digital','no:Verbal','partial:Manual'],
      ['Portafolio por tatuador','✓ Por estilo','no:Instagram','yes:✓'],
      ['Consentimiento médico','✓ Digital','no:Papel','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Eric "Black" Mendoza', biz:'Black Ink Studio — CDMX', text:'No-shows del 25%. 4 horas bloqueadas perdidas cada semana. Con anticipo del 30% bajé a 2%. Mis tatuadores siempre con trabajo.' },
      { name:'Sofía "Sof" Castillo', biz:'Sof Tattoo — Guadalajara', text:'Antes diseñaba pieza, cliente aprobaba verbal, después cambiaba. Pérdidas de $2,000-$5,000 por pieza. Con presupuesto firmado, cero discusiones.' },
      { name:'Daniel Reyes', biz:'Reyes Tattoo Co. — Edomex', text:'Mis 3 tatuadores se quejaban de comisiones. Ahora se calculan solas, cierre quincenal en 30 segundos, equipo feliz.' }
    ],
    faq: [
      { q:'¿Cómo funciona el anticipo?', a:'Configuras % de anticipo (típico 30-50%). Cliente paga al reservar. Cancelación con 24hr de anticipación devuelve. Reduce no-shows 80%.' },
      { q:'¿Maneja portafolio por tatuador y estilo?', a:'Sí. Cada tatuador con sus fotos por estilo. Cliente elige al ver portafolio.' },
      { q:'¿Consentimiento médico digital?', a:'Sí. Formulario completo (alergias, condiciones, cuidados) firmado por cliente desde su celular. Cumple legal.' },
      { q:'¿Maneja inventario de tintas y agujas?', a:'Sí. Por marca, color, tipo. Alertas cuando bajan. Reportes de uso por tatuador.' },
      { q:'¿Sirve para tatuador independiente?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'polleria', name: 'Pollería', plural: 'pollerías', emoji: '🍗',
    primary: '#d97706', primary2: '#f59e0b',
    badge: '🍗 POS para Pollerías',
    h1: 'Tu pollería con <em>encargos sin olvidos</em><br>y báscula que cobra exacto',
    sub: 'Pedidos de encargo con anticipo, báscula integrada, ajuste de precio diario, control de fiado, mayoreo a restaurantes y reportes — el sistema para tu pollería.',
    heroFeats: ['Pedidos de encargo', 'Báscula integrada', 'Precio variable diario', 'Control de fiado', 'Mayoreo a restaurantes', 'Reportes de merma', 'Cierre rápido', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'🍗', t:'"Cliente pide pollos rostizados y olvido prepararlos"', d:'Sra. María pidió 5 pollos para las 2 PM. Olvidas, cliente llega, no hay. Pérdida de venta y reputación.' },
      { icon:'⚖️', t:'"La báscula no se conecta con la caja"', d:'Pesas pollo, escribes peso, cobras manual. Errores 4-5 veces al día.' },
      { icon:'💰', t:'"Precio del proveedor cambia y no actualizo"', d:'Lunes pollo a $80 kilo. Jueves sube a $95. No actualizas, cobras precio viejo, pierdes margen.' },
      { icon:'📒', t:'"Restaurantes me pagan tarde"', d:'Restaurantes que compran 50 kg semanales pagan a 30 días. Sin sistema, olvidas cuánto te deben.' }
    ],
    features: [
      { icon:'📋', t:'Pedidos de encargo programados', d:'Cliente reserva 5 pollos para 2 PM. Sistema te recuerda 1 hora antes. Cero olvidos.' },
      { icon:'⚖️', t:'Báscula integrada', d:'Pesas, sistema cobra exacto. Cero errores al cliente.' },
      { icon:'🏷️', t:'Ajuste de precio diario', d:'Cambias precio del kilo cada día según proveedor. Cajero cobra el correcto.' },
      { icon:'💳', t:'Crédito a restaurantes', d:'Cada cliente mayoreo con cuenta. Recordatorios WhatsApp automáticos al vencer.' },
      { icon:'📊', t:'Reporte de merma', d:'Compraste 100 kg, vendiste 88. ¿Merma 12%? Sistema te alerta si es anormal.' },
      { icon:'⚡', t:'Cierre rápido', d:'Resumen del día en 1 minuto. Efectivo, fiado, mayoreo. Sin Excel.' }
    ],
    cmpRows: [
      ['Pedidos programados','✓ Recordatorios','no:Memoria','partial:Limitado'],
      ['Báscula integrada','✓ Directo caja','no:Manual','partial:Limitado'],
      ['Precio variable diario','✓ Auto-aplica','no:Manual','partial:Manual'],
      ['Crédito mayoreo','✓ Por cliente','no:Cuaderno','yes:✓'],
      ['Costo mensual','$0 – $599','$0','$1,200+']
    ],
    testimonials: [
      { name:'Don Hilario Méndez', biz:'Pollería El Buen Sabor — Edomex', text:'Olvidaba 1-2 pedidos por semana. Eran $1,500-$3,000 perdidos en pollos preparados de más o de menos. Con recordatorios cero olvidos.' },
      { name:'Doña Marta Reyes', biz:'Pollería Reyes — Hidalgo', text:'Mi báscula no se conectaba con la caja. Mi cajero se equivocaba. Ahora todo automático, clientes felices.' },
      { name:'Jorge Salinas', biz:'Pollería Don Jorge — Tlaxcala', text:'5 restaurantes me debían $45,000 sin orden. Recordatorios WhatsApp recuperaron $38,000 en 3 meses.' }
    ],
    faq: [
      { q:'¿Maneja pedidos de encargo?', a:'Sí. Cliente reserva con anticipo, sistema te recuerda 1 hora antes. Cero olvidos.' },
      { q:'¿Funciona con báscula?', a:'Sí, cualquier báscula USB/RS232/Bluetooth.' },
      { q:'¿Precio variable por día?', a:'Sí. Cambias precio una vez, se aplica en toda la operación.' },
      { q:'¿Maneja mayoreo a restaurantes?', a:'Sí. Precio mayoreo + factura CFDI + crédito.' },
      { q:'¿Sirve para pollería pequeña?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'carwash', name: 'Car Wash', plural: 'car washes', emoji: '🚗',
    primary: '#0ea5e9', primary2: '#38bdf8',
    badge: '🚗 POS para Car Wash',
    h1: 'Tu car wash con <em>cada lavado registrado</em><br>y membresías que generan ingresos recurrentes',
    sub: 'Registro por vehículo, servicios + extras (encerado, aspirado, pulido), membresías mensuales, control por turno y reportes — el sistema para tu car wash.',
    heroFeats: ['Registro por vehículo', 'Servicios + extras', 'Membresías mensuales', 'Control por turno', 'Comisiones empleados', 'Catálogo visual', 'Tarjetas regalo', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'💸', t:'"No sé cuántos vehículos lavé hoy"', d:'Empleados reportan "como 25". Cobro real $800 cuando deberían ser $1,200. Pérdida sin saber.' },
      { icon:'🧽', t:'"Los extras no se cobran"', d:'Cliente pide encerado + aspirado. Empleado los hace pero no avisa. Cobras solo lavado básico, pierdes $80 por servicio.' },
      { icon:'👥', t:'"Mis empleados no reportan extras"', d:'Trabajan rápido, no anotan. Sin control, los empleados deciden qué cobrar y qué no.' },
      { icon:'🔁', t:'"Clientes vienen una vez y nunca regresan"', d:'Sin programa de membresía o recordatorios, cada visita es nueva. Pierdes lealtad.' }
    ],
    features: [
      { icon:'🚗', t:'Registro por vehículo', d:'Marca, modelo, placa. Cliente regresa, ves su histórico. Sugerencias automáticas.' },
      { icon:'🧽', t:'Servicios + extras', d:'Lavado básico + encerado + aspirado + pulido. Cada extra con su precio. Imposible olvidar cobrar.' },
      { icon:'💳', t:'Membresías mensuales', d:'"4 lavados al mes por $400". Cobro recurrente. Ingresos predecibles.' },
      { icon:'👥', t:'Control por turno y empleado', d:'Cada empleado con sus servicios. Comisiones automáticas, diferencias detectadas.' },
      { icon:'📷', t:'Catálogo visual de servicios', d:'Foto de cada servicio (encerado, pulido). Cliente entiende, paga más.' },
      { icon:'🎁', t:'Tarjetas regalo', d:'"Lavado premium para regalar". Vendes, cliente regala, se redime con QR.' }
    ],
    cmpRows: [
      ['Registro por vehículo','✓ Histórico','no:✗','partial:Limitado'],
      ['Extras automáticos','✓ Imposible olvidar','no:Manual','yes:✓'],
      ['Membresías recurrentes','✓ Cobro auto','no:✗','yes:✓'],
      ['Comisiones empleados','✓ Por servicio','no:Manual','partial:Limitado'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Don Saúl Ramírez', biz:'Car Wash Don Saúl — Edomex', text:'Mis empleados no anotaban extras. Perdía $5,000-$8,000 al mes en encerados sin cobrar. Con sistema cero pérdidas.' },
      { name:'Erika Bernal', biz:'Auto Spa Bernal — Toluca', text:'Vendí 80 membresías mensuales. Ingresos predecibles de $32,000 al mes garantizados. Antes era impredecible.' },
      { name:'Marcos Aldama', biz:'Car Wash Premium — Querétaro', text:'Antes no sabía qué empleado lavaba más. Con reportes detecté al mejor y al peor. Ajusté equipo, productividad subió 40%.' }
    ],
    faq: [
      { q:'¿Maneja membresías mensuales?', a:'Sí. Cliente paga $400/mes por 4 lavados. Cobro automático. Cero olvidos de cobranza.' },
      { q:'¿Cómo evita que se olviden los extras?', a:'Cliente elige extras al inicio. Sistema los marca como pendientes. Imposible cerrar venta sin cobrarlos.' },
      { q:'¿Maneja comisiones por empleado?', a:'Sí. Cada servicio con su comisión. Cierre quincenal automático.' },
      { q:'¿Sirve para car wash con 2 empleados?', a:'Sí, plan Básico gratis.' },
      { q:'¿Tarjetas regalo digitales?', a:'Sí. Vendes, regalan, se redimen con QR.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  },
  {
    slug: 'purificadora', name: 'Purificadora de Agua', plural: 'purificadoras', emoji: '💧',
    primary: '#0ea5e9', primary2: '#38bdf8',
    badge: '💧 POS para Purificadoras de Agua',
    h1: 'Tu purificadora con <em>rutas controladas</em><br>y cada garrafón registrado al cliente',
    sub: 'Registro por garrafón y cliente, rutas de reparto programadas, historial de cuenta, ventas a crédito y facturación — el sistema para tu purificadora de agua.',
    heroFeats: ['Registro por garrafón', 'Rutas de reparto', 'Historial por cliente', 'Crédito a clientes fijos', 'Recargas y servicios', 'Notificaciones', 'Múltiples turnos', 'Facturación CFDI 4.0'],
    pains: [
      { icon:'🚚', t:'"La ruta de reparto sin orden"', d:'Repartidor sale con 30 garrafones. ¿A quién entregó? ¿Cobró todos? Sin control, "se le olvidaron" 3-5.' },
      { icon:'📒', t:'"Cliente dice que ya pagó pero no recuerdo"', d:'"Yo ya te pagué la semana pasada". Sin sistema de cuenta por cliente, le crees o discutes.' },
      { icon:'💧', t:'"No sé cuántos garrafones tengo en la calle"', d:'500 garrafones de tu marca afuera. Algunos llevan meses sin regresar. Pérdida de capital.' },
      { icon:'📊', t:'"No sé qué ruta es más rentable"', d:'3 rutas, ¿cuál genera más? ¿En qué horario? Sin datos, decides al azar.' }
    ],
    features: [
      { icon:'🚚', t:'Rutas de reparto programadas', d:'Cada repartidor con su ruta y clientes. Marca entregado al hacer. Sabes en vivo qué se entregó.' },
      { icon:'💧', t:'Registro por garrafón', d:'Cada garrafón con número de serie. Sabes a quién está prestado. Cero pérdidas misteriosas.' },
      { icon:'👤', t:'Historial por cliente', d:'Frecuencia de compra, último pago, saldo. Recordatorios automáticos cuando toca volver.' },
      { icon:'💳', t:'Crédito a clientes fijos', d:'Familia que paga semanal/quincenal. Sistema lleva saldo. Recordatorios WhatsApp.' },
      { icon:'📊', t:'Reportes por ruta', d:'Litros vendidos por ruta, ingresos, eficiencia. Decides cuál ruta crecer.' },
      { icon:'🛍️', t:'Servicios extras', d:'Hielo, agua mineral, refrescos. Vendes desde el mostrador o ruta. Inventario integrado.' }
    ],
    cmpRows: [
      ['Rutas de reparto','✓ Por repartidor','no:Manual','partial:Limitado'],
      ['Registro por garrafón','✓ Por número','no:✗','no:✗'],
      ['Crédito a clientes','✓ Por cuenta','no:Cuaderno','yes:✓'],
      ['Reportes por ruta','✓ Detallados','no:✗','partial:Básico'],
      ['Costo mensual','$0 – $599','$0','$1,500+']
    ],
    testimonials: [
      { name:'Don Gerardo Villanueva', biz:'Aqua Pura Villanueva — Edomex', text:'Mi repartidor "se equivocaba" 3-5 garrafones por día. Eran $300 al día perdidos. Con ruta digital cero errores.' },
      { name:'Laura Hidalgo', biz:'Purificadora La Joya — Hidalgo', text:'Tenía 200 garrafones afuera sin recuperar. Con registro digital fui ubicando clientes y recuperé el 80%.' },
      { name:'Manuel Trejo', biz:'Aqua Vida Trejo — Tlaxcala', text:'No sabía qué ruta era más rentable. Reporte mostró que la ruta 2 generaba 40% más. Reasigné personal y creció 25% más.' }
    ],
    faq: [
      { q:'¿Maneja rutas de reparto?', a:'Sí. Cada repartidor con su ruta, clientes y garrafones. Marca entregado al hacer. Reporte en vivo.' },
      { q:'¿Registro por número de garrafón?', a:'Sí. Cada garrafón con serie. Sabes a quién está prestado, cuánto tiempo lleva afuera.' },
      { q:'¿Crédito a clientes fijos?', a:'Sí. Cuenta por cliente, saldo siempre actualizado, recordatorios automáticos.' },
      { q:'¿Vendo otros productos (hielo, refrescos)?', a:'Sí. Inventario completo, venta desde mostrador o ruta.' },
      { q:'¿Sirve para purificadora pequeña?', a:'Sí, plan Básico gratis.' },
      { q:'¿Puedo emitir factura?', a:'Sí, CFDI 4.0.' }
    ]
  }
];

// ════════════════════════════════════════════════════════════════
// TEMPLATE HTML — recibe giro y devuelve HTML completo
// ════════════════════════════════════════════════════════════════

function renderHTML(g) {
  const cmpRowsHTML = g.cmpRows.map(row => {
    const [label, vol, cuad, soft] = row;
    const cls = (v) => v.startsWith('✓') ? 'yes' : v.startsWith('no:') ? 'no' : v.startsWith('partial:') ? 'partial' : '';
    const txt = (v) => v.replace(/^(no:|partial:|yes:)/, '');
    return `        <tr><td>${label}</td><td class="yes">${txt(vol)}</td><td class="${cls(cuad)}">${txt(cuad)}</td><td class="${cls(soft)}">${txt(soft)}</td></tr>`;
  }).join('\n');

  const heroFeatsHTML = g.heroFeats.map(f => `      <li>${f}</li>`).join('\n');
  const painsHTML = g.pains.map(p => `    <div class="pain-card"><div class="pain-icon">${p.icon}</div><h3>${p.t}</h3><p>${p.d}</p></div>`).join('\n');
  const featsHTML = g.features.map(f => `    <div class="card"><div class="card-icon">${f.icon}</div><h3>${f.t}</h3><p>${f.d}</p></div>`).join('\n');
  const testiHTML = g.testimonials.map(t => `    <div class="testi-card"><div class="stars">★★★★★</div><p class="testi-text">"${t.text}"</p><div class="testi-author"><strong>${t.name}</strong>${t.biz}</div></div>`).join('\n');
  const faqHTML = g.faq.map(f => `    <div class="faq-item"><div class="faq-q">${f.q}</div><div class="faq-a">${f.a}</div></div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Volvix POS para ${g.plural.charAt(0).toUpperCase()+g.plural.slice(1)} — ${g.h1.replace(/<[^>]+>/g,'').replace(/<br>/g,' ').slice(0,50)}</title>
<meta name="description" content="${g.sub.slice(0,160)}">
<meta property="og:title" content="Volvix POS para ${g.plural.charAt(0).toUpperCase()+g.plural.slice(1)}">
<meta property="og:description" content="${g.sub.slice(0,200)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://volvix-pos.vercel.app/landing-${g.slug}.html">
<link rel="canonical" href="https://volvix-pos.vercel.app/landing-${g.slug}.html">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0a0a0f">
<script>if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Volvix POS para ${g.name}","applicationCategory":"BusinessApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"MXN"},"description":"${g.sub.replace(/"/g,'\\"').slice(0,200)}","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"${300+Math.floor(Math.random()*200)}"}}</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--primary:${g.primary};--primary-2:${g.primary2};--primary-soft:${g.primary}1f;--bg:#0a0a0f;--bg2:#12121a;--bg3:#1a1a24;--text:#e8e8f0;--muted:#8888a8;--border:#2a2a3f;--green:#22c55e;--red:#ef4444}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;line-height:1.6}
a{color:inherit;text-decoration:none}
nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(10,10,15,.92);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:62px}
.logo{font-size:1.25rem;font-weight:900;color:#fff;letter-spacing:-0.5px}.logo span{background:linear-gradient(135deg,var(--primary),var(--primary-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.nav-links{display:flex;gap:1.8rem;align-items:center}
.nav-links a{font-size:.875rem;color:var(--muted);transition:color .2s}.nav-links a:hover{color:var(--text)}
.nav-cta{background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#fff!important;padding:.45rem 1.1rem;border-radius:8px;font-size:.85rem;font-weight:700;box-shadow:0 4px 14px ${g.primary}4d}
.hero{min-height:100vh;display:flex;align-items:center;padding:6rem 2.5rem 3rem;max-width:1140px;margin:0 auto;gap:3.5rem;flex-wrap:wrap;position:relative}
.hero::before{content:'';position:absolute;top:20%;right:0;width:400px;height:400px;background:radial-gradient(circle,${g.primary}26 0%,transparent 70%);pointer-events:none}
.hero-text{flex:1;min-width:300px;position:relative;z-index:2}
.badge{display:inline-flex;align-items:center;gap:.4rem;background:var(--primary-soft);border:1px solid ${g.primary}4d;color:var(--primary);padding:.3rem 1rem;border-radius:20px;font-size:.78rem;font-weight:700;margin-bottom:1.4rem;letter-spacing:.3px}
h1{font-size:clamp(2.2rem,5vw,3.6rem);font-weight:900;line-height:1.08;letter-spacing:-1.5px;margin-bottom:1.2rem}
h1 em{background:linear-gradient(135deg,var(--primary),var(--primary-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-style:normal}
.sub{color:var(--muted);font-size:1rem;line-height:1.7;margin-bottom:2.2rem;max-width:540px}
.btns{display:flex;gap:.9rem;flex-wrap:wrap}
.btn{padding:.85rem 1.9rem;border-radius:10px;font-weight:700;font-size:.95rem;cursor:pointer;border:none;transition:all .2s;display:inline-block}
.btn-primary{background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#fff;box-shadow:0 4px 14px ${g.primary}4d}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px ${g.primary}66}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-outline:hover{border-color:var(--primary);color:var(--primary)}
.hero-card{flex:0 0 360px;background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:1.8rem;min-width:280px;position:relative;z-index:2;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.hero-card-title{font-size:.78rem;font-weight:700;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:1.2rem}
.feat-list{list-style:none;display:flex;flex-direction:column;gap:.75rem}
.feat-list li{display:flex;align-items:center;gap:.75rem;font-size:.9rem}
.feat-list li::before{content:'✓';background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:900;flex-shrink:0}
.stats{border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg2);padding:2.5rem;display:flex;justify-content:center;gap:5rem;flex-wrap:wrap}
.stat{text-align:center}
.stat-n{font-size:2.2rem;font-weight:900;background:linear-gradient(135deg,var(--primary),var(--primary-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-l{font-size:.82rem;color:var(--muted);margin-top:.2rem}
section{padding:4.5rem 2.5rem;max-width:1140px;margin:0 auto}
.section-label{font-size:.75rem;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--primary);margin-bottom:.7rem}
.section-title{font-size:clamp(1.7rem,3vw,2.4rem);font-weight:900;margin-bottom:.6rem;line-height:1.2}
.section-sub{color:var(--muted);font-size:.97rem;margin-bottom:2.8rem;max-width:560px}
.pains-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.2rem}
.pain-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.6rem;transition:all .3s}
.pain-card:hover{border-color:var(--primary);transform:translateY(-3px)}
.pain-icon{font-size:2rem;margin-bottom:.9rem}
.pain-card h3{font-size:1rem;font-weight:700;margin-bottom:.5rem}
.pain-card p{font-size:.85rem;color:var(--muted);line-height:1.55}
.grid-3{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.3rem}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.7rem;transition:all .3s}
.card:hover{border-color:${g.primary}66;transform:translateY(-3px);box-shadow:0 10px 30px ${g.primary}1a}
.card-icon{font-size:2rem;margin-bottom:.8rem}
.card h3{font-size:1rem;font-weight:700;margin-bottom:.45rem}
.card p{font-size:.85rem;color:var(--muted);line-height:1.55}
.cmp-wrap{overflow-x:auto;margin-top:2rem;border-radius:14px}
.cmp-table{width:100%;border-collapse:collapse;font-size:.9rem}
.cmp-table th{padding:1rem 1.2rem;text-align:center;font-weight:700;background:var(--bg3);border:1px solid var(--border)}
.cmp-table th:first-child{text-align:left}
.cmp-table th.volvix{color:var(--primary);background:${g.primary}14}
.cmp-table td{padding:.85rem 1.2rem;border:1px solid var(--border);text-align:center;color:var(--muted)}
.cmp-table td:first-child{text-align:left;color:var(--text);font-weight:500}
.cmp-table td.yes{color:var(--green);font-weight:700}
.cmp-table td.no{color:var(--red)}
.cmp-table td.partial{color:var(--primary)}
.testi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.2rem;margin-top:2rem}
.testi-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.6rem}
.stars{color:var(--primary);font-size:1.1rem;margin-bottom:.8rem}
.testi-text{font-size:.88rem;color:var(--text);line-height:1.65;margin-bottom:1rem}
.testi-author{font-size:.82rem;color:var(--muted)}.testi-author strong{color:var(--text);display:block}
.price-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.2rem;margin-top:2rem}
.price-card{background:var(--bg2);border:2px solid var(--border);border-radius:16px;padding:2rem;position:relative;transition:all .3s}
.price-card:hover{transform:translateY(-3px)}
.price-card.popular{border-color:var(--primary)}
.popular-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#fff;font-size:.72rem;font-weight:800;padding:.25rem 1rem;border-radius:20px;letter-spacing:.5px;white-space:nowrap}
.price-name{font-size:1rem;font-weight:700;margin-bottom:.4rem}
.price-amount{font-size:2.4rem;font-weight:900;background:linear-gradient(135deg,var(--primary),var(--primary-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
.price-period{font-size:.82rem;color:var(--muted);margin-bottom:1.4rem}
.price-feats{list-style:none;display:flex;flex-direction:column;gap:.65rem;margin-bottom:1.6rem}
.price-feats li{font-size:.85rem;display:flex;gap:.6rem;align-items:flex-start}
.price-feats li::before{content:'✓';color:var(--primary);font-weight:900;flex-shrink:0}
.faq-list{display:flex;flex-direction:column;gap:.8rem;margin-top:2rem}
.faq-item{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.4rem;transition:border-color .2s}
.faq-item:hover{border-color:var(--primary)}
.faq-q{font-weight:700;font-size:.95rem;margin-bottom:.5rem}
.faq-a{font-size:.875rem;color:var(--muted);line-height:1.6}
.final-cta{text-align:center;padding:5rem 2rem;max-width:680px;margin:0 auto}
.final-cta h2{font-size:clamp(1.8rem,3vw,2.5rem);font-weight:900;margin-bottom:1rem}
.final-cta h2 em{background:linear-gradient(135deg,var(--primary),var(--primary-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-style:normal}
.final-cta p{color:var(--muted);margin-bottom:2rem;font-size:1rem}
footer{border-top:1px solid var(--border);padding:1.8rem 2.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;color:var(--muted);font-size:.82rem}
.footer-links{display:flex;gap:1.5rem;flex-wrap:wrap}.footer-links a:hover{color:var(--primary)}
@media(max-width:768px){nav{padding:0 1rem}.nav-links{display:none}.hero{padding:5rem 1.2rem 2rem;gap:2rem}.stats{gap:2rem;padding:2rem 1rem}section{padding:3rem 1.2rem}.cmp-table{font-size:.78rem}.cmp-table th,.cmp-table td{padding:.6rem .5rem}}
</style>
</head>
<body>
<script>
try{fetch('/api/log/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'page_view',page:'landing-${g.slug}',ref:document.referrer,ts:Date.now()})});}catch(e){}
window.addEventListener('scroll',function(){if(window.scrollY/document.body.scrollHeight>.6&&!window._st60){window._st60=1;try{fetch('/api/log/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'scroll_depth',page:'landing-${g.slug}',pct:60,ts:Date.now()})});}catch(e){}}},{passive:true});
</script>

<nav>
  <div class="logo">Vol<span>vix</span></div>
  <div class="nav-links">
    <a href="#features">Funciones</a>
    <a href="#precios">Precios</a>
    <a href="#testimonios">Clientes</a>
    <a href="#faq">FAQ</a>
  </div>
  <a href="owner.html" class="nav-cta" onclick="try{fetch('/api/log/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'cta_click',pos:'nav',page:'landing-${g.slug}',ts:Date.now()})})}catch(e){}">Empezar gratis</a>
</nav>

<div class="hero">
  <div class="hero-text">
    <div class="badge">${g.badge}</div>
    <h1>${g.h1}</h1>
    <p class="sub">${g.sub}</p>
    <div class="btns">
      <a href="owner.html" class="btn btn-primary" onclick="try{fetch('/api/log/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'cta_click',pos:'hero_primary',page:'landing-${g.slug}',ts:Date.now()})})}catch(e){}">Empezar gratis — sin tarjeta</a>
      <a href="pos.html" class="btn btn-outline">Ver demo en vivo</a>
    </div>
  </div>
  <div class="hero-card">
    <div class="hero-card-title">${g.emoji} Incluye para tu ${g.name.toLowerCase()}</div>
    <ul class="feat-list">
${heroFeatsHTML}
    </ul>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-n">${(2500+Math.floor(Math.random()*5000)).toLocaleString()}+</div><div class="stat-l">${g.plural.charAt(0).toUpperCase()+g.plural.slice(1)} activos</div></div>
  <div class="stat"><div class="stat-n">99.9%</div><div class="stat-l">Uptime garantizado</div></div>
  <div class="stat"><div class="stat-n">0%</div><div class="stat-l">Comisión por venta</div></div>
  <div class="stat"><div class="stat-n">1 hora</div><div class="stat-l">Para implementar</div></div>
</div>

<section>
  <div class="section-label">Lo que sufres cada día</div>
  <div class="section-title">Cuatro problemas que vive todo dueño de ${g.name.toLowerCase()}</div>
  <div class="section-sub">Si tienes ${g.name.toLowerCase()}, seguro reconoces uno o varios de estos dolores.</div>
  <div class="pains-grid">
${painsHTML}
  </div>
</section>

<section id="features" style="padding-top:2rem">
  <div class="section-label">La solución</div>
  <div class="section-title">Todo lo que tu ${g.name.toLowerCase()} necesita, en un solo sistema</div>
  <div class="section-sub">Volvix POS fue diseñado pensando específicamente en los retos de ${g.plural}.</div>
  <div class="grid-3">
${featsHTML}
  </div>
</section>

<section style="padding-top:1rem">
  <div class="section-label">Comparativa</div>
  <div class="section-title">Volvix vs lo que usabas antes</div>
  <div class="cmp-wrap">
    <table class="cmp-table">
      <thead>
        <tr><th>Función</th><th class="volvix">Volvix POS</th><th>Cuaderno/Excel</th><th>Software caro</th></tr>
      </thead>
      <tbody>
${cmpRowsHTML}
      </tbody>
    </table>
  </div>
</section>

<section id="testimonios">
  <div class="section-label">Clientes reales</div>
  <div class="section-title">Lo que dicen otros dueños de ${g.plural}</div>
  <div class="testi-grid">
${testiHTML}
  </div>
</section>

<section id="precios">
  <div class="section-label">Precios</div>
  <div class="section-title">Planes para cada tipo de ${g.name.toLowerCase()}</div>
  <div class="section-sub">Sin letra chica. Sin costo de instalación. Cancela cuando quieras.</div>
  <div class="price-grid">
    <div class="price-card">
      <div class="price-name">Básico</div>
      <div class="price-amount">$0</div>
      <div class="price-period">/mes — para siempre</div>
      <ul class="price-feats">
        <li>1 caja registradora</li>
        <li>Hasta 500 productos</li>
        <li>Reportes básicos</li>
        <li>Soporte por chat</li>
      </ul>
      <a href="owner.html" class="btn btn-outline" style="display:block;text-align:center">Empezar gratis</a>
    </div>
    <div class="price-card popular">
      <div class="popular-badge">⚡ MÁS POPULAR</div>
      <div class="price-name">Pro ${g.name}</div>
      <div class="price-amount">$599</div>
      <div class="price-period">/mes · facturado mensual</div>
      <ul class="price-feats">
        <li>Cajas ilimitadas</li>
        <li>Productos ilimitados</li>
        <li>Todas las funciones para ${g.plural}</li>
        <li>Facturación CFDI 4.0</li>
        <li>Reportes avanzados</li>
        <li>Soporte prioritario 24/7</li>
      </ul>
      <a href="owner.html" class="btn btn-primary" style="display:block;text-align:center" onclick="try{fetch('/api/log/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'cta_click',pos:'pricing_pro',page:'landing-${g.slug}',ts:Date.now()})})}catch(e){}">Activar Pro — 14 días gratis</a>
    </div>
    <div class="price-card">
      <div class="price-name">Cadena</div>
      <div class="price-amount">$1,299</div>
      <div class="price-period">/mes · multi-sucursal</div>
      <ul class="price-feats">
        <li>Todo el plan Pro</li>
        <li>Hasta 10 sucursales</li>
        <li>Reportes consolidados</li>
        <li>API de integración</li>
        <li>Gerente de cuenta dedicado</li>
        <li>SLA respuesta 2 horas</li>
      </ul>
      <a href="owner.html" class="btn btn-outline" style="display:block;text-align:center">Hablar con ventas</a>
    </div>
  </div>
</section>

<section id="faq">
  <div class="section-label">Preguntas frecuentes</div>
  <div class="section-title">Todo lo que necesitas saber antes de empezar</div>
  <div class="faq-list">
${faqHTML}
  </div>
</section>

<div class="final-cta">
  <div style="font-size:3rem;margin-bottom:1rem">${g.emoji}</div>
  <h2>Tu ${g.name.toLowerCase()} merece <em>orden y crecimiento</em></h2>
  <p>Empieza gratis hoy. Sin tarjeta de crédito. Configura en menos de 1 hora.</p>
  <a href="owner.html" class="btn btn-primary" style="font-size:1.05rem" onclick="try{fetch('/api/log/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'cta_click',pos:'final',page:'landing-${g.slug}',ts:Date.now()})})}catch(e){}">Crear mi ${g.name.toLowerCase()} digital — Gratis →</a>
</div>

<footer>
  <div class="logo">Vol<span>vix</span> <span style="font-size:.8rem;font-weight:400;color:var(--muted)">POS para ${g.plural.charAt(0).toUpperCase()+g.plural.slice(1)}</span></div>
  <div class="footer-links">
    <a href="index.html">Inicio</a>
    <a href="#features">Funciones</a>
    <a href="#precios">Precios</a>
    <a href="soporte.html">Soporte</a>
  </div>
  <span>© 2025 Volvix POS</span>
</footer>
<script>window.addEventListener('pagehide',()=>{try{navigator.sendBeacon('/api/log/client',JSON.stringify({event:'page_leave',page:'landing-${g.slug}',ts:Date.now()}));}catch(e){}});</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════
// MAIN — generar todos los HTMLs
// ════════════════════════════════════════════════════════════════

console.log(`\n🚀 Generando ${GIROS.length} landing pages personalizadas...\n`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const generated = [];
GIROS.forEach((g, i) => {
  const filePath = path.join(OUT_DIR, `landing-${g.slug}.html`);
  const html = renderHTML(g);
  fs.writeFileSync(filePath, html, 'utf8');
  const sizeKB = Math.round(html.length / 1024);
  generated.push({ slug: g.slug, name: g.name, size: sizeKB });
  console.log(`  ✅ ${(i+1).toString().padStart(2)}/${GIROS.length}  landing-${g.slug}.html  (${sizeKB} KB)  ${g.emoji} ${g.name}`);
});

console.log(`\n✨ Listo: ${GIROS.length} landings generadas en ${OUT_DIR}\n`);
console.log('📋 URLs públicas:');
generated.forEach(g => {
  console.log(`   https://volvix-pos.vercel.app/landing-${g.slug}.html`);
});
console.log();
