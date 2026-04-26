/* volvix-ui-animations.js - UI Animations Library for Volvix POS */
(function (global) {
  'use strict';

  const DEFAULTS = { duration: 300, easing: 'ease-in-out', delay: 0 };

  function ensureStyles() {
    if (document.getElementById('volvix-anim-styles')) return;
    const style = document.createElement('style');
    style.id = 'volvix-anim-styles';
    style.textContent = `
      @keyframes vx-fadeIn { from{opacity:0} to{opacity:1} }
      @keyframes vx-fadeOut { from{opacity:1} to{opacity:0} }
      @keyframes vx-slideInLeft { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes vx-slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes vx-slideInUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes vx-slideInDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes vx-slideOutLeft { from{transform:translateX(0);opacity:1} to{transform:translateX(-100%);opacity:0} }
      @keyframes vx-slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
      @keyframes vx-bounce {
        0%,20%,50%,80%,100%{transform:translateY(0)}
        40%{transform:translateY(-30px)}
        60%{transform:translateY(-15px)}
      }
      @keyframes vx-shake {
        0%,100%{transform:translateX(0)}
        10%,30%,50%,70%,90%{transform:translateX(-10px)}
        20%,40%,60%,80%{transform:translateX(10px)}
      }
      @keyframes vx-pulse {
        0%{transform:scale(1)} 50%{transform:scale(1.05)} 100%{transform:scale(1)}
      }
      @keyframes vx-zoomIn { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
      @keyframes vx-zoomOut { from{transform:scale(1);opacity:1} to{transform:scale(0);opacity:0} }
      @keyframes vx-flip { from{transform:rotateY(0)} to{transform:rotateY(360deg)} }
      @keyframes vx-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @keyframes vx-confetti-fall {
        0%{transform:translateY(-100vh) rotate(0);opacity:1}
        100%{transform:translateY(100vh) rotate(720deg);opacity:0}
      }
      .vx-confetti-piece{position:fixed;top:0;width:10px;height:10px;pointer-events:none;z-index:99999}
      .vx-particle{position:fixed;border-radius:50%;pointer-events:none;z-index:99998}
    `;
    document.head.appendChild(style);
  }

  function resolveEl(target) {
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  }

  function animate(el, name, opts = {}) {
    el = resolveEl(el);
    if (!el) return Promise.resolve(null);
    ensureStyles();
    const o = Object.assign({}, DEFAULTS, opts);
    return new Promise((resolve) => {
      el.style.animation = `${name} ${o.duration}ms ${o.easing} ${o.delay}ms ${o.iterations || 1} both`;
      const onEnd = () => {
        el.removeEventListener('animationend', onEnd);
        if (o.clear !== false) el.style.animation = '';
        resolve(el);
      };
      el.addEventListener('animationend', onEnd);
    });
  }

  const fadeIn  = (el, opts) => { const e = resolveEl(el); if (e) e.style.display = e.dataset.vxDisplay || ''; return animate(el, 'vx-fadeIn', opts); };
  const fadeOut = (el, opts) => animate(el, 'vx-fadeOut', opts).then((e) => { if (e) { e.dataset.vxDisplay = e.style.display; e.style.display = 'none'; } return e; });

  const slideIn = (el, dir = 'left', opts) => animate(el, `vx-slideIn${dir[0].toUpperCase()}${dir.slice(1)}`, opts);
  const slideOut = (el, dir = 'left', opts) => animate(el, `vx-slideOut${dir[0].toUpperCase()}${dir.slice(1)}`, opts);

  const bounce = (el, opts) => animate(el, 'vx-bounce', Object.assign({ duration: 800 }, opts));
  const shake  = (el, opts) => animate(el, 'vx-shake',  Object.assign({ duration: 600 }, opts));
  const pulse  = (el, opts) => animate(el, 'vx-pulse',  Object.assign({ duration: 500 }, opts));
  const zoomIn = (el, opts) => animate(el, 'vx-zoomIn', opts);
  const zoomOut = (el, opts) => animate(el, 'vx-zoomOut', opts);
  const flip   = (el, opts) => animate(el, 'vx-flip',   Object.assign({ duration: 700 }, opts));
  const spin   = (el, opts) => animate(el, 'vx-spin',   Object.assign({ duration: 1000, iterations: opts && opts.iterations || 'infinite' }, opts));

  function confetti(opts = {}) {
    ensureStyles();
    const count   = opts.count   || 120;
    const colors  = opts.colors  || ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ff6e40'];
    const duration = opts.duration || 4000;
    const pieces = [];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'vx-confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width  = (6 + Math.random() * 10) + 'px';
      p.style.height = (6 + Math.random() * 14) + 'px';
      p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      const dur = duration * (0.6 + Math.random() * 0.7);
      const delay = Math.random() * 600;
      p.style.animation = `vx-confetti-fall ${dur}ms linear ${delay}ms forwards`;
      document.body.appendChild(p);
      pieces.push(p);
      setTimeout(() => p.remove(), dur + delay + 100);
    }
    return pieces;
  }

  function particles(opts = {}) {
    ensureStyles();
    const x = opts.x ?? window.innerWidth / 2;
    const y = opts.y ?? window.innerHeight / 2;
    const count = opts.count || 30;
    const color = opts.color || '#40c4ff';
    const spread = opts.spread || 150;
    const duration = opts.duration || 1000;
    const created = [];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'vx-particle';
      const size = 4 + Math.random() * 8;
      p.style.width = p.style.height = size + 'px';
      p.style.left = x + 'px';
      p.style.top  = y + 'px';
      p.style.background = Array.isArray(color) ? color[i % color.length] : color;
      p.style.transition = `transform ${duration}ms cubic-bezier(.17,.67,.52,1), opacity ${duration}ms ease-out`;
      document.body.appendChild(p);
      created.push(p);
      const angle = Math.random() * Math.PI * 2;
      const dist  = spread * (0.4 + Math.random() * 0.8);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.2)`;
        p.style.opacity = '0';
      });
      setTimeout(() => p.remove(), duration + 50);
    }
    return created;
  }

  function ripple(event, opts = {}) {
    ensureStyles();
    const target = event.currentTarget || event.target;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const r = document.createElement('span');
    r.style.cssText = `position:absolute;border-radius:50%;background:${opts.color || 'rgba(255,255,255,0.5)'};
      width:${size}px;height:${size}px;left:${event.clientX - rect.left - size/2}px;
      top:${event.clientY - rect.top - size/2}px;pointer-events:none;
      transform:scale(0);transition:transform 600ms ease-out, opacity 600ms ease-out`;
    const prevPos = getComputedStyle(target).position;
    if (prevPos === 'static') target.style.position = 'relative';
    target.style.overflow = 'hidden';
    target.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(2)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 650);
  }

  function typeWriter(el, text, opts = {}) {
    el = resolveEl(el);
    if (!el) return Promise.resolve();
    const speed = opts.speed || 40;
    el.textContent = '';
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (i >= text.length) return resolve(el);
        el.textContent += text[i++];
        setTimeout(tick, speed);
      };
      tick();
    });
  }

  function countUp(el, to, opts = {}) {
    el = resolveEl(el);
    if (!el) return Promise.resolve();
    const from = opts.from ?? 0;
    const duration = opts.duration || 1000;
    const decimals = opts.decimals ?? 0;
    const prefix = opts.prefix || '';
    const suffix = opts.suffix || '';
    const start = performance.now();
    return new Promise((resolve) => {
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const val = from + (to - from) * eased;
        el.textContent = prefix + val.toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(step); else resolve(el);
      }
      requestAnimationFrame(step);
    });
  }

  function sequence(steps) {
    return steps.reduce((p, fn) => p.then(() => fn()), Promise.resolve());
  }

  function parallel(steps) {
    return Promise.all(steps.map((fn) => fn()));
  }

  function stagger(elements, animFn, delay = 80) {
    elements = typeof elements === 'string' ? document.querySelectorAll(elements) : elements;
    return Promise.all(Array.from(elements).map((el, i) =>
      new Promise((resolve) => setTimeout(() => animFn(el).then(resolve), i * delay))
    ));
  }

  global.Animations = {
    animate,
    fadeIn, fadeOut,
    slideIn, slideOut,
    bounce, shake, pulse, zoomIn, zoomOut, flip, spin,
    confetti, particles, ripple,
    typeWriter, countUp,
    sequence, parallel, stagger,
    _ensureStyles: ensureStyles
  };
})(window);
