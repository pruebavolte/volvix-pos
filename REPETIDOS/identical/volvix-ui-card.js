/**
 * volvix-ui-card.js
 * UI Card component for Volvix.
 * Features: header / body / footer, image, actions, hoverable, expandable, loading state.
 * Exposes: window.Card
 *
 * Usage:
 *   const card = Card.create({
 *     title: 'Producto',
 *     subtitle: 'SKU-001',
 *     image: 'url.jpg',
 *     body: 'Descripción del producto...',
 *     footer: 'Actualizado hoy',
 *     hoverable: true,
 *     expandable: true,
 *     actions: [
 *       { label: 'Editar', onClick: () => {...}, variant: 'primary' },
 *       { label: 'Borrar', onClick: () => {...}, variant: 'danger' }
 *     ]
 *   });
 *   document.body.appendChild(card.el);
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'volvix-ui-card-styles';
  const CSS = `
.vx-card{
  position:relative;
  background:#fff;
  border-radius:12px;
  box-shadow:0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
  overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#1f2937;
  display:flex;
  flex-direction:column;
  transition:transform .18s ease, box-shadow .18s ease;
  max-width:420px;
  width:100%;
}
.vx-card.vx-card--hoverable{cursor:pointer}
.vx-card.vx-card--hoverable:hover{
  transform:translateY(-2px);
  box-shadow:0 8px 20px rgba(0,0,0,.10), 0 3px 6px rgba(0,0,0,.06);
}
.vx-card.vx-card--loading{opacity:.6;pointer-events:none}
.vx-card.vx-card--loading::after{
  content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);
  animation:vx-card-shimmer 1.2s infinite;
}
@keyframes vx-card-shimmer{
  0%{transform:translateX(-100%)}100%{transform:translateX(100%)}
}
.vx-card__image{
  width:100%;display:block;background:#f3f4f6;
  aspect-ratio:16/9;object-fit:cover;
}
.vx-card__header{
  padding:16px 18px 8px;display:flex;align-items:flex-start;gap:12px;
}
.vx-card__header-text{flex:1;min-width:0}
.vx-card__title{
  margin:0;font-size:16px;font-weight:600;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.vx-card__subtitle{
  margin:2px 0 0;font-size:13px;color:#6b7280;line-height:1.3;
}
.vx-card__icon{
  width:36px;height:36px;border-radius:8px;
  background:#eff6ff;color:#2563eb;
  display:flex;align-items:center;justify-content:center;
  font-size:18px;flex-shrink:0;
}
.vx-card__body{
  padding:8px 18px 16px;font-size:14px;line-height:1.5;color:#374151;
  flex:1;
}
.vx-card__body--collapsed{
  max-height:60px;overflow:hidden;
  -webkit-mask-image:linear-gradient(180deg,#000 60%,transparent);
          mask-image:linear-gradient(180deg,#000 60%,transparent);
}
.vx-card__expand{
  background:none;border:0;color:#2563eb;cursor:pointer;
  font-size:13px;padding:4px 18px 12px;text-align:left;font-weight:500;
}
.vx-card__expand:hover{text-decoration:underline}
.vx-card__footer{
  padding:12px 18px;border-top:1px solid #f3f4f6;
  display:flex;justify-content:space-between;align-items:center;gap:8px;
  font-size:13px;color:#6b7280;
}
.vx-card__actions{
  padding:12px 18px;display:flex;gap:8px;flex-wrap:wrap;
  border-top:1px solid #f3f4f6;
}
.vx-card__btn{
  border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:500;
  cursor:pointer;transition:background .15s ease;
  background:#f3f4f6;color:#1f2937;
}
.vx-card__btn:hover{background:#e5e7eb}
.vx-card__btn--primary{background:#2563eb;color:#fff}
.vx-card__btn--primary:hover{background:#1d4ed8}
.vx-card__btn--danger{background:#dc2626;color:#fff}
.vx-card__btn--danger:hover{background:#b91c1c}
.vx-card__btn--ghost{background:transparent;color:#2563eb}
.vx-card__btn--ghost:hover{background:#eff6ff}
.vx-card__badge{
  position:absolute;top:10px;right:10px;
  background:#dc2626;color:#fff;font-size:11px;font-weight:600;
  padding:3px 8px;border-radius:999px;
}
@media (prefers-color-scheme: dark){
  .vx-card{background:#1f2937;color:#f3f4f6}
  .vx-card__subtitle,.vx-card__footer{color:#9ca3af}
  .vx-card__body{color:#d1d5db}
  .vx-card__footer,.vx-card__actions{border-top-color:#374151}
  .vx-card__btn{background:#374151;color:#f3f4f6}
  .vx-card__btn:hover{background:#4b5563}
}
`;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildHeader(opts) {
    if (!opts.title && !opts.subtitle && !opts.icon) return null;
    const header = el('div', 'vx-card__header');
    if (opts.icon) {
      const ic = el('div', 'vx-card__icon');
      ic.innerHTML = opts.icon;
      header.appendChild(ic);
    }
    const wrap = el('div', 'vx-card__header-text');
    if (opts.title) wrap.appendChild(el('h3', 'vx-card__title', opts.title));
    if (opts.subtitle) wrap.appendChild(el('p', 'vx-card__subtitle', opts.subtitle));
    header.appendChild(wrap);
    return header;
  }

  function buildBody(opts, root) {
    if (!opts.body) return null;
    const body = el('div', 'vx-card__body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body instanceof Node) body.appendChild(opts.body);
    if (opts.expandable) {
      body.classList.add('vx-card__body--collapsed');
      const btn = el('button', 'vx-card__expand', 'Ver más');
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = body.classList.toggle('vx-card__body--collapsed');
        btn.textContent = collapsed ? 'Ver más' : 'Ver menos';
      });
      root._expandBtn = btn;
    }
    return body;
  }

  function buildActions(opts) {
    if (!opts.actions || !opts.actions.length) return null;
    const wrap = el('div', 'vx-card__actions');
    opts.actions.forEach((a) => {
      const b = el('button', 'vx-card__btn', a.label || 'Action');
      b.type = 'button';
      if (a.variant) b.classList.add('vx-card__btn--' + a.variant);
      if (a.disabled) b.disabled = true;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof a.onClick === 'function') a.onClick(e);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function buildFooter(opts) {
    if (!opts.footer) return null;
    const f = el('div', 'vx-card__footer');
    if (typeof opts.footer === 'string') f.textContent = opts.footer;
    else if (opts.footer instanceof Node) f.appendChild(opts.footer);
    return f;
  }

  function create(opts) {
    opts = opts || {};
    injectStyles();

    const card = el('div', 'vx-card');
    if (opts.hoverable) card.classList.add('vx-card--hoverable');
    if (opts.loading) card.classList.add('vx-card--loading');
    if (opts.className) card.classList.add(opts.className);

    if (opts.badge) {
      const bd = el('span', 'vx-card__badge', opts.badge);
      card.appendChild(bd);
    }

    if (opts.image) {
      const img = el('img', 'vx-card__image');
      img.src = opts.image;
      img.alt = opts.imageAlt || '';
      img.loading = 'lazy';
      card.appendChild(img);
    }

    const header = buildHeader(opts);
    if (header) card.appendChild(header);

    const body = buildBody(opts, card);
    if (body) card.appendChild(body);
    if (card._expandBtn) card.appendChild(card._expandBtn);

    const actions = buildActions(opts);
    if (actions) card.appendChild(actions);

    const footer = buildFooter(opts);
    if (footer) card.appendChild(footer);

    if (opts.hoverable && typeof opts.onClick === 'function') {
      card.addEventListener('click', opts.onClick);
    }

    const api = {
      el: card,
      setTitle(t) {
        const n = card.querySelector('.vx-card__title');
        if (n) n.textContent = t;
      },
      setBody(html) {
        const n = card.querySelector('.vx-card__body');
        if (n) {
          if (html instanceof Node) { n.innerHTML = ''; n.appendChild(html); }
          else n.innerHTML = html;
        }
      },
      setLoading(on) {
        card.classList.toggle('vx-card--loading', !!on);
      },
      setBadge(text) {
        let bd = card.querySelector('.vx-card__badge');
        if (!text) { if (bd) bd.remove(); return; }
        if (!bd) { bd = el('span', 'vx-card__badge'); card.prepend(bd); }
        bd.textContent = text;
      },
      destroy() { card.remove(); }
    };
    return api;
  }

  function mount(target, opts) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('Card.mount: target not found');
    const c = create(opts);
    host.appendChild(c.el);
    return c;
  }

  global.Card = { create: create, mount: mount, _css: CSS };
})(window);
