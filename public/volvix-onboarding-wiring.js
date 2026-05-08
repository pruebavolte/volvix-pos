/**
 * volvix-onboarding-wiring.js
 * Sistema de Onboarding y Tutorial Interactivo para Volvix POS
 * Agent-13 — Ronda 6 Fibonacci
 *
 * Features:
 *  - Tours paso a paso con tooltips
 *  - Highlight de elementos con overlay perforado
 *  - Progress bar superior
 *  - Skip y resume con persistencia (localStorage)
 *  - Tours por rol: cajero, owner, superadmin, admin
 *  - Welcome modal en primer login
 *  - Tips contextuales (data-tip)
 *  - Help center con búsqueda
 *  - Placeholders para videos futuros
 */
(function () {
  'use strict';

  // ─────────────────────────── CONFIG ───────────────────────────
  const ONBOARD_KEY = 'volvix:onboarding-state';
  const TIPS_KEY    = 'volvix:tips-dismissed';
  const SESSION_KEY = 'volvixSession';
  const Z_OVERLAY   = 99999;
  const Z_TOOLTIP   = 100000;
  const Z_PROGRESS  = 100001;
  const Z_HELP      = 9992;

  // ─────────────────────────── TOURS ────────────────────────────
  const TOURS = {
    cajero: [
      { selector: '#barcode-input',        title: 'Bienvenido al POS',  body: 'Aquí escaneas códigos de barras o escribes el SKU manualmente. Presiona Enter para agregar al carrito.', video: null },
      { selector: '.cart-area',            title: 'Carrito de venta',   body: 'Aquí ves los productos del ticket actual con cantidades, precios y subtotal.' },
      { selector: '[onclick*="completePay"]', title: 'F12 — Cobrar',     body: 'Para cerrar la venta presiona F12 o haz clic en este botón. Abrirá el modal de pago.' },
      { selector: '[onclick*="newTicket"]',   title: 'F2 — Nuevo ticket', body: 'Inicia un ticket nuevo sin perder el actual. Útil para atender otro cliente rápido.' },
      { selector: '[data-fkey="F3"]',      title: 'F3 — Buscar producto', body: 'Abre el buscador de productos por nombre o SKU.' },
      { selector: '[data-fkey="F4"]',      title: 'F4 — Cliente',        body: 'Asocia el ticket a un cliente registrado para acumular puntos o crédito.' },
      { selector: '[data-fkey="F8"]',      title: 'F8 — Descuento',      body: 'Aplica descuentos por porcentaje o monto fijo (requiere permiso).' },
      { selector: '[data-fkey="F10"]',     title: 'F10 — Cancelar',      body: 'Cancela el ticket actual. Se registra en bitácora.' },
      { selector: '#cash-drawer',          title: 'Cajón de dinero',     body: 'Manejo de efectivo: apertura, retiros, depósitos y conciliación al cierre.' },
      { selector: '#receipt-printer',      title: 'Impresión de tickets', body: 'Configura tu impresora térmica. Imprime ticket, factura o nota de remisión.' }
    ],
    owner: [
      { selector: '[data-kpi="mrr"]',         title: 'MRR',              body: 'Tu ingreso recurrente mensual de todos los tenants activos.' },
      { selector: '[data-kpi="churn"]',       title: 'Churn rate',       body: 'Porcentaje de clientes que cancelaron en el periodo.' },
      { selector: '[data-kpi="ltv"]',         title: 'LTV',              body: 'Valor de vida del cliente promedio.' },
      { selector: '[onclick*="tenants"]',     title: 'Gestión de Tenants', body: 'Administra todos tus clientes: alta, baja, plan, features.' },
      { selector: '[onclick*="features"]',    title: 'Feature Flags',    body: 'Activa o desactiva funciones por cliente sin tocar código.' },
      { selector: '[onclick*="billing"]',     title: 'Facturación',      body: 'Cobros automáticos, recibos, conciliación con Stripe / MP.' },
      { selector: '[onclick*="reports"]',     title: 'Reportes',         body: 'Ventas, productos top, márgenes, embudo y cohortes.' },
      { selector: '[onclick*="audit"]',       title: 'Auditoría',        body: 'Bitácora completa de acciones de todos los usuarios.' }
    ],
    superadmin: [
      { selector: 'header',                   title: 'Panel SaaS Volvix', body: 'Control total del negocio. Acceso a todos los tenants y configuración global.' },
      { selector: '[data-section="infra"]',   title: 'Infraestructura',  body: 'Estado de servidores, base de datos, colas y workers.' },
      { selector: '[data-section="users"]',   title: 'Usuarios globales', body: 'Búsqueda, impersonación y gestión de roles a nivel plataforma.' },
      { selector: '[data-section="logs"]',    title: 'Logs en vivo',     body: 'Stream de eventos en tiempo real. Filtrable por nivel y módulo.' },
      { selector: '[data-section="deploy"]',  title: 'Deploys',          body: 'Historial de despliegues y rollback con un clic.' },
      { selector: '[data-section="flags"]',   title: 'Flags globales',   body: 'Kill-switches y features experimentales para toda la plataforma.' }
    ],
    admin: [
      { selector: '[data-section="users"]',   title: 'Usuarios del tenant', body: 'Crea cajeros, supervisores y gerentes. Asigna permisos granulares.' },
      { selector: '[data-section="catalog"]', title: 'Catálogo',           body: 'Productos, categorías, precios, inventario y proveedores.' },
      { selector: '[data-section="reports"]', title: 'Reportes locales',   body: 'Ventas por turno, cajero, producto y método de pago.' },
      { selector: '[data-section="settings"]', title: 'Configuración',     body: 'Datos fiscales, impresoras, terminales y preferencias.' }
    ]
  };

  // Tips contextuales (se muestran junto a elementos con data-tip)
  const CONTEXTUAL_TIPS = {
    'first-sale':    'Tu primera venta: escanea un código y presiona F12.',
    'low-stock':     'Configura alertas de stock bajo desde Catálogo > Inventario.',
    'cash-cut':      'Recuerda hacer el corte de caja al cierre del turno.',
    'backup':        'Tus datos se respaldan automáticamente cada hora.',
    'multi-device':  'Puedes usar Volvix en varios dispositivos al mismo tiempo.'
  };

  // Help center: artículos buscables (placeholders)
  const HELP_ARTICLES = [
    { id: 'h1',  title: '¿Cómo cobrar una venta?',         tags: ['cobrar','pago','f12','venta'],            body: 'Escanea o agrega productos, presiona F12, elige método de pago, confirma.' },
    { id: 'h2',  title: 'Aplicar descuentos',              tags: ['descuento','f8','promocion'],             body: 'F8 abre el modal de descuentos. Por porcentaje o monto fijo.' },
    { id: 'h3',  title: 'Manejo del cajón de dinero',      tags: ['efectivo','caja','cajon','cash'],         body: 'Apertura, retiros, depósitos y corte de caja al final del turno.' },
    { id: 'h4',  title: 'Devoluciones',                    tags: ['devolucion','reembolso','refund'],        body: 'Busca el ticket original, marca productos a devolver, confirma motivo.' },
    { id: 'h5',  title: 'Cierre de turno',                 tags: ['cierre','turno','corte'],                 body: 'Ve a Caja > Cierre de turno. El sistema cuenta esperado vs contado.' },
    { id: 'h6',  title: 'Configurar impresora térmica',    tags: ['impresora','ticket','printer'],           body: 'Settings > Impresoras > Detectar. Funciona con USB, red y Bluetooth.' },
    { id: 'h7',  title: 'Crear nuevo cajero',              tags: ['usuario','cajero','permisos','rol'],      body: 'Admin > Usuarios > Nuevo. Asigna rol y permisos.' },
    { id: 'h8',  title: 'Reportes de ventas',              tags: ['reporte','ventas','metricas','kpi'],      body: 'Reportes > Ventas. Filtra por fecha, cajero, producto, método.' },
    { id: 'h9',  title: 'Gestión multi-tenant (Owner)',    tags: ['tenant','multi','clientes','saas'],       body: 'Owner > Tenants. Alta, plan, features y métricas por cliente.' },
    { id: 'h10', title: 'Feature flags',                   tags: ['feature','flag','toggle'],                body: 'Activa funciones por tenant sin redeploy.' },
    { id: 'h11', title: 'Atajos de teclado (F-keys)',      tags: ['teclado','atajos','fkeys','shortcuts'],   body: 'F2 nuevo, F3 buscar, F4 cliente, F8 descuento, F10 cancelar, F12 cobrar.' },
    { id: 'h12', title: 'Modo offline',                    tags: ['offline','sin internet','sync'],          body: 'Volvix sigue funcionando sin red. Sincroniza al volver la conexión.' }
  ];

  // ─────────────────────────── ESTADO ───────────────────────────
  let currentTour = null;
  let currentTourName = null;
  let currentStep = 0;
  let resumeRequested = false;

  function getState() {
    try { return JSON.parse(localStorage.getItem(ONBOARD_KEY) || '{}'); }
    catch (_) { return {}; }
  }

  function saveState(state) {
    try { localStorage.setItem(ONBOARD_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); }
    catch (_) { return {}; }
  }

  function getDismissedTips() {
    try { return JSON.parse(localStorage.getItem(TIPS_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function dismissTip(id) {
    const list = getDismissedTips();
    if (!list.includes(id)) list.push(id);
    try { localStorage.setItem(TIPS_KEY, JSON.stringify(list)); } catch (_) {}
  }

  // ─────────────────────────── TOUR CORE ────────────────────────
  function startTour(role, opts) {
    opts = opts || {};
    currentTourName = role;
    currentTour = TOURS[role] || TOURS.cajero;

    const state = getState();
    const saved = state[role];
    if (opts.resume && saved && typeof saved.step === 'number' && !saved.completed) {
      currentStep = Math.min(saved.step, currentTour.length - 1);
      resumeRequested = true;
    } else {
      currentStep = 0;
      resumeRequested = false;
    }
    showStep();
  }

  function ensureOverlay() {
    let overlay = document.getElementById('tour-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tour-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.7);' +
        'z-index:' + Z_OVERLAY + ';pointer-events:auto;transition:background 0.25s;';
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { /* no cerrar al click; obliga a usar botones */ }
      });
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function ensureTooltip() {
    let tip = document.getElementById('tour-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tour-tooltip';
      tip.style.cssText =
        'position:fixed;background:#1e293b;color:#fff;padding:20px;' +
        'border-radius:12px;max-width:360px;min-width:280px;z-index:' + Z_TOOLTIP + ';' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';
      document.body.appendChild(tip);
    }
    return tip;
  }

  function ensureProgress() {
    let bar = document.getElementById('tour-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tour-progress';
      bar.style.cssText =
        'position:fixed;top:0;left:0;height:4px;background:#3b82f6;' +
        'z-index:' + Z_PROGRESS + ';transition:width 0.3s;width:0%;';
      document.body.appendChild(bar);
    }
    return bar;
  }

  function showStep() {
    if (!currentTour || currentStep >= currentTour.length) {
      finishTour(false);
      return;
    }
    const step = currentTour[currentStep];
    const el = step.selector ? document.querySelector(step.selector) : null;

    const overlay = ensureOverlay();
    const tooltip = ensureTooltip();
    const bar = ensureProgress();

    // Highlight con "hueco" radial sobre el elemento
    if (el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = Math.max(rect.width, rect.height) / 2 + 20;
      overlay.style.background =
        'radial-gradient(circle at ' + cx + 'px ' + cy + 'px, ' +
        'transparent 0, transparent ' + radius + 'px, ' +
        'rgba(0,0,0,0.7) ' + (radius + 10) + 'px)';
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    } else {
      overlay.style.background = 'rgba(0,0,0,0.75)';
    }

    // Posicionar tooltip
    const baseRect = el
      ? el.getBoundingClientRect()
      : { top: window.innerHeight / 2 - 100, bottom: window.innerHeight / 2, left: window.innerWidth / 2 - 175, right: 0, width: 0, height: 0 };

    const tooltipTop = Math.min(baseRect.bottom + 20, window.innerHeight - 240);
    const tooltipLeft = Math.max(20, Math.min(baseRect.left, window.innerWidth - 380));
    tooltip.style.top = tooltipTop + 'px';
    tooltip.style.left = tooltipLeft + 'px';

    const isLast = currentStep === currentTour.length - 1;
    const isFirst = currentStep === 0;

    const videoBlock = step.video
      ? '<div style="margin:10px 0;padding:10px;background:#0f172a;border-radius:8px;font-size:12px;color:#94a3b8;">📹 Video: ' + step.video + ' (próximamente)</div>'
      : '';

    tooltip.innerHTML =
      '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px;display:flex;justify-content:space-between;">' +
        '<span>Paso ' + (currentStep + 1) + ' de ' + currentTour.length + '</span>' +
        '<span style="text-transform:uppercase;letter-spacing:1px;">' + (currentTourName || '') + '</span>' +
      '</div>' +
      '<h3 style="font-size:16px;margin:0 0 8px 0;font-weight:600;">' + step.title + '</h3>' +
      '<p style="font-size:13px;color:#cbd5e1;margin:0 0 14px 0;line-height:1.5;">' + step.body + '</p>' +
      videoBlock +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;">' +
        '<button onclick="window.tourPrev()" ' +
          'style="background:none;border:1px solid #475569;color:#fff;padding:6px 14px;' +
          'border-radius:6px;cursor:pointer;font-size:13px;' + (isFirst ? 'opacity:0.3;pointer-events:none;' : '') + '">← Atrás</button>' +
        '<button onclick="window.tourSkip()" ' +
          'style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:12px;text-decoration:underline;">Saltar tutorial</button>' +
        '<button onclick="window.tourNext()" ' +
          'style="background:#3b82f6;color:#fff;border:none;padding:6px 14px;' +
          'border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;">' +
          (isLast ? 'Finalizar ✓' : 'Siguiente →') +
        '</button>' +
      '</div>';

    // Progress bar
    const progress = ((currentStep + 1) / currentTour.length) * 100;
    bar.style.width = progress + '%';

    // Persistir paso para resume
    const state = getState();
    state[currentTourName] = state[currentTourName] || {};
    state[currentTourName].step = currentStep;
    state[currentTourName].started = state[currentTourName].started || Date.now();
    saveState(state);
  }

  function nextStep() { currentStep++; showStep(); }
  function prevStep() { currentStep = Math.max(0, currentStep - 1); showStep(); }
  function skipTour() { finishTour(true); }

  function finishTour(skipped) {
    const o = document.getElementById('tour-overlay');     if (o) o.remove();
    const t = document.getElementById('tour-tooltip');     if (t) t.remove();
    const p = document.getElementById('tour-progress');    if (p) p.remove();

    const session = getSession();
    const state = getState();
    const role = currentTourName || session.role || 'unknown';
    state[role] = {
      completed: !skipped,
      skipped:   !!skipped,
      when:      Date.now(),
      step:      skipped ? currentStep : (currentTour ? currentTour.length : 0)
    };
    saveState(state);

    if (!skipped && typeof window.toast === 'function') {
      window.toast('🎉 Tutorial completado', 'success');
    } else if (skipped && typeof window.toast === 'function') {
      window.toast('Tutorial pausado. Pulsa “?” para continuar.', 'info');
    }
    currentTour = null;
    currentTourName = null;
    currentStep = 0;
  }

  // Hooks globales para botones del tooltip
  window.tourNext = nextStep;
  window.tourPrev = prevStep;
  window.tourSkip = skipTour;

  // ─────────────────────── WELCOME MODAL ────────────────────────
  function showWelcome() {
    const session = getSession();
    const state = getState();
    const role = session.role || 'cajero';

    // 2026-05-07: bypass forzado via URL param (?welcome=force) o
    // window.OnboardingAPI.showWelcome({ force: true }). Util para preview/demo
    // del video de bienvenida sin tener que limpiar localStorage manualmente.
    let force = false;
    try {
      const usp = new URLSearchParams(location.search);
      const w = (usp.get('welcome') || '').toLowerCase();
      if (w === 'force' || w === '1' || w === 'true') force = true;
    } catch (_) {}
    // Tambien puede venir como argumento programatico
    if (arguments[0] && arguments[0].force) force = true;

    if (!force) {
      if (state[role] && state[role].completed) return;
      // R28: respetar dismiss persistente (botón "Después" o tras 3 dismisses)
      try {
        const dismissKey = 'volvix_welcome_dismissed_' + (session.email || 'anon') + '_' + role;
        const dismissedAt = localStorage.getItem(dismissKey);
        if (dismissedAt) {
          const ageMs = Date.now() - parseInt(dismissedAt, 10);
          // dismiss vale 30 días; tras eso reaparece
          if (ageMs >= 0 && ageMs < 30 * 24 * 3600 * 1000) return;
        }
      } catch (e) {}
    }

    const existing = document.getElementById('welcome-modal');
    if (existing) existing.remove();

    // 2026-05-07: Modal de bienvenida con VIDEO REAL de presentadora
    // (mujer hablando) en lugar del cuadro de texto plano. La presentadora
    // saluda al usuario por su nombre y le explica que puede tomar el tour.
    //
    // Estrategia de fuentes de video (con fallback en cascada):
    //   1) /welcome-video.mp4 — si el negocio sube su propio video
    //      (drop-in en public/welcome-video.mp4) toma prioridad.
    //   2) URL CDN libre (Pexels/Pixabay) — video stock de mujer profesional.
    //   3) Fallback final: avatar SVG animado + SpeechSynthesis (voz del navegador).
    //
    // El audio arranca MUTED (politica del browser) y el usuario lo desmutea
    // con un boton, para no asustar con sonido inesperado.

    const modal = document.createElement('div');
    modal.id = 'welcome-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:' + Z_OVERLAY + ';' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;' +
      'animation:vlxFadeIn .25s ease-out;';

    const hasResume = state[role] && typeof state[role].step === 'number' && !state[role].completed && state[role].step > 0;
    const resumeBtn = hasResume
      ? '<button id="wm-resume" style="background:#10b981;color:#fff;border:none;padding:13px 22px;border-radius:9px;cursor:pointer;font-weight:700;font-size:14px;">▶ Continuar (paso ' + (state[role].step + 1) + ')</button>'
      : '';

    // Saludo personalizado por nombre o por email-prefix
    const userName = (function () {
      const e = session.email || '';
      if (!e || e === 'usuario') return 'amigo';
      const local = String(e).split('@')[0];
      // Capitalizar y limpiar prefijo si parece nombre real
      if (/^[a-z]{2,12}$/i.test(local)) return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
      return local.length > 16 ? 'amigo' : local;
    })();

    const roleLabel = ({ owner:'dueño', admin:'administrador', manager:'gerente', cajero:'cajero', vendor:'vendedor' })[role] || role;
    const speech = `¡Hola ${userName}! Bienvenido a Volvix POS. Soy tu asistente. Te voy a mostrar como dominar tu sistema en menos de dos minutos. ¿Empezamos el tour?`;

    // URLs de video con fallback
    // welcome-video.mp4 local → Pixabay CDN (free stock, mujer profesional sonriendo)
    const VIDEO_LOCAL = '/welcome-video.mp4';
    const VIDEO_FALLBACK = 'https://cdn.pixabay.com/video/2023/05/04/162157-823831793_tiny.mp4';

    modal.innerHTML =
      '<style>@keyframes vlxFadeIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}' +
      '@keyframes vlxBlink{0%,90%,100%{opacity:1}95%{opacity:0}}' +
      '@keyframes vlxMouthTalk{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.4)}}' +
      '.vlx-avatar-svg .mouth{animation:vlxMouthTalk .35s ease-in-out infinite;transform-origin:center}' +
      '.vlx-avatar-svg.muted .mouth{animation:none}' +
      '.vlx-avatar-svg .eye{animation:vlxBlink 4.5s infinite}</style>' +
      '<div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;padding:0;border-radius:18px;max-width:540px;width:92%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.7);overflow:hidden;border:1px solid rgba(255,255,255,0.08);">' +
        // Video container
        '<div style="position:relative;width:100%;aspect-ratio:16/10;background:#000;overflow:hidden;">' +
          '<video id="wm-video" autoplay muted loop playsinline preload="auto" ' +
                 'style="width:100%;height:100%;object-fit:cover;display:block;background:#1e293b;" ' +
                 'poster="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 540 340\'><rect fill=\'%23334155\' width=\'540\' height=\'340\'/><text x=\'270\' y=\'180\' font-family=\'system-ui\' font-size=\'18\' fill=\'%2394a3b8\' text-anchor=\'middle\'>Cargando presentación…</text></svg>">' +
            '<source id="wm-video-src1" src="' + VIDEO_LOCAL + '" type="video/mp4">' +
            '<source id="wm-video-src2" src="' + VIDEO_FALLBACK + '" type="video/mp4">' +
          '</video>' +
          // Fallback avatar overlay (visible solo si video falla)
          '<div id="wm-avatar-fallback" style="display:none;position:absolute;inset:0;background:linear-gradient(135deg,#a78bfa 0%,#3b82f6 100%);align-items:center;justify-content:center;">' +
            '<svg class="vlx-avatar-svg" width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
              '<circle cx="100" cy="100" r="95" fill="#fde2c8"/>' +
              '<path d="M30 80 Q100 -20 170 80 L170 60 Q100 0 30 60 Z" fill="#3b1f0e"/>' +
              '<circle class="eye" cx="76" cy="100" r="6" fill="#1e293b"/>' +
              '<circle class="eye" cx="124" cy="100" r="6" fill="#1e293b" style="animation-delay:.1s"/>' +
              '<path d="M70 95 Q76 88 82 95" stroke="#3b1f0e" stroke-width="2" fill="none"/>' +
              '<path d="M118 95 Q124 88 130 95" stroke="#3b1f0e" stroke-width="2" fill="none"/>' +
              '<ellipse class="mouth" cx="100" cy="135" rx="14" ry="7" fill="#c2185b"/>' +
              '<path d="M85 145 Q100 158 115 145" stroke="#fff" stroke-width="1" fill="none" opacity=".5"/>' +
            '</svg>' +
          '</div>' +
          // Overlay con badge "EN VIVO" (estetico)
          '<div style="position:absolute;top:14px;left:14px;background:rgba(220,38,38,0.92);color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;padding:5px 10px;border-radius:5px;display:flex;gap:6px;align-items:center;text-transform:uppercase;">' +
            '<span style="width:7px;height:7px;background:#fff;border-radius:50%;animation:vlxBlink 1.4s infinite;"></span>BIENVENIDA' +
          '</div>' +
          // Boton mute/unmute
          '<button id="wm-mute" aria-label="Activar sonido" title="Activar sonido" style="position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;">🔇</button>' +
          // Subtitulo del speech (caption)
          '<div id="wm-caption" style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.85));color:#fff;font-size:14px;font-weight:600;padding:30px 20px 16px;line-height:1.5;text-shadow:0 1px 3px #000;"></div>' +
        '</div>' +
        // Mensaje + botones
        '<div style="padding:24px 28px 28px;">' +
          '<h2 style="margin:0 0 4px 0;font-size:20px;font-weight:800;letter-spacing:-.3px;">¡Hola, ' + userName + '! 👋</h2>' +
          '<p style="color:#cbd5e1;margin:0 0 4px 0;font-size:13.5px;">Bienvenido a Volvix POS</p>' +
          '<p style="color:#94a3b8;font-size:12px;margin:0 0 20px 0;">Tu rol: <b style="color:#a5b4fc;">' + roleLabel + '</b> · Toma el tour guiado y aprende lo esencial en 2 minutos.</p>' +
          '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
            '<button id="wm-start" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;padding:13px 26px;border-radius:9px;cursor:pointer;font-weight:700;font-size:14px;box-shadow:0 4px 14px rgba(59,130,246,0.4);">▶ Empezar tour</button>' +
            resumeBtn +
            '<button id="wm-later" style="background:none;color:#94a3b8;border:1px solid #475569;padding:13px 22px;border-radius:9px;cursor:pointer;font-size:13.5px;">Después</button>' +
          '</div>' +
          '<div style="margin-top:16px;font-size:11px;color:#64748b;">Puedes reabrirlo desde el botón "Ayuda" en cualquier momento.</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    // Wire: video fallback en cascada — si el local 404, intentar CDN; si falla, mostrar avatar SVG + TTS
    var video = document.getElementById('wm-video');
    var src1 = document.getElementById('wm-video-src1');
    var src2 = document.getElementById('wm-video-src2');
    var avatarFallback = document.getElementById('wm-avatar-fallback');
    var captionEl = document.getElementById('wm-caption');
    var muteBtn = document.getElementById('wm-mute');

    var videoFailed = false;
    function activateAvatarFallback() {
      if (videoFailed) return;
      videoFailed = true;
      try { video.style.display = 'none'; } catch(_) {}
      if (avatarFallback) avatarFallback.style.display = 'flex';
      // Reproducir caption y TTS si esta disponible
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(speech);
          u.lang = 'es-MX';
          u.rate = 1.02; u.pitch = 1.1;
          // Buscar voz femenina en español
          var voices = window.speechSynthesis.getVoices() || [];
          var female = voices.find(function(v){return /es/i.test(v.lang) && /female|mujer|lucia|paulina|monica/i.test(v.name);})
                    || voices.find(function(v){return /es/i.test(v.lang);});
          if (female) u.voice = female;
          window.speechSynthesis.speak(u);
        }
      } catch(_) {}
    }
    if (video) {
      video.addEventListener('error', activateAvatarFallback);
      // Si el primer source falla, el browser auto-prueba el segundo. Si ambos fallan, dispara error.
      if (src1) src1.addEventListener('error', function(){ /* browser intentara src2 */ });
      // Animar caption con texto del speech (palabra por palabra)
      var words = speech.split(' ');
      var idx = 0;
      var captionInterval = setInterval(function () {
        if (idx >= words.length) { clearInterval(captionInterval); return; }
        captionEl.textContent = words.slice(0, ++idx).join(' ');
      }, 220);
    }

    // Mute toggle
    if (muteBtn && video) {
      muteBtn.onclick = function () {
        video.muted = !video.muted;
        muteBtn.textContent = video.muted ? '🔇' : '🔊';
        muteBtn.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar');
        // Si avatar fallback esta activo y el user prendio sonido, hablar TTS
        if (videoFailed && !video.muted) activateAvatarFallback();
      };
    }

    // Botones
    document.getElementById('wm-start').onclick = function () {
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch(_) {}
      try { video && video.pause(); } catch(_) {}
      modal.remove();
      startTour(role);
    };
    document.getElementById('wm-later').onclick = function () {
      try {
        const dismissKey = 'volvix_welcome_dismissed_' + (session.email || 'anon') + '_' + role;
        localStorage.setItem(dismissKey, String(Date.now()));
      } catch (e) {}
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch(_) {}
      try { video && video.pause(); } catch(_) {}
      modal.remove();
    };
    if (hasResume) {
      document.getElementById('wm-resume').onclick = function () {
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch(_) {}
        try { video && video.pause(); } catch(_) {}
        modal.remove();
        startTour(role, { resume: true });
      };
    }
  }

  // ─────────────────────── HELP CENTER ──────────────────────────
  function openHelpCenter() {
    const existing = document.getElementById('help-center');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'help-center';
    panel.style.cssText =
      'position:fixed;bottom:80px;right:20px;width:360px;max-height:520px;background:#0f172a;' +
      'color:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);z-index:' + Z_HELP + ';' +
      'display:flex;flex-direction:column;font-family:system-ui,sans-serif;overflow:hidden;border:1px solid #334155;';

    panel.innerHTML =
      '<div style="padding:14px 16px;background:#1e293b;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="font-weight:bold;font-size:14px;">Centro de Ayuda</div>' +
        '<div style="font-size:11px;color:#94a3b8;">Busca o explora artículos</div></div>' +
        '<button id="hc-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">×</button>' +
      '</div>' +
      '<div style="padding:10px 14px;border-bottom:1px solid #334155;">' +
        '<input id="hc-search" placeholder="Buscar ayuda…" ' +
        'style="width:100%;padding:8px 12px;background:#1e293b;border:1px solid #334155;color:#fff;border-radius:8px;font-size:13px;outline:none;">' +
      '</div>' +
      '<div id="hc-list" style="flex:1;overflow-y:auto;padding:6px 0;"></div>' +
      '<div style="padding:10px 14px;border-top:1px solid #334155;display:flex;gap:8px;">' +
        '<button id="hc-tutorial" style="flex:1;background:#3b82f6;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">▶ Reiniciar tutorial</button>' +
        '<button id="hc-videos" style="flex:1;background:#475569;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;">📹 Videos</button>' +
      '</div>';

    document.body.appendChild(panel);

    function renderList(query) {
      const q = (query || '').trim().toLowerCase();
      const list = document.getElementById('hc-list');
      const filtered = !q ? HELP_ARTICLES : HELP_ARTICLES.filter(function (a) {
        return a.title.toLowerCase().indexOf(q) !== -1
            || (a.tags || []).some(function (t) { return t.indexOf(q) !== -1; })
            || a.body.toLowerCase().indexOf(q) !== -1;
      });
      if (!filtered.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;font-size:13px;">Sin resultados para “' + query + '”</div>';
        return;
      }
      list.innerHTML = filtered.map(function (a) {
        return '<div class="hc-item" data-id="' + a.id + '" ' +
               'style="padding:10px 16px;border-bottom:1px solid #1e293b;cursor:pointer;">' +
               '<div style="font-size:13px;font-weight:600;">' + a.title + '</div>' +
               '<div style="font-size:11px;color:#94a3b8;margin-top:3px;">' + a.body.slice(0, 70) + '…</div>' +
               '</div>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('.hc-item'), function (item) {
        item.onclick = function () {
          const id = item.getAttribute('data-id');
          const art = HELP_ARTICLES.find(function (x) { return x.id === id; });
          if (art) showArticle(art);
        };
        item.onmouseenter = function () { item.style.background = '#1e293b'; };
        item.onmouseleave = function () { item.style.background = 'transparent'; };
      });
    }

    function showArticle(a) {
      const list = document.getElementById('hc-list');
      list.innerHTML =
        '<div style="padding:14px 16px;">' +
          '<button id="hc-back" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:12px;padding:0;margin-bottom:10px;">← Volver</button>' +
          '<h3 style="font-size:15px;margin:0 0 8px 0;">' + a.title + '</h3>' +
          '<p style="font-size:13px;color:#cbd5e1;line-height:1.55;">' + a.body + '</p>' +
          '<div style="margin-top:14px;padding:10px;background:#1e293b;border-radius:8px;font-size:11px;color:#94a3b8;">' +
            '📹 Video tutorial próximamente' +
          '</div>' +
        '</div>';
      document.getElementById('hc-back').onclick = function () { renderList(document.getElementById('hc-search').value); };
    }

    document.getElementById('hc-close').onclick   = function () { panel.remove(); };
    document.getElementById('hc-tutorial').onclick = function () {
      panel.remove();
      const session = getSession();
      startTour(session.role || 'cajero');
    };
    document.getElementById('hc-videos').onclick = function () {
      if (typeof window.toast === 'function') window.toast('Videos próximamente 📹', 'info');
    };
    document.getElementById('hc-search').addEventListener('input', function (e) { renderList(e.target.value); });
    renderList('');
  }

  // ─────────────────────── HELP BUTTON ──────────────────────────
  function createHelpButton() {
    // 2026-05-07 cleanup: FAB deshabilitado, gateado por feature flag.
    // Duplica el FAB de helpdesk (Ayuda). Para re-habilitar:
    // window.VOLVIX_ONBOARDING_HELP_FAB = true antes de cargar.
    if (window.VOLVIX_ONBOARDING_HELP_FAB !== true) return;
    if (document.getElementById('volvix-help-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'volvix-help-btn';
    btn.innerHTML = '?';
    btn.title = 'Ayuda y tutoriales';
    btn.style.cssText =
      'position:fixed;bottom:20px;right:80px;width:42px;height:42px;' +
      'border-radius:50%;background:#a855f7;color:#fff;border:none;' +
      'cursor:pointer;font-size:20px;font-weight:bold;z-index:' + Z_HELP + ';' +
      'box-shadow:0 6px 20px rgba(168,85,247,0.4);transition:transform 0.15s;';
    btn.onmouseenter = function () { btn.style.transform = 'scale(1.1)'; };
    btn.onmouseleave = function () { btn.style.transform = 'scale(1)'; };
    btn.onclick = openHelpCenter;
    document.body.appendChild(btn);
  }

  // ─────────────────────── TIPS CONTEXTUALES ────────────────────
  function showContextualTip(id, anchorEl) {
    if (!CONTEXTUAL_TIPS[id]) return;
    if (getDismissedTips().indexOf(id) !== -1) return;
    if (!anchorEl) return;

    const rect = anchorEl.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.className = 'volvix-ctx-tip';
    tip.style.cssText =
      'position:fixed;background:#fbbf24;color:#0f172a;padding:10px 14px;border-radius:10px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.3);font-size:12px;max-width:260px;z-index:' + Z_HELP + ';' +
      'top:' + (rect.bottom + 8) + 'px;left:' + rect.left + 'px;font-family:system-ui,sans-serif;';
    tip.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px;">💡 Tip</div>' +
      '<div style="line-height:1.4;">' + CONTEXTUAL_TIPS[id] + '</div>' +
      '<div style="text-align:right;margin-top:6px;">' +
        '<button class="ctx-dismiss" style="background:none;border:none;color:#0f172a;font-size:11px;text-decoration:underline;cursor:pointer;">Entendido</button>' +
      '</div>';
    document.body.appendChild(tip);
    tip.querySelector('.ctx-dismiss').onclick = function () {
      dismissTip(id);
      tip.remove();
    };
    setTimeout(function () { if (tip.parentElement) tip.remove(); }, 12000);
  }

  function scanContextualTips() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tip]'), function (el) {
      const id = el.getAttribute('data-tip');
      if (id && CONTEXTUAL_TIPS[id] && getDismissedTips().indexOf(id) === -1) {
        showContextualTip(id, el);
      }
    });
  }

  // ─────────────────────── INIT ─────────────────────────────────
  function init() {
    setTimeout(showWelcome, 1000);
    createHelpButton();
    setTimeout(scanContextualTips, 2500);

    // Atajo de teclado: Shift+? abre el help
    document.addEventListener('keydown', function (e) {
      if (e.shiftKey && (e.key === '?' || e.key === '/')) {
        e.preventDefault();
        openHelpCenter();
      }
    });
  }

  // ─────────────────────── API PÚBLICA ──────────────────────────
  window.OnboardingAPI = {
    start:        startTour,
    resume:       function (role) { startTour(role, { resume: true }); },
    skip:         skipTour,
    next:         nextStep,
    prev:         prevStep,
    showWelcome:  showWelcome,
    openHelp:     openHelpCenter,
    showTip:      showContextualTip,
    dismissTip:   dismissTip,
    getState:     getState,
    reset:        function () {
      try { localStorage.removeItem(ONBOARD_KEY); localStorage.removeItem(TIPS_KEY); } catch (_) {}
      if (typeof window.toast === 'function') window.toast('Onboarding reseteado', 'info');
    },
    tours:        TOURS,
    articles:     HELP_ARTICLES
  };
  window.startVolvixTour = startTour;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
