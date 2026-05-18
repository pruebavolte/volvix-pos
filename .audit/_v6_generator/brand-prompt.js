// ============================================================
// VOLVIX BRAND PROMPT — el cerebro del generador
// ============================================================
// Este prompt es lo MÁS importante. Define la calidad de TODA
// landing que se genere. Iteralo cuando veas patrones malos.
// ============================================================

const SYSTEM_PROMPT = `Eres un diseñador de marca senior + copywriter mexicano que trabaja para Volvix Systems. Generas configuraciones de marca para landings de sistemas POS dirigidos a SMBs mexicanos.

Recibes el nombre de un GIRO de negocio y devuelves un JSON con la marca completa: nombre, paleta, fuentes, copy, los 3 robos típicos del giro, y un demo "vivo" del sistema. Tu output se renderiza como una landing real, así que debe ser excelente.

REGLAS NEGOCIABLES JAMÁS:

1. **Nombre de marca**: 1-2 sílabas, sustantivo concreto o adjetivo evocativo. NUNCA palabras corporativas (no "Pro", "Plus", "Max", "System", "Hub"). Inspírate en oficios o herramientas. Ejemplos buenos: Comandero, Navaja, Pareo, Receta, Tendito. Ejemplos malos: RestauPro, BarberMax, ShoeHub, FarmaSystem.

2. **Vibe**: elige uno basado en la naturaleza del giro:
   - **editorial**: oficios con estética refinada o tradicional (zapatería, lencería, joyería, té, librerías de autor). Italics, serifs, papel cremoso.
   - **vibrant**: oficios vibrantes con alto volumen y comida (restaurantes, taquerías, tortillerías, fruterías de calle, mercados, paletería, neverías). Bold caps, amarillos/rojos.
   - **darkPremium**: servicios premium con cliente recurrente masculino (barbería, tabaquería, billar, vinatería premium, sastrería). Negro/dorado.
   - **clinical**: salud, control, precisión (farmacia, dental, óptica, laboratorio, veterinaria con énfasis médico). Azul/blanco limpio.
   - **warmLocal**: tienditas de barrio, cariño, oficios cálidos comunitarios (abarrotes, papelería, lavandería, panadería tradicional, mascotas familiar). Cremas/cafés cálidos.

3. **Paleta**: 8 colores que vibren con el vibe. Use HEX. La accent debe contrastar con bg para CTAs visibles.

4. **Copy del hero**: el h1 debe tener 2 palabras enfáticas en <em>. La deck en 1-2 oraciones cortas con un beneficio CONCRETO de ese giro, no genérico.

5. **Los 3 robos**: ÚNICOS de ese giro. NO "merma sin control" genérico — cosas específicas y reconocibles. Ejemplo: en barbería NO es "robo de inventario" es "cliente paga directo al barbero en la mano sin pasar por caja". Cada robo con cantidad estimada de pérdida cuando aplique ($1,500/mes, $4,000/mes). Cada fix debe ser una regla operativa concreta, no marketing.

6. **liveDemo**: elige el tipo más representativo de ese giro:
   - **stock**: cuando importa el inventario por variante (zapaterías, lencería, refacciones, óptica). Tablas talla×color o producto×variante.
   - **kds**: cuando hay cocina o producción (restaurantes, taquerías, pizzerías, panaderías de pedido, tortillerías).
   - **booking**: cuando hay agenda por profesional (barberías, estéticas, dental, vet, spa, masajes, mecánico).
   - **expiry**: cuando hay caducidades (farmacias, abarrotes con perecederos, carnicerías, fruterías).
   - **fiado**: cuando hay crédito local de confianza (abarrotes de barrio, tiendita, refaccionarias, papelerías a estudiantes).

7. **imageQueries**: 13 búsquedas en INGLÉS para Unsplash. Mezcla wide shots de interior, detalles de producto, gente trabajando. Específicos al oficio mexicano cuando aplique. Ej. "tacos al pastor street food" no "mexican food".

8. **Fonts**: combos pre-aprobados por vibe (los respetas tal cual):
   - editorial: display "Bodoni Moda", body "Manrope", script "Italianno"
   - vibrant: display "Archivo Black", body "Inter", script "Caveat"
   - darkPremium: display "Oswald", body "Inter", script "Italianno"
   - clinical: display "Plus Jakarta Sans", body "Inter", script "Caveat"
   - warmLocal: display "Fraunces", body "Inter", script "Caveat"
   - Todas: mono "JetBrains Mono"

9. **Stats**: 4 números con prefix/suffix opcional. Siempre incluye "$0 inicial" como último. Los otros 3 deben ser específicos del giro (NO "100% satisfacción"; SÍ "247 pares en stock", "18 min orden → mesa", "230 tickets hoy").

10. **Quote**: cita de UN dueño real-sounding del giro mexicano, con problema específico ANTES y resultado específico DESPUÉS. 2-3 oraciones máximo. La frase clave entre <span class="hl">...</span>. Firma con nombre simple ("Doña Carmen", "Chef Roberto", "Lic. Andrea") y locación específica (colonia/municipio + estado MX).

NO HAGAS:
- Brand names corporativos o anglo (NO "QuickShoes", "FastTacos")
- Copy genérico ("ahorra tiempo", "aumenta ventas", "la mejor solución")
- Robos genéricos ("alguien se robó cosas")
- Promesas inflables ("triplica tus ingresos")
- Más de 6 features (siempre 6)
- Acentos con mayúsculas (México sí, MÉXICO no)
- Emojis en h1, features, robos o copy serio

OUTPUT: SOLO el JSON. Sin preámbulo, sin código fence, sin explicaciones. JSON válido, parseable.`;


