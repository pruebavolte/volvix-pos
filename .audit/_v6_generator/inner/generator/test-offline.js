// ============================================================
// TEST OFFLINE — simula respuesta de AI para validar el flujo
// completo sin necesitar API keys.
// ============================================================

const fs   = require('fs').promises;
const path = require('path');

// Mock fetch BEFORE requiring brand-generator

// Mock: respuesta del AI para "nevería"
const FAKE_AI_RESPONSE = JSON.stringify({
  slug: "neveria",
  brand: "Nevero",
  tagline: "El sistema para neverías mexicanas que sí cuentan cada bola",
  giro: "nevería",
  giroPlural: "neverías",
  vibe: "vibrant",
  palette: {
    bg: "#FEF6F0", surface: "#FFFFFF", paper: "#FFE8D6",
    ink: "#1F1410", ink2: "#3D2614", muted: "#8B6B5C",
    line: "#F5C6A0", accent: "#EC4899", accent2: "#0EA5E9"
  },
  fonts: {
    display: "Archivo Black",
    body: "Inter",
    script: "Caveat",
    mono: "Space Mono"
  },
  hero: {
    eyebrow: "El sistema POS para neverías mexicanas",
    h1: "Cada <em>bola</em>.<br>Cada <em>cono</em>.<br>Contado.",
    deck: "Báscula integrada para vender por peso o por bola, control de mermas por derretido, y combos automáticos. Para neverías que no quieren regalar la utilidad.",
    ctaPrimary: "Empezar gratis",
    ctaSecondary: "Ver demo",
    metaLine: "$0 inicial · setup en 5 min · funciona en cualquier báscula"
  },
  imageQueries: [
    "ice cream shop colorful mexican",
    "scoops of ice cream variety",
    "ice cream cone classic",
    "nieves de garrafa mexico",
    "gelato display case",
    "popsicle paleta mexican",
    "ice cream sundae photo",
    "ice cream truck colorful",
    "ice cream parlor interior",
    "fresh ice cream scooping",
    "person serving ice cream",
    "ice cream parlor counter mexican",
    "ice cream toppings sprinkles"
  ],
  features: [
    { ico: "archive", h: "Báscula para nieves de garrafa", d: "Vende por peso (kg o gramos) o por bola. La báscula te calcula el precio al instante." },
    { ico: "edit",    h: "Combos: cono + bolas + topping", d: "Define combos con precio especial. El cliente arma su combinación, tú cobras lo justo." },
    { ico: "shuffle", h: "Sabores y disponibilidad", d: "Marca el sabor como agotado en 2 toques. Aparece en gris para no decepcionar clientes." },
    { ico: "bell",    h: "Alerta de merma diaria", d: "Cuánta nieve se derritió hoy. Si supera 5%, alerta. Identifica problemas de refrigeración." },
    { ico: "gift",    h: "Cliente frecuente", d: "Doña Lupita lleva 10 conos en el mes. Cono 11 va por la casa, automático." },
    { ico: "message", h: "Pedidos para fiestas", d: "Cliente pide 50 conos para una posada con anticipo. Sistema cuadra fecha + ingredientes." }
  ],
  stats: [
    { v: "47",  l: "Sabores activos hoy" },
    { v: "230", l: "Bolas vendidas hoy" },
    { v: "5",   l: "Min de setup", suffix: "min" },
    { v: "0",   l: "Costo inicial", prefix: "$" }
  ],
  quote: {
    text: "Mi merma estaba en 18%. <span class=\"hl\">Con Nevero detecté que el freezer del fondo subía 4 grados de noche</span>. Cambié el termostato y ahora mi merma es 4%. Recuperé $3,000 al mes.",
    sig: "Don Sebastián",
    role: "Nevería en la plaza · Saltillo, COA"
  },
  thefts: [
    {
      title: "Bolas \"extra grandes\" por amistad",
      rob: "El empleado le sirve a sus conocidos bolas dobles cobrándoles una. Una bola cuesta $25, pero le pesa 200g cuando debería ser 100g. En una semana son $800 perdidos.",
      fix: "Báscula integrada al ticket: la nieve <strong>se pesa al servir</strong>. Si pesa más de lo cobrado, alerta visual. Reporte diario de peso promedio por empleado."
    },
    {
      title: "Sabores premium vendidos como básicos",
      rob: "Pistache, ron con pasas, mole — esos cuestan el triple que vainilla o chocolate. Empleado cobra como básico, regala upgrade a su conocido, se queda con la diferencia.",
      fix: "Cada sabor tiene su <strong>categoría y precio fijos</strong>. No puedes cobrar pistache a precio de vainilla — el sistema bloquea. Cambios de precio requieren PIN."
    },
    {
      title: "Conos \"de regalo\" sin control",
      rob: "\"Es que se le cayó la primera al cliente\". Empleado se come o regala conos. Sin merma justificada, las cajas con palitos / conos / vasitos bajan misteriosamente.",
      fix: "Reposición justificada: cono caído exige <strong>foto del piso</strong>. Reporte mensual de reposiciones por empleado: si suben las de Jorge, sabes el patrón."
    }
  ],
  liveDemo: {
    type: "stock",
    eyebrow: "Sabores en vivo",
    title: "Tus sabores, <em>al vuelo</em>",
    deck: "Cada sabor con su stock, su categoría y su disponibilidad. Cuando se acaba el pistache, el sistema lo marca como agotado para que la mesera no lo ofrezca.",
    secondary: "Y al cierre del día sabes cuánta nieve queda en cada bote — sin abrir el freezer.",
    data: {
      product: "Sabores del día",
      tallas: ["Garrafa","Bote 1L","Bote 2L","Conos","Palitos","Vasitos","Cucharas","Topping"],
      stock: [
        { color: "Vainilla",   vals: [3, 5, 2, 80, 60, 50, 100, 8] },
        { color: "Chocolate",  vals: [2, 4, 1, 80, 60, 50, 100, 6] },
        { color: "Pistache",   vals: [0, 1, 0, 80, 60, 50, 100, 2] }
      ],
      lowThreshold: 2
    }
  }
});

