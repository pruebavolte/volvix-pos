/**
 * volvix-i18n-wiring.js
 * Sistema i18n multi-idioma para Volvix POS
 * Idiomas: Español (es), English (en), Português (pt)
 * Agent-15 - Ronda 7 Fibonacci
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // TRADUCCIONES (100+ keys por idioma)
  // ═══════════════════════════════════════════════════════════
  const TRANSLATIONS = {
    es: {
      // Login
      'login.title': 'Iniciar sesión',
      'login.subtitle': 'Bienvenido a Volvix POS',
      'login.email': 'Correo electrónico',
      'login.password': 'Contraseña',
      'login.submit': 'Entrar',
      'login.forgot': '¿Olvidaste tu contraseña?',
      'login.register': 'Crear cuenta',
      'login.remember': 'Recordarme',
      'login.error.invalid': 'Credenciales inválidas',
      'login.error.empty': 'Completa todos los campos',
      'login.loading': 'Iniciando sesión...',
      'login.logout': 'Cerrar sesión',

      // Navegación
      'nav.dashboard': 'Panel',
      'nav.pos': 'Punto de venta',
      'nav.products': 'Productos',
      'nav.inventory': 'Inventario',
      'nav.customers': 'Clientes',
      'nav.suppliers': 'Proveedores',
      'nav.reports': 'Reportes',
      'nav.settings': 'Configuración',
      'nav.users': 'Usuarios',
      'nav.help': 'Ayuda',
      'nav.profile': 'Perfil',
      'nav.notifications': 'Notificaciones',

      // POS
      'pos.cart.empty': 'Carrito vacío',
      'pos.cart.title': 'Carrito',
      'pos.cart.add': 'Agregar al carrito',
      'pos.cart.remove': 'Quitar',
      'pos.cart.clear': 'Vaciar carrito',
      'pos.cart.items': 'artículos',
      'pos.subtotal': 'Subtotal',
      'pos.tax': 'Impuestos',
      'pos.discount': 'Descuento',
      'pos.total': 'Total',
      'pos.checkout': 'Cobrar',
      'pos.cash': 'Efectivo',
      'pos.card': 'Tarjeta',
      'pos.transfer': 'Transferencia',
      'pos.change': 'Cambio',
      'pos.payment': 'Pago',
      'pos.receipt': 'Recibo',
      'pos.print': 'Imprimir',
      'pos.scan': 'Escanear código',
      'pos.search.product': 'Buscar producto',
      'pos.quantity': 'Cantidad',
      'pos.price': 'Precio',

      // Productos
      'product.name': 'Nombre',
      'product.code': 'Código',
      'product.barcode': 'Código de barras',
      'product.category': 'Categoría',
      'product.brand': 'Marca',
      'product.stock': 'Stock',
      'product.cost': 'Costo',
      'product.price.sale': 'Precio venta',
      'product.description': 'Descripción',
      'product.image': 'Imagen',
      'product.new': 'Nuevo producto',
      'product.edit': 'Editar producto',
      'product.delete': 'Eliminar producto',

      // Inventario
      'inv.title': 'Inventario',
      'inv.in': 'Entrada',
      'inv.out': 'Salida',
      'inv.adjust': 'Ajuste',
      'inv.transfer': 'Traspaso',
      'inv.low': 'Stock bajo',
      'inv.out_of_stock': 'Agotado',
      'inv.warehouse': 'Almacén',

      // Clientes
      'customer.name': 'Nombre',
      'customer.phone': 'Teléfono',
      'customer.email': 'Correo',
      'customer.address': 'Dirección',
      'customer.rfc': 'RFC',
      'customer.new': 'Nuevo cliente',
      'customer.balance': 'Saldo',
      'customer.credit': 'Crédito',

      // Reportes
      'report.sales': 'Ventas',
      'report.daily': 'Diario',
      'report.weekly': 'Semanal',
      'report.monthly': 'Mensual',
      'report.yearly': 'Anual',
      'report.export': 'Exportar',
      'report.from': 'Desde',
      'report.to': 'Hasta',
      'report.generate': 'Generar reporte',

      // Acciones
      'action.save': 'Guardar',
      'action.cancel': 'Cancelar',
      'action.delete': 'Eliminar',
      'action.edit': 'Editar',
      'action.add': 'Agregar',
      'action.search': 'Buscar',
      'action.filter': 'Filtrar',
      'action.refresh': 'Actualizar',
      'action.close': 'Cerrar',
      'action.confirm': 'Confirmar',
      'action.back': 'Atrás',
      'action.next': 'Siguiente',
      'action.finish': 'Finalizar',
      'action.yes': 'Sí',
      'action.no': 'No',

      // Mensajes
      'msg.success': 'Operación exitosa',
      'msg.error': 'Ocurrió un error',
      'msg.loading': 'Cargando...',
      'msg.saving': 'Guardando...',
      'msg.confirm.delete': '¿Estás seguro de eliminar?',
      'msg.no_data': 'Sin datos',
      'msg.no_results': 'Sin resultados',
      'msg.welcome': 'Bienvenido',
      'msg.goodbye': 'Hasta pronto',
      'msg.required': 'Campo obligatorio',
      'msg.saved': 'Guardado correctamente',
      'msg.deleted': 'Eliminado correctamente',

      // Tiempo
      'time.today': 'Hoy',
      'time.yesterday': 'Ayer',
      'time.tomorrow': 'Mañana',
      'time.now': 'Ahora',
      'time.minutes': 'minutos',
      'time.hours': 'horas',
      'time.days': 'días',

      // Plurales
      'plural.item.one': '{n} artículo',
      'plural.item.other': '{n} artículos',
      'plural.product.one': '{n} producto',
      'plural.product.other': '{n} productos'
    },

    en: {
      'login.title': 'Sign in',
      'login.subtitle': 'Welcome to Volvix POS',
      'login.email': 'Email',
      'login.password': 'Password',
      'login.submit': 'Login',
      'login.forgot': 'Forgot password?',
      'login.register': 'Create account',
      'login.remember': 'Remember me',
      'login.error.invalid': 'Invalid credentials',
      'login.error.empty': 'Fill all fields',
      'login.loading': 'Signing in...',
      'login.logout': 'Sign out',

      'nav.dashboard': 'Dashboard',
      'nav.pos': 'Point of sale',
      'nav.products': 'Products',
      'nav.inventory': 'Inventory',
      'nav.customers': 'Customers',
      'nav.suppliers': 'Suppliers',
      'nav.reports': 'Reports',
      'nav.settings': 'Settings',
      'nav.users': 'Users',
      'nav.help': 'Help',
      'nav.profile': 'Profile',
      'nav.notifications': 'Notifications',

      'pos.cart.empty': 'Empty cart',
      'pos.cart.title': 'Cart',
      'pos.cart.add': 'Add to cart',
      'pos.cart.remove': 'Remove',
      'pos.cart.clear': 'Clear cart',
      'pos.cart.items': 'items',
      'pos.subtotal': 'Subtotal',
      'pos.tax': 'Tax',
      'pos.discount': 'Discount',
      'pos.total': 'Total',
      'pos.checkout': 'Checkout',
      'pos.cash': 'Cash',
      'pos.card': 'Card',
      'pos.transfer': 'Transfer',
      'pos.change': 'Change',
      'pos.payment': 'Payment',
      'pos.receipt': 'Receipt',
      'pos.print': 'Print',
      'pos.scan': 'Scan code',
      'pos.search.product': 'Search product',
      'pos.quantity': 'Quantity',
      'pos.price': 'Price',

      'product.name': 'Name',
      'product.code': 'Code',
      'product.barcode': 'Barcode',
      'product.category': 'Category',
      'product.brand': 'Brand',
      'product.stock': 'Stock',
      'product.cost': 'Cost',
      'product.price.sale': 'Sale price',
      'product.description': 'Description',
      'product.image': 'Image',
      'product.new': 'New product',
      'product.edit': 'Edit product',
      'product.delete': 'Delete product',

      'inv.title': 'Inventory',
      'inv.in': 'Inbound',
      'inv.out': 'Outbound',
      'inv.adjust': 'Adjustment',
      'inv.transfer': 'Transfer',
      'inv.low': 'Low stock',
      'inv.out_of_stock': 'Out of stock',
      'inv.warehouse': 'Warehouse',

      'customer.name': 'Name',
      'customer.phone': 'Phone',
      'customer.email': 'Email',
      'customer.address': 'Address',
      'customer.rfc': 'Tax ID',
      'customer.new': 'New customer',
      'customer.balance': 'Balance',
      'customer.credit': 'Credit',

      'report.sales': 'Sales',
      'report.daily': 'Daily',
      'report.weekly': 'Weekly',
      'report.monthly': 'Monthly',
      'report.yearly': 'Yearly',
      'report.export': 'Export',
      'report.from': 'From',
      'report.to': 'To',
      'report.generate': 'Generate report',

      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.edit': 'Edit',
      'action.add': 'Add',
      'action.search': 'Search',
      'action.filter': 'Filter',
      'action.refresh': 'Refresh',
      'action.close': 'Close',
      'action.confirm': 'Confirm',
      'action.back': 'Back',
      'action.next': 'Next',
      'action.finish': 'Finish',
      'action.yes': 'Yes',
      'action.no': 'No',

      'msg.success': 'Operation successful',
      'msg.error': 'An error occurred',
      'msg.loading': 'Loading...',
      'msg.saving': 'Saving...',
      'msg.confirm.delete': 'Are you sure you want to delete?',
      'msg.no_data': 'No data',
      'msg.no_results': 'No results',
      'msg.welcome': 'Welcome',
      'msg.goodbye': 'Goodbye',
      'msg.required': 'Required field',
      'msg.saved': 'Saved successfully',
      'msg.deleted': 'Deleted successfully',

      'time.today': 'Today',
      'time.yesterday': 'Yesterday',
      'time.tomorrow': 'Tomorrow',
      'time.now': 'Now',
      'time.minutes': 'minutes',
      'time.hours': 'hours',
      'time.days': 'days',

      'plural.item.one': '{n} item',
      'plural.item.other': '{n} items',
      'plural.product.one': '{n} product',
      'plural.product.other': '{n} products'
    },

    pt: {
      'login.title': 'Entrar',
      'login.subtitle': 'Bem-vindo ao Volvix POS',
      'login.email': 'E-mail',
      'login.password': 'Senha',
      'login.submit': 'Entrar',
      'login.forgot': 'Esqueceu a senha?',
      'login.register': 'Criar conta',
      'login.remember': 'Lembrar-me',
      'login.error.invalid': 'Credenciais inválidas',
      'login.error.empty': 'Preencha todos os campos',
      'login.loading': 'Entrando...',
      'login.logout': 'Sair',

      'nav.dashboard': 'Painel',
      'nav.pos': 'Ponto de venda',
      'nav.products': 'Produtos',
      'nav.inventory': 'Estoque',
      'nav.customers': 'Clientes',
      'nav.suppliers': 'Fornecedores',
      'nav.reports': 'Relatórios',
      'nav.settings': 'Configurações',
      'nav.users': 'Usuários',
      'nav.help': 'Ajuda',
      'nav.profile': 'Perfil',
      'nav.notifications': 'Notificações',

      'pos.cart.empty': 'Carrinho vazio',
      'pos.cart.title': 'Carrinho',
      'pos.cart.add': 'Adicionar ao carrinho',
      'pos.cart.remove': 'Remover',
      'pos.cart.clear': 'Esvaziar carrinho',
      'pos.cart.items': 'itens',
      'pos.subtotal': 'Subtotal',
      'pos.tax': 'Impostos',
      'pos.discount': 'Desconto',
      'pos.total': 'Total',
      'pos.checkout': 'Cobrar',
      'pos.cash': 'Dinheiro',
      'pos.card': 'Cartão',
      'pos.transfer': 'Transferência',
      'pos.change': 'Troco',
      'pos.payment': 'Pagamento',
      'pos.receipt': 'Recibo',
      'pos.print': 'Imprimir',
      'pos.scan': 'Escanear código',
      'pos.search.product': 'Buscar produto',
      'pos.quantity': 'Quantidade',
      'pos.price': 'Preço',

      'product.name': 'Nome',
      'product.code': 'Código',
      'product.barcode': 'Código de barras',
      'product.category': 'Categoria',
      'product.brand': 'Marca',
      'product.stock': 'Estoque',
      'product.cost': 'Custo',
      'product.price.sale': 'Preço de venda',
      'product.description': 'Descrição',
      'product.image': 'Imagem',
      'product.new': 'Novo produto',
      'product.edit': 'Editar produto',
      'product.delete': 'Excluir produto',

      'inv.title': 'Estoque',
      'inv.in': 'Entrada',
      'inv.out': 'Saída',
      'inv.adjust': 'Ajuste',
      'inv.transfer': 'Transferência',
      'inv.low': 'Estoque baixo',
      'inv.out_of_stock': 'Esgotado',
      'inv.warehouse': 'Armazém',

      'customer.name': 'Nome',
      'customer.phone': 'Telefone',
      'customer.email': 'E-mail',
      'customer.address': 'Endereço',
      'customer.rfc': 'CNPJ/CPF',
      'customer.new': 'Novo cliente',
      'customer.balance': 'Saldo',
      'customer.credit': 'Crédito',

      'report.sales': 'Vendas',
      'report.daily': 'Diário',
      'report.weekly': 'Semanal',
      'report.monthly': 'Mensal',
      'report.yearly': 'Anual',
      'report.export': 'Exportar',
      'report.from': 'De',
      'report.to': 'Até',
      'report.generate': 'Gerar relatório',

      'action.save': 'Salvar',
      'action.cancel': 'Cancelar',
      'action.delete': 'Excluir',
      'action.edit': 'Editar',
      'action.add': 'Adicionar',
      'action.search': 'Buscar',
      'action.filter': 'Filtrar',
      'action.refresh': 'Atualizar',
      'action.close': 'Fechar',
      'action.confirm': 'Confirmar',
      'action.back': 'Voltar',
      'action.next': 'Próximo',
      'action.finish': 'Concluir',
      'action.yes': 'Sim',
      'action.no': 'Não',

      'msg.success': 'Operação bem-sucedida',
      'msg.error': 'Ocorreu um erro',
      'msg.loading': 'Carregando...',
      'msg.saving': 'Salvando...',
      'msg.confirm.delete': 'Tem certeza que deseja excluir?',
      'msg.no_data': 'Sem dados',
      'msg.no_results': 'Sem resultados',
      'msg.welcome': 'Bem-vindo',
      'msg.goodbye': 'Até logo',
      'msg.required': 'Campo obrigatório',
      'msg.saved': 'Salvo com sucesso',
      'msg.deleted': 'Excluído com sucesso',

      'time.today': 'Hoje',
      'time.yesterday': 'Ontem',
      'time.tomorrow': 'Amanhã',
      'time.now': 'Agora',
      'time.minutes': 'minutos',
      'time.hours': 'horas',
      'time.days': 'dias',

      'plural.item.one': '{n} item',
      'plural.item.other': '{n} itens',
      'plural.product.one': '{n} produto',
      'plural.product.other': '{n} produtos'
    }
  };

  // ═══════════════════════════════════════════════════════════
  // CONFIG locale / moneda
  // ═══════════════════════════════════════════════════════════
  const LOCALES = {
    es: { locale: 'es-MX', currency: 'MXN', flag: '🇲🇽', name: 'Español' },
    en: { locale: 'en-US', currency: 'USD', flag: '🇺🇸', name: 'English' },
    pt: { locale: 'pt-BR', currency: 'BRL', flag: '🇧🇷', name: 'Português' }
  };

  const FALLBACK = 'es';
  const STORAGE_KEY = 'volvix:lang';

  // Detectar idioma inicial
  let currentLang = localStorage.getItem(STORAGE_KEY);
  if (!currentLang || !TRANSLATIONS[currentLang]) {
    const navLang = (navigator.language || navigator.userLanguage || FALLBACK).slice(0, 2).toLowerCase();
    currentLang = TRANSLATIONS[navLang] ? navLang : FALLBACK;
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

  window.setLanguage = function(lang) {
    if (!TRANSLATIONS[lang]) return false;
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
  function translateAll() {
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
    translateAll();
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
    available: () => Object.keys(TRANSLATIONS),
    locale: () => LOCALES[currentLang],
    formatNumber: window.formatNumber,
    formatCurrency: window.formatCurrency,
    formatDate: window.formatDate,
    formatDateTime: window.formatDateTime,
    retranslate: translateAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
