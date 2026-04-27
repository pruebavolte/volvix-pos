/**
 * volvix-i18n-wiring.js
 * Sistema i18n multi-idioma para Volvix POS
 * Idiomas: Español (es), English (en), Português (pt), Français (fr), Deutsch (de), Italiano (it), 日本語 (ja)
 * Agent-15 - Ronda 7 Fibonacci - Expandido R17
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // TRADUCCIONES (100+ keys por idioma)
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  // TRADUCCIONES (code-split: es eager, otros 6 lazy via fetch)
  // ═══════════════════════════════════════════════════════════
  const TRANSLATIONS = {
    es: {
      "login.title": "Iniciar sesión",
      "login.subtitle": "Bienvenido a Volvix POS",
      "login.email": "Correo electrónico",
      "login.password": "Contraseña",
      "login.submit": "Entrar",
      "login.forgot": "¿Olvidaste tu contraseña?",
      "login.register": "Crear cuenta",
      "login.remember": "Recordarme",
      "login.error.invalid": "Credenciales inválidas",
      "login.error.empty": "Completa todos los campos",
      "login.loading": "Iniciando sesión...",
      "login.logout": "Cerrar sesión",
      "nav.dashboard": "Panel",
      "nav.pos": "Punto de venta",
      "nav.products": "Productos",
      "nav.inventory": "Inventario",
      "nav.customers": "Clientes",
      "nav.suppliers": "Proveedores",
      "nav.reports": "Reportes",
      "nav.settings": "Configuración",
      "nav.users": "Usuarios",
      "nav.help": "Ayuda",
      "nav.profile": "Perfil",
      "nav.notifications": "Notificaciones",
      "pos.cart.empty": "Carrito vacío",
      "pos.cart.title": "Carrito",
      "pos.cart.add": "Agregar al carrito",
      "pos.cart.remove": "Quitar",
      "pos.cart.clear": "Vaciar carrito",
      "pos.cart.items": "artículos",
      "pos.subtotal": "Subtotal",
      "pos.tax": "Impuestos",
      "pos.discount": "Descuento",
      "pos.total": "Total",
      "pos.checkout": "Cobrar",
      "pos.cash": "Efectivo",
      "pos.card": "Tarjeta",
      "pos.transfer": "Transferencia",
      "pos.change": "Cambio",
      "pos.payment": "Pago",
      "pos.receipt": "Recibo",
      "pos.print": "Imprimir",
      "pos.scan": "Escanear código",
      "pos.search.product": "Buscar producto",
      "pos.quantity": "Cantidad",
      "pos.price": "Precio",
      "product.name": "Nombre",
      "product.code": "Código",
      "product.barcode": "Código de barras",
      "product.category": "Categoría",
      "product.brand": "Marca",
      "product.stock": "Stock",
      "product.cost": "Costo",
      "product.price.sale": "Precio venta",
      "product.description": "Descripción",
      "product.image": "Imagen",
      "product.new": "Nuevo producto",
      "product.edit": "Editar producto",
      "product.delete": "Eliminar producto",
      "inv.title": "Inventario",
      "inv.in": "Entrada",
      "inv.out": "Salida",
      "inv.adjust": "Ajuste",
      "inv.transfer": "Traspaso",
      "inv.low": "Stock bajo",
      "inv.out_of_stock": "Agotado",
      "inv.warehouse": "Almacén",
      "customer.name": "Nombre",
      "customer.phone": "Teléfono",
      "customer.email": "Correo",
      "customer.address": "Dirección",
      "customer.rfc": "RFC",
      "customer.new": "Nuevo cliente",
      "customer.balance": "Saldo",
      "customer.credit": "Crédito",
      "report.sales": "Ventas",
      "report.daily": "Diario",
      "report.weekly": "Semanal",
      "report.monthly": "Mensual",
      "report.yearly": "Anual",
      "report.export": "Exportar",
      "report.from": "Desde",
      "report.to": "Hasta",
      "report.generate": "Generar reporte",
      "action.save": "Guardar",
      "action.cancel": "Cancelar",
      "action.delete": "Eliminar",
      "action.edit": "Editar",
      "action.add": "Agregar",
      "action.search": "Buscar",
      "action.filter": "Filtrar",
      "action.refresh": "Actualizar",
      "action.close": "Cerrar",
      "action.confirm": "Confirmar",
      "action.back": "Atrás",
      "action.next": "Siguiente",
      "action.finish": "Finalizar",
      "action.yes": "Sí",
      "action.no": "No",
      "msg.success": "Operación exitosa",
      "msg.error": "Ocurrió un error",
      "msg.loading": "Cargando...",
      "msg.saving": "Guardando...",
      "msg.confirm.delete": "¿Estás seguro de eliminar?",
      "msg.no_data": "Sin datos",
      "msg.no_results": "Sin resultados",
      "msg.welcome": "Bienvenido",
      "msg.goodbye": "Hasta pronto",
      "msg.required": "Campo obligatorio",
      "msg.saved": "Guardado correctamente",
      "msg.deleted": "Eliminado correctamente",
      "time.today": "Hoy",
      "time.yesterday": "Ayer",
      "time.tomorrow": "Mañana",
      "time.now": "Ahora",
      "time.minutes": "minutos",
      "time.hours": "horas",
      "time.days": "días",
      "plural.item.one": "{n} artículo",
      "plural.item.other": "{n} artículos",
      "plural.product.one": "{n} producto",
      "plural.product.other": "{n} productos",
      "common.save": "Guardar",
      "common.cancel": "Cancelar",
      "common.delete": "Eliminar",
      "common.edit": "Editar",
      "common.search": "Buscar",
      "common.export": "Exportar",
      "common.import": "Importar",
      "common.close": "Cerrar",
      "common.open": "Abrir",
      "common.new": "Nuevo",
      "common.view": "Ver",
      "common.status": "Estado",
      "common.type": "Tipo",
      "common.date": "Fecha",
      "common.user": "Usuario",
      "common.email": "Email",
      "common.phone": "Teléfono",
      "common.total": "Total",
      "common.subtotal": "Subtotal",
      "common.active": "Activos",
      "common.inactive": "Inactivos",
      "common.expires": "Vence",
      "common.expired": "Vencido",
      "common.version": "Versión",
      "common.system": "Sistema",
      "common.config": "Configuración",
      "common.logout": "Salir",
      "common.save_changes": "Guardar cambios",
      "common.no_results": "Sin resultados",
      "pos.products": "Productos",
      "pos.sales": "Ventas",
      "pos.customers": "Clientes",
      "pos.inventory": "Inventario",
      "pos.cash_register": "Caja",
      "pos.cashier": "Cajero",
      "pos.shift": "Turno",
      "pos.opening": "Apertura",
      "pos.dashboard": "Dashboard",
      "pos.reports": "Reportes",
      "pos.returns": "Devoluciones",
      "pos.quotes": "Cotizaciones",
      "pos.tickets": "Tickets",
      "pos.low_stock": "Stock bajo",
      "sales.new": "Nueva venta",
      "sales.cobrar": "Cobrar",
      "sales.cancel": "Cancelar venta",
      "sales.discount": "Descuento",
      "sales.today": "Ventas hoy",
      "sales.cash": "Ventas efectivo",
      "sales.card": "Ventas tarjeta",
      "sales.daily": "Ventas por día",
      "sales.top_products": "Top productos",
      "sales.total_to_collect": "Total a cobrar",
      "tenant.title": "Tenant",
      "tenant.list": "Tenants",
      "tenant.active": "Tenants activos",
      "tenant.plan": "Plan",
      "tenant.modules": "Módulos",
      "tenant.devices": "Dispositivos",
      "tenant.domain": "Dominio",
      "tenant.subdomain": "Subdominio",
      "tenant.vertical": "Vertical",
      "tenant.role.admin": "Administrador",
      "tenant.brand": "Marca",
      "tenant.commercial_name": "Nombre comercial"
    }
  };

  // Idiomas disponibles (carga lazy salvo es)
  const AVAILABLE_LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja'];
  const I18N_BASE = (function() {
    try {
      const s = document.currentScript && document.currentScript.src;
      if (s) return s.replace(/[^/]*$/, '') + 'i18n/';
    } catch (e) {}
    return 'i18n/';
  })();
  const CACHE_PREFIX = 'volvix:i18n:cache:';
  const CACHE_VERSION = 'v1';
  const _loading = {}; // lang -> Promise

  function _cacheGet(lang) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + lang);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === CACHE_VERSION && parsed.d) return parsed.d;
    } catch (e) {}
    return null;
  }
  function _cacheSet(lang, dict) {
    try {
      localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify({ v: CACHE_VERSION, d: dict, t: Date.now() }));
    } catch (e) { /* quota */ }
  }

  async function loadLanguage(lang) {
    if (TRANSLATIONS[lang]) return TRANSLATIONS[lang];
    if (!AVAILABLE_LANGS.includes(lang)) return null;
    const cached = _cacheGet(lang);
    if (cached) { TRANSLATIONS[lang] = cached; return cached; }
    if (_loading[lang]) return _loading[lang];
    _loading[lang] = fetch(I18N_BASE + lang + '.json', { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(dict => {
        TRANSLATIONS[lang] = dict;
        _cacheSet(lang, dict);
        return dict;
      })
      .catch(err => {
        console.warn('[i18n] failed to load ' + lang + ':', err);
        delete _loading[lang];
        return null;
      });
    return _loading[lang];
  }

// ═══════════════════════════════════════════════════════════
  // CONFIG locale / moneda
  // ═══════════════════════════════════════════════════════════
  const LOCALES = {
    es: { locale: 'es-MX', currency: 'MXN', flag: '🇲🇽', name: 'Español' },
    en: { locale: 'en-US', currency: 'USD', flag: '🇺🇸', name: 'English' },
    pt: { locale: 'pt-BR', currency: 'BRL', flag: '🇧🇷', name: 'Português' },
    fr: { locale: 'fr-FR', currency: 'EUR', flag: '🇫🇷', name: 'Français' },
    de: { locale: 'de-DE', currency: 'EUR', flag: '🇩🇪', name: 'Deutsch' },
    it: { locale: 'it-IT', currency: 'EUR', flag: '🇮🇹', name: 'Italiano' },
    ja: { locale: 'ja-JP', currency: 'JPY', flag: '🇯🇵', name: '日本語' }
  };

  const FALLBACK = 'es';
  const STORAGE_KEY = 'volvix:lang';

  // Detectar idioma inicial
  let currentLang = localStorage.getItem(STORAGE_KEY);
  if (!currentLang || !AVAILABLE_LANGS.includes(currentLang)) {
    const navLang = (navigator.language || navigator.userLanguage || FALLBACK).slice(0, 2).toLowerCase();
    currentLang = AVAILABLE_LANGS.includes(navLang) ? navLang : FALLBACK;
  }

  // ═══════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════
  window.t = function(key, fallback, params) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS[FALLBACK];
    let text = dict[key] || TRANSLATIONS[FALLBACK][key] || fallback || key;
    if (params && typeof text === 'string') {
      Object.keys(params).forEach(p => {
        text = text.replace(new RegExp('\\{' + p + '\\}', 'g'), params[p]);
      });
    }
    return text;
  };

  window.tPlural = function(baseKey, n) {
    const suffix = n === 1 ? '.one' : '.other';
    return window.t(baseKey + suffix, null, { n: n });
  };

  window.formatNumber = function(n) {
    try { return new Intl.NumberFormat(LOCALES[currentLang].locale).format(n); }
    catch (e) { return String(n); }
  };

  window.formatCurrency = function(n) {
    try {
      return new Intl.NumberFormat(LOCALES[currentLang].locale, {
        style: 'currency', currency: LOCALES[currentLang].currency
      }).format(n);
    } catch (e) { return String(n); }
  };

  window.formatDate = function(d) {
    try {
      const dt = (d instanceof Date) ? d : new Date(d);
      return new Intl.DateTimeFormat(LOCALES[currentLang].locale, {
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(dt);
    } catch (e) { return String(d); }
  };

  window.formatDateTime = function(d) {
    try {
      const dt = (d instanceof Date) ? d : new Date(d);
      return new Intl.DateTimeFormat(LOCALES[currentLang].locale, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(dt);
    } catch (e) { return String(d); }
  };

  window.setLanguage = async function(lang) {
    if (!AVAILABLE_LANGS.includes(lang)) return false;
    if (!TRANSLATIONS[lang]) {
      const dict = await loadLanguage(lang);
      if (!dict) return false;
    }
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    translateAll();
    updateSelectorButton();
    window.dispatchEvent(new CustomEvent('volvix:langchange', { detail: { lang: lang } }));
    return true;
  };

  // ═══════════════════════════════════════════════════════════
  // DOM helpers
  // ═══════════════════════════════════════════════════════════
  // Build inverse map: lowercased Spanish text → translation key (lazy)
  let _esIndex = null;
  function buildEsIndex() {
    if (_esIndex) return _esIndex;
    _esIndex = {};
    const es = TRANSLATIONS.es || {};
    for (const key in es) {
      const txt = String(es[key] || '').trim();
      if (txt && txt.length >= 2 && txt.length <= 60) {
        const k = txt.toLowerCase();
        if (!_esIndex[k]) _esIndex[k] = key;
      }
    }
    return _esIndex;
  }

  // Walk text nodes and translate Spanish text to current language
  function autoTranslateTextNodes() {
    if (currentLang === 'es') return; // no-op when in Spanish
    const idx = buildEsIndex();
    const dict = TRANSLATIONS[currentLang] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = (p.tagName || '').toUpperCase();
        if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const toTranslate = [];
    let node;
    while ((node = walker.nextNode())) toTranslate.push(node);
    toTranslate.forEach(n => {
      const original = n.nodeValue;
      const trimmed = original.trim();
      if (!trimmed) return;
      const lookup = trimmed.toLowerCase();
      const key = idx[lookup];
      if (!key) return;
      if (!n._volvixOriginal) n._volvixOriginal = original;
      const translated = dict[key];
      if (translated && translated !== trimmed) {
        // preserve whitespace
        const pre = original.match(/^\s*/)[0];
        const post = original.match(/\s*$/)[0];
        n.nodeValue = pre + translated + post;
      } else if (currentLang === 'es' && n._volvixOriginal) {
        n.nodeValue = n._volvixOriginal;
      }
    });
    // Also placeholders and titles without data-i18n
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      if (!el._origPlaceholder) el._origPlaceholder = el.placeholder;
      const k = idx[String(el._origPlaceholder).trim().toLowerCase()];
      if (k && dict[k]) el.placeholder = dict[k];
    });
    document.querySelectorAll('[title]').forEach(el => {
      if (!el._origTitle) el._origTitle = el.getAttribute('title') || '';
      const k = idx[String(el._origTitle).trim().toLowerCase()];
      if (k && dict[k]) el.setAttribute('title', dict[k]);
    });
    document.querySelectorAll('button[value], input[type=button][value], input[type=submit][value]').forEach(el => {
      if (!el._origValue) el._origValue = el.value;
      const k = idx[String(el._origValue).trim().toLowerCase()];
      if (k && dict[k]) el.value = dict[k];
    });
  }

  // Restore original Spanish text when switching back to es
  function restoreSpanish() {
    document.querySelectorAll('input, textarea, button').forEach(el => {
      if (el._origPlaceholder !== undefined) el.placeholder = el._origPlaceholder;
      if (el._origValue !== undefined && 'value' in el) el.value = el._origValue;
    });
    document.querySelectorAll('[title]').forEach(el => {
      if (el._origTitle !== undefined) el.setAttribute('title', el._origTitle);
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node._volvixOriginal) node.nodeValue = node._volvixOriginal;
    }
  }

  function translateAll() {
    // 1) Explicit data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (!el.dataset.i18nOriginal) el.dataset.i18nOriginal = el.textContent;
      el.textContent = window.t(key, el.dataset.i18nOriginal);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = window.t(key, el.placeholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      el.title = window.t(key, el.title);
    });
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.dataset.i18nValue;
      el.value = window.t(key, el.value);
    });
    // 2) Auto-translate text nodes (NEW)
    if (currentLang === 'es') {
      restoreSpanish();
    } else {
      try { autoTranslateTextNodes(); } catch(e) { console.warn('[i18n] auto-translate failed:', e); }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Selector flotante
  // ═══════════════════════════════════════════════════════════
  let selectorBtn = null;
  let dropdownEl = null;

  function updateSelectorButton() {
    if (selectorBtn) selectorBtn.innerHTML = LOCALES[currentLang].flag;
  }

  function createLangSelector() {
    selectorBtn = document.createElement('button');
    selectorBtn.id = 'volvix-i18n-btn';
    selectorBtn.innerHTML = LOCALES[currentLang].flag;
    selectorBtn.title = 'Idioma / Language / Idioma';
    selectorBtn.style.cssText = [
      'position:fixed', 'top:140px', 'right:20px',
      'width:44px', 'height:44px', 'border-radius:50%',
      'background:#fff', 'border:2px solid #2563eb',
      'cursor:pointer', 'font-size:22px', 'z-index:9989',
      'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'transition:transform .2s'
    ].join(';');
    selectorBtn.onmouseenter = () => selectorBtn.style.transform = 'scale(1.1)';
    selectorBtn.onmouseleave = () => selectorBtn.style.transform = 'scale(1)';
    selectorBtn.onclick = (e) => {
      e.stopPropagation();
      toggleDropdown();
    };
    document.body.appendChild(selectorBtn);

    dropdownEl = document.createElement('div');
    dropdownEl.id = 'volvix-i18n-dropdown';
    dropdownEl.style.cssText = [
      'position:fixed', 'top:190px', 'right:20px',
      'background:#fff', 'border:1px solid #ccc', 'border-radius:8px',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'z-index:9990', 'display:none', 'min-width:160px',
      'font-family:system-ui,sans-serif', 'font-size:14px'
    ].join(';');

    Object.keys(LOCALES).forEach(code => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;';
      item.innerHTML = '<span style="font-size:20px">' + LOCALES[code].flag + '</span><span>' + LOCALES[code].name + '</span>';
      item.onmouseenter = () => item.style.background = '#f3f4f6';
      item.onmouseleave = () => item.style.background = '';
      item.onclick = () => {
        window.setLanguage(code);
        hideDropdown();
      };
      dropdownEl.appendChild(item);
    });

    document.body.appendChild(dropdownEl);
    document.addEventListener('click', hideDropdown);
  }

  function toggleDropdown() {
    if (!dropdownEl) return;
    dropdownEl.style.display = dropdownEl.style.display === 'block' ? 'none' : 'block';
  }
  function hideDropdown() {
    if (dropdownEl) dropdownEl.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════
  function init() {
    document.documentElement.lang = currentLang;
    createLangSelector();
    if (currentLang !== 'es' && !TRANSLATIONS[currentLang]) {
      loadLanguage(currentLang).then(() => translateAll()).catch(() => translateAll());
    } else {
      translateAll();
    }
    // Re-traducir periódicamente para SPA dinámicas
    setInterval(translateAll, 3000);
    // MutationObserver para nodos nuevos
    if (window.MutationObserver) {
      const obs = new MutationObserver(() => translateAll());
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.I18nAPI = {
    t: window.t,
    tPlural: window.tPlural,
    setLanguage: window.setLanguage,
    current: () => currentLang,
    available: () => AVAILABLE_LANGS.slice(),
    locale: () => LOCALES[currentLang],
    formatNumber: window.formatNumber,
    formatCurrency: window.formatCurrency,
    formatDate: window.formatDate,
    formatDateTime: window.formatDateTime,
    retranslate: translateAll,
    loadLanguage: loadLanguage
  };

  // Namespace Volvix.i18n (alias) — Volvix.i18n.setLanguage('en') sin reload
  window.Volvix = window.Volvix || {};
  window.Volvix.i18n = window.I18nAPI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
