--- updateTotals() codigo:
function updateTotals() {
    const total = CART.reduce((s,i) => s + i.price * i.qty, 0);
    const count = CART.reduce((s,i) => s + i.qty, 0);
    $('#item-count').textContent = count;
    $('#total-big').textContent = fmt(total);
    $('#footer-total').textContent = fmt(total);
  }

  /* ============ GAP-2: MULTI-TAB CART SYNC ============ */
  // BroadcastChannel para invalidar carrito en otras

Aplica IVA? False
