/* T1.2 Dining options configurables (module.dining_options).
 * Lista por tenant en localStorage volvix:dining_options:<tenant> (listo para sync).
 * Compatibilidad: #lv-dinein conserva data-mode (here|away) y agrega data-label. */
(function (root) {
  'use strict';
  var DEFAULTS = [
    { name: 'Comer aquí', kind: 'here' },
    { name: 'Para llevar', kind: 'away' },
    { name: 'A domicilio', kind: 'away' }
  ];
  function tenant() {
    try { var s = JSON.parse(localStorage.getItem('volvix_session') || '{}'); return s.tenant_id || 'default'; } catch (_) { return 'default'; }
  }
  function key(t) { return 'volvix:dining_options:' + (t || tenant()); }
  function clean(l) {
    var out = [];
    (Array.isArray(l) ? l : []).forEach(function (o) {
      var n = String(o && o.name || '').trim().slice(0, 40);
      if (n) out.push({ name: n, kind: o.kind === 'here' ? 'here' : 'away' });
    });
    return out;
  }
  function list(t) {
    try { var r = JSON.parse(localStorage.getItem(key(t)) || 'null'); var c = clean(r); if (c.length) return c; } catch (_) {}
    return DEFAULTS.map(function (o) { return { name: o.name, kind: o.kind }; });
  }
  function save(l, t) {
    var c = clean(l); if (!c.length) c = DEFAULTS.slice();
    try { localStorage.setItem(key(t), JSON.stringify(c)); } catch (_) {}
    return c;
  }
  function add(name, kind, t) { var l = list(t); l.push({ name: name, kind: kind || 'away' }); return save(l, t); }
  function remove(i, t) { var l = list(t); if (l.length <= 1) return l; l.splice(i, 1); return save(l, t); }
  function move(i, d, t) {
    var l = list(t), j = i + d; if (j < 0 || j >= l.length) return l;
    var x = l[i]; l[i] = l[j]; l[j] = x; return save(l, t);
  }
  function enabled() { try { return !root.VolvixFeatures || root.VolvixFeatures.isEnabled('module.dining_options'); } catch (_) { return true; } }
  function el() { return root.document && root.document.getElementById('lv-dinein'); }
  // opcion actual {label, mode}; mode here|away (compat con data-mode)
  function current() {
    var d = el();
    if (!d) return { label: '', mode: 'here' };
    // #9: sin data-mode explicito = COMER AQUI (comportamiento de v1.0.344); solo 'away' explicito cuenta como para llevar
    var mode = d.getAttribute('data-mode') === 'away' ? 'away' : 'here';
    var label = d.getAttribute('data-label') || (mode === 'here' ? 'Comer aquí' : 'Para llevar');
    return { label: label, mode: mode };
  }
  function set(opt) {
    var d = el(); if (!d) return;
    d.setAttribute('data-mode', opt.kind === 'here' ? 'here' : 'away');
    d.setAttribute('data-label', opt.name);
    var s = d.querySelector('span'); if (s) s.textContent = opt.name;
  }
  // #9 (restaurante en vivo): por defecto arranca en COMER AQUI como antes. Config por equipo/tenant: localStorage 'vlx_cfg_dining_default_away'='1' => arranca en Para llevar.
  function defaultKind() { try { return root.localStorage.getItem('vlx_cfg_dining_default_away') === '1' ? 'away' : 'here'; } catch (_) { return 'here'; } }
  function init() {
    var d = el(); if (!d) return;
    if (!enabled()) { d.style.display = 'none'; return; }
    d.setAttribute('data-feature', 'module.dining_options');
    var l = list(), cur = d.getAttribute('data-label');
    var opt = l.filter(function (o) { return o.name === cur; })[0] || l.filter(function (o) { return o.kind === defaultKind(); })[0] || l[0];
    set(opt);
  }
  function closeMenu() { var m = root.document.getElementById('lv-dinein-menu'); if (m) m.remove(); }
  function toggleMenu() {
    var d = el(); if (!d) return;
    if (!enabled()) return;
    if (root.document.getElementById('lv-dinein-menu')) return closeMenu();
    var m = root.document.createElement('div');
    m.id = 'lv-dinein-menu';
    m.style.cssText = 'position:absolute;z-index:9999;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);min-width:170px;';
    var r = d.getBoundingClientRect();
    m.style.left = (r.left + root.scrollX) + 'px'; m.style.top = (r.bottom + root.scrollY) + 'px'; m.style.width = r.width + 'px';
    var cur = current().label;
    list().forEach(function (o) {
      var b = root.document.createElement('div');
      b.textContent = (o.name === cur ? '✓ ' : '') + o.name;
      b.style.cssText = 'padding:10px 12px;cursor:pointer;font-size:14px;';
      b.setAttribute('data-opt', o.name);
      b.onclick = function (e) { e.stopPropagation(); set(o); closeMenu(); };
      m.appendChild(b);
    });
    root.document.body.appendChild(m);
    setTimeout(function () { root.document.addEventListener('click', closeMenu, { once: true }); }, 0);
  }
  // ---- Config UI ----
  function renderConfig(box) {
    if (!box) return;
    var l = list();
    box.innerHTML = '';
    l.forEach(function (o, i) {
      var row = root.document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:4px 0;';
      var t = root.document.createElement('span'); t.textContent = o.name + (o.kind === 'here' ? ' (local)' : ''); t.style.flex = '1';
      function btn(txt, fn) { var b = root.document.createElement('button'); b.type = 'button'; b.className = 'btn sm secondary'; b.textContent = txt; b.onclick = function () { fn(); renderConfig(box); init(); }; return b; }
      row.appendChild(t);
      row.appendChild(btn('↑', function () { move(i, -1); }));
      row.appendChild(btn('↓', function () { move(i, 1); }));
      row.appendChild(btn('🗑', function () { remove(i); }));
      box.appendChild(row);
    });
  }
  function addFromInput(inp, kindSel) {
    var n = (inp.value || '').trim(); if (!n) return;
    add(n, kindSel && kindSel.value); inp.value = '';
  }
  root.VolvixDining = { DEFAULTS: DEFAULTS, list: list, save: save, add: add, remove: remove, move: move, current: current,
    set: set, init: init, toggleMenu: toggleMenu, renderConfig: renderConfig, addFromInput: addFromInput, enabled: enabled };
  if (root.document && root.document.addEventListener) root.document.addEventListener('DOMContentLoaded', init);
  if (typeof module !== 'undefined') module.exports = root.VolvixDining;
})(typeof window !== 'undefined' ? window : globalThis);
