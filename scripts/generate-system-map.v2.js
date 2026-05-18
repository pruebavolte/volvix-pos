#!/usr/bin/env node
/**
 * generate-system-map.v2.js — SCANNER CON 5 PARCHES APLICADOS
 * ============================================================
 * Versión generada por el Blitz 2026-05-15.
 * Incluye patches:
 *   P1 — botón→handler/modal/screen (calls, opens_modal, navigates_to)
 *   P2 — screen→endpoint (bloques <section id="screen-X">)
 *   P3 — roles hardcoded (detectHardcodedRoles)
 *   P4 — realtime channels (detectRealtimeChannels)
 *   P5 — window vars globales (detectWindowVars)
 *
 * Uso: node scripts/generate-system-map.v2.js
 * Output: public/system-map.json  +  .audit/system-map.report.md
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const POS_FILE   = path.join(ROOT, 'public', 'salvadorex-pos.html');
const PDC_FILE   = path.join(ROOT, 'public', 'paneldecontrol.html');
const OUT_JSON   = path.join(ROOT, 'public', 'system-map.json');
const OUT_REPORT = path.join(ROOT, '.audit', 'system-map.report.md');

if (!fs.existsSync(path.dirname(OUT_REPORT))) {
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function read(file) { return fs.readFileSync(file, 'utf8'); }

function uniqueMatches(text, regex) {
  const out = new Set();
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1] || m[0]);
  return [...out].sort();
}

function findLines(text, regex) {
  return text.split('\n')
    .map((l, i) => ({ line: i + 1, snippet: l.trim().slice(0, 140) }))
    .filter(({ snippet }) => regex.test(snippet));
}

function getTitle(text) {
  const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

// ─────────────────────────────────────────────────────────────────
// PATCH 1 — HELPERS para extracción de botones enriquecida
// ─────────────────────────────────────────────────────────────────
function inferModalFromFn(fn) {
  if (!fn) return null;
  let m = fn.match(/(?:openModal|showModal)\(['"](?:modal-)?([a-z0-9-]+)['"]/i);
  if (m) return m[1];
  if (/closeModal\s*\(/.test(fn)) return null;
  // openXxxModal() → kebab-case
  m = fn.match(/^open([A-Z][a-zA-Z0-9]*)Modal\s*\(/);
  if (m) {
    return m[1].replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase()).replace(/^-/, '');
  }
  // openXxx() → modal heurístico
  m = fn.match(/^open([A-Z][a-zA-Z0-9]*)\s*\(/);
  if (m) {
    const name = m[1].replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase()).replace(/^-/, '');
    if (/panel|queue|drawer|screen/i.test(name)) return null;
    return name;
  }
  return null;
}

function inferScreenFromFn(fn) {
  if (!fn) return null;
  const m = fn.match(/showScreen\(['"]([a-z][a-z0-9-]*)['"]/i);
  return m ? m[1] : null;
}

function inferCallsFromFn(fn) {
  if (!fn) return null;
  const m = fn.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────
// PATCH 3 — Roles hardcoded
// ─────────────────────────────────────────────────────────────────
const KNOWN_ROLES = [
  'platform_owner', 'business_owner', 'admin', 'cashier',
  'waiter', 'delivery', 'owner', 'super_admin', 'manager',
  'superadmin', 'cajero'
];

function detectHardcodedRoles(text) {
  const roleRegex = new RegExp(`['"](?:${KNOWN_ROLES.join('|')})['"]`, 'g');
  const rolesFound = [];
  let rm;
  while ((rm = roleRegex.exec(text)) !== null) {
    const r = rm[0].replace(/['"]/g, '');
    if (!rolesFound.includes(r)) rolesFound.push(r);
  }
  const roleCheckRegex = /(?:role|userRole|currentRole|user\.role|tenant\.role|session\.role)\s*===?\s*['"]([a-z_]+)['"]/gi;
  const roleChecks = [];
  let rcm;
  while ((rcm = roleCheckRegex.exec(text)) !== null) roleChecks.push(rcm[1]);

  return {
    roles_mencionados:    rolesFound,
    role_checks_count:    roleChecks.length,
    role_checks_distinct: [...new Set(roleChecks)],
  };
}

// ─────────────────────────────────────────────────────────────────
// PATCH 4 — Realtime channels
// ─────────────────────────────────────────────────────────────────
function detectRealtimeChannels(text) {
  const results = { supabase_channels: [], websockets: [], event_sources: [], broadcast_channels: [], total: 0 };
  let m;
  const sbRe = /supabase\.channel\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = sbRe.exec(text)) !== null) results.supabase_channels.push(m[1]);
  const wsRe = /new\s+WebSocket\(\s*(['"`][^'"`]*['"`]|[^)]+)\)/g;
  while ((m = wsRe.exec(text)) !== null) results.websockets.push(m[1].trim().slice(0,100));
  const esRe = /new\s+EventSource\(\s*(['"`][^'"`]*['"`]|[^)]+)\)/g;
  while ((m = esRe.exec(text)) !== null) results.event_sources.push(m[1].trim().slice(0,100));
  const bcRe = /new\s+BroadcastChannel\(\s*(['"`]([^'"`]*)['"`]|[^)]+)\)/g;
  while ((m = bcRe.exec(text)) !== null) results.broadcast_channels.push(m[1].trim().slice(0,100));
  results.total = results.supabase_channels.length + results.websockets.length +
                  results.event_sources.length + results.broadcast_channels.length;
  return results;
}

// ─────────────────────────────────────────────────────────────────
// PATCH 5 — Window vars globales
// ─────────────────────────────────────────────────────────────────
function detectWindowVars(text) {
  const windowVars = [];
  const functionAssignments = [];
  const winRe = /window\.([A-Za-z_$][A-Za-z0-9_$.]*)\s*=\s*([^\n;]{1,120})/g;
  let m;
  while ((m = winRe.exec(text)) !== null) {
    const name = m[1]; const value = m[2].trim();
    if (value.startsWith('typeof ') || name.includes('?.')) continue;
    const isFn = value.startsWith('function') || /^\([^)]*\)\s*=>/.test(value) || /^[A-Za-z_$][A-Za-z0-9_$]*\s*=>/.test(value);
    if (isFn) { functionAssignments.push('window.' + name); }
    else {
      let kind = 'unknown';
      if (/^(true|false)$/.test(value)) kind = 'boolean';
      else if (/^['"`]/.test(value)) kind = 'string';
      else if (/^\d/.test(value)) kind = 'number';
      else if (value.startsWith('{')) kind = 'object';
      else if (value.startsWith('[')) kind = 'array';
      else if (value.startsWith('null')) kind = 'null';
      else kind = 'expression';
      windowVars.push({ name: 'window.' + name, kind, value_preview: value.slice(0,60) });
    }
  }
  const seen = new Set();
  const unique = windowVars.filter(v => { if (seen.has(v.name)) return false; seen.add(v.name); return true; });
  return { window_vars: unique, function_assignments: [...new Set(functionAssignments)], total: unique.length };
}

// ─────────────────────────────────────────────────────────────────
// PATCH 2 — Screen→Endpoint (bloques HTML por screen)
// ─────────────────────────────────────────────────────────────────
function extractScreenBlocks(text, screens) {
  const screenBlocks = {};
  for (const s of screens) {
    // Patrón confirmado: <section id="screen-X" class="screen-pad hidden">
    const blockRe = new RegExp(
      `<section[^>]*id=["']screen-${s}["'][^>]*>([\\s\\S]*?)</section>`,
      'i'
    );
    const blockMatch = text.match(blockRe);
    if (blockMatch) {
      const block = blockMatch[1];
      const blockEndpoints = uniqueMatches(block, /\/api\/([a-zA-Z0-9_/.-]+)/g).map(e => '/api/' + e);
      const blockModals    = uniqueMatches(block, /(?:openModal|showModal)\(['"]([a-z0-9-]+)['"]/g);
      const blockOnclicks  = (block.match(/onclick=["'][^"']{1,200}["']/g) || []).slice(0,20);
      screenBlocks[s] = { endpoints: blockEndpoints, modals_opened: blockModals, onclick_samples: blockOnclicks, _block_found: true };
    } else {
      // Fallback: heurística de proximidad (JS funciones ~300 lines around screen name)
      const posInFile = text.indexOf(`'${s}'`);
      const endpoints = posInFile > 0
        ? uniqueMatches(text.slice(Math.max(0, posInFile - 5000), posInFile + 5000), /\/api\/([a-zA-Z0-9_/.-]+)/g).map(e => '/api/' + e)
        : [];
      screenBlocks[s] = { endpoints, modals_opened: [], onclick_samples: [], _block_found: false, _deuda: 'no se encontró <section id="screen-' + s + '">' };
    }
  }
  return screenBlocks;
}

// ─────────────────────────────────────────────────────────────────
// SCAN FUNCTION — V2 con todos los patches
// ─────────────────────────────────────────────────────────────────
function scanFile(file, prefix) {
  const text = read(file);
  const stat = fs.statSync(file);

  // 1. SCREENS
  const screens = uniqueMatches(text, /showScreen\(['"]([a-z][a-z0-9-]*)['"]/g);

  // 2. CONFIG TABS + PERM TABS
  const tabsByCfg = uniqueMatches(text, /showCfg\(['"]([a-z][a-z0-9-]*)['"]/g);
  const tabIds    = uniqueMatches(text, /id="(perm-tab-[a-z0-9-]+)"/g);

  // 3. MODALS
  const modalIds       = uniqueMatches(text, /id="(modal-[a-z0-9-]+)"/g);
  const openModalCalls = uniqueMatches(text, /openModal\(['"]([a-z0-9-]+)['"]/g);
  const allModals      = [...new Set([...modalIds.map(id => id.replace('modal-', '')), ...openModalCalls])];

  // 4. BUTTONS — PATCH 1 enriquecido
  const buttons = [];
  const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let bm;
  while ((bm = btnRegex.exec(text)) !== null) {
    const attrs = bm[1] || '';
    const inner = bm[2] || '';
    const onclickM = attrs.match(/\bonclick\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const handler  = onclickM ? (onclickM[1] || onclickM[2] || '').trim().slice(0, 120) : '';
    const label    = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label || label.length < 2) continue;
    if (buttons.find(b => b.label === label)) continue;
    const navigates_to = inferScreenFromFn(handler) || null;
    const opens_modal  = navigates_to ? null : inferModalFromFn(handler);
    const calls        = inferCallsFromFn(handler) || null;
    const id = 'btn_' + prefix + '_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 25);
    buttons.push({ id, label, handler, calls, opens_modal, navigates_to });
  }

  // 5. WINDOW FUNCTIONS
  const cleanFns = [...new Set(text.match(/(?:function\s+|window\.)([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(=]/g) || [])]
    .map(s => s.replace(/(?:function\s+|window\.)/, '').replace(/[\s=\(].*/, '')).filter(Boolean);
  const fns = [...new Set(cleanFns)].sort().filter(f =>
    !['function','if','for','while','switch','return','try','catch'].includes(f) &&
    f.length > 2 && /^[a-zA-Z_]/.test(f)
  );

  // 6. API ENDPOINTS
  const endpoints = uniqueMatches(text, /\/api\/([a-zA-Z0-9_/.-]+)/g).map(e => '/api/' + e);

  // 7. SUPABASE TABLES
  const supabaseTables = uniqueMatches(text, /\.from\(['"]([a-z_][a-z0-9_]*)['"]/g);

  // 8. EXTERNAL REFS
  const externalRefs = uniqueMatches(text, /(?:href|location\.(?:href|replace))\s*=?\s*['"]\/?([a-z][a-z0-9-]+\.html(?:#[a-z]+)?)/gi);

  // PATCH 2 — Screen blocks
  const screen_blocks = extractScreenBlocks(text, screens);

  // PATCH 3 — Roles
  const roleData = detectHardcodedRoles(text);

  // PATCH 4 — Realtime
  const realtimeData = detectRealtimeChannels(text);

  // PATCH 5 — Window vars
  const windowData = detectWindowVars(text);

  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    title: getTitle(text),
    size_bytes: stat.size,
    lines: text.split('\n').length,
    last_modified: stat.mtime.toISOString(),
    screens,
    config_tabs: tabsByCfg,
    perm_tabs: tabIds,
    modals: allModals,
    buttons: buttons.slice(0, 80),
    functions: fns,
    api_endpoints: endpoints,
    supabase_tables: supabaseTables,
    external_refs: externalRefs,
    // V2 additions
    screen_blocks,
    roles_mencionados:    roleData.roles_mencionados,
    role_checks_count:    roleData.role_checks_count,
    role_checks_distinct: roleData.role_checks_distinct,
    realtime:             realtimeData,
    window_state:         windowData,
  };
}

// ─────────────────────────────────────────────────────────────────
// RUN SCANNER
// ─────────────────────────────────────────────────────────────────
console.log('=== generate-system-map.v2.js — Blitz 2026-05-15 ===');
console.log('Scanning POS:', POS_FILE);
const pos = scanFile(POS_FILE, 'pos');
console.log(`  screens:${pos.screens.length} modals:${pos.modals.length} buttons:${pos.buttons.length} fns:${pos.functions.length} api:${pos.api_endpoints.length}`);
console.log(`  roles: [${pos.roles_mencionados.join(', ')}]  role_checks:${pos.role_checks_count}`);
console.log(`  realtime total:${pos.realtime.total} (broadcast:${pos.realtime.broadcast_channels.length})`);
console.log(`  window_vars:${pos.window_state.total}`);

console.log('Scanning PDC:', PDC_FILE);
const pdc = scanFile(PDC_FILE, 'pdc');
console.log(`  perm_tabs:${pdc.perm_tabs.length} buttons:${pdc.buttons.length} api:${pdc.api_endpoints.length}`);

// ─────────────────────────────────────────────────────────────────
// NODOS + RELACIONES
// ─────────────────────────────────────────────────────────────────
const nodos = [];
const relaciones = [];

// Módulos raíz
nodos.push({
  id: 'mod_pos', tipo: 'modulo',
  nombre: 'SalvadoreX POS', archivo: pos.file,
  proposito: 'Punto de venta operativo. ' + pos.screens.length + ' pantallas.',
  rol_principal: 'cashier / business_owner',
  meta: { lineas: pos.lines, screens: pos.screens.length, modificado: pos.last_modified,
          roles_detectados: pos.roles_mencionados, window_vars: pos.window_state.total,
          realtime_channels: pos.realtime.total }
});
nodos.push({
  id: 'mod_pdc_permisos', tipo: 'modulo',
  nombre: 'Panel de Control · Permisos', archivo: pdc.file,
  proposito: 'Gestión de permisos por tenant. Spin-off de POS (2026-05-12).',
  rol_principal: 'platform_owner',
  meta: { lineas: pdc.lines, perm_tabs: pdc.perm_tabs.length, modificado: pdc.last_modified }
});

// Screens POS
pos.screens.forEach(s => {
  const sb = pos.screen_blocks[s] || {};
  nodos.push({
    id: 'screen_pos_' + s, tipo: 'screen', nombre: s, parent: 'mod_pos',
    endpoints_propios: sb.endpoints || [],
    modals_abiertos: sb.modals_opened || [],
    _block_found: sb._block_found || false
  });
  relaciones.push({ from: 'mod_pos', to: 'screen_pos_' + s, verb: 'contiene' });
});

// Config tabs
pos.config_tabs.forEach(t => {
  nodos.push({ id: 'cfg_' + t, tipo: 'cfg_tab', nombre: 'Config · ' + t, parent: 'screen_pos_config' });
  relaciones.push({ from: 'screen_pos_config', to: 'cfg_' + t, verb: 'contiene' });
});

// PDC perm tabs
pdc.perm_tabs.forEach(t => {
  const short = t.replace('perm-tab-', '');
  nodos.push({ id: 'pdctab_' + short, tipo: 'pdc_tab', nombre: 'Permisos · ' + short, parent: 'mod_pdc_permisos' });
  relaciones.push({ from: 'mod_pdc_permisos', to: 'pdctab_' + short, verb: 'contiene' });
});

// Modales POS
pos.modals.forEach(m => {
  nodos.push({ id: 'modal_pos_' + m, tipo: 'modal', nombre: m, parent: 'mod_pos' });
  relaciones.push({ from: 'mod_pos', to: 'modal_pos_' + m, verb: 'contiene_modal' });
});

// PATCH 1 — Relaciones botón→screen/modal/función
pos.buttons.filter(b => b.navigates_to).forEach(b => {
  const screenId = 'screen_pos_' + b.navigates_to;
  if (nodos.find(n => n.id === screenId)) {
    relaciones.push({ from: b.id, to: screenId, verb: 'navega_a_screen', contexto: b.handler });
  }
});
pos.buttons.filter(b => b.opens_modal).forEach(b => {
  const modalId = 'modal_pos_' + b.opens_modal;
  relaciones.push({ from: b.id, to: modalId, verb: 'abre_modal', contexto: b.handler });
});
pos.buttons.filter(b => b.calls && !b.navigates_to && !b.opens_modal).forEach(b => {
  relaciones.push({ from: b.id, to: 'mod_pos', verb: 'llama_funcion', contexto: b.calls });
});

// PATCH 2 — Relaciones screen→endpoint (granularidad fina)
for (const [screen, info] of Object.entries(pos.screen_blocks || {})) {
  const screenId = 'screen_pos_' + screen;
  for (const ep of (info.endpoints || [])) {
    const apiId = 'api_' + ep.replace(/[^a-z0-9]/gi, '_');
    if (nodos.find(n => n.id === apiId)) {
      relaciones.push({ from: screenId, to: apiId, verb: 'llama_api', granularidad: 'screen' });
    }
  }
  for (const m of (info.modals_opened || [])) {
    const modalId = 'modal_pos_' + m;
    if (nodos.find(n => n.id === modalId)) {
      relaciones.push({ from: screenId, to: modalId, verb: 'abre_modal' });
    }
  }
}

// ENDPOINTS
const apiPos    = new Set(pos.api_endpoints);
const apiPdc    = new Set(pdc.api_endpoints);
const apiShared = [...apiPos].filter(e => apiPdc.has(e));
const apiOnlyPos = [...apiPos].filter(e => !apiPdc.has(e));
const apiOnlyPdc = [...apiPdc].filter(e => !apiPos.has(e));

apiOnlyPos.slice(0, 60).forEach(e => {
  nodos.push({ id: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), tipo: 'endpoint', nombre: e, exclusivo: 'POS' });
  relaciones.push({ from: 'mod_pos', to: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), verb: 'llama_api' });
});
apiOnlyPdc.slice(0, 60).forEach(e => {
  nodos.push({ id: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), tipo: 'endpoint', nombre: e, exclusivo: 'PDC' });
  relaciones.push({ from: 'mod_pdc_permisos', to: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), verb: 'llama_api' });
});
apiShared.slice(0, 30).forEach(e => {
  nodos.push({ id: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), tipo: 'endpoint', nombre: e, exclusivo: 'compartido' });
  relaciones.push({ from: 'mod_pos',           to: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), verb: 'llama_api' });
  relaciones.push({ from: 'mod_pdc_permisos',  to: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), verb: 'llama_api' });
});

