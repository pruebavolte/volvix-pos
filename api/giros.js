'use strict';

/**
 * api/giros.js
 * Volvix POS - Customer journey entry point: giros (business types) discovery.
 *
 * Exported: async function handleGiros(req, res, parsedUrl, ctx)
 *
 * Routes:
 *   GET  /api/giros                  -> list all giros (scanned from landing-*.html on disk)
 *   GET  /api/giros/search?q=X       -> fuzzy match against existing giros { exists, slug, name, landing }
 *   POST /api/giros/generate         -> AI-generate a personalized landing (or stub if no OPENAI_API_KEY)
 *   GET  /api/giros/:slug/exists     -> { exists: true|false, slug }
 *
 * ctx: { supabaseRequest, sendJson, getAuthUser, IS_PROD }
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------- helpers ----------
function send(ctx, res, status, body) {
  if (ctx && typeof ctx.sendJson === 'function') return ctx.sendJson(res, status, body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function err(ctx, res, status, code, message, extra) {
  return send(ctx, res, status, Object.assign({ error: message, code }, extra || {}));
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    let total = 0;
    const limit = 32 * 1024;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) { req.destroy(); return reject(new Error('Body too large')); }
      data += c;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

// ---------- giros catalog (filesystem-scanned) ----------
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 60 * 1000;

function scanLandings() {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_MS) return _cache;

  const roots = [
    path.join(__dirname, '..'),
    path.join(__dirname, '..', 'public'),
    process.cwd(),
    path.join(process.cwd(), 'public'),
    '/var/task',
    '/var/task/public',
  ];

  const slugs = new Set();
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root);
      for (const e of entries) {
        const m = /^landing-([a-z0-9-]+)\.html$/i.exec(e);
        if (m) slugs.add(m[1].toLowerCase());
      }
    } catch (_) {}
  }

  const giros = Array.from(slugs).sort().map((slug) => ({
    slug,
    name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    landing: `/landing-${slug}.html`,
  }));

  _cache = giros;
  _cacheAt = now;
  return giros;
}

// ---------- handlers ----------
async function listGiros(ctx, req, res) {
  const giros = scanLandings();
  return send(ctx, res, 200, { count: giros.length, giros });
}

async function searchGiros(ctx, req, res, parsedUrl) {
  const q = normalize((parsedUrl && parsedUrl.query && parsedUrl.query.q) || '');
  if (!q) return send(ctx, res, 200, { exists: false, query: '' });

  const giros = scanLandings();
  const qSlug = slugify(q);

  // 1) exact slug
  let hit = giros.find((g) => g.slug === qSlug);
  // 2) substring
  if (!hit) hit = giros.find((g) => g.slug.includes(qSlug) || qSlug.includes(g.slug));
  // 3) name token match
  if (!hit) hit = giros.find((g) => normalize(g.name).includes(q) || q.includes(normalize(g.name)));

  if (hit) {
    return send(ctx, res, 200, {
      exists: true,
      slug: hit.slug,
      name: hit.name,
      landing: hit.landing,
      query: q,
    });
  }
  return send(ctx, res, 200, { exists: false, query: q });
}

async function existsGiro(ctx, req, res, slug) {
  const giros = scanLandings();
  const norm = slugify(slug);
  const hit = giros.find((g) => g.slug === norm);
  return send(ctx, res, 200, {
    exists: !!hit,
    slug: norm,
    landing: hit ? hit.landing : null,
  });
}

// ---------- AI generation ----------
function callOpenAI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert landing-page copywriter for SaaS POS verticals in Spanish (Mexico). Output ONLY valid HTML body content (no <html>, <head>, <body> wrappers).' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });
    const opts = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error('OpenAI ' + res.statusCode + ': ' + data));
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          resolve(content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('OpenAI timeout')); });
    req.write(body);
    req.end();
  });
}

async function generateGiro(ctx, req, res) {
  let body;
  try { body = await readJson(req); }
  catch (e) { return err(ctx, res, 400, 'BAD_BODY', 'Invalid JSON'); }

  const name = String((body && body.name) || '').trim();
  const description = String((body && body.description) || '').trim();
  if (!name) return err(ctx, res, 400, 'MISSING_NAME', 'name is required');

  const slug = slugify(name);
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();

  // existing already?
  const giros = scanLandings();
  const existing = giros.find((g) => g.slug === slug);
  if (existing) {
    return send(ctx, res, 200, { exists: true, slug, landing: existing.landing, generated: false });
  }

  if (!apiKey) {
    return send(ctx, res, 200, {
      todo: true,
      slug,
      message: 'AI giro generator pending API key (set OPENAI_API_KEY)',
      fallback: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
    });
  }

  // optional: persist a pending request to supabase if available
  try {
    if (ctx && typeof ctx.supabaseRequest === 'function') {
      await ctx.supabaseRequest('POST', '/giros_generated', {
        slug, name, description, status: 'generating', created_at: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch (_) {}

  const prompt = [
    'Crea el contenido HTML (sin <html>, <head>, <body>) de una landing personalizada para un sistema POS.',
    'Giro de negocio: "' + name + '".',
    description ? ('Descripcion adicional: ' + description) : '',
    'Incluye: hero con titulo y subtitulo, 4 modulos del sistema con iconos emoji, 3 testimonios ficticios realistas, CTA final.',
    'Tono: profesional, cercano, en espanol mexicano. NO incluyas estilos inline ni <script>.',
  ].filter(Boolean).join('\n');

  try {
    const html = await callOpenAI(apiKey, prompt);
    return send(ctx, res, 200, {
      generated: true,
      slug,
      name,
      html,
      landing: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
    });
  } catch (e) {
    return err(ctx, res, 502, 'AI_ERROR', 'AI generation failed', { detail: ctx && ctx.IS_PROD ? undefined : String(e.message) });
  }
}

// ---------- dispatcher ----------
function matchExistsPath(pathname) {
  const m = /^\/api\/giros\/([a-z0-9-]+)\/exists$/i.exec(pathname);
  return m ? m[1] : null;
}

module.exports = async function handleGiros(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || (req.url || '').split('?')[0] || '';

  if (!pathname.startsWith('/api/giros')) return false;

  try {
    if (method === 'GET'  && pathname === '/api/giros')           { await listGiros(ctx, req, res); return true; }
    if (method === 'GET'  && pathname === '/api/giros/search')    { await searchGiros(ctx, req, res, parsedUrl); return true; }
    if (method === 'POST' && pathname === '/api/giros/generate')  { await generateGiro(ctx, req, res); return true; }

    const slug = matchExistsPath(pathname);
    if (slug && method === 'GET') { await existsGiro(ctx, req, res, slug); return true; }

    // path was under /api/giros but no match -> 404 (own this prefix)
    err(ctx, res, 404, 'NOT_FOUND', 'No giros route matches ' + method + ' ' + pathname);
    return true;
  } catch (e) {
    err(ctx, res, 500, 'INTERNAL_ERROR', 'Internal error', { detail: ctx && ctx.IS_PROD ? undefined : String(e.message) });
    return true;
  }
};

module.exports.scanLandings = scanLandings;
module.exports.slugify = slugify;
