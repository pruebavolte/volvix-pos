/* ============================================================
 * Volvix Intro Tour Wiring (R12-O-5-C)
 * Self-contained interactive tour engine. No external deps.
 * Triggers:
 *   - URL param ?tour=<tour-id>
 *   - window.VolvixIntroTour.start('<tour-id>')
 *   - "Help" button on topbar (window.VolvixIntroTour.openMenu())
 * Persists completion in localStorage (volvix_tour_<id>_done).
 * ============================================================ */
(function () {
  'use strict';

  if (window.VolvixIntroTour) return; // idempotent

  // ---------- Lazy gate: only activate if needed ----------
  var qs = (function () {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return { get: function () { return null; } };
    }
  })();
  var requestedTour = qs.get && qs.get('tour');
  var firstLogin = false;
  try {
    firstLogin = localStorage.getItem('volvix_first_login_pending') === '1';
  } catch (e) {}

  var shouldActivate = !!requestedTour || firstLogin || true; // engine always defined; assets lazy

  // ---------- CSS injection (one-time) ----------
  function injectCSS() {
    if (document.getElementById('volvix-intro-tour-css')) return;
    var style = document.createElement('style');
    style.id = 'volvix-intro-tour-css';
    style.textContent =
      '@keyframes volvixTourFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '@keyframes volvixTourPulse{0%,100%{box-shadow:0 0 0 3px rgba(99,102,241,.85),0 0 0 9999px rgba(0,0,0,.55)}50%{box-shadow:0 0 0 6px rgba(99,102,241,.55),0 0 0 9999px rgba(0,0,0,.55)}}' +
      '.volvix-tour-highlight{position:relative!important;z-index:99999!important;border-radius:6px!important;animation:volvixTourPulse 1.6s ease-in-out infinite;transition:box-shadow .25s ease}' +
      '#volvix-tour-tooltip{position:fixed;background:#1e293b;color:#fff;padding:18px 20px;border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.4);z-index:100000;max-width:340px;min-width:260px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;animation:volvixTourFadeIn .25s ease-out}' +
      '#volvix-tour-tooltip .t-content h3{margin:0 0 8px;font-size:16px;font-weight:600;color:#fff}' +
      '#volvix-tour-tooltip .t-content p{margin:0 0 14px;color:#cbd5e1}' +
      '#volvix-tour-tooltip .t-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '#volvix-tour-tooltip .t-actions button{background:#6366f1;color:#fff;border:0;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:background .15s ease}' +
      '#volvix-tour-tooltip .t-actions button:hover{background:#4f46e5}' +
      '#volvix-tour-tooltip .t-actions button.t-secondary{background:#475569}' +
      '#volvix-tour-tooltip .t-actions button.t-secondary:hover{background:#334155}' +
      '#volvix-tour-tooltip .t-actions button.t-skip{background:transparent;color:#94a3b8;padding:7px 8px}' +
      '#volvix-tour-tooltip .t-actions button.t-skip:hover{color:#fff;background:rgba(255,255,255,.08)}' +
      '#volvix-tour-tooltip .t-counter{margin-left:auto;color:#94a3b8;font-size:12px;font-weight:500}' +
      '#volvix-tour-tooltip .t-arrow{position:absolute;width:12px;height:12px;background:#1e293b;transform:rotate(45deg)}' +
      '#volvix-tour-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;animation:volvixTourFadeIn .2s ease-out}' +
      '#volvix-tour-menu{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;color:#0f172a;padding:24px;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);z-index:100001;max-width:480px;width:92%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:volvixTourFadeIn .25s ease-out}' +
      '#volvix-tour-menu h2{margin:0 0 12px;font-size:20px}' +
      '#volvix-tour-menu .t-list{display:flex;flex-direction:column;gap:8px;margin:14px 0}' +
      '#volvix-tour-menu .t-item{padding:12px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;transition:all .15s ease;display:flex;justify-content:space-between;align-items:center}' +
      '#volvix-tour-menu .t-item:hover{border-color:#6366f1;background:#f8fafc}' +
      '#volvix-tour-menu .t-item .t-info strong{display:block;color:#0f172a;font-size:14px;margin-bottom:2px}' +
      '#volvix-tour-menu .t-item .t-info span{color:#64748b;font-size:12px}' +
      '#volvix-tour-menu .t-item .t-done{color:#10b981;font-size:18px}' +
      '#volvix-tour-menu .t-close{background:#e2e8f0;color:#0f172a;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;float:right;margin-top:8px;font-size:13px}' +
      '@media (max-width: 600px){#volvix-tour-tooltip{position:fixed!important;left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;max-width:none}}';
    document.head.appendChild(style);
  }

  // ---------- Engine ----------
  window.VolvixIntroTour = {
    activeTour: null,
    tours: {},
    _loaded: false,

    /** Load tour configurations from JSON file (idempotent). */
    loadConfig: function (cb) {
      var self = this;
      if (this._loaded) { if (cb) cb(); return; }
      try {
        fetch('/intro-tour-config.json', { cache: 'no-store' })
          .then(function (r) {
            if (!r.ok) throw new Error('cfg http ' + r.status);
            return r.json();
          })
          .then(function (data) {
            if (data && data.tours) {
              for (var k in data.tours) {
                if (Object.prototype.hasOwnProperty.call(data.tours, k)) {
                  self.tours[k] = data.tours[k];
                }
              }
            }
            self._loaded = true;
            if (cb) cb();
          })
          .catch(function (err) {
            console.warn('[VolvixIntroTour] cannot load config:', err);
            self._loaded = true;
            if (cb) cb();
          });
      } catch (e) {
        self._loaded = true;
        if (cb) cb();
      }
    },

    /** Mark tour completion in localStorage. */
    markDone: function (tourId) {
      try { localStorage.setItem('volvix_tour_' + tourId + '_done', '1'); } catch (e) {}
    },

    isDone: function (tourId) {
      try { return localStorage.getItem('volvix_tour_' + tourId + '_done') === '1'; } catch (e) { return false; }
    },

    /** Start a tour by id. Options: { force: true } skips done-check. */
    start: function (tourId, options) {
      var self = this;
      options = options || {};
      var go = function () {
        var config = self.tours[tourId];
        if (!config) {
          console.error('[VolvixIntroTour] Tour not found:', tourId);
          return;
        }
        if (!options.force && self.isDone(tourId)) {
          console.info('[VolvixIntroTour] Tour already completed:', tourId);
          return;
        }
        if (self.activeTour) self.cleanup();
        injectCSS();
        self.activeTour = { id: tourId, config: config, currentStep: 0 };
        self._renderBackdrop();
        self.showStep(0);
      };
      if (!this._loaded) this.loadConfig(go); else go();
    },

    _renderBackdrop: function () {
      if (document.getElementById('volvix-tour-backdrop')) return;
      var bd = document.createElement('div');
      bd.id = 'volvix-tour-backdrop';
      bd.addEventListener('click', function (e) { e.stopPropagation(); });
      document.body.appendChild(bd);
    },

    showStep: function (idx) {
      if (!this.activeTour) return;
      var steps = this.activeTour.config.steps || [];
      if (idx < 0 || idx >= steps.length) { this._finish(); return; }
      this.activeTour.currentStep = idx;
      this._clearHighlight();
      this._removeTooltip();

      var step = steps[idx];
      var target = step.target ? document.querySelector(step.target) : null;

      if (!target) {
        // Centered tooltip with no target
        this.showTooltip(null, step);
        return;
      }
      // Scroll into view smoothly
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}

      // Highlight (preserve original styles for restore)
      target.dataset._volvixTourPos = target.style.position || '';
      target.dataset._volvixTourZ = target.style.zIndex || '';
      if (!target.style.position || target.style.position === 'static') {
        target.style.position = 'relative';
      }
      target.classList.add('volvix-tour-highlight');
      this.activeTour._highlighted = target;

      // Slight delay so scroll completes
      var self = this;
      setTimeout(function () { self.showTooltip(target, step); }, 220);
    },

    showTooltip: function (target, step) {
      var tip = document.createElement('div');
      tip.id = 'volvix-tour-tooltip';
      var total = (this.activeTour.config.steps || []).length;
      var current = this.activeTour.currentStep + 1;
      var isLast = current >= total;
      var isFirst = current <= 1;

      tip.innerHTML =
        '<div class="t-content">' +
          '<h3></h3>' +
          '<p></p>' +
        '</div>' +
        '<div class="t-actions">' +
          (isFirst ? '' : '<button type="button" class="t-secondary" data-act="prev">&larr; Atras</button>') +
          '<button type="button" data-act="next">' + (isLast ? 'Finalizar' : 'Siguiente &rarr;') + '</button>' +
          '<span class="t-counter">' + current + '/' + total + '</span>' +
          '<button type="button" class="t-skip" data-act="skip" aria-label="Cerrar">&times; Saltar</button>' +
        '</div>';

      // Safe text injection (avoid XSS via title/text in JSON)
      tip.querySelector('h3').textContent = String(step.title || '');
      tip.querySelector('p').textContent = String(step.text || '');

      document.body.appendChild(tip);

      // Position
      this._positionTooltip(tip, target, step.placement);

      // Wire actions
      var self = this;
      tip.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        if (act === 'next') self.next();
        else if (act === 'prev') self.prev();
        else if (act === 'skip') self.skip();
      });
    },

    _positionTooltip: function (tip, target, placement) {
      var vw = window.innerWidth, vh = window.innerHeight;
      var isMobile = vw <= 600;
      if (isMobile || !target) {
        if (!target) {
          tip.style.top = '50%';
          tip.style.left = '50%';
          tip.style.transform = 'translate(-50%,-50%)';
        }
        return; // CSS @media handles mobile
      }
      var rect = target.getBoundingClientRect();
      var tipRect = tip.getBoundingClientRect();
      var gap = 12;
      var top, left;
      var place = placement || 'bottom';
      if (place === 'top') {
        top = rect.top - tipRect.height - gap;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
      } else if (place === 'left') {
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - gap;
      } else if (place === 'right') {
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + gap;
      } else {
        top = rect.bottom + gap;
        left = rect.left;
      }
      // Clamp
      if (left < 8) left = 8;
      if (left + tipRect.width > vw - 8) left = vw - tipRect.width - 8;
      if (top < 8) top = 8;
      if (top + tipRect.height > vh - 8) top = vh - tipRect.height - 8;
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    },

    next: function () {
      if (!this.activeTour) return;
      var n = this.activeTour.currentStep + 1;
      var total = (this.activeTour.config.steps || []).length;
      if (n >= total) { this._finish(); return; }
      this.showStep(n);
    },

    prev: function () {
      if (!this.activeTour) return;
      var p = this.activeTour.currentStep - 1;
      if (p < 0) p = 0;
      this.showStep(p);
    },

    skip: function () {
      if (!this.activeTour) return;
      // Skip does NOT mark done — user can re-trigger
      this.cleanup();
    },

    _finish: function () {
      if (!this.activeTour) return;
      this.markDone(this.activeTour.id);
      try {
        if (typeof this.activeTour.config.onComplete === 'string') {
          // hook reserved for future
        }
      } catch (e) {}
      this.cleanup();
    },

    _clearHighlight: function () {
      if (!this.activeTour) return;
      var el = this.activeTour._highlighted;
      if (el) {
        el.classList.remove('volvix-tour-highlight');
        if ('_volvixTourPos' in el.dataset) {
          el.style.position = el.dataset._volvixTourPos || '';
          delete el.dataset._volvixTourPos;
        }
        if ('_volvixTourZ' in el.dataset) {
          el.style.zIndex = el.dataset._volvixTourZ || '';
          delete el.dataset._volvixTourZ;
        }
      }
      this.activeTour._highlighted = null;
    },

    _removeTooltip: function () {
      var t = document.getElementById('volvix-tour-tooltip');
      if (t && t.parentNode) t.parentNode.removeChild(t);
    },

    _removeBackdrop: function () {
      var b = document.getElementById('volvix-tour-backdrop');
      if (b && b.parentNode) b.parentNode.removeChild(b);
    },

    cleanup: function () {
      this._clearHighlight();
      this._removeTooltip();
      this._removeBackdrop();
      this.activeTour = null;
    },

    /** Open the menu of available tours (Help button). */
    openMenu: function () {
      var self = this;
      var go = function () {
        injectCSS();
        // Remove any existing menu
        var prev = document.getElementById('volvix-tour-menu');
        if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        var prevBd = document.getElementById('volvix-tour-backdrop');
        if (prevBd && prevBd.parentNode) prevBd.parentNode.removeChild(prevBd);

        self._renderBackdrop();
        var menu = document.createElement('div');
        menu.id = 'volvix-tour-menu';
        var listHtml = '';
        var ids = Object.keys(self.tours);
        if (!ids.length) {
          listHtml = '<p style="color:#64748b">No hay tours disponibles.</p>';
        } else {
          listHtml = '<div class="t-list">';
          ids.forEach(function (id) {
            var cfg = self.tours[id];
            var done = self.isDone(id);
            listHtml +=
              '<div class="t-item" data-tour="' + id + '">' +
                '<div class="t-info">' +
                  '<strong></strong>' +
                  '<span></span>' +
                '</div>' +
                (done ? '<span class="t-done" title="Completado">&#10003;</span>' : '') +
              '</div>';
          });
          listHtml += '</div>';
        }
        menu.innerHTML =
          '<h2>Tours disponibles</h2>' +
          '<p style="color:#64748b;margin:0;font-size:13px">Elige un tour para empezar</p>' +
          listHtml +
          '<button type="button" class="t-close" data-act="close">Cerrar</button>';

        // Safely fill names/descriptions
        var idx = 0;
        ids.forEach(function (id) {
          var item = menu.querySelectorAll('.t-item')[idx];
          if (!item) return;
          item.querySelector('strong').textContent = self.tours[id].name || id;
          item.querySelector('span').textContent = self.tours[id].description || '';
          idx++;
        });

        document.body.appendChild(menu);
        menu.addEventListener('click', function (ev) {
          var item = ev.target.closest('.t-item');
          if (item) {
            var tid = item.getAttribute('data-tour');
            self._closeMenu();
            self.start(tid, { force: true });
            return;
          }
          var btn = ev.target.closest('button[data-act="close"]');
          if (btn) self._closeMenu();
        });
        // Backdrop click closes menu
        var bd = document.getElementById('volvix-tour-backdrop');
        if (bd) bd.addEventListener('click', function () { self._closeMenu(); });
      };
      if (!this._loaded) this.loadConfig(go); else go();
    },

    _closeMenu: function () {
      var m = document.getElementById('volvix-tour-menu');
      if (m && m.parentNode) m.parentNode.removeChild(m);
      this._removeBackdrop();
    },

    /** Bootstrap: respond to ?tour=... param after DOM ready. */
    _autoStart: function () {
      var self = this;
      var maybeStart = function () {
        if (!requestedTour) return;
        // Ensure config first
        self.loadConfig(function () {
          self.start(requestedTour, { force: true });
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeStart);
      } else {
        maybeStart();
      }
    },
  };

  // ---------- ESC key to skip ----------
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && window.VolvixIntroTour && window.VolvixIntroTour.activeTour) {
      window.VolvixIntroTour.skip();
    }
  });

  // ---------- Reposition on resize/scroll while active ----------
  var _repositionTimer = null;
  function _reposition() {
    if (!window.VolvixIntroTour.activeTour) return;
    var tip = document.getElementById('volvix-tour-tooltip');
    var tgt = window.VolvixIntroTour.activeTour._highlighted;
    if (!tip) return;
    var step = window.VolvixIntroTour.activeTour.config.steps[
      window.VolvixIntroTour.activeTour.currentStep
    ];
    window.VolvixIntroTour._positionTooltip(tip, tgt, step && step.placement);
  }
  window.addEventListener('resize', function () {
    if (_repositionTimer) clearTimeout(_repositionTimer);
    _repositionTimer = setTimeout(_reposition, 80);
  });
  window.addEventListener('scroll', function () {
    if (_repositionTimer) clearTimeout(_repositionTimer);
    _repositionTimer = setTimeout(_reposition, 50);
  }, true);

  // ---------- Lazy load config + auto-start ----------
  if (shouldActivate) {
    // Preload config so openMenu() is instant; but only fetch when document ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.VolvixIntroTour.loadConfig();
      });
    } else {
      window.VolvixIntroTour.loadConfig();
    }
    window.VolvixIntroTour._autoStart();
  }
})();
