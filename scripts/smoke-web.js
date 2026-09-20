#!/usr/bin/env node
/* smoke-web.js — suite de humo WEB sin dependencias (solo node). NO toca produccion: levanta scripts/dev-mock-pos.js en 127.0.0.1:8897 (MOCK_PORT=...).
 *
 * QUE VERIFICA (por HTTP contra el mock, ~2 s):
 *   1. salvadorex-pos.html y cada <script src> local responden 200 (los JS nuevos van por nombre: modifiers, open-tickets,
 *      dining-options, platform, feature-flags, ticket-customizer, cobro-modal, kds, tables).
 *   2. Todos los <script> INLINE de salvadorex-pos.html PARSEAN (new Function: solo sintaxis, no se ejecutan) y los JS nuevos tambien.
 *   3. El HTML trae los data-feature de los 6 modulos Loyverse (modifiers, open_tickets, dining_options, print_bill, kitchen_printers)
 *      y volvix-feature-flags.js define los 6 (default enabled) + VolvixFeatures.isEnabled; paneldecontrol.html los tiene en
 *      PROFILE_GENERIC (default ON), etiquetas y categoria.
 *   4. Rutas de la UI nueva: ids/atributos clave (#lv-products-grid, #lv-btn-save, #lv-more, data-vlx-keep en ids vlx-* estaticos).
 *
 * USO:   node scripts/smoke-web.js            # levanta el mock si no esta corriendo, corre, lo apaga
 *        node scripts/smoke-web.js --keep     # deja el mock corriendo para probar a mano
 *        node scripts/smoke-web.js --strict   # exit 1 si algo falla (CI)
 *
 * CON EL NAVEGADOR INTEGRADO (columnas de la cuadricula, guardar->abrir ticket, modificador, menu de 3 puntos):
 *   a) node scripts/smoke-web.js --keep
 *   b) Navegador integrado -> abrir http://127.0.0.1:8897/salvadorex-pos.html . En su consola (mismo origen) pegar:
 *        localStorage.setItem('volvix_token', 'x.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+86400,tenant_id:'DEMO',role:'owner'}))+'.y');
 *        localStorage.setItem('volvixSession', JSON.stringify({user_id:'u1',tenant_id:'DEMO',role:'owner',expires_at:Date.now()+864e5}));
 *        location.reload();
 *      (auth-gate solo valida que el token no haya expirado; el mock no verifica firma). Cerrar #onboarding-modal si estorba.
 *   c) Viewport MOVIL 375x812 (resize_window preset mobile) y en la consola:
 *        getComputedStyle(document.querySelector('#lv-products-grid')).gridTemplateColumns.split(' ').length   // debe ser >= 3
 *      Repetir en escritorio. Flujo: tocar 2 productos -> Guardar (nombre) -> menu "Tickets abiertos" -> abrir -> agregar 1 -> Guardar
 *      ; tocar "Milanesa de Res" (p0: el mock devuelve modificadores) -> elegir Arroz -> el renglon muestra "+ Arroz"; menu de 3 puntos.
 *   d) Errores de consola propios: read_console_messages onlyErrors (ignorar 404 de recursos externos y de /api/* no simulados).
 *   e) Apagar un modulo:  VolvixFeatures.setLocal('module.open_tickets','disabled')  ->  #lv-btn-save queda oculto y
 *      VolvixFeatures.isEnabled('module.open_tickets') === false (la logica tambien lo respeta).
 */
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const STRICT = args.includes('--strict');
const HOST = '127.0.0.1', PORT = Number(process.env.MOCK_PORT) || 8897; // propio (dev-mock-pos usa 8899 por defecto: otras sesiones lo ocupan)

const NEW_JS = ['volvix-platform.js', 'volvix-open-tickets.js', 'volvix-dining-options.js', 'volvix-modifiers-wiring.js',
  'volvix-feature-flags.js', 'volvix-ticket-customizer.js', 'volvix-cobro-modal.js', 'volvix-tables-wiring.js'];
