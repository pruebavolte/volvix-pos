#!/usr/bin/env node
/**
 * scan-pos-panel.js — Live system-map scanner
 *
 * Genera D:/github/volvix-pos/.audit/system-map/pos-panel-map.json
 * escaneando el código REAL de:
 *   - public/salvadorex-pos.html
 *   - public/paneldecontrol.html
 *   - api/index.js (para enriquecer endpoints↔tablas)
 *
 * Uso:
 *   node scripts/system-map/scan-pos-panel.js
 *   node scripts/system-map/scan-pos-panel.js --out path/to/out.json
 *   node scripts/system-map/scan-pos-panel.js --pretty
 *
 * Por qué "vivo":
 *   - No hardcodea nombres de modales/funciones; los extrae con regex.
 *   - Re-correrlo después de cualquier cambio refleja el estado actual.
 *   - El JSON tiene la sección `_meta` con hash, fecha y conteos para detectar drift.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- Config ----------
const ROOT = path.resolve(__dirname, '..', '..');
const POS_FILE   = path.join(ROOT, 'public', 'salvadorex-pos.html');
const PANEL_FILE = path.join(ROOT, 'public', 'paneldecontrol.html');
const API_FILE   = path.join(ROOT, 'api', 'index.js');

const DEFAULT_OUT = path.join(ROOT, '.audit', 'system-map', 'pos-panel-map.json');

// ---------- CLI ----------
function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, pretty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i+1]) { args.out = path.resolve(argv[++i]); }
    else if (a === '--pretty') { args.pretty = true; }
  }
  return args;
}

// ---------- Helpers ----------
function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { console.warn('[scan] cannot read', p, '-', e.message); return ''; }
}
function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12); }
function uniq(arr) { return Array.from(new Set(arr)); }
function uniqSort(arr) { return uniq(arr).sort(); }

/** Match all and return capture groups (array). */
function matchAll(re, s, group = 0) {
  const out = []; let m;
  const r = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');
  while ((m = r.exec(s)) !== null) out.push(m[group]);
  return out;
}

// ---------- Extractors ----------

