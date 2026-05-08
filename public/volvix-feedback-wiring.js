/**
 * volvix-feedback-wiring.js
 * Volvix POS - Customer Feedback Widget
 * Agent-45 / Ronda 8 Fibonacci
 *
 * Features:
 *  1. Floating feedback button
 *  2. Smile/sad face rating
 *  3. Comment box
 *  4. Screenshot annotation (canvas-based draw layer)
 *  5. Auto-capture URL/page metadata
 *  6. Browser/OS info detection
 *  7. Send to backend (configurable endpoint)
 *  8. Thank-you screen
 *  9. Roadmap features list with voting
 * 10. Public window.FeedbackAPI
 */

(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────────
  // Configuration
  // ───────────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    endpoint: '/api/feedback',
    roadmapEndpoint: '/api/roadmap',
    voteEndpoint: '/api/roadmap/vote',
    appName: 'Volvix POS',
    version: '3.4.0',
    primaryColor: '#2563eb',
    accentColor: '#10b981',
    position: 'bottom-right',
    storageKey: 'volvix_feedback_state',
    autoOpen: false,
    captureScreenshot: true,
    showRoadmap: true,
    locale: 'es'
  };

  const TEXT = {
    es: {
      buttonLabel: 'Feedback',
      title: '¿Cómo te fue?',
      subtitle: 'Tu opinión nos ayuda a mejorar Volvix POS',
      ratingHappy: 'Excelente',
      ratingNeutral: 'Regular',
      ratingSad: 'Mal',
      commentPlaceholder: 'Cuéntanos qué te pareció (opcional)...',
      screenshotLabel: 'Adjuntar captura de pantalla',
      annotateLabel: 'Anotar captura',
      sendButton: 'Enviar',
      cancelButton: 'Cancelar',
      thankYouTitle: '¡Gracias!',
      thankYouMessage: 'Hemos recibido tu opinión.',
      closeLabel: 'Cerrar',
      roadmapTitle: 'Próximas funciones',
      roadmapSubtitle: 'Vota por las que más te gustan',
      voteLabel: 'Votar',
      votedLabel: 'Votado',
      tabFeedback: 'Feedback',
      tabRoadmap: 'Roadmap',
      sendingLabel: 'Enviando...',
      errorLabel: 'Error al enviar. Reintenta.'
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Utilities
  // ───────────────────────────────────────────────────────────────
  function uuid() {
    return 'fb-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
  }

  function $(tag, props, children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'style' && typeof props[k] === 'object') {
          Object.assign(el.style, props[k]);
        } else if (k === 'class') {
          el.className = props[k];
        } else if (k.startsWith('on') && typeof props[k] === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k === 'html') {
          el.innerHTML = props[k];
        } else {
          el.setAttribute(k, props[k]);
        }
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        el.appendChild(typeof c === 'string'
          ? document.createTextNode(c)
          : c);
      });
    }
    return el;
  }

  function detectBrowser() {
    const ua = navigator.userAgent;
    let name = 'Unknown', version = '';
    const tests = [
      ['Edge', /Edg\/([\d.]+)/],
      ['Opera', /OPR\/([\d.]+)/],
      ['Chrome', /Chrome\/([\d.]+)/],
      ['Firefox', /Firefox\/([\d.]+)/],
      ['Safari', /Version\/([\d.]+).*Safari/],
      ['IE', /MSIE ([\d.]+)/]
    ];
    for (const [n, rx] of tests) {
      const m = ua.match(rx);
      if (m) { name = n; version = m[1]; break; }
    }
    return { name, version, userAgent: ua };
  }

  function detectOS() {
    const ua = navigator.userAgent;
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
    if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
    if (/Mac OS X ([\d_.]+)/.test(ua)) return 'macOS ' + RegExp.$1.replace(/_/g, '.');
    if (/Android ([\d.]+)/.test(ua)) return 'Android ' + RegExp.$1;
    if (/iPhone OS ([\d_]+)/.test(ua)) return 'iOS ' + RegExp.$1.replace(/_/g, '.');
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  function captureContext() {
    return {
      url: location.href,
      path: location.pathname,
      title: document.title,
      referrer: document.referrer || null,
      viewport: { w: innerWidth, h: innerHeight },
      screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio || 1 },
      browser: detectBrowser(),
      os: detectOS(),
      language: navigator.language,
      online: navigator.onLine,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString()
    };
  }

  // ───────────────────────────────────────────────────────────────
  // Screenshot capture (DOM rasterization fallback + html2canvas hook)
  // ───────────────────────────────────────────────────────────────
  function captureScreenshot() {
    return new Promise((resolve) => {
      if (global.html2canvas) {
        global.html2canvas(document.body, {
          logging: false,
          useCORS: true,
          scale: 0.6
        }).then(c => resolve(c.toDataURL('image/png')))
          .catch(() => resolve(null));
        return;
      }
      // Fallback: SVG-foreignObject snapshot
      try {
        const w = innerWidth, h = innerHeight;
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
          '<foreignObject width="100%" height="100%">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" style="font:14px sans-serif;color:#333;padding:8px;">' +
          'Snapshot ' + new Date().toISOString() + ' — ' + location.href +
          '</div></foreignObject></svg>';
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = url;
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ───────────────────────────────────────────────────────────────
  // Annotation canvas
  // ───────────────────────────────────────────────────────────────
  class AnnotationLayer {
    constructor(imgDataUrl, host) {
      this.dataUrl = imgDataUrl;
      this.host = host;
      this.canvas = $('canvas', { class: 'vfb-annot-canvas' });
      this.ctx = this.canvas.getContext('2d');
      this.drawing = false;
      this.color = '#ef4444';
      this.lineWidth = 3;
      this.history = [];
      this._mount();
    }

    _mount() {
      const img = new Image();
      img.onload = () => {
        const maxW = 480;
        const ratio = Math.min(1, maxW / img.width);
        this.canvas.width = img.width * ratio;
        this.canvas.height = img.height * ratio;
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      };
      img.src = this.dataUrl;
      this.host.appendChild(this.canvas);
      this._wireEvents();
    }

    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return {
        x: (t.clientX - r.left) * (this.canvas.width / r.width),
        y: (t.clientY - r.top) * (this.canvas.height / r.height)
      };
    }

    _wireEvents() {
      const start = (e) => {
        e.preventDefault();
        this.drawing = true;
        const p = this._pos(e);
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
      };
      const move = (e) => {
        if (!this.drawing) return;
        e.preventDefault();
        const p = this._pos(e);
        this.ctx.lineTo(p.x, p.y);
        this.ctx.stroke();
      };
      const end = () => {
        if (!this.drawing) return;
        this.drawing = false;
        this.history.push(
          this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
        );
        if (this.history.length > 25) this.history.shift();
      };
      this.canvas.addEventListener('mousedown', start);
      this.canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      this.canvas.addEventListener('touchstart', start, { passive: false });
      this.canvas.addEventListener('touchmove', move, { passive: false });
      this.canvas.addEventListener('touchend', end);
    }

    setColor(c) { this.color = c; }
    setWidth(w) { this.lineWidth = w; }

    undo() {
      if (this.history.length > 1) {
        this.history.pop();
        this.ctx.putImageData(this.history[this.history.length - 1], 0, 0);
      }
    }

    clear() {
      const img = new Image();
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        this.history = [this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)];
      };
      img.src = this.dataUrl;
    }

    export() {
      return this.canvas.toDataURL('image/png');
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Styles
  // ───────────────────────────────────────────────────────────────
  function injectStyles(cfg) {
    if (document.getElementById('vfb-styles')) return;
    const css = `
      .vfb-btn {
        position: fixed; ${cfg.position.includes('bottom') ? 'bottom:20px;' : 'top:20px;'}
        ${cfg.position.includes('right') ? 'right:20px;' : 'left:20px;'}
        z-index: 999998;
        background: ${cfg.primaryColor};
        color: #fff; border: none; border-radius: 50px;
        padding: 12px 20px; font: 600 14px system-ui,sans-serif;
        cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18);
        display: flex; align-items: center; gap: 8px;
        transition: transform .15s ease, box-shadow .15s ease;
      }
      .vfb-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,.25); }
      .vfb-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(15,23,42,.55); backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center;
        animation: vfb-fade .18s ease;
      }
      @keyframes vfb-fade { from {opacity:0} to {opacity:1} }
      .vfb-modal {
        background: #fff; border-radius: 14px; width: 520px; max-width: 92vw;
        max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 20px 60px rgba(0,0,0,.35);
      }
      .vfb-tabs { display: flex; border-bottom: 1px solid #e5e7eb; }
      .vfb-tab {
        flex: 1; padding: 12px; background: none; border: none; cursor: pointer;
        font: 600 13px system-ui; color: #64748b;
      }
      .vfb-tab.active { color: ${cfg.primaryColor}; box-shadow: inset 0 -2px 0 ${cfg.primaryColor}; }
      .vfb-body { padding: 20px; overflow-y: auto; }
      .vfb-title { font: 700 18px system-ui; margin: 0 0 4px; color: #0f172a; }
      .vfb-sub { color: #64748b; font-size: 13px; margin: 0 0 16px; }
      .vfb-rating { display: flex; gap: 10px; justify-content: center; margin: 16px 0; }
      .vfb-face {
        width: 56px; height: 56px; border-radius: 50%; border: 2px solid #e5e7eb;
        background: #fff; cursor: pointer; font-size: 28px;
        transition: all .15s; display: flex; align-items: center; justify-content: center;
      }
      .vfb-face:hover { transform: scale(1.1); }
      .vfb-face.selected { border-color: ${cfg.primaryColor}; background: #eff6ff; }
      .vfb-textarea {
        width: 100%; min-height: 80px; padding: 10px; border-radius: 8px;
        border: 1px solid #e5e7eb; font: 14px system-ui; resize: vertical;
        box-sizing: border-box;
      }
      .vfb-textarea:focus { outline: none; border-color: ${cfg.primaryColor}; }
      .vfb-row { display: flex; gap: 8px; margin: 12px 0; align-items: center; }
      .vfb-checkbox { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #475569; }
      .vfb-actions { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 20px; border-top: 1px solid #e5e7eb; background:#f8fafc; }
      .vfb-action-btn {
        padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer;
        font: 600 13px system-ui;
      }
      .vfb-primary { background: ${cfg.primaryColor}; color: #fff; }
      .vfb-primary:disabled { opacity: .5; cursor: not-allowed; }
      .vfb-secondary { background: #fff; color: #475569; border: 1px solid #e5e7eb; }
      .vfb-annot-host { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px; background:#f8fafc; }
      .vfb-annot-canvas { width: 100%; cursor: crosshair; border-radius: 4px; display:block; }
      .vfb-annot-tools { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
      .vfb-color-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow:0 0 0 1px #cbd5e1; cursor:pointer; }
      .vfb-color-dot.active { box-shadow: 0 0 0 2px ${cfg.primaryColor}; }
      .vfb-thanks { padding: 32px; text-align: center; }
      .vfb-thanks-icon { font-size: 56px; margin-bottom: 8px; }
      .vfb-roadmap-item {
        border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px;
        display: flex; gap: 12px; align-items: flex-start;
      }
      .vfb-vote-btn {
        background: ${cfg.accentColor}; color: #fff; border: none; padding: 6px 12px;
        border-radius: 6px; cursor: pointer; font: 600 12px system-ui; flex-shrink:0;
      }
      .vfb-vote-btn.voted { background: #94a3b8; cursor: default; }
      .vfb-roadmap-meta { font-size: 12px; color: #64748b; margin-top: 4px; }
      .vfb-tag { display:inline-block; padding:2px 8px; border-radius:10px; background:#eff6ff; color:${cfg.primaryColor}; font-size:11px; font-weight:600; }
      .vfb-error { color:#dc2626; font-size:12px; margin-top:6px; }
    `;
    const tag = $('style', { id: 'vfb-styles' });
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ───────────────────────────────────────────────────────────────
  // Storage
  // ───────────────────────────────────────────────────────────────
  function loadState(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }
  function saveState(key, state) {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }

  // ───────────────────────────────────────────────────────────────
  // Widget
  // ───────────────────────────────────────────────────────────────
  class FeedbackWidget {
    constructor(userConfig) {
      this.cfg = Object.assign({}, DEFAULT_CONFIG, userConfig || {});
      this.t = TEXT[this.cfg.locale] || TEXT.es;
      this.state = loadState(this.cfg.storageKey);
      this.state.votes = this.state.votes || {};
      this.rating = null;
      this.screenshot = null;
      this.annotated = null;
      this.annotation = null;
      this.activeTab = 'feedback';
      this.roadmapCache = null;
      this.listeners = { open: [], close: [], submit: [], vote: [] };
      injectStyles(this.cfg);
      this._renderButton();
      if (this.cfg.autoOpen) this.open();
    }

    on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); return this; }
    _emit(evt, data) { (this.listeners[evt] || []).forEach(fn => { try { fn(data); } catch {} }); }

    _renderButton() {
      // 2026-05-07 cleanup: FAB deshabilitado, gateado por feature flag.
      // Para re-habilitar: window.VOLVIX_FEEDBACK_FAB = true antes de cargar.
      if (window.VOLVIX_FEEDBACK_FAB !== true) return;
      this.button = $('button', {
        class: 'vfb-btn',
        'aria-label': this.t.buttonLabel,
        onclick: () => this.open()
      }, [
        $('span', { html: '&#128172;' }),
        $('span', null, this.t.buttonLabel)
      ]);
      document.body.appendChild(this.button);
    }

    open() {
      if (this.overlay) return;
      this._emit('open');
      this.overlay = $('div', { class: 'vfb-overlay', onclick: (e) => {
        if (e.target === this.overlay) this.close();
      }});
      this.modal = $('div', { class: 'vfb-modal', role: 'dialog', 'aria-modal': 'true' });
      this.overlay.appendChild(this.modal);
      this._renderTabs();
      this._renderActiveTab();
      document.body.appendChild(this.overlay);
      document.addEventListener('keydown', this._onKey = (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    close() {
      if (!this.overlay) return;
      this.overlay.remove();
      this.overlay = null;
      this.modal = null;
      this.rating = null;
      this.screenshot = null;
      this.annotation = null;
      this.annotated = null;
      document.removeEventListener('keydown', this._onKey);
      this._emit('close');
    }

    _renderTabs() {
      const tabs = $('div', { class: 'vfb-tabs' });
      const mkTab = (id, label) => $('button', {
        class: 'vfb-tab' + (this.activeTab === id ? ' active' : ''),
        onclick: () => { this.activeTab = id; this._refresh(); }
      }, label);
      tabs.appendChild(mkTab('feedback', this.t.tabFeedback));
      if (this.cfg.showRoadmap) tabs.appendChild(mkTab('roadmap', this.t.tabRoadmap));
      this.modal.appendChild(tabs);
    }

    _refresh() {
      while (this.modal.firstChild) this.modal.removeChild(this.modal.firstChild);
      this._renderTabs();
      this._renderActiveTab();
    }

    _renderActiveTab() {
      if (this.activeTab === 'roadmap') return this._renderRoadmap();
      this._renderFeedback();
    }

    _renderFeedback() {
      const body = $('div', { class: 'vfb-body' });
      body.appendChild($('h3', { class: 'vfb-title' }, this.t.title));
      body.appendChild($('p', { class: 'vfb-sub' }, this.t.subtitle));

      const ratingRow = $('div', { class: 'vfb-rating' });
      const faces = [
        { key: 'sad', emoji: '😞', label: this.t.ratingSad },
        { key: 'neutral', emoji: '😐', label: this.t.ratingNeutral },
        { key: 'happy', emoji: '😊', label: this.t.ratingHappy }
      ];
      faces.forEach(f => {
        const b = $('button', {
          class: 'vfb-face' + (this.rating === f.key ? ' selected' : ''),
          title: f.label,
          'aria-label': f.label,
          onclick: () => { this.rating = f.key; this._refresh(); }
        }, f.emoji);
        ratingRow.appendChild(b);
      });
      body.appendChild(ratingRow);

      this.commentEl = $('textarea', {
        class: 'vfb-textarea',
        placeholder: this.t.commentPlaceholder
      });
      body.appendChild(this.commentEl);

      const row = $('div', { class: 'vfb-row' });
      this.shotCheckbox = $('input', { type: 'checkbox' });
      this.shotCheckbox.checked = !!this.cfg.captureScreenshot;
      const lbl = $('label', { class: 'vfb-checkbox' }, [this.shotCheckbox, this.t.screenshotLabel]);
      const annotateBtn = $('button', {
        class: 'vfb-action-btn vfb-secondary',
        onclick: () => this._startAnnotate()
      }, this.t.annotateLabel);
      row.appendChild(lbl);
      row.appendChild(annotateBtn);
      body.appendChild(row);

      this.annotHost = $('div', { class: 'vfb-annot-host', style: { display: 'none' } });
      body.appendChild(this.annotHost);

      this.errorEl = $('div', { class: 'vfb-error', style: { display: 'none' } });
      body.appendChild(this.errorEl);

      this.modal.appendChild(body);

      const actions = $('div', { class: 'vfb-actions' });
      actions.appendChild($('button', {
        class: 'vfb-action-btn vfb-secondary',
        onclick: () => this.close()
      }, this.t.cancelButton));
      this.sendBtn = $('button', {
        class: 'vfb-action-btn vfb-primary',
        onclick: () => this._submit()
      }, this.t.sendButton);
      actions.appendChild(this.sendBtn);
      this.modal.appendChild(actions);
    }

    async _startAnnotate() {
      this.annotHost.style.display = 'block';
      this.annotHost.textContent = '...';
      const img = await captureScreenshot();
      this.screenshot = img;
      this.annotHost.textContent = '';
      if (!img) {
        this.annotHost.appendChild($('div', { class: 'vfb-error' }, 'No se pudo capturar la pantalla.'));
        return;
      }
      this.annotation = new AnnotationLayer(img, this.annotHost);
      const tools = $('div', { class: 'vfb-annot-tools' });
      ['#ef4444', '#f59e0b', '#10b981', '#2563eb', '#0f172a'].forEach((c, i) => {
        const dot = $('button', {
          class: 'vfb-color-dot' + (i === 0 ? ' active' : ''),
          style: { background: c },
          onclick: () => {
            this.annotation.setColor(c);
            tools.querySelectorAll('.vfb-color-dot').forEach(x => x.classList.remove('active'));
            dot.classList.add('active');
          }
        });
        tools.appendChild(dot);
      });
      tools.appendChild($('button', {
        class: 'vfb-action-btn vfb-secondary',
        onclick: () => this.annotation.undo()
      }, 'Deshacer'));
      tools.appendChild($('button', {
        class: 'vfb-action-btn vfb-secondary',
        onclick: () => this.annotation.clear()
      }, 'Limpiar'));
      this.annotHost.appendChild(tools);
    }

    async _submit() {
      if (!this.rating) {
        this.errorEl.textContent = 'Selecciona una calificación.';
        this.errorEl.style.display = 'block';
        return;
      }
      this.sendBtn.disabled = true;
      this.sendBtn.textContent = this.t.sendingLabel;

      let shot = null;
      if (this.shotCheckbox && this.shotCheckbox.checked) {
        shot = this.annotation ? this.annotation.export() : (this.screenshot || await captureScreenshot());
      }

      const payload = {
        id: uuid(),
        app: this.cfg.appName,
        version: this.cfg.version,
        rating: this.rating,
        comment: (this.commentEl && this.commentEl.value || '').slice(0, 4000),
        screenshot: shot,
        context: captureContext(),
        user: this.cfg.user || null
      };

      try {
        const res = await fetch(this.cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this._emit('submit', payload);
        this._renderThanks();
      } catch (err) {
        // Queue offline
        const queue = this.state.queue || [];
        queue.push(payload);
        this.state.queue = queue.slice(-20);
        saveState(this.cfg.storageKey, this.state);
        this.errorEl.textContent = this.t.errorLabel + ' (encolado)';
        this.errorEl.style.display = 'block';
        this.sendBtn.disabled = false;
        this.sendBtn.textContent = this.t.sendButton;
      }
    }

    _renderThanks() {
      while (this.modal.firstChild) this.modal.removeChild(this.modal.firstChild);
      const wrap = $('div', { class: 'vfb-thanks' }, [
        $('div', { class: 'vfb-thanks-icon' }, '🎉'),
        $('h3', { class: 'vfb-title' }, this.t.thankYouTitle),
        $('p', { class: 'vfb-sub' }, this.t.thankYouMessage),
        $('button', {
          class: 'vfb-action-btn vfb-primary',
          style: { marginTop: '12px' },
          onclick: () => this.close()
        }, this.t.closeLabel)
      ]);
      this.modal.appendChild(wrap);
      this._flushQueue();
    }

    async _flushQueue() {
      const q = (this.state.queue || []).slice();
      if (!q.length) return;
      const remaining = [];
      for (const item of q) {
        try {
          const r = await fetch(this.cfg.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          });
          if (!r.ok) remaining.push(item);
        } catch { remaining.push(item); }
      }
      this.state.queue = remaining;
      saveState(this.cfg.storageKey, this.state);
    }

    async _renderRoadmap() {
      const body = $('div', { class: 'vfb-body' });
      body.appendChild($('h3', { class: 'vfb-title' }, this.t.roadmapTitle));
      body.appendChild($('p', { class: 'vfb-sub' }, this.t.roadmapSubtitle));
      const list = $('div');
      body.appendChild(list);
      this.modal.appendChild(body);

      const items = await this._fetchRoadmap();
      if (!items.length) {
        list.appendChild($('p', { class: 'vfb-sub' }, 'Sin items por ahora.'));
        return;
      }
      items.forEach(it => list.appendChild(this._roadmapItem(it)));
    }

    async _fetchRoadmap() {
      if (this.roadmapCache) return this.roadmapCache;
      try {
        const r = await fetch(this.cfg.roadmapEndpoint);
        if (r.ok) {
          this.roadmapCache = await r.json();
          return this.roadmapCache;
        }
      } catch {}
      // Fallback static roadmap
      this.roadmapCache = [
        { id: 'split-bill', title: 'Dividir cuenta entre comensales', tag: 'En diseño', votes: 42, desc: 'Permite separar tickets por persona/asiento.' },
        { id: 'kitchen-display', title: 'Pantalla de cocina (KDS)', tag: 'Próximo', votes: 88, desc: 'Pedidos en tiempo real en la cocina.' },
        { id: 'loyalty', title: 'Programa de lealtad', tag: 'Idea', votes: 17, desc: 'Puntos y recompensas para clientes recurrentes.' },
        { id: 'inventory-alerts', title: 'Alertas de inventario bajo', tag: 'Próximo', votes: 56, desc: 'Notificaciones cuando un SKU baja del umbral.' },
        { id: 'multi-currency', title: 'Multi-moneda', tag: 'Idea', votes: 23, desc: 'Cobrar en varias monedas con tipo de cambio.' }
      ];
      return this.roadmapCache;
    }

    _roadmapItem(item) {
      const voted = !!this.state.votes[item.id];
      const voteBtn = $('button', {
        class: 'vfb-vote-btn' + (voted ? ' voted' : ''),
        disabled: voted ? 'disabled' : null,
        onclick: () => this._vote(item, voteBtn, countEl)
      }, voted ? this.t.votedLabel : (this.t.voteLabel + ' (' + (item.votes || 0) + ')'));
      const countEl = voteBtn;
      return $('div', { class: 'vfb-roadmap-item' }, [
        $('div', { style: { flex: 1 } }, [
          $('div', null, [
            $('strong', null, item.title),
            ' ',
            item.tag ? $('span', { class: 'vfb-tag' }, item.tag) : null
          ]),
          item.desc ? $('div', { class: 'vfb-roadmap-meta' }, item.desc) : null
        ]),
        voteBtn
      ]);
    }

    async _vote(item, btn) {
      if (this.state.votes[item.id]) return;
      this.state.votes[item.id] = true;
      saveState(this.cfg.storageKey, this.state);
      item.votes = (item.votes || 0) + 1;
      btn.classList.add('voted');
      btn.disabled = true;
      btn.textContent = this.t.votedLabel;
      this._emit('vote', { id: item.id });
      try {
        await fetch(this.cfg.voteEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, context: captureContext() })
        });
      } catch {}
    }

    setUser(user) { this.cfg.user = user; return this; }
    destroy() {
      if (this.overlay) this.close();
      if (this.button) this.button.remove();
      const s = document.getElementById('vfb-styles');
      if (s) s.remove();
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────
  let _instance = null;

  const FeedbackAPI = {
    init(config) {
      if (_instance) _instance.destroy();
      _instance = new FeedbackWidget(config);
      return _instance;
    },
    open() { _instance && _instance.open(); },
    close() { _instance && _instance.close(); },
    setUser(u) { _instance && _instance.setUser(u); },
    on(evt, fn) { _instance && _instance.on(evt, fn); },
    captureContext,
    captureScreenshot,
    version: '1.0.0',
    _instance: () => _instance
  };

  global.FeedbackAPI = FeedbackAPI;

  // Auto-init if DOM already loaded and data-attribute present
  function autoInit() {
    const tag = document.querySelector('script[data-volvix-feedback]');
    if (tag) {
      const cfg = {};
      ['endpoint', 'appName', 'version', 'locale'].forEach(k => {
        const v = tag.getAttribute('data-' + k.toLowerCase());
        if (v) cfg[k] = v;
      });
      FeedbackAPI.init(cfg);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})(typeof window !== 'undefined' ? window : globalThis);
