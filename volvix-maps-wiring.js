/* ============================================================================
 * volvix-maps-wiring.js
 * Volvix POS — Maps Integration Module
 * ----------------------------------------------------------------------------
 * Provides geolocation, address autocomplete (simulated), Haversine distance,
 * tenant pin rendering on an SVG map, and route planning.
 *
 * Public API: window.MapsAPI
 *   .locate()                       -> Promise<{lat, lng, accuracy}>
 *   .distance(a, b)                 -> number (km)
 *   .addPin(tenant)                 -> SVGElement
 *   .drawRoute(from, to, opts?)     -> SVGElement
 *   .autocomplete(query)            -> Promise<Address[]>
 *   .clear()                        -> void
 *   .listTenants()                  -> Tenant[]
 *   .focus(id)                      -> void
 * ==========================================================================*/
(function (global) {
    'use strict';

    // ---------- Constants -------------------------------------------------------
    const EARTH_RADIUS_KM = 6371.0088;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const DEFAULT_CENTER = { lat: 13.6929, lng: -89.2182 }; // San Salvador
    const DEFAULT_ZOOM = 12;
    const MAP_WIDTH = 800;
    const MAP_HEIGHT = 600;

    // ---------- Internal state --------------------------------------------------
    const state = {
        currentLocation: null,
        tenants: [],
        pins: new Map(),
        routes: [],
        svg: null,
        layerPins: null,
        layerRoutes: null,
        layerUser: null,
        center: { ...DEFAULT_CENTER },
        zoom: DEFAULT_ZOOM,
        listeners: {}
    };

    // ---------- Simulated address database --------------------------------------
    const ADDRESS_DB = [
        { label: 'San Salvador Centro Histórico', lat: 13.6989, lng: -89.1914 },
        { label: 'Santa Tecla, La Libertad',      lat: 13.6769, lng: -89.2797 },
        { label: 'Antiguo Cuscatlán',             lat: 13.6731, lng: -89.2495 },
        { label: 'Soyapango',                     lat: 13.7100, lng: -89.1394 },
        { label: 'Mejicanos',                     lat: 13.7409, lng: -89.2131 },
        { label: 'Apopa',                          lat: 13.8061, lng: -89.1789 },
        { label: 'Ilopango',                       lat: 13.7019, lng: -89.1106 },
        { label: 'Ciudad Merliot',                 lat: 13.6700, lng: -89.2680 },
        { label: 'Colonia Escalón',                lat: 13.7020, lng: -89.2400 },
        { label: 'Zona Rosa',                      lat: 13.7000, lng: -89.2350 },
        { label: 'Multiplaza',                     lat: 13.6760, lng: -89.2480 },
        { label: 'Metrocentro',                    lat: 13.7050, lng: -89.2200 },
        { label: 'Galerías',                        lat: 13.7060, lng: -89.2370 },
        { label: 'La Gran Vía',                    lat: 13.6726, lng: -89.2466 },
        { label: 'Plaza Mundo Soyapango',          lat: 13.7252, lng: -89.1407 },
        { label: 'San Miguel Centro',              lat: 13.4833, lng: -88.1833 },
        { label: 'Santa Ana Centro',               lat: 13.9942, lng: -89.5594 },
        { label: 'La Libertad Puerto',             lat: 13.4833, lng: -89.3222 },
        { label: 'Sonsonate',                       lat: 13.7186, lng: -89.7242 },
        { label: 'Usulután',                        lat: 13.3500, lng: -88.4500 }
    ];

    // ---------- Math helpers ----------------------------------------------------
    function toRad(deg) { return deg * Math.PI / 180; }

    function haversine(a, b) {
        if (!a || !b) throw new Error('haversine: ambos puntos son requeridos');
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function bearing(a, b) {
        const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
        const dLng = toRad(b.lng - a.lng);
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // ---------- Projection (equirectangular, scaled) ----------------------------
    function project(point) {
        const scale = state.zoom * 4;
        const dx = (point.lng - state.center.lng) * scale * 111.32 *
                   Math.cos(toRad(state.center.lat));
        const dy = (point.lat - state.center.lat) * scale * 110.57;
        return {
            x: MAP_WIDTH / 2 + dx,
            y: MAP_HEIGHT / 2 - dy
        };
    }

    // ---------- SVG helpers -----------------------------------------------------
    function el(name, attrs = {}, parent = null) {
        const node = document.createElementNS(SVG_NS, name);
        for (const k in attrs) node.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(node);
        return node;
    }

    function ensureSVG(container) {
        if (state.svg) return state.svg;
        const host = typeof container === 'string'
            ? document.querySelector(container)
            : container || document.body;
        const svg = el('svg', {
            xmlns: SVG_NS,
            viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
            width: '100%',
            height: '100%',
            class: 'volvix-map'
        });
        // Background grid
        const defs = el('defs', {}, svg);
        const pattern = el('pattern', {
            id: 'vx-grid', width: 40, height: 40, patternUnits: 'userSpaceOnUse'
        }, defs);
        el('path', {
            d: 'M 40 0 L 0 0 0 40',
            fill: 'none', stroke: '#e5e7eb', 'stroke-width': 1
        }, pattern);
        el('rect', {
            width: MAP_WIDTH, height: MAP_HEIGHT, fill: '#f9fafb'
        }, svg);
        el('rect', {
            width: MAP_WIDTH, height: MAP_HEIGHT, fill: 'url(#vx-grid)'
        }, svg);
        state.layerRoutes = el('g', { class: 'vx-routes' }, svg);
        state.layerPins   = el('g', { class: 'vx-pins' }, svg);
        state.layerUser   = el('g', { class: 'vx-user' }, svg);
        host.appendChild(svg);
        state.svg = svg;
        return svg;
    }

    // ---------- Geolocation -----------------------------------------------------
    function locate(options = {}) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                // Fallback: simulate near default center
                const fake = {
                    lat: DEFAULT_CENTER.lat + (Math.random() - 0.5) * 0.02,
                    lng: DEFAULT_CENTER.lng + (Math.random() - 0.5) * 0.02,
                    accuracy: 50,
                    simulated: true
                };
                state.currentLocation = fake;
                renderUserPin();
                return resolve(fake);
            }
            navigator.geolocation.getCurrentPosition(
                pos => {
                    const loc = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        simulated: false
                    };
                    state.currentLocation = loc;
                    renderUserPin();
                    emit('locate', loc);
                    resolve(loc);
                },
                err => reject(err),
                Object.assign({
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 30000
                }, options)
            );
        });
    }

    function renderUserPin() {
        if (!state.svg || !state.currentLocation) return;
        while (state.layerUser.firstChild) {
            state.layerUser.removeChild(state.layerUser.firstChild);
        }
        const p = project(state.currentLocation);
        el('circle', {
            cx: p.x, cy: p.y, r: 14,
            fill: '#3b82f6', 'fill-opacity': 0.18
        }, state.layerUser);
        el('circle', {
            cx: p.x, cy: p.y, r: 6,
            fill: '#3b82f6', stroke: '#fff', 'stroke-width': 2
        }, state.layerUser);
    }

    // ---------- Autocomplete (simulated) ----------------------------------------
    function autocomplete(query) {
        return new Promise(resolve => {
            const q = String(query || '').trim().toLowerCase();
            if (!q) return resolve([]);
            const matches = ADDRESS_DB
                .map(a => ({ ...a, score: scoreMatch(a.label.toLowerCase(), q) }))
                .filter(a => a.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);
            // Simulate network latency
            setTimeout(() => resolve(matches), 120);
        });
    }

    function scoreMatch(label, q) {
        if (label.startsWith(q)) return 100;
        if (label.includes(' ' + q)) return 60;
        if (label.includes(q)) return 30;
        // fuzzy: every char of q present in order
        let i = 0;
        for (const ch of label) {
            if (ch === q[i]) i++;
            if (i === q.length) return 10;
        }
        return 0;
    }

    // ---------- Pins / Tenants --------------------------------------------------
    function addPin(tenant) {
        if (!tenant || typeof tenant.lat !== 'number' || typeof tenant.lng !== 'number') {
            throw new Error('addPin: tenant requiere {id, name, lat, lng}');
        }
        ensureSVG();
        const id = tenant.id || ('t_' + Math.random().toString(36).slice(2, 9));
        const t = { id, name: tenant.name || 'Sin nombre', ...tenant };
        if (state.pins.has(id)) removePin(id);
        state.tenants.push(t);

        const p = project(t);
        const g = el('g', {
            class: 'vx-pin',
            'data-id': id,
            transform: `translate(${p.x}, ${p.y})`
        }, state.layerPins);
        el('path', {
            d: 'M0,-22 C-9,-22 -14,-15 -14,-9 C-14,-1 0,12 0,12 C0,12 14,-1 14,-9 C14,-15 9,-22 0,-22 Z',
            fill: t.color || '#ef4444',
            stroke: '#fff', 'stroke-width': 2
        }, g);
        el('circle', { cx: 0, cy: -10, r: 4, fill: '#fff' }, g);
        const label = el('text', {
            x: 0, y: 24, 'text-anchor': 'middle',
            'font-size': 11, 'font-family': 'sans-serif',
            fill: '#111827'
        }, g);
        label.textContent = t.name;

        g.addEventListener('click', () => emit('pin:click', t));
        state.pins.set(id, g);
        return g;
    }

    function removePin(id) {
        const node = state.pins.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        state.pins.delete(id);
        state.tenants = state.tenants.filter(t => t.id !== id);
    }

    function focus(id) {
        const t = state.tenants.find(x => x.id === id);
        if (!t) return;
        state.center = { lat: t.lat, lng: t.lng };
        redraw();
        emit('focus', t);
    }

    function listTenants() {
        return state.tenants.slice();
    }

    // ---------- Routes ----------------------------------------------------------
    function drawRoute(from, to, opts = {}) {
        ensureSVG();
        if (!from || !to) throw new Error('drawRoute: from y to son requeridos');
        const a = project(from), b = project(to);
        // Synthetic curve via two control points (greatcircle-ish)
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const bend = (opts.bend != null ? opts.bend : 0.18) * len;
        const cx = midX + nx * bend, cy = midY + ny * bend;
        const path = el('path', {
            d: `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`,
            fill: 'none',
            stroke: opts.color || '#10b981',
            'stroke-width': opts.width || 3,
            'stroke-dasharray': opts.dashed ? '6 4' : '0',
            'stroke-linecap': 'round'
        }, state.layerRoutes);
        const km = haversine(from, to);
        const bg = bearing(from, to);
        const route = { id: 'r_' + Date.now(), from, to, km, bearing: bg, node: path };
        state.routes.push(route);
        emit('route', route);
        return path;
    }

    function clear() {
        state.pins.forEach((_, id) => removePin(id));
        state.routes.forEach(r => r.node.remove && r.node.remove());
        state.routes = [];
        if (state.layerRoutes) {
            while (state.layerRoutes.firstChild) {
                state.layerRoutes.removeChild(state.layerRoutes.firstChild);
            }
        }
    }

    function redraw() {
        const snapshot = state.tenants.slice();
        state.pins.forEach((_, id) => removePin(id));
        snapshot.forEach(addPin);
        renderUserPin();
    }

    // ---------- Events ----------------------------------------------------------
    function on(event, fn) {
        (state.listeners[event] = state.listeners[event] || []).push(fn);
    }
    function off(event, fn) {
        if (!state.listeners[event]) return;
        state.listeners[event] = state.listeners[event].filter(x => x !== fn);
    }
    function emit(event, payload) {
        (state.listeners[event] || []).forEach(fn => {
            try { fn(payload); } catch (e) { console.warn('[MapsAPI] listener error', e); }
        });
    }

    // ---------- Public API ------------------------------------------------------
    const MapsAPI = {
        init(container) { ensureSVG(container); return MapsAPI; },
        locate,
        distance: haversine,
        bearing,
        addPin,
        removePin,
        drawRoute,
        autocomplete,
        clear,
        listTenants,
        focus,
        on, off,
        get current() { return state.currentLocation; },
        get center()  { return { ...state.center }; },
        setCenter(c) { state.center = { ...c }; redraw(); },
        setZoom(z)   { state.zoom = z; redraw(); },
        _state: state
    };

    global.MapsAPI = MapsAPI;

    // Auto-init if a default container exists
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            const host = document.querySelector('[data-volvix-map]');
            if (host) MapsAPI.init(host);
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