/** Modals: <div id="modal-*"> + clase modal-backdrop */
function extractModals(html) {
  const ids = uniqSort(matchAll(/id=["'](modal-[a-zA-Z0-9_-]+)["']/g, html, 1));
  return ids.map(id => {
    // intentar capturar primer h3/title cercano para etiquetar
    const re = new RegExp('id=["\']' + id + '["\'][\\s\\S]{0,800}?<(?:h[1-4]|strong)[^>]*>([^<]{2,80})<', 'i');
    const m = html.match(re);
    return { id, label: m ? m[1].trim() : null };
  });
}

/** Funciones top-level: function name(... */
function extractFunctions(html) {
  const fns = uniqSort(matchAll(/^\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]{1,60})\s*\(/gm, html, 1));
  return fns;
}

/** onclick="name(...)" + addEventListener('click') con función nombrada */
function extractClickHandlers(html) {
  const inline = uniqSort(matchAll(/onclick=["']([a-zA-Z_$][a-zA-Z0-9_$.]{0,80})\s*\(/g, html, 1));
  return inline;
}

/** Botones con id + texto */
function extractButtons(html) {
  const out = [];
  const re = /<button\b([^>]*)>([\s\S]{0,400}?)<\/button>/g;
  let m, count = 0;
  while ((m = re.exec(html)) !== null && count < 5000) {
    count++;
    const attrs = m[1] || '';
    const body  = m[2] || '';
    const idM   = attrs.match(/\bid=["']([^"']+)["']/);
    const onM   = attrs.match(/\bonclick=["']([^"']+)["']/);
    const dataM = attrs.match(/\bdata-action=["']([^"']+)["']/);
    const text  = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!idM && !onM && !dataM && !text) continue;
    out.push({
      id: idM ? idM[1] : null,
      onclick: onM ? onM[1] : null,
      action: dataM ? dataM[1] : null,
      text: text || null
    });
  }
  // dedupe por (id || onclick || text)
  const seen = new Set();
  return out.filter(b => {
    const k = (b.id || '') + '|' + (b.onclick || '') + '|' + (b.action || '') + '|' + (b.text || '');
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/** Endpoints API consumidos: fetch('/api/...') */
function extractApiEndpoints(html) {
  const raw = matchAll(/fetch\(\s*[`"']([^`"']*\/api\/[^`"']+)[`"']/g, html, 1);
  // normalizar IDs dinámicos / trailing slash
  const normalized = raw.map(u => {
    let n = u
      .replace(/\$\{[^}]+\}/g, ':id')
      .replace(/[?#].*$/, '')         // quitar query
      .replace(/\/$/, '');
    return n;
  });
  return uniqSort(normalized);
}

/** Endpoints declarados en api/index.js.
 *  Este proyecto usa Node HTTP nativo + un mapa `handlers['METHOD /api/...']`.
 *  También soportamos Express-style por si en el futuro se migra. */
function extractApiRoutes(jsSrc) {
  const out = [];
  // 1) handlers['GET /api/...'] = ...    (estilo actual de Volvix)
  const reMap = /handlers\[\s*[`"'](GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[a-zA-Z0-9_./\-:]+)[`"']\s*\]\s*=/g;
  let m;
  while ((m = reMap.exec(jsSrc)) !== null) {
    out.push({ method: m[1].toUpperCase(), path: m[2], style: 'handlers-map' });
  }
  // 2) app.get/post/... — por si se migra a Express
  const reApp = /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*[`"'](\/api\/[a-zA-Z0-9_./\-:]+)[`"']/g;
  while ((m = reApp.exec(jsSrc)) !== null) {
    out.push({ method: m[1].toUpperCase(), path: m[2], style: 'express' });
  }
  // dedupe
  const seen = new Set();
  return out.filter(r => {
    const k = r.method + ' ' + r.path;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/** Tablas Supabase: literales 'pos_*' | 'volvix_*' | 'giros_*' | 'app_*' */
function extractTables(...sources) {
  const re = /['"](pos_[a-z0-9_]{2,}|volvix_[a-z0-9_]{2,}|giros_[a-z0-9_]{2,}|app_[a-z0-9_]{2,})['"]/g;
  const all = [];
  sources.forEach(s => { all.push(...matchAll(re, s, 1)); });
  // filtros básicos: descartar paths que se cuelen
  const clean = all.filter(t => !t.includes('/') && !t.includes('.html'));
  return uniqSort(clean);
}

/** Navegación nav v14: data-permv14-nav y data-permv14-pane */
function extractPanelNav(html) {
  const navs = uniqSort(matchAll(/data-permv14-nav=["']([^"']+)["']/g, html, 1));
  const panes = uniqSort(matchAll(/data-permv14-pane=["']([^"']+)["']/g, html, 1));
  return { navs, panes };
}

/** Referencias cruzadas: el otro HTML aparece como destino de navegación */
function extractCrossRefs(html, otherFilename) {
  const re = new RegExp('[\'"\\/]' + otherFilename.replace('.', '\\.') + '[\'"#?\\s]', 'g');
  const count = (html.match(re) || []).length;
  return { otherFilename, references: count };
}

/** Secciones de UI: comentarios "============ X ============" frecuentes en este proyecto */
function extractSections(html) {
  const re = /<!--\s*={3,}\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 ./()\-_+]{3,80})\s*={3,}.*?-->/g;
  return uniqSort(matchAll(re, html, 1));
}

/** Scripts externos cargados: <script src="..."> */
function extractScripts(html) {
  return uniqSort(matchAll(/<script[^>]+src=["']([^"']+)["']/g, html, 1));
}

// ---------- Per-file scanner ----------
function scanHtml(filePath, otherFilename) {
  const html = readFileSafe(filePath);
  const lines = html ? html.split('\n').length : 0;
  return {
    file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    bytes: Buffer.byteLength(html, 'utf8'),
    lines,
    sha1: html ? sha1(html) : null,
    scripts:   extractScripts(html),
    sections:  extractSections(html),
    panelNav:  extractPanelNav(html),       // solo relevante en panel, vacío en pos
    modals:    extractModals(html),
    functions: extractFunctions(html),
    clickHandlers: extractClickHandlers(html),
    buttons:   extractButtons(html),
    apiEndpoints: extractApiEndpoints(html),
    crossRef:  extractCrossRefs(html, otherFilename)
  };
}

// ---------- Relación entre archivos ----------
function buildRelationship(pos, panel, apiRoutes, allTables) {
  const posApis   = new Set(pos.apiEndpoints);
  const panelApis = new Set(panel.apiEndpoints);

  const sharedApis = [...posApis].filter(x => panelApis.has(x)).sort();
  const onlyPos    = [...posApis].filter(x => !panelApis.has(x)).sort();
  const onlyPanel  = [...panelApis].filter(x => !posApis.has(x)).sort();

  // Funciones con mismo nombre (posibles módulos espejados)
  const posFns = new Set(pos.functions);
  const sharedFns = panel.functions.filter(f => posFns.has(f)).sort();

  // Cuál archivo "manda" al otro
  const posToPanelLinks   = pos.crossRef.references;   // paneldecontrol.html aparece en pos
  const panelToPosLinks   = panel.crossRef.references; // salvadorex-pos.html aparece en panel

  // Tablas: cuáles APIs/módulos las tocan (heurística por nombre)
  // Mapea tabla → endpoints que la mencionan en su path
  const tableEndpointHints = {};
  allTables.forEach(t => {
    const stem = t.replace(/^(pos_|volvix_|giros_|app_)/, '');
    tableEndpointHints[t] = apiRoutes
      .filter(r => r.path.toLowerCase().includes(stem))
      .map(r => `${r.method} ${r.path}`);
  });

  return {
    summary: {
      shared_api_endpoints: sharedApis.length,
      pos_only_endpoints: onlyPos.length,
      panel_only_endpoints: onlyPanel.length,
      shared_function_names: sharedFns.length,
      pos_to_panel_links: posToPanelLinks,
      panel_to_pos_links: panelToPosLinks
    },
    shared_api_endpoints: sharedApis,
    pos_only_endpoints: onlyPos,
    panel_only_endpoints: onlyPanel,
    shared_function_names: sharedFns,
    flow: {
      // Quién es punto de entrada de qué
      pos_navigates_to_panel: posToPanelLinks > 0,
      panel_navigates_to_pos: panelToPosLinks > 0,
      // panel = configura, pos = consume
      role_pos: 'cashier/owner — operación punto de venta',
      role_panel: 'superadmin/platform — control de plataforma y configuración',
      handoff_pattern: 'panel define módulos/permisos/giros → pos consume vía /api/giro/config + /api/tenant/active-modules + /api/app/config'
    },
    table_endpoint_hints: tableEndpointHints
  };
}

// ---------- Main ----------
function main() {
  const args = parseArgs(process.argv);

  const pos   = scanHtml(POS_FILE, 'paneldecontrol.html');
  const panel = scanHtml(PANEL_FILE, 'salvadorex-pos.html');
  const apiSrc = readFileSafe(API_FILE);
  const apiRoutes = extractApiRoutes(apiSrc);
  const tablesFromApi   = extractTables(apiSrc);
  const tablesFromPos   = extractTables(readFileSafe(POS_FILE));
  const tablesFromPanel = extractTables(readFileSafe(PANEL_FILE));
  const allTables = uniqSort([...tablesFromApi, ...tablesFromPos, ...tablesFromPanel]);

  const relationship = buildRelationship(pos, panel, apiRoutes, allTables);

  const out = {
    _meta: {
      generated_at: new Date().toISOString(),
      generator: 'scripts/system-map/scan-pos-panel.js',
      generator_version: '1.0.0',
      root: ROOT.replace(/\\/g, '/'),
      sources: {
        pos:   pos.file,
        panel: panel.file,
        api:   path.relative(ROOT, API_FILE).replace(/\\/g, '/')
      },
      counts: {
        pos_modals:   pos.modals.length,
        panel_modals: panel.modals.length,
        pos_functions:   pos.functions.length,
        panel_functions: panel.functions.length,
        pos_buttons:   pos.buttons.length,
        panel_buttons: panel.buttons.length,
        pos_api_endpoints:   pos.apiEndpoints.length,
        panel_api_endpoints: panel.apiEndpoints.length,
        api_routes_declared: apiRoutes.length,
        supabase_tables: allTables.length
      },
      hashes: {
        pos_sha1:   pos.sha1,
        panel_sha1: panel.sha1
      }
    },

    pos_html:   pos,
    panel_html: panel,

    api: {
      file: path.relative(ROOT, API_FILE).replace(/\\/g, '/'),
      bytes: Buffer.byteLength(apiSrc, 'utf8'),
      lines: apiSrc ? apiSrc.split('\n').length : 0,
      sha1: apiSrc ? sha1(apiSrc) : null,
      routes_declared: apiRoutes
    },

    supabase: {
      tables_detected: allTables,
      counts_by_prefix: allTables.reduce((acc, t) => {
        const p = (t.match(/^(pos_|volvix_|giros_|app_)/) || [null, 'other'])[1] || 'other';
        acc[p] = (acc[p] || 0) + 1; return acc;
      }, {})
    },

    relationship
  };

  // garantizar dir
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const json = JSON.stringify(out, null, args.pretty ? 2 : 0);
  fs.writeFileSync(args.out, json, 'utf8');

  // resumen humano
  const m = out._meta.counts;
  console.log('[scan] OK ->', path.relative(ROOT, args.out).replace(/\\/g, '/'));
  console.log('[scan] counts:',
    'pos_modals=' + m.pos_modals,
    'panel_modals=' + m.panel_modals,
    'pos_fns=' + m.pos_functions,
    'panel_fns=' + m.panel_functions,
    'pos_apis=' + m.pos_api_endpoints,
    'panel_apis=' + m.panel_api_endpoints,
    'shared_apis=' + relationship.summary.shared_api_endpoints,
    'tables=' + m.supabase_tables,
    'api_routes=' + m.api_routes_declared
  );
}

if (require.main === module) main();

module.exports = {
  scanHtml,
  extractModals,
  extractFunctions,
  extractButtons,
  extractApiEndpoints,
  extractApiRoutes,
  extractTables,
  extractPanelNav,
  buildRelationship
};
