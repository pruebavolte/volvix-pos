'use strict';

/**
 * VOLVIX POS · AI Engine
 * Self-contained AI module exposing all AI features.
 * Routes: /api/ai/{chat, forecast, reorder-suggestions, sales-insights,
 *               support-chat, health, categorize-product, generate-description}
 */

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]+/g, '');
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim().replace(/[\r\n]+/g, '');

const OPENAI_MODEL = 'gpt-4o-mini';
const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
const AI_TIMEOUT_MS = 30000;
const DEFAULT_PROVIDER = OPENAI_API_KEY ? 'openai' : (ANTHROPIC_API_KEY ? 'anthropic' : 'mock');

const MOCK_REPLY = 'IA en modo demo. Configura OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel para activar.';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label || 'request'} timeout ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

async function callOpenAI(messages, system, opts) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  opts = opts || {};
  const msgs = system ? [{ role: 'system', content: system }, ...(messages || [])] : (messages || []);
  const resp = await withTimeout(fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model || OPENAI_MODEL,
      messages: msgs,
      max_tokens: opts.max_tokens || 1024,
      temperature: opts.temperature != null ? opts.temperature : 0.4,
      response_format: opts.json ? { type: 'json_object' } : undefined,
    }),
  }), AI_TIMEOUT_MS, 'openai');
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const reply = data?.choices?.[0]?.message?.content || '';
  const tokens = data?.usage?.total_tokens || 0;
  return { reply, provider: 'openai', tokens_used: tokens };
}

async function callAnthropic(messages, system, opts) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  opts = opts || {};
  const cleaned = (messages || []).filter(m => m && m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  const resp = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model || ANTHROPIC_MODEL,
      max_tokens: opts.max_tokens || 1024,
      system: system || undefined,
      messages: cleaned.length ? cleaned : [{ role: 'user', content: 'Hola' }],
      temperature: opts.temperature != null ? opts.temperature : 0.4,
    }),
  }), AI_TIMEOUT_MS, 'anthropic');
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const reply = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
  return { reply, provider: 'anthropic', tokens_used: tokens };
}

async function callAI(messages, system, opts) {
  opts = opts || {};
  if (OPENAI_API_KEY) {
    try { return await callOpenAI(messages, system, opts); }
    catch (e) {
      if (ANTHROPIC_API_KEY) {
        try { return await callAnthropic(messages, system, opts); } catch (_) {}
      }
      return { reply: MOCK_REPLY, provider: 'mock', tokens_used: 0, error: String(e.message || e) };
    }
  }
  if (ANTHROPIC_API_KEY) {
    try { return await callAnthropic(messages, system, opts); }
    catch (e) {
      return { reply: MOCK_REPLY, provider: 'mock', tokens_used: 0, error: String(e.message || e) };
    }
  }
  return { reply: MOCK_REPLY, provider: 'mock', tokens_used: 0 };
}

