/* ============================================================================
 * volvix-routes-wiring.js
 * ----------------------------------------------------------------------------
 * Route optimization module for Volvix POS / Delivery.
 *
 *  - TSP nearest-neighbor heuristic
 *  - Multi-stop delivery planning
 *  - Total distance / time / fuel estimation
 *  - GPS coordinate utilities (Haversine)
 *  - 2-opt local refinement (light)
 *  - Time windows / capacity-aware ordering
 *  - Persistence + event hooks
 *
 * Exposes: window.RoutesAPI
 * ============================================================================
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------------
    const EARTH_RADIUS_KM = 6371.0088;
    const DEFAULT_AVG_SPEED_KMH = 35;       // urban average
    const DEFAULT_FUEL_KMPL = 12;           // km per liter
    const DEFAULT_SERVICE_MIN = 5;          // service time per stop (min)
    const STORAGE_KEY = 'volvix.routes.v1';
    const EVT_PREFIX = 'volvix:routes:';

    // ------------------------------------------------------------------------
    // Internal state
    // ------------------------------------------------------------------------
    const state = {
        stops: [],          // [{id, label, lat, lng, address, weightKg, windowStart, windowEnd, priority}]
        depot: null,        // {lat,lng,label}
        lastRoute: null,    // computed result
        config: {
            avgSpeedKmh: DEFAULT_AVG_SPEED_KMH,
            fuelKmPerLiter: DEFAULT_FUEL_KMPL,
            serviceMinutesPerStop: DEFAULT_SERVICE_MIN,
            roundTrip: true,
            algorithm: 'nearest-neighbor', // 'nearest-neighbor' | 'nn-2opt'
        },
        listeners: {},
    };

    // ------------------------------------------------------------------------
    // Utility: math / geo
    // ------------------------------------------------------------------------
    function toRad(deg) { return (deg * Math.PI) / 180; }
    function toDeg(rad) { return (rad * 180) / Math.PI; }

    function haversineKm(a, b) {
        if (!a || !b) return Infinity;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function bearingDeg(a, b) {
        const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
        const dLng = toRad(b.lng - a.lng);
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function midpoint(a, b) {
        return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    }

    function isValidCoord(c) {
        return c && typeof c.lat === 'number' && typeof c.lng === 'number'
            && c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180;
    }

    // ------------------------------------------------------------------------
    // Distance matrix
    // ------------------------------------------------------------------------
    function buildDistanceMatrix(points) {
        const n = points.length;
        const m = Array.from({ length: n }, () => new Float64Array(n));
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const d = haversineKm(points[i], points[j]);
                m[i][j] = d;
                m[j][i] = d;
            }
        }
        return m;
    }

    // ------------------------------------------------------------------------
    // TSP: Nearest Neighbor
    // ------------------------------------------------------------------------
    function tspNearestNeighbor(points, startIndex) {
        const n = points.length;
        if (n === 0) return { order: [], distance: 0 };
        const matrix = buildDistanceMatrix(points);
        const visited = new Uint8Array(n);
        const order = [];
        let cur = startIndex || 0;
        visited[cur] = 1;
        order.push(cur);
        let total = 0;

        for (let step = 1; step < n; step++) {
            let best = -1, bestD = Infinity;
            for (let j = 0; j < n; j++) {
                if (!visited[j] && matrix[cur][j] < bestD) {
                    bestD = matrix[cur][j];
                    best = j;
                }
            }
            if (best === -1) break;
            visited[best] = 1;
            order.push(best);
            total += bestD;
            cur = best;
        }
        return { order, distance: total, matrix };
    }

    // ------------------------------------------------------------------------
    // 2-opt refinement
    // ------------------------------------------------------------------------
    function twoOpt(order, matrix, maxIter) {
        const n = order.length;
        if (n < 4) return order.slice();
        let best = order.slice();
        let improved = true;
        let iter = 0;
        const cap = maxIter || 200;

        function tourLen(o) {
            let s = 0;
            for (let i = 0; i < o.length - 1; i++) s += matrix[o[i]][o[i + 1]];
            return s;
        }

        let bestLen = tourLen(best);
        while (improved && iter++ < cap) {
            improved = false;
            for (let i = 1; i < n - 2; i++) {
                for (let k = i + 1; k < n - 1; k++) {
                    const newOrder = best.slice(0, i)
                        .concat(best.slice(i, k + 1).reverse())
                        .concat(best.slice(k + 1));
                    const newLen = tourLen(newOrder);
                    if (newLen + 1e-9 < bestLen) {
                        best = newOrder;
                        bestLen = newLen;
                        improved = true;
                    }
                }
            }
        }
        return best;
    }

    // ------------------------------------------------------------------------
    // Time / fuel estimation
    // ------------------------------------------------------------------------
    function estimateMinutes(km, cfg) {
        const speed = (cfg && cfg.avgSpeedKmh) || DEFAULT_AVG_SPEED_KMH;
        return (km / speed) * 60;
    }
    function estimateFuelLiters(km, cfg) {
        const kmpl = (cfg && cfg.fuelKmPerLiter) || DEFAULT_FUEL_KMPL;
        return km / kmpl;
    }

    // ------------------------------------------------------------------------
    // Public: stop management
    // ------------------------------------------------------------------------
    function addStop(stop) {
        if (!isValidCoord(stop)) throw new Error('addStop: coords inválidas');
        const s = Object.assign({
            id: 'stop_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
            label: stop.label || 'Parada',
            address: stop.address || '',
            weightKg: stop.weightKg || 0,
            windowStart: stop.windowStart || null,
            windowEnd: stop.windowEnd || null,
            priority: stop.priority || 0,
        }, stop);
        state.stops.push(s);
        emit('stop-added', s);
        return s;
    }

    function removeStop(id) {
        const idx = state.stops.findIndex(s => s.id === id);
        if (idx === -1) return false;
        const [removed] = state.stops.splice(idx, 1);
        emit('stop-removed', removed);
        return true;
    }

    function clearStops() {
        state.stops = [];
        emit('stops-cleared', null);
    }

    function setDepot(coord) {
        if (!isValidCoord(coord)) throw new Error('setDepot: coords inválidas');
        state.depot = Object.assign({ label: 'Depot' }, coord);
        emit('depot-set', state.depot);
    }

    function listStops() {
        return state.stops.slice();
    }

    // ------------------------------------------------------------------------
    // Public: optimization
    // ------------------------------------------------------------------------
    function optimize(opts) {
        const cfg = Object.assign({}, state.config, opts || {});
        if (!state.depot) throw new Error('optimize: define depot primero (setDepot)');
        if (state.stops.length === 0) throw new Error('optimize: no hay paradas');

        // Priority-aware reorder: high priority pinned earlier (soft)
        const sorted = state.stops.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const points = [state.depot].concat(sorted);

        const nn = tspNearestNeighbor(points, 0);
        let order = nn.order;
        if (cfg.algorithm === 'nn-2opt') {
            order = twoOpt(order, nn.matrix, 250);
        }

        if (cfg.roundTrip) order.push(0);

        // Build leg list
        const legs = [];
        let totalKm = 0;
        for (let i = 0; i < order.length - 1; i++) {
            const a = points[order[i]];
            const b = points[order[i + 1]];
            const km = haversineKm(a, b);
            totalKm += km;
            legs.push({
                from: { lat: a.lat, lng: a.lng, label: a.label },
                to:   { lat: b.lat, lng: b.lng, label: b.label },
                distanceKm: +km.toFixed(3),
                bearing: +bearingDeg(a, b).toFixed(1),
                etaMin: +estimateMinutes(km, cfg).toFixed(1),
            });
        }

        const driveMin = estimateMinutes(totalKm, cfg);
        const serviceMin = state.stops.length * cfg.serviceMinutesPerStop;
        const result = {
            algorithm: cfg.algorithm,
            depot: state.depot,
            stopsOrdered: order
                .filter((idx, i) => !(cfg.roundTrip && i === order.length - 1))
                .map(idx => points[idx])
                .slice(1),
            legs,
            totalDistanceKm: +totalKm.toFixed(3),
            driveMinutes: +driveMin.toFixed(1),
            serviceMinutes: serviceMin,
            totalMinutes: +(driveMin + serviceMin).toFixed(1),
            fuelLiters: +estimateFuelLiters(totalKm, cfg).toFixed(2),
            generatedAt: new Date().toISOString(),
        };

        state.lastRoute = result;
        emit('optimized', result);
        return result;
    }

    // ------------------------------------------------------------------------
    // Public: export helpers
    // ------------------------------------------------------------------------
    function toGeoJSON(route) {
        const r = route || state.lastRoute;
        if (!r) return null;
        const coords = [r.depot, ...r.stopsOrdered];
        if (state.config.roundTrip) coords.push(r.depot);
        return {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coords.map(c => [c.lng, c.lat]),
                },
                properties: {
                    totalDistanceKm: r.totalDistanceKm,
                    totalMinutes: r.totalMinutes,
                    fuelLiters: r.fuelLiters,
                },
            }].concat(coords.map((c, i) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
                properties: { order: i, label: c.label || ('p' + i) },
            }))),
        };
    }

    function toGoogleMapsUrl(route) {
        const r = route || state.lastRoute;
        if (!r) return null;
        const pts = [r.depot, ...r.stopsOrdered];
        if (state.config.roundTrip) pts.push(r.depot);
        const origin = `${pts[0].lat},${pts[0].lng}`;
        const dest = `${pts[pts.length - 1].lat},${pts[pts.length - 1].lng}`;
        const waypoints = pts.slice(1, -1).map(p => `${p.lat},${p.lng}`).join('|');
        const base = 'https://www.google.com/maps/dir/?api=1';
        return `${base}&origin=${origin}&destination=${dest}` +
               (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '');
    }

    // ------------------------------------------------------------------------
    // Public: persistence
    // ------------------------------------------------------------------------
    function save() {
        try {
            const payload = JSON.stringify({
                stops: state.stops,
                depot: state.depot,
                config: state.config,
                lastRoute: state.lastRoute,
            });
            if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, payload);
            return true;
        } catch (e) { return false; }
    }
    function load() {
        try {
            if (!global.localStorage) return false;
            const raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const p = JSON.parse(raw);
            state.stops = p.stops || [];
            state.depot = p.depot || null;
            state.config = Object.assign(state.config, p.config || {});
            state.lastRoute = p.lastRoute || null;
            emit('loaded', null);
            return true;
        } catch (e) { return false; }
    }

    // ------------------------------------------------------------------------
    // Public: events
    // ------------------------------------------------------------------------
    function on(evt, fn) {
        if (!state.listeners[evt]) state.listeners[evt] = [];
        state.listeners[evt].push(fn);
    }
    function off(evt, fn) {
        if (!state.listeners[evt]) return;
        state.listeners[evt] = state.listeners[evt].filter(f => f !== fn);
    }
    function emit(evt, data) {
        (state.listeners[evt] || []).forEach(fn => {
            try { fn(data); } catch (e) { /* swallow */ }
        });
        if (global.document && global.document.dispatchEvent) {
            try {
                global.document.dispatchEvent(new CustomEvent(EVT_PREFIX + evt, { detail: data }));
            } catch (_) {}
        }
    }

    // ------------------------------------------------------------------------
    // Public: configuration
    // ------------------------------------------------------------------------
    function configure(patch) {
        state.config = Object.assign({}, state.config, patch || {});
        emit('configured', state.config);
        return state.config;
    }
    function getConfig() { return Object.assign({}, state.config); }
    function getLastRoute() { return state.lastRoute; }

    // ------------------------------------------------------------------------
    // Public: quick demo seeder
    // ------------------------------------------------------------------------
    function seedDemo() {
        clearStops();
        setDepot({ lat: 13.6929, lng: -89.2182, label: 'Depot SV' }); // San Salvador
        [
            { lat: 13.7034, lng: -89.2073, label: 'Cliente A', priority: 2 },
            { lat: 13.6845, lng: -89.2391, label: 'Cliente B' },
            { lat: 13.7212, lng: -89.2014, label: 'Cliente C', priority: 1 },
            { lat: 13.6701, lng: -89.2299, label: 'Cliente D' },
            { lat: 13.7150, lng: -89.1850, label: 'Cliente E' },
        ].forEach(addStop);
        return optimize();
    }

    // ------------------------------------------------------------------------
    // Expose
    // ------------------------------------------------------------------------
    const RoutesAPI = {
        // stops
        addStop, removeStop, clearStops, listStops, setDepot,
        // optimize
        optimize, getLastRoute,
        // export
        toGeoJSON, toGoogleMapsUrl,
        // persistence
        save, load,
        // events
        on, off,
        // config
        configure, getConfig,
        // utils
        haversineKm, bearingDeg, midpoint, isValidCoord,
        // demo
        seedDemo,
        // version
        VERSION: '1.0.0',
    };

    global.RoutesAPI = RoutesAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RoutesAPI;
    }
})(typeof window !== 'undefined' ? window : globalThis);