// RELACIONES CROSS-FILE
relaciones.push({ from: 'mod_pos', to: 'mod_pdc_permisos', verb: 'redirige_a',
  contexto: 'salvadorex-pos.html#permisos → location.replace("/paneldecontrol.html")', evidencia: 'line ~21325', rol_requerido: 'platform_owner' });
relaciones.push({ from: 'mod_pdc_permisos', to: 'mod_pos', verb: 'preview_iframe',
  contexto: 'PDC carga POS como iframe ?preview=1&module=X', evidencia: 'paneldecontrol.html:5742' });
relaciones.push({ from: 'mod_pdc_permisos', to: 'mod_pos', verb: 'redirige_si_no_es_permisos',
  contexto: 'hash distinto de #permisos → /salvadorex-pos.html', evidencia: 'paneldecontrol.html:2699' });
relaciones.push({ from: 'mod_pdc_permisos', to: 'mod_pos', verb: 'origen_extraccion',
  contexto: 'PDC extraído de POS el 2026-05-12', evidencia: 'pos:5481' });
relaciones.push({ from: 'mod_pos', to: 'mod_pdc_permisos', verb: 'comparte_endpoints',
  contexto: apiShared.slice(0,8).join(', '), count: apiShared.length });

// ─────────────────────────────────────────────────────────────────
// JSON + REPORTE
// ─────────────────────────────────────────────────────────────────
const screenBlocksWithFallback = Object.entries(pos.screen_blocks || {}).filter(([,v]) => !v._block_found);

