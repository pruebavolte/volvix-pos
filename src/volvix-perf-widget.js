/**
 * VOLVIX · Performance Widget (R14 Observability)
 * --------------------------------------------------------------------
 * Floating bottom-left widget showing live runtime health:
 *   - FPS (rolling 1s)
 *   - Heap memory (used / limit MB) — Chromium only
 *   - Online / offline status
 *   - Slow-ops counter (long tasks > 50ms)
 *   - Network request count (intercepts fetch + XHR)
 *
 * Drop-in usage:
 *   <script src="/volvix-perf-widget.js" defer></script>
 *
 * Hide via:  window.VOLVIX_PERF_HIDE = true   (before script loads)
 * Or click the "—" minimize button.
 *
 * No external deps. Pure vanilla. Survives SPA route changes.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VOLVIX_PERF_WIDGET__) return;
  window.__VOLVIX_PERF_WIDGET__ = true;
  if (window.VOLVIX_PERF_HIDE) return;

  // ---------- state ----------
  var state = {
    fps: 0,
    heapUsed: 0,
    heapLimit: 0,
    online: navigator.onLine !== false,
    slowOps: 0,
    netCount: 0,
    expanded: false,
  };

  // ---------- FPS sampler ----------
  var frames = 0;
  var lastFpsTs = performance.now();
  function frameTick(now) {
    frames++;
    if (now - lastFpsTs >= 1000) {
      state.fps = Math.round((frames * 1000) / (now - lastFpsTs));
      frames = 0;
      lastFpsTs = now;
    }
    requestAnimationFrame(frameTick);
  }
  requestAnimationFrame(frameTick);

  // ---------- heap memory ----------
  function sampleHeap() {
    try {
      if (performance && performance.memory) {
        state.heapUsed  = Math.round(performance.memory.usedJSHeapSize  / 1048576);
        state.heapLimit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
      }
    } catch (_) {}
  }

  // ---------- online / offline ----------
  window.addEventListener('online',  function () { state.online = true;  render(); });
  window.addEventListener('offline', function () { state.online = false; render(); });

  // ---------- slow-ops via PerformanceObserver(longtask) ----------
  try {
    if (window.PerformanceObserver) {
      var lt = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (e.duration > 50) state.slowOps++;
        });
      });
      lt.observe({ entryTypes: ['longtask'] });
    }
  } catch (_) {}

  // ---------- network counters ----------
  try {
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function () {
        state.netCount++;
        return origFetch.apply(this, arguments);
      };
    }
  } catch (_) {}
  try {
    var XHRopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      state.netCount++;
      return XHRopen.apply(this, arguments);
    };
  } catch (_) {}

  // ---------- DOM widget ----------
  var root, body, badge;
  function buildUI() {
    root = document.createElement('div');
    root.id = 'volvix-perf-widget';
    root.style.cssText = [
      'position:fixed','left:8px','bottom:8px','z-index:2147483646',
      'font:11px/1.3 ui-monospace,Consolas,Menlo,monospace',
      'background:rgba(15,17,22,0.92)','color:#cfd6e2',
      'border:1px solid rgba(255,255,255,0.08)','border-radius:8px',
      'box-shadow:0 4px 14px rgba(0,0,0,0.4)','user-select:none',
      'backdrop-filter:blur(6px)','-webkit-backdrop-filter:blur(6px)',
      'min-width:130px','max-width:260px','overflow:hidden'
    ].join(';');

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;background:rgba(255,255,255,0.03)';
    header.innerHTML =
      '<span style="font-weight:700;color:#7dd3fc;letter-spacing:.5px">VOLVIX</span>' +
      '<span style="color:#94a3b8">perf</span>' +
      '<span id="vpw-badge" style="margin-left:auto;color:#22c55e">●</span>' +
      '<span id="vpw-toggle" style="margin-left:4px;color:#94a3b8;font-weight:700">+</span>';
    header.addEventListener('click', function () {
      state.expanded = !state.expanded;
      body.style.display = state.expanded ? 'block' : 'none';
      document.getElementById('vpw-toggle').textContent = state.expanded ? '−' : '+';
    });

    body = document.createElement('div');
    body.id = 'vpw-body';
    body.style.cssText = 'display:none;padding:6px 8px;border-top:1px solid rgba(255,255,255,0.06)';

    root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);
    badge = document.getElementById('vpw-badge');
  }

  function row(label, value, color) {
    return '<div style="display:flex;justify-content:space-between;gap:10px;padding:1px 0">' +
           '<span style="color:#94a3b8">' + label + '</span>' +
           '<span style="color:' + (color || '#e2e8f0') + ';font-variant-numeric:tabular-nums">' + value + '</span>' +
           '</div>';
  }

  function fpsColor(f) { return f >= 50 ? '#22c55e' : f >= 30 ? '#eab308' : '#ef4444'; }
  function heapColor() {
    if (!state.heapLimit) return '#e2e8f0';
    var pct = state.heapUsed / state.heapLimit;
    return pct < 0.6 ? '#22c55e' : pct < 0.85 ? '#eab308' : '#ef4444';
  }

  function render() {
    if (!root) return;
    if (badge) badge.style.color = state.online ? '#22c55e' : '#ef4444';
    if (!state.expanded) return;
    sampleHeap();
    var heapTxt = state.heapLimit
      ? state.heapUsed + ' / ' + state.heapLimit + ' MB'
      : 'n/a';
    body.innerHTML =
      row('FPS',     state.fps,                 fpsColor(state.fps)) +
      row('Heap',    heapTxt,                   heapColor()) +
      row('Net',     'online: ' + (state.online ? 'yes' : 'no'),
                                                state.online ? '#22c55e' : '#ef4444') +
      row('Slow ops (>50ms)', state.slowOps,    state.slowOps > 5 ? '#eab308' : '#e2e8f0') +
      row('Requests',state.netCount,            '#e2e8f0');
  }

  function start() {
    buildUI();
    render();
    setInterval(render, 1000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 0);
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }

  // ---------- public API ----------
  window.VolvixPerfWidget = {
    metrics: function () { sampleHeap(); return Object.assign({}, state); },
    show: function () { if (root) root.style.display = ''; },
    hide: function () { if (root) root.style.display = 'none'; },
    reset: function () { state.slowOps = 0; state.netCount = 0; render(); },
  };
})();
