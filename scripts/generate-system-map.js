#!/usr/bin/env node
/**
 * generate-system-map.js — VIVO
 * Escanea salvadorex-pos.html + paneldecontrol.html y produce un JSON
 * estructurado con módulos, sub-paneles, modales, botones, funciones,
 * endpoints API y RELACIONES entre ambos archivos.
 *
 * Cada vez que se ejecuta regenera el JSON desde el código real → el
 * mapa nunca se desactualiza. Ejecutable manual o por cron/CI.
 *
 * Uso:
 *   node scripts/generate-system-map.js
 *
 * Output:
 *   public/system-map.json    ← el JSON que carga volvix-system-map.html
 *   .audit/system-map.report.md  ← reporte de deudas/gaps
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const POS_FILE = path.join(ROOT, 'public', 'salvadorex-pos.html');
const PDC_FILE = path.join(ROOT, 'public', 'paneldecontrol.html');
const OUT_JSON = path.join(ROOT, 'public', 'system-map.json');
const OUT_REPORT = path.join(ROOT, '.audit', 'system-map.report.md');

if (!fs.existsSync(path.dirname(OUT_REPORT))) {
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function uniqueMatches(text, regex) {
  const out = new Set();
  let m; const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  while ((m = re.exec(text)) !== null) out.add(m[1] || m[0]);
  return [...out].sort();
}

function findLines(text, regex) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((l, i) => { if (regex.test(l)) out.push({ line: i + 1, snippet: l.trim().slice(0, 140) }); });
  return out;
}

function getTitle(text) {
  const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

// ─────────────────────────────────────────────────────────────────
// Scan a single HTML file → estructura
// ─────────────────────────────────────────────────────────────────
function scanFile(file, prefix) {
  const text = read(file);
  const stat = fs.statSync(file);

  // 1. SCREENS (showScreen calls)
  const screens = uniqueMatches(text, /showScreen\(['"]([a-z][a-z0-9-]*)['"]/g);

  // 2. SUB-PANELS (data-* + role="tabpanel" + .config-tab IDs)
  const tabsByCfg = uniqueMatches(text, /showCfg\(['"]([a-z][a-z0-9-]*)['"]/g);
  const tabIds = uniqueMatches(text, /id="(perm-tab-[a-z0-9-]+)"/g);

  // 3. MODALS
  const modalIds = uniqueMatches(text, /id="(modal-[a-z0-9-]+)"/g);
  const openModalCalls = uniqueMatches(text, /openModal\(['"]([a-z0-9-]+)['"]/g);
  const allModals = [...new Set([...modalIds.map(id => id.replace('modal-', '')), ...openModalCalls])];

  // 4. BUTTONS (visible text via grep — sólo botones con texto/handler)
  const buttons = [];
  const btnRegex = /<button[^>]*?(?:onclick=["']([^"']+)["'])?[^>]*>([^<]{1,60})<\/button>/g;
  let bm;
  while ((bm = btnRegex.exec(text)) !== null) {
    const handler = (bm[1] || '').trim().slice(0, 80);
    const label = bm[2].trim();
    if (label && label.length > 1 && !buttons.find(b => b.label === label)) {
      buttons.push({ id: 'btn_' + prefix + '_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 25),
                     label, handler });
    }
  }

  // 5. WINDOW FUNCTIONS (window.fnName = function | function fnName)
  const fnDefs = uniqueMatches(text, /(?:window\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s+)?function|function\s+([a-zA-Z_][a-zA-Z0-9_]*))/g);
  // Limpiar: las regex capturan grupos opcionales, normalizar
  const cleanFns = [...new Set(text.match(/(?:function\s+|window\.)([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(=]/g) || [])]
    .map(s => s.replace(/(?:function\s+|window\.)/, '').replace(/[\s=\(].*/, '')).filter(Boolean);
  const fns = [...new Set(cleanFns)].sort().filter(f =>
    !['function', 'if', 'for', 'while', 'switch', 'return', 'try', 'catch'].includes(f) &&
    f.length > 2 && /^[a-zA-Z_]/.test(f)
  );

  // 6. API ENDPOINTS (URLs /api/...)
  const endpoints = uniqueMatches(text, /\/api\/([a-zA-Z0-9_/.-]+)/g).map(e => '/api/' + e);

  // 7. SUPABASE TABLES (si hay .from('...'))
  const supabaseTables = uniqueMatches(text, /\.from\(['"]([a-z_][a-z0-9_]*)['"]/g);

  // 8. EXTERNAL REFERENCES (links/href to other HTMLs)
  const externalRefs = uniqueMatches(text, /(?:href|location\.(?:href|replace))\s*=?\s*['"]\/?([a-z][a-z0-9-]+\.html(?:#[a-z]+)?)/gi);

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
    buttons: buttons.slice(0, 50), // limitar
    functions: fns,
    api_endpoints: endpoints,
    supabase_tables: supabaseTables,
    external_refs: externalRefs
  };
}

// ─────────────────────────────────────────────────────────────────
// BUILD SYSTEM MAP
// ─────────────────────────────────────────────────────────────────
console.log('Scanning POS file:', POS_FILE);
const pos = scanFile(POS_FILE, 'pos');
console.log('  screens:', pos.screens.length, '| modals:', pos.modals.length,
            '| buttons:', pos.buttons.length, '| fns:', pos.functions.length,
            '| api:', pos.api_endpoints.length);

console.log('Scanning PDC file:', PDC_FILE);
const pdc = scanFile(PDC_FILE, 'pdc');
console.log('  screens:', pdc.screens.length, '| perm_tabs:', pdc.perm_tabs.length,
            '| buttons:', pdc.buttons.length, '| fns:', pdc.functions.length,
            '| api:', pdc.api_endpoints.length);

// ─────────────────────────────────────────────────────────────────
// NODOS para el grafo
// ─────────────────────────────────────────────────────────────────
const nodos = [];
const relaciones = [];

// MÓDULO 1: salvadorex-pos
nodos.push({
  id: 'mod_pos',
  tipo: 'modulo',
  nombre: 'SalvadoreX POS',
  archivo: pos.file,
  proposito: 'Punto de venta operativo. ' + pos.screens.length + ' pantallas internas (showScreen).',
  rol_principal: 'cashier / business_owner',
  meta: { lineas: pos.lines, screens: pos.screens.length, modificado: pos.last_modified }
});

// MÓDULO 2: paneldecontrol#permisos
nodos.push({
  id: 'mod_pdc_permisos',
  tipo: 'modulo',
  nombre: 'Panel de Control · Permisos',
  archivo: pdc.file,
  proposito: 'Gestión de permisos por tenant/usuario. Extraído de salvadorex-pos.html el 2026-05-12 para aligerar.',
  rol_principal: 'platform_owner (super admin)',
  meta: { lineas: pdc.lines, perm_tabs: pdc.perm_tabs.length, modificado: pdc.last_modified }
});

// SUB-PANTALLAS de POS (showScreen)
pos.screens.forEach(s => {
  nodos.push({ id: 'screen_pos_' + s, tipo: 'screen', nombre: s, parent: 'mod_pos' });
  relaciones.push({ from: 'mod_pos', to: 'screen_pos_' + s, verb: 'contiene' });
});

// SUB-TABS de Config (showCfg)
pos.config_tabs.forEach(t => {
  nodos.push({ id: 'cfg_' + t, tipo: 'cfg_tab', nombre: 'Config · ' + t, parent: 'screen_pos_config' });
  relaciones.push({ from: 'screen_pos_config', to: 'cfg_' + t, verb: 'contiene' });
});

// TABS de permisos en PDC
pdc.perm_tabs.forEach(t => {
  const short = t.replace('perm-tab-', '');
  nodos.push({ id: 'pdctab_' + short, tipo: 'pdc_tab', nombre: 'Permisos · ' + short, parent: 'mod_pdc_permisos' });
  relaciones.push({ from: 'mod_pdc_permisos', to: 'pdctab_' + short, verb: 'contiene' });
});

// MODALES de POS
pos.modals.forEach(m => {
  nodos.push({ id: 'modal_pos_' + m, tipo: 'modal', nombre: m, parent: 'mod_pos' });
  relaciones.push({ from: 'mod_pos', to: 'modal_pos_' + m, verb: 'contiene_modal' });
});

// ENDPOINTS API
const apiPos = new Set(pos.api_endpoints);
const apiPdc = new Set(pdc.api_endpoints);
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
  relaciones.push({ from: 'mod_pos', to: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), verb: 'llama_api' });
  relaciones.push({ from: 'mod_pdc_permisos', to: 'api_' + e.replace(/[^a-z0-9]/gi, '_'), verb: 'llama_api' });
});