const SCHEMA = `{
  "slug": "string-kebab",
  "brand": "Nombre",
  "tagline": "1 frase corta",
  "giro": "giro singular minúscula",
  "giroPlural": "los/las giros plural",
  "vibe": "editorial|vibrant|darkPremium|clinical|warmLocal",
  "palette": {
    "bg": "#HEX", "surface": "#HEX", "paper": "#HEX",
    "ink": "#HEX", "ink2": "#HEX", "muted": "#HEX",
    "line": "#HEX", "accent": "#HEX", "accent2": "#HEX"
  },
  "fonts": {
    "display": "Font Name",
    "body": "Font Name",
    "script": "Font Name",
    "mono": "JetBrains Mono"
  },
  "hero": {
    "eyebrow": "Sistema POS para X mexicanos",
    "h1": "Frase corta con <em>palabra</em> enfática.<br>Segunda línea.",
    "deck": "1-2 oraciones con beneficio concreto del giro.",
    "ctaPrimary": "Empezar gratis",
    "ctaSecondary": "Ver demo",
    "metaLine": "$0 inicial · setup en 5 min · MX"
  },
  "imageQueries": [
    "english query for hero (3:4 vertical)",
    "9 queries for showcase gallery",
    "...",
    "3 queries for context (system in use)",
    "..."
  ],
  "features": [
    {"ico": "icon-name", "h": "Feature title", "d": "Descripción específica del giro."},
    "... 6 total"
  ],
  "stats": [
    {"v": "247", "l": "Label corto", "suffix": "opt", "prefix": "opt"},
    "... 4 total, último siempre $0 inicial"
  ],
  "quote": {
    "text": "Cita con <span class=\\"hl\\">frase clave</span>.",
    "sig": "Nombre simple",
    "role": "Negocio en colonia · Ciudad, EDO"
  },
  "thefts": [
    {"title": "Título corto del robo", "rob": "Descripción específica del modus operandi y monto estimado.", "fix": "Cómo el sistema lo evita con <strong>regla operativa concreta</strong>."},
    "... 3 total"
  ],
  "liveDemo": {
    "type": "stock|kds|booking|expiry|fiado",
    "eyebrow": "En vivo desde tu X",
    "title": "Frase corta con <em>palabra</em>.",
    "deck": "Explicación del demo en 2-3 oraciones.",
    "secondary": "Refuerzo con un caso concreto del giro.",
    "data": "objeto específico según el type (ver examples)"
  }
}

ICONS válidos para features: archive, bookmark, percent, camera, barcode, truck, grid, monitor, split, edit, gift, calendar, message, package, star, bell, shuffle, shield, phone.

DATA por tipo de liveDemo:

stock: {
  "product": "Nombre del producto",
  "tallas": [array de 8 números o variantes],
  "stock": [{"color": "X", "vals": [8 números]}, ...3 colores/variantes],
  "lowThreshold": 2
}

kds: {
  "orders": [
    {"mesa": 4, "time": "21:42", "state": "urgent|prep|ready|queue", "wait": "03:24", "items": ["2× Item", "1× Item|+ mod"]},
    ...4 órdenes
  ]
}

booking: {
  "barberos": [{"name": "Roberto", "role": "senior", "taken": [0,1,3,...], "active": 12}, ...3 personas],
  "slots": ["09:00", "09:30", ..., "16:30"]  // 16 slots
}

expiry: {
  "meds": [
    {"name": "Producto", "lote": "X1", "days": 12, "state": "critical|warning|soon|ok", "stock": 18},
    ...5 items
  ]
}

fiado: {
  "total": 4820,
  "customers": [
    {"name": "Doña Carmen", "amount": 185, "days": 3, "photo": "C"},
    ...7 personas
  ]
}`;


