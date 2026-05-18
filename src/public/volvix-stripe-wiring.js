/* Volvix POS — Stripe Wiring (cliente)
 * Carga Stripe.js dinámicamente y expone Volvix.stripe.cobrar(saleId, amountCents)
 * Requiere que el servidor exponga /api/payments/stripe/intent
 */
(function () {
  'use strict';

  const STRIPE_JS_URL = 'https://js.stripe.com/v3/';
  let stripeInstance = null;
  let publishableKey = null;
  let loadingPromise = null;

  function loadStripeJS() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    if (loadingPromise) return loadingPromise;
    loadingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = STRIPE_JS_URL;
      s.async = true;
      s.onload = () => window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js no se inicializó'));
      s.onerror = () => reject(new Error('No se pudo cargar Stripe.js'));
      document.head.appendChild(s);
    });
    return loadingPromise;
  }

  function ensureStripe(pk) {
    return loadStripeJS().then((StripeCtor) => {
      if (!stripeInstance || publishableKey !== pk) {
        publishableKey = pk;
        stripeInstance = StripeCtor(pk);
      }
      return stripeInstance;
    });
  }

  // ── Modal con Payment Element ─────────────────────────────────────────────
  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'volvix-stripe-overlay';
    overlay.style.cssText = [
      'position:fixed','inset:0','background:rgba(0,0,0,.55)',
      'display:flex','align-items:center','justify-content:center',
      'z-index:99999','font-family:system-ui,sans-serif'
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'background:#fff','border-radius:12px','padding:24px',
      'width:min(440px,92vw)','max-height:92vh','overflow:auto',
      'box-shadow:0 20px 60px rgba(0,0,0,.3)'
    ].join(';');

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:18px;color:#111">Cobro con tarjeta</h3>
        <button id="vx-stripe-close" type="button" aria-label="Cerrar"
          style="background:none;border:0;font-size:22px;cursor:pointer;color:#666">&times;</button>
      </div>
      <div id="vx-stripe-amount" style="font-size:24px;font-weight:700;color:#111;margin-bottom:16px"></div>
      <div id="vx-stripe-element" style="margin-bottom:16px;min-height:120px"></div>
      <div id="vx-stripe-msg" style="font-size:13px;color:#c00;margin-bottom:12px;min-height:18px"></div>
      <button id="vx-stripe-pay" type="button"
        style="width:100%;padding:12px;background:#5469d4;color:#fff;border:0;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer">
        Pagar
      </button>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return overlay;
  }

  function fmtMoney(cents, currency) {
    const v = (cents / 100);
    try {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: (currency || 'MXN').toUpperCase() }).format(v);
    } catch { return `$${v.toFixed(2)}`; }
  }

  // ── API pública ───────────────────────────────────────────────────────────
  async function cobrar(saleId, amountCents, opts) {
    opts = opts || {};
    const currency = (opts.currency || 'mxn').toLowerCase();

    if (!saleId) throw new Error('saleId requerido');
    amountCents = parseInt(amountCents, 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amountCents inválido');

    // 1) Crear PaymentIntent en backend
    let intentResp;
    try {
      const r = await fetch('/api/payments/stripe/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: saleId, amount: amountCents, currency }),
      });
      intentResp = await r.json();
      if (!r.ok) {
        const msg = intentResp?.detail || intentResp?.error || 'Error creando intent';
        if (r.status === 503) throw new Error('Stripe no configurado: ' + msg);
        throw new Error(msg);
      }
    } catch (err) {
      if (typeof opts.onError === 'function') opts.onError(err);
      throw err;
    }

    const { client_secret, publishable_key, payment_intent_id } = intentResp;
    const pk = publishable_key || window.VOLVIX_STRIPE_PUBLISHABLE_KEY;
    if (!pk) {
      const err = new Error('Falta STRIPE_PUBLISHABLE_KEY (publishable_key) en el servidor o window.VOLVIX_STRIPE_PUBLISHABLE_KEY');
      if (typeof opts.onError === 'function') opts.onError(err);
      throw err;
    }

    // 2) Cargar Stripe.js + Elements
    const stripe = await ensureStripe(pk);
    const elements = stripe.elements({ clientSecret: client_secret, appearance: { theme: 'stripe' } });
    const paymentEl = elements.create('payment');

    // 3) Renderizar modal
    const overlay = buildModal();
    const $ = sel => overlay.querySelector(sel);
    $('#vx-stripe-amount').textContent = fmtMoney(amountCents, currency);
    paymentEl.mount($('#vx-stripe-element'));

    return new Promise((resolve) => {
      const close = (result) => {
        try { paymentEl.unmount(); } catch {}
        overlay.remove();
        resolve(result);
      };

      $('#vx-stripe-close').addEventListener('click', () => {
        const result = { ok: false, canceled: true, payment_intent_id };
        if (typeof opts.onCancel === 'function') opts.onCancel(result);
        close(result);
      });

      $('#vx-stripe-pay').addEventListener('click', async () => {
        const btn = $('#vx-stripe-pay');
        const msg = $('#vx-stripe-msg');
        btn.disabled = true;
        btn.textContent = 'Procesando...';
        msg.textContent = '';

        try {
          const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
          });

          if (error) {
            msg.textContent = error.message || 'Error al confirmar el pago';
            btn.disabled = false;
            btn.textContent = 'Pagar';
            if (typeof opts.onError === 'function') opts.onError(error);
            return;
          }

          if (paymentIntent && paymentIntent.status === 'succeeded') {
            const result = { ok: true, payment_intent_id: paymentIntent.id, status: 'succeeded' };
            if (typeof opts.onSuccess === 'function') opts.onSuccess(result);
            close(result);
            return;
          }

          // Otros estados (processing / requires_action manejado por Stripe)
          const result = {
            ok: paymentIntent?.status === 'processing',
            status: paymentIntent?.status || 'unknown',
            payment_intent_id: paymentIntent?.id || payment_intent_id,
          };
          if (typeof opts.onPending === 'function') opts.onPending(result);
          close(result);
        } catch (err) {
          msg.textContent = err.message || 'Error inesperado';
          btn.disabled = false;
          btn.textContent = 'Pagar';
          if (typeof opts.onError === 'function') opts.onError(err);
        }
      });
    });
  }

  async function status(idOrSaleOrIntent) {
    const r = await fetch('/api/payments/' + encodeURIComponent(idOrSaleOrIntent) + '/status');
    return r.json();
  }

  window.Volvix = window.Volvix || {};
  window.Volvix.stripe = { cobrar, status, _loadStripeJS: loadStripeJS };
})();
