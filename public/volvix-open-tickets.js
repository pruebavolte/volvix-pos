/* volvix-open-tickets.js — T1.1 Tickets abiertos estilo Loyverse (flags module.open_tickets / module.predefined_tickets)
 * Logica pura (parseMeta/filterSort/mergeItems/predefinedNames) + modales. Un solo codigo para web/exe/android.
 * Los datos (POST/GET/DELETE /api/sales/pending) los maneja salvadorex-pos.html; aqui solo UI y logica. */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function defaultName(d) { d = d || new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // Lee name/comment/employee/dining ya sea de columnas o de notes "VLXMETA:{json}".
  function parseMeta(row) {
    row = row || {};
    var m = { name: row.name || '', comment: row.comment || '', employee: row.employee || '', dining: row.dining || '', note: row.notes || '' };
    if (typeof row.notes === 'string' && row.notes.indexOf('VLXMETA:') === 0) {
      try {
        var j = JSON.parse(row.notes.slice(8));
        m.name = m.name || j.n || ''; m.comment = m.comment || j.c || ''; m.employee = m.employee || j.e || ''; m.dining = m.dining || j.d || ''; m.note = j.t || '';
      } catch (_) { m.note = ''; }
    }
    if (!m.name) m.name = defaultName(new Date(row.created_at || Date.now()));
    return m;
  }
  function normRow(row) {
    var m = parseMeta(row);
    var t = new Date(row.created_at || row.saved_at || Date.now());
    return { id: row.id, name: m.name, comment: m.comment, employee: m.employee, dining: m.dining, note: m.note,
      total: Number(row.total) || 0, ts: t.getTime() || 0, time: defaultName(t), items: Array.isArray(row.items) ? row.items : [], customer_id: row.customer_id || null, raw: row };
  }
  function filterSort(rows, opts) {
    opts = opts || {};
    var q = String(opts.q || '').trim().toLowerCase();
    var out = (rows || []).filter(function (r) {
      if (!q) return true;
      return (r.name + ' ' + r.comment + ' ' + r.employee).toLowerCase().indexOf(q) >= 0;
    });
    var by = opts.sort || 'time';
    out.sort(function (a, b) {
      if (by === 'name') return String(a.name).localeCompare(String(b.name), 'es', { numeric: true });
      if (by === 'total') return b.total - a.total;
      return b.ts - a.ts; // hora: mas reciente primero
    });
    return out;
  }
  function itemKey(i) {
    return [i.code || i.product_id || i.name, JSON.stringify(i.modifiers || []), i.note || '', Number(i.price) || 0].join('|');
  }
  // Une items de varios tickets sumando cantidades de lineas identicas.
  function mergeItems(rows) {
    var map = {}, order = [];
    (rows || []).forEach(function (r) {
      (r.items || []).forEach(function (it) {
        var k = itemKey(it);
        if (map[k]) map[k].qty = (Number(map[k].qty) || 0) + (Number(it.qty) || 1);
        else { map[k] = Object.assign({}, it, { qty: Number(it.qty) || 1 }); order.push(k); }
      });
    });
    return order.map(function (k) { return map[k]; });
  }
  function predefinedNames(tenant) {
    try {
      if (root.TablesAPI && typeof root.TablesAPI.listTables === 'function') {
        var t = root.TablesAPI.listTables() || [];
        if (t.length) return t.map(function (x) { return 'Mesa ' + x.number; });
      }
    } catch (_) {}
    var n = 8;
    try { var v = parseInt(root.localStorage.getItem('volvix:predef_tickets:' + tenant), 10); if (v > 0 && v <= 60) n = v; } catch (_) {}
    var a = []; for (var i = 1; i <= n; i++) a.push('Mesa ' + i);
    return a;
  }
  function setPredefinedCount(tenant, n) { try { root.localStorage.setItem('volvix:predef_tickets:' + tenant, String(n)); } catch (_) {} }

  function overlay(id, html) {
    var d = root.document; var old = d.getElementById(id); if (old) old.remove();
    var m = d.createElement('div'); m.id = id;
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:99995;padding:12px;';
    m.innerHTML = html; d.body.appendChild(m); return m;
  }
  var CARD = 'background:#fff;color:#1C1917;border-radius:12px;width:520px;max-width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);';

  // Mini-modal de guardado. opts: {defaultName, comment, predefined:[..]|null, tenant}. Resuelve {name,comment} o null.
  function askSaveMeta(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var chips = (opts.predefined || []).map(function (n) {
        return '<button type="button" data-chip="' + esc(n) + '" style="padding:10px 14px;border:1px solid #E7E5E4;border-radius:10px;background:#FAFAF9;font-size:14px;cursor:pointer;">' + esc(n) + '</button>';
      }).join('');
      var m = overlay('vlx-ot-save',
        '<div style="' + CARD + '"><div style="padding:14px 18px;border-bottom:1px solid #E7E5E4;font-weight:700;font-size:17px;">Guardar ticket</div>' +
        '<div style="padding:14px 18px;overflow:auto;">' +
        '<label style="font-size:12px;color:#78716C;">Nombre</label><input id="vlx-ot-name" maxlength="80" value="' + esc(opts.defaultName || defaultName()) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:15px;margin:4px 0 10px;box-sizing:border-box;">' +
        '<label style="font-size:12px;color:#78716C;">Comentario (opcional)</label><input id="vlx-ot-comment" maxlength="200" value="' + esc(opts.comment || '') + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:15px;margin:4px 0 10px;box-sizing:border-box;">' +
        (chips ? '<div style="font-size:12px;color:#78716C;margin-bottom:6px;">Tickets predefinidos (guardar con un toque)</div><div id="vlx-ot-chips" style="display:flex;flex-wrap:wrap;gap:8px;">' + chips + '</div>' : '') +
        '</div><div style="padding:12px 18px;border-top:1px solid #E7E5E4;display:flex;gap:8px;justify-content:flex-end;"><button id="vlx-ot-cancel" type="button" style="padding:10px 16px;border:1px solid #E7E5E4;border-radius:8px;background:#fff;cursor:pointer;">Cancelar</button><button id="vlx-ot-ok" type="button" style="padding:10px 18px;border:0;border-radius:8px;background:#16A34A;color:#fff;font-weight:700;cursor:pointer;">Guardar</button></div></div>');
      var done = false;
      function fin(v) { if (done) return; done = true; m.remove(); resolve(v); }
      var nameEl = m.querySelector('#vlx-ot-name'), comEl = m.querySelector('#vlx-ot-comment');
      m.addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('[data-chip]');
        if (chip) { fin({ name: chip.getAttribute('data-chip'), comment: comEl.value.trim() }); return; }
        if (e.target === m || (e.target.id === 'vlx-ot-cancel')) fin(null);
        if (e.target.id === 'vlx-ot-ok') fin({ name: nameEl.value.trim() || defaultName(), comment: comEl.value.trim() });
      });
      m.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') fin({ name: nameEl.value.trim() || defaultName(), comment: comEl.value.trim() });
        if (e.key === 'Escape') fin(null);
      });
      try { nameEl.focus(); nameEl.select(); } catch (_) {}
    });
  }

  // Modal de lista. opts: {rows(normalizados), onOpen(row), onMerge(rows) -> Promise<rows nuevos>}
  function openList(opts) {
    var rows = opts.rows || [], sort = 'time', q = '', sel = {};
    var m = overlay('vlx-ot-list',
      '<div style="' + CARD + '"><div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #E7E5E4;"><b style="font-size:17px;">Tickets abiertos</b><button id="vlx-ot-x" type="button" style="background:none;border:0;font-size:24px;cursor:pointer;">&times;</button></div>' +
      '<div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #F5F5F4;"><input id="vlx-ot-q" placeholder="Buscar por nombre, comentario o empleado" style="flex:1;min-width:160px;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;"><select id="vlx-ot-sort" style="padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;"><option value="time">Hora</option><option value="name">Nombre</option><option value="total">Total</option></select></div>' +
      '<div id="vlx-ot-cards" style="flex:1;overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;align-content:start;min-height:160px;"></div>' +
      '<div style="padding:10px 14px;border-top:1px solid #E7E5E4;display:flex;justify-content:space-between;align-items:center;gap:8px;"><span id="vlx-ot-cnt" style="font-size:13px;color:#78716C;"></span><button id="vlx-ot-merge" type="button" disabled style="padding:10px 16px;border:0;border-radius:8px;background:#2563EB;color:#fff;font-weight:700;cursor:pointer;opacity:.4;">Combinar</button></div></div>');
    var cards = m.querySelector('#vlx-ot-cards'), mergeBtn = m.querySelector('#vlx-ot-merge'), cnt = m.querySelector('#vlx-ot-cnt');
    function selected() { return rows.filter(function (r) { return sel[r.id]; }); }
    function draw() {
      var list = filterSort(rows, { q: q, sort: sort });
      cards.innerHTML = list.length ? list.map(function (r) {
        var on = !!sel[r.id];
        return '<div data-id="' + esc(r.id) + '" style="border:2px solid ' + (on ? '#2563EB' : '#E7E5E4') + ';border-radius:10px;padding:10px;cursor:pointer;background:' + (on ? '#EFF6FF' : '#fff') + ';position:relative;">' +
          '<input type="checkbox" data-chk="' + esc(r.id) + '" ' + (on ? 'checked' : '') + ' style="position:absolute;top:8px;right:8px;width:18px;height:18px;">' +
          '<div style="font-weight:700;font-size:15px;padding-right:22px;word-break:break-word;">' + esc(r.name) + '</div>' +
          '<div style="font-size:18px;font-weight:800;color:#16A34A;margin:4px 0;">$' + r.total.toFixed(2) + '</div>' +
          '<div style="font-size:12px;color:#78716C;">' + esc(r.time) + (r.employee ? ' · ' + esc(r.employee) : '') + '</div>' +
          (r.comment ? '<div style="font-size:12px;color:#57534E;margin-top:3px;">' + esc(r.comment) + '</div>' : '') + '</div>';
      }).join('') : '<div style="grid-column:1/-1;text-align:center;color:#78716C;padding:30px;">No hay tickets abiertos</div>';
      var n = selected().length;
      mergeBtn.disabled = n < 2; mergeBtn.style.opacity = n < 2 ? '.4' : '1';
      cnt.textContent = rows.length + ' ticket(s)' + (n ? ' · ' + n + ' seleccionado(s)' : '');
    }
    m.addEventListener('click', function (e) {
      var t = e.target;
      if (t === m || t.id === 'vlx-ot-x') { m.remove(); return; }
      if (t.id === 'vlx-ot-merge') {
        var s = selected(); if (s.length < 2) return;
        mergeBtn.disabled = true;
        Promise.resolve(opts.onMerge(s)).then(function (nr) { sel = {}; if (nr) rows = nr; draw(); }).catch(function () { draw(); });
        return;
      }
      var chk = t.getAttribute && t.getAttribute('data-chk');
      if (chk) { sel[chk] = !sel[chk]; draw(); return; }
      var card = t.closest && t.closest('[data-id]');
      if (card) {
        var id = card.getAttribute('data-id');
        var row = rows.filter(function (r) { return String(r.id) === id; })[0];
        if (row) { m.remove(); opts.onOpen(row); }
      }
    });
    m.querySelector('#vlx-ot-q').addEventListener('input', function (e) { q = e.target.value; draw(); });
    m.querySelector('#vlx-ot-sort').addEventListener('change', function (e) { sort = e.target.value; draw(); });
    draw();
    return m;
  }

  var API = { defaultName: defaultName, parseMeta: parseMeta, normRow: normRow, filterSort: filterSort, mergeItems: mergeItems,
    predefinedNames: predefinedNames, setPredefinedCount: setPredefinedCount, askSaveMeta: askSaveMeta, openList: openList };
  root.VolvixOpenTickets = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
