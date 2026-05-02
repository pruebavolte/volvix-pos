/**
 * volvix-vertical-ropa.js
 * Módulo vertical Volvix POS — Tienda de Ropa
 *
 * Funcionalidades:
 *  - Matriz talla x color (variantes SKU)
 *  - Stock por variante
 *  - Probador (fitting room) con reservas temporales
 *  - Devoluciones con motivos y reposición de stock
 *  - Temporadas (primavera/verano/otoño/invierno) y rebajas
 *  - Etiquetado, códigos de barra por variante
 *  - Historial de tickets, ventas por talla/color
 *
 * Expone: window.RopaAPI
 */
(function (global) {
    'use strict';

    // ────────────────────────────────────────────────────────────
    // Constantes
    // ────────────────────────────────────────────────────────────
    const TALLAS_ROPA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    const TALLAS_PANTALON = ['26', '28', '30', '32', '34', '36', '38', '40', '42', '44'];
    const TALLAS_CALZADO = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
    const TALLAS_INFANTIL = ['0-3M', '3-6M', '6-12M', '1A', '2A', '3A', '4A', '5A', '6A', '8A', '10A', '12A', '14A'];

    const COLORES_BASICOS = [
        { id: 'NEG', nombre: 'Negro', hex: '#000000' },
        { id: 'BLA', nombre: 'Blanco', hex: '#FFFFFF' },
        { id: 'GRI', nombre: 'Gris', hex: '#808080' },
        { id: 'AZU', nombre: 'Azul', hex: '#1E3A8A' },
        { id: 'AZM', nombre: 'Azul Marino', hex: '#0B1F4A' },
        { id: 'ROJ', nombre: 'Rojo', hex: '#DC2626' },
        { id: 'VER', nombre: 'Verde', hex: '#16A34A' },
        { id: 'AMA', nombre: 'Amarillo', hex: '#FACC15' },
        { id: 'ROS', nombre: 'Rosa', hex: '#EC4899' },
        { id: 'BEI', nombre: 'Beige', hex: '#D6C7A6' },
        { id: 'CAF', nombre: 'Café', hex: '#7C4A2A' },
        { id: 'MOR', nombre: 'Morado', hex: '#7C3AED' }
    ];

    const TEMPORADAS = {
        PRIMAVERA: { id: 'PRI', nombre: 'Primavera', meses: [3, 4, 5] },
        VERANO:    { id: 'VER', nombre: 'Verano',    meses: [6, 7, 8] },
        OTONO:     { id: 'OTO', nombre: 'Otoño',     meses: [9, 10, 11] },
        INVIERNO:  { id: 'INV', nombre: 'Invierno',  meses: [12, 1, 2] }
    };

    const MOTIVOS_DEVOLUCION = [
        { id: 'TALLA',     nombre: 'Talla incorrecta',       reembolso: true,  reponeStock: true  },
        { id: 'DEFECTO',   nombre: 'Producto defectuoso',    reembolso: true,  reponeStock: false },
        { id: 'NO_GUSTA',  nombre: 'No le gustó',            reembolso: true,  reponeStock: true  },
        { id: 'COLOR',     nombre: 'Color distinto',         reembolso: true,  reponeStock: true  },
        { id: 'CAMBIO',    nombre: 'Cambio por otra prenda', reembolso: false, reponeStock: true  },
        { id: 'REGALO',    nombre: 'Regalo no deseado',      reembolso: true,  reponeStock: true  }
    ];

    const RESERVA_PROBADOR_MIN = 15; // minutos

    // ────────────────────────────────────────────────────────────
    // Estado interno
    // ────────────────────────────────────────────────────────────
    const _state = {
        productos: new Map(),     // id -> producto
        variantes: new Map(),     // sku -> variante
        probadores: new Map(),    // numero -> { items, abierto, ts }
        devoluciones: [],
        ventas: [],
        rebajas: new Map(),       // productoId -> { porcentaje, hasta }
        contadorSku: 1000,
        contadorTicket: 1
    };

    // ────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────
    const _now = () => new Date();
    const _ts = () => Date.now();

    function _generarSku(productoId, talla, colorId) {
        return `${productoId}-${talla}-${colorId}`;
    }

    function _temporadaActual() {
        const m = _now().getMonth() + 1;
        for (const k in TEMPORADAS) {
            if (TEMPORADAS[k].meses.includes(m)) return TEMPORADAS[k];
        }
        return TEMPORADAS.PRIMAVERA;
    }

    function _validarTalla(talla, tipo) {
        const tablas = {
            ropa: TALLAS_ROPA,
            pantalon: TALLAS_PANTALON,
            calzado: TALLAS_CALZADO,
            infantil: TALLAS_INFANTIL
        };
        return (tablas[tipo] || TALLAS_ROPA).includes(String(talla).toUpperCase());
    }

    // ────────────────────────────────────────────────────────────
    // Productos & Matriz Talla x Color
    // ────────────────────────────────────────────────────────────
    function crearProducto(opts) {
        if (!opts || !opts.nombre) throw new Error('Producto requiere nombre');
        const id = opts.id || `P${_state.contadorSku++}`;
        const producto = {
            id,
            nombre: opts.nombre,
            tipo: opts.tipo || 'ropa', // ropa | pantalon | calzado | infantil
            categoria: opts.categoria || 'general',
            marca: opts.marca || 'sin-marca',
            precio: Number(opts.precio || 0),
            costo: Number(opts.costo || 0),
            temporada: opts.temporada || _temporadaActual().id,
            genero: opts.genero || 'unisex', // hombre | mujer | unisex | nino | nina
            descripcion: opts.descripcion || '',
            imagenes: opts.imagenes || [],
            tallas: opts.tallas || TALLAS_ROPA.slice(0, 5),
            colores: opts.colores || COLORES_BASICOS.slice(0, 3),
            creadoEn: _ts(),
            activo: true
        };
        _state.productos.set(id, producto);
        _generarMatrizVariantes(producto, opts.stockInicial || 0);
        return producto;
    }

    function _generarMatrizVariantes(producto, stockInicial) {
        producto.tallas.forEach(t => {
            producto.colores.forEach(c => {
                const sku = _generarSku(producto.id, t, c.id);
                if (!_state.variantes.has(sku)) {
                    _state.variantes.set(sku, {
                        sku,
                        productoId: producto.id,
                        talla: t,
                        color: c,
                        stock: Number(stockInicial) || 0,
                        reservado: 0,
                        codigoBarras: _codigoBarras(sku),
                        ventas: 0
                    });
                }
            });
        });
    }

    function _codigoBarras(sku) {
        // pseudo EAN-13 determinista
        let h = 0;
        for (let i = 0; i < sku.length; i++) h = (h * 31 + sku.charCodeAt(i)) >>> 0;
        return String(h).padStart(12, '0').slice(0, 12) + '0';
    }

    function obtenerMatriz(productoId) {
        const p = _state.productos.get(productoId);
        if (!p) return null;
        const matriz = { producto: p, filas: [] };
        p.tallas.forEach(t => {
            const fila = { talla: t, columnas: [] };
            p.colores.forEach(c => {
                const v = _state.variantes.get(_generarSku(p.id, t, c.id));
                fila.columnas.push({
                    color: c,
                    sku: v ? v.sku : null,
                    stock: v ? v.stock : 0,
                    reservado: v ? v.reservado : 0,
                    disponible: v ? Math.max(0, v.stock - v.reservado) : 0
                });
            });
            matriz.filas.push(fila);
        });
        return matriz;
    }

    function ajustarStock(sku, delta, motivo) {
        const v = _state.variantes.get(sku);
        if (!v) throw new Error(`SKU ${sku} no existe`);
        v.stock = Math.max(0, v.stock + Number(delta));
        v.ultimoAjuste = { delta, motivo: motivo || 'manual', ts: _ts() };
        return v;
    }

    function buscarPorCodigoBarras(cb) {
        for (const v of _state.variantes.values()) {
            if (v.codigoBarras === cb) return v;
        }
        return null;
    }

    // ────────────────────────────────────────────────────────────
    // Probador (Fitting Room)
    // ────────────────────────────────────────────────────────────
    function abrirProbador(numero, cliente) {
        if (_state.probadores.has(numero) && _state.probadores.get(numero).abierto) {
            throw new Error(`Probador ${numero} ya está ocupado`);
        }
        const p = {
            numero,
            cliente: cliente || 'anónimo',
            items: [],
            abierto: true,
            abiertoEn: _ts(),
            expiraEn: _ts() + RESERVA_PROBADOR_MIN * 60000
        };
        _state.probadores.set(numero, p);
        return p;
    }

    function llevarAProbador(numero, sku, cantidad) {
        const p = _state.probadores.get(numero);
        if (!p || !p.abierto) throw new Error(`Probador ${numero} no abierto`);
        const v = _state.variantes.get(sku);
        if (!v) throw new Error(`SKU ${sku} no existe`);
        const c = Number(cantidad) || 1;
        if (v.stock - v.reservado < c) throw new Error(`Stock insuficiente para ${sku}`);
        v.reservado += c;
        p.items.push({ sku, cantidad: c, ts: _ts() });
        return p;
    }

    function cerrarProbador(numero, comprados) {
        const p = _state.probadores.get(numero);
        if (!p) throw new Error(`Probador ${numero} no existe`);
        const compradosSet = new Set((comprados || []).map(x => x.sku));
        // liberar reservas
        p.items.forEach(it => {
            const v = _state.variantes.get(it.sku);
            if (v) v.reservado = Math.max(0, v.reservado - it.cantidad);
        });
        p.abierto = false;
        p.cerradoEn = _ts();
        p.comprados = comprados || [];
        return p;
    }

    function purgarProbadoresExpirados() {
        const ahora = _ts();
        const liberados = [];
        for (const p of _state.probadores.values()) {
            if (p.abierto && p.expiraEn < ahora) {
                cerrarProbador(p.numero, []);
                liberados.push(p.numero);
            }
        }
        return liberados;
    }

    // ────────────────────────────────────────────────────────────
    // Rebajas y Temporadas
    // ────────────────────────────────────────────────────────────
    function aplicarRebaja(productoId, porcentaje, hastaTs) {
        if (!_state.productos.has(productoId)) throw new Error('Producto no existe');
        if (porcentaje <= 0 || porcentaje >= 100) throw new Error('Porcentaje inválido');
        _state.rebajas.set(productoId, {
            porcentaje: Number(porcentaje),
            hasta: hastaTs || (_ts() + 30 * 86400000)
        });
    }

    function quitarRebaja(productoId) {
        _state.rebajas.delete(productoId);
    }

    function precioFinal(productoId) {
        const p = _state.productos.get(productoId);
        if (!p) return 0;
        const r = _state.rebajas.get(productoId);
        if (r && r.hasta > _ts()) {
            return Number((p.precio * (1 - r.porcentaje / 100)).toFixed(2));
        }
        return p.precio;
    }

    function productosPorTemporada(temporadaId) {
        return Array.from(_state.productos.values()).filter(p => p.temporada === temporadaId);
    }

    function liquidarTemporadaAnterior(porcentaje) {
        const actual = _temporadaActual().id;
        let n = 0;
        for (const p of _state.productos.values()) {
            if (p.temporada !== actual) {
                aplicarRebaja(p.id, porcentaje || 40, _ts() + 60 * 86400000);
                n++;
            }
        }
        return n;
    }

    // ────────────────────────────────────────────────────────────
    // Ventas
    // ────────────────────────────────────────────────────────────
    function registrarVenta(items, opts) {
        if (!Array.isArray(items) || items.length === 0) throw new Error('Sin items');
        const ticketId = `T${String(_state.contadorTicket++).padStart(6, '0')}`;
        let total = 0;
        const detalle = [];
        for (const it of items) {
            const v = _state.variantes.get(it.sku);
            if (!v) throw new Error(`SKU ${it.sku} no existe`);
            const c = Number(it.cantidad) || 1;
            if (v.stock < c) throw new Error(`Sin stock para ${it.sku}`);
            v.stock -= c;
            v.ventas += c;
            const pu = precioFinal(v.productoId);
            const sub = pu * c;
            total += sub;
            detalle.push({ sku: v.sku, productoId: v.productoId, cantidad: c, precioUnit: pu, subtotal: sub });
        }
        const venta = {
            ticketId,
            ts: _ts(),
            items: detalle,
            total: Number(total.toFixed(2)),
            cliente: (opts && opts.cliente) || 'mostrador',
            metodoPago: (opts && opts.metodoPago) || 'efectivo',
            cajero: (opts && opts.cajero) || 'sistema'
        };
        _state.ventas.push(venta);
        return venta;
    }

    // ────────────────────────────────────────────────────────────
    // Devoluciones
    // ────────────────────────────────────────────────────────────
    function registrarDevolucion(ticketId, items, motivoId) {
        const venta = _state.ventas.find(v => v.ticketId === ticketId);
        if (!venta) throw new Error('Ticket no encontrado');
        const motivo = MOTIVOS_DEVOLUCION.find(m => m.id === motivoId);
        if (!motivo) throw new Error('Motivo inválido');
        let reembolso = 0;
        const detalle = [];
        for (const it of items) {
            const orig = venta.items.find(x => x.sku === it.sku);
            if (!orig) throw new Error(`SKU ${it.sku} no estaba en ticket`);
            const c = Math.min(Number(it.cantidad) || 1, orig.cantidad);
            const sub = orig.precioUnit * c;
            if (motivo.reembolso) reembolso += sub;
            if (motivo.reponeStock) {
                const v = _state.variantes.get(it.sku);
                if (v) v.stock += c;
            }
            detalle.push({ sku: it.sku, cantidad: c, subtotal: sub });
        }
        const dev = {
            id: `DEV${_state.devoluciones.length + 1}`,
            ticketId,
            ts: _ts(),
            motivo,
            items: detalle,
            reembolso: Number(reembolso.toFixed(2))
        };
        _state.devoluciones.push(dev);
        return dev;
    }

    // ────────────────────────────────────────────────────────────
    // Reportes
    // ────────────────────────────────────────────────────────────
    function reporteVentasPorTalla() {
        const map = {};
        for (const v of _state.ventas) {
            for (const it of v.items) {
                const variante = _state.variantes.get(it.sku);
                if (!variante) continue;
                const t = variante.talla;
                map[t] = (map[t] || 0) + it.cantidad;
            }
        }
        return map;
    }

    function reporteVentasPorColor() {
        const map = {};
        for (const v of _state.ventas) {
            for (const it of v.items) {
                const variante = _state.variantes.get(it.sku);
                if (!variante) continue;
                const c = variante.color.nombre;
                map[c] = (map[c] || 0) + it.cantidad;
            }
        }
        return map;
    }

    function bajoStock(umbral) {
        const u = Number(umbral) || 3;
        return Array.from(_state.variantes.values()).filter(v => v.stock <= u);
    }

    function totalInventario() {
        let unidades = 0, valorCosto = 0, valorVenta = 0;
        for (const v of _state.variantes.values()) {
            const p = _state.productos.get(v.productoId);
            if (!p) continue;
            unidades += v.stock;
            valorCosto += v.stock * p.costo;
            valorVenta += v.stock * precioFinal(p.id);
        }
        return {
            unidades,
            valorCosto: Number(valorCosto.toFixed(2)),
            valorVenta: Number(valorVenta.toFixed(2))
        };
    }

    // ────────────────────────────────────────────────────────────
    // API pública
    // ────────────────────────────────────────────────────────────
    const RopaAPI = {
        // constantes
        TALLAS_ROPA, TALLAS_PANTALON, TALLAS_CALZADO, TALLAS_INFANTIL,
        COLORES_BASICOS, TEMPORADAS, MOTIVOS_DEVOLUCION,

        // productos
        crearProducto,
        obtenerProducto: (id) => _state.productos.get(id) || null,
        listarProductos: () => Array.from(_state.productos.values()),
        obtenerMatriz,
        ajustarStock,
        buscarPorCodigoBarras,

        // probador
        abrirProbador,
        llevarAProbador,
        cerrarProbador,
        purgarProbadoresExpirados,
        listarProbadores: () => Array.from(_state.probadores.values()),

        // rebajas / temporada
        aplicarRebaja,
        quitarRebaja,
        precioFinal,
        productosPorTemporada,
        liquidarTemporadaAnterior,
        temporadaActual: _temporadaActual,

        // ventas / devoluciones
        registrarVenta,
        registrarDevolucion,
        listarVentas: () => _state.ventas.slice(),
        listarDevoluciones: () => _state.devoluciones.slice(),

        // reportes
        reporteVentasPorTalla,
        reporteVentasPorColor,
        bajoStock,
        totalInventario,

        // utilidad
        validarTalla: _validarTalla,
        version: '1.0.0'
    };

    global.RopaAPI = RopaAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = RopaAPI;

})(typeof window !== 'undefined' ? window : globalThis);
