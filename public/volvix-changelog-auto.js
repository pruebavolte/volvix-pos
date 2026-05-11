/**
 * volvix-changelog-auto.js
 * Auto Changelog System for Volvix POS
 *
 * - Tracks version changes automatically
 * - Stores changelog entries in localStorage
 * - Shows "What's New" modal when version changes
 * - Exposes window.ChangelogAPI for programmatic access
 *
 * Usage: include this script after defining window.VOLVIX_VERSION (optional).
 *        Otherwise it reads <meta name="app-version" content="3.4.0">.
 */
(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────
    var STORAGE_KEY = 'volvix_changelog_v1';
    var SEEN_KEY = 'volvix_changelog_seen_version';
    var MAX_ENTRIES = 100;
    var MODAL_ID = 'volvix-changelog-modal';
    var STYLE_ID = 'volvix-changelog-styles';

    // Default changelog (seeded if storage is empty)
    var DEFAULT_CHANGELOG = [
        {
            version: '3.4.0',
            date: '2026-04-26',
            title: 'Versión 3.4.0 — Mejoras generales',
            changes: [
                { type: 'feature', text: 'Sistema de changelog automático integrado.' },
                { type: 'feature', text: 'Modal "What\'s New" con historial completo.' },
                { type: 'fix', text: 'Correcciones varias de estabilidad.' },
                { type: 'improvement', text: 'Mejoras en el rendimiento general.' }
            ]
        },
        {
            version: '3.3.0',
            date: '2026-04-10',
            title: 'Versión 3.3.0',
            changes: [
                { type: 'feature', text: 'Integración con módulos POS extendidos.' },
                { type: 'fix', text: 'Bugs reportados en cierre de caja resueltos.' }
            ]
        }
    ];

    // ─────────────────────────────────────────────────────────────────────
    // Storage helpers
    // ─────────────────────────────────────────────────────────────────────
    function safeParse(raw, fallback) {
        try { return JSON.parse(raw); } catch (e) { return fallback; }
    }

    function loadChangelog() {
        var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            saveChangelog(DEFAULT_CHANGELOG);
            return DEFAULT_CHANGELOG.slice();
        }
        var parsed = safeParse(raw, null);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            saveChangelog(DEFAULT_CHANGELOG);
            return DEFAULT_CHANGELOG.slice();
        }
        return parsed;
    }

    function saveChangelog(list) {
        try {
            var trimmed = list.slice(0, MAX_ENTRIES);
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch (e) {
            console.warn('[Changelog] No se pudo guardar:', e);
        }
    }

    function getSeenVersion() {
        try {
            // R26 Bug 4: leer ambas claves para retro-compat (legacy + per-version)
            var legacy = global.localStorage.getItem(SEEN_KEY) || '';
            if (legacy) return legacy;
            // Buscar cualquier clave volvix_news_seen_v* y devolver la mayor
            var best = '';
            for (var i = 0; i < global.localStorage.length; i++) {
                var k = global.localStorage.key(i);
                if (k && k.indexOf('volvix_news_seen_v') === 0) {
                    var v = k.replace('volvix_news_seen_v', '');
                    if (!best || compareVersions(v, best) > 0) best = v;
                }
            }
            return best;
        } catch (e) { return ''; }
    }

    function setSeenVersion(v) {
        try {
            global.localStorage.setItem(SEEN_KEY, v);
            // R26 Bug 4: doble persistencia para sobrevivir limpieza parcial al logout
            global.localStorage.setItem('volvix_news_seen_v' + v, '1');
        } catch (e) { /* ignore */ }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Version detection
    // ─────────────────────────────────────────────────────────────────────
    function detectCurrentVersion() {
        if (global.VOLVIX_VERSION) return String(global.VOLVIX_VERSION);
        var meta = document.querySelector('meta[name="app-version"]');
        if (meta && meta.content) return meta.content.trim();
        var list = loadChangelog();
        return list.length ? list[0].version : '0.0.0';
    }

    function compareVersions(a, b) {
        var pa = String(a).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        var pb = String(b).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        var len = Math.max(pa.length, pb.length);
        for (var i = 0; i < len; i++) {
            var da = pa[i] || 0, db = pb[i] || 0;
            if (da > db) return 1;
            if (da < db) return -1;
        }
        return 0;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Styles
    // ─────────────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var css = ''
            + '#' + MODAL_ID + '{position:fixed;inset:0;z-index:99999;display:none;'
            + 'align-items:center;justify-content:center;background:rgba(0,0,0,.55);'
            + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}'
            + '#' + MODAL_ID + '.open{display:flex;}'
            + '#' + MODAL_ID + ' .vcl-card{background:#fff;border-radius:12px;'
            + 'max-width:640px;width:92%;max-height:82vh;overflow:hidden;display:flex;'
            + 'flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.4);}'
            + '#' + MODAL_ID + ' .vcl-head{padding:20px 24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);'
            + 'color:#fff;display:flex;justify-content:space-between;align-items:center;}'
            + '#' + MODAL_ID + ' .vcl-head h2{margin:0;font-size:20px;}'
            + '#' + MODAL_ID + ' .vcl-head small{display:block;opacity:.85;font-size:12px;margin-top:2px;}'
            + '#' + MODAL_ID + ' .vcl-close{background:transparent;border:0;color:#fff;'
            + 'font-size:26px;cursor:pointer;line-height:1;}'
            + '#' + MODAL_ID + ' .vcl-body{padding:18px 24px;overflow-y:auto;flex:1;}'
            + '#' + MODAL_ID + ' .vcl-entry{margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid #eee;}'
            + '#' + MODAL_ID + ' .vcl-entry:last-child{border-bottom:0;}'
            + '#' + MODAL_ID + ' .vcl-entry h3{margin:0 0 4px;font-size:16px;color:#1f2937;}'
            + '#' + MODAL_ID + ' .vcl-entry .vcl-date{font-size:12px;color:#6b7280;margin-bottom:10px;}'
            + '#' + MODAL_ID + ' .vcl-entry ul{margin:0;padding-left:18px;}'
            + '#' + MODAL_ID + ' .vcl-entry li{margin:4px 0;font-size:14px;color:#374151;}'
            + '#' + MODAL_ID + ' .vcl-tag{display:inline-block;font-size:10px;font-weight:700;'
            + 'padding:2px 6px;border-radius:4px;margin-right:6px;text-transform:uppercase;letter-spacing:.4px;}'
            + '#' + MODAL_ID + ' .vcl-tag.feature{background:#dcfce7;color:#166534;}'
            + '#' + MODAL_ID + ' .vcl-tag.fix{background:#fee2e2;color:#991b1b;}'
            + '#' + MODAL_ID + ' .vcl-tag.improvement{background:#dbeafe;color:#1e40af;}'
            + '#' + MODAL_ID + ' .vcl-tag.breaking{background:#fef3c7;color:#92400e;}'
            + '#' + MODAL_ID + ' .vcl-foot{padding:14px 24px;border-top:1px solid #e5e7eb;text-align:right;}'
            + '#' + MODAL_ID + ' .vcl-btn{background:#4f46e5;color:#fff;border:0;padding:9px 18px;'
            + 'border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;}'
            + '#' + MODAL_ID + ' .vcl-btn:hover{background:#4338ca;}';
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rendering
    // ─────────────────────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function renderEntry(entry) {
        var items = (entry.changes || []).map(function (c) {
            var type = c.type || 'improvement';
            return '<li><span class="vcl-tag ' + escapeHtml(type) + '">' + escapeHtml(type)
                + '</span>' + escapeHtml(c.text || '') + '</li>';
        }).join('');
        return ''
            + '<div class="vcl-entry">'
            + '  <h3>' + escapeHtml(entry.title || ('Versión ' + entry.version)) + '</h3>'
            + '  <div class="vcl-date">' + escapeHtml(entry.version)
            + (entry.date ? ' · ' + escapeHtml(entry.date) : '') + '</div>'
            + '  <ul>' + items + '</ul>'
            + '</div>';
    }

    function buildModal(currentVersion) {
        injectStyles();
        var existing = document.getElementById(MODAL_ID);
        if (existing) existing.remove();

        var list = loadChangelog();
        var body = list.map(renderEntry).join('') ||
            '<p style="color:#6b7280;">No hay entradas de changelog todavía.</p>';

        var modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.innerHTML = ''
            + '<div class="vcl-card" role="dialog" aria-modal="true">'
            + '  <div class="vcl-head">'
            + '    <div><h2>Novedades</h2><small>Versión actual: '
            + escapeHtml(currentVersion) + '</small></div>'
            + '    <button class="vcl-close" type="button" aria-label="Cerrar">&times;</button>'
            + '  </div>'
            + '  <div class="vcl-body">' + body + '</div>'
            + '  <div class="vcl-foot"><button class="vcl-btn" type="button">Entendido</button></div>'
            + '</div>';

        document.body.appendChild(modal);

        function close() {
            modal.classList.remove('open');
            setSeenVersion(currentVersion);
        }
        modal.querySelector('.vcl-close').addEventListener('click', close);
        modal.querySelector('.vcl-btn').addEventListener('click', close);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });

        return modal;
    }

    function showModal(force) {
        var current = detectCurrentVersion();
        var modal = buildModal(current);
        modal.classList.add('open');
        if (!force) setSeenVersion(current);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────
    var ChangelogAPI = {
        getAll: function () { return loadChangelog(); },

        getCurrentVersion: detectCurrentVersion,

        getSeenVersion: getSeenVersion,

        addEntry: function (entry) {
            if (!entry || !entry.version) {
                throw new Error('addEntry: se requiere {version, ...}');
            }
            var list = loadChangelog();
            // Replace if version exists, else prepend
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].version === entry.version) { idx = i; break; }
            }
            var normalized = {
                version: entry.version,
                date: entry.date || new Date().toISOString().slice(0, 10),
                title: entry.title || ('Versión ' + entry.version),
                changes: Array.isArray(entry.changes) ? entry.changes : []
            };
            if (idx >= 0) list[idx] = normalized;
            else list.unshift(normalized);
            // Sort descending by version
            list.sort(function (a, b) { return compareVersions(b.version, a.version); });
            saveChangelog(list);
            return normalized;
        },

        removeEntry: function (version) {
            var list = loadChangelog().filter(function (e) { return e.version !== version; });
            saveChangelog(list);
            return list;
        },

        clear: function () {
            try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
            try { global.localStorage.removeItem(SEEN_KEY); } catch (e) {}
        },

        showModal: function () { showModal(true); },

        hideModal: function () {
            var m = document.getElementById(MODAL_ID);
            if (m) m.classList.remove('open');
        },

        markSeen: function (v) { setSeenVersion(v || detectCurrentVersion()); },

        hasNewVersion: function () {
            var seen = getSeenVersion();
            var current = detectCurrentVersion();
            if (!seen) return true;
            return compareVersions(current, seen) > 0;
        },

        // Auto-check: shows modal only if current version > last seen
        // 2026-05-11: respetar flag 'volvix_changelog_autoshow' (default OFF)
        // Por default NO interrumpe al usuario; el usuario lo activa desde
        // Config si quiere. La versión actual se marca como vista igual.
        autoCheck: function () {
            try {
                if (localStorage.getItem('volvix_changelog_autoshow') !== 'true') {
                    try { localStorage.setItem(SEEN_KEY, detectCurrentVersion()); } catch (_) {}
                    return;
                }
            } catch (_) {}
            if (this.hasNewVersion()) showModal(false);
        },

        // Compare helper exposed for callers
        compareVersions: compareVersions,

        VERSION_API: '1.0.0'
    };

    global.ChangelogAPI = ChangelogAPI;

    // ─────────────────────────────────────────────────────────────────────
    // Auto-bootstrap
    // ─────────────────────────────────────────────────────────────────────
    function bootstrap() {
        try {
            // Seed default changelog if empty
            loadChangelog();
            // Auto-show modal if version changed
            ChangelogAPI.autoCheck();
        } catch (e) {
            console.warn('[Changelog] bootstrap error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})(typeof window !== 'undefined' ? window : this);
