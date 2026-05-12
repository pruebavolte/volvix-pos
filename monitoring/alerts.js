#!/usr/bin/env node
/**
 * monitoring/alerts.js — Lee telemetry de client_errors, compara umbrales,
 * log alertas a audit_alerts. Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node monitoring/alerts.js
 */
const https = require('https');
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('SUPABASE_URL+KEY required'); process.exit(2); }
function req(method, path, body) {
  return new Promise((resolve) => {
    const u = new URL(SUPA_URL + '/rest/v1' + path);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method,
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let p; try { p = JSON.parse(d || '[]'); } catch (_) { p = []; } resolve(Array.isArray(p) ? p : []); }); });
    r.on('error', () => resolve([])); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const since1h = new Date(Date.now() - 3600000).toISOString();
const since24h = new Date(Date.now() - 86400000).toISOString();
(async () => {
  const alerts = [];
  const fails = await req('GET', '/client_errors?message=like.telemetry.queue_fail*&ts=gte.' + since1h + '&select=meta&limit=500');
  const byT = {};
  (fails || []).forEach(r => { const t = (r.meta && r.meta.tenant_id) || 'unknown'; byT[t] = (byT[t] || 0) + 1; });
  Object.entries(byT).forEach(([t, n]) => { if (n > 5) alerts.push({ metric: 'M1', tenant_id: t, value: n, threshold: 5, msg: 'Queue fails >5/hr' }); });
  const sales = await req('GET', '/client_errors?message=eq.telemetry.sale_latency&ts=gte.' + since1h + '&select=meta&limit=1000');
  const durs = (sales || []).map(r => r.meta && r.meta.duration_ms).filter(n => typeof n === 'number').sort((a, b) => a - b);
  const p95 = durs.length ? durs[Math.floor(durs.length * 0.95)] : null;
  if (p95 && p95 > 2000) alerts.push({ metric: 'M2', value: p95, threshold: 2000, msg: 'Sale p95 >2s' });
  const stats = await req('GET', '/client_errors?message=eq.telemetry.queue_stats&ts=gte.' + since24h + '&select=meta&limit=1000');
  const maxR = Math.max(0, ...(stats || []).map(r => (r.meta && r.meta.with_retries) || 0));
  if (maxR > 10) alerts.push({ metric: 'M3', value: maxR, threshold: 10, msg: 'Items con retries >10' });
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), alerts, metrics: { m1_fails_1h: fails.length, m2_p95_ms: p95, m3_max_retries: maxR } }, null, 2));
  for (const a of alerts) await req('POST', '/audit_alerts', Object.assign({}, a, { created_at: new Date().toISOString() })).catch(() => {});
})().catch(e => { console.error(e); process.exit(1); });
