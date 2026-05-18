/**
 * volvix-qr-payments.js
 * Volvix POS — Pagos vía código QR (CoDi MX / SPEI MX / PIX BR)
 *
 * Backend: /api/qr/{codi|spei|pix}/generate + /api/qr/payments/:id/status
 *
 * API pública:
 *   Volvix.qr.payWithCodi(amount, sale_id?)   → muestra modal y resuelve cuando se paga/cancela
 *   Volvix.qr.payWithSpei(amount, sale_id?)
 *   Volvix.qr.payWithPix (amount, sale_id?)
 *   Volvix.qr.mountCheckoutButton(container, opts)  → inserta botón "Pagar con QR"
 *
 * Uso típico en checkout:
 *   <div id="qr-pay-slot"></div>
 *   <script src="/volvix-qr-payments.js"></script>
 *   <script>
 *     Volvix.qr.mountCheckoutButton(document.getElementById('qr-pay-slot'), {
 *       getAmount: () => Number(document.getElementById('total').value),
 *       getSaleId: () => window.currentSaleId || null,
 *       defaultType: 'codi',
 *       onPaid:    (data) => { console.log('paid', data); /* navegar a recibo *\/ },
 *       onCancel:  ()     => { console.log('cancel'); },
 *       onError:   (e)    => { VolvixUI.toast({type:'error', message:'QR error: ' + e.message}); },
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  const API_BASE = (global.VOLVIX_API_BASE || '');
  const POLL_INTERVAL_MS = 3000;
  const POLL_MAX_MS = 30 * 60 * 1000; // 30 min

  // ---------- Helpers ----------
  function _token() {
    try { return localStorage.getItem('volvix_jwt') || localStorage.getItem('jwt') || ''; }
    catch (e) { return ''; }
  }
  function _authHeaders(extra) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    const t = _token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }
  async function _fetchJSON(url, opts) {
    const r = await fetch(url, opts || {});
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) {
      const msg = (body && (body.message || body.error)) || ('HTTP ' + r.status);
      const err = new Error(msg); err.status = r.status; err.body = body;
      throw err;
    }
    return body;
  }

  function _generate(type, amount, sale_id) {
    if (!['codi', 'spei', 'pix'].includes(type)) {
      return Promise.reject(new Error('type debe ser codi|spei|pix'));
    }
    return _fetchJSON(API_BASE + '/api/qr/' + type + '/generate', {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ amount, sale_id: sale_id || null }),
    });
  }

  function _pollStatus(id) {
    return _fetchJSON(API_BASE + '/api/qr/payments/' + encodeURIComponent(id) + '/status', {
      headers: _authHeaders(),
    });
  }

  // ---------- Modal UI ----------
  function _injectStyle() {
    if (document.getElementById('volvix-qr-style')) return;
    const s = document.createElement('style');
    s.id = 'volvix-qr-style';
    s.textContent = `
      .volvix-qr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
        align-items:center;justify-content:center;z-index:99999;font-family:system-ui,sans-serif}
      .volvix-qr-modal{background:#fff;border-radius:12px;padding:24px;max-width:380px;width:92%;
        box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
      .volvix-qr-modal h3{margin:0 0 8px;font-size:18px;color:#111}
      .volvix-qr-modal p{margin:4px 0;color:#444;font-size:14px}
      .volvix-qr-img{width:240px;height:240px;margin:14px auto;display:block;border:1px solid #eee}
      .volvix-qr-amount{font-size:22px;font-weight:700;color:#111;margin:8px 0}
      .volvix-qr-status{margin-top:10px;padding:8px;border-radius:6px;font-weight:600}
      .volvix-qr-status.pending{background:#fff7d6;color:#7a5c00}
      .volvix-qr-status.paid{background:#d4f7d4;color:#1a6b1a}
      .volvix-qr-status.expired,.volvix-qr-status.failed{background:#ffd6d6;color:#7a1a1a}
      .volvix-qr-actions{display:flex;gap:8px;margin-top:14px}
      .volvix-qr-actions button{flex:1;padding:10px;border:0;border-radius:6px;cursor:pointer;
        font-weight:600;font-size:14px}
      .volvix-qr-cancel{background:#eee;color:#333}
      .volvix-qr-copy{background:#1a73e8;color:#fff}
      .volvix-qr-warn{font-size:11px;color:#a55;margin-top:6px}
    `;
    document.head.appendChild(s);
  }

  function _showModal({ data, type }) {
    _injectStyle();
    const overlay = document.createElement('div');
    overlay.className = 'volvix-qr-overlay';
    const labels = { codi: 'CoDi (México)', spei: 'SPEI (México)', pix: 'PIX (Brasil)' };
    const cur = data.currency || (type === 'pix' ? 'BRL' : 'MXN');
    overlay.innerHTML = `
      <div class="volvix-qr-modal" role="dialog" aria-label="Pagar con QR">
        <h3>Pagar con ${labels[type] || type.toUpperCase()}</h3>
        <p>Escanea el código con la app de tu banco</p>
        <div class="volvix-qr-amount">${cur} ${Number(data.amount).toFixed(2)}</div>
        <img class="volvix-qr-img" src="${data.qr_image}" alt="QR ${type}"/>
        <p style="font-size:11px;color:#666;word-break:break-all">${data.ref || ''}</p>
        <div class="volvix-qr-status pending" data-status>Esperando pago...</div>
        ${data.placeholder ? '<div class="volvix-qr-warn">Modo demo: credenciales bancarias no configuradas</div>' : ''}
        <div class="volvix-qr-actions">
          <button class="volvix-qr-copy" data-copy>Copiar código</button>
          <button class="volvix-qr-cancel" data-cancel>Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('[data-copy]').onclick = () => {
      try { navigator.clipboard.writeText(data.qr_string); } catch (_) {}
    };

    return {
      overlay,
      setStatus(status) {
        const el = overlay.querySelector('[data-status]');
        if (!el) return;
        el.className = 'volvix-qr-status ' + status;
        el.textContent = ({
          pending: 'Esperando pago...',
          paid:    '¡Pago recibido!',
          expired: 'QR expirado',
          failed:  'Pago fallido',
        })[status] || status;
      },
      onCancel(fn) { overlay.querySelector('[data-cancel]').onclick = fn; },
      close() { try { overlay.remove(); } catch (_) {} },
    };
  }

  // ---------- Flujo principal: generar + polling ----------
  function _payWith(type, amount, sale_id) {
    return new Promise(async (resolve, reject) => {
      let modal = null;
      let pollTimer = null;
      let cancelled = false;
      const startedAt = Date.now();

      function stop() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      }

      try {
        const data = await _generate(type, amount, sale_id);
        modal = _showModal({ data, type });
        modal.onCancel(() => {
          cancelled = true;
          stop();
          modal.close();
          resolve({ status: 'cancelled' });
        });

        pollTimer = setInterval(async () => {
          if (cancelled) return;
          if (Date.now() - startedAt > POLL_MAX_MS) {
            stop();
            modal.setStatus('expired');
            setTimeout(() => modal.close(), 1500);
            resolve({ status: 'expired' });
            return;
          }
          try {
            const st = await _pollStatus(data.id);
            if (st.status === 'paid') {
              stop();
              modal.setStatus('paid');
              setTimeout(() => modal.close(), 1200);
              resolve({ status: 'paid', payment: st });
            } else if (st.status === 'expired' || st.status === 'failed') {
              stop();
              modal.setStatus(st.status);
              setTimeout(() => modal.close(), 1500);
              resolve({ status: st.status, payment: st });
            }
          } catch (e) { /* ignore transient errors, keep polling */ }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (modal) modal.close();
        stop();
        reject(err);
      }
    });
  }

  // ---------- Botón checkout ----------
  function mountCheckoutButton(container, opts) {
    if (!container) return;
    opts = opts || {};
    const types = opts.types || ['codi', 'spei', 'pix'];
    const def = opts.defaultType || types[0];

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';

    const select = document.createElement('select');
    select.style.cssText = 'padding:8px;border:1px solid #ccc;border-radius:6px';
    types.forEach(t => {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = ({ codi: 'CoDi MX', spei: 'SPEI MX', pix: 'PIX BR' })[t] || t;
      if (t === def) o.selected = true;
      select.appendChild(o);
    });

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Pagar con QR';
    btn.style.cssText = 'padding:10px 16px;background:#0a7d3a;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600';

    btn.onclick = async () => {
      try {
        const amount = (typeof opts.getAmount === 'function') ? opts.getAmount() : Number(opts.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          (opts.onError || alert).call(null, new Error('Monto inválido'));
          return;
        }
        const sale_id = (typeof opts.getSaleId === 'function') ? opts.getSaleId() : (opts.sale_id || null);
        btn.disabled = true; btn.textContent = 'Generando QR...';
        const result = await _payWith(select.value, amount, sale_id);
        btn.disabled = false; btn.textContent = 'Pagar con QR';
        if (result.status === 'paid' && opts.onPaid) opts.onPaid(result.payment);
        else if (result.status === 'cancelled' && opts.onCancel) opts.onCancel();
        else if (result.status !== 'paid' && opts.onError) opts.onError(new Error(result.status));
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Pagar con QR';
        (opts.onError || console.error).call(null, e);
      }
    };

    wrap.appendChild(select);
    wrap.appendChild(btn);
    container.appendChild(wrap);
    return { destroy: () => { try { wrap.remove(); } catch (_) {} } };
  }

  // ---------- Export ----------
  global.Volvix = global.Volvix || {};
  global.Volvix.qr = {
    payWithCodi: (amount, sale_id) => _payWith('codi', amount, sale_id),
    payWithSpei: (amount, sale_id) => _payWith('spei', amount, sale_id),
    payWithPix:  (amount, sale_id) => _payWith('pix',  amount, sale_id),
    mountCheckoutButton,
    _internal: { _generate, _pollStatus },
  };

  // slice 109: alias compacto Volvix.qrPayments.show(saleId, amount, type?)
  // Muestra modal con QR, polling cada 3s al status endpoint, auto-cierra en paid.
  global.Volvix.qrPayments = {
    show: function (saleId, amount, type) {
      type = type || 'codi';
      const fn = type === 'spei' ? 'payWithSpei' : (type === 'pix' ? 'payWithPix' : 'payWithCodi');
      return global.Volvix.qr[fn](amount, saleId);
    },
    getStatus: (id) => _fetchJSON(API_BASE + '/api/qr/payments/' + encodeURIComponent(id) + '/status', { headers: _authHeaders() })
  };
})(typeof window !== 'undefined' ? window : globalThis);
