// ============================================================
// API SERVER — integración con tu marketplace.html actual
// ============================================================
// Endpoints:
//   POST /api/giros/generate      → genera (o devuelve cache) async
//   GET  /api/giros/status/:slug  → polling del estado de generación
//   GET  /landings/:slug.html     → sirve el HTML estático
//
// Tu marketplace.html ya tiene searchGiro() que llama a tu API.
// Adapta tu handler de /api/giros/search para usar generateBrand.
// ============================================================

const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const { generateBrand, normalizeSlug, checkCache } = require('./brand-generator');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir landings estáticas
app.use('/landings', express.static(path.join(__dirname, '..', 'landings')));

// Cola en memoria para evitar regenerar la misma marca en paralelo
const inProgress = new Map();
// Estado por slug: 'pending' | 'done' | 'error'
const statusMap = new Map();

// ============================================================
// POST /api/giros/generate
// Body: { giro: "vendo nieves" }
// Returns: { slug, url, cached, status }
// ============================================================
app.post('/api/giros/generate', async (req, res) => {
  const giro = (req.body.giro || req.body.q || '').trim();
  if (!giro) return res.status(400).json({ error: 'giro required' });

  const slug = normalizeSlug(giro);

  // ¿Ya está en cache?
  const cached = await checkCache(slug);
  if (cached) {
    return res.json({
      slug,
      url: `/landings/${slug}.html`,
      cached: true,
      status: 'done',
      brand: cached.brand,
    });
  }

  // ¿Ya se está generando? Responder con status pending
  if (inProgress.has(slug)) {
    return res.json({
      slug,
      url: `/landings/${slug}.html`,
      cached: false,
      status: 'pending',
      message: 'Ya se está diseñando esta landing. Polling /api/giros/status/' + slug,
    });
  }

  // Arrancar generación en background
  statusMap.set(slug, 'pending');
  const promise = generateBrand(giro)
    .then(r => {
      statusMap.set(slug, 'done');
      console.log(`[gen] ${slug} → ${r.config.brand} (${r.config.vibe})`);
      return r;
    })
    .catch(err => {
      statusMap.set(slug, 'error');
      console.error(`[gen] ${slug} FAILED:`, err.message);
      throw err;
    })
    .finally(() => {
      // Cleanup after 30 seconds (give clients time to poll)
      setTimeout(() => {
        inProgress.delete(slug);
        statusMap.delete(slug);
      }, 30000);
    });
  inProgress.set(slug, promise);

  res.json({
    slug,
    url: `/landings/${slug}.html`,
    cached: false,
    status: 'pending',
    estimatedTime: 12,  // segundos
  });
});

// ============================================================
// GET /api/giros/status/:slug
// Para polling desde el frontend
// ============================================================
app.get('/api/giros/status/:slug', async (req, res) => {
  const slug = req.params.slug;
  // Primero check cache (puede estar lista ya)
  const cached = await checkCache(slug);
  if (cached) {
    return res.json({ slug, status: 'done', url: `/landings/${slug}.html`, brand: cached.brand });
  }
  // Si no en cache, revisar status en memoria
  const status = statusMap.get(slug) || 'unknown';
  res.json({ slug, status });
});

// ============================================================
// GET /api/giros/list — todas las marcas generadas
// (útil para admin / debugging)
// ============================================================
app.get('/api/giros/list', async (req, res) => {
  const cacheDir = path.join(__dirname, '..', 'cache');
  try {
    const files = await fs.readdir(cacheDir);
    const brands = [];
    for (const f of files) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const slug = f.replace('.json', '');
      const config = JSON.parse(await fs.readFile(path.join(cacheDir, f), 'utf-8'));
      brands.push({
        slug,
        brand: config.brand,
        giro: config.giro,
        vibe: config.vibe,
        url: `/landings/${slug}.html`,
      });
    }
    res.json({ count: brands.length, brands });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET / — health
// ============================================================
app.get('/', (req, res) => {
  res.send('Volvix Brand Generator · POST /api/giros/generate { giro: "..." }');
});

app.listen(PORT, () => {
  console.log(`Volvix Brand Generator listening on :${PORT}`);
  console.log(`Test: curl -X POST http://localhost:${PORT}/api/giros/generate -H "content-type: application/json" -d '{"giro":"nevería"}'`);
});
