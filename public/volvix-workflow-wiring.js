/* ============================================================================
 * volvix-workflow-wiring.js
 * Volvix POS - Workflow Builder visual estilo Zapier
 * Agent-43, Ronda 8 Fibonacci
 *
 * Expone: window.WorkflowAPI
 *   - registerTrigger(def), registerAction(def)
 *   - createWorkflow(meta), saveWorkflow(wf), loadWorkflow(id), listWorkflows()
 *   - run(wfId, payload, {dryRun}), fire(triggerId, payload)
 *   - mountUI(rootEl), getHistory(wfId)
 * ============================================================================
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- Storage
  const LS_WF = 'volvix.workflows.v1';
  const LS_HIST = 'volvix.workflows.history.v1';
  const LS_META = 'volvix.workflows.meta.v1';

  const Storage = {
    read(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (_) { return def; } },
    write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('[WF] storage', e); } },
    all() { return Storage.read(LS_WF, {}); },
    save(wf) { const a = Storage.all(); a[wf.id] = wf; Storage.write(LS_WF, a); },
    remove(id) { const a = Storage.all(); delete a[id]; Storage.write(LS_WF, a); },
    history() { return Storage.read(LS_HIST, []); },
    pushHistory(rec) { const h = Storage.history(); h.unshift(rec); if (h.length > 500) h.length = 500; Storage.write(LS_HIST, h); }
  };

  // ---------------------------------------------------------------- Registry
  const Triggers = new Map();
  const Actions = new Map();

  function registerTrigger(def) {
    if (!def || !def.id) throw new Error('trigger.id requerido');
    Triggers.set(def.id, Object.assign({ id: def.id, label: def.id, sample: {}, params: [] }, def));
  }
  function registerAction(def) {
    if (!def || !def.id) throw new Error('action.id requerido');
    if (typeof def.run !== 'function') throw new Error('action.run requerido');
    Actions.set(def.id, Object.assign({ id: def.id, label: def.id, params: [] }, def));
  }

  // ---------------------------------------------------------------- Built-in triggers
  registerTrigger({
    id: 'sale.created', label: 'Nueva venta',
    sample: { saleId: 'S-1001', total: 250.5, items: 3, customerEmail: 'a@b.com' }
  });
  registerTrigger({
    id: 'stock.low', label: 'Stock bajo',
    sample: { sku: 'SKU-42', name: 'Coca 600ml', qty: 2, threshold: 5 }
  });
  registerTrigger({
    id: 'shift.closed', label: 'Cierre de turno',
    sample: { shiftId: 'T-2025-04-25-N', cashier: 'maria', total: 4820.0 }
  });
  registerTrigger({
    id: 'customer.signup', label: 'Cliente registrado',
    sample: { id: 'C-99', name: 'Juan', email: 'juan@x.com' }
  });
  registerTrigger({
    id: 'manual', label: 'Ejecución manual',
    sample: { note: 'manual run' }
  });

  // ---------------------------------------------------------------- Built-in actions
  registerAction({
    id: 'log', label: 'Log a consola',
    params: [{ key: 'message', label: 'Mensaje', type: 'text', default: 'Workflow log' }],
    run: async (ctx, p) => { console.log('[WF:LOG]', interp(p.message, ctx), ctx.data); return { logged: true }; }
  });
  registerAction({
    id: 'notify', label: 'Notificación toast',
    params: [{ key: 'title', type: 'text' }, { key: 'body', type: 'text' }],
    run: async (ctx, p) => {
      const t = interp(p.title || 'Volvix', ctx), b = interp(p.body || '', ctx);
      toast(t, b);
      return { notified: true };
    }
  });
  registerAction({
    id: 'email', label: 'Enviar email',
    params: [
      { key: 'to', type: 'text' }, { key: 'subject', type: 'text' }, { key: 'body', type: 'textarea' }
    ],
    run: async (ctx, p) => {
      const payload = { to: interp(p.to, ctx), subject: interp(p.subject, ctx), body: interp(p.body, ctx) };
      if (ctx.dryRun) return { simulated: true, payload };
      try {
        if (global.VolvixMail && typeof global.VolvixMail.send === 'function') {
          await global.VolvixMail.send(payload);
        } else {
          console.log('[WF:EMAIL fallback]', payload);
        }
        return { sent: true, payload };
      } catch (e) { return { error: e.message, payload }; }
    }
  });
  registerAction({
    id: 'compute', label: 'Calcular / variable',
    params: [
      { key: 'var', type: 'text', label: 'Nombre variable' },
      { key: 'expr', type: 'text', label: 'Expresión JS (con data, vars)' }
    ],
    run: async (ctx, p) => {
      const val = safeEval(p.expr, { data: ctx.data, vars: ctx.vars });
      ctx.vars[p.var] = val;
      return { var: p.var, value: val };
    }
  });
  registerAction({
    id: 'transform', label: 'Transformar data',
    params: [
      { key: 'path', type: 'text', label: 'Ruta destino (ej: data.totalNeto)' },
      { key: 'expr', type: 'text', label: 'Expresión JS' }
    ],
    run: async (ctx, p) => {
      const val = safeEval(p.expr, { data: ctx.data, vars: ctx.vars });
      setPath(ctx, p.path, val);
      return { path: p.path, value: val };
    }
  });
  registerAction({
    id: 'http', label: 'HTTP request',
    params: [
      { key: 'method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
      { key: 'url', type: 'text' },
      { key: 'body', type: 'textarea' }
    ],
    run: async (ctx, p) => {
      const url = interp(p.url, ctx);
      if (ctx.dryRun) return { simulated: true, method: p.method, url };
      try {
        const r = await fetch(url, {
          method: p.method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: p.method && p.method !== 'GET' ? interp(p.body || '', ctx) : undefined
        });
        const t = await r.text();
        return { status: r.status, body: t.slice(0, 500) };
      } catch (e) { return { error: e.message }; }
    }
  });
  registerAction({
    id: 'delay', label: 'Esperar (ms)',
    params: [{ key: 'ms', type: 'number', default: 500 }],
    run: async (ctx, p) => {
      const ms = Number(p.ms) || 0;
      if (!ctx.dryRun) await new Promise(r => setTimeout(r, ms));
      return { waited: ms };
    }
  });

  // ---------------------------------------------------------------- Helpers
  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

  function interp(tpl, ctx) {
    if (tpl == null) return '';
    return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
      const v = getPath({ data: ctx.data, vars: ctx.vars, trigger: ctx.trigger }, path);
      return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
  }
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(ctx, path, value) {
    const parts = path.split('.');
    let root;
    if (parts[0] === 'vars') { root = ctx.vars; parts.shift(); }
    else if (parts[0] === 'data') { root = ctx.data; parts.shift(); }
    else { root = ctx.vars; }
    let cur = root;
    while (parts.length > 1) {
      const k = parts.shift();
      if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
      cur = cur[k];
    }
    cur[parts[0]] = value;
  }
  function safeEval(expr, scope) {
    try {
      const keys = Object.keys(scope);
      const vals = keys.map(k => scope[k]);
      // eslint-disable-next-line no-new-func
      return new Function(...keys, '"use strict"; return (' + (expr || 'undefined') + ');').apply(null, vals);
    } catch (e) { console.warn('[WF] eval error', e.message); return undefined; }
  }
  function evalCondition(cond, ctx) {
    if (!cond) return true;
    return !!safeEval(cond, { data: ctx.data, vars: ctx.vars, trigger: ctx.trigger });
  }

  function toast(title, body) {
    let host = document.getElementById('wf-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'wf-toast-host';
      host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:system-ui';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.style.cssText = 'background:#111;color:#fff;padding:10px 14px;border-radius:8px;min-width:220px;box-shadow:0 4px 18px rgba(0,0,0,.25);animation:wfin .25s ease';
    el.innerHTML = '<div style="font-weight:600;font-size:13px">' + escapeHTML(title) + '</div><div style="font-size:12px;opacity:.85;margin-top:2px">' + escapeHTML(body || '') + '</div>';
    host.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
  }
  function escapeHTML(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------------------------------------------------------------- Workflow model
  // wf = { id, name, trigger:{id, params}, nodes:[ ... ], createdAt, updatedAt, enabled }
  // node = { id, type:'action'|'if'|'end', actionId, params, then?:nodeId, else?:nodeId, next?:nodeId, condition? }
  function createWorkflow(meta) {
    const wf = {
      id: meta?.id || uid('wf'),
      name: meta?.name || 'Sin nombre',
      enabled: meta?.enabled !== false,
      trigger: meta?.trigger || { id: 'manual', params: {} },
      nodes: meta?.nodes || [],
      entry: meta?.entry || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    return wf;
  }
  function saveWorkflow(wf) { wf.updatedAt = Date.now(); Storage.save(wf); return wf; }
  function loadWorkflow(id) { return Storage.all()[id] || null; }
  function listWorkflows() { return Object.values(Storage.all()).sort((a, b) => b.updatedAt - a.updatedAt); }
  function deleteWorkflow(id) { Storage.remove(id); }

  // ---------------------------------------------------------------- Execution engine
  async function executeNode(wf, nodeId, ctx, depth) {
    if (!nodeId) return;
    if (depth > 200) { ctx.log.push({ level: 'error', msg: 'Profundidad máxima alcanzada' }); return; }
    const node = wf.nodes.find(n => n.id === nodeId);
    if (!node) return;
    ctx.log.push({ ts: Date.now(), nodeId, type: node.type });
    if (node.type === 'end') return;
    if (node.type === 'if') {
      const ok = evalCondition(node.condition, ctx);
      ctx.log.push({ nodeId, branch: ok ? 'then' : 'else', condition: node.condition });
      return executeNode(wf, ok ? node.then : node.else, ctx, depth + 1);
    }
    if (node.type === 'action') {
      const def = Actions.get(node.actionId);
      if (!def) {
        ctx.log.push({ level: 'error', nodeId, msg: 'Acción desconocida ' + node.actionId });
      } else {
        try {
          const params = resolveParams(node.params || {}, ctx);
          const out = await def.run(ctx, params);
          ctx.log.push({ nodeId, actionId: node.actionId, output: out });
          ctx.vars['_last'] = out;
        } catch (e) {
          ctx.log.push({ level: 'error', nodeId, error: e.message });
        }
      }
      return executeNode(wf, node.next, ctx, depth + 1);
    }
  }
  function resolveParams(params, ctx) {
    const out = {};
    for (const k in params) {
      const v = params[k];
      out[k] = (typeof v === 'string') ? interp(v, ctx) : v;
    }
    return out;
  }

  async function run(wfOrId, payload, opts) {
    const wf = typeof wfOrId === 'string' ? loadWorkflow(wfOrId) : wfOrId;
    if (!wf) throw new Error('Workflow no encontrado');
    const dryRun = !!(opts && opts.dryRun);
    const ctx = {
      wfId: wf.id, dryRun,
      trigger: { id: wf.trigger.id, payload: payload || {} },
      data: JSON.parse(JSON.stringify(payload || {})),
      vars: {},
      log: [],
      startedAt: Date.now()
    };
    ctx.log.push({ ts: ctx.startedAt, msg: 'START ' + wf.name + (dryRun ? ' (dry-run)' : '') });
    try {
      await executeNode(wf, wf.entry, ctx, 0);
      ctx.status = 'ok';
    } catch (e) {
      ctx.status = 'error'; ctx.error = e.message;
      ctx.log.push({ level: 'error', msg: e.message });
    }
    ctx.endedAt = Date.now();
    ctx.durationMs = ctx.endedAt - ctx.startedAt;
    Storage.pushHistory({
      id: uid('run'), wfId: wf.id, wfName: wf.name, dryRun,
      status: ctx.status, startedAt: ctx.startedAt, endedAt: ctx.endedAt,
      durationMs: ctx.durationMs, log: ctx.log, vars: ctx.vars, data: ctx.data
    });
    return ctx;
  }

  function fire(triggerId, payload) {
    const wfs = listWorkflows().filter(w => w.enabled && w.trigger?.id === triggerId);
    return Promise.all(wfs.map(w => run(w, payload).catch(e => ({ error: e.message, wfId: w.id }))));
  }

  function getHistory(wfId) {
    const all = Storage.history();
    return wfId ? all.filter(r => r.wfId === wfId) : all;
  }

  // ---------------------------------------------------------------- UI (drag-drop builder)
  const STYLES = `
  .wf-root{font-family:system-ui,sans-serif;color:#111;background:#f7f7fa;border:1px solid #e3e3eb;border-radius:10px;display:grid;grid-template-columns:240px 1fr 320px;height:620px;overflow:hidden}
  .wf-pal{background:#fff;border-right:1px solid #ececf2;padding:10px;overflow:auto}
  .wf-pal h4{margin:6px 0 6px;font-size:11px;text-transform:uppercase;color:#777;letter-spacing:.06em}
  .wf-chip{padding:8px 10px;border:1px solid #dcdce4;border-radius:8px;background:#fafaff;margin-bottom:6px;cursor:grab;font-size:13px;user-select:none}
  .wf-chip:hover{background:#eef0ff;border-color:#9aa6ff}
  .wf-canvas{position:relative;overflow:auto;background:repeating-linear-gradient(0deg,#f7f7fa 0 19px,#eef0f5 19px 20px),repeating-linear-gradient(90deg,#f7f7fa 0 19px,#eef0f5 19px 20px)}
  .wf-node{position:absolute;min-width:160px;background:#fff;border:1px solid #cfd2dc;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);padding:8px 10px;font-size:12px;cursor:move}
  .wf-node.sel{border-color:#3b5bff;box-shadow:0 0 0 2px #3b5bff33}
  .wf-node .ttl{font-weight:600;font-size:12px;display:flex;justify-content:space-between;align-items:center}
  .wf-node .sub{font-size:11px;color:#666;margin-top:2px;max-width:200px;word-break:break-all}
  .wf-node[data-kind=trigger]{background:#fff7e6;border-color:#ffb84d}
  .wf-node[data-kind=if]{background:#fef0ff;border-color:#c66dff}
  .wf-node[data-kind=end]{background:#eaeaea}
  .wf-port{display:inline-block;width:10px;height:10px;background:#3b5bff;border-radius:50%;margin-left:6px;cursor:crosshair}
  .wf-side{background:#fff;border-left:1px solid #ececf2;padding:10px;overflow:auto;font-size:12px}
  .wf-side h3{margin:4px 0 8px;font-size:13px}
  .wf-side label{display:block;font-size:11px;color:#555;margin-top:6px}
  .wf-side input,.wf-side textarea,.wf-side select{width:100%;padding:5px 6px;border:1px solid #dcdce4;border-radius:6px;font-size:12px;box-sizing:border-box}
  .wf-side textarea{min-height:60px;font-family:ui-monospace,monospace}
  .wf-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .wf-btn{background:#3b5bff;color:#fff;border:0;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer}
  .wf-btn.ghost{background:#fff;color:#3b5bff;border:1px solid #3b5bff}
  .wf-btn.warn{background:#e34}
  .wf-svg{position:absolute;inset:0;pointer-events:none;width:100%;height:100%}
  .wf-svg path{stroke:#3b5bff;stroke-width:2;fill:none}
  .wf-hist{font-family:ui-monospace,monospace;font-size:11px;background:#0e1020;color:#cfe;padding:8px;border-radius:6px;max-height:180px;overflow:auto;white-space:pre-wrap}
  `;

  function ensureStyles() {
    if (document.getElementById('wf-styles')) return;
    const s = document.createElement('style');
    s.id = 'wf-styles'; s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function mountUI(root) {
    ensureStyles();
    if (typeof root === 'string') root = document.querySelector(root);
    if (!root) { root = document.createElement('div'); document.body.appendChild(root); }
    root.classList.add('wf-root');
    root.innerHTML = '';

    let current = createWorkflow({ name: 'Nuevo workflow' });
    let selectedId = null;
    let connecting = null;

    // Palette
    const pal = el('div', 'wf-pal');
    pal.innerHTML = '<div class="wf-toolbar"></div><h4>Trigger</h4>';
    const tbar = pal.querySelector('.wf-toolbar');
    tbar.append(
      btn('Nuevo', () => { current = createWorkflow({ name: 'Nuevo workflow' }); selectedId = null; render(); }),
      btn('Guardar', () => { saveWorkflow(current); refreshList(); toast('Workflow', 'Guardado'); }),
      btn('Dry-run', async () => {
        const trDef = Triggers.get(current.trigger.id);
        const r = await run(current, trDef?.sample || {}, { dryRun: true });
        renderHistory(r);
      }, 'ghost'),
      btn('Run', async () => {
        const trDef = Triggers.get(current.trigger.id);
        const r = await run(current, trDef?.sample || {});
        renderHistory(r);
      })
    );
    Triggers.forEach(t => {
      const c = el('div', 'wf-chip', t.label);
      c.draggable = true;
      c.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/wf', JSON.stringify({ kind: 'trigger', id: t.id })));
      pal.appendChild(c);
    });
    pal.appendChild(el('h4', '', 'Acciones'));
    Actions.forEach(a => {
      const c = el('div', 'wf-chip', a.label);
      c.draggable = true;
      c.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/wf', JSON.stringify({ kind: 'action', id: a.id })));
      pal.appendChild(c);
    });
    pal.appendChild(el('h4', '', 'Lógica'));
    [['if', 'If / Else'], ['end', 'Fin']].forEach(([k, label]) => {
      const c = el('div', 'wf-chip', label);
      c.draggable = true;
      c.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/wf', JSON.stringify({ kind: k })));
      pal.appendChild(c);
    });
    pal.appendChild(el('h4', '', 'Workflows guardados'));
    const list = el('div'); pal.appendChild(list);
    function refreshList() {
      list.innerHTML = '';
      listWorkflows().forEach(w => {
        const c = el('div', 'wf-chip', w.name);
        c.title = w.id;
        c.addEventListener('click', () => { current = JSON.parse(JSON.stringify(w)); selectedId = null; render(); });
        list.appendChild(c);
      });
    }
    refreshList();

    // Canvas
    const canvas = el('div', 'wf-canvas');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wf-svg');
    canvas.appendChild(svg);
    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/wf'); if (!raw) return;
      const pl = JSON.parse(raw);
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left + canvas.scrollLeft;
      const y = e.clientY - rect.top + canvas.scrollTop;
      if (pl.kind === 'trigger') {
        current.trigger = { id: pl.id, params: {} };
        current.triggerPos = { x, y };
      } else if (pl.kind === 'action') {
        const n = { id: uid('n'), type: 'action', actionId: pl.id, params: {}, x, y };
        current.nodes.push(n);
        if (!current.entry) current.entry = n.id;
      } else if (pl.kind === 'if') {
        current.nodes.push({ id: uid('n'), type: 'if', condition: 'data.total > 100', x, y });
      } else if (pl.kind === 'end') {
        current.nodes.push({ id: uid('n'), type: 'end', x, y });
      }
      render();
    });

    // Side panel
    const side = el('div', 'wf-side');

    root.append(pal, canvas, side);
    render();

    function render() {
      // Nodes
      [...canvas.querySelectorAll('.wf-node')].forEach(n => n.remove());
      // Trigger node
      const tr = current.trigger || { id: 'manual' };
      const trPos = current.triggerPos || { x: 30, y: 30 };
      const trEl = nodeEl({ id: '__trigger__', type: 'trigger', x: trPos.x, y: trPos.y },
        Triggers.get(tr.id)?.label || tr.id, 'TRIGGER: ' + tr.id);
      trEl.dataset.kind = 'trigger';
      trEl.addEventListener('mousedown', startDrag(trEl, p => { current.triggerPos = p; }));
      trEl.querySelector('.wf-port')?.addEventListener('mousedown', e => {
        e.stopPropagation(); connecting = { from: '__trigger__', branch: 'next' };
      });
      canvas.appendChild(trEl);

      current.nodes.forEach(n => {
        const lbl = n.type === 'action' ? (Actions.get(n.actionId)?.label || n.actionId)
          : n.type === 'if' ? 'IF' : 'END';
        const sub = n.type === 'if' ? (n.condition || '') : (n.type === 'action' ? (n.actionId) : '');
        const ne = nodeEl(n, lbl, sub);
        ne.dataset.kind = n.type;
        if (n.id === selectedId) ne.classList.add('sel');
        ne.addEventListener('click', ev => { ev.stopPropagation(); selectedId = n.id; renderSide(); render(); });
        ne.addEventListener('mousedown', startDrag(ne, p => { n.x = p.x; n.y = p.y; }));
        // ports
        if (n.type === 'if') {
          const pT = port('then', '#22a55a'); const pE = port('else', '#e34');
          ne.appendChild(pT); ne.appendChild(pE);
          pT.addEventListener('mousedown', e => { e.stopPropagation(); connecting = { from: n.id, branch: 'then' }; });
          pE.addEventListener('mousedown', e => { e.stopPropagation(); connecting = { from: n.id, branch: 'else' }; });
        } else if (n.type !== 'end') {
          const pn = ne.querySelector('.wf-port');
          pn?.addEventListener('mousedown', e => { e.stopPropagation(); connecting = { from: n.id, branch: 'next' }; });
        }
        canvas.appendChild(ne);
      });

      drawEdges();
      renderSide();
    }

    canvas.addEventListener('mouseup', e => {
      if (!connecting) return;
      const target = e.target.closest('.wf-node');
      if (target && target.dataset.id && target.dataset.id !== connecting.from) {
        const tgt = target.dataset.id;
        if (connecting.from === '__trigger__') current.entry = tgt;
        else {
          const src = current.nodes.find(x => x.id === connecting.from);
          if (src) src[connecting.branch] = tgt;
        }
        render();
      }
      connecting = null;
    });

    function nodeEl(n, label, sub) {
      const d = el('div', 'wf-node');
      d.style.left = (n.x || 0) + 'px';
      d.style.top = (n.y || 0) + 'px';
      d.dataset.id = n.id;
      d.innerHTML = '<div class="ttl">' + escapeHTML(label) + (n.type !== 'if' && n.type !== 'end'
        ? '<span class="wf-port" title="Conectar"></span>' : '') + '</div>'
        + (sub ? '<div class="sub">' + escapeHTML(sub) + '</div>' : '');
      return d;
    }
    function port(branch, color) {
      const s = document.createElement('span');
      s.className = 'wf-port'; s.title = branch; s.style.background = color;
      s.style.marginLeft = '4px';
      return s;
    }
    function startDrag(elm, cb) {
      return function (e) {
        if (e.target.classList.contains('wf-port')) return;
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY;
        const ox = parseInt(elm.style.left, 10) || 0, oy = parseInt(elm.style.top, 10) || 0;
        function mv(ev) {
          const x = ox + (ev.clientX - sx), y = oy + (ev.clientY - sy);
          elm.style.left = x + 'px'; elm.style.top = y + 'px';
          cb({ x, y }); drawEdges();
        }
        function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      };
    }
    function drawEdges() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const map = {};
      [...canvas.querySelectorAll('.wf-node')].forEach(n => {
        map[n.dataset.id] = { x: parseInt(n.style.left, 10), y: parseInt(n.style.top, 10), w: n.offsetWidth, h: n.offsetHeight };
      });
      const edges = [];
      if (current.entry) edges.push({ from: '__trigger__', to: current.entry, color: '#3b5bff' });
      current.nodes.forEach(n => {
        if (n.type === 'if') {
          if (n.then) edges.push({ from: n.id, to: n.then, color: '#22a55a' });
          if (n.else) edges.push({ from: n.id, to: n.else, color: '#e34' });
        } else if (n.next) edges.push({ from: n.id, to: n.next, color: '#3b5bff' });
      });
      edges.forEach(ed => {
        const a = map[ed.from], b = map[ed.to]; if (!a || !b) return;
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
        const dx = Math.max(40, (x2 - x1) / 2);
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
        p.setAttribute('stroke', ed.color); p.setAttribute('stroke-width', '2'); p.setAttribute('fill', 'none');
        svg.appendChild(p);
      });
    }

    function renderSide() {
      side.innerHTML = '';
      side.appendChild(el('h3', '', 'Workflow'));
      const nameI = input('Nombre', current.name, v => current.name = v);
      side.appendChild(nameI);

      const trSel = document.createElement('select');
      Triggers.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.label; if (current.trigger?.id === t.id) o.selected = true; trSel.appendChild(o); });
      trSel.addEventListener('change', () => { current.trigger = { id: trSel.value, params: {} }; render(); });
      side.appendChild(label('Trigger', trSel));

      if (selectedId) {
        const n = current.nodes.find(x => x.id === selectedId);
        if (n) {
          side.appendChild(el('h3', '', 'Nodo: ' + n.type));
          if (n.type === 'if') {
            side.appendChild(input('Condición JS (data.x>0)', n.condition || '', v => n.condition = v));
          } else if (n.type === 'action') {
            const def = Actions.get(n.actionId);
            (def?.params || []).forEach(p => {
              const cur = n.params[p.key] ?? p.default ?? '';
              side.appendChild(input(p.label || p.key, cur, v => { n.params[p.key] = v; }, p.type, p.options));
            });
          }
          const del = btn('Eliminar nodo', () => {
            current.nodes = current.nodes.filter(x => x.id !== n.id);
            current.nodes.forEach(o => { ['next', 'then', 'else'].forEach(k => { if (o[k] === n.id) delete o[k]; }); });
            if (current.entry === n.id) current.entry = null;
            selectedId = null; render();
          }, 'warn');
          side.appendChild(del);
        }
      }

      side.appendChild(el('h3', '', 'Historial'));
      const hist = el('div', 'wf-hist');
      const recs = getHistory(current.id).slice(0, 6);
      hist.textContent = recs.length
        ? recs.map(r => `[${new Date(r.startedAt).toLocaleTimeString()}] ${r.status} (${r.durationMs}ms) ${r.dryRun ? '[dry]' : ''}\n` +
          r.log.slice(0, 6).map(l => '  · ' + (l.msg || l.actionId || l.type || '')).join('\n')).join('\n\n')
        : 'Sin ejecuciones aún';
      side.appendChild(hist);
    }

    function renderHistory(_r) { renderSide(); }

    function input(lbl, val, on, type, options) {
      const wrap = document.createElement('label'); wrap.textContent = lbl;
      let i;
      if (type === 'textarea') { i = document.createElement('textarea'); i.value = val; }
      else if (type === 'select') { i = document.createElement('select'); (options || []).forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o; if (o === val) op.selected = true; i.appendChild(op); }); }
      else { i = document.createElement('input'); i.type = type === 'number' ? 'number' : 'text'; i.value = val; }
      i.addEventListener('input', () => on(i.value));
      i.addEventListener('change', () => on(i.value));
      wrap.appendChild(i); return wrap;
    }
    function label(text, ctrl) { const w = document.createElement('label'); w.textContent = text; w.appendChild(ctrl); return w; }
    function btn(text, on, cls) { const b = document.createElement('button'); b.className = 'wf-btn ' + (cls || ''); b.textContent = text; b.addEventListener('click', on); return b; }
    function el(tag, cls, text) { const d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; }

    return {
      load(id) { const w = loadWorkflow(id); if (w) { current = JSON.parse(JSON.stringify(w)); render(); } },
      get() { return current; },
      refresh: render
    };
  }

  // ---------------------------------------------------------------- Public API
  const WorkflowAPI = {
    registerTrigger, registerAction,
    triggers: () => [...Triggers.values()],
    actions: () => [...Actions.values()],
    createWorkflow, saveWorkflow, loadWorkflow, listWorkflows, deleteWorkflow,
    run, fire,
    getHistory, clearHistory: () => Storage.write(LS_HIST, []),
    mountUI,
    _internals: { interp, safeEval, getPath, setPath }
  };

  global.WorkflowAPI = WorkflowAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkflowAPI;

  console.log('[WorkflowAPI] listo. Triggers:', Triggers.size, 'Actions:', Actions.size);
})(typeof window !== 'undefined' ? window : globalThis);
