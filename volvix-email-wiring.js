/**
 * volvix-email-wiring.js
 * Sistema de Email Templates + Envío para Volvix POS
 * Agent-21 - Ronda 7 Fibonacci
 *
 * Funciones:
 *  - Templates predefinidos (bienvenida, recordatorio, recibo, promoción, newsletter, cierre)
 *  - Editor HTML con preview en vivo
 *  - Variables {{nombre}} {{total}} {{fecha}} ...
 *  - Lista de contactos desde /api/customers
 *  - Envío vía mailto: o fetch a /api/email/send
 *  - Historial persistido en localStorage
 *  - Programador de envíos (setTimeout / cron-like)
 *  - Test send a un correo arbitrario
 */
(function (global) {
  'use strict';

  // ========================================================================
  // 1. CONFIGURACIÓN GLOBAL
  // ========================================================================
  const CONFIG = {
    apiCustomers: '/api/customers',
    apiSend: '/api/email/send',
    apiSchedule: '/api/email/schedule',
    storageHistory: 'volvix_email_history',
    storageScheduled: 'volvix_email_scheduled',
    storageDrafts: 'volvix_email_drafts',
    senderName: 'Volvix POS',
    senderEmail: 'no-reply@volvix.local',
    maxHistory: 500,
    pollScheduledMs: 30 * 1000,
  };

  // ========================================================================
  // 2. TEMPLATES PREDEFINIDOS
  // ========================================================================
  const TEMPLATES = {
    bienvenida: {
      id: 'bienvenida',
      name: 'Bienvenida cliente',
      subject: 'Bienvenido a {{empresa}}, {{nombre}}!',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#fafafa">
  <h1 style="color:#0a84ff">Hola {{nombre}}</h1>
  <p>Gracias por unirte a <b>{{empresa}}</b>. Tu cuenta queda activa desde hoy {{fecha}}.</p>
  <p>Tu identificador de cliente es <b>{{cliente_id}}</b>.</p>
  <p>Si necesitas asistencia, responde a este correo.</p>
  <hr><small>Volvix POS</small>
</div>`,
    },
    recordatorio_pago: {
      id: 'recordatorio_pago',
      name: 'Recordatorio de pago',
      subject: 'Recordatorio: factura {{factura}} pendiente',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <h2 style="color:#d97706">Estimado/a {{nombre}}</h2>
  <p>Te recordamos que la factura <b>{{factura}}</b> por un total de
     <b>{{total}}</b> vence el <b>{{fecha_vencimiento}}</b>.</p>
  <p>Puedes pagar con el siguiente enlace: <a href="{{link_pago}}">{{link_pago}}</a></p>
  <p>Gracias por tu atención.</p>
</div>`,
    },
    recibo_venta: {
      id: 'recibo_venta',
      name: 'Recibo de venta',
      subject: 'Recibo {{factura}} - {{empresa}}',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <h2>Recibo de venta</h2>
  <p>Cliente: <b>{{nombre}}</b><br>Fecha: {{fecha}}<br>Folio: {{factura}}</p>
  <table width="100%" cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
    <thead><tr style="background:#eee"><th align=left>Concepto</th><th align=right>Importe</th></tr></thead>
    <tbody>{{items}}</tbody>
    <tfoot><tr><td align=right><b>Total:</b></td><td align=right><b>{{total}}</b></td></tr></tfoot>
  </table>
  <p>Gracias por tu compra.</p>
</div>`,
    },
    promocion: {
      id: 'promocion',
      name: 'Promoción',
      subject: '{{nombre}}, {{descuento}} de descuento solo hoy',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#fff7ed">
  <h1 style="color:#ea580c">¡Oferta exclusiva!</h1>
  <p>Hola {{nombre}}, aprovecha <b>{{descuento}}</b> en {{producto}}.</p>
  <p style="text-align:center"><a href="{{link}}" style="background:#ea580c;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Comprar ahora</a></p>
  <small>Válido hasta {{fecha_fin}}.</small>
</div>`,
    },
    newsletter: {
      id: 'newsletter',
      name: 'Newsletter',
      subject: 'Boletín {{mes}} - {{empresa}}',
      body: `<div style="font-family:Georgia,serif;max-width:640px;margin:auto;padding:24px">
  <h1>Boletín {{mes}}</h1>
  <p>Hola {{nombre}}, esto es lo más relevante de este mes:</p>
  <h3>Novedades</h3><p>{{novedades}}</p>
  <h3>Tips</h3><p>{{tips}}</p>
  <hr><small>Para darte de baja responde "BAJA".</small>
</div>`,
    },
    cierre_mes: {
      id: 'cierre_mes',
      name: 'Cierre de mes',
      subject: 'Cierre {{mes}} - Resumen contable',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <h2>Cierre de {{mes}}</h2>
  <p>Resumen para <b>{{nombre}}</b>:</p>
  <ul>
    <li>Ventas: <b>{{ventas}}</b></li>
    <li>Compras: <b>{{compras}}</b></li>
    <li>Utilidad: <b>{{utilidad}}</b></li>
  </ul>
  <p>Adjuntamos el reporte detallado.</p>
</div>`,
    },
  };

  // ========================================================================
  // 3. UTILIDADES
  // ========================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function renderTemplate(str, vars) {
    return String(str).replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) =>
      vars && vars[k] != null ? vars[k] : `{{${k}}}`);
  }

  function extractVars(str) {
    const set = new Set();
    String(str).replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => set.add(k));
    return Array.from(set);
  }

  function lsGet(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; }
    catch { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  function nowIso() { return new Date().toISOString(); }
  function uid() { return 'em_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  // ========================================================================
  // 4. CONTACTOS
  // ========================================================================
  async function loadContacts() {
    try {
      const r = await fetch(CONFIG.apiCustomers, { credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (data.customers || data.data || []);
      return arr.map(c => ({
        id: c.id || c.cliente_id || uid(),
        nombre: c.nombre || c.name || c.full_name || 'Sin nombre',
        email: c.email || c.correo || '',
        ...c,
      })).filter(c => c.email);
    } catch (e) {
      console.warn('[email] no se pudo cargar /api/customers, usando fallback:', e);
      return [
        { id: 1, nombre: 'Cliente Demo', email: 'demo@volvix.local' },
      ];
    }
  }

  // ========================================================================
  // 5. HISTORIAL
  // ========================================================================
  function getHistory() { return lsGet(CONFIG.storageHistory, []); }
  function pushHistory(entry) {
    const h = getHistory();
    h.unshift(Object.assign({ id: uid(), ts: nowIso() }, entry));
    if (h.length > CONFIG.maxHistory) h.length = CONFIG.maxHistory;
    lsSet(CONFIG.storageHistory, h);
    return h[0];
  }
  function clearHistory() { lsSet(CONFIG.storageHistory, []); }

  // ========================================================================
  // 6. ENVÍO
  // ========================================================================
  async function sendViaBackend(payload) {
    const r = await fetch(CONFIG.apiSend, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('Backend send failed: HTTP ' + r.status);
    return r.json().catch(() => ({ ok: true }));
  }

  function sendViaMailto({ to, subject, body }) {
    // mailto solo soporta texto plano; quitamos HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = body;
    const text = tmp.textContent || tmp.innerText || '';
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = url;
    return { ok: true, transport: 'mailto' };
  }

  async function sendEmail({ to, subject, body, transport, vars, templateId }) {
    if (!to) throw new Error('Falta destinatario');
    const finalSubject = renderTemplate(subject || '', vars || {});
    const finalBody = renderTemplate(body || '', vars || {});
    const payload = {
      from: `${CONFIG.senderName} <${CONFIG.senderEmail}>`,
      to, subject: finalSubject, body: finalBody, html: true,
      templateId, ts: nowIso(),
    };
    let result;
    try {
      if (transport === 'mailto') {
        result = sendViaMailto(payload);
      } else {
        result = await sendViaBackend(payload);
      }
      pushHistory({ status: 'sent', transport: transport || 'backend', to, subject: finalSubject, templateId });
      return result;
    } catch (e) {
      pushHistory({ status: 'error', transport: transport || 'backend', to, subject: finalSubject, templateId, error: String(e) });
      throw e;
    }
  }

  async function testSend(to, templateId, vars) {
    const t = TEMPLATES[templateId] || Object.values(TEMPLATES)[0];
    return sendEmail({
      to, subject: '[TEST] ' + t.subject, body: t.body,
      transport: 'backend', vars: vars || { nombre: 'Tester', empresa: 'Volvix', fecha: new Date().toLocaleDateString() },
      templateId: t.id,
    });
  }

  // ========================================================================
  // 7. PROGRAMADOR DE ENVÍOS
  // ========================================================================
  function getScheduled() { return lsGet(CONFIG.storageScheduled, []); }
  function saveScheduled(list) { lsSet(CONFIG.storageScheduled, list); }

  function scheduleEmail({ to, subject, body, sendAt, vars, templateId, transport }) {
    const item = {
      id: uid(), to, subject, body, sendAt: new Date(sendAt).toISOString(),
      vars: vars || {}, templateId, transport: transport || 'backend',
      status: 'pending', createdAt: nowIso(),
    };
    const list = getScheduled();
    list.push(item); saveScheduled(list);
    return item;
  }

  function cancelScheduled(id) {
    const list = getScheduled().filter(x => x.id !== id);
    saveScheduled(list);
  }

  async function processScheduledOnce() {
    const now = Date.now();
    const list = getScheduled();
    const remain = [];
    for (const it of list) {
      if (it.status === 'pending' && new Date(it.sendAt).getTime() <= now) {
        try {
          await sendEmail(it);
          it.status = 'done';
        } catch (e) {
          it.status = 'error'; it.error = String(e);
          remain.push(it);
        }
      } else if (it.status === 'pending') {
        remain.push(it);
      }
    }
    saveScheduled(remain);
  }

  let _schedTimer = null;
  function startScheduler() {
    if (_schedTimer) return;
    _schedTimer = setInterval(processScheduledOnce, CONFIG.pollScheduledMs);
    processScheduledOnce();
  }
  function stopScheduler() {
    if (_schedTimer) { clearInterval(_schedTimer); _schedTimer = null; }
  }

  // ========================================================================
  // 8. UI - EDITOR + PREVIEW
  // ========================================================================
  function buildUI(rootSelector) {
    const root = typeof rootSelector === 'string' ? $(rootSelector) : rootSelector;
    if (!root) { console.warn('[email] root no encontrado'); return null; }

    root.innerHTML = `
<style>
  .vmail{font-family:system-ui,Arial,sans-serif;display:grid;grid-template-columns:260px 1fr 1fr;gap:12px;height:100%}
  .vmail aside,.vmail section{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px;overflow:auto}
  .vmail h3{margin:0 0 8px;font-size:14px;color:#374151}
  .vmail button{cursor:pointer;border:1px solid #d1d5db;background:#f9fafb;border-radius:6px;padding:6px 10px;font-size:12px}
  .vmail button.primary{background:#0a84ff;color:#fff;border-color:#0a84ff}
  .vmail input,.vmail textarea,.vmail select{width:100%;box-sizing:border-box;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:13px;margin-bottom:6px}
  .vmail textarea{min-height:240px;font-family:ui-monospace,monospace}
  .vmail .tpl-list li{list-style:none;padding:6px 8px;border-radius:4px;cursor:pointer}
  .vmail .tpl-list li:hover{background:#f3f4f6}
  .vmail .tpl-list li.active{background:#dbeafe}
  .vmail .preview{background:#f9fafb;border:1px dashed #d1d5db;padding:10px;border-radius:6px;min-height:300px}
  .vmail .row{display:flex;gap:6px;align-items:center}
  .vmail .hist{font-size:12px;border-bottom:1px solid #f3f4f6;padding:4px 0}
  .vmail .hist.error{color:#b91c1c}
</style>
<div class="vmail">
  <aside>
    <h3>Templates</h3>
    <ul class="tpl-list" id="vm-tpl-list"></ul>
    <hr>
    <h3>Contactos</h3>
    <input id="vm-contact-search" placeholder="Buscar...">
    <select id="vm-contact-list" size="8" multiple></select>
    <button id="vm-reload-contacts">Recargar</button>
  </aside>
  <section>
    <h3>Editor</h3>
    <label>Para:</label>
    <input id="vm-to" placeholder="correo@dominio.com, otro@...">
    <label>Asunto:</label>
    <input id="vm-subject">
    <label>Cuerpo HTML:</label>
    <textarea id="vm-body"></textarea>
    <label>Variables detectadas:</label>
    <div id="vm-vars"></div>
    <div class="row">
      <select id="vm-transport"><option value="backend">Backend</option><option value="mailto">mailto:</option></select>
      <input id="vm-schedule" type="datetime-local" title="Programar (opcional)">
      <button id="vm-send" class="primary">Enviar</button>
      <button id="vm-test">Test</button>
    </div>
  </section>
  <section>
    <h3>Preview</h3>
    <div class="preview" id="vm-preview"></div>
    <h3>Historial</h3>
    <div id="vm-history"></div>
    <h3>Programados</h3>
    <div id="vm-scheduled"></div>
  </section>
</div>`;

    const state = { templateId: 'bienvenida', contacts: [], vars: {} };

    // Lista templates
    const tplList = $('#vm-tpl-list', root);
    Object.values(TEMPLATES).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.name; li.dataset.id = t.id;
      li.onclick = () => loadTemplateIntoEditor(t.id);
      tplList.appendChild(li);
    });

    function loadTemplateIntoEditor(id) {
      const t = TEMPLATES[id]; if (!t) return;
      state.templateId = id;
      $('#vm-subject', root).value = t.subject;
      $('#vm-body', root).value = t.body;
      $$('#vm-tpl-list li', root).forEach(li => li.classList.toggle('active', li.dataset.id === id));
      refreshVarsAndPreview();
    }

    function refreshVarsAndPreview() {
      const subj = $('#vm-subject', root).value;
      const body = $('#vm-body', root).value;
      const vars = Array.from(new Set([...extractVars(subj), ...extractVars(body)]));
      const wrap = $('#vm-vars', root); wrap.innerHTML = '';
      vars.forEach(v => {
        const inp = document.createElement('input');
        inp.placeholder = v; inp.value = state.vars[v] || '';
        inp.style.width = '48%'; inp.style.display = 'inline-block'; inp.style.marginRight = '2%';
        inp.oninput = () => { state.vars[v] = inp.value; renderPreview(); };
        wrap.appendChild(inp);
      });
      renderPreview();
    }

    function renderPreview() {
      const body = $('#vm-body', root).value;
      $('#vm-preview', root).innerHTML = renderTemplate(body, state.vars);
    }

    $('#vm-subject', root).addEventListener('input', refreshVarsAndPreview);
    $('#vm-body', root).addEventListener('input', refreshVarsAndPreview);

    // Contactos
    async function refreshContacts() {
      state.contacts = await loadContacts();
      renderContacts();
    }
    function renderContacts() {
      const q = $('#vm-contact-search', root).value.toLowerCase();
      const sel = $('#vm-contact-list', root); sel.innerHTML = '';
      state.contacts
        .filter(c => !q || (c.nombre + c.email).toLowerCase().includes(q))
        .forEach(c => {
          const o = document.createElement('option');
          o.value = c.email; o.textContent = `${c.nombre} <${c.email}>`;
          sel.appendChild(o);
        });
    }
    $('#vm-contact-search', root).addEventListener('input', renderContacts);
    $('#vm-reload-contacts', root).onclick = refreshContacts;
    $('#vm-contact-list', root).onchange = e => {
      const emails = Array.from(e.target.selectedOptions).map(o => o.value);
      $('#vm-to', root).value = emails.join(', ');
    };

    // Acciones
    $('#vm-send', root).onclick = async () => {
      const to = $('#vm-to', root).value.trim();
      const subject = $('#vm-subject', root).value;
      const body = $('#vm-body', root).value;
      const transport = $('#vm-transport', root).value;
      const sched = $('#vm-schedule', root).value;
      try {
        if (sched) {
          scheduleEmail({ to, subject, body, sendAt: sched, vars: state.vars, templateId: state.templateId, transport });
          alert('Programado para ' + sched);
        } else {
          await sendEmail({ to, subject, body, transport, vars: state.vars, templateId: state.templateId });
          alert('Enviado');
        }
        renderHistory(); renderScheduled();
      } catch (e) { alert('Error: ' + e.message); renderHistory(); }
    };

    $('#vm-test', root).onclick = async () => {
      const to = prompt('Correo de prueba:');
      if (!to) return;
      try { await testSend(to, state.templateId, state.vars); alert('Test enviado'); }
      catch (e) { alert('Error: ' + e.message); }
      renderHistory();
    };

    function renderHistory() {
      const wrap = $('#vm-history', root); wrap.innerHTML = '';
      getHistory().slice(0, 20).forEach(h => {
        const div = document.createElement('div');
        div.className = 'hist' + (h.status === 'error' ? ' error' : '');
        div.textContent = `[${new Date(h.ts).toLocaleString()}] ${h.status} ${h.transport} → ${h.to} : ${h.subject}`;
        wrap.appendChild(div);
      });
    }

    function renderScheduled() {
      const wrap = $('#vm-scheduled', root); wrap.innerHTML = '';
      getScheduled().forEach(s => {
        const div = document.createElement('div');
        div.className = 'hist';
        div.innerHTML = `<span>${new Date(s.sendAt).toLocaleString()} → ${escapeHtml(s.to)} (${s.status})</span> `;
        const btn = document.createElement('button');
        btn.textContent = 'Cancelar';
        btn.onclick = () => { cancelScheduled(s.id); renderScheduled(); };
        div.appendChild(btn); wrap.appendChild(div);
      });
    }

    // Init
    loadTemplateIntoEditor('bienvenida');
    refreshContacts();
    renderHistory();
    renderScheduled();
    startScheduler();

    return { refreshContacts, renderHistory, renderScheduled, loadTemplateIntoEditor, state };
  }

  // ========================================================================
  // 9. EXPORT API
  // ========================================================================
  const VolvixEmail = {
    CONFIG, TEMPLATES,
    renderTemplate, extractVars,
    loadContacts,
    sendEmail, testSend,
    scheduleEmail, cancelScheduled, getScheduled,
    getHistory, clearHistory,
    startScheduler, stopScheduler,
    buildUI,
  };

  global.VolvixEmail = VolvixEmail;
  if (typeof module !== 'undefined' && module.exports) module.exports = VolvixEmail;
})(typeof window !== 'undefined' ? window : globalThis);
