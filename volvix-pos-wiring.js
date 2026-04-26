/* ============================================================
   VOLVIX · POS COMPLETE WIRING
   Cablea TODOS los módulos de SalvadoreX POS
   - Inventario, Clientes, Reportes, Configuración
   - Compras, Ventas, Devoluciones, Cotizaciones
   - Corte de caja, Apertura, Promociones
============================================================ */
(function() {
  'use strict';

  const API = location.origin;
  let session = null;

  console.log('%c[POS-COMPLETE]', 'background:#EC4899;color:#fff;padding:2px 6px;border-radius:3px',
              'Cableado POS completo activo');

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem('volvixSession') || 'null'); }
    catch { session = null; }
    return session;
  }

  async function apiGet(path) {
    try {
      const res = await fetch(API + path);
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: e.message }; }
  }

  async function apiPatch(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: e.message }; }
  }

  // =========================================================
  // INVENTARIO
  // =========================================================
  window.posLoadInventory = async function() {
    const products = await apiGet('/api/inventory');
    if (!products) return;

    const tbody = document.querySelector('#inv-body, [data-inventory-body]');
    if (tbody) {
      tbody.innerHTML = products.map((p, i) => `
        <tr>
          <td class="mono" style="font-size:11px;color:var(--text-3);">${p.code}</td>
          <td class="primary-col">${p.name}</td>
          <td><span class="chip">${p.category || 'General'}</span></td>
          <td class="num">$${parseFloat(p.price).toFixed(2)}</td>
          <td class="num">${p.stock}</td>
          <td>${p.stock < 20 ? '<span class="chip warn"><span class="dot"></span>Stock bajo</span>' : '<span class="chip ok"><span class="dot"></span>OK</span>'}</td>
          <td style="text-align:right;">
            <button class="btn sm" onclick="posEditProduct('${p.id}')">Editar</button>
            <button class="btn sm" onclick="posAdjustStock('${p.id}', ${p.stock})">📦</button>
          </td>
        </tr>
      `).join('');
    }

    return products;
  };

  window.posAddProduct = async function() {
    const code = prompt('Código de barras:');
    if (!code) return;
    const name = prompt('Nombre del producto:');
    if (!name) return;
    const price = parseFloat(prompt('Precio de venta:') || '0');
    const cost = parseFloat(prompt('Costo:') || '0');
    const stock = parseInt(prompt('Stock inicial:') || '0');
    const category = prompt('Categoría:', 'general') || 'general';

    try {
      const result = await apiPost('/api/products', {
        pos_user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        code, name, price, cost, stock, category
      });
      if (typeof window.showToast === 'function') {
        window.showToast('✓ Producto agregado: ' + name);
      }
      window.posLoadInventory();
      // Refresh CATALOG global
      if (typeof window.CATALOG !== 'undefined') {
        window.CATALOG.push({ code, name, price, cost, stock });
      }
      return result;
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.posEditProduct = async function(productId) {
    const newPrice = prompt('Nuevo precio:');
    if (!newPrice) return;
    try {
      await apiPatch(`/api/products/${productId}`, { price: parseFloat(newPrice) });
      if (typeof window.showToast === 'function') window.showToast('✓ Producto actualizado');
      window.posLoadInventory();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.posAdjustStock = async function(productId, currentStock) {
    const adjustment = prompt(`Stock actual: ${currentStock}\nIngresa nueva cantidad:`);
    if (!adjustment) return;
    try {
      await apiPost('/api/inventory/adjust', {
        product_id: productId,
        new_stock: parseInt(adjustment)
      });
      if (typeof window.showToast === 'function') window.showToast('✓ Stock ajustado');
      window.posLoadInventory();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // =========================================================
  // CLIENTES
  // =========================================================
  window.posLoadCustomers = async function() {
    const customers = await apiGet('/api/customers');
    if (!customers) return;

    const tbody = document.querySelector('#cli-body, [data-customers-body]');
    if (tbody) {
      tbody.innerHTML = customers.slice(0, 50).map(c => `
        <tr>
          <td class="primary-col">${c.name || 'Sin nombre'}</td>
          <td style="color:var(--text-3);">${c.phone || c.email || '-'}</td>
          <td class="num">$${parseFloat(c.credit_balance || 0).toFixed(2)}</td>
          <td class="num" style="color:${(c.credit_balance || 0) > 0 ? 'var(--danger)' : 'inherit'};">
            $${parseFloat(c.credit_limit || 0).toFixed(2)}
          </td>
          <td class="num">${c.points || 0}</td>
          <td style="color:var(--text-3);font-size:11px;">${c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
          <td style="text-align:right;">
            <button class="btn sm" onclick="posEditCustomer('${c.id}')">Ver</button>
          </td>
        </tr>
      `).join('');
    }

    return customers;
  };

  window.posAddCustomer = async function() {
    const name = prompt('Nombre del cliente:');
    if (!name) return;
    const phone = prompt('Teléfono:') || '';
    const email = prompt('Email:') || '';
    const creditLimit = parseFloat(prompt('Límite de crédito:') || '0');

    try {
      const result = await apiPost('/api/customers', {
        name, phone, email,
        credit_limit: creditLimit,
        credit_balance: 0,
        active: true
      });
      if (typeof window.showToast === 'function') window.showToast('✓ Cliente agregado');
      window.posLoadCustomers();
      return result;
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.posEditCustomer = async function(customerId) {
    const action = prompt('1) Ver datos\n2) Aplicar abono\n3) Eliminar\n\nElige (1-3):');
    if (action === '2') {
      const amount = parseFloat(prompt('Monto del abono:') || '0');
      try {
        await apiPatch(`/api/customers/${customerId}`, { credit_balance: -amount });
        if (typeof window.showToast === 'function') window.showToast('✓ Abono aplicado');
        window.posLoadCustomers();
      } catch (e) { alert('Error: ' + e.message); }
    } else if (action === '3') {
      if (confirm('¿Eliminar cliente?')) {
        try {
          await fetch(API + `/api/customers/${customerId}`, { method: 'DELETE' });
          if (typeof window.showToast === 'function') window.showToast('✓ Cliente eliminado');
          window.posLoadCustomers();
        } catch (e) { alert('Error: ' + e.message); }
      }
    }
  };

  // =========================================================
  // REPORTES
  // =========================================================
  window.posLoadReports = async function() {
    const [sales, daily] = await Promise.all([
      apiGet('/api/reports/sales'),
      apiGet('/api/reports/daily')
    ]);

    return { sales, daily };
  };

  window.posShowSalesReport = async function() {
    const { sales, daily } = await window.posLoadReports();

    const total = (sales?.sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const count = sales?.count || 0;
    const avgTicket = count > 0 ? total / count : 0;

    const msg = `📊 REPORTE DE VENTAS\n\n` +
                `Total ventas: ${count}\n` +
                `Ingresos totales: $${total.toFixed(2)}\n` +
                `Ticket promedio: $${avgTicket.toFixed(2)}\n\n` +
                `📅 Reporte diario:\n` +
                (daily || []).slice(0, 5).map(d =>
                  `${d.sale_date}: ${d.total_transactions} ventas · $${d.total_revenue}`
                ).join('\n');

    alert(msg);
  };

  window.posExportReport = async function(type) {
    type = type || 'sales';
    const data = await apiGet('/api/reports/' + type);
    if (!data) return;

    const csv = jsonToCSV(data.sales || data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volvix-${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function jsonToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => JSON.stringify(row[h] !== undefined ? row[h] : '')).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  // =========================================================
  // CORTE DE CAJA
  // =========================================================
  window.posCorteCaja = async function() {
    const session_id = session?.user_id;
    const sales = await apiGet(`/api/sales?user_id=${session_id}`);
    if (!sales) return alert('No se pudieron cargar las ventas');

    const today = new Date().toDateString();
    const todaySales = (sales || []).filter(s =>
      new Date(s.created_at).toDateString() === today
    );

    const total = todaySales.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const efectivo = todaySales.filter(s => s.payment_method === 'efectivo')
                                .reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const tarjeta = todaySales.filter(s => s.payment_method === 'tarjeta')
                               .reduce((s, x) => s + parseFloat(x.total || 0), 0);

    const msg = `💰 CORTE DE CAJA\n` +
                `Fecha: ${new Date().toLocaleDateString()}\n` +
                `Cajero: ${session?.email}\n\n` +
                `Total de ventas: ${todaySales.length}\n` +
                `Efectivo: $${efectivo.toFixed(2)}\n` +
                `Tarjeta: $${tarjeta.toFixed(2)}\n` +
                `─────────────────────\n` +
                `TOTAL: $${total.toFixed(2)}`;

    if (confirm(msg + '\n\n¿Imprimir corte?')) {
      window.print();
    }
  };

  // =========================================================
  // APERTURA DE CAJA
  // =========================================================
  window.posAperturaCaja = async function() {
    const inicial = parseFloat(prompt('Monto inicial en caja:') || '0');
    if (!inicial) return;

    localStorage.setItem('volvix:caja-inicial', JSON.stringify({
      monto: inicial,
      apertura_at: Date.now(),
      cajero: session?.email
    }));

    if (typeof window.showToast === 'function') {
      window.showToast(`✓ Caja abierta con $${inicial.toFixed(2)}`);
    }
  };

  // =========================================================
  // DEVOLUCIONES
  // =========================================================
  window.posDevolucion = async function() {
    const folio = prompt('Folio del ticket a devolver:');
    if (!folio) return;
    const motivo = prompt('Motivo de la devolución:') || 'Sin especificar';

    // Buscar la venta
    const sales = await apiGet('/api/sales');
    const sale = (sales || []).find(s => s.id === folio || (s.id || '').includes(folio));

    if (!sale) return alert('Ticket no encontrado');

    if (!confirm(`Devolver ticket ${sale.id}\nTotal: $${sale.total}\n¿Confirmar?`)) return;

    try {
      // Crear venta negativa
      await apiPost('/api/sales', {
        user_id: session?.user_id,
        total: -parseFloat(sale.total),
        payment_method: sale.payment_method,
        items: (sale.items || []).map(i => ({ ...i, qty: -i.qty, subtotal: -i.subtotal }))
      });

      if (typeof window.showToast === 'function') {
        window.showToast('✓ Devolución registrada');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // =========================================================
  // COTIZACIONES
  // =========================================================
  window.posCotizar = function() {
    const cart = window.CART || [];
    if (cart.length === 0) return alert('No hay productos en el carrito');

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const cotizacion = {
      id: 'COT-' + Date.now(),
      fecha: new Date().toISOString(),
      items: cart,
      total,
      cajero: session?.email
    };

    // Guardar en localStorage
    const cots = JSON.parse(localStorage.getItem('volvix:cotizaciones') || '[]');
    cots.push(cotizacion);
    localStorage.setItem('volvix:cotizaciones', JSON.stringify(cots));

    if (typeof window.showToast === 'function') {
      window.showToast(`✓ Cotización ${cotizacion.id} guardada`);
    }
  };

  // =========================================================
  // GENERIC BUTTON WIRING
  // =========================================================
  function wireAllButtons() {
    document.querySelectorAll('button:not([data-wired])').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const onclick = btn.getAttribute('onclick') || '';

      if (onclick.includes('pos') && (onclick.includes('Add') || onclick.includes('Edit') || onclick.includes('Load'))) {
        btn.dataset.wired = 'true';
        return;
      }

      // Inventario
      if (text === 'agregar producto' || text === 'nuevo producto' || text === '+ producto') {
        btn.onclick = (e) => { e.preventDefault(); window.posAddProduct(); };
        btn.dataset.wired = 'true';
      }
      // Clientes
      else if (text === 'agregar cliente' || text === 'nuevo cliente' || text === '+ cliente') {
        btn.onclick = (e) => { e.preventDefault(); window.posAddCustomer(); };
        btn.dataset.wired = 'true';
      }
      // Reportes
      else if (text.includes('reporte de ventas') || text === 'ver reporte') {
        btn.onclick = (e) => { e.preventDefault(); window.posShowSalesReport(); };
        btn.dataset.wired = 'true';
      }
      else if (text.includes('exportar reporte') || text.includes('descargar reporte')) {
        btn.onclick = (e) => { e.preventDefault(); window.posExportReport('sales'); };
        btn.dataset.wired = 'true';
      }
      // Corte de caja
      else if (text.includes('corte de caja') || text.includes('cerrar caja')) {
        btn.onclick = (e) => { e.preventDefault(); window.posCorteCaja(); };
        btn.dataset.wired = 'true';
      }
      // Apertura caja
      else if (text.includes('apertura') || text.includes('abrir caja')) {
        btn.onclick = (e) => { e.preventDefault(); window.posAperturaCaja(); };
        btn.dataset.wired = 'true';
      }
      // Devolución
      else if (text.includes('devoluci') || text.includes('reembolso')) {
        btn.onclick = (e) => { e.preventDefault(); window.posDevolucion(); };
        btn.dataset.wired = 'true';
      }
      // Cotización
      else if (text.includes('cotizar') || text.includes('cotización')) {
        btn.onclick = (e) => { e.preventDefault(); window.posCotizar(); };
        btn.dataset.wired = 'true';
      }
    });
  }

  // =========================================================
  // SCREEN INTERCEPTOR (cargar datos al cambiar de pantalla)
  // =========================================================
  function setupScreenInterceptor() {
    if (typeof window.showScreen === 'function' && !window._screenIntercepted) {
      const original = window.showScreen;
      window.showScreen = function(name, ...args) {
        const result = original.apply(this, [name, ...args]);

        // Cargar datos según la pantalla
        setTimeout(() => {
          if (name === 'inventario') window.posLoadInventory();
          else if (name === 'clientes') window.posLoadCustomers();
          else if (name === 'reportes' || name === 'ventas') window.posLoadReports();
        }, 100);

        return result;
      };
      window._screenIntercepted = true;
    }
  }

  // =========================================================
  // INIT
  // =========================================================
  function init() {
    loadSession();

    // Wire buttons inmediato
    wireAllButtons();

    // Setup screen interceptor
    setupScreenInterceptor();

    // Re-wire periódicamente
    setInterval(() => {
      wireAllButtons();
      setupScreenInterceptor();
    }, 2000);

    console.log('[POS-COMPLETE] ✅ Listo');
  }

  // Exponer API
  window.POSAPI = {
    loadInventory: window.posLoadInventory,
    loadCustomers: window.posLoadCustomers,
    loadReports: window.posLoadReports,
    addProduct: window.posAddProduct,
    addCustomer: window.posAddCustomer,
    showSalesReport: window.posShowSalesReport,
    exportReport: window.posExportReport,
    corteCaja: window.posCorteCaja,
    aperturaCaja: window.posAperturaCaja,
    devolucion: window.posDevolucion,
    cotizar: window.posCotizar,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
