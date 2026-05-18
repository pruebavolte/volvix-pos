// ============================================================
// VOLVIX BRAND GENERATOR
// ============================================================
// generateBrand(giroName) → { config, html, slug, cached }
//
// Flujo:
// 1. Normaliza giro y verifica cache (DB o filesystem)
// 2. Si no existe: llama AI con el prompt para generar config
// 3. Valida el config
// 4. Busca imágenes en Unsplash por cada imageQuery
// 5. Renderiza HTML usando el template del motor
// 6. Guarda config + HTML
// 7. Devuelve la URL
// ============================================================

const fs   = require('fs').promises;
const path = require('path');
const { buildPrompt } = require('./brand-prompt');
const { searchImage } = require('./image-search');
const { renderHTML }  = require('./render');

// CONFIGURACIÓN — ajusta a tu setup
const CONFIG = {
  CACHE_DIR:        path.join(__dirname, '..', 'cache'),
  OUTPUT_DIR:       path.join(__dirname, '..', 'landings'),

  // AI provider (escoge uno)
  AI_PROVIDER:      'anthropic',  // 'anthropic' | 'openai'
  ANTHROPIC_KEY:    process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL:  'claude-opus-4-7',  // o claude-sonnet-4-6 para más barato
  OPENAI_KEY:       process.env.OPENAI_API_KEY,
  OPENAI_MODEL:     'gpt-4o',

  // Image provider
  UNSPLASH_KEY:     process.env.UNSPLASH_ACCESS_KEY,

  // Behavior
  FORCE_REGENERATE: false,  // true = ignora cache (solo dev)
  MAX_RETRIES:      2,
};

// ============================================================
// NORMALIZE GIRO (slug)
// ============================================================
function normalizeSlug(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================
// CACHE — lookup existing
// ============================================================
async function checkCache(slug) {
  const configPath = path.join(CONFIG.CACHE_DIR, `${slug}.json`);
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCache(slug, config) {
  await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
  const configPath = path.join(CONFIG.CACHE_DIR, `${slug}.json`);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// ============================================================
// AI CALL
// ============================================================
async function callAI(prompt) {
  if (CONFIG.AI_PROVIDER === 'anthropic') {
    return callAnthropic(prompt);
  } else {
    return callOpenAI(prompt);
  }
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CONFIG.ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${CONFIG.OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: CONFIG.OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ============================================================
// PARSE & VALIDATE
// ============================================================
function parseConfig(rawText) {
  // El AI a veces incluye ```json fences o preámbulo. Limpiamos.
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  // A veces hay texto antes del primer { — extraer
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('AI response not JSON. Got: ' + rawText.slice(0, 200));
  }
  text = text.slice(start, end + 1);
  return JSON.parse(text);
}

function validate(config) {
  const required = ['slug','brand','tagline','giro','giroPlural','vibe','palette','fonts','hero','imageQueries','features','stats','quote','thefts','liveDemo'];
  for (const k of required) {
    if (!config[k]) throw new Error(`Missing field: ${k}`);
  }
  if (!['editorial','vibrant','darkPremium','clinical','warmLocal'].includes(config.vibe)) {
    throw new Error(`Invalid vibe: ${config.vibe}`);
  }
  if (!Array.isArray(config.imageQueries) || config.imageQueries.length !== 13) {
    throw new Error(`imageQueries must be exactly 13. Got ${config.imageQueries.length}`);
  }
  if (!Array.isArray(config.features) || config.features.length !== 6) {
    throw new Error(`features must be exactly 6`);
  }
  if (!Array.isArray(config.thefts) || config.thefts.length !== 3) {
    throw new Error(`thefts must be exactly 3`);
  }
  return true;
}

// ============================================================
// FETCH IMAGES — for each query
// ============================================================
async function attachImages(config) {
  const queries = config.imageQueries;
  // hero (1) + showcase (9) + context (3) = 13
  const heroQ = queries[0];
  const showcaseQs = queries.slice(1, 10);
  const contextQs = queries.slice(10, 13);

  // Run all searches in parallel
  const [hero, ...showcaseAndContext] = await Promise.all([
    searchImage(heroQ, { orientation: 'portrait' }),
    ...showcaseQs.map(q => searchImage(q, { orientation: 'squarish' })),
    ...contextQs.map(q => searchImage(q, { orientation: 'landscape' })),
  ]);

  const showcase = showcaseAndContext.slice(0, 9);
  const contextImgs = showcaseAndContext.slice(9, 12);

  // Sizes for masonry grid (mix lg, md, sm)
  const sizes = ['lg','md','sm','sm','md','sm','md','sm','md'];

  config.images = {
    hero: hero.url,
    heroAlt: heroQ,
    showcase: showcase.map((img, i) => ({
      url: img.url,
      tag: showcaseQs[i].split(' ').slice(0,2).join(' '),
      size: sizes[i],
    })),
    context: contextImgs.map((img, i) => ({
      url: img.url,
      caption: contextQs[i],
    })),
  };

  // Cleanup: remove imageQueries from final config since we have URLs now
  delete config.imageQueries;
  return config;
}

// ============================================================
// MAIN ENTRY
// ============================================================
async function generateBrand(giroName, options = {}) {
  const hints = options.hints || '';
  const slug = normalizeSlug(giroName);

  // 1. Cache check
  if (!CONFIG.FORCE_REGENERATE) {
    const cached = await checkCache(slug);
    if (cached) {
      return { config: cached, slug: cached.slug, cached: true };
    }
  }

  // 2. AI generation (with retries on validation failure)
  let config, lastErr;
  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    try {
      const prompt = buildPrompt(giroName, hints);
      const raw = await callAI(prompt);
      config = parseConfig(raw);
      validate(config);
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`Attempt ${attempt+1} failed: ${err.message}`);
    }
  }
  if (!config) {
    throw new Error(`AI generation failed after ${CONFIG.MAX_RETRIES} attempts: ${lastErr?.message}`);
  }

  // 3. Force slug to our normalized version (AI sometimes deviates)
  config.slug = slug;

  // 4. Fetch images
  config = await attachImages(config);

  // 5. Save cache
  await saveCache(slug, config);

  // 6. Optional: pre-render static HTML
  if (options.preRender !== false) {
    const html = await renderHTML(config);
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
    await fs.writeFile(path.join(CONFIG.OUTPUT_DIR, `${slug}.html`), html);
  }

  return { config, slug, cached: false };
}

module.exports = {
  generateBrand,
  normalizeSlug,
  checkCache,
  saveCache,
  validate,
  parseConfig,
};

// ============================================================
// CLI USE
// ============================================================
if (require.main === module) {
  const giro = process.argv[2];
  if (!giro) {
    console.error('Uso: node brand-generator.js "nombre del giro"');
    process.exit(1);
  }
  generateBrand(giro)
    .then(r => {
      console.log(JSON.stringify({
        slug: r.slug,
        cached: r.cached,
        brand: r.config.brand,
        vibe: r.config.vibe,
        url: `/landings/${r.slug}.html`,
      }, null, 2));
    })
    .catch(err => {
      console.error('ERROR:', err.message);
      process.exit(1);
    });
}