const EXTRA_JS = ['volvix-kds-wiring.js']; // viven en otra pagina (volvix-kds.html): solo 200 + parseo
const MODULES = ['modifiers', 'open_tickets', 'predefined_tickets', 'dining_options', 'print_bill', 'kitchen_printers'];

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PORT, path: p, timeout: 8000 }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), type: res.headers['content-type'] || '' }));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout ' + p)); });
  });
}

async function mockUp() { try { const r = await get('/salvadorex-pos.html'); return r.status === 200; } catch (_) { return false; } }

async function ensureMock() {
  if (await mockUp()) return null;
  const child = spawn(process.execPath, [path.join(__dirname, 'dev-mock-pos.js')], { stdio: 'ignore', detached: false, env: Object.assign({}, process.env, { MOCK_PORT: String(PORT) }) });
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 150)); if (await mockUp()) return child; }
  child.kill(); throw new Error('el mock no arranco en 6 s (puerto ' + PORT + ' ocupado por otra cosa? usa MOCK_PORT=...)');
}

let fails = 0, warns = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { fails++; console.log('  FALLA ' + m); };
const warn = (m) => { warns++; console.log('  aviso ' + m); };
const check = (c, good, badMsg) => c ? ok(good) : bad(badMsg || good);
function parses(code) { try { new Function(code); return null; } catch (e) { return e.message; } }

