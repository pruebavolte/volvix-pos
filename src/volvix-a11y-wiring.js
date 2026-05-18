/* ============================================================================
 * volvix-a11y-wiring.js
 * Volvix POS — Accessibility (A11y) Wiring Module
 * ----------------------------------------------------------------------------
 * Provides accessibility utilities for the Volvix POS application:
 *   - High contrast mode toggle
 *   - Font size adjuster (small / normal / large / xlarge)
 *   - Screen reader live-region announcements
 *   - Visible focus indicators
 *   - Skip-to-content links
 *   - Reduced motion preference
 *   - Keyboard navigation helpers
 *
 * Public API: window.A11yAPI
 * ==========================================================================*/
(function (global) {
    'use strict';

    // ------------------------------------------------------------------------
    // Constants & state
    // ------------------------------------------------------------------------
    var STORAGE_KEY = 'volvix.a11y.prefs.v1';
    var DEFAULT_PREFS = {
        highContrast: false,
        fontScale: 'normal',     // small | normal | large | xlarge
        focusIndicators: true,
        reducedMotion: false,
        screenReader: false,
        skipLinks: true
    };

    var FONT_SCALE_MAP = {
        small:  '0.875',
        normal: '1.000',
        large:  '1.125',
        xlarge: '1.250'
    };

    var state = Object.assign({}, DEFAULT_PREFS);
    var listeners = [];
    var liveRegion = null;
    var styleNode = null;
    var initialized = false;

    // ------------------------------------------------------------------------
    // Persistence
    // ------------------------------------------------------------------------
    function loadPrefs() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                Object.keys(DEFAULT_PREFS).forEach(function (k) {
                    if (k in parsed) state[k] = parsed[k];
                });
            }
        } catch (e) {
            console.warn('[A11y] loadPrefs failed:', e);
        }
    }

    function savePrefs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[A11y] savePrefs failed:', e);
        }
    }

    function emit(event, payload) {
        listeners.forEach(function (fn) {
            try { fn(event, payload, getState()); }
            catch (e) { console.warn('[A11y] listener error:', e); }
        });
    }

    function getState() {
        return Object.assign({}, state);
    }

    // ------------------------------------------------------------------------
    // Style injection
    // ------------------------------------------------------------------------
    function ensureStyleNode() {
        if (styleNode) return styleNode;
        styleNode = document.createElement('style');
        styleNode.id = 'volvix-a11y-styles';
        styleNode.textContent = [
            /* Skip links */
            '.volvix-skip-link{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;z-index:99999;}',
            '.volvix-skip-link:focus{position:fixed;left:1rem;top:1rem;width:auto;height:auto;padding:.75rem 1rem;background:#000;color:#fff;border:2px solid #ffd400;border-radius:6px;font-weight:700;text-decoration:none;}',
            /* Visually hidden helper */
            '.volvix-sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}',
            /* Focus indicators */
            'body.volvix-focus-visible *:focus{outline:3px solid #ffd400!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(255,212,0,.35)!important;}',
            /* High contrast */
            'body.volvix-high-contrast{background:#000!important;color:#fff!important;}',
            'body.volvix-high-contrast *{background-color:#000!important;color:#fff!important;border-color:#fff!important;}',
            'body.volvix-high-contrast a,body.volvix-high-contrast a *{color:#ffd400!important;text-decoration:underline!important;}',
            'body.volvix-high-contrast button,body.volvix-high-contrast input,body.volvix-high-contrast select,body.volvix-high-contrast textarea{background:#000!important;color:#fff!important;border:2px solid #fff!important;}',
            'body.volvix-high-contrast img{filter:grayscale(100%) contrast(1.2);}',
            /* Reduced motion */
            'body.volvix-reduced-motion *,body.volvix-reduced-motion *::before,body.volvix-reduced-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}',
            /* Font scaling */
            'html.volvix-fs-small{font-size:87.5%;}',
            'html.volvix-fs-normal{font-size:100%;}',
            'html.volvix-fs-large{font-size:112.5%;}',
            'html.volvix-fs-xlarge{font-size:125%;}'
        ].join('\n');
        document.head.appendChild(styleNode);
        return styleNode;
    }

    // ------------------------------------------------------------------------
    // High contrast
    // ------------------------------------------------------------------------
    function setHighContrast(on) {
        state.highContrast = !!on;
        document.body.classList.toggle('volvix-high-contrast', state.highContrast);
        savePrefs();
        announce(state.highContrast ? 'Modo alto contraste activado' : 'Modo alto contraste desactivado');
        emit('highContrast', state.highContrast);
    }

    function toggleHighContrast() {
        setHighContrast(!state.highContrast);
        return state.highContrast;
    }

    // ------------------------------------------------------------------------
    // Font scaling
    // ------------------------------------------------------------------------
    function setFontScale(level) {
        if (!FONT_SCALE_MAP[level]) {
            console.warn('[A11y] invalid font scale:', level);
            return;
        }
        var html = document.documentElement;
        Object.keys(FONT_SCALE_MAP).forEach(function (k) {
            html.classList.remove('volvix-fs-' + k);
        });
        html.classList.add('volvix-fs-' + level);
        state.fontScale = level;
        savePrefs();
        announce('Tamaño de fuente: ' + level);
        emit('fontScale', level);
    }

    function increaseFontSize() {
        var order = ['small', 'normal', 'large', 'xlarge'];
        var idx = order.indexOf(state.fontScale);
        if (idx < order.length - 1) setFontScale(order[idx + 1]);
    }

    function decreaseFontSize() {
        var order = ['small', 'normal', 'large', 'xlarge'];
        var idx = order.indexOf(state.fontScale);
        if (idx > 0) setFontScale(order[idx - 1]);
    }

    function resetFontSize() {
        setFontScale('normal');
    }

    // ------------------------------------------------------------------------
    // Focus indicators
    // ------------------------------------------------------------------------
    function setFocusIndicators(on) {
        state.focusIndicators = !!on;
        document.body.classList.toggle('volvix-focus-visible', state.focusIndicators);
        savePrefs();
        emit('focusIndicators', state.focusIndicators);
    }

    // ------------------------------------------------------------------------
    // Reduced motion
    // ------------------------------------------------------------------------
    function setReducedMotion(on) {
        state.reducedMotion = !!on;
        document.body.classList.toggle('volvix-reduced-motion', state.reducedMotion);
        savePrefs();
        announce(state.reducedMotion ? 'Animaciones reducidas' : 'Animaciones normales');
        emit('reducedMotion', state.reducedMotion);
    }

    function detectSystemMotionPref() {
        if (global.matchMedia) {
            var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
            if (mq.matches) setReducedMotion(true);
            try {
                mq.addEventListener('change', function (e) { setReducedMotion(e.matches); });
            } catch (_) {
                if (mq.addListener) mq.addListener(function (e) { setReducedMotion(e.matches); });
            }
        }
    }

    // ------------------------------------------------------------------------
    // Screen reader live region
    // ------------------------------------------------------------------------
    function ensureLiveRegion() {
        if (liveRegion && document.body.contains(liveRegion)) return liveRegion;
        liveRegion = document.createElement('div');
        liveRegion.id = 'volvix-a11y-live';
        liveRegion.className = 'volvix-sr-only';
        liveRegion.setAttribute('role', 'status');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        document.body.appendChild(liveRegion);
        return liveRegion;
    }

    function announce(message, priority) {
        if (!message) return;
        var node = ensureLiveRegion();
        node.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');
        node.textContent = '';
        // Force re-announce
        global.setTimeout(function () { node.textContent = String(message); }, 50);
        emit('announce', { message: message, priority: priority || 'polite' });
    }

    function setScreenReaderMode(on) {
        state.screenReader = !!on;
        if (state.screenReader) ensureLiveRegion();
        savePrefs();
        announce(state.screenReader ? 'Soporte de lector de pantalla activado' : 'Soporte de lector de pantalla desactivado');
        emit('screenReader', state.screenReader);
    }

    // ------------------------------------------------------------------------
    // Skip links
    // ------------------------------------------------------------------------
    function injectSkipLinks(targets) {
        if (!state.skipLinks) return;
        var existing = document.getElementById('volvix-skip-links');
        if (existing) existing.remove();

        var defaults = [
            { href: '#main',       text: 'Saltar al contenido principal' },
            { href: '#navigation', text: 'Saltar a la navegación' },
            { href: '#footer',     text: 'Saltar al pie de página' }
        ];
        var links = Array.isArray(targets) && targets.length ? targets : defaults;

        var container = document.createElement('div');
        container.id = 'volvix-skip-links';
        links.forEach(function (l) {
            var a = document.createElement('a');
            a.className = 'volvix-skip-link';
            a.href = l.href;
            a.textContent = l.text;
            container.appendChild(a);
        });
        document.body.insertBefore(container, document.body.firstChild);
    }

    function setSkipLinks(on) {
        state.skipLinks = !!on;
        if (state.skipLinks) injectSkipLinks();
        else {
            var ex = document.getElementById('volvix-skip-links');
            if (ex) ex.remove();
        }
        savePrefs();
        emit('skipLinks', state.skipLinks);
    }

    // ------------------------------------------------------------------------
    // Keyboard shortcuts
    // ------------------------------------------------------------------------
    function bindKeyboardShortcuts() {
        document.addEventListener('keydown', function (e) {
            if (!(e.altKey && e.shiftKey)) return;
            switch (e.key.toLowerCase()) {
                case 'c': e.preventDefault(); toggleHighContrast(); break;
                case '+':
                case '=': e.preventDefault(); increaseFontSize(); break;
                case '-': e.preventDefault(); decreaseFontSize(); break;
                case '0': e.preventDefault(); resetFontSize(); break;
                case 'm': e.preventDefault(); setReducedMotion(!state.reducedMotion); break;
                case 'f': e.preventDefault(); setFocusIndicators(!state.focusIndicators); break;
            }
        });
    }

    // ------------------------------------------------------------------------
    // Apply current state to DOM
    // ------------------------------------------------------------------------
    function applyAll() {
        ensureStyleNode();
        setHighContrast(state.highContrast);
        setFontScale(state.fontScale);
        setFocusIndicators(state.focusIndicators);
        setReducedMotion(state.reducedMotion);
        if (state.skipLinks) injectSkipLinks();
        if (state.screenReader) ensureLiveRegion();
    }

    // ------------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------------
    function init(opts) {
        if (initialized) return getState();
        opts = opts || {};
        loadPrefs();
        if (opts.overrides) Object.assign(state, opts.overrides);
        ensureStyleNode();
        ensureLiveRegion();
        detectSystemMotionPref();
        applyAll();
        bindKeyboardShortcuts();
        initialized = true;
        emit('init', getState());
        return getState();
    }

    function on(fn) {
        if (typeof fn === 'function') listeners.push(fn);
        return function off() {
            var i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
        };
    }

    function reset() {
        state = Object.assign({}, DEFAULT_PREFS);
        savePrefs();
        applyAll();
        announce('Preferencias de accesibilidad restablecidas');
        emit('reset', getState());
    }

    var A11yAPI = {
        init: init,
        getState: getState,
        on: on,
        reset: reset,
        // High contrast
        setHighContrast: setHighContrast,
        toggleHighContrast: toggleHighContrast,
        // Font
        setFontScale: setFontScale,
        increaseFontSize: increaseFontSize,
        decreaseFontSize: decreaseFontSize,
        resetFontSize: resetFontSize,
        // Focus
        setFocusIndicators: setFocusIndicators,
        // Motion
        setReducedMotion: setReducedMotion,
        // Screen reader
        announce: announce,
        setScreenReaderMode: setScreenReaderMode,
        // Skip links
        injectSkipLinks: injectSkipLinks,
        setSkipLinks: setSkipLinks,
        // Constants
        FONT_SCALE_MAP: FONT_SCALE_MAP,
        VERSION: '1.0.0'
    };

    global.A11yAPI = A11yAPI;

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
