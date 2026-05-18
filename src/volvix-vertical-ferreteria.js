/**
 * volvix-vertical-ferreteria.js
 * Volvix POS — Vertical: Ferretería
 *
 * Funcionalidades:
 *  - Medidas (metros, centímetros, milímetros, pulgadas, pies)
 *  - Conversión automática entre unidades
 *  - Códigos múltiples por producto (SKU, código de barras, código interno, código proveedor)
 *  - Precios por mayoreo (escalonados por cantidad)
 *  - Productos equivalentes / sustitutos
 *  - Cálculo de cortes (cable, tubería, cadena, etc.)
 *
 * Expone: window.FerreteriaAPI
 * Autor: Volvix POS
 * Versión: 1.0.0
 */
(function (global) {
    'use strict';

    // =====================================================================
    // 1. CONVERSIONES DE UNIDADES
    // =====================================================================
    const UNIT_TO_MM = {
        mm: 1,
        cm: 10,
        m:  1000,
        km: 1000000,
        in: 25.4,        // pulgada
        '"': 25.4,       // alias pulgada
        ft: 304.8,       // pie
        "'": 304.8,      // alias pie
        yd: 914.4,       // yarda
    };

    const UNIT_ALIASES = {
        metro: 'm', metros: 'm', mts: 'm', mt: 'm',
        centimetro: 'cm', centimetros: 'cm', cms: 'cm',
        milimetro: 'mm', milimetros: 'mm',
        pulgada: 'in', pulgadas: 'in', inch: 'in', inches: 'in',
        pie: 'ft', pies: 'ft', feet: 'ft', foot: 'ft',
        yarda: 'yd', yardas: 'yd',
    };

    function normalizeUnit(u) {
        if (!u) return null;
        const k = String(u).toLowerCase().trim();
        if (UNIT_TO_MM[k] !== undefined) return k;
        if (UNIT_ALIASES[k]) return UNIT_ALIASES[k];
        return null;
    }

    function convert(value, fromUnit, toUnit) {
        const f = normalizeUnit(fromUnit);
        const t = normalizeUnit(toUnit);
        if (!f || !t) throw new Error(`Unidad inválida: ${fromUnit} -> ${toUnit}`);
        const mm = Number(value) * UNIT_TO_MM[f];
        return mm / UNIT_TO_MM[t];
    }

    // Parsea expresiones tipo "1/2\"", "3 1/4 in", "2.5 m", "150cm"
    function parseMeasurement(expr) {
        if (typeof expr === 'number') return { value: expr, unit: 'm' };
        if (!expr) return null;
        const s = String(expr).trim().toLowerCase().replace(/\s+/g, ' ');

        // detectar unidad al final
        const unitMatch = s.match(/(mm|cm|km|m|in|ft|yd|"|')\s*$/);
        let unit = 'm';
        let numericPart = s;
        if (unitMatch) {
            unit = normalizeUnit(unitMatch[1]) || 'm';
            numericPart = s.slice(0, unitMatch.index).trim();
        } else {
            // buscar palabra
            for (const alias in UNIT_ALIASES) {
                if (s.endsWith(alias)) {
                    unit = UNIT_ALIASES[alias];
                    numericPart = s.slice(0, -alias.length).trim();
                    break;
                }
            }
        }

        // soporta "3 1/4" o "1/2" o "2.5"
        let value = 0;
        if (numericPart.includes('/')) {
            const parts = numericPart.split(' ').filter(Boolean);
            if (parts.length === 2) {
                const [a, b] = parts[1].split('/').map(Number);
                value = parseFloat(parts[0]) + a / b;
            } else {
                const [a, b] = parts[0].split('/').map(Number);
                value = a / b;
            }
        } else {
            value = parseFloat(numericPart);
        }

        if (isNaN(value)) return null;
        return { value, unit };
    }

    function formatMeasurement(value, unit, decimals = 2) {
        const u = normalizeUnit(unit) || 'm';
        return `${Number(value).toFixed(decimals)} ${u}`;
    }

    // =====================================================================
    // 2. CATÁLOGO DE PRODUCTOS (en memoria; persistible vía storage adapter)
    // =====================================================================
    const _products = new Map(); // id -> producto

    /**
     * Estructura producto:
     * {
     *   id, nombre, descripcion,
     *   codigos: [{ tipo: 'sku'|'barras'|'interno'|'proveedor', valor }],
     *   precio: number,                // precio base (1 unidad)
     *   unidadVenta: 'pza'|'m'|'kg'|'lt',
     *   stock: number,
     *   mayoreo: [{ minCantidad, precio }],   // ordenado asc por minCantidad
     *   equivalentes: [idProducto, ...],
     *   medidas: { largo?, diametro?, calibre?, unidad? },
     *   categoria, marca, ubicacion,
     * }
     */

    function addProduct(p) {
        if (!p || !p.id) throw new Error('Producto requiere id');
        const norm = {
            id: String(p.id),
            nombre: p.nombre || '',
            descripcion: p.descripcion || '',
            codigos: Array.isArray(p.codigos) ? p.codigos.slice() : [],
            precio: Number(p.precio) || 0,
            unidadVenta: p.unidadVenta || 'pza',
            stock: Number(p.stock) || 0,
            mayoreo: (p.mayoreo || []).slice().sort((a, b) => a.minCantidad - b.minCantidad),
            equivalentes: Array.isArray(p.equivalentes) ? p.equivalentes.slice() : [],
            medidas: p.medidas || null,
            categoria: p.categoria || '',
            marca: p.marca || '',
            ubicacion: p.ubicacion || '',
        };
        _products.set(norm.id, norm);
        return norm;
    }

    function updateProduct(id, patch) {
        const p = _products.get(String(id));
        if (!p) return null;
        Object.assign(p, patch);
        if (patch.mayoreo) {
            p.mayoreo = patch.mayoreo.slice().sort((a, b) => a.minCantidad - b.minCantidad);
        }
        return p;
    }

    function removeProduct(id) {
        return _products.delete(String(id));
    }

    function getProduct(id) {
        return _products.get(String(id)) || null;
    }

    function listProducts() {
        return Array.from(_products.values());
    }

    // =====================================================================
    // 3. BÚSQUEDA POR CÓDIGOS MÚLTIPLES
    // =====================================================================
    function findByCode(codigo) {
        if (!codigo) return null;
        const q = String(codigo).trim().toLowerCase();
        for (const p of _products.values()) {
            if (p.id.toLowerCase() === q) return p;
            for (const c of p.codigos) {
                if (String(c.valor).toLowerCase() === q) return p;
            }
        }
        return null;
    }

    function findByCodeType(tipo, valor) {
        const q = String(valor).trim().toLowerCase();
        for (const p of _products.values()) {
            for (const c of p.codigos) {
                if (c.tipo === tipo && String(c.valor).toLowerCase() === q) return p;
            }
        }
        return null;
    }

    function searchProducts(text) {
        const q = String(text || '').trim().toLowerCase();
        if (!q) return [];
        const out = [];
        for (const p of _products.values()) {
            const haystack = [
                p.id, p.nombre, p.descripcion, p.categoria, p.marca,
                ...p.codigos.map(c => c.valor),
            ].join(' ').toLowerCase();
            if (haystack.includes(q)) out.push(p);
        }
        return out;
    }

    function addCode(productId, tipo, valor) {
        const p = getProduct(productId);
        if (!p) return false;
        if (!p.codigos.some(c => c.tipo === tipo && c.valor === valor)) {
            p.codigos.push({ tipo, valor });
        }
        return true;
    }

    // =====================================================================
    // 4. PRECIO POR MAYOREO
    // =====================================================================
    function getPriceForQty(productId, qty) {
        const p = getProduct(productId);
        if (!p) return null;
        const q = Number(qty) || 0;
        let price = p.precio;
        for (const tier of p.mayoreo) {
            if (q >= tier.minCantidad) price = tier.precio;
        }
        return price;
    }

    function calcLineTotal(productId, qty) {
        const price = getPriceForQty(productId, qty);
        if (price === null) return null;
        return {
            unitPrice: price,
            qty: Number(qty),
            subtotal: +(price * Number(qty)).toFixed(4),
        };
    }

    function nextTierInfo(productId, qty) {
        const p = getProduct(productId);
        if (!p || !p.mayoreo.length) return null;
        const q = Number(qty) || 0;
        for (const tier of p.mayoreo) {
            if (q < tier.minCantidad) {
                return {
                    falta: tier.minCantidad - q,
                    precioObjetivo: tier.precio,
                    minCantidad: tier.minCantidad,
                };
            }
        }
        return null; // ya está en el tier máximo
    }

    // =====================================================================
    // 5. EQUIVALENTES / SUSTITUTOS
    // =====================================================================
    function addEquivalent(productId, equivalentId) {
        const a = getProduct(productId);
        const b = getProduct(equivalentId);
        if (!a || !b) return false;
        if (!a.equivalentes.includes(b.id)) a.equivalentes.push(b.id);
        if (!b.equivalentes.includes(a.id)) b.equivalentes.push(a.id);
        return true;
    }

    function getEquivalents(productId) {
        const p = getProduct(productId);
        if (!p) return [];
        return p.equivalentes.map(getProduct).filter(Boolean);
    }

    function suggestSubstitutes(productId, opts = {}) {
        const p = getProduct(productId);
        if (!p) return [];
        const onlyInStock = opts.onlyInStock !== false;
        return getEquivalents(productId).filter(e => !onlyInStock || e.stock > 0);
    }

    // =====================================================================
    // 6. CORTES POR MEDIDA (cable, tubo, cadena, manguera...)
    // =====================================================================
    function calcCorte(productId, cantidadSolicitada, unidadSolicitada) {
        const p = getProduct(productId);
        if (!p) return null;
        const unidadVenta = p.unidadVenta;
        const unidadNorm = normalizeUnit(unidadSolicitada) || unidadSolicitada;

        let cantidadEnUnidadVenta = Number(cantidadSolicitada);
        if (unidadNorm && unidadNorm !== unidadVenta) {
            try {
                cantidadEnUnidadVenta = convert(cantidadSolicitada, unidadNorm, unidadVenta);
            } catch (_) {
                return { error: `No se puede convertir ${unidadSolicitada} a ${unidadVenta}` };
            }
        }

        const precioUnit = getPriceForQty(productId, cantidadEnUnidadVenta);
        return {
            producto: p.id,
            cantidadOriginal: Number(cantidadSolicitada),
            unidadOriginal: unidadSolicitada,
            cantidadFacturable: +cantidadEnUnidadVenta.toFixed(4),
            unidadFacturable: unidadVenta,
            precioUnitario: precioUnit,
            total: +(precioUnit * cantidadEnUnidadVenta).toFixed(2),
        };
    }

    // =====================================================================
    // 7. STOCK
    // =====================================================================
    function adjustStock(productId, delta) {
        const p = getProduct(productId);
        if (!p) return null;
        p.stock = +(p.stock + Number(delta)).toFixed(4);
        return p.stock;
    }

    function lowStockReport(threshold = 5) {
        return listProducts().filter(p => p.stock <= threshold);
    }

    // =====================================================================
    // 8. PERSISTENCIA (localStorage opcional)
    // =====================================================================
    const STORAGE_KEY = 'volvix.ferreteria.catalog';

    function saveToStorage() {
        try {
            const data = JSON.stringify(listProducts());
            if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, data);
            return true;
        } catch (e) { return false; }
    }

    function loadFromStorage() {
        try {
            if (!global.localStorage) return false;
            const raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const arr = JSON.parse(raw);
            _products.clear();
            arr.forEach(addProduct);
            return true;
        } catch (e) { return false; }
    }

    function exportJSON() {
        return JSON.stringify(listProducts(), null, 2);
    }

    function importJSON(json) {
        const arr = typeof json === 'string' ? JSON.parse(json) : json;
        if (!Array.isArray(arr)) throw new Error('Se esperaba un array');
        _products.clear();
        arr.forEach(addProduct);
        return _products.size;
    }

    function clearCatalog() { _products.clear(); }

    // =====================================================================
    // 9. API PÚBLICA
    // =====================================================================
    const FerreteriaAPI = {
        version: '1.0.0',

        // medidas
        convert,
        parseMeasurement,
        formatMeasurement,
        normalizeUnit,
        UNIT_TO_MM,

        // productos
        addProduct,
        updateProduct,
        removeProduct,
        getProduct,
        listProducts,
        clearCatalog,

        // códigos múltiples
        findByCode,
        findByCodeType,
        searchProducts,
        addCode,

        // mayoreo
        getPriceForQty,
        calcLineTotal,
        nextTierInfo,

        // equivalentes
        addEquivalent,
        getEquivalents,
        suggestSubstitutes,

        // cortes
        calcCorte,

        // stock
        adjustStock,
        lowStockReport,

        // persistencia
        saveToStorage,
        loadFromStorage,
        exportJSON,
        importJSON,
    };

    global.FerreteriaAPI = FerreteriaAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = FerreteriaAPI;
})(typeof window !== 'undefined' ? window : globalThis);