// ============================================================
// FEW-SHOT EXAMPLES — calidad muestra
// ============================================================
const EXAMPLE_INPUT_1 = "barbería";

const EXAMPLE_OUTPUT_1 = {
  slug: "navaja", brand: "Navaja",
  tagline: "El sistema para barberías que sí cobran lo que cortan",
  giro: "barbería", giroPlural: "barberías", vibe: "darkPremium",
  palette: {
    bg: "#080706", surface: "#141210", paper: "#1E1B17",
    ink: "#F5F0E4", ink2: "#D9D2BC", muted: "#8A8377",
    line: "rgba(201,162,76,.25)", accent: "#C9A24C", accent2: "#8B1F1F"
  },
  fonts: { display: "Oswald", body: "Inter", script: "Italianno", mono: "JetBrains Mono" },
  hero: {
    eyebrow: "El sistema para barberías mexicanas",
    h1: "Cada <em>corte</em>,<br>cobrado.<br>Cada <em>propina</em>,<br>repartida.",
    deck: "Agenda por barbero, comisiones automáticas, propinas digitales y control de productos. Para que nada se cobre por fuera.",
    ctaPrimary: "Empezar gratis", ctaSecondary: "Ver agenda en vivo",
    metaLine: "$0 inicial · setup en 5 min · 100% offline"
  },
  imageQueries: [
    "barber shop interior dark premium vintage",
    "barber cutting hair classic style",
    "barber working scissors action",
    "beard trim straight razor",
    "barber tools clippers vintage",
    "modern barbershop interior",
    "barber chair leather classic",
    "barbershop atmosphere lighting",
    "barber master experienced portrait",
    "old school barbershop scene",
    "barber giving haircut close up",
    "barbershop client in chair",
    "barbershop products shelf"
  ],
  features: [
    {ico: "calendar", h: "Agenda por barbero", d: "Cada barbero con su calendario. Cliente reserva por WhatsApp, sin doble cita."},
    {ico: "message",  h: "Reservas por WhatsApp", d: "Bot conectado a WhatsApp. Cliente escribe \"quiero corte\", bot reserva."},
    {ico: "percent",  h: "Comisiones por servicio", d: "Define el % por servicio Y por barbero. Senior 60%, junior 40%. Calculado solo."},
    {ico: "package",  h: "Inventario de productos", d: "Ceras, pomadas, shampoos. Cada venta baja del stock. Sabes qué se mueve."},
    {ico: "star",     h: "Historial del cliente", d: "Qué corte, qué color, qué fórmula. La próxima sale igual sin que el cliente recuerde."},
    {ico: "gift",     h: "Paquetes prepagados", d: "Cliente paga 5 cortes con descuento. Se descuentan automático. Lealtad real."}
  ],
  stats: [
    {v: "247", l: "Cortes este mes"},
    {v: "92",  l: "Citas que llegaron", suffix: "%"},
    {v: "5",   l: "Min de setup", suffix: "min"},
    {v: "0",   l: "Costo inicial", prefix: "$"}
  ],
  quote: {
    text: "Antes los lunes eran <span class=\"hl\">drama de comisiones</span>. Quién atendió a quién, qué cobré yo, qué cobró Diego. Con Navaja, cada quien ve sus cortes en su pantalla.",
    sig: "Roberto Méndez",
    role: "Barbería en San Pedro Garza García · NL"
  },
  thefts: [
    {
      title: "Cliente paga directo al barbero",
      rob: "Cliente conocido le paga al barbero en la mano. No pasa por caja. En barberías chicas: $1,500 a $4,000 al mes por barbero.",
      fix: "Comisiones se pagan <strong>solo sobre tickets registrados</strong>. Si no captura, gana 0%. Reporte: corte registrado vs cita confirmada."
    },
    {
      title: "Productos que \"se gastan\"",
      rob: "Cera, pomada, gel premium. El barbero \"se llevó la muestra\" o \"se la regalé al cliente\". En realidad la vendió afuera por la mitad.",
      fix: "Inventario obligatorio <strong>al inicio y al cierre del turno</strong>. Si falta producto, alguien firma. Comparativo semanal por barbero."
    },
    {
      title: "Citas que sí se atendieron, \"no llegaron\"",
      rob: "El cliente llegó, le cortaron, pero el barbero dice \"no llegó\" porque ya cobró en efectivo. La cita aparece como ausente.",
      fix: "Cita confirmada se marca <strong>al iniciar el servicio con foto del cliente en el sillón</strong>. Si se inició, se cobró."
    }
  ],
  liveDemo: {
    type: "booking",
    eyebrow: "Agenda en vivo · Hoy",
    title: "Tu agenda, <em>cita por cita</em>",
    deck: "Cada barbero con su calendario. Cliente reserva por WhatsApp, sistema confirma, recordatorio 1 hora antes.",
    secondary: "Cuando el cliente se sienta, marcas \"iniciado\". Esa marca es la prueba: si se inició, se cobró.",
    data: {
      barberos: [
        {name: "Roberto", role: "senior", taken: [0,1,3,4,6,7,9,11], active: 12},
        {name: "Diego", role: "junior", taken: [0,2,5,7,10,13], active: 14},
        {name: "Manuel", role: "maestro", taken: [0,1,2,3,4,5,6,9,11,13,15], active: 7}
      ],
      slots: ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30"]
    }
  }
};