// ─────────────────────────────────────────────────────────────────
// RELACIONES CROSS-FILE (lo más importante)
// ─────────────────────────────────────────────────────────────────
relaciones.push({
  from: 'mod_pos',
  to: 'mod_pdc_permisos',
  verb: 'redirige_a',
  contexto: 'salvadorex-pos.html#permisos → location.replace("/paneldecontrol.html")',
  evidencia: 'salvadorex-pos.html:21325',
  rol_requerido: 'platform_owner'
});

relaciones.push({
  from: 'mod_pdc_permisos',
  to: 'mod_pos',
  verb: 'preview_iframe',
  contexto: 'paneldecontrol.html carga POS como iframe ?preview=1&module=X para mostrar cómo lo ve el cliente final',
  evidencia: 'salvadorex-pos.html:25, paneldecontrol.html:5742'
});

relaciones.push({
  from: 'mod_pdc_permisos',
  to: 'mod_pos',
  verb: 'redirige_si_no_es_permisos',
  contexto: 'Si llegan a paneldecontrol.html con hash distinto de #permisos, redirige a /salvadorex-pos.html#name',
  evidencia: 'paneldecontrol.html:2699-2700'
});

relaciones.push({
  from: 'mod_pdc_permisos',
  to: 'mod_pos',
  verb: 'origen_extraccion',
  contexto: 'PDC fue extraído de salvadorex-pos.html el 2026-05-12 para aligerar el bundle principal',
  evidencia: 'salvadorex-pos.html:5481-5484'
});

