/**
 * VOLVIX POS - Vertical Pescadería / Marisquería
 * Módulo especializado para venta de pescados frescos, mariscos,
 * fileteado al momento, y manejo de cadena de frío con gel/hielo.
 *
 * Expone: window.PescaderiaAPI
 */
(function (global) {
    'use strict';

    // ──────────────────────────────────────────────────────────────
    // Catálogo base de productos típicos de pescadería
    // ──────────────────────────────────────────────────────────────
    const CATALOGO_PESCADOS = [
        { sku: 'PSC-001', nombre: 'Huachinango entero',   precioKg: 280, stockKg: 25, frescura: 'A', origen: 'Veracruz' },
        { sku: 'PSC-002', nombre: 'Robalo entero',        precioKg: 320, stockKg: 18, frescura: 'A', origen: 'Tampico' },
        { sku: 'PSC-003', nombre: 'Mojarra tilapia',      precioKg: 95,  stockKg: 60, frescura: 'A', origen: 'Granja' },
        { sku: 'PSC-004', nombre: 'Sierra fresca',        precioKg: 140, stockKg: 30, frescura: 'B', origen: 'Mazatlán' },
        { sku: 'PSC-005', nombre: 'Atún aleta amarilla',  precioKg: 380, stockKg: 12, frescura: 'A', origen: 'Ensenada' },
        { sku: 'PSC-006', nombre: 'Salmón noruego',       precioKg: 520, stockKg: 15, frescura: 'A', origen: 'Importado' },
        { sku: 'PSC-007', nombre: 'Bacalao fresco',       precioKg: 460, stockKg: 8,  frescura: 'A', origen: 'Importado' },
        { sku: 'PSC-008', nombre: 'Pargo rojo',           precioKg: 260, stockKg: 22, frescura: 'A', origen: 'Yucatán' }
    ];

    const CATALOGO_MARISCOS = [
        { sku: 'MAR-001', nombre: 'Camarón U-15 jumbo',   precioKg: 540, stockKg: 20, vivo: false },
        { sku: 'MAR-002', nombre: 'Camarón mediano 21/25',precioKg: 320, stockKg: 35, vivo: false },
        { sku: 'MAR-003', nombre: 'Pulpo fresco',         precioKg: 380, stockKg: 14, vivo: false },
        { sku: 'MAR-004', nombre: 'Calamar limpio',       precioKg: 180, stockKg: 18, vivo: false },
        { sku: 'MAR-005', nombre: 'Ostión en concha',     precioPz: 12,  stockPz: 200, vivo: true  },
        { sku: 'MAR-006', nombre: 'Almeja chocolata',     precioKg: 160, stockKg: 16, vivo: true  },
        { sku: 'MAR-007', nombre: 'Mejillón fresco',      precioKg: 140, stockKg: 12, vivo: true  },
        { sku: 'MAR-008', nombre: 'Jaiba azul',           precioPz: 35,  stockPz: 80,  vivo: true  },
        { sku: 'MAR-009', nombre: 'Langostino',           precioKg: 480, stockKg: 10, vivo: false }
    ];

    const SERVICIOS_FILETEADO = [
        { id: 'FIL-01', nombre: 'Fileteado simple',        cargoKg: 15, tiempoMin: 4 },
        { id: 'FIL-02', nombre: 'Fileteado sin piel',      cargoKg: 25, tiempoMin: 6 },
        { id: 'FIL-03', nombre: 'Rodajas (steaks)',        cargoKg: 18, tiempoMin: 5 },
        { id: 'FIL-04', nombre: 'Eviscerado y escamado',   cargoKg: 10, tiempoMin: 3 },
        { id: 'FIL-05', nombre: 'Mariposeado (butterfly)', cargoKg: 22, tiempoMin: 5 },
        { id: 'FIL-06', nombre: 'Pelado de camarón',       cargoKg: 30, tiempoMin: 7 },
        { id: 'FIL-07', nombre: 'Limpieza de pulpo',       cargoKg: 35, tiempoMin: 8 }
    ];

    const EMPAQUE_FRIO = [
        { id: 'GEL-S', nombre: 'Gel refrigerante chico',  precio: 8,  duracionH: 2  },
        { id: 'GEL-M', nombre: 'Gel refrigerante mediano',precio: 15, duracionH: 4  },
        { id: 'GEL-L', nombre: 'Gel refrigerante grande', precio: 25, duracionH: 6  },
        { id: 'HIE-1', nombre: 'Bolsa hielo 1 kg',        precio: 12, duracionH: 1.5 },
        { id: 'HIE-3', nombre: 'Bolsa hielo 3 kg',        precio: 28, duracionH: 4  },
        { id: 'UNI-1', nombre: 'Bolsa térmica unicel',    precio: 18, duracionH: 3  },
        { id: 'CAJ-1', nombre: 'Caja térmica 5 L',        precio: 65, duracionH: 8  }
    ];

    // ──────────────────────────────────────────────────────────────
    // Estado de la venta en curso
    // ──────────────────────────────────────────────────────────────
    let ventaActual = {
        id: null,
        items: [],
        servicios: [],
        empaque: [],
        cliente: null,
        creadaEn: null
    };

    function nuevaVenta() {
        ventaActual = {
            id: 'VTA-' + Date.now(),
            items: [],
            servicios: [],
            empaque: [],
            cliente: null,
            creadaEn: new Date().toISOString()
        };
        return ventaActual.id;
    }

    // ──────────────────────────────────────────────────────────────
    // Búsqueda de productos
    // ──────────────────────────────────────────────────────────────
    function buscarProducto(sku) {
        return [...CATALOGO_PESCADOS, ...CATALOGO_MARISCOS]
            .find(p => p.sku === sku) || null;
    }

    function buscarPorNombre(texto) {
        const q = (texto || '').toLowerCase();
        return [...CATALOGO_PESCADOS, ...CATALOGO_MARISCOS]
            .filter(p => p.nombre.toLowerCase().includes(q));
    }

    // ──────────────────────────────────────────────────────────────
    // Cálculo de precio por peso (báscula)
    // ──────────────────────────────────────────────────────────────
    function calcularPrecioKg(sku, kg) {
        const p = buscarProducto(sku);
        if (!p) throw new Error('SKU no encontrado: ' + sku);
        if (kg <= 0) throw new Error('Peso debe ser mayor a 0');
        if (p.precioKg == null) throw new Error('Producto se vende por pieza, no por kg');
        if (kg > p.stockKg) throw new Error(`Stock insuficiente. Disponible: ${p.stockKg} kg`);
        return Math.round(p.precioKg * kg * 100) / 100;
    }

    function calcularPrecioPz(sku, piezas) {
        const p = buscarProducto(sku);
        if (!p) throw new Error('SKU no encontrado: ' + sku);
        if (piezas <= 0 || !Number.isInteger(piezas)) throw new Error('Piezas debe ser entero positivo');
        if (p.precioPz == null) throw new Error('Producto se vende por kg, no por pieza');
        if (piezas > p.stockPz) throw new Error(`Stock insuficiente. Disponible: ${p.stockPz} pz`);
        return p.precioPz * piezas;
    }

    // ──────────────────────────────────────────────────────────────
    // Agregar al ticket
    // ──────────────────────────────────────────────────────────────
    function agregarPesoKg(sku, kg) {
        if (!ventaActual.id) nuevaVenta();
        const p = buscarProducto(sku);
        const subtotal = calcularPrecioKg(sku, kg);
        ventaActual.items.push({
            sku, nombre: p.nombre, tipo: 'kg',
            cantidad: kg, precioUnit: p.precioKg, subtotal,
            frescura: p.frescura
        });
        return subtotal;
    }

    function agregarPiezas(sku, piezas) {
        if (!ventaActual.id) nuevaVenta();
        const p = buscarProducto(sku);
        const subtotal = calcularPrecioPz(sku, piezas);
        ventaActual.items.push({
            sku, nombre: p.nombre, tipo: 'pz',
            cantidad: piezas, precioUnit: p.precioPz, subtotal,
            vivo: p.vivo || false
        });
        return subtotal;
    }

    function agregarFileteado(idServicio, kgAplicados) {
        const s = SERVICIOS_FILETEADO.find(x => x.id === idServicio);
        if (!s) throw new Error('Servicio no encontrado: ' + idServicio);
        const cargo = Math.round(s.cargoKg * kgAplicados * 100) / 100;
        ventaActual.servicios.push({
            id: s.id, nombre: s.nombre, kg: kgAplicados,
            cargo, tiempoMin: s.tiempoMin
        });
        return cargo;
    }

    function agregarEmpaqueFrio(idEmpaque, cantidad = 1) {
        const e = EMPAQUE_FRIO.find(x => x.id === idEmpaque);
        if (!e) throw new Error('Empaque no encontrado: ' + idEmpaque);
        const subtotal = e.precio * cantidad;
        ventaActual.empaque.push({
            id: e.id, nombre: e.nombre, cantidad,
            subtotal, duracionH: e.duracionH
        });
        return subtotal;
    }

    // ──────────────────────────────────────────────────────────────
    // Recomendación inteligente de gel/hielo según traslado
    // ──────────────────────────────────────────────────────────────
    function recomendarFrio(horasTraslado, kgTotales) {
        if (horasTraslado <= 0) return [];
        const candidatos = EMPAQUE_FRIO
            .filter(e => e.duracionH >= horasTraslado)
            .sort((a, b) => a.precio - b.precio);
        if (candidatos.length === 0) {
            return [{ id: 'CAJ-1', cantidad: Math.ceil(kgTotales / 5), motivo: 'traslado largo' }];
        }
        const elegido = candidatos[0];
        const cant = Math.max(1, Math.ceil(kgTotales / 3));
        return [{ id: elegido.id, cantidad: cant, motivo: `cubre ${elegido.duracionH}h` }];
    }

    // ──────────────────────────────────────────────────────────────
    // Totales y cierre
    // ──────────────────────────────────────────────────────────────
    function calcularTotales() {
        const subItems    = ventaActual.items.reduce((a, x) => a + x.subtotal, 0);
        const subServ     = ventaActual.servicios.reduce((a, x) => a + x.cargo, 0);
        const subEmp      = ventaActual.empaque.reduce((a, x) => a + x.subtotal, 0);
        const subtotal    = subItems + subServ + subEmp;
        const iva         = Math.round(subtotal * 0.16 * 100) / 100;
        const total       = Math.round((subtotal + iva) * 100) / 100;
        const kgTotales   = ventaActual.items
            .filter(i => i.tipo === 'kg')
            .reduce((a, x) => a + x.cantidad, 0);
        return { subItems, subServ, subEmp, subtotal, iva, total, kgTotales };
    }

    function cerrarVenta(metodoPago = 'efectivo') {
        if (!ventaActual.id) throw new Error('No hay venta activa');
        if (ventaActual.items.length === 0) throw new Error('Ticket vacío');
        const totales = calcularTotales();
        // Descuenta stock
        ventaActual.items.forEach(it => {
            const p = buscarProducto(it.sku);
            if (it.tipo === 'kg') p.stockKg -= it.cantidad;
            else p.stockPz -= it.cantidad;
        });
        const ticket = {
            ...ventaActual,
            totales,
            metodoPago,
            cerradaEn: new Date().toISOString()
        };
        nuevaVenta();
        return ticket;
    }

    // ──────────────────────────────────────────────────────────────
    // Reportes rápidos
    // ──────────────────────────────────────────────────────────────
    function stockBajo(umbralKg = 10, umbralPz = 30) {
        const bajo = [];
        CATALOGO_PESCADOS.forEach(p => {
            if (p.stockKg < umbralKg) bajo.push({ sku: p.sku, nombre: p.nombre, stock: p.stockKg + ' kg' });
        });
        CATALOGO_MARISCOS.forEach(p => {
            if (p.precioKg && p.stockKg < umbralKg) bajo.push({ sku: p.sku, nombre: p.nombre, stock: p.stockKg + ' kg' });
            if (p.precioPz && p.stockPz < umbralPz) bajo.push({ sku: p.sku, nombre: p.nombre, stock: p.stockPz + ' pz' });
        });
        return bajo;
    }

    function alertaFrescura() {
        return CATALOGO_PESCADOS
            .filter(p => p.frescura !== 'A')
            .map(p => ({ sku: p.sku, nombre: p.nombre, frescura: p.frescura, accion: 'venta prioritaria / descuento' }));
    }

    // ──────────────────────────────────────────────────────────────
    // API pública
    // ──────────────────────────────────────────────────────────────
    global.PescaderiaAPI = {
        // catálogos
        catalogoPescados: () => [...CATALOGO_PESCADOS],
        catalogoMariscos: () => [...CATALOGO_MARISCOS],
        catalogoFileteado: () => [...SERVICIOS_FILETEADO],
        catalogoEmpaque: () => [...EMPAQUE_FRIO],
        // búsqueda
        buscarProducto,
        buscarPorNombre,
        // venta
        nuevaVenta,
        ventaActual: () => ({ ...ventaActual }),
        agregarPesoKg,
        agregarPiezas,
        agregarFileteado,
        agregarEmpaqueFrio,
        calcularPrecioKg,
        calcularPrecioPz,
        calcularTotales,
        cerrarVenta,
        // utilidades
        recomendarFrio,
        stockBajo,
        alertaFrescura,
        version: '1.0.0'
    };

    if (typeof console !== 'undefined') {
        console.log('[Volvix] Vertical Pescadería cargado. window.PescaderiaAPI listo.');
    }

})(typeof window !== 'undefined' ? window : globalThis);