const json = {
  meta: {
    proyecto: 'Volvix POS — SalvadoreX',
    version:  'v2.0 — blitz 2026-05-15',
    generado: new Date().toISOString(),
    fuente:   'generate-system-map.v2.js — 5 patches aplicados',
    archivos_escaneados: [pos.file, pdc.file],
    patches_aplicados: ['P1-botones', 'P2-screen-blocks', 'P3-roles', 'P4-realtime', 'P5-window-vars']
  },
  resumen: {
    nodos_total:      nodos.length,
    relaciones_total: relaciones.length,
    salvadorex_pos: {
      lineas: pos.lines, screens: pos.screens.length,
      config_tabs: pos.config_tabs.length, modals: pos.modals.length,
      buttons_capturados: pos.buttons.length, api_endpoints: pos.api_endpoints.length,
      funciones_window: pos.functions.length,
      roles_detectados: pos.roles_mencionados, role_checks: pos.role_checks_count,
      realtime_channels: pos.realtime.total, window_vars: pos.window_state.total,
      screens_con_bloque_encontrado: Object.values(pos.screen_blocks || {}).filter(v => v._block_found).length,
      screens_con_fallback: screenBlocksWithFallback.length
    },
    paneldecontrol: {
      lineas: pdc.lines, perm_tabs: pdc.perm_tabs.length,
      buttons_capturados: pdc.buttons.length, api_endpoints: pdc.api_endpoints.length,
      funciones_window: pdc.functions.length,
      roles_detectados: pdc.roles_mencionados, realtime_channels: pdc.realtime.total,
      window_vars: pdc.window_state.total
    },
    api_compartidos: apiShared.length,
    api_solo_pos: apiOnlyPos.length,
    api_solo_pdc: apiOnlyPdc.length
  },
  archivos:  { salvadorex_pos: pos, paneldecontrol: pdc },
  nodos,
  relaciones,
  cross_references: {
    pos_referencia_pdc: findLines(read(POS_FILE), /paneldecontrol/i),
    pdc_referencia_pos: findLines(read(PDC_FILE), /salvadorex-pos\.html/i)
  },
  deudas: {
    roles_no_normalizados: pos.roles_mencionados.includes('cashier') && pos.roles_mencionados.includes('cajero')
      ? 'DEUDA: coexisten "cashier" y "cajero" sin normalización' : null,
    screens_sin_bloque: screenBlocksWithFallback.map(([s]) => s),
    window_vars_de_riesgo: (pos.window_state.window_vars || []).filter(v =>
      ['window.CART','window.IMPERSONATING','window.fetch','window.VOLVIX'].includes(v.name)
    ),
    broadcast_channels_sin_verificar_close: pos.realtime.broadcast_channels
  }
};