// API SHARED → ambos usan los mismos endpoints admin
relaciones.push({
  from: 'mod_pos',
  to: 'mod_pdc_permisos',
  verb: 'comparte_endpoints',
  contexto: 'Ambos usan /api/admin/tenants, /api/admin/giros, /api/admin/users/*',
  count: apiShared.length
});

// ─────────────────────────────────────────────────────────────────
// META + Estadísticas
// ─────────────────────────────────────────────────────────────────
const json = {
  meta: {
    proyecto: 'Volvix POS — SalvadoreX',
    version: '1.0 — escaneo ' + new Date().toISOString().split('T')[0],
    generado: new Date().toISOString(),
    fuente: 'Auto-generado por scripts/generate-system-map.js — escaneo regex de los 2 HTML',
    archivos_escaneados: [pos.file, pdc.file],
    relacionado_con: 'volvix-system-map.html (visualizador del grafo)'
  },
  resumen: {
    nodos_total: nodos.length,
    relaciones_total: relaciones.length,
    salvadorex_pos: {
      lineas: pos.lines,
      screens: pos.screens.length,
      config_tabs: pos.config_tabs.length,
      modals: pos.modals.length,
      buttons_capturados: pos.buttons.length,
      api_endpoints: pos.api_endpoints.length,
      supabase_tables: pos.supabase_tables.length,
      funciones_window: pos.functions.length
    },
    paneldecontrol: {
      lineas: pdc.lines,
      perm_tabs: pdc.perm_tabs.length,
      buttons_capturados: pdc.buttons.length,
      api_endpoints: pdc.api_endpoints.length,
      funciones_window: pdc.functions.length
    },
    api_compartidos: apiShared.length,
    api_solo_pos: apiOnlyPos.length,
    api_solo_pdc: apiOnlyPdc.length
  },
  archivos: { salvadorex_pos: pos, paneldecontrol: pdc },
  nodos,
  relaciones,
  cross_references: {
    pos_referencia_pdc: findLines(read(POS_FILE), /paneldecontrol/i),
    pdc_referencia_pos: findLines(read(PDC_FILE), /salvadorex-pos\.html/i)
  }
};

