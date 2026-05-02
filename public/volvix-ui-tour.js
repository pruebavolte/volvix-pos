/* ============================================================================
 * volvix-ui-tour.js — Interactive Product Tour for Volvix
 * ----------------------------------------------------------------------------
 * Step-by-step tooltip overlay with progress bar, skip button, keyboard
 * navigation and persisted "completed" state in localStorage.
 *
 * Usage:
 *   Tour.define('onboarding', [
 *     { selector:'#nav-home', title:'Inicio', body:'Aquí ves el dashboard.' },
 *     { selector:'#btn-new',  title:'Nuevo',  body:'Crea registros.' },
 *     ...
 *   ]);
 *   Tour.start('onboarding');
 *
 * API:
 *   Tour.define(name, steps)   register a tour
 *   Tour.start(name, opts)     start a tour
 *   Tour.next() / Tour.prev()  navigate manually
 *   Tour.skip() / Tour.end()   abort / finish
 *   Tour.reset(name)           clear persisted "completed"
 *   Tour.isCompleted(name)     bool
 *   Tour.on(event, handler)    'start'|'step'|'end'|'skip'
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'volvix.tour.state.v1';
  var Z = 999990;

  // ---------- storage ------------------------------------------------------
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function markCompleted(name) {
    var s = loadState();
    s[name] = { completed: true, at: Date.now() };
    saveState(s);
  }
  function markSkipped(name, idx) {
    var s = loadState();
    s[name] = { skipped: true, at: idx };
    saveState(s);
  }

  // ---------- styles -------------------------------------------------------
  var CSS = [
    '.vx-tour-backdrop{position:fixed;inset:0;background:rgba(8,12,24,.55);z-index:' + Z + ';pointer-events:auto;animation:vxFade .25s ease}',
    '.vx-tour-hole{position:fixed;border-radius:8px;box-shadow:0 0 0 9999px rgba(8,12,24,.55),0 0 0 3px #4f8cff,0 0 28px rgba(79,140,255,.55);z-index:' + (Z + 1) + ';transition:all .3s cubic-bezier(.2,.7,.3,1);pointer-events:none}',
    '.vx-tour-pop{position:fixed;max-width:340px;min-width:240px;background:#fff;color:#1a2233;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.25);z-index:' + (Z + 2) + ';font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;animation:vxPop .25s cubic-bezier(.2,.7,.3,1)}',
    '.vx-tour-pop .vx-h{padding:14px 16px 6px;font-weight:600;font-size:15px;color:#0d1b3d}',
    '.vx-tour-pop .vx-b{padding:0 16px 12px;color:#3a4660}',
    '.vx-tour-pop .vx-bar{height:4px;background:#e6ecf6;border-radius:0 0 0 12px;overflow:hidden}',
    '.vx-tour-pop .vx-bar>i{display:block;height:100%;background:linear-gradient(90deg,#4f8cff,#27d3a2);transition:width .3s}',
    '.vx-tour-pop .vx-foot{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid #eef1f7}',
    '.vx-tour-pop .vx-count{font-size:12px;color:#7a869a}',
    '.vx-tour-pop .vx-btns{display:flex;gap:6px}',
    '.vx-tour-pop button{font:inherit;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;transition:transform .12s,background .12s}',
    '.vx-tour-pop button:active{transform:translateY(1px)}',
    '.vx-tour-pop .vx-skip{background:transparent;color:#7a869a}',
    '.vx-tour-pop .vx-skip:hover{color:#1a2233}',
    '.vx-tour-pop .vx-prev{background:#eef2f9;color:#1a2233}',
    '.vx-tour-pop .vx-next{background:#4f8cff;color:#fff}',
    '.vx-tour-pop .vx-next:hover{background:#3d78ea}',
    '.vx-tour-pop .vx-arrow{position:absolute;width:14px;height:14px;background:#fff;transform:rotate(45deg);box-shadow:-2px -2px 4px rgba(0,0,0,.04)}',
    '@keyframes vxFade{from{opacity:0}to{opacity:1}}',
    '@keyframes vxPop{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}',
    '.vx-tour-pulse{animation:vxPulse 1.6s ease-in-out infinite}',
    '@keyframes vxPulse{0%,100%{box-shadow:0 0 0 9999px rgba(8,12,24,.55),0 0 0 3px #4f8cff,0 0 0 0 rgba(79,140,255,.6)}50%{box-shadow:0 0 0 9999px rgba(8,12,24,.55),0 0 0 3px #4f8cff,0 0 0 14px rgba(79,140,255,0)}}',
    '@media (max-width:520px){.vx-tour-pop{max-width:calc(100vw - 24px);min-width:0}}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('vx-tour-styles')) return;
    var st = document.createElement('style');
    st.id = 'vx-tour-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------- DOM helpers --------------------------------------------------
  function $(sel) {
    if (!sel) return null;
    if (sel instanceof Element) return sel;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height,
             right: r.right, bottom: r.bottom };
  }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  // ---------- state --------------------------------------------------------
  var tours = {};
  var listeners = { start: [], step: [], end: [], skip: [] };
  var current = null; // { name, steps, idx, els, opts }

  function emit(ev, payload) {
    (listeners[ev] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { console.warn('[Tour]', ev, e); }
    });
  }

  // ---------- rendering ----------------------------------------------------
  function ensureEls() {
    if (current && current.els) return current.els;
    var backdrop = document.createElement('div');
    backdrop.className = 'vx-tour-backdrop';

    var hole = document.createElement('div');
    hole.className = 'vx-tour-hole vx-tour-pulse';

    var pop = document.createElement('div');
    pop.className = 'vx-tour-pop';
    pop.innerHTML =
      '<div class="vx-arrow"></div>' +
      '<div class="vx-h"></div>' +
      '<div class="vx-b"></div>' +
      '<div class="vx-foot">' +
        '<span class="vx-count"></span>' +
        '<div class="vx-btns">' +
          '<button class="vx-skip" type="button">Saltar</button>' +
          '<button class="vx-prev" type="button">Atrás</button>' +
          '<button class="vx-next" type="button">Siguiente</button>' +
        '</div>' +
      '</div>' +
      '<div class="vx-bar"><i></i></div>';

    backdrop.addEventListener('click', function (e) {
      if (current && current.opts && current.opts.dismissOnBackdrop) skip();
    });
    pop.querySelector('.vx-skip').addEventListener('click', skip);
    pop.querySelector('.vx-prev').addEventListener('click', prev);
    pop.querySelector('.vx-next').addEventListener('click', next);

    document.body.appendChild(backdrop);
    document.body.appendChild(hole);
    document.body.appendChild(pop);

    var els = { backdrop: backdrop, hole: hole, pop: pop };
    if (current) current.els = els;
    return els;
  }

  function destroyEls() {
    if (!current || !current.els) return;
    ['backdrop', 'hole', 'pop'].forEach(function (k) {
      var n = current.els[k];
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    current.els = null;
  }

  function position(step) {
    var els = ensureEls();
    var target = $(step.selector);
    var vw = window.innerWidth, vh = window.innerHeight;

    if (!target) {
      // centered modal fallback
      els.hole.style.display = 'none';
      els.pop.style.left = (vw / 2 - 170) + 'px';
      els.pop.style.top = (vh / 2 - 90) + 'px';
      els.pop.querySelector('.vx-arrow').style.display = 'none';
      return;
    }
    els.hole.style.display = '';
    els.pop.querySelector('.vx-arrow').style.display = '';

    // scroll into view
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (e) {}

    var r = rectOf(target);
    var pad = step.padding != null ? step.padding : 6;
    els.hole.style.top    = (r.top - pad) + 'px';
    els.hole.style.left   = (r.left - pad) + 'px';
    els.hole.style.width  = (r.width + pad * 2) + 'px';
    els.hole.style.height = (r.height + pad * 2) + 'px';

    // popover placement: prefer below, then above, then right, then left
    var pw = els.pop.offsetWidth || 300;
    var ph = els.pop.offsetHeight || 160;
    var gap = 14;
    var place = step.placement || 'auto';
    var top, left, arrowSide;

    function fits(p) {
      if (p === 'bottom') return r.bottom + gap + ph < vh;
      if (p === 'top')    return r.top - gap - ph > 0;
      if (p === 'right')  return r.right + gap + pw < vw;
      if (p === 'left')   return r.left - gap - pw > 0;
      return false;
    }
    if (place === 'auto') {
      place = ['bottom', 'top', 'right', 'left'].filter(fits)[0] || 'bottom';
    }

    if (place === 'bottom') {
      top = r.bottom + gap; left = r.left + r.width / 2 - pw / 2; arrowSide = 'top';
    } else if (place === 'top') {
      top = r.top - gap - ph; left = r.left + r.width / 2 - pw / 2; arrowSide = 'bottom';
    } else if (place === 'right') {
      top = r.top + r.height / 2 - ph / 2; left = r.right + gap; arrowSide = 'left';
    } else {
      top = r.top + r.height / 2 - ph / 2; left = r.left - gap - pw; arrowSide = 'right';
    }
    left = clamp(left, 8, vw - pw - 8);
    top  = clamp(top,  8, vh - ph - 8);
    els.pop.style.top  = top + 'px';
    els.pop.style.left = left + 'px';

    var arrow = els.pop.querySelector('.vx-arrow');
    arrow.style.top = arrow.style.left = arrow.style.right = arrow.style.bottom = '';
    if (arrowSide === 'top')    { arrow.style.top = '-7px';    arrow.style.left = clamp(r.left + r.width/2 - left - 7, 12, pw - 22) + 'px'; }
    if (arrowSide === 'bottom') { arrow.style.bottom = '-7px'; arrow.style.left = clamp(r.left + r.width/2 - left - 7, 12, pw - 22) + 'px'; }
    if (arrowSide === 'left')   { arrow.style.left = '-7px';   arrow.style.top  = clamp(r.top + r.height/2 - top - 7, 12, ph - 22) + 'px'; }
    if (arrowSide === 'right')  { arrow.style.right = '-7px';  arrow.style.top  = clamp(r.top + r.height/2 - top - 7, 12, ph - 22) + 'px'; }
  }

  function render() {
    if (!current) return;
    var step = current.steps[current.idx];
    if (!step) return end();
    var els = ensureEls();
    els.pop.querySelector('.vx-h').textContent = step.title || '';
    els.pop.querySelector('.vx-b').innerHTML   = step.body || '';
    var total = current.steps.length;
    els.pop.querySelector('.vx-count').textContent = (current.idx + 1) + ' / ' + total;
    els.pop.querySelector('.vx-bar > i').style.width = (((current.idx + 1) / total) * 100) + '%';
    els.pop.querySelector('.vx-prev').style.visibility = current.idx === 0 ? 'hidden' : '';
    els.pop.querySelector('.vx-next').textContent = current.idx === total - 1 ? 'Finalizar' : 'Siguiente';
    position(step);
    if (step.onShow) try { step.onShow(step, current.idx); } catch (e) {}
    emit('step', { name: current.name, index: current.idx, step: step });
  }

  function reposition() { if (current) position(current.steps[current.idx]); }

  // ---------- controls -----------------------------------------------------
  function next() {
    if (!current) return;
    var step = current.steps[current.idx];
    if (step && step.onNext) { try { if (step.onNext() === false) return; } catch (e) {} }
    if (current.idx >= current.steps.length - 1) return end();
    current.idx++;
    render();
  }
  function prev() {
    if (!current || current.idx === 0) return;
    current.idx--;
    render();
  }
  function skip() {
    if (!current) return;
    markSkipped(current.name, current.idx);
    emit('skip', { name: current.name, index: current.idx });
    teardown();
  }
  function end() {
    if (!current) return;
    markCompleted(current.name);
    emit('end', { name: current.name, completed: true });
    teardown();
  }
  function teardown() {
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    document.removeEventListener('keydown', onKey, true);
    destroyEls();
    current = null;
  }
  function onKey(e) {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); skip(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }

  // ---------- public API ---------------------------------------------------
  function define(name, steps) {
    if (!name || !Array.isArray(steps)) throw new Error('Tour.define(name, steps[])');
    tours[name] = steps;
  }
  function start(name, opts) {
    opts = opts || {};
    var steps = tours[name];
    if (!steps) { console.warn('[Tour] not defined:', name); return false; }
    if (!opts.force && isCompleted(name)) return false;
    if (current) teardown();
    injectStyles();
    current = { name: name, steps: steps, idx: opts.startAt || 0, els: null, opts: opts };
    ensureEls();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('keydown', onKey, true);
    emit('start', { name: name });
    render();
    return true;
  }
  function reset(name) {
    var s = loadState();
    if (name) delete s[name]; else s = {};
    saveState(s);
  }
  function isCompleted(name) {
    var s = loadState();
    return !!(s[name] && s[name].completed);
  }
  function on(ev, fn) {
    if (!listeners[ev]) listeners[ev] = [];
    listeners[ev].push(fn);
    return function off() {
      listeners[ev] = listeners[ev].filter(function (f) { return f !== fn; });
    };
  }
  function list() { return Object.keys(tours); }

  global.Tour = {
    define: define,
    start: start,
    next: next,
    prev: prev,
    skip: skip,
    end: end,
    reset: reset,
    isCompleted: isCompleted,
    on: on,
    list: list,
    _state: loadState
  };
})(window);
