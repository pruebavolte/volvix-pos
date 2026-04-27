/* ============================================================
   VOLVIX · AI MODULES + MARKETPLACE WIRING
   Conecta botones de AI Engine, Support, Academy, Marketplace
============================================================ */
(function() {
  'use strict';

  const API = location.origin;
  let session = null;

  console.log('%c[AI-WIRING]', 'background:#A855F7;color:#fff;padding:2px 6px;border-radius:3px',
              'Cableado AI activo');

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem('volvixSession') || 'null'); }
    catch { session = null; }
    return session;
  }

  async function apiGet(path) {
    try {
      const res = await fetch(API + path);
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: e.message }; }
  }

  // =========================================================
  // CHAT con IA (genérico)
  // =========================================================
  window.aiChat = async function(message, target) {
    if (!message) return;
    try {
      const result = await apiPost('/api/ai/decide', {
        prompt: message,
        system: 'Eres la IA de Volvix POS. Responde de forma clara y útil.'
      });

      if (target && document.getElementById(target)) {
        const el = document.getElementById(target);
        el.innerHTML += `<div class="msg user">${message}</div>`;
        el.innerHTML += `<div class="msg ai">${result.content || result.error || 'Sin respuesta'}</div>`;
        el.scrollTop = el.scrollHeight;
      }

      return result;
    } catch (e) {
      return { error: e.message };
    }
  };

  // =========================================================
  // SUPPORT - Crear ticket con IA
  // =========================================================
  window.aiCreateSupportTicket = async function() {
    const ui = window.VolvixUI;
    let title, description;
    if (ui && typeof ui.form === 'function') {
      const res = await Promise.resolve(ui.form({
        title: 'Nuevo ticket de soporte',
        fields: [
          { name: 'title', label: 'Título', type: 'text', required: true, placeholder: 'Resume tu problema' },
          { name: 'description', label: 'Descripción', type: 'textarea', rows: 5 }
        ],
        submitText: 'Crear'
      })).catch(() => null);
      if (!res || !res.title) return;
      title = res.title;
      description = res.description || '';
    } else {
      title = prompt('¿Cuál es tu problema? (título corto)');
      if (!title) return;
      description = prompt('Describe el problema:') || '';
    }

    try {
      const result = await apiPost('/api/tickets', {
        title, description,
        tenant_id: session?.tenant_id || 'TNT001'
      });

      if (result.ticket?.status === 'solved') {
        VolvixUI.toast({type:'success', message:`✅ IA resolvió tu problema:\n\n${result.ticket.solution}`});
      } else {
        VolvixUI.toast({type:'success', message:`📋 Ticket creado: ${result.ticket?.id}\n\nUn agente humano lo atenderá pronto.`});
      }
      return result;
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error: ' + e.message});
    }
  };

  // =========================================================
  // ENGINE - Solicitar feature
  // =========================================================
  window.aiRequestFeature = async function(text) {
    let request = text;
    if (!request) {
      const ui = window.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        const res = await Promise.resolve(ui.form({
          title: 'Solicitar feature',
          fields: [{ name: 'request', label: '¿Qué feature necesitas?', type: 'textarea', rows: 6, required: true }],
          submitText: 'Enviar'
        })).catch(() => null);
        if (!res || !res.request) return;
        request = res.request;
      } else {
        request = prompt('¿Qué nueva feature necesitas?');
        if (!request) return;
      }
    }

    try {
      const result = await apiPost('/api/features/request', {
        clientRequest: request,
        tenantId: session?.tenant_id || 'TNT001'
      });

      const msg = `🤖 IA decidió: ${result.decision}\n\nFeature: ${result.feature?.name}\nMódulo: ${result.feature?.module}\nRazón: ${result.feature?.reason}`;
      VolvixUI.toast({type:'info', message:msg});
      return result;
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error: ' + e.message});
    }
  };

  // =========================================================
  // MARKETPLACE - Activar feature
  // =========================================================
  window.marketplaceActivate = async function(featureId) {
    const ui = window.VolvixUI;
    let ok;
    if (ui && typeof ui.confirm === 'function') {
      ok = await Promise.resolve(ui.confirm({ title: 'Activar feature', message: '¿Activar esta feature?' })).catch(() => false);
    } else {
      ok = confirm('¿Activar esta feature?');
    }
    if (!ok) return;
    try {
      const result = await apiPost('/api/features/activate', {
        featureId,
        tenantId: session?.tenant_id || 'TNT001'
      });
      VolvixUI.toast({type:'success', message:'✓ ' + result.message});
      return result;
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error: ' + e.message});
    }
  };

  // =========================================================
  // CARGAR FEATURES en marketplace
  // =========================================================
  async function loadMarketplaceFeatures() {
    const features = await apiGet('/api/features');
    if (!features) return;

    const container = document.querySelector('#features-grid, [data-features-grid]');
    if (container) {
      container.innerHTML = features.map(f => `
        <div class="feature-card" style="background:rgba(255,255,255,0.04);border:1px solid #2E2E2C;border-radius:12px;padding:16px;">
          <h3 style="font-size:14px;margin-bottom:6px;">${f.name}</h3>
          <p style="font-size:12px;color:#A8A29E;margin-bottom:8px;">Módulo: ${f.module}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="chip" style="font-size:11px;padding:3px 8px;background:rgba(34,197,94,0.1);color:#22C55E;border-radius:4px;">${f.status}</span>
            <span style="font-size:13px;font-weight:600;">${f.price > 0 ? '$' + f.price + '/mes' : 'Gratis'}</span>
          </div>
          <button class="btn" style="margin-top:12px;width:100%;" onclick="marketplaceActivate('${f.id}')">Activar</button>
        </div>
      `).join('');
    }

    return features;
  }

  // =========================================================
  // CARGAR DECISIONES IA
  // =========================================================
  async function loadAIDecisions() {
    const decisions = await apiGet('/api/ai/decisions');
    if (!decisions) return;

    const container = document.querySelector('#ai-decisions, [data-ai-decisions]');
    if (container) {
      container.innerHTML = decisions.map(d => `
        <div style="padding:12px;border-bottom:1px solid #2E2E2C;">
          <div style="font-size:13px;font-weight:600;">"${d.request}"</div>
          <div style="font-size:11px;color:#A8A29E;margin-top:4px;">
            Decisión: <strong style="color:#3B82F6;">${d.decision}</strong> · Feature: ${d.feature_id}
          </div>
          <div style="font-size:10px;color:#666;margin-top:2px;">${new Date(d.timestamp).toLocaleString()}</div>
        </div>
      `).join('');
    }

    return decisions;
  }

  // =========================================================
  // UNIVERSAL BUTTON INTERCEPTOR
  // =========================================================
  function wireAllButtons() {
    document.querySelectorAll('button:not([data-wired])').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const onclick = btn.getAttribute('onclick') || '';

      // Si ya tiene onclick que llama a una función conocida, no tocar
      if (onclick.includes('aiChat') || onclick.includes('aiRequest') ||
          onclick.includes('aiCreate') || onclick.includes('marketplace') ||
          onclick.includes('owner')) {
        btn.dataset.wired = 'true';
        return;
      }

      // Cablear según el texto del botón
      if (text.includes('crear ticket') || text.includes('nuevo ticket') || text.includes('reportar')) {
        btn.onclick = (e) => { e.preventDefault(); window.aiCreateSupportTicket(); };
        btn.dataset.wired = 'true';
      } else if (text.includes('solicitar feature') || text.includes('pedir feature')) {
        btn.onclick = (e) => { e.preventDefault(); window.aiRequestFeature(); };
        btn.dataset.wired = 'true';
      }
    });
  }

  // =========================================================
  // CHAT INPUT INTERCEPTOR
  // =========================================================
  function wireChatInputs() {
    document.querySelectorAll('input[type="text"], textarea').forEach(input => {
      const placeholder = (input.placeholder || '').toLowerCase();
      if (placeholder.includes('pregunta') || placeholder.includes('mensaje') ||
          placeholder.includes('escribe') || placeholder.includes('chat')) {

        if (input.dataset.wired) return;
        input.dataset.wired = 'true';

        input.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const msg = input.value.trim();
            if (!msg) return;
            input.value = '';

            // Buscar contenedor de chat cercano
            const chatContainer = input.closest('[data-chat], .chat-area, .chat')?.querySelector('[data-messages]') ||
                                   document.querySelector('#chat-messages, .chat-messages');

            if (chatContainer) {
              chatContainer.innerHTML += `<div style="padding:8px;background:#3B82F6;color:#fff;border-radius:8px;margin:6px 0;max-width:70%;margin-left:auto;">${msg}</div>`;
              chatContainer.innerHTML += `<div style="padding:8px;color:#A8A29E;">Pensando...</div>`;
            }

            const result = await window.aiChat(msg);

            if (chatContainer) {
              chatContainer.lastElementChild.remove();
              chatContainer.innerHTML += `<div style="padding:8px;background:#1F2937;color:#fff;border-radius:8px;margin:6px 0;max-width:70%;">${result.content || 'Sin respuesta'}</div>`;
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }
        });
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================
  async function init() {
    loadSession();

    // Detectar qué página estamos
    const page = location.pathname.split('/').pop();
    console.log(`[AI-WIRING] Página: ${page}`);

    // Cargar datos según la página
    if (page === 'marketplace.html') {
      await loadMarketplaceFeatures();
    } else if (page === 'volvix_ai_engine.html') {
      await loadAIDecisions();
    }

    // Cablear botones e inputs
    wireAllButtons();
    wireChatInputs();

    // Re-cablear cada 2s por si se agregan nuevos botones dinámicamente
    setInterval(() => {
      wireAllButtons();
      wireChatInputs();
    }, 2000);

    console.log('[AI-WIRING] ✅ Listo');
  }

  // Exponer API
  window.AIWiring = {
    chat: window.aiChat,
    createTicket: window.aiCreateSupportTicket,
    requestFeature: window.aiRequestFeature,
    activateFeature: window.marketplaceActivate,
    loadMarketplaceFeatures, loadAIDecisions,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
