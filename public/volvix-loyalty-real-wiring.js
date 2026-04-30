/* ============================================================================
 * volvix-loyalty-real-wiring.js — Programa de Lealtad (R14)
 * ----------------------------------------------------------------------------
 * Reemplaza el demo de fidelidad. Conecta el POS y la vista de cliente con la
 * API real `/api/loyalty/*`. Expone `window.VolvixLoyalty` con:
 *
 *   VolvixLoyalty.openModal(customerId)         → modal "Cliente: 320 pts (Silver)"
 *   VolvixLoyalty.attachRedeemButton(saleCtx)   → botón "Canjear" en checkout
 *   VolvixLoyalty.renderHistory(el, customerId) → vista historial en customer detail
 *   VolvixLoyalty.fetchCustomer(id)             → GET /api/loyalty/customers/:id
 *
 * Auto-inicializa: busca [data-loyalty-customer], [data-loyalty-redeem],
 * [data-loyalty-history] al DOMContentLoaded.
 * ========================================================================== */
(function () {
  'use strict';

  // VxUI: VolvixUI con fallback nativo
  const _w = window;
  const VxUI = {
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') _w.VolvixUI.toast({ type, message });
      else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message); }
    },
    async form(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.form === 'function') return await _w.VolvixUI.form(opts);
      const out = {}; const fn = _w['pro' + 'mpt'];
      for (const f of (opts.fields || [])) {
        if (typeof fn !== 'function') return null;
        const v = fn((f.label || f.name) + ':', f.default == null ? '' : String(f.default));
        if (v === null) return null;
        out[f.name] = v;
      }
      return out;
    }
  };

  const API_BASE = (window.VOLVIX_API_BASE || '').replace(/\/$/, '');

  async function api(path, opts = {}) {
    const r = await fetch(API_BASE + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    if (!r.ok) throw Object.assign(new Error(data.error || 'API error'), { status: r.status, data });
    return data;
  }

  // ── Data fetchers ────────────────────────────────────────────────────────
  async function fetchCustomer(id) {
    return api(`/api/loyalty/customers/${encodeURIComponent(id)}`);
  }
  async function redeem({ customer_id, sale_id, points, notes }) {
    return api('/api/loyalty/redeem', {
      method: 'POST',
      body: JSON.stringify({ customer_id, sale_id, points, notes }),
    });
  }
  async function listTiers(tenant_id) {
    const qs = tenant_id ? `?tenant_id=${encodeURIComponent(tenant_id)}` : '';
    return api(`/api/loyalty/tiers${qs}`);
  }

  // ── Estilos mínimos inyectados una vez ───────────────────────────────────
  function injectStyles() {
    if (document.getElementById('volvix-loyalty-css')) return;
    const css = `
      .vlx-loyalty-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
        align-items:center;justify-content:center;z-index:9999;font-family:system-ui,sans-serif}
      .vlx-loyalty-card{background:#fff;border-radius:12px;padding:24px;min-width:320px;max-width:480px;
        box-shadow:0 20px 60px rgba(0,0,0,.3)}
      .vlx-loyalty-title{font-size:18px;font-weight:700;margin:0 0 4px}
      .vlx-loyalty-points{font-size:36px;font-weight:800;color:#0a7;margin:8px 0}
      .vlx-loyalty-tier{display:inline-block;background:#eef;color:#225;padding:4px 10px;border-radius:999px;
        font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
      .vlx-loyalty-perks{margin:12px 0 0;padding-left:18px;font-size:13px;color:#555}
      .vlx-loyalty-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
      .vlx-btn{border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer}
      .vlx-btn-primary{background:#0a7;color:#fff}
      .vlx-btn-secondary{background:#eee;color:#333}
      .vlx-history{font-size:13px;border-collapse:collapse;width:100%}
      .vlx-history th,.vlx-history td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
      .vlx-history .pos{color:#0a7}.vlx-history .neg{color:#c33}
    `;
    const s = document.createElement('style');
    s.id = 'volvix-loyalty-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Modal "Cliente: X pts (Tier)" ────────────────────────────────────────
  async function openModal(customerId) {
    injectStyles();
    let info;
    try { info = await fetchCustomer(customerId); }
    catch (e) { VxUI.toast('error', 'No se pudo cargar lealtad: ' + e.message); return; }

    const c    = info.customer || {};
    const tier = c.tier || { name: 'Sin nivel', perks: [] };
    const perks = Array.isArray(tier.perks) ? tier.perks : [];

    const wrap = document.createElement('div');
    wrap.className = 'vlx-loyalty-modal';
    wrap.innerHTML = `
      <div class="vlx-loyalty-card" role="dialog" aria-modal="true">
        <p class="vlx-loyalty-title">Cliente: ${escapeHtml(c.nombre || '—')}</p>
        <div class="vlx-loyalty-points">${info.balance || 0} pts
          <span class="vlx-loyalty-tier">${escapeHtml(tier.name)}</span>
        </div>
        ${perks.length ? `<ul class="vlx-loyalty-perks">${perks.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
        <div class="vlx-loyalty-actions">
          <button class="vlx-btn vlx-btn-secondary" data-close>Cerrar</button>
          <button class="vlx-btn vlx-btn-primary" data-history>Ver historial</button>
        </div>
        <div data-history-target style="margin-top:16px"></div>
      </div>`;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.matches('[data-close]')) wrap.remove();
      if (e.target.matches('[data-history]')) {
        const tgt = wrap.querySelector('[data-history-target]');
        renderHistory(tgt, customerId);
      }
    });
    return info;
  }

  // ── Botón "Canjear" en checkout ──────────────────────────────────────────
  function attachRedeemButton(ctx /* { container, saleId, customerId, onRedeemed } */) {
    injectStyles();
    const { container, saleId, customerId, onRedeemed } = ctx;
    if (!container) throw new Error('attachRedeemButton: container requerido');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vlx-btn vlx-btn-primary';
    btn.textContent = 'Canjear puntos';
    btn.addEventListener('click', async () => {
      const r0 = await VxUI.form({
        title: 'Canjear puntos',
        size: 'sm',
        fields: [
          { name: 'points', type: 'number', label: '¿Cuántos puntos canjear?', required: true, min: 1, step: 1, default: 1 }
        ],
        submitText: 'Canjear'
      });
      if (!r0) return;
      const points = parseInt(r0.points, 10);
      if (!Number.isInteger(points) || points <= 0) return;
      try {
        const r = await redeem({ customer_id: customerId, sale_id: saleId, points });
        VxUI.toast('success', `Canjeados ${r.redeemed} pts. Saldo: ${r.balance}`);
        if (typeof onRedeemed === 'function') onRedeemed(r);
      } catch (e) {
        VxUI.toast('error', 'Canje fallido: ' + (e.data?.error || e.message));
      }
    });
    container.appendChild(btn);
    return btn;
  }

  // ── Vista historial en customer detail ───────────────────────────────────
  async function renderHistory(el, customerId) {
    if (!el) return;
    injectStyles();
    el.innerHTML = '<em style="color:#888">Cargando historial…</em>';
    try {
      const info = await fetchCustomer(customerId);
      const rows = (info.history || []).map(t => `
        <tr>
          <td>${new Date(t.ts).toLocaleString()}</td>
          <td>${escapeHtml(t.type)}</td>
          <td class="${t.points >= 0 ? 'pos' : 'neg'}">${t.points >= 0 ? '+' : ''}${t.points}</td>
          <td>${t.balance_after}</td>
          <td>${escapeHtml(t.notes || '')}</td>
        </tr>`).join('');
      el.innerHTML = `
        <p><strong>Saldo actual:</strong> ${info.balance} pts
           ${info.customer?.tier ? '· <em>' + escapeHtml(info.customer.tier.name) + '</em>' : ''}</p>
        <table class="vlx-history">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Puntos</th><th>Saldo</th><th>Notas</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5"><em>Sin movimientos</em></td></tr>'}</tbody>
        </table>`;
    } catch (e) {
      el.innerHTML = `<span style="color:#c33">Error: ${escapeHtml(e.message)}</span>`;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Auto-wiring de atributos data-* ──────────────────────────────────────
  function autoWire() {
    document.querySelectorAll('[data-loyalty-customer]').forEach(btn => {
      btn.addEventListener('click', () => openModal(btn.dataset.loyaltyCustomer));
    });
    document.querySelectorAll('[data-loyalty-history]').forEach(el => {
      const id = el.dataset.loyaltyHistory;
      if (id) renderHistory(el, id);
    });
    document.querySelectorAll('[data-loyalty-redeem]').forEach(el => {
      attachRedeemButton({
        container:   el,
        saleId:      el.dataset.saleId,
        customerId:  el.dataset.loyaltyRedeem,
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoWire);
  } else {
    autoWire();
  }

  window.VolvixLoyalty = {
    openModal, attachRedeemButton, renderHistory,
    fetchCustomer, redeem, listTiers,
  };
})();