fs.writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
console.log('\n✓ JSON written:', OUT_JSON, '(' + (fs.statSync(OUT_JSON).size/1024).toFixed(1) + ' KB)');

// Reporte
const report = `# System Map Report v2 — ${new Date().toISOString().split('T')[0]}

## Patches aplicados
- P1: botón→handler/modal/screen (calls, opens_modal, navigates_to)
- P2: screen→endpoint por bloque HTML \`<section id="screen-X">\`
- P3: roles hardcoded detectados
- P4: realtime channels
- P5: window vars globales

## Resumen

| Métrica | salvadorex-pos.html | paneldecontrol.html |
|---------|---------------------|---------------------|
| Líneas | ${pos.lines} | ${pdc.lines} |
| Screens | ${pos.screens.length} | — |
| Screens con bloque encontrado | ${Object.values(pos.screen_blocks||{}).filter(v=>v._block_found).length} | — |
| Config tabs | ${pos.config_tabs.length} | — |
| Perm tabs | — | ${pdc.perm_tabs.length} |
| Modales | ${pos.modals.length} | — |
| Botones únicos | ${pos.buttons.length} | ${pdc.buttons.length} |
| Funciones window | ${pos.functions.length} | ${pdc.functions.length} |
| Endpoints /api/* | ${pos.api_endpoints.length} | ${pdc.api_endpoints.length} |
| Roles detectados | ${pos.roles_mencionados.join(', ')} | ${pdc.roles_mencionados.join(', ')} |
| Realtime channels | ${pos.realtime.total} | ${pdc.realtime.total} |
| Window vars globales | ${pos.window_state.total} | ${pdc.window_state.total} |

## Endpoints API
- Solo POS: ${apiOnlyPos.length}
- Solo PDC: ${apiOnlyPdc.length}
- Compartidos: ${apiShared.length}

### Compartidos:
${apiShared.slice(0,15).map(e => '- \`' + e + '\`').join('\n')}

## Deudas detectadas (blitz 2026-05-15)
${json.deudas.roles_no_normalizados ? '- ⚠️ ' + json.deudas.roles_no_normalizados : ''}
${json.deudas.screens_sin_bloque.length ? '- ⚠️ Screens sin bloque HTML: ' + json.deudas.screens_sin_bloque.join(', ') : '- ✅ Todas las screens tienen bloque HTML detectado'}
- ⚠️ window vars de riesgo: ${json.deudas.window_vars_de_riesgo.map(v=>v.name).join(', ')}
- ℹ️ BroadcastChannels (verificar .close()): ${json.deudas.broadcast_channels_sin_verificar_close.join(', ')}

---
Generado por \`generate-system-map.v2.js\` · ${new Date().toISOString()}
`;
fs.writeFileSync(OUT_REPORT, report);
console.log('✓ Report written:', OUT_REPORT);
console.log('\n=== V2 Summary ===');
console.log(`  Nodos: ${nodos.length} | Relaciones: ${relaciones.length}`);
console.log(`  Roles no normalizados: ${json.deudas.roles_no_normalizados ? 'SÍ (cashier + cajero)' : 'OK'}`);
console.log(`  Screens sin bloque: ${json.deudas.screens_sin_bloque.join(', ') || 'ninguna'}`);
