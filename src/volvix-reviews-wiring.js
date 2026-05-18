/**
 * VOLVIX · Reviews wiring (R17)
 * - Stars input (1-5)
 * - Render reseñas + breakdown + average por producto
 * - Trigger email post-compra invitando a review
 *
 * Convención global: window.VOLVIX_API o window.API_BASE
 */
(function () {
  'use strict';

  const API = (typeof window !== 'undefined' && (window.VOLVIX_API || window.API_BASE)) || '/api';
  const TOKEN_KEY = 'volvix_token';
  const log = (...a) => { try { (window.VOLVIX_LOG || console).log('[reviews]', ...a); } catch (_) {} };

  // ---- helpers ----
  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    try {
      const t = localStorage.getItem(TOKEN_KEY) || (window.VOLVIX_AUTH && window.VOLVIX_AUTH.token);
      if (t) h.Authorization = 'Bearer ' + t;
    } catch (_) {}
    return h;
  }
  async function fetchJSON(path, opts = {}) {
    const r = await fetch(API + path, Object.assign({ headers: authHeaders() }, opts));
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.error || ('http_' + r.status));
    return j;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // ---- Stars input ----
  function buildStarsInput(container, opts = {}) {
    if (!container) return null;
    const initial = parseInt(opts.value, 10) || 0;
    let value = initial;
    container.classList.add('vx-stars-input');
    container.innerHTML = '';
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.className = 'vx-star';
      s.dataset.value = i;
      s.setAttribute('role', 'button');
      s.setAttribute('aria-label', i + ' estrellas');
      s.tabIndex = 0;
      s.style.cursor = 'pointer';
      s.style.fontSize = (opts.size || 24) + 'px';
      s.textContent = '☆';
      s.addEventListener('click', () => setValue(i));
      s.addEventListener('mouseenter', () => paint(i));
      s.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setValue(i); }
      });
      container.appendChild(s);
      stars.push(s);
    }
    container.addEventListener('mouseleave', () => paint(value));
    function paint(n) { stars.forEach((s, idx) => { s.textContent = idx < n ? '★' : '☆'; }); }
    function setValue(n) {
      value = n; paint(n);
      if (typeof opts.onChange === 'function') opts.onChange(n);
      container.dispatchEvent(new CustomEvent('change', { detail: { value: n } }));
    }
    paint(value);
    return { getValue: () => value, setValue, el: container };
  }

  // ---- Rendering: lista + breakdown ----
  function starsHTML(rating, max = 5) {
    const r = Math.max(0, Math.min(max, parseFloat(rating) || 0));
    const full = Math.floor(r);
    const half = (r - full) >= 0.5 ? 1 : 0;
    const empty = max - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  async function renderProductReviews(productId, mountEl, opts = {}) {
    if (!mountEl) return;
    if (!productId) { mountEl.innerHTML = ''; return; }
    mountEl.innerHTML = '<div class="vx-reviews-loading">Cargando reseñas...</div>';
    try {
      const [stats, list] = await Promise.all([
        fetchJSON(`/reviews/stats?product_id=${encodeURIComponent(productId)}`).catch(() => ({ average: 0, count: 0, distribution: { 1:0,2:0,3:0,4:0,5:0 } })),
        fetchJSON(`/reviews?product_id=${encodeURIComponent(productId)}&limit=${opts.limit || 50}`).catch(() => ({ items: [] })),
      ]);
      const dist = stats.distribution || { 1:0,2:0,3:0,4:0,5:0 };
      const total = stats.count || 0;
      const bars = [5,4,3,2,1].map(n => {
        const c = dist[n] || 0;
        const pct = total ? Math.round((c / total) * 100) : 0;
        return `<div class="vx-rev-bar"><span>${n}★</span>
          <div class="vx-rev-track"><div class="vx-rev-fill" style="width:${pct}%"></div></div>
          <span>${c}</span></div>`;
      }).join('');
      const items = (list.items || []).map(r => `
        <article class="vx-review" data-id="${escapeHtml(r.id)}">
          <header>
            <span class="vx-review-stars" aria-label="${r.rating} estrellas">${starsHTML(r.rating)}</span>
            ${r.is_verified ? '<span class="vx-badge-verified">Compra verificada</span>' : ''}
            <time>${escapeHtml((r.created_at || '').slice(0, 10))}</time>
          </header>
          ${r.title ? `<h4>${escapeHtml(r.title)}</h4>` : ''}
          <p>${escapeHtml(r.body || '')}</p>
        </article>`).join('') || '<p class="vx-rev-empty">Aún no hay reseñas. ¡Sé el primero!</p>';
      mountEl.innerHTML = `
        <section class="vx-reviews">
          <div class="vx-rev-summary">
            <div class="vx-rev-avg">
              <strong>${(stats.average || 0).toFixed(1)}</strong>
              <span class="vx-review-stars">${starsHTML(stats.average || 0)}</span>
              <small>${total} reseña${total === 1 ? '' : 's'}</small>
            </div>
            <div class="vx-rev-bars">${bars}</div>
          </div>
          <div class="vx-rev-list">${items}</div>
        </section>`;
    } catch (e) {
      log('render error', e);
      mountEl.innerHTML = '<div class="vx-reviews-error">No se pudieron cargar las reseñas.</div>';
    }
  }

  // ---- Submit ----
  async function submitReview(payload) {
    return await fetchJSON('/reviews', { method: 'POST', body: JSON.stringify(payload) });
  }

  // ---- Trigger email post-compra ----
  async function triggerPostPurchaseInvite(saleId, opts = {}) {
    try {
      const tpl = opts.template || 'review_invite';
      // Reusa /api/email/send si existe; degrada en silencio si no.
      await fetchJSON('/email/send', {
        method: 'POST',
        body: JSON.stringify({
          template: tpl,
          sale_id: saleId,
          to: opts.to || null,
          context: { sale_id: saleId, products: opts.products || [] },
        }),
      });
      log('post-purchase review invite enviado', saleId);
      return { ok: true };
    } catch (e) {
      log('email invite no enviado:', e && e.message);
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // Hook: cuando el carrito emite "sale:completed" disparamos la invitación.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('volvix:sale:completed', (ev) => {
      const d = (ev && ev.detail) || {};
      if (d.sale_id) triggerPostPurchaseInvite(d.sale_id, {
        to: d.customer_email,
        products: d.products || [],
      });
    });
  }

  // ---- Auto-mount: cualquier elemento con [data-volvix-reviews="<product_id>"] ----
  function autoMount(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-volvix-reviews]').forEach(el => {
      const pid = el.getAttribute('data-volvix-reviews');
      if (pid) renderProductReviews(pid, el);
    });
    scope.querySelectorAll('[data-volvix-stars-input]').forEach(el => {
      if (el.dataset.vxBound) return;
      el.dataset.vxBound = '1';
      buildStarsInput(el, { value: parseInt(el.getAttribute('data-value'), 10) || 0 });
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => autoMount());
    } else {
      autoMount();
    }
  }

  // ---- Export API ----
  if (typeof window !== 'undefined') {
    window.VolvixReviews = {
      buildStarsInput,
      renderProductReviews,
      submitReview,
      triggerPostPurchaseInvite,
      autoMount,
    };
  }
})();