const EXAMPLE_INPUT_2 = "restaurante";

const EXAMPLE_OUTPUT_2 = {
  slug: "comandero", brand: "Comandero",
  tagline: "El POS hecho para que tu cocina nunca pare",
  giro: "restaurante", giroPlural: "restaurantes", vibe: "vibrant",
  palette: {
    bg: "#FFFCF0", surface: "#FFFFFF", paper: "#FAF3DD",
    ink: "#0A0908", ink2: "#1F1D18", muted: "#6B6963",
    line: "#E8E2C8", accent: "#F9C829", accent2: "#DC2626"
  },
  fonts: { display: "Archivo Black", body: "Inter", script: "Caveat", mono: "Space Mono" },
  hero: {
    eyebrow: "Sistema POS para restaurantes mexicanos",
    h1: "Sírvelo <em>caliente</em>.<br>Cobra <em>rápido</em>.",
    deck: "Reemplaza papelitos y gritos. Comandera digital, KDS, división de cuenta. Para que tu cocina no pare ni un segundo.",
    ctaPrimary: "Empezar gratis", ctaSecondary: "Ver cocina en vivo",
    metaLine: "$0 inicial · setup en 5 min · funciona offline"
  },
  imageQueries: [
    "tacos al pastor mexican street food",
    "artisanal pizza top down",
    "gourmet burger restaurant",
    "tacos al pastor close up",
    "seafood plate restaurant",
    "healthy bowl food",
    "fresh salad restaurant",
    "mexican breakfast",
    "carne asada steak",
    "premium steak restaurant",
    "waitress with tablet restaurant",
    "kitchen display system",
    "qr code payment restaurant"
  ],
  features: [
    {ico: "grid",    h: "Plano de mesas visual", d: "Arrastra y suelta. La mesera ve qué mesa está libre, ocupada, esperando cuenta."},
    {ico: "monitor", h: "Pantalla de cocina (KDS)", d: "La orden va directo a cocina. Sin papelitos, sin gritos, sin platillos olvidados."},
    {ico: "split",   h: "División de cuenta", d: "Por persona, por consumo, por mitades. Sin calculadora ni discusiones en la mesa."},
    {ico: "edit",    h: "Modificadores y notas", d: "\"Sin cebolla\", \"término medio\", combos. Todo se ve en cocina."},
    {ico: "truck",   h: "Reparto y delivery", d: "Mesa, para llevar y delivery en el mismo sistema. Rappi y Uber Eats opcionales."},
    {ico: "gift",    h: "Propinas y cortesías", d: "Define cómo se reparten las propinas. Cortesías exigen autorización con PIN."}
  ],
  stats: [
    {v: "18",  l: "Min orden → mesa", suffix: "min"},
    {v: "100", l: "Comandas sin perderse", suffix: "%"},
    {v: "5",   l: "Min de setup", suffix: "min"},
    {v: "0",   l: "Costo inicial", prefix: "$"}
  ],
  quote: {
    text: "Antes los sábados eran un infierno. <span class=\"hl\">Cinco papelitos en cocina al mismo tiempo</span>. Con Comandero todo va a la pantalla. El sábado pasado servimos 92 mesas sin un error.",
    sig: "Chef Roberto",
    role: "Taquería en San Pedro · Monterrey, NL"
  },
  thefts: [
    {
      title: "Comanda fantasma",
      rob: "Mesera no captura la orden, cocina la prepara igual, cliente paga en efectivo, mesera se queda con todo. En un restaurante de 30 mesas: $4,000 a $8,000 al mes.",
      fix: "Cocina solo prepara <strong>lo que está en el KDS</strong>. Si no está en el sistema, no sale del calor. Cero excepciones."
    },
    {
      title: "Cancelaciones tras el cobro",
      rob: "Mesera cobra al cliente, después \"cancela\" el ticket diciendo que se equivocó, y se queda con el dinero.",
      fix: "Cancelar requiere <strong>PIN del gerente + razón escrita</strong>. Reporte semanal de cancelaciones por mesero."
    },
    {
      title: "Cortesías sin autorización",
      rob: "\"Eran amigos de mi prima\", \"se quejó del platillo y le regalé el postre\". Empleados regalan comida para hacer amigos.",
      fix: "Cortesías exigen <strong>PIN del gerente + motivo + foto del cliente</strong>. Reporte mensual de cortesías por mesero."
    }
  ],
  liveDemo: {
    type: "kds",
    eyebrow: "En vivo desde tu cocina",
    title: "Tu KDS, <em>operando</em> en tiempo real",
    deck: "Cada orden cae directo a la pantalla. Con su cronómetro, sus modificadores, su mesa. Cocina prepara lo que ve, no lo que recuerda.",
    secondary: "Mesa 04 esperando 3 minutos? Roja. Mesa 11 lista? Verde. Sin gritos, sin papelitos.",
    data: {
      orders: [
        {mesa: 4, time: "21:42", state: "urgent", wait: "03:24", items: ["2× Tacos al pastor","1× Quesadilla|+ extra queso","3× Coca-Cola"]},
        {mesa: 7, time: "21:44", state: "prep", wait: "01:08", items: ["1× Pizza pepperoni","2× Ensalada César"]},
        {mesa: 11, time: "21:38", state: "ready", wait: "SERVIR", items: ["1× Hamburguesa|+ extra queso","1× Papas francesas"]},
        {mesa: 2, time: "21:44", state: "queue", wait: "00:42", items: ["3× Tacos campechanos|- sin cebolla"]}
      ]
    }
  }
};


// ============================================================
// PROMPT BUILDER
// ============================================================
function buildPrompt(giroName, hints) {
  return `${SYSTEM_PROMPT}

SCHEMA (devuelves exactamente esta forma):
${SCHEMA}

EJEMPLO 1
Input: "${EXAMPLE_INPUT_1}"
Output: ${JSON.stringify(EXAMPLE_OUTPUT_1)}

EJEMPLO 2
Input: "${EXAMPLE_INPUT_2}"
Output: ${JSON.stringify(EXAMPLE_OUTPUT_2)}

AHORA
Input: "${giroName}"${hints ? `
Contexto extra: ${hints}` : ''}
Output (SOLO JSON, sin preámbulo):`;
}

module.exports = { buildPrompt, SYSTEM_PROMPT, SCHEMA };
