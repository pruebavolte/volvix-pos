/**
 * volvix-signature-wiring.js
 * Signature Pad wiring for Volvix POS
 * - Canvas-based signature capture
 * - Save as base64 PNG
 * - Required when paying with card
 * - Signature gallery + verification
 *
 * Exposes: window.SignatureAPI
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────
  // Storage
  // ───────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix_signatures_v1';
  const SETTINGS_KEY = 'volvix_signature_settings_v1';

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[SignatureAPI] loadAll error', e);
      return [];
    }
  }

  function saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('[SignatureAPI] saveAll error', e);
      return false;
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw
        ? JSON.parse(raw)
        : { requireOnCard: true, minStrokes: 3, minDurationMs: 400 };
    } catch (e) {
      return { requireOnCard: true, minStrokes: 3, minDurationMs: 400 };
    }
  }

  function saveSettings(cfg) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
  }

  // ───────────────────────────────────────────────────────────
  // SignaturePad class
  // ───────────────────────────────────────────────────────────
  class SignaturePad {
    constructor(canvas, opts = {}) {
      if (!canvas) throw new Error('canvas required');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.color = opts.color || '#0a0a0a';
      this.lineWidth = opts.lineWidth || 2.2;
      this.bg = opts.bg || '#ffffff';
      this.points = [];
      this.strokes = 0;
      this.startedAt = null;
      this.drawing = false;
      this._setup();
    }

    _setup() {
      this._resize();
      this.clear();
      const c = this.canvas;
      const down = (e) => this._down(e);
      const move = (e) => this._move(e);
      const up = (e) => this._up(e);
      c.addEventListener('mousedown', down);
      c.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      c.addEventListener('touchstart', down, { passive: false });
      c.addEventListener('touchmove', move, { passive: false });
      c.addEventListener('touchend', up);
      this._listeners = { down, move, up };
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, rect.width * dpr);
      this.canvas.height = Math.max(1, rect.height * dpr);
      this.ctx.scale(dpr, dpr);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }

    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }

    _down(e) {
      e.preventDefault();
      this.drawing = true;
      if (!this.startedAt) this.startedAt = Date.now();
      this.strokes++;
      const p = this._pos(e);
      this.points.push({ stroke: this.strokes, ...p });
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
    }

    _move(e) {
      if (!this.drawing) return;
      e.preventDefault();
      const p = this._pos(e);
      this.points.push({ stroke: this.strokes, ...p });
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.lineWidth;
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    }

    _up() {
      this.drawing = false;
    }

    clear() {
      this.ctx.fillStyle = this.bg;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.points = [];
      this.strokes = 0;
      this.startedAt = null;
    }

    isEmpty() {
      return this.points.length === 0;
    }

    duration() {
      return this.startedAt ? Date.now() - this.startedAt : 0;
    }

    toBase64(mime = 'image/png') {
      return this.canvas.toDataURL(mime);
    }

    destroy() {
      const c = this.canvas;
      const l = this._listeners || {};
      c.removeEventListener('mousedown', l.down);
      c.removeEventListener('mousemove', l.move);
      window.removeEventListener('mouseup', l.up);
      c.removeEventListener('touchstart', l.down);
      c.removeEventListener('touchmove', l.move);
      c.removeEventListener('touchend', l.up);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Modal UI
  // ───────────────────────────────────────────────────────────
  function buildModal() {
    let modal = document.getElementById('volvix-sig-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'volvix-sig-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;' +
      'align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:20px;width:min(560px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.4);">' +
      '<h3 style="margin:0 0 10px;font-size:18px;">Firma del cliente</h3>' +
      '<p id="sig-meta" style="margin:0 0 10px;font-size:13px;color:#555;"></p>' +
      '<canvas id="sig-canvas" style="width:100%;height:220px;border:2px dashed #bbb;border-radius:8px;background:#fff;touch-action:none;"></canvas>' +
      '<div id="sig-error" style="color:#c00;font-size:13px;min-height:18px;margin-top:6px;"></div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;">' +
      '<button id="sig-clear" style="padding:10px 16px;border:1px solid #ccc;background:#f5f5f5;border-radius:6px;cursor:pointer;">Limpiar</button>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="sig-cancel" style="padding:10px 16px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;">Cancelar</button>' +
      '<button id="sig-save" style="padding:10px 18px;border:0;background:#0a7;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Guardar firma</button>' +
      '</div></div></div>';
    document.body.appendChild(modal);
    return modal;
  }

  let activePad = null;
  let activeResolve = null;

  function captureSignature(meta = {}) {
    return new Promise((resolve) => {
      const modal = buildModal();
      const cv = modal.querySelector('#sig-canvas');
      const err = modal.querySelector('#sig-error');
      const metaEl = modal.querySelector('#sig-meta');
      metaEl.textContent =
        (meta.customer ? 'Cliente: ' + meta.customer + '  ·  ' : '') +
        (meta.amount != null ? 'Monto: $' + Number(meta.amount).toFixed(2) : '');
      err.textContent = '';
      modal.style.display = 'flex';
      if (activePad) activePad.destroy();
      activePad = new SignaturePad(cv);
      activeResolve = resolve;

      modal.querySelector('#sig-clear').onclick = () => {
        activePad.clear();
        err.textContent = '';
      };
      modal.querySelector('#sig-cancel').onclick = () => closeModal(null);
      modal.querySelector('#sig-save').onclick = () => {
        const cfg = loadSettings();
        if (activePad.isEmpty()) {
          err.textContent = 'La firma está vacía.';
          return;
        }
        if (activePad.strokes < cfg.minStrokes) {
          err.textContent = 'Firma demasiado corta (min ' + cfg.minStrokes + ' trazos).';
          return;
        }
        if (activePad.duration() < cfg.minDurationMs) {
          err.textContent = 'Firma demasiado rápida.';
          return;
        }
        const record = {
          id: 'sig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          createdAt: new Date().toISOString(),
          base64: activePad.toBase64('image/png'),
          strokes: activePad.strokes,
          durationMs: activePad.duration(),
          meta: meta || {},
        };
        const list = loadAll();
        list.push(record);
        saveAll(list);
        closeModal(record);
      };
    });
  }

  function closeModal(result) {
    const modal = document.getElementById('volvix-sig-modal');
    if (modal) modal.style.display = 'none';
    if (activePad) {
      activePad.destroy();
      activePad = null;
    }
    if (activeResolve) {
      const r = activeResolve;
      activeResolve = null;
      r(result);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Card payment hook
  // ───────────────────────────────────────────────────────────
  async function requireForCard(payment) {
    const cfg = loadSettings();
    if (!cfg.requireOnCard) return { ok: true, skipped: true };
    const method = (payment && (payment.method || payment.tipo) || '').toLowerCase();
    const isCard = /card|tarjeta|credit|debit|credito|debito/.test(method);
    if (!isCard) return { ok: true, skipped: true };
    const sig = await captureSignature({
      customer: payment && (payment.customer || payment.cliente),
      amount: payment && (payment.amount || payment.total),
      ref: payment && (payment.ref || payment.folio),
    });
    if (!sig) return { ok: false, reason: 'cancelled' };
    return { ok: true, signature: sig };
  }

  // ───────────────────────────────────────────────────────────
  // Gallery
  // ───────────────────────────────────────────────────────────
  function renderGallery(container) {
    const el =
      typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const list = loadAll().slice().reverse();
    if (!list.length) {
      el.innerHTML = '<p style="color:#666;font-family:sans-serif;">No hay firmas registradas.</p>';
      return;
    }
    el.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;font-family:sans-serif;">' +
      list
        .map(function (s) {
          const m = s.meta || {};
          return (
            '<div style="border:1px solid #ddd;border-radius:8px;padding:8px;background:#fff;">' +
            '<img src="' + s.base64 + '" style="width:100%;height:110px;object-fit:contain;background:#fafafa;border-radius:4px;" />' +
            '<div style="font-size:12px;margin-top:6px;color:#333;">' +
            '<div><b>' + (m.customer || 'Cliente') + '</b></div>' +
            (m.amount != null ? '<div>$' + Number(m.amount).toFixed(2) + '</div>' : '') +
            '<div style="color:#888;">' + new Date(s.createdAt).toLocaleString() + '</div>' +
            '<div style="color:#888;">' + s.strokes + ' trazos · ' + s.durationMs + 'ms</div>' +
            '<button data-id="' + s.id + '" class="sig-del" style="margin-top:6px;font-size:11px;color:#c00;background:none;border:0;cursor:pointer;">Eliminar</button>' +
            '</div></div>'
          );
        })
        .join('') +
      '</div>';
    el.querySelectorAll('.sig-del').forEach(function (b) {
      b.onclick = function () {
        SignatureAPI.remove(b.dataset.id);
        renderGallery(el);
      };
    });
  }

  // ───────────────────────────────────────────────────────────
  // Verification
  // ───────────────────────────────────────────────────────────
  function verify(sigOrId) {
    const sig =
      typeof sigOrId === 'string'
        ? loadAll().find(function (s) { return s.id === sigOrId; })
        : sigOrId;
    if (!sig) return { ok: false, score: 0, reason: 'not_found' };
    const cfg = loadSettings();
    let score = 0;
    const checks = [];
    if (sig.strokes >= cfg.minStrokes) { score += 40; checks.push('strokes_ok'); }
    else checks.push('strokes_low');
    if (sig.durationMs >= cfg.minDurationMs) { score += 30; checks.push('duration_ok'); }
    else checks.push('duration_low');
    if (sig.base64 && sig.base64.length > 800) { score += 30; checks.push('image_ok'); }
    else checks.push('image_small');
    return { ok: score >= 70, score: score, checks: checks, signature: sig };
  }

  function compare(idA, idB) {
    const all = loadAll();
    const a = all.find(function (s) { return s.id === idA; });
    const b = all.find(function (s) { return s.id === idB; });
    if (!a || !b) return { ok: false, reason: 'not_found' };
    const dStrokes = Math.abs(a.strokes - b.strokes);
    const dDur = Math.abs(a.durationMs - b.durationMs);
    const dLen = Math.abs((a.base64 || '').length - (b.base64 || '').length);
    let sim = 100;
    sim -= Math.min(40, dStrokes * 8);
    sim -= Math.min(30, dDur / 50);
    sim -= Math.min(30, dLen / 1000);
    sim = Math.max(0, Math.round(sim));
    return { ok: sim >= 60, similarity: sim, dStrokes: dStrokes, dDur: dDur };
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────
  const SignatureAPI = {
    SignaturePad: SignaturePad,
    capture: captureSignature,
    requireForCard: requireForCard,
    list: loadAll,
    get: function (id) { return loadAll().find(function (s) { return s.id === id; }); },
    remove: function (id) {
      const list = loadAll().filter(function (s) { return s.id !== id; });
      saveAll(list);
      return true;
    },
    clearAll: function () { saveAll([]); },
    renderGallery: renderGallery,
    verify: verify,
    compare: compare,
    getSettings: loadSettings,
    setSettings: function (patch) {
      const cur = loadSettings();
      const next = Object.assign({}, cur, patch || {});
      saveSettings(next);
      return next;
    },
    version: '1.0.0',
  };

  global.SignatureAPI = SignatureAPI;
  console.log('[SignatureAPI] ready v' + SignatureAPI.version);
})(typeof window !== 'undefined' ? window : this);
