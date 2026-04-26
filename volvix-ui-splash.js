/**
 * volvix-ui-splash.js
 * Splash screen UI module for Volvix.
 * Exposes window.Splash with show/hide/setProgress/setStatus APIs.
 *
 * Features:
 *  - Animated logo (pulsing + rotating ring)
 *  - Loading progress bar with percentage
 *  - Rotating tips while loading
 *  - Smooth fade-out transition
 *  - Auto-injects required CSS
 *  - Zero dependencies
 */
(function (global) {
    'use strict';

    var TIPS = [
        'Tip: Usa Ctrl+K para abrir el buscador rapido.',
        'Tip: Puedes arrastrar archivos directamente al area de copia.',
        'Tip: El historial guarda tus ultimos 50 pegados.',
        'Tip: Activa el modo oscuro desde Configuracion > Apariencia.',
        'Tip: Pulsa F1 en cualquier momento para ver la ayuda.',
        'Tip: Sincroniza con la nube para acceder desde otros equipos.',
        'Tip: Las plantillas aceleran tareas repetitivas.',
        'Tip: Exporta tu sesion en JSON o CSV con un clic.',
        'Tip: Configura atajos personalizados en Preferencias.',
        'Tip: El modo enfoque oculta notificaciones temporalmente.'
    ];

    var CSS = [
        '#volvix-splash{position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'background:radial-gradient(ellipse at center,#1a2238 0%,#0b0f1c 100%);color:#e6eaf3;font-family:"Segoe UI",Roboto,Arial,sans-serif;',
        'transition:opacity .6s ease, visibility .6s ease;opacity:1;visibility:visible;}',
        '#volvix-splash.vx-hidden{opacity:0;visibility:hidden;pointer-events:none;}',
        '#volvix-splash .vx-logo-wrap{position:relative;width:140px;height:140px;margin-bottom:32px;}',
        '#volvix-splash .vx-ring{position:absolute;inset:0;border-radius:50%;border:3px solid rgba(120,160,255,.15);',
        'border-top-color:#5b8cff;border-right-color:#7aa2ff;animation:vx-spin 1.4s linear infinite;}',
        '#volvix-splash .vx-ring.vx-ring-2{inset:14px;border-width:2px;border-top-color:#9bb8ff;border-right-color:transparent;',
        'animation:vx-spin 2.1s linear infinite reverse;opacity:.7;}',
        '#volvix-splash .vx-logo{position:absolute;inset:28px;border-radius:50%;background:linear-gradient(135deg,#3a5cff,#7aa2ff);',
        'display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;color:#fff;',
        'box-shadow:0 0 40px rgba(91,140,255,.45),inset 0 0 20px rgba(255,255,255,.15);animation:vx-pulse 1.8s ease-in-out infinite;}',
        '#volvix-splash .vx-title{font-size:28px;font-weight:600;letter-spacing:2px;margin:0 0 6px;}',
        '#volvix-splash .vx-subtitle{font-size:13px;color:#8a95b0;margin:0 0 28px;letter-spacing:1px;text-transform:uppercase;}',
        '#volvix-splash .vx-bar-wrap{width:320px;max-width:70vw;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;}',
        '#volvix-splash .vx-bar{height:100%;width:0%;background:linear-gradient(90deg,#3a5cff,#7aa2ff,#3a5cff);background-size:200% 100%;',
        'border-radius:3px;transition:width .35s ease;animation:vx-shimmer 2s linear infinite;}',
        '#volvix-splash .vx-meta{margin-top:14px;display:flex;justify-content:space-between;width:320px;max-width:70vw;font-size:12px;color:#8a95b0;}',
        '#volvix-splash .vx-tip{margin-top:36px;font-size:13px;color:#a8b3cc;max-width:80vw;text-align:center;min-height:18px;',
        'transition:opacity .4s ease;opacity:1;}',
        '#volvix-splash .vx-tip.vx-fading{opacity:0;}',
        '#volvix-splash .vx-version{position:absolute;bottom:18px;font-size:11px;color:#56607a;letter-spacing:1px;}',
        '@keyframes vx-spin{to{transform:rotate(360deg);}}',
        '@keyframes vx-pulse{0%,100%{transform:scale(1);box-shadow:0 0 40px rgba(91,140,255,.45),inset 0 0 20px rgba(255,255,255,.15);}',
        '50%{transform:scale(1.05);box-shadow:0 0 55px rgba(91,140,255,.65),inset 0 0 25px rgba(255,255,255,.25);}}',
        '@keyframes vx-shimmer{0%{background-position:0% 0;}100%{background-position:200% 0;}}'
    ].join('');

    var state = {
        root: null,
        bar: null,
        pct: null,
        status: null,
        tip: null,
        tipTimer: null,
        tipIdx: 0,
        progress: 0,
        injected: false,
        opts: {}
    };

    function injectStyles() {
        if (state.injected) return;
        var s = document.createElement('style');
        s.id = 'volvix-splash-styles';
        s.textContent = CSS;
        document.head.appendChild(s);
        state.injected = true;
    }

    function buildDom(opts) {
        var root = document.createElement('div');
        root.id = 'volvix-splash';
        root.setAttribute('role', 'progressbar');
        root.setAttribute('aria-label', 'Cargando Volvix');

        var logoWrap = document.createElement('div');
        logoWrap.className = 'vx-logo-wrap';
        logoWrap.innerHTML =
            '<div class="vx-ring"></div>' +
            '<div class="vx-ring vx-ring-2"></div>' +
            '<div class="vx-logo">' + (opts.initial || 'V') + '</div>';

        var title = document.createElement('h1');
        title.className = 'vx-title';
        title.textContent = opts.title || 'VOLVIX';

        var subtitle = document.createElement('p');
        subtitle.className = 'vx-subtitle';
        subtitle.textContent = opts.subtitle || 'Sistema de Copiado Inteligente';

        var barWrap = document.createElement('div');
        barWrap.className = 'vx-bar-wrap';
        var bar = document.createElement('div');
        bar.className = 'vx-bar';
        barWrap.appendChild(bar);

        var meta = document.createElement('div');
        meta.className = 'vx-meta';
        var status = document.createElement('span');
        status.textContent = opts.status || 'Iniciando...';
        var pct = document.createElement('span');
        pct.textContent = '0%';
        meta.appendChild(status);
        meta.appendChild(pct);

        var tip = document.createElement('div');
        tip.className = 'vx-tip';
        tip.textContent = TIPS[0];

        var version = document.createElement('div');
        version.className = 'vx-version';
        version.textContent = opts.version || 'v3.4.0';

        root.appendChild(logoWrap);
        root.appendChild(title);
        root.appendChild(subtitle);
        root.appendChild(barWrap);
        root.appendChild(meta);
        root.appendChild(tip);
        root.appendChild(version);

        state.root = root;
        state.bar = bar;
        state.pct = pct;
        state.status = status;
        state.tip = tip;
        return root;
    }

    function startTipRotation(intervalMs) {
        stopTipRotation();
        state.tipIdx = 0;
        state.tipTimer = setInterval(function () {
            if (!state.tip) return;
            state.tip.classList.add('vx-fading');
            setTimeout(function () {
                state.tipIdx = (state.tipIdx + 1) % TIPS.length;
                if (state.tip) {
                    state.tip.textContent = TIPS[state.tipIdx];
                    state.tip.classList.remove('vx-fading');
                }
            }, 400);
        }, intervalMs || 4000);
    }

    function stopTipRotation() {
        if (state.tipTimer) {
            clearInterval(state.tipTimer);
            state.tipTimer = null;
        }
    }

    function show(opts) {
        opts = opts || {};
        state.opts = opts;
        injectStyles();
        if (state.root && state.root.parentNode) {
            state.root.parentNode.removeChild(state.root);
        }
        var dom = buildDom(opts);
        document.body.appendChild(dom);
        // Force reflow so transitions on later hide() apply.
        void dom.offsetWidth;
        startTipRotation(opts.tipInterval || 4000);
        if (typeof opts.progress === 'number') setProgress(opts.progress);
        return dom;
    }

    function setProgress(value) {
        var v = Math.max(0, Math.min(100, Number(value) || 0));
        state.progress = v;
        if (state.bar) state.bar.style.width = v + '%';
        if (state.pct) state.pct.textContent = Math.round(v) + '%';
        if (state.root) state.root.setAttribute('aria-valuenow', String(Math.round(v)));
    }

    function setStatus(text) {
        if (state.status) state.status.textContent = String(text || '');
    }

    function setTip(text) {
        if (!state.tip) return;
        state.tip.classList.add('vx-fading');
        setTimeout(function () {
            if (state.tip) {
                state.tip.textContent = String(text || '');
                state.tip.classList.remove('vx-fading');
            }
        }, 200);
    }

    function hide(cb) {
        stopTipRotation();
        if (!state.root) { if (cb) cb(); return; }
        var root = state.root;
        root.classList.add('vx-hidden');
        var done = false;
        var finish = function () {
            if (done) return;
            done = true;
            if (root.parentNode) root.parentNode.removeChild(root);
            state.root = state.bar = state.pct = state.status = state.tip = null;
            if (typeof cb === 'function') cb();
        };
        root.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, 800);
    }

    function simulate(durationMs, onDone) {
        var start = Date.now();
        var total = durationMs || 3000;
        var stages = [
            [10, 'Cargando recursos...'],
            [30, 'Inicializando modulos...'],
            [55, 'Conectando servicios...'],
            [78, 'Preparando interfaz...'],
            [95, 'Casi listo...'],
            [100, 'Listo']
        ];
        var i = 0;
        var tick = function () {
            var elapsed = Date.now() - start;
            var ratio = Math.min(1, elapsed / total);
            var target = ratio * 100;
            while (i < stages.length && stages[i][0] <= target) {
                setStatus(stages[i][1]);
                i++;
            }
            setProgress(target);
            if (ratio < 1) {
                requestAnimationFrame(tick);
            } else {
                setProgress(100);
                setStatus('Listo');
                setTimeout(function () { hide(onDone); }, 350);
            }
        };
        requestAnimationFrame(tick);
    }

    var Splash = {
        show: show,
        hide: hide,
        setProgress: setProgress,
        setStatus: setStatus,
        setTip: setTip,
        simulate: simulate,
        get progress() { return state.progress; },
        TIPS: TIPS
    };

    global.Splash = Splash;
    if (typeof module !== 'undefined' && module.exports) module.exports = Splash;
})(typeof window !== 'undefined' ? window : this);
