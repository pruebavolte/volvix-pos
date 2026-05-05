/**
 * volvix-workflow-restock.js
 * Workflow de Restock Automático para Volvix POS
 *
 * Funcionalidades:
 *  - Detección de productos con bajo stock (umbrales dinámicos / fijos)
 *  - Sugerencia de cantidades óptimas usando EOQ (Economic Order Quantity)
 *  - Generación de Purchase Orders (PO) por proveedor
 *  - Tracking de PO (estados: draft, sent, partial, received, cancelled)
 *  - Persistencia en localStorage + hooks para Supabase
 *  - Eventos pub/sub para integración con otros módulos (UI, notificaciones)
 *
 * Expone: window.RestockWorkflow
 */
(function (global) {
    'use strict';

    // ============================================================
    // CONFIGURACIÓN POR DEFECTO
    // ============================================================
    const DEFAULT_CONFIG = {
        // Umbral de bajo stock (si no hay reorderPoint definido en el producto)
        defaultLowStockThreshold: 5,
        // Días de cobertura objetivo cuando no hay datos de demanda
        defaultCoverageDays: 14,
        // Costo de orden por compra (S) — usado en EOQ
        orderingCost: 50,
        // Tasa de costo de mantener inventario anual (H = h * costo_unit)
        holdingCostRate: 0.25,
        // Lead time por defecto (días) si proveedor no especifica
        defaultLeadTimeDays: 7,
        // Stock de seguridad multiplicador sobre demanda en lead time
        safetyStockFactor: 1.5,
        // Storage keys
        storageKeyPOs: 'volvix_purchase_orders',
        storageKeyTracking: 'volvix_po_tracking',
        // Auto-persistir en cada cambio
        autoPersist: true
    };

    // ============================================================
    // EVENT BUS INTERNO
    // ============================================================
    const _listeners = {};
    function on(event, fn) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(fn);
        return () => off(event, fn);
    }
    function off(event, fn) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(f => f !== fn);
    }
    function emit(event, payload) {
        (_listeners[event] || []).forEach(fn => {
            try { fn(payload); } catch (e) { console.error('[Restock] listener error', e); }
        });
    }

    // ============================================================
    // ESTADO INTERNO
    // ============================================================
    const state = {
        config: { ...DEFAULT_CONFIG },
        purchaseOrders: [],   // Lista de PO generadas
        tracking: {},         // poId -> { status, history: [] }
        productsRef: null,    // función getter de productos
        suppliersRef: null,   // función getter de proveedores
        salesRef: null        // función getter de historial de ventas
    };

    // ============================================================
    // UTILIDADES
    // ============================================================
    function uid(prefix = 'PO') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    }

    function nowISO() { return new Date().toISOString(); }

    function safeParse(str, fallback) {
        try { return JSON.parse(str); } catch (e) { return fallback; }
    }

    function persist() {
        if (!state.config.autoPersist) return;
        try {
            localStorage.setItem(state.config.storageKeyPOs, JSON.stringify(state.purchaseOrders));
            localStorage.setItem(state.config.storageKeyTracking, JSON.stringify(state.tracking));
        } catch (e) {
            console.warn('[Restock] persist failed', e);
        }
    }

    function loadPersisted() {
        try {
            const pos = safeParse(localStorage.getItem(state.config.storageKeyPOs), []);
            const tr = safeParse(localStorage.getItem(state.config.storageKeyTracking), {});
            if (Array.isArray(pos)) state.purchaseOrders = pos;
            if (tr && typeof tr === 'object') state.tracking = tr;
        } catch (e) { /* ignore */ }
    }

    // ============================================================
    // CÁLCULOS DE DEMANDA
    // ============================================================
    /**
     * Estima demanda diaria promedio a partir del historial de ventas (últimos N días).
     * Si no hay datos, retorna 0.
     */
    function estimateDailyDemand(productId, days = 30) {
        const sales = (typeof state.salesRef === 'function') ? state.salesRef() : [];
        if (!Array.isArray(sales) || sales.length === 0) return 0;

        const cutoff = Date.now() - days * 86400000;
        let totalUnits = 0;
        for (const s of sales) {
            const ts = new Date(s.date || s.timestamp || s.createdAt || 0).getTime();
            if (ts < cutoff) continue;
            const items = s.items || s.lines || [];
            for (const it of items) {
                if ((it.productId || it.id) === productId) {
                    totalUnits += Number(it.qty || it.quantity || 0);
                }
            }
        }
        return totalUnits / days;
    }

    /**
     * EOQ = sqrt( (2 * D * S) / H )
     *  D: demanda anual
     *  S: costo de orden
     *  H: costo anual de mantener una unidad = unitCost * holdingCostRate
     */
    function calcEOQ(annualDemand, unitCost) {
        const S = state.config.orderingCost;
        const H = Math.max(0.0001, unitCost * state.config.holdingCostRate);
        if (annualDemand <= 0 || unitCost <= 0) return 0;
        return Math.ceil(Math.sqrt((2 * annualDemand * S) / H));
    }

    /**
     * Cantidad sugerida — combina EOQ + cobertura + safety stock.
     */
    function suggestQuantity(product) {
        const dailyDemand = estimateDailyDemand(product.id);
        const annualDemand = dailyDemand * 365;
        const unitCost = Number(product.cost || product.purchasePrice || 1);
        const leadTime = Number(product.leadTimeDays || state.config.defaultLeadTimeDays);

        const eoq = calcEOQ(annualDemand, unitCost);
        const safety = Math.ceil(dailyDemand * leadTime * state.config.safetyStockFactor);
        const coverage = Math.ceil(dailyDemand * state.config.defaultCoverageDays);

        // Tomamos el máximo entre EOQ y coverage+safety, descontando stock actual
        const target = Math.max(eoq, coverage + safety);
        const currentStock = Number(product.stock || 0);
        const suggested = Math.max(0, target - currentStock);

        return {
            suggested,
            eoq,
            safetyStock: safety,
            coverage,
            dailyDemand: Number(dailyDemand.toFixed(2)),
            leadTimeDays: leadTime
        };
    }

    // ============================================================
    // DETECCIÓN DE BAJO STOCK
    // ============================================================
    function getLowStockProducts() {
        const products = (typeof state.productsRef === 'function') ? state.productsRef() : [];
        if (!Array.isArray(products)) return [];
        const threshold = state.config.defaultLowStockThreshold;

        return products
            .filter(p => {
                const stock = Number(p.stock || 0);
                const reorder = Number(p.reorderPoint != null ? p.reorderPoint : threshold);
                return stock <= reorder && (p.active !== false);
            })
            .map(p => {
                const sug = suggestQuantity(p);
                return {
                    productId: p.id,
                    sku: p.sku || p.code || p.id,
                    name: p.name,
                    currentStock: Number(p.stock || 0),
                    reorderPoint: Number(p.reorderPoint != null ? p.reorderPoint : threshold),
                    supplierId: p.supplierId || p.providerId || null,
                    unitCost: Number(p.cost || p.purchasePrice || 0),
                    ...sug
                };
            });
    }

    // ============================================================
    // GENERACIÓN DE PURCHASE ORDERS
    // ============================================================
    /**
     * Agrupa los productos en bajo stock por proveedor y genera 1 PO por cada uno.
     * options: { dryRun, supplierFilter, includeProductIds }
     */
    function generatePurchaseOrders(options = {}) {
        const lowStock = getLowStockProducts();
        const suppliers = (typeof state.suppliersRef === 'function') ? state.suppliersRef() : [];
        const supplierMap = {};
        (suppliers || []).forEach(s => { supplierMap[s.id] = s; });

        // Agrupar por supplierId
        const groups = {};
        for (const item of lowStock) {
            if (options.includeProductIds && !options.includeProductIds.includes(item.productId)) continue;
            const sid = item.supplierId || '__unassigned__';
            if (options.supplierFilter && sid !== options.supplierFilter) continue;
            if (!groups[sid]) groups[sid] = [];
            if (item.suggested > 0) groups[sid].push(item);
        }

        const generated = [];
        for (const sid of Object.keys(groups)) {
            const items = groups[sid];
            if (items.length === 0) continue;

            const supplier = supplierMap[sid] || { id: sid, name: sid === '__unassigned__' ? 'Sin asignar' : sid };
            const subtotal = items.reduce((acc, it) => acc + it.suggested * it.unitCost, 0);
            const tax = subtotal * 0.16;
            const total = subtotal + tax;

            const po = {
                id: uid('PO'),
                createdAt: nowISO(),
                supplierId: supplier.id,
                supplierName: supplier.name,
                supplierEmail: supplier.email || null,
                status: 'draft',
                items: items.map(it => ({
                    productId: it.productId,
                    sku: it.sku,
                    name: it.name,
                    qty: it.suggested,
                    unitCost: it.unitCost,
                    lineTotal: Number((it.suggested * it.unitCost).toFixed(2)),
                    rationale: {
                        eoq: it.eoq,
                        safetyStock: it.safetyStock,
                        coverage: it.coverage,
                        dailyDemand: it.dailyDemand
                    }
                })),
                subtotal: Number(subtotal.toFixed(2)),
                tax: Number(tax.toFixed(2)),
                total: Number(total.toFixed(2)),
                expectedDeliveryDays: supplier.leadTimeDays || state.config.defaultLeadTimeDays
            };

            generated.push(po);
        }

        if (!options.dryRun) {
            generated.forEach(po => {
                state.purchaseOrders.push(po);
                state.tracking[po.id] = {
                    status: 'draft',
                    history: [{ status: 'draft', at: nowISO(), note: 'PO generada automáticamente' }]
                };
            });
            persist();
            emit('po:generated', { count: generated.length, orders: generated });
        }

        return generated;
    }

    // ============================================================
    // TRACKING DE PURCHASE ORDERS
    // ============================================================
    const VALID_STATUSES = ['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'];

    function updatePOStatus(poId, newStatus, note = '') {
        if (!VALID_STATUSES.includes(newStatus)) {
            throw new Error(`Estado inválido: ${newStatus}`);
        }
        const po = state.purchaseOrders.find(p => p.id === poId);
        if (!po) throw new Error(`PO no encontrada: ${poId}`);

        po.status = newStatus;
        po.updatedAt = nowISO();

        if (!state.tracking[poId]) {
            state.tracking[poId] = { status: newStatus, history: [] };
        }
        state.tracking[poId].status = newStatus;
        state.tracking[poId].history.push({ status: newStatus, at: nowISO(), note });

        persist();
        emit('po:status-changed', { poId, status: newStatus, note });
        return po;
    }

    function receivePO(poId, receivedItems = null) {
        const po = state.purchaseOrders.find(p => p.id === poId);
        if (!po) throw new Error(`PO no encontrada: ${poId}`);

        // receivedItems: [{ productId, qtyReceived }]
        const receipts = receivedItems || po.items.map(it => ({ productId: it.productId, qtyReceived: it.qty }));

        let allComplete = true;
        for (const r of receipts) {
            const line = po.items.find(it => it.productId === r.productId);
            if (!line) continue;
            line.qtyReceived = (line.qtyReceived || 0) + Number(r.qtyReceived || 0);
            if (line.qtyReceived < line.qty) allComplete = false;
        }

        const newStatus = allComplete ? 'received' : 'partial';
        updatePOStatus(poId, newStatus, `Recepción registrada: ${receipts.length} líneas`);

        emit('po:received', { poId, receipts, complete: allComplete });
        return po;
    }

    function getPO(poId) { return state.purchaseOrders.find(p => p.id === poId) || null; }
    function listPOs(filter = {}) {
        return state.purchaseOrders.filter(po => {
            if (filter.status && po.status !== filter.status) return false;
            if (filter.supplierId && po.supplierId !== filter.supplierId) return false;
            return true;
        });
    }
    function getTracking(poId) { return state.tracking[poId] || null; }

    function cancelPO(poId, reason = '') {
        return updatePOStatus(poId, 'cancelled', reason || 'Cancelada por usuario');
    }

    // ============================================================
    // EXPORTACIÓN / FORMATOS
    // ============================================================
    function poToText(po) {
        const lines = [];
        lines.push(`PURCHASE ORDER: ${po.id}`);
        lines.push(`Fecha: ${po.createdAt}`);
        lines.push(`Proveedor: ${po.supplierName}`);
        lines.push(`Estado: ${po.status}`);
        lines.push('-'.repeat(50));
        po.items.forEach(it => {
            lines.push(`${it.sku}\t${it.name}\t${it.qty} x $${it.unitCost} = $${it.lineTotal}`);
        });
        lines.push('-'.repeat(50));
        lines.push(`Subtotal: $${po.subtotal}`);
        lines.push(`IVA: $${po.tax}`);
        lines.push(`TOTAL: $${po.total}`);
        return lines.join('\n');
    }

    function poToCSV(po) {
        const header = 'SKU,Producto,Cantidad,CostoUnit,Total\n';
        const rows = po.items.map(it =>
            `${it.sku},"${it.name}",${it.qty},${it.unitCost},${it.lineTotal}`
        ).join('\n');
        return header + rows;
    }

    // ============================================================
    // EJECUCIÓN COMPLETA DEL WORKFLOW
    // ============================================================
    function runWorkflow(options = {}) {
        emit('workflow:start', { at: nowISO() });
        const lowStock = getLowStockProducts();
        emit('workflow:low-stock-detected', { count: lowStock.length, items: lowStock });

        const orders = generatePurchaseOrders(options);
        emit('workflow:complete', {
            at: nowISO(),
            lowStockCount: lowStock.length,
            ordersGenerated: orders.length,
            orders
        });

        return { lowStock, orders };
    }

    // ============================================================
    // CONFIGURACIÓN E INICIALIZACIÓN
    // ============================================================
    function configure(opts = {}) {
        Object.assign(state.config, opts);
        if (opts.products) state.productsRef = typeof opts.products === 'function' ? opts.products : () => opts.products;
        if (opts.suppliers) state.suppliersRef = typeof opts.suppliers === 'function' ? opts.suppliers : () => opts.suppliers;
        if (opts.sales) state.salesRef = typeof opts.sales === 'function' ? opts.sales : () => opts.sales;
        emit('configured', { config: { ...state.config } });
    }

    function reset() {
        state.purchaseOrders = [];
        state.tracking = {};
        persist();
        emit('reset', {});
    }

    function getStats() {
        const byStatus = {};
        state.purchaseOrders.forEach(po => {
            byStatus[po.status] = (byStatus[po.status] || 0) + 1;
        });
        const totalValue = state.purchaseOrders.reduce((acc, po) => acc + (po.total || 0), 0);
        return {
            totalPOs: state.purchaseOrders.length,
            byStatus,
            totalValue: Number(totalValue.toFixed(2))
        };
    }

    // Init
    loadPersisted();

    // ============================================================
    // API PÚBLICA
    // ============================================================
    global.RestockWorkflow = {
        // Configuración
        configure,
        getConfig: () => ({ ...state.config }),

        // Detección y sugerencias
        getLowStockProducts,
        suggestQuantity,
        estimateDailyDemand,
        calcEOQ,

        // Generación de PO
        generatePurchaseOrders,
        runWorkflow,

        // Tracking
        updatePOStatus,
        receivePO,
        cancelPO,
        getPO,
        listPOs,
        getTracking,
        VALID_STATUSES: [...VALID_STATUSES],

        // Export
        poToText,
        poToCSV,

        // Stats / utils
        getStats,
        reset,

        // Eventos
        on, off,

        // Versión
        version: '1.0.0'
    };

    console.log('[RestockWorkflow] v1.0.0 cargado. Usa window.RestockWorkflow');
})(typeof window !== 'undefined' ? window : this);
