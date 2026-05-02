/**
 * volvix-vertical-pizza.js
 * Vertical de Pizzería para Volvix POS
 * Expone: window.PizzaAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // CATÁLOGOS BASE
  // ============================================================
  const SIZES = {
    personal:  { id: 'personal',  label: 'Personal',  slices: 4,  diameter_cm: 20, base_price: 80 },
    mediana:   { id: 'mediana',   label: 'Mediana',   slices: 6,  diameter_cm: 30, base_price: 140 },
    grande:    { id: 'grande',    label: 'Grande',    slices: 8,  diameter_cm: 36, base_price: 190 },
    familiar:  { id: 'familiar',  label: 'Familiar',  slices: 12, diameter_cm: 45, base_price: 260 },
    gigante:   { id: 'gigante',   label: 'Gigante',   slices: 16, diameter_cm: 55, base_price: 340 }
  };

  const DOUGHS = {
    tradicional: { id: 'tradicional', label: 'Tradicional', surcharge: 0 },
    delgada:     { id: 'delgada',     label: 'Delgada',     surcharge: 0 },
    gruesa:      { id: 'gruesa',      label: 'Gruesa',      surcharge: 10 },
    integral:    { id: 'integral',    label: 'Integral',    surcharge: 15 },
    sin_gluten:  { id: 'sin_gluten',  label: 'Sin gluten',  surcharge: 35 },
    rellena:     { id: 'rellena',     label: 'Borde relleno queso', surcharge: 25 }
  };

  const INGREDIENTS = {
    // categoría: meat | veggie | cheese | sauce | extra
    pepperoni:    { id: 'pepperoni',    label: 'Pepperoni',     cat: 'meat',   price: 18 },
    jamon:        { id: 'jamon',        label: 'Jamón',         cat: 'meat',   price: 16 },
    tocino:       { id: 'tocino',       label: 'Tocino',        cat: 'meat',   price: 20 },
    salchicha:    { id: 'salchicha',    label: 'Salchicha',     cat: 'meat',   price: 16 },
    pollo_bbq:    { id: 'pollo_bbq',    label: 'Pollo BBQ',     cat: 'meat',   price: 22 },
    chorizo:      { id: 'chorizo',      label: 'Chorizo',       cat: 'meat',   price: 18 },
    champinon:    { id: 'champinon',    label: 'Champiñón',     cat: 'veggie', price: 12 },
    pimiento:     { id: 'pimiento',     label: 'Pimiento',      cat: 'veggie', price: 10 },
    cebolla:      { id: 'cebolla',      label: 'Cebolla',       cat: 'veggie', price: 8  },
    aceituna:     { id: 'aceituna',     label: 'Aceituna',      cat: 'veggie', price: 12 },
    pina:         { id: 'pina',         label: 'Piña',          cat: 'veggie', price: 12 },
    jalapeno:     { id: 'jalapeno',     label: 'Jalapeño',      cat: 'veggie', price: 10 },
    tomate:       { id: 'tomate',       label: 'Tomate',        cat: 'veggie', price: 8  },
    albahaca:     { id: 'albahaca',     label: 'Albahaca',      cat: 'veggie', price: 8  },
    mozzarella:   { id: 'mozzarella',   label: 'Mozzarella extra', cat: 'cheese', price: 18 },
    cheddar:      { id: 'cheddar',      label: 'Cheddar',       cat: 'cheese', price: 18 },
    parmesano:    { id: 'parmesano',    label: 'Parmesano',     cat: 'cheese', price: 20 },
    cabra:        { id: 'cabra',        label: 'Queso de cabra',cat: 'cheese', price: 28 },
    salsa_bbq:    { id: 'salsa_bbq',    label: 'Salsa BBQ',     cat: 'sauce',  price: 6  },
    salsa_pesto:  { id: 'salsa_pesto',  label: 'Pesto',         cat: 'sauce',  price: 10 },
    salsa_blanca: { id: 'salsa_blanca', label: 'Salsa blanca',  cat: 'sauce',  price: 8  }
  };

  // Multiplicador de costo de ingrediente según tamaño
  const INGREDIENT_SIZE_MULT = {
    personal: 0.6, mediana: 1.0, grande: 1.3, familiar: 1.7, gigante: 2.2
  };

  // Pizzas predefinidas (la "receta" lista los ingredientes incluidos sin costo extra)
  const PRESETS = {
    margarita:   { id: 'margarita',   label: 'Margarita',   ings: ['tomate','mozzarella','albahaca'] },
    pepperoni:   { id: 'pepperoni',   label: 'Pepperoni',   ings: ['pepperoni','mozzarella'] },
    hawaiana:    { id: 'hawaiana',    label: 'Hawaiana',    ings: ['jamon','pina','mozzarella'] },
    mexicana:    { id: 'mexicana',    label: 'Mexicana',    ings: ['chorizo','jalapeno','cebolla','pimiento'] },
    cuatroquesos:{ id: 'cuatroquesos',label: '4 Quesos',    ings: ['mozzarella','cheddar','parmesano','cabra'] },
    suprema:     { id: 'suprema',     label: 'Suprema',     ings: ['pepperoni','salchicha','pimiento','cebolla','champinon','aceituna'] },
    bbq_chicken: { id: 'bbq_chicken', label: 'BBQ Chicken', ings: ['pollo_bbq','tocino','cebolla','salsa_bbq'] },
    vegetariana: { id: 'vegetariana', label: 'Vegetariana', ings: ['champinon','pimiento','cebolla','aceituna','tomate'] }
  };

  const COMBOS = {
    combo_familiar: {
      id: 'combo_familiar', label: 'Combo Familiar',
      desc: '1 pizza familiar + refresco 2L + pan de ajo',
      price: 320,
      includes: { pizza_size: 'familiar', soda_l: 2, garlic_bread: true }
    },
    combo_pareja: {
      id: 'combo_pareja', label: 'Combo Pareja',
      desc: '1 pizza mediana + 2 refrescos + alitas (8pz)',
      price: 230,
      includes: { pizza_size: 'mediana', sodas: 2, wings: 8 }
    },
    combo_2x1: {
      id: 'combo_2x1', label: '2x1 Martes',
      desc: '2 pizzas grandes al precio de 1 (lun-mar)',
      price: 220,
      includes: { pizzas: 2, pizza_size: 'grande' },
      day_restriction: [1, 2]
    }
  };

  const DELIVERY_ZONES = {
    centro:    { id: 'centro',    label: 'Centro',     fee: 25, eta_min: 25 },
    norte:     { id: 'norte',     label: 'Norte',      fee: 35, eta_min: 35 },
    sur:       { id: 'sur',       label: 'Sur',        fee: 35, eta_min: 35 },
    poniente:  { id: 'poniente',  label: 'Poniente',   fee: 45, eta_min: 45 },
    foraneo:   { id: 'foraneo',   label: 'Foráneo',    fee: 70, eta_min: 60 }
  };

  const TAX_RATE = 0.16;

  // ============================================================
  // ESTADO INTERNO (pedido en curso)
  // ============================================================
  let _orderSeq = 1000;
  const _orders = {};

  function _newOrderId() { return 'PZ-' + (++_orderSeq); }

  // ============================================================
  // CONSTRUCTOR DE PIZZA
  // ============================================================
  function createPizza(opts) {
    opts = opts || {};
    const size = SIZES[opts.size] || SIZES.mediana;
    const dough = DOUGHS[opts.dough] || DOUGHS.tradicional;
    return {
      uid: 'pz_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      size: size.id,
      dough: dough.id,
      preset: opts.preset || null,
      // Soporte mitad/mitad: cada lado tiene su set de ingredientes extra
      halves: {
        left:  (opts.left  || []).slice(),
        right: (opts.right || []).slice(),
        whole: (opts.whole || []).slice()
      },
      removed: (opts.removed || []).slice(), // ingredientes del preset que se quitan
      notes: opts.notes || ''
    };
  }

  function setPreset(pizza, presetId) {
    if (!PRESETS[presetId]) throw new Error('Preset inválido: ' + presetId);
    pizza.preset = presetId;
    return pizza;
  }

  function addIngredient(pizza, ingId, half) {
    if (!INGREDIENTS[ingId]) throw new Error('Ingrediente inválido: ' + ingId);
    half = half || 'whole';
    if (!pizza.halves[half]) throw new Error('Half inválido: ' + half);
    pizza.halves[half].push(ingId);
    return pizza;
  }

  function removeIngredient(pizza, ingId) {
    pizza.removed.push(ingId);
    return pizza;
  }

  // ============================================================
  // CÁLCULO DE PRECIO
  // ============================================================
  function pizzaPrice(pizza) {
    const size = SIZES[pizza.size];
    const dough = DOUGHS[pizza.dough];
    let total = size.base_price + dough.surcharge;

    const mult = INGREDIENT_SIZE_MULT[pizza.size] || 1;
    const presetIngs = pizza.preset ? PRESETS[pizza.preset].ings : [];

    function ingCost(ingId, halfFactor) {
      const ing = INGREDIENTS[ingId];
      if (!ing) return 0;
      return Math.round(ing.price * mult * halfFactor);
    }

    pizza.halves.whole.forEach(function (i) { total += ingCost(i, 1); });
    pizza.halves.left.forEach(function (i)  { total += ingCost(i, 0.6); });
    pizza.halves.right.forEach(function (i) { total += ingCost(i, 0.6); });

    return { subtotal: total, preset: presetIngs };
  }

  // ============================================================
  // ÓRDENES
  // ============================================================
  function newOrder(channel) {
    const id = _newOrderId();
    _orders[id] = {
      id: id,
      channel: channel || 'mostrador', // mostrador | delivery | recoger
      pizzas: [],
      combos: [],
      drinks: [],
      delivery: null,
      created_at: new Date().toISOString(),
      status: 'open'
    };
    return _orders[id];
  }

  function addPizzaToOrder(orderId, pizza) {
    const o = _orders[orderId];
    if (!o) throw new Error('Orden no existe: ' + orderId);
    o.pizzas.push(pizza);
    return o;
  }

  function addComboToOrder(orderId, comboId) {
    const o = _orders[orderId];
    const c = COMBOS[comboId];
    if (!o || !c) throw new Error('Orden o combo inválido');
    if (c.day_restriction) {
      const day = new Date().getDay();
      if (c.day_restriction.indexOf(day) === -1) {
        throw new Error('Combo ' + c.label + ' no disponible hoy');
      }
    }
    o.combos.push({ id: comboId, price: c.price });
    return o;
  }

  function setDelivery(orderId, zoneId, address, phone) {
    const o = _orders[orderId];
    const z = DELIVERY_ZONES[zoneId];
    if (!o || !z) throw new Error('Orden o zona inválida');
    o.channel = 'delivery';
    o.delivery = {
      zone: zoneId, fee: z.fee, eta_min: z.eta_min,
      address: address || '', phone: phone || ''
    };
    return o;
  }

  function orderTotals(orderId) {
    const o = _orders[orderId];
    if (!o) throw new Error('Orden no existe');
    let subtotal = 0;
    o.pizzas.forEach(function (p) { subtotal += pizzaPrice(p).subtotal; });
    o.combos.forEach(function (c) { subtotal += c.price; });
    o.drinks.forEach(function (d) { subtotal += d.price || 0; });
    const deliveryFee = o.delivery ? o.delivery.fee : 0;
    const taxable = subtotal;
    const tax = Math.round(taxable * TAX_RATE * 100) / 100;
    const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100;
    return {
      subtotal: subtotal,
      delivery_fee: deliveryFee,
      tax: tax,
      tax_rate: TAX_RATE,
      total: total,
      eta_min: o.delivery ? o.delivery.eta_min : null
    };
  }

  function closeOrder(orderId, paymentMethod) {
    const o = _orders[orderId];
    if (!o) throw new Error('Orden no existe');
    o.status = 'closed';
    o.closed_at = new Date().toISOString();
    o.payment = paymentMethod || 'efectivo';
    o.totals = orderTotals(orderId);
    return o;
  }

  function getOrder(orderId) { return _orders[orderId] || null; }
  function listOrders(filter) {
    const arr = Object.keys(_orders).map(function (k) { return _orders[k]; });
    if (filter && filter.status) return arr.filter(function (o) { return o.status === filter.status; });
    return arr;
  }

  // ============================================================
  // RECIBO / TICKET
  // ============================================================
  function renderTicket(orderId) {
    const o = _orders[orderId];
    if (!o) return '';
    const t = orderTotals(orderId);
    const lines = [];
    lines.push('==== VOLVIX PIZZA ====');
    lines.push('Orden: ' + o.id + '  (' + o.channel + ')');
    lines.push('Fecha: ' + o.created_at);
    lines.push('----------------------');
    o.pizzas.forEach(function (p, idx) {
      const size = SIZES[p.size].label;
      const dough = DOUGHS[p.dough].label;
      const preset = p.preset ? PRESETS[p.preset].label : 'Personalizada';
      const price = pizzaPrice(p).subtotal;
      lines.push((idx + 1) + '. ' + preset + ' ' + size + ' (' + dough + ')  $' + price);
      if (p.halves.left.length)  lines.push('   1/2 Izq: ' + p.halves.left.join(', '));
      if (p.halves.right.length) lines.push('   1/2 Der: ' + p.halves.right.join(', '));
      if (p.halves.whole.length) lines.push('   Extra: ' + p.halves.whole.join(', '));
      if (p.removed.length)      lines.push('   Sin: ' + p.removed.join(', '));
      if (p.notes)               lines.push('   Nota: ' + p.notes);
    });
    o.combos.forEach(function (c) {
      lines.push('Combo ' + COMBOS[c.id].label + '  $' + c.price);
    });
    if (o.delivery) {
      lines.push('----------------------');
      lines.push('Delivery ' + DELIVERY_ZONES[o.delivery.zone].label + '  $' + o.delivery.fee);
      lines.push('Dir: ' + o.delivery.address);
      lines.push('Tel: ' + o.delivery.phone);
      lines.push('ETA: ' + o.delivery.eta_min + ' min');
    }
    lines.push('----------------------');
    lines.push('Subtotal:    $' + t.subtotal);
    if (t.delivery_fee) lines.push('Envío:       $' + t.delivery_fee);
    lines.push('IVA 16%:     $' + t.tax);
    lines.push('TOTAL:       $' + t.total);
    lines.push('======================');
    return lines.join('\n');
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  global.PizzaAPI = {
    // catálogos
    SIZES: SIZES,
    DOUGHS: DOUGHS,
    INGREDIENTS: INGREDIENTS,
    PRESETS: PRESETS,
    COMBOS: COMBOS,
    DELIVERY_ZONES: DELIVERY_ZONES,
    TAX_RATE: TAX_RATE,
    // pizza
    createPizza: createPizza,
    setPreset: setPreset,
    addIngredient: addIngredient,
    removeIngredient: removeIngredient,
    pizzaPrice: pizzaPrice,
    // orden
    newOrder: newOrder,
    addPizzaToOrder: addPizzaToOrder,
    addComboToOrder: addComboToOrder,
    setDelivery: setDelivery,
    orderTotals: orderTotals,
    closeOrder: closeOrder,
    getOrder: getOrder,
    listOrders: listOrders,
    renderTicket: renderTicket,
    // meta
    version: '1.0.0',
    vertical: 'pizzeria'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PizzaAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
