/* volvix-ui-empty.js — Empty State Components for Volvix POS
 * Exposes window.EmptyState with 10+ SVG illustrations and CTA support.
 * Usage:
 *   EmptyState.render(targetEl, 'no-products', { title, message, ctaLabel, onCta });
 *   EmptyState.html('no-data');
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────
  // SVG Illustrations Library (inline, themable via currentColor)
  // ──────────────────────────────────────────────────────────────────
  const SVG = {
    'no-data': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="30" y="40" width="140" height="90" rx="8" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
        <line x1="50" y1="65" x2="150" y2="65" stroke="#cbd5e1" stroke-width="2"/>
        <line x1="50" y1="85" x2="130" y2="85" stroke="#e2e8f0" stroke-width="2"/>
        <line x1="50" y1="105" x2="140" y2="105" stroke="#e2e8f0" stroke-width="2"/>
        <circle cx="100" cy="40" r="14" fill="#94a3b8"/>
        <text x="100" y="46" text-anchor="middle" fill="#fff" font-size="18" font-family="sans-serif">?</text>
      </svg>`,
    'no-products': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M40 60 L100 30 L160 60 L160 130 L40 130 Z" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
        <path d="M40 60 L100 90 L160 60" fill="none" stroke="#f59e0b" stroke-width="2"/>
        <line x1="100" y1="90" x2="100" y2="130" stroke="#f59e0b" stroke-width="2"/>
        <circle cx="100" cy="80" r="6" fill="#f59e0b"/>
      </svg>`,
    'no-sales': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="30" y="110" width="20" height="20" fill="#bae6fd"/>
        <rect x="60" y="90" width="20" height="40" fill="#7dd3fc"/>
        <rect x="90" y="70" width="20" height="60" fill="#38bdf8"/>
        <rect x="120" y="100" width="20" height="30" fill="#0ea5e9"/>
        <rect x="150" y="80" width="20" height="50" fill="#0284c7"/>
        <line x1="20" y1="130" x2="180" y2="130" stroke="#475569" stroke-width="2"/>
        <text x="100" y="40" text-anchor="middle" fill="#64748b" font-size="14" font-family="sans-serif">$0.00</text>
      </svg>`,
    'error': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="80" r="55" fill="#fee2e2" stroke="#ef4444" stroke-width="3"/>
        <line x1="75" y1="55" x2="125" y2="105" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/>
        <line x1="125" y1="55" x2="75" y2="105" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/>
      </svg>`,
    'search-empty': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="85" cy="75" r="35" fill="none" stroke="#64748b" stroke-width="4"/>
        <line x1="110" y1="100" x2="145" y2="135" stroke="#64748b" stroke-width="6" stroke-linecap="round"/>
        <text x="85" y="82" text-anchor="middle" fill="#94a3b8" font-size="22" font-family="sans-serif">?</text>
      </svg>`,
    'no-customers': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="60" r="22" fill="#ddd6fe" stroke="#8b5cf6" stroke-width="2"/>
        <path d="M55 130 Q55 95 100 95 Q145 95 145 130" fill="#ddd6fe" stroke="#8b5cf6" stroke-width="2"/>
        <line x1="70" y1="40" x2="130" y2="40" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4 4"/>
      </svg>`,
    'no-inventory': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="40" y="50" width="50" height="50" fill="#fee2e2" stroke="#dc2626" stroke-width="2"/>
        <rect x="110" y="50" width="50" height="50" fill="#fee2e2" stroke="#dc2626" stroke-width="2"/>
        <rect x="75" y="100" width="50" height="40" fill="#fee2e2" stroke="#dc2626" stroke-width="2"/>
        <text x="100" y="35" text-anchor="middle" fill="#dc2626" font-size="14" font-family="sans-serif" font-weight="bold">STOCK 0</text>
      </svg>`,
    'no-connection': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M100 110 a8 8 0 1 0 0.01 0" fill="#64748b"/>
        <path d="M70 90 Q100 65 130 90" fill="none" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
        <path d="M50 70 Q100 30 150 70" fill="none" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
        <line x1="40" y1="40" x2="160" y2="130" stroke="#ef4444" stroke-width="4"/>
      </svg>`,
    'no-results': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="40" y="40" width="120" height="90" rx="6" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
        <line x1="60" y1="60" x2="140" y2="60" stroke="#cbd5e1" stroke-width="2"/>
        <line x1="60" y1="80" x2="120" y2="80" stroke="#e2e8f0" stroke-width="2"/>
        <line x1="60" y1="100" x2="100" y2="100" stroke="#e2e8f0" stroke-width="2"/>
        <text x="100" y="150" text-anchor="middle" fill="#64748b" font-size="11" font-family="sans-serif">0 resultados</text>
      </svg>`,
    'no-reports': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="50" y="30" width="100" height="120" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/>
        <line x1="65" y1="55" x2="135" y2="55" stroke="#10b981" stroke-width="2"/>
        <line x1="65" y1="75" x2="120" y2="75" stroke="#a7f3d0" stroke-width="2"/>
        <line x1="65" y1="95" x2="125" y2="95" stroke="#a7f3d0" stroke-width="2"/>
        <polyline points="65,130 80,115 95,125 115,105 135,120" fill="none" stroke="#10b981" stroke-width="2"/>
      </svg>`,
    'no-permissions': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="70" y="70" width="60" height="55" rx="6" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
        <path d="M80 70 V55 a20 20 0 0 1 40 0 V70" fill="none" stroke="#ca8a04" stroke-width="3"/>
        <circle cx="100" cy="95" r="5" fill="#ca8a04"/>
        <line x1="100" y1="100" x2="100" y2="112" stroke="#ca8a04" stroke-width="3"/>
      </svg>`,
    'success-empty': `
      <svg viewBox="0 0 200 160" width="180" height="144" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="80" r="50" fill="#dcfce7" stroke="#16a34a" stroke-width="3"/>
        <polyline points="75,82 92,100 128,62" fill="none" stroke="#16a34a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
  };

  // ──────────────────────────────────────────────────────────────────
  // Default copy for each illustration (es-MX)
  // ──────────────────────────────────────────────────────────────────
  const DEFAULTS = {
    'no-data':         { title: 'Sin datos',            message: 'Aún no hay información para mostrar.' },
    'no-products':     { title: 'Sin productos',        message: 'Agrega tu primer producto al catálogo.', ctaLabel: 'Crear producto' },
    'no-sales':        { title: 'Sin ventas hoy',       message: 'Cuando registres una venta aparecerá aquí.', ctaLabel: 'Nueva venta' },
    'error':           { title: 'Algo salió mal',       message: 'Ocurrió un error. Intenta de nuevo.', ctaLabel: 'Reintentar' },
    'search-empty':    { title: 'Sin resultados',       message: 'Prueba con otros términos de búsqueda.' },
    'no-customers':    { title: 'Sin clientes',         message: 'Registra a tu primer cliente.', ctaLabel: 'Agregar cliente' },
    'no-inventory':    { title: 'Inventario vacío',     message: 'No hay existencias registradas.', ctaLabel: 'Cargar inventario' },
    'no-connection':   { title: 'Sin conexión',         message: 'Verifica tu red e intenta de nuevo.', ctaLabel: 'Reintentar' },
    'no-results':      { title: '0 resultados',         message: 'No encontramos coincidencias con los filtros.' },
    'no-reports':      { title: 'Sin reportes',         message: 'Genera tu primer reporte de ventas.', ctaLabel: 'Generar reporte' },
    'no-permissions':  { title: 'Acceso restringido',   message: 'No tienes permisos para ver esta sección.' },
    'success-empty':   { title: '¡Todo al día!',        message: 'No hay pendientes por ahora.' }
  };

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ensureStyles() {
    if (document.getElementById('volvix-empty-styles')) return;
    const css = `
      .vx-empty { display:flex; flex-direction:column; align-items:center; justify-content:center;
        text-align:center; padding:32px 16px; color:#334155; font-family:system-ui,Segoe UI,Roboto,sans-serif; }
      .vx-empty__art { margin-bottom:16px; opacity:.95; }
      .vx-empty__title { font-size:18px; font-weight:600; margin:0 0 6px; color:#0f172a; }
      .vx-empty__msg { font-size:14px; margin:0 0 18px; max-width:380px; line-height:1.45; color:#475569; }
      .vx-empty__cta { background:#2563eb; color:#fff; border:0; border-radius:8px; padding:10px 18px;
        font-size:14px; font-weight:600; cursor:pointer; transition:background .15s; }
      .vx-empty__cta:hover { background:#1d4ed8; }
      .vx-empty__cta:focus { outline:2px solid #93c5fd; outline-offset:2px; }
      .vx-empty--compact { padding:16px 8px; }
      .vx-empty--compact .vx-empty__art svg { width:96px; height:80px; }
    `;
    const tag = document.createElement('style');
    tag.id = 'volvix-empty-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ──────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────
  function html(kind, opts) {
    const o = Object.assign({}, DEFAULTS[kind] || DEFAULTS['no-data'], opts || {});
    const art = SVG[kind] || SVG['no-data'];
    const cta = o.ctaLabel
      ? `<button type="button" class="vx-empty__cta" data-vx-empty-cta>${escapeHtml(o.ctaLabel)}</button>`
      : '';
    return `
      <div class="vx-empty${o.compact ? ' vx-empty--compact' : ''}" role="status" aria-live="polite">
        <div class="vx-empty__art">${art}</div>
        <h3 class="vx-empty__title">${escapeHtml(o.title)}</h3>
        <p class="vx-empty__msg">${escapeHtml(o.message)}</p>
        ${cta}
      </div>`;
  }

  function render(target, kind, opts) {
    ensureStyles();
    const el = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!el) { console.warn('[EmptyState] target not found:', target); return null; }
    el.innerHTML = html(kind, opts);
    if (opts && typeof opts.onCta === 'function') {
      const btn = el.querySelector('[data-vx-empty-cta]');
      if (btn) btn.addEventListener('click', opts.onCta);
    }
    return el;
  }

  function list() { return Object.keys(SVG); }

  function register(kind, svg, defaults) {
    SVG[kind] = svg;
    if (defaults) DEFAULTS[kind] = defaults;
  }

  global.EmptyState = {
    render,
    html,
    list,
    register,
    SVG,
    DEFAULTS,
    version: '1.0.0'
  };
})(window);
