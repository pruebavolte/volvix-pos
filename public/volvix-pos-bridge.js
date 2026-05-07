/* Auto-extraido 2026-05-06 de salvadorex-pos.html (era inline 452KB).
   Cargar con <script defer src="/volvix-pos-bridge.js"></script>
   Asi el HTML parsea rapido, splash pinta, este script ejecuta
   tras DOMContentLoaded sin bloquear el render. */

// 2026-05-06: el body original (462KB) ejecutaba sincronicamente bloqueando
// el main thread por varios segundos. Lo envolvemos en requestIdleCallback
// (fallback setTimeout 50ms) para que el browser tenga oportunidad de pintar
// el splash + UI inicial ANTES de ejecutar este modulo. El user ve la pagina
// inmediato; el modulo se inicializa cuando el browser este idle.
(function () {
  function _runVolvixBridge() {
    try {
      /* ============================================================
     VOLVIX BRIDGE · Comunicación con el panel del dueño del sistema
     Usa localStorage (persistencia) + BroadcastChannel (tiempo real)
     ============================================================ */
  // 2026-05-06: TENANT_ID ahora se deriva del JWT del usuario actual, no es
  // hardcoded. Asi cada cuenta nueva tiene su propio bridge state aislado y
  // NO ve los productos/datos de otros tenants (era el bug de 'Don Chucho').
  function __deriveTenantIdFromToken() {
    try {
      var t = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (!t) return 'TNT001';
      var parts = t.split('.');
      if (parts.length < 2) return 'TNT001';
      var p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.tenant_id || p.tid || 'TNT001';
    } catch (_) { return 'TNT001'; }
  }
  const TENANT_ID = __deriveTenantIdFromToken();
  const STORAGE_KEY = 'volvix:tenant:' + TENANT_ID;
  const CHANNEL_NAME = 'volvix-saas';

  // 2026-05-06: derivamos nombre del tenant desde el JWT (claim tenant_name o
  // business_name); fallback a 'Mi negocio' generico — NO mas 'Don Chucho'.
  function __deriveTenantNameFromToken() {
    try {
      var t = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (!t) return 'Mi negocio';
      var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.tenant_name || p.business_name || p.name || 'Mi negocio';
    } catch (_) { return 'Mi negocio'; }
  }
  const DEFAULT_TENANT_STATE = {
    id: TENANT_ID,
    name: __deriveTenantNameFromToken(),
    brand: 'SalvadoreX',
    plan: 'Pro',
    status: 'active', // 'active' | 'suspended' | 'revoked' | 'expired'
    licenseKey: 'VLVX-A3F9-C2E1-B8D4',
    licenseExpires: '2027-01-15',
    seats: { web: 3, windows: 2, android: 1 },
    modules: {
      pos: true, dashboard: true, apertura: true, corte: true,
      inventario: true, kardex: true, clientes: true, credito: true,
      proveedores: true, cotizaciones: true, devoluciones: true,
      ventas: true, reportes: true, facturacion: false,
      recargas: true, servicios: true, tarjetas: false,
      promociones: true, departamentos: true, sugeridas: false,
      actualizador: true, usuarios: true, config: true
    },
    features: {
      'pos.ins_varios': true, 'pos.art_comun': true, 'pos.buscar': true,
      'pos.mayoreo': true, 'pos.entradas': true, 'pos.salidas': true,
      'pos.borrar': true, 'pos.verificador': true, 'pos.panel': true,
      'pos.catalogo': true, 'pos.granel': true, 'pos.descuento': true,
      'pos.recargas_btn': true, 'pos.servicios_btn': true, 'pos.calculadora': true,
      'pos.cambiar': true, 'pos.pendiente': true, 'pos.quickpick_panel': true,
      'ui.saas_btn': true
    },
    broadcast: null
  };

  const VOLVIX = {
    channel: null,

    init() {
      // Inicializar estado si no existe
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TENANT_STATE));
      }
      // BroadcastChannel para tiempo real entre tabs
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (e) => this.handleMessage(e.data);
      } catch (err) {
        console.warn('BroadcastChannel no disponible, usando storage events');
      }
      // Fallback: storage event
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          this.handleMessage({ type: 'state-update', state: JSON.parse(e.newValue) });
        }
      });
    },

    getState() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_TENANT_STATE; }
      catch { return DEFAULT_TENANT_STATE; }
    },

    setState(state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (this.channel) {
        this.channel.postMessage({ type: 'state-update', tenantId: TENANT_ID, state });
      }
    },

    handleMessage(msg) {
      if (msg.type === 'state-update' && msg.tenantId === TENANT_ID) {
        this.applyState(msg.state, true);
      }
      if (msg.type === 'owner-message' && msg.tenantId === TENANT_ID) {
        this.showOwnerMessage(msg.text, msg.severity);
      }
      if (msg.type === 'force-action' && msg.tenantId === TENANT_ID) {
        this.handleForceAction(msg.action);
      }
    },

    isFeatureOn(state, key) {
      if (!state) return true;
      if (key.startsWith('module.')) {
        return state.modules?.[key.replace('module.', '')] !== false;
      }
      return state.features?.[key] !== false;
    },

    applyState(state, fromLive = false) {
      // Licencia revocada/suspendida: bloquear toda la app
      if (state.status === 'revoked' || state.status === 'suspended' || state.status === 'expired') {
        this.showLicenseBlock(state);
        return;
      } else {
        const block = document.getElementById('license-block');
        if (block) block.classList.remove('active');
      }

      // Aplicar flags a cada elemento con data-feature
      document.querySelectorAll('[data-feature]').forEach(el => {
        const key = el.dataset.feature;
        const enabled = this.isFeatureOn(state, key);
        if (enabled) {
          el.classList.remove('ff-off');
        } else {
          el.classList.add('ff-off');
        }
      });

      // Actualizar info visible del tenant
      const brandName = document.querySelector('.brand-info .name');
      if (brandName) brandName.textContent = state.brand || 'SalvadoreX';
      const brandSub = document.querySelector('.brand-info .sub');
      if (brandSub) brandSub.textContent = (state.name || 'Mi negocio') + ' · Caja 1';

      // Efecto visual si el cambio vino del owner en vivo
      if (fromLive) {
        this.flashUpdate();
        this.showOwnerMessage('Tu proveedor actualizó la configuración del sistema', 'info');
      }
    },

    showLicenseBlock(state) {
      let block = document.getElementById('license-block');
      if (!block) {
        block = document.createElement('div');
        block.id = 'license-block';
        block.className = 'license-block';
        document.body.appendChild(block);
      }
      const titles = {
        suspended: 'Servicio suspendido',
        revoked: 'Licencia revocada',
        expired: 'Licencia vencida'
      };
      const messages = {
        suspended: 'Tu proveedor suspendió temporalmente el acceso al sistema. Probablemente por falta de pago o mantenimiento.',
        revoked: 'Tu licencia fue revocada. Contacta a tu proveedor para más información.',
        expired: 'Tu licencia venció. Renuévala para continuar usando el sistema.'
      };
      // R7b FIX-V3: escapar campos server-sourced (state.name, state.licenseKey)
      // SAFE: titles[]/messages[] vienen de objetos literales locales, los iconos son SVG/emoji estaticos
      const _statusIcon = state.status === 'revoked' ? '🔒' : state.status === 'expired' ? '⏰' : '⚠️';
      const _statusTitle = escapeHtml(titles[state.status] || '');
      const _statusMsg = escapeHtml(messages[state.status] || '');
      const _bizName = escapeHtml(state.name || '');
      const _licKey = escapeHtml(state.licenseKey || '');
      block.innerHTML = `
        <div class="license-block-card">
          <div class="license-block-icon">${_statusIcon}</div>
          <h2 class="license-block-title">${_statusTitle}</h2>
          <p class="license-block-text">${_statusMsg}</p>
          <div class="license-block-info">
            <div class="row"><span>Negocio</span><strong>${_bizName}</strong></div>
            <div class="row"><span>Licencia</span><span class="mono">${_licKey}</span></div>
            <div class="row"><span>Estado</span><span class="chip err"><span class="dot"></span>${_statusTitle}</span></div>
          </div>
          <p class="license-block-text">Comunícate con tu proveedor para reactivar el servicio.</p>
          <button class="btn accent lg" style="width:100%;justify-content:center;" onclick="window.location.reload()">Reintentar</button>
        </div>
      `;
      block.classList.add('active');
    },

    showOwnerMessage(text, severity = 'info') {
      let banner = document.getElementById('owner-msg-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'owner-msg-banner';
        banner.className = 'owner-msg-banner';
        document.body.appendChild(banner);
      }
      // R7b FIX-V3: escapar texto antes de inyectar (servidor o broadcast podrian inyectar HTML/JS)
      banner.innerHTML = '<span>' + escapeHtml(text) + '</span>';
      banner.classList.add('show');
      clearTimeout(window._ob);
      window._ob = setTimeout(() => banner.classList.remove('show'), 4500);
    },

    handleForceAction(action) {
      if (action === 'force-logout') {
        if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
          window.VolvixUI.toast({ type: 'error', message: 'Tu proveedor cerró tu sesión remotamente.' });
        } else {
          VolvixUI.toast({type:'info', message:'Tu proveedor cerró tu sesión remotamente.'});
        }
        location.reload();
      }
      if (action === 'force-update') {
        this.showOwnerMessage('Actualización disponible. La app se reiniciará.', 'warn');
      }
    },

    flashUpdate() {
      document.querySelectorAll('[data-feature]').forEach(el => {
        el.classList.add('live-update-flash');
        setTimeout(() => el.classList.remove('live-update-flash'), 1200);
      });
    }
  };

  // Inicializar el bridge inmediatamente
  VOLVIX.init();

  /* ============ DATA ============ */
  // 2026-05-06: arrays demo CATALOG/CART/CUSTOMERS/CREDIT/SALES eliminados.
  // Antes mostraban Coca Cola, Pan dulce, Maria Lopez, Carlos Ramirez a TODOS
  // los usuarios — contaminacion visual cross-tenant. Ahora arrancan vacios y
  // se hidratan desde la API filtrada por tenant_id del JWT.
  // Hidratacion ocurre en VolvixDataLoader (definido mas abajo); cada modulo
  // re-renderiza cuando los datos llegan. Si la API falla, el modulo muestra
  // empty state, NO datos demo.
  const CATALOG = [];
  let CART = [];
  let CUSTOMERS = [];
  const CREDIT = [];
  let SALES = [];

  // 2026-05-06 (FASE 6+7 CLAUDE.md): config por giro — UN solo sistema, multiples
  // comportamientos. Lee /api/giro/config y aplica:
  //   - Oculta menu-btn que no esten en modulos[]
  //   - Reemplaza terminos i18n: data-i18n="cliente" -> "Paciente" para vet/medico
  //   - Oculta/muestra campos del modal producto segun campos.producto[X].visible
  window.VolvixGiroConfig = {
    config: null,
    _loading: false,
    async load() {
      if (this._loading || this.config) return; // no concurrente, no re-load
      this._loading = true;
      var token = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (!token) { this._loading = false; return; }
      try {
        // 2026-05-06 FIX: AbortController con timeout 6s para no colgar la app.
        var ctl = new AbortController();
        var timer = setTimeout(function () { try { ctl.abort(); } catch (_) {} }, 6000);
        var r = await fetch('/api/giro/config', {
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: ctl.signal,
        });
        clearTimeout(timer);
        if (!r.ok) { this._loading = false; return; }
        this.config = await r.json();
        this.apply();
      } catch (e) { console.warn('[GiroConfig] load:', e); }
      this._loading = false;
    },
    apply() {
      if (!this.config) return;
      var cfg = this.config;
      // 1) Modulos: ocultar .menu-btn[data-menu] que no este en cfg.modulos
      try {
        var modulos = cfg.modulos || [];
        document.querySelectorAll('.menu-btn[data-menu]').forEach(function (el) {
          var m = el.getAttribute('data-menu');
          if (!modulos.length || modulos.indexOf(m) === -1) {
            // Modulo no activo para este giro -> ocultar
            // Permitimos siempre los 6 nucleo (vender/inventario/clientes/corte/reportes/config)
            var nucleo = ['vender','inventario','clientes','corte','reportes','config'];
            if (nucleo.indexOf(m) === -1) {
              el.style.display = 'none';
              el.setAttribute('data-giro-hidden', '1');
            }
          } else {
            el.style.display = '';
            el.removeAttribute('data-giro-hidden');
          }
        });
      } catch (_) {}
      // 2) Terminologia: reemplazar textos en elementos con data-i18n="X"
      try {
        var term = cfg.terminologia || {};
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
          var key = el.getAttribute('data-i18n');
          var plural = el.hasAttribute('data-i18n-plural');
          if (term[key]) {
            el.textContent = plural ? term[key].plural : term[key].singular;
          }
        });
      } catch (_) {}
      // 3) Campos del modal producto: ocultar inputs/checkboxes con data-flag
      try {
        var camposProducto = (cfg.campos && cfg.campos.producto) || {};
        document.querySelectorAll('[data-flag]').forEach(function (el) {
          var flag = el.getAttribute('data-flag');
          var meta = camposProducto[flag];
          if (meta && meta.visible === false) {
            // Ocultar el wrapper (div padre) si lo hay
            var wrap = el.closest('.field, .input-group, label') || el;
            wrap.style.display = 'none';
            wrap.setAttribute('data-giro-hidden', '1');
          } else if (meta && meta.visible) {
            var wrap2 = el.closest('.field, .input-group, label') || el;
            wrap2.style.display = '';
            wrap2.removeAttribute('data-giro-hidden');
          }
        });
      } catch (_) {}
      // Disparar evento para que otros modulos sepan que la config esta lista
      try { document.dispatchEvent(new CustomEvent('volvix:giro-config-applied', { detail: cfg })); } catch (_) {}
    },
    // 2026-05-06: aplicar la config tambien a un subarbol del DOM (para modals
    // y elementos creados on-demand con innerHTML). Llamado por MutationObserver.
    applyToNode(root) {
      if (!this.config || !root || !root.querySelectorAll) return;
      var cfg = this.config;
      try {
        var term = cfg.terminologia || {};
        root.querySelectorAll('[data-i18n]').forEach(function (el) {
          var key = el.getAttribute('data-i18n');
          var plural = el.hasAttribute('data-i18n-plural');
          if (term[key]) el.textContent = plural ? term[key].plural : term[key].singular;
        });
      } catch (_) {}
      try {
        var camposProducto = (cfg.campos && cfg.campos.producto) || {};
        root.querySelectorAll('[data-flag]').forEach(function (el) {
          var flag = el.getAttribute('data-flag');
          var meta = camposProducto[flag];
          if (meta && meta.visible === false) {
            var wrap = el.closest('.field, .input-group, label') || el;
            wrap.style.display = 'none';
          }
        });
      } catch (_) {}
    }
  };
  // 2026-05-06 FIX: misma logica que DataLoader — un solo entry point.
  setTimeout(function () {
    try { window.VolvixGiroConfig.load(); } catch (_) {}
  }, 100);

  // 2026-05-06 (FASE 7): MutationObserver — cuando se agregan nuevos elementos
  // al DOM (modals, screens dinamicos, dropdowns), re-aplicar terminologia y
  // visibility de campos. Asi el usuario de veterinaria ve "Pacientes" en
  // tablas que se construyen en runtime, no solo en las del HTML inicial.
  // Throttle: maximo 1 ejecucion cada 200ms para no saturar.
  (function setupGiroDomObserver() {
    var pending = false;
    var observer = new MutationObserver(function (mutations) {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        try {
          if (!window.VolvixGiroConfig || !window.VolvixGiroConfig.config) return;
          mutations.forEach(function (m) {
            m.addedNodes && m.addedNodes.forEach(function (node) {
              if (node.nodeType === 1) { // Element node
                window.VolvixGiroConfig.applyToNode(node);
              }
            });
          });
        } catch (_) {}
      }, 200);
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  })();

  // Loader que llena CATALOG/CUSTOMERS/SALES desde la API real del tenant.
  // Se invoca despues del SSO check, cuando ya hay JWT valido.
  // 2026-05-06 FIX: AbortController con timeout 8s + flag para evitar runs
  // simultaneos. El bug "pagina blanca/colgada" post-registro se debia a
  // multiples loadAll() concurrentes (volvix:login + DOMContentLoaded) que
  // mantenian fetches abiertos sin timeout.
  window.VolvixDataLoader = {
    _running: false,
    async _fetchTO(url, headers, timeoutMs) {
      var ctl = new AbortController();
      var timer = setTimeout(function () { try { ctl.abort(); } catch (_) {} }, timeoutMs || 8000);
      try {
        var r = await fetch(url, { headers: headers, credentials: 'include', signal: ctl.signal });
        clearTimeout(timer);
        return r;
      } catch (e) {
        clearTimeout(timer);
        return null;
      }
    },
    async loadAll() {
      if (this._running) return; // evitar runs concurrentes
      this._running = true;
      var token = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (!token) { this._running = false; return; }
      var headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
      // Productos (CATALOG)
      try {
        var r = await this._fetchTO('/api/products?limit=1000', headers, 8000);
        if (r && r.ok) {
          var j = await r.json();
          var arr = (j && Array.isArray(j.products)) ? j.products : (Array.isArray(j) ? j : []);
          CATALOG.length = 0;
          arr.forEach(function (p) {
            CATALOG.push({
              code: String(p.sku || p.code || p.barcode || ''),
              name: String(p.name || p.nombre || ''),
              price: Number(p.price || p.precio_venta || 0),
              stock: Number(p.stock || 0),
              category: p.category || p.categoria || null,
              raw: p,
            });
          });
          try { document.dispatchEvent(new CustomEvent('volvix:products-loaded', { detail: { count: CATALOG.length } })); } catch (_) {}
        }
      } catch (e) { console.warn('[DataLoader] productos:', e); }
      // Clientes
      try {
        var rc = await this._fetchTO('/api/customers?limit=500', headers, 8000);
        if (rc && rc.ok) {
          var jc = await rc.json();
          var arrc = (jc && Array.isArray(jc.customers)) ? jc.customers : (Array.isArray(jc) ? jc : []);
          CUSTOMERS.length = 0;
          arrc.forEach(function (c) {
            CUSTOMERS.push([
              String(c.name || c.nombre || ''),
              String(c.phone || c.telefono || ''),
              Number(c.credit_limit || 0),
              Number(c.debt || c.deuda || 0),
              Number(c.purchases_count || 0),
              c.last_purchase_at || c.last_visit || '—',
            ]);
          });
          try { document.dispatchEvent(new CustomEvent('volvix:customers-loaded', { detail: { count: CUSTOMERS.length } })); } catch (_) {}
        }
      } catch (e) { console.warn('[DataLoader] clientes:', e); }
      // Ventas (historial)
      try {
        var rs = await this._fetchTO('/api/sales?limit=200', headers, 8000);
        if (rs && rs.ok) {
          var js = await rs.json();
          var arrs = (js && Array.isArray(js.sales)) ? js.sales : (Array.isArray(js) ? js : []);
          SALES.length = 0;
          arrs.forEach(function (s) {
            SALES.push([
              String('#' + (s.folio || s.id || '').toString().padStart(6, '0')),
              s.created_at || s.fecha || '',
              String(s.customer_name || s.cliente || 'Publico general'),
              String(s.cashier || s.cajero || ''),
              String(s.payment_method || s.metodo || 'Efectivo'),
              Number(s.total || 0),
              s.status || 'completed',
            ]);
          });
          try { document.dispatchEvent(new CustomEvent('volvix:sales-loaded', { detail: { count: SALES.length } })); } catch (_) {}
        }
      } catch (e) { console.warn('[DataLoader] ventas:', e); }
      this._running = false; // liberar flag al terminar
    }
  };
  // 2026-05-06 FIX: ANTES disparabamos loadAll() en TRES lugares (volvix:login,
  // DOMContentLoaded, inmediato) — eso podia hacer que el browser tuviera 9
  // fetches concurrentes (3 endpoints x 3 triggers) y se colgara. Ahora UNA sola
  // entrada: setTimeout 100ms post script-load. El flag _running protege
  // contra otros llamados.
  setTimeout(function () {
    try { window.VolvixDataLoader.loadAll(); } catch (_) {}
  }, 100);
  // 2026-05-06: USERS demo era hardcoded con emails @donchucho.mx — confundia
  // a usuarios nuevos al ver gente que no es de su negocio. Ahora arrancamos
  // con SOLO el admin actual (derivado del JWT); el owner agrega los demas
  // empleados desde Configuracion -> Usuarios. NO mas datos de ejemplo de Don Chucho.
  function __buildInitialUsersFromSession() {
    try {
      var t = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (!t) return [['admin', 'Administrador', '', 'En linea', 'online']];
      var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      var em = p.email || '';
      var role = (p.role === 'owner' || p.role === 'admin' || p.role === 'superadmin') ? 'Administrador' :
                 (p.role === 'manager' ? 'Gerente' :
                 (p.role === 'cajero' || p.role === 'cashier' ? 'Cajero' : 'Administrador'));
      return [[em.split('@')[0] || 'admin', role, em, 'En linea', 'online']];
    } catch (_) { return [['admin', 'Administrador', '', 'En linea', 'online']]; }
  }
  const USERS = __buildInitialUsersFromSession();

  /* ============ CATEGORÍAS Y QUICK-PICK (panel derecho POS) ============ */
  const CATEGORIES = [
    {key:'lacteos',    icon:'🥛', name:'Lácteos'},
    {key:'bebidas',    icon:'🥤', name:'Bebidas'},
    {key:'snacks',     icon:'🍿', name:'Snacks'},
    {key:'enlatados',  icon:'🥫', name:'Enlatados'},
    {key:'panaderia',  icon:'🍞', name:'Panadería'},
    {key:'limpieza',   icon:'🧽', name:'Limpieza'},
    {key:'frutas',     icon:'🍎', name:'Frutas y Verduras'},
  ];

  const QUICKPICK = [
    // Lácteos
    {cat:'lacteos',    icon:'🥛', name:'Leche Lala',    price:26, code:'750105', stock:54},
    {cat:'lacteos',    icon:'🧀', name:'Queso Oax',     price:120, code:'750402', stock:12},
    {cat:'lacteos',    icon:'🥣', name:'Yogurt',        price:18, code:'750420', stock:38},
    {cat:'lacteos',    icon:'🥚', name:'Huevos',        price:32, code:'750500', stock:44},
    {cat:'lacteos',    icon:'🧈', name:'Mantequilla',   price:45, code:'750430', stock:23},
    {cat:'lacteos',    icon:'🍦', name:'Crema',         price:38, code:'750440', stock:17},
    // Bebidas
    {cat:'bebidas',    icon:'🥤', name:'Coca Cola',     price:38, code:'750205', stock:124},
    {cat:'bebidas',    icon:'🍹', name:'Del Valle',     price:22, code:'750220', stock:58},
    {cat:'bebidas',    icon:'💧', name:'Ciel 1L',       price:14, code:'750210', stock:96},
    {cat:'bebidas',    icon:'🧃', name:'Boing',         price:12, code:'750215', stock:72},
    // Snacks
    {cat:'snacks',     icon:'🍿', name:'Palomitas',     price:15, code:'750701', stock:67},
    {cat:'snacks',     icon:'🍪', name:'Galletas',      price:20, code:'750720', stock:45},
    {cat:'snacks',     icon:'🥜', name:'Cacahuates',    price:18, code:'750730', stock:33},
    {cat:'snacks',     icon:'🍫', name:'Chocolate',     price:24, code:'750740', stock:52},
    // Enlatados
    {cat:'enlatados',  icon:'🥫', name:'Atún',          price:35, code:'750801', stock:88},
    {cat:'enlatados',  icon:'🫘', name:'Frijoles',      price:28, code:'750802', stock:63},
    {cat:'enlatados',  icon:'🌽', name:'Elote',         price:22, code:'750803', stock:41},
    {cat:'enlatados',  icon:'🍅', name:'Chiles',        price:26, code:'750804', stock:37},
    // Panadería
    {cat:'panaderia',  icon:'🍞', name:'Pan Bimbo',     price:24, code:'750600', stock:48},
    {cat:'panaderia',  icon:'🥖', name:'Baguette',      price:18, code:'750610', stock:22},
    {cat:'panaderia',  icon:'🥐', name:'Cuernito',      price:12, code:'750620', stock:36},
    {cat:'panaderia',  icon:'🧁', name:'Mantecada',     price:8,  code:'750630', stock:54},
    // Limpieza
    {cat:'limpieza',   icon:'🧽', name:'Fabuloso',      price:42, code:'750901', stock:41},
    {cat:'limpieza',   icon:'🧼', name:'Jabón',         price:15, code:'750910', stock:78},
    {cat:'limpieza',   icon:'🧴', name:'Shampoo',       price:68, code:'750920', stock:25},
    // Frutas
    {cat:'frutas',     icon:'🍎', name:'Manzana kg',    price:35, code:'750302', stock:89},
    {cat:'frutas',     icon:'🍌', name:'Plátano kg',    price:18, code:'750303', stock:112},
    {cat:'frutas',     icon:'🍊', name:'Naranja kg',    price:22, code:'750304', stock:94},
    {cat:'frutas',     icon:'🥑', name:'Aguacate',      price:15, code:'750305', stock:67},
  ];

  let selectedCategory = 'lacteos';

  const FF_TREE = [
    { key:'pos', icon:'🛒', name:'Punto de venta (F1)', desc:'Caja, cobro, tickets', on:true, children:[
      {key:'pos.discount', label:'Botón Descuento (%)', on:true, hint:''},
      {key:'pos.mayoreo', label:'Precio mayoreo (F11)', on:true, hint:''},
      {key:'pos.granel', label:'Venta a granel (⚖)', on:true, hint:''},
      {key:'pos.kit', label:'Kits / Artículos varios (INS)', on:true, hint:''},
      {key:'pos.common', label:'Artículo común (CTRL+P)', on:true, hint:''},
      {key:'pos.wa', label:'Enviar ticket WhatsApp', on:false, hint:'Requiere WhatsApp CRM'},
    ]},
    { key:'inv', icon:'📦', name:'Inventario (F3, F4)', desc:'Productos, stock', on:true, children:[
      {key:'inv.import', label:'Importar masivo', on:true},
      {key:'inv.cost', label:'Ver costo de productos', on:false, hint:'Solo gerentes'},
    ]},
    { key:'credit', icon:'💳', name:'Créditos (F2)', desc:'Cuentas por cobrar', on:true },
    { key:'clientes', icon:'👥', name:'Clientes', desc:'Base de datos', on:true },
    { key:'compras', icon:'🚚', name:'Compras / Proveedores', desc:'Órdenes de compra', on:true },
    { key:'reportes', icon:'📈', name:'Reportes', desc:'Analytics y KPIs', on:true },
    { key:'corte', icon:'💼', name:'Corte de caja', desc:'Cierre de turno', on:true },
    { key:'apertura', icon:'🔓', name:'Apertura de caja', desc:'Registro inicial', on:true },
    { key:'devoluciones', icon:'↩️', name:'Devoluciones', desc:'Totales o parciales', on:true },
    { key:'cotizaciones', icon:'📝', name:'Cotizaciones', desc:'Convertir a venta', on:true },
    { key:'recargas', icon:'📱', name:'Recargas electrónicas', desc:'Tiempo aire', on:true },
    { key:'servicios', icon:'💡', name:'Pago de servicios', desc:'CFE, agua, etc.', on:true },
    { key:'tarjetas', icon:'🎬', name:'Tarjetas virtuales', desc:'Streaming, gaming', on:false, hint:'No incluido' },
    { key:'facturacion', icon:'📄', name:'Facturación CFDI', desc:'Timbrado SAT', on:false, hint:'+$49/mes' },
    { key:'whatsapp', icon:'💬', name:'WhatsApp CRM', desc:'Mensajería', on:false, hint:'+$49/mes' },
    { key:'promociones', icon:'🎁', name:'Promociones', desc:'2x1, combos', on:true },
    { key:'departamentos', icon:'🏢', name:'Departamentos', desc:'Agrupación fiscal', on:true },
    { key:'sugeridas', icon:'🧠', name:'Compras sugeridas (IA)', desc:'Predicción de demanda', on:false, hint:'+$99/mes · Beta' },
    { key:'actualizador', icon:'💱', name:'Actualizador masivo', desc:'Edición en lote', on:true },
    { key:'dashboard', icon:'📊', name:'Dashboard', desc:'Resumen ejecutivo', on:true },
    { key:'usuarios', icon:'👤', name:'Gestión de usuarios', desc:'Roles y permisos', on:true },
  ];

  /* ============ UTILS ============ */
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const fmt = n => '$' + n.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2});
  const parse$ = s => parseFloat(String(s).replace(/[$,\s]/g,'')) || 0;

  /* ============ SSO (Volvix → SalvadoreX) ============ */
  // Si ya hay JWT Volvix válido, saltar el login local de SalvadoreX.
  // R29: si NO hay token, redirigir a login Volvix central (UX uniforme)
  (function ssoCheck(){
    try {
      const token = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (!token) {
        // Sin sesión → ir al login Volvix central, NO mostrar form local
        const back = encodeURIComponent(location.pathname + location.search);
        location.replace('/login.html?redirect=' + back);
        return;
      }
      const parts = token.split('.');
      if (parts.length < 2) return;
      const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      if (!payload.exp || payload.exp * 1000 <= Date.now()) {
        // expirado → limpiar y redirigir a login Volvix
        localStorage.removeItem('volvix_token');
        localStorage.removeItem('volvixAuthToken');
        const back = encodeURIComponent(location.pathname + location.search);
        location.replace('/login.html?expired=1&redirect=' + back);
        return;
      }
      // Token Volvix válido → simular login local exitoso
      // 2026-05-06: removido fallback 'don-chucho' / 'Abarrotes Don Chucho' —
      // si el token no trae tenant, usamos placeholders genericos y tratamos de
      // derivar nombre desde business_name del registro (recordado en
      // localStorage volvix_last_search). NUNCA mas valores demo.
      var __fallbackBiz = 'Mi negocio';
      try {
        var __raw = localStorage.getItem('volvix_last_search');
        if (__raw) {
          var __j = JSON.parse(__raw);
          if (__j && (__j.business_name || __j.query)) {
            __fallbackBiz = String(__j.business_name || __j.query).slice(0, 60);
          }
        }
      } catch (_) {}
      const ssoSession = {
        user_id: payload.sub || payload.user_id || payload.email,
        email: payload.email,
        role: payload.role || 'admin',
        tenant_id: payload.tenant_id || payload.tid || (TENANT_ID || 'TNT001'),
        tenant_name: payload.tenant_name || payload.business_name || __fallbackBiz,
        plan: payload.plan || 'Pro',
        via: 'sso'
      };
      try { localStorage.setItem('volvixSession', JSON.stringify(ssoSession)); } catch(e){}
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          tenantId: ssoSession.tenant_id,
          tenantName: ssoSession.tenant_name,
          userRole: ssoSession.role,
          userId: ssoSession.user_id,
          plan: ssoSession.plan
        }));
      } catch(e){}
      try { localStorage.setItem('salvadorex_session', JSON.stringify(ssoSession)); } catch(e){}

      // Esconder login screen apenas se monte el DOM
      const hideLogin = () => {
        const lock = document.getElementById('login-screen');
        if (lock) { lock.classList.add('hidden'); lock.style.display = 'none'; }
        const root = document.getElementById('app-root');
        if (root) root.classList.remove('login-active');
        document.body.classList.add('logged-in');
        // 2026-05-06: HIDRATAR inputs de Perfil + Datos del negocio con valores
        // del usuario actual. Antes estaban hardcoded a 'admin@donchucho.mx' /
        // 'Abarrotes Don Chucho' lo cual confundia a los nuevos usuarios al ver
        // datos de otra cuenta.
        try {
          var perfilNombre = document.getElementById('perfil-nombre');
          var perfilEmail = document.getElementById('perfil-email');
          var negNombre = document.getElementById('cfg-negocio-nombre');
          var negTel = document.getElementById('cfg-negocio-telefono');
          if (perfilNombre && !perfilNombre.value) {
            perfilNombre.value = ssoSession.user_id && !ssoSession.user_id.includes('@')
              ? ssoSession.user_id
              : (ssoSession.email ? ssoSession.email.split('@')[0] : '');
          }
          if (perfilEmail && !perfilEmail.value) perfilEmail.value = ssoSession.email || '';
          if (negNombre && !negNombre.value) negNombre.value = ssoSession.tenant_name || '';
          // Telefono: si tenemos volvix_last_contact lo usamos
          try {
            var c = JSON.parse(localStorage.getItem('volvix_last_contact') || '{}');
            if (negTel && !negTel.value && c.phone) negTel.value = c.phone;
          } catch (_) {}
          // Header: brand-info .name = brand, .sub = tenant_name + ' · Caja 1'
          var brandSub2 = document.querySelector('.brand-info .sub');
          if (brandSub2) brandSub2.textContent = (ssoSession.tenant_name || 'Mi negocio') + ' · Caja 1';
          // Tambien el login-screen sub (por si el flash inicial alcanza a verse)
          var loginSub = document.getElementById('login-tenant-sub');
          if (loginSub) loginSub.textContent = (ssoSession.tenant_name || 'Mi negocio') + ' · Caja 1';
        } catch (_) {}
        try {
          window.dispatchEvent(new CustomEvent('salvadorex:logged-in', { detail: ssoSession }));
          document.dispatchEvent(new CustomEvent('volvix:login', { detail: ssoSession }));
        } catch(e){}
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideLogin, { once:true });
      } else {
        hideLogin();
      }
      console.log('[SSO] Login Volvix detectado, login local omitido para', ssoSession.email);
    } catch (e) {
      console.warn('[SSO] token inválido, fallback a login local:', e);
    }
  })();

  /* ============ LOGIN ============ */
  async function handleLogin(event) {
    event?.preventDefault();
    const email = document.getElementById('login-email').value?.trim();
    const password = document.getElementById('login-password').value?.trim();

    if (!email || !password) {
      showToast('Ingresa email y contraseña', 'error');
      return;
    }

    const btn = document.getElementById('btn-login-submit');
    btn.disabled = true;
    btn.textContent = 'Validando...';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Credenciales inválidas', 'error');
        btn.disabled = false;
        btn.textContent = 'Iniciar sesión';
        return;
      }

      const { ok, session } = await res.json();
      if (ok && session) {
        // Guardar sesión en localStorage para offline
        localStorage.setItem('volvixSession', JSON.stringify(session));
        // Guardar tenant state
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          tenantId: session.tenant_id,
          tenantName: session.tenant_name,
          userRole: session.role,
          userId: session.user_id,
          plan: session.plan
        }));

        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-root').classList.remove('login-active');
        showToast(`Bienvenido, ${session.role === 'superadmin' ? 'Administrador' : session.role} ✓`);

        /* DESACTIVADO el 2026-05-02: lógica movida a volvix-real-data-loader.js
           para tener UNA sola fuente de verdad y eliminar la race condition
           entre este loader y el del wiring. Antes los dos competían: uno
           actualizaba inv-sub directo en DOM y el otro llenaba CATALOG;
           dependiendo del orden, los KPIs quedaban con datos demo aunque
           el header mostrara los reales. Ver volvix-real-data-loader.js:
           loadProductsReal/loadCustomersReal/loadSalesReal +
           loadUsersReal/loadCreditsReal (nuevos) — todos mutan los arrays
           CATALOG/CUSTOMERS/SALES/USERS/CREDIT y llaman renderXxx() y
           updateInvStats() para mantener KPIs en sync.

        // ===== CABLEADO: Cargar productos desde la base de datos =====
        try {
          const prodRes = await fetch('/api/products?tenant_id=' + session.tenant_id);
          if (prodRes.ok) {
            const products = await prodRes.json();
            if (products && products.length > 0 && typeof CATALOG !== 'undefined') {
              CATALOG.length = 0;
              products.forEach(p => CATALOG.push({code: p.code, name: p.name, price: p.price, cost: p.cost || 0, stock: p.stock || 0, id: p.id}));
              if (typeof renderInv === 'function') renderInv();
              if (typeof updateInvStats === 'function') updateInvStats();
            }
          }
        } catch(e) {}
        try {
          const cliRes = await fetch('/api/customers?tenant_id=' + session.tenant_id);
          if (cliRes.ok) {
            const customers = await cliRes.json();
            if (customers && Array.isArray(customers) && typeof CUSTOMERS !== 'undefined') {
              CUSTOMERS.length = 0;
              customers.forEach(c => CUSTOMERS.push([c.name||'', c.phone||'', c.credit_limit||0, c.credit_balance||0, c.points||0, c.last_purchase||'—']));
              if (typeof renderClientes === 'function') renderClientes();
            }
          }
        } catch(e) {}
        try {
          const saleRes = await fetch('/api/sales?tenant_id=' + session.tenant_id);
          if (saleRes.ok) {
            const sales = await saleRes.json();
            if (sales && Array.isArray(sales) && typeof SALES !== 'undefined') {
              SALES.length = 0;
              sales.forEach(s => SALES.push(['#' + (s.folio || s.id), s.created_at||'—', s.customer_name||'Público general', s.user_name||'Admin', s.payment_method||'Efectivo', s.total||0, s.status||'completed']));
              if (typeof renderVentas === 'function') renderVentas();
            }
          }
        } catch(e) {}
        FIN BLOQUE DESACTIVADO 2026-05-02 */

        // Disparar evento para que volvix-wiring.js se reinicialice
        document.dispatchEvent(new CustomEvent('volvix:login', { detail: session }));

        setTimeout(() => document.getElementById('barcode-input')?.focus(), 100);
      }
    } catch (err) {
      console.error('Login error:', err);
      showToast('Error conectando al servidor. Verifica conexión.', 'error');
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
    }
  }

  // doLogin() era wrapper huérfano de handleLogin — eliminado en consolida.
  async function doLogout() {
    let ok = false;
    if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
      ok = await window.VolvixUI.confirm({ title: 'Cerrar sesión', message: '¿Cerrar sesión?', confirmText: 'Cerrar sesión', cancelText: 'Cancelar' });
    } else {
      ok = confirm('¿Cerrar sesión?');
    }
    if (!ok) return;
    // Limpiar sesión local SalvadoreX
    try { localStorage.removeItem('salvadorex_session'); } catch(e){}
    try { localStorage.removeItem('volvixSession'); } catch(e){}
    // Limpiar JWT Volvix (SSO)
    try { localStorage.removeItem('volvix_token'); } catch(e){}
    try { localStorage.removeItem('volvixAuthToken'); } catch(e){}
    // Pedir al server que invalide la cookie HttpOnly
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch(e) { console.warn('[logout] /api/logout falló:', e); }
    // Volver al login Volvix unificado
    window.location.href = '/login.html';
  }

  /* ============ NAV ============ */
  function showScreen(name) {
    $$('section[id^="screen-"]').forEach(s => s.classList.add('hidden'));
    // La POS screen tiene su propia clase .pos-screen, no screen-pad
    const isPos = name === 'pos';
    const el = $('#screen-' + name);
    if (el) el.classList.remove('hidden');
    $$('.menu-btn').forEach(b => b.classList.toggle('active', b.dataset.menu === name));
    // 2026-05: actualizar fecha dinamica en Dashboard al activar (era hardcoded)
    if (name === 'dashboard') {
      try {
        var dsub = document.getElementById('dash-sub');
        if (dsub) {
          var d = new Date();
          var fecha = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
          var hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
          dsub.textContent = 'Resumen del día · ' + fecha + ' · ' + hora + ' hrs';
        }
      } catch(_) {}
    }
    // 2026-05-06 (FASE 2): tras eliminar arrays demo, re-renderizar la pantalla
    // activa cuando lleguen datos del DataLoader. Antes los modulos quedaban
    // mostrando placeholders/empty si la pantalla se abria antes de que la API
    // respondiera. Ahora cada vez que showScreen recibe un cambio, intentamos
    // hacer render de los modulos relevantes.
    try {
      window.__currentScreen = name;
      if (name === 'inventario' && typeof renderInventory === 'function') renderInventory();
      else if (name === 'clientes' && typeof renderCustomers === 'function') renderCustomers();
      else if (name === 'historial' && typeof renderSales === 'function') renderSales();
      else if (name === 'pos' && typeof renderCart === 'function') renderCart();
      else if (name === 'pos' && typeof renderQuickPick === 'function') renderQuickPick();
    } catch (_) {}
  }
  // 2026-05-06: re-render la pantalla activa cuando los datos lleguen del DataLoader.
  document.addEventListener('volvix:products-loaded', function () {
    try {
      var s = window.__currentScreen;
      if (s === 'inventario' && typeof renderInventory === 'function') renderInventory();
      if ((s === 'pos' || !s) && typeof renderQuickPick === 'function') renderQuickPick();
      if ((s === 'pos' || !s) && typeof renderCart === 'function') renderCart();
    } catch (_) {}
  });
  document.addEventListener('volvix:customers-loaded', function () {
    try {
      if (window.__currentScreen === 'clientes' && typeof renderCustomers === 'function') renderCustomers();
    } catch (_) {}
  });
  document.addEventListener('volvix:sales-loaded', function () {
    try {
      if (window.__currentScreen === 'historial' && typeof renderSales === 'function') renderSales();
    } catch (_) {}
  });

  /* ============ TOAST ============ */
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window._tt);
    window._tt = setTimeout(() => t.classList.remove('show'), 2500);
  }

  /* ============================================================
     B34: Nuevo Cliente · Reimprimir Ticket · Enviar a Impresora
     ============================================================ */
  // Abre modal para crear nuevo cliente
  window.openNewCustomerModal = async function () {
    // Construir HTML del modal si no existe
    let modal = document.getElementById('modal-new-customer');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-new-customer';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:99990;';
      modal.innerHTML = `
        <div style="background:#fff;color:#1C1917;border-radius:12px;padding:24px;width:480px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 style="margin:0;font-size:20px;font-weight:700;">+ Nuevo Cliente</h2>
            <button id="ncc-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>
          </div>
          <form id="ncc-form" style="display:flex;flex-direction:column;gap:12px;">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
              Nombre completo *
              <input id="ncc-name" type="text" required maxlength="120" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;" placeholder="Juan Pérez">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
              Teléfono
              <input id="ncc-phone" type="tel" maxlength="20" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;" placeholder="555 123 4567">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
              Email
              <input id="ncc-email" type="email" maxlength="120" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;" placeholder="cliente@ejemplo.com">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
              RFC (opcional)
              <input id="ncc-rfc" type="text" maxlength="13" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;text-transform:uppercase;" placeholder="XAXX010101000">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
              Crédito autorizado (opcional)
              <input id="ncc-credit" type="number" min="0" step="0.01" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;" placeholder="0.00" value="0">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
              Notas
              <textarea id="ncc-notes" maxlength="500" rows="2" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;resize:vertical;" placeholder="Información adicional…"></textarea>
            </label>
            <div id="ncc-dup-warning" style="display:none;padding:10px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;font-size:12px;color:#92400E;"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
              <button type="button" id="ncc-cancel" style="padding:10px 18px;border:1px solid #E7E5E4;background:#fff;border-radius:8px;cursor:pointer;font-weight:500;">Cancelar</button>
              <button type="submit" style="padding:10px 18px;border:none;background:#3B82F6;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">Guardar cliente</button>
            </div>
            <div id="ncc-msg" style="font-size:12px;color:#EF4444;min-height:16px;"></div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);

      const closeIt = () => { modal.style.display = 'none'; };
      modal.querySelector('#ncc-close').onclick = closeIt;
      modal.querySelector('#ncc-cancel').onclick = closeIt;
      modal.addEventListener('click', (e) => { if (e.target === modal) closeIt(); });

      // R4b GAP-C2: estado para reintento con force_create tras CUSTOMER_DUPLICATE.
      let _nccForceCreate = false;
      modal.querySelector('#ncc-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = modal.querySelector('#ncc-msg');
        const dupBox = modal.querySelector('#ncc-dup-warning');
        msg.textContent = '';
        const payload = {
          name:    modal.querySelector('#ncc-name').value.trim(),
          phone:   modal.querySelector('#ncc-phone').value.trim(),
          email:   modal.querySelector('#ncc-email').value.trim(),
          rfc:     (modal.querySelector('#ncc-rfc')?.value || '').trim().toUpperCase() || undefined,
          credit_limit: parseFloat(modal.querySelector('#ncc-credit').value) || 0,
          notes:   modal.querySelector('#ncc-notes').value.trim()
        };
        if (_nccForceCreate) payload.force_create = true;
        // Zod-like validations on client-side too.
        if (!payload.name) { msg.textContent = 'Nombre requerido'; return; }
        if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
          msg.textContent = 'Email inválido'; return;
        }
        if (payload.credit_limit < 0) { msg.textContent = 'Crédito no puede ser negativo'; return; }
        try {
          const tok = (typeof getToken === 'function' ? getToken() : '') || (window.session && window.session.token) || localStorage.getItem('volvix_token') || '';
          const r = await fetch('/api/customers', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
            body: JSON.stringify(payload)
          });
          if (r.status === 409) {
            const err = await r.json().catch(() => ({}));
            if (err && err.error_code === 'CUSTOMER_DUPLICATE' && err.existing) {
              const ex = err.existing;
              const conf = err.confidence != null ? err.confidence : 1.0;
              const isFuzzy = conf < 1.0;
              dupBox.style.display = 'block';
              dupBox.innerHTML =
                '<strong>Posible duplicado detectado</strong> ' +
                (isFuzzy ? '(' + Math.round(conf*100) + '% similitud)' : '(coincidencia exacta)') +
                '<br>Cliente existente: <b>' + (ex.name || '(sin nombre)') + '</b>' +
                (ex.rfc ? ' · RFC: ' + ex.rfc : '') +
                (ex.phone ? ' · Tel: ' + ex.phone : '') +
                '<br><br>¿Es el mismo cliente? <button type="button" id="ncc-go-existing" style="padding:6px 10px;border:none;background:#10B981;color:#fff;border-radius:6px;cursor:pointer;margin-right:6px;">Sí, abrir existente</button>' +
                '<button type="button" id="ncc-force-create" style="padding:6px 10px;border:none;background:#F59E0B;color:#fff;border-radius:6px;cursor:pointer;">No, crear de todos modos</button>';
              dupBox.querySelector('#ncc-go-existing').onclick = () => {
                showToast('Cliente existente: ' + (ex.name || ex.id));
                closeIt();
              };
              dupBox.querySelector('#ncc-force-create').onclick = () => {
                _nccForceCreate = true;
                dupBox.style.display = 'none';
                modal.querySelector('#ncc-form').dispatchEvent(new Event('submit', { cancelable: true }));
              };
              return;
            }
            msg.textContent = err.message || err.error || 'Conflicto (409)';
            return;
          }
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            msg.textContent = err.message || err.error || ('HTTP ' + r.status);
            return;
          }
          showToast('✓ Cliente "' + payload.name + '" creado');
          dupBox.style.display = 'none';
          _nccForceCreate = false;
          closeIt();
          // Recargar lista de clientes si la función existe
          if (typeof loadCustomersList === 'function') loadCustomersList();
          if (typeof renderClientes === 'function' && typeof CUSTOMERS !== 'undefined') {
            try {
              const sess = (window.session || {});
              const tok2 = (typeof getToken === 'function' ? getToken() : '') || sess.token || localStorage.getItem('volvix_token') || '';
              const rr = await fetch('/api/customers', { headers: tok2 ? { Authorization: 'Bearer ' + tok2 } : {} });
              if (rr.ok) {
                const list = await rr.json();
                if (Array.isArray(list)) {
                  CUSTOMERS.length = 0;
                  list.forEach(c => CUSTOMERS.push([c.name||'', c.phone||'', c.credit_limit||0, c.credit_balance||0, c.points||0, c.last_purchase||'—']));
                  const sub = document.getElementById('cli-sub');
                  if (sub) sub.textContent = list.length + ' clientes registrados';
                  renderClientes();
                }
              }
            } catch (_) {}
          }
          // Reset form
          modal.querySelector('#ncc-form').reset();
        } catch (err) {
          msg.textContent = 'Error de red: ' + (err.message || err);
        }
      });
    }
    modal.style.display = 'flex';
    setTimeout(() => modal.querySelector('#ncc-name')?.focus(), 50);
  };

  // Reimprimir último ticket (vista previa + opción de mandar a impresora)
  // R8a FIX-H4: cualquier reimpresión queda marcada is_copy=true en pos_print_log
  window.reimprimirUltimoTicket = async function () {
    try {
      const tok = (typeof getToken === 'function' ? getToken() : '') || (window.session && window.session.token) || localStorage.getItem('volvix_token') || '';
      // Obtener última venta del tenant
      const r = await fetch('/api/sales?limit=1', {
        headers: tok ? { Authorization: 'Bearer ' + tok } : {}
      });
      if (!r.ok) {
        showToast('No se pudo obtener última venta');
        return;
      }
      const data = await r.json();
      const sale = (data.items && data.items[0]) || (Array.isArray(data) && data[0]) || null;
      if (!sale) { showToast('No hay ventas previas'); return; }
      // R8a FIX-H4: Audit reprint event (browser preview path)
      try {
        if (sale.id && tok) {
          fetch('/api/sales/' + encodeURIComponent(sale.id) + '/print-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ event: 'reprint', reason: 'browser_preview' })
          }).catch(() => {});
        }
      } catch (_) {}

      // Construir HTML del ticket
      const items = (sale.items || []);
      const html = `
        <div style="font-family:'Courier New',monospace;font-size:12px;width:280px;padding:12px;background:#fff;color:#000;">
          <div style="text-align:center;font-weight:bold;margin-bottom:8px;">
            <div style="font-size:14px;">VOLVIX POS</div>
            <div style="font-size:10px;">Ticket: ${sale.id || 'N/A'}</div>
            <div style="font-size:10px;">${new Date(sale.created_at || Date.now()).toLocaleString('es-MX')}</div>
          </div>
          <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:6px 0;margin:6px 0;">
            ${items.map(it => `
              <div style="display:flex;justify-content:space-between;font-size:11px;">
                <span>${(it.qty || 1)}x ${it.name || it.code || 'Item'}</span>
                <span>$${Number((it.price || 0) * (it.qty || 1)).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;">
            <span>TOTAL:</span>
            <span>$${Number(sale.total || 0).toFixed(2)}</span>
          </div>
          <div style="text-align:center;margin-top:10px;font-size:10px;">¡Gracias por su compra!</div>
        </div>
      `;

      // Vista previa en ventana nueva con opción de imprimir
      const w = window.open('', '_blank', 'width=400,height=600');
      if (w) {
        w.document.write(`
          <!DOCTYPE html><html><head><title>Ticket #${sale.id || ''}</title>
          <style>body{margin:0;display:flex;flex-direction:column;align-items:center;background:#f3f4f6;padding:20px;}
          .actions{margin-top:12px;display:flex;gap:8px;}
          button{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-weight:600;}
          .btn-print{background:#3B82F6;color:#fff;}
          .btn-thermal{background:#10B981;color:#fff;}
          .btn-close{background:#9CA3AF;color:#fff;}
          @media print{.actions{display:none;}}</style>
          </head><body>
          ${html}
          <div class="actions">
            <button class="btn-print" onclick="window.print()">🖨 Imprimir</button>
            <button class="btn-thermal" onclick="window.opener && window.opener.enviarAImpresora('${sale.id || ''}', { reprint: true }); window.close();">🧾 Térmica (COPIA)</button>
            <button class="btn-close" onclick="window.close()">Cerrar</button>
          </div>
          </body></html>
        `);
        w.document.close();
        showToast('✓ Vista previa abierta');
      } else {
        showToast('Bloqueador de ventanas activo. Permite popups.');
      }
    } catch (err) {
      console.error('reimprimir error:', err);
      showToast('Error: ' + (err.message || err));
    }
  };

  // Enviar a impresora térmica via /api/printer/raw (ESC/POS)
  // R8a FIX-H4: retry x3 con backoff (500ms, 1s, 2s) + audit en pos_print_log + modal con opciones
  async function __r8aLogPrint(saleId, ev, opts) {
    try {
      const tok = (typeof getToken === 'function' ? getToken() : '') ||
                  (window.session && window.session.token) ||
                  localStorage.getItem('volvix_token') || '';
      if (!tok || !saleId) return;
      await fetch('/api/sales/' + encodeURIComponent(saleId) + '/print-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(Object.assign({ event: ev }, opts || {}))
      }).catch(() => {});
    } catch (_) {}
  }
  function __r8aSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function __r8aTryPrintOnce(saleId, raw, tok, isCopy) {
    const r = await fetch('/api/printer/raw', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
      body: JSON.stringify({
        printer_id: 'default',
        payload: btoa(unescape(encodeURIComponent(raw))),
        encoding: 'base64',
        format: 'escpos',
        sale_id: saleId,
        is_copy: !!isCopy
      })
    });
    if (r.ok) return { ok: true, status: 200 };
    let body = null;
    try { body = await r.json(); } catch (_) { body = {}; }
    return { ok: false, status: r.status, error: (body && (body.error || body.message)) || ('HTTP ' + r.status) };
  }
  async function __r8aShowPrintFailedModal(saleId, raw, tok, lastErr) {
    return new Promise((resolve) => {
      // Best-effort: si VolvixUI tiene modal, usarlo. Si no, prompt nativo.
      const choices = ['Reintentar', 'Saltar', 'Reimprimir desde reporte'];
      const msg = '🖨️ Impresora no responde tras 3 intentos.\nÚltimo error: ' + (lastErr || 'desconocido') + '\n\nElige opción:\n1. Reintentar\n2. Saltar (no imprimir)\n3. Reimprimir desde reporte (vista previa navegador)';
      let choice = null;
      try {
        if (window.VolvixUI && typeof window.VolvixUI.choose === 'function') {
          window.VolvixUI.choose({
            title: '🖨️ Impresora no responde',
            message: 'Tras 3 intentos la impresora no respondió. ' + (lastErr ? '(' + lastErr + ')' : ''),
            options: choices.map((c, i) => ({ label: c, value: i }))
          }).then((idx) => resolve(idx)).catch(() => resolve(1));
          return;
        }
      } catch (_) {}
      const ans = prompt(msg, '1');
      choice = parseInt(String(ans || '0'), 10);
      if (choice === 1 || choice === 2 || choice === 3) {
        resolve(choice - 1);
      } else {
        resolve(1); // default skip
      }
    });
  }
  window.enviarAImpresora = async function (saleId, opts) {
    opts = opts || {};
    const isReprint = !!opts.reprint;
    try {
      const tok = (typeof getToken === 'function' ? getToken() : '') || (window.session && window.session.token) || localStorage.getItem('volvix_token') || '';
      let sale = null;
      if (saleId) {
        const r = await fetch('/api/sales/' + encodeURIComponent(saleId), {
          headers: tok ? { Authorization: 'Bearer ' + tok } : {}
        });
        if (r.ok) sale = await r.json();
      }
      if (!sale) {
        const r2 = await fetch('/api/sales?limit=1', {
          headers: tok ? { Authorization: 'Bearer ' + tok } : {}
        });
        if (r2.ok) {
          const d = await r2.json();
          sale = (d.items && d.items[0]) || (Array.isArray(d) && d[0]) || null;
        }
      }
      if (!sale) { showToast('No hay venta para imprimir'); return; }
      saleId = saleId || sale.id;

      // Construir comandos ESC/POS para impresora térmica
      const ESC = '\x1B', GS = '\x1D';
      const init = ESC + '@';
      const center = ESC + 'a' + '\x01';
      const left = ESC + 'a' + '\x00';
      const bold = ESC + 'E' + '\x01';
      const noBold = ESC + 'E' + '\x00';
      const cut = GS + 'V' + '\x01';
      const lf = '\n';

      let raw = init + center + bold + 'VOLVIX POS' + lf + noBold;
      // R8a FIX-H4: marcar "COPIA" cuando es reimpresión
      if (isReprint) {
        raw += bold + '*** COPIA ***' + noBold + lf;
      }
      raw += 'Ticket: ' + (sale.id || 'N/A') + lf;
      raw += new Date(sale.created_at || Date.now()).toLocaleString('es-MX') + lf;
      raw += '--------------------------------' + lf;
      raw += left;
      (sale.items || []).forEach(it => {
        const qty = it.qty || 1;
        const name = (it.name || it.code || 'Item').slice(0, 22);
        const total = (Number(it.price || 0) * qty).toFixed(2);
        raw += qty + 'x ' + name.padEnd(22, ' ') + ' $' + total + lf;
      });
      raw += '--------------------------------' + lf;
      raw += bold + 'TOTAL: $' + Number(sale.total || 0).toFixed(2) + noBold + lf + lf;
      raw += center + 'Gracias por su compra!' + lf + lf + lf + cut;

      // R8a FIX-H4: Retry x3 con backoff (500ms, 1s, 2s)
      const backoffs = [500, 1000, 2000];
      let lastResult = null;
      let attempt = 0;
      while (attempt < 3) {
        attempt++;
        if (attempt > 1) {
          await __r8aSleep(backoffs[attempt - 2]);
          await __r8aLogPrint(saleId, 'retry', { attempt: attempt, error_msg: lastResult ? lastResult.error : null });
        }
        try {
          lastResult = await __r8aTryPrintOnce(saleId, raw, tok, isReprint);
        } catch (e) {
          lastResult = { ok: false, status: 0, error: (e && e.message) || String(e) };
        }
        if (lastResult.ok) {
          await __r8aLogPrint(saleId, isReprint ? 'reprint' : 'printed', { attempt: attempt });
          showToast(isReprint ? '✓ Reimpresión enviada (COPIA)' : '✓ Enviado a impresora');
          return;
        }
        // Si la impresora directamente no está configurada, fallback al print del navegador
        if (lastResult.status === 503 || lastResult.status === 404) {
          await __r8aLogPrint(saleId, 'failed', { attempt: attempt, error_msg: 'no_printer_configured', reason: 'fallback_browser' });
          showToast('Impresora no configurada. Usando print del navegador…');
          if (typeof window.reimprimirUltimoTicket === 'function') {
            window.reimprimirUltimoTicket();
          }
          return;
        }
      }
      // 3 intentos fallaron
      await __r8aLogPrint(saleId, 'failed', { attempt: 3, error_msg: lastResult ? lastResult.error : 'unknown' });
      const choice = await __r8aShowPrintFailedModal(saleId, raw, tok, lastResult ? lastResult.error : '');
      if (choice === 0) {
        // Reintentar (loop)
        return window.enviarAImpresora(saleId, opts);
      } else if (choice === 2) {
        // Reimprimir desde reporte (browser print)
        if (typeof window.reimprimirUltimoTicket === 'function') {
          window.reimprimirUltimoTicket();
        }
      } else {
        // Skip
        showToast('Impresión saltada');
      }
    } catch (err) {
      console.error('impresora error:', err);
      try { await __r8aLogPrint(saleId, 'failed', { attempt: 1, error_msg: (err && err.message) || String(err) }); } catch (_) {}
      showToast('Error: ' + (err.message || err));
    }
  };

  /* Helper: importa un producto del catálogo global del dueño al tenant.
     Se usa cuando el match viene del Level 3 de la cascada de scan. */
  async function _importProductToTenant(g) {
    try {
      const tnt = (typeof _vTenant === 'function') ? _vTenant() : 'TNT001';
      const payload = {
        tenant_id: tnt,
        name: g.name || g.nombre,
        code: g.code || g.barcode,
        barcode: g.barcode || g.code,
        price: Number(g.suggested_price || g.price || 0),
        cost: Number(g.cost || 0),
        stock: 1,
        category: g.category || 'General',
        image_url: g.image_url || null,
        source: 'owner_global'
      };
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        const saved = await r.json().catch(() => null);
        if (saved && saved.id) g.id = saved.id;
        try { if (typeof loadCatalogReal === 'function') await loadCatalogReal(); } catch (_) {}
      }
    } catch (e) { console.warn('[_importProductToTenant] fail', e); }
  }

  /* ============ POS — CASCADE LOOKUP (4 levels) ============================
   * 1. CATALOG en memoria (tenant local cache)
   * 2. Tenant DB         GET /api/products?q=X
   * 3. Owner global lib  GET /api/owner/products/lookup?q=X
   * 4. Internet          VolvixBarcodeResolver (Open Food Facts + UPCitemDB)
   * Si todo falla → modal "Nuevo producto" con prefill inteligente.
   * ========================================================================== */
  // In-flight guard: evita doble-scan al teclear ENTER dos veces sobre el mismo
  // input (race condition que duplicaba imports a tenant DB).
  let __searchProductBusy = false;
  // Loading-UX helpers: el cascade puede tardar hasta 1.5s buscando en internet
  // (Open Food Facts + UPCitemDB). Sin feedback visual, el cajero teclea de
  // nuevo pensando que no se procesó. Esto bloquea el input + cambia el botón.
  function _setScanBusy(busy) {
    const inp = document.getElementById('barcode-input');
    const btn = document.querySelector('.btn-enter');
    if (inp) inp.disabled = !!busy;
    if (btn) {
      btn.disabled = !!busy;
      btn.style.opacity = busy ? '0.6' : '';
      btn.style.cursor = busy ? 'wait' : '';
      if (busy) {
        btn.dataset._origHtml = btn.dataset._origHtml || btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:vlx-spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.2-8.55"/></svg> Buscando…';
      } else if (btn.dataset._origHtml) {
        btn.innerHTML = btn.dataset._origHtml;
      }
    }
    if (busy) {
      // Inyectar keyframes una sola vez
      if (!document.getElementById('vlx-spin-style')) {
        const s = document.createElement('style');
        s.id = 'vlx-spin-style';
        s.textContent = '@keyframes vlx-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
        document.head.appendChild(s);
      }
    }
  }
  async function searchProduct(code) {
    if (__searchProductBusy) return;
    if (!code) { showToast('Escribe un código antes de presionar ENTER'); return; }
    const trimmed = String(code).trim();
    if (!trimmed) { showToast('Escribe un código antes de presionar ENTER'); return; }
    const isBarcode = /^\d{6,}$/.test(trimmed);
    const lower = trimmed.toLowerCase();
    __searchProductBusy = true;
    _setScanBusy(true);
    try { return await _searchProductInner(trimmed, isBarcode, lower); }
    finally {
      __searchProductBusy = false;
      _setScanBusy(false);
      // Re-focus input para siguiente scan (importante para scanners hardware
      // que envían Enter automático y necesitan foco listo).
      try { document.getElementById('barcode-input').focus(); } catch (_) {}
    }
  }
  async function _searchProductInner(trimmed, isBarcode, lower) {

    // ── Level 1: CATALOG en memoria (instantáneo) ─────────────────────────
    if (typeof CATALOG !== 'undefined' && Array.isArray(CATALOG)) {
      const hit = CATALOG.find(x =>
        x.code === trimmed || x.barcode === trimmed ||
        (x.name || '').toLowerCase() === lower ||
        (x.name || '').toLowerCase().includes(lower)
      );
      if (hit) {
        addToCart(hit);
        $('#barcode-input').value = ''; $('#barcode-input').focus();
        return;
      }
    }

    // ── Level 2: Tenant DB ────────────────────────────────────────────────
    try {
      const params = isBarcode
        ? 'or=(barcode.eq.' + encodeURIComponent(trimmed) + ',code.eq.' + encodeURIComponent(trimmed) + ')'
        : 'name=ilike.' + encodeURIComponent('%' + trimmed + '%');
      const r = await fetch('/api/productos?' + params + '&select=*&limit=5', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        const items = j.items || j.data || [];
        if (items.length) {
          const final = items[0];
          addToCart(normalizeProductForCart(final));
          showToast('✓ ' + (final.name || final.nombre) + ' (catálogo del negocio)');
          $('#barcode-input').value = ''; $('#barcode-input').focus();
          return;
        }
      }
    } catch (_) {}

    // ── Level 3: Owner global library (productos curados por systeminternational) ─
    let ownerSuggestion = null;
    try {
      const r = await fetch('/api/owner/products/lookup?q=' + encodeURIComponent(trimmed), { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        if (j.items && j.items.length) {
          ownerSuggestion = j.items[0];
          // Si match exacto por barcode → agregar directo
          if (isBarcode && (ownerSuggestion.barcode === trimmed || ownerSuggestion.code === trimmed)) {
            // Importar a tenant DB y agregar al cart
            await _importProductToTenant(ownerSuggestion);
            addToCart(normalizeProductForCart(ownerSuggestion));
            showToast('✓ ' + (ownerSuggestion.name || 'producto') + ' (catálogo global · importado)');
            $('#barcode-input').value = ''; $('#barcode-input').focus();
            return;
          }
        }
      }
    } catch (_) {}

    // ── Level 4: Internet (solo barcodes — Open Food Facts + UPCitemDB) ───
    if (isBarcode && window.VolvixBarcodeResolver) {
      try {
        const result = await window.VolvixBarcodeResolver.scan(trimmed);
        if (result.found && result.product) {
          const p = result.product;
          let final = p;
          if (window.VolvixProductSearch && p.id) {
            const fresh = await window.VolvixProductSearch.getById(p.id);
            if (fresh) final = fresh;
          }
          addToCart(normalizeProductForCart(final));
          showToast('✓ ' + (final.name || final.nombre) + ' (' + (result.source || 'internet') + ')');
          $('#barcode-input').value = ''; $('#barcode-input').focus();
          return;
        }
        if (result.error === 'user_cancelled') {
          $('#barcode-input').value = ''; $('#barcode-input').focus();
          return;
        }
      } catch (e) { console.warn('[searchProduct] internet resolver fail', e); }
    }
    // 3. No existe → abrir modal "Nuevo producto" con prefill inteligente.
    //    - Si lo escrito parece código de barras → prefill barcode + code, focus en NAME
    //    - Si parece nombre (jamón, leche, etc.) → prefill name, focus en PRICE
    try {
      if (typeof promptProductForm !== 'function') {
        showToast('❌ Producto no encontrado: ' + trimmed);
        return;
      }
      const prefill = isBarcode
        ? { code: trimmed, barcode: trimmed, name: '', price: 0, cost: 0, stock: 1 }
        : { code: '',      barcode: '',      name: trimmed, price: 0, cost: 0, stock: 1 };
      // El input perderá foco al abrir el modal — limpiar primero
      $('#barcode-input').value = '';
      // Hint visual: foco automático correcto cuando se abra el modal
      const focusTarget = isBarcode ? '#pf-name' : '#pf-price';
      // Promesa: usuario llena el modal o cancela
      const data = await promptProductForm(prefill);
      // Re-focus después de pintar el modal (el modal mismo hace focus en pf-name por default;
      // sobre-escribimos cuando es nombre → pf-price). Hacemos esto en un microtask después
      // de promptProductForm resolver el listener de submit, así que en realidad lo aplicamos
      // ANTES vía MutationObserver:
      // Truco: si el usuario escribió un nombre, queremos foco en precio. Lo hacemos via
      // observer dentro del propio promptProductForm sería ideal, pero no podemos modificar
      // ese flujo aquí. Como alternativa: redisparamos focus sobre pf-price justo después de
      // que el modal aparezca (en el siguiente tick).
      // (El bloque arriba ya cerró el modal cuando data llegó; esto solo aplica si se quedó
      // abierto. Ver setTimeout debajo en la versión activa.)
      if (!data) {
        $('#barcode-input').focus();
        return;
      }
      // Guardar producto via API real
      let saved = null;
      try {
        if (typeof saveProduct === 'function') {
          saved = await saveProduct(data);
        }
      } catch (e) {
        console.warn('[searchProduct] saveProduct failed', e);
      }
      // Caer a /api/products directamente si saveProduct no existe / falló.
      // SEC2: incluir credentials para que requireAuth pueda leer el JWT cookie.
      // SEC3: tenant_id viene del payload pero el backend re-deriva desde req.user
      // (no confiar en lo que mande el cliente).
      if (!saved || !saved.id) {
        try {
          const tnt = (typeof _vTenant === 'function') ? _vTenant() : 'TNT001';
          const r = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(Object.assign({ tenant_id: tnt }, data))
          });
          if (r.ok) saved = await r.json().catch(() => null);
        } catch (e) { console.warn('[searchProduct] /api/products POST fail', e); }
      }
      // Agregar al carrito (con fallback a los datos del form si el server no devolvió id)
      const productForCart = saved && saved.id
        ? normalizeProductForCart(saved)
        : normalizeProductForCart(Object.assign({ id: 'tmp_' + Date.now() }, data));
      addToCart(productForCart);
      showToast('✓ Producto creado y agregado: ' + (productForCart.name || 'sin nombre'));
      $('#barcode-input').focus();
    } catch (e) {
      console.warn('[searchProduct] modal flow error', e);
      showToast('❌ No se pudo abrir el formulario de nuevo producto');
    }
  }
  function normalizeProductForCart(p) {
    return {
      id: p.id,
      code: p.code || p.codigo_barras || '',
      name: p.name || p.nombre || '',
      price: Number(p.price || p.precio || 0),
      stock: Number(p.stock || 0),
      icon: p.icon || '📦'
    };
  }
  function addToCart(p) {
    const existing = CART.find(c => c.code === p.code);
    if (existing) existing.qty++;
    else CART.push({...p, qty:1});
    renderCart();
    try { __r8aSaveCartDraft(); } catch (_) {}
  }
  let SELECTED_CART_INDEX = -1;

  /* ============ R8a FIX-H1: AUTO-SAVE CART DRAFT + RECOVERY ============
     Cada cambio en el carrito (add/remove/qty/clear) persiste en localStorage
     bajo la key volvix_cart_draft_<tenant>. Al iniciar nueva sesión, si existe
     draft <30 min de antigüedad → modal de recovery. Idem-seed se preserva
     para que la venta resultante use MISMA Idempotency-Key (R6b determinista).
     Si el server ya procesó esa venta, retorna response cacheada (R1 dedup). */
  const R8A_CART_DRAFT_TTL_MS = 30 * 60 * 1000; // 30 min
  let __r8aCartIdemSeed = null;
  function __r8aGetIdemSeed() {
    if (__r8aCartIdemSeed) return __r8aCartIdemSeed;
    try {
      if (window.crypto && window.crypto.randomUUID) {
        __r8aCartIdemSeed = 'is_' + window.crypto.randomUUID();
      } else {
        __r8aCartIdemSeed = 'is_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      }
    } catch (_) {
      __r8aCartIdemSeed = 'is_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }
    return __r8aCartIdemSeed;
  }
  function __r8aDraftKey() {
    let tnt = 'TNT001';
    try { tnt = (typeof _vTenant === 'function') ? _vTenant() : 'TNT001'; } catch (_) {}
    return 'volvix_cart_draft_' + tnt;
  }
  function __r8aSaveCartDraft() {
    try {
      if (!Array.isArray(CART)) return;
      // Empty cart → clear draft
      if (CART.length === 0) {
        localStorage.removeItem(__r8aDraftKey());
        return;
      }
      let cashierId = null, cashierEmail = null, ticketNum = null;
      try {
        const ses = (typeof _vSession === 'function') ? _vSession() : null;
        if (ses) {
          cashierId = ses.user_id || ses.id || null;
          cashierEmail = ses.email || null;
        }
      } catch (_) {}
      try {
        const fEl = document.getElementById('currentFolio');
        if (fEl) ticketNum = fEl.textContent || null;
      } catch (_) {}
      const draft = {
        v: 1,
        items: CART.map(it => ({
          code: it.code, name: it.name, price: Number(it.price) || 0,
          qty: Number(it.qty) || 1, stock: Number(it.stock) || 0
        })),
        ts: Date.now(),
        cashier_id: cashierId,
        cashier_email: cashierEmail,
        ticket_number: ticketNum,
        idem_seed: __r8aGetIdemSeed()
      };
      localStorage.setItem(__r8aDraftKey(), JSON.stringify(draft));
    } catch (_) { /* localStorage full or unavailable: ignorar */ }
  }
  function __r8aClearCartDraft() {
    try { localStorage.removeItem(__r8aDraftKey()); } catch (_) {}
    __r8aCartIdemSeed = null;
  }
  function __r8aLoadCartDraft() {
    try {
      const raw = localStorage.getItem(__r8aDraftKey());
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.items) || d.items.length === 0) return null;
      const age = Date.now() - (Number(d.ts) || 0);
      if (age > R8A_CART_DRAFT_TTL_MS) {
        // expired
        try { localStorage.removeItem(__r8aDraftKey()); } catch (_) {}
        return null;
      }
      return d;
    } catch (_) { return null; }
  }
  async function __r8aOfferRecovery() {
    const d = __r8aLoadCartDraft();
    if (!d) return;
    // No ofrecer si el carrito actual ya tiene items
    if (Array.isArray(CART) && CART.length > 0) return;
    const ageMin = Math.max(1, Math.round((Date.now() - d.ts) / 60000));
    const total = d.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    let ok = false;
    const msg = `Hace ${ageMin} min se cerró la sesión con un carrito de ${d.items.length} artículo(s) por $${total.toFixed(2)}.\n¿Recuperar carrito?`;
    if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
      try {
        ok = await window.VolvixUI.confirm({
          title: '🛒 Recuperar venta sin terminar',
          message: msg,
          confirmText: 'Recuperar',
          cancelText: 'Descartar'
        });
      } catch (_) { ok = false; }
    } else {
      ok = confirm(msg);
    }
    if (ok) {
      CART = d.items.slice();
      // Reusa idem_seed para que el server R1 dedup detecte si la venta se procesó
      __r8aCartIdemSeed = d.idem_seed || __r8aGetIdemSeed();
      try { renderCart(); } catch (_) {}
      try { showToast('✓ Carrito recuperado: ' + d.items.length + ' items'); } catch (_) {}
    } else {
      __r8aClearCartDraft();
    }
  }
  // Hook: ofrecer recovery cuando el login se complete y el screen POS sea visible
  function __r8aTryRecoveryWhenReady() {
    try {
      const login = document.getElementById('login-screen');
      const pos = document.getElementById('screen-pos');
      const ready = (!login || login.classList.contains('hidden')) && (pos && !pos.classList.contains('hidden'));
      if (ready) {
        // pequeño delay para no chocar con otros modales de bienvenida
        setTimeout(() => { __r8aOfferRecovery(); }, 800);
        return true;
      }
    } catch (_) {}
    return false;
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!__r8aTryRecoveryWhenReady()) {
      // Polling ligero (max 20s) hasta que el usuario haga login
      let tries = 0;
      const poll = setInterval(() => {
        tries++;
        if (__r8aTryRecoveryWhenReady() || tries > 40) clearInterval(poll);
      }, 500);
    }
  });
  // beforeunload: forzar save final por si hubo cambio sin re-render
  window.addEventListener('beforeunload', () => { try { __r8aSaveCartDraft(); } catch (_) {} });
  // ============ /R8a FIX-H1 ============

  /* ============ R8b RECOVERY SERVER-SIDE ============================
     FIX-R1: server-side cart auto-save (sobrevive cambio de dispositivo)
     FIX-R2: heartbeat cada 30s + zombie detection (logout 401)
     FIX-R3: inactivity countdown (15 min default) → modal 60s → logout
     FIX-R4: event polling cada 30s para multi-device sync
     ================================================================ */
  const R8B = {
    cartDebounce: null,
    cartDebounceMs: 2000,
    heartbeatTimer: null,
    heartbeatIntervalMs: 30000,
    heartbeatFailCount: 0,
    inactivityTimer: null,
    countdownTimer: null,
    countdownModalEl: null,
    sessionTimeoutMin: 15,            // sobreescrito por GET /api/auth/session-config
    countdownSeconds: 60,
    lastActivityAt: Date.now(),
    pollTimer: null,
    pollIntervalMs: 30000,
    pollLastSince: null,
    eventHandlers: {}                 // event_type -> [fn, fn, ...]
  };

  // Helper de fetch con auth (asume _vToken/_authHeaders ya disponibles más abajo en el archivo;
  // como están definidos posteriormente en el mismo IIFE wrapper, los referenciamos lazy)
  function __r8bAuthFetch(url, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    try {
      var t = (typeof _vToken === 'function') ? _vToken() : (localStorage.getItem('volvix_token') || '');
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch (_) {}
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    opts.headers = headers;
    opts.credentials = opts.credentials || 'include';
    return fetch(url, opts);
  }

  // ---------------- FIX-R1: cart server-side auto-save (debounced 2s) ----------------
  function __r8bSaveCartServer() {
    try {
      if (!Array.isArray(CART)) return;
      var token = '';
      try { token = (typeof _vToken === 'function') ? _vToken() : ''; } catch (_) {}
      if (!token) return; // sin sesión activa, no persistimos al server
      var idemSeed = (typeof __r8aGetIdemSeed === 'function') ? __r8aGetIdemSeed() : null;
      var ticketNum = null;
      try {
        var fEl = document.getElementById('currentFolio');
        if (fEl) ticketNum = fEl.textContent || null;
      } catch (_) {}
      var total = CART.reduce(function (s, i) { return s + (Number(i.price) || 0) * (Number(i.qty) || 0); }, 0);
      var body = {
        items: CART.map(function (it) {
          return {
            code: it.code, name: it.name,
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1,
            stock: Number(it.stock) || 0
          };
        }),
        total: total,
        idem_seed: idemSeed,
        ticket_number: ticketNum
      };
      __r8bAuthFetch('/api/cart/draft', {
        method: 'PATCH',
        body: JSON.stringify(body)
      }).catch(function () { /* fail-soft: localStorage es backup */ });
    } catch (_) {}
  }
  function __r8bScheduleCartSave() {
    if (R8B.cartDebounce) clearTimeout(R8B.cartDebounce);
    R8B.cartDebounce = setTimeout(__r8bSaveCartServer, R8B.cartDebounceMs);
  }
  // Hook: monkey-patch __r8aSaveCartDraft para que también dispare el server save
  if (typeof __r8aSaveCartDraft === 'function') {
    var __r8aSaveCartDraftOrig = __r8aSaveCartDraft;
    __r8aSaveCartDraft = function () {
      try { __r8aSaveCartDraftOrig.apply(this, arguments); } catch (_) {}
      try { __r8bScheduleCartSave(); } catch (_) {}
    };
  }
  if (typeof __r8aClearCartDraft === 'function') {
    var __r8aClearCartDraftOrig = __r8aClearCartDraft;
    __r8aClearCartDraft = function () {
      try { __r8aClearCartDraftOrig.apply(this, arguments); } catch (_) {}
      try {
        __r8bAuthFetch('/api/cart/draft/clear', {
          method: 'POST',
          body: JSON.stringify({ reason: 'manual_clear' })
        }).catch(function () {});
      } catch (_) {}
    };
  }

  // Recovery server-side: en login, GET /api/cart/draft. Si hay draft Y es < 30 min → modal
  async function __r8bOfferServerRecovery() {
    try {
      var r = await __r8bAuthFetch('/api/cart/draft', { method: 'GET' });
      if (!r || !r.ok) return false;
      var data = await r.json().catch(function () { return null; });
      if (!data || !data.has_draft || !data.draft) return false;
      var d = data.draft;
      if (!Array.isArray(d.items) || d.items.length === 0) return false;
      // No ofrecer si el carrito local ya tiene items
      if (Array.isArray(CART) && CART.length > 0) return false;
      var ageMin = d.age_minutes || 1;
      var total = Number(d.total) || 0;
      var msg = 'Hace ' + ageMin + ' min se dejó un carrito activo desde otro dispositivo:\n' +
        d.items.length + ' artículo(s) por $' + total.toFixed(2) + '\n¿Recuperar carrito?';
      var ok = false;
      if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
        ok = await window.VolvixUI.confirm({
          title: '🛒 Carrito activo desde otro dispositivo',
          message: msg,
          confirmText: 'Recuperar',
          cancelText: 'Descartar'
        });
      } else {
        ok = confirm(msg);
      }
      if (ok) {
        CART = d.items.slice();
        if (d.idem_seed) { try { __r8aCartIdemSeed = d.idem_seed; } catch (_) {} }
        try { renderCart(); } catch (_) {}
        try { showToast('✓ Carrito recuperado del server: ' + d.items.length + ' items'); } catch (_) {}
        try { __r8aSaveCartDraft(); } catch (_) {} // dual-save al localStorage
        return true;
      } else {
        // Usuario descarta → clear server-side
        __r8bAuthFetch('/api/cart/draft/clear', {
          method: 'POST', body: JSON.stringify({ reason: 'user_discarded' })
        }).catch(function () {});
        return false;
      }
    } catch (_) { return false; }
  }

  // ---------------- FIX-R2: heartbeat ----------------
  async function __r8bHeartbeat() {
    try {
      var token = '';
      try { token = (typeof _vToken === 'function') ? _vToken() : ''; } catch (_) {}
      if (!token) return;
      var r = await __r8bAuthFetch('/api/auth/heartbeat', { method: 'POST', body: '{}' });
      if (r.status === 401) {
        // Sesión revocada por sweep zombie o admin
        var data = await r.json().catch(function () { return {}; });
        try { showToast('Sesión cerrada: ' + (data.revoked_reason || 'inactividad')); } catch (_) {}
        __r8bForceLogout('session_revoked');
        return;
      }
      if (!r.ok) {
        R8B.heartbeatFailCount++;
        if (R8B.heartbeatFailCount >= 3) {
          try { showToast('⚠ Conexión inestable — reintentando…'); } catch (_) {}
        }
      } else {
        R8B.heartbeatFailCount = 0;
      }
    } catch (_) {
      R8B.heartbeatFailCount++;
      if (R8B.heartbeatFailCount >= 3) {
        try { showToast('⚠ Sin conexión — verificando…'); } catch (_) {}
      }
    }
  }
  function __r8bStartHeartbeat() {
    if (R8B.heartbeatTimer) clearInterval(R8B.heartbeatTimer);
    R8B.heartbeatTimer = setInterval(__r8bHeartbeat, R8B.heartbeatIntervalMs);
    // ping inmediato
    setTimeout(__r8bHeartbeat, 2000);
  }
  function __r8bStopHeartbeat() {
    if (R8B.heartbeatTimer) { clearInterval(R8B.heartbeatTimer); R8B.heartbeatTimer = null; }
  }

  // ---------------- FIX-R3: inactivity countdown ----------------
  function __r8bMarkActivity() { R8B.lastActivityAt = Date.now(); }
  function __r8bForceLogout(reason) {
    try {
      __r8bStopHeartbeat();
      __r8bStopPolling();
      if (R8B.inactivityTimer) clearInterval(R8B.inactivityTimer);
      if (R8B.countdownTimer) clearInterval(R8B.countdownTimer);
      if (R8B.countdownModalEl) try { R8B.countdownModalEl.remove(); } catch (_) {}
      R8B.countdownModalEl = null;
    } catch (_) {}
    try {
      if (window.VolvixAuth && typeof window.VolvixAuth.logout === 'function') {
        window.VolvixAuth.logout();
      } else {
        fetch('/api/auth/sessions/revoke', { method: 'POST', credentials: 'include',
          headers: { 'Authorization': 'Bearer ' + ((typeof _vToken === 'function') ? _vToken() : '') }
        }).catch(function () {});
        try {
          localStorage.removeItem('volvix_token');
          localStorage.removeItem('volvixAuthToken');
          localStorage.removeItem('volvixSession');
        } catch (_) {}
      }
    } catch (_) {}
    // Redirect al login
    setTimeout(function () {
      try { window.location.reload(); } catch (_) {}
    }, 500);
  }
  function __r8bShowCountdownModal() {
    // Crea modal con countdown
    if (R8B.countdownModalEl) return;
    var modal = document.createElement('div');
    modal.id = 'r8b-inactivity-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);' +
      'z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    modal.innerHTML = '<div style="background:#fff;color:#222;padding:32px;border-radius:12px;max-width:420px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);">' +
      '<div style="font-size:48px;margin-bottom:8px;">⏱️</div>' +
      '<h2 style="margin:0 0 12px 0;color:#dc2626;">Sesión por inactividad</h2>' +
      '<p style="margin:0 0 16px 0;line-height:1.5;">Tu sesión cerrará por inactividad en <strong id="r8b-countdown-num" style="font-size:24px;color:#dc2626;">60</strong> segundos.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;">' +
      '<button id="r8b-cancel-logout" style="padding:12px 24px;border:none;border-radius:8px;background:#10b981;color:#fff;font-weight:600;cursor:pointer;font-size:15px;">Continuar sesión</button>' +
      '<button id="r8b-confirm-logout" style="padding:12px 24px;border:1px solid #dc2626;border-radius:8px;background:#fff;color:#dc2626;font-weight:600;cursor:pointer;font-size:15px;">Cerrar ahora</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    R8B.countdownModalEl = modal;
    var remaining = R8B.countdownSeconds;
    var numEl = modal.querySelector('#r8b-countdown-num');
    if (R8B.countdownTimer) clearInterval(R8B.countdownTimer);
    R8B.countdownTimer = setInterval(function () {
      remaining--;
      if (numEl) numEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(R8B.countdownTimer);
        R8B.countdownTimer = null;
        try { modal.remove(); } catch (_) {}
        R8B.countdownModalEl = null;
        __r8bForceLogout('inactivity_timeout');
      }
    }, 1000);
    var btnCancel = modal.querySelector('#r8b-cancel-logout');
    var btnLogout = modal.querySelector('#r8b-confirm-logout');
    if (btnCancel) btnCancel.onclick = function () {
      if (R8B.countdownTimer) { clearInterval(R8B.countdownTimer); R8B.countdownTimer = null; }
      try { modal.remove(); } catch (_) {}
      R8B.countdownModalEl = null;
      __r8bMarkActivity();
    };
    if (btnLogout) btnLogout.onclick = function () {
      if (R8B.countdownTimer) { clearInterval(R8B.countdownTimer); R8B.countdownTimer = null; }
      try { modal.remove(); } catch (_) {}
      R8B.countdownModalEl = null;
      __r8bForceLogout('user_chose_logout');
    };
  }
  function __r8bCheckInactivity() {
    if (!R8B.sessionTimeoutMin || R8B.sessionTimeoutMin <= 0) return; // desactivado
    if (R8B.countdownModalEl) return; // ya hay countdown activo
    var idleMs = Date.now() - R8B.lastActivityAt;
    if (idleMs >= R8B.sessionTimeoutMin * 60 * 1000) {
      __r8bShowCountdownModal();
    }
  }
  function __r8bStartInactivityTracker() {
    ['mousemove','click','keydown','scroll','touchstart'].forEach(function (ev) {
      document.addEventListener(ev, __r8bMarkActivity, { passive: true });
    });
    if (R8B.inactivityTimer) clearInterval(R8B.inactivityTimer);
    R8B.inactivityTimer = setInterval(__r8bCheckInactivity, 15000);
  }
  async function __r8bLoadSessionConfig() {
    try {
      var r = await __r8bAuthFetch('/api/auth/session-config', { method: 'GET' });
      if (!r.ok) return;
      var data = await r.json().catch(function () { return null; });
      if (!data || !data.ok) return;
      if (Number.isFinite(Number(data.session_timeout_min))) {
        R8B.sessionTimeoutMin = Number(data.session_timeout_min);
      }
      if (Number.isFinite(Number(data.countdown_seconds))) {
        R8B.countdownSeconds = Number(data.countdown_seconds);
      }
      if (Number.isFinite(Number(data.heartbeat_interval_ms))) {
        R8B.heartbeatIntervalMs = Number(data.heartbeat_interval_ms);
      }
    } catch (_) {}
  }

  // ---------------- FIX-R4: event polling ----------------
  function __r8bOnEvent(eventType, handler) {
    if (!R8B.eventHandlers[eventType]) R8B.eventHandlers[eventType] = [];
    R8B.eventHandlers[eventType].push(handler);
  }
  function __r8bDispatchEvent(ev) {
    try {
      var handlers = R8B.eventHandlers[ev.event_type] || [];
      handlers.forEach(function (h) { try { h(ev.payload || {}, ev); } catch (_) {} });
    } catch (_) {}
  }
  async function __r8bPollEvents() {
    try {
      var token = '';
      try { token = (typeof _vToken === 'function') ? _vToken() : ''; } catch (_) {}
      if (!token) return;
      var since = R8B.pollLastSince || new Date(Date.now() - 60000).toISOString();
      var r = await __r8bAuthFetch('/api/events/poll?since=' + encodeURIComponent(since), { method: 'GET' });
      if (!r.ok) return;
      var data = await r.json().catch(function () { return null; });
      if (!data || !Array.isArray(data.events)) return;
      data.events.forEach(__r8bDispatchEvent);
      // Actualizar cursor: server_time o ts del último evento
      if (data.server_time) R8B.pollLastSince = data.server_time;
      else if (data.events.length > 0) R8B.pollLastSince = data.events[data.events.length - 1].ts;
    } catch (_) {}
  }
  function __r8bStartPolling() {
    if (R8B.pollTimer) clearInterval(R8B.pollTimer);
    R8B.pollTimer = setInterval(__r8bPollEvents, R8B.pollIntervalMs);
    setTimeout(__r8bPollEvents, 3000);
  }
  function __r8bStopPolling() {
    if (R8B.pollTimer) { clearInterval(R8B.pollTimer); R8B.pollTimer = null; }
  }

  // Handlers default: cart_updated → recargar draft del server (si carrito local vacío)
  __r8bOnEvent('cart_updated', function (payload) {
    try {
      // Solo sync si el carrito local está vacío (otro dispositivo agregó cosas)
      if (Array.isArray(CART) && CART.length === 0 && payload && payload.item_count > 0) {
        // Ofrecer recovery silenciosa (toast en lugar de modal para no spamear)
        try { showToast('🔄 Carrito actualizado en otro dispositivo'); } catch (_) {}
      }
    } catch (_) {}
  });
  __r8bOnEvent('sale_completed', function () {
    try { showToast('✓ Venta completada en otro dispositivo'); } catch (_) {}
  });
  __r8bOnEvent('permissions_changed', function () {
    try { showToast('⚠ Permisos actualizados — re-login requerido'); } catch (_) {}
    setTimeout(function () { __r8bForceLogout('permissions_changed'); }, 3000);
  });
  __r8bOnEvent('session_revoked', function (payload) {
    try {
      // Si la sesión revocada es la mía, forzar logout
      var ses = (typeof _vSession === 'function') ? _vSession() : {};
      if (payload && payload.jti && ses && ses.jti === payload.jti) {
        __r8bForceLogout('session_revoked_remote');
      }
    } catch (_) {}
  });

  // ---------------- Bootstrap ----------------
  function __r8bBootstrap() {
    var token = '';
    try { token = (typeof _vToken === 'function') ? _vToken() : ''; } catch (_) {}
    if (!token) return false; // aún no hay login
    __r8bLoadSessionConfig().then(function () {
      __r8bStartHeartbeat();
      __r8bStartInactivityTracker();
      __r8bStartPolling();
      // Recovery del server: ofrecer modal si hay draft
      setTimeout(__r8bOfferServerRecovery, 1500);
    });
    return true;
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!__r8bBootstrap()) {
      var tries = 0;
      var poll = setInterval(function () {
        tries++;
        if (__r8bBootstrap() || tries > 60) clearInterval(poll);
      }, 1000);
    }
  });

  // Exponer al window para debugging
  window.__r8b = { state: R8B, save: __r8bSaveCartServer, hb: __r8bHeartbeat, poll: __r8bPollEvents, on: __r8bOnEvent };
  // ============ /R8b RECOVERY SERVER-SIDE ============
  function renderCart() {
    const body = $('#cart-body');
    if (CART.length === 0) {
      body.innerHTML = `<tr><td colspan="7"><div class="cart-empty-block"><div><div class="icon">🛒</div>Escanea o escribe el código de un producto para comenzar</div></div></td></tr>`;
      SELECTED_CART_INDEX = -1;
    } else {
      if (SELECTED_CART_INDEX >= CART.length) SELECTED_CART_INDEX = CART.length - 1;
      body.innerHTML = CART.map((item, i) => `
        <tr onclick="selectCartRow(${i})" style="cursor:pointer; ${i===SELECTED_CART_INDEX?'background:var(--accent-soft);outline:2px solid var(--accent);':''}">
          <td class="mono">${item.code}</td>
          <td class="desc">${item.name}</td>
          <td class="num">${fmt(item.price)}</td>
          <td class="center">${item.qty}</td>
          <td class="importe">${fmt(item.price * item.qty)}</td>
          <td class="center">${item.stock}</td>
          <td class="center"><button class="cart-del-btn" onclick="event.stopPropagation();removeFromCart(${i})" aria-label="Eliminar" title="Eliminar">×</button></td>
        </tr>
      `).join('');
    }
    updateTotals();
  }
  function selectCartRow(i) {
    SELECTED_CART_INDEX = i;
    renderCart();
  }
  function removeFromCart(i) {
    CART.splice(i, 1);
    renderCart();
    try { __r8aSaveCartDraft(); } catch (_) {}
  }
  function deleteCartItem() {
    if (CART.length === 0) { showToast('No hay artículos'); return; }
    CART.pop();
    renderCart();
    try { __r8aSaveCartDraft(); } catch (_) {}
    showToast('Último artículo eliminado');
  }
  async function clearCart() {
    if (CART.length === 0) { showToast('El carrito ya está vacío'); return; }
    let ok = false;
    if (window.VolvixUI && typeof window.VolvixUI.destructiveConfirm === 'function') {
      ok = await window.VolvixUI.destructiveConfirm({ title: 'Eliminar venta', message: '¿Eliminar toda la venta actual?', confirmText: 'Eliminar', requireText: 'ELIMINAR' });
    } else {
      ok = confirm('¿Eliminar toda la venta actual?');
    }
    if (!ok) return;
    CART = []; renderCart();
    try { __r8aClearCartDraft(); } catch (_) {}
    showToast('Venta eliminada');
  }
  async function newTicket() {
    if (CART.length > 0) {
      let ok = false;
      if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
        ok = await window.VolvixUI.confirm({ title: 'Nuevo ticket', message: 'El ticket actual tiene productos. ¿Iniciar uno nuevo y descartar este?', confirmText: 'Iniciar nuevo', cancelText: 'Cancelar' });
      } else {
        ok = confirm('El ticket actual tiene productos. ¿Iniciar uno nuevo y descartar este?');
      }
      if (!ok) return;
    }
    CART = []; renderCart();
    try { __r8aClearCartDraft(); } catch (_) {}
    showToast('✓ Nuevo ticket iniciado');
  }
  function updateTotals() {
    const total = CART.reduce((s,i) => s + i.price * i.qty, 0);
    const count = CART.reduce((s,i) => s + i.qty, 0);
    $('#item-count').textContent = count;
    $('#total-big').textContent = fmt(total);
    $('#footer-total').textContent = fmt(total);
  }

  /* ============ GAP-2: MULTI-TAB CART SYNC ============ */
  // BroadcastChannel para invalidar carrito en otras pestañas cuando esta inicia checkout.
  // Backend además valida via X-Cart-Token (cart_tokens table).
  const VOLVIX_CART_CHANNEL = (function () {
    try { return new BroadcastChannel('volvix-cart-sync'); } catch (_) { return null; }
  })();
  let __volvixCurrentCartToken = null;
  function __volvixGenerateCartToken() {
    try {
      if (window.crypto && window.crypto.randomUUID) return 'ct_' + window.crypto.randomUUID();
    } catch (_) {}
    return 'ct_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
  function __volvixGetOrCreateCartToken() {
    if (!__volvixCurrentCartToken) {
      __volvixCurrentCartToken = __volvixGenerateCartToken();
    }
    return __volvixCurrentCartToken;
  }
  function __volvixResetCartToken() { __volvixCurrentCartToken = null; }

  /* R6b GAP-S5: Idempotency-Key DETERMINISTA basado en SHA-256.
     Inputs: ticket_number + timestamp + items + total + cashier_id.
     Resultado: misma sale siempre genera misma key, server R1 dedup correcto.
     Si crypto.subtle no está disponible (HTTP, browser viejo): fallback a hash simple.

     R7c FIX-S3: el fallback DJB2 32-bit anterior tenía riesgo de colisión silenciosa
     (dos sales distintas con misma JSON-string + mismo ms-timestamp = misma key →
     server dedup descartaba la segunda). Ahora usa FNV-1a 64-bit (split en dos uint32)
     + suffix con Math.random + performance.now (resolución microsec).
     SAFE: fallback only for legacy browsers/HTTP. Determinism via crypto.subtle
     (HTTPS path) NO se ve afectado — sw.js/PWA solo funciona en HTTPS, así que
     sacrificar determinismo en HTTP/legacy es aceptable a cambio de no perder ventas. */
  async function __volvixDeterministicIdemKey(sale) {
    const payload = {
      tk: sale.ticket_number || '',
      ts: sale.timestamp || 0,
      cs: sale.cashier_email || sale.user_id || '',
      tn: sale.tenant_id || '',
      tt: Number(sale.total || 0).toFixed(2),
      it: (sale.items || []).map(i => ({
        c: i.code || i.product_id || '',
        q: Number(i.qty || 0),
        p: Number(i.price || 0).toFixed(2)
      }))
    };
    const str = JSON.stringify(payload);
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        const enc = new TextEncoder().encode(str);
        const buf = await window.crypto.subtle.digest('SHA-256', enc);
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
        return 'idem-' + hex.slice(0, 32); // 32 hex chars = 128 bit, suficiente
      }
    } catch (_) { /* fallback abajo */ }
    // R7c FIX-S3: Fallback FNV-1a 64-bit + random+perf suffix (anti-colisión).
    // SAFE: fallback only for legacy browsers/HTTP. Determinism via crypto.subtle is unaffected.
    let h1 = 0x811c9dc5 | 0;
    let h2 = 0xc9dc5118 | 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = (h1 ^ c) * 0x01000193 | 0;
      h2 = (h2 ^ c ^ (i << 4)) * 0x01000193 | 0;
    }
    const perf = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? (performance.now() | 0) : 0;
    const suffix = (Math.random() * 1e16 | 0).toString(36) + perf.toString(36);
    return 'idem-' +
      ('0000000' + (h1 >>> 0).toString(16)).slice(-8) +
      ('0000000' + (h2 >>> 0).toString(16)).slice(-8) +
      '-' + suffix +
      '-' + (sale.timestamp || 0).toString(36);
  }

  /* R6b GAP-S2: encolar venta offline con todos los headers necesarios.
     Guarda en localStorage (compat) + IndexedDB volvix-db queue (sw.js processSyncQueue). */
  async function __volvixEnqueueSaleOffline(saleData, idemKey, cartToken, authToken) {
    const headers = {
      'Idempotency-Key': idemKey,
      ...(cartToken ? { 'X-Cart-Token': cartToken } : {}),
      ...(authToken ? { Authorization: 'Bearer ' + authToken } : {})
    };
    const item = {
      type: 'sale',
      endpoint: '/api/sales',
      method: 'POST',
      data: saleData,
      headers,
      idempotency_key: idemKey,
      cart_token: cartToken || null,
      auth_token: authToken || null,
      client_uuid: idemKey, // misma key = mismo cliente_uuid (server R1 dedup)
      queued_at: Date.now(),
      retries: 0,
      status: 'pending'
    };
    // 1. localStorage (compat con offline-wiring)
    try {
      const queue = JSON.parse(localStorage.getItem('volvix:wiring:queue') || '[]');
      queue.push(item);
      localStorage.setItem('volvix:wiring:queue', JSON.stringify(queue));
    } catch (_) {}
    // 2. IndexedDB volvix-db queue (sw.js sync)
    try {
      await new Promise((resolve) => {
        const req = indexedDB.open('volvix-db', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          try {
            const tx = db.transaction(['queue'], 'readwrite');
            tx.objectStore('queue').add(item);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) { resolve(); }
        };
        req.onerror = () => resolve();
      });
    } catch (_) {}
    // 3. Pedirle al SW que intente sync ya
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
      }
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.sync) { try { await reg.sync.register('volvix-sync'); } catch (_) {} }
      }
    } catch (_) {}
  }

  /* R6b GAP-S3: Helper que cuenta ventas offline pendientes (live, no skipped/blocked).
     Usado por closeCut para BLOQUEAR cierre Z si hay queue sucia. */
  async function __volvixCountOfflineSalesPending() {
    let count = 0;
    // 1. localStorage queue
    try {
      const lsQ = JSON.parse(localStorage.getItem('volvix:wiring:queue') || '[]');
      count += lsQ.filter(x => x && x.type === 'sale' && x.status !== 'skipped' && x.status !== 'blocked_auth' && x.status !== 'dead').length;
    } catch (_) {}
    // 2. IndexedDB queue
    try {
      const idbCount = await new Promise((resolve) => {
        const req = indexedDB.open('volvix-db', 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          try {
            const tx = db.transaction(['queue'], 'readonly');
            const r = tx.objectStore('queue').getAll();
            r.onsuccess = () => {
              const all = r.result || [];
              const live = all.filter(x => x && /\/api\/sales/.test(x.endpoint || '')
                && x.status !== 'skipped' && x.status !== 'blocked_auth' && x.status !== 'dead');
              resolve(live.length);
            };
            r.onerror = () => resolve(0);
          } catch (_) { resolve(0); }
        };
        req.onerror = () => resolve(0);
      });
      // Tomar el max para no doble-contar (queue puede estar duplicada en LS+IDB)
      count = Math.max(count, idbCount);
    } catch (_) {}
    return count;
  }
  window.__volvixCountOfflineSalesPending = __volvixCountOfflineSalesPending;
  // Listener: cuando SW notifica online_clean, soltar bloqueo
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'sync-complete' && msg.online_clean === true) {
        window.__volvixOfflineQueueClean = true;
      }
      if (msg.type === 'NEED_REFRESH') {
        // R6b GAP-S4: SW lleva > 24h, ofrecer refresh suave
        try {
          if (typeof showToast === 'function') showToast('Hay actualización pendiente. Recarga para aplicar.', 'info');
        } catch (_) {}
      }
      if (msg.type === 'auth-required') {
        try {
          if (typeof showToast === 'function') showToast('⚠ Sesión vencida o permisos cambiaron. Vuelve a iniciar sesión.', 'error');
        } catch (_) {}
      }
    });
  }
  // Listener: si OTRA pestaña inició checkout, mostrar warning y bloquear cobro local
  if (VOLVIX_CART_CHANNEL) {
    VOLVIX_CART_CHANNEL.addEventListener('message', (ev) => {
      if (!ev || !ev.data) return;
      if (ev.data.type === 'cart-checkout-started') {
        try {
          if (typeof showToast === 'function') {
            showToast('⚠ Otra pestaña está cobrando — tu carrito quedó bloqueado', 'error');
          }
          // Marcar carrito local como invalidado
          window.__volvixCartLocked = true;
          // Cerrar modal de cobro si estaba abierto
          try {
            const m = document.getElementById('modal-pay');
            if (m && m.classList.contains('open')) m.classList.remove('open');
          } catch (_) {}
        } catch (_) {}
      }
      if (ev.data.type === 'cart-checkout-done') {
        // El cobro de la otra pestaña terminó: limpiar nuestro carrito local
        try {
          if (Array.isArray(window.CART)) window.CART.length = 0;
          if (typeof renderCart === 'function') renderCart();
          window.__volvixCartLocked = false;
        } catch (_) {}
      }
    });
  }

  /* ============ PAYMENT ============ */
  function openPayment() {
    if (CART.length === 0) { showToast('No hay productos en el ticket'); return; }
    if (window.__volvixCartLocked) {
      showToast('⚠ Carrito bloqueado: otra pestaña está cobrando', 'error');
      return;
    }
    const total = CART.reduce((s,i) => s + i.price * i.qty, 0);
    $('#pay-total').textContent = fmt(total);
    $('#pay-items').textContent = CART.reduce((s,i) => s + i.qty, 0);
    $('#pay-recibido').value = fmt(total);
    calcChange();
    // Generar cart-token y avisar a otras pestañas
    const tok = __volvixGetOrCreateCartToken();
    try {
      if (VOLVIX_CART_CHANNEL) VOLVIX_CART_CHANNEL.postMessage({ type: 'cart-checkout-started', token: tok, ts: Date.now() });
    } catch (_) {}
    $('#modal-pay').classList.add('open');
  }
  function closeModal(id) { $('#'+id).classList.remove('open'); }
  function setPayMethod(el) {
    // FIX-N5-B1/B2: Limpiar selección visual de TODAS las filas de métodos del modal-pay
    var modal = document.getElementById('modal-pay');
    if (modal) {
      modal.querySelectorAll('.btn[data-method]').forEach(function (b) {
        b.style.borderColor = '';
        b.style.background = '';
        b.style.color = '';
      });
    } else {
      el.parentElement.querySelectorAll('.btn').forEach(function (b) {
        b.style.borderColor = '';
        b.style.background = '';
        b.style.color = '';
      });
    }
    el.style.borderColor = 'var(--accent)';
    el.style.background = 'var(--accent-soft)';
    el.style.color = 'var(--accent)';
    // FIX-N5-B1/B2: persistir método seleccionado para que completePay() lo lea
    var method = (el.dataset && el.dataset.method) ? el.dataset.method : 'efectivo';
    window.__volvixSelectedPayMethod = method;
  }
  function calcChange() {
    const total = parse$($('#pay-total').textContent);
    const recibido = parse$($('#pay-recibido').value);
    const cambio = Math.max(0, recibido - total);
    $('#pay-cambio').textContent = fmt(cambio);
    var fp = document.getElementById('footer-pago'); if (fp) fp.textContent = fmt(recibido);
    var fc = document.getElementById('footer-cambio'); if (fc) fc.textContent = fmt(cambio);
    // Cambio negativo (recibido < total) → marcar input en rojo discreto
    const inp = $('#pay-recibido');
    if (inp) inp.style.borderColor = (recibido > 0 && recibido < total) ? '#FBBF24' : '';
  }
  // Sumar billete recibido al campo "recibido"
  function payAddBill(amount) {
    const inp = $('#pay-recibido');
    if (!inp) return;
    const cur = parse$(inp.value);
    const nv = cur + Number(amount);
    inp.value = fmt(nv);
    calcChange();
    // Visual feedback en el botón
    const btn = document.querySelector('.bill-btn[data-bill="' + amount + '"]');
    if (btn) {
      btn.style.background = '#0B0B0F'; btn.style.color = '#FFF'; btn.style.borderColor = '#0B0B0F';
      setTimeout(() => { btn.style.background = '#FFF'; btn.style.color = '#0B0B0F'; btn.style.borderColor = '#E5E5EA'; }, 200);
    }
  }
  // Marcar como exacto (recibido = total, cambio 0)
  function payExactAmount() {
    const inp = $('#pay-recibido');
    if (!inp) return;
    const total = parse$($('#pay-total').textContent);
    inp.value = fmt(total);
    calcChange();
  }
  // Numpad: agregar dígito al campo recibido o limpiar con backspace
  function payNumKey(key) {
    const inp = $('#pay-recibido');
    if (!inp) return;
    let raw = String(inp.value || '').replace(/[^0-9.]/g, '');
    if (key === 'back') {
      raw = raw.slice(0, -1);
    } else if (key === '.') {
      if (!raw.includes('.')) raw = raw + '.';
    } else {
      raw = raw + key;
    }
    const num = parseFloat(raw) || 0;
    inp.value = fmt(num);
    calcChange();
  }
  async function completePay() {
    // R7b FIX-S2: GUARD GLOBAL anti double-submit.
    // Razon: aunque R6b agrega idempotency-key determinista, hay ventana de race ~500ms
    // entre primer click y respuesta del server. Un segundo click (o F12 disparado por
    // listener duplicado) podria meter una venta concurrente antes de que el server
    // detecte la dup.
    if (window.__volvixSaleInFlight) {
      console.warn('[volvix] Sale already in flight, ignoring double-submit');
      return;
    }
    // FIX-N5-B1: Si método requiere verificación bancaria humana (transferencia/sinpe/oxxo)
    // bloquear hasta que cajero/manager confirme. NO confiamos en screenshot ni en "ya llegó".
    var __vlxMethod = window.__volvixSelectedPayMethod || 'efectivo';
    var __vlxNeedsBankVerify = (__vlxMethod === 'transferencia' || __vlxMethod === 'sinpe' || __vlxMethod === 'oxxo');
    if (__vlxNeedsBankVerify && !window.__volvixPayVerified) {
      try {
        var totalForVerify = (typeof parse$ === 'function') ? parse$($('#pay-total').textContent) : 0;
        window.__vlxOpenPayVerifyModal(__vlxMethod, totalForVerify);
      } catch (e) { console.error('[FIX-N5-B1] verify modal error', e); }
      return; // bloquea cobro hasta verificación
    }
    // FIX-N5-B2: Si método es app-pago externa, abrir modal con timer + polling.
    if (__vlxMethod === 'app-pago' && !window.__volvixAppPayConfirmed) {
      try {
        var totalForApp = (typeof parse$ === 'function') ? parse$($('#pay-total').textContent) : 0;
        window.__vlxOpenAppPayModal(totalForApp);
      } catch (e) { console.error('[FIX-N5-B2] app-pay modal error', e); }
      return; // bloquea hasta confirmación bancaria o cancelación
    }
    // R7b FIX-S2: identificar boton disparador para deshabilitarlo visualmente
    const _payBtn = document.querySelector("#modal-pay .modal-foot button.btn.success")
      || (typeof event !== 'undefined' && event && event.target && event.target.closest && event.target.closest('button'))
      || null;
    if (_payBtn) {
      _payBtn.disabled = true;
      _payBtn.classList.add('processing');
      _payBtn.dataset.originalText = _payBtn.dataset.originalText || _payBtn.textContent;
      _payBtn.textContent = 'Procesando...';
    }
    window.__volvixSaleInFlight = true;
    try {
      // ===== CABLEADO: Guardar venta en base de datos =====
      const session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
      const total = CART.reduce((s, i) => s + i.price * i.qty, 0);
      const folio = parseInt($('#currentFolio').textContent);

      const saleData = {
        tenant_id: session?.tenant_id || 'TNT001',
        user_id: session?.user_id || 'USR001',
        cashier_email: session?.email || 'unknown',
        ticket_number: 'TKT-' + folio,
        items: CART.map(i => ({
          product_id: i.id || null,
          code: i.code,
          name: i.name,
          price: i.price,
          qty: i.qty,
          subtotal: i.price * i.qty
        })),
        total: total,
        // FIX-N5-B1/B2: respetar el método seleccionado por el cajero (no hardcoded)
        payment_method: window.__volvixSelectedPayMethod || 'efectivo',
        // FIX-N5-B1: incluir evidencia de verificación bancaria si aplicó
        payment_verification: window.__volvixPayVerification || null,
        timestamp: Date.now()
      };

      // B41 fix: include Bearer + idempotency key so:
      //   1. The sale actually authenticates (was getting 401 → queued forever).
      //   2. If queue retries, dedup is possible by idempotency_key.
      const _b41Token = (window.VolvixAuth && window.VolvixAuth.getToken && window.VolvixAuth.getToken())
        || localStorage.getItem('volvix_token')
        || localStorage.getItem('volvixAuthToken') || '';
      // R6b GAP-S5: Idempotency-Key DETERMINISTA (sha256 de items+total+cashier+ticket).
      // Razon: si el PWA refresca o reintenta offline N veces, MISMA key = MISMA venta.
      // El server (R1 idempotency_keys) detectara dup y devolvera response cacheada.
      const _b41Idem = await __volvixDeterministicIdemKey(saleData);
      saleData.idempotency_key = _b41Idem;
      // GAP-2: cart-token guard (server-side double-checkout prevention)
      const _cartToken = (typeof __volvixGetOrCreateCartToken === 'function') ? __volvixGetOrCreateCartToken() : null;
      // R10a FIX-N1-1: Para pagos con tarjeta, usar AbortController con timeout 10s.
      // Si el banco aprueba pero la respuesta no llega (timeout/red), registrar pending
      // en lugar de encolar offline (porque encolar puede generar DOBLE COBRO).
      const _isCard = (saleData.payment_method === 'tarjeta' || saleData.payment_method === 'card' || saleData.payment_method === 'debito' || saleData.payment_method === 'credito');
      const _r10aCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      let _r10aTimedOut = false;
      let _r10aTimer = null;
      if (_isCard && _r10aCtrl) {
        _r10aTimer = setTimeout(function () {
          _r10aTimedOut = true;
          try { _r10aCtrl.abort(); } catch (_) {}
        }, 10000);
      }
      try {
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(_b41Token ? { Authorization: 'Bearer ' + _b41Token } : {}),
            'Idempotency-Key': _b41Idem,
            ...(_cartToken ? { 'X-Cart-Token': _cartToken } : {}),
          },
          body: JSON.stringify(saleData),
          ...(_r10aCtrl ? { signal: _r10aCtrl.signal } : {})
        });
        if (_r10aTimer) clearTimeout(_r10aTimer);
        if (res.ok) {
          const saved = await res.json();
          showToast('✓ Venta ' + saved.id + ' guardada en DB');
          console.log('[VOLVIX] Venta guardada:', saved);
        } else if (res.status === 409) {
          // GAP-2: server detectó doble cobro o R10a STOCK_INSUFFICIENT
          try {
            const errBody = await res.json();
            if (errBody && errBody.error === 'cart_already_consumed') {
              showToast('⚠ Este carrito ya fue cobrado en otra pestaña', 'error');
              closeModal('modal-pay');
              return;
            }
            // R10a FIX-N1-4: stock race lost — otro cajero vendio el mismo item
            if (errBody && (errBody.error === 'STOCK_INSUFFICIENT' || errBody.error_code === 'STOCK_INSUFFICIENT')) {
              showToast('⚠ Sin stock: otro cajero vendio el ultimo. Disponible: ' + (errBody.available != null ? errBody.available : '0'), 'error');
              return;
            }
            showToast('Error: ' + (errBody.message || errBody.error || 'conflict'), 'error');
          } catch (_) {
            showToast('Error 409 al cobrar', 'error');
          }
        } else {
          // Si falla la API, guardar en queue offline (R6b GAP-S2: incluir auth_token + cart_token + idem para sw.js)
          await __volvixEnqueueSaleOffline(saleData, _b41Idem, _cartToken, _b41Token);
          showToast('⚠ Venta guardada offline - se sincronizará');
        }
      } catch(err) {
        if (_r10aTimer) clearTimeout(_r10aTimer);
        // R10a FIX-N1-1: Para tarjeta, NO encolar offline (riesgo doble cobro).
        // Registrar pending y mostrar modal NO RECOBRES.
        if (_isCard && (_r10aTimedOut || (err && err.name === 'AbortError'))) {
          try {
            const pending = await window.r10aRegisterPendingPay(saleData, saleData.terminal_ref || ('TKT-' + folio));
            r10aShowModal(
              'Pago en proceso (NO recobres)',
              '<div style="text-align:center;padding:20px;">' +
              '<div style="font-size:48px;margin-bottom:10px;">⏳</div>' +
              '<p style="font-size:16px;font-weight:600;color:#F59E0B;">Pago en proceso. NO cobres de nuevo hasta verificar.</p>' +
              '<p style="margin:15px 0;">Monto: <strong>$' + Number(saleData.total).toFixed(2) + '</strong></p>' +
              '<p style="margin:15px 0;color:#666;">El sistema reconcilia automaticamente cada 60s. Si el banco aprobo, la venta se materializara sola.</p>' +
              (pending && pending.pending && pending.pending.id ?
                '<button class="btn primary" onclick="r10aManualVerify(\'' + pending.pending.id + '\')" style="margin-top:10px;padding:10px 20px;">Verificar ahora con el banco</button>' :
                '<p style="color:#DC2626;">Error registrando pendiente: ' + (pending && pending.error || 'unknown') + '</p>') +
              '</div>'
            );
            // NO cerrar modal-pay todavia, esperar la decision del cajero
            return;
          } catch (regErr) {
            console.warn('[r10a] failed to register pending', regErr);
            showToast('⚠ Pago pendiente: verifica con el banco antes de re-cobrar', 'error');
            return;
          }
        }
        // No card o no timeout → flujo offline normal (efectivo es seguro)
        await __volvixEnqueueSaleOffline(saleData, _b41Idem, _cartToken, _b41Token);
        showToast('⚠ Sin conexión - venta en cola offline');
      }

      closeModal('modal-pay');
      // GAP-2: avisar a otras pestañas que el cobro terminó (limpian su carrito si compartían)
      try {
        if (typeof VOLVIX_CART_CHANNEL !== 'undefined' && VOLVIX_CART_CHANNEL) {
          VOLVIX_CART_CHANNEL.postMessage({ type: 'cart-checkout-done', token: _cartToken, ts: Date.now() });
        }
      } catch (_) {}
      if (typeof __volvixResetCartToken === 'function') __volvixResetCartToken();
      CART = [];
      renderCart();
      // R8a FIX-H1: venta confirmada → borrar draft
      try { __r8aClearCartDraft(); } catch (_) {}
      // R8b FIX-R1/R4: notificar al server con razón sale_completed (multi-device sync)
      try {
        if (typeof __r8bAuthFetch === 'function') {
          __r8bAuthFetch('/api/cart/draft/clear', {
            method: 'POST', body: JSON.stringify({ reason: 'sale_completed' })
          }).catch(function () {});
        }
      } catch (_) {}
      $('#footer-pago').textContent = '$0.00';
      $('#footer-cambio').textContent = '$0.00';
      const newFolio = folio + 1;
      $('#currentFolio').textContent = newFolio;
      $('#pay-folio').textContent = newFolio;
    } finally {
      // R7b FIX-S2: SIEMPRE liberar guard y rehabilitar boton, incluso si hubo throw
      window.__volvixSaleInFlight = false;
      if (_payBtn) {
        _payBtn.disabled = false;
        _payBtn.classList.remove('processing');
        _payBtn.textContent = _payBtn.dataset.originalText || '✓ F12 - Completar cobro';
      }
    }
  }

  /* ============ OTHER SCREENS RENDER ============ */
  // Selección bulk para Stock actual
  let INV_BULK_SELECT = new Set();
  function _isExpiringSoon(p) {
    const exp = p.expiry_date || p.caducidad || p.expires_at;
    if (!exp) return false;
    const t = Date.parse(exp);
    if (isNaN(t)) return false;
    const days = (t - Date.now()) / (1000*60*60*24);
    return days >= 0 && days <= 30;
  }
  function renderInv(filter, opts) {
    const q = (filter || '').toLowerCase();
    const onlyLow = !!(opts && opts.onlyLow);
    const onlyZero = !!(opts && opts.onlyZero);
    const onlyExpiry = !!(opts && opts.onlyExpiry);
    const cat = (opts && opts.cat) || '';
    let list = q ? CATALOG.filter(p => (p.name||'').toLowerCase().includes(q) || (p.code||'').toLowerCase().includes(q) || (p.barcode||'').toLowerCase().includes(q)) : CATALOG.slice();
    if (cat) list = list.filter(p => (p.category || p.categoria || '') === cat);
    if (onlyZero) {
      list = list.filter(p => Number(p.stock||0) <= 0);
    } else if (onlyLow) {
      list = list.filter(p => {
        const s = Number(p.stock||0);
        const m = Number(p.min_stock||p.minimo||20);
        return s > 0 && s <= m;
      });
    }
    if (onlyExpiry) list = list.filter(_isExpiringSoon);
    const body = $('#inv-body');
    if (!body) return;
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-3);">Sin productos para mostrar</td></tr>';
    } else {
      body.innerHTML = list.map((p) => {
        const minSt = Number(p.min_stock || p.minimo || 20);
        const stock = Number(p.stock || 0);
        const cost = Number(p.cost || 0);
        const idAttr = escapeAttr(p.id || p.code || '');
        const codeAttr = escapeAttr(p.code || '');
        const expSoon = _isExpiringSoon(p);
        let rowStyle = '';
        if (stock <= 0) rowStyle = 'background:#FEE2E2;';
        else if (stock <= minSt) rowStyle = 'background:#FEF3C7;';
        else if (expSoon) rowStyle = 'background:#FFEDD5;';
        const stateChip = stock <= 0 ? '<span class="chip err"><span class="dot"></span>Agotado</span>'
          : stock <= minSt ? '<span class="chip err"><span class="dot"></span>Bajo mínimo</span>'
          : expSoon ? '<span class="chip warn"><span class="dot"></span>Por caducar</span>'
          : stock < minSt * 1.5 ? '<span class="chip warn"><span class="dot"></span>Stock bajo</span>'
          : '<span class="chip ok"><span class="dot"></span>OK</span>';
        const checked = INV_BULK_SELECT.has(p.id || p.code) ? ' checked' : '';
        return `
        <tr style="${rowStyle}">
          <td><input type="checkbox" class="inv-row-check" data-rowid="${idAttr}"${checked}></td>
          <td class="mono" style="font-size: 11px; color: var(--text-3);">${escapeHtml(p.code||'')}</td>
          <td class="primary-col">${escapeHtml(p.name||'')}</td>
          <td><span class="chip">${escapeHtml(p.category || p.categoria || 'General')}</span></td>
          <td class="num" style="color:var(--text-3);font-size:11px;">${fmt(cost)}</td>
          <td class="num">${fmt(p.price)}</td>
          <td class="num"><strong>${stock}</strong></td>
          <td class="num" style="color:var(--text-3);font-size:11px;">${minSt}</td>
          <td>${stateChip}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn sm" data-action="quick-add" data-code="${codeAttr}" data-id="${idAttr}" title="Sumar stock" aria-label="Sumar stock">+Stock</button>
            <button class="btn sm" data-action="quick-sub" data-code="${codeAttr}" data-id="${idAttr}" title="Restar stock" aria-label="Restar stock">−Stock</button>
            <button class="btn sm" data-action="kardex" data-code="${codeAttr}" data-id="${idAttr}" title="Ver Kardex" aria-label="Ver Kardex">📜 Kardex</button>
            <button class="btn sm" data-action="edit-prod" data-code="${codeAttr}" title="Editar producto" aria-label="Editar producto">✏️ Editar</button>
            <button class="btn sm" data-action="del-prod" data-code="${codeAttr}" data-id="${idAttr}" style="color:var(--danger);" title="Eliminar producto" aria-label="Eliminar producto">🗑️</button>
          </td>
        </tr>`;
      }).join('');
    }
    const sub = document.getElementById('inv-sub');
    if (sub) sub.textContent = CATALOG.length + ' productos · ' + list.length + ' visibles';
    _updateBulkBar();
    if (typeof updateInvStats === 'function') updateInvStats();
  }
  function _updateBulkBar() {
    const bar = document.getElementById('inv-bulk-bar');
    const cnt = document.getElementById('inv-bulk-count');
    if (!bar) return;
    if (INV_BULK_SELECT.size > 0) {
      bar.style.display = 'flex';
      if (cnt) cnt.textContent = INV_BULK_SELECT.size + ' seleccionados';
    } else {
      bar.style.display = 'none';
    }
  }
  // Safe HTML helpers (used across new modules)
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s){ return escapeHtml(s); }

  /* ============ CABLEADO PRODUCTOS A SUPABASE ============ */
  function _vSession(){ return JSON.parse(localStorage.getItem('volvixSession') || 'null') || {}; }
  function _vTenant(){ return _vSession().tenant_id || 'TNT001'; }
  function _vToken(){
    try {
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        const t = window.VolvixAuth.getToken();
        if (t) return t;
      }
    } catch(e){}
    if (typeof getToken === 'function') { try { const t = getToken(); if (t) return t; } catch(e){} }
    if (window.session && window.session.token) return window.session.token;
    return localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || '';
  }
  function _authHeaders(extra){
    const tok = _vToken();
    const h = Object.assign({}, extra || {});
    if (tok) h['Authorization'] = 'Bearer ' + tok;
    return h;
  }
  async function _authFetch(url, opts){
    opts = opts || {};
    opts.headers = _authHeaders(opts.headers);
    return fetch(url, opts);
  }
  async function loadCatalogReal(){
    try {
      const r = await _authFetch('/api/products?tenant_id=' + encodeURIComponent(_vTenant()));
      if (!r.ok) return;
      const data = await r.json();
      const items = Array.isArray(data) ? data : (data.items || []);
      CATALOG.length = 0;
      items.forEach(p => CATALOG.push({
        id:p.id, code:p.code, name:p.name,
        price:Number(p.price)||0, cost:Number(p.cost)||0,
        stock:Number(p.stock || p.stock_actual || 0),
        min_stock: Number(p.min_stock || p.minimo || 0),
        max_stock: Number(p.max_stock || p.maximo || 0),
        category: p.category || p.categoria || '',
        description: p.description || p.descripcion || '',
        barcode: p.barcode || p.codigo_barras || p.code || ''
      }));
      if (typeof renderInv === 'function') renderInv();
    } catch(e){ console.warn('[VOLVIX] loadCatalogReal:', e); }
  }
  async function saveProduct(data, productId){
    const url = productId ? '/api/products/' + encodeURIComponent(productId) : '/api/products';
    // Use PATCH for update (per spec), POST for create
    const method = productId ? 'PATCH' : 'POST';
    const body = Object.assign({ tenant_id: _vTenant() }, data);
    try {
      const r = await _authFetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!r.ok) {
        // Fallback to PUT if PATCH not supported
        if (productId && (r.status === 405 || r.status === 404)) {
          const r2 = await _authFetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          if (r2.ok) {
            const result = await r2.json().catch(()=> ({}));
            await loadCatalogReal();
            showToast('✓ Producto actualizado');
            return result;
          }
        }
        const err = await r.json().catch(()=> ({}));
        showToast('Error: ' + (err.error || err.message || ('HTTP ' + r.status)), 'error');
        return null;
      }
      const result = await r.json().catch(()=> ({}));
      await loadCatalogReal();
      showToast(productId ? '✓ Producto actualizado' : '✓ Producto creado');
      return result;
    } catch(e){ showToast('Sin conexión: ' + e.message, 'error'); return null; }
  }
  async function deleteProduct(code, id){
    let ok = false;
    if (window.VolvixUI && typeof window.VolvixUI.destructiveConfirm === 'function') {
      ok = await window.VolvixUI.destructiveConfirm({ title: 'Eliminar producto', message: '¿Eliminar producto "' + code + '"? Esta acción no se puede deshacer.', confirmText: 'Eliminar', requireText: 'ELIMINAR' });
    } else {
      ok = confirm('¿Eliminar producto "' + code + '"? Esta acción no se puede deshacer.');
    }
    if (!ok) return;
    const url = id ? '/api/products/' + encodeURIComponent(id) : '/api/products?code=' + encodeURIComponent(code) + '&tenant_id=' + encodeURIComponent(_vTenant());
    try {
      const r = await _authFetch(url, { method:'DELETE' });
      if (!r.ok) {
        const err = await r.json().catch(()=> ({}));
        showToast('Error al eliminar: ' + (err.error || err.message || ('HTTP ' + r.status)), 'error');
        return;
      }
      await loadCatalogReal();
      showToast('✓ Producto eliminado');
    } catch(e){ showToast('Sin conexión: ' + e.message, 'error'); }
  }
  function exportProductsCSV(){
    const tenant = _vTenant();
    const session = _vSession();
    const token = session.token || session.access_token || '';
    // Intento server-side primero
    const url = '/api/products?export=csv&tenant_id=' + encodeURIComponent(tenant) + (token ? '&token=' + encodeURIComponent(token) : '');
    fetch(url).then(r => {
      if (r.ok && (r.headers.get('content-type')||'').includes('csv')) {
        window.open(url, '_blank');
      } else {
        // Fallback: generar CSV en cliente
        const rows = [['code','name','price','cost','stock']].concat(CATALOG.map(p => [p.code,p.name,p.price,p.cost||0,p.stock||0]));
        const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
        const blob = new Blob([csv], { type:'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'productos_' + tenant + '.csv'; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      }
      showToast('Exportación lista');
    }).catch(()=> showToast('Error al exportar','error'));
  }
  function _parseCSV(text){
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
    return lines.slice(1).map(l => {
      const cols = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [];
      const vals = cols.map(c => c.replace(/,$/, '').replace(/^"|"$/g,'').replace(/""/g,'"').trim());
      const o = {}; headers.forEach((h,i) => o[h] = vals[i] || ''); return o;
    });
  }
  async function importProductsCSV(file){
    const text = await file.text();
    const rows = _parseCSV(text);
    if (!rows.length) { showToast('CSV vacío','error'); return; }
    const items = rows.map(r => ({ code:r.code||r['código']||'', name:r.name||r.nombre||'', price:Number(r.price||r.precio||0), cost:Number(r.cost||r.costo||0), stock:Number(r.stock||0) })).filter(p => p.code && p.name);
    try {
      const r = await fetch('/api/products/import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tenant_id:_vTenant(), items }) });
      if (!r.ok) {
        // Fallback: POST uno por uno
        let ok=0; for (const it of items){ const rr = await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({tenant_id:_vTenant()},it))}); if (rr.ok) ok++; }
        await loadCatalogReal(); showToast('Importados ' + ok + '/' + items.length); return;
      }
      await loadCatalogReal();
      showToast('Importados ' + items.length + ' productos');
    } catch(e){ showToast('Error import: ' + e.message,'error'); }
  }
  // Panel inline post-save del modal Nuevo producto. Ofrece al cajero imprimir
  // etiqueta de código de barras del producto recién creado, especificar cantidad
  // y opcionalmente abrir el módulo de Diseño de etiqueta para personalizar.
  // Está marcado con data-module="etiquetas" — el admin puede ocultar/locker
  // este flow completo per-tenant (control granular).
  function showLabelPrintPanel(modal, productData, closeFn) {
    const card = modal.querySelector('div[role="document"]') || modal.firstElementChild;
    if (!card) { closeFn(productData); return; }
    // Reemplazar el contenido del card por el panel de etiquetas
    card.innerHTML =
      '<div data-module="etiquetas" data-button="product.label-print-prompt">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<h2 id="pf-title" style="margin:0;font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#0B0B0F">✓ Producto creado</h2>' +
          '<button id="pl-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#666" aria-label="Cerrar (Esc)">&times;</button>' +
        '</div>' +
        '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:13.5px">' +
          '<div style="font-weight:500;color:#15803D;margin-bottom:4px">' +
            (escapeHtml(productData.name)) + '</div>' +
          '<div style="color:#3F3F46;font-size:12.5px">' +
            'Código de barras: <code style="background:#FFF;padding:2px 6px;border-radius:4px;border:1px solid #E5E5EA;font-family:\'SF Mono\',Menlo,monospace">' + escapeHtml(productData.barcode) + '</code> · ' +
            'Precio: <strong>$' + Number(productData.price).toFixed(2) + '</strong>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:14px;color:#0B0B0F;margin-bottom:16px;font-weight:500">¿Imprimir etiqueta del código de barras?</div>' +
        '<div data-button="product.label-quantity" style="display:flex;gap:10px;align-items:center;margin-bottom:14px">' +
          '<label style="font-size:13px;color:#3F3F46;font-weight:500">Cantidad:</label>' +
          '<input id="pl-qty" type="number" min="1" max="500" value="1" style="width:80px;padding:9px 12px;border:1px solid #E5E5EA;border-radius:8px;font-size:14px;text-align:center">' +
          '<span style="font-size:12px;color:#9CA3AF">etiquetas</span>' +
        '</div>' +
        '<div data-button="product.label-format" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">' +
          '<button type="button" data-pl-fmt="thermal-58" class="pl-fmt-btn" style="padding:8px 14px;border:1px solid #0B0B0F;background:#0B0B0F;color:#FFF;border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer">Térmica 58mm</button>' +
          '<button type="button" data-pl-fmt="thermal-80" class="pl-fmt-btn" style="padding:8px 14px;border:1px solid #E5E5EA;background:#FFF;color:#3F3F46;border-radius:8px;font-size:12.5px;cursor:pointer">Térmica 80mm</button>' +
          '<button type="button" data-pl-fmt="a4" class="pl-fmt-btn" style="padding:8px 14px;border:1px solid #E5E5EA;background:#FFF;color:#3F3F46;border-radius:8px;font-size:12.5px;cursor:pointer">A4 (24/hoja)</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
          '<button type="button" id="pl-skip" data-button="product.label-skip" style="padding:10px 16px;border:1px solid #E5E5EA;background:#FFF;color:#3F3F46;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;min-height:44px">No, gracias</button>' +
          '<button type="button" id="pl-design" data-button="product.label-design" style="padding:10px 16px;border:1px solid #E5E5EA;background:#FFF;color:#0B0B0F;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;min-height:44px">Diseñar etiqueta</button>' +
          '<button type="button" id="pl-print" data-button="product.label-print" style="padding:10px 18px;border:none;background:#0B0B0F;color:#FFF;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;min-height:44px">Imprimir ahora</button>' +
        '</div>' +
      '</div>';
    // Format selector (visual)
    let selectedFmt = 'thermal-58';
    card.querySelectorAll('.pl-fmt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.pl-fmt-btn').forEach(b => {
          b.style.background = '#FFF'; b.style.color = '#3F3F46'; b.style.borderColor = '#E5E5EA';
        });
        btn.style.background = '#0B0B0F'; btn.style.color = '#FFF'; btn.style.borderColor = '#0B0B0F';
        selectedFmt = btn.getAttribute('data-pl-fmt');
      });
    });
    // Skip
    card.querySelector('#pl-skip').addEventListener('click', () => closeFn(productData));
    card.querySelector('#pl-close').addEventListener('click', () => closeFn(productData));
    // Diseñar → módulo de diseño existente con el producto pre-seleccionado
    card.querySelector('#pl-design').addEventListener('click', () => {
      const url = '/etiqueta_designer.html?barcode=' + encodeURIComponent(productData.barcode) +
                  '&name=' + encodeURIComponent(productData.name) +
                  '&price=' + encodeURIComponent(productData.price);
      window.open(url, '_blank');
      closeFn(productData);
    });
    // Imprimir: el endpoint /api/labels/print acepta {products:[{sku,name,price,qty,barcode}],format}.
    // En format='html' retorna HTML printable directo (no JSON). Lo abrimos en window y disparamos print.
    card.querySelector('#pl-print').addEventListener('click', async () => {
      const qty = Math.max(1, Math.min(500, parseInt(card.querySelector('#pl-qty').value, 10) || 1));
      try {
        const r = await fetch('/api/labels/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            products: [{
              sku: productData.code || productData.barcode,
              name: productData.name,
              price: productData.price,
              qty: qty,
              barcode: productData.barcode
            }],
            // Mapear nuestro UI fmt al esperado por el backend
            format: 'html',
            template_format: selectedFmt
          })
        });
        if (r.ok) {
          const ct = r.headers.get('content-type') || '';
          if (ct.includes('text/html')) {
            const html = await r.text();
            const w = window.open('', '_blank');
            if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
          } else {
            const j = await r.json().catch(() => null);
            if (j && j.print_url) window.open(j.print_url, '_blank');
            else if (j && j.html) {
              const w = window.open('', '_blank');
              if (w) { w.document.write(j.html); w.document.close(); setTimeout(() => w.print(), 300); }
            }
          }
        } else {
          showToast('No se pudo generar la etiqueta. Intenta desde el módulo de diseño.', 'error');
        }
      } catch (e) {
        showToast('Sin conexión — intenta de nuevo', 'error');
      }
      closeFn(productData);
    });
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  async function promptProductForm(prefill, opts){
    const p = prefill || {};
    const options = opts || {};
    return new Promise((resolve) => {
      let modal = document.getElementById('modal-product-form');
      if (modal) modal.remove();
      modal = document.createElement('div');
      modal.id = 'modal-product-form';
      // ARIA: el modal generado dinámicamente carecía de role="dialog" y aria-modal,
      // así que lectores de pantalla lo anunciaban como "form". También faltaba
      // aria-labelledby al título y focus trap. Con esto cumplimos WCAG 2.1.
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'pf-title');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
      // Inyectar override mobile-first: en pantallas <=768px los inputs van a
      // 16px (evita zoom iOS) y el grid 2-cols colapsa a 1 col para no romper.
      if (!document.getElementById('vlx-modal-mobile-style')) {
        const ms = document.createElement('style');
        ms.id = 'vlx-modal-mobile-style';
        ms.textContent = `
          @media (max-width: 768px) {
            #modal-product-form input,
            #modal-product-form textarea,
            #modal-product-form select { font-size: 16px !important; }
            #modal-product-form #pf-form { grid-template-columns: 1fr !important; }
            #modal-product-form > div { padding: 18px 16px !important; max-height: 95vh !important; }
            #modal-product-form button { min-height: 44px !important; }
          }
        `;
        document.head.appendChild(ms);
      }
      // Recordar el elemento que tenía foco antes de abrir el modal,
      // para devolvérselo al cerrar (heurística #1 + a11y).
      const _previouslyFocused = document.activeElement;
      modal.innerHTML = `
        <div style="background:#fff;color:#1C1917;border-radius:12px;padding:22px;width:520px;max-width:92vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 id="pf-title" style="margin:0;font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#0B0B0F;">${prefill ? 'Editar producto' : 'Nuevo producto'}</h2>
            <button id="pf-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#666;" aria-label="Cerrar (Esc)" title="Esc">&times;</button>
          </div>
          <form id="pf-form" style="display:grid;gap:10px;grid-template-columns:1fr 1fr;">
            <label style="grid-column:span 2;display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Nombre del producto *
              <input id="pf-name" type="text" required maxlength="160" value="${escapeAttr(p.name||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;" placeholder="Ej. Coca Cola 600ml">
            </label>
            <!-- SKU hidden — auto-derivado del barcode si queda vacío -->
            <input id="pf-code" type="hidden" value="${escapeAttr(p.code||'')}">
            <label style="grid-column:span 2;display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Código de barras
              <input id="pf-barcode" type="text" maxlength="32" value="${escapeAttr(p.barcode||p.code||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;" placeholder="Se auto-genera (1, 2, 3…) o escribe el tuyo">
              <span id="pf-barcode-status" style="font-size:11.5px;font-weight:500;min-height:14px;padding-left:2px"></span>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Precio (venta) *
              <input id="pf-price" type="number" required min="0.01" step="0.01" value="${Number(p.price)||0}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Costo <span style="color:#9CA3AF;font-weight:400">(opcional)</span>
              <input id="pf-cost" type="number" min="0" step="0.01" value="${Number(p.cost)||0}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;">
              <span style="font-size:11px;color:#9CA3AF;margin-top:2px">Si no lo conoces, déjalo en 0 y lo agregas después</span>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Stock actual *
              <input id="pf-stock" type="number" required min="0" step="1" value="${Number(p.stock)||0}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Stock mínimo
              <input id="pf-min" type="number" min="0" step="1" value="${Number(p.min_stock)||0}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Categoría
              <input id="pf-cat" type="text" maxlength="64" value="${escapeAttr(p.category||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;" placeholder="Bebidas, Abarrotes…">
            </label>
            <label style="grid-column:span 2;display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Descripción
              <textarea id="pf-desc" maxlength="500" rows="2" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;resize:vertical;" placeholder="Notas internas, características…">${escapeHtml(p.description||'')}</textarea>
            </label>
            <!-- 2026-05-06 (FASE 7): campos giro-aware con data-flag.
                 VolvixGiroConfig.apply() oculta los wrappers (label) cuando
                 giros_campos.<giro>.producto.<flag>.visible === false.
                 Defaults estan en seed: 'default' los oculta a todos, los giros
                 que los necesitan (farmacia/vet/restaurante) los hacen visibles. -->
            <label data-flag="caducidad" style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Caducidad
              <input id="pf-caducidad" type="date" value="${escapeAttr(p.expiry_date||p.caducidad||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;">
            </label>
            <label data-flag="lote" style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Lote / Serie
              <input id="pf-lote" type="text" maxlength="40" value="${escapeAttr(p.lote||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;" placeholder="L20240315-A1">
            </label>
            <label data-flag="ingrediente_activo" style="grid-column:span 2;display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Ingrediente activo
              <input id="pf-ingrediente" type="text" maxlength="120" value="${escapeAttr(p.ingrediente_activo||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;" placeholder="Paracetamol 500mg, Amoxicilina 250mg…">
            </label>
            <label data-flag="marca_animal" style="grid-column:span 2;display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:500;">
              Marca / talla animal
              <input id="pf-marca-animal" type="text" maxlength="80" value="${escapeAttr(p.marca_animal||'')}" style="padding:9px;border:1px solid #E7E5E4;border-radius:7px;font-size:13.5px;" placeholder="Royal Canin Adulto Mediano">
            </label>
            <label data-flag="requiere_receta" style="display:flex;align-items:center;gap:8px;grid-column:span 2;font-size:12.5px;font-weight:500;cursor:pointer;">
              <input id="pf-requiere-receta" type="checkbox" ${p.requiere_receta ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
              Requiere receta médica
            </label>
            <label data-flag="controlado_sagarpa" style="display:flex;align-items:center;gap:8px;grid-column:span 2;font-size:12.5px;font-weight:500;cursor:pointer;">
              <input id="pf-controlado" type="checkbox" ${p.controlado_sagarpa ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
              Controlado SAGARPA / COFEPRIS
            </label>
            <label data-flag="modificadores" style="display:flex;align-items:center;gap:8px;grid-column:span 2;font-size:12.5px;font-weight:500;cursor:pointer;">
              <input id="pf-modificadores" type="checkbox" ${p.tiene_modificadores ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
              Tiene modificadores (sin cebolla, extra queso…)
            </label>
            <label data-flag="receta_bom" style="display:flex;align-items:center;gap:8px;grid-column:span 2;font-size:12.5px;font-weight:500;cursor:pointer;">
              <input id="pf-receta-bom" type="checkbox" ${p.tiene_receta_bom ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
              Tiene receta (BOM — descontar ingredientes al vender)
            </label>
            <div id="pf-msg" style="grid-column:span 2;font-size:12px;color:#DC2626;min-height:14px;"></div>
            <div style="grid-column:span 2;display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
              <button type="button" id="pf-cancel" style="padding:10px 18px;border:1px solid #E5E5EA;background:#fff;color:#3F3F46;border-radius:8px;cursor:pointer;font-weight:500;font-size:14px;min-height:44px;">Cancelar</button>
              <button type="submit" id="pf-submit" style="padding:10px 18px;border:none;background:#0B0B0F;color:#fff;border-radius:8px;cursor:pointer;font-weight:500;font-size:14px;letter-spacing:0.005em;min-height:44px;">
                <span id="pf-submit-label">${prefill ? 'Guardar cambios' : 'Crear producto'}</span>
                <span id="pf-spinner" style="display:none;margin-left:6px;">⏳</span>
              </button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);
      // 2026-05-06 (FASE 7): el modal se construye on-demand con innerHTML, asi
      // que VolvixGiroConfig.apply() del page-load NO alcanzo a estos campos.
      // Re-aplicamos la config aqui para que farmacia/vet/restaurante vean los
      // campos especificos (receta, ingrediente_activo, lote, modificadores...)
      // y abarrotes/ferreteria los oculten. Si la config aun no cargo, la
      // primera vez que el user abra el modal ve todo; en la 2da ya filtrado.
      try {
        if (window.VolvixGiroConfig && window.VolvixGiroConfig.apply) {
          window.VolvixGiroConfig.apply();
        }
      } catch (_) {}
      const close = (val) => {
        modal.remove();
        // Devolver foco al elemento que abrió el modal (a11y + heurística #3)
        try { _previouslyFocused && _previouslyFocused.focus(); } catch (_) {}
        resolve(val);
      };
      modal.querySelector('#pf-close').onclick = () => close(null);
      modal.querySelector('#pf-cancel').onclick = () => close(null);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(null); });
      // Esc cierra el modal (heurística #3: control y libertad)
      modal.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
      });
      // Focus trap: Tab y Shift+Tab solo navegan dentro del modal
      modal.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Tab') return;
        const focusables = modal.querySelectorAll('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
        const visible = Array.from(focusables).filter(el => !el.disabled && el.offsetParent !== null);
        if (!visible.length) return;
        const first = visible[0], last = visible[visible.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      });
      modal.querySelector('#pf-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = modal.querySelector('#pf-msg'); msg.textContent = '';
        const name = modal.querySelector('#pf-name').value.trim();
        // Usar `let` (no `const`) porque más abajo derivamos code del barcode
        // si está vacío; el código original con `const` lanzaba TypeError.
        let code = modal.querySelector('#pf-code').value.trim();
        const price = parseFloat(modal.querySelector('#pf-price').value);
        const cost = parseFloat(modal.querySelector('#pf-cost').value);
        const stock = parseInt(modal.querySelector('#pf-stock').value, 10);
        const min_stock = parseInt(modal.querySelector('#pf-min').value, 10) || 0;
        // Validation
        if (!name) { msg.textContent = 'El nombre es obligatorio'; modal.querySelector('#pf-name').focus(); return; }
        // SKU oculto — auto-derivado del barcode si quedó vacío
        if (!code) {
          const bc = modal.querySelector('#pf-barcode').value.trim();
          code = bc || ('SKU-' + Date.now().toString(36).toUpperCase().slice(-6));
          modal.querySelector('#pf-code').value = code;
        }
        if (isNaN(price) || price <= 0) { msg.textContent = 'El precio debe ser mayor a 0'; modal.querySelector('#pf-price').focus(); return; }
        // Costo es opcional — sanitizar negativos a 0 sin bloquear el flujo
        const costClean = (isNaN(cost) || cost < 0) ? 0 : cost;
        if (isNaN(stock) || stock < 0) { msg.textContent = 'El stock no puede ser negativo'; modal.querySelector('#pf-stock').focus(); return; }
        // Show spinner
        modal.querySelector('#pf-spinner').style.display = 'inline';
        modal.querySelector('#pf-submit').disabled = true;
        const productData = {
          name, code,
          barcode: modal.querySelector('#pf-barcode').value.trim() || code,
          price, cost: costClean, stock, min_stock,
          stock_actual: stock,
          category: modal.querySelector('#pf-cat').value.trim() || 'General',
          categoria: modal.querySelector('#pf-cat').value.trim() || 'General',
          description: modal.querySelector('#pf-desc').value.trim()
        };
        // Si llamador opt-in con offerLabelPrint, mostrar mini-panel inline
        // antes de cerrar el modal: "¿Imprimir etiqueta de código de barras?"
        if (options && options.offerLabelPrint !== false) {
          showLabelPrintPanel(modal, productData, close);
        } else {
          close(productData);
        }
      });
      // Focus inteligente:
      //  - Si llamador pidió focusField, úsalo
      //  - Si el prefill ya trae un name (lo escribió el cajero) y NO trae barcode → ir a precio
      //  - Si el prefill trae code/barcode (escaneo) y nombre vacío → ir a nombre
      //  - Default → nombre
      const autoFocusSel = options.focusField
        || (p.barcode && !p.name ? '#pf-name'
        : (p.name && !p.barcode ? '#pf-price' : '#pf-name'));
      setTimeout(() => modal.querySelector(autoFocusSel)?.focus(), 50);

      // ── Auto-generar barcode SIEMPRE que el campo esté vacío al abrir.
      //    El cajero NO debe inventar números. El sistema asigna automático
      //    el próximo libre (1, 2, 3, …) y el usuario puede cambiarlo si quiere.
      const bcInput = modal.querySelector('#pf-barcode');
      const bcStatus = modal.querySelector('#pf-barcode-status');
      if (bcInput && !bcInput.value && !p.barcode) {
        // Sugerir el próximo libre desde el server (silencioso si falla)
        fetch('/api/products/next-barcode', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(j => {
            if (j && j.next_barcode && !bcInput.value) {
              bcInput.value = j.next_barcode;
              if (bcStatus) {
                bcStatus.textContent = 'Sugerido — puedes cambiarlo';
                bcStatus.style.color = '#6B7280';
              }
            }
          })
          .catch(() => {});
      }
      // ── Inline duplicate check del barcode (debounced). Texto rojo si está
      //    ocupado, verde si está libre. Sin modal, sin bloquear el flujo.
      let bcCheckTimer = null;
      if (bcInput && bcStatus) {
        bcInput.addEventListener('input', () => {
          const v = bcInput.value.trim();
          clearTimeout(bcCheckTimer);
          if (!v) { bcStatus.textContent = ''; return; }
          bcStatus.textContent = 'Verificando…';
          bcStatus.style.color = '#9CA3AF';
          bcCheckTimer = setTimeout(async () => {
            try {
              const r = await fetch('/api/products/check-barcode?code=' + encodeURIComponent(v), { credentials: 'include' });
              if (!r.ok) { bcStatus.textContent = ''; return; }
              const j = await r.json();
              // Fail-closed: si el server no pudo verificar, mostrar warning ámbar
              // (NO verde — un duplicado no detectado es peor que una falsa duda).
              if (j.available === null || j.taken === null) {
                bcStatus.textContent = '⚠ No se pudo verificar — el server confirmará al guardar';
                bcStatus.style.color = '#D97706';
                return;
              }
              if (j.taken) {
                bcStatus.textContent = '✗ Ya está ocupado por: ' + (j.existing?.name || 'otro producto');
                bcStatus.style.color = '#DC2626';
              } else {
                bcStatus.textContent = '✓ Disponible';
                bcStatus.style.color = '#10B981';
              }
            } catch (_) { bcStatus.textContent = ''; }
          }, 350);
        });
      }

      // Enter → siguiente campo (Enter en el último submitea). Si Enter en precio Y
      // los obligatorios mínimos están cubiertos → submit directo (flujo POS rápido).
      const fieldOrder = ['#pf-name','#pf-code','#pf-barcode','#pf-price','#pf-cost','#pf-stock','#pf-min','#pf-cat','#pf-desc'];
      modal.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const target = ev.target;
        if (!target || target.tagName === 'TEXTAREA') return;
        if (target.id === 'pf-submit' || target.tagName === 'BUTTON') return;
        ev.preventDefault();
        // Si estamos en pf-price y nombre+precio listos → submit fast
        if (target.id === 'pf-price') {
          const nm = (modal.querySelector('#pf-name')?.value || '').trim();
          const pr = parseFloat(modal.querySelector('#pf-price')?.value);
          if (nm && !isNaN(pr) && pr > 0) {
            // Auto-rellenar code si vacío para evitar fallar la validación
            const codeEl = modal.querySelector('#pf-code');
            if (codeEl && !codeEl.value.trim()) {
              codeEl.value = (p.barcode || ('SKU-' + Date.now().toString(36).toUpperCase())).slice(0, 32);
            }
            modal.querySelector('#pf-form')?.requestSubmit?.();
            return;
          }
        }
        // Sino → mover al siguiente campo
        const idx = fieldOrder.indexOf('#' + target.id);
        if (idx >= 0 && idx < fieldOrder.length - 1) {
          modal.querySelector(fieldOrder[idx + 1])?.focus();
        }
      });
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    const btnNew = document.getElementById('btn-new-prod');
    if (btnNew) btnNew.addEventListener('click', async () => { const d = await promptProductForm(); if (d) await saveProduct(d); });
    const btnExp = document.getElementById('btn-export-prod');
    if (btnExp) btnExp.addEventListener('click', exportProductsCSV);
    const btnImp = document.getElementById('btn-import-prod');
    const fileInp = document.getElementById('inv-import-file');
    if (btnImp && fileInp) { btnImp.addEventListener('click', () => fileInp.click()); fileInp.addEventListener('change', e => { if (e.target.files[0]) importProductsCSV(e.target.files[0]); e.target.value=''; }); }
    // Search wiring is handled by initInventoryModule() with full filter opts
    const body = document.getElementById('inv-body');
    if (body) body.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]'); if (!btn) return;
      const code = btn.dataset.code;
      if (btn.dataset.action === 'edit-prod') {
        const cur = CATALOG.find(x => x.code === code); if (!cur) return;
        const d = await promptProductForm(cur); if (d) await saveProduct(d, cur.id);
      } else if (btn.dataset.action === 'del-prod') {
        await deleteProduct(code, btn.dataset.id);
      } else if (btn.dataset.action === 'adjust-stock') {
        const cur = CATALOG.find(x => x.code === code); if (!cur) return;
        if (typeof openStockAdjustModal === 'function') openStockAdjustModal(cur);
      }
    });
    // Inventory module wiring
    if (typeof initInventoryModule === 'function') initInventoryModule();
    // Reports wiring
    if (typeof initReportsModule === 'function') initReportsModule();
    // Cuts wiring
    if (typeof initCutsModule === 'function') initCutsModule();
  });
  function renderClientes() {
    $('#cli-body').innerHTML = CUSTOMERS.map(c => `
      <tr>
        <td class="primary-col">${c[0]}</td>
        <td style="color: var(--text-3);">${c[1]}</td>
        <td class="num">${fmt(c[2])}</td>
        <td class="num" style="color: ${c[3]>0?'var(--danger)':'inherit'};">${fmt(c[3])}</td>
        <td class="num">${c[4]}</td>
        <td style="color: var(--text-3); font-size: 11px;">${c[5]}</td>
        <td style="text-align: right;"><button class="btn sm">Ver</button></td>
      </tr>`).join('');
    // 2026-05: mantener contador sincronizado en cada render — antes solo
    // se actualizaba dentro del fetch try-catch, dejando "0 clientes" si
    // CUSTOMERS se llenaba via otro path (volvix-real-data-loader, demo seed, etc.)
    var sub = document.getElementById('cli-sub');
    if (sub) sub.textContent = CUSTOMERS.length + ' clientes registrados';
  }
  function renderCredito() {
    // 2026-05: contador dinamico (era hardcoded "6 clientes con credito · $4,810")
    try {
      var sub = document.getElementById('cred-sub');
      if (sub) {
        var conCredito = CREDIT.filter(c => Number(c[2]) > 0).length;
        var totalDebt = CREDIT.reduce((acc, c) => acc + (Number(c[2]) || 0), 0);
        sub.textContent = conCredito + ' cliente' + (conCredito === 1 ? '' : 's') + ' con crédito · $' + totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' por cobrar';
      }
    } catch(_) {}
    $('#cred-body').innerHTML = CREDIT.map(c => {
      const chip = c[5]==='ok'?'ok':c[5]==='vencido'?'err':'warn';
      const lbl = c[5]==='ok'?'Al corriente':c[5]==='vencido'?'Vencido':'Sin abonos';
      return `<tr>
        <td class="primary-col">${c[0]}</td>
        <td class="num">${fmt(c[1])}</td>
        <td class="num" style="color: var(--danger); font-weight: 600;">${fmt(c[2])}</td>
        <td class="num" style="color: var(--success);">${fmt(c[3])}</td>
        <td style="color: var(--text-3); font-size: 11px;">${c[4]}</td>
        <td><span class="chip ${chip}"><span class="dot"></span>${lbl}</span></td>
        <td style="text-align: right;"><button class="btn sm">💵 Abonar</button></td>
      </tr>`;
    }).join('');
  }
  // 2026-05 adversarial fix A3+N2: escape para HTML attribute y text-content.
  // Antes solo se reemplazaba ' por \', dejando " < > etc. crudos. Si un sale_id
  // venia con caracteres raros (import malformado, attack), inyectaba HTML.
  function htmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function renderVentas() {
    $('#vnt-body').innerHTML = SALES.map(s => {
      const chip = s[6]==='completed'?'ok':'warn';
      const lbl = s[6]==='completed'?'Completada':'Devuelta';
      // 2026-05 ia-arquitectura R2 (flujo de tarea): el boton "Devolver" vive
      // dentro de cada venta en Historial, no como modulo separado en menubar.
      // Solo se muestra para ventas completed (no para las ya devueltas).
      // Doble escape: para el atributo (htmlEsc) y dentro del attr ya esta
      // protegido por las " del HTML.
      const sIdRaw = String(s[0]||'');
      const sIdAttr = htmlEsc(sIdRaw);
      const devolverBtn = s[6]==='completed'
        ? `<button class="btn sm" onclick="startDevolucionFromSale('${sIdAttr}')" title="Hacer devolucion de esta venta">↩️ Devolver</button>`
        : '';
      return `<tr>
        <td class="mono" style="font-weight: 600;">${htmlEsc(s[0])}</td>
        <td style="color: var(--text-3); font-size: 11px;">${htmlEsc(s[1])}</td>
        <td class="primary-col">${htmlEsc(s[2])}</td>
        <td style="color: var(--text-3);">${htmlEsc(s[3])}</td>
        <td><span class="chip">${htmlEsc(s[4])}</span></td>
        <td class="num" style="font-weight: 600;">${fmt(s[5])}</td>
        <td><span class="chip ${chip}"><span class="dot"></span>${lbl}</span></td>
        <td style="text-align: right;"><button class="btn sm" title="Ver detalle">👁️</button> ${devolverBtn}</td>
      </tr>`;
    }).join('');
  }
  // 2026-05 ia-arquitectura R2 (flujo de tarea): helper invocado desde "Devolver"
  // en cada fila de Historial. Reemplaza el modulo Devoluciones independiente
  // del menubar. Flujo:
  //   1. showScreen('devoluciones') — pantalla existente
  //   2. openNewReturnModal() — abre wizard de nueva devolucion
  //   3. Prefill #nr-search-input con el saleId
  //   4. Trigger newReturnSearchSales() para buscar la venta
  //
  // 2026-05 fix N1 adversarial: en lugar de setTimeout con delays hardcoded
  // (250ms total, frágil en dispositivos lentos), polling con limite de
  // intentos. Si tras N intentos el modal/input no aparecio, log + fail abierto.
  function startDevolucionFromSale(saleId) {
    var sid = String(saleId || '');
    if (!sid) return;
    if (typeof showScreen === 'function') {
      try { showScreen('devoluciones'); } catch (_) {}
    }
    // Poll para abrir modal: cada 50ms hasta 1.5s (30 intentos)
    var openAttempts = 0;
    var openIv = setInterval(function () {
      openAttempts++;
      if (openAttempts > 30) {
        clearInterval(openIv);
        try { console.warn('[startDevolucionFromSale] timeout abriendo modal'); } catch (_) {}
        return;
      }
      if (typeof openNewReturnModal === 'function' &&
          document.getElementById('screen-devoluciones') &&
          !document.getElementById('screen-devoluciones').classList.contains('hidden')) {
        clearInterval(openIv);
        try { openNewReturnModal(); } catch (_) {}
        // Poll para prefillear el input dentro del modal
        var inputAttempts = 0;
        var inputIv = setInterval(function () {
          inputAttempts++;
          if (inputAttempts > 30) {
            clearInterval(inputIv);
            try { console.warn('[startDevolucionFromSale] timeout prellenando input'); } catch (_) {}
            return;
          }
          var input = document.getElementById('nr-search-input');
          if (input) {
            clearInterval(inputIv);
            input.value = sid;
            try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
            try {
              if (typeof newReturnSearchSales === 'function') newReturnSearchSales();
            } catch (_) {}
          }
        }, 50);
      }
    }, 50);
  }
  window.startDevolucionFromSale = startDevolucionFromSale;
  function renderUsuarios() {
    // 2026-05: contador dinamico (era hardcoded "5 usuarios")
    var sub = document.getElementById('usr-sub');
    if (sub) sub.textContent = USERS.length + ' usuario' + (USERS.length === 1 ? '' : 's') + ' · permisos y roles';
    $('#usr-body').innerHTML = USERS.map(u => {
      const roleChip = u[1]==='Administrador'?'info':u[1]==='Gerente'?'accent':'ok';
      const ss = u[4]==='online'?'ok':'';
      return `<tr>
        <td><div style="display: flex; align-items: center; gap: 10px;"><div class="tb-btn perfil" style="pointer-events:none;"><div class="ava" style="width:26px;height:26px;font-size:9px;background:linear-gradient(135deg,#3B82F6,#1E40AF);">${u[0].substring(0,2).toUpperCase()}</div></div><strong>${u[0]}</strong></div></td>
        <td><span class="chip ${roleChip}">${u[1]}</span></td>
        <td style="color: var(--text-3); font-size: 11px;">${u[2]}</td>
        <td style="color: var(--text-3); font-size: 11px;">${u[3]}</td>
        <td><span class="chip ${ss}"><span class="dot"></span>${u[4]==='online'?'Activo':'Inactivo'}</span></td>
        <td style="text-align: right;"><button class="btn sm">Editar</button></td>
      </tr>`;
    }).join('');
  }
  function renderFFTree() {
    $('#ff-tree').innerHTML = FF_TREE.map(m => {
      const children = m.children ? `
        <div class="ff-children">
          ${m.children.map(c => `
            <div class="ff-child">
              <span class="lbl">${c.label}</span>
              ${c.hint ? `<span class="hint">${c.hint}</span>` : ''}
              <div class="toggle disabled ${c.on?'on':''}"></div>
            </div>
          `).join('')}
        </div>
      ` : '';
      return `<div class="ff-module">
        <div class="ff-module-head">
          <div class="ff-ico">${m.icon}</div>
          <div class="ff-module-title">
            <div class="name">${m.name} ${!m.on ? `<span class="chip" style="font-size: 9.5px; margin-left: 5px;">🔒 ${m.hint || 'No incluido'}</span>` : ''}</div>
            <div class="desc">${m.desc}</div>
          </div>
          <div class="toggle disabled ${m.on?'on':''}"></div>
        </div>
        ${children}
      </div>`;
    }).join('');
  }

  /* ============ CONFIG ============ */
  function showCfg(tab, btn) {
    $$('.config-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['general','negocio','impuestos','impresion','modulos','licencia','sync'].forEach(t => {
      const el = $('#cfg-' + t);
      if (el) el.classList.toggle('hidden', t !== tab);
    });
  }

  /* ============ QUICK POS ============ */
  let qpVal = '';
  function qpKey(k) {
    if (k === 'C') qpVal = '';
    else qpVal += k;
    $('#qp-display').textContent = qpVal ? ('$' + qpVal) : '$0.00';
  }

  /* ============ PLATFORM TOGGLE ============ */
  function selectPlatform(btn, plat) {
    $$('.platform-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showToast(`Vista ${plat.toUpperCase()} · previsualizando layout`);
  }

  /* ============ VISTA SWITCHER ============ */
  (function initVista() {
    var LABELS = { '1': 'Vista ①', '2': 'Vista ②', '3': 'Terminal' };
    function _applyVista(v) {
      document.body.setAttribute('data-vista', v);
      var label = LABELS[v] || 'Vista ' + v;
      var el = document.getElementById('vista-label');
      if (el) el.textContent = label;
      var fab = document.getElementById('vista-fab-label');
      if (fab) fab.textContent = label;
      try { localStorage.setItem('salvx_vista', v); } catch(_) {}
    }
    window.toggleVista = function() {
      var cur = parseInt(document.body.getAttribute('data-vista') || '1', 10);
      var next = cur >= 3 ? 1 : cur + 1;
      _applyVista(String(next));
      var names = { '1': 'Vista estándar', '2': 'Vista Loyverse (Verde)', '3': 'Terminal OXXO (Oscuro)' };
      showToast('🎨 ' + (names[String(next)] || 'Vista ' + next));
    };
    // Restore from localStorage
    try {
      var saved = localStorage.getItem('salvx_vista');
      if (saved && ['1','2','3'].includes(saved)) _applyVista(saved);
    } catch(_) {}
  })();

  /* ============ OWNER PANEL ============ */
  function openOwnerPanel() {
    showToast('Abriendo Volvix Core en nueva pestaña…');
    setTimeout(() => window.open('volvix-owner-panel.html', '_blank'), 300);
  }
  function openSyncPanel() {
    showToast('✓ Sincronizado · última sync hace 2 seg · 0 en cola');
  }
  function showLocked(name) {
    showToast(`🔒 "${name}" no está activo — solicítalo a tu proveedor`);
  }
  function openMasModulos() {
    showToast('Abriendo catálogo de módulos adicionales…');
  }

  /* ============ OFFLINE DETECTION ============ */
  /* R8a FIX-H2: banner ROJO persistente cuando offline + contador de queue + toast al recuperar */
  function __r8aGetQueueCount() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('volvix-db', 1);
        req.onerror = () => resolve(0);
        req.onsuccess = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains('queue')) { resolve(0); return; }
            const tx = db.transaction(['queue'], 'readonly');
            const store = tx.objectStore('queue');
            const cnt = store.count();
            cnt.onsuccess = () => resolve(cnt.result || 0);
            cnt.onerror = () => resolve(0);
          } catch (_) { resolve(0); }
        };
        // Si no se invoca onupgradeneeded, no falla
      } catch (_) { resolve(0); }
    });
  }
  async function __r8aRefreshQueueCount() {
    let count = 0;
    try { count = await __r8aGetQueueCount(); } catch (_) { count = 0; }
    // Fallback: localStorage queue (volvix:wiring:queue)
    if (count === 0) {
      try {
        const ls = JSON.parse(localStorage.getItem('volvix:wiring:queue') || '[]');
        if (Array.isArray(ls)) count = ls.length;
      } catch (_) {}
    }
    try {
      const el = document.getElementById('r8a-queue-count');
      if (el) el.textContent = String(count);
    } catch (_) {}
    return count;
  }
  function __r8aUpdateBannerAndIndicator(online) {
    const banner = document.getElementById('r8a-offline-banner');
    if (banner) banner.style.display = online ? 'none' : 'block';
    const ind = document.getElementById('sync-indicator');
    if (ind) {
      if (online) {
        ind.innerHTML = '<div class="dot"></div><span>EN LÍNEA</span>';
        ind.style.background = 'var(--success-soft)';
        ind.style.color = '#166534';
      } else {
        ind.innerHTML = '<div class="dot" style="background:var(--warn);"></div><span>OFFLINE</span>';
        ind.style.background = 'var(--warn-soft)';
        ind.style.color = '#854D0E';
      }
    }
    // Reservar espacio en body para no tapar el topbar
    try { document.body.style.paddingTop = online ? '' : '40px'; } catch (_) {}
  }
  let __r8aSyncInProgress = false;
  let __r8aSyncStartCount = 0;
  window.addEventListener('online', async () => {
    __r8aUpdateBannerAndIndicator(true);
    const startCount = await __r8aRefreshQueueCount();
    __r8aSyncStartCount = startCount;
    if (startCount > 0) {
      showToast('✓ Conexión restaurada. Sincronizando ' + startCount + ' venta(s)…');
      __r8aSyncInProgress = true;
      // Esperar a que sw.js procese la queue. Polling 5s x 12 = 60s max.
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const remaining = await __r8aRefreshQueueCount();
        if (remaining === 0 || tries > 12) {
          clearInterval(poll);
          const synced = startCount - remaining;
          const failed = remaining;
          if (synced > 0 || failed > 0) {
            const msg = '✓ ' + synced + ' venta(s) sincronizada(s)' +
              (failed > 0 ? '. ' + failed + ' fallaron (revisar)' : '.');
            try { showToast(msg); } catch (_) {}
          }
          __r8aSyncInProgress = false;
        }
      }, 5000);
    } else {
      showToast('✓ Conexión restablecida');
    }
  });
  window.addEventListener('offline', async () => {
    __r8aUpdateBannerAndIndicator(false);
    await __r8aRefreshQueueCount();
    showToast('⚠ Sin internet · sigues cobrando, se sincronizará al volver');
  });
  // Inicializar al cargar + actualizar contador cada 10s mientras estamos offline
  document.addEventListener('DOMContentLoaded', () => {
    try {
      __r8aUpdateBannerAndIndicator(navigator.onLine !== false);
      __r8aRefreshQueueCount();
    } catch (_) {}
  });
  setInterval(() => {
    // Mientras estemos offline o haya items en queue, refrescar contador
    if (navigator.onLine === false || __r8aSyncInProgress) {
      __r8aRefreshQueueCount();
    }
  }, 10000);

  /* ============ KEYBOARD SHORTCUTS ============ */
  // R7b FIX-N3 CONSOLIDATED: este es el UNICO keydown listener de atajos globales.
  // Antes habia 2 listeners independientes (este + uno en linea ~5048) ambos bindeando
  // F12 -> openPayment(), causando que cada press disparara 2 cobros. Ahora todos los
  // atajos viven aqui (F1-F4, F5, F9, F11, F12, Escape). NO duplicar.
  document.addEventListener('keydown', (e) => {
    // Si login esta visible, ignorar atajos
    if ($('#login-screen') && !$('#login-screen').classList.contains('hidden')) return;
    // Si el usuario esta tipeando en input/textarea/select, no interceptar
    // (respeta el guard del listener antiguo de linea 5048 que tambien excluia inputs)
    const _typing = e.target && e.target.matches && e.target.matches('input, textarea, select');
    // 2026-05 audit B-22: F2 y F12 ya no comparten openPayment(). F2 ahora va
    // a Créditos (pantalla que la UI prometía) y F12 mantiene Cobrar.
    if (e.key === 'F1') { e.preventDefault(); showScreen('pos'); }
    if (e.key === 'F2') { e.preventDefault(); if (typeof showScreen === 'function') showScreen('credito'); }
    if (e.key === 'F3') { e.preventDefault(); showScreen('inventario'); }
    if (e.key === 'F4') { e.preventDefault(); showScreen('kardex'); }
    if (!_typing && e.key === 'F5') { e.preventDefault(); if (typeof openSearch === 'function') openSearch(); }
    if (!_typing && e.key === 'F9') { e.preventDefault(); if (typeof openCalc === 'function') openCalc(); }
    if (!_typing && e.key === 'F11') { e.preventDefault(); if (typeof applyDiscount === 'function') applyDiscount(); }
    // F12 = Cobrar (calculadora con billetes / EXACTO / cambio).
    if (e.key === 'F12' && !$('#screen-pos').classList.contains('hidden')) { e.preventDefault(); openPayment(); }
    // R8a FIX-H3: Ctrl+M → búsqueda manual fallback (cuando scanner falla)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      if (typeof r8aOpenManualSearch === 'function') r8aOpenManualSearch(true);
    }
    if (e.key === 'Escape') { $$('.modal-backdrop.open').forEach(m => m.classList.remove('open')); }
  });

  /* ============ R8a FIX-H3: BÚSQUEDA MANUAL FALLBACK ============
     Cuando el lector de códigos falla, el cajero queda atorado.
     Este handler reusa el modal-search existente (con typo-tolerance R1)
     pero lo etiqueta como "manual" para audit + telemetry. */
  window.r8aOpenManualSearch = function (fromShortcut) {
    try {
      // Re-usar modal de búsqueda existente
      if (typeof openSearch === 'function') {
        openSearch();
      } else {
        // Fallback si openSearch no existe aún
        const m = document.getElementById('modal-search');
        if (m) m.classList.add('open');
      }
      // Telemetry: notificar al server que el cajero usó fallback manual
      try {
        const tok = (typeof getToken === 'function' ? getToken() : '') ||
                    (window.session && window.session.token) ||
                    localStorage.getItem('volvix_token') || '';
        if (tok && navigator.onLine !== false) {
          fetch('/api/audit/manual-search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + tok
            },
            body: JSON.stringify({
              search_term: '',
              scanner_unavailable: !!fromShortcut,
              source: fromShortcut ? 'ctrl_m_shortcut' : 'manual_button'
            })
          }).catch(() => {});
        }
      } catch (_) {}
      try { showToast('🔍 Búsqueda manual activa (lector inactivo)'); } catch (_) {}
    } catch (err) { console.warn('[r8a manual search]', err); }
  };
  // ============ /R8a FIX-H3 ============

  /* ============ R10a NIVEL 1 REAL-TIME: 5 escenarios cada minuto ============
     FIX-N1-1: Pagos pendientes de reconciliacion con banco
     FIX-N1-3: Estado del papel + cola de tickets
     FIX-N1-5: Buscar venta del cliente (1 click)
     El guard global __volvixSaleInFlight ya esta en completePay/quickPosCobrar.
     Aqui agregamos: helper unificado, modales y telemetry. */

  // Helper auth-fetch para R10a (re-usa el patron de R8a pero centralizado)
  function __r10aAuthFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var token = (window.VolvixAuth && window.VolvixAuth.getToken && window.VolvixAuth.getToken())
      || localStorage.getItem('volvix_token')
      || localStorage.getItem('volvixAuthToken')
      || (window.session && window.session.token)
      || '';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(path, Object.assign({}, opts, { headers: headers }));
  }

  // ============ R10a FIX-N1-2: Doble-clic guard reforzado ============
  // El guard global __volvixSaleInFlight ya cubre completePay() y quickPosCobrar()
  // (ver R7b FIX-S2). Aqui agregamos un AUDIT cuando el guard bloquea para detectar
  // intentos de doble-click en produccion (telemetry).
  window.__r10aAuditDoubleClick = function (where) {
    try {
      __r10aAuthFetch('/api/audit/manual-search', {
        method: 'POST',
        body: JSON.stringify({
          search_term: '',
          source: 'r10a_double_click_blocked_' + (where || 'unknown'),
          scanner_unavailable: false
        })
      }).catch(function () {});
    } catch (_) {}
  };
  // Hook el guard: cuando se setea a true por segunda vez, registramos.
  (function () {
    var _flag = false;
    Object.defineProperty(window, '__volvixSaleInFlight', {
      get: function () { return _flag; },
      set: function (v) {
        if (_flag === true && v === true) {
          // Re-set while already in-flight = double-click attempt
          try { window.__r10aAuditDoubleClick('reset_while_inflight'); } catch (_) {}
        }
        _flag = !!v;
      },
      configurable: true
    });
  })();

  // ============ R10a FIX-N1-1: Pagos pendientes con banco ============
  // Cuando una venta con tarjeta hace timeout >10s sin respuesta del PSP,
  // se registra en pos_payment_pending_reconciliation. UI permite verificar
  // y NO permite cobrar de nuevo hasta confirmar.
  window.r10aRegisterPendingPay = async function (saleData, terminalRef) {
    try {
      var r = await __r10aAuthFetch('/api/payments/pending', {
        method: 'POST',
        body: JSON.stringify({
          amount: saleData.total,
          payment_method: saleData.payment_method || 'tarjeta',
          terminal_ref: terminalRef || null,
          psp_provider: saleData.psp_provider || null,
          cart_payload: { items: saleData.items || [] },
          sale_id: saleData.sale_id || null
        })
      });
      var data = await r.json();
      return data;
    } catch (err) {
      console.warn('[r10a] pending pay register failed', err);
      return { ok: false, error: String(err && err.message || err) };
    }
  };

  window.r10aCheckPending = async function (pendingId) {
    try {
      var r = await __r10aAuthFetch('/api/payments/check-pending/' + encodeURIComponent(pendingId), {
        method: 'POST', body: '{}'
      });
      return await r.json();
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  };

  window.r10aOpenPendingPay = async function () {
    try {
      var r = await __r10aAuthFetch('/api/payments/pending');
      var data = await r.json();
      var items = (data && data.items) || [];
      var html = '';
      if (!items.length) {
        html = '<p style="text-align:center;padding:20px;">No hay pagos pendientes de reconciliacion.</p>';
      } else {
        html = '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:2px solid #ddd;">Hora</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:2px solid #ddd;">Monto</th>' +
          '<th style="text-align:left;padding:6px;border-bottom:2px solid #ddd;">Ref Terminal</th>' +
          '<th style="text-align:center;padding:6px;border-bottom:2px solid #ddd;">Intentos</th>' +
          '<th style="text-align:center;padding:6px;border-bottom:2px solid #ddd;">Accion</th>' +
          '</tr></thead><tbody>';
        items.forEach(function (it) {
          var hora = new Date(it.requested_at).toLocaleTimeString();
          html += '<tr>' +
            '<td style="padding:6px;border-bottom:1px solid #eee;">' + hora + '</td>' +
            '<td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">$' + Number(it.amount).toFixed(2) + '</td>' +
            '<td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">' + (it.terminal_ref || '-') + '</td>' +
            '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">' + (it.attempts || 0) + '/10</td>' +
            '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">' +
            '<button class="btn primary" onclick="r10aManualVerify(\'' + it.id + '\')" style="padding:4px 10px;">Verificar ahora</button>' +
            '</td></tr>';
        });
        html += '</tbody></table>';
      }
      r10aShowModal('Pagos pendientes con banco', '<p style="background:#FEF3C7;padding:10px;border-radius:6px;border-left:4px solid #F59E0B;"><strong>NO cobres de nuevo hasta verificar.</strong> El cliente NO debe pagar dos veces. El sistema reconcilia automaticamente cada 60s.</p>' + html);
    } catch (err) {
      showToast('Error al cargar pendientes: ' + (err.message || err), 'error');
    }
  };

  window.r10aManualVerify = async function (pendingId) {
    try {
      var data = await r10aCheckPending(pendingId);
      if (data.ok) {
        if (data.outcome === 'paid') {
          showToast('Pago CONFIRMADO por el banco. Venta materializada.');
        } else if (data.outcome === 'failed') {
          showToast('Pago RECHAZADO por el banco. NO se cobro.', 'error');
        } else {
          showToast('Aun pendiente. Sigue intentando o espera 60s.');
        }
        setTimeout(r10aOpenPendingPay, 800); // refresh modal
      } else {
        showToast('Error: ' + (data.error || 'unknown'), 'error');
      }
    } catch (err) { showToast('Error al verificar: ' + err.message, 'error'); }
  };

  // Refrescar badge cada 60s
  async function __r10aRefreshPendingBadge() {
    try {
      var r = await __r10aAuthFetch('/api/payments/pending');
      var data = await r.json();
      var n = (data && data.count) || 0;
      var btn = document.getElementById('r10a-tb-pending-pay');
      var bdg = document.getElementById('r10a-pending-pay-badge');
      if (btn) btn.style.display = n > 0 ? '' : 'none';
      if (bdg) {
        bdg.style.display = n > 0 ? '' : 'none';
        bdg.textContent = String(n);
      }
    } catch (_) {}
  }
  setTimeout(__r10aRefreshPendingBadge, 5000);
  setInterval(__r10aRefreshPendingBadge, 60000);

  // ============ R10a FIX-N1-3: Cola de tickets ============
  window.r10aOpenPrintQueue = async function () {
    try {
      var r = await __r10aAuthFetch('/api/print-queue');
      var data = await r.json();
      var items = (data && data.items) || [];
      var paperStatus = (data && data.paper_status) || 'unknown';
      var paperBanner = '';
      if (paperStatus === 'out') {
        paperBanner = '<p style="background:#FEE2E2;padding:10px;border-radius:6px;border-left:4px solid #DC2626;"><strong>SIN PAPEL.</strong> Pon papel y pulsa "Reintentar" en cada ticket.</p>';
      } else if (paperStatus === 'low') {
        paperBanner = '<p style="background:#FEF3C7;padding:10px;border-radius:6px;border-left:4px solid #F59E0B;"><strong>Papel bajo.</strong> Cambia el rollo pronto.</p>';
      } else if (paperStatus === 'ok') {
        paperBanner = '<p style="background:#D1FAE5;padding:10px;border-radius:6px;border-left:4px solid #10B981;">Papel OK.</p>';
      }
      var html = paperBanner;
      if (!items.length) {
        html += '<p style="text-align:center;padding:20px;">Cola vacia. No hay tickets pendientes.</p>';
      } else {
        html += '<p>Tickets pendientes de imprimir (en orden):</p>';
        html += '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
          '<th style="text-align:left;padding:6px;">Hora</th>' +
          '<th style="text-align:left;padding:6px;">Sale</th>' +
          '<th style="text-align:center;padding:6px;">Intentos</th>' +
          '<th style="text-align:center;padding:6px;">Accion</th>' +
          '</tr></thead><tbody>';
        items.forEach(function (it) {
          html += '<tr>' +
            '<td style="padding:6px;">' + new Date(it.enqueued_at).toLocaleTimeString() + '</td>' +
            '<td style="padding:6px;font-family:monospace;font-size:11px;">' + (it.sale_id || '-') + '</td>' +
            '<td style="padding:6px;text-align:center;">' + (it.attempts || 0) + '</td>' +
            '<td style="padding:6px;text-align:center;">' +
            '<button class="btn success" onclick="r10aRetryPrint(\'' + it.id + '\')" style="padding:4px 10px;">Reintentar</button>' +
            '</td></tr>';
        });
        html += '</tbody></table>';
      }
      r10aShowModal('Cola de impresion', html);
    } catch (err) { showToast('Error: ' + (err.message || err), 'error'); }
  };

  window.r10aRetryPrint = async function (queueId) {
    try {
      var r = await __r10aAuthFetch('/api/print-queue/' + encodeURIComponent(queueId) + '/retry', {
        method: 'POST', body: JSON.stringify({ success: true })
      });
      var data = await r.json();
      if (data.ok) {
        showToast('Ticket marcado como impreso');
        setTimeout(r10aOpenPrintQueue, 500);
      } else { showToast('Error: ' + (data.error || ''), 'error'); }
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  // Encolar un ticket cuando print falla
  window.r10aQueueTicket = async function (saleId, ticketPayload, errorMsg) {
    try {
      await __r10aAuthFetch('/api/print-queue', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: saleId,
          ticket_payload: ticketPayload || {},
          last_error: errorMsg || 'paper_out'
        })
      });
      // Telemetry: register paper_status='out' if we suspect that
      await __r10aAuthFetch('/api/print-log/paper-status', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: saleId,
          paper_status: /paper.*out|sin papel/i.test(errorMsg || '') ? 'out' : 'unknown',
          event: 'failed',
          error_msg: errorMsg
        })
      });
      __r10aRefreshPrintQueueBadge();
    } catch (_) {}
  };

  // Refrescar badge cola cada 30s
  async function __r10aRefreshPrintQueueBadge() {
    try {
      var r = await __r10aAuthFetch('/api/print-queue');
      var data = await r.json();
      var n = (data && data.count) || 0;
      var paperStatus = (data && data.paper_status) || 'unknown';
      var btn = document.getElementById('r10a-tb-print-queue');
      var bdg = document.getElementById('r10a-print-queue-badge');
      if (btn) btn.style.display = (n > 0 || paperStatus === 'out') ? '' : 'none';
      if (bdg) {
        bdg.style.display = n > 0 ? '' : 'none';
        bdg.textContent = String(n);
      }
      if (paperStatus === 'out' && n > 0 && !window.__r10aPaperWarned) {
        window.__r10aPaperWarned = true;
        showToast('Sin papel. ' + n + ' tickets en cola. Pon papel y reintentar.', 'error');
      }
    } catch (_) {}
  }
  setTimeout(__r10aRefreshPrintQueueBadge, 6000);
  setInterval(__r10aRefreshPrintQueueBadge, 30000);

  // ============ R10a FIX-N1-5: Buscar venta del cliente ============
  // Reusa el endpoint R8c GET /api/sales/search con criterios laxos
  window.r10aOpenFindSale = function () {
    var html = '' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;">' +
      '<div><label style="display:block;font-size:12px;color:#666;">Monto aproximado</label>' +
      '<input type="number" id="r10a-find-amount" step="0.01" placeholder="Ej: 250.00" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"></div>' +
      '<div><label style="display:block;font-size:12px;color:#666;">Tolerancia ($)</label>' +
      '<input type="number" id="r10a-find-tolerance" step="0.01" value="5" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"></div>' +
      '<div><label style="display:block;font-size:12px;color:#666;">Fecha (YYYY-MM-DD)</label>' +
      '<input type="date" id="r10a-find-date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"></div>' +
      '<div><label style="display:block;font-size:12px;color:#666;">Ultimos 4 digitos tarjeta</label>' +
      '<input type="text" id="r10a-find-card" maxlength="4" pattern="[0-9]{0,4}" placeholder="1234" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"></div>' +
      '<div style="grid-column:span 2;"><label style="display:block;font-size:12px;color:#666;">Nombre cliente (opcional)</label>' +
      '<input type="text" id="r10a-find-customer" placeholder="Nombre o teléfono" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"></div>' +
      '</div>' +
      '<button class="btn primary" onclick="r10aDoFindSale()" style="width:100%;padding:10px;">Buscar venta</button>' +
      '<div id="r10a-find-results" style="margin-top:15px;"></div>';
    r10aShowModal('Buscar venta del cliente', html);
  };

  window.r10aDoFindSale = async function () {
    try {
      var amount = parseFloat(document.getElementById('r10a-find-amount').value);
      var tolerance = parseFloat(document.getElementById('r10a-find-tolerance').value) || 5;
      var dateStr = document.getElementById('r10a-find-date').value;
      var card = (document.getElementById('r10a-find-card').value || '').trim();
      var customer = (document.getElementById('r10a-find-customer').value || '').trim();
      var qs = '?approximate=true&limit=20';
      if (Number.isFinite(amount)) {
        qs += '&total_min=' + (amount - tolerance) + '&total_max=' + (amount + tolerance);
      }
      if (dateStr) {
        qs += '&date_from=' + encodeURIComponent(dateStr) + '&date_to=' + encodeURIComponent(dateStr);
      }
      if (card.length === 4 && /^\d{4}$/.test(card)) qs += '&card_last4=' + encodeURIComponent(card);
      if (customer) qs += '&q=' + encodeURIComponent(customer);
      var r = await __r10aAuthFetch('/api/sales/search' + qs);
      var data = await r.json();
      var resDiv = document.getElementById('r10a-find-results');
      var items = (data && data.items) || (data && data.results) || [];
      if (!items.length) {
        resDiv.innerHTML = '<p style="background:#FEF3C7;padding:10px;border-radius:6px;border-left:4px solid #F59E0B;"><strong>No tengo registro de esa venta.</strong> Pide al cliente el ticket o un comprobante. Si insiste, llama al gerente.</p>';
        return;
      }
      var html = '<p style="color:#10B981;"><strong>Posibles coincidencias (' + items.length + '):</strong></p>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>' +
        '<th style="padding:6px;text-align:left;">Folio</th>' +
        '<th style="padding:6px;text-align:left;">Hora</th>' +
        '<th style="padding:6px;text-align:right;">Monto</th>' +
        '<th style="padding:6px;text-align:left;">Pago</th>' +
        '<th style="padding:6px;text-align:center;">Detalle</th>' +
        '</tr></thead><tbody>';
      items.forEach(function (s) {
        var hora = s.created_at ? new Date(s.created_at).toLocaleString() : '-';
        html += '<tr>' +
          '<td style="padding:6px;border-top:1px solid #eee;font-family:monospace;font-size:11px;">' + (s.folio || s.id || '-') + '</td>' +
          '<td style="padding:6px;border-top:1px solid #eee;">' + hora + '</td>' +
          '<td style="padding:6px;border-top:1px solid #eee;text-align:right;">$' + Number(s.total || 0).toFixed(2) + '</td>' +
          '<td style="padding:6px;border-top:1px solid #eee;">' + (s.payment_method || '-') + '</td>' +
          '<td style="padding:6px;border-top:1px solid #eee;text-align:center;">' +
          '<button class="btn ghost" onclick="r10aShowSaleDetail(\'' + (s.id || '') + '\')">Ver</button>' +
          '</td></tr>';
      });
      html += '</tbody></table>';
      resDiv.innerHTML = html;
    } catch (err) {
      var resDiv = document.getElementById('r10a-find-results');
      if (resDiv) resDiv.innerHTML = '<p style="color:#DC2626;">Error: ' + err.message + '</p>';
    }
  };

  window.r10aShowSaleDetail = async function (saleId) {
    try {
      var r = await __r10aAuthFetch('/api/sales/' + encodeURIComponent(saleId));
      var data = await r.json();
      var sale = data && (data.sale || data);
      if (!sale) { showToast('No se encontro la venta'); return; }
      var items = sale.items || [];
      var rows = items.map(function (i) {
        return '<tr><td style="padding:4px;border-bottom:1px solid #eee;">' + (i.name || i.code || '-') +
          '</td><td style="padding:4px;text-align:center;">' + (i.qty || 1) +
          '</td><td style="padding:4px;text-align:right;">$' + Number(i.price || 0).toFixed(2) + '</td></tr>';
      }).join('');
      var html = '<div style="border:1px solid #ddd;padding:15px;border-radius:6px;font-family:monospace;font-size:13px;">' +
        '<p><strong>Folio:</strong> ' + (sale.folio || sale.id) + '</p>' +
        '<p><strong>Fecha:</strong> ' + new Date(sale.created_at).toLocaleString() + '</p>' +
        '<p><strong>Pago:</strong> ' + (sale.payment_method || '-') + '</p>' +
        '<table style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr><th style="text-align:left;padding:4px;">Producto</th><th style="text-align:center;padding:4px;">Cant</th><th style="text-align:right;padding:4px;">Precio</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<p style="text-align:right;margin-top:10px;"><strong>TOTAL: $' + Number(sale.total || 0).toFixed(2) + '</strong></p>' +
        '</div>' +
        '<p style="margin-top:15px;text-align:center;color:#10B981;"><strong>Muestra esto al cliente.</strong> Confirma fecha, hora, productos y total.</p>';
      r10aShowModal('Detalle de venta ' + (sale.folio || sale.id), html);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  // Helper modal para R10a (re-usa modal-pay style si existe, fallback a uno propio)
  function r10aShowModal(title, htmlBody) {
    var existing = document.getElementById('r10a-modal');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'r10a-modal';
    m.className = 'modal-backdrop open';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    m.innerHTML = '<div class="modal" style="background:white;max-width:720px;width:90vw;max-height:85vh;overflow:auto;border-radius:12px;padding:0;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="padding:15px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">' +
      '<h3 style="margin:0;font-size:16px;">' + title + '</h3>' +
      '<button onclick="document.getElementById(\'r10a-modal\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999;">&times;</button>' +
      '</div>' +
      '<div style="padding:20px;">' + htmlBody + '</div></div>';
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }

  /* ============ R8a FIX-H5: CAJÓN MANUAL CON PIN AUTORIZADO ============
     Cuando el cajón eléctrico no abre (USB falla, papel atorado, no configurado),
     pedir PIN del owner del tenant para abrir manualmente y registrar todo.
     Tabla: pos_drawer_log (tenant_id, sale_id, user_id, event, requested_at,
     opened_at, manual_pin_used, authorized_by, reason). */
  async function __r8aLogDrawer(payload) {
    try {
      const tok = (typeof getToken === 'function' ? getToken() : '') ||
                  (window.session && window.session.token) ||
                  localStorage.getItem('volvix_token') || '';
      if (!tok) return;
      await fetch('/api/drawer/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(payload || {})
      }).catch(() => {});
    } catch (_) {}
  }
  async function __r8aTryOpenDrawerESCPOS(saleId) {
    // ESC/POS pulse para abrir cajón: ESC p m t1 t2  (m=0, t1=t2=50ms)
    try {
      const tok = (typeof getToken === 'function' ? getToken() : '') ||
                  (window.session && window.session.token) ||
                  localStorage.getItem('volvix_token') || '';
      const ESC = '\x1B';
      const cmd = ESC + 'p' + '\x00' + '\x32' + '\x32'; // pulse pin 2
      const r = await fetch('/api/printer/raw', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
        body: JSON.stringify({
          printer_id: 'default',
          payload: btoa(unescape(encodeURIComponent(cmd))),
          encoding: 'base64',
          format: 'escpos',
          sale_id: saleId || null,
          drawer_pulse: true
        })
      });
      return r.ok;
    } catch (_) { return false; }
  }
  async function __r8aPromptManualPin(saleId, lastError) {
    let pin = null;
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      try {
        const res = await window.VolvixUI.form({
          title: '⚠️ Cajón no respondió',
          description: 'Ingresar PIN del owner para apertura manual autorizada. ' + (lastError ? '(' + lastError + ')' : ''),
          size: 'sm',
          fields: [
            { name: 'pin', type: 'password', label: 'PIN del owner (4–6 dígitos)', required: true, pattern: '^\\d{4,6}$', placeholder: '••••', maxlength: 6 },
            { name: 'reason', type: 'text', label: 'Motivo (opcional)', placeholder: 'Ej: cajón no abrió en cobro' }
          ],
          submitText: 'Abrir manualmente',
          cancelText: 'Cancelar'
        });
        if (!res) return null;
        pin = res.pin;
        return { pin: pin, reason: res.reason || null };
      } catch (_) {}
    }
    pin = prompt('Cajón no respondió. PIN de apertura manual (4–6 dígitos):');
    if (!pin) return null;
    return { pin: String(pin), reason: null };
  }
  // Función pública: intenta abrir cajón. Si falla → modal PIN. Audit en pos_drawer_log.
  window.r8aOpenCashDrawer = async function (saleId) {
    try {
      // Verificar setting "Abrir cajón al cobrar" — si está apagado, no hacer nada
      // (best-effort: chequear toggle en config si existe)
      let opened = false;
      // Primer intento auto
      const auto = await __r8aTryOpenDrawerESCPOS(saleId);
      if (auto) {
        await __r8aLogDrawer({ event: 'auto_opened', sale_id: saleId, printer_id: 'default' });
        return { ok: true, manual: false };
      }
      // Auto falló → log + pedir PIN
      await __r8aLogDrawer({ event: 'auto_failed', sale_id: saleId, error_msg: 'printer_unavailable_or_no_drawer', printer_id: 'default' });
      const pinRes = await __r8aPromptManualPin(saleId, 'cajón no respondió');
      if (!pinRes || !pinRes.pin) {
        await __r8aLogDrawer({ event: 'cancelled', sale_id: saleId, reason: 'user_cancelled_pin_prompt' });
        try { showToast('Apertura de cajón cancelada'); } catch (_) {}
        return { ok: false, manual: false, cancelled: true };
      }
      // Intentar verificar PIN en server
      const tok = (typeof getToken === 'function' ? getToken() : '') ||
                  (window.session && window.session.token) ||
                  localStorage.getItem('volvix_token') || '';
      if (!tok) {
        try { showToast('Sesión expirada — vuelve a iniciar sesión'); } catch (_) {}
        return { ok: false, manual: false };
      }
      const r = await fetch('/api/drawer/manual-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ pin: pinRes.pin, sale_id: saleId, reason: pinRes.reason })
      });
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        if (body && body.drawer_opened) {
          try { showToast('✓ Cajón abierto manualmente (autorizado: ' + (body.authorized_by || 'owner') + ')'); } catch (_) {}
          // Log YA registrado en server, no duplicar
          return { ok: true, manual: true, authorized_by: body.authorized_by };
        }
      }
      let errBody = null; try { errBody = await r.json(); } catch (_) {}
      if (r.status === 401 || (errBody && errBody.error === 'invalid_pin')) {
        try { showToast('⚠ PIN inválido — apertura denegada'); } catch (_) {}
        return { ok: false, manual: false, denied: true };
      }
      try { showToast('Error apertura cajón: ' + ((errBody && errBody.error) || ('HTTP ' + r.status))); } catch (_) {}
      return { ok: false, manual: false };
    } catch (err) {
      console.error('[r8a drawer]', err);
      try { await __r8aLogDrawer({ event: 'auto_failed', sale_id: saleId, error_msg: (err && err.message) || String(err) }); } catch (_) {}
      return { ok: false, manual: false, error: err };
    }
  };
  // ============ /R8a FIX-H5 ============

  /* ============ CATEGORÍAS Y QUICK-PICK ============ */
  function renderCategories() {
    $('#cat-list').innerHTML = CATEGORIES.map(c => `
      <button class="cat-item ${c.key === selectedCategory ? 'active' : ''}" data-cat="${c.key}" onclick="selectCategory('${c.key}')">
        <span class="ico">${c.icon}</span>
        <span>${c.name}</span>
      </button>
    `).join('');
  }
  function selectCategory(key) {
    selectedCategory = key;
    renderCategories();
    renderQuickPick();
  }
  function renderQuickPick() {
    const items = QUICKPICK.filter(p => p.cat === selectedCategory);
    $('#qp-grid').innerHTML = items.length === 0
      ? '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--text-3); font-size: 11.5px;">Sin productos en esta categoría</div>'
      : items.map(p => `
        <button class="qp-card" onclick="addQuickPick('${p.code}')" aria-label="${p.name} - ${fmt(p.price)}" title="${p.name} - ${fmt(p.price)}">
          <div class="qp-icon">${p.icon}</div>
          <div class="qp-name">${p.name}</div>
          <div class="qp-price">${fmt(p.price)}</div>
        </button>
      `).join('');
  }
  function addQuickPick(code) {
    const p = QUICKPICK.find(x => x.code === code);
    if (!p) return;
    const existing = CART.find(c => c.code === code);
    if (existing) existing.qty++;
    else CART.push({code:p.code, name:p.name, price:p.price, qty:1, stock:p.stock});
    renderCart();
    // Cerrar panel en móvil después de agregar
    if (window.innerWidth < 880) {
      $('#pos-sidebar-right').classList.remove('open');
    }
  }
  function togglePosSidebar() {
    $('#pos-sidebar-right').classList.toggle('open');
  }

  /* ============ INIT ============ */
  window.addEventListener('DOMContentLoaded', () => {
    renderCart();
    renderInv();
    renderClientes();
    renderCredito();
    renderVentas();
    renderUsuarios();
    renderFFTree();
    renderCategories();
    renderQuickPick();
    // Aplicar estado del tenant (controlado por el dueño del sistema)
    VOLVIX.applyState(VOLVIX.getState());
    setTimeout(() => $('#barcode-input')?.focus(), 200);
  });

  /* ============ MODAL ACTIONS ============ */

  // BUSCAR
  function openSearch() {
    $('#modal-search').classList.add('open');
    $('#search-input').value = '';
    filterSearch();
    setTimeout(() => $('#search-input').focus(), 100);
  }
  function filterSearch() {
    const q = ($('#search-input').value || '').toLowerCase();
    const results = CATALOG.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
    // R7b FIX-V3: escapar p.name, p.code (vienen de CATALOG que carga del server)
    $('#search-results').innerHTML = results.length === 0
      ? '<div style="padding:30px;text-align:center;color:var(--text-3);font-size:13px;">Sin resultados</div>'
      : results.slice(0, 50).map(p => `
        <div onclick="pickSearchResult('${escapeAttr(p.code||'')}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:10px;align-items:center;" onmouseover="this.style.background='var(--accent-soft)'" onmouseout="this.style.background=''">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${escapeHtml(p.name||'')}</div>
            <div style="font-family:monospace;font-size:11px;color:var(--text-3);">${escapeHtml(p.code||'')} · Stock: ${Number(p.stock)||0}</div>
          </div>
          <div style="font-weight:700;color:var(--accent);">${fmt(p.price)}</div>
        </div>
      `).join('');
  }
  function pickSearchResult(code) {
    const p = CATALOG.find(x => x.code === code);
    if (p) {
      const existing = CART.find(c => c.code === code);
      if (existing) existing.qty++;
      else CART.push({ ...p, qty: 1 });
      renderCart();
      showToast('+ ' + p.name);
    }
    closeModal('modal-search');
  }

  // DESCUENTO
  async function applyDiscount() {
    if (CART.length === 0) { showToast('El ticket está vacío'); return; }
    let pctNum = null;
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      const r = await window.VolvixUI.form({
        title: 'Aplicar descuento al ticket',
        description: 'Se aplicará a todos los artículos del carrito',
        size: 'sm',
        fields: [
          { name: 'pct', type: 'number', label: 'Descuento (%)', required: true, min: 0, max: 100, step: 0.01, suggestions: [5, 10, 15, 20], placeholder: 'Ej: 10' }
        ],
        submitText: 'Aplicar'
      });
      if (!r) return;
      pctNum = parseFloat(r.pct);
    } else {
      const pct = prompt('¿Qué descuento aplicar al ticket completo? (%)');
      if (pct === null) return;
      pctNum = parseFloat(pct);
    }
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      showToast('Descuento inválido');
      return;
    }
    CART.forEach(item => {
      item.originalPrice = item.originalPrice || item.price;
      item.price = item.originalPrice * (1 - pctNum / 100);
      item.discount = pctNum;
    });
    renderCart();
    showToast('✓ Descuento del ' + pctNum + '% aplicado');
  }

  // ARTÍCULOS VARIOS
  async function openVarios() {
    const items = [
      { name: 'Bolsa extra', price: 3 },
      { name: 'Hielo', price: 15 },
      { name: 'Servicio', price: 20 },
      { name: 'Otro', price: 0 },
    ];
    let item = null;
    let price = 0;
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      const r = await window.VolvixUI.form({
        title: 'Artículo vario',
        size: 'sm',
        fields: [
          { name: 'sel', type: 'radio', label: 'Tipo', required: true, default: '0',
            options: items.map((i, idx) => ({ value: String(idx), label: i.name + ' — ' + fmt(i.price) })) },
          { name: 'customPrice', type: 'number', label: 'Precio personalizado (sólo si "Otro")', required: false, min: 0, step: 0.01, hint: 'Déjalo vacío salvo que selecciones "Otro"' }
        ],
        submitText: 'Agregar'
      });
      if (!r) return;
      const idx = parseInt(r.sel, 10);
      if (isNaN(idx) || !items[idx]) return;
      item = items[idx];
      price = item.price;
      if (price === 0) {
        price = parseFloat(r.customPrice);
        if (isNaN(price) || price <= 0) { showToast('Precio inválido','error'); return; }
      }
    } else {
      const list = items.map((i, idx) => `${idx+1}. ${i.name} (${fmt(i.price)})`).join('\n');
      let sel;
      if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
        const rs = await window.VolvixUI.form({
          title: 'Artículo vario',
          description: list,
          size: 'sm',
          fields: [{ name: 'n', type: 'number', label: 'Número', required: true, min: 1, step: 1 }],
          submitText: 'Seleccionar'
        });
        if (!rs) return;
        sel = rs.n;
      } else {
        sel = window.prompt('Seleccionar artículo vario:\n' + list + '\n\nEscribe el número:');
      }
      const idx = parseInt(sel) - 1;
      if (isNaN(idx) || !items[idx]) return;
      item = items[idx];
      price = item.price;
      if (price === 0) {
        if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
          const rp = await window.VolvixUI.form({
            title: 'Precio del artículo',
            size: 'sm',
            fields: [{ name: 'price', type: 'number', label: 'Precio', required: true, min: 0, step: 0.01 }],
            submitText: 'Aceptar'
          });
          if (!rp) return;
          price = parseFloat(rp.price);
        } else {
          price = parseFloat(window.prompt('Precio:'));
        }
        if (isNaN(price)) return;
      }
    }
    CART.push({ code: 'VAR' + Date.now(), name: item.name, price, qty: 1, stock: 999 });
    renderCart();
    showToast('+ ' + item.name);
  }

  // PRODUCTO COMÚN
  async function addCommonProduct() {
    let name = '', price = NaN;
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      const r = await window.VolvixUI.form({
        title: 'Producto común',
        size: 'sm',
        fields: [
          { name: 'name',  type: 'text',   label: 'Nombre del producto', required: true },
          { name: 'price', type: 'number', label: 'Precio',              required: true, min: 0, step: 0.01 }
        ],
        submitText: 'Agregar'
      });
      if (!r) return;
      name = String(r.name).trim();
      price = parseFloat(r.price);
    } else {
      name = prompt('Nombre del producto:');
      if (!name) return;
      price = parseFloat(prompt('Precio:'));
    }
    if (!name) return;
    if (isNaN(price) || price < 0) { showToast('Precio inválido'); return; }
    CART.push({ code: 'COM' + Date.now(), name, price, qty: 1, stock: 999 });
    renderCart();
    showToast('+ ' + name + ' · ' + fmt(price));
  }

  // ENTRADA / SALIDA DE EFECTIVO
  let cashMode = 'in';
  function cashIn() {
    cashMode = 'in';
    $('#cash-title').textContent = '💰 Entrada de efectivo';
    $('#cash-concept').value = '';
    $('#cash-amount').value = '';
    $('#modal-cash').classList.add('open');
    setTimeout(() => $('#cash-concept').focus(), 100);
  }
  function cashOut() {
    cashMode = 'out';
    $('#cash-title').textContent = '💸 Salida de efectivo';
    $('#cash-concept').value = '';
    $('#cash-amount').value = '';
    $('#modal-cash').classList.add('open');
    setTimeout(() => $('#cash-concept').focus(), 100);
  }
  function registerCash() {
    const concept = $('#cash-concept').value.trim();
    const amount = parseFloat($('#cash-amount').value);
    if (!concept) { showToast('Falta concepto'); return; }
    if (isNaN(amount) || amount <= 0) { showToast('Monto inválido'); return; }
    closeModal('modal-cash');
    const label = cashMode === 'in' ? 'Entrada' : 'Salida';
    showToast('✓ ' + label + ' registrada · ' + concept + ' · ' + fmt(amount));
  }

  // VERIFICADOR DE PRECIOS
  async function priceChecker() {
    let code = '';
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      const r = await window.VolvixUI.form({
        title: '🔎 Verificador de precios',
        description: 'Escanea o escribe el código del producto',
        size: 'sm',
        fields: [
          { name: 'code', type: 'text', label: 'Código o nombre', required: true, autocomplete: 'off', placeholder: 'Ej: 7501055363513' }
        ],
        submitText: 'Buscar'
      });
      if (!r) return;
      code = String(r.code).trim();
    } else {
      code = prompt('🔎 Verificador de precios\n\nEscanea o escribe el código:') || '';
    }
    if (!code) return;
    const p = CATALOG.find(x => x.code === code.trim() || x.name.toLowerCase().includes(code.toLowerCase()));
    if (p) {
      const msg = p.name + '\nCódigo: ' + p.code + '\nPrecio: ' + fmt(p.price) + '\nStock: ' + p.stock + ' unidades';
      if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
        await window.VolvixUI.confirm({ title: '✓ Producto encontrado', message: msg, confirmText: 'Cerrar', cancelText: '' });
      } else {
        VolvixUI.toast({type:'success', message:'✓ PRODUCTO ENCONTRADO\n\n' + msg});
      }
    } else {
      if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
        window.VolvixUI.toast({ type: 'error', message: 'Producto no encontrado: "' + code + '"' });
      } else {
        VolvixUI.toast({type:'error', message:'❌ Producto no encontrado: "' + code + '"'});
      }
    }
  }

  // CALCULADORA
  let calcExpr = '';
  // 2026-05 audit B-21: SECURITY — antes usábamos Function() con input crudo,
  // permitiendo eval-injection. El cajero malicioso podía teclear
  // 'fetch(...)' y ejecutar cualquier JS. Ahora un parser numérico safe que
  // SOLO acepta dígitos, operadores básicos, paréntesis y punto decimal.
  function calcSafeEval(expr) {
    var s = String(expr || '').replace(/\s+/g, '');
    if (!s) return 0;
    // Whitelist estricta: dígitos, + - * / . ( )
    if (!/^[0-9+\-*/.()]+$/.test(s)) throw new Error('expr_invalid');
    // Tokenize
    var tokens = [];
    var num = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if ((ch >= '0' && ch <= '9') || ch === '.') { num += ch; }
      else {
        if (num) { tokens.push(num); num = ''; }
        tokens.push(ch);
      }
    }
    if (num) tokens.push(num);
    // Shunting-yard → RPN → evaluate
    var prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
    var out = []; var ops = [];
    for (var k = 0; k < tokens.length; k++) {
      var t = tokens[k];
      if (/^[0-9.]+$/.test(t)) { out.push(parseFloat(t)); }
      else if (t === '(') { ops.push(t); }
      else if (t === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
        if (!ops.length) throw new Error('paren_mismatch');
        ops.pop();
      }
      else if (prec[t]) {
        while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop());
        ops.push(t);
      } else { throw new Error('token_invalid'); }
    }
    while (ops.length) {
      var op = ops.pop();
      if (op === '(' || op === ')') throw new Error('paren_mismatch');
      out.push(op);
    }
    var stack = [];
    for (var j = 0; j < out.length; j++) {
      var x = out[j];
      if (typeof x === 'number') stack.push(x);
      else {
        var b = stack.pop(), a = stack.pop();
        if (a == null || b == null) throw new Error('expr_invalid');
        if (x === '+') stack.push(a + b);
        else if (x === '-') stack.push(a - b);
        else if (x === '*') stack.push(a * b);
        else if (x === '/') {
          if (b === 0) throw new Error('div_by_zero');
          stack.push(a / b);
        }
        else throw new Error('op_invalid');
      }
    }
    if (stack.length !== 1) throw new Error('expr_invalid');
    var r = stack[0];
    if (!isFinite(r)) throw new Error('expr_invalid');
    return Math.round(r * 1e6) / 1e6;
  }

  function calcInput(key) {
    const disp = $('#calc-display');
    if (key === 'C') { calcExpr = ''; disp.textContent = '0'; return; }
    if (key === '←') { calcExpr = calcExpr.slice(0, -1); disp.textContent = calcExpr || '0'; return; }
    if (key === '=') {
      try {
        const r = calcSafeEval(calcExpr);
        disp.textContent = r;
        calcExpr = String(r);
      } catch { disp.textContent = 'Error'; calcExpr = ''; }
      return;
    }
    calcExpr += key;
    disp.textContent = calcExpr;
  }
  function openCalc() {
    calcExpr = '';
    $('#calc-display').textContent = '0';
    $('#modal-calc').classList.add('open');
  }

  // GRANEL
  function openGranel() {
    $('#modal-granel').classList.add('open');
    calcGranel();
  }
  function calcGranel() {
    const sel = $('#granel-product').selectedIndex;
    const prices = [180, 220, 45, 30];
    const peso = parseFloat($('#granel-peso').value) || 0;
    const total = peso * prices[sel];
    $('#granel-total').value = fmt(total);
  }
  function readBascula() {
    // Simula lectura de báscula
    const peso = (0.100 + Math.random() * 2).toFixed(3);
    $('#granel-peso').value = peso;
    calcGranel();
    showToast('📡 Báscula: ' + peso + ' kg');
  }
  function addGranelToCart() {
    const sel = $('#granel-product').selectedIndex;
    const names = ['Queso Oaxaca', 'Jamón Virginia', 'Manzana', 'Tomate'];
    const prices = [180, 220, 45, 30];
    const peso = parseFloat($('#granel-peso').value) || 0;
    if (peso <= 0) { showToast('Peso inválido'); return; }
    const total = peso * prices[sel];
    CART.push({
      code: 'GRN' + Date.now(),
      name: names[sel] + ' (' + peso + ' kg)',
      price: total,
      qty: 1,
      stock: 999,
    });
    renderCart();
    closeModal('modal-granel');
    showToast('+ ' + names[sel] + ' · ' + peso + 'kg');
  }

  // R7b FIX-N3: este listener fue REMOVIDO. Sus atajos (F5, F9, F11, F12, Escape) se
  // consolidaron al listener principal de la seccion "KEYBOARD SHORTCUTS" (~linea 4681).
  // Razon: antes bindeaba F12 -> openPayment() en paralelo con el otro listener,
  // disparando 2 cobros por cada press. Ver R7b reporte FIX-N3.

  /* ================================================================
     PHASE1: INVENTORY MODULE · CUTS MODULE · REPORTS MODULE
     Real API calls + JWT auth + loading/error states + CSV export
     ================================================================ */

  /* ---------- Inventory Tabs + Stats + Movements + Count + Adjust ---------- */
  function showInvTab(tab, btn) {
    document.querySelectorAll('[data-inv-tab]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    ['stock','movs','count','adjust'].forEach(t => {
      const el = document.getElementById('inv-tab-' + t);
      if (el) el.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'movs') loadMovements();
    if (tab === 'adjust') { refreshAdjustProductOptions(); loadAdjustHistory(); }
    if (tab === 'count') { renderCountStep(); }
  }

  // 2026-05 ia-arquitectura R7: la campana del toolbar dispara este evento
  // al click. Aqui completamos el flujo: aseguramos tab Stock + activamos
  // filtro "Solo bajo stock" (la fuente unica de verdad de alertas vive
  // dentro de Inventario). Se llama tambien si se accede directo a la pantalla.
  function applyLowStockFilter() {
    try {
      // Activar tab Stock (por si venimos de otra)
      const stockTab = document.querySelector('[data-inv-tab="stock"]');
      if (stockTab) showInvTab('stock', stockTab);
      // Activar checkbox "Solo bajo stock" si no esta marcado
      const cb = document.getElementById('inv-only-low');
      if (cb && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Highlight breve para que el usuario sepa que se activo el filtro
      const wrap = cb && cb.closest('label');
      if (wrap) {
        wrap.style.transition = 'background-color 0.4s ease';
        const orig = wrap.style.backgroundColor;
        wrap.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
        setTimeout(() => { wrap.style.backgroundColor = orig; }, 1200);
      }
      // Si refreshInventory existe, recargar lista filtrada
      if (typeof refreshInventory === 'function') refreshInventory();
      else if (typeof renderInventory === 'function') renderInventory();
    } catch (e) {}
  }
  window.addEventListener('volvix:show-low-stock-tab', applyLowStockFilter);

  function updateInvStats() {
    const total = CATALOG.length;
    let value = 0, low = 0, zero = 0;
    CATALOG.forEach(p => {
      const stock = Number(p.stock||0);
      const cost = Number(p.cost||0);
      const minSt = Number(p.min_stock||p.minimo||0);
      value += stock * cost;
      if (stock <= 0) zero++;
      else if (minSt > 0 && stock <= minSt) low++;
    });
    const $el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    $el('inv-stat-total', total);
    $el('inv-stat-value', fmt(value));
    $el('inv-stat-low', low);
    $el('inv-stat-zero', zero);
    const sel = document.getElementById('inv-cat-filter');
    if (sel) {
      const cats = Array.from(new Set(CATALOG.map(p => p.category||p.categoria||'').filter(Boolean))).sort();
      const cur = sel.value;
      sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${escapeAttr(c)}"${cur===c?' selected':''}>${escapeHtml(c)}</option>`).join('');
    }
  }

  // =========================================================
  // MOVIMIENTOS
  // =========================================================
  let LAST_MOVS = [];
  async function loadMovements() {
    const body = document.getElementById('movs-body');
    const loading = document.getElementById('movs-loading');
    if (!body) return;
    if (loading) loading.classList.remove('hidden');
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-3);">⏳ Cargando movimientos…</td></tr>';
    // Default to last 30 days if empty
    const fromInp = document.getElementById('movs-from');
    const toInp = document.getElementById('movs-to');
    if (fromInp && !fromInp.value) {
      const d = new Date(); d.setDate(d.getDate()-30);
      fromInp.value = d.toISOString().slice(0,10);
    }
    if (toInp && !toInp.value) {
      toInp.value = new Date().toISOString().slice(0,10);
    }
    const params = new URLSearchParams({ tenant_id: _vTenant() });
    const from = fromInp?.value;
    const to = toInp?.value;
    const type = document.getElementById('movs-type')?.value;
    const prod = document.getElementById('movs-prod')?.value;
    const user = document.getElementById('movs-user')?.value;
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (type) params.set('type', type);
    if (prod) params.set('product', prod);
    if (user) params.set('user', user);
    try {
      const r = await _authFetch('/api/inventory-movements?' + params.toString());
      if (loading) loading.classList.add('hidden');
      if (!r.ok) {
        const cached = await idbGetAll('inventory_movements');
        if (cached && cached.length) {
          LAST_MOVS = cached;
          renderMovementsRows(cached);
          showToast('⚠ Mostrando movimientos en caché (offline)');
          return;
        }
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger);">Error HTTP ' + r.status + '. Endpoint /api/inventory-movements puede no existir aún.</td></tr>';
        return;
      }
      const data = await r.json();
      const items = Array.isArray(data) ? data : (data.items || []);
      LAST_MOVS = items;
      await idbPutAll('inventory_movements', items);
      renderMovementsRows(items);
    } catch (e) {
      if (loading) loading.classList.add('hidden');
      const cached = await idbGetAll('inventory_movements');
      if (cached && cached.length) { LAST_MOVS = cached; renderMovementsRows(cached); showToast('⚠ Sin conexión - usando caché'); return; }
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger);">Error: ' + escapeHtml(e.message||e) + '</td></tr>';
    }
  }
  function renderMovementsRows(items) {
    const body = document.getElementById('movs-body');
    if (!body) return;
    if (!items.length) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-3);">Sin movimientos</td></tr>'; return; }
    body.innerHTML = items.map((m, idx) => {
      const date = m.created_at || m.date || m.timestamp;
      const dateStr = date ? new Date(date).toLocaleString('es-MX') : '—';
      const type = m.type || m.tipo || '';
      const typeChip = type==='entrada'||type==='devolucion' ? 'ok' : (type==='salida'||type==='venta'||type==='merma') ? 'err' : 'warn';
      const qty = Number(m.quantity || m.qty || 0);
      const before = (m.stock_before ?? m.before);
      const after = (m.stock_after ?? m.after);
      return `<tr data-mov-idx="${idx}" style="cursor:pointer;">
        <td style="font-size:11px;color:var(--text-3);">${escapeHtml(dateStr)}</td>
        <td><span class="chip ${typeChip}">${escapeHtml(type)}</span></td>
        <td>${escapeHtml(m.product_name || m.product || m.producto || m.product_id || '—')}</td>
        <td class="num">${qty}</td>
        <td class="num">${before==null||before===''?'—':before}</td>
        <td class="num">${after==null||after===''?'—':after}</td>
        <td>${escapeHtml(m.user || m.cashier || m.user_email || '—')}</td>
        <td style="font-size:11px;">${escapeHtml(m.reason || m.motivo || m.notes || '—')}</td>
      </tr>`;
    }).join('');
  }
  function exportMovementsCSV() {
    if (!LAST_MOVS.length) { showToast('No hay movimientos para exportar. Pulsa Recargar primero.'); return; }
    const rows = LAST_MOVS.map(m => ({
      fecha: m.created_at || m.date || m.timestamp || '',
      tipo: m.type || m.tipo || '',
      producto: m.product_name || m.product || m.producto || m.product_id || '',
      cantidad: m.quantity || m.qty || 0,
      antes: m.stock_before ?? m.before ?? '',
      despues: m.stock_after ?? m.after ?? '',
      usuario: m.user || m.cashier || m.user_email || '',
      motivo: m.reason || m.motivo || m.notes || ''
    }));
    const fn = 'movimientos-inventario-' + new Date().toISOString().slice(0,10) + '.csv';
    _vlxDownloadCSV(fn, ['fecha','tipo','producto','cantidad','antes','despues','usuario','motivo'], rows);
    showToast('✓ ' + rows.length + ' movimientos exportados a ' + fn);
  }
  function openMovementDetailModal(mov) {
    const id = 'modal-mov-detail';
    document.getElementById(id)?.remove();
    const m = document.createElement('div');
    m.id = id;
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
    const date = mov.created_at || mov.date || mov.timestamp;
    const dateStr = date ? new Date(date).toLocaleString('es-MX') : '—';
    const before = mov.stock_before ?? mov.before;
    const after = mov.stock_after ?? mov.after;
    const saleHtml = mov.sale_id ? `<p><strong>Venta vinculada:</strong> <a href="#" onclick="showScreen('ventas');document.getElementById('modal-mov-detail')?.remove();return false;">${escapeHtml(mov.sale_id)}</a></p>` : '';
    m.innerHTML = `
      <div style="background:#fff;color:#1C1917;border-radius:12px;padding:18px;width:480px;max-width:92vw;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong>Detalle de movimiento</strong>
          <button onclick="document.getElementById('modal-mov-detail')?.remove()" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="font-size:13px;line-height:1.6;">
          <p><strong>Fecha:</strong> ${escapeHtml(dateStr)}</p>
          <p><strong>Tipo:</strong> ${escapeHtml(mov.type || mov.tipo || '—')}</p>
          <p><strong>Producto:</strong> ${escapeHtml(mov.product_name || mov.product || mov.producto || mov.product_id || '—')}</p>
          <p><strong>Cantidad:</strong> ${Number(mov.quantity || mov.qty || 0)}</p>
          <p><strong>Stock antes:</strong> ${before==null||before===''?'—':before} → <strong>Stock después:</strong> ${after==null||after===''?'—':after}</p>
          <p><strong>Usuario:</strong> ${escapeHtml(mov.user || mov.cashier || mov.user_email || '—')}</p>
          <p><strong>Motivo:</strong> ${escapeHtml(mov.reason || mov.motivo || mov.notes || '—')}</p>
          ${saleHtml}
        </div>
        <div style="margin-top:14px;text-align:right;">
          <button class="btn" onclick="document.getElementById('modal-mov-detail')?.remove()">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  }

  // =========================================================
  // AJUSTES (rápido + bulk + historial)
  // =========================================================
  function refreshAdjustProductOptions() {
    const sel = document.getElementById('adj-product');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Selecciona —</option>' + CATALOG.map(p => `<option value="${escapeAttr(p.id||p.code)}" data-stock="${Number(p.stock||0)}">${escapeHtml(p.name)} · ${escapeHtml(p.code)} (stock: ${Number(p.stock||0)})</option>`).join('');
      sel.value = cur;
    }
  }

  async function submitAdjust() {
    const sel = document.getElementById('adj-product');
    const type = document.getElementById('adj-type').value;
    const qty = parseInt(document.getElementById('adj-qty').value, 10);
    const reasonSel = document.getElementById('adj-reason-sel');
    const notes = document.getElementById('adj-reason').value.trim();
    const msg = document.getElementById('adj-msg');
    msg.textContent = '';
    // Zod-style inline validation
    if (!sel.value) { msg.textContent = 'Selecciona un producto'; return; }
    if (isNaN(qty) || qty < 0) { msg.textContent = 'Cantidad inválida (debe ser >= 0)'; return; }
    if (type !== 'ajuste' && qty <= 0) { msg.textContent = 'Para entrada/salida la cantidad debe ser > 0'; return; }
    const reasonCode = reasonSel?.value || '';
    if (!reasonCode) { msg.textContent = 'El motivo es obligatorio'; return; }
    const reason = reasonCode + (notes ? ' · ' + notes : '');
    const btn = document.getElementById('btn-adj-submit');
    btn.disabled = true; btn.textContent = '⏳ Registrando…';
    try {
      const payload = { tenant_id: _vTenant(), product_id: sel.value, type, quantity: qty, reason };
      const r = await _authFetch('/api/inventory-movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const err = await r.json().catch(()=>({}));
        await idbQueue('inventory_movements_pending', payload);
        showToast('⚠ Movimiento en cola offline (server: ' + (err.error || r.status) + ')');
      } else {
        showToast('✓ Movimiento registrado');
      }
      document.getElementById('adj-qty').value = '0';
      document.getElementById('adj-reason').value = '';
      if (reasonSel) reasonSel.value = '';
      await loadCatalogReal();
      refreshAdjustProductOptions();
      loadAdjustHistory();
    } catch(e) {
      const payload = { tenant_id:_vTenant(), product_id: sel.value, type, quantity: qty, reason };
      await idbQueue('inventory_movements_pending', payload);
      showToast('⚠ Sin conexión - movimiento en cola: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Registrar movimiento';
    }
  }

  let BULK_ADJ_ROWS = [];
  async function handleBulkCSV(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = _parseCSV(text);
      if (!rows.length) { showToast('CSV vacío'); return; }
      // Validate columns
      const required = ['sku','delta','reason'];
      const first = rows[0];
      const missing = required.filter(c => !(c in first));
      if (missing.length) { showToast('Faltan columnas: ' + missing.join(', ')); return; }
      BULK_ADJ_ROWS = rows.map(r => {
        const sku = (r.sku||'').trim();
        const delta = parseInt(r.delta, 10);
        const reason = (r.reason||'').trim();
        const prod = CATALOG.find(p => (p.code||'').toLowerCase() === sku.toLowerCase());
        let status = 'OK';
        if (!sku) status = '✗ SKU vacío';
        else if (!prod) status = '✗ SKU no encontrado';
        else if (isNaN(delta) || delta === 0) status = '✗ delta inválido';
        else if (!reason) status = '✗ reason vacío';
        return { sku, delta, reason, product_id: prod?.id || prod?.code, status };
      });
      const body = document.getElementById('adj-bulk-body');
      const wrap = document.getElementById('adj-bulk-preview');
      const btn = document.getElementById('btn-adj-bulk-submit');
      if (body) body.innerHTML = BULK_ADJ_ROWS.map(r => `<tr>
        <td class="mono" style="font-size:11px;">${escapeHtml(r.sku)}</td>
        <td class="num" style="color:${r.delta>0?'var(--success)':'var(--danger)'}">${r.delta>0?'+':''}${r.delta||'?'}</td>
        <td style="font-size:11px;">${escapeHtml(r.reason)}</td>
        <td style="font-size:11px;color:${r.status==='OK'?'var(--success)':'var(--danger)'}">${escapeHtml(r.status)}</td>
      </tr>`).join('');
      const valid = BULK_ADJ_ROWS.filter(r => r.status==='OK').length;
      if (wrap) wrap.style.display = 'block';
      if (btn) {
        btn.style.display = 'flex';
        btn.textContent = `Aplicar ${valid} ajustes válidos (de ${BULK_ADJ_ROWS.length})`;
        btn.disabled = valid === 0;
      }
    } catch(e) {
      showToast('Error leyendo CSV: ' + (e.message||e));
    }
  }
  async function submitBulkAdjust() {
    const valid = BULK_ADJ_ROWS.filter(r => r.status === 'OK');
    if (!valid.length) { showToast('No hay filas válidas'); return; }
    const btn = document.getElementById('btn-adj-bulk-submit');
    btn.disabled = true; btn.textContent = '⏳ Aplicando…';
    try {
      const payload = {
        tenant_id: _vTenant(),
        items: valid.map(r => ({ product_id: r.product_id, sku: r.sku, delta: r.delta, reason: r.reason }))
      };
      const r = await _authFetch('/api/inventory/bulk-adjust', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) {
        // Fallback: emit individual movements
        let ok = 0;
        for (const it of valid) {
          const mov = { tenant_id: _vTenant(), product_id: it.product_id, type: it.delta > 0 ? 'entrada' : 'salida', quantity: Math.abs(it.delta), reason: it.reason };
          const rr = await _authFetch('/api/inventory-movements', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(mov) });
          if (rr.ok) ok++;
        }
        showToast(ok ? `✓ ${ok}/${valid.length} ajustes aplicados (modo individual)` : '✗ No se pudieron aplicar ajustes');
      } else {
        showToast(`✓ ${valid.length} ajustes aplicados en bulk`);
      }
      BULK_ADJ_ROWS = [];
      const body = document.getElementById('adj-bulk-body');
      const wrap = document.getElementById('adj-bulk-preview');
      if (body) body.innerHTML = '';
      if (wrap) wrap.style.display = 'none';
      btn.style.display = 'none';
      await loadCatalogReal();
      refreshAdjustProductOptions();
      loadAdjustHistory();
    } catch(e) {
      showToast('Error: ' + (e.message||e));
    } finally {
      btn.disabled = false;
    }
  }

  async function loadAdjustHistory() {
    const body = document.getElementById('adj-history-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-3);">⏳ Cargando…</td></tr>';
    try {
      const params = new URLSearchParams({ tenant_id: _vTenant(), type: 'ajuste', limit: '50' });
      const r = await _authFetch('/api/inventory-movements?' + params.toString());
      if (!r.ok) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-3);">Sin historial disponible</td></tr>'; return; }
      const data = await r.json();
      const items = (Array.isArray(data) ? data : (data.items || [])).slice(0, 50);
      if (!items.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-3);">Sin ajustes recientes</td></tr>'; return; }
      body.innerHTML = items.map(m => {
        const date = m.created_at || m.date || m.timestamp;
        const dateStr = date ? new Date(date).toLocaleString('es-MX') : '—';
        const qty = Number(m.quantity || m.qty || 0);
        const dir = m.type === 'salida' || m.type === 'merma' || (m.direction === 'salida') ? -qty : qty;
        return `<tr>
          <td style="font-size:11px;color:var(--text-3);">${escapeHtml(dateStr)}</td>
          <td>${escapeHtml(m.product_name || m.product || m.product_id || '—')}</td>
          <td class="num" style="color:${dir>=0?'var(--success)':'var(--danger)'};font-weight:600;">${dir>=0?'+':''}${dir}</td>
          <td style="font-size:11px;">${escapeHtml(m.reason || m.motivo || '—')}</td>
          <td style="font-size:11px;">${escapeHtml(m.user || m.user_email || '—')}</td>
        </tr>`;
      }).join('');
    } catch(e) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-3);">Error de conexión</td></tr>';
    }
  }

  function openStockAdjustModal(product, sign) {
    showInvTab('adjust', document.querySelector('[data-inv-tab="adjust"]'));
    setTimeout(() => {
      refreshAdjustProductOptions();
      const sel = document.getElementById('adj-product');
      if (sel) sel.value = product.id || product.code;
      const tSel = document.getElementById('adj-type');
      if (tSel && sign === '-') tSel.value = 'salida';
      else if (tSel) tSel.value = 'entrada';
      document.getElementById('adj-qty')?.focus();
    }, 50);
  }

  // =========================================================
  // CONTEO FÍSICO (4 pasos: A iniciar / B capturar / C revisar / D resumen)
  // =========================================================
  // Estado global del conteo activo
  // Estructura en localStorage: { count_id, name, area, started_at, items: [{product_id,code,name,system_stock,counted_qty,cost}] }
  function _loadActiveCount() {
    try { return JSON.parse(localStorage.getItem('volvix_active_count') || 'null'); } catch(e){ return null; }
  }
  function _saveActiveCount(data) {
    try { data ? localStorage.setItem('volvix_active_count', JSON.stringify(data)) : localStorage.removeItem('volvix_active_count'); } catch(e){}
  }
  let COUNT_REVIEW_DATA = null; // calc results in step C

  function renderCountStep() {
    const active = _loadActiveCount();
    const a = document.getElementById('count-step-a');
    const b = document.getElementById('count-step-b');
    const c = document.getElementById('count-step-c');
    const d = document.getElementById('count-step-d');
    const resumeBtn = document.getElementById('btn-count-resume');
    if (!a || !b || !c || !d) return;
    if (!active) {
      a.classList.remove('hidden'); b.classList.add('hidden'); c.classList.add('hidden'); d.classList.add('hidden');
      if (resumeBtn) resumeBtn.style.display = 'none';
    } else {
      a.classList.add('hidden'); b.classList.remove('hidden'); c.classList.add('hidden'); d.classList.add('hidden');
      const nm = document.getElementById('count-active-name');
      const id = document.getElementById('count-active-id');
      if (nm) nm.textContent = active.name || '(sin nombre)';
      if (id) id.textContent = active.count_id || '(local)';
      _renderCountTable();
    }
  }
  function _renderCountTable() {
    const active = _loadActiveCount();
    const body = document.getElementById('count-body');
    const prog = document.getElementById('count-progress');
    if (!body || !active) return;
    const items = active.items || [];
    if (prog) prog.textContent = items.length + ' producto(s) capturado(s) · ' + CATALOG.length + ' en catálogo';
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-3);">Sin productos en conteo. Pulsa "+ Por producto" o escanea un código.</td></tr>';
      return;
    }
    body.innerHTML = items.map((it, i) => {
      const diff = Number(it.counted_qty||0) - Number(it.system_stock||0);
      const color = diff===0 ? 'var(--text-2)' : (diff<0 ? 'var(--danger)' : 'var(--success)');
      return `<tr>
        <td>${escapeHtml(it.name)} <span style="color:var(--text-3);font-size:11px;">${escapeHtml(it.code)}</span></td>
        <td class="num">${it.system_stock}</td>
        <td class="num"><input type="number" min="0" step="1" value="${it.counted_qty}" data-count-idx="${i}" class="input-field" style="max-width:100px;text-align:right;"></td>
        <td class="num" style="color:${color};font-weight:600;">${diff>0?'+':''}${diff}</td>
        <td><button class="btn sm" data-count-remove="${i}" style="color:var(--danger);">Eliminar</button></td>
      </tr>`;
    }).join('');
  }
  async function startNewCount() {
    const nameEl = document.getElementById('count-name');
    const areaEl = document.getElementById('count-area');
    const msg = document.getElementById('count-msg-a');
    if (msg) msg.textContent = '';
    const name = (nameEl?.value || '').trim();
    const area = (areaEl?.value || '').trim();
    if (!name || name.length < 3) { if (msg) msg.textContent = 'El nombre del conteo es obligatorio (mínimo 3 caracteres)'; return; }
    const btn = document.getElementById('btn-count-start');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Iniciando…'; }
    try {
      const payload = { tenant_id: _vTenant(), name, area, started_at: new Date().toISOString() };
      const r = await _authFetch('/api/inventory-counts/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      // R4a GAP-I1: 409 = ya hay otro conteo activo en este tenant+area. Ofrecer retomar.
      if (r.status === 409) {
        const j = await r.json().catch(()=>({}));
        if (j && j.error_code === 'COUNT_LOCKED' && j.active_count_id) {
          if (msg) msg.textContent = '';
          if (confirm('Ya hay un conteo activo en esta área (id ' + j.active_count_id + ').\n\nRetomarlo?')) {
            _saveActiveCount({ count_id: j.active_count_id, name: name || '(retomado)', area, started_at: j.locked_at || new Date().toISOString(), items: [] });
            // Cargar líneas guardadas
            try {
              const rl = await _authFetch('/api/inventory-counts/' + encodeURIComponent(j.active_count_id) + '/lines', { method:'GET' });
              if (rl.ok) {
                const lj = await rl.json().catch(()=>({}));
                const restoredItems = (lj.lines || []).map(L => ({
                  product_id: L.product_id, code: '', name: '(producto)',
                  system_stock: Number(L.expected_qty||0),
                  counted_qty: Number(L.actual_qty||0),
                  cost: 0, _uploaded: true
                }));
                if (restoredItems.length) {
                  const a2 = _loadActiveCount();
                  if (a2) { a2.items = restoredItems; _saveActiveCount(a2); }
                }
              }
            } catch (_) {}
            renderCountStep();
            showToast('↻ Conteo retomado · ' + j.active_count_id);
          } else {
            if (msg) msg.textContent = 'Otro conteo está activo en esta área. Espera a que termine o cancélalo desde Administración.';
          }
          if (btn) { btn.disabled = false; btn.textContent = '▶ Iniciar conteo'; }
          return;
        }
      }
      let count_id = null;
      if (r.ok) {
        const j = await r.json().catch(()=>({}));
        count_id = j.count_id || j.id || null;
      }
      if (!count_id) {
        // Local fallback
        count_id = 'CNT-LOCAL-' + Date.now();
        showToast('⚠ Conteo iniciado localmente (server no respondió)');
      } else {
        showToast('✓ Conteo iniciado · ID ' + count_id);
      }
      _saveActiveCount({ count_id, name, area, started_at: payload.started_at, items: [] });
      if (nameEl) nameEl.value = '';
      if (areaEl) areaEl.value = '';
      renderCountStep();
    } catch(e) {
      const count_id = 'CNT-LOCAL-' + Date.now();
      _saveActiveCount({ count_id, name, area, started_at: new Date().toISOString(), items: [] });
      showToast('⚠ Sin conexión — conteo local');
      renderCountStep();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '▶ Iniciar conteo'; }
    }
  }
  function pickCountProduct() {
    if (!CATALOG.length) { showToast('Carga el catálogo primero'); return; }
    let m = document.getElementById('modal-count-pick');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'modal-count-pick';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
    m.innerHTML = `
      <div style="background:#fff;color:#1C1917;border-radius:12px;padding:18px;width:520px;max-width:92vw;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <strong>Agregar producto al conteo</strong>
          <button id="cnt-pick-close" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <input type="text" id="cnt-pick-search" placeholder="🔎 Buscar por nombre, código o barcode…" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:7px;margin-bottom:10px;">
        <div id="cnt-pick-list" style="max-height:400px;overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(m);
    const renderList = (q) => {
      const ql = (q||'').toLowerCase();
      const list = ql ? CATALOG.filter(p => (p.name||'').toLowerCase().includes(ql) || (p.code||'').toLowerCase().includes(ql) || (p.barcode||'').toLowerCase().includes(ql)) : CATALOG.slice(0,50);
      m.querySelector('#cnt-pick-list').innerHTML = list.map(p => `<button data-pick="${escapeAttr(p.id||p.code)}" data-pick-code="${escapeAttr(p.code)}" data-pick-name="${escapeAttr(p.name)}" data-pick-stock="${Number(p.stock||0)}" data-pick-cost="${Number(p.cost||0)}" style="display:block;width:100%;text-align:left;padding:8px 10px;border:1px solid #E7E5E4;border-radius:6px;margin-bottom:4px;background:#fff;cursor:pointer;">${escapeHtml(p.name)} <span style="color:#888;font-size:11px;">${escapeHtml(p.code)} · stock: ${Number(p.stock||0)}</span></button>`).join('') || '<p style="color:#888;font-size:12px;text-align:center;padding:14px;">Sin resultados</p>';
    };
    renderList('');
    m.querySelector('#cnt-pick-search').addEventListener('input', e => renderList(e.target.value));
    const close = () => m.remove();
    m.querySelector('#cnt-pick-close').onclick = close;
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('#cnt-pick-list').addEventListener('click', e => {
      const btn = e.target.closest('button[data-pick]'); if (!btn) return;
      _addCountLine({
        product_id: btn.dataset.pick,
        code: btn.dataset.pickCode,
        name: btn.dataset.pickName,
        system_stock: Number(btn.dataset.pickStock||0),
        cost: Number(btn.dataset.pickCost||0),
        counted_qty: Number(btn.dataset.pickStock||0)
      });
      close();
    });
  }
  function _addCountLine(line) {
    const active = _loadActiveCount();
    if (!active) { showToast('Inicia un conteo primero'); return false; }
    active.items = active.items || [];
    if (active.items.find(x => x.product_id === line.product_id)) {
      showToast('Producto ya agregado al conteo');
      return false;
    }
    active.items.push(line);
    _saveActiveCount(active);
    _renderCountTable();
    _scheduleBatchUpload();
    return true;
  }
  function focusBarcodeInput() {
    const inp = document.getElementById('count-barcode-input');
    if (inp) { inp.focus(); inp.select(); }
  }
  function _onBarcodeEnter(e) {
    if (e.key !== 'Enter') return;
    const code = (e.target.value || '').trim();
    if (!code) return;
    const msg = document.getElementById('count-barcode-msg');
    const prod = CATALOG.find(p => (p.barcode||'').trim() === code || (p.code||'').trim() === code);
    if (!prod) {
      if (msg) { msg.textContent = '✗ Código no encontrado'; msg.style.color = 'var(--danger)'; }
      return;
    }
    const ok = _addCountLine({
      product_id: prod.id || prod.code,
      code: prod.code,
      name: prod.name,
      system_stock: Number(prod.stock||0),
      cost: Number(prod.cost||0),
      counted_qty: Number(prod.stock||0)
    });
    if (ok && msg) { msg.textContent = '✓ ' + prod.name; msg.style.color = 'var(--success)'; }
    e.target.value = '';
  }
  // Subida en lotes de 50
  let _batchUploadTimer = null;
  let _linesPatchTimer = null;
  function _scheduleBatchUpload() {
    if (_batchUploadTimer) clearTimeout(_batchUploadTimer);
    _batchUploadTimer = setTimeout(_flushBatchUpload, 1500);
    // R4a GAP-I2: debounce 1s, persist line state to server (recovery)
    if (_linesPatchTimer) clearTimeout(_linesPatchTimer);
    _linesPatchTimer = setTimeout(_flushLinesPatch, 1000);
  }
  async function _flushLinesPatch() {
    const active = _loadActiveCount();
    if (!active || !active.count_id || String(active.count_id).startsWith('CNT-LOCAL-')) return;
    const lines = (active.items || []).map(it => ({
      product_id: it.product_id,
      actual_qty: Number(it.counted_qty || 0),
      expected_qty: Number(it.system_stock || 0)
    })).filter(l => l.product_id);
    if (!lines.length) return;
    try {
      await _authFetch('/api/inventory-counts/' + encodeURIComponent(active.count_id) + '/lines', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines })
      });
    } catch (_) { /* silent — best-effort recovery save */ }
  }
  async function _flushBatchUpload() {
    const active = _loadActiveCount();
    if (!active || !active.count_id || String(active.count_id).startsWith('CNT-LOCAL-')) return;
    const items = (active.items || []).filter(it => !it._uploaded);
    if (!items.length) return;
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i+50);
      try {
        const r = await _authFetch(`/api/inventory-counts/${encodeURIComponent(active.count_id)}/items`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ items: batch.map(b => ({ product_id: b.product_id, counted_qty: Number(b.counted_qty||0), system_stock: b.system_stock })) })
        });
        if (r.ok) batch.forEach(b => b._uploaded = true);
      } catch(e){ /* silencioso */ }
    }
    _saveActiveCount(active);
  }
  async function pauseCount() {
    _flushBatchUpload();
    // R4a GAP-I2: persist pause state on server
    const active = _loadActiveCount();
    if (active && active.count_id && !String(active.count_id).startsWith('CNT-LOCAL-')) {
      try {
        await _authFetch('/api/inventory-counts/' + encodeURIComponent(active.count_id) + '/pause', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
        });
      } catch (_) {}
    }
    showToast('⏸ Conteo pausado. Puedes resumirlo cuando quieras.');
    // Volver al step A pero mantener active
    const a = document.getElementById('count-step-a');
    const b = document.getElementById('count-step-b');
    const resumeBtn = document.getElementById('btn-count-resume');
    if (a) a.classList.remove('hidden');
    if (b) b.classList.add('hidden');
    if (resumeBtn) resumeBtn.style.display = 'inline-flex';
  }
  async function resumeCount() {
    const active = _loadActiveCount();
    if (!active) { showToast('No hay conteo en curso'); return; }
    // R4a GAP-I2: tell server to flip status back to in_progress
    if (active.count_id && !String(active.count_id).startsWith('CNT-LOCAL-')) {
      try {
        await _authFetch('/api/inventory-counts/' + encodeURIComponent(active.count_id) + '/resume', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
        });
      } catch (_) {}
    }
    renderCountStep();
  }
  async function cancelCount(fromStep) {
    if (!confirm('¿Cancelar el conteo en curso? Se perderán las capturas locales.')) return;
    const active = _loadActiveCount();
    if (active && active.count_id && !String(active.count_id).startsWith('CNT-LOCAL-')) {
      try {
        await _authFetch(`/api/inventory-counts/${encodeURIComponent(active.count_id)}/finalize`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ cancel: true })
        });
      } catch(e){}
    }
    _saveActiveCount(null);
    COUNT_REVIEW_DATA = null;
    showToast('Conteo cancelado');
    renderCountStep();
  }
  function reviewCount() {
    const active = _loadActiveCount();
    if (!active) return;
    const items = active.items || [];
    if (!items.length) { showToast('Captura al menos un producto antes de revisar'); return; }
    let pos = 0, neg = 0, value = 0;
    items.forEach(it => {
      const diff = Number(it.counted_qty||0) - Number(it.system_stock||0);
      if (diff > 0) pos++;
      if (diff < 0) neg++;
      value += diff * Number(it.cost||0);
    });
    COUNT_REVIEW_DATA = { items, pos, neg, value };
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('count-stat-total', items.length);
    setTxt('count-stat-pos', pos);
    setTxt('count-stat-neg', neg);
    setTxt('count-stat-value', fmt(value));
    const body = document.getElementById('count-review-body');
    if (body) body.innerHTML = items.map(it => {
      const diff = Number(it.counted_qty||0) - Number(it.system_stock||0);
      const cost = Number(it.cost||0);
      const valDiff = diff * cost;
      const color = diff===0 ? 'var(--text-2)' : (diff<0 ? 'var(--danger)' : 'var(--success)');
      const bg = diff !== 0 ? 'background:#FEF3C7;' : '';
      return `<tr style="${bg}">
        <td>${escapeHtml(it.name)} <span style="color:var(--text-3);font-size:11px;">${escapeHtml(it.code)}</span></td>
        <td class="num">${it.system_stock}</td>
        <td class="num">${it.counted_qty}</td>
        <td class="num" style="color:${color};font-weight:600;">${diff>0?'+':''}${diff}</td>
        <td class="num" style="font-size:11px;">${fmt(cost)}</td>
        <td class="num" style="color:${color};font-weight:600;">${fmt(valDiff)}</td>
      </tr>`;
    }).join('');
    // Toggle steps
    document.getElementById('count-step-b')?.classList.add('hidden');
    document.getElementById('count-step-c')?.classList.remove('hidden');
  }
  async function finalizeCount() {
    const active = _loadActiveCount();
    if (!active || !COUNT_REVIEW_DATA) return;
    if (!confirm('¿Aceptar y aplicar los ajustes generados por este conteo? Esta acción es definitiva.')) return;
    const btn = document.getElementById('btn-count-finalize');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando…'; }
    try {
      let appliedOk = false;
      if (active.count_id && !String(active.count_id).startsWith('CNT-LOCAL-')) {
        const r = await _authFetch(`/api/inventory-counts/${encodeURIComponent(active.count_id)}/finalize`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ items: active.items.map(it => ({ product_id: it.product_id, counted_qty: Number(it.counted_qty||0) })) })
        });
        if (r.ok) appliedOk = true;
      }
      if (!appliedOk) {
        // Fallback: emit individual movements per discrepancy
        let ok = 0;
        for (const it of active.items) {
          const diff = Number(it.counted_qty||0) - Number(it.system_stock||0);
          if (diff === 0) continue;
          const r2 = await _authFetch('/api/inventory-movements', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: _vTenant(), product_id: it.product_id, type: 'ajuste', quantity: Math.abs(diff), direction: diff > 0 ? 'entrada' : 'salida', reason: 'Conteo físico ' + (active.name||active.count_id) })
          });
          if (r2.ok) ok++;
        }
        appliedOk = ok > 0 || active.items.every(it => Number(it.counted_qty||0) === Number(it.system_stock||0));
      }
      if (appliedOk) {
        showToast('✓ Conteo finalizado · ajustes aplicados');
      } else {
        showToast('⚠ Conteo guardado offline');
        await idbQueue('inventory_counts_pending', { active, finalized_at: new Date().toISOString() });
      }
      // Mostrar step D resumen
      _renderCountSummary(active, COUNT_REVIEW_DATA);
      document.getElementById('count-step-c')?.classList.add('hidden');
      document.getElementById('count-step-d')?.classList.remove('hidden');
      _saveActiveCount(null);
      await loadCatalogReal();
    } catch(e) {
      showToast('Error al finalizar: ' + (e.message||e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Aceptar y aplicar ajustes'; }
    }
  }
  function _renderCountSummary(active, data) {
    const el = document.getElementById('count-summary');
    if (!el) return;
    const date = new Date().toLocaleString('es-MX');
    const itemsHtml = (data.items||[]).filter(it => Number(it.counted_qty||0) !== Number(it.system_stock||0)).map(it => {
      const diff = Number(it.counted_qty||0) - Number(it.system_stock||0);
      return `<tr><td>${escapeHtml(it.name)} (${escapeHtml(it.code)})</td><td class="num">${it.system_stock}</td><td class="num">${it.counted_qty}</td><td class="num">${diff>0?'+':''}${diff}</td></tr>`;
    }).join('');
    el.innerHTML = `
      <div id="count-print-area">
        <h2 style="margin:0 0 6px;">Reporte de conteo físico</h2>
        <p style="color:#666;margin:0 0 14px;">${escapeHtml(date)} · Tenant ${escapeHtml(_vTenant())}</p>
        <p><strong>Conteo:</strong> ${escapeHtml(active.name||'')}</p>
        <p><strong>Área:</strong> ${escapeHtml(active.area||'—')}</p>
        <p><strong>ID:</strong> <span class="mono">${escapeHtml(active.count_id||'')}</span></p>
        <p><strong>Iniciado:</strong> ${escapeHtml(active.started_at ? new Date(active.started_at).toLocaleString('es-MX') : '—')}</p>
        <hr>
        <p><strong>Productos contados:</strong> ${data.items.length}</p>
        <p><strong>Discrepancias positivas:</strong> ${data.pos}</p>
        <p><strong>Discrepancias negativas:</strong> ${data.neg}</p>
        <p><strong>Valor total ajustes:</strong> <span style="color:${data.value>=0?'green':'red'};font-weight:600;">${fmt(data.value)}</span></p>
        ${itemsHtml ? '<table class="tbl" style="width:100%;margin-top:10px;border-collapse:collapse;"><thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;">Producto</th><th class="num" style="border-bottom:1px solid #ccc;">Sistema</th><th class="num" style="border-bottom:1px solid #ccc;">Contado</th><th class="num" style="border-bottom:1px solid #ccc;">Δ</th></tr></thead><tbody>'+itemsHtml+'</tbody></table>' : '<p style="color:green;">Sin discrepancias detectadas.</p>'}
      </div>
    `;
  }
  function printCountReport() {
    const area = document.getElementById('count-print-area');
    if (!area) { window.print(); return; }
    const w = window.open('', '_blank', 'width=720,height=900');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Reporte de conteo</title><style>body{font-family:Arial,sans-serif;font-size:13px;padding:24px;color:#1C1917;}h2{margin-top:0;}table{width:100%;border-collapse:collapse;}th,td{padding:6px 8px;}.num{text-align:right;}</style></head><body>');
    w.document.write(area.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => { try { w.print(); } catch(e){} }, 250);
  }
  function closeCountSummary() {
    document.getElementById('count-step-d')?.classList.add('hidden');
    COUNT_REVIEW_DATA = null;
    renderCountStep();
  }

  // =========================================================
  // KARDEX MODAL
  // =========================================================
  async function openKardexModal(productIdOrCode) {
    const prod = CATALOG.find(p => p.id === productIdOrCode || p.code === productIdOrCode);
    const id = 'modal-kardex';
    document.getElementById(id)?.remove();
    const m = document.createElement('div');
    m.id = id;
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
    const today = new Date().toISOString().slice(0,10);
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth()-1);
    const fromDef = monthAgo.toISOString().slice(0,10);
    m.innerHTML = `
      <div style="background:#fff;color:#1C1917;border-radius:12px;padding:18px;width:880px;max-width:96vw;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <div>
            <strong style="font-size:16px;">📜 Kardex — ${escapeHtml(prod?.name||productIdOrCode)}</strong>
            <div style="font-size:11px;color:#666;">Código: ${escapeHtml(prod?.code||'—')} · Stock actual: <strong>${Number(prod?.stock||0)}</strong> · Valor: <strong>${fmt(Number(prod?.stock||0)*Number(prod?.cost||0))}</strong></div>
          </div>
          <button id="krx-close" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <input type="date" id="krx-from" value="${fromDef}" style="padding:6px 8px;border:1px solid #E7E5E4;border-radius:6px;">
          <input type="date" id="krx-to" value="${today}" style="padding:6px 8px;border:1px solid #E7E5E4;border-radius:6px;">
          <button id="krx-reload" class="btn">🔄 Recargar</button>
          <button id="krx-export" class="btn">📤 Exportar CSV</button>
        </div>
        <div id="krx-loading" style="text-align:center;padding:20px;color:#666;">⏳ Cargando…</div>
        <div class="tbl-wrap" style="display:none;" id="krx-tablewrap">
          <table class="tbl">
            <thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Balance</th><th class="num">Costo prom.</th><th>Usuario</th><th>Motivo</th></tr></thead>
            <tbody id="krx-body"></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    m.querySelector('#krx-close').onclick = () => m.remove();
    let kardexRows = [];
    const load = async () => {
      const body = m.querySelector('#krx-body');
      const loading = m.querySelector('#krx-loading');
      const tw = m.querySelector('#krx-tablewrap');
      if (loading) loading.style.display = 'block';
      if (tw) tw.style.display = 'none';
      try {
        const params = new URLSearchParams({
          tenant_id: _vTenant(),
          product_id: prod?.id || productIdOrCode,
          from: m.querySelector('#krx-from').value,
          to: m.querySelector('#krx-to').value
        });
        let r = await _authFetch('/api/reports/kardex?' + params.toString());
        let items = [];
        if (r.ok) {
          const j = await r.json();
          items = Array.isArray(j) ? j : (j.items || j.rows || []);
        } else {
          // Fallback a inventory-movements filtrado por producto
          const params2 = new URLSearchParams({ tenant_id: _vTenant(), product: prod?.code || productIdOrCode, from: params.get('from'), to: params.get('to') });
          const r2 = await _authFetch('/api/inventory-movements?' + params2.toString());
          if (r2.ok) {
            const j2 = await r2.json();
            items = Array.isArray(j2) ? j2 : (j2.items || []);
          }
        }
        kardexRows = items;
        if (loading) loading.style.display = 'none';
        if (tw) tw.style.display = 'block';
        if (!items.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#666;">Sin movimientos en el rango</td></tr>'; return; }
        body.innerHTML = items.map(it => {
          const date = it.created_at || it.date || it.timestamp;
          const dateStr = date ? new Date(date).toLocaleString('es-MX') : '—';
          const type = it.type || it.tipo || '';
          const qty = Number(it.quantity || it.qty || 0);
          const balance = it.balance ?? it.stock_after ?? '';
          const cavg = it.cost_avg ?? it.avg_cost ?? '';
          return `<tr>
            <td style="font-size:11px;color:#666;">${escapeHtml(dateStr)}</td>
            <td>${escapeHtml(type)}</td>
            <td class="num">${qty}</td>
            <td class="num"><strong>${balance===''?'—':balance}</strong></td>
            <td class="num" style="font-size:11px;">${cavg===''?'—':fmt(Number(cavg))}</td>
            <td style="font-size:11px;">${escapeHtml(it.user || it.user_email || '—')}</td>
            <td style="font-size:11px;">${escapeHtml(it.reason || it.motivo || '—')}</td>
          </tr>`;
        }).join('');
      } catch(e){
        if (loading) loading.textContent = 'Error: ' + (e.message||e);
      }
    };
    m.querySelector('#krx-reload').onclick = load;
    m.querySelector('#krx-export').onclick = () => {
      if (!kardexRows.length) { showToast('Nada que exportar'); return; }
      const rows = kardexRows.map(it => ({
        fecha: it.created_at || it.date || '',
        tipo: it.type || it.tipo || '',
        cantidad: it.quantity || it.qty || 0,
        balance: it.balance ?? it.stock_after ?? '',
        costo_prom: it.cost_avg ?? it.avg_cost ?? '',
        usuario: it.user || it.user_email || '',
        motivo: it.reason || it.motivo || ''
      }));
      const fn = 'kardex-' + (prod?.code||'producto') + '-' + new Date().toISOString().slice(0,10) + '.csv';
      _vlxDownloadCSV(fn, ['fecha','tipo','cantidad','balance','costo_prom','usuario','motivo'], rows);
      showToast('✓ Kardex exportado: ' + fn);
    };
    load();
  }

  // =========================================================
  // LOW STOCK ALERTS WIDGET
  // =========================================================
  let LOW_STOCK_ITEMS = [];
  async function refreshLowStockAlerts() {
    try {
      const r = await _authFetch('/api/inventory/alerts?tenant_id=' + encodeURIComponent(_vTenant()));
      let items = [];
      if (r.ok) {
        const j = await r.json();
        items = Array.isArray(j) ? j : (j.items || j.alerts || []);
      } else {
        // Fallback: derive from CATALOG
        items = CATALOG.filter(p => {
          const s = Number(p.stock||0);
          const m = Number(p.min_stock||p.minimo||0);
          return s <= 0 || (m > 0 && s <= m);
        });
      }
      LOW_STOCK_ITEMS = items;
      const badge = document.getElementById('tb-lowstock-badge');
      if (badge) {
        const n = items.length;
        if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = 'inline-block'; }
        else { badge.style.display = 'none'; }
      }
    } catch(e){
      // Silencioso; intentar otra vez en el próximo tick
    }
  }
  function openLowStockAlerts() {
    showScreen('inventario');
    setTimeout(() => {
      // Activar tab Stock actual y filtro bajo stock
      const stockTab = document.querySelector('[data-inv-tab="stock"]');
      if (stockTab) showInvTab('stock', stockTab);
      const onlyLow = document.getElementById('inv-only-low');
      const onlyZero = document.getElementById('inv-only-zero');
      if (onlyLow) onlyLow.checked = true;
      if (onlyZero) onlyZero.checked = false;
      const search = document.getElementById('inv-search');
      const cat = document.getElementById('inv-cat-filter');
      renderInv(search?.value || '', { onlyLow: true, onlyZero: false, onlyExpiry: false, cat: cat?.value || '' });
    }, 80);
  }

  // =========================================================
  // INIT INVENTORY MODULE
  // =========================================================
  function initInventoryModule() {
    const onlyLow = document.getElementById('inv-only-low');
    const onlyZero = document.getElementById('inv-only-zero');
    const onlyExpiry = document.getElementById('inv-only-expiry');
    const cat = document.getElementById('inv-cat-filter');
    const search = document.getElementById('inv-search');
    const applyFilters = () => {
      renderInv(search?.value || '', {
        onlyLow: !!onlyLow?.checked,
        onlyZero: !!onlyZero?.checked,
        onlyExpiry: !!onlyExpiry?.checked,
        cat: cat?.value || ''
      });
    };
    // Re-attach search since the original wiring fires renderInv() without opts
    if (search) {
      search.addEventListener('input', applyFilters);
    }
    onlyLow?.addEventListener('change', applyFilters);
    onlyZero?.addEventListener('change', applyFilters);
    onlyExpiry?.addEventListener('change', applyFilters);
    cat?.addEventListener('change', applyFilters);

    // Bulk select
    const checkAll = document.getElementById('inv-check-all');
    if (checkAll) checkAll.addEventListener('change', e => {
      document.querySelectorAll('.inv-row-check').forEach(c => {
        c.checked = e.target.checked;
        if (e.target.checked) INV_BULK_SELECT.add(c.dataset.rowid);
        else INV_BULK_SELECT.delete(c.dataset.rowid);
      });
      _updateBulkBar();
    });
    const invBody = document.getElementById('inv-body');
    if (invBody) invBody.addEventListener('change', e => {
      const c = e.target.closest('.inv-row-check'); if (!c) return;
      if (c.checked) INV_BULK_SELECT.add(c.dataset.rowid);
      else INV_BULK_SELECT.delete(c.dataset.rowid);
      _updateBulkBar();
    });
    document.getElementById('btn-bulk-clear')?.addEventListener('click', () => {
      INV_BULK_SELECT.clear();
      document.querySelectorAll('.inv-row-check').forEach(c => c.checked = false);
      const ca = document.getElementById('inv-check-all'); if (ca) ca.checked = false;
      _updateBulkBar();
    });
    document.getElementById('btn-bulk-adjust')?.addEventListener('click', () => {
      if (INV_BULK_SELECT.size === 0) { showToast('Selecciona al menos un producto'); return; }
      const first = Array.from(INV_BULK_SELECT)[0];
      const prod = CATALOG.find(p => (p.id||p.code) === first);
      if (prod) openStockAdjustModal(prod, '+');
      showToast(INV_BULK_SELECT.size + ' productos seleccionados — usa el formulario para cada uno o aplica un CSV bulk.');
    });

    // Row actions: +Stock, -Stock, Kardex (delegated)
    if (invBody) invBody.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]'); if (!btn) return;
      const code = btn.dataset.code;
      const action = btn.dataset.action;
      const prod = CATALOG.find(x => x.code === code || x.id === btn.dataset.id);
      if (!prod) return;
      if (action === 'quick-add') openStockAdjustModal(prod, '+');
      else if (action === 'quick-sub') openStockAdjustModal(prod, '-');
      else if (action === 'kardex') openKardexModal(prod.id || prod.code);
    });

    // Movements
    document.getElementById('btn-load-movs')?.addEventListener('click', loadMovements);
    document.getElementById('btn-export-movs')?.addEventListener('click', exportMovementsCSV);
    document.getElementById('movs-body')?.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-mov-idx]'); if (!tr) return;
      const idx = +tr.dataset.movIdx;
      if (LAST_MOVS[idx]) openMovementDetailModal(LAST_MOVS[idx]);
    });

    // Adjust quick
    document.getElementById('btn-adj-submit')?.addEventListener('click', submitAdjust);
    // Adjust bulk
    const bulkPick = document.getElementById('btn-adj-bulk-pick');
    const bulkFile = document.getElementById('adj-bulk-file');
    if (bulkPick && bulkFile) {
      bulkPick.addEventListener('click', () => bulkFile.click());
      bulkFile.addEventListener('change', e => { if (e.target.files[0]) handleBulkCSV(e.target.files[0]); e.target.value = ''; });
    }
    document.getElementById('btn-adj-bulk-submit')?.addEventListener('click', submitBulkAdjust);

    // Conteo físico
    document.getElementById('btn-count-start')?.addEventListener('click', startNewCount);
    document.getElementById('btn-count-add')?.addEventListener('click', pickCountProduct);
    document.getElementById('btn-count-barcode')?.addEventListener('click', focusBarcodeInput);
    document.getElementById('count-barcode-input')?.addEventListener('keydown', _onBarcodeEnter);
    document.getElementById('btn-count-pause')?.addEventListener('click', pauseCount);
    document.getElementById('btn-count-resume')?.addEventListener('click', resumeCount);
    document.getElementById('btn-count-cancel')?.addEventListener('click', () => cancelCount('b'));
    document.getElementById('btn-count-cancel-c')?.addEventListener('click', () => cancelCount('c'));
    document.getElementById('btn-count-review')?.addEventListener('click', reviewCount);
    document.getElementById('btn-count-back-b')?.addEventListener('click', () => {
      document.getElementById('count-step-c')?.classList.add('hidden');
      document.getElementById('count-step-b')?.classList.remove('hidden');
    });
    document.getElementById('btn-count-finalize')?.addEventListener('click', finalizeCount);
    document.getElementById('btn-count-print')?.addEventListener('click', printCountReport);
    document.getElementById('btn-count-close')?.addEventListener('click', closeCountSummary);
    document.getElementById('count-body')?.addEventListener('input', e => {
      const inp = e.target.closest('input[data-count-idx]'); if (!inp) return;
      const idx = +inp.dataset.countIdx;
      const active = _loadActiveCount();
      if (active && active.items && active.items[idx]) {
        active.items[idx].counted_qty = Number(inp.value||0);
        active.items[idx]._uploaded = false;
        _saveActiveCount(active);
        _renderCountTable();
        _scheduleBatchUpload();
      }
    });
    document.getElementById('count-body')?.addEventListener('click', e => {
      const btn = e.target.closest('button[data-count-remove]'); if (!btn) return;
      const active = _loadActiveCount();
      if (active && active.items) {
        active.items.splice(+btn.dataset.countRemove, 1);
        _saveActiveCount(active);
        _renderCountTable();
      }
    });

    updateInvStats();
    // Resume button visibility
    if (_loadActiveCount()) {
      const rb = document.getElementById('btn-count-resume');
      if (rb) rb.style.display = 'inline-flex';
    }
    // Low stock alerts polling
    refreshLowStockAlerts();
    if (window._lowStockTimer) clearInterval(window._lowStockTimer);
    window._lowStockTimer = setInterval(refreshLowStockAlerts, 5 * 60 * 1000);
  }

  // Expose new globals
  window.openKardexModal = openKardexModal;
  window.openLowStockAlerts = openLowStockAlerts;
  window.refreshLowStockAlerts = refreshLowStockAlerts;
  window.openStockAdjustModal = openStockAdjustModal;
  window.exportMovementsCSV = exportMovementsCSV;

  /* ---------- Cuts (Cortes) Module ---------- */
  function _activeCutId() { try { return sessionStorage.getItem('volvix:active_cut_id') || null; } catch(e){ return null; } }
  function _setActiveCutId(id) { try { id ? sessionStorage.setItem('volvix:active_cut_id', id) : sessionStorage.removeItem('volvix:active_cut_id'); } catch(e){} }
  function _activeCutData() { try { return JSON.parse(sessionStorage.getItem('volvix:active_cut') || 'null'); } catch(e){ return null; } }
  function _setActiveCutData(d) { try { d ? sessionStorage.setItem('volvix:active_cut', JSON.stringify(d)) : sessionStorage.removeItem('volvix:active_cut'); } catch(e){} }

  async function openCut() {
    const balance = parseFloat(document.getElementById('ap-balance').value);
    const msg = document.getElementById('ap-msg');
    msg.textContent = '';
    if (isNaN(balance) || balance < 0) { msg.textContent = 'Saldo inicial inválido'; return; }
    const breakdown = {
      b500: parseInt(document.getElementById('ap-b500').value,10)||0,
      b200: parseInt(document.getElementById('ap-b200').value,10)||0,
      b100: parseInt(document.getElementById('ap-b100').value,10)||0,
      coins: parseFloat(document.getElementById('ap-coins').value)||0
    };
    const notes = document.getElementById('ap-notes').value.trim();
    const shift = document.getElementById('ap-shift').value;
    const session = _vSession();
    const payload = {
      tenant_id: _vTenant(),
      cashier_id: session.user_id || session.email,
      cashier_email: session.email || 'unknown',
      shift,
      opening_balance: balance,
      opening_breakdown: breakdown,
      notes,
      opened_at: new Date().toISOString()
    };
    const btn = document.getElementById('btn-open-cut');
    btn.disabled = true; btn.textContent = '⏳ Abriendo…';
    try {
      const r = await _authFetch('/api/cuts/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) {
        if (r.status === 404 || r.status === 405) {
          const localId = 'CUT-LOCAL-' + Date.now();
          _setActiveCutId(localId);
          _setActiveCutData(Object.assign({ id: localId, _local: true }, payload));
          showToast('⚠ Caja abierta localmente (server no disponible)');
          renderAperturaState();
          return;
        }
        const err = await r.json().catch(()=>({}));
        msg.textContent = err.error || err.message || ('HTTP ' + r.status);
        return;
      }
      const data = await r.json();
      const cutId = data.id || data.cut_id || data.cutId;
      _setActiveCutId(cutId);
      _setActiveCutData(Object.assign({ id: cutId }, payload, data));
      showToast('✓ Caja abierta · ' + cutId);
      renderAperturaState();
    } catch(e) {
      const localId = 'CUT-LOCAL-' + Date.now();
      _setActiveCutId(localId);
      _setActiveCutData(Object.assign({ id: localId, _local: true }, payload));
      showToast('⚠ Sin conexión - caja abierta localmente');
      renderAperturaState();
    } finally {
      btn.disabled = false; btn.textContent = 'Abrir caja';
    }
  }

  // ============================================================
  // R4c — Cortes hardening (GAP-Z1..Z4): alerts + adjustment audit + reopen
  // ============================================================
  async function r4cCheckPending(cutId) {
    if (!cutId) return { open_count: 0, open_sales: [] };
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/check-pending');
      if (!r.ok) return { open_count: 0, open_sales: [] };
      return await r.json();
    } catch(e) { return { open_count: 0, open_sales: [] }; }
  }
  async function r4cRefreshOpenSalesAlert() {
    const cutId = _activeCutId();
    const alert = document.getElementById('r4c-open-sales-alert');
    const list = document.getElementById('r4c-open-sales-list');
    if (!cutId || !alert) return;
    const data = await r4cCheckPending(cutId);
    if (!data.open_count) { alert.classList.add('hidden'); return; }
    alert.classList.remove('hidden');
    list.innerHTML = data.open_sales.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #ffe69c;">
        <span><strong>${escapeHtml(s.folio||s.id.slice(0,8))}</strong> · ${escapeHtml(s.status)} · ${fmt(Number(s.total||0))}</span>
        <span style="font-size:10px;color:#664d03;">${escapeHtml(new Date(s.created_at).toLocaleString('es-MX'))}</span>
      </div>`).join('') || '<em>sin detalle</em>';
  }
  async function r4cLoadAdjustments() {
    const cutId = _activeCutId();
    const wrap = document.getElementById('r4c-adjustments-bar');
    const list = document.getElementById('r4c-adj-list');
    if (!cutId || !wrap) return;
    wrap.classList.remove('hidden');
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/adjustments');
      if (!r.ok) { list.innerHTML = '<em style="color:var(--text-3);">No se pudieron cargar ajustes.</em>'; return; }
      const data = await r.json();
      const items = data.adjustments || [];
      if (!items.length) { list.innerHTML = '<em style="color:var(--text-3);">Sin ajustes registrados</em>'; return; }
      list.innerHTML = `
        <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">Δ aplicado: <strong>${fmt(Number(data.applied_delta||0))}</strong> · pendiente aprobación: <strong style="color:var(--warn);">${fmt(Number(data.pending_approval_amount||0))}</strong></div>
        <table class="tbl" style="width:100%;font-size:11px;">
          <thead><tr><th>Tipo</th><th class="num">Monto</th><th>Razón</th><th>Estado</th><th></th></tr></thead>
          <tbody>${items.map(a => {
            let estado = 'aplicado';
            let color = 'var(--success)';
            if (a.rejected_at) { estado = 'rechazado'; color = 'var(--danger)'; }
            else if (a.requires_approval && !a.approved_at) { estado = 'pendiente aprobación'; color = 'var(--warn)'; }
            else if (a.approved_at) { estado = 'aprobado'; color = 'var(--success)'; }
            const canApprove = (a.requires_approval && !a.approved_at && !a.rejected_at);
            return `<tr>
              <td>${escapeHtml(a.type)}</td>
              <td class="num">${fmt(Number(a.amount||0))}</td>
              <td>${escapeHtml((a.reason||'').slice(0,80))}</td>
              <td style="color:${color};font-weight:600;">${estado}</td>
              <td>${canApprove ? `<button class="btn sm" data-r4c-approve="${escapeAttr(a.id)}">Aprobar</button> <button class="btn sm danger" data-r4c-reject="${escapeAttr(a.id)}">Rechazar</button>` : ''}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
      list.querySelectorAll('button[data-r4c-approve]').forEach(b => {
        b.onclick = () => r4cApproveAdj(cutId, b.dataset.r4cApprove);
      });
      list.querySelectorAll('button[data-r4c-reject]').forEach(b => {
        b.onclick = () => r4cRejectAdj(cutId, b.dataset.r4cReject);
      });
    } catch(e) { list.innerHTML = '<em style="color:var(--danger);">Error: '+escapeHtml(e.message||e)+'</em>'; }
  }
  async function r4cSubmitAdjustment() {
    const cutId = _activeCutId();
    if (!cutId) { showToast('Sin caja activa'); return; }
    const type = document.getElementById('r4c-adj-type').value;
    const amount = parseFloat(document.getElementById('r4c-adj-amount').value);
    const reason = document.getElementById('r4c-adj-reason').value.trim();
    if (!isFinite(amount) || amount === 0) { showToast('Monto inválido (no puede ser 0)'); return; }
    if (reason.length < 10) { showToast('La razón debe tener mínimo 10 caracteres'); return; }
    const btn = document.getElementById('r4c-adj-submit');
    btn.disabled = true; btn.textContent = '⏳ Registrando…';
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/adjustment', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ type, amount, reason })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) { showToast('Error: ' + (data.message||data.error||r.status)); return; }
      showToast(data.requires_approval ? '⚠ Ajuste registrado · requiere aprobación owner' : '✓ Ajuste aplicado');
      document.getElementById('r4c-adj-amount').value = '';
      document.getElementById('r4c-adj-reason').value = '';
      document.getElementById('r4c-adj-form').style.display = 'none';
      r4cLoadAdjustments();
    } catch(e) { showToast('Error: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Registrar ajuste'; }
  }
  async function r4cApproveAdj(cutId, adjId) {
    if (!confirm('¿Aprobar este ajuste? Quedará registrado en la auditoría.')) return;
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/adjustment/' + encodeURIComponent(adjId) + '/approve', { method: 'POST' });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) { showToast('Error: ' + (data.message||data.error||r.status)); return; }
      showToast('✓ Ajuste aprobado');
      r4cLoadAdjustments();
    } catch(e) { showToast('Error: ' + e.message); }
  }
  async function r4cRejectAdj(cutId, adjId) {
    const reason = prompt('Razón del rechazo (mínimo 10 caracteres):');
    if (!reason || reason.trim().length < 10) { showToast('Razón muy corta'); return; }
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/adjustment/' + encodeURIComponent(adjId) + '/reject', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) { showToast('Error: ' + (data.message||data.error||r.status)); return; }
      showToast('✓ Ajuste rechazado');
      r4cLoadAdjustments();
    } catch(e) { showToast('Error: ' + e.message); }
  }
  async function r4cReopenZ() {
    const cutId = _activeCutId();
    if (!cutId) { showToast('Sin corte activo'); return; }
    const reason = (document.getElementById('r4c-reopen-reason').value||'').trim();
    if (reason.length < 20) { showToast('La razón debe tener mínimo 20 caracteres'); return; }
    if (!confirm('¿Reabrir el corte Z? Esta acción queda auditada y bloquea la impresión Z hasta re-cerrar.')) return;
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/reopen', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ reason })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) { showToast('Error: ' + (data.message||data.error||r.status)); return; }
      showToast('✓ Corte reabierto');
      document.getElementById('r4c-reopen-reason').value = '';
      loadCutSummary();
    } catch(e) { showToast('Error: ' + e.message); }
  }
  // Helper: only show reopen bar to owner/superadmin
  function r4cMaybeShowReopenBar() {
    try {
      const session = _vSession();
      const role = session.role || (window.__user && window.__user.role) || '';
      const bar = document.getElementById('r4c-reopen-bar');
      if (!bar) return;
      const cut = _activeCutData() || {};
      // Show bar to owner/superadmin AND when cut is closed (or reopened)
      if (['owner','superadmin'].includes(String(role).toLowerCase()) && (cut.closed_at || cut.status === 'closed' || cut.status === 'reopened')) {
        bar.classList.remove('hidden');
      } else {
        bar.classList.add('hidden');
      }
    } catch(_) {}
  }

  async function loadCutSummary() {
    const cutId = _activeCutId();
    const noSession = document.getElementById('corte-no-session');
    const withSession = document.getElementById('corte-with-session');
    if (!cutId) { noSession?.classList.remove('hidden'); withSession?.classList.add('hidden'); return; }
    noSession?.classList.add('hidden'); withSession?.classList.remove('hidden');
    // R4c GAP-Z1/Z2/Z4: refresh open-sales alert + adjustments + reopen bar
    r4cRefreshOpenSalesAlert();
    r4cLoadAdjustments();
    r4cMaybeShowReopenBar();
    const cut = _activeCutData() || {};
    const $set = (id,v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    $set('cs-opening', fmt(Number(cut.opening_balance||0)));
    $set('cs-cut-id', cut.id || cutId);
    $set('cs-opened-at', cut.opened_at ? new Date(cut.opened_at).toLocaleString('es-MX') : '—');
    try {
      const r = await _authFetch('/api/cuts/' + encodeURIComponent(cutId) + '/summary');
      if (r.ok) {
        const s = await r.json();
        $set('cs-cash', fmt(Number(s.cash_sales||s.cash||0)));
        $set('cs-card', fmt(Number(s.card_sales||s.card||0)));
        $set('cs-transfer', fmt(Number(s.transfer_sales||s.transfer||0)));
        $set('cs-credits', fmt(Number(s.credit_payments||s.credits||0)));
        $set('cs-expenses', '-' + fmt(Number(s.expenses||0)));
        const expected = Number(cut.opening_balance||0) + Number(s.cash_sales||s.cash||0) + Number(s.credit_payments||s.credits||0) - Number(s.expenses||0);
        $set('cs-expected', fmt(expected));
        sessionStorage.setItem('volvix:cut_expected', String(expected));
      } else {
        const exp = Number(cut.opening_balance||0);
        $set('cs-cash', fmt(0)); $set('cs-card', fmt(0)); $set('cs-transfer', fmt(0));
        $set('cs-credits', fmt(0)); $set('cs-expenses', '-' + fmt(0));
        $set('cs-expected', fmt(exp));
        sessionStorage.setItem('volvix:cut_expected', String(exp));
      }
    } catch(e) {
      const exp = Number(cut.opening_balance||0);
      $set('cs-expected', fmt(exp));
      sessionStorage.setItem('volvix:cut_expected', String(exp));
    }
    updateCloseCount();
  }

  window.updateCloseCount = function() {
    const b500 = parseInt(document.getElementById('cnt-b500')?.value||0,10);
    const b200 = parseInt(document.getElementById('cnt-b200')?.value||0,10);
    const b100 = parseInt(document.getElementById('cnt-b100')?.value||0,10);
    const b50  = parseInt(document.getElementById('cnt-b50')?.value||0,10);
    const b20  = parseInt(document.getElementById('cnt-b20')?.value||0,10);
    const coins = parseFloat(document.getElementById('cnt-coins')?.value||0);
    const total = b500*500 + b200*200 + b100*100 + b50*50 + b20*20 + coins;
    const expected = parseFloat(sessionStorage.getItem('volvix:cut_expected')||'0');
    const diff = total - expected;
    const $t = document.getElementById('cnt-total');
    const $d = document.getElementById('cnt-diff');
    if ($t) $t.textContent = fmt(total);
    if ($d) {
      $d.textContent = (diff>=0?'+':'') + fmt(diff);
      $d.style.color = Math.abs(diff) < 0.01 ? 'var(--success)' : (diff<0 ? 'var(--danger)' : 'var(--warn)');
    }
  };

  async function closeCut() {
    const cutId = _activeCutId();
    if (!cutId) { showToast('No hay caja abierta'); return; }
    // R6b GAP-S3: bloquear cierre Z si hay ventas offline pendientes (no sincronizadas)
    try {
      const pendingOffline = (typeof __volvixCountOfflineSalesPending === 'function')
        ? await __volvixCountOfflineSalesPending() : 0;
      if (pendingOffline > 0) {
        showToast('⚠ Hay ' + pendingOffline + ' venta(s) offline pendientes. No puedes cerrar Z hasta que se sincronicen.', 'error');
        // Forzar trigger sync para que el SW intente drenar
        try {
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
          }
        } catch (_) {}
        return;
      }
    } catch (_) { /* si falla check, dejar pasar pero el server retornará 409 OFFLINE_QUEUE_DIRTY */ }
    const b500 = parseInt(document.getElementById('cnt-b500').value||0,10);
    const b200 = parseInt(document.getElementById('cnt-b200').value||0,10);
    const b100 = parseInt(document.getElementById('cnt-b100').value||0,10);
    const b50 = parseInt(document.getElementById('cnt-b50').value||0,10);
    const b20 = parseInt(document.getElementById('cnt-b20').value||0,10);
    const coins = parseFloat(document.getElementById('cnt-coins').value||0);
    const counted = b500*500 + b200*200 + b100*100 + b50*50 + b20*20 + coins;
    const notes = document.getElementById('cnt-notes').value.trim();
    const expected = parseFloat(sessionStorage.getItem('volvix:cut_expected')||'0');
    const discrepancy = counted - expected;
    const ok = confirm('¿Cerrar corte?\nContado: ' + fmt(counted) + '\nEsperado: ' + fmt(expected) + '\nDiscrepancia: ' + fmt(discrepancy));
    if (!ok) return;
    const payload = {
      cut_id: cutId, tenant_id: _vTenant(),
      closing_balance: counted, closing_breakdown: { b500, b200, b100, b50, b20, coins },
      counted_bills: { b500, b200, b100, b50, b20 }, counted_coins: coins,
      expected_balance: expected, discrepancy, notes, closed_at: new Date().toISOString()
    };
    const btn = document.getElementById('btn-close-cut');
    btn.disabled = true; btn.textContent = '⏳ Cerrando…';
    try {
      const r = await _authFetch('/api/cuts/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      // R4c GAP-Z1: bloqueo por ventas abiertas / R6b GAP-S3: bloqueo por offline queue
      if (r.status === 409) {
        const err = await r.json().catch(()=>({}));
        if (err && err.error_code === 'OPEN_SALES_BLOCK_CLOSE') {
          showToast('⚠ ' + (err.open_count || 0) + ' venta(s) pendiente(s). Resuélvelas antes de cerrar.');
          await r4cRefreshOpenSalesAlert();
          return;
        }
        if (err && err.error_code === 'OFFLINE_QUEUE_DIRTY') {
          showToast('⚠ Hay ventas offline sin sincronizar. Espera a que se procesen e intenta otra vez.', 'error');
          try {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
            }
          } catch (_) {}
          return;
        }
        showToast('Error al cerrar: ' + (err.error||err.message||'409'));
        return;
      }
      const result = r.ok ? await r.json() : null;
      if (!r.ok && r.status !== 404) {
        const err = await r.json().catch(()=>({}));
        showToast('Error al cerrar: ' + (err.error||err.message||r.status));
        return;
      }
      if (!r.ok) { await idbQueue('cuts_pending', payload); showToast('⚠ Cierre guardado offline'); }
      else showToast('✓ Corte cerrado');
      printCutReceipt(Object.assign({}, _activeCutData() || {}, payload, result || {}));
      _setActiveCutId(null);
      _setActiveCutData(null);
      renderAperturaState();
      loadCutSummary();
    } catch(e) {
      await idbQueue('cuts_pending', payload);
      showToast('⚠ Sin conexión - cierre en cola: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Cerrar corte';
    }
  }

  function printCutReceipt(cut) {
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) { showToast('Permite popups para imprimir'); return; }
    const html = `<!DOCTYPE html><html><head><title>Corte ${escapeHtml(cut.cut_id||cut.id||'')}</title>
      <style>body{font-family:'Courier New',monospace;font-size:12px;margin:20px;max-width:340px;}
      h2{text-align:center;margin:0 0 10px;}
      .row{display:flex;justify-content:space-between;padding:3px 0;}
      .total{border-top:2px dashed #000;border-bottom:2px dashed #000;padding:6px 0;margin:8px 0;font-weight:bold;}
      .actions{margin-top:20px;text-align:center;}
      .actions button{padding:8px 16px;margin:0 4px;cursor:pointer;}
      @media print{.actions{display:none;}}</style>
      </head><body>
      <h2>CORTE DE CAJA</h2>
      <div style="text-align:center;font-size:11px;">${escapeHtml(cut.cut_id||cut.id||'—')}</div>
      <div style="text-align:center;font-size:11px;">${new Date().toLocaleString('es-MX')}</div>
      <hr>
      <div class="row"><span>Cajero:</span><span>${escapeHtml(cut.cashier_email||'—')}</span></div>
      <div class="row"><span>Apertura:</span><span>${escapeHtml(cut.opened_at?new Date(cut.opened_at).toLocaleString('es-MX'):'—')}</span></div>
      <div class="row"><span>Cierre:</span><span>${escapeHtml(cut.closed_at?new Date(cut.closed_at).toLocaleString('es-MX'):'—')}</span></div>
      <div class="row total"><span>Saldo inicial:</span><span>${fmt(Number(cut.opening_balance||0))}</span></div>
      <div class="row"><span>Saldo esperado:</span><span>${fmt(Number(cut.expected_balance||0))}</span></div>
      <div class="row"><span>Saldo contado:</span><span>${fmt(Number(cut.closing_balance||0))}</span></div>
      <div class="row total"><span>Discrepancia:</span><span>${fmt(Number(cut.discrepancy||0))}</span></div>
      ${cut.notes ? `<div style="margin-top:10px;font-size:11px;">Notas: ${escapeHtml(cut.notes)}</div>` : ''}
      <div class="actions">
        <button onclick="window.print()">🖨 Imprimir</button>
        <button onclick="window.close()">Cerrar</button>
      </div>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  }

  async function showCutsHistory() {
    let m = document.getElementById('modal-cuts-history');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'modal-cuts-history';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
    m.innerHTML = `
      <div style="background:#fff;color:#1C1917;border-radius:12px;padding:18px;width:880px;max-width:96vw;max-height:88vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <strong style="font-size:16px;">📜 Historial de cortes</strong>
          <button id="ch-close" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
          <input type="date" id="ch-from" class="btn">
          <input type="date" id="ch-to" class="btn">
          <input type="text" id="ch-cashier" placeholder="Cajero…" class="btn" style="min-width:140px;">
          <button class="btn" id="ch-load">🔄 Buscar</button>
        </div>
        <div id="ch-content"><p style="text-align:center;color:#888;padding:20px;">⏳ Cargando…</p></div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelector('#ch-close').onclick = close;
    m.addEventListener('click', e => { if (e.target===m) close(); });
    m.querySelector('#ch-load').onclick = () => loadCutsHistoryList(m);
    loadCutsHistoryList(m);
  }
  async function loadCutsHistoryList(m) {
    const content = m.querySelector('#ch-content');
    content.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">⏳ Cargando…</p>';
    const params = new URLSearchParams({ tenant_id: _vTenant() });
    const from = m.querySelector('#ch-from').value;
    const to = m.querySelector('#ch-to').value;
    const cashier = m.querySelector('#ch-cashier').value.trim();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (cashier) params.set('cashier', cashier);
    try {
      const r = await _authFetch('/api/cuts?' + params.toString());
      if (!r.ok) { content.innerHTML = '<p style="text-align:center;color:var(--danger);padding:20px;">Error HTTP ' + r.status + '</p>'; return; }
      const data = await r.json();
      const items = Array.isArray(data) ? data : (data.items || []);
      if (!items.length) { content.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Sin cortes en el rango</p>'; return; }
      content.innerHTML = `
        <table class="tbl" style="width:100%;">
          <thead><tr><th>Fecha apertura</th><th>Cajero</th><th class="num">Apertura</th><th class="num">Cierre</th><th class="num">Ventas</th><th class="num">Discrepancia</th><th></th></tr></thead>
          <tbody>${items.map(c => {
            const d = Number(c.discrepancy||0);
            const dColor = Math.abs(d)<0.01?'var(--success)':(d<0?'var(--danger)':'var(--warn)');
            return `<tr>
              <td>${escapeHtml(c.opened_at?new Date(c.opened_at).toLocaleString('es-MX'):'—')}</td>
              <td>${escapeHtml(c.cashier_email||c.cashier||'—')}</td>
              <td class="num">${fmt(Number(c.opening_balance||0))}</td>
              <td class="num">${fmt(Number(c.closing_balance||0))}</td>
              <td class="num">${fmt(Number(c.total_sales||c.sales_total||0))}</td>
              <td class="num" style="color:${dColor};font-weight:600;">${fmt(d)}</td>
              <td><button class="btn sm" data-cut-id="${escapeAttr(c.id||c.cut_id||'')}">Ver</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
      content.querySelectorAll('button[data-cut-id]').forEach(b => {
        b.onclick = () => printCutReceipt(items.find(x => (x.id||x.cut_id) === b.dataset.cutId) || {});
      });
    } catch(e) {
      content.innerHTML = '<p style="text-align:center;color:var(--danger);padding:20px;">Error: ' + escapeHtml(e.message||e) + '</p>';
    }
  }

  function renderAperturaState() {
    const cutId = _activeCutId();
    const active = document.getElementById('apertura-active');
    const formCard = document.getElementById('apertura-form-card');
    const sub = document.getElementById('apertura-sub');
    const session = _vSession();
    const cashEl = document.getElementById('ap-cashier');
    if (cashEl && !cashEl.value) cashEl.value = session.email || session.user_id || 'Usuario';
    if (cutId) {
      const cut = _activeCutData() || {};
      active?.classList.remove('hidden');
      formCard?.classList.add('hidden');
      const info = document.getElementById('apertura-active-info');
      if (info) info.textContent = (cut.id||cutId) + ' · saldo $' + Number(cut.opening_balance||0).toFixed(2) + ' · ' + (cut.opened_at?new Date(cut.opened_at).toLocaleString('es-MX'):'');
      if (sub) sub.textContent = 'Caja abierta · ID: ' + (cut.id||cutId);
    } else {
      active?.classList.add('hidden');
      formCard?.classList.remove('hidden');
      if (sub) sub.textContent = 'Registra el efectivo inicial del turno';
    }
  }

  function initCutsModule() {
    document.getElementById('btn-open-cut')?.addEventListener('click', openCut);
    document.getElementById('btn-close-cut')?.addEventListener('click', closeCut);
    document.getElementById('btn-cuts-history')?.addEventListener('click', showCutsHistory);
    document.getElementById('btn-cuts-refresh')?.addEventListener('click', loadCutSummary);
    // R4c hardening wiring
    document.getElementById('r4c-refresh-pending')?.addEventListener('click', r4cRefreshOpenSalesAlert);
    document.getElementById('r4c-show-adj-form')?.addEventListener('click', () => {
      const f = document.getElementById('r4c-adj-form');
      if (f) f.style.display = (f.style.display === 'none' ? 'block' : 'none');
    });
    document.getElementById('r4c-adj-cancel')?.addEventListener('click', () => {
      const f = document.getElementById('r4c-adj-form'); if (f) f.style.display = 'none';
    });
    document.getElementById('r4c-adj-submit')?.addEventListener('click', r4cSubmitAdjustment);
    document.getElementById('r4c-reopen-btn')?.addEventListener('click', r4cReopenZ);
    renderAperturaState();
    const origShow = window.showScreen;
    if (typeof origShow === 'function' && !window._showScreenWrapped) {
      window._showScreenWrapped = true;
      window.showScreen = function(name){
        origShow.apply(this, arguments);
        if (name === 'corte') loadCutSummary();
        if (name === 'apertura') renderAperturaState();
        if (name === 'inventario' && typeof updateInvStats === 'function') {
          updateInvStats();
          refreshAdjustProductOptions();
        }
      };
    }
  }

  /* ---------- Reports Module ---------- */
  function _ensureChartJs() {
    return new Promise((resolve) => {
      if (window.Chart) return resolve(window.Chart);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = () => resolve(window.Chart);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  function _today() { return new Date().toISOString().slice(0,10); }
  function _daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
  function _csvEscape(v) { const s = v==null?'':String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; }
  function _downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(_csvEscape).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  const REPORT_DEFS = {
    'sales-day': {
      title: '📈 Ventas por día',
      api: (from,to) => '/api/reports/sales?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&group_by=day&tenant_id=' + encodeURIComponent(_vTenant()),
      cols: ['Fecha','Tickets','Total','Ticket promedio'],
      mapRow: r => [r.date||r.day||r.label, r.txn_count||r.count||0, fmt(Number(r.total||0)), fmt(Number(r.avg_ticket||r.average||0))],
      csvRow: r => [r.date||r.day||r.label, r.txn_count||r.count||0, Number(r.total||0).toFixed(2), Number(r.avg_ticket||r.average||0).toFixed(2)],
      chart: (data) => ({
        type:'line',
        data: { labels: data.map(r=>r.date||r.day||r.label), datasets: [{ label:'Total $', data: data.map(r=>Number(r.total||0)), borderColor:'#EA580C', backgroundColor:'rgba(234,88,12,0.15)', tension:0.3, fill:true }] }
      })
    },
    'top-products': {
      title: '🏆 Top productos',
      api: (from,to) => '/api/reports/top-products?limit=20&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&tenant_id=' + encodeURIComponent(_vTenant()),
      cols: ['Producto','Código','Cantidad','Revenue','Margen'],
      mapRow: r => [r.name||r.product, r.code||'—', r.qty||r.quantity||0, fmt(Number(r.revenue||0)), fmt(Number(r.margin||0))],
      csvRow: r => [r.name||r.product, r.code||'', r.qty||r.quantity||0, Number(r.revenue||0).toFixed(2), Number(r.margin||0).toFixed(2)],
      chart: (data) => ({
        type:'bar',
        data: { labels: data.slice(0,10).map(r=>r.name||r.product), datasets: [{ label:'Cantidad', data: data.slice(0,10).map(r=>Number(r.qty||r.quantity||0)), backgroundColor:'#2D5F8F' }] }
      })
    },
    'top-customers': {
      title: '👥 Clientes top',
      api: (from,to) => '/api/reports/top-customers?limit=20&from=' + encodeURIComponent(from) + '&tenant_id=' + encodeURIComponent(_vTenant()),
      cols: ['Cliente','Total gastado','Tickets','Ticket promedio','Última compra'],
      mapRow: r => [r.name||r.customer, fmt(Number(r.total_spent||r.total||0)), r.txns||r.count||0, fmt(Number(r.avg_ticket||0)), r.last_purchase?new Date(r.last_purchase).toLocaleDateString('es-MX'):'—'],
      csvRow: r => [r.name||r.customer, Number(r.total_spent||r.total||0).toFixed(2), r.txns||r.count||0, Number(r.avg_ticket||0).toFixed(2), r.last_purchase||''],
      chart: null
    },
    'inventory-turnover': {
      title: '🔄 Rotación inventario',
      api: () => '/api/reports/inventory-turnover?tenant_id=' + encodeURIComponent(_vTenant()),
      cols: ['Producto','Stock actual','Días en stock','Vendido (30d)','Velocidad'],
      mapRow: r => [r.name||r.product, r.stock||0, r.days_in_stock||r.days||'—', r.qty_sold||r.sold||0, (r.velocity!=null?Number(r.velocity).toFixed(2):'—')],
      csvRow: r => [r.name||r.product, r.stock||0, r.days_in_stock||r.days||'', r.qty_sold||r.sold||0, r.velocity||''],
      chart: null
    },
    'profit': {
      title: '💰 Ganancias',
      api: (from,to) => '/api/reports/profit?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&tenant_id=' + encodeURIComponent(_vTenant()),
      cols: ['Producto','Ventas qty','Costo total','Ingreso total','Margen $','Margen %'],
      mapRow: r => [r.name||r.product, r.qty||0, fmt(Number(r.cost_total||0)), fmt(Number(r.revenue||0)), fmt(Number(r.margin||0)), (r.margin_pct!=null?Number(r.margin_pct).toFixed(1)+'%':'—')],
      csvRow: r => [r.name||r.product, r.qty||0, Number(r.cost_total||0).toFixed(2), Number(r.revenue||0).toFixed(2), Number(r.margin||0).toFixed(2), r.margin_pct||''],
      chart: null
    },
    'by-cashier': {
      title: '🧑‍💼 Por cajero',
      api: (from,to) => '/api/reports/by-cashier?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&tenant_id=' + encodeURIComponent(_vTenant()),
      cols: ['Cajero','Tickets','Total ventas','Ticket promedio','Descuentos'],
      mapRow: r => [r.cashier||r.email, r.txns||r.count||0, fmt(Number(r.total||0)), fmt(Number(r.avg_ticket||0)), fmt(Number(r.discounts||0))],
      csvRow: r => [r.cashier||r.email, r.txns||r.count||0, Number(r.total||0).toFixed(2), Number(r.avg_ticket||0).toFixed(2), Number(r.discounts||0).toFixed(2)],
      chart: (data) => ({
        type:'bar',
        data: { labels: data.map(r=>r.cashier||r.email), datasets: [{ label:'Total $', data: data.map(r=>Number(r.total||0)), backgroundColor:'#16A34A' }] }
      })
    }
  };

  window.openReport = async function(key) {
    const def = REPORT_DEFS[key];
    if (!def) { showToast('Reporte no implementado'); return; }
    let m = document.getElementById('modal-report');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'modal-report';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
    m.innerHTML = `
      <div style="background:#fff;color:#1C1917;border-radius:12px;padding:18px;width:960px;max-width:96vw;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:16px;">${escapeHtml(def.title)}</strong>
          <button id="rep-close" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
          <label style="font-size:12px;">Desde <input type="date" id="rep-from" value="${_daysAgo(30)}" class="btn"></label>
          <label style="font-size:12px;">Hasta <input type="date" id="rep-to" value="${_today()}" class="btn"></label>
          <button class="btn" id="rep-load">🔄 Actualizar</button>
          <button class="btn" id="rep-csv">📥 Exportar CSV</button>
        </div>
        ${def.chart ? '<div style="height:280px;margin-bottom:10px;"><canvas id="rep-chart"></canvas></div>' : ''}
        <div id="rep-table-wrap" style="flex:1;overflow:auto;"><p style="text-align:center;color:#888;padding:20px;">⏳ Cargando…</p></div>
      </div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); };
    m.querySelector('#rep-close').onclick = close;
    m.addEventListener('click', e => { if (e.target===m) close(); });
    let lastData = [];
    const reload = async () => {
      const from = m.querySelector('#rep-from').value;
      const to = m.querySelector('#rep-to').value;
      const wrap = m.querySelector('#rep-table-wrap');
      wrap.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">⏳ Cargando…</p>';
      try {
        const r = await _authFetch(def.api(from, to));
        if (!r.ok) {
          if (r.status === 404) {
            wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-3);">
              <div style="font-size:32px;margin-bottom:8px;">🚧</div>
              <strong>Endpoint no implementado</strong>
              <p style="font-size:12px;margin-top:6px;">El backend no expone aún <code>${escapeHtml(def.api(from,to).split('?')[0])}</code>.<br>Reporte estará disponible al desplegarlo.</p>
            </div>`;
            return;
          }
          const err = await r.json().catch(()=>({}));
          wrap.innerHTML = '<p style="text-align:center;color:var(--danger);padding:20px;">Error: ' + escapeHtml(err.error||err.message||('HTTP '+r.status)) + '</p>';
          showToast('Error cargando reporte','error');
          return;
        }
        const data = await r.json();
        const items = Array.isArray(data) ? data : (data.items || data.data || []);
        lastData = items;
        if (!items.length) {
          wrap.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-3);"><div style="font-size:32px;">📭</div><strong>Sin datos en el rango seleccionado</strong></div>';
          return;
        }
        wrap.innerHTML = `<table class="tbl" style="width:100%;">
          <thead><tr>${def.cols.map(c => '<th>' + escapeHtml(c) + '</th>').join('')}</tr></thead>
          <tbody>${items.map(it => '<tr>' + def.mapRow(it).map(v => '<td>' + escapeHtml(String(v)) + '</td>').join('') + '</tr>').join('')}</tbody>
        </table>`;
        if (def.chart) {
          const Chart = await _ensureChartJs();
          if (Chart) {
            const ctx = m.querySelector('#rep-chart');
            if (window._repChart) { try { window._repChart.destroy(); } catch(e){} }
            const cfg = def.chart(items);
            window._repChart = new Chart(ctx, Object.assign({ options:{responsive:true,maintainAspectRatio:false} }, cfg));
          }
        }
      } catch(e) {
        wrap.innerHTML = '<p style="text-align:center;color:var(--danger);padding:20px;">Error: ' + escapeHtml(e.message||e) + '</p>';
        showToast('Error de red: ' + (e.message||e), 'error');
      }
    };
    m.querySelector('#rep-load').onclick = reload;
    m.querySelector('#rep-csv').onclick = () => {
      if (!lastData.length) { showToast('No hay datos para exportar'); return; }
      const rows = [def.cols].concat(lastData.map(def.csvRow));
      _downloadCSV(key + '_' + _today() + '.csv', rows);
      showToast('✓ CSV exportado');
    };
    reload();
  };

  function initReportsModule() { /* cards use onclick="openReport(...)"; nothing extra needed */ }

  /* ---------- IndexedDB helper for offline cache/queue ---------- */
  function _idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('volvix_pos_phase1', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        ['inventory_movements','inventory_movements_pending','inventory_counts_pending','cuts_pending'].forEach(s => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath:'_k', autoIncrement:true });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGetAll(store) {
    try {
      const db = await _idb();
      return new Promise((res) => {
        const tx = db.transaction(store,'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });
    } catch(e) { return []; }
  }
  async function idbPutAll(store, items) {
    try {
      const db = await _idb();
      return new Promise((res) => {
        const tx = db.transaction(store,'readwrite');
        const os = tx.objectStore(store);
        os.clear();
        items.forEach(it => os.add(Object.assign({}, it)));
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
    } catch(e) { return false; }
  }
  async function idbQueue(store, item) {
    try {
      const db = await _idb();
      return new Promise((res) => {
        const tx = db.transaction(store,'readwrite');
        tx.objectStore(store).add(Object.assign({ _queued_at: Date.now() }, item));
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
    } catch(e) { return false; }
  }

  /* ============================================================
     B39 — Real handlers replacing stub showToast() calls
     Notificaciones, Mayoreo, Catálogo Panel/Visual, Cambiar Precio,
     Venta Pendiente, Selector Cliente, Forzar Sync, Respaldar,
     QuickPos Cobrar.
     ============================================================ */

  // ---- Generic modal helper ----
  function _b39Modal(id, innerHtml, onClose) {
    let modal = document.getElementById(id);
    if (modal) { modal.remove(); }
    modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99990;';
    modal.innerHTML = innerHtml;
    document.body.appendChild(modal);
    const close = () => { if (typeof onClose === 'function') onClose(); modal.remove(); };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    return { modal, close };
  }

  // ============================================================
  // 1) NOTIFICACIONES — fetch real + dropdown
  // ============================================================
  window.openNotificationsPanel = async function () {
    const { modal, close } = _b39Modal('modal-notifications', `
      <div style="background:#fff;color:#1C1917;border-radius:12px;width:420px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #E7E5E4;">
          <h2 style="margin:0;font-size:18px;font-weight:700;">🔔 Notificaciones</h2>
          <button id="bn-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>
        </div>
        <div id="bn-list" style="flex:1;overflow-y:auto;padding:12px 16px;min-height:120px;">
          <div style="text-align:center;padding:24px;color:#78716C;">Cargando…</div>
        </div>
        <div style="padding:10px 16px;border-top:1px solid #E7E5E4;display:flex;gap:8px;justify-content:flex-end;">
          <button id="bn-mark-all" class="btn">Marcar todas como leídas</button>
        </div>
      </div>
    `);
    modal.querySelector('#bn-close').onclick = close;

    async function loadList() {
      const list = modal.querySelector('#bn-list');
      list.innerHTML = '<div style="text-align:center;padding:24px;color:#78716C;">Cargando…</div>';
      try {
        const r = await _authFetch('/api/notifications?unread=1&limit=50');
        if (!r.ok) {
          list.innerHTML = '<div style="text-align:center;padding:24px;color:#EF4444;">Error: HTTP ' + r.status + '</div>';
          return;
        }
        const data = await r.json();
        const items = (data && data.items) || (Array.isArray(data) ? data : []);
        if (!items.length) {
          list.innerHTML = '<div style="text-align:center;padding:32px;color:#78716C;">Sin notificaciones nuevas</div>';
          // Update badge on toolbar
          const badge = document.querySelector('.tb-btn.notif .badge');
          if (badge) badge.textContent = '0';
          return;
        }
        list.innerHTML = items.map(n => {
          const ts = n.created_at ? new Date(n.created_at).toLocaleString('es-MX') : '';
          const title = escapeHtml(n.title || n.subject || 'Notificación');
          const body = escapeHtml(n.body || n.message || '');
          const id = escapeAttr(String(n.id || ''));
          return `<div class="b39-notif" data-nid="${id}" style="padding:10px 12px;border-bottom:1px solid #F5F5F4;cursor:pointer;">
            <div style="font-weight:600;font-size:13px;">${title}</div>
            <div style="font-size:12px;color:#57534E;margin-top:2px;">${body}</div>
            <div style="font-size:10px;color:#A8A29E;margin-top:4px;">${ts}</div>
          </div>`;
        }).join('');
        const badge = document.querySelector('.tb-btn.notif .badge');
        if (badge) badge.textContent = String(items.length);
        list.querySelectorAll('.b39-notif').forEach(div => {
          div.onclick = async () => {
            const nid = div.getAttribute('data-nid');
            try {
              await _authFetch('/api/notifications/' + encodeURIComponent(nid) + '/read', { method: 'POST' });
              div.style.opacity = '0.5';
            } catch(e){}
          };
        });
      } catch (err) {
        list.innerHTML = '<div style="text-align:center;padding:24px;color:#EF4444;">Sin conexión: ' + escapeHtml(err.message || String(err)) + '</div>';
      }
    }
    modal.querySelector('#bn-mark-all').onclick = async () => {
      try {
        await _authFetch('/api/notifications/read-all', { method: 'POST' });
        showToast('✓ Todas marcadas como leídas');
        loadList();
      } catch(e) { showToast('Error: ' + (e.message || e), 'error'); }
    };
    loadList();
  };

  // ============================================================
  // 2) PRECIO MAYOREO — toggle tier, persist in sessionStorage
  // ============================================================
  let PRICE_TIER = (function(){ try { return sessionStorage.getItem('volvix:price_tier') || 'menudeo'; } catch(e){ return 'menudeo'; } })();
  function _applyTierVisual() {
    const btn = document.getElementById('btn-mayoreo');
    if (!btn) return;
    if (PRICE_TIER === 'mayoreo') {
      btn.style.background = 'rgba(243,156,18,0.15)';
      btn.style.outline = '2px solid #F39C12';
      btn.title = 'Mayoreo ACTIVO · clic para volver a menudeo';
    } else {
      btn.style.background = '';
      btn.style.outline = '';
      btn.title = 'Precio mayoreo';
    }
  }
  window.togglePriceTier = function () {
    PRICE_TIER = (PRICE_TIER === 'mayoreo') ? 'menudeo' : 'mayoreo';
    try { sessionStorage.setItem('volvix:price_tier', PRICE_TIER); } catch(e){}
    _applyTierVisual();
    // If wholesale, recalculate cart prices using product.wholesale_price when available
    if (CART && CART.length) {
      CART.forEach(item => {
        const p = CATALOG.find(x => x.code === item.code);
        if (!p) return;
        if (PRICE_TIER === 'mayoreo') {
          const wp = Number(p.wholesale_price || p.price_wholesale || p.price_mayoreo || 0);
          if (wp > 0) { item._original_price = item._original_price || item.price; item.price = wp; }
        } else {
          if (item._original_price) { item.price = item._original_price; delete item._original_price; }
        }
      });
      renderCart();
    }
    showToast(PRICE_TIER === 'mayoreo' ? '✓ Precios MAYOREO activados' : '✓ Precios MENUDEO activados');
  };
  setTimeout(_applyTierVisual, 200);

  // ============================================================
  // 3) PANEL CATÁLOGO (lista compacta) y CATÁLOGO VISUAL (grid)
  // ============================================================
  function _renderCatalogModal(visual) {
    const list = (CATALOG || []).slice();
    const tier = PRICE_TIER;
    function cardHtml(p) {
      const price = (tier === 'mayoreo' && p.wholesale_price) ? Number(p.wholesale_price) : Number(p.price || 0);
      if (visual) {
        return `<div class="b39-prod" data-code="${escapeAttr(p.code||'')}" style="border:1px solid #E7E5E4;border-radius:10px;padding:10px;cursor:pointer;background:#fff;display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:32px;text-align:center;">📦</div>
          <div style="font-weight:600;font-size:12px;">${escapeHtml(p.name||'')}</div>
          <div style="font-size:11px;color:#78716C;">${escapeHtml(p.code||'')}</div>
          <div style="font-weight:700;color:#27AE60;">${fmt(price)}</div>
          <div style="font-size:10px;color:#A8A29E;">Stock: ${p.stock||0}</div>
        </div>`;
      }
      return `<tr class="b39-prod" data-code="${escapeAttr(p.code||'')}" style="cursor:pointer;">
        <td class="mono" style="padding:6px;font-size:11px;">${escapeHtml(p.code||'')}</td>
        <td style="padding:6px;">${escapeHtml(p.name||'')}</td>
        <td class="num" style="padding:6px;">${fmt(price)}</td>
        <td style="padding:6px;text-align:center;">${p.stock||0}</td>
      </tr>`;
    }
    const inner = visual
      ? `<div id="b39-cat-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:12px;">${list.map(cardHtml).join('')}</div>`
      : `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#F5F5F4;text-align:left;"><th style="padding:8px;">Código</th><th style="padding:8px;">Producto</th><th style="padding:8px;text-align:right;">Precio</th><th style="padding:8px;text-align:center;">Stock</th></tr></thead><tbody id="b39-cat-grid">${list.map(cardHtml).join('')}</tbody></table>`;
    return inner;
  }
  function _wireCatalogModal(modal, close) {
    function applyFilter() {
      const q = (modal.querySelector('#b39-cat-search').value || '').toLowerCase().trim();
      modal.querySelectorAll('.b39-prod').forEach(el => {
        const code = (el.getAttribute('data-code') || '').toLowerCase();
        const text = el.textContent.toLowerCase();
        el.style.display = (!q || code.includes(q) || text.includes(q)) ? '' : 'none';
      });
    }
    modal.querySelector('#b39-cat-search').oninput = applyFilter;
    modal.querySelectorAll('.b39-prod').forEach(el => {
      el.onclick = () => {
        const code = el.getAttribute('data-code');
        const p = CATALOG.find(x => x.code === code);
        if (!p) return;
        const price = (PRICE_TIER === 'mayoreo' && p.wholesale_price) ? Number(p.wholesale_price) : Number(p.price || 0);
        addToCart({ ...p, price });
        showToast('+ ' + p.name);
      };
    });
  }
  window.openCatalogPanel = function () {
    const html = _renderCatalogModal(false);
    const { modal, close } = _b39Modal('modal-cat-panel', `
      <div style="background:#fff;color:#1C1917;border-radius:12px;width:680px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #E7E5E4;">
          <h2 style="margin:0;font-size:17px;font-weight:700;">📒 Panel catálogo rápido</h2>
          <button id="bcp-close" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:10px 14px;border-bottom:1px solid #F5F5F4;">
          <input id="b39-cat-search" type="text" placeholder="Buscar por código o nombre…" style="width:100%;padding:8px 10px;border:1px solid #E7E5E4;border-radius:8px;font-size:13px;">
        </div>
        <div style="flex:1;overflow:auto;">${html}</div>
      </div>
    `);
    modal.querySelector('#bcp-close').onclick = close;
    _wireCatalogModal(modal, close);
  };
  window.openVisualCatalog = function () {
    const html = _renderCatalogModal(true);
    const { modal, close } = _b39Modal('modal-cat-visual', `
      <div style="background:#fff;color:#1C1917;border-radius:12px;width:840px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #E7E5E4;">
          <h2 style="margin:0;font-size:17px;font-weight:700;">🖼️ Catálogo visual</h2>
          <button id="bcv-close" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:10px 14px;border-bottom:1px solid #F5F5F4;">
          <input id="b39-cat-search" type="text" placeholder="Buscar producto…" style="width:100%;padding:8px 10px;border:1px solid #E7E5E4;border-radius:8px;font-size:13px;">
        </div>
        <div style="flex:1;overflow:auto;background:#FAFAF9;">${html}</div>
      </div>
    `);
    modal.querySelector('#bcv-close').onclick = close;
    _wireCatalogModal(modal, close);
  };

  // ============================================================
  // 4) CAMBIAR PRECIO — modal for selected cart line
  // ============================================================
  window.openChangePriceModal = function () {
    if (!CART.length) { showToast('Carrito vacío'); return; }
    if (SELECTED_CART_INDEX < 0 || SELECTED_CART_INDEX >= CART.length) {
      SELECTED_CART_INDEX = CART.length - 1;
      renderCart();
    }
    const item = CART[SELECTED_CART_INDEX];
    const product = CATALOG.find(p => p.code === item.code);
    const minPrice = product ? Number(product.min_price || product.precio_minimo || 0) : 0;
    const { modal, close } = _b39Modal('modal-change-price', `
      <div style="background:#fff;color:#1C1917;border-radius:12px;width:380px;max-width:90vw;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="margin:0;font-size:17px;font-weight:700;">F5 · Cambiar precio</h2>
          <button id="bcp-close" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div style="font-size:13px;margin-bottom:12px;color:#57534E;">
          <strong>${escapeHtml(item.name)}</strong><br>
          Precio actual: ${fmt(item.price)}
          ${minPrice > 0 ? '<br>Precio mínimo: ' + fmt(minPrice) : ''}
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">
          Nuevo precio
          <input id="bcp-new-price" type="number" min="0" step="0.01" value="${item.price}" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;">
        </label>
        <div id="bcp-msg" style="font-size:12px;color:#EF4444;min-height:16px;margin-top:8px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
          <button id="bcp-cancel" class="btn">Cancelar</button>
          <button id="bcp-ok" class="btn accent">Aplicar</button>
        </div>
      </div>
    `);
    modal.querySelector('#bcp-close').onclick = close;
    modal.querySelector('#bcp-cancel').onclick = close;
    setTimeout(() => modal.querySelector('#bcp-new-price').select(), 50);
    modal.querySelector('#bcp-ok').onclick = () => {
      const v = Number(modal.querySelector('#bcp-new-price').value);
      const msg = modal.querySelector('#bcp-msg');
      if (!Number.isFinite(v) || v < 0) { msg.textContent = 'Precio inválido'; return; }
      if (minPrice > 0 && v < minPrice) { msg.textContent = 'El precio no puede ser menor a ' + fmt(minPrice); return; }
      // GAP-4: marca la línea con override info para audit en el backend.
      // El handler POST /api/sales detecta line.price !== product.price y graba pos_price_overrides.
      item._override_original_price = (item._override_original_price !== undefined) ? item._override_original_price : item.price;
      item.price = v;
      item.override_reason = item.override_reason || 'manual_change';
      delete item._original_price;
      renderCart();
      close();
      showToast('✓ Precio actualizado: ' + fmt(v));
    };
  };

  // ============================================================
  // 5) VENTA PENDIENTE — save current cart, restore later
  // ============================================================
  window.savePendingSale = async function () {
    if (!CART.length) { showToast('No hay productos para guardar'); return; }
    const session = JSON.parse(localStorage.getItem('volvixSession') || 'null') || {};
    const payload = {
      tenant_id: session.tenant_id || _vTenant(),
      user_id: session.user_id || session.id || null,
      items: CART.map(i => ({ product_id: i.id || null, code: i.code, name: i.name, price: i.price, qty: i.qty })),
      total: CART.reduce((s,i) => s + i.price * i.qty, 0),
      saved_at: Date.now()
    };
    try {
      const r = await _authFetch('/api/sales/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        const saved = await r.json();
        const ref = (saved && (saved.id || saved.reference)) || ('LOCAL-' + Date.now().toString(36));
        try { localStorage.setItem('volvix:last_pending_id', String(ref)); } catch(e){}
        CART = []; renderCart();
        showToast('✓ Venta pendiente guardada · Ref: ' + ref);
      } else {
        // fallback to local idb queue
        await idbQueue('sales_pending', payload);
        CART = []; renderCart();
        showToast('⚠ Pendiente guardada offline');
      }
    } catch (e) {
      await idbQueue('sales_pending', payload);
      CART = []; renderCart();
      showToast('⚠ Sin conexión - pendiente en cola');
    }
  };
  window.restorePendingSale = async function () {
    try {
      const r = await _authFetch('/api/sales/pending');
      if (!r.ok) { showToast('No se pudo cargar pendientes'); return; }
      const data = await r.json();
      const items = (data && data.items) || (Array.isArray(data) ? data : []);
      if (!items.length) { showToast('No hay ventas pendientes'); return; }
      const choice = items[0]; // load most recent; could open modal to choose
      if (CART.length && !confirm('El carrito tiene productos. ¿Reemplazar con la venta pendiente?')) return;
      CART = (choice.items || []).map(it => ({
        id: it.product_id, code: it.code, name: it.name,
        price: Number(it.price)||0, qty: Number(it.qty)||1, stock: 0
      }));
      renderCart();
      showToast('✓ Venta pendiente recuperada · Ref: ' + (choice.id || ''));
      // Optionally remove from server
      if (choice.id) { try { await _authFetch('/api/sales/pending/' + encodeURIComponent(choice.id), { method: 'DELETE' }); } catch(e){} }
    } catch(e) { showToast('Error: ' + (e.message || e), 'error'); }
  };

  // ============================================================
  // 6) SELECTOR DE CLIENTE — search modal w/ autocomplete
  // ============================================================
  let CART_CUSTOMER = null;
  window.openCustomerSelector = function () {
    const { modal, close } = _b39Modal('modal-cust-sel', `
      <div style="background:#fff;color:#1C1917;border-radius:12px;width:520px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #E7E5E4;">
          <h2 style="margin:0;font-size:17px;font-weight:700;">👤 Asignar cliente</h2>
          <button id="bcs-close" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:12px 16px;border-bottom:1px solid #F5F5F4;">
          <input id="bcs-search" type="text" placeholder="Buscar por nombre, teléfono o email…" autofocus
            style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;">
        </div>
        <div id="bcs-results" style="flex:1;overflow:auto;padding:8px;min-height:200px;"></div>
        <div style="padding:10px 16px;border-top:1px solid #E7E5E4;display:flex;gap:8px;justify-content:space-between;align-items:center;">
          <button id="bcs-clear" class="btn">Quitar cliente</button>
          <button id="bcs-new" class="btn accent">+ Nuevo cliente</button>
        </div>
      </div>
    `);
    modal.querySelector('#bcs-close').onclick = close;
    let timer = null;
    async function search(q) {
      const box = modal.querySelector('#bcs-results');
      box.innerHTML = '<div style="text-align:center;padding:20px;color:#78716C;">Buscando…</div>';
      try {
        const url = '/api/customers' + (q ? ('?search=' + encodeURIComponent(q)) : '');
        const r = await _authFetch(url);
        if (!r.ok) { box.innerHTML = '<div style="text-align:center;padding:20px;color:#EF4444;">Error: HTTP ' + r.status + '</div>'; return; }
        const data = await r.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        if (!items.length) { box.innerHTML = '<div style="text-align:center;padding:20px;color:#78716C;">Sin resultados</div>'; return; }
        const filtered = q ? items.filter(c => {
          const ql = q.toLowerCase();
          return (c.name||'').toLowerCase().includes(ql) || (c.phone||'').includes(q) || (c.email||'').toLowerCase().includes(ql);
        }) : items;
        box.innerHTML = filtered.slice(0, 50).map(c => `
          <div class="b39-cust" data-id="${escapeAttr(String(c.id||''))}" data-name="${escapeAttr(c.name||'')}"
            style="padding:10px 12px;border-bottom:1px solid #F5F5F4;cursor:pointer;">
            <div style="font-weight:600;">${escapeHtml(c.name||'(sin nombre)')}</div>
            <div style="font-size:12px;color:#78716C;">${escapeHtml(c.phone||'')} · ${escapeHtml(c.email||'')}</div>
            <div style="font-size:11px;color:#A8A29E;">Crédito: ${fmt(c.credit_limit||0)} · Saldo: ${fmt(c.credit_balance||0)}</div>
          </div>
        `).join('');
        box.querySelectorAll('.b39-cust').forEach(el => {
          el.onclick = () => {
            CART_CUSTOMER = { id: el.getAttribute('data-id'), name: el.getAttribute('data-name') };
            try { sessionStorage.setItem('volvix:cart_customer', JSON.stringify(CART_CUSTOMER)); } catch(e){}
            close();
            showToast('✓ Cliente asignado: ' + CART_CUSTOMER.name);
            _renderCustomerHeader();
          };
        });
      } catch (err) {
        box.innerHTML = '<div style="text-align:center;padding:20px;color:#EF4444;">Sin conexión</div>';
      }
    }
    modal.querySelector('#bcs-search').oninput = (e) => {
      clearTimeout(timer);
      const v = e.target.value.trim();
      timer = setTimeout(() => search(v), 250);
    };
    modal.querySelector('#bcs-clear').onclick = () => {
      CART_CUSTOMER = null;
      try { sessionStorage.removeItem('volvix:cart_customer'); } catch(e){}
      close();
      showToast('Cliente quitado de la venta');
      _renderCustomerHeader();
    };
    modal.querySelector('#bcs-new').onclick = () => {
      close();
      if (typeof openNewCustomerModal === 'function') openNewCustomerModal();
    };
    search('');
  };
  function _renderCustomerHeader() {
    let badge = document.getElementById('cart-customer-badge');
    if (!badge) {
      const tabs = document.querySelector('.pos-tabs');
      if (!tabs) return;
      badge = document.createElement('div');
      badge.id = 'cart-customer-badge';
      badge.style.cssText = 'margin-left:auto;padding:4px 10px;background:var(--accent-soft,#DBEAFE);color:var(--accent,#2563EB);border-radius:6px;font-size:12px;font-weight:600;display:none;';
      tabs.appendChild(badge);
    }
    if (CART_CUSTOMER) {
      badge.textContent = '👤 ' + CART_CUSTOMER.name;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
  // restore on load
  try {
    const saved = sessionStorage.getItem('volvix:cart_customer');
    if (saved) { CART_CUSTOMER = JSON.parse(saved); setTimeout(_renderCustomerHeader, 300); }
  } catch(e){}

  // ============================================================
  // 7) FORZAR SYNC — hooks volvix-sync.js
  // ============================================================
  window.forceSync = async function (btn) {
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Sincronizando…'; }
    try {
      // Try common sync APIs in order of availability
      let result = null;
      if (window.VolvixSync && typeof window.VolvixSync.syncNow === 'function') {
        result = await window.VolvixSync.syncNow();
      } else if (window.volvixSync && typeof window.volvixSync.sync === 'function') {
        result = await window.volvixSync.sync();
      } else if (typeof window.flushOfflineQueue === 'function') {
        result = await window.flushOfflineQueue();
      } else {
        // Manually flush localStorage queue
        const queue = JSON.parse(localStorage.getItem('volvix:wiring:queue') || '[]');
        let ok = 0, fail = 0;
        for (const job of queue) {
          try {
            const r = await _authFetch(job.endpoint, {
              method: job.method || 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(job.data || {})
            });
            if (r.ok) ok++; else fail++;
          } catch(e) { fail++; }
        }
        if (ok > 0) localStorage.setItem('volvix:wiring:queue', JSON.stringify(queue.slice(ok)));
        result = { ok, fail, total: queue.length };
      }
      const summary = result && typeof result === 'object'
        ? '✓ Sync · ok:' + (result.ok||0) + ' fail:' + (result.fail||0)
        : '✓ Sincronización completada';
      showToast(summary);
    } catch (err) {
      showToast('Error sync: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  };

  // ============================================================
  // 8) RESPALDAR — POST /api/admin/backup/trigger or local export
  // ============================================================
  window.triggerBackup = async function (btn) {
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Respaldando…'; }
    try {
      const r = await _authFetch('/api/admin/backup/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        showToast('✓ Respaldo iniciado' + (data.id ? ' · ' + data.id : ''));
        if (data.download_url) {
          const a = document.createElement('a');
          a.href = data.download_url; a.download = 'backup-' + Date.now() + '.json';
          document.body.appendChild(a); a.click(); a.remove();
        }
        return;
      }
      // Fallback: local export
      const tnt = _vTenant();
      const local = {
        version: 1, generated_at: new Date().toISOString(), tenant_id: tnt,
        catalog: CATALOG, customers: CUSTOMERS, sales: SALES, cart: CART
      };
      const blob = new Blob([JSON.stringify(local, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'volvix-backup-' + tnt + '-' + Date.now() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast('✓ Respaldo local descargado');
    } catch (err) {
      showToast('Error respaldo: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  };

  // ============================================================
  // 9) QUICKPOS COBRAR — register sale with cash default
  // ============================================================
  window.quickPosCobrar = async function () {
    // R7b FIX-S2: GUARD GLOBAL anti double-submit (mismo patron que completePay)
    if (window.__volvixSaleInFlight) {
      console.warn('[volvix] QuickPos sale already in flight, ignoring double-submit');
      return;
    }
    // Identificar boton "Cobrar" del teclado QuickPos para deshabilitarlo
    const _qpBtn = (typeof event !== 'undefined' && event && event.target && event.target.closest)
      ? event.target.closest('button.quickpos-key.accent')
      : document.querySelector('button.quickpos-key.accent');
    if (_qpBtn) {
      _qpBtn.disabled = true;
      _qpBtn.classList.add('processing');
      _qpBtn.dataset.originalText = _qpBtn.dataset.originalText || _qpBtn.textContent;
      _qpBtn.textContent = 'Procesando...';
    }
    window.__volvixSaleInFlight = true;
    try {
      const raw = (typeof qpVal !== 'undefined' ? qpVal : '');
      const amount = parseFloat(raw);
      if (!Number.isFinite(amount) || amount <= 0) { showToast('Ingresa un monto válido'); return; }
      const session = JSON.parse(localStorage.getItem('volvixSession') || 'null') || {};
      const folioEl = $('#currentFolio'); const folio = folioEl ? parseInt(folioEl.textContent) || 1 : 1;
      const saleData = {
        tenant_id: session.tenant_id || _vTenant(),
        user_id: session.user_id || 'USR001',
        cashier_email: session.email || 'unknown',
        ticket_number: 'QP-' + folio,
        items: [{ product_id: null, code: 'QUICKPOS', name: 'Cobro rápido', price: amount, qty: 1, subtotal: amount }],
        total: amount,
        payment_method: 'efectivo',
        timestamp: Date.now(),
        mode: 'quickpos'
      };
      // R6b GAP-S5: idempotency-key determinista para QuickPos también
      const _qpIdem = await __volvixDeterministicIdemKey(saleData);
      saleData.idempotency_key = _qpIdem;
      const _qpToken = (window.VolvixAuth && window.VolvixAuth.getToken && window.VolvixAuth.getToken())
        || localStorage.getItem('volvix_token')
        || localStorage.getItem('volvixAuthToken') || '';
      try {
        const r = await _authFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': _qpIdem },
          body: JSON.stringify(saleData)
        });
        if (r.ok) {
          const saved = await r.json();
          showToast('✓ Cobro ' + (saved.id || 'OK') + ' · ' + fmt(amount));
        } else if (r.status === 409) {
          // R10a FIX-N1-4: stock race
          try {
            const errBody = await r.json();
            if (errBody && (errBody.error === 'STOCK_INSUFFICIENT' || errBody.error_code === 'STOCK_INSUFFICIENT')) {
              showToast('⚠ Sin stock: otro cajero vendio el ultimo (disp: ' + (errBody.available != null ? errBody.available : 0) + ')', 'error');
              return;
            }
            showToast('Error: ' + (errBody.message || errBody.error || 'conflict'), 'error');
          } catch (_) {
            showToast('Error 409 en cobro', 'error');
          }
        } else {
          // R6b GAP-S2: enqueue robusto con auth/idem
          await __volvixEnqueueSaleOffline(saleData, _qpIdem, null, _qpToken);
          showToast('⚠ Cobro en cola offline · ' + fmt(amount));
        }
      } catch (e) {
        await __volvixEnqueueSaleOffline(saleData, _qpIdem, null, _qpToken);
        showToast('⚠ Sin conexión · cobro en cola: ' + fmt(amount));
      }
      if (typeof qpVal !== 'undefined') { qpVal = ''; const d = $('#qp-display'); if (d) d.textContent = '$0.00'; }
    } finally {
      // R7b FIX-S2: SIEMPRE liberar guard y rehabilitar boton
      window.__volvixSaleInFlight = false;
      if (_qpBtn) {
        _qpBtn.disabled = false;
        _qpBtn.classList.remove('processing');
        _qpBtn.textContent = _qpBtn.dataset.originalText || 'Cobrar';
      }
    }
  };

  // ============================================================
  // B40 P1 fixes — 4 dead buttons wired to real handlers
  // ============================================================

  // Helper: descarga CSV con BOM UTF-8 (Excel-friendly)
  function _vlxDownloadCSV(filename, headers, rows) {
    var csv = '﻿' + headers.join(',') + '\n';
    rows.forEach(function (r) {
      csv += headers.map(function (h) {
        var v = r[h] != null ? String(r[h]) : '';
        if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  // P1 #1+#2: Dashboard export CSV + print summary
  window.exportDashboardCSV = async function () {
    showToast('Generando CSV…');
    try {
      var token = (window.VolvixAuth && window.VolvixAuth.getToken && window.VolvixAuth.getToken()) || localStorage.getItem('volvix_token') || '';
      var res = await fetch('/api/dashboard/today', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      var d = await res.json();
      var rows = [{
        metric: 'Ventas hoy', valor: d.sales_today != null ? d.sales_today : 'N/A',
      }, {
        metric: 'Tickets', valor: d.tickets_today != null ? d.tickets_today : 'N/A',
      }, {
        metric: 'Conversión', valor: d.conversion_today != null ? d.conversion_today : 'N/A',
      }, {
        metric: 'Productos bajo stock', valor: d.low_stock_count != null ? d.low_stock_count : 'N/A',
      }];
      var fn = 'dashboard-' + new Date().toISOString().slice(0, 10) + '.csv';
      _vlxDownloadCSV(fn, ['metric', 'valor'], rows);
      showToast('✓ Dashboard exportado: ' + fn);
    } catch (e) {
      showToast('Error exportando: ' + (e.message || 'desconocido'));
    }
  };

  window.printDashboardSummary = function () {
    showToast('Preparando vista de impresión…');
    var w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { showToast('Bloqueado por popup blocker'); return; }
    var dash = document.getElementById('screen-dashboard') || document.querySelector('.kpi-grid');
    var html = dash ? dash.innerHTML : '<p>No hay datos del dashboard</p>';
    var dateStr = new Date().toLocaleString('es-MX');
    w.document.write(
      '<!doctype html><html><head><title>Dashboard — Volvix POS</title>' +
      '<style>body{font-family:Inter,sans-serif;padding:24px;color:#111}h1{margin-bottom:4px}' +
      '.sub{color:#666;font-size:13px;margin-bottom:24px}' +
      '.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}' +
      '.kpi{padding:14px;border:1px solid #ddd;border-radius:8px}' +
      '.kpi-label{font-size:11px;color:#666;text-transform:uppercase}' +
      '.kpi-value{font-size:28px;font-weight:700;margin:4px 0}' +
      '.kpi-sub{font-size:12px;color:#999}' +
      '.trend-up{color:#16a34a}.trend-down{color:#dc2626}' +
      '@media print{body{padding:8px}}</style></head><body>' +
      '<h1>📊 Dashboard — Resumen del día</h1>' +
      '<div class="sub">Generado: ' + dateStr + '</div>' +
      '<div class="kpi-grid">' + html + '</div>' +
      '</body></html>'
    );
    w.document.close();
    setTimeout(function () { w.print(); }, 500);
  };

  // P1 #3+#4: Historial date filter + export CSV
  window.openHistorialDateFilter = function () {
    var modal = document.getElementById('vlx-hist-filter-modal');
    if (modal) { modal.style.display = 'flex'; return; }
    modal = document.createElement('div');
    modal.id = 'vlx-hist-filter-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    var todayIso = new Date().toISOString().slice(0, 10);
    var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    modal.innerHTML =
      '<div style="background:#fff;padding:24px;border-radius:8px;width:380px;max-width:90vw">' +
      '<h3 style="margin:0 0 16px">📅 Filtrar Historial</h3>' +
      '<label style="display:block;margin-bottom:8px"><span style="font-size:12px;color:#666">Desde</span><br>' +
      '<input id="vlx-hist-from" type="date" value="' + weekAgo + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px"></label>' +
      '<label style="display:block;margin-bottom:16px"><span style="font-size:12px;color:#666">Hasta</span><br>' +
      '<input id="vlx-hist-to" type="date" value="' + todayIso + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px"></label>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button onclick="document.getElementById(\'vlx-hist-filter-modal\').remove()" style="padding:8px 14px;background:#eee;border:none;border-radius:4px;cursor:pointer">Cancelar</button>' +
      '<button onclick="window.applyHistorialFilter()" style="padding:8px 14px;background:#2D5F8F;color:#fff;border:none;border-radius:4px;cursor:pointer">Aplicar</button>' +
      '</div></div>';
    document.body.appendChild(modal);
  };

  window.applyHistorialFilter = function () {
    var from = document.getElementById('vlx-hist-from').value;
    var to = document.getElementById('vlx-hist-to').value;
    if (!from || !to) { showToast('Selecciona ambas fechas'); return; }
    sessionStorage.setItem('vlx:hist:from', from);
    sessionStorage.setItem('vlx:hist:to', to);
    document.getElementById('vlx-hist-filter-modal').remove();
    showToast('✓ Filtro aplicado: ' + from + ' → ' + to + '. Recargando…');
    // Trigger reload of historial data via custom event
    try { window.dispatchEvent(new CustomEvent('vlx:historial:filter', { detail: { from: from, to: to } })); } catch (_) {}
    // Best-effort reload via showScreen()
    if (typeof showScreen === 'function') showScreen('ventas');
  };

  window.exportHistorialCSV = async function () {
    showToast('Exportando historial…');
    try {
      var token = (window.VolvixAuth && window.VolvixAuth.getToken && window.VolvixAuth.getToken()) || localStorage.getItem('volvix_token') || '';
      var from = sessionStorage.getItem('vlx:hist:from') || '';
      var to = sessionStorage.getItem('vlx:hist:to') || '';
      var qs = '?limit=1000';
      if (from) qs += '&from=' + from;
      if (to) qs += '&to=' + to;
      var res = await fetch('/api/sales' + qs, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      var data = await res.json();
      var sales = Array.isArray(data) ? data : (data.sales || data.data || data.items || []);
      if (!sales.length) { showToast('No hay ventas en el rango seleccionado'); return; }
      var rows = sales.map(function (s) {
        return {
          id: s.id || '',
          fecha: s.created_at || s.sold_at || '',
          total: s.total != null ? s.total : '',
          metodo: s.payment_method || '',
          items: Array.isArray(s.items) ? s.items.length : '',
          cajero: s.cashier_name || s.pos_user_id || ''
        };
      });
      var fn = 'historial-ventas-' + new Date().toISOString().slice(0, 10) + '.csv';
      _vlxDownloadCSV(fn, ['id', 'fecha', 'total', 'metodo', 'items', 'cajero'], rows);
      showToast('✓ Exportadas ' + rows.length + ' ventas: ' + fn);
    } catch (e) {
      showToast('Error: ' + (e.message || 'desconocido'));
    }
  };

  /* ==========================================================
     B43 — UI MODULES: Devoluciones · Promociones · Cotizaciones
     ========================================================== */

  // -------- Shared helpers --------
  window._vlxFormatDate = function (d) {
    if (!d) return '—';
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (e) { return String(d); }
  };
  window._vlxFormatDateTime = function (d) {
    if (!d) return '—';
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(d); }
  };
  window._vlxFormatMoney = function (n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  window._vlxIsManager = function () {
    try {
      var s = JSON.parse(localStorage.getItem('volvixSession') || 'null') || {};
      var role = (s.role || '').toLowerCase();
      return role === 'superadmin' || role === 'admin' || role === 'manager' || role === 'owner';
    } catch (e) { return false; }
  };
  // Generic modal — accepts inner HTML.
  window._vlxOpenModal = function (innerHTML, opts) {
    opts = opts || {};
    var existing = document.getElementById('vlx-modal-generic');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'vlx-modal-generic';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99995;padding:14px;';
    var width = opts.width || '640px';
    modal.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:#fff;color:#1C1917;border-radius:12px;width:' + width + ';max-width:96vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 22px 60px rgba(0,0,0,0.32);overflow:hidden;">' +
      innerHTML +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal && opts.dismissable !== false) window._vlxCloseModal(); });
    document.addEventListener('keydown', window._vlxOnEscapeOnce, { once: true });
    return modal;
  };
  window._vlxOnEscapeOnce = function (e) { if (e.key === 'Escape') window._vlxCloseModal(); };
  window._vlxCloseModal = function () {
    var m = document.getElementById('vlx-modal-generic');
    if (m) m.remove();
  };
  // Typed-word destructive confirm
  window._vlxConfirmDestructive = function (msg, action, opts) {
    opts = opts || {};
    var word = opts.word || 'BORRAR';
    var safeMsg = escapeHtml(msg || '¿Confirmar acción destructiva?');
    var html =
      '<div style="padding:22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<strong style="font-size:16px;color:#B91C1C;">⚠️ Confirmación destructiva</strong>' +
        '<button onclick="_vlxCloseModal()" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#666;">&times;</button>' +
      '</div>' +
      '<div style="padding:22px;">' +
        '<p style="margin:0 0 14px 0;font-size:14px;line-height:1.5;">' + safeMsg + '</p>' +
        '<p style="font-size:12px;color:#666;margin:0 0 8px 0;">Para confirmar, escribe <code style="background:#F5F5F4;padding:2px 6px;border-radius:4px;font-weight:600;">' + escapeHtml(word) + '</code></p>' +
        '<input id="vlx-cd-input" type="text" autocomplete="off" autocapitalize="characters" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;text-transform:uppercase;">' +
      '</div>' +
      '<div style="padding:14px 22px;background:#F5F5F4;display:flex;gap:8px;justify-content:flex-end;">' +
        '<button onclick="_vlxCloseModal()" style="padding:9px 16px;border:1px solid #D6D3D1;background:#fff;border-radius:8px;cursor:pointer;font-weight:500;">Cancelar</button>' +
        '<button id="vlx-cd-confirm" disabled style="padding:9px 16px;border:none;background:#B91C1C;color:#fff;border-radius:8px;cursor:not-allowed;opacity:0.5;font-weight:600;">Confirmar</button>' +
      '</div>';
    var modal = window._vlxOpenModal(html, { width: '460px' });
    var input = modal.querySelector('#vlx-cd-input');
    var btn = modal.querySelector('#vlx-cd-confirm');
    input.addEventListener('input', function () {
      var ok = input.value.trim().toUpperCase() === word.toUpperCase();
      btn.disabled = !ok;
      btn.style.cursor = ok ? 'pointer' : 'not-allowed';
      btn.style.opacity = ok ? '1' : '0.5';
    });
    btn.addEventListener('click', function () {
      window._vlxCloseModal();
      try { if (typeof action === 'function') action(); } catch (e) { showToast('Error: ' + (e.message || e)); }
    });
    setTimeout(function () { input.focus(); }, 80);
  };

  // Status badge helper
  function _vlxStatusBadge(status) {
    var s = String(status || '').toLowerCase();
    var color = '#6B7280', bg = '#F3F4F6', label = s || '—';
    var map = {
      pending:   { color: '#92400E', bg: '#FEF3C7', label: 'Pendiente' },
      approved:  { color: '#065F46', bg: '#D1FAE5', label: 'Aprobada' },
      rejected:  { color: '#991B1B', bg: '#FEE2E2', label: 'Rechazada' },
      completed: { color: '#1E3A8A', bg: '#DBEAFE', label: 'Completada' },
      draft:     { color: '#374151', bg: '#E5E7EB', label: 'Borrador' },
      sent:      { color: '#1E3A8A', bg: '#DBEAFE', label: 'Enviada' },
      accepted:  { color: '#065F46', bg: '#D1FAE5', label: 'Aceptada' },
      expired:   { color: '#6B7280', bg: '#E5E7EB', label: 'Expirada' },
      converted: { color: '#5B21B6', bg: '#EDE9FE', label: 'Convertida' },
      active:    { color: '#065F46', bg: '#D1FAE5', label: 'Activa' },
      paused:    { color: '#92400E', bg: '#FEF3C7', label: 'Pausada' },
      scheduled: { color: '#1E3A8A', bg: '#DBEAFE', label: 'Programada' }
    };
    if (map[s]) { color = map[s].color; bg = map[s].bg; label = map[s].label; }
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + bg + ';color:' + color + ';font-size:11px;font-weight:600;">' + escapeHtml(label) + '</span>';
  }

  /* ============================================================
     MODULE 1 — DEVOLUCIONES
     ============================================================ */
  window._RETURNS_CACHE = [];

  window.loadReturns = async function () {
    var tbody = document.getElementById('ret-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-3);">⏳ Cargando devoluciones…</td></tr>';
    try {
      var status = (document.getElementById('ret-filter-status') || {}).value || '';
      var customer = ((document.getElementById('ret-filter-customer') || {}).value || '').trim().toLowerCase();
      var from = (document.getElementById('ret-filter-from') || {}).value || '';
      var to = (document.getElementById('ret-filter-to') || {}).value || '';
      var qs = '?tenant_id=' + encodeURIComponent(_vTenant());
      if (status) qs += '&status=' + encodeURIComponent(status);
      if (from) qs += '&from=' + encodeURIComponent(from);
      if (to) qs += '&to=' + encodeURIComponent(to);
      var r = await _authFetch('/api/returns' + qs);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var data = await r.json();
      var items = Array.isArray(data) ? data : (data.items || data.returns || []);
      if (customer) {
        items = items.filter(function (it) {
          return String(it.customer_name || it.customer || '').toLowerCase().indexOf(customer) >= 0;
        });
      }
      window._RETURNS_CACHE = items;
      renderReturnsTable(items);
      updateReturnsStats(items);
    } catch (err) {
      console.error('[returns] loadReturns:', err);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--danger,#B91C1C);">Error cargando devoluciones: ' + escapeHtml(err.message || String(err)) + '</td></tr>';
      showToast('Error cargando devoluciones');
    }
  };

  function renderReturnsTable(items) {
    var tbody = document.getElementById('ret-body');
    if (!tbody) return;
    var sub = document.getElementById('ret-sub');
    if (sub) sub.textContent = items.length + (items.length === 1 ? ' devolución' : ' devoluciones');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-3);">No hay devoluciones registradas.</td></tr>';
      return;
    }
    var isMgr = _vlxIsManager();
    tbody.innerHTML = items.map(function (rt) {
      var rid = rt.id || rt.return_id || '';
      var saleRef = rt.sale_id || rt.sale_folio || rt.original_sale || '—';
      var cust = rt.customer_name || rt.customer || 'Público en general';
      var itemsCount = Array.isArray(rt.items) ? rt.items.length : (rt.items_count || 0);
      var total = Number(rt.total || rt.amount || 0);
      var status = String(rt.status || 'pending').toLowerCase();
      var ridSafe = escapeAttr(String(rid));
      var actions = '<button class="btn sm" onclick="viewReturnDetail(\'' + ridSafe + '\')" title="Ver detalle">👁 Ver</button>';
      if (status === 'pending' && isMgr) {
        actions += ' <button class="btn sm accent" onclick="approveReturn(\'' + ridSafe + '\')" title="Aprobar devolución">✓ Aprobar</button>';
        actions += ' <button class="btn sm" onclick="openRejectReturnModal(\'' + ridSafe + '\')" title="Rechazar" style="color:#B91C1C;border-color:#FCA5A5;">✕ Rechazar</button>';
      }
      if (status === 'approved' || status === 'completed') {
        actions += ' <button class="btn sm" onclick="printCreditNote(\'' + ridSafe + '\')" title="Imprimir nota de crédito">🖨 Nota</button>';
      }
      return '<tr>' +
        '<td class="mono" style="font-size:11.5px;">' + escapeHtml(String(rid)) + '</td>' +
        '<td>' + escapeHtml(_vlxFormatDate(rt.created_at || rt.date)) + '</td>' +
        '<td class="mono" style="font-size:11.5px;">' + escapeHtml(String(saleRef)) + '</td>' +
        '<td>' + escapeHtml(String(cust)) + '</td>' +
        '<td class="num">' + itemsCount + '</td>' +
        '<td class="num" style="font-weight:600;">' + _vlxFormatMoney(total) + '</td>' +
        '<td>' + _vlxStatusBadge(status) + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');
  }

  function updateReturnsStats(items) {
    var now = new Date();
    var thisMonth = items.filter(function (it) {
      var d = new Date(it.created_at || it.date || 0);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    var totalAmount = thisMonth.reduce(function (s, it) { return s + Number(it.total || it.amount || 0); }, 0);
    var pending = items.filter(function (it) { return String(it.status || '').toLowerCase() === 'pending'; }).length;
    var prodCount = {};
    items.forEach(function (it) {
      (it.items || []).forEach(function (line) {
        var nm = line.name || line.product_name || line.product || '—';
        prodCount[nm] = (prodCount[nm] || 0) + Number(line.qty || line.quantity || 1);
      });
    });
    var top = '—';
    var topQty = 0;
    Object.keys(prodCount).forEach(function (k) { if (prodCount[k] > topQty) { topQty = prodCount[k]; top = k; } });
    var $ = function (id) { return document.getElementById(id); };
    if ($('ret-stat-month')) $('ret-stat-month').textContent = thisMonth.length;
    if ($('ret-stat-amount')) $('ret-stat-amount').textContent = _vlxFormatMoney(totalAmount);
    if ($('ret-stat-pending')) $('ret-stat-pending').textContent = pending;
    if ($('ret-stat-top')) $('ret-stat-top').textContent = top.length > 22 ? top.slice(0, 20) + '…' : top;
  }

  window.exportReturnsCSV = function () {
    var rows = (window._RETURNS_CACHE || []).map(function (rt) {
      return {
        id: rt.id || '',
        fecha: _vlxFormatDate(rt.created_at || rt.date),
        venta: rt.sale_id || rt.sale_folio || '',
        cliente: rt.customer_name || rt.customer || '',
        items: Array.isArray(rt.items) ? rt.items.length : (rt.items_count || 0),
        total: Number(rt.total || rt.amount || 0).toFixed(2),
        estado: rt.status || '',
        motivo: rt.reason || ''
      };
    });
    if (!rows.length) { showToast('No hay devoluciones para exportar'); return; }
    var fn = 'devoluciones-' + new Date().toISOString().slice(0, 10) + '.csv';
    _vlxDownloadCSV(fn, ['id', 'fecha', 'venta', 'cliente', 'items', 'total', 'estado', 'motivo'], rows);
    showToast('✓ Exportadas ' + rows.length + ' devoluciones');
  };

  window.viewReturnDetail = async function (id) {
    try {
      var r = await _authFetch('/api/returns/' + encodeURIComponent(id) + '?tenant_id=' + encodeURIComponent(_vTenant()));
      var rt;
      if (r.ok) rt = await r.json();
      else rt = (window._RETURNS_CACHE || []).find(function (x) { return String(x.id) === String(id); });
      if (!rt) { showToast('No se pudo cargar el detalle'); return; }
      var rows = (rt.items || []).map(function (li) {
        return '<tr><td>' + escapeHtml(li.name || li.product_name || '—') + '</td>' +
          '<td class="num">' + (li.qty || li.quantity || 1) + '</td>' +
          '<td class="num">' + _vlxFormatMoney(li.price || li.unit_price || 0) + '</td>' +
          '<td class="num">' + _vlxFormatMoney((li.qty || li.quantity || 1) * (li.price || li.unit_price || 0)) + '</td></tr>';
      }).join('');
      var html =
        '<div style="padding:22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;">' +
          '<div><strong style="font-size:17px;">Devolución #' + escapeHtml(String(rt.id || '')) + '</strong>' +
          '<div style="font-size:12px;color:#666;margin-top:3px;">' + escapeHtml(_vlxFormatDateTime(rt.created_at || rt.date)) + ' · ' + _vlxStatusBadge(rt.status || 'pending') + '</div></div>' +
          '<button onclick="_vlxCloseModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
        '</div>' +
        '<div style="padding:22px;overflow-y:auto;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px;">' +
            '<div><span style="color:#666;">Venta original:</span> <strong>' + escapeHtml(String(rt.sale_id || rt.sale_folio || '—')) + '</strong></div>' +
            '<div><span style="color:#666;">Cliente:</span> <strong>' + escapeHtml(String(rt.customer_name || rt.customer || 'Público en general')) + '</strong></div>' +
            '<div><span style="color:#666;">Motivo:</span> <strong>' + escapeHtml(String(rt.reason || '—')) + '</strong></div>' +
            '<div><span style="color:#666;">Total:</span> <strong style="color:#B91C1C;">' + _vlxFormatMoney(rt.total || rt.amount || 0) + '</strong></div>' +
          '</div>' +
          (rt.notes ? '<div style="padding:10px;background:#FFFBEB;border-radius:8px;font-size:12.5px;margin-bottom:14px;"><strong>Notas:</strong> ' + escapeHtml(String(rt.notes)) + '</div>' : '') +
          '<table class="tbl" style="width:100%;font-size:13px;"><thead><tr><th data-i18n="producto">Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" style="text-align:center;padding:14px;color:#999;">Sin items</td></tr>') + '</tbody></table>' +
        '</div>' +
        '<div style="padding:14px 22px;background:#F5F5F4;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn" onclick="_vlxCloseModal()">Cerrar</button>' +
          ((String(rt.status||'').toLowerCase() === 'approved' || String(rt.status||'').toLowerCase() === 'completed') ? '<button class="btn accent" onclick="printCreditNote(\'' + escapeAttr(String(rt.id||'')) + '\')">🖨 Imprimir nota crédito</button>' : '') +
        '</div>';
      _vlxOpenModal(html, { width: '720px' });
    } catch (err) {
      showToast('Error: ' + (err.message || err));
    }
  };

  window.approveReturn = async function (id) {
    if (!_vlxIsManager()) { showToast('Solo gerentes pueden aprobar'); return; }
    try {
      showToast('Aprobando devolución…');
      var r = await _authFetch('/api/returns/' + encodeURIComponent(id) + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: _vTenant() })
      });
      if (!r.ok) {
        var e = await r.json().catch(function () { return {}; });
        showToast('Error aprobando: ' + (e.error || e.message || ('HTTP ' + r.status)));
        return;
      }
      showToast('✓ Devolución aprobada');
      loadReturns();
    } catch (err) {
      showToast('Error: ' + (err.message || err));
    }
  };

  window.openRejectReturnModal = function (id) {
    var html =
      '<div style="padding:22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;">' +
        '<strong style="font-size:16px;">Rechazar devolución #' + escapeHtml(String(id)) + '</strong>' +
        '<button onclick="_vlxCloseModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
      '</div>' +
      '<div style="padding:22px;">' +
        '<form id="rej-ret-form" style="display:flex;flex-direction:column;gap:12px;">' +
          '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">Motivo del rechazo *' +
            '<textarea id="rej-ret-reason" required minlength="5" rows="4" maxlength="500" style="padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;resize:vertical;" placeholder="Explica por qué se rechaza la devolución…"></textarea>' +
          '</label>' +
          '<div id="rej-ret-msg" style="font-size:12px;color:#B91C1C;min-height:14px;"></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" class="btn" onclick="_vlxCloseModal()">Cancelar</button>' +
            '<button type="submit" class="btn" style="background:#B91C1C;color:#fff;border-color:#B91C1C;">Rechazar devolución</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    var modal = _vlxOpenModal(html, { width: '480px' });
    var form = modal.querySelector('#rej-ret-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var reason = (modal.querySelector('#rej-ret-reason').value || '').trim();
      var msg = modal.querySelector('#rej-ret-msg');
      if (reason.length < 5) { msg.textContent = 'El motivo debe tener al menos 5 caracteres.'; return; }
      msg.textContent = 'Procesando…'; msg.style.color = '#666';
      try {
        var r = await _authFetch('/api/returns/' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: _vTenant(), status: 'rejected', reject_reason: reason })
        });
        if (!r.ok) {
          var er = await r.json().catch(function () { return {}; });
          msg.style.color = '#B91C1C';
          msg.textContent = 'Error: ' + (er.error || er.message || ('HTTP ' + r.status));
          return;
        }
        showToast('✓ Devolución rechazada');
        _vlxCloseModal();
        loadReturns();
      } catch (err) {
        msg.style.color = '#B91C1C';
        msg.textContent = 'Error de red: ' + (err.message || err);
      }
    });
    setTimeout(function () { modal.querySelector('#rej-ret-reason').focus(); }, 80);
  };

  window.printCreditNote = async function (id) {
    showToast('Generando nota de crédito…');
    try {
      var r = await _authFetch('/api/printer/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: _vTenant(), document_type: 'credit_note', return_id: id })
      });
      if (r && r.ok) { showToast('✓ Nota de crédito enviada a impresora'); return; }
    } catch (e) { /* fallthrough */ }
    var rt = (window._RETURNS_CACHE || []).find(function (x) { return String(x.id) === String(id); });
    if (!rt) { showToast('No se pudo generar la nota'); return; }
    var w = window.open('', '_blank', 'width=480,height=720');
    if (!w) { showToast('Bloqueador de popups activo'); return; }
    var rows = (rt.items || []).map(function (li) {
      return '<tr><td>' + escapeHtml(li.name || li.product_name || '—') + '</td>' +
        '<td style="text-align:right;">' + (li.qty || li.quantity || 1) + '</td>' +
        '<td style="text-align:right;">' + _vlxFormatMoney(li.price || li.unit_price || 0) + '</td></tr>';
    }).join('');
    w.document.write('<!doctype html><html><head><title>Nota de crédito #' + escapeHtml(String(rt.id || '')) + '</title>' +
      '<style>body{font-family:monospace;padding:12px;font-size:12px;}h1{font-size:16px;text-align:center;margin:0 0 6px 0;}table{width:100%;border-collapse:collapse;}td{padding:3px 4px;border-bottom:1px dashed #ddd;}.tot{font-size:14px;font-weight:bold;text-align:right;margin-top:8px;}</style></head><body>' +
      '<h1>NOTA DE CRÉDITO</h1>' +
      '<div>#' + escapeHtml(String(rt.id || '')) + ' · ' + escapeHtml(_vlxFormatDateTime(rt.created_at || rt.date)) + '</div>' +
      '<div>Venta: ' + escapeHtml(String(rt.sale_id || rt.sale_folio || '—')) + '</div>' +
      '<div>Cliente: ' + escapeHtml(String(rt.customer_name || rt.customer || 'Público')) + '</div>' +
      '<hr><table>' + (rows || '<tr><td colspan="3">Sin items</td></tr>') + '</table>' +
      '<div class="tot">Total: ' + _vlxFormatMoney(rt.total || rt.amount || 0) + '</div>' +
      '<hr><div style="text-align:center;font-size:10px;margin-top:10px;">Motivo: ' + escapeHtml(String(rt.reason || '')) + '</div>' +
      '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},250);};</scr' + 'ipt>' +
      '</body></html>');
    w.document.close();
    showToast('✓ Vista previa abierta');
  };

  // -------- New Return wizard (4 steps) --------
  window._NEW_RETURN_STATE = { sale: null, items: [], reason: '', notes: '' };

  window.openNewReturnModal = function () {
    window._NEW_RETURN_STATE = { sale: null, items: [], reason: '', notes: '' };
    renderNewReturnStep(1);
  };

  window.renderNewReturnStep = function (step) {
    var stateLabel = '<div style="display:flex;gap:6px;font-size:11px;color:#666;flex-wrap:wrap;">' +
      ['1·Venta','2·Productos','3·Motivo','4·Confirmar'].map(function (lbl, i) {
        var active = (i + 1) === step;
        var done = (i + 1) < step;
        var color = active ? '#1E40AF' : (done ? '#065F46' : '#9CA3AF');
        var bg = active ? '#DBEAFE' : (done ? '#D1FAE5' : '#F3F4F6');
        return '<span style="padding:3px 9px;border-radius:10px;background:' + bg + ';color:' + color + ';font-weight:600;">' + lbl + '</span>';
      }).join('') + '</div>';

    var body = '';
    if (step === 1) {
      body =
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<label style="font-size:13px;font-weight:500;">Buscar venta original' +
            '<input id="nr-search-input" type="text" placeholder="Folio, fecha (YYYY-MM-DD), o cliente…" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
          '</label>' +
          '<button class="btn accent" onclick="newReturnSearchSales()">🔍 Buscar</button>' +
          '<div id="nr-search-results" style="max-height:300px;overflow-y:auto;border:1px solid #E7E5E4;border-radius:8px;"></div>' +
        '</div>';
    } else if (step === 2) {
      var sale = window._NEW_RETURN_STATE.sale || {};
      var items = sale.items || [];
      body =
        '<div style="margin-bottom:10px;font-size:13px;color:#666;">Venta <strong>' + escapeHtml(String(sale.id || sale.folio || '—')) + '</strong> · ' + escapeHtml(String(sale.customer_name || sale.customer || 'Público')) + '</div>' +
        '<div style="max-height:340px;overflow-y:auto;border:1px solid #E7E5E4;border-radius:8px;">' +
        (items.length ? '<table class="tbl" style="width:100%;font-size:13px;"><thead><tr><th style="width:36px;"><input type="checkbox" id="nr-check-all" onclick="document.querySelectorAll(\'.nr-item-chk\').forEach(function(c){c.checked=event.target.checked;});"></th><th data-i18n="producto">Producto</th><th class="num">Vendido</th><th class="num">Devolver</th><th class="num">Precio</th></tr></thead><tbody>' +
          items.map(function (li, i) {
            var qty = Number(li.qty || li.quantity || 1);
            return '<tr>' +
              '<td><input type="checkbox" class="nr-item-chk" data-idx="' + i + '"></td>' +
              '<td>' + escapeHtml(li.name || li.product_name || '—') + '</td>' +
              '<td class="num">' + qty + '</td>' +
              '<td class="num"><input type="number" class="nr-item-qty" data-idx="' + i + '" min="0" max="' + qty + '" value="' + qty + '" step="1" style="width:70px;padding:4px 6px;border:1px solid #E7E5E4;border-radius:4px;text-align:right;"></td>' +
              '<td class="num">' + _vlxFormatMoney(li.price || li.unit_price || 0) + '</td>' +
            '</tr>';
          }).join('') + '</tbody></table>' : '<div style="padding:24px;text-align:center;color:#999;">Esta venta no tiene productos.</div>') +
        '</div>';
    } else if (step === 3) {
      body =
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
          '<label style="font-size:13px;font-weight:500;">Motivo de devolución *' +
            '<select id="nr-reason" required style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
              '<option value="">— Selecciona —</option>' +
              '<option value="defective">Producto defectuoso</option>' +
              '<option value="wrong_item">Artículo incorrecto</option>' +
              '<option value="customer_wish">Cambio de opinión del cliente</option>' +
              '<option value="expired">Producto caducado</option>' +
              '<option value="damaged">Producto dañado</option>' +
              '<option value="warranty">Garantía</option>' +
              '<option value="other">Otro</option>' +
            '</select>' +
          '</label>' +
          '<label style="font-size:13px;font-weight:500;">Notas adicionales' +
            '<textarea id="nr-notes" rows="4" maxlength="500" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;resize:vertical;" placeholder="Detalles sobre la devolución…"></textarea>' +
          '</label>' +
          '<div id="nr-reason-msg" style="font-size:12px;color:#B91C1C;min-height:14px;"></div>' +
        '</div>';
    } else if (step === 4) {
      var st = window._NEW_RETURN_STATE;
      var sale2 = st.sale || {};
      var totalRet = (st.items || []).reduce(function (s, i) { return s + (Number(i.qty) * Number(i.price || 0)); }, 0);
      body =
        '<div style="font-size:13px;line-height:1.7;">' +
          '<div><strong>Venta original:</strong> ' + escapeHtml(String(sale2.id || sale2.folio || '—')) + '</div>' +
          '<div><strong>Cliente:</strong> ' + escapeHtml(String(sale2.customer_name || sale2.customer || 'Público')) + '</div>' +
          '<div><strong>Motivo:</strong> ' + escapeHtml(String(st.reason || '—')) + '</div>' +
          (st.notes ? '<div><strong>Notas:</strong> ' + escapeHtml(String(st.notes)) + '</div>' : '') +
          '<div style="margin:10px 0 6px 0;font-weight:600;">Productos a devolver:</div>' +
          '<table class="tbl" style="width:100%;font-size:12.5px;"><thead><tr><th data-i18n="producto">Producto</th><th class="num">Cant.</th><th class="num">Subtotal</th></tr></thead><tbody>' +
            (st.items || []).map(function (i) {
              return '<tr><td>' + escapeHtml(String(i.name)) + '</td><td class="num">' + i.qty + '</td><td class="num">' + _vlxFormatMoney(i.qty * (i.price || 0)) + '</td></tr>';
            }).join('') +
          '</tbody></table>' +
          '<div style="text-align:right;font-size:16px;font-weight:700;margin-top:10px;color:#B91C1C;">Total a reembolsar: ' + _vlxFormatMoney(totalRet) + '</div>' +
        '</div>';
    }

    var prevBtn = step > 1 ? '<button class="btn" onclick="renderNewReturnStep(' + (step - 1) + ')">← Anterior</button>' : '';
    var nextLabel = step < 4 ? 'Siguiente →' : '✓ Crear devolución';
    var nextHandler = step < 4 ? 'newReturnNext(' + step + ')' : 'newReturnSubmit()';

    var html =
      '<div style="padding:18px 22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<div><strong style="font-size:16px;">Nueva devolución</strong><div style="margin-top:6px;">' + stateLabel + '</div></div>' +
        '<button onclick="_vlxCloseModal()" aria-label="Cerrar" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
      '</div>' +
      '<div style="padding:20px;overflow-y:auto;">' + body + '</div>' +
      '<div style="padding:14px 22px;background:#F5F5F4;display:flex;gap:8px;justify-content:space-between;">' +
        '<div>' + prevBtn + '</div>' +
        '<div style="display:flex;gap:8px;"><button class="btn" onclick="_vlxCloseModal()">Cancelar</button>' +
        '<button class="btn accent" onclick="' + nextHandler + '">' + nextLabel + '</button></div>' +
      '</div>';
    _vlxOpenModal(html, { width: '720px' });
    if (step === 1) setTimeout(function () { var i = document.getElementById('nr-search-input'); if (i) { i.focus(); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); newReturnSearchSales(); } }); } }, 80);
  };

  window.newReturnSearchSales = async function () {
    var input = document.getElementById('nr-search-input');
    var results = document.getElementById('nr-search-results');
    if (!input || !results) return;
    var q = input.value.trim();
    if (!q) { results.innerHTML = '<div style="padding:14px;color:#999;text-align:center;">Escribe un folio, fecha o cliente.</div>'; return; }
    results.innerHTML = '<div style="padding:14px;color:#666;text-align:center;">⏳ Buscando…</div>';
    try {
      var r = await _authFetch('/api/sales?search=' + encodeURIComponent(q) + '&limit=20&tenant_id=' + encodeURIComponent(_vTenant()));
      var data = r.ok ? await r.json() : {};
      var sales = Array.isArray(data) ? data : (data.items || data.sales || []);
      if (!sales.length) { results.innerHTML = '<div style="padding:14px;color:#999;text-align:center;">Sin resultados.</div>'; return; }
      results.innerHTML = sales.map(function (s) {
        var sid = String(s.id || s.folio || '');
        var sidJson = JSON.stringify(sid).replace(/"/g, '&quot;');
        return '<div style="padding:10px;border-bottom:1px solid #F5F5F4;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onmouseover="this.style.background=\'#FFFBEB\'" onmouseout="this.style.background=\'\'" onclick="newReturnSelectSale(' + sidJson + ')">' +
          '<div><strong style="font-size:13px;">#' + escapeHtml(sid) + '</strong> · <span style="color:#666;font-size:12px;">' + escapeHtml(_vlxFormatDateTime(s.created_at || s.sold_at)) + '</span><div style="font-size:12px;color:#666;">' + escapeHtml(String(s.customer_name || 'Público')) + '</div></div>' +
          '<div style="font-weight:600;">' + _vlxFormatMoney(s.total || 0) + '</div>' +
        '</div>';
      }).join('');
    } catch (err) {
      results.innerHTML = '<div style="padding:14px;color:#B91C1C;text-align:center;">Error: ' + escapeHtml(err.message || String(err)) + '</div>';
    }
  };

  window.newReturnSelectSale = async function (saleId) {
    showToast('Cargando venta…');
    try {
      var r = await _authFetch('/api/sales/' + encodeURIComponent(saleId) + '?tenant_id=' + encodeURIComponent(_vTenant()));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var sale = await r.json();
      window._NEW_RETURN_STATE.sale = sale;
      renderNewReturnStep(2);
    } catch (err) {
      showToast('Error cargando venta: ' + (err.message || err));
    }
  };

  window.newReturnNext = function (currentStep) {
    if (currentStep === 1) {
      if (!window._NEW_RETURN_STATE.sale) { showToast('Selecciona una venta primero'); return; }
      renderNewReturnStep(2);
    } else if (currentStep === 2) {
      var saleItems = (window._NEW_RETURN_STATE.sale || {}).items || [];
      var picked = [];
      document.querySelectorAll('.nr-item-chk').forEach(function (chk) {
        if (chk.checked) {
          var idx = Number(chk.dataset.idx);
          var qtyEl = document.querySelector('.nr-item-qty[data-idx="' + idx + '"]');
          var qty = Number(qtyEl && qtyEl.value) || 0;
          var li = saleItems[idx] || {};
          var maxQ = Number(li.qty || li.quantity || 1);
          if (qty > 0 && qty <= maxQ) {
            picked.push({
              product_id: li.product_id || li.id || null,
              name: li.name || li.product_name || '',
              qty: qty,
              price: Number(li.price || li.unit_price || 0)
            });
          }
        }
      });
      if (!picked.length) { showToast('Selecciona al menos un producto con cantidad > 0'); return; }
      window._NEW_RETURN_STATE.items = picked;
      renderNewReturnStep(3);
    } else if (currentStep === 3) {
      var reasonEl = document.getElementById('nr-reason');
      var notesEl = document.getElementById('nr-notes');
      var msg = document.getElementById('nr-reason-msg');
      var reason = reasonEl ? reasonEl.value : '';
      if (!reason) { if (msg) msg.textContent = 'El motivo es obligatorio.'; return; }
      window._NEW_RETURN_STATE.reason = reason;
      window._NEW_RETURN_STATE.notes = (notesEl && notesEl.value || '').trim();
      renderNewReturnStep(4);
    }
  };

  window.newReturnSubmit = async function () {
    var st = window._NEW_RETURN_STATE;
    if (!st.sale || !st.items.length || !st.reason) { showToast('Faltan datos'); return; }
    showToast('Creando devolución…');
    try {
      var body = {
        tenant_id: _vTenant(),
        sale_id: st.sale.id || st.sale.folio,
        customer_id: st.sale.customer_id || null,
        customer_name: st.sale.customer_name || st.sale.customer || '',
        items: st.items,
        reason: st.reason,
        notes: st.notes,
        total: st.items.reduce(function (s, i) { return s + (Number(i.qty) * Number(i.price || 0)); }, 0),
        status: 'pending'
      };
      var r = await _authFetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        var er = await r.json().catch(function () { return {}; });
        showToast('Error: ' + (er.error || er.message || ('HTTP ' + r.status)));
        return;
      }
      var saved = await r.json().catch(function () { return {}; });
      _vlxCloseModal();
      showToast('✓ Devolución #' + (saved.id || '') + ' creada');
      loadReturns();
      if (saved.id) {
        setTimeout(function () { if (confirm('¿Imprimir nota de crédito ahora?')) printCreditNote(saved.id); }, 350);
      }
    } catch (err) {
      showToast('Error: ' + (err.message || err));
    }
  };

  // Wire filters
  document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'ret-filter-status' || e.target.id === 'ret-filter-from' || e.target.id === 'ret-filter-to')) {
      loadReturns();
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'ret-filter-customer') {
      clearTimeout(window._retFilterTimer);
      window._retFilterTimer = setTimeout(loadReturns, 300);
    }
  });

  /* ============================================================
     MODULE 2 — PROMOCIONES
     ============================================================ */
  window._PROMO_CACHE = [];
  window._PROMO_TAB = 'active';

  window.showPromoTab = function (tab, btn) {
    window._PROMO_TAB = tab;
    document.querySelectorAll('.config-tab[data-promo-tab]').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderPromotionsTable(window._PROMO_CACHE || []);
  };

  window.loadPromotions = async function () {
    var tbody = document.getElementById('promo-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-3);">⏳ Cargando promociones…</td></tr>';
    try {
      var r = await _authFetch('/api/promotions?tenant_id=' + encodeURIComponent(_vTenant()));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var data = await r.json();
      var items = Array.isArray(data) ? data : (data.items || data.promotions || []);
      window._PROMO_CACHE = items;
      renderPromotionsTable(items);
      updatePromotionsStats(items);
    } catch (err) {
      console.error('[promo] loadPromotions:', err);
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--danger,#B91C1C);">Error: ' + escapeHtml(err.message || String(err)) + '</td></tr>';
      showToast('Error cargando promociones');
    }
  };

  function _promoIsExpired(p) {
    if (!p.end_date) return false;
    return new Date(p.end_date) < new Date();
  }
  function _promoIsScheduled(p) {
    if (!p.start_date) return false;
    return new Date(p.start_date) > new Date();
  }
  function _promoIsActive(p) {
    if (String(p.status || '').toLowerCase() === 'paused') return false;
    if (_promoIsExpired(p)) return false;
    if (_promoIsScheduled(p)) return false;
    return true;
  }

  function _promoTypeLabel(t) {
    var map = {
      percent: '% Descuento',
      amount: '$ Descuento fijo',
      bogo: '2x1 / Compra X lleva Y',
      combo: 'Combo'
    };
    return map[String(t || '').toLowerCase()] || String(t || '—');
  }
  function _promoAppliesLabel(a) {
    var map = {
      all: 'Toda la tienda',
      category: 'Categoría',
      product: 'Producto',
      cart_total: 'Total del carrito'
    };
    return map[String(a || '').toLowerCase()] || String(a || '—');
  }

  function renderPromotionsTable(items) {
    var tbody = document.getElementById('promo-body');
    if (!tbody) return;
    var search = ((document.getElementById('promo-search') || {}).value || '').trim().toLowerCase();
    var tab = window._PROMO_TAB || 'active';
    var filtered = items.filter(function (p) {
      if (search) {
        var hay = (String(p.name || '') + ' ' + String(p.coupon_code || '')).toLowerCase();
        if (hay.indexOf(search) < 0) return false;
      }
      if (tab === 'active') return _promoIsActive(p);
      if (tab === 'scheduled') return _promoIsScheduled(p);
      if (tab === 'expired') return _promoIsExpired(p);
      return true;
    });
    var sub = document.getElementById('promo-sub');
    if (sub) sub.textContent = filtered.length + (filtered.length === 1 ? ' promoción' : ' promociones');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-3);">No hay promociones en esta vista.</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(function (p) {
      var pid = String(p.id || '');
      var pidJson = JSON.stringify(pid).replace(/"/g, '&quot;');
      var pidSafe = escapeAttr(pid);
      var status = _promoIsExpired(p) ? 'expired' : (_promoIsScheduled(p) ? 'scheduled' : (String(p.status || 'active').toLowerCase() === 'paused' ? 'paused' : 'active'));
      var value = '';
      if (p.type === 'percent') value = (Number(p.value) || 0) + '%';
      else if (p.type === 'amount') value = _vlxFormatMoney(p.value);
      else if (p.type === 'bogo') value = (p.bogo_buy || 2) + 'x' + (p.bogo_get || 1);
      else value = String(p.value || '—');
      var actions = '<button class="btn sm" onclick="editPromotion(\'' + pidSafe + '\')" title="Editar">✏️ Editar</button>';
      if (status === 'paused') {
        actions += ' <button class="btn sm accent" onclick="togglePromotion(\'' + pidSafe + '\', \'active\')" title="Activar">▶ Activar</button>';
      } else if (status === 'active') {
        actions += ' <button class="btn sm" onclick="togglePromotion(\'' + pidSafe + '\', \'paused\')" title="Pausar">⏸ Pausar</button>';
      }
      actions += ' <button class="btn sm" onclick="deletePromotion(\'' + pidSafe + '\', ' + pidJson + ')" title="Eliminar" style="color:#B91C1C;border-color:#FCA5A5;">🗑</button>';
      return '<tr>' +
        '<td><strong>' + escapeHtml(String(p.name || '—')) + '</strong></td>' +
        '<td>' + escapeHtml(_promoTypeLabel(p.type)) + '</td>' +
        '<td class="num">' + escapeHtml(value) + '</td>' +
        '<td>' + escapeHtml(_promoAppliesLabel(p.applies_to)) + (p.applies_value ? ' <span style="color:#666;font-size:11px;">(' + escapeHtml(String(p.applies_value)) + ')</span>' : '') + '</td>' +
        '<td>' + (p.coupon_code ? '<code style="background:#FEF3C7;padding:2px 6px;border-radius:4px;font-size:11.5px;">' + escapeHtml(String(p.coupon_code)) + '</code>' : '<span style="color:#999;">—</span>') + '</td>' +
        '<td>' + escapeHtml(_vlxFormatDate(p.start_date)) + '</td>' +
        '<td>' + escapeHtml(_vlxFormatDate(p.end_date)) + '</td>' +
        '<td class="num">' + (p.uses || p.usage_count || 0) + (p.max_uses ? '<span style="color:#999;font-size:11px;">/' + p.max_uses + '</span>' : '') + '</td>' +
        '<td>' + _vlxStatusBadge(status) + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');
  }

  function updatePromotionsStats(items) {
    var now = new Date();
    var weekAhead = new Date(Date.now() + 7 * 86400000);
    var active = 0, expiring = 0, expired = 0, monthUses = 0;
    items.forEach(function (p) {
      if (_promoIsExpired(p)) expired++;
      else if (_promoIsActive(p)) {
        active++;
        if (p.end_date && new Date(p.end_date) <= weekAhead) expiring++;
      }
      monthUses += Number(p.uses_this_month || p.uses || 0);
    });
    var $ = function (id) { return document.getElementById(id); };
    if ($('promo-stat-active')) $('promo-stat-active').textContent = active;
    if ($('promo-stat-expiring')) $('promo-stat-expiring').textContent = expiring;
    if ($('promo-stat-expired')) $('promo-stat-expired').textContent = expired;
    if ($('promo-stat-uses')) $('promo-stat-uses').textContent = monthUses;
  }

  window.exportPromotionsCSV = function () {
    var rows = (window._PROMO_CACHE || []).map(function (p) {
      return {
        id: p.id || '',
        nombre: p.name || '',
        tipo: p.type || '',
        valor: p.value || '',
        aplica: p.applies_to || '',
        cupon: p.coupon_code || '',
        inicio: _vlxFormatDate(p.start_date),
        fin: _vlxFormatDate(p.end_date),
        usos: p.uses || p.usage_count || 0
      };
    });
    if (!rows.length) { showToast('No hay promociones para exportar'); return; }
    var fn = 'promociones-' + new Date().toISOString().slice(0, 10) + '.csv';
    _vlxDownloadCSV(fn, ['id', 'nombre', 'tipo', 'valor', 'aplica', 'cupon', 'inicio', 'fin', 'usos'], rows);
    showToast('✓ Exportadas ' + rows.length + ' promociones');
  };

  window.togglePromotion = async function (id, newStatus) {
    try {
      var r = await _authFetch('/api/promotions/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: _vTenant(), status: newStatus })
      });
      if (!r.ok) { var e = await r.json().catch(function () { return {}; }); showToast('Error: ' + (e.error || 'HTTP ' + r.status)); return; }
      showToast('✓ Promoción ' + (newStatus === 'paused' ? 'pausada' : 'activada'));
      loadPromotions();
    } catch (err) { showToast('Error: ' + (err.message || err)); }
  };

  window.deletePromotion = function (id, name) {
    _vlxConfirmDestructive(
      'Vas a eliminar permanentemente la promoción "' + (name || id) + '". Esta acción no se puede deshacer.',
      async function () {
        try {
          var r = await _authFetch('/api/promotions/' + encodeURIComponent(id) + '?tenant_id=' + encodeURIComponent(_vTenant()), {
            method: 'DELETE'
          });
          if (!r.ok) { var e = await r.json().catch(function () { return {}; }); showToast('Error: ' + (e.error || 'HTTP ' + r.status)); return; }
          showToast('✓ Promoción eliminada');
          loadPromotions();
        } catch (err) { showToast('Error: ' + (err.message || err)); }
      },
      { word: 'BORRAR' }
    );
  };

  window.openNewPromotionModal = function () {
    renderPromotionFormModal(null);
  };

  window.editPromotion = function (id) {
    var p = (window._PROMO_CACHE || []).find(function (x) { return String(x.id) === String(id); });
    if (!p) { showToast('Promoción no encontrada'); return; }
    renderPromotionFormModal(p);
  };

  function renderPromotionFormModal(promo) {
    var isEdit = !!promo;
    promo = promo || {};
    var today = new Date().toISOString().slice(0, 10);
    var weekLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    var html =
      '<div style="padding:18px 22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;">' +
        '<strong style="font-size:17px;">' + (isEdit ? 'Editar' : 'Nueva') + ' promoción</strong>' +
        '<button onclick="_vlxCloseModal()" aria-label="Cerrar" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
      '</div>' +
      '<div style="padding:20px;overflow-y:auto;">' +
      '<form id="promo-form" style="display:flex;flex-direction:column;gap:14px;">' +
        '<input type="hidden" id="pf-id" value="' + escapeAttr(String(promo.id || '')) + '">' +
        '<label style="font-size:13px;font-weight:500;">Nombre de la promoción *' +
          '<input id="pf-name" type="text" required minlength="2" maxlength="80" value="' + escapeAttr(String(promo.name || '')) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;" placeholder="Ej. Descuento de verano 15%">' +
        '</label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<label style="font-size:13px;font-weight:500;">Tipo *' +
            '<select id="pf-type" required style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
              '<option value="percent"' + (promo.type === 'percent' ? ' selected' : '') + '>% Descuento</option>' +
              '<option value="amount"' + (promo.type === 'amount' ? ' selected' : '') + '>$ Descuento fijo</option>' +
              '<option value="bogo"' + (promo.type === 'bogo' ? ' selected' : '') + '>2x1 / BOGO</option>' +
              '<option value="combo"' + (promo.type === 'combo' ? ' selected' : '') + '>Combo</option>' +
            '</select>' +
          '</label>' +
          '<label style="font-size:13px;font-weight:500;">Valor *' +
            '<input id="pf-value" type="number" required min="0" step="0.01" value="' + escapeAttr(String(promo.value || '')) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;" placeholder="Ej. 15">' +
          '</label>' +
        '</div>' +
        '<label style="font-size:13px;font-weight:500;">Aplica a *' +
          '<select id="pf-applies" required style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
            '<option value="all"' + (promo.applies_to === 'all' ? ' selected' : '') + '>Toda la tienda</option>' +
            '<option value="category"' + (promo.applies_to === 'category' ? ' selected' : '') + '>Categoría específica</option>' +
            '<option value="product"' + (promo.applies_to === 'product' ? ' selected' : '') + '>Producto específico</option>' +
            '<option value="cart_total"' + (promo.applies_to === 'cart_total' ? ' selected' : '') + '>Total del carrito ≥ X</option>' +
          '</select>' +
        '</label>' +
        '<label style="font-size:13px;font-weight:500;" id="pf-applies-val-wrap">Categoría / Producto / Mínimo' +
          '<input id="pf-applies-val" type="text" maxlength="120" value="' + escapeAttr(String(promo.applies_value || '')) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;" placeholder="Nombre de categoría/producto, o monto mínimo">' +
        '</label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<label style="font-size:13px;font-weight:500;">Inicio *' +
            '<input id="pf-start" type="date" required value="' + escapeAttr(String((promo.start_date || today).slice(0, 10))) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
          '</label>' +
          '<label style="font-size:13px;font-weight:500;">Fin *' +
            '<input id="pf-end" type="date" required value="' + escapeAttr(String((promo.end_date || weekLater).slice(0, 10))) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
          '</label>' +
        '</div>' +
        '<details style="border:1px solid #E7E5E4;border-radius:8px;padding:10px;">' +
          '<summary style="font-size:13px;font-weight:500;cursor:pointer;">⚙️ Opciones avanzadas (cupón, límite de usos)</summary>' +
          '<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">' +
            '<label style="font-size:12.5px;font-weight:500;">Código de cupón (opcional)' +
              '<input id="pf-coupon" type="text" maxlength="40" value="' + escapeAttr(String(promo.coupon_code || promo.code || '')) + '" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:13.5px;margin-top:3px;text-transform:uppercase;" placeholder="VERANO15">' +
            '</label>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
              '<label style="font-size:12.5px;font-weight:500;">Máx. usos (0 = ilimitado)' +
                '<input id="pf-maxuses" type="number" min="0" step="1" value="' + escapeAttr(String(promo.max_uses || 0)) + '" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:13.5px;margin-top:3px;">' +
              '</label>' +
              '<label style="font-size:12.5px;font-weight:500;">Compra mínima' +
                '<input id="pf-minpurchase" type="number" min="0" step="0.01" value="' + escapeAttr(String(promo.min_purchase || promo.min_amount || 0)) + '" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:13.5px;margin-top:3px;">' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</details>' +
        // R3b GAP-P1/P3: priority + stackable + combinable_with_manual
        '<details style="border:1px solid #E7E5E4;border-radius:8px;padding:10px;">' +
          '<summary style="font-size:13px;font-weight:500;cursor:pointer;">🎯 Prioridad y combinación (avanzado)</summary>' +
          '<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">' +
            '<label style="font-size:12.5px;font-weight:500;">Prioridad (menor = aplica primero, default 100)' +
              '<input id="pf-priority" type="number" min="0" max="9999" step="1" value="' + escapeAttr(String(promo.priority != null ? promo.priority : 100)) + '" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:13.5px;margin-top:3px;">' +
            '</label>' +
            '<label style="font-size:12.5px;font-weight:500;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
              '<input id="pf-stackable" type="checkbox"' + (promo.stackable === true ? ' checked' : '') + ' style="width:18px;height:18px;">' +
              '<span>Combinable con otras promos (acumulativa). Si está desmarcada, esta promo es exclusiva.</span>' +
            '</label>' +
            '<label style="font-size:12.5px;font-weight:500;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
              '<input id="pf-combine-manual" type="checkbox"' + (promo.combinable_with_manual !== false ? ' checked' : '') + ' style="width:18px;height:18px;">' +
              '<span>Permite descuento manual del cajero adicional.</span>' +
            '</label>' +
          '</div>' +
        '</details>' +
        // R3b GAP-P5: active_hours + active_days
        '<details style="border:1px solid #E7E5E4;border-radius:8px;padding:10px;">' +
          '<summary style="font-size:13px;font-weight:500;cursor:pointer;">⏰ Horario y días activos (Happy Hour)</summary>' +
          '<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
              '<label style="font-size:12.5px;font-weight:500;">Hora inicio (HH:MM, vacío = todo el día)' +
                '<input id="pf-hour-start" type="time" value="' + escapeAttr(String((promo.active_hours && promo.active_hours.start) || '')) + '" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:13.5px;margin-top:3px;">' +
              '</label>' +
              '<label style="font-size:12.5px;font-weight:500;">Hora fin (HH:MM)' +
                '<input id="pf-hour-end" type="time" value="' + escapeAttr(String((promo.active_hours && promo.active_hours.end) || '')) + '" style="width:100%;padding:9px;border:1px solid #E7E5E4;border-radius:8px;font-size:13.5px;margin-top:3px;">' +
              '</label>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:12.5px;font-weight:500;margin-bottom:4px;">Días activos (vacío = todos los días)</div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;" id="pf-days-wrap">' +
                ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(lbl, idx) {
                  var dow = idx + 1;
                  var checked = Array.isArray(promo.active_days) && promo.active_days.indexOf(dow) >= 0;
                  return '<label style="display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #E7E5E4;border-radius:6px;cursor:pointer;font-size:12px;background:' + (checked ? '#FEF3C7' : '#FFF') + ';">' +
                    '<input type="checkbox" class="pf-day" data-dow="' + dow + '"' + (checked ? ' checked' : '') + ' style="margin:0;">' +
                    '<span>' + lbl + '</span></label>';
                }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</details>' +
        '<div id="pf-msg" style="font-size:12px;color:#B91C1C;min-height:14px;"></div>' +
      '</form>' +
      '</div>' +
      '<div style="padding:14px 22px;background:#F5F5F4;display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="btn" onclick="_vlxCloseModal()">Cancelar</button>' +
        '<button class="btn accent" onclick="submitPromotionForm()">' + (isEdit ? '💾 Guardar cambios' : '✓ Crear promoción') + '</button>' +
      '</div>';
    _vlxOpenModal(html, { width: '660px' });
    setTimeout(function () { var i = document.getElementById('pf-name'); if (i) i.focus(); }, 80);
  }

  window.submitPromotionForm = async function () {
    var $ = function (id) { return document.getElementById(id); };
    var msg = $('pf-msg');
    if (!msg) return;
    msg.textContent = '';
    var name = ($('pf-name').value || '').trim();
    var type = $('pf-type').value;
    var value = parseFloat($('pf-value').value);
    var applies_to = $('pf-applies').value;
    var applies_value = ($('pf-applies-val').value || '').trim();
    var start = $('pf-start').value;
    var end = $('pf-end').value;
    var coupon = ($('pf-coupon').value || '').trim().toUpperCase();
    var maxUses = parseInt($('pf-maxuses').value, 10) || 0;
    var minPurchase = parseFloat($('pf-minpurchase').value) || 0;
    var id = ($('pf-id').value || '').trim();

    if (!name || name.length < 2) { msg.textContent = 'El nombre debe tener al menos 2 caracteres.'; return; }
    if (!type) { msg.textContent = 'El tipo es obligatorio.'; return; }
    if (!isFinite(value) || value < 0) { msg.textContent = 'Valor inválido.'; return; }
    if (type === 'percent' && value > 100) { msg.textContent = 'El % no puede ser > 100.'; return; }
    if (!start || !end) { msg.textContent = 'Las fechas son obligatorias.'; return; }
    if (new Date(end) < new Date(start)) { msg.textContent = 'La fecha fin debe ser posterior a la de inicio.'; return; }
    if (applies_to !== 'all' && !applies_value) { msg.textContent = 'Especifica la categoría/producto/monto.'; return; }

    // R3b GAP-P1/P3/P5: gather priority/stackable/combinable + active_hours/days
    var priority = parseInt((($('pf-priority') || {}).value) || '100', 10);
    if (!isFinite(priority) || priority < 0) priority = 100;
    var stackable = !!(($('pf-stackable') || {}).checked);
    var combinableManual = !!(($('pf-combine-manual') || {}).checked);
    var hourStart = (($('pf-hour-start') || {}).value || '').trim();
    var hourEnd = (($('pf-hour-end') || {}).value || '').trim();
    var activeHours = null;
    if (hourStart && hourEnd) activeHours = { start: hourStart, end: hourEnd };
    else if ((hourStart && !hourEnd) || (!hourStart && hourEnd)) {
      msg.textContent = 'Si configuras horario, ambas horas (inicio/fin) son obligatorias.'; return;
    }
    var activeDays = [];
    var dayChecks = document.querySelectorAll('.pf-day');
    if (dayChecks && dayChecks.length) {
      dayChecks.forEach(function (cb) { if (cb.checked) activeDays.push(parseInt(cb.dataset.dow, 10)); });
    }
    var body = {
      tenant_id: _vTenant(),
      name: name,
      type: type,
      value: value,
      applies_to: applies_to,
      applies_value: applies_value || null,
      start_date: start,
      end_date: end,
      coupon_code: coupon || null,
      code: coupon || null,
      max_uses: maxUses,
      min_purchase: minPurchase,
      min_amount: minPurchase,
      // R3b columns
      priority: priority,
      stackable: stackable,
      combinable_with_manual: combinableManual,
      active_hours: activeHours,
      active_days: activeDays.length ? activeDays : null,
      status: 'active'
    };
    msg.style.color = '#666';
    msg.textContent = 'Guardando…';
    try {
      var url = id ? ('/api/promotions/' + encodeURIComponent(id)) : '/api/promotions';
      var method = id ? 'PATCH' : 'POST';
      var r = await _authFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        var er = await r.json().catch(function () { return {}; });
        msg.style.color = '#B91C1C';
        msg.textContent = 'Error: ' + (er.error || er.message || ('HTTP ' + r.status));
        return;
      }
      _vlxCloseModal();
      showToast('✓ Promoción ' + (id ? 'actualizada' : 'creada'));
      loadPromotions();
    } catch (err) {
      msg.style.color = '#B91C1C';
      msg.textContent = 'Error de red: ' + (err.message || err);
    }
  };

  // Coupon validator widget — POS cart
  window._POS_COUPON = null; // { code, discount, promotion_id }

  window.applyCouponToCart = async function () {
    var input = document.getElementById('pos-coupon-code');
    var statusEl = document.getElementById('pos-coupon-status');
    var clearBtn = document.getElementById('pos-coupon-clear');
    if (!input) return;
    var code = (input.value || '').trim().toUpperCase();
    if (!code) { showToast('Ingresa un código de cupón'); return; }
    if (!Array.isArray(window.CART) || !window.CART.length) { showToast('Carrito vacío'); return; }
    if (statusEl) { statusEl.textContent = '⏳ Validando…'; statusEl.style.color = '#666'; }
    try {
      var items = window.CART.map(function (li) {
        return {
          product_id: li.id || li.product_id,
          name: li.name,
          qty: li.qty || li.quantity || 1,
          price: Number(li.price || 0),
          category: li.category || ''
        };
      });
      var r = await _authFetch('/api/promotions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: _vTenant(), coupon_code: code, items: items })
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || data.valid === false) {
        if (statusEl) { statusEl.textContent = '❌ ' + (data.error || data.message || 'Cupón no válido'); statusEl.style.color = '#B91C1C'; }
        showToast('Cupón no válido');
        window._POS_COUPON = null;
        if (clearBtn) clearBtn.style.display = 'none';
        return;
      }
      var discount = Number(data.discount || data.discount_amount || 0);
      window._POS_COUPON = { code: code, discount: discount, promotion_id: data.promotion_id || data.id || null };
      if (statusEl) { statusEl.textContent = '✓ Aplicado − ' + _vlxFormatMoney(discount); statusEl.style.color = '#065F46'; }
      if (clearBtn) clearBtn.style.display = 'inline-block';
      showToast('✓ Cupón aplicado: − ' + _vlxFormatMoney(discount));
      try { if (typeof window.renderCart === 'function') window.renderCart(); else if (typeof window.updateTotal === 'function') window.updateTotal(); } catch (e) { /* nop */ }
    } catch (err) {
      if (statusEl) { statusEl.textContent = '❌ Error: ' + (err.message || err); statusEl.style.color = '#B91C1C'; }
      showToast('Error validando cupón');
    }
  };

  window.clearCouponFromCart = function () {
    window._POS_COUPON = null;
    var input = document.getElementById('pos-coupon-code');
    var statusEl = document.getElementById('pos-coupon-status');
    var clearBtn = document.getElementById('pos-coupon-clear');
    if (input) input.value = '';
    if (statusEl) statusEl.textContent = '';
    if (clearBtn) clearBtn.style.display = 'none';
    showToast('Cupón removido');
    try { if (typeof window.renderCart === 'function') window.renderCart(); else if (typeof window.updateTotal === 'function') window.updateTotal(); } catch (e) { }
  };

  // Wire promo search
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'promo-search') {
      clearTimeout(window._promoSearchTimer);
      window._promoSearchTimer = setTimeout(function () { renderPromotionsTable(window._PROMO_CACHE || []); }, 200);
    }
  });

  /* ============================================================
     MODULE 3 — COTIZACIONES
     ============================================================ */
  window._QUO_CACHE = [];

  window.loadQuotations = async function () {
    var tbody = document.getElementById('quo-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-3);">⏳ Cargando cotizaciones…</td></tr>';
    try {
      var status = (document.getElementById('quo-filter-status') || {}).value || '';
      var customer = ((document.getElementById('quo-filter-customer') || {}).value || '').trim().toLowerCase();
      var from = (document.getElementById('quo-filter-from') || {}).value || '';
      var to = (document.getElementById('quo-filter-to') || {}).value || '';
      var qs = '?tenant_id=' + encodeURIComponent(_vTenant());
      if (status) qs += '&status=' + encodeURIComponent(status);
      if (from) qs += '&from=' + encodeURIComponent(from);
      if (to) qs += '&to=' + encodeURIComponent(to);
      var r = await _authFetch('/api/quotations' + qs);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var data = await r.json();
      var items = Array.isArray(data) ? data : (data.items || data.quotations || []);
      if (customer) {
        items = items.filter(function (it) { return String(it.customer_name || '').toLowerCase().indexOf(customer) >= 0; });
      }
      window._QUO_CACHE = items;
      renderQuotationsTable(items);
      updateQuotationsStats(items);
    } catch (err) {
      console.error('[quo] loadQuotations:', err);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--danger,#B91C1C);">Error: ' + escapeHtml(err.message || String(err)) + '</td></tr>';
      showToast('Error cargando cotizaciones');
    }
  };

  function renderQuotationsTable(items) {
    var tbody = document.getElementById('quo-body');
    if (!tbody) return;
    var sub = document.getElementById('quo-sub');
    if (sub) sub.textContent = items.length + (items.length === 1 ? ' cotización' : ' cotizaciones');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-3);">No hay cotizaciones registradas.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(function (q) {
      var qid = String(q.id || q.folio || '');
      var qidSafe = escapeAttr(qid);
      var status = String(q.status || 'draft').toLowerCase();
      var itemsCount = Array.isArray(q.items) ? q.items.length : (q.items_count || 0);
      var actions = '<button class="btn sm" onclick="viewEditQuotation(\'' + qidSafe + '\')" title="Ver / Editar">👁 Ver</button>';
      actions += ' <button class="btn sm" onclick="printQuotation(\'' + qidSafe + '\')" title="Imprimir / PDF">🖨 PDF</button>';
      actions += ' <button class="btn sm" onclick="openSendQuotationModal(\'' + qidSafe + '\')" title="Enviar">📤 Enviar</button>';
      if (status !== 'converted' && status !== 'rejected') {
        actions += ' <button class="btn sm accent" onclick="convertQuotationToSale(\'' + qidSafe + '\')" title="Convertir a venta">💱 → Venta</button>';
      }
      return '<tr>' +
        '<td class="mono" style="font-size:11.5px;">' + escapeHtml(qid) + '</td>' +
        '<td>' + escapeHtml(_vlxFormatDate(q.created_at || q.date)) + '</td>' +
        '<td>' + escapeHtml(String(q.customer_name || 'Público en general')) + '</td>' +
        '<td class="num">' + itemsCount + '</td>' +
        '<td class="num" style="font-weight:600;">' + _vlxFormatMoney(q.total || 0) + '</td>' +
        '<td>' + escapeHtml(_vlxFormatDate(q.valid_until || q.expires_at)) + '</td>' +
        '<td>' + _vlxStatusBadge(status) + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');
  }

  function updateQuotationsStats(items) {
    var now = new Date();
    var thisMonth = items.filter(function (it) {
      var d = new Date(it.created_at || it.date || 0);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    var totalAmount = thisMonth.reduce(function (s, it) { return s + Number(it.total || 0); }, 0);
    var converted = items.filter(function (it) { return String(it.status || '').toLowerCase() === 'converted'; }).length;
    var totalSent = items.filter(function (it) {
      var s = String(it.status || '').toLowerCase();
      return s === 'sent' || s === 'accepted' || s === 'converted';
    }).length;
    var convRate = totalSent ? Math.round((converted / totalSent) * 100) : 0;
    var pending = items.filter(function (it) { return String(it.status || '').toLowerCase() === 'sent'; }).length;
    var $ = function (id) { return document.getElementById(id); };
    if ($('quo-stat-month')) $('quo-stat-month').textContent = thisMonth.length;
    if ($('quo-stat-amount')) $('quo-stat-amount').textContent = _vlxFormatMoney(totalAmount);
    if ($('quo-stat-conv')) $('quo-stat-conv').textContent = convRate + '%';
    if ($('quo-stat-pending')) $('quo-stat-pending').textContent = pending;
  }

  window.exportQuotationsCSV = function () {
    var rows = (window._QUO_CACHE || []).map(function (q) {
      return {
        folio: q.id || q.folio || '',
        fecha: _vlxFormatDate(q.created_at || q.date),
        cliente: q.customer_name || '',
        items: Array.isArray(q.items) ? q.items.length : (q.items_count || 0),
        total: Number(q.total || 0).toFixed(2),
        valido_hasta: _vlxFormatDate(q.valid_until || q.expires_at),
        estado: q.status || ''
      };
    });
    if (!rows.length) { showToast('No hay cotizaciones para exportar'); return; }
    var fn = 'cotizaciones-' + new Date().toISOString().slice(0, 10) + '.csv';
    _vlxDownloadCSV(fn, ['folio', 'fecha', 'cliente', 'items', 'total', 'valido_hasta', 'estado'], rows);
    showToast('✓ Exportadas ' + rows.length + ' cotizaciones');
  };

  window.viewEditQuotation = async function (id) {
    try {
      var r = await _authFetch('/api/quotations/' + encodeURIComponent(id) + '?tenant_id=' + encodeURIComponent(_vTenant()));
      var q;
      if (r.ok) q = await r.json();
      else q = (window._QUO_CACHE || []).find(function (x) { return String(x.id || x.folio) === String(id); });
      if (!q) { showToast('No se pudo cargar'); return; }
      var rows = (q.items || []).map(function (li) {
        return '<tr><td>' + escapeHtml(li.name || li.product_name || '—') + '</td>' +
          '<td class="num">' + (li.qty || li.quantity || 1) + '</td>' +
          '<td class="num">' + _vlxFormatMoney(li.price || li.unit_price || 0) + '</td>' +
          '<td class="num">' + _vlxFormatMoney((li.qty || li.quantity || 1) * (li.price || li.unit_price || 0)) + '</td></tr>';
      }).join('');
      var qidSafe = escapeAttr(String(q.id || q.folio || ''));
      var status = String(q.status || 'draft').toLowerCase();
      var html =
        '<div style="padding:18px 22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;">' +
          '<div><strong style="font-size:17px;">Cotización #' + escapeHtml(String(q.id || q.folio || '')) + '</strong>' +
          '<div style="font-size:12px;color:#666;margin-top:3px;">' + escapeHtml(_vlxFormatDateTime(q.created_at || q.date)) + ' · ' + _vlxStatusBadge(status) + '</div></div>' +
          '<button onclick="_vlxCloseModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
        '</div>' +
        '<div style="padding:22px;overflow-y:auto;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px;">' +
            '<div><span style="color:#666;">Cliente:</span> <strong>' + escapeHtml(String(q.customer_name || 'Público')) + '</strong></div>' +
            '<div><span style="color:#666;">Válido hasta:</span> <strong>' + escapeHtml(_vlxFormatDate(q.valid_until || q.expires_at)) + '</strong></div>' +
            '<div><span style="color:#666;">Total:</span> <strong>' + _vlxFormatMoney(q.total || 0) + '</strong></div>' +
            '<div><span style="color:#666;">Estado:</span> ' + _vlxStatusBadge(status) + '</div>' +
          '</div>' +
          (q.notes ? '<div style="padding:10px;background:#FFFBEB;border-radius:8px;font-size:12.5px;margin-bottom:14px;"><strong>Notas:</strong> ' + escapeHtml(String(q.notes)) + '</div>' : '') +
          '<table class="tbl" style="width:100%;font-size:13px;"><thead><tr><th data-i18n="producto">Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" style="text-align:center;padding:14px;color:#999;">Sin items</td></tr>') + '</tbody></table>' +
        '</div>' +
        '<div style="padding:14px 22px;background:#F5F5F4;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
          '<button class="btn" onclick="_vlxCloseModal()">Cerrar</button>' +
          '<button class="btn" onclick="printQuotation(\'' + qidSafe + '\')">🖨 PDF</button>' +
          '<button class="btn" onclick="openSendQuotationModal(\'' + qidSafe + '\')">📤 Enviar</button>' +
          (status !== 'converted' && status !== 'rejected' ? '<button class="btn accent" onclick="convertQuotationToSale(\'' + qidSafe + '\')">💱 Convertir a venta</button>' : '') +
        '</div>';
      _vlxOpenModal(html, { width: '760px' });
    } catch (err) {
      showToast('Error: ' + (err.message || err));
    }
  };

  window.printQuotation = async function (id) {
    showToast('Generando cotización…');
    var q = (window._QUO_CACHE || []).find(function (x) { return String(x.id || x.folio) === String(id); });
    if (!q) {
      try {
        var r = await _authFetch('/api/quotations/' + encodeURIComponent(id) + '?tenant_id=' + encodeURIComponent(_vTenant()));
        if (r.ok) q = await r.json();
      } catch (e) { /* */ }
    }
    if (!q) { showToast('No se pudo cargar la cotización'); return; }
    var w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { showToast('Bloqueador de popups activo'); return; }
    var rows = (q.items || []).map(function (li, i) {
      var qty = Number(li.qty || li.quantity || 1);
      var price = Number(li.price || li.unit_price || 0);
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(li.name || li.product_name || '—') + '</td>' +
        '<td style="text-align:right;">' + qty + '</td>' +
        '<td style="text-align:right;">' + _vlxFormatMoney(price) + '</td>' +
        '<td style="text-align:right;">' + _vlxFormatMoney(qty * price) + '</td></tr>';
    }).join('');
    var bizName = '';
    var bizRfc = '';
    var bizAddr = '';
    try {
      var s = JSON.parse(localStorage.getItem('volvixSession') || 'null') || {};
      bizName = s.business_name || s.tenant_name || 'Mi Negocio';
      bizRfc = s.rfc || '';
      bizAddr = s.address || '';
    } catch (e) { bizName = 'Mi Negocio'; }
    var subtotal = Number(q.subtotal || q.total || 0);
    var tax = Number(q.tax || 0);
    var total = Number(q.total || 0);
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Cotización #' + escapeHtml(String(q.id || q.folio || '')) + '</title>' +
      '<style>body{font-family:Inter,system-ui,sans-serif;padding:30px;color:#1C1917;font-size:13px;}h1{font-size:22px;margin:0 0 4px 0;color:#1E3A8A;}h2{font-size:14px;margin:24px 0 8px 0;}table{width:100%;border-collapse:collapse;margin-top:8px;}th{background:#1E3A8A;color:#fff;padding:8px;text-align:left;font-size:12px;}td{padding:8px;border-bottom:1px solid #E5E7EB;}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1E3A8A;padding-bottom:14px;margin-bottom:18px;}.biz{font-size:11px;color:#666;line-height:1.4;}.totals{margin-top:14px;text-align:right;}.totals table{width:auto;margin-left:auto;}.totals td{padding:5px 12px;border:none;}.totals tr.grand td{font-size:17px;font-weight:700;color:#1E3A8A;border-top:2px solid #1E3A8A;}.terms{margin-top:30px;padding:12px;background:#F5F5F4;border-radius:8px;font-size:11.5px;color:#555;}.sig{margin-top:60px;display:flex;justify-content:space-between;}.sig div{width:45%;text-align:center;border-top:1px solid #999;padding-top:6px;font-size:11px;}@media print{body{padding:14px;}.no-print{display:none;}}</style>' +
      '</head><body>' +
      '<div class="head">' +
        '<div><h1>' + escapeHtml(bizName) + '</h1>' +
        '<div class="biz">' + escapeHtml(bizRfc || '') + '</div>' +
        '<div class="biz">' + escapeHtml(bizAddr || '') + '</div></div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:18px;font-weight:700;color:#1E3A8A;">COTIZACIÓN</div>' +
          '<div style="font-size:13px;margin-top:4px;">#' + escapeHtml(String(q.id || q.folio || '')) + '</div>' +
          '<div class="biz">Fecha: ' + escapeHtml(_vlxFormatDate(q.created_at || q.date)) + '</div>' +
          '<div class="biz">Válido hasta: <strong>' + escapeHtml(_vlxFormatDate(q.valid_until || q.expires_at)) + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<h2>Cliente</h2>' +
      '<div style="padding:10px;background:#F5F5F4;border-radius:8px;font-size:13px;"><strong>' + escapeHtml(String(q.customer_name || 'Público en general')) + '</strong>' +
        (q.customer_phone ? '<br>Tel: ' + escapeHtml(String(q.customer_phone)) : '') +
        (q.customer_email ? '<br>Email: ' + escapeHtml(String(q.customer_email)) : '') +
      '</div>' +
      '<h2>Productos / Servicios</h2>' +
      '<table><thead><tr><th style="width:40px;">#</th><th>Descripción</th><th style="text-align:right;width:60px;">Cant.</th><th style="text-align:right;width:90px;">P. Unit.</th><th style="text-align:right;width:100px;">Subtotal</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" style="text-align:center;color:#999;">Sin items</td></tr>') +
      '</tbody></table>' +
      '<div class="totals"><table>' +
        '<tr><td style="text-align:right;color:#666;">Subtotal:</td><td>' + _vlxFormatMoney(subtotal) + '</td></tr>' +
        (tax > 0 ? '<tr><td style="text-align:right;color:#666;">Impuestos:</td><td>' + _vlxFormatMoney(tax) + '</td></tr>' : '') +
        '<tr class="grand"><td style="text-align:right;">TOTAL:</td><td>' + _vlxFormatMoney(total) + '</td></tr>' +
      '</table></div>' +
      (q.notes ? '<h2>Notas</h2><div style="padding:10px;background:#FFFBEB;border-radius:8px;font-size:12px;">' + escapeHtml(String(q.notes)) + '</div>' : '') +
      '<div class="terms"><strong>Términos y condiciones:</strong><br>' +
        '· Esta cotización tiene una vigencia hasta el <strong>' + escapeHtml(_vlxFormatDate(q.valid_until || q.expires_at)) + '</strong>.<br>' +
        '· Precios sujetos a disponibilidad del producto.<br>' +
        '· Forma de pago: a convenir con el vendedor.</div>' +
      '<div class="sig"><div>Atención cliente</div><div>Firma autorizada</div></div>' +
      '<div class="no-print" style="margin-top:30px;text-align:center;"><button onclick="window.print()" style="padding:10px 20px;background:#1E3A8A;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">🖨 Imprimir / PDF</button></div>' +
      '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},400);};</scr' + 'ipt>' +
      '</body></html>');
    w.document.close();
    showToast('✓ Cotización abierta — listo para imprimir/PDF');
  };

  window.openSendQuotationModal = function (id) {
    var q = (window._QUO_CACHE || []).find(function (x) { return String(x.id || x.folio) === String(id); }) || {};
    var html =
      '<div style="padding:18px 22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;">' +
        '<strong style="font-size:16px;">Enviar cotización #' + escapeHtml(String(id)) + '</strong>' +
        '<button onclick="_vlxCloseModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
      '</div>' +
      '<div style="padding:20px;">' +
        '<form id="send-quo-form" style="display:flex;flex-direction:column;gap:12px;">' +
          '<label style="font-size:13px;font-weight:500;">Canal *' +
            '<select id="sq-channel" required style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
              '<option value="whatsapp">WhatsApp</option>' +
              '<option value="email">Email</option>' +
              '<option value="sms">SMS</option>' +
            '</select>' +
          '</label>' +
          '<label style="font-size:13px;font-weight:500;">Destinatario *' +
            '<input id="sq-to" type="text" required minlength="3" maxlength="120" value="' + escapeAttr(String(q.customer_phone || q.customer_email || '')) + '" placeholder="Teléfono o email del cliente" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
          '</label>' +
          '<label style="font-size:13px;font-weight:500;">Mensaje (opcional)' +
            '<textarea id="sq-message" rows="3" maxlength="500" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;resize:vertical;" placeholder="Mensaje personalizado…">Hola, te envío la cotización solicitada. Cualquier duda, ¡estoy a tus órdenes!</textarea>' +
          '</label>' +
          '<div id="sq-msg" style="font-size:12px;color:#B91C1C;min-height:14px;"></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" class="btn" onclick="_vlxCloseModal()">Cancelar</button>' +
            '<button type="submit" class="btn accent">📤 Enviar</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    var modal = _vlxOpenModal(html, { width: '500px' });
    var form = modal.querySelector('#send-quo-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var channel = modal.querySelector('#sq-channel').value;
      var to = modal.querySelector('#sq-to').value.trim();
      var message = modal.querySelector('#sq-message').value.trim();
      var msg = modal.querySelector('#sq-msg');
      if (!to || to.length < 3) { msg.textContent = 'Destinatario inválido.'; return; }
      if (channel === 'email' && to.indexOf('@') < 0) { msg.textContent = 'Email inválido.'; return; }
      msg.style.color = '#666';
      msg.textContent = 'Enviando…';
      try {
        var r = await _authFetch('/api/quotations/' + encodeURIComponent(id) + '/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: _vTenant(), channel: channel, to: to, message: message })
        });
        if (!r.ok) {
          var er = await r.json().catch(function () { return {}; });
          msg.style.color = '#B91C1C';
          msg.textContent = 'Error: ' + (er.error || er.message || ('HTTP ' + r.status));
          return;
        }
        // Also update quotation status to "sent"
        try {
          await _authFetch('/api/quotations/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: _vTenant(), status: 'sent' })
          });
        } catch (e) { /* */ }
        _vlxCloseModal();
        showToast('✓ Cotización enviada');
        loadQuotations();
      } catch (err) {
        msg.style.color = '#B91C1C';
        msg.textContent = 'Error de red: ' + (err.message || err);
      }
    });
    setTimeout(function () { modal.querySelector('#sq-to').focus(); }, 80);
  };

  window.convertQuotationToSale = function (id) {
    if (!confirm('¿Convertir la cotización #' + id + ' a una venta? Se creará una venta con los mismos productos.')) return;
    showToast('Convirtiendo…');
    (async function () {
      try {
        var r = await _authFetch('/api/quotations/' + encodeURIComponent(id) + '/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: _vTenant() })
        });
        if (!r.ok) {
          var er = await r.json().catch(function () { return {}; });
          showToast('Error: ' + (er.error || er.message || ('HTTP ' + r.status)));
          return;
        }
        var saved = await r.json().catch(function () { return {}; });
        showToast('✓ Convertida a venta #' + (saved.sale_id || saved.id || ''));
        loadQuotations();
      } catch (err) {
        showToast('Error: ' + (err.message || err));
      }
    })();
  };

  // ----- New Quotation modal -----
  window._NEW_QUO_STATE = { customer: null, items: [], validity_days: 7, notes: '' };

  window.openNewQuotationModal = function () {
    window._NEW_QUO_STATE = { customer: null, items: [], validity_days: 7, notes: '' };
    renderNewQuoModal();
  };

  function renderNewQuoModal() {
    var st = window._NEW_QUO_STATE;
    var subtotal = (st.items || []).reduce(function (s, i) { return s + (Number(i.qty) * Number(i.price || 0)); }, 0);
    var html =
      '<div style="padding:18px 22px;border-bottom:1px solid #E7E5E4;display:flex;align-items:center;justify-content:space-between;">' +
        '<strong style="font-size:17px;">Nueva cotización</strong>' +
        '<button onclick="_vlxCloseModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
      '</div>' +
      '<div style="padding:20px;overflow-y:auto;">' +
        '<div style="display:grid;grid-template-columns:1fr 160px;gap:12px;margin-bottom:14px;">' +
          '<label style="font-size:13px;font-weight:500;">Cliente *' +
            '<input id="nq-customer" type="text" required minlength="2" maxlength="120" value="' + escapeAttr(String((st.customer && st.customer.name) || '')) + '" placeholder="Buscar cliente o escribir nombre…" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
            '<div id="nq-customer-results" style="margin-top:4px;border:1px solid #E7E5E4;border-radius:8px;max-height:140px;overflow-y:auto;display:none;"></div>' +
          '</label>' +
          '<label style="font-size:13px;font-weight:500;">Vigencia (días)' +
            '<input id="nq-validity" type="number" min="1" max="365" value="' + (st.validity_days || 7) + '" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
          '</label>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px;align-items:flex-end;">' +
          '<label style="font-size:13px;font-weight:500;flex:1;">Buscar producto' +
            '<input id="nq-prod-search" type="text" placeholder="Código o nombre…" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;">' +
          '</label>' +
          '<button class="btn accent" onclick="newQuoSearchProduct()">+ Agregar</button>' +
        '</div>' +
        '<div id="nq-prod-results" style="border:1px solid #E7E5E4;border-radius:8px;max-height:140px;overflow-y:auto;display:none;margin-bottom:10px;"></div>' +
        '<div style="border:1px solid #E7E5E4;border-radius:8px;max-height:280px;overflow-y:auto;">' +
          ((st.items || []).length ?
            '<table class="tbl" style="width:100%;font-size:13px;"><thead><tr><th data-i18n="producto">Producto</th><th class="num" style="width:70px;">Cant.</th><th class="num" style="width:90px;">Precio</th><th class="num" style="width:100px;">Subtotal</th><th style="width:32px;"></th></tr></thead><tbody>' +
              (st.items || []).map(function (li, idx) {
                return '<tr>' +
                  '<td>' + escapeHtml(String(li.name)) + '</td>' +
                  '<td class="num"><input type="number" min="1" value="' + li.qty + '" onchange="newQuoUpdateQty(' + idx + ', this.value)" style="width:60px;padding:4px 6px;border:1px solid #E7E5E4;border-radius:4px;text-align:right;"></td>' +
                  '<td class="num"><input type="number" min="0" step="0.01" value="' + li.price + '" onchange="newQuoUpdatePrice(' + idx + ', this.value)" style="width:80px;padding:4px 6px;border:1px solid #E7E5E4;border-radius:4px;text-align:right;"></td>' +
                  '<td class="num">' + _vlxFormatMoney(li.qty * li.price) + '</td>' +
                  '<td><button class="btn sm" onclick="newQuoRemove(' + idx + ')" title="Quitar" style="color:#B91C1C;">✕</button></td>' +
                '</tr>';
              }).join('') +
            '</tbody></table>' :
            '<div style="padding:24px;text-align:center;color:#999;font-size:13px;">Sin productos. Busca y agrega arriba.</div>'
          ) +
        '</div>' +
        '<div style="text-align:right;font-size:16px;font-weight:700;margin-top:8px;color:#1E3A8A;">Subtotal: ' + _vlxFormatMoney(subtotal) + '</div>' +
        '<label style="display:block;font-size:13px;font-weight:500;margin-top:12px;">Notas' +
          '<textarea id="nq-notes" rows="3" maxlength="500" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;margin-top:4px;resize:vertical;" placeholder="Términos, condiciones, etc.">' + escapeHtml(String(st.notes || '')) + '</textarea>' +
        '</label>' +
        '<div id="nq-msg" style="font-size:12px;color:#B91C1C;min-height:14px;margin-top:8px;"></div>' +
      '</div>' +
      '<div style="padding:14px 22px;background:#F5F5F4;display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="btn" onclick="_vlxCloseModal()">Cancelar</button>' +
        '<button class="btn accent" onclick="submitNewQuotation()">✓ Crear cotización</button>' +
      '</div>';
    _vlxOpenModal(html, { width: '780px' });
    setTimeout(function () {
      var ci = document.getElementById('nq-customer');
      if (ci) {
        ci.addEventListener('input', function () {
          clearTimeout(window._nqCustTimer);
          window._nqCustTimer = setTimeout(newQuoSearchCustomer, 250);
        });
        ci.focus();
      }
      var pi = document.getElementById('nq-prod-search');
      if (pi) pi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); newQuoSearchProduct(); } });
    }, 80);
  }

  window.newQuoSearchCustomer = async function () {
    var input = document.getElementById('nq-customer');
    var results = document.getElementById('nq-customer-results');
    if (!input || !results) return;
    var q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    try {
      var r = await _authFetch('/api/customers?search=' + encodeURIComponent(q) + '&limit=8&tenant_id=' + encodeURIComponent(_vTenant()));
      var data = r.ok ? await r.json() : {};
      var customers = Array.isArray(data) ? data : (data.items || data.customers || []);
      if (!customers.length) { results.style.display = 'none'; return; }
      results.innerHTML = customers.map(function (c) {
        return '<div style="padding:8px 10px;border-bottom:1px solid #F5F5F4;cursor:pointer;font-size:13px;" onmouseover="this.style.background=\'#FFFBEB\'" onmouseout="this.style.background=\'\'" onclick="newQuoSelectCustomer(' + JSON.stringify(c).replace(/"/g, '&quot;') + ')">' +
          '<strong>' + escapeHtml(c.name || '—') + '</strong>' +
          (c.phone ? ' <span style="color:#666;font-size:11px;">' + escapeHtml(c.phone) + '</span>' : '') +
        '</div>';
      }).join('');
      results.style.display = 'block';
    } catch (e) { results.style.display = 'none'; }
  };

  window.newQuoSelectCustomer = function (c) {
    window._NEW_QUO_STATE.customer = c;
    var input = document.getElementById('nq-customer');
    var results = document.getElementById('nq-customer-results');
    if (input) input.value = c.name || '';
    if (results) results.style.display = 'none';
  };

  window.newQuoSearchProduct = async function () {
    var input = document.getElementById('nq-prod-search');
    var results = document.getElementById('nq-prod-results');
    if (!input || !results) return;
    var q = input.value.trim();
    if (!q) return;
    try {
      var r = await _authFetch('/api/products?search=' + encodeURIComponent(q) + '&limit=10&tenant_id=' + encodeURIComponent(_vTenant()));
      var data = r.ok ? await r.json() : {};
      var prods = Array.isArray(data) ? data : (data.items || data.products || []);
      if (!prods.length) { results.innerHTML = '<div style="padding:8px;color:#999;font-size:12px;text-align:center;">Sin resultados.</div>'; results.style.display = 'block'; return; }
      results.innerHTML = prods.map(function (p) {
        return '<div style="padding:8px 10px;border-bottom:1px solid #F5F5F4;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;" onmouseover="this.style.background=\'#FFFBEB\'" onmouseout="this.style.background=\'\'" onclick="newQuoAddProduct(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">' +
          '<div><strong>' + escapeHtml(p.name || '—') + '</strong>' + (p.code ? ' <span style="color:#666;font-size:11px;">' + escapeHtml(p.code) + '</span>' : '') + '</div>' +
          '<div style="font-weight:600;">' + _vlxFormatMoney(p.price || 0) + '</div>' +
        '</div>';
      }).join('');
      results.style.display = 'block';
    } catch (e) { results.style.display = 'none'; }
  };

  window.newQuoAddProduct = function (p) {
    var st = window._NEW_QUO_STATE;
    var existing = st.items.find(function (i) { return String(i.product_id) === String(p.id); });
    if (existing) {
      existing.qty = Number(existing.qty) + 1;
    } else {
      st.items.push({
        product_id: p.id,
        name: p.name || '—',
        qty: 1,
        price: Number(p.price || 0),
        code: p.code || ''
      });
    }
    var input = document.getElementById('nq-prod-search');
    var results = document.getElementById('nq-prod-results');
    if (input) input.value = '';
    if (results) results.style.display = 'none';
    // Capture form state
    captureNewQuoFormState();
    renderNewQuoModal();
  };

  window.newQuoUpdateQty = function (idx, val) {
    var n = parseInt(val, 10);
    if (n > 0) window._NEW_QUO_STATE.items[idx].qty = n;
    captureNewQuoFormState();
    renderNewQuoModal();
  };
  window.newQuoUpdatePrice = function (idx, val) {
    var n = parseFloat(val);
    if (n >= 0) window._NEW_QUO_STATE.items[idx].price = n;
    captureNewQuoFormState();
    renderNewQuoModal();
  };
  window.newQuoRemove = function (idx) {
    window._NEW_QUO_STATE.items.splice(idx, 1);
    captureNewQuoFormState();
    renderNewQuoModal();
  };

  function captureNewQuoFormState() {
    var st = window._NEW_QUO_STATE;
    var v = document.getElementById('nq-validity');
    var n = document.getElementById('nq-notes');
    var c = document.getElementById('nq-customer');
    if (v) st.validity_days = parseInt(v.value, 10) || 7;
    if (n) st.notes = n.value || '';
    if (c && (!st.customer || st.customer.name !== c.value)) {
      st.customer = { name: c.value, ad_hoc: true };
    }
  }

  window.submitNewQuotation = async function () {
    captureNewQuoFormState();
    var st = window._NEW_QUO_STATE;
    var msg = document.getElementById('nq-msg');
    if (!st.customer || !st.customer.name || st.customer.name.length < 2) { if (msg) msg.textContent = 'El cliente es obligatorio.'; return; }
    if (!st.items.length) { if (msg) msg.textContent = 'Agrega al menos un producto.'; return; }
    if (!st.validity_days || st.validity_days < 1) { if (msg) msg.textContent = 'Vigencia inválida.'; return; }
    var validUntil = new Date(Date.now() + st.validity_days * 86400000).toISOString().slice(0, 10);
    var subtotal = st.items.reduce(function (s, i) { return s + (Number(i.qty) * Number(i.price || 0)); }, 0);
    var body = {
      tenant_id: _vTenant(),
      customer_id: st.customer.id || null,
      customer_name: st.customer.name,
      customer_phone: st.customer.phone || null,
      customer_email: st.customer.email || null,
      items: st.items,
      subtotal: subtotal,
      total: subtotal,
      validity_days: st.validity_days,
      valid_until: validUntil,
      notes: st.notes || '',
      status: 'draft'
    };
    if (msg) { msg.style.color = '#666'; msg.textContent = 'Guardando…'; }
    try {
      var r = await _authFetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        var er = await r.json().catch(function () { return {}; });
        if (msg) { msg.style.color = '#B91C1C'; msg.textContent = 'Error: ' + (er.error || er.message || ('HTTP ' + r.status)); }
        return;
      }
      var saved = await r.json().catch(function () { return {}; });
      _vlxCloseModal();
      showToast('✓ Cotización #' + (saved.id || '') + ' creada');
      loadQuotations();
      if (saved.id) {
        setTimeout(function () { if (confirm('¿Generar PDF/imprimir ahora?')) printQuotation(saved.id); }, 350);
      }
    } catch (err) {
      if (msg) { msg.style.color = '#B91C1C'; msg.textContent = 'Error: ' + (err.message || err); }
    }
  };

  // Wire quo filters
  document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'quo-filter-status' || e.target.id === 'quo-filter-from' || e.target.id === 'quo-filter-to')) {
      loadQuotations();
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'quo-filter-customer') {
      clearTimeout(window._quoFilterTimer);
      window._quoFilterTimer = setTimeout(loadQuotations, 300);
    }
  });

  // Auto-load on screen change
  (function wireScreenAutoLoad() {
    var origShowScreen = window.showScreen;
    if (typeof origShowScreen !== 'function') return;
    if (origShowScreen.__b43Wrapped) return;
    var wrapped = function (name) {
      origShowScreen.apply(this, arguments);
      try {
        if (name === 'devoluciones' && typeof window.loadReturns === 'function') window.loadReturns();
        else if (name === 'promociones' && typeof window.loadPromotions === 'function') window.loadPromotions();
        else if (name === 'cotizaciones' && typeof window.loadQuotations === 'function') window.loadQuotations();
      } catch (e) { console.warn('[B43] auto-load:', e); }
    };
    wrapped.__b43Wrapped = true;
    window.showScreen = wrapped;
  })();
    } catch (err) {
      console.error('[volvix-pos-bridge] init error:', err);
    }
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(_runVolvixBridge, { timeout: 2000 });
  } else {
    setTimeout(_runVolvixBridge, 50);
  }
})();
