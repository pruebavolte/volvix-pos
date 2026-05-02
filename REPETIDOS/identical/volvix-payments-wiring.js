/**
 * volvix-payments-wiring.js
 * Volvix POS — Payment Gateway UI (mock)
 * Stripe / PayPal / MercadoPago / Transferencia / Efectivo
 * Agent-22 — Ronda 7 Fibonacci
 */
(function (global) {
  'use strict';

  // =========================================================================
  // STATE
  // =========================================================================
  const VolvixPayments = {
    transactions: JSON.parse(localStorage.getItem('volvix_tx_history') || '[]'),
    currentOrder: null,
    activeMethod: 'card',
    processing: false,
  };

  // =========================================================================
  // UTILITIES
  // =========================================================================
  const fmt = (n) => '$' + (Number(n) || 0).toFixed(2);
  const uid = () => 'TX-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function saveHistory() {
    try {
      localStorage.setItem('volvix_tx_history', JSON.stringify(VolvixPayments.transactions.slice(-200)));
    } catch (e) { console.warn('[Volvix] history save failed', e); }
  }

  // =========================================================================
  // CARD VALIDATION
  // =========================================================================
  function luhnCheck(num) {
    const digits = String(num).replace(/\D/g, '');
    if (digits.length < 12) return false;
    let sum = 0, alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function detectBrand(num) {
    const n = String(num).replace(/\D/g, '');
    if (/^4/.test(n)) return { brand: 'visa', label: 'Visa', cvvLen: 3 };
    if (/^(5[1-5]|2[2-7])/.test(n)) return { brand: 'mastercard', label: 'MasterCard', cvvLen: 3 };
    if (/^3[47]/.test(n)) return { brand: 'amex', label: 'Amex', cvvLen: 4 };
    if (/^6(011|5)/.test(n)) return { brand: 'discover', label: 'Discover', cvvLen: 3 };
    if (/^3(0[0-5]|[68])/.test(n)) return { brand: 'diners', label: 'Diners', cvvLen: 3 };
    return { brand: 'unknown', label: '—', cvvLen: 3 };
  }

  function validateExpiry(mm, yy) {
    const m = parseInt(mm, 10), y = parseInt(yy, 10);
    if (!m || !y || m < 1 || m > 12) return false;
    const now = new Date();
    const fullY = y < 100 ? 2000 + y : y;
    const exp = new Date(fullY, m, 0, 23, 59, 59);
    return exp >= now;
  }

  function validateCVV(cvv, brand) {
    const len = detectBrand('').cvvLen;
    const expected = brand ? brand.cvvLen : 3;
    return /^\d+$/.test(cvv) && cvv.length === expected;
  }

  function formatCardNumber(v) {
    const n = v.replace(/\D/g, '').slice(0, 19);
    const brand = detectBrand(n);
    if (brand.brand === 'amex') return n.replace(/(\d{4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
    return n.replace(/(\d{4})/g, '$1 ').trim();
  }

  // =========================================================================
  // STYLES
  // =========================================================================
  const CSS = `
  .vx-pay-overlay{position:fixed;inset:0;background:rgba(10,15,30,.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:-apple-system,Segoe UI,Roboto,sans-serif;animation:vxFade .25s ease}
  @keyframes vxFade{from{opacity:0}to{opacity:1}}
  @keyframes vxSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
  .vx-pay-modal{background:#fff;border-radius:16px;width:min(560px,94vw);max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);animation:vxSlide .3s ease}
  .vx-pay-head{padding:20px 24px;border-bottom:1px solid #eef0f5;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:#fff;border-radius:16px 16px 0 0}
  .vx-pay-head h2{margin:0;font-size:18px}
  .vx-pay-head .vx-total{font-size:22px;font-weight:700}
  .vx-pay-close{background:rgba(255,255,255,.2);border:0;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px}
  .vx-pay-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:14px 16px;border-bottom:1px solid #eef0f5;background:#f9fafc}
  .vx-tab{padding:10px 4px;text-align:center;border:1px solid transparent;border-radius:10px;cursor:pointer;font-size:11px;font-weight:600;color:#475569;background:#fff;transition:.2s}
  .vx-tab:hover{border-color:#cbd5e1}
  .vx-tab.active{background:#1e3a8a;color:#fff;border-color:#1e3a8a}
  .vx-tab-icon{display:block;font-size:18px;margin-bottom:4px}
  .vx-pay-body{padding:22px 24px}
  .vx-field{margin-bottom:14px}
  .vx-field label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
  .vx-input{width:100%;padding:11px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;outline:0;transition:.2s;font-family:inherit;box-sizing:border-box}
  .vx-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
  .vx-input.error{border-color:#ef4444}
  .vx-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .vx-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  .vx-card-visual{background:linear-gradient(135deg,#0f172a,#334155);color:#fff;border-radius:12px;padding:18px;margin-bottom:18px;position:relative;height:160px;font-family:'Courier New',monospace}
  .vx-card-visual.brand-visa{background:linear-gradient(135deg,#1a1f71,#0066b2)}
  .vx-card-visual.brand-mastercard{background:linear-gradient(135deg,#cc0000,#ff6b00)}
  .vx-card-visual.brand-amex{background:linear-gradient(135deg,#2671b9,#108168)}
  .vx-card-num{font-size:20px;letter-spacing:2px;margin-top:48px}
  .vx-card-bottom{position:absolute;bottom:18px;left:18px;right:18px;display:flex;justify-content:space-between;font-size:11px}
  .vx-card-brand{position:absolute;top:18px;right:18px;font-size:14px;font-weight:700;text-transform:uppercase}
  .vx-btn{padding:13px 20px;border:0;border-radius:10px;cursor:pointer;font-size:15px;font-weight:600;width:100%;transition:.2s}
  .vx-btn-primary{background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:#fff}
  .vx-btn-primary:hover{filter:brightness(1.1)}
  .vx-btn-primary:disabled{opacity:.6;cursor:wait}
  .vx-method-info{padding:14px;background:#f1f5f9;border-radius:10px;margin-bottom:16px;font-size:13px;color:#475569;line-height:1.5}
  .vx-cash-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
  .vx-cash-quick{padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;font-size:13px}
  .vx-cash-quick:hover{border-color:#3b82f6;background:#eff6ff}
  .vx-change-box{padding:14px;background:#ecfdf5;border:1.5px solid #10b981;border-radius:10px;text-align:center;margin-top:10px}
  .vx-change-box .lbl{font-size:11px;color:#065f46;text-transform:uppercase;font-weight:700}
  .vx-change-box .val{font-size:24px;font-weight:700;color:#065f46}
  .vx-error-msg{color:#ef4444;font-size:12px;margin-top:6px;display:none}
  .vx-error-msg.show{display:block}
  .vx-spinner{width:18px;height:18px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;display:inline-block;animation:vxSpin 1s linear infinite;vertical-align:middle;margin-right:8px}
  @keyframes vxSpin{to{transform:rotate(360deg)}}
  .vx-receipt{font-family:'Courier New',monospace;background:#fff;padding:24px;border:1px dashed #94a3b8;border-radius:8px}
  .vx-receipt h3{text-align:center;margin:0 0 4px}
  .vx-receipt .center{text-align:center;font-size:12px;color:#64748b}
  .vx-receipt-line{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
  .vx-receipt-total{border-top:2px dashed #cbd5e1;margin-top:10px;padding-top:10px;font-weight:700;font-size:16px}
  .vx-paypal-btn{background:#ffc439;color:#003087;border:0;padding:14px;border-radius:8px;font-weight:700;font-size:16px;width:100%;cursor:pointer}
  .vx-mp-btn{background:#00b1ea;color:#fff;border:0;padding:14px;border-radius:8px;font-weight:700;font-size:16px;width:100%;cursor:pointer}
  .vx-history-list{max-height:400px;overflow:auto}
  .vx-history-item{padding:12px;border-bottom:1px solid #eef0f5;display:flex;justify-content:space-between;align-items:center;font-size:13px}
  .vx-history-item .meta{color:#64748b;font-size:11px}
  .vx-status-ok{color:#10b981;font-weight:700}
  .vx-status-err{color:#ef4444;font-weight:700}
  `;

  function injectStyles() {
    if (document.getElementById('vx-pay-styles')) return;
    const s = document.createElement('style');
    s.id = 'vx-pay-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // =========================================================================
  // MODAL BUILDER
  // =========================================================================
  function buildModal(order) {
    const o = document.createElement('div');
    o.className = 'vx-pay-overlay';
    o.id = 'vx-pay-overlay';
    o.innerHTML = `
      <div class="vx-pay-modal">
        <div class="vx-pay-head">
          <div>
            <h2>Pago Volvix POS</h2>
            <div style="font-size:11px;opacity:.85">Orden ${order.id}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;opacity:.85">TOTAL</div>
            <div class="vx-total">${fmt(order.total)}</div>
          </div>
          <button class="vx-pay-close" data-action="close">×</button>
        </div>
        <div class="vx-pay-tabs">
          <div class="vx-tab active" data-method="card"><span class="vx-tab-icon">💳</span>Tarjeta</div>
          <div class="vx-tab" data-method="paypal"><span class="vx-tab-icon">🅿️</span>PayPal</div>
          <div class="vx-tab" data-method="mp"><span class="vx-tab-icon">🛒</span>MercadoPago</div>
          <div class="vx-tab" data-method="transfer"><span class="vx-tab-icon">🏦</span>Transfer</div>
          <div class="vx-tab" data-method="cash"><span class="vx-tab-icon">💵</span>Efectivo</div>
        </div>
        <div class="vx-pay-body" id="vx-pay-body"></div>
      </div>`;
    return o;
  }

  // =========================================================================
  // METHOD VIEWS
  // =========================================================================
  function viewCard(order) {
    return `
      <div class="vx-card-visual" id="vx-card-vis">
        <div class="vx-card-brand" id="vx-card-brand">—</div>
        <div class="vx-card-num" id="vx-card-num-disp">•••• •••• •••• ••••</div>
        <div class="vx-card-bottom">
          <span id="vx-card-name-disp">NOMBRE TITULAR</span>
          <span id="vx-card-exp-disp">MM/AA</span>
        </div>
      </div>
      <div class="vx-field">
        <label>Número de tarjeta</label>
        <input class="vx-input" id="vx-card-num" placeholder="1234 5678 9012 3456" maxlength="23" inputmode="numeric"/>
        <div class="vx-error-msg" id="vx-err-num">Número inválido (Luhn)</div>
      </div>
      <div class="vx-field">
        <label>Nombre del titular</label>
        <input class="vx-input" id="vx-card-name" placeholder="Como aparece en la tarjeta"/>
      </div>
      <div class="vx-row-3">
        <div class="vx-field">
          <label>Mes</label>
          <input class="vx-input" id="vx-card-mm" placeholder="MM" maxlength="2" inputmode="numeric"/>
        </div>
        <div class="vx-field">
          <label>Año</label>
          <input class="vx-input" id="vx-card-yy" placeholder="AA" maxlength="2" inputmode="numeric"/>
        </div>
        <div class="vx-field">
          <label>CVV</label>
          <input class="vx-input" id="vx-card-cvv" placeholder="123" maxlength="4" inputmode="numeric"/>
        </div>
      </div>
      <div class="vx-error-msg" id="vx-err-form">Revisa los datos</div>
      <button class="vx-btn vx-btn-primary" id="vx-pay-go">Pagar ${fmt(order.total)}</button>
    `;
  }

  function viewPayPal(order) {
    return `
      <div class="vx-method-info">Serás redirigido a PayPal para autorizar el pago de <b>${fmt(order.total)}</b>. (Mock: simula la redirección.)</div>
      <div class="vx-field"><label>Email PayPal</label><input class="vx-input" id="vx-pp-email" placeholder="tucorreo@ejemplo.com"/></div>
      <button class="vx-paypal-btn" id="vx-pay-go">Pagar con PayPal</button>
    `;
  }

  function viewMP(order) {
    return `
      <div class="vx-method-info">MercadoPago Checkout Pro. Total: <b>${fmt(order.total)}</b>. Aceptamos tarjetas, efectivo en sucursales y dinero en cuenta.</div>
      <div class="vx-field"><label>Email comprador</label><input class="vx-input" id="vx-mp-email" placeholder="comprador@ejemplo.com"/></div>
      <div class="vx-field"><label>DNI / RFC / CC</label><input class="vx-input" id="vx-mp-doc" placeholder="Documento"/></div>
      <button class="vx-mp-btn" id="vx-pay-go">Pagar con MercadoPago</button>
    `;
  }

  function viewTransfer(order) {
    const ref = uid();
    return `
      <div class="vx-method-info">
        <b>Transferencia Bancaria</b><br>
        Banco: <b>BANCO VOLVIX MX</b><br>
        Cuenta CLABE: <b>012 345 678901234567</b><br>
        Beneficiario: <b>Grupo Volvix S.A. de C.V.</b><br>
        Monto: <b>${fmt(order.total)}</b><br>
        Referencia: <b>${ref}</b>
      </div>
      <div class="vx-field"><label>Banco emisor</label><input class="vx-input" id="vx-tr-bank" placeholder="Tu banco"/></div>
      <div class="vx-field"><label>Folio de transferencia</label><input class="vx-input" id="vx-tr-folio" placeholder="Folio recibido"/></div>
      <button class="vx-btn vx-btn-primary" id="vx-pay-go">Confirmar transferencia</button>
    `;
  }

  function viewCash(order) {
    return `
      <div class="vx-method-info">Total a cobrar: <b>${fmt(order.total)}</b></div>
      <div class="vx-field">
        <label>Monto recibido en efectivo</label>
        <input class="vx-input" id="vx-cash-in" type="number" step="0.01" min="0" placeholder="0.00"/>
      </div>
      <div class="vx-cash-grid">
        <button class="vx-cash-quick" data-cash="${order.total}">Exacto</button>
        <button class="vx-cash-quick" data-cash="${Math.ceil(order.total/100)*100}">${fmt(Math.ceil(order.total/100)*100)}</button>
        <button class="vx-cash-quick" data-cash="500">$500</button>
        <button class="vx-cash-quick" data-cash="1000">$1000</button>
      </div>
      <div class="vx-change-box">
        <div class="lbl">Cambio a entregar</div>
        <div class="val" id="vx-change">${fmt(0)}</div>
      </div>
      <div class="vx-error-msg" id="vx-err-cash">Monto insuficiente</div>
      <button class="vx-btn vx-btn-primary" id="vx-pay-go" style="margin-top:14px">Cobrar ${fmt(order.total)}</button>
    `;
  }

  // =========================================================================
  // RENDER METHOD
  // =========================================================================
  function renderMethod(method, order) {
    VolvixPayments.activeMethod = method;
    const body = document.getElementById('vx-pay-body');
    if (!body) return;
    if (method === 'card') body.innerHTML = viewCard(order);
    else if (method === 'paypal') body.innerHTML = viewPayPal(order);
    else if (method === 'mp') body.innerHTML = viewMP(order);
    else if (method === 'transfer') body.innerHTML = viewTransfer(order);
    else if (method === 'cash') body.innerHTML = viewCash(order);

    document.querySelectorAll('.vx-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.method === method);
    });

    wireMethodEvents(method, order);
  }

  // =========================================================================
  // WIRE EVENTS PER METHOD
  // =========================================================================
  function wireMethodEvents(method, order) {
    const goBtn = document.getElementById('vx-pay-go');

    if (method === 'card') {
      const numI = document.getElementById('vx-card-num');
      const nameI = document.getElementById('vx-card-name');
      const mmI = document.getElementById('vx-card-mm');
      const yyI = document.getElementById('vx-card-yy');
      const cvvI = document.getElementById('vx-card-cvv');
      const vis = document.getElementById('vx-card-vis');
      const brandLbl = document.getElementById('vx-card-brand');
      const numDisp = document.getElementById('vx-card-num-disp');
      const nameDisp = document.getElementById('vx-card-name-disp');
      const expDisp = document.getElementById('vx-card-exp-disp');

      numI.addEventListener('input', (e) => {
        e.target.value = formatCardNumber(e.target.value);
        const brand = detectBrand(e.target.value);
        brandLbl.textContent = brand.label;
        vis.className = 'vx-card-visual brand-' + brand.brand;
        numDisp.textContent = e.target.value || '•••• •••• •••• ••••';
      });
      nameI.addEventListener('input', (e) => {
        nameDisp.textContent = (e.target.value || 'NOMBRE TITULAR').toUpperCase();
      });
      const updExp = () => { expDisp.textContent = (mmI.value || 'MM') + '/' + (yyI.value || 'AA'); };
      mmI.addEventListener('input', updExp);
      yyI.addEventListener('input', updExp);
      [mmI, yyI, cvvI].forEach((el) => el.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      }));

      goBtn.addEventListener('click', () => submitCard(order));
    }

    if (method === 'cash') {
      const inp = document.getElementById('vx-cash-in');
      const out = document.getElementById('vx-change');
      const err = document.getElementById('vx-err-cash');
      const recalc = () => {
        const v = parseFloat(inp.value) || 0;
        const change = v - order.total;
        out.textContent = fmt(Math.max(0, change));
        err.classList.toggle('show', v > 0 && v < order.total);
      };
      inp.addEventListener('input', recalc);
      document.querySelectorAll('.vx-cash-quick').forEach((b) => {
        b.addEventListener('click', () => { inp.value = b.dataset.cash; recalc(); });
      });
      goBtn.addEventListener('click', () => submitCash(order, parseFloat(inp.value) || 0));
    }

    if (method === 'paypal') goBtn.addEventListener('click', () => submitGeneric(order, 'PayPal'));
    if (method === 'mp') goBtn.addEventListener('click', () => submitGeneric(order, 'MercadoPago'));
    if (method === 'transfer') goBtn.addEventListener('click', () => submitGeneric(order, 'Transferencia'));
  }

  // =========================================================================
  // SUBMIT HANDLERS
  // =========================================================================
  async function submitCard(order) {
    const num = document.getElementById('vx-card-num').value.replace(/\s/g, '');
    const name = document.getElementById('vx-card-name').value.trim();
    const mm = document.getElementById('vx-card-mm').value;
    const yy = document.getElementById('vx-card-yy').value;
    const cvv = document.getElementById('vx-card-cvv').value;
    const errForm = document.getElementById('vx-err-form');
    const errNum = document.getElementById('vx-err-num');
    const brand = detectBrand(num);

    let ok = true;
    if (!luhnCheck(num)) { errNum.classList.add('show'); ok = false; } else errNum.classList.remove('show');
    if (!name || name.length < 3) ok = false;
    if (!validateExpiry(mm, yy)) ok = false;
    if (!validateCVV(cvv, brand)) ok = false;

    if (!ok) { errForm.classList.add('show'); errForm.textContent = 'Revisa los datos de la tarjeta'; return; }
    errForm.classList.remove('show');

    await processPayment(order, {
      method: 'Tarjeta ' + brand.label,
      details: { last4: num.slice(-4), brand: brand.label, holder: name, exp: mm + '/' + yy },
    });
  }

  async function submitCash(order, received) {
    if (received < order.total) {
      document.getElementById('vx-err-cash').classList.add('show');
      return;
    }
    await processPayment(order, {
      method: 'Efectivo',
      details: { received, change: received - order.total },
    });
  }

  async function submitGeneric(order, label) {
    await processPayment(order, { method: label, details: {} });
  }

  // =========================================================================
  // PROCESS (mock setTimeout)
  // =========================================================================
  async function processPayment(order, meta) {
    if (VolvixPayments.processing) return;
    VolvixPayments.processing = true;
    const btn = document.getElementById('vx-pay-go');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="vx-spinner"></span>Procesando...';
    }

    await sleep(1400 + Math.random() * 800);

    // 95% success mock
    const success = Math.random() > 0.05;
    const tx = {
      id: uid(),
      orderId: order.id,
      total: order.total,
      method: meta.method,
      details: meta.details,
      status: success ? 'approved' : 'declined',
      ts: new Date().toISOString(),
      items: order.items || [],
    };
    VolvixPayments.transactions.push(tx);
    saveHistory();
    VolvixPayments.processing = false;

    if (success) showReceipt(tx);
    else showError(tx);
  }

  // =========================================================================
  // RECEIPT
  // =========================================================================
  function showReceipt(tx) {
    const body = document.getElementById('vx-pay-body');
    if (!body) return;
    const items = (tx.items || []).map(
      (i) => `<div class="vx-receipt-line"><span>${i.qty || 1}x ${i.name}</span><span>${fmt((i.qty||1)*i.price)}</span></div>`
    ).join('') || '<div class="vx-receipt-line"><span>Venta</span><span>'+fmt(tx.total)+'</span></div>';

    let extra = '';
    if (tx.method === 'Efectivo') {
      extra = `<div class="vx-receipt-line"><span>Recibido</span><span>${fmt(tx.details.received)}</span></div>
               <div class="vx-receipt-line"><span>Cambio</span><span>${fmt(tx.details.change)}</span></div>`;
    } else if (tx.details.last4) {
      extra = `<div class="vx-receipt-line"><span>${tx.details.brand}</span><span>•••• ${tx.details.last4}</span></div>`;
    }

    body.innerHTML = `
      <div class="vx-receipt">
        <h3>VOLVIX POS</h3>
        <div class="center">Recibo digital</div>
        <div class="center">${new Date(tx.ts).toLocaleString()}</div>
        <div class="center">${tx.id}</div>
        <hr style="border:0;border-top:1px dashed #cbd5e1;margin:12px 0">
        ${items}
        ${extra}
        <div class="vx-receipt-line vx-receipt-total"><span>TOTAL</span><span>${fmt(tx.total)}</span></div>
        <div class="vx-receipt-line"><span>Método</span><span>${tx.method}</span></div>
        <div class="center" style="margin-top:14px;color:#10b981;font-weight:700">✓ APROBADO</div>
        <div class="center" style="margin-top:8px">¡Gracias por su compra!</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        <button class="vx-btn vx-btn-primary" data-action="print">Imprimir</button>
        <button class="vx-btn vx-btn-primary" data-action="close" style="background:#64748b">Cerrar</button>
      </div>
    `;
    body.querySelector('[data-action="print"]').addEventListener('click', () => window.print());
    if (typeof VolvixPayments.onSuccess === 'function') VolvixPayments.onSuccess(tx);
  }

  function showError(tx) {
    const body = document.getElementById('vx-pay-body');
    if (!body) return;
    body.innerHTML = `
      <div style="text-align:center;padding:30px 10px">
        <div style="font-size:48px">⚠️</div>
        <h3 style="color:#ef4444;margin:10px 0">Pago rechazado</h3>
        <p style="color:#64748b">El emisor declinó la operación. Intenta otro método.</p>
        <button class="vx-btn vx-btn-primary" data-action="retry" style="margin-top:14px">Reintentar</button>
      </div>`;
    body.querySelector('[data-action="retry"]').addEventListener('click', () => {
      renderMethod(VolvixPayments.activeMethod, VolvixPayments.currentOrder);
    });
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  function openCheckout(order, opts) {
    injectStyles();
    const safe = Object.assign({ id: uid(), total: 0, items: [] }, order || {});
    VolvixPayments.currentOrder = safe;
    VolvixPayments.onSuccess = (opts && opts.onSuccess) || null;

    const modal = buildModal(safe);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close' || e.target === modal) closeCheckout();
      const tab = e.target.closest('.vx-tab');
      if (tab) renderMethod(tab.dataset.method, safe);
    });

    renderMethod('card', safe);
  }

  function closeCheckout() {
    const m = document.getElementById('vx-pay-overlay');
    if (m) m.remove();
  }

  function showHistory() {
    injectStyles();
    const o = document.createElement('div');
    o.className = 'vx-pay-overlay';
    o.id = 'vx-pay-overlay';
    const items = VolvixPayments.transactions.slice().reverse().map((t) => `
      <div class="vx-history-item">
        <div>
          <div><b>${t.id}</b> — ${t.method}</div>
          <div class="meta">${new Date(t.ts).toLocaleString()} · Orden ${t.orderId}</div>
        </div>
        <div style="text-align:right">
          <div><b>${fmt(t.total)}</b></div>
          <div class="${t.status==='approved'?'vx-status-ok':'vx-status-err'}">${t.status==='approved'?'✓ Aprobado':'✗ Rechazado'}</div>
        </div>
      </div>
    `).join('') || '<div style="padding:30px;text-align:center;color:#64748b">Sin transacciones aún.</div>';

    o.innerHTML = `
      <div class="vx-pay-modal">
        <div class="vx-pay-head">
          <h2>Historial de Transacciones</h2>
          <button class="vx-pay-close" data-action="close">×</button>
        </div>
        <div class="vx-history-list">${items}</div>
      </div>`;
    o.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close' || e.target === o) o.remove();
    });
    document.body.appendChild(o);
  }

  // =========================================================================
  // EXPORT
  // =========================================================================
  global.VolvixPayments = {
    open: openCheckout,
    close: closeCheckout,
    history: showHistory,
    getTransactions: () => VolvixPayments.transactions.slice(),
    clearHistory: () => { VolvixPayments.transactions = []; saveHistory(); },
    // helpers expuestos para tests
    _luhn: luhnCheck,
    _detectBrand: detectBrand,
    _validateExpiry: validateExpiry,
  };

  // Auto-wire: cualquier botón con [data-volvix-pay] dispara el checkout
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-volvix-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const total = parseFloat(btn.dataset.total) || 0;
        openCheckout({ total, items: [] });
      });
    });
  });

  console.log('[Volvix Payments] wiring loaded — use VolvixPayments.open({total, items})');
})(window);
