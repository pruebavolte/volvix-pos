/* volvix-promotions-wiring.js — R17 Promotions & Coupons
 * Cliente: input de código en checkout + admin CRUD.
 * Depende de window.volvixApi (fetch wrapper con auth) o usa fetch directo a /api/promotions.
 */
(function () {
  'use strict';

  const API = (path, opts) => {
    if (window.volvixApi && typeof window.volvixApi.request === 'function') {
      return window.volvixApi.request(path, opts);
    }
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    const tok = localStorage.getItem('volvix_token') || localStorage.getItem('token');
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return fetch(path, Object.assign({ headers }, opts)).then(r => r.json().catch(() => ({})));
  };

  // VolvixUI bridges with native fallback
  async function vuiForm(opts, nativeFallback) {
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      try { return await window.VolvixUI.form(opts); } catch { return null; }
    }
    return nativeFallback ? nativeFallback() : null;
  }
  async function vuiConfirm(opts, nativeFallback) {
    if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
      try { return await window.VolvixUI.confirm(opts); } catch { return false; }
    }
    return nativeFallback ? nativeFallback() : confirm(opts.message || '¿Confirmar?');
  }
  async function vuiDestructiveConfirm(opts, nativeFallback) {
    if (window.VolvixUI && typeof window.VolvixUI.destructiveConfirm === 'function') {
      try { return await window.VolvixUI.destructiveConfirm(opts); } catch { return false; }
    }
    return nativeFallback ? nativeFallback() : confirm(opts.message || '¿Eliminar?');
  }
  function vuiToast(type, message) {
    if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
      try { window.VolvixUI.toast({ type, message }); return; } catch {}
    }
  }

  // ============ CHECKOUT: input de promo ============
  function attachCheckoutInput(rootSel) {
    const root = document.querySelector(rootSel || '#checkout-promo, [data-promo-input]');
    if (!root) return;
    if (root.dataset.promoWired === '1') return;
    root.dataset.promoWired = '1';

    root.innerHTML = `
      <div class="promo-row" style="display:flex;gap:8px;align-items:center;margin:8px 0;">
        <input type="text" id="promo-code-input" placeholder="Código promo"
               style="flex:1;padding:8px;border:1px solid #ccc;border-radius:6px;text-transform:uppercase;" />
        <button type="button" id="promo-apply-btn"
                style="padding:8px 14px;background:#0a7;color:#fff;border:none;border-radius:6px;cursor:pointer;">
          Aplicar
        </button>
      </div>
      <div id="promo-feedback" style="font-size:13px;margin-top:4px;"></div>
    `;

    const input = root.querySelector('#promo-code-input');
    const btn   = root.querySelector('#promo-apply-btn');
    const fb    = root.querySelector('#promo-feedback');

    btn.addEventListener('click', async () => {
      const code = (input.value || '').trim().toUpperCase();
      if (!code) { fb.textContent = 'Ingresa un código.'; fb.style.color = '#a00'; return; }

      const cartTotal = Number(window.volvixCart?.total || document.querySelector('[data-cart-total]')?.dataset.cartTotal || 0);
      const customerId = window.volvixCart?.customer_id || null;

      fb.textContent = 'Validando...'; fb.style.color = '#666';
      const r = await API('/api/promotions/validate', {
        method: 'POST',
        body: JSON.stringify({ code, customer_id: customerId, cart_total: cartTotal })
      });

      if (r && r.valid) {
        fb.style.color = '#0a7';
        fb.textContent = `Promo aplicada: -$${r.discount_amount.toFixed(2)} (${r.type})`;
        window.volvixCart = window.volvixCart || {};
        window.volvixCart.promo_code = code;
        window.volvixCart.promo_discount = r.discount_amount;
        window.volvixCart.promo_id = r.promo_id;
        document.dispatchEvent(new CustomEvent('volvix:promo:applied', { detail: r }));
      } else {
        fb.style.color = '#a00';
        fb.textContent = 'No válido: ' + (r?.message || 'invalid_code');
        if (window.volvixCart) {
          delete window.volvixCart.promo_code;
          delete window.volvixCart.promo_discount;
          delete window.volvixCart.promo_id;
        }
      }
    });
  }

  // ============ ADMIN CRUD ============
  async function loadPromotions(tenantId) {
    const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    return API('/api/promotions' + q);
  }
  async function createPromotion(payload) { return API('/api/promotions', { method: 'POST', body: JSON.stringify(payload) }); }
  async function updatePromotion(id, patch) { return API('/api/promotions/' + id, { method: 'PATCH', body: JSON.stringify(patch) }); }
  async function deletePromotion(id)         { return API('/api/promotions/' + id, { method: 'DELETE' }); }

  function renderAdminTable(rootSel) {
    const root = document.querySelector(rootSel || '#promotions-admin');
    if (!root) return;
    root.innerHTML = `
      <h3>Promociones</h3>
      <button id="promo-new" style="margin-bottom:10px;">+ Nueva promo</button>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th align="left">Code</th><th>Tipo</th><th>Valor</th><th>Min</th>
          <th>Usos</th><th>Vence</th><th>Activa</th><th></th>
        </tr></thead>
        <tbody id="promo-tbody"></tbody>
      </table>
    `;
    const tbody = root.querySelector('#promo-tbody');
    loadPromotions().then((rows) => {
      tbody.innerHTML = (rows || []).map(p => `
        <tr data-id="${p.id}">
          <td><b>${p.code}</b></td>
          <td>${p.type}</td>
          <td>${p.value}${p.type === 'percent' ? '%' : ''}</td>
          <td>$${p.min_amount}</td>
          <td>${p.used_count}/${p.max_uses || '∞'}</td>
          <td>${p.ends_at ? new Date(p.ends_at).toLocaleDateString() : '—'}</td>
          <td><input type="checkbox" ${p.active ? 'checked' : ''} data-toggle-active /></td>
          <td><button data-del>🗑</button></td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-toggle-active]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const id = cb.closest('tr').dataset.id;
          updatePromotion(id, { active: cb.checked });
        });
      });
      tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('tr').dataset.id;
          const ok = await vuiDestructiveConfirm({
            title: 'Eliminar promoción',
            message: 'Esta acción eliminará la promoción permanentemente.',
            confirmLabel: 'Eliminar',
            requireText: 'ELIMINAR'
          }, () => confirm('¿Eliminar promo?'));
          if (ok) {
            await deletePromotion(id);
            vuiToast('success', 'Promoción eliminada');
            renderAdminTable(rootSel);
          }
        });
      });
    });

    root.querySelector('#promo-new').addEventListener('click', async () => {
      // R20 acción #1 — Promociones extendidas
      const data = await vuiForm({
        title: 'Crear promoción',
        submitLabel: 'Crear promoción',
        fields: [
          { name: 'code', label: 'Código', type: 'text', required: true,
            minLength: 3, maxLength: 32, transform: 'uppercase',
            pattern: '^[A-Z0-9_-]{3,32}$',
            placeholder: 'SUMMER10' },
          { name: 'name', label: 'Nombre de la promoción', type: 'text',
            minLength: 3, maxLength: 60 },
          { name: 'type', label: 'Tipo', type: 'radio', required: true, default: 'percent',
            options: [
              { value: 'percent', label: '% de descuento' },
              { value: 'fixed', label: 'Monto fijo' },
              { value: 'bogo', label: '2x1 / BOGO' },
              { value: 'first_purchase', label: 'Primera compra' },
              { value: 'loyalty_tier', label: 'Por tier de fidelidad' }
            ]
          },
          { name: 'value', label: 'Valor (% o $)', type: 'number',
            min: 0, max: 100, step: 0.01, default: 10,
            showIf: function (v) { return v.type === 'percent' || v.type === 'fixed'; } },
          { name: 'min_amount', label: 'Monto mínimo del carrito ($)', type: 'number',
            min: 0, step: 0.01, default: 0 },
          { name: 'max_uses', label: 'Máximo de usos (0 = ilimitado)', type: 'number',
            min: 0, step: 1, default: 0 },
          { name: 'ends_at', label: 'Fecha fin', type: 'date',
            min: new Date().toISOString().slice(0, 10) }
        ]
      }, () => {
        const code = prompt('Código (ej. SUMMER10)'); if (!code) return null;
        const type = prompt('Tipo: percent | fixed | bogo | first_purchase | loyalty_tier', 'percent');
        const value = prompt('Valor (% o $)', '10');
        const min_amount = prompt('Monto mínimo de carrito', '0');
        const max_uses = prompt('Máx. usos (0 = ilimitado)', '0');
        const ends_at = prompt('Fecha fin (YYYY-MM-DD, opcional)') || null;
        return { code, type, value, min_amount, max_uses, ends_at };
      });
      if (!data || !data.code) return;
      const payload = {
        code: String(data.code).toUpperCase(),
        type: data.type || 'percent',
        value: parseFloat(data.value) || 0,
        min_amount: parseFloat(data.min_amount) || 0,
        max_uses: parseInt(data.max_uses, 10) || 0,
        ends_at: data.ends_at || null,
        active: true
      };
      if (data.name) payload.name = data.name;
      await createPromotion(payload);
      vuiToast('success', 'Promoción creada: ' + payload.code);
      renderAdminTable(rootSel);
    });
  }

  // ============ AUTO-INIT ============
  function init() {
    attachCheckoutInput();
    renderAdminTable();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();

  window.volvixPromotions = {
    attachCheckoutInput, renderAdminTable,
    loadPromotions, createPromotion, updatePromotion, deletePromotion,
    validate: (code, customer_id, cart_total) =>
      API('/api/promotions/validate', { method: 'POST', body: JSON.stringify({ code, customer_id, cart_total }) }),
  };
})();