function safeJsonFromReply(reply, fallback) {
  if (!reply) return fallback;
  let txt = String(reply).trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const start = txt.indexOf('{');
  const startArr = txt.indexOf('[');
  let s = -1;
  if (start >= 0 && startArr >= 0) s = Math.min(start, startArr);
  else s = Math.max(start, startArr);
  if (s >= 0) txt = txt.slice(s);
  try { return JSON.parse(txt); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function requireAuth(req, res, ctx) {
  const user = ctx.getAuthUser ? await ctx.getAuthUser(req) : null;
  if (!user) {
    cors(res);
    ctx.sendJson(res, 401, { error: 'No autenticado' });
    return null;
  }
  return user;
}

function resolveTenantId(user, body) {
  if (body && body.tenant_id) return String(body.tenant_id);
  if (user) return user.tenant_id || user.tenantId || user.tenant || user.org_id || null;
  return null;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function fetchSalesAggregated(supabaseRequest, tenantId, days) {
  const since = isoDaysAgo(days);
  const tenantFilter = tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '';
  const items = await supabaseRequest(
    'GET',
    `/sale_items?select=product_id,product_name,quantity,unit_price,created_at&created_at=gte.${since}${tenantFilter}&limit=10000`,
    null
  ).catch(() => []);
  const map = new Map();
  for (const it of (items || [])) {
    const k = it.product_id || it.product_name;
    if (!k) continue;
    const cur = map.get(k) || {
      product_id: it.product_id || null,
      product_name: it.product_name || '',
      total_units: 0,
      total_revenue: 0,
      sale_days: new Set(),
    };
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_price) || 0;
    cur.total_units += q;
    cur.total_revenue += q * p;
    if (it.created_at) cur.sale_days.add(String(it.created_at).slice(0, 10));
    map.set(k, cur);
  }
  return [...map.values()].map(r => ({
    product_id: r.product_id,
    product_name: r.product_name,
    total_units: r.total_units,
    total_revenue: Math.round(r.total_revenue * 100) / 100,
    distinct_days: r.sale_days.size,
    velocity_per_day: r.total_units / Math.max(days, 1),
  }));
}

async function fetchProducts(supabaseRequest, tenantId) {
  const tenantFilter = tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '';
  return supabaseRequest(
    'GET',
    `/pos_products?select=id,name,stock,min_stock,price,category${tenantFilter}&limit=5000`,
    null
  ).catch(() => []);
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/chat
// ---------------------------------------------------------------------------

async function handleChat(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { cors(res); return ctx.sendJson(res, 400, { error: 'JSON inválido' }); }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = body.system || 'Eres la IA de Volvix POS. Ayudas a comerciantes con su negocio. Responde en español, conciso.';
  const result = await callAI(messages, system, { max_tokens: 1024 });
  cors(res);
  return ctx.sendJson(res, 200, {
    reply: result.reply,
    provider: result.provider,
    tokens_used: result.tokens_used,
  });
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/forecast
// ---------------------------------------------------------------------------

async function handleForecast(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { cors(res); return ctx.sendJson(res, 400, { error: 'JSON inválido' }); }
  const tenantId = resolveTenantId(user, body);
  const days = [7, 14, 30].includes(Number(body.days)) ? Number(body.days) : 7;
  const productIds = Array.isArray(body.product_ids) ? body.product_ids.map(String) : null;

  const agg = await fetchSalesAggregated(ctx.supabaseRequest, tenantId, 90);
  const filtered = productIds ? agg.filter(p => productIds.includes(String(p.product_id))) : agg;
  const ranked = filtered.sort((a, b) => b.total_units - a.total_units).slice(0, 50);

  const baseline = ranked.map(p => {
    const predicted = Math.round(p.velocity_per_day * days);
    let confidence = 'low';
    if (p.distinct_days >= 30 && p.total_units >= 30) confidence = 'high';
    else if (p.distinct_days >= 10 && p.total_units >= 10) confidence = 'med';
    return {
      product_id: p.product_id,
      product_name: p.product_name,
      predicted_units: predicted,
      confidence,
    };
  });

  let commentary = '';
  if (baseline.length) {
    const summary = baseline.slice(0, 20).map(b =>
      `${b.product_name}: ${b.predicted_units}u (${b.confidence})`).join('; ');
    const ai = await callAI(
      [{ role: 'user', content: `Predict next ${days} days demand based on this trend. Sales summary (90d): ${summary}. Reply with a 2-line strategic note in Spanish, no JSON.` }],
      'Eres analista de demanda de Volvix POS. Responde conciso.',
      { max_tokens: 200, temperature: 0.3 }
    );
    commentary = ai.reply || '';
  }

  cors(res);
  return ctx.sendJson(res, 200, {
    days,
    forecast: baseline,
    commentary,
    provider: DEFAULT_PROVIDER,
  });
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/reorder-suggestions
// ---------------------------------------------------------------------------

async function handleReorder(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { body = {}; }
  const tenantId = resolveTenantId(user, body);

  const [products, sales30] = await Promise.all([
    fetchProducts(ctx.supabaseRequest, tenantId),
    fetchSalesAggregated(ctx.supabaseRequest, tenantId, 30),
  ]);
  const velocityById = new Map();
  const velocityByName = new Map();
  for (const s of sales30) {
    if (s.product_id != null) velocityById.set(String(s.product_id), s.velocity_per_day);
    if (s.product_name) velocityByName.set(s.product_name, s.velocity_per_day);
  }

  const suggestions = [];
  for (const p of (products || [])) {
    const velocity = velocityById.get(String(p.id)) ?? velocityByName.get(p.name) ?? 0;
    const stock = Number(p.stock) || 0;
    const minStock = Number(p.min_stock) || 0;
    const daysUntilStockout = velocity > 0 ? Math.floor(stock / velocity) : null;
    const targetCoverDays = 14;
    const suggestedQty = Math.max(0, Math.ceil(velocity * targetCoverDays - stock));

    let urgency = 'low';
    if (stock <= 0) urgency = 'critical';
    else if (stock <= minStock) urgency = 'high';
    else if (daysUntilStockout != null && daysUntilStockout <= 7) urgency = 'medium';

    if (urgency === 'low' && suggestedQty <= 0) continue;

    suggestions.push({
      product_id: p.id,
      name: p.name,
      current_stock: stock,
      min_stock: minStock,
      velocity_per_day: Math.round(velocity * 100) / 100,
      days_until_stockout: daysUntilStockout,
      suggested_order_qty: suggestedQty,
      urgency,
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => (order[a.urgency] - order[b.urgency]) ||
                              ((a.days_until_stockout ?? 9999) - (b.days_until_stockout ?? 9999)));

  cors(res);
  return ctx.sendJson(res, 200, { count: suggestions.length, suggestions });
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/sales-insights
// ---------------------------------------------------------------------------

async function handleSalesInsights(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { body = {}; }
  const tenantId = resolveTenantId(user, body);
  const periodMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days = periodMap[body.period] || 30;

  const current = await fetchSalesAggregated(ctx.supabaseRequest, tenantId, days);
  const previous = await fetchSalesAggregated(ctx.supabaseRequest, tenantId, days * 2);
  const prevOnly = new Map();
  for (const p of previous) {
    const cur = current.find(c => (c.product_id && c.product_id === p.product_id) || c.product_name === p.product_name);
    const prevUnits = p.total_units - (cur ? cur.total_units : 0);
    prevOnly.set(p.product_id || p.product_name, Math.max(0, prevUnits));
  }

  const totalRev = current.reduce((s, p) => s + p.total_revenue, 0);
  const prevRev = previous.reduce((s, p) => s + p.total_revenue, 0) - totalRev;
  const trendPct = prevRev > 0 ? Math.round(((totalRev - prevRev) / prevRev) * 1000) / 10 : null;
  const trend = trendPct == null ? 'unknown' : (trendPct > 5 ? 'up' : (trendPct < -5 ? 'down' : 'flat'));

  const sorted = [...current].sort((a, b) => b.total_units - a.total_units);
  const topMovers = sorted.slice(0, 5).map(p => ({
    product_id: p.product_id, name: p.product_name, units: p.total_units, revenue: p.total_revenue,
  }));
  const slowMovers = sorted.slice().reverse().slice(0, 5).map(p => ({
    product_id: p.product_id, name: p.product_name, units: p.total_units, revenue: p.total_revenue,
  }));

  const anomalies = [];
  for (const p of current) {
    const prev = prevOnly.get(p.product_id || p.product_name) || 0;
    if (prev >= 5 && p.total_units === 0) {
      anomalies.push({ product_id: p.product_id, name: p.product_name, type: 'sales_dropped_to_zero', prev_units: prev });
    } else if (prev > 0 && p.total_units > prev * 3) {
      anomalies.push({ product_id: p.product_id, name: p.product_name, type: 'sales_spike', prev_units: prev, current_units: p.total_units });
    }
  }

  const summary = `Periodo ${days}d. Ingresos: ${totalRev}. Tendencia: ${trend} (${trendPct}%). Top: ${topMovers.map(t => t.name).join(', ')}. Lentos: ${slowMovers.map(t => t.name).join(', ')}. Anomalías: ${anomalies.length}.`;
  const ai = await callAI(
    [{ role: 'user', content: `Datos: ${summary}. Da una recomendación accionable de 2-3 oraciones, en español.` }],
    'Eres analista de retail de Volvix POS. Sé concreto.',
    { max_tokens: 200, temperature: 0.4 }
  );

  cors(res);
  return ctx.sendJson(res, 200, {
    period: body.period || '30d',
    trend,
    trend_pct: trendPct,
    revenue: Math.round(totalRev * 100) / 100,
    top_movers: topMovers,
    slow_movers: slowMovers,
    anomalies,
    recommendation: ai.reply || 'Sin recomendaciones disponibles.',
  });
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/support-chat
// ---------------------------------------------------------------------------

const SUPPORT_SYSTEM = 'Eres soporte técnico de Volvix POS. Responde en español, conciso, ofrece pasos. Si no sabes, escala a soporte humano.';

async function handleSupportChat(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { cors(res); return ctx.sendJson(res, 400, { error: 'JSON inválido' }); }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const result = await callAI(messages, SUPPORT_SYSTEM, { max_tokens: 800, temperature: 0.3 });

  const reply = String(result.reply || '');
  const escalate = /no\s+s[eé]|no\s+puedo\s+ayudar|escal[ao]|soporte\s+humano|cont[aá]ct[ae].*soporte/i.test(reply)
                || result.provider === 'mock';

  cors(res);
  return ctx.sendJson(res, 200, {
    reply,
    provider: result.provider,
    tokens_used: result.tokens_used,
    escalate_to_human: escalate,
  });
}

// ---------------------------------------------------------------------------
// Route: GET /api/ai/health
// ---------------------------------------------------------------------------

async function handleHealth(req, res, ctx) {
  cors(res);
  return ctx.sendJson(res, 200, {
    openai_configured: !!OPENAI_API_KEY,
    anthropic_configured: !!ANTHROPIC_API_KEY,
    default_provider: DEFAULT_PROVIDER,
  });
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/categorize-product
// ---------------------------------------------------------------------------

async function handleCategorize(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { cors(res); return ctx.sendJson(res, 400, { error: 'JSON inválido' }); }
  const name = String(body.name || '').trim();
  if (!name) { cors(res); return ctx.sendJson(res, 400, { error: 'name requerido' }); }
  const description = String(body.description || '').trim();

  const prompt = `Producto: "${name}". Descripción: "${description || 'sin descripción'}". ` +
    `Devuelve JSON estricto con: category (string), suggested_price_range ({min:number,max:number,currency:"MXN"}), tags (array de 3-6 strings).`;

  const ai = await callAI(
    [{ role: 'user', content: prompt }],
    'Eres un clasificador de productos de retail mexicano. Responde SOLO JSON válido, sin texto extra.',
    { max_tokens: 400, temperature: 0.2, json: true }
  );

  const fallback = {
    category: 'general',
    suggested_price_range: { min: 0, max: 0, currency: 'MXN' },
    tags: name.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5),
  };
  const parsed = ai.provider === 'mock' ? fallback : safeJsonFromReply(ai.reply, fallback);

  cors(res);
  return ctx.sendJson(res, 200, {
    category: parsed.category || fallback.category,
    suggested_price_range: parsed.suggested_price_range || fallback.suggested_price_range,
    tags: Array.isArray(parsed.tags) ? parsed.tags : fallback.tags,
    provider: ai.provider,
    tokens_used: ai.tokens_used,
  });
}

// ---------------------------------------------------------------------------
// Route: POST /api/ai/generate-description
// ---------------------------------------------------------------------------

async function handleGenerateDescription(req, res, ctx) {
  const user = await requireAuth(req, res, ctx);
  if (!user) return;
  let body;
  try { body = await parseBody(req); } catch { cors(res); return ctx.sendJson(res, 400, { error: 'JSON inválido' }); }
  const name = String(body.name || '').trim();
  if (!name) { cors(res); return ctx.sendJson(res, 400, { error: 'name requerido' }); }
  const category = String(body.category || '').trim();
  const attrs = body.attributes && typeof body.attributes === 'object' ? body.attributes : {};

  const prompt = `Genera una descripción de marketplace para: "${name}". ` +
    `Categoría: "${category || 'general'}". Atributos: ${JSON.stringify(attrs)}. ` +
    `Devuelve JSON con: description (string, 80-150 palabras, en español, persuasiva), ` +
    `seo_keywords (array de 5-10 strings).`;

  const ai = await callAI(
    [{ role: 'user', content: prompt }],
    'Eres copywriter de e-commerce mexicano. Responde SOLO JSON válido.',
    { max_tokens: 600, temperature: 0.7, json: true }
  );

  const fallback = {
    description: `${name}${category ? ` de la categoría ${category}` : ''}. Producto disponible en Volvix POS.`,
    seo_keywords: [name.toLowerCase(), category.toLowerCase()].filter(Boolean),
  };
  const parsed = ai.provider === 'mock' ? fallback : safeJsonFromReply(ai.reply, fallback);

  cors(res);
  return ctx.sendJson(res, 200, {
    description: parsed.description || fallback.description,
    seo_keywords: Array.isArray(parsed.seo_keywords) ? parsed.seo_keywords : fallback.seo_keywords,
    provider: ai.provider,
    tokens_used: ai.tokens_used,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

module.exports = async function handleAI(req, res, parsedUrl, ctx) {
  const pathname = parsedUrl.pathname;
  const method = (req.method || 'GET').toUpperCase();

  if (!pathname.startsWith('/api/ai/')) return false;

  if (method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  try {
    if (method === 'POST' && pathname === '/api/ai/chat') {
      await handleChat(req, res, ctx); return true;
    }
    if (method === 'POST' && pathname === '/api/ai/forecast') {
      await handleForecast(req, res, ctx); return true;
    }
    if (method === 'POST' && pathname === '/api/ai/reorder-suggestions') {
      await handleReorder(req, res, ctx); return true;
    }
    if (method === 'POST' && pathname === '/api/ai/sales-insights') {
      await handleSalesInsights(req, res, ctx); return true;
    }
    if (method === 'POST' && pathname === '/api/ai/support-chat') {
      await handleSupportChat(req, res, ctx); return true;
    }
    if (method === 'GET' && pathname === '/api/ai/health') {
      await handleHealth(req, res, ctx); return true;
    }
    if (method === 'POST' && pathname === '/api/ai/categorize-product') {
      await handleCategorize(req, res, ctx); return true;
    }
    if (method === 'POST' && pathname === '/api/ai/generate-description') {
      await handleGenerateDescription(req, res, ctx); return true;
    }
  } catch (e) {
    cors(res);
    const msg = ctx.IS_PROD ? 'Error interno' : String(e && e.message || e);
    ctx.sendJson(res, 500, { error: msg });
    return true;
  }

  return false;
};
