#!/usr/bin/env node
/**
 * week1_report.js — Auto-generado por workflow week1-report.yml.
 * Lee telemetry 7 dias, compara vs baseline dia 1, emite veredicto.
 */
const https = require('https');
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('# WEEK1_FINAL_REPORT\n\nMissing SUPABASE env. VERDICT: DEGRADING (cannot read metrics)'); process.exit(0); }
function req(path) {
  return new Promise((resolve) => {
    const u = new URL(SUPA_URL + '/rest/v1' + path);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d || '[]')); } catch (_) { resolve([]); } }); });
    r.on('error', () => resolve([])); r.end();
  });
}
const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
(async () => {
  // Lee de observability_events (tabla existente). type LIKE 'telemetry.%'
  const fails = await req('/observability_events?type=eq.telemetry.queue_fail&received_at=gte.' + since7d + '&select=payload&limit=10000');
  const sales = await req('/observability_events?type=eq.telemetry.sale_latency&received_at=gte.' + since7d + '&select=payload&limit=10000');
  const stats = await req('/observability_events?type=eq.telemetry.queue_stats&received_at=gte.' + since7d + '&select=payload&limit=10000');
  const smokes = await req('/observability_events?type=eq.telemetry.smoke_test&received_at=gte.' + since7d + '&select=payload&limit=200');
  const durs = sales.map(r => r.payload && r.payload.duration_ms).filter(n => typeof n === 'number').sort((a, b) => a - b);
  const p95 = durs.length ? durs[Math.floor(durs.length * 0.95)] : null;
  const smokeFails = smokes.filter(s => s.payload && s.payload.all_pass === false).length;
  const maxRetries = Math.max(0, ...stats.map(r => (r.payload && r.payload.with_retries) || 0));
  let verdict = 'STABLE';
  if (smokeFails >= 2 || (p95 && p95 > 3000) || fails.length > 500) verdict = 'REGRESSION';
  else if ((p95 && p95 > 1500) || maxRetries > 20) verdict = 'DEGRADING';
  const md = [
    '# WEEK1_FINAL_REPORT.md',
    `Generated: ${new Date().toISOString()}`,
    `VERDICT: ${verdict}`,
    '',
    '## Métricas 7 días',
    `- Queue fails total: **${fails.length}**`,
    `- Sale latency p95: **${p95 || 'N/A'} ms** (target <2000ms)`,
    `- Max items con retries en queue: **${maxRetries}**`,
    `- Smoke tests fallidos: **${smokeFails}/${smokes.length}**`,
    '',
    '## Veredicto',
    verdict === 'STABLE' ? 'Sistema estable, sin regresiones detectadas. Cerrar monitoreo intensivo.'
    : verdict === 'REGRESSION' ? '**REGRESION DETECTADA.** Issue P0 abierto automáticamente. Ver NEW_BUGS_DETECTED.md.'
    : '**MÉTRICAS DEGRADANDO** sin bug claro. Investigar tendencia.'
  ].join('\n');
  console.log(md);
})();
