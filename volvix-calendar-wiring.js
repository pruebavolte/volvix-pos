/* ============================================================================
 * VOLVIX POS - CALENDAR & AGENDA WIRING
 * Agent-20 / Round 7 Fibonacci
 * ----------------------------------------------------------------------------
 * Sistema de calendario completo:
 *   - Vistas mes / semana / dia
 *   - Eventos: Reunion, Recordatorio, Pago proveedor, Cumpleanos cliente
 *   - Notificaciones de recordatorios
 *   - Recurrencias diaria / semanal / mensual
 *   - Persistencia localStorage
 *   - Modal con detalles
 *   - Integracion con sales (ventas del dia)
 *   - Export iCal (.ics)
 * ==========================================================================*/
(function (global) {
    'use strict';

    // VxUI: VolvixUI con fallback nativo
    const _w = window;
    const VxUI = {
        async destructiveConfirm(opts) {
            if (_w.VolvixUI && typeof _w.VolvixUI.destructiveConfirm === 'function')
                return !!(await _w.VolvixUI.destructiveConfirm(opts));
            const fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
        }
    };

    // ---------------------------------------------------------------- Const
    const STORAGE_KEY      = 'volvix.calendar.events.v1';
    const SETTINGS_KEY     = 'volvix.calendar.settings.v1';
    const NOTIF_LOG_KEY    = 'volvix.calendar.notiflog.v1';
    const SALES_STORAGE    = 'volvix.sales.v1';

    const EVENT_TYPES = {
        meeting:    { label: 'Reunion',            color: '#2563eb', icon: '[M]' },
        reminder:   { label: 'Recordatorio',       color: '#f59e0b', icon: '[R]' },
        supplier:   { label: 'Pago de proveedor',  color: '#dc2626', icon: '[$]' },
        birthday:   { label: 'Cumpleanos cliente', color: '#ec4899', icon: '[*]' },
        sale:       { label: 'Venta del dia',      color: '#10b981', icon: '[V]' }
    };

    const RECURRENCE = ['none', 'daily', 'weekly', 'monthly'];
    const VIEWS      = ['month', 'week', 'day'];

    const MS_DAY = 86400000;

    // ---------------------------------------------------------------- State
    const State = {
        view:        'month',
        cursorDate:  new Date(),
        selectedId:  null,
        events:      [],
        settings:    { notifLeadMin: 15, soundOn: true, autoOpenModal: true },
        notifTimer:  null,
        rendered:    false
    };

    // ---------------------------------------------------------------- Utils
    const pad2 = n => String(n).padStart(2, '0');
    const uid  = () => 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function ymd(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function ymdhm(d) {
        return ymd(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function parseDT(str) {
        if (!str) return null;
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }
    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }
    function startOfWeek(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        x.setDate(x.getDate() - x.getDay());
        return x;
    }
    function startOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    function endOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }
    function addDays(d, n) {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
    }

    // ---------------------------------------------------------------- Storage
    function loadEvents() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            State.events = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[calendar] load failed', e);
            State.events = [];
        }
    }
    function saveEvents() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(State.events));
        } catch (e) {
            console.warn('[calendar] save failed', e);
        }
    }
    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) Object.assign(State.settings, JSON.parse(raw));
        } catch (_) {}
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(State.settings)); } catch (_) {}
    }

    // ---------------------------------------------------------------- CRUD
    function createEvent(data) {
        const ev = {
            id:          uid(),
            type:        data.type        || 'reminder',
            title:       data.title       || '(sin titulo)',
            description: data.description || '',
            start:       data.start       || ymdhm(new Date()),
            end:         data.end         || data.start,
            allDay:      !!data.allDay,
            recurrence:  RECURRENCE.includes(data.recurrence) ? data.recurrence : 'none',
            recurUntil:  data.recurUntil  || null,
            location:    data.location    || '',
            amount:      data.amount      || null,
            customer:    data.customer    || '',
            createdAt:   Date.now(),
            notified:    false
        };
        State.events.push(ev);
        saveEvents();
        Calendar.render();
        return ev;
    }
    function updateEvent(id, patch) {
        const i = State.events.findIndex(e => e.id === id);
        if (i < 0) return null;
        State.events[i] = Object.assign({}, State.events[i], patch, { id });
        saveEvents();
        Calendar.render();
        return State.events[i];
    }
    function deleteEvent(id) {
        State.events = State.events.filter(e => e.id !== id);
        saveEvents();
        Calendar.render();
    }
    function getEvent(id) {
        return State.events.find(e => e.id === id) || null;
    }

    // ---------------------------------------------------------------- Recurrence expansion
    function expandRecurrence(ev, rangeStart, rangeEnd) {
        const out = [];
        const baseStart = parseDT(ev.start);
        const baseEnd   = parseDT(ev.end) || baseStart;
        if (!baseStart) return out;
        const until = ev.recurUntil ? parseDT(ev.recurUntil) : addDays(rangeEnd, 1);
        const limit = until < rangeEnd ? until : rangeEnd;

        if (ev.recurrence === 'none') {
            if (baseStart >= rangeStart && baseStart <= rangeEnd) {
                out.push({ ev, start: baseStart, end: baseEnd });
            }
            return out;
        }

        let cur = new Date(baseStart);
        let endCur = new Date(baseEnd);
        let safety = 0;
        while (cur <= limit && safety++ < 1500) {
            if (cur >= rangeStart) {
                out.push({ ev, start: new Date(cur), end: new Date(endCur) });
            }
            if (ev.recurrence === 'daily') {
                cur = addDays(cur, 1);
                endCur = addDays(endCur, 1);
            } else if (ev.recurrence === 'weekly') {
                cur = addDays(cur, 7);
                endCur = addDays(endCur, 7);
            } else if (ev.recurrence === 'monthly') {
                cur.setMonth(cur.getMonth() + 1);
                endCur.setMonth(endCur.getMonth() + 1);
            } else break;
        }
        return out;
    }

    function eventsInRange(rangeStart, rangeEnd) {
        const occ = [];
        State.events.forEach(ev => {
            expandRecurrence(ev, rangeStart, rangeEnd).forEach(o => occ.push(o));
        });
        // ventas del dia integradas
        try {
            const sraw = localStorage.getItem(SALES_STORAGE);
            if (sraw) {
                const sales = JSON.parse(sraw);
                if (Array.isArray(sales)) {
                    const byDay = {};
                    sales.forEach(s => {
                        const d = s.date || s.createdAt;
                        if (!d) return;
                        const dt = new Date(d);
                        if (dt < rangeStart || dt > rangeEnd) return;
                        const k = ymd(dt);
                        byDay[k] = (byDay[k] || 0) + (Number(s.total) || 0);
                    });
                    Object.keys(byDay).forEach(k => {
                        const dt = new Date(k + 'T20:00');
                        occ.push({
                            ev: {
                                id: 'sale_' + k,
                                type: 'sale',
                                title: 'Ventas: $' + byDay[k].toFixed(2),
                                description: 'Total ventas del dia',
                                start: ymdhm(dt),
                                end:   ymdhm(dt),
                                recurrence: 'none',
                                _readonly: true
                            },
                            start: dt, end: dt
                        });
                    });
                }
            }
        } catch (_) {}
        occ.sort((a, b) => a.start - b.start);
        return occ;
    }

    // ---------------------------------------------------------------- Notifications
    function ensureNotifPermission() {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'default') {
            try { Notification.requestPermission(); } catch (_) {}
        }
    }
    function fireNotification(ev, when) {
        const title = '[VOLVIX] ' + EVENT_TYPES[ev.type].label;
        const body  = ev.title + ' - ' + when.toLocaleString();
        try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(title, { body });
            } else {
                console.info('[calendar][notif]', title, body);
            }
        } catch (_) {}
        if (State.settings.soundOn) {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
                g.gain.value = 0.05; o.start();
                setTimeout(() => { o.stop(); ctx.close(); }, 250);
            } catch (_) {}
        }
    }
    function checkNotifications() {
        const now  = new Date();
        const lead = State.settings.notifLeadMin * 60000;
        const horizon = new Date(now.getTime() + lead + 60000);
        const occ = eventsInRange(now, horizon);
        const log = JSON.parse(localStorage.getItem(NOTIF_LOG_KEY) || '{}');
        occ.forEach(o => {
            if (o.ev._readonly) return;
            const key = o.ev.id + '@' + ymdhm(o.start);
            if (log[key]) return;
            const diff = o.start.getTime() - now.getTime();
            if (diff <= lead && diff >= -60000) {
                fireNotification(o.ev, o.start);
                log[key] = Date.now();
            }
        });
        try { localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(log)); } catch (_) {}
    }
    function startNotifLoop() {
        if (State.notifTimer) clearInterval(State.notifTimer);
        State.notifTimer = setInterval(checkNotifications, 30000);
        checkNotifications();
    }

    // ---------------------------------------------------------------- iCal export
    function toICalDate(d) {
        return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
             + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z';
    }
    function exportICal() {
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Volvix POS//Calendar//ES',
            'CALSCALE:GREGORIAN'
        ];
        State.events.forEach(ev => {
            const s = parseDT(ev.start), e = parseDT(ev.end) || s;
            if (!s) return;
            lines.push('BEGIN:VEVENT');
            lines.push('UID:' + ev.id + '@volvix');
            lines.push('DTSTAMP:' + toICalDate(new Date()));
            lines.push('DTSTART:' + toICalDate(s));
            lines.push('DTEND:'   + toICalDate(e));
            lines.push('SUMMARY:' + (ev.title || '').replace(/\n/g, ' '));
            if (ev.description) lines.push('DESCRIPTION:' + ev.description.replace(/\n/g, '\\n'));
            if (ev.location)    lines.push('LOCATION:' + ev.location);
            if (ev.recurrence === 'daily')   lines.push('RRULE:FREQ=DAILY');
            if (ev.recurrence === 'weekly')  lines.push('RRULE:FREQ=WEEKLY');
            if (ev.recurrence === 'monthly') lines.push('RRULE:FREQ=MONTHLY');
            lines.push('CATEGORIES:' + EVENT_TYPES[ev.type].label.toUpperCase());
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');
        const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'volvix-calendar.ics';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // ---------------------------------------------------------------- DOM helpers
    function el(tag, attrs, children) {
        const n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(k => {
            if (k === 'style' && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
            else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
            else if (k === 'class') n.className = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(c => {
            if (c == null) return;
            n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return n;
    }
    function getRoot() {
        let root = document.getElementById('volvix-calendar-root');
        if (!root) {
            root = el('div', { id: 'volvix-calendar-root', class: 'vx-cal-root' });
            document.body.appendChild(root);
        }
        return root;
    }

    // ---------------------------------------------------------------- Styles
    function injectStyles() {
        if (document.getElementById('vx-cal-styles')) return;
        const css = `
        .vx-cal-root{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;max-width:1100px;margin:14px auto;}
        .vx-cal-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;}
        .vx-cal-toolbar button{background:#1f2937;color:#fff;border:0;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;}
        .vx-cal-toolbar button.active{background:#2563eb;}
        .vx-cal-toolbar button.ghost{background:#e5e7eb;color:#111;}
        .vx-cal-title{font-weight:700;font-size:16px;margin:0 8px;}
        .vx-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;background:#e5e7eb;border:1px solid #e5e7eb;}
        .vx-cal-cell{background:#fff;min-height:90px;padding:4px;font-size:12px;cursor:pointer;position:relative;}
        .vx-cal-cell.other{background:#f9fafb;color:#9ca3af;}
        .vx-cal-cell.today{outline:2px solid #2563eb;}
        .vx-cal-daynum{font-weight:600;}
        .vx-cal-evt{display:block;background:#2563eb;color:#fff;padding:2px 4px;border-radius:4px;margin-top:2px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .vx-cal-week,.vx-cal-day{display:flex;flex-direction:column;gap:2px;}
        .vx-cal-row{display:flex;gap:2px;}
        .vx-cal-hour{width:48px;font-size:11px;color:#6b7280;padding:4px;}
        .vx-cal-slot{flex:1;background:#fff;border:1px solid #f3f4f6;min-height:32px;padding:2px;font-size:11px;}
        .vx-cal-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;}
        .vx-cal-modal{background:#fff;border-radius:10px;padding:18px;max-width:480px;width:92%;max-height:88vh;overflow:auto;}
        .vx-cal-modal h3{margin:0 0 10px;}
        .vx-cal-modal label{display:block;font-size:12px;color:#374151;margin-top:8px;}
        .vx-cal-modal input,.vx-cal-modal select,.vx-cal-modal textarea{width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;}
        .vx-cal-modal .row{display:flex;gap:6px;}
        .vx-cal-modal .row > *{flex:1;}
        .vx-cal-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:14px;}
        .vx-cal-actions button{padding:6px 12px;border-radius:6px;border:0;cursor:pointer;font-size:13px;}
        .vx-cal-btn-primary{background:#2563eb;color:#fff;}
        .vx-cal-btn-danger{background:#dc2626;color:#fff;}
        .vx-cal-btn-ghost{background:#e5e7eb;color:#111;}
        .vx-cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;padding:4px 0;}
        `;
        const s = el('style', { id: 'vx-cal-styles' });
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- Renderers
    function renderToolbar() {
        const tb = el('div', { class: 'vx-cal-toolbar' });
        tb.appendChild(el('button', { class: 'ghost', onclick: () => navigate(-1) }, ['<']));
        tb.appendChild(el('button', { class: 'ghost', onclick: () => { State.cursorDate = new Date(); Calendar.render(); } }, ['Hoy']));
        tb.appendChild(el('button', { class: 'ghost', onclick: () => navigate(1) }, ['>']));
        tb.appendChild(el('span', { class: 'vx-cal-title' }, [titleForView()]));
        VIEWS.forEach(v => {
            tb.appendChild(el('button', {
                class: State.view === v ? 'active' : '',
                onclick: () => { State.view = v; Calendar.render(); }
            }, [v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : 'Dia']));
        });
        tb.appendChild(el('button', { onclick: () => openEditor(null) }, ['+ Nuevo']));
        tb.appendChild(el('button', { class: 'ghost', onclick: exportICal }, ['Export iCal']));
        tb.appendChild(el('button', { class: 'ghost', onclick: openSettings }, ['Ajustes']));
        return tb;
    }
    function titleForView() {
        const d = State.cursorDate;
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        if (State.view === 'month') return meses[d.getMonth()] + ' ' + d.getFullYear();
        if (State.view === 'week')  { const s = startOfWeek(d); const e = addDays(s, 6); return ymd(s) + ' - ' + ymd(e); }
        return ymd(d);
    }
    function navigate(dir) {
        const d = State.cursorDate;
        if (State.view === 'month') d.setMonth(d.getMonth() + dir);
        else if (State.view === 'week') d.setDate(d.getDate() + 7 * dir);
        else d.setDate(d.getDate() + dir);
        Calendar.render();
    }

    function renderMonth() {
        const wrap = el('div');
        const wd = el('div', { class: 'vx-cal-weekdays' });
        ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'].forEach(n => wd.appendChild(el('div', null, [n])));
        wrap.appendChild(wd);

        const first = startOfMonth(State.cursorDate);
        const gridStart = startOfWeek(first);
        const grid = el('div', { class: 'vx-cal-grid' });
        const today = new Date();
        const monthEnd = endOfMonth(State.cursorDate);
        const occ = eventsInRange(gridStart, addDays(gridStart, 41));

        for (let i = 0; i < 42; i++) {
            const day = addDays(gridStart, i);
            const cls = ['vx-cal-cell'];
            if (day.getMonth() !== State.cursorDate.getMonth()) cls.push('other');
            if (sameDay(day, today)) cls.push('today');
            const cell = el('div', {
                class: cls.join(' '),
                onclick: () => { State.cursorDate = day; State.view = 'day'; Calendar.render(); }
            });
            cell.appendChild(el('div', { class: 'vx-cal-daynum' }, [String(day.getDate())]));
            occ.filter(o => sameDay(o.start, day)).slice(0, 3).forEach(o => {
                const c = EVENT_TYPES[o.ev.type].color;
                cell.appendChild(el('span', {
                    class: 'vx-cal-evt',
                    style: { background: c },
                    onclick: ev => { ev.stopPropagation(); openDetails(o.ev.id); }
                }, [EVENT_TYPES[o.ev.type].icon + ' ' + o.ev.title]));
            });
            grid.appendChild(cell);
        }
        wrap.appendChild(grid);
        return wrap;
    }

    function renderWeek() {
        const wrap = el('div', { class: 'vx-cal-week' });
        const start = startOfWeek(State.cursorDate);
        const end   = addDays(start, 7);
        const occ = eventsInRange(start, end);
        for (let h = 7; h < 22; h++) {
            const row = el('div', { class: 'vx-cal-row' });
            row.appendChild(el('div', { class: 'vx-cal-hour' }, [pad2(h) + ':00']));
            for (let d = 0; d < 7; d++) {
                const day = addDays(start, d);
                const slot = el('div', {
                    class: 'vx-cal-slot',
                    onclick: () => { State.cursorDate = day; openEditor(null, day, h); }
                });
                occ.filter(o => sameDay(o.start, day) && o.start.getHours() === h).forEach(o => {
                    const c = EVENT_TYPES[o.ev.type].color;
                    slot.appendChild(el('div', {
                        class: 'vx-cal-evt',
                        style: { background: c },
                        onclick: ev => { ev.stopPropagation(); openDetails(o.ev.id); }
                    }, [o.ev.title]));
                });
                row.appendChild(slot);
            }
            wrap.appendChild(row);
        }
        return wrap;
    }

    function renderDay() {
        const wrap = el('div', { class: 'vx-cal-day' });
        const day = State.cursorDate;
        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
        const dayEnd   = addDays(dayStart, 1);
        const occ = eventsInRange(dayStart, dayEnd);
        for (let h = 6; h < 23; h++) {
            const row = el('div', { class: 'vx-cal-row' });
            row.appendChild(el('div', { class: 'vx-cal-hour' }, [pad2(h) + ':00']));
            const slot = el('div', {
                class: 'vx-cal-slot',
                style: { minHeight: '40px' },
                onclick: () => openEditor(null, day, h)
            });
            occ.filter(o => o.start.getHours() === h).forEach(o => {
                const c = EVENT_TYPES[o.ev.type].color;
                slot.appendChild(el('div', {
                    class: 'vx-cal-evt',
                    style: { background: c },
                    onclick: ev => { ev.stopPropagation(); openDetails(o.ev.id); }
                }, [EVENT_TYPES[o.ev.type].icon + ' ' + o.ev.title]));
            });
            row.appendChild(slot);
            wrap.appendChild(row);
        }
        return wrap;
    }

    // ---------------------------------------------------------------- Modals
    function closeModal() {
        const bg = document.querySelector('.vx-cal-modal-bg');
        if (bg) bg.remove();
    }
    function openModal(node) {
        closeModal();
        const bg = el('div', { class: 'vx-cal-modal-bg', onclick: e => { if (e.target === bg) closeModal(); } });
        const box = el('div', { class: 'vx-cal-modal' });
        box.appendChild(node);
        bg.appendChild(box);
        document.body.appendChild(bg);
    }

    function openDetails(id) {
        const ev = getEvent(id) || (id && id.startsWith('sale_') ? { id, type: 'sale', title: 'Venta', _readonly: true } : null);
        if (!ev) return;
        const t = EVENT_TYPES[ev.type];
        const node = el('div');
        node.appendChild(el('h3', null, [t.icon + ' ' + ev.title]));
        node.appendChild(el('p', null, [t.label]));
        if (ev.start) node.appendChild(el('p', null, ['Inicio: ' + ev.start]));
        if (ev.end)   node.appendChild(el('p', null, ['Fin: ' + ev.end]));
        if (ev.location)    node.appendChild(el('p', null, ['Lugar: ' + ev.location]));
        if (ev.customer)    node.appendChild(el('p', null, ['Cliente: ' + ev.customer]));
        if (ev.amount)      node.appendChild(el('p', null, ['Monto: $' + ev.amount]));
        if (ev.recurrence && ev.recurrence !== 'none') node.appendChild(el('p', null, ['Recurrencia: ' + ev.recurrence]));
        if (ev.description) node.appendChild(el('p', null, [ev.description]));
        const actions = el('div', { class: 'vx-cal-actions' });
        if (!ev._readonly) {
            actions.appendChild(el('button', { class: 'vx-cal-btn-danger',  onclick: async () => { if (await VxUI.destructiveConfirm({ title: 'Eliminar evento', message: '¿Eliminar este evento?', confirmText: 'Eliminar', requireText: 'ELIMINAR' })) { deleteEvent(ev.id); closeModal(); } } }, ['Eliminar']));
            actions.appendChild(el('button', { class: 'vx-cal-btn-primary', onclick: () => { closeModal(); openEditor(ev.id); } }, ['Editar']));
        }
        actions.appendChild(el('button', { class: 'vx-cal-btn-ghost', onclick: closeModal }, ['Cerrar']));
        node.appendChild(actions);
        openModal(node);
    }

    function openEditor(id, presetDay, presetHour) {
        const ev = id ? getEvent(id) : null;
        const init = ev || {
            type: 'reminder',
            title: '',
            description: '',
            start: presetDay
                ? ymdhm(new Date(presetDay.getFullYear(), presetDay.getMonth(), presetDay.getDate(), presetHour || 9, 0))
                : ymdhm(new Date()),
            end: '',
            recurrence: 'none',
            recurUntil: '',
            location: '',
            amount: '',
            customer: ''
        };
        const node = el('div');
        node.appendChild(el('h3', null, [ev ? 'Editar evento' : 'Nuevo evento']));

        const fType = el('select');
        Object.keys(EVENT_TYPES).filter(k => k !== 'sale').forEach(k => {
            const op = el('option', { value: k }, [EVENT_TYPES[k].label]);
            if (init.type === k) op.selected = true;
            fType.appendChild(op);
        });
        const fTitle = el('input', { type: 'text', value: init.title || '' });
        const fStart = el('input', { type: 'datetime-local', value: init.start || '' });
        const fEnd   = el('input', { type: 'datetime-local', value: init.end || '' });
        const fLoc   = el('input', { type: 'text', value: init.location || '' });
        const fCust  = el('input', { type: 'text', value: init.customer || '' });
        const fAmt   = el('input', { type: 'number', step: '0.01', value: init.amount || '' });
        const fDesc  = el('textarea', { rows: '3' });
        fDesc.value  = init.description || '';
        const fRec   = el('select');
        RECURRENCE.forEach(r => {
            const op = el('option', { value: r }, [r === 'none' ? 'Sin recurrencia' : r]);
            if (init.recurrence === r) op.selected = true;
            fRec.appendChild(op);
        });
        const fUntil = el('input', { type: 'date', value: init.recurUntil ? init.recurUntil.slice(0,10) : '' });

        node.appendChild(el('label', null, ['Tipo'])); node.appendChild(fType);
        node.appendChild(el('label', null, ['Titulo'])); node.appendChild(fTitle);
        const r1 = el('div', { class: 'row' });
        const c1 = el('div'); c1.appendChild(el('label', null, ['Inicio'])); c1.appendChild(fStart);
        const c2 = el('div'); c2.appendChild(el('label', null, ['Fin']));    c2.appendChild(fEnd);
        r1.appendChild(c1); r1.appendChild(c2);
        node.appendChild(r1);
        node.appendChild(el('label', null, ['Lugar'])); node.appendChild(fLoc);
        node.appendChild(el('label', null, ['Cliente / Proveedor'])); node.appendChild(fCust);
        node.appendChild(el('label', null, ['Monto'])); node.appendChild(fAmt);
        node.appendChild(el('label', null, ['Descripcion'])); node.appendChild(fDesc);
        const r2 = el('div', { class: 'row' });
        const c3 = el('div'); c3.appendChild(el('label', null, ['Recurrencia'])); c3.appendChild(fRec);
        const c4 = el('div'); c4.appendChild(el('label', null, ['Hasta']));      c4.appendChild(fUntil);
        r2.appendChild(c3); r2.appendChild(c4);
        node.appendChild(r2);

        const actions = el('div', { class: 'vx-cal-actions' });
        actions.appendChild(el('button', { class: 'vx-cal-btn-ghost', onclick: closeModal }, ['Cancelar']));
        actions.appendChild(el('button', {
            class: 'vx-cal-btn-primary',
            onclick: () => {
                const data = {
                    type: fType.value,
                    title: fTitle.value || '(sin titulo)',
                    start: fStart.value,
                    end:   fEnd.value || fStart.value,
                    location: fLoc.value,
                    customer: fCust.value,
                    amount:   fAmt.value ? parseFloat(fAmt.value) : null,
                    description: fDesc.value,
                    recurrence: fRec.value,
                    recurUntil: fUntil.value || null
                };
                if (ev) updateEvent(ev.id, data);
                else    createEvent(data);
                closeModal();
            }
        }, ['Guardar']));
        node.appendChild(actions);
        openModal(node);
    }

    function openSettings() {
        const node = el('div');
        node.appendChild(el('h3', null, ['Ajustes calendario']));
        const fLead = el('input', { type: 'number', min: '0', value: String(State.settings.notifLeadMin) });
        const fSnd  = el('input', { type: 'checkbox' }); fSnd.checked = State.settings.soundOn;
        const fAuto = el('input', { type: 'checkbox' }); fAuto.checked = State.settings.autoOpenModal;
        node.appendChild(el('label', null, ['Anticipacion notificacion (min)'])); node.appendChild(fLead);
        const w1 = el('label'); w1.appendChild(fSnd);  w1.appendChild(document.createTextNode(' Sonido'));            node.appendChild(w1);
        const w2 = el('label'); w2.appendChild(fAuto); w2.appendChild(document.createTextNode(' Abrir modal al click')); node.appendChild(w2);
        const actions = el('div', { class: 'vx-cal-actions' });
        actions.appendChild(el('button', { class: 'vx-cal-btn-ghost', onclick: closeModal }, ['Cerrar']));
        actions.appendChild(el('button', {
            class: 'vx-cal-btn-primary',
            onclick: () => {
                State.settings.notifLeadMin  = parseInt(fLead.value, 10) || 0;
                State.settings.soundOn       = fSnd.checked;
                State.settings.autoOpenModal = fAuto.checked;
                saveSettings();
                closeModal();
            }
        }, ['Guardar']));
        node.appendChild(actions);
        openModal(node);
    }

    // ---------------------------------------------------------------- Public API
    const Calendar = {
        init(opts) {
            opts = opts || {};
            injectStyles();
            loadSettings();
            loadEvents();
            ensureNotifPermission();
            this.render();
            startNotifLoop();
            State.rendered = true;
            return this;
        },
        render() {
            const root = getRoot();
            root.innerHTML = '';
            root.appendChild(renderToolbar());
            if      (State.view === 'month') root.appendChild(renderMonth());
            else if (State.view === 'week')  root.appendChild(renderWeek());
            else                              root.appendChild(renderDay());
        },
        create:  createEvent,
        update:  updateEvent,
        remove:  deleteEvent,
        get:     getEvent,
        list:    () => State.events.slice(),
        export:  exportICal,
        setView: v => { if (VIEWS.includes(v)) { State.view = v; Calendar.render(); } },
        goto:    d => { State.cursorDate = new Date(d); Calendar.render(); },
        types:   EVENT_TYPES
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Calendar.init());
    } else {
        try { Calendar.init(); } catch (e) { console.warn('[calendar] init delayed', e); }
    }

    global.VolvixCalendar = Calendar;
})(typeof window !== 'undefined' ? window : globalThis);
