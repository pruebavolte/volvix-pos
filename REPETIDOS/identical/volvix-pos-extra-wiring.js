/* ============================================================
   VOLVIX · POS EXTRA WIRING
   Cablea módulos restantes del POS SalvadoreX:
   - Promociones, Recargas, Servicios, Departamentos
   - Cotizaciones, Apertura, Kardex, Proveedores
   - Configuración, Facturación CFDI, Usuarios, Actualizador

   R20: Migrado de prompt/confirm/alert nativo a VolvixUI.form/.confirm/.toast
============================================================ */
(function () {
  'use strict';

  const API = location.origin;
  let session = null;

  console.log(
    '%c[POS-EXTRA-WIRING]',
    'background:#7C3AED;color:#fff;padding:2px 6px;border-radius:3px',
    'Activo - 12 modulos extra (UI modal R20)'
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

  // ---------- VolvixUI bridges (con fallback a prompt/confirm/alert) ----------
  function hasUI() {
    return typeof window !== 'undefined' && window.VolvixUI &&
      typeof window.VolvixUI.form === 'function';
  }

  /**
   * vxForm({title, fields, submitText, onSubmit?})
   * Devuelve un objeto con los valores capturados o null si se cancela.
   * Si VolvixUI no está cargado, usa prompts nativos secuenciales como fallback.
   */
  async function vxForm(spec) {
    if (hasUI()) {
      try {
        return await window.VolvixUI.form(spec);
      } catch (err) {
        console.warn('[POS-EXTRA-WIRING] VolvixUI.form falló, fallback prompts:', err);
      }
    } else {
      console.warn('[POS-EXTRA-WIRING] VolvixUI no cargado, usando prompts nativos');
    }

    // Fallback: prompt() encadenado
    const out = {};
    for (const f of (spec.fields || [])) {
      const def = (f.default !== undefined) ? String(f.default) : '';
      const lbl = (f.label || f.name) + (f.required ? ' *' : '');
      const v = prompt(lbl + ':', def);
      if (v === null) return null;
      if (f.required && !v.trim()) return null;
      if (f.type === 'number') {
        const n = parseFloat(v);
        if (Number.isNaN(n) && f.required) return null;
        out[f.name] = n;
      } else {
        out[f.name] = v;
      }
    }
    return out;
  }

  async function vxConfirm(spec) {
    if (hasUI() && typeof window.VolvixUI.confirm === 'function') {
      try {
        return await window.VolvixUI.confirm(spec);
      } catch (err) {
        console.warn('[POS-EXTRA-WIRING] VolvixUI.confirm falló:', err);
      }
    }
    const msg = (spec.title ? spec.title + '\n\n' : '') + (spec.message || '');
    return window.confirm(msg);
  }

  function vxToast(spec) {
    if (hasUI() && typeof window.VolvixUI.toast === 'function') {
      try {
        return window.VolvixUI.toast(spec);
      } catch (err) {
        console.warn('[POS-EXTRA-WIRING] VolvixUI.toast falló:', err);
      }
    }
    if (typeof window.showToast === 'function') {
      return window.showToast(spec.message);
    }
    console.log('[TOAST]', (spec.type || 'info').toUpperCase(), spec.message);
  }

  // Compat: viejo toast(msg) → info
  function toast(msg) {
    return vxToast({ type: 'success', message: msg });
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
  window.posCreatePromocion = async function () {
    const v = await vxForm({
      title: 'Nueva promoción',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, minLength: 3, maxLength: 60 },
        { name: 'tipo', label: 'Tipo', type: 'radio', required: true, default: 'descuento', options: [
          { value: 'descuento', label: '% Descuento' },
          { value: '2x1', label: '2x1' },
          { value: 'combo', label: 'Combo' }
        ]},
        { name: 'descuento', label: '% descuento', type: 'number', min: 0, max: 100, step: 0.01, required: true },
        { name: 'vigencia', label: 'Vigencia hasta', type: 'date', required: true, minDate: 'today' }
      ],
      submitText: 'Crear promoción'
    });
    if (!v) return;

    const promos = lsGet('volvix:promociones', []);
    promos.push({
      id: 'PRM-' + Date.now(),
      nombre: v.nombre,
      tipo: v.tipo,
      descuento: parseFloat(v.descuento) || 0,
      vigencia: v.vigencia,
      activa: true,
      created: Date.now()
    });
    lsSet('volvix:promociones', promos);
    vxToast({ type: 'success', message: 'Promoción creada' });
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

  window.posDeletePromocion = async function (id) {
    const ok = await vxConfirm({
      title: 'Eliminar promoción',
      message: '¿Seguro que deseas eliminar esta promoción? Esta acción no se puede deshacer.',
      danger: true
    });
    if (!ok) return;
    const promos = lsGet('volvix:promociones', []).filter((p) => p.id !== id);
    lsSet('volvix:promociones', promos);
    vxToast({ type: 'success', message: 'Promoción eliminada' });
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
  window.posRecargaCelular = async function () {
    const v = await vxForm({
      title: 'Nueva recarga',
      fields: [
        { name: 'numero', label: 'Número celular', type: 'tel', required: true,
          pattern: '^\\d{10}$', placeholder: '10 dígitos',
          errorMessage: 'Debe ser un teléfono MX de 10 dígitos' },
        { name: 'compania', label: 'Compañía', type: 'select', required: true, default: 'Telcel',
          options: [
            { value: 'Telcel', label: 'Telcel' },
            { value: 'Movistar', label: 'Movistar' },
            { value: 'AT&T', label: 'AT&T' },
            { value: 'Unefon', label: 'Unefon' },
            { value: 'Bait', label: 'Bait' }
          ]},
        { name: 'monto', label: 'Monto', type: 'select', required: true,
          options: [
            { value: '10', label: '$10' }, { value: '20', label: '$20' },
            { value: '30', label: '$30' }, { value: '50', label: '$50' },
            { value: '100', label: '$100' }, { value: '200', label: '$200' },
            { value: '500', label: '$500' }
          ]}
      ],
      submitText: 'Aplicar recarga'
    });
    if (!v) return;

    const numero = String(v.numero || '').trim();
    if (!/^\d{10}$/.test(numero)) {
      return vxToast({ type: 'error', message: 'Número inválido (10 dígitos)' });
    }
    const monto = parseFloat(v.monto);
    if (!monto) return;

    const recargas = lsGet('volvix:recargas', []);
    const folio = 'REC-' + Date.now();
    recargas.unshift({
      id: folio,
      numero,
      compania: v.compania || 'Telcel',
      monto,
      comision: +(monto * 0.05).toFixed(2),
      estado: 'aplicada',
      fecha: Date.now()
    });
    lsSet('volvix:recargas', recargas);
    vxToast({ type: 'success', message: 'Recarga ' + fmtMoney(monto) + ' aplicada' });
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
  window.posPagoServicio = async function () {
    const v = await vxForm({
      title: 'Pago de servicio',
      fields: [
        { name: 'tipo', label: 'Servicio', type: 'select', required: true, default: 'CFE',
          options: [
            { value: 'CFE', label: 'CFE (Luz)' },
            { value: 'Agua', label: 'Agua' },
            { value: 'Telmex', label: 'Telmex' },
            { value: 'Gas', label: 'Gas' },
            { value: 'Internet', label: 'Internet' }
          ]},
        { name: 'referencia', label: 'Referencia / número de servicio', type: 'text', required: true, minLength: 4 },
        { name: 'monto', label: 'Monto a pagar', type: 'number', required: true, min: 0.01, step: 0.01 }
      ],
      submitText: 'Aplicar pago'
    });
    if (!v) return;

    const monto = parseFloat(v.monto);
    if (!monto) return;

    const pagos = lsGet('volvix:servicios', []);
    pagos.unshift({
      id: 'SVC-' + Date.now(),
      tipo: v.tipo || 'CFE',
      referencia: v.referencia,
      monto,
      comision: 8,
      estado: 'pagado',
      fecha: Date.now()
    });
    lsSet('volvix:servicios', pagos);
    vxToast({ type: 'success', message: 'Pago de ' + (v.tipo || 'CFE') + ' aplicado' });
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
  window.posCreateDepartamento = async function () {
    const v = await vxForm({
      title: 'Nuevo departamento',
      fields: [
        { name: 'nombre', label: 'Nombre del departamento', type: 'text', required: true, minLength: 2, maxLength: 40 },
        { name: 'iva', label: '% IVA aplicable', type: 'select', required: true, default: '16',
          options: [
            { value: '0', label: '0% (Exento)' },
            { value: '8', label: '8% (Frontera)' },
            { value: '16', label: '16% (General)' }
          ]}
      ],
      submitText: 'Crear departamento'
    });
    if (!v) return;

    const deps = lsGet('volvix:departamentos', [
      { id: 'DEP-1', nombre: 'Abarrotes', iva: 16, productos: 0 },
      { id: 'DEP-2', nombre: 'Bebidas', iva: 16, productos: 0 },
      { id: 'DEP-3', nombre: 'Limpieza', iva: 16, productos: 0 }
    ]);
    deps.push({
      id: 'DEP-' + Date.now(),
      nombre: v.nombre,
      iva: parseFloat(v.iva) || 16,
      productos: 0,
      created: Date.now()
    });
    lsSet('volvix:departamentos', deps);
    vxToast({ type: 'success', message: 'Departamento creado' });
    window.posListDepartamentos();
  };

  window.posDeleteDepartamento = async function (id) {
    const ok = await vxConfirm({
      title: 'Eliminar departamento',
      message: '¿Eliminar este departamento? Los productos asignados quedarán sin categoría.',
      danger: true
    });
    if (!ok) return;
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
  window.posCreateCotizacion = async function () {
    const v = await vxForm({
      title: 'Nueva cotización',
      fields: [
        { name: 'cliente', label: 'Cliente', type: 'text', required: true, minLength: 2, maxLength: 80 },
        { name: 'concepto', label: 'Concepto (1 línea)', type: 'text', required: true, default: 'Producto', maxLength: 120 },
        { name: 'total', label: 'Total estimado', type: 'number', required: true, min: 0, step: 0.01 }
      ],
      submitText: 'Crear cotización'
    });
    if (!v) return;

    const cots = lsGet('volvix:cotizaciones', []);
    cots.unshift({
      id: 'COT-' + Date.now(),
      cliente: v.cliente,
      concepto: v.concepto || 'Producto',
      total: parseFloat(v.total) || 0,
      vigencia: 7,
      estado: 'pendiente',
      created: Date.now()
    });
    lsSet('volvix:cotizaciones', cots);
    vxToast({ type: 'success', message: 'Cotización creada' });
    window.posListCotizaciones();
  };

  window.posConvertCotizacion = function (id) {
    const cots = lsGet('volvix:cotizaciones', []);
    const c = cots.find((x) => x.id === id);
    if (!c) return;
    c.estado = 'convertida';
    lsSet('volvix:cotizaciones', cots);
    vxToast({ type: 'success', message: 'Convertida a venta' });
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
    vxToast({ type: 'success', message: 'Apertura registrada - ' + fmtMoney(monto) });
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
    const v = await vxForm({
      title: 'Nuevo movimiento de kardex',
      fields: [
        { name: 'sku', label: 'SKU / código del producto', type: 'text', required: true, minLength: 1, maxLength: 40 },
        { name: 'tipo', label: 'Tipo de movimiento', type: 'radio', required: true, default: 'entrada',
          options: [
            { value: 'entrada', label: 'Entrada' },
            { value: 'salida', label: 'Salida' },
            { value: 'ajuste', label: 'Ajuste' }
          ]},
        { name: 'cantidad', label: 'Cantidad', type: 'number', required: true, min: 1, step: 1 },
        { name: 'motivo', label: 'Motivo', type: 'text', required: false, default: 'Movimiento manual', maxLength: 120 }
      ],
      submitText: 'Registrar movimiento'
    });
    if (!v) return;

    const cantidad = parseInt(v.cantidad, 10);
    if (!cantidad) return;

    const movs = lsGet('volvix:kardex', []);
    movs.unshift({
      id: 'KDX-' + Date.now(),
      sku: v.sku,
      tipo: v.tipo || 'entrada',
      cantidad,
      motivo: v.motivo || 'Movimiento manual',
      usuario: (session && session.user) || 'admin',
      fecha: Date.now()
    });
    lsSet('volvix:kardex', movs);
    vxToast({ type: 'success', message: 'Movimiento ' + (v.tipo || 'entrada') + ' registrado' });
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
  window.posCreateProveedor = async function () {
    const v = await vxForm({
      title: 'Nuevo proveedor',
      fields: [
        { name: 'nombre', label: 'Razón social', type: 'text', required: true, minLength: 3, maxLength: 100 },
        { name: 'rfc', label: 'RFC', type: 'text', required: false,
          pattern: '^([A-ZÑ&]{3,4})\\d{6}([A-Z\\d]{3})?$',
          placeholder: 'XAXX010101000', maxLength: 13,
          errorMessage: 'RFC mexicano inválido (12 o 13 caracteres)' },
        { name: 'contacto', label: 'Teléfono / contacto', type: 'tel', required: false, maxLength: 60 }
      ],
      submitText: 'Agregar proveedor'
    });
    if (!v) return;

    const provs = lsGet('volvix:proveedores', []);
    provs.push({
      id: 'PRV-' + Date.now(),
      nombre: v.nombre,
      rfc: (v.rfc || '').toUpperCase(),
      contacto: v.contacto || '',
      saldo: 0,
      activo: true,
      created: Date.now()
    });
    lsSet('volvix:proveedores', provs);
    vxToast({ type: 'success', message: 'Proveedor agregado' });
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
    vxToast({ type: 'success', message: 'Configuración guardada' });
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
  window.posTimbrarCFDI = async function () {
    const v = await vxForm({
      title: 'Timbrar CFDI 4.0',
      fields: [
        { name: 'folio', label: 'Folio de venta a timbrar', type: 'text', required: true, minLength: 1, maxLength: 40 },
        { name: 'rfc', label: 'RFC del cliente', type: 'text', required: true,
          pattern: '^([A-ZÑ&]{3,4})\\d{6}([A-Z\\d]{3})?$',
          placeholder: 'XAXX010101000', maxLength: 13,
          errorMessage: 'RFC mexicano inválido (12 o 13 caracteres)' },
        { name: 'usoCFDI', label: 'Uso CFDI', type: 'select', required: true, default: 'G03',
          options: [
            { value: 'G01', label: 'G01 - Adquisición de mercancías' },
            { value: 'G03', label: 'G03 - Gastos en general' },
            { value: 'P01', label: 'P01 - Por definir' }
          ]}
      ],
      submitText: 'Timbrar'
    });
    if (!v) return;

    const cfdis = lsGet('volvix:cfdi', []);
    cfdis.unshift({
      id: 'CFDI-' + Date.now(),
      folio: v.folio,
      rfc: (v.rfc || '').toUpperCase(),
      usoCFDI: v.usoCFDI || 'G03',
      uuid: 'XXXXXXXX-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      estado: 'timbrado',
      fecha: Date.now()
    });
    lsSet('volvix:cfdi', cfdis);
    vxToast({ type: 'success', message: 'CFDI timbrado' });
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
  window.posCreateUser = async function () {
    const v = await vxForm({
      title: 'Nuevo usuario',
      fields: [
        { name: 'usuario', label: 'Nombre de usuario', type: 'text', required: true, minLength: 3, maxLength: 30,
          pattern: '^[a-zA-Z0-9_.-]+$',
          errorMessage: 'Solo letras, números, _ . -' },
        { name: 'email', label: 'Email', type: 'email', required: false, maxLength: 100 },
        { name: 'rol', label: 'Rol', type: 'select', required: true, default: 'cajero',
          options: [
            { value: 'admin', label: 'Administrador' },
            { value: 'cajero', label: 'Cajero' },
            { value: 'vendedor', label: 'Vendedor' },
            { value: 'supervisor', label: 'Supervisor' }
          ]}
      ],
      submitText: 'Crear usuario'
    });
    if (!v) return;

    const users = lsGet('volvix:users', []);
    users.push({
      id: 'USR-' + Date.now(),
      usuario: v.usuario,
      email: v.email || '',
      rol: v.rol || 'cajero',
      activo: true,
      ultima: null,
      created: Date.now()
    });
    lsSet('volvix:users', users);
    vxToast({ type: 'success', message: 'Usuario creado' });
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
    const v = await vxForm({
      title: 'Cambiar precios masivo',
      fields: [
        { name: 'porcentaje', label: '% a aplicar a TODOS los precios',
          type: 'number', required: true, min: -90, max: 500, step: 0.01,
          placeholder: 'positivo aumenta, negativo baja' }
      ],
      submitText: 'Continuar'
    });
    if (!v) return;

    const porcentaje = parseFloat(v.porcentaje);
    if (!porcentaje) return;

    const ok = await vxConfirm({
      title: 'Confirmar actualización masiva',
      message: 'Se aplicará ' + porcentaje + '% a TODOS los productos. Esta acción no se puede deshacer fácilmente. ¿Continuar?',
      danger: true
    });
    if (!ok) return;

    const productos = (await apiGet('/api/products')) || [];
    const factor = 1 + porcentaje / 100;
    let okCount = 0;
    for (const p of productos) {
      const nuevo = +(parseFloat(p.price) * factor).toFixed(2);
      const r = await apiPost('/api/products/' + p.id + '/price', {
        price: nuevo
      });
      if (!r || !r.error) okCount++;
    }
    const log = lsGet('volvix:actualizaciones', []);
    log.unshift({
      id: 'UPD-' + Date.now(),
      tipo: 'precios',
      porcentaje,
      afectados: okCount,
      total: productos.length,
      fecha: Date.now()
    });
    lsSet('volvix:actualizaciones', log);
    vxToast({
      type: 'success',
      message: 'Actualizados ' + okCount + '/' + productos.length + ' productos'
    });
    window.posListActualizador();
  };

  // Toasts informativos para botones secundarios del actualizador
  window.posInfoStock = function () {
    vxToast({
      type: 'info',
      message: 'Función de stock disponible desde inventario por producto.'
    });
  };

  window.posInfoCategorias = function () {
    vxToast({
      type: 'info',
      message: 'Cambio masivo de categoría — usa departamentos.'
    });
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
          <button class="btn" onclick="posInfoStock()">Ajuste de stock</button>
          <button class="btn" onclick="posInfoCategorias()">Cambiar categorias</button>
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
