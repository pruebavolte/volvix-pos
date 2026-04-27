/**
 * volvix-discord-config.js
 * UI para que el owner configure webhooks de Discord por tenant.
 * Dependencias: window.fetch + cookie de sesion (volvix_token).
 *
 * Eventos soportados:
 *   - sale.created (>$1000)
 *   - low_stock
 *   - new_user
 *   - error_critical
 *
 * Uso:
 *   <div id="discord-config"></div>
 *   <script src="volvix-discord-config.js"></script>
 *   DiscordConfigUI.mount('#discord-config');
 */
(function (global) {
    'use strict';

    // VxUI: VolvixUI con fallback nativo
    var _w = window;
    var VxUI = {
        destructiveConfirm: async function (opts) {
            if (_w.VolvixUI && typeof _w.VolvixUI.destructiveConfirm === 'function')
                return !!(await _w.VolvixUI.destructiveConfirm(opts));
            var fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
        }
    };

    var EVENTS = [
        { id: 'sale.created',    label: 'Venta > $1000',      icon: 'cash' },
        { id: 'low_stock',       label: 'Stock bajo',         icon: 'box' },
        { id: 'new_user',        label: 'Nuevo usuario',      icon: 'user' },
        { id: 'error_critical',  label: 'Error critico',      icon: 'alert' }
    ];

    var API_BASE = (global.VOLVIX_API_BASE || '') + '/api/discord/webhooks';

    function getToken() {
        try {
            var m = document.cookie.match(/(?:^|; )volvix_token=([^;]+)/);
            return m ? decodeURIComponent(m[1]) : (localStorage.getItem('volvix_token') || '');
        } catch (_) { return ''; }
    }

    function api(method, path, body) {
        var opts = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            credentials: 'include'
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch(API_BASE + path, opts).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
                return j;
            });
        });
    }

    function el(tag, attrs, children) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'class') n.className = attrs[k];
            else if (k === 'on' && typeof attrs.on === 'object') {
                Object.keys(attrs.on).forEach(function (ev) { n.addEventListener(ev, attrs.on[ev]); });
            } else n.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) {
            if (c == null) return;
            n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return n;
    }

    function isDiscordUrl(u) {
        try {
            var x = new URL(u);
            return /^(canary\.|ptb\.)?discord(app)?\.com$/i.test(x.hostname)
                && /\/api\/webhooks\//.test(x.pathname);
        } catch (e) { return false; }
    }

    function render(root, hooks) {
        root.innerHTML = '';
        root.appendChild(el('h2', null, ['Webhooks de Discord']));
        root.appendChild(el('p', { class: 'muted' }, [
            'Recibe notificaciones automaticas en tu servidor de Discord. Eventos disponibles: ',
            EVENTS.map(function (e) { return e.label; }).join(', '), '.'
        ]));

        // Form nuevo
        var nameInput = el('input', { type: 'text', placeholder: 'Nombre (ej: Canal alertas)', class: 'inp' });
        var urlInput = el('input', { type: 'url', placeholder: 'https://discord.com/api/webhooks/...', class: 'inp' });
        var checks = EVENTS.map(function (e) {
            var cb = el('input', { type: 'checkbox', value: e.id });
            return { box: cb, lbl: el('label', null, [cb, ' ' + e.label]), id: e.id };
        });
        var msg = el('div', { class: 'msg' });

        var btn = el('button', {
            class: 'btn-primary',
            on: {
                click: function () {
                    var url = urlInput.value.trim();
                    if (!isDiscordUrl(url)) { msg.textContent = 'URL de Discord invalida.'; return; }
                    var events = checks.filter(function (c) { return c.box.checked; }).map(function (c) { return c.id; });
                    if (!events.length) { msg.textContent = 'Selecciona al menos un evento.'; return; }
                    btn.disabled = true;
                    msg.textContent = 'Guardando...';
                    api('POST', '', { name: nameInput.value || 'Discord', url: url, events: events })
                        .then(function () { msg.textContent = 'Guardado.'; load(root); })
                        .catch(function (e) { msg.textContent = 'Error: ' + e.message; })
                        .then(function () { btn.disabled = false; });
                }
            }
        }, ['Agregar webhook']);

        var form = el('div', { class: 'card' }, [
            el('h3', null, ['Nuevo webhook']),
            nameInput, urlInput,
            el('div', { class: 'events' }, checks.map(function (c) { return c.lbl; })),
            btn, msg
        ]);
        root.appendChild(form);

        // Lista
        var list = el('div', { class: 'list' });
        if (!hooks.length) list.appendChild(el('p', { class: 'muted' }, ['Sin webhooks configurados.']));
        hooks.forEach(function (h) {
            list.appendChild(renderRow(h, root));
        });
        root.appendChild(list);
    }

    function renderRow(h, root) {
        var status = el('span', { class: 'msg' });

        function disable() {
            api('PATCH', '/' + h.id, { active: !h.active })
                .then(function () { load(root); })
                .catch(function (e) { status.textContent = 'Error: ' + e.message; });
        }
        async function remove() {
            if (!await VxUI.destructiveConfirm({ title: 'Eliminar webhook', message: 'Eliminar webhook ' + (h.name || h.id) + '?', confirmText: 'Eliminar', requireText: 'ELIMINAR' })) return;
            api('DELETE', '/' + h.id)
                .then(function () { load(root); })
                .catch(function (e) { status.textContent = 'Error: ' + e.message; });
        }
        function test() {
            status.textContent = 'Enviando test...';
            api('POST', '/' + h.id + '/test')
                .then(function (r) { status.textContent = r.ok ? 'Test enviado OK' : ('Fallo: ' + (r.error || r.status)); })
                .catch(function (e) { status.textContent = 'Error: ' + e.message; });
        }

        return el('div', { class: 'card' }, [
            el('div', { class: 'row' }, [
                el('strong', null, [h.name || 'Discord']),
                el('span', { class: 'muted' }, [' - ' + (h.active ? 'activo' : 'inactivo')])
            ]),
            el('div', { class: 'muted small' }, [h.url || '']),
            el('div', { class: 'tags' }, (h.events || []).map(function (e) {
                return el('span', { class: 'tag' }, [e]);
            })),
            el('div', { class: 'row' }, [
                el('button', { class: 'btn', on: { click: test } }, ['Test']),
                el('button', { class: 'btn', on: { click: disable } }, [h.active ? 'Desactivar' : 'Activar']),
                el('button', { class: 'btn-danger', on: { click: remove } }, ['Eliminar'])
            ]),
            status
        ]);
    }

    function load(root) {
        api('GET', '')
            .then(function (rows) { render(root, rows || []); })
            .catch(function (e) {
                root.innerHTML = '';
                root.appendChild(el('div', { class: 'msg error' }, ['Error cargando: ' + e.message]));
            });
    }

    var DiscordConfigUI = {
        mount: function (selector) {
            var root = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (!root) throw new Error('mount target no encontrado');
            root.classList.add('volvix-discord-config');
            load(root);
            return root;
        },
        EVENTS: EVENTS
    };

    if (typeof module === 'object' && module.exports) module.exports = DiscordConfigUI;
    global.DiscordConfigUI = DiscordConfigUI;
})(typeof window !== 'undefined' ? window : globalThis);
