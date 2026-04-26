/* ============================================================
   VOLVIX · POS EXTRA WIRING
   Cablea módulos restantes del POS SalvadoreX:
   - Promociones, Recargas, Servicios, Departamentos
   - Cotizaciones, Apertura, Kardex, Proveedores
   - Configuración, Facturación CFDI, Usuarios, Actualizador
============================================================ */
(function () {
  'use strict';

  const API = location.origin;
  let session = null;

  console.log(
    '%c[POS-EXTRA-WIRING]',
    'background:#7C3AED;color:#fff;padding:2px 6px;border-radius:3px',
    'Activo - 12 modulos extra'
  );

  // ---------- session / API helpers ----------
  function loadSession() {
    try {
      session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
    } catch {
      session = null;
    }
    return session;
  }

  async function apiGet(path) {
    try {
      const res = await fetch(API + path);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) {
      return { error: e.message };
    }
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[TOAST]', msg);
  }

  function lsGet(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function fmtMoney(n) {
    return '$' + (parseFloat(n) || 0).toFixed(2);
  }

  function fmtDate(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '-';
    }
  }

  // Render helper: replaces the placeholder block inside a screen with real UI
  function renderScreen(screenId, html) {
    const el = document.getElementById('screen-' + screenId);
    if (!el) return null;
    el.classList.remove('screen-pad');
    el.classList.add('screen-pad');
    el.innerHTML = html;
    return el;
  }

  // =========================================================
  // PROMOCIONES
  // =========================================================
  window.posCreatePromocion = function () {
    const nombre = prompt('Nombre de la promocion:');
    if (!nombre) return;
    const tipo = prompt('Tipo (descuento / 2x1 / combo):', 'descuento') || 'descuento';
    const descuento = parseFloat(prompt('% de descuento o ahorro:') || '0');
    const vigencia = prompt('Vigencia hasta (YYYY-MM-DD):', '2026-12-31') || '';
    const promos = lsGet('volvix:promociones', []);
    promos.push({
      id: 'PRM-' + Date.now(),
      nombre,
      tipo,
      descuento,
      vigencia,
      activa: true,
      created: Date.now()
    });
    lsSet('volvix:promociones', promos);
    toast('Promocion creada');
    window.posListPromociones();
  };

  window.posTogglePromocion = function (id) {
    const promos = lsGet('volvix:promociones', []);
    const p = promos.find((x) => x.id === id);
    if (!p) return;
    p.activa = !p.activa;
    lsSet('volvix:promociones', promos);
    window.posListPromociones();
  };

  window.posDeletePromocion = function (id) {
    if (!confirm('Eliminar promocion?')) return;
    const promos = lsGet('volvix:promociones', []).filter((p) => p.id !== id);
    lsSet('volvix:promociones', promos);
    toast('Promocion eliminada');
    window.posListPromociones();
  };

  window.posListPromociones = function () {
    const promos = lsGet('volvix:promociones', []);
    const rows = promos.length
      ? promos
          .map(
            (p) => `
        <tr>
          <td class="mono" style="font-size:11px;color:var(--text-3);">${p.id}</td>
          <td><strong>${p.nombre}</strong></td>
          <td><span class="chip">${p.tipo}</span></td>
          <td class="num">${p.descuento}%</td>
          <td>${p.vigencia || '-'}</td>
          <td>${p.activa ? '<span class="chip ok"><span class="dot"></span>Activa</span>' : '<span class="chip warn">Inactiva</span>'}</td>
          <td style="text-align:right;">
            <button class="btn sm" onclick="posTogglePromocion('${p.id}')">${p.activa ? 'Pausar' : 'Activar'}</button>
            <button class="btn sm" onclick="posDeletePromocion('${p.id}')">Eliminar</button>
          </td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px;">Sin promociones. Crea la primera.</td></tr>';

    renderScreen(
      'promociones',
      `
      <div class="page-head">
        <div><h1 class="page-title">Promociones</h1><p class="page-sub">${promos.length} promociones registradas</p></div>
        <button class="btn accent" onclick="posCreatePromocion()">+ Nueva promocion</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Nombre</th><th>Tipo</th><th>Descuento</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // RECARGAS (tiempo aire)
  // =========================================================
  window.posRecargaCelular = function () {
    const numero = prompt('Numero celular (10 digitos):');
    if (!numero || numero.length < 10) return toast('Numero invalido');
    const compania =
      prompt('Compania (Telcel/Movistar/AT&T/Unefon/Bait):', 'Telcel') || 'Telcel';
    const monto = parseFloat(prompt('Monto ($10/$20/$30/$50/$100/$200/$500):') || '0');
    if (!monto) return;
    const recargas = lsGet('volvix:recargas', []);
    const folio = 'REC-' + Date.now();
    recargas.unshift({
      id: folio,
      numero,
      compania,
      monto,
      comision: +(monto * 0.05).toFixed(2),
      estado: 'aplicada',
      fecha: Date.now()
    });
    lsSet('volvix:recargas', recargas);
    toast('Recarga ' + fmtMoney(monto) + ' aplicada');
    window.posListRecargas();
  };

  window.posListRecargas = function () {
    const recargas = lsGet('volvix:recargas', []);
    const total = recargas.reduce((a, r) => a + (r.monto || 0), 0);
    const comisiones = recargas.reduce((a, r) => a + (r.comision || 0), 0);
    const rows = recargas.length
      ? recargas
          .slice(0, 50)
          .map(
            (r) => `
        <tr>
          <td class="mono" style="font-size:11px;">${r.id}</td>
          <td><strong>${r.numero}</strong></td>
          <td><span class="chip">${r.compania}</span></td>
          <td class="num">${fmtMoney(r.monto)}</td>
          <td class="num">${fmtMoney(r.comision)}</td>
          <td>${fmtDate(r.fecha)}</td>
          <td><span class="chip ok"><span class="dot"></span>${r.estado}</span></td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px;">Sin recargas hoy.</td></tr>';

    renderScreen(
      'recargas',
      `
      <div class="page-head">
        <div><h1 class="page-title">Recargas electronicas</h1>
          <p class="page-sub">${recargas.length} transacciones - Vendido ${fmtMoney(total)} - Comisiones ${fmtMoney(comisiones)}</p>
        </div>
        <button class="btn accent" onclick="posRecargaCelular()">+ Nueva recarga</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Folio</th><th>Numero</th><th>Compania</th><th>Monto</th><th>Comision</th><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // SERVICIOS (luz, agua, etc.)
  // =========================================================
  window.posPagoServicio = function () {
    const tipo =
      prompt('Servicio (CFE/Agua/Telmex/Gas/Internet):', 'CFE') || 'CFE';
    const referencia = prompt('Referencia / numero de servicio:');
    if (!referencia) return;
    const monto = parseFloat(prompt('Monto a pagar:') || '0');
    if (!monto) return;
    const pagos = lsGet('volvix:servicios', []);
    pagos.unshift({
      id: 'SVC-' + Date.now(),
      tipo,
      referencia,
      monto,
      comision: 8,
      estado: 'pagado',
      fecha: Date.now()
    });
    lsSet('volvix:servicios', pagos);
    toast('Pago de ' + tipo + ' aplicado');
    window.posListServicios();
  };

  window.posListServicios = function () {
    const pagos = lsGet('volvix:servicios', []);
    const total = pagos.reduce((a, p) => a + (p.monto || 0), 0);
    const rows = pagos.length
      ? pagos
          .slice(0, 50)
          .map(
            (p) => `
        <tr>
          <td class="mono" style="font-size:11px;">${p.id}</td>
          <td><span class="chip">${p.tipo}</span></td>
          <td class="mono">${p.referencia}</td>
          <td class="num">${fmtMoney(p.monto)}</td>
          <td class="num">${fmtMoney(p.comision)}</td>
          <td>${fmtDate(p.fecha)}</td>
          <td><span class="chip ok"><span class="dot"></span>${p.estado}</span></td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px;">Sin pagos registrados.</td></tr>';

    renderScreen(
      'servicios',
      `
      <div class="page-head">
        <div><h1 class="page-title">Pago de servicios</h1>
          <p class="page-sub">${pagos.length} pagos - Total ${fmtMoney(total)}</p>
        </div>
        <button class="btn accent" onclick="posPagoServicio()">+ Nuevo pago</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Folio</th><th>Servicio</th><th>Referencia</th><th>Monto</th><th>Comision</th><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // DEPARTAMENTOS
  // =========================================================
  window.posCreateDepartamento = function () {
    const nombre = prompt('Nombre del departamento:');
    if (!nombre) return;
    const iva = parseFloat(prompt('% IVA aplicable (0/8/16):', '16') || '16');
    const deps = lsGet('volvix:departamentos', [
      { id: 'DEP-1', nombre: 'Abarrotes', iva: 16, productos: 0 },
      { id: 'DEP-2', nombre: 'Bebidas', iva: 16, productos: 0 },
      { id: 'DEP-3', nombre: 'Limpieza', iva: 16, productos: 0 }
    ]);
    deps.push({
      id: 'DEP-' + Date.now(),
      nombre,
      iva,
      productos: 0,
      created: Date.now()
    });
    lsSet('volvix:departamentos', deps);
    toast('Departamento creado');
    window.posListDepartamentos();
  };

  window.posDeleteDepartamento = function (id) {
    if (!confirm('Eliminar departamento?')) return;
    const deps = lsGet('volvix:departamentos', []).filter((d) => d.id !== id);
    lsSet('volvix:departamentos', deps);
    window.posListDepartamentos();
  };

  window.posListDepartamentos = async function () {
    let deps = lsGet('volvix:departamentos', null);
    if (!deps) {
      deps = [
        { id: 'DEP-1', nombre: 'Abarrotes', iva: 16, productos: 0 },
        { id: 'DEP-2', nombre: 'Bebidas', iva: 16, productos: 0 },
        { id: 'DEP-3', nombre: 'Limpieza', iva: 16, productos: 0 }
      ];
      lsSet('volvix:departamentos', deps);
    }

    // Conteo real desde productos
    const productos = (await apiGet('/api/products')) || [];
    deps.forEach((d) => {
      d.productos = productos.filter(
        (p) =>
          (p.category || '').toLowerCase() === d.nombre.toLowerCase() ||
          (p.department || '').toLowerCase() === d.nombre.toLowerCase()
      ).length;
    });

    const rows = deps
      .map(
        (d) => `
      <tr>
        <td class="mono" style="font-size:11px;">${d.id}</td>
        <td><strong>${d.nombre}</strong></td>
        <td><span class="chip">${d.iva}% IVA</span></td>
        <td class="num">${d.productos}</td>
        <td style="text-align:right;">
          <button class="btn sm" onclick="posDeleteDepartamento('${d.id}')">Eliminar</button>
        </td>
      </tr>`
      )
      .join('');

    renderScreen(
      'departamentos',
      `
      <div class="page-head">
        <div><h1 class="page-title">Departamentos</h1><p class="page-sub">${deps.length} departamentos - ${productos.length} productos</p></div>
        <button class="btn accent" onclick="posCreateDepartamento()">+ Nuevo departamento</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Nombre</th><th>IVA</th><th>Productos</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // COTIZACIONES
  // =========================================================
  window.posCreateCotizacion = function () {
    const cliente = prompt('Cliente:');
    if (!cliente) return;
    const concepto = prompt('Concepto (1 linea):') || 'Producto';
    const total = parseFloat(prompt('Total estimado:') || '0');
    const cots = lsGet('volvix:cotizaciones', []);
    cots.unshift({
      id: 'COT-' + Date.now(),
      cliente,
      concepto,
      total,
      vigencia: 7,
      estado: 'pendiente',
      created: Date.now()
    });
    lsSet('volvix:cotizaciones', cots);
    toast('Cotizacion creada');
    window.posListCotizaciones();
  };

  window.posConvertCotizacion = function (id) {
    const cots = lsGet('volvix:cotizaciones', []);
    const c = cots.find((x) => x.id === id);
    if (!c) return;
    c.estado = 'convertida';
    lsSet('volvix:cotizaciones', cots);
    toast('Convertida a venta');
    window.posListCotizaciones();
  };

  window.posListCotizaciones = function () {
    const cots = lsGet('volvix:cotizaciones', []);
    const total = cots.reduce((a, c) => a + (c.total || 0), 0);
    const rows = cots.length
      ? cots
          .map(
            (c) => `
        <tr>
          <td class="mono" style="font-size:11px;">${c.id}</td>
          <td><strong>${c.cliente}</strong></td>
          <td>${c.concepto}</td>
          <td class="num">${fmtMoney(c.total)}</td>
          <td>${c.vigencia} dias</td>
          <td><span class="chip ${c.estado === 'convertida' ? 'ok' : 'warn'}"><span class="dot"></span>${c.estado}</span></td>
          <td>${fmtDate(c.created)}</td>
          <td style="text-align:right;">
            ${c.estado === 'pendiente' ? `<button class="btn sm" onclick="posConvertCotizacion('${c.id}')">Convertir</button>` : ''}
          </td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:24px;">Sin cotizaciones.</td></tr>';

    renderScreen(
      'cotizaciones',
      `
      <div class="page-head">
        <div><h1 class="page-title">Cotizaciones</h1><p class="page-sub">${cots.length} cotizaciones - ${fmtMoney(total)}</p></div>
        <button class="btn accent" onclick="posCreateCotizacion()">+ Nueva cotizacion</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Cliente</th><th>Concepto</th><th>Total</th><th>Vigencia</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // APERTURA DE CAJA
  // =========================================================
  window.posAbrirCaja = function () {
    const cajero = (session && session.user) || 'Administrador';
    const turno =
      document.querySelector('#screen-apertura select')?.value || 'Matutino';
    const monto = parseFloat(
      (document.querySelector('#apertura-monto')?.value || '500').replace(
        /[^0-9.]/g,
        ''
      )
    );
    const obs = document.querySelector('#apertura-obs')?.value || '';
    const aperturas = lsGet('volvix:aperturas', []);
    const apertura = {
      id: 'APE-' + Date.now(),
      cajero,
      turno,
      monto,
      observaciones: obs,
      fecha: Date.now(),
      estado: 'abierta'
    };
    aperturas.unshift(apertura);
    lsSet('volvix:aperturas', aperturas);
    lsSet('volvix:caja_actual', apertura);
    toast('Apertura registrada - ' + fmtMoney(monto));
    window.posListApertura();
  };

  window.posListApertura = function () {
    const actual = lsGet('volvix:caja_actual', null);
    const aperturas = lsGet('volvix:aperturas', []);
    const cajero = (session && session.user) || 'Administrador';

    const historico = aperturas
      .slice(0, 10)
      .map(
        (a) => `
      <tr>
        <td class="mono" style="font-size:11px;">${a.id}</td>
        <td>${a.cajero}</td>
        <td>${a.turno}</td>
        <td class="num">${fmtMoney(a.monto)}</td>
        <td>${fmtDate(a.fecha)}</td>
        <td><span class="chip ${a.estado === 'abierta' ? 'ok' : ''}"><span class="dot"></span>${a.estado}</span></td>
      </tr>`
      )
      .join('');

    renderScreen(
      'apertura',
      `
      <div class="page-head">
        <div><h1 class="page-title">Apertura de caja</h1>
          <p class="page-sub">${actual ? 'Caja abierta - ' + fmtMoney(actual.monto) : 'Caja cerrada'}</p>
        </div>
      </div>
      <div class="card card-pad" style="max-width:520px;margin-bottom:14px;">
        <div class="input-group"><label class="input-label">Cajero</label>
          <input class="input-field" value="${cajero}" disabled></div>
        <div class="input-group"><label class="input-label">Turno</label>
          <select class="input-field"><option>Matutino (06:00-14:00)</option><option>Vespertino (14:00-22:00)</option><option>Nocturno (22:00-06:00)</option></select></div>
        <div class="input-group"><label class="input-label">Monto inicial</label>
          <input class="input-field" id="apertura-monto" type="text" value="$500.00"></div>
        <div class="input-group"><label class="input-label">Observaciones</label>
          <textarea class="input-field" id="apertura-obs" rows="3" placeholder="Notas..."></textarea></div>
        <button class="btn accent lg" style="width:100%;justify-content:center;" onclick="posAbrirCaja()">Abrir caja</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Cajero</th><th>Turno</th><th>Monto</th><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>${historico || '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-3);">Sin aperturas previas.</td></tr>'}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // KARDEX (movimientos de inventario)
  // =========================================================
  window.posKardexAddMov = async function () {
    const sku = prompt('SKU / codigo del producto:');
    if (!sku) return;
    const tipo = prompt('Tipo (entrada/salida/ajuste):', 'entrada') || 'entrada';
    const cantidad = parseInt(prompt('Cantidad:') || '0', 10);
    if (!cantidad) return;
    const motivo = prompt('Motivo:', 'Movimiento manual') || '';
    const movs = lsGet('volvix:kardex', []);
    movs.unshift({
      id: 'KDX-' + Date.now(),
      sku,
      tipo,
      cantidad,
      motivo,
      usuario: (session && session.user) || 'admin',
      fecha: Date.now()
    });
    lsSet('volvix:kardex', movs);
    toast('Movimiento ' + tipo + ' registrado');
    window.posListKardex();
  };

  window.posListKardex = async function () {
    const movs = lsGet('volvix:kardex', []);
    const productos = (await apiGet('/api/products')) || [];
    const productMap = Object.fromEntries(
      productos.map((p) => [p.code || p.sku || p.id, p.name])
    );

    const rows = movs.length
      ? movs
          .slice(0, 100)
          .map(
            (m) => `
        <tr>
          <td class="mono" style="font-size:11px;">${m.id}</td>
          <td>${fmtDate(m.fecha)}</td>
          <td class="mono">${m.sku}</td>
          <td>${productMap[m.sku] || '<i style=color:var(--text-3)>desconocido</i>'}</td>
          <td><span class="chip ${m.tipo === 'entrada' ? 'ok' : m.tipo === 'salida' ? 'warn' : ''}">${m.tipo}</span></td>
          <td class="num">${m.cantidad}</td>
          <td>${m.motivo}</td>
          <td>${m.usuario}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:24px;">Sin movimientos.</td></tr>';

    renderScreen(
      'kardex',
      `
      <div class="page-head">
        <div><h1 class="page-title">Kardex</h1><p class="page-sub">${movs.length} movimientos registrados</p></div>
        <button class="btn accent" onclick="posKardexAddMov()">+ Nuevo movimiento</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Fecha</th><th>SKU</th><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Motivo</th><th>Usuario</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // PROVEEDORES
  // =========================================================
  window.posCreateProveedor = function () {
    const nombre = prompt('Razon social del proveedor:');
    if (!nombre) return;
    const rfc = prompt('RFC:') || '';
    const contacto = prompt('Telefono / contacto:') || '';
    const provs = lsGet('volvix:proveedores', []);
    provs.push({
      id: 'PRV-' + Date.now(),
      nombre,
      rfc,
      contacto,
      saldo: 0,
      activo: true,
      created: Date.now()
    });
    lsSet('volvix:proveedores', provs);
    toast('Proveedor agregado');
    window.posListProveedores();
  };

  window.posListProveedores = function () {
    const provs = lsGet('volvix:proveedores', []);
    const rows = provs.length
      ? provs
          .map(
            (p) => `
        <tr>
          <td class="mono" style="font-size:11px;">${p.id}</td>
          <td><strong>${p.nombre}</strong></td>
          <td class="mono">${p.rfc || '-'}</td>
          <td>${p.contacto || '-'}</td>
          <td class="num">${fmtMoney(p.saldo)}</td>
          <td>${p.activo ? '<span class="chip ok"><span class="dot"></span>Activo</span>' : '<span class="chip warn">Inactivo</span>'}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px;">Sin proveedores.</td></tr>';

    renderScreen(
      'proveedores',
      `
      <div class="page-head">
        <div><h1 class="page-title">Proveedores</h1><p class="page-sub">${provs.length} proveedores</p></div>
        <button class="btn accent" onclick="posCreateProveedor()">+ Nuevo proveedor</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Razon social</th><th>RFC</th><th>Contacto</th><th>Saldo</th><th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // CONFIGURACION
  // =========================================================
  window.posSaveConfig = function () {
    const cfg = {
      negocio: document.querySelector('#cfg-nombre')?.value || '',
      rfc: document.querySelector('#cfg-rfc')?.value || '',
      direccion: document.querySelector('#cfg-direccion')?.value || '',
      iva: parseFloat(document.querySelector('#cfg-iva')?.value || '16'),
      moneda: document.querySelector('#cfg-moneda')?.value || 'MXN',
      ticket_pie: document.querySelector('#cfg-ticket')?.value || '',
      saved: Date.now()
    };
    lsSet('volvix:config', cfg);
    toast('Configuracion guardada');
  };

  window.posLoadConfig = function () {
    // El HTML ya tiene un screen-config completo - solo asegurar que los valores
    // de localStorage se reflejen y agregar boton "Guardar"
    const cfg = lsGet('volvix:config', {});
    const screen = document.getElementById('screen-config');
    if (!screen) return;

    // Inyectar boton Guardar si no existe
    if (!screen.querySelector('[data-cfg-save]')) {
      const saveBar = document.createElement('div');
      saveBar.style.cssText =
        'position:sticky;bottom:0;background:var(--surface,#fff);padding:12px;border-top:1px solid var(--border);text-align:right;margin-top:18px;';
      saveBar.innerHTML = `<button class="btn accent" data-cfg-save onclick="posSaveConfig()">Guardar configuracion</button>`;
      screen.appendChild(saveBar);
    }

    // Reflejar valores guardados (best-effort, no rompe si los ids no existen)
    if (cfg.negocio && document.querySelector('#cfg-nombre'))
      document.querySelector('#cfg-nombre').value = cfg.negocio;
    if (cfg.rfc && document.querySelector('#cfg-rfc'))
      document.querySelector('#cfg-rfc').value = cfg.rfc;
  };

  // =========================================================
  // FACTURACION CFDI
  // =========================================================
  window.posTimbrarCFDI = function () {
    const folio = prompt('Folio de venta a timbrar:');
    if (!folio) return;
    const rfc = prompt('RFC del cliente:');
    if (!rfc) return;
    const usoCFDI = prompt('Uso CFDI (G03/G01/P01):', 'G03') || 'G03';
    const cfdis = lsGet('volvix:cfdi', []);
    cfdis.unshift({
      id: 'CFDI-' + Date.now(),
      folio,
      rfc,
      usoCFDI,
      uuid: 'XXXXXXXX-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      estado: 'timbrado',
      fecha: Date.now()
    });
    lsSet('volvix:cfdi', cfdis);
    toast('CFDI timbrado');
    window.posListCFDI();
  };

  window.posListCFDI = function () {
    const cfdis = lsGet('volvix:cfdi', []);
    const rows = cfdis.length
      ? cfdis
          .map(
            (c) => `
        <tr>
          <td class="mono" style="font-size:11px;">${c.id}</td>
          <td>${c.folio}</td>
          <td class="mono">${c.rfc}</td>
          <td>${c.usoCFDI}</td>
          <td class="mono" style="font-size:10px;">${c.uuid}</td>
          <td>${fmtDate(c.fecha)}</td>
          <td><span class="chip ok"><span class="dot"></span>${c.estado}</span></td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px;">Sin CFDI emitidos.</td></tr>';

    renderScreen(
      'facturacion',
      `
      <div class="page-head">
        <div><h1 class="page-title">Facturacion CFDI 4.0</h1><p class="page-sub">${cfdis.length} comprobantes timbrados</p></div>
        <button class="btn accent" onclick="posTimbrarCFDI()">+ Timbrar CFDI</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ID</th><th>Folio</th><th>RFC</th><th>Uso</th><th>UUID</th><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    `
    );
  };

  // =========================================================
  // USUARIOS
  // =========================================================
  window.posCreateUser = function () {
    const usuario = prompt('Nombre de usuario:');
    if (!usuario) return;
    const email = prompt('Email:') || '';
    const rol =
      prompt('Rol (admin/cajero/vendedor/supervisor):', 'cajero') || 'cajero';
    const users = lsGet('volvix:users', []);
    users.push({
      id: 'USR-' + Date.now(),
      usuario,
      email,
      rol,
      activo: true,
      ultima: null,
      created: Date.now()
    });
    lsSet('volvix:users', users);
    toast('Usuario creado');
    window.posListUsers();
  };

  window.posToggleUser = function (id) {
    const users = lsGet('volvix:users', []);
    const u = users.find((x) => x.id === id);
    if (!u) return;
    u.activo = !u.activo;
    lsSet('volvix:users', users);
    window.posListUsers();
  };

  window.posListUsers = function () {
    let users = lsGet('volvix:users', null);
    if (!users) {
      users = [
        {
          id: 'USR-1',
          usuario: 'admin',
          email: 'admin@volvix.com',
          rol: 'admin',
          activo: true,
          ultima: Date.now()
        }
      ];
      lsSet('volvix:users', users);
    }

    const tbody = document.querySelector('#usr-body');
    const rowsHtml = users
      .map(
        (u) => `
      <tr>
        <td><strong>${u.usuario}</strong></td>
        <td><span class="chip">${u.rol}</span></td>
        <td>${u.email || '-'}</td>
        <td>${u.ultima ? fmtDate(u.ultima) : 'Nunca'}</td>
        <td>${u.activo ? '<span class="chip ok"><span class="dot"></span>Activo</span>' : '<span class="chip warn">Inactivo</span>'}</td>
        <td style="text-align:right;">
          <button class="btn sm" onclick="posToggleUser('${u.id}')">${u.activo ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>`
      )
      .join('');

    if (tbody) {
      tbody.innerHTML = rowsHtml;
      // Tambien cablear el boton "+ Nuevo usuario" del header existente
      const addBtn = document.querySelector(
        '#screen-usuarios .page-head button.btn.accent'
      );
      if (addBtn && !addBtn.dataset.wired) {
        addBtn.dataset.wired = '1';
        addBtn.onclick = window.posCreateUser;
      }
    } else {
      // Fallback: render full screen si no existe la tabla
      renderScreen(
        'usuarios',
        `
        <div class="page-head">
          <div><h1 class="page-title">Usuarios</h1><p class="page-sub">${users.length} usuarios</p></div>
          <button class="btn accent" onclick="posCreateUser()">+ Nuevo usuario</button>
        </div>
        <div class="card"><div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Email</th><th>Ultima conexion</th><th>Estado</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table></div></div>
      `
      );
    }
  };

  // =========================================================
  // ACTUALIZADOR MASIVO
  // =========================================================
  window.posActualizarPrecios = async function () {
    const porcentaje = parseFloat(
      prompt('% a aplicar a TODOS los precios (positivo aumenta, negativo baja):') ||
        '0'
    );
    if (!porcentaje) return;
    if (
      !confirm('Aplicar ' + porcentaje + '% a todos los productos?')
    )
      return;
    const productos = (await apiGet('/api/products')) || [];
    const factor = 1 + porcentaje / 100;
    let ok = 0;
    for (const p of productos) {
      const nuevo = +(parseFloat(p.price) * factor).toFixed(2);
      const r = await apiPost('/api/products/' + p.id + '/price', {
        price: nuevo
      });
      if (!r || !r.error) ok++;
    }
    const log = lsGet('volvix:actualizaciones', []);
    log.unshift({
      id: 'UPD-' + Date.now(),
      tipo: 'precios',
      porcentaje,
      afectados: ok,
      total: productos.length,
      fecha: Date.now()
    });
    lsSet('volvix:actualizaciones', log);
    toast('Actualizados ' + ok + '/' + productos.length + ' productos');
    window.posListActualizador();
  };

  window.posListActualizador = function () {
    const log = lsGet('volvix:actualizaciones', []);
    const rows = log.length
      ? log
          .slice(0, 30)
          .map(
            (a) => `
        <tr>
          <td class="mono" style="font-size:11px;">${a.id}</td>
          <td><span class="chip">${a.tipo}</span></td>
          <td class="num">${a.porcentaje}%</td>
          <td class="num">${a.afectados}/${a.total}</td>
          <td>${fmtDate(a.fecha)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:24px;">Sin actualizaciones masivas.</td></tr>';

    renderScreen(
      'actualizador',
      `
      <div class="page-head">
        <div><h1 class="page-title">Actualizador masivo</h1><p class="page-sub">Sube precios, cambia stock o categorias en lote</p></div>
        <button class="btn accent" onclick="posActualizarPrecios()">% Cambiar precios masivo</button>
      </div>
      <div class="card card-pad" style="margin-bottom:14px;">
        <h3 style="margin:0 0 10px;font-size:14px;">Acciones rapidas</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" onclick="posActualizarPrecios()">Aumentar/bajar precios %</button>
          <button class="btn" onclick="alert('Funcion de stock disponible desde inventario por producto.')">Ajuste de stock</button>
          <button class="btn" onclick="alert('Cambio masivo de categoria - usa departamentos.')">Cambiar categorias</button>
        </div>
      </div>
      <div class="card">
        <h3 style="margin:0;padding:14px 18px;font-size:14px;border-bottom:1px solid var(--border);">Historial</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>ID</th><th>Tipo</th><th>%</th><th>Afectados</th><th>Fecha</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    `
    );
  };

  // =========================================================
  // INTERCEPTOR DE NAVEGACION
  // =========================================================
  function dispatch(name) {
    setTimeout(() => {
      try {
        if (name === 'promociones') window.posListPromociones();
        else if (name === 'recargas') window.posListRecargas();
        else if (name === 'servicios') window.posListServicios();
        else if (name === 'departamentos') window.posListDepartamentos();
        else if (name === 'cotizaciones') window.posListCotizaciones();
        else if (name === 'apertura') window.posListApertura();
        else if (name === 'kardex') window.posListKardex();
        else if (name === 'proveedores') window.posListProveedores();
        else if (name === 'config') window.posLoadConfig();
        else if (name === 'facturacion') window.posListCFDI();
        else if (name === 'usuarios') window.posListUsers();
        else if (name === 'actualizador') window.posListActualizador();
      } catch (err) {
        console.warn('[POS-EXTRA-WIRING] dispatch error:', name, err);
      }
    }, 80);
  }

  function setupInterceptor() {
    if (typeof window.showScreen !== 'function') return;
    if (window._extraIntercepted) return;
    const original = window.showScreen;
    window.showScreen = function (name, ...args) {
      const result = original.apply(this, [name, ...args]);
      dispatch(name);
      return result;
    };
    window._extraIntercepted = true;
    console.log('[POS-EXTRA-WIRING] showScreen interceptado');
  }

  function init() {
    loadSession();
    setupInterceptor();
    // Reintenta porque otras wirings pueden re-asignar showScreen
    setInterval(() => {
      if (!window._extraIntercepted) setupInterceptor();
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