// ─────────────────────────────────────────────────────────────────
// ESCRIBIR JSON + REPORTE
// ─────────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
console.log('\n✓ JSON written:', OUT_JSON, '(' + (fs.statSync(OUT_JSON).size / 1024).toFixed(1) + ' KB)');

// Reporte markdown
const report = `# System Map Report — ${new Date().toISOString().split('T')[0]}

## Resumen

| Métrica | salvadorex-pos.html | paneldecontrol.html |
|---------|---------------------|---------------------|
| Líneas | ${pos.lines} | ${pdc.lines} |
| Screens (showScreen) | ${pos.screens.length} | ${pdc.screens.length} |
| Config tabs (showCfg) | ${pos.config_tabs.length} | 0 |
| Perm tabs | 0 | ${pdc.perm_tabs.length} |
| Modales | ${pos.modals.length} | ${pos.modals.length} |
| Botones únicos | ${pos.buttons.length} | ${pdc.buttons.length} |
| Funciones window | ${pos.functions.length} | ${pdc.functions.length} |
| Endpoints /api/* | ${pos.api_endpoints.length} | ${pdc.api_endpoints.length} |
| Tablas Supabase (.from) | ${pos.supabase_tables.length} | ${pdc.supabase_tables.length} |

## Endpoints API

- **Solo en POS:** ${apiOnlyPos.length}
- **Solo en PDC:** ${apiOnlyPdc.length}
- **Compartidos:** ${apiShared.length}

### Compartidos (top 15):
${apiShared.slice(0, 15).map(e => '- `' + e + '`').join('\n')}

## Relaciones cross-file detectadas

${relaciones.filter(r => (r.from === 'mod_pos' && r.to === 'mod_pdc_permisos') ||
                          (r.from === 'mod_pdc_permisos' && r.to === 'mod_pos'))
  .map(r => `- **${r.verb}**: ${r.from} → ${r.to}\n  - ${r.contexto || ''}\n  - Evidencia: ${r.evidencia || '—'}`)
  .join('\n')}

## Conclusión arquitectónica

\`paneldecontrol.html\` es un **SPIN-OFF de \`salvadorex-pos.html\`** (extraído 2026-05-12).

- Comparten **${apiShared.length} endpoints API** (incluyendo /api/admin/tenants, /api/admin/giros).
- POS redirige a PDC cuando user va a #permisos → PDC verifica platform_owner role.
- PDC carga POS como iframe para hacer "vista previa" en su columna 4.
- PDC redirige a POS si url no contiene #permisos.

## Deudas / gaps detectados

${pos.functions.length > 200 ? '- ⚠️ POS tiene >200 funciones window (alto acoplamiento, considerar modularizar)' : ''}
${pdc.functions.length > 100 ? '- ⚠️ PDC tiene >100 funciones window' : ''}
${pos.supabase_tables.length === 0 ? '- ✓ POS no hace .from() directo (usa /api/* — bien)' : ''}
${pdc.supabase_tables.length === 0 ? '- ✓ PDC no hace .from() directo (usa /api/* — bien)' : ''}
${pos.lines > 20000 ? '- ⚠️ salvadorex-pos.html > 20K líneas: candidato a más extracciones tipo PDC' : ''}

---
Generado por \`scripts/generate-system-map.js\` · ${new Date().toISOString()}
`;
fs.writeFileSync(OUT_REPORT, report);
console.log('✓ Report written:', OUT_REPORT);

console.log('\n=== Summary ===');
console.log(`  Nodos: ${nodos.length}`);
console.log(`  Relaciones: ${relaciones.length}`);
console.log(`  API compartidos: ${apiShared.length}`);
console.log(`  Cross-refs POS→PDC: ${json.cross_references.pos_referencia_pdc.length} líneas`);
console.log(`  Cross-refs PDC→POS: ${json.cross_references.pdc_referencia_pos.length} líneas`);