(async () => {
  const child = await ensureMock();
  try {
    console.log('== 1. salvadorex-pos.html');
    const page = await get('/salvadorex-pos.html');
    check(page.status === 200 && page.body.length > 500000, 'HTTP 200 (' + Math.round(page.body.length / 1024) + ' KB)', 'salvadorex-pos.html HTTP ' + page.status + ' len ' + page.body.length);
    const html = page.body;

    console.log('== 2. <script src> locales responden 200 y parsean');
    const srcs = []; const reSrc = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi; let m;
    while ((m = reSrc.exec(html))) if (!/^(https?:)?\/\//i.test(m[1]) && /^[\w\-./]+\.m?js(\?.*)?$/i.test(m[1])) srcs.push(m[1].replace(/^\.?\//, '').replace(/[?#].*$/, ''));
    const uniq = Array.from(new Set(srcs));
    let n200 = 0; const notFound = [];
    for (const s of uniq) {
      let r; try { r = await get('/' + s); } catch (e) { r = { status: 0, body: '' }; }
      if (r.status === 200) {
        n200++;
        const isNew = NEW_JS.indexOf(path.basename(s)) >= 0;
        const err = /\.js$/i.test(s) ? parses(r.body) : null;
        if (err) (isNew ? bad : warn)('no parsea ' + s + ': ' + err);
      } else notFound.push(s + ' (' + r.status + ')');
    }
    check(!notFound.length, uniq.length + ' scripts locales, todos 200', 'scripts locales que no responden 200: ' + notFound.join(', '));
    NEW_JS.forEach(f => check(uniq.some(s => path.basename(s) === f), 'HTML incluye ' + f, 'el HTML NO incluye <script src> de ' + f));
    for (const f of EXTRA_JS) { const r = await get('/' + f); const e = r.status === 200 ? parses(r.body) : 'HTTP ' + r.status; check(!e, f + ' responde 200 y parsea', f + ': ' + e); }

    console.log('== 3. <script> inline parsean (mismo criterio que check-paridad)');
    const reInline = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi; let idx = 0, nInline = 0;
    while ((m = reInline.exec(html))) {
      idx++;
      const attrs = m[1] || ''; if (/type=["'](?!text\/javascript|module)/i.test(attrs) && !/type=["']module/i.test(attrs)) continue; // json/template
      if (!m[2].trim()) continue; nInline++;
      const line = html.slice(0, m.index).split('\n').length;
      const err = /type=["']module/i.test(attrs) ? null : parses(m[2]);
      if (err) bad('script inline #' + idx + ' (linea ~' + line + ') no parsea: ' + err);
    }
    ok(nInline + ' scripts inline revisados');

    console.log('== 4. modulos Loyverse: flags, panel de control y UI');
    const ff = (await get('/volvix-feature-flags.js')).body;
    const panel = (await get('/paneldecontrol.html')).body;
    MODULES.forEach(k => {
      check(new RegExp("'module\\." + k + "':\\s*\\{[^}]*default_status:\\s*'enabled'").test(ff), 'flags.js define module.' + k + ' (enabled)', 'flags.js NO define module.' + k + ' con default enabled');
      check(new RegExp('\\b' + k + ':\\s*true').test(panel), 'panel: ' + k + ' en PROFILE_GENERIC (default ON)', 'paneldecontrol.html sin ' + k + ':true en PROFILE_GENERIC');
    });
    check(/isEnabled\s*:\s*function/.test(ff), 'VolvixFeatures.isEnabled definido (lo llaman tickets abiertos / dining / pre-cuenta)', 'VolvixFeatures.isEnabled NO existe: _otOn() y compania quedan SIEMPRE encendidos');
    ['modifiers', 'open_tickets', 'dining_options', 'print_bill', 'kitchen_printers'].forEach(k =>
      check(new RegExp('data-feature="module\\.' + k + '"').test(html), 'UI con data-feature="module.' + k + '"', 'ninguna UI con data-feature="module.' + k + '" (apagar el modulo no oculta nada)'));

    console.log('== 5. anclas de la venta estilo Loyverse');
    ['id="lv-products-grid"', 'id="lv-btn-save"', 'id="lv-btn-charge"', 'id="lv-more"', 'id="lv-ticket-items"'].forEach(a =>
      check(html.indexOf(a) >= 0 || html.indexOf(a.replace('id=', 'id=\\')) >= 0, a, 'falta ' + a));
    const missKeep = []; const reVlx = /<[a-z]+[^>]*\bid="(vlx-[\w-]+)"[^>]*>/gi;
    while ((m = reVlx.exec(html))) if (!/data-vlx-keep/.test(m[0])) missKeep.push(m[1]);
    // Estaticos: los ids vlx-* del HTML original son preexistentes (el guardian solo oculta NODOS AGREGADOS tras cargar): aviso.
    if (missKeep.length) warn(new Set(missKeep).size + ' ids vlx-* estaticos sin data-vlx-keep (preexistentes; el guardian no los oculta): ' + Array.from(new Set(missKeep)).slice(0, 3).join(', ') + '...');
    // Dinamicos en los JS nuevos: cada RAIZ creada con `.id = ...` debe llevar data-vlx-keep (regla comun 5; el guardian
    // volvix-uplift-wiring.js solo inspecciona la raiz agregada; los hijos con id vlx-* dentro de ella no se tocan).
    for (const f of ['volvix-open-tickets.js', 'volvix-dining-options.js', 'volvix-modifiers-wiring.js']) {
      const code = (await get('/' + f)).body; const miss = []; let n = 0;
      const reRoot = /\.id\s*=(?!=)\s*('vlx-[\w-]+'|"vlx-[\w-]+"|id\b)/g; // el guardian solo hace caso a ids que empiezan con vlx-
      while ((m = reRoot.exec(code))) {
        n++;
        if (code.slice(m.index, m.index + 200).indexOf('data-vlx-keep') < 0) miss.push(m[1].trim());
      }
      check(!miss.length, f + ': ' + n + ' raiz/raices creada(s) con .id=, todas con data-vlx-keep', f + ': raices creadas SIN data-vlx-keep: ' + miss.join(', '));
    }

    console.log('\n' + (fails ? fails + ' FALLA(S)' : 'TODO OK') + (warns ? ' · ' + warns + ' aviso(s)' : '') +
      '\nPendiente en navegador (ver cabecera): columnas de la cuadricula 375x812, guardar->abrir ticket, modificador, menu de 3 puntos, errores de consola.');
  } catch (e) {
    fails++; console.log('ERROR: ' + e.message);
  } finally {
    if (child && !KEEP) child.kill();
    else if (KEEP) console.log('Mock corriendo en http://' + HOST + ':' + PORT + ' (Ctrl+C para cerrar)');
  }
  if (KEEP) return;
  process.exit(STRICT && fails ? 1 : 0);
})();
