#!/usr/bin/env node
/**
 * render-markdown.js — Convierte pos-panel-map.json en un README humano.
 *
 * Uso:
 *   node scripts/system-map/render-markdown.js
 *   node scripts/system-map/render-markdown.js --in path.json --out path.md
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_IN  = path.join(ROOT, '.audit', 'system-map', 'pos-panel-map.json');
const DEFAULT_OUT = path.join(ROOT, '.audit', 'system-map', 'POS-PANEL-MAP.md');

function parseArgs(argv) {
  const a = { in: DEFAULT_IN, out: DEFAULT_OUT };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in'  && argv[i+1]) a.in  = path.resolve(argv[++i]);
    if (argv[i] === '--out' && argv[i+1]) a.out = path.resolve(argv[++i]);
  }
  return a;
}

function table(headers, rows) {
  const head = '| ' + headers.join(' | ') + ' |';
  const sep  = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const body = rows.map(r => '| ' + r.map(c => String(c == null ? '' : c).replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
  return [head, sep, body].join('\n');
}

function render(map) {
  const m   = map._meta;
  const rel = map.relationship;
  const pos = map.pos_html;
  const pan = map.panel_html;

  const lines = [];
  lines.push('# Mapa Sistema — salvadorex-pos.html ↔ paneldecontrol.html');
  lines.push('');
  lines.push(`Generado: ${m.generated_at}`);
  lines.push(`Hash POS: \`${m.hashes.pos_sha1}\` · Hash Panel: \`${m.hashes.panel_sha1}\``);
  lines.push('');
  lines.push('> Este archivo lo genera `scripts/system-map/render-markdown.js` desde el JSON producido por `scripts/system-map/scan-pos-panel.js`. **No editar a mano**: cualquier cambio se sobreescribe en el siguiente scan.');
  lines.push('');

  // ---------- Resumen ----------
  lines.push('## 1. Resumen ejecutivo');
  lines.push('');
  lines.push(table(
    ['Métrica', 'POS (salvadorex-pos.html)', 'Panel (paneldecontrol.html)'],
    [
      ['Líneas',            pos.lines, pan.lines],
      ['Bytes',             pos.bytes, pan.bytes],
      ['Modales',           m.counts.pos_modals, m.counts.panel_modals],
      ['Funciones',         m.counts.pos_functions, m.counts.panel_functions],
      ['Botones',           m.counts.pos_buttons, m.counts.panel_buttons],
      ['Endpoints /api/ consumidos', m.counts.pos_api_endpoints, m.counts.panel_api_endpoints],
      ['Referencias al otro archivo', pos.crossRef.references, pan.crossRef.references],
    ]
  ));
  lines.push('');
  lines.push(`- Endpoints **compartidos** POS↔Panel: **${rel.summary.shared_api_endpoints}** (\`${(rel.shared_api_endpoints || []).join(', ') || '∅'}\`)`);
  lines.push(`- Endpoints **solo POS**: ${rel.summary.pos_only_endpoints}`);
  lines.push(`- Endpoints **solo Panel**: ${rel.summary.panel_only_endpoints}`);
  lines.push(`- Funciones con **mismo nombre** en ambos: ${rel.summary.shared_function_names} → \`${(rel.shared_function_names || []).slice(0, 12).join(', ')}\`${rel.summary.shared_function_names > 12 ? '…' : ''}`);
  lines.push(`- Rutas backend declaradas en \`api/index.js\`: **${m.counts.api_routes_declared}**`);
  lines.push(`- Tablas Supabase detectadas: **${m.counts.supabase_tables}** (${Object.entries(map.supabase.counts_by_prefix).map(([k,v]) => `${k}=${v}`).join(', ')})`);
  lines.push('');

  // ---------- Roles y flujo ----------
  lines.push('## 2. Roles y flujo');
  lines.push('');
  lines.push(`- **POS** — ${rel.flow.role_pos}`);
  lines.push(`- **Panel** — ${rel.flow.role_panel}`);
  lines.push('');
  lines.push(`**Patrón de handoff:** ${rel.flow.handoff_pattern}`);
  lines.push('');

  // ---------- Navegación panel ----------
  lines.push('## 3. Navegación del Panel (v14)');
  lines.push('');
  lines.push(table(['data-permv14-nav', 'data-permv14-pane existe'],
    pan.panelNav.navs.map(n => [n, pan.panelNav.panes.includes(n) ? '✅' : '❌'])
  ));
  if (pan.panelNav.panes.some(p => !pan.panelNav.navs.includes(p))) {
    const huerf = pan.panelNav.panes.filter(p => !pan.panelNav.navs.includes(p));
    lines.push('');
    lines.push('Panes **sin nav** (huérfanos visualmente, accesibles vía código): `' + huerf.join(', ') + '`');
  }
  lines.push('');

  // ---------- Modales POS ----------
  lines.push('## 4. Modales del POS');
  lines.push('');
  lines.push(table(['ID', 'Label visible'], pos.modals.map(x => [`\`${x.id}\``, x.label || '∅'])));
  lines.push('');

  // ---------- Tablas Supabase ----------
  lines.push('## 5. Tablas Supabase detectadas');
  lines.push('');
  lines.push('Por prefijo:');
  Object.entries(map.supabase.counts_by_prefix).forEach(([k,v]) => {
    lines.push(`- \`${k}*\` → ${v}`);
  });
  lines.push('');
  lines.push('Listado completo:');
  lines.push('');
  lines.push('```');
  lines.push(map.supabase.tables_detected.join('\n'));
  lines.push('```');
  lines.push('');

  // ---------- APIs compartidas / únicas ----------
  lines.push('## 6. Endpoints `/api/` por origen');
  lines.push('');
  lines.push('### 6.1 Compartidos POS+Panel');
  lines.push('');
  lines.push((rel.shared_api_endpoints || []).map(e => `- \`${e}\``).join('\n') || '_(ninguno)_');
  lines.push('');
  lines.push('### 6.2 Solo POS');
  lines.push('');
  lines.push((rel.pos_only_endpoints || []).map(e => `- \`${e}\``).join('\n'));
  lines.push('');
  lines.push('### 6.3 Solo Panel');
  lines.push('');
  lines.push((rel.panel_only_endpoints || []).map(e => `- \`${e}\``).join('\n'));
  lines.push('');

  // ---------- Rutas backend ----------
  lines.push('## 7. Backend — rutas declaradas en `api/index.js`');
  lines.push('');
  lines.push(`Total: **${map.api.routes_declared.length}**`);
  lines.push('');
  // agrupar por primer segmento
  const grouped = {};
  map.api.routes_declared.forEach(r => {
    const seg = (r.path.split('/')[2] || '_root_');
    (grouped[seg] = grouped[seg] || []).push(r);
  });
  const segments = Object.keys(grouped).sort();
  lines.push(table(['Grupo `/api/<seg>/`', 'Rutas'],
    segments.map(s => [`\`/${s}\``, grouped[s].length])
  ));
  lines.push('');

  // ---------- Scripts cargados ----------
  lines.push('## 8. Scripts JS cargados');
  lines.push('');
  lines.push('### 8.1 POS');
  lines.push('');
  lines.push('```');
  lines.push(pos.scripts.join('\n'));
  lines.push('```');
  lines.push('');
  lines.push('### 8.2 Panel');
  lines.push('');
  lines.push('```');
  lines.push(pan.scripts.join('\n'));
  lines.push('```');
  lines.push('');

  // ---------- Hints tabla→endpoint ----------
  lines.push('## 9. Hints tabla → endpoints que la mencionan');
  lines.push('');
  lines.push('_(heurística por substring entre nombre de tabla y path del endpoint — útil para sospechar qué endpoint toca qué tabla; verificar siempre con `git grep`)_');
  lines.push('');
  const hintRows = Object.entries(map.relationship.table_endpoint_hints || {})
    .filter(([t, eps]) => eps && eps.length > 0)
    .sort((a,b) => b[1].length - a[1].length);
  lines.push(table(
    ['Tabla', '#endpoints', 'Ejemplos (top 3)'],
    hintRows.map(([t, eps]) => [`\`${t}\``, eps.length, eps.slice(0, 3).map(e => `\`${e}\``).join('<br>')])
  ));
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Cómo regenerar');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/system-map/scan-pos-panel.js --pretty');
  lines.push('node scripts/system-map/render-markdown.js');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const map = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  const md = render(map);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, md, 'utf8');
  console.log('[render] OK ->', path.relative(ROOT, args.out).replace(/\\/g, '/'));
}

if (require.main === module) main();

module.exports = { render };
