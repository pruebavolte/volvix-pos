/**
 * volvix-reports-wiring.js
 * Volvix POS — Generador de reportes PDF (sin librerías externas).
 * Usa print stylesheet del navegador. Cada reporte abre en ventana nueva,
 * se auto-imprime y permite cerrar manualmente o auto-cerrar.
 *
 * Reportes incluidos:
 *  1. Ventas (con totales, por producto, por método de pago)
 *  2. Inventario (stock actual, valores, alertas)
 *  3. Clientes (con saldos)
 *  4. Estado de cuenta cliente (movimientos)
 *  5. Cierre de caja
 *  6. Ticket de venta (formato 80mm)
 *
 * Datos: Supabase vía endpoints /api/* del backend.
 * Filtros: fecha (desde/hasta), producto, cliente, método de pago.
 */
(function() {
  'use strict';

  const API = location.origin;
  const VERSION = '7.0.0';
  const BRAND_COLOR = '#1e40af';
  const BRAND_ACCENT = '#0ea5e9';

  // ───────────────────────── Helpers de red ─────────────────────────
  async function getData(endpoint) {
    try {
      const r = await fetch(API + endpoint, { credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[Reports] getData fallo:', endpoint, e);
      return null;
    }
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('volvixSession') || '{}'); }
    catch { return {}; }
  }

  function fmt(n, dec) {
    const v = parseFloat(n || 0);
    return '$' + v.toFixed(dec == null ? 2 : dec);
  }

  function fmtDate(d) {
    try { return new Date(d || Date.now()).toLocaleString(); }
    catch { return '-'; }
  }

  function fmtDateShort(d) {
    try { return new Date(d || Date.now()).toLocaleDateString(); }
    catch { return '-'; }
  }

  function inRange(date, from, to) {
    if (!from && !to) return true;
    const t = new Date(date).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to + 'T23:59:59').getTime()) return false;
    return true;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ───────────────────────── Logo SVG embebido ─────────────────────────
  const LOGO_SVG = `
    <svg width="42" height="42" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${BRAND_COLOR}"/>
          <stop offset="1" stop-color="${BRAND_ACCENT}"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill="url(#g1)"/>
      <path d="M20 16 L32 44 L44 16 L38 16 L32 32 L26 16 Z" fill="#fff"/>
    </svg>
  `;

  // ───────────────────────── Plantilla base ─────────────────────────
  function reportTemplate(title, content, opts) {
    opts = opts || {};
    const sess = getSession();
    const user = sess.email || sess.username || 'Anónimo';
    const subtitle = opts.subtitle || '';
    const autoPrint = opts.autoPrint !== false;
    const autoClose = opts.autoClose === true;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — Volvix POS</title>
  <style>
    @media print {
      @page { margin: 1cm; size: A4; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 30px; max-width: 820px; margin: 0 auto;
      color: #111; background: #fff;
    }
    .brand-header {
      display: flex; align-items: center; gap: 14px;
      border-bottom: 3px solid ${BRAND_COLOR}; padding-bottom: 12px;
    }
    .brand-header h1 {
      margin: 0; color: ${BRAND_COLOR}; font-size: 26px; letter-spacing: -0.3px;
    }
    .brand-header .tag {
      font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;
    }
    h2 { color: #475569; margin-top: 26px; font-size: 16px; border-left: 4px solid ${BRAND_ACCENT}; padding-left: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th { background: ${BRAND_COLOR}; color: white; padding: 9px 10px; text-align: left; font-weight: 600; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .total-row td { font-weight: bold; background: ${BRAND_COLOR} !important; color: white; border: none; }
    .header-info { display: flex; justify-content: space-between; margin: 18px 0; font-size: 12px; }
    .stamp { text-align: right; font-size: 11px; color: #64748b; }
    .footer {
      margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8;
      border-top: 1px solid #e2e8f0; padding-top: 10px;
    }
    .num { text-align: right; font-family: ui-monospace, 'SF Mono', Consolas, monospace; }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 10px; background: #f1f5f9; color: #334155; text-transform: uppercase;
    }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red   { background: #fee2e2; color: #991b1b; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .neg { color: #dc2626; font-weight: 600; }
    .pos { color: #059669; }
    .toolbar {
      position: fixed; top: 12px; right: 12px; display: flex; gap: 6px;
    }
    .toolbar button {
      padding: 8px 14px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer;
      border-radius: 6px; font-size: 12px;
    }
    .toolbar button.primary { background: ${BRAND_COLOR}; color: #fff; border-color: ${BRAND_COLOR}; }
    .signatures { margin-top: 50px; display: flex; justify-content: space-around; font-size: 12px; }
    .signatures div { text-align: center; min-width: 200px; }
    .signatures .line { border-top: 1px solid #111; padding-top: 4px; margin-top: 40px; }
    .empty { padding: 30px; text-align: center; color: #94a3b8; font-style: italic; }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="primary" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <div class="brand-header">
    ${LOGO_SVG}
    <div>
      <h1>Volvix POS · ${escapeHtml(title)}</h1>
      <div class="tag">Reporte oficial · v${VERSION}</div>
    </div>
  </div>
  <div class="header-info">
    <div>
      <strong>Generado:</strong> ${fmtDate(Date.now())}<br>
      <strong>Por:</strong> ${escapeHtml(user)}
    </div>
    <div class="stamp">${escapeHtml(subtitle)}</div>
  </div>
  ${content}
  <div class="footer">
    Generado por Volvix POS v${VERSION} · ${escapeHtml(location.hostname)} · ${fmtDate(Date.now())}
  </div>
  ${autoPrint ? `<script>
    window.onload = () => {
      setTimeout(() => {
        window.print();
        ${autoClose ? 'setTimeout(() => window.close(), 800);' : ''}
      }, 400);
    };
  <\/script>` : ''}
</body>
</html>`;
  }

  function openReport(title, content, opts) {
    const w = window.open('', '_blank', 'width=900,height=900');
    if (!w) { VolvixUI.toast({type:'info', message:'Habilita pop-ups para ver el reporte'}); return null; }
    w.document.write(reportTemplate(title, content, opts || {}));
    w.document.close();
    return w;
  }

  // ───────────────────────── Filtros UI ─────────────────────────
  async function promptFilters(opts) {
    opts = opts || {};
    const today = new Date().toISOString().slice(0, 10);
    const ui = window.VolvixUI;
    if (ui && typeof ui.form === 'function') {
      const fields = [
        { name: 'from', label: 'Desde', type: 'date', default: opts.defaultFrom || '' },
        { name: 'to',   label: 'Hasta', type: 'date', default: opts.defaultTo || today }
      ];
      if (opts.tipoOptions)        fields.push({ name: 'tipo', label: 'Tipo', type: 'select', options: opts.tipoOptions, default: opts.defaultTipo || '' });
      if (opts.agrupacionOptions)  fields.push({ name: 'agrupacion', label: 'Agrupación', type: 'select', options: opts.agrupacionOptions, default: opts.defaultAgrupacion || '' });
      const res = await Promise.resolve(ui.form({
        title: opts.title || 'Filtrar reporte',
        fields,
        submitText: 'Aplicar'
      })).catch(() => null);
      if (!res) return null;
      return {
        from: res.from || null,
        to: res.to || null,
        tipo: res.tipo || null,
        agrupacion: res.agrupacion || null
      };
    }
    const from = prompt('Fecha desde (YYYY-MM-DD) o vacío:', opts.defaultFrom || '');
    if (from === null) return null;
    const to = prompt('Fecha hasta (YYYY-MM-DD) o vacío:', opts.defaultTo || today);
    if (to === null) return null;
    return { from: from || null, to: to || null };
  }

  // ───────────────────────── 1. Reporte de ventas ─────────────────────────
  window.reportSales = async function(filters) {
    filters = filters || (await promptFilters()) || {};
    const sales = await getData('/api/sales');
    if (!sales || !Array.isArray(sales)) {
      return VolvixUI.toast({type:'error', message:'Error obteniendo ventas'});
    }
    const filtered = sales.filter(s => inRange(s.created_at || Date.now(), filters.from, filters.to));

    const total = filtered.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const cost  = filtered.reduce((s, x) => s + parseFloat(x.cost_total || 0), 0);
    const avg   = filtered.length ? total / filtered.length : 0;

    const byMethod = {};
    const byProduct = {};
    filtered.forEach(s => {
      const m = s.payment_method || 'efectivo';
      byMethod[m] = (byMethod[m] || 0) + parseFloat(s.total || 0);
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach(i => {
        const key = i.name || i.product_name || ('SKU ' + (i.product_id || '?'));
        if (!byProduct[key]) byProduct[key] = { qty: 0, total: 0 };
        byProduct[key].qty += parseInt(i.qty || i.quantity || 1);
        byProduct[key].total += parseFloat(i.price || 0) * parseInt(i.qty || i.quantity || 1);
      });
    });

    const subtitle = `${filtered.length} ventas · ${filters.from || 'inicio'} → ${filters.to || 'hoy'}`;

    const content = `
      <h2>Resumen Global</h2>
      <table>
        <tr><th>Métrica</th><th class="num">Valor</th></tr>
        <tr><td>Total ventas</td><td class="num">${filtered.length}</td></tr>
        <tr><td>Ingresos totales</td><td class="num">${fmt(total)}</td></tr>
        <tr><td>Costo de ventas (estimado)</td><td class="num">${fmt(cost)}</td></tr>
        <tr><td>Margen bruto</td><td class="num pos">${fmt(total - cost)}</td></tr>
        <tr><td>Ticket promedio</td><td class="num">${fmt(avg)}</td></tr>
      </table>

      <h2>Por método de pago</h2>
      <table>
        <tr><th>Método</th><th class="num">Total</th><th class="num">% del total</th></tr>
        ${Object.entries(byMethod).map(([m, t]) => `
          <tr>
            <td><span class="badge">${escapeHtml(m)}</span></td>
            <td class="num">${fmt(t)}</td>
            <td class="num">${total ? ((t / total) * 100).toFixed(1) : 0}%</td>
          </tr>`).join('') || '<tr><td colspan="3" class="empty">Sin datos</td></tr>'}
      </table>

      <h2>Top productos vendidos</h2>
      <table>
        <tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Total</th></tr>
        ${Object.entries(byProduct)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 30)
          .map(([k, v]) => `
            <tr>
              <td>${escapeHtml(k)}</td>
              <td class="num">${v.qty}</td>
              <td class="num">${fmt(v.total)}</td>
            </tr>`).join('') || '<tr><td colspan="3" class="empty">Sin productos</td></tr>'}
      </table>

      <h2>Detalle de ventas (últimas 50)</h2>
      <table>
        <tr><th>ID</th><th>Fecha</th><th>Cliente</th><th>Método</th><th class="num">Total</th></tr>
        ${filtered.slice(-50).reverse().map(s => `
          <tr>
            <td>${escapeHtml(String(s.id || '').slice(0, 8))}</td>
            <td>${fmtDate(s.created_at)}</td>
            <td>${escapeHtml(s.customer_name || '-')}</td>
            <td><span class="badge">${escapeHtml(s.payment_method || 'efectivo')}</span></td>
            <td class="num">${fmt(s.total)}</td>
          </tr>`).join('') || '<tr><td colspan="5" class="empty">Sin ventas en el rango</td></tr>'}
        <tr class="total-row"><td colspan="4">TOTAL</td><td class="num">${fmt(total)}</td></tr>
      </table>
    `;

    openReport('Reporte de Ventas', content, { subtitle });
  };

  // ───────────────────────── 2. Reporte de inventario ─────────────────────────
  window.reportInventory = async function(opts) {
    opts = opts || {};
    const products = await getData('/api/products');
    if (!products || !Array.isArray(products)) return VolvixUI.toast({type:'error', message:'Error obteniendo productos'});

    let filtered = products;
    if (opts.search) {
      const q = String(opts.search).toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q)
      );
    }

    const totalValue = filtered.reduce((s, p) => s + (parseFloat(p.price || 0) * parseInt(p.stock || 0)), 0);
    const totalCost  = filtered.reduce((s, p) => s + (parseFloat(p.cost  || 0) * parseInt(p.stock || 0)), 0);
    const lowStock   = filtered.filter(p => parseInt(p.stock || 0) <= parseInt(p.min_stock || 5));
    const noStock    = filtered.filter(p => parseInt(p.stock || 0) === 0);

    const content = `
      <h2>Resumen de Inventario</h2>
      <table>
        <tr><th>Métrica</th><th class="num">Valor</th></tr>
        <tr><td>Total productos</td><td class="num">${filtered.length}</td></tr>
        <tr><td>Sin stock</td><td class="num neg">${noStock.length}</td></tr>
        <tr><td>Stock bajo</td><td class="num">${lowStock.length}</td></tr>
        <tr><td>Valor a precio venta</td><td class="num">${fmt(totalValue)}</td></tr>
        <tr><td>Valor a costo</td><td class="num">${fmt(totalCost)}</td></tr>
        <tr><td>Margen potencial</td><td class="num pos">${fmt(totalValue - totalCost)}</td></tr>
      </table>

      ${lowStock.length ? `
        <h2>⚠ Productos con stock bajo</h2>
        <table>
          <tr><th>Código</th><th>Nombre</th><th class="num">Stock</th><th class="num">Mínimo</th></tr>
          ${lowStock.map(p => `
            <tr>
              <td>${escapeHtml(p.code)}</td>
              <td>${escapeHtml(p.name)}</td>
              <td class="num neg">${p.stock || 0}</td>
              <td class="num">${p.min_stock || 5}</td>
            </tr>`).join('')}
        </table>` : ''}

      <h2>Detalle completo</h2>
      <table>
        <tr>
          <th>Código</th><th>Nombre</th><th>Categoría</th>
          <th class="num">Stock</th><th class="num">Costo</th>
          <th class="num">Precio</th><th class="num">Valor total</th>
        </tr>
        ${filtered.map(p => {
          const stock = parseInt(p.stock || 0);
          const value = parseFloat(p.price || 0) * stock;
          const badge = stock === 0 ? 'badge-red'
                      : stock <= (p.min_stock || 5) ? 'badge-amber'
                      : 'badge-green';
          return `
            <tr>
              <td>${escapeHtml(p.code)}</td>
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.category || '-')}</td>
              <td class="num"><span class="badge ${badge}">${stock}</span></td>
              <td class="num">${fmt(p.cost)}</td>
              <td class="num">${fmt(p.price)}</td>
              <td class="num">${fmt(value)}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">Sin productos</td></tr>'}
        <tr class="total-row">
          <td colspan="6">TOTAL VALOR INVENTARIO</td>
          <td class="num">${fmt(totalValue)}</td>
        </tr>
      </table>
    `;

    openReport('Reporte de Inventario', content, {
      subtitle: `${filtered.length} productos · valor ${fmt(totalValue)}`
    });
  };

  // ───────────────────────── 3. Reporte de clientes ─────────────────────────
  window.reportCustomers = async function() {
    const customers = await getData('/api/customers');
    if (!customers || !Array.isArray(customers)) return VolvixUI.toast({type:'error', message:'Error obteniendo clientes'});

    const totalCredit  = customers.reduce((s, c) => s + parseFloat(c.credit_limit   || 0), 0);
    const totalBalance = customers.reduce((s, c) => s + parseFloat(c.credit_balance || 0), 0);
    const active       = customers.filter(c => c.active !== false).length;
    const debtors      = customers.filter(c => parseFloat(c.credit_balance || 0) > 0);

    const content = `
      <h2>Resumen de Clientes</h2>
      <table>
        <tr><th>Métrica</th><th class="num">Valor</th></tr>
        <tr><td>Total clientes</td><td class="num">${customers.length}</td></tr>
        <tr><td>Activos</td><td class="num">${active}</td></tr>
        <tr><td>Con saldo pendiente</td><td class="num neg">${debtors.length}</td></tr>
        <tr><td>Crédito total otorgado</td><td class="num">${fmt(totalCredit)}</td></tr>
        <tr><td>Saldo total por cobrar</td><td class="num neg">${fmt(totalBalance)}</td></tr>
      </table>

      ${debtors.length ? `
        <h2>Clientes con saldo pendiente</h2>
        <table>
          <tr><th>Cliente</th><th>Teléfono</th><th class="num">Crédito</th><th class="num">Saldo</th></tr>
          ${debtors.sort((a,b) => parseFloat(b.credit_balance||0) - parseFloat(a.credit_balance||0)).map(c => `
            <tr>
              <td>${escapeHtml(c.name || 'Sin nombre')}</td>
              <td>${escapeHtml(c.phone || '-')}</td>
              <td class="num">${fmt(c.credit_limit)}</td>
              <td class="num neg">${fmt(c.credit_balance)}</td>
            </tr>`).join('')}
        </table>` : ''}

      <h2>Detalle de clientes</h2>
      <table>
        <tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th class="num">Crédito</th><th class="num">Saldo</th><th>Estado</th></tr>
        ${customers.map(c => {
          const bal = parseFloat(c.credit_balance || 0);
          return `
            <tr>
              <td>${escapeHtml(c.name || 'Sin nombre')}</td>
              <td>${escapeHtml(c.email || '-')}</td>
              <td>${escapeHtml(c.phone || '-')}</td>
              <td class="num">${fmt(c.credit_limit)}</td>
              <td class="num ${bal > 0 ? 'neg' : ''}">${fmt(bal)}</td>
              <td><span class="badge ${c.active !== false ? 'badge-green' : 'badge-red'}">
                ${c.active !== false ? 'activo' : 'inactivo'}
              </span></td>
            </tr>`;
        }).join('') || '<tr><td colspan="6" class="empty">Sin clientes</td></tr>'}
      </table>
    `;

    openReport('Reporte de Clientes', content, {
      subtitle: `${customers.length} clientes · saldo total ${fmt(totalBalance)}`
    });
  };

  // ───────────────────────── 4. Estado de cuenta cliente ─────────────────────────
  window.reportCustomerStatement = async function(customerId) {
    if (!customerId) {
      const ui = window.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        const res = await Promise.resolve(ui.form({
          title: 'Estado de cuenta',
          fields: [{ name: 'customerId', label: 'ID del cliente', type: 'text', required: true }],
          submitText: 'Generar'
        })).catch(() => null);
        if (!res || !res.customerId) return;
        customerId = res.customerId;
      } else {
        customerId = prompt('ID del cliente:');
        if (!customerId) return;
      }
    }
    const [customer, sales, payments] = await Promise.all([
      getData('/api/customers/' + customerId),
      getData('/api/sales?customer_id=' + customerId),
      getData('/api/payments?customer_id=' + customerId)
    ]);

    if (!customer) return VolvixUI.toast({type:'info', message:'Cliente no encontrado'});

    const movements = [];
    (sales || []).forEach(s => movements.push({
      date: s.created_at, type: 'Venta', ref: String(s.id || '').slice(0, 8),
      debit: parseFloat(s.total || 0), credit: 0,
      detail: s.payment_method || 'crédito'
    }));
    (payments || []).forEach(p => movements.push({
      date: p.created_at, type: 'Pago', ref: String(p.id || '').slice(0, 8),
      debit: 0, credit: parseFloat(p.amount || 0),
      detail: p.method || '-'
    }));

    movements.sort((a, b) => new Date(a.date) - new Date(b.date));

    let balance = 0;
    const rows = movements.map(m => {
      balance += (m.debit - m.credit);
      return { ...m, balance };
    });

    const totalDebit  = movements.reduce((s, m) => s + m.debit, 0);
    const totalCredit = movements.reduce((s, m) => s + m.credit, 0);

    const content = `
      <h2>Datos del cliente</h2>
      <table>
        <tr><td><strong>Nombre</strong></td><td>${escapeHtml(customer.name || '-')}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(customer.email || '-')}</td></tr>
        <tr><td><strong>Teléfono</strong></td><td>${escapeHtml(customer.phone || '-')}</td></tr>
        <tr><td><strong>Crédito autorizado</strong></td><td class="num">${fmt(customer.credit_limit)}</td></tr>
        <tr><td><strong>Saldo actual</strong></td><td class="num ${balance > 0 ? 'neg' : 'pos'}">${fmt(balance)}</td></tr>
      </table>

      <h2>Movimientos</h2>
      <table>
        <tr>
          <th>Fecha</th><th>Tipo</th><th>Ref</th><th>Detalle</th>
          <th class="num">Cargo</th><th class="num">Abono</th><th class="num">Saldo</th>
        </tr>
        ${rows.map(m => `
          <tr>
            <td>${fmtDateShort(m.date)}</td>
            <td><span class="badge ${m.type === 'Venta' ? 'badge-amber' : 'badge-green'}">${m.type}</span></td>
            <td>${escapeHtml(m.ref)}</td>
            <td>${escapeHtml(m.detail)}</td>
            <td class="num">${m.debit ? fmt(m.debit) : '-'}</td>
            <td class="num">${m.credit ? fmt(m.credit) : '-'}</td>
            <td class="num ${m.balance > 0 ? 'neg' : ''}">${fmt(m.balance)}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="empty">Sin movimientos</td></tr>'}
        <tr class="total-row">
          <td colspan="4">TOTALES</td>
          <td class="num">${fmt(totalDebit)}</td>
          <td class="num">${fmt(totalCredit)}</td>
          <td class="num">${fmt(balance)}</td>
        </tr>
      </table>

      <div class="signatures">
        <div><div class="line">Cliente</div></div>
        <div><div class="line">Responsable</div></div>
      </div>
    `;

    openReport('Estado de Cuenta — ' + (customer.name || 'Cliente'), content, {
      subtitle: `Saldo: ${fmt(balance)}`
    });
  };

  // ───────────────────────── 5. Cierre de caja ─────────────────────────
  window.reportCashClose = async function(dateStr) {
    const target = dateStr ? new Date(dateStr) : new Date();
    const targetKey = target.toDateString();

    const sales = await getData('/api/sales');
    if (!sales) return VolvixUI.toast({type:'error', message:'Error obteniendo ventas'});

    const todaySales = sales.filter(s =>
      new Date(s.created_at || Date.now()).toDateString() === targetKey
    );

    const total = todaySales.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const cash  = todaySales.filter(s => (s.payment_method || 'efectivo') === 'efectivo')
                            .reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const card  = todaySales.filter(s => s.payment_method === 'tarjeta')
                            .reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const transfer = todaySales.filter(s => s.payment_method === 'transferencia')
                               .reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const credit = todaySales.filter(s => s.payment_method === 'credito')
                             .reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const other = total - cash - card - transfer - credit;

    const content = `
      <h2>Cierre de Caja — ${target.toLocaleDateString()}</h2>
      <table>
        <tr><th>Concepto</th><th class="num">Monto</th></tr>
        <tr><td>Total operaciones</td><td class="num">${todaySales.length}</td></tr>
        <tr><td>Ingresos en efectivo</td><td class="num">${fmt(cash)}</td></tr>
        <tr><td>Ingresos con tarjeta</td><td class="num">${fmt(card)}</td></tr>
        <tr><td>Transferencias</td><td class="num">${fmt(transfer)}</td></tr>
        <tr><td>Crédito otorgado</td><td class="num">${fmt(credit)}</td></tr>
        <tr><td>Otros</td><td class="num">${fmt(other)}</td></tr>
        <tr class="total-row"><td>TOTAL DEL DÍA</td><td class="num">${fmt(total)}</td></tr>
      </table>

      <h2>Movimientos del día</h2>
      <table>
        <tr><th>Hora</th><th>ID</th><th>Cliente</th><th>Método</th><th class="num">Total</th></tr>
        ${todaySales.map(s => `
          <tr>
            <td>${new Date(s.created_at || Date.now()).toLocaleTimeString()}</td>
            <td>${escapeHtml(String(s.id || '').slice(0, 8))}</td>
            <td>${escapeHtml(s.customer_name || '-')}</td>
            <td><span class="badge">${escapeHtml(s.payment_method || 'efectivo')}</span></td>
            <td class="num">${fmt(s.total)}</td>
          </tr>`).join('') || '<tr><td colspan="5" class="empty">Sin movimientos hoy</td></tr>'}
      </table>

      <h2>Conteo físico (a llenar manualmente)</h2>
      <table>
        <tr><th>Denominación</th><th class="num">Cantidad</th><th class="num">Subtotal</th></tr>
        <tr><td>Billetes $1000</td><td class="num">____</td><td class="num">________</td></tr>
        <tr><td>Billetes $500</td><td class="num">____</td><td class="num">________</td></tr>
        <tr><td>Billetes $200</td><td class="num">____</td><td class="num">________</td></tr>
        <tr><td>Billetes $100</td><td class="num">____</td><td class="num">________</td></tr>
        <tr><td>Billetes $50</td><td class="num">____</td><td class="num">________</td></tr>
        <tr><td>Billetes $20</td><td class="num">____</td><td class="num">________</td></tr>
        <tr><td>Monedas</td><td class="num">____</td><td class="num">________</td></tr>
        <tr class="total-row"><td colspan="2">TOTAL CONTADO</td><td class="num">________</td></tr>
      </table>

      <div class="signatures">
        <div><div class="line">Cajero</div></div>
        <div><div class="line">Supervisor</div></div>
      </div>
    `;

    openReport('Cierre de Caja', content, {
      subtitle: `${todaySales.length} operaciones · ${fmt(total)}`
    });
  };

  // ───────────────────────── 6. Ticket de venta (80mm) ─────────────────────────
  window.printTicket = function(sale) {
    sale = sale || {};
    const items = Array.isArray(sale.items) ? sale.items : [];
    const total = parseFloat(sale.total || 0);
    const subtotal = items.reduce((s, i) =>
      s + (parseFloat(i.price || 0) * parseInt(i.qty || i.quantity || 1)), 0);
    const tax = sale.tax != null ? parseFloat(sale.tax) : Math.max(0, total - subtotal);
    const change = parseFloat(sale.change || 0);
    const cash = parseFloat(sale.cash_received || 0);
    const id = String(sale.id || ('TKT-' + Date.now())).slice(0, 12);
    const sess = getSession();

    const w = window.open('', '_blank', 'width=320,height=720');
    if (!w) { VolvixUI.toast({type:'info', message:'Habilita pop-ups para imprimir el ticket'}); return; }

    w.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Ticket ${id}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    @media print { body { print-color-adjust: exact; } }
    body {
      font-family: ui-monospace, 'Courier New', monospace;
      font-size: 11px; width: 74mm; padding: 4mm; color: #000;
    }
    h2 { text-align: center; font-size: 15px; margin: 4px 0; letter-spacing: 1px; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .line { border-bottom: 1px dashed #000; margin: 6px 0; }
    .double { border-bottom: 2px solid #000; margin: 6px 0; }
    .total {
      font-size: 15px; font-weight: bold; text-align: center;
      padding: 6px; border: 2px solid #000; margin: 8px 0;
    }
    .item-name { font-weight: bold; }
    .item-detail { font-size: 10px; color: #444; padding-left: 4px; }
    .small { font-size: 10px; }
  </style>
</head><body>
  <h2>VOLVIX POS</h2>
  <div class="center small">${escapeHtml(location.hostname)}</div>
  <div class="line"></div>
  <div class="small">Ticket: <strong>${escapeHtml(id)}</strong></div>
  <div class="small">Fecha:  ${fmtDate(sale.created_at || Date.now())}</div>
  <div class="small">Cajero: ${escapeHtml(sess.email || sess.username || 'Anónimo')}</div>
  ${sale.customer_name ? `<div class="small">Cliente: ${escapeHtml(sale.customer_name)}</div>` : ''}
  <div class="double"></div>
  ${items.map(i => {
    const qty = parseInt(i.qty || i.quantity || 1);
    const price = parseFloat(i.price || 0);
    return `
      <div class="item-name">${escapeHtml(i.name || i.product_name || 'Producto')}</div>
      <div class="row item-detail">
        <span>${qty} x ${fmt(price)}</span>
        <span>${fmt(price * qty)}</span>
      </div>`;
  }).join('') || '<div class="center small">Sin items</div>'}
  <div class="line"></div>
  <div class="row"><span>Subtotal:</span><span>${fmt(subtotal)}</span></div>
  <div class="row"><span>Impuestos:</span><span>${fmt(tax)}</span></div>
  <div class="total">TOTAL: ${fmt(total)}</div>
  ${cash > 0 ? `
    <div class="row"><span>Pago (${escapeHtml(sale.payment_method || 'efectivo')}):</span><span>${fmt(cash)}</span></div>
    <div class="row"><span>Cambio:</span><span>${fmt(change)}</span></div>` : `
    <div class="row"><span>Método:</span><span>${escapeHtml(sale.payment_method || 'efectivo')}</span></div>`}
  <div class="line"></div>
  <div class="center small">¡Gracias por su compra!</div>
  <div class="center small">Conserve este ticket</div>
  <div class="center small" style="margin-top:8px;">Volvix POS v${VERSION}</div>
  <script>
    window.onload = () => {
      setTimeout(() => {
        window.print();
        setTimeout(() => window.close(), 600);
      }, 250);
    };
  <\/script>
</body></html>`);
    w.document.close();
  };

  // ───────────────────────── Botones flotantes ─────────────────────────
  function createButtons() {
    if (document.getElementById('volvix-reports-fab')) return;

    const div = document.createElement('div');
    div.id = 'volvix-reports-fab';
    div.style.cssText = `
      position: fixed; bottom: 80px; right: 20px;
      display: flex; flex-direction: column; gap: 6px;
      z-index: 9993;
    `;
    const btns = [
      { fn: 'reportSales',             icon: '📊', color: '#0ea5e9', label: 'Ventas' },
      { fn: 'reportInventory',         icon: '📦', color: '#10b981', label: 'Inventario' },
      { fn: 'reportCustomers',         icon: '👥', color: '#f59e0b', label: 'Clientes' },
      { fn: 'reportCustomerStatement', icon: '📋', color: '#8b5cf6', label: 'Edo. Cuenta' },
      { fn: 'reportCashClose',         icon: '💰', color: '#ef4444', label: 'Cierre Caja' }
    ];
    div.innerHTML = btns.map(b => `
      <button onclick="window.${b.fn}()" title="${b.label}"
              style="width:44px;height:44px;border-radius:50%;background:${b.color};
                     color:#fff;border:none;cursor:pointer;font-size:16px;
                     box-shadow:0 2px 6px rgba(0,0,0,0.2);">
        ${b.icon}
      </button>
    `).join('');

    document.body.appendChild(div);
  }

  function init() {
    // 2026-05-07 cleanup: FABs flotantes (5 botones de colores en esquina inferior
    // derecha) deshabilitados por feedback de UX. Las mismas funciones de reporte
    // ya estan accesibles desde la topbar:
    //   - Ventas/Productos/Clientes/Cajeros → menu "Reportes"
    //   - Inventario → menu "Inventario"
    //   - Cierre de Caja → menu "Corte"
    // Las funciones globales (window.reportSales, window.reportInventory, etc.)
    // siguen disponibles para invocacion directa desde otros modulos.
    // Si quieres re-habilitar FABs flotantes en alguna pagina especifica,
    // setea window.VOLVIX_REPORTS_FABS = true ANTES de cargar este script.
    if (window.VOLVIX_REPORTS_FABS !== true) return;
    const p = location.pathname.toLowerCase();
    if (p.includes('owner_panel') || p.includes('multipos') ||
        p.includes('salvadorex') || p.includes('pos')) {
      createButtons();
    }
  }

  // ───────────────────────── API pública ─────────────────────────
  window.ReportsAPI = {
    sales:      window.reportSales,
    inventory:  window.reportInventory,
    customers:  window.reportCustomers,
    statement:  window.reportCustomerStatement,
    cashClose:  window.reportCashClose,
    ticket:     window.printTicket,
    version:    VERSION
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[Volvix Reports] Wiring v' + VERSION + ' cargado. API: window.ReportsAPI');
})();
