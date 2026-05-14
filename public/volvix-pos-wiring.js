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
  // VOLVIXUI HELPERS — Migración prompt/confirm/alert
  // =========================================================
  function uiAvailable() {
    return !!(window.VolvixUI && typeof window.VolvixUI.form === 'function');
  }

  function uiToast(msg, type) {
    type = type || 'info';
    if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
      try { window.VolvixUI.toast({ type: type === 'warn' ? 'warning' : type, message: msg }); return; } catch {}
    }
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, type); return; } catch {}
    }
    const div = document.createElement('div');
    const bg = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : type === 'warn' ? '#d97706' : '#1e293b';
    div.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + bg + ';color:#fff;padding:12px 18px;border-radius:8px;z-index:99999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:320px;';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  async function uiForm(opts) {
    const { title, fields, submitText, onSubmit } = opts || {};
    if (uiAvailable()) {
      try {
        return await window.VolvixUI.form({
          title: title || 'Datos',
          fields: fields || [],
          submitText: submitText || 'Aceptar',
          onSubmit: onSubmit
        });
      } catch (e) { console.warn('[POS-COMPLETE] VolvixUI.form falló, fallback prompt:', e); }
    } else {
      console.warn('[POS-COMPLETE] VolvixUI no cargado, fallback prompt nativo');
    }
    const result = {};
    for (const f of (fields || [])) {
      const label = f.label || f.name;
      const def = f.default != null ? String(f.default) : '';
      const val = prompt(label + (def ? ' (' + def + ')' : '') + ':', def);
      if (val === null) return null;
      let v = (val.trim() || def);
      if (f.type === 'number') v = parseFloat(v) || 0;
      result[f.name] = v;
    }
    if (typeof onSubmit === 'function') { try { await onSubmit(result); } catch {} }
    return result;
  }

  async function uiConfirm(opts) {
    if (uiAvailable() && typeof window.VolvixUI.confirm === 'function') {
      try { return !!(await window.VolvixUI.confirm(opts)); }
      catch (e) { console.warn('[POS-COMPLETE] VolvixUI.confirm falló:', e); }
    }
    return confirm(((opts && opts.title) ? opts.title + '\n\n' : '') + ((opts && opts.message) || '¿Confirmar?'));
  }

  async function uiDestructiveConfirm(opts) {
    if (uiAvailable() && typeof window.VolvixUI.destructiveConfirm === 'function') {
      try { return !!(await window.VolvixUI.destructiveConfirm(opts)); }
      catch (e) { console.warn('[POS-COMPLETE] destructiveConfirm falló:', e); }
    } else if (uiAvailable() && typeof window.VolvixUI.confirm === 'function') {
      try { return !!(await window.VolvixUI.confirm(Object.assign({ danger: true }, opts || {}))); }
      catch (e) { console.warn('[POS-COMPLETE] confirm danger falló:', e); }
    }
    const expected = (opts && opts.requireText) || 'ELIMINAR';
    const txt = prompt(((opts && opts.message) ? opts.message + '\n\n' : '') + 'Escribe "' + expected + '" para confirmar:');
    return txt === expected;
  }

  // =========================================================
  // INVENTARIO
  // =========================================================
  window.posLoadInventory = async function() {
    // 2026-05-14: si el superadmin selecciono un tenant especifico via el dropdown
    // (id=inv-tenant-select), pasamos ?tenant_id=X al endpoint. Asi mismo tenant
    // se usa para deteccion+limpieza de duplicados (consistencia).
    let endpoint = '/api/inventory';
    try {
      const sel = document.getElementById('inv-tenant-select');
      const tid = sel && sel.value ? sel.value.trim() : '';
      if (tid) endpoint += '?tenant_id=' + encodeURIComponent(tid);
      window.__invSelectedTenantId = tid || null;
    } catch (_) {}
    const products = await apiGet(endpoint);
    if (!products) return;

    const tbody = document.querySelector('#inv-body, [data-inventory-body]');
    if (tbody) {
      // 2026-05-14 FIX TABLA DESCUADRADA: el <thead> declara 10 columnas
      // (checkbox, Codigo, Producto, Categoria, Costo, Precio, Stock, Min,
      //  Estado, Acciones). ANTES esta funcion solo generaba 7 <td>, por lo
      //  que las celdas se desplazaban: "General" caia bajo "Producto",
      //  "$169.00" bajo "Categoria", etc. Usuario reporto el desfase.
      // AHORA: emitir las 10 celdas matching el header.
      tbody.innerHTML = products.map((p) => {
        // Normalizar: si code es string "null" o vacio, mostrar "—"
        const codeRaw = (p.code === null || p.code === 'null' || p.code === undefined) ? '' : String(p.code);
        const codeDisplay = codeRaw ? codeRaw : '<span style="color:var(--danger);font-style:italic;">sin codigo</span>';
        const minSt = Number(p.min_stock || p.minimo || 20);
        const stock = Number(p.stock || 0);
        const cost = Number(p.cost || 0);
        const price = Number(p.price || 0);
        const stateChip = stock <= 0
          ? '<span class="chip err"><span class="dot"></span>Agotado</span>'
          : stock <= minSt
          ? '<span class="chip warn"><span class="dot"></span>Bajo minimo</span>'
          : '<span class="chip ok"><span class="dot"></span>OK</span>';
        const idAttr = String(p.id || codeRaw || '').replace(/'/g, "\\'");
        return `
        <tr>
          <td><input type="checkbox" class="inv-row-check" data-rowid="${idAttr}"></td>
          <td class="mono" style="font-size:11px;color:var(--text-3);">${codeDisplay}</td>
          <td class="primary-col">${p.name || ''}</td>
          <td><span class="chip">${p.category || 'General'}</span></td>
          <td class="num" style="color:var(--text-3);font-size:11px;">$${cost.toFixed(2)}</td>
          <td class="num">$${price.toFixed(2)}</td>
          <td class="num"><strong>${stock}</strong></td>
          <td class="num" style="color:var(--text-3);font-size:11px;">${minSt}</td>
          <td>${stateChip}</td>
          <td style="text-align:right;white-space:nowrap;">
            <button class="btn sm" onclick="posEditProduct('${idAttr}')" title="Editar">Editar</button>
            <button class="btn sm" onclick="posAdjustStock('${idAttr}', ${stock})" title="Ajustar stock">📦</button>
          </td>
        </tr>`;
      }).join('');
    }

    return products;
  };

  window.posAddProduct = async function() {
    const data = await uiForm({
      title: 'Agregar producto',
      submitText: 'Agregar',
      fields: [
        { name: 'code',     label: 'Código de barras', type: 'text',     required: true },
        { name: 'name',     label: 'Nombre del producto', type: 'text',  required: true },
        { name: 'price',    label: 'Precio de venta', type: 'number',    step: 0.01, min: 0, required: true },
        { name: 'cost',     label: 'Costo', type: 'number',              step: 0.01, min: 0, default: 0 },
        { name: 'stock',    label: 'Stock inicial', type: 'number',      step: 1, min: 0, default: 0 },
        { name: 'category', label: 'Categoría', type: 'text',            default: 'general' }
      ]
    });
    if (!data || !data.code || !data.name) return;
    const code = data.code, name = data.name;
    const price = parseFloat(data.price) || 0;
    const cost = parseFloat(data.cost) || 0;
    const stock = parseInt(data.stock, 10) || 0;
    const category = data.category || 'general';

    try {
      const result = await apiPost('/api/products', {
        pos_user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        code, name, price, cost, stock, category
      });
      uiToast('✓ Producto agregado: ' + name, 'success');
      window.posLoadInventory();
      // Refresh CATALOG global
      if (typeof window.CATALOG !== 'undefined') {
        window.CATALOG.push({ code, name, price, cost, stock });
      }
      return result;
    } catch (e) {
      uiToast('Error: ' + e.message, 'error');
    }
  };

  window.posEditProduct = async function(productId) {
    const data = await uiForm({
      title: 'Editar producto',
      submitText: 'Guardar',
      fields: [
        { name: 'price', label: 'Nuevo precio', type: 'number', step: 0.01, min: 0, required: true }
      ]
    });
    if (!data || data.price === undefined || data.price === '') return;
    try {
      await apiPatch(`/api/products/${productId}`, { price: parseFloat(data.price) });
      uiToast('✓ Producto actualizado', 'success');
      window.posLoadInventory();
    } catch (e) {
      uiToast('Error: ' + e.message, 'error');
    }
  };

  window.posAdjustStock = async function(productId, currentStock) {
    const data = await uiForm({
      title: 'Ajustar stock',
      submitText: 'Ajustar',
      fields: [
        { name: 'new_stock', label: `Nueva cantidad (actual: ${currentStock})`, type: 'number', step: 1, min: 0, default: currentStock, required: true }
      ]
    });
    if (!data || data.new_stock === undefined || data.new_stock === '') return;
    try {
      await apiPost('/api/inventory/adjust', {
        product_id: productId,
        new_stock: parseInt(data.new_stock, 10)
      });
      uiToast('✓ Stock ajustado', 'success');
      window.posLoadInventory();
    } catch (e) {
      uiToast('Error: ' + e.message, 'error');
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
    const data = await uiForm({
      title: 'Agregar cliente',
      submitText: 'Agregar',
      fields: [
        { name: 'name',         label: 'Nombre del cliente', type: 'text',  required: true },
        { name: 'phone',        label: 'Teléfono', type: 'tel' },
        { name: 'email',        label: 'Email', type: 'email' },
        { name: 'credit_limit', label: 'Límite de crédito', type: 'number', step: 0.01, min: 0, default: 0 }
      ]
    });
    if (!data || !data.name) return;

    try {
      const result = await apiPost('/api/customers', {
        name: data.name,
        phone: data.phone || '',
        email: data.email || '',
        credit_limit: parseFloat(data.credit_limit) || 0,
        credit_balance: 0,
        active: true
      });
      uiToast('✓ Cliente agregado', 'success');
      window.posLoadCustomers();
      return result;
    } catch (e) {
      uiToast('Error: ' + e.message, 'error');
    }
  };

  window.posEditCustomer = async function(customerId) {
    const data = await uiForm({
      title: 'Cliente — acción',
      submitText: 'Continuar',
      fields: [
        { name: 'action', label: 'Acción', type: 'radio', required: true, options: [
          { value: 'view',   label: 'Ver datos' },
          { value: 'abono',  label: 'Aplicar abono' },
          { value: 'delete', label: 'Eliminar' }
        ]}
      ]
    });
    if (!data || !data.action) return;
    if (data.action === 'abono') {
      const ab = await uiForm({
        title: 'Aplicar abono',
        submitText: 'Aplicar',
        fields: [
          { name: 'amount', label: 'Monto del abono', type: 'number', step: 0.01, min: 0, required: true }
        ]
      });
      if (!ab) return;
      const amount = parseFloat(ab.amount) || 0;
      if (amount <= 0) { uiToast('Monto inválido', 'warn'); return; }
      try {
        await apiPatch(`/api/customers/${customerId}`, { credit_balance: -amount });
        uiToast('✓ Abono aplicado', 'success');
        window.posLoadCustomers();
      } catch (e) { uiToast('Error: ' + e.message, 'error'); }
    } else if (data.action === 'delete') {
      const ok = await uiDestructiveConfirm({
        title: 'Eliminar cliente',
        message: 'Esta acción no se puede deshacer.',
        requireText: 'ELIMINAR',
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await fetch(API + `/api/customers/${customerId}`, { method: 'DELETE' });
        uiToast('✓ Cliente eliminado', 'success');
        window.posLoadCustomers();
      } catch (e) { uiToast('Error: ' + e.message, 'error'); }
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

    if (uiAvailable() && typeof window.VolvixUI.confirm === 'function') {
      try { await window.VolvixUI.confirm({ title: 'Reporte de ventas', message: msg, confirmText: 'OK', cancelText: null }); return; } catch {}
    }
    VolvixUI.toast({type:'info', message:msg});
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
    const sales = await apiGet(`/api/sales?user_id=${encodeURIComponent(session_id)}`);
    if (!sales) { uiToast('No se pudieron cargar las ventas', 'error'); return; }

    const today = new Date().toDateString();
    const todaySales = (sales || []).filter(s =>
      new Date(s.created_at).toDateString() === today
    );

    const total = todaySales.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const efectivo = todaySales.filter(s => s.payment_method === 'efectivo')
                                .reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const tarjeta = todaySales.filter(s => s.payment_method === 'tarjeta')
                               .reduce((s, x) => s + parseFloat(x.total || 0), 0);

    const summary = `💰 CORTE DE CAJA\n` +
                `Fecha: ${new Date().toLocaleDateString()}\n` +
                `Cajero: ${session?.email}\n\n` +
                `Total de ventas: ${todaySales.length}\n` +
                `Efectivo: $${efectivo.toFixed(2)}\n` +
                `Tarjeta: $${tarjeta.toFixed(2)}\n` +
                `─────────────────────\n` +
                `Esperado en caja: $${total.toFixed(2)}`;

    const data = await uiForm({
      title: 'Corte de caja',
      submitText: 'Cerrar e imprimir',
      fields: [
        { name: 'summary',      label: 'Resumen', type: 'textarea', rows: 8, default: summary, readonly: true },
        { name: 'monto_cierre', label: 'Monto contado al cierre', type: 'number', step: 0.01, min: 0, required: true, default: total.toFixed(2) },
        { name: 'notas',        label: 'Notas (opcional)', type: 'textarea', rows: 2 }
      ]
    });
    if (!data) return;
    const counted = parseFloat(data.monto_cierre) || 0;
    const diff = counted - total;
    uiToast(`Cierre registrado. Diferencia: $${diff.toFixed(2)}`, diff === 0 ? 'success' : 'warn');
    // Persistir cierre local
    try {
      const cuts = JSON.parse(localStorage.getItem('volvix:cortes-caja') || '[]');
      cuts.push({
        ts: Date.now(),
        cajero: session?.email,
        ventas: todaySales.length,
        efectivo, tarjeta, esperado: total,
        contado: counted, diff,
        notas: data.notas || ''
      });
      localStorage.setItem('volvix:cortes-caja', JSON.stringify(cuts));
    } catch {}
    window.print();
  };

  // =========================================================
  // APERTURA DE CAJA
  // =========================================================
  window.posAperturaCaja = async function() {
    const data = await uiForm({
      title: 'Apertura de caja',
      submitText: 'Abrir caja',
      fields: [
        { name: 'monto_apertura', label: 'Monto inicial en caja', type: 'number', step: 0.01, min: 0, default: 1000, required: true }
      ]
    });
    if (!data) return;
    const inicial = parseFloat(data.monto_apertura) || 0;
    if (!inicial) return;

    localStorage.setItem('volvix:caja-inicial', JSON.stringify({
      monto: inicial,
      apertura_at: Date.now(),
      cajero: session?.email
    }));

    uiToast(`✓ Caja abierta con $${inicial.toFixed(2)}`, 'success');
  };

  // =========================================================
  // DEVOLUCIONES
  // =========================================================
  window.posDevolucion = async function() {
    const data = await uiForm({
      title: 'Registrar devolución',
      submitText: 'Buscar ticket',
      fields: [
        { name: 'folio',  label: 'Folio del ticket a devolver', type: 'text', required: true },
        { name: 'motivo', label: 'Motivo de la devolución', type: 'textarea', rows: 2, default: 'Sin especificar' }
      ]
    });
    if (!data || !data.folio) return;
    const folio = data.folio;
    const motivo = data.motivo || 'Sin especificar';

    // Buscar la venta
    const sales = await apiGet('/api/sales');
    const sale = (sales || []).find(s => s.id === folio || (s.id || '').includes(folio));

    if (!sale) { uiToast('Ticket no encontrado', 'error'); return; }

    const ok = await uiDestructiveConfirm({
      title: 'Confirmar devolución',
      message: `Devolver ticket ${sale.id}\nTotal: $${sale.total}\nMotivo: ${motivo}`,
      requireText: 'DEVOLVER',
      confirmText: 'Devolver',
      danger: true
    });
    if (!ok) return;

    try {
      // Crear venta negativa
      await apiPost('/api/sales', {
        user_id: session?.user_id,
        total: -parseFloat(sale.total),
        payment_method: sale.payment_method,
        items: (sale.items || []).map(i => ({ ...i, qty: -i.qty, subtotal: -i.subtotal })),
        return_reason: motivo
      });

      uiToast('✓ Devolución registrada', 'success');
    } catch (e) {
      uiToast('Error: ' + e.message, 'error');
    }
  };

  // =========================================================
  // COTIZACIONES
  // =========================================================
  window.posCotizar = function() {
    const cart = window.CART || [];
    if (cart.length === 0) { uiToast('No hay productos en el carrito', 'warn'); return; }

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

    uiToast(`✓ Cotización ${cotizacion.id} guardada`, 'success');
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

    // 2026-05-14: Selector de tenant para superadmin (soporte cross-tenant).
    // Solo se muestra si /api/admin/tenants responde 200 (rol superadmin/platform_owner).
    setTimeout(() => { initTenantSwitcher(); }, 1500);

    console.log('[POS-COMPLETE] ✅ Listo');
  }

  async function initTenantSwitcher() {
    try {
      const wrapper = document.getElementById('inv-tenant-switcher');
      const select = document.getElementById('inv-tenant-select');
      if (!wrapper || !select || select.dataset.wired === '1') return;
      const r = await apiGet('/api/admin/tenants');
      if (!r || !r.ok || !Array.isArray(r.items)) return;
      wrapper.style.display = 'inline-flex';
      // Llenar options ordenados por nombre
      const opts = r.items
        .filter(t => t.tenant_id && t.name)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map(t => '<option value="' + t.tenant_id.replace(/"/g, '&quot;') + '">' +
                  String(t.name).replace(/</g, '&lt;') +
                  ' · ' + String(t.tenant_id).replace(/</g, '&lt;') + '</option>')
        .join('');
      select.innerHTML = '<option value="">(mi tenant)</option>' + opts;
      select.dataset.wired = '1';
      select.addEventListener('change', () => {
        // Recargar inventario con el nuevo tenant
        if (typeof window.posLoadInventory === 'function') {
          window.posLoadInventory();
        }
      });
      console.log('[POS-COMPLETE] tenant switcher cargado:', r.items.length, 'tenants');
    } catch (_) { /* not superadmin → swallow */ }
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
    askTip: window.posAskTip,
  };

  // =========================================================
  // R17 TIPS — UI propina en checkout
  // =========================================================
  // posAskTip(subtotal) → devuelve { tip_amount, tip_assigned_to } o null
  window.posAskTip = function(subtotal) {
    subtotal = Number(subtotal) || 0;
    const presets = [10, 15, 20];
    let html = '<div style="font-family:sans-serif;padding:12px;min-width:280px">';
    html += '<h3 style="margin:0 0 8px">Agregar propina</h3>';
    html += '<div style="display:flex;gap:6px;margin-bottom:8px">';
    presets.forEach(p => {
      const amt = (subtotal * p / 100).toFixed(2);
      html += `<button data-tip-pct="${p}" data-tip-amt="${amt}" style="flex:1;padding:10px;cursor:pointer">${p}%<br><small>$${amt}</small></button>`;
    });
    html += '</div>';
    html += '<label>Personalizado: $<input id="tip-custom" type="number" min="0" step="0.01" style="width:100px"></label>';
    html += '<div style="margin-top:8px"><button id="tip-skip">Sin propina</button> <button id="tip-confirm" style="background:#0a0;color:#fff;padding:6px 12px">Aceptar</button></div>';
    html += '</div>';
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:99999';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.3)';
      box.innerHTML = html;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      let chosen = 0;
      box.querySelectorAll('[data-tip-pct]').forEach(btn => {
        btn.addEventListener('click', () => {
          chosen = Number(btn.dataset.tipAmt);
          box.querySelectorAll('[data-tip-pct]').forEach(b => b.style.background = '');
          btn.style.background = '#cfc';
          box.querySelector('#tip-custom').value = '';
        });
      });
      box.querySelector('#tip-custom').addEventListener('input', e => {
        chosen = Number(e.target.value) || 0;
        box.querySelectorAll('[data-tip-pct]').forEach(b => b.style.background = '');
      });
      const close = (val) => { document.body.removeChild(overlay); resolve(val); };
      box.querySelector('#tip-skip').addEventListener('click', () => close(null));
      box.querySelector('#tip-confirm').addEventListener('click', () => {
        if (chosen <= 0) return close(null);
        const session = JSON.parse(localStorage.getItem('volvix_session') || '{}');
        close({ tip_amount: Math.round(chosen * 100) / 100, tip_assigned_to: session.user_id || null });
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