// Mock the AI call
const originalFetch = global.fetch;
global.fetch = async function(url, opts) {
  if (typeof url === 'string' && url.includes('anthropic.com')) {
    return {
      ok: true,
      json: async () => ({ content: [{ text: FAKE_AI_RESPONSE }] })
    };
  }
  if (typeof url === 'string' && url.includes('api.unsplash.com')) {
    // Mock image search
    return {
      ok: true,
      json: async () => ({
        results: [{
          urls: { raw: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f' },
          alt_description: 'mock image',
          user: { name: 'Test User' },
        }]
      })
    };
  }
  return originalFetch(url, opts);
};

// Set fake keys to pass the if-check
process.env.ANTHROPIC_API_KEY = 'sk-fake';
process.env.UNSPLASH_ACCESS_KEY = 'fake';

const { generateBrand } = require('./brand-generator');

(async () => {
  console.log('▸ Generando "nevería" (mock AI)...\n');
  const start = Date.now();
  const result = await generateBrand('nevería', { preRender: true });
  const elapsed = Date.now() - start;
  console.log(`✓ Generado en ${elapsed}ms`);
  console.log(`  slug:  ${result.slug}`);
  console.log(`  brand: ${result.config.brand}`);
  console.log(`  vibe:  ${result.config.vibe}`);
  console.log(`  cached: ${result.cached}`);
  console.log(`  hero img: ${result.config.images.hero}`);
  console.log(`  showcase: ${result.config.images.showcase.length} imgs`);
  console.log(`  context:  ${result.config.images.context.length} imgs`);

  // Verify cache works
  console.log('\n▸ Generando de nuevo (debe leer del caché)...');
  const r2 = await generateBrand('nevería');
  console.log(`✓ cached: ${r2.cached} ← debe ser true`);

  // Verify files exist
  console.log('\n▸ Verificando archivos generados:');
  const cachePath = path.join(__dirname, '..', 'cache', 'neveria.json');
  const htmlPath = path.join(__dirname, '..', 'landings', 'neveria.html');
  try {
    const cacheStat = await fs.stat(cachePath);
    console.log(`  ${cachePath} (${(cacheStat.size/1024).toFixed(1)}KB)`);
  } catch { console.log('  ✗ cache file missing'); }
  try {
    const htmlStat = await fs.stat(htmlPath);
    console.log(`  ${htmlPath} (${(htmlStat.size/1024).toFixed(1)}KB)`);
  } catch { console.log('  ✗ html file missing'); }

  console.log('\n✅ Sistema funciona end-to-end');
})().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
