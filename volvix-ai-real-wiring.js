/**
 * VOLVIX AI REAL WIRING
 * ─────────────────────────────────────────────────────────────────────
 * Sistema de IA REAL conectado a Anthropic Claude API
 * Backend: https://salvadorexoficial.com  (api/index.js -> callClaude)
 *
 * Funcionalidades incluidas:
 *  1. Chat overlay flotante con Claude
 *  2. Resumen ejecutivo de ventas con IA
 *  3. Recomendaciones de reabastecimiento de stock
 *  4. Detección de patrones y tendencias
 *  5. Asistente de capacitación (Academy)
 *  6. Resolución automática de tickets de soporte
 *  7. Forecast / análisis predictivo de ventas
 *
 * Modo simulado: si ANTHROPIC_API_KEY no está configurada en el backend,
 * la respuesta llega con `simulated: true` y se muestra texto fallback.
 *
 * Auto-init en DOMContentLoaded. Expone window.AIRealAPI.
 * ─────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────
  //  CONFIG
  // ───────────────────────────────────────────────────────────────────
  const API = location.origin.includes('localhost') || location.origin.includes('file://')
    ? 'https://salvadorexoficial.com'
    : location.origin;

  const ENDPOINTS = {
    decide:    '/api/ai/decide',
    support:   '/api/ai/support',
    sales:     '/api/sales',
    lowStock:  '/api/owner/low-stock',
    daily:     '/api/reports/daily',
    products:  '/api/products',
    tickets:   '/api/support/tickets'
  };

  const VERSION = '1.0.0';
  const DEBUG = true;

  let session = null;
  let chatHistory = [];
  let chatOpen = false;
  let pendingRequests = 0;

  function log(...args) { if (DEBUG) console.log('[AI-REAL-WIRING]', ...args); }
  function warn(...args) { console.warn('[AI-REAL-WIRING]', ...args); }
  function err(...args)  { console.error('[AI-REAL-WIRING]', ...args); }

  log('Activo v' + VERSION + ' — backend:', API);

  // ───────────────────────────────────────────────────────────────────
  //  SESSION
  // ───────────────────────────────────────────────────────────────────
  function loadSession() {
    try {
      session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
    } catch (e) {
      session = null;
    }
    return session;
  }

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (session && session.token) h['Authorization'] = 'Bearer ' + session.token;
    if (session && session.tenant) h['X-Tenant-Id']  = session.tenant;
    return h;
  }

  // ───────────────────────────────────────────────────────────────────
  //  CORE: callAI / callSupportAI
  // ───────────────────────────────────────────────────────────────────
  async function callAI(prompt, system, opts) {
    opts = opts || {};
    pendingRequests++;
    try {
      const body = {
        prompt: prompt,
        system: system || 'Eres la IA de Volvix POS. Responde en español, conciso y profesional.',
        history: opts.history || [],
        max_tokens: opts.max_tokens || 800,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.5
      };
      const res = await fetch(API + ENDPOINTS.decide, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 120));
      }
      const data = await res.json();
      return {
        ok: true,
        simulated: !!data.simulated,
        content: data.content || data.text || data.message || '',
        raw: data
      };
    } catch (e) {
      err('callAI error:', e.message);
      return {
        ok: false,
        simulated: true,
        error: true,
        content: '⚠️ La IA no está disponible. ' +
                 'Verifica que ANTHROPIC_API_KEY esté configurada en Vercel. ' +
                 'Detalle: ' + e.message
      };
    } finally {
      pendingRequests--;
    }
  }

  async function callSupportAI(ticket, context) {
    pendingRequests++;
    try {
      const res = await fetch(API + ENDPOINTS.support, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ticket: ticket, context: context || {} })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return { ok: true, simulated: !!data.simulated, content: data.content || data.response || '', raw: data };
    } catch (e) {
      err('callSupportAI error:', e.message);
      return { ok: false, simulated: true, error: true, content: 'Soporte IA no disponible: ' + e.message };
    } finally {
      pendingRequests--;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  UI HELPERS
  // ───────────────────────────────────────────────────────────────────
  function escapeHTML(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showModal(title, content, icon) {
    icon = icon || '🤖';
    const existing = document.getElementById('ai-modal-overlay');
    if (existing) existing.remove();

    const html = `
      <div id="ai-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);">
        <div style="background:#1e293b;color:#fff;border-radius:14px;max-width:560px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,0.6);overflow:hidden;">
          <div style="padding:16px 20px;background:#0f172a;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:22px;">${icon}</span>
              <strong style="font-size:15px;">${escapeHTML(title)}</strong>
            </div>
            <button onclick="document.getElementById('ai-modal-overlay').remove()" style="background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;padding:0 6px;">×</button>
          </div>
          <div style="padding:20px;overflow-y:auto;flex:1;font-size:13.5px;line-height:1.55;white-space:pre-wrap;">${escapeHTML(content)}</div>
          <div style="padding:12px 20px;border-top:1px solid #334155;background:#0f172a;display:flex;justify-content:flex-end;gap:8px;">
            <button onclick="document.getElementById('ai-modal-overlay').remove()" style="padding:8px 18px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function showToast(msg, type) {
    type = type || 'info';
    const colors = { info: '#3b82f6', success: '#16a34a', warn: '#f59e0b', error: '#dc2626' };
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:20px;right:20px;background:' + colors[type] + ';color:#fff;padding:10px 16px;border-radius:8px;z-index:10001;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,0.3);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.style.opacity = '0', 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // ───────────────────────────────────────────────────────────────────
  //  CHAT OVERLAY
  // ───────────────────────────────────────────────────────────────────
  function createChatOverlay() {
    if (document.getElementById('ai-chat-overlay')) return;

    const html = `
      <div id="ai-chat-overlay" style="position:fixed;bottom:20px;right:20px;width:380px;max-height:540px;background:#1e293b;color:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.55);display:none;flex-direction:column;z-index:9999;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;">
        <div style="padding:14px 16px;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong style="font-size:14px;">🤖 Volvix AI</strong>
            <div style="font-size:11px;color:#93c5fd;margin-top:2px;">Powered by Claude · v${VERSION}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="window.aiClearChat()" title="Limpiar" style="background:transparent;border:1px solid #334155;color:#94a3b8;font-size:12px;cursor:pointer;border-radius:5px;padding:4px 8px;">↺</button>
            <button onclick="window.aiToggleChat()" title="Cerrar" style="background:transparent;border:1px solid #334155;color:#94a3b8;font-size:14px;cursor:pointer;border-radius:5px;padding:4px 9px;line-height:1;">×</button>
          </div>
        </div>

        <div id="ai-chat-quick" style="padding:8px 12px;background:#0f172a;border-bottom:1px solid #334155;display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="window.aiSummarizeSales()" style="background:#334155;color:#cbd5e1;border:none;padding:5px 9px;border-radius:5px;font-size:11px;cursor:pointer;">📊 Ventas</button>
          <button onclick="window.aiRecommendProducts()" style="background:#334155;color:#cbd5e1;border:none;padding:5px 9px;border-radius:5px;font-size:11px;cursor:pointer;">📦 Stock</button>
          <button onclick="window.aiForecastSales()" style="background:#334155;color:#cbd5e1;border:none;padding:5px 9px;border-radius:5px;font-size:11px;cursor:pointer;">📈 Forecast</button>
          <button onclick="window.aiDetectPatterns()" style="background:#334155;color:#cbd5e1;border:none;padding:5px 9px;border-radius:5px;font-size:11px;cursor:pointer;">🔍 Patrones</button>
          <button onclick="window.aiTrainingAssistant()" style="background:#334155;color:#cbd5e1;border:none;padding:5px 9px;border-radius:5px;font-size:11px;cursor:pointer;">🎓 Tutor</button>
        </div>

        <div id="ai-chat-messages" style="flex:1;padding:14px;overflow-y:auto;max-height:300px;min-height:200px;background:#1e293b;">
          <div style="background:#334155;padding:10px 12px;border-radius:10px 10px 10px 2px;font-size:13px;line-height:1.5;">
            ¡Hola! Soy la IA de Volvix POS. Pregúntame lo que quieras o usa los botones rápidos.
          </div>
        </div>

        <div style="padding:12px 14px;border-top:1px solid #334155;background:#0f172a;display:flex;gap:8px;align-items:center;">
          <input id="ai-chat-input" placeholder="Pregunta a la IA..." onkeydown="if(event.key==='Enter') window.aiSendMessage()" style="flex:1;padding:8px 12px;background:#1e293b;border:1px solid #334155;color:#fff;border-radius:6px;font-size:13px;outline:none;" />
          <button onclick="window.aiSendMessage()" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">→</button>
        </div>
      </div>

      <button id="ai-chat-toggle" onclick="window.aiToggleChat()" title="Abrir IA" style="position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1e40af);color:#fff;border:none;font-size:26px;cursor:pointer;box-shadow:0 8px 28px rgba(59,130,246,0.55);z-index:9998;transition:transform .15s ease;">🤖</button>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    log('Chat overlay creado');
  }

  function appendUserMessage(text) {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;
    msgs.insertAdjacentHTML('beforeend',
      `<div style="background:#3b82f6;padding:10px 12px;border-radius:10px 10px 2px 10px;font-size:13px;line-height:1.5;margin:10px 0 10px 50px;">${escapeHTML(text)}</div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function appendAIMessage(text, isError) {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;
    const bg = isError ? '#7f1d1d' : '#334155';
    msgs.insertAdjacentHTML('beforeend',
      `<div style="background:${bg};padding:10px 12px;border-radius:10px 10px 10px 2px;font-size:13px;line-height:1.5;margin:10px 50px 10px 0;white-space:pre-wrap;">${escapeHTML(text)}</div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function appendLoading() {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;
    msgs.insertAdjacentHTML('beforeend',
      `<div id="ai-loading" style="color:#94a3b8;font-size:12px;padding:6px 14px;font-style:italic;">Volvix AI está pensando...</div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeLoading() {
    const el = document.getElementById('ai-loading');
    if (el) el.remove();
  }

  // ───────────────────────────────────────────────────────────────────
  //  PUBLIC: chat controls
  // ───────────────────────────────────────────────────────────────────
  window.aiToggleChat = function () {
    const overlay = document.getElementById('ai-chat-overlay');
    const toggle  = document.getElementById('ai-chat-toggle');
    if (!overlay || !toggle) return;
    chatOpen = overlay.style.display !== 'flex';
    overlay.style.display = chatOpen ? 'flex' : 'none';
    toggle.style.display  = chatOpen ? 'none' : 'block';
    if (chatOpen) {
      setTimeout(() => {
        const inp = document.getElementById('ai-chat-input');
        if (inp) inp.focus();
      }, 100);
    }
  };

  window.aiClearChat = function () {
    chatHistory = [];
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) {
      msgs.innerHTML = `<div style="background:#334155;padding:10px 12px;border-radius:10px 10px 10px 2px;font-size:13px;line-height:1.5;">Chat limpiado. ¿En qué puedo ayudarte?</div>`;
    }
    showToast('Historial borrado', 'success');
  };

  window.aiSendMessage = async function () {
    const input = document.getElementById('ai-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    appendUserMessage(text);
    input.value = '';
    chatHistory.push({ role: 'user', content: text });
    appendLoading();

    const result = await callAI(text,
      'Eres la IA de Volvix POS, asistente útil y profesional. ' +
      'Responde en español de forma concisa (máx 120 palabras salvo que se pida detalle). ' +
      'Si te preguntan sobre datos del negocio que no tienes, sugiere usar los botones rápidos.',
      { history: chatHistory.slice(-10) }
    );

    removeLoading();
    appendAIMessage(result.content || 'Sin respuesta', !!result.error);
    chatHistory.push({ role: 'assistant', content: result.content || '' });
    if (result.simulated) {
      appendAIMessage('ℹ️ Modo simulado activo (configura ANTHROPIC_API_KEY en Vercel).', false);
    }
  };

  // ───────────────────────────────────────────────────────────────────
  //  FUNCION: Resumen ejecutivo de ventas
  // ───────────────────────────────────────────────────────────────────
  window.aiSummarizeSales = async function () {
    showToast('Analizando ventas...', 'info');
    let sales = [];
    try {
      const res = await fetch(API + ENDPOINTS.sales, { headers: authHeaders() });
      sales = res.ok ? await res.json() : [];
    } catch (e) { warn('No pude cargar ventas:', e.message); }

    if (!Array.isArray(sales)) sales = sales.data || sales.sales || [];
    const total = sales.reduce((s, x) => s + parseFloat(x.total || x.amount || 0), 0);
    const count = sales.length;
    const avg   = count > 0 ? (total / count).toFixed(2) : '0';
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter(x => (x.date || x.createdAt || '').slice(0, 10) === today);

    const prompt = `Resumen ejecutivo de ventas:
- Ventas totales registradas: ${count}
- Importe total acumulado: $${total.toFixed(2)} MXN
- Ticket promedio: $${avg}
- Ventas de hoy: ${todaySales.length}

Genera un resumen ejecutivo (máx 150 palabras) destacando:
1. Salud general del negocio
2. Oportunidades visibles
3. Una recomendación accionable`;

    const result = await callAI(prompt, 'Eres analista de negocios senior. Sé directo, sin relleno.');
    showModal('Análisis ejecutivo de ventas', result.content || 'Sin respuesta', '📊');
  };

  // ───────────────────────────────────────────────────────────────────
  //  FUNCION: Recomendaciones de stock
  // ───────────────────────────────────────────────────────────────────
  window.aiRecommendProducts = async function () {
    showToast('Consultando stock...', 'info');
    let lowStock = [];
    try {
      const res = await fetch(API + ENDPOINTS.lowStock, { headers: authHeaders() });
      lowStock = res.ok ? await res.json() : [];
    } catch (e) { warn('low-stock falló:', e.message); }

    if (!Array.isArray(lowStock)) lowStock = lowStock.data || lowStock.products || [];

    if (lowStock.length === 0) {
      showModal('Stock saludable', '✅ No hay productos en stock crítico en este momento.\n\nLa IA recomienda:\n• Mantener el monitoreo semanal\n• Revisar productos de temporada\n• Anticipar fechas pico (quincenas, festividades)', '📦');
      return;
    }

    const list = lowStock.slice(0, 8)
      .map(p => `- ${p.name || p.product_name || 'Producto'} (stock: ${p.stock ?? p.quantity ?? '?'}, mínimo: ${p.min_stock ?? '?'})`)
      .join('\n');

    const prompt = `Productos con stock bajo:
${list}

Como experto en gestión de inventarios para retail mexicano, indícame:
1. Qué 3 productos reabastecer PRIMERO y por qué
2. Cantidad sugerida a comprar
3. Riesgo si NO se reabastece esta semana`;

    const result = await callAI(prompt, 'Eres consultor experto en gestión de inventarios POS retail México.');
    showModal('Recomendación de reabastecimiento', result.content || 'Sin respuesta', '📦');
  };

  // ───────────────────────────────────────────────────────────────────
  //  FUNCION: Forecast de ventas (predictivo)
  // ───────────────────────────────────────────────────────────────────
  window.aiForecastSales = async function () {
    showToast('Calculando forecast...', 'info');
    let sales = [], dailyReport = [];
    try {
      const [r1, r2] = await Promise.all([
        fetch(API + ENDPOINTS.sales, { headers: authHeaders() }),
        fetch(API + ENDPOINTS.daily, { headers: authHeaders() })
      ]);
      sales       = r1.ok ? await r1.json() : [];
      dailyReport = r2.ok ? await r2.json() : [];
    } catch (e) { warn('Forecast data fail:', e.message); }

    if (!Array.isArray(sales)) sales = sales.data || sales.sales || [];
    if (!Array.isArray(dailyReport)) dailyReport = dailyReport.data || dailyReport.report || [];

    const totalHist = sales.reduce((s, x) => s + parseFloat(x.total || x.amount || 0), 0);
    const days = dailyReport.length || 1;
    const avgDaily = totalHist / Math.max(days, 1);

    const prompt = `Datos históricos del POS:
- Total ventas históricas: ${sales.length}
- Importe total: $${totalHist.toFixed(2)} MXN
- Promedio diario estimado: $${avgDaily.toFixed(2)}
- Reporte diario (últimos): ${JSON.stringify(dailyReport.slice(-5))}

Como experto en forecasting de retail, predice:
1. Ventas estimadas próximos 7 días (rangos)
2. 2 factores externos a considerar (estacionalidad, fechas)
3. Acción concreta para mejorar resultados

Formato corto y claro, máximo 180 palabras.`;

    const result = await callAI(prompt, 'Eres experto en forecasting de ventas retail.', { temperature: 0.3 });
    showModal('Forecast de ventas — próximos 7 días', result.content || 'Sin respuesta', '📈');
  };

  // ───────────────────────────────────────────────────────────────────
  //  FUNCION: Detección de patrones
  // ───────────────────────────────────────────────────────────────────
  window.aiDetectPatterns = async function () {
    showToast('Detectando patrones...', 'info');
    let sales = [];
    try {
      const r = await fetch(API + ENDPOINTS.sales, { headers: authHeaders() });
      sales = r.ok ? await r.json() : [];
    } catch (e) {}

    if (!Array.isArray(sales)) sales = sales.data || sales.sales || [];

    const byHour = {};
    const byDay  = {};
    sales.forEach(s => {
      const dt = new Date(s.date || s.createdAt || Date.now());
      const h = dt.getHours();
      const d = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][dt.getDay()];
      byHour[h] = (byHour[h] || 0) + 1;
      byDay[d]  = (byDay[d] || 0) + 1;
    });

    const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0] || ['?', 0];
    const peakDay  = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || ['?', 0];

    const prompt = `Datos del POS:
- Total ventas analizadas: ${sales.length}
- Hora pico detectada: ${peakHour[0]}:00 (${peakHour[1]} ventas)
- Día pico detectado: ${peakDay[0]} (${peakDay[1]} ventas)
- Distribución por hora: ${JSON.stringify(byHour)}

Como analista de retail mexicano:
1. ¿Qué patrón notas?
2. ¿Cómo aprovechar la hora/día pico?
3. ¿Qué horarios podrían mejorarse con promociones?`;

    const result = await callAI(prompt, 'Eres analista de retail experto en POS mexicano.');
    const summary = `📊 Pico de ventas: ${peakDay[0]} a las ${peakHour[0]}:00 hrs\n\n` + (result.content || 'Sin respuesta');
    showModal('Patrones y tendencias detectadas', summary, '🔍');
  };

  // ───────────────────────────────────────────────────────────────────
  //  FUNCION: Asistente de capacitación (Academy)
  // ───────────────────────────────────────────────────────────────────
  window.aiTrainingAssistant = async function (predefTopic) {
    let tema = predefTopic;
    if (!tema) {
      const ui = window.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        const res = await Promise.resolve(ui.form({
          title: '🎓 Capacitación con IA',
          fields: [{
            name: 'tema',
            label: '¿Sobre qué tema quieres capacitarte?',
            type: 'textarea',
            rows: 4,
            placeholder: 'Ej: Facturación, Inventario, Atención al cliente, Ventas, Manejo de caja',
            required: true
          }],
          submitText: 'Generar lección'
        })).catch(() => null);
        if (!res || !res.tema) return;
        tema = res.tema;
      } else {
        tema = prompt('🎓 ¿Sobre qué tema quieres capacitarte?\n\nEjemplos:\n• Facturación\n• Inventario\n• Atención al cliente\n• Ventas y upselling\n• Manejo de caja');
      }
    }
    if (!tema) return;
    showToast('Generando lección...', 'info');

    const promptStr = `Genera una mini-clase de capacitación para empleado de POS retail mexicano.
Tema: "${tema}"

Estructura requerida:
1. Definición breve (2 líneas)
2. 3 pasos prácticos numerados
3. 1 error común a evitar
4. 1 tip avanzado

Total: máx 220 palabras. Lenguaje claro, directo, sin jerga.`;

    const result = await callAI(promptStr, 'Eres instructor experto en capacitación de personal POS.', { temperature: 0.4 });
    showModal('Capacitación: ' + tema, result.content || 'Sin respuesta', '🎓');
  };

  // ───────────────────────────────────────────────────────────────────
  //  FUNCION: Resolución automática de tickets
  // ───────────────────────────────────────────────────────────────────
  window.aiResolveTicket = async function (ticketOrText) {
    let ticket = ticketOrText;
    if (typeof ticket === 'string') ticket = { description: ticket, subject: 'Consulta', priority: 'normal' };
    if (!ticket || typeof ticket !== 'object') {
      const ui = window.VolvixUI;
      let msg;
      if (ui && typeof ui.form === 'function') {
        const res = await Promise.resolve(ui.form({
          title: 'Resolver ticket',
          fields: [{ name: 'msg', label: 'Describe el problema del usuario', type: 'textarea', rows: 6, required: true }],
          submitText: 'Resolver'
        })).catch(() => null);
        if (!res || !res.msg) return;
        msg = res.msg;
      } else {
        msg = prompt('Describe el problema del usuario:');
        if (!msg) return;
      }
      ticket = { description: msg, subject: 'Consulta', priority: 'normal' };
    }
    showToast('Resolviendo ticket...', 'info');

    const result = await callSupportAI(ticket, { module: 'support', source: 'auto-resolve' });
    if (!result.ok && result.error) {
      // Fallback al endpoint genérico
      const fb = await callAI(
        `Ticket de soporte:\nAsunto: ${ticket.subject}\nDescripción: ${ticket.description}\n\n` +
        `Como soporte técnico de Volvix POS, propone:\n1. Diagnóstico probable\n2. Solución paso a paso\n3. Cuándo escalar a humano`,
        'Eres soporte técnico nivel 2 de software POS.'
      );
      showModal('Resolución automática (fallback)', fb.content || 'Sin respuesta', '🛠️');
      return fb;
    }
    showModal('Resolución automática del ticket', result.content || 'Sin respuesta', '🛠️');
    return result;
  };

  // ───────────────────────────────────────────────────────────────────
  //  HELPER: análisis ad-hoc desde consola
  // ───────────────────────────────────────────────────────────────────
  window.aiAskAboutData = async function (question) {
    if (!question) {
      const ui = window.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        const res = await Promise.resolve(ui.form({
          title: '🤖 Consultar IA',
          fields: [{ name: 'question', label: '¿Qué quieres preguntarle a la IA sobre tu negocio?', type: 'textarea', rows: 6, required: true }],
          submitText: 'Preguntar'
        })).catch(() => null);
        if (!res || !res.question) return;
        question = res.question;
      } else {
        question = prompt('¿Qué quieres preguntarle a la IA sobre tu negocio?');
        if (!question) return;
      }
    }
    showToast('Consultando IA...', 'info');
    const result = await callAI(question, 'Eres consultor experto en POS retail mexicano.');
    showModal('Consulta a la IA', result.content || 'Sin respuesta', '🤖');
    return result;
  };

  // ───────────────────────────────────────────────────────────────────
  //  ANCLAS: integraciones para HTMLs existentes
  // ───────────────────────────────────────────────────────────────────
  function attachToEngineButtons() {
    // Si la página tiene botones con data-ai-action, los conectamos
    document.querySelectorAll('[data-ai-action]').forEach(btn => {
      if (btn.__aiBound) return;
      btn.__aiBound = true;
      const action = btn.getAttribute('data-ai-action');
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        switch (action) {
          case 'chat':       window.aiToggleChat(); break;
          case 'summarize':  window.aiSummarizeSales(); break;
          case 'recommend':  window.aiRecommendProducts(); break;
          case 'forecast':   window.aiForecastSales(); break;
          case 'patterns':   window.aiDetectPatterns(); break;
          case 'train':      window.aiTrainingAssistant(btn.getAttribute('data-ai-topic')); break;
          case 'resolve':    window.aiResolveTicket(btn.getAttribute('data-ai-ticket')); break;
          default:           warn('Acción AI desconocida:', action);
        }
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  HEALTH CHECK
  // ───────────────────────────────────────────────────────────────────
  async function healthCheck() {
    try {
      const res = await fetch(API + ENDPOINTS.decide, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt: 'ping', system: 'Responde solo con: OK', max_tokens: 10 })
      });
      const data = res.ok ? await res.json() : null;
      const isReal = data && !data.simulated && data.content;
      log('Health-check IA:', isReal ? '✅ REAL' : '⚠️ SIMULADO/OFFLINE');
      if (!isReal && DEBUG) {
        warn('La IA está en modo simulado. Configura ANTHROPIC_API_KEY en Vercel para respuestas reales.');
      }
      return { ok: !!data, real: isReal };
    } catch (e) {
      err('Health-check falló:', e.message);
      return { ok: false, real: false, error: e.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  INIT
  // ───────────────────────────────────────────────────────────────────
  function init() {
    loadSession();
    createChatOverlay();
    attachToEngineButtons();
    // Reescaneo periódico de botones AI en SPA
    setInterval(attachToEngineButtons, 3000);
    // Health check silencioso
    setTimeout(healthCheck, 1500);
    log('✅ Inicializado. Botones rápidos disponibles. window.AIRealAPI listo.');
  }

  // ───────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ───────────────────────────────────────────────────────────────────
  window.AIRealAPI = {
    version:        VERSION,
    chat:           window.aiSendMessage,
    toggleChat:     window.aiToggleChat,
    clearChat:      window.aiClearChat,
    summarize:      window.aiSummarizeSales,
    recommend:      window.aiRecommendProducts,
    forecast:       window.aiForecastSales,
    detectPatterns: window.aiDetectPatterns,
    train:          window.aiTrainingAssistant,
    resolveTicket:  window.aiResolveTicket,
    ask:            window.aiAskAboutData,
    healthCheck:    healthCheck,
    callAI:         callAI,
    callSupportAI:  callSupportAI,
    getHistory:     function () { return chatHistory.slice(); },
    getPending:     function () { return pendingRequests; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
