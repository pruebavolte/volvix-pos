// volvix-returns-wiring.js — UI cliente para devoluciones (R17)
// Workflow: select sale -> checkbox items -> reason dropdown -> method -> submit.
(function () {
  'use strict';
  const REASONS = [
    'defective','wrong_item','customer_changed_mind',
    'damaged_in_transit','expired','other'
  ];
  const METHODS = ['cash','card','store_credit','gift_card'];

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }, opts || {}));
    return r.json();
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'style') n.style.cssText = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  async function renderReturnsForm(container, saleId) {
    container.innerHTML = '';
    const sale = await api('/api/sales/' + saleId).catch(() => null);
    if (!sale || !sale.items) {
      container.appendChild(el('div', { class: 'err' }, ['Venta no encontrada']));
      return;
    }
    const itemsBox = el('div', { class: 'returns-items' }, []);
    sale.items.forEach((it, idx) => {
      const cb = el('input', { type: 'checkbox', 'data-idx': idx });
      const qty = el('input', { type: 'number', min: '1', max: String(it.qty||1), value: String(it.qty||1), 'data-qty': idx, style: 'width:60px' });
      itemsBox.appendChild(el('label', {}, [cb, ' ', it.name||it.product_id, ' x ', qty]));
      itemsBox.appendChild(el('br'));
    });
    const reasonSel = el('select', { id: 'ret_reason' },
      REASONS.map(r => el('option', { value: r }, [r])));
    const methodSel = el('select', { id: 'ret_method' },
      METHODS.map(m => el('option', { value: m }, [m])));
    const submitBtn = el('button', { type: 'button', class: 'btn-primary' }, ['Submit Return']);
    const msg = el('div', { id: 'ret_msg' }, []);

    submitBtn.addEventListener('click', async () => {
      const items_returned = [];
      itemsBox.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
        const idx = Number(cb.getAttribute('data-idx'));
        const orig = sale.items[idx];
        const qtyEl = itemsBox.querySelector(`input[data-qty="${idx}"]`);
        items_returned.push({
          product_id: orig.product_id || orig.id,
          qty: Number(qtyEl.value) || 1,
          price: Number(orig.price) || 0
        });
      });
      if (!items_returned.length) {
        msg.textContent = 'Selecciona al menos un item';
        return;
      }
      const resp = await api('/api/returns', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: saleId,
          items_returned,
          reason: reasonSel.value,
          refund_method: methodSel.value,
          restock_qty: true
        })
      });
      msg.textContent = resp.error ? ('Error: ' + resp.error) : ('OK return id=' + (resp.id || ''));
    });

    container.appendChild(el('h3', {}, ['Devolución venta ' + saleId]));
    container.appendChild(itemsBox);
    container.appendChild(el('div', {}, ['Razón: ', reasonSel]));
    container.appendChild(el('div', {}, ['Método: ', methodSel]));
    container.appendChild(submitBtn);
    container.appendChild(msg);
  }

  window.VolvixReturns = { render: renderReturnsForm };
})();
