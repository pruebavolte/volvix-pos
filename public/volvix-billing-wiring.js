/**
 * VOLVIX · Billing wiring (R14)
 * Pricing table, upgrade button, gauge de uso vs límite.
 *
 * Uso (en cualquier HTML del owner):
 *   <div id="vx-pricing"></div>
 *   <div id="vx-usage"></div>
 *   <script src="/volvix-billing-wiring.js"></script>
 */
(function () {
  'use strict';

  const API = (window.VOLVIX_API_BASE || '') + '/api';
  const fmtMoney = (cents, ccy) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: ccy || 'MXN' })
      .format((Number(cents) || 0) / 100);

  function authHeaders() {
    const t = localStorage.getItem('volvix_token') || localStorage.getItem('token') || '';
    const h = { 'Content-Type': 'application/json' };
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  async function api(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
    return data;
  }

  // ---------- Pricing table ----------
  async function renderPricing(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<div class="vx-loading">Cargando planes...</div>';
    try {
      const [{ plans }, subResp] = await Promise.all([
        api('GET', '/billing/plans'),
        api('GET', '/billing/subscription').catch(() => ({ subscription: null })),
      ]);
      const currentPlanId = subResp?.subscription?.plan_id;
      let cycle = 'monthly';

      const cycleToggle = `
        <div class="vx-cycle-toggle" style="text-align:center;margin-bottom:1rem">
          <label><input type="radio" name="vx-cycle" value="monthly" checked> Mensual</label>
          <label style="margin-left:1rem"><input type="radio" name="vx-cycle" value="yearly"> Anual (2 meses gratis)</label>
        </div>`;

      const card = (p) => {
        const isCurrent = p.id === currentPlanId;
        const limits = p.limits || {};
        const fmtLimit = (v) => v === -1 ? 'Ilimitado' : v;
        const features = Object.entries(p.features || {})
          .map(([k, v]) => `<li>${k}: <b>${v === true ? 'Sí' : v === false ? 'No' : v}</b></li>`).join('');
        return `
          <div class="vx-plan-card" data-plan-id="${p.id}" data-monthly="${p.price_monthly_cents}" data-yearly="${p.price_yearly_cents}" style="border:1px solid #ddd;border-radius:8px;padding:1rem;flex:1;min-width:240px">
            <h3 style="margin:0 0 .5rem">${p.name}</h3>
            <div class="vx-price" style="font-size:1.6rem;font-weight:700">${fmtMoney(p.price_monthly_cents, p.currency)}<small style="font-size:.7rem">/mes</small></div>
            <ul style="font-size:.85rem;padding-left:1rem">
              <li>Usuarios: <b>${fmtLimit(limits.max_users)}</b></li>
              <li>Productos: <b>${fmtLimit(limits.max_products)}</b></li>
              <li>Sucursales: <b>${fmtLimit(limits.max_locations)}</b></li>
              ${features}
            </ul>
            <button class="vx-subscribe-btn" data-plan-id="${p.id}" ${isCurrent ? 'disabled' : ''}
              style="width:100%;padding:.6rem;border-radius:6px;border:0;background:${isCurrent ? '#999' : '#0066cc'};color:white;cursor:${isCurrent ? 'default' : 'pointer'}">
              ${isCurrent ? 'Plan actual' : (currentPlanId ? 'Cambiar a este plan' : 'Suscribirme')}
            </button>
          </div>`;
      };

      el.innerHTML = `
        ${cycleToggle}
        <div class="vx-plans" style="display:flex;gap:1rem;flex-wrap:wrap">${plans.map(card).join('')}</div>
        <div class="vx-msg" style="margin-top:1rem;color:#c00"></div>
      `;

      el.querySelectorAll('input[name="vx-cycle"]').forEach(r => {
        r.addEventListener('change', () => {
          cycle = r.value;
          el.querySelectorAll('.vx-plan-card').forEach(c => {
            const monthly = +c.getAttribute('data-monthly');
            const yearly = +c.getAttribute('data-yearly');
            const priceEl = c.querySelector('.vx-price');
            const cents = cycle === 'yearly' ? Math.round(yearly / 12) : monthly;
            priceEl.innerHTML = `${fmtMoney(cents, 'MXN')}<small style="font-size:.7rem">/mes${cycle === 'yearly' ? ' (anual)' : ''}</small>`;
          });
        });
      });

      el.querySelectorAll('.vx-subscribe-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const planId = btn.getAttribute('data-plan-id');
          const msg = el.querySelector('.vx-msg');
          msg.textContent = '';
          btn.disabled = true; btn.textContent = 'Procesando...';
          try {
            const endpoint = currentPlanId ? '/billing/upgrade' : '/billing/subscribe';
            await api('POST', endpoint, { plan_id: planId, billing_cycle: cycle });
            msg.style.color = '#080';
            msg.textContent = 'Plan actualizado. Recargando...';
            setTimeout(() => location.reload(), 1200);
          } catch (e) {
            msg.style.color = '#c00';
            msg.textContent = 'Error: ' + (e.data?.error || e.message);
            btn.disabled = false; btn.textContent = currentPlanId ? 'Cambiar a este plan' : 'Suscribirme';
          }
        });
      });
    } catch (e) {
      el.innerHTML = '<div style="color:#c00">No se pudo cargar planes: ' + (e.message || '') + '</div>';
    }
  }

  // ---------- Usage gauge ----------
  function gauge(label, current, max) {
    const unlimited = max === -1 || max == null;
    const pct = unlimited ? 0 : Math.min(100, Math.round((current / max) * 100));
    const color = pct >= 90 ? '#c00' : pct >= 70 ? '#e80' : '#0a0';
    const txt = unlimited ? `${current} / Ilimitado` : `${current} / ${max}`;
    return `
      <div class="vx-gauge" style="margin:.5rem 0">
        <div style="display:flex;justify-content:space-between;font-size:.85rem">
          <span>${label}</span><span>${txt}</span>
        </div>
        <div style="background:#eee;height:8px;border-radius:4px;overflow:hidden">
          <div style="width:${unlimited ? 5 : pct}%;height:100%;background:${unlimited ? '#888' : color}"></div>
        </div>
      </div>`;
  }

  async function renderUsage(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<div class="vx-loading">Cargando uso...</div>';
    try {
      const r = await api('GET', '/billing/usage');
      const lim = r.limits || {};
      el.innerHTML = `
        <h3 style="margin:0 0 .5rem">Uso actual · Plan ${r.plan}</h3>
        ${gauge('Usuarios',  r.usage.users,     lim.max_users)}
        ${gauge('Productos', r.usage.products,  lim.max_products)}
        ${gauge('Sucursales',r.usage.locations, lim.max_locations)}
        ${gauge('Ventas mes',r.usage.sales_mtd, lim.max_sales_per_month)}
        <div style="margin-top:.8rem;text-align:right">
          <a href="/billing.html" style="color:#0066cc;text-decoration:none;font-weight:600">Ver planes &raquo;</a>
        </div>`;
    } catch (e) {
      el.innerHTML = '<div style="color:#c00">No se pudo cargar uso.</div>';
    }
  }

  // ---------- Upgrade button (toolbar) ----------
  function injectUpgradeButton() {
    // 2026-05-07 cleanup: FAB deshabilitado, gateado por feature flag.
    // Para re-habilitar: window.VOLVIX_BILLING_FAB = true antes de cargar.
    if (window.VOLVIX_BILLING_FAB !== true) return;
    if (document.getElementById('vx-upgrade-btn')) return;
    const btn = document.createElement('a');
    btn.id = 'vx-upgrade-btn';
    btn.href = '/billing.html';
    btn.textContent = 'Mejorar plan';
    btn.style.cssText = 'position:fixed;right:1rem;bottom:1rem;background:#0066cc;color:white;padding:.6rem 1rem;border-radius:24px;text-decoration:none;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:9999';
    document.body.appendChild(btn);
  }

  // Auto-init
  document.addEventListener('DOMContentLoaded', () => {
    renderPricing('vx-pricing');
    renderUsage('vx-usage');
    injectUpgradeButton();
  });

  window.VolvixBilling = { renderPricing, renderUsage, injectUpgradeButton, api };
})();
