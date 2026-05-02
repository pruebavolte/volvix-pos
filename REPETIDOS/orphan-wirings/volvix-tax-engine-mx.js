/**
 * VOLVIX · Motor Fiscal SAT México (R14)
 * IVA 16/8/0/exento, IEPS por categoría, retenciones ISR/IVA,
 * complementos CFDI 4.0, mapping productos -> claveProdServ.
 *
 * Uso:
 *   const r = Volvix.tax.mx.calcular(items, { frontera:false, regimen:'601' });
 *   const ret = Volvix.tax.mx.retenciones(10000, 'honorarios');
 *   const c = Volvix.tax.mx.complemento('pagos', { ... });
 */
(function (root) {
  'use strict';

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  // ───────── IEPS por categoría (tasas vigentes 2024-2026) ─────────
  // Fuente: LIEPS art. 2°. Cuotas específicas omitidas (tabaco, combustibles)
  // se manejan como string "cuota" para indicar que requiere cálculo aparte.
  const IEPS_RATES = {
    'bebidas_alcoholicas_hasta14': 0.265,
    'bebidas_alcoholicas_14a20':   0.30,
    'bebidas_alcoholicas_mas20':   0.53,
    'cerveza':                     0.265,
    'tabacos_labrados':            0.16,    // + cuota específica $0.6166/cigarro
    'puros_artesanales':           0.304,
    'bebidas_energizantes':        0.25,
    'bebidas_saborizadas':         0.0,     // cuota $1.5086/L
    'alimentos_alta_densidad':     0.08,    // chatarra >275kcal/100g
    'plaguicidas_cat1y2':          0.09,
    'plaguicidas_cat3':            0.07,
    'plaguicidas_cat4':            0.06,
    'combustibles_fosiles':        0.0,     // cuota por tipo
    'apuestas_sorteos':            0.30,
    'redes_telecom':               0.03,
    'comida_chatarra':             0.08,
  };

  // ───────── Catálogo c_ClaveProdServ SAT (top 200 e-commerce/retail/restaurante) ─────────
  // Subset representativo. El catálogo SAT completo (~52k claves) vive en BD.
  const CLAVE_PRODSERV_TOP = {
    // Genéricos
    '01010101': 'No existe en el catálogo',
    // Alimentos y bebidas restaurante
    '50202306': 'Comida preparada',
    '50202301': 'Servicio de banquetes',
    '90101501': 'Servicio de restaurante',
    '90101502': 'Servicio de cafetería',
    '90101503': 'Servicio de bar',
    '50192100': 'Pan',
    '50161509': 'Café tostado',
    '50202203': 'Pizzas',
    '50202209': 'Hamburguesas',
    '50202205': 'Tacos',
    '50202207': 'Sushi',
    '50171550': 'Refrescos',
    '50202310': 'Agua embotellada',
    '50202311': 'Cerveza',
    '50202312': 'Vinos',
    '50202313': 'Licores destilados',
    '50202315': 'Jugos naturales',
    // Retail / abarrotes
    '50171500': 'Productos lácteos',
    '50112000': 'Carnes frescas',
    '50112004': 'Pollo',
    '50112005': 'Res',
    '50121500': 'Pescados y mariscos',
    '50131600': 'Frutas frescas',
    '50131700': 'Verduras frescas',
    '50161510': 'Azúcar',
    '50161800': 'Aceites comestibles',
    '50181900': 'Cereales',
    '50192300': 'Galletas',
    '50202100': 'Confitería y dulces',
    '50202400': 'Botanas',
    // Higiene / cuidado personal
    '53131500': 'Productos higiene personal',
    '53131600': 'Productos baño',
    '53131608': 'Shampoo',
    '53131626': 'Pasta dental',
    '53131628': 'Jabón',
    '53131643': 'Papel higiénico',
    '53131649': 'Toallas femeninas',
    '53131653': 'Pañales',
    '53131628': 'Detergentes',
    // Limpieza hogar
    '47131500': 'Productos limpieza',
    '47131502': 'Cloro',
    '47131618': 'Limpia vidrios',
    // Vestido y calzado
    '53102500': 'Ropa hombre',
    '53102600': 'Ropa mujer',
    '53102700': 'Ropa niños',
    '53111600': 'Calzado',
    '53111601': 'Tenis',
    '53111603': 'Zapatos vestir',
    // Electrónica
    '43211500': 'Computadoras',
    '43211503': 'Laptops',
    '43211507': 'Tablets',
    '43211508': 'Smartphones',
    '43211706': 'Impresoras',
    '52161500': 'Televisores',
    '52161505': 'Bocinas',
    '52161512': 'Audífonos',
    '52161514': 'Smart watch',
    '52161541': 'Consolas videojuegos',
    '43202000': 'Memorias USB',
    '43211901': 'Monitores',
    '52141501': 'Refrigeradores',
    '52141505': 'Lavadoras',
    '52141507': 'Microondas',
    '52141509': 'Estufas',
    // Hogar / muebles
    '56101500': 'Muebles oficina',
    '56101700': 'Muebles sala',
    '56101701': 'Sofás',
    '56101800': 'Muebles recámara',
    '56101801': 'Camas',
    '52121600': 'Colchones',
    '52121700': 'Ropa cama',
    '52151500': 'Vajillas',
    // Papelería / oficina
    '14111500': 'Papel',
    '14111507': 'Papel bond',
    '44121500': 'Útiles escolares',
    '44121600': 'Bolígrafos',
    '44122100': 'Carpetas',
    // Ferretería
    '27112000': 'Herramientas manuales',
    '31161500': 'Tornillería',
    '40141700': 'Tuberías',
    // Salud / farmacia
    '51100000': 'Medicamentos',
    '51101800': 'Analgésicos',
    '51102700': 'Antibióticos',
    '51241200': 'Vitaminas',
    '42312200': 'Material curación',
    // Auto
    '25172500': 'Neumáticos',
    '25174000': 'Aceites lubricantes',
    '15101506': 'Gasolina magna',
    '15101507': 'Gasolina premium',
    '15101508': 'Diésel',
    // Servicios
    '80101500': 'Servicios consultoría',
    '80111600': 'Honorarios profesionales',
    '80131500': 'Arrendamiento bienes raíces',
    '81111500': 'Servicios software',
    '81112000': 'Servicios informáticos',
    '78111800': 'Servicios transporte',
    '90111500': 'Hospedaje',
    '85101500': 'Servicios médicos',
    '86101700': 'Servicios educativos',
    // Mascotas
    '10121800': 'Alimento mascotas',
    // Belleza
    '53131500': 'Cosméticos',
    '53131630': 'Maquillaje',
    '53131631': 'Perfumes',
    // Juguetes
    '60141000': 'Juguetes',
    // Deporte
    '49161500': 'Artículos deportivos',
    '49181500': 'Bicicletas',
  };

  // ───────── Catálogo c_ClaveUnidad SAT (subset común) ─────────
  const CLAVE_UNIDAD_TOP = {
    'PIE': 'Pieza',          'KGM': 'Kilogramo',     'GRM': 'Gramo',
    'LTR': 'Litro',          'MLT': 'Mililitro',     'MTR': 'Metro',
    'CMT': 'Centímetro',     'MTK': 'Metro cuadrado','MTQ': 'Metro cúbico',
    'H87': 'Pieza (UNECE)',  'EA':  'Cada uno',      'ACT': 'Actividad',
    'BX':  'Caja',           'PR':  'Par',           'SET': 'Juego',
    'XBX': 'Caja',           'XPK': 'Paquete',       'KT':  'Kit',
    'HUR': 'Hora',           'DAY': 'Día',           'MON': 'Mes',
    'E48': 'Servicio',       'ZZ':  'Mutuamente definido',
  };

  // ───────── Mapping productos → claveProdServ por palabras clave ─────────
  // Heurística simple por nombre; en producción debe consultar product_sat_mapping en BD.
  const KEYWORD_MAP = [
    [/refresco|coca|pepsi|sprite/i,            { clave: '50171550', unidad: 'LTR' }],
    [/agua/i,                                   { clave: '50202310', unidad: 'LTR' }],
    [/cerveza|beer/i,                          { clave: '50202311', unidad: 'LTR', ieps: 'cerveza' }],
    [/vino/i,                                  { clave: '50202312', unidad: 'LTR', ieps: 'bebidas_alcoholicas_14a20' }],
    [/tequila|whisky|ron|vodka|mezcal/i,       { clave: '50202313', unidad: 'LTR', ieps: 'bebidas_alcoholicas_mas20' }],
    [/cigarro|tabaco/i,                        { clave: '50202311', unidad: 'PIE', ieps: 'tabacos_labrados' }],
    [/pizza/i,                                 { clave: '50202203', unidad: 'PIE' }],
    [/hamburguesa|burger/i,                    { clave: '50202209', unidad: 'PIE' }],
    [/taco/i,                                  { clave: '50202205', unidad: 'PIE' }],
    [/sushi/i,                                 { clave: '50202207', unidad: 'PIE' }],
    [/cafe|café/i,                             { clave: '50161509', unidad: 'KGM' }],
    [/pan|bolillo|baguette/i,                  { clave: '50192100', unidad: 'PIE' }],
    [/leche|yogurt|queso/i,                    { clave: '50171500', unidad: 'LTR' }],
    [/pollo/i,                                 { clave: '50112004', unidad: 'KGM' }],
    [/res|carne/i,                             { clave: '50112005', unidad: 'KGM' }],
    [/pescado|camaron|mariscos/i,              { clave: '50121500', unidad: 'KGM' }],
    [/manzana|platano|naranja|fruta/i,         { clave: '50131600', unidad: 'KGM' }],
    [/jitomate|cebolla|verdura|lechuga/i,      { clave: '50131700', unidad: 'KGM' }],
    [/papas|fritos|botana|sabritas/i,          { clave: '50202400', unidad: 'KGM', ieps: 'alimentos_alta_densidad' }],
    [/dulce|chocolate|caramelo/i,              { clave: '50202100', unidad: 'KGM', ieps: 'alimentos_alta_densidad' }],
    [/galleta/i,                               { clave: '50192300', unidad: 'KGM', ieps: 'alimentos_alta_densidad' }],
    [/shampoo/i,                               { clave: '53131608', unidad: 'MLT' }],
    [/jabon|jabón/i,                           { clave: '53131628', unidad: 'PIE' }],
    [/pañal/i,                                 { clave: '53131653', unidad: 'PIE' }],
    [/papel higi/i,                            { clave: '53131643', unidad: 'PIE' }],
    [/laptop|notebook/i,                       { clave: '43211503', unidad: 'PIE' }],
    [/celular|smartphone|iphone|samsung/i,     { clave: '43211508', unidad: 'PIE' }],
    [/tablet|ipad/i,                           { clave: '43211507', unidad: 'PIE' }],
    [/televis|smart tv|pantalla/i,             { clave: '52161500', unidad: 'PIE' }],
    [/audifono|audífono|earbud/i,              { clave: '52161512', unidad: 'PIE' }],
    [/refrigerador/i,                          { clave: '52141501', unidad: 'PIE' }],
    [/lavadora/i,                              { clave: '52141505', unidad: 'PIE' }],
    [/zapato|tenis|calzado/i,                  { clave: '53111600', unidad: 'PR' }],
    [/playera|camisa|pantalon|ropa/i,          { clave: '53102500', unidad: 'PIE' }],
    [/medicamento|pastilla|paracetamol|ibuprofeno/i, { clave: '51100000', unidad: 'PIE' }],
    [/gasolina magna/i,                        { clave: '15101506', unidad: 'LTR', ieps: 'combustibles_fosiles' }],
    [/gasolina premium/i,                      { clave: '15101507', unidad: 'LTR', ieps: 'combustibles_fosiles' }],
    [/diesel|diésel/i,                         { clave: '15101508', unidad: 'LTR', ieps: 'combustibles_fosiles' }],
    [/honorario|consultoria|consultoría/i,     { clave: '80111600', unidad: 'E48' }],
    [/arrendamiento|renta inmueble/i,          { clave: '80131500', unidad: 'MON' }],
    [/software|licencia/i,                     { clave: '81111500', unidad: 'E48' }],
    [/hospedaje|hotel/i,                       { clave: '90111500', unidad: 'DAY' }],
  ];

  function mapProductToSAT(name) {
    const n = String(name || '');
    for (const [re, info] of KEYWORD_MAP) {
      if (re.test(n)) return Object.assign({}, info);
    }
    return { clave: '01010101', unidad: 'H87' }; // genérico
  }

  // ───────── Categorías de IVA ─────────
  // Alimentos básicos (frutas, verduras, leche, huevo, pan, tortilla, carne, pescado) → 0%
  // Medicinas patente → 0%
  // Servicios médicos profesionales → exento
  // Educación con autorización → exento
  // Libros, periódicos, revistas → exento
  // Frontera (1ra. y 2da. franja) → 8% si tenant marcado frontera
  function clasificarIVA(item, opt) {
    const name = String(item.nombre || item.descripcion || item.name || '').toLowerCase();
    const tipo = String(item.tipo_iva || item.iva_tipo || '').toLowerCase();
    if (tipo) {
      if (tipo === 'exento')   return { tasa: null, exento: true };
      if (tipo === '0' || tipo === 'cero') return { tasa: 0, exento: false };
      if (tipo === '8' || tipo === 'frontera') return { tasa: 0.08, exento: false };
      if (tipo === '16')       return { tasa: 0.16, exento: false };
    }
    // Heurísticas
    if (/\b(libro|revista|periodico|periódico)\b/.test(name)) return { tasa: null, exento: true };
    if (/\b(consulta medica|consulta médica|servicio medico)\b/.test(name)) return { tasa: null, exento: true };
    if (/\b(colegiatura|inscripcion escolar)\b/.test(name)) return { tasa: null, exento: true };
    if (/\b(tortilla|pan |leche|huevo|carne|pollo|pescado|fruta|verdura|medicamento)\b/.test(name))
      return { tasa: 0, exento: false };
    if (opt && opt.frontera) return { tasa: 0.08, exento: false };
    return { tasa: 0.16, exento: false };
  }

  function clasificarIEPS(item) {
    if (item.ieps_categoria && IEPS_RATES[item.ieps_categoria] != null)
      return { categoria: item.ieps_categoria, tasa: IEPS_RATES[item.ieps_categoria] };
    if (item.clave_prodserv) {
      const sat = mapProductToSAT(item.nombre || item.descripcion || '');
      if (sat.ieps) return { categoria: sat.ieps, tasa: IEPS_RATES[sat.ieps] || 0 };
    }
    const sat = mapProductToSAT(item.nombre || item.descripcion || '');
    if (sat.ieps) return { categoria: sat.ieps, tasa: IEPS_RATES[sat.ieps] || 0 };
    return null;
  }

  // ───────── Cálculo principal ─────────
  function calcular(items, scenario) {
    const opt = scenario || {};
    const frontera = !!opt.frontera;
    const result = {
      items: [],
      subtotal: 0, descuento: 0,
      iva_16: 0, iva_8: 0, iva_0: 0, exento_total: 0,
      ieps_total: 0,
      ret_isr: 0, ret_iva: 0,
      total: 0,
      moneda: opt.moneda || 'MXN',
      tipo_cambio: opt.tipo_cambio || 1,
      regimen: opt.regimen || '601',
      uso_cfdi: opt.uso_cfdi || 'G03',
      metodo_pago: opt.metodo_pago || 'PUE',
      forma_pago: opt.forma_pago || '01',
    };

    (items || []).forEach((it) => {
      const qty   = Number(it.cantidad ?? it.qty ?? 1);
      const price = Number(it.precio_unitario ?? it.price ?? 0);
      const desc  = Number(it.descuento ?? it.discount ?? 0);
      const base  = round2(qty * price - desc);

      const ivaCls  = clasificarIVA(it, { frontera });
      const iepsCls = clasificarIEPS(it);
      const sat     = it.clave_prodserv
        ? { clave: it.clave_prodserv, unidad: it.clave_unidad || 'H87' }
        : mapProductToSAT(it.nombre || it.descripcion || '');

      const ieps = iepsCls ? round2(base * iepsCls.tasa) : 0;
      const baseIva = round2(base + ieps); // IEPS forma parte de la base IVA
      let iva = 0;
      if (ivaCls.exento) {
        result.exento_total += base;
      } else if (ivaCls.tasa === 0) {
        result.iva_0 += baseIva;
      } else if (ivaCls.tasa === 0.08) {
        iva = round2(baseIva * 0.08);
        result.iva_8 += iva;
      } else if (ivaCls.tasa === 0.16) {
        iva = round2(baseIva * 0.16);
        result.iva_16 += iva;
      }

      result.subtotal += base;
      result.descuento += desc;
      result.ieps_total += ieps;
      result.items.push({
        ...it,
        clave_prodserv: sat.clave, clave_unidad: sat.unidad,
        base, ieps, iva, iva_tasa: ivaCls.exento ? 'exento' : ivaCls.tasa,
        ieps_categoria: iepsCls ? iepsCls.categoria : null,
      });
    });

    // Retenciones (si scenario lo solicita)
    if (opt.retencion_tipo) {
      const r = retenciones(result.subtotal, opt.retencion_tipo);
      result.ret_isr = r.isr;
      result.ret_iva = r.iva_retenido;
    }

    result.subtotal    = round2(result.subtotal);
    result.descuento   = round2(result.descuento);
    result.iva_16      = round2(result.iva_16);
    result.iva_8       = round2(result.iva_8);
    result.iva_0       = round2(result.iva_0);
    result.exento_total= round2(result.exento_total);
    result.ieps_total  = round2(result.ieps_total);
    result.total = round2(
      result.subtotal + result.ieps_total +
      result.iva_16 + result.iva_8 -
      result.ret_isr - result.ret_iva
    );
    return result;
  }

  // ───────── Retenciones ISR/IVA ─────────
  // honorarios PF: ISR 10%, IVA retenido 2/3 de 16% = 10.6667%
  // arrendamiento PF: ISR 10%, IVA retenido 2/3 de 16% = 10.6667%
  // fletes terrestres: IVA retenido 4%
  // servicios PM a PF (subcontratación REPSE): IVA retenido 6%
  function retenciones(monto, tipo) {
    const m = Number(monto) || 0;
    const t = String(tipo || '').toLowerCase();
    let isr = 0, ivaRet = 0;
    switch (t) {
      case 'honorarios':
      case 'honorarios_pf':
        isr    = round2(m * 0.10);
        ivaRet = round2(m * 0.16 * (2/3));
        break;
      case 'arrendamiento':
      case 'arrendamiento_pf':
        isr    = round2(m * 0.10);
        ivaRet = round2(m * 0.16 * (2/3));
        break;
      case 'fletes':
      case 'autotransporte':
        isr    = 0;
        ivaRet = round2(m * 0.04);
        break;
      case 'subcontratacion':
      case 'repse':
        isr    = 0;
        ivaRet = round2(m * 0.06);
        break;
      case 'dividendos':
        isr    = round2(m * 0.10);
        break;
      case 'intereses_bancarios':
        isr    = round2(m * 0.0150); // tasa anual provisional aproximada
        break;
      default:
        return { ok: false, error: 'tipo no soportado: ' + tipo };
    }
    return { ok: true, monto: m, tipo: t, isr, iva_retenido: ivaRet, total_retenido: round2(isr + ivaRet) };
  }

  // ───────── Complementos CFDI 4.0 ─────────
  function complemento(tipo, data) {
    const t = String(tipo || '').toLowerCase();
    const d = data || {};
    const base = {
      version: '2.0',
      fecha: new Date().toISOString(),
      tipo,
    };
    switch (t) {
      case 'pagos':
        return {
          ...base,
          version: '2.0',
          xmlns: 'http://www.sat.gob.mx/Pagos20',
          totales: {
            total_retenciones_iva:  d.total_ret_iva  || 0,
            total_retenciones_isr:  d.total_ret_isr  || 0,
            total_traslados_iva_16: d.total_iva_16   || 0,
            monto_total_pagos:      d.monto_total    || 0,
          },
          pago: {
            fecha_pago: d.fecha_pago || new Date().toISOString(),
            forma_pago: d.forma_pago || '03',
            moneda:     d.moneda || 'MXN',
            tipo_cambio: d.tipo_cambio || 1,
            monto:      d.monto || 0,
            num_operacion: d.num_operacion || null,
            documentos_relacionados: d.documentos_relacionados || [],
          },
        };
      case 'nomina':
        return {
          ...base,
          version: '1.2',
          xmlns: 'http://www.sat.gob.mx/nomina12',
          tipo_nomina: d.tipo_nomina || 'O',
          fecha_pago: d.fecha_pago,
          fecha_inicial_pago: d.fecha_inicial_pago,
          fecha_final_pago:   d.fecha_final_pago,
          dias_pagados: d.dias_pagados,
          emisor:    d.emisor    || {},
          receptor:  d.receptor  || {},
          percepciones: d.percepciones || { total_gravado: 0, total_exento: 0, detalles: [] },
          deducciones:  d.deducciones  || { total_imp_retenidos: 0, total_otras: 0, detalles: [] },
          otros_pagos:  d.otros_pagos  || [],
          incapacidades: d.incapacidades || [],
        };
      case 'donativos':
      case 'donatarias':
        return {
          ...base,
          version: '1.1',
          xmlns: 'http://www.sat.gob.mx/donat',
          no_autorizacion: d.no_autorizacion,
          fecha_autorizacion: d.fecha_autorizacion,
          leyenda: d.leyenda || 'Este comprobante ampara un donativo deducible...',
        };
      case 'comercio_exterior':
      case 'cce':
        return {
          ...base,
          version: '2.0',
          xmlns: 'http://www.sat.gob.mx/ComercioExterior20',
          motivo_traslado: d.motivo_traslado || null,
          tipo_operacion:  d.tipo_operacion  || '2',
          clave_de_pedimento: d.clave_pedimento || 'A1',
          certificado_origen: d.certificado_origen || 0,
          subdivision: d.subdivision || 0,
          tipo_cambio_usd: d.tipo_cambio_usd || 0,
          total_usd: d.total_usd || 0,
          emisor:    d.emisor    || {},
          receptor:  d.receptor  || {},
          mercancias: d.mercancias || [],
        };
      case 'ine':
        return { ...base, version: '1.1', xmlns: 'http://www.sat.gob.mx/ine',
          tipo_proceso: d.tipo_proceso || 'Ordinario', tipo_comite: d.tipo_comite || 'Nacional',
          entidades: d.entidades || [] };
      case 'leyendas':
        return { ...base, version: '1.0', xmlns: 'http://www.sat.gob.mx/leyendasFiscales',
          leyendas: d.leyendas || [] };
      case 'iedu':
        return { ...base, version: '1.0', xmlns: 'http://www.sat.gob.mx/iedu',
          nombre_alumno: d.nombre_alumno, curp: d.curp,
          nivel_educativo: d.nivel_educativo, autorizacion_rvoe: d.rvoe };
      default:
        return { ok: false, error: 'complemento no soportado: ' + tipo };
    }
  }

  // ───────── Export ─────────
  const api = {
    calcular,
    retenciones,
    complemento,
    mapProductToSAT,
    catalogos: {
      clave_prodserv: CLAVE_PRODSERV_TOP,
      clave_unidad:   CLAVE_UNIDAD_TOP,
      ieps_rates:     IEPS_RATES,
      forma_pago: {
        '01':'Efectivo','02':'Cheque nominativo','03':'Transferencia electrónica',
        '04':'Tarjeta de crédito','05':'Monedero electrónico','06':'Dinero electrónico',
        '08':'Vales de despensa','12':'Dación en pago','13':'Pago por subrogación',
        '14':'Pago por consignación','15':'Condonación','17':'Compensación',
        '23':'Novación','24':'Confusión','25':'Remisión de deuda','26':'Prescripción',
        '27':'A satisfacción del acreedor','28':'Tarjeta de débito','29':'Tarjeta de servicios',
        '30':'Aplicación de anticipos','31':'Intermediario pagos','99':'Por definir',
      },
      metodo_pago: { 'PUE':'Pago en una exhibición','PPD':'Pago en parcialidades o diferido' },
      uso_cfdi: {
        'G01':'Adquisición de mercancías','G02':'Devoluciones, descuentos o bonificaciones',
        'G03':'Gastos en general','I01':'Construcciones','I02':'Mobiliario y equipo de oficina',
        'I03':'Equipo de transporte','I04':'Equipo de cómputo','I05':'Dados, troqueles, moldes',
        'I06':'Comunicaciones telefónicas','I07':'Comunicaciones satelitales','I08':'Otra maquinaria',
        'D01':'Honorarios médicos, dentales','D02':'Gastos médicos por incapacidad',
        'D03':'Gastos funerales','D04':'Donativos','D05':'Intereses hipotecarios',
        'D06':'Aportaciones SAR voluntarias','D07':'Primas seguros gastos médicos',
        'D08':'Transporte escolar','D09':'Depósitos cuentas ahorro','D10':'Colegiaturas',
        'CP01':'Pagos','S01':'Sin efectos fiscales',
      },
      regimen_fiscal: {
        '601':'General de Ley Personas Morales','603':'Personas Morales sin Fines de Lucro',
        '605':'Sueldos y Salarios','606':'Arrendamiento','607':'Régimen de Enajenación o Adquisición de Bienes',
        '608':'Demás ingresos','610':'Residentes en el Extranjero','611':'Ingresos por Dividendos',
        '612':'Personas Físicas con Actividades Empresariales','614':'Ingresos por Intereses',
        '615':'Régimen de los ingresos por obtención de premios','616':'Sin obligaciones fiscales',
        '620':'Sociedades Cooperativas de Producción','621':'Incorporación Fiscal',
        '622':'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras','623':'Opcional para Grupos de Sociedades',
        '624':'Coordinados','625':'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
        '626':'Régimen Simplificado de Confianza (RESICO)',
      },
    },
  };

  root.Volvix = root.Volvix || {};
  root.Volvix.tax = root.Volvix.tax || {};
  root.Volvix.tax.mx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
