/**
 * Volvix Vertical: Llantera / Recauchutado
 * Sistema POS especializado para venta de llantas, balanceo, alineación y vulcanizado.
 * Expone window.LlanteraAPI para integración con el copiador/pegador multi-IA.
 *
 * @module volvix-vertical-recauchutado
 */
(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // Catálogo de marcas reconocidas en el mercado latino
    // ─────────────────────────────────────────────────────────────
    const MARCAS_LLANTAS = [
        { id: 'michelin',  nombre: 'Michelin',   origen: 'Francia',     tier: 'premium' },
        { id: 'bridgestone', nombre: 'Bridgestone', origen: 'Japón',     tier: 'premium' },
        { id: 'goodyear',  nombre: 'Goodyear',   origen: 'EE.UU.',      tier: 'premium' },
        { id: 'continental', nombre: 'Continental', origen: 'Alemania', tier: 'premium' },
        { id: 'pirelli',   nombre: 'Pirelli',    origen: 'Italia',      tier: 'premium' },
        { id: 'firestone', nombre: 'Firestone',  origen: 'EE.UU.',      tier: 'media' },
        { id: 'hankook',   nombre: 'Hankook',    origen: 'Corea',       tier: 'media' },
        { id: 'kumho',     nombre: 'Kumho',      origen: 'Corea',       tier: 'media' },
        { id: 'yokohama',  nombre: 'Yokohama',   origen: 'Japón',       tier: 'media' },
        { id: 'toyo',      nombre: 'Toyo',       origen: 'Japón',       tier: 'media' },
        { id: 'general',   nombre: 'General Tire', origen: 'EE.UU.',    tier: 'media' },
        { id: 'bfgoodrich', nombre: 'BFGoodrich', origen: 'EE.UU.',     tier: 'media' },
        { id: 'maxxis',    nombre: 'Maxxis',     origen: 'Taiwán',      tier: 'economica' },
        { id: 'sailun',    nombre: 'Sailun',     origen: 'China',       tier: 'economica' },
        { id: 'westlake',  nombre: 'Westlake',   origen: 'China',       tier: 'economica' },
        { id: 'linglong',  nombre: 'Linglong',   origen: 'China',       tier: 'economica' },
        { id: 'triangle',  nombre: 'Triangle',   origen: 'China',       tier: 'economica' },
        { id: 'doublestar', nombre: 'Double Star', origen: 'China',     tier: 'economica' }
    ];

    // ─────────────────────────────────────────────────────────────
    // Medidas comunes (formato ANCHO/PERFIL R RIN)
    // ─────────────────────────────────────────────────────────────
    const MEDIDAS_COMUNES = [
        '155/70R13', '165/70R13', '175/70R13',
        '175/65R14', '185/65R14', '185/70R14', '195/70R14',
        '185/65R15', '195/65R15', '205/65R15', '205/55R16',
        '215/60R16', '225/60R16', '215/55R17', '225/45R17', '235/45R17',
        '235/60R18', '245/45R18', '255/55R18',
        '265/65R17', '275/55R20', '285/50R20', '285/45R22',
        '7.50R16', '8.25R20', '11R22.5', '295/80R22.5'  // Camión / TBR
    ];

    // ─────────────────────────────────────────────────────────────
    // Servicios mecánicos asociados
    // ─────────────────────────────────────────────────────────────
    const SERVICIOS = {
        balanceo: {
            id: 'balanceo',
            nombre: 'Balanceo dinámico',
            descripcion: 'Balanceo computarizado por rueda con contrapesas adhesivas o de presión.',
            precioBase: 80,        // MXN por rueda
            tiempoMin: 10
        },
        alineacion: {
            id: 'alineacion',
            nombre: 'Alineación 3D',
            descripcion: 'Alineación computarizada de 4 ruedas con cámaras 3D (camber, caster, toe).',
            precioBase: 450,
            tiempoMin: 45
        },
        rotacion: {
            id: 'rotacion',
            nombre: 'Rotación de llantas',
            descripcion: 'Rotación cruzada cada 8,000-10,000 km para uniformar desgaste.',
            precioBase: 150,
            tiempoMin: 20
        },
        vulcanizado: {
            id: 'vulcanizado',
            nombre: 'Vulcanizado / Parche',
            descripcion: 'Reparación de pinchadura con parche en frío o caliente desde el interior.',
            precioBase: 120,
            tiempoMin: 25
        },
        recauchutado: {
            id: 'recauchutado',
            nombre: 'Recauchutado (renovado)',
            descripcion: 'Renovado de banda de rodadura sobre carcasa reciclada (camión/bus).',
            precioBase: 1800,
            tiempoMin: 240
        },
        valvula: {
            id: 'valvula',
            nombre: 'Cambio de válvula',
            descripcion: 'Reemplazo de válvula de aire (caucho o metálica TPMS).',
            precioBase: 35,
            tiempoMin: 5
        },
        montaje: {
            id: 'montaje',
            nombre: 'Montaje y desmontaje',
            descripcion: 'Desmontar la llanta usada y montar la nueva en el rin.',
            precioBase: 60,
            tiempoMin: 15
        },
        nitrogeno: {
            id: 'nitrogeno',
            nombre: 'Inflado con nitrógeno',
            descripcion: 'Inflado con N2 para mayor estabilidad de presión.',
            precioBase: 50,
            tiempoMin: 8
        }
    };

    // ─────────────────────────────────────────────────────────────
    // Estado interno: inventario y tickets
    // ─────────────────────────────────────────────────────────────
    let _inventario = [];   // [{ sku, marca, medida, modelo, dot, stock, precio }]
    let _ticketActual = null;
    let _historial = [];

    function _generarSKU(marca, medida) {
        return `${marca.toUpperCase().slice(0, 3)}-${medida.replace(/[^\w]/g, '')}-${Date.now().toString(36).slice(-4)}`;
    }

    function _validarMedida(medida) {
        // ANCHO/PERFILR RIN  ej: 205/55R16   o   11R22.5
        return /^\d{3}\/\d{2}R\d{2}(\.\d)?$/.test(medida) ||
               /^\d{1,2}\.?\d?R\d{2}(\.\d)?$/.test(medida);
    }

    function _calcularSubtotal(items) {
        return items.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);
    }

    // ─────────────────────────────────────────────────────────────
    // API pública
    // ─────────────────────────────────────────────────────────────
    const LlanteraAPI = {
        version: '1.0.0',

        // ── Catálogos ──
        getMarcas() { return MARCAS_LLANTAS.slice(); },
        getMarcasPorTier(tier) { return MARCAS_LLANTAS.filter(m => m.tier === tier); },
        getMedidas() { return MEDIDAS_COMUNES.slice(); },
        getServicios() { return Object.values(SERVICIOS); },
        getServicio(id) { return SERVICIOS[id] || null; },

        // ── Inventario ──
        agregarLlanta({ marca, medida, modelo = '', dot = '', stock = 1, precio = 0 }) {
            if (!MARCAS_LLANTAS.find(m => m.id === marca)) {
                throw new Error(`Marca desconocida: ${marca}`);
            }
            if (!_validarMedida(medida)) {
                throw new Error(`Medida inválida: ${medida} (esperado p.ej. 205/55R16)`);
            }
            if (precio <= 0) throw new Error('Precio debe ser > 0');
            const sku = _generarSKU(marca, medida);
            const item = { sku, marca, medida, modelo, dot, stock, precio, alta: new Date().toISOString() };
            _inventario.push(item);
            return item;
        },

        buscarLlanta({ marca, medida } = {}) {
            return _inventario.filter(it =>
                (!marca  || it.marca  === marca) &&
                (!medida || it.medida === medida) &&
                it.stock > 0
            );
        },

        ajustarStock(sku, delta) {
            const it = _inventario.find(x => x.sku === sku);
            if (!it) throw new Error(`SKU no encontrado: ${sku}`);
            it.stock += delta;
            if (it.stock < 0) it.stock = 0;
            return it;
        },

        getInventario() { return _inventario.slice(); },

        // ── Tickets / Venta ──
        nuevoTicket(cliente = 'Público en general', placa = '') {
            _ticketActual = {
                id: 'TK-' + Date.now().toString(36).toUpperCase(),
                cliente,
                placa,
                fecha: new Date().toISOString(),
                items: [],
                servicios: [],
                estado: 'abierto'
            };
            return _ticketActual;
        },

        agregarLlantaAlTicket(sku, cantidad = 1) {
            if (!_ticketActual) throw new Error('No hay ticket abierto. Llama nuevoTicket() primero.');
            const it = _inventario.find(x => x.sku === sku);
            if (!it) throw new Error(`SKU no encontrado: ${sku}`);
            if (it.stock < cantidad) throw new Error(`Stock insuficiente (${it.stock} disponibles)`);
            _ticketActual.items.push({
                sku, marca: it.marca, medida: it.medida,
                modelo: it.modelo, precio: it.precio, cantidad
            });
            it.stock -= cantidad;
            return _ticketActual;
        },

        agregarServicioAlTicket(servicioId, ruedas = 1, precioOverride = null) {
            if (!_ticketActual) throw new Error('No hay ticket abierto.');
            const sv = SERVICIOS[servicioId];
            if (!sv) throw new Error(`Servicio desconocido: ${servicioId}`);
            const precio = precioOverride != null ? precioOverride : sv.precioBase;
            _ticketActual.servicios.push({
                servicioId, nombre: sv.nombre, ruedas,
                precio, subtotal: precio * ruedas, tiempoMin: sv.tiempoMin * ruedas
            });
            return _ticketActual;
        },

        calcularTotal(iva = 0.16) {
            if (!_ticketActual) throw new Error('No hay ticket abierto.');
            const subItems  = _calcularSubtotal(_ticketActual.items);
            const subServ   = _ticketActual.servicios.reduce((a, s) => a + s.subtotal, 0);
            const subtotal  = subItems + subServ;
            const impuesto  = +(subtotal * iva).toFixed(2);
            const total     = +(subtotal + impuesto).toFixed(2);
            return { subtotal: +subtotal.toFixed(2), iva: impuesto, total };
        },

        cerrarTicket(metodoPago = 'efectivo') {
            if (!_ticketActual) throw new Error('No hay ticket abierto.');
            const totales = this.calcularTotal();
            _ticketActual.totales = totales;
            _ticketActual.metodoPago = metodoPago;
            _ticketActual.estado = 'cerrado';
            _ticketActual.cierre = new Date().toISOString();
            _historial.push(_ticketActual);
            const cerrado = _ticketActual;
            _ticketActual = null;
            return cerrado;
        },

        getTicketActual() { return _ticketActual; },
        getHistorial()    { return _historial.slice(); },

        // ── Diagnóstico de desgaste ──
        diagnosticarDesgaste(profundidadMm) {
            // Profundidad de banda en mm — nuevas vienen ~8mm, mínimo legal ~1.6mm
            if (profundidadMm >= 6)   return { estado: 'excelente', accion: 'continuar uso normal' };
            if (profundidadMm >= 4)   return { estado: 'bueno',     accion: 'rotación recomendada' };
            if (profundidadMm >= 3)   return { estado: 'medio',     accion: 'planear reemplazo en 6 meses' };
            if (profundidadMm >= 2)   return { estado: 'bajo',      accion: 'reemplazo próximo (3 meses)' };
            return { estado: 'critico', accion: 'REEMPLAZO INMEDIATO — debajo del mínimo legal' };
        },

        // ── Recauchutado: evaluación de carcasa ──
        evaluarCarcasaRecauchutado({ edadAnios, vueltasPrevias = 0, danoEstructural = false }) {
            if (danoEstructural)        return { apta: false, razon: 'daño estructural detectado' };
            if (edadAnios > 7)          return { apta: false, razon: 'carcasa supera 7 años' };
            if (vueltasPrevias >= 2)    return { apta: false, razon: 'ya recauchutada 2 veces (límite)' };
            return { apta: true, razon: 'carcasa apta para recauchutado' };
        },

        // ── Reset (uso en pruebas) ──
        _reset() {
            _inventario = [];
            _ticketActual = null;
            _historial = [];
        }
    };

    // Exponer en window
    global.LlanteraAPI = LlanteraAPI;

    // CommonJS opcional
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LlanteraAPI;
    }
})(typeof window !== 'undefined' ? window : globalThis);
