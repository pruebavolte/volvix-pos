/**
 * volvix-vertical-cafe.js
 * Volvix POS — Vertical Cafetería
 * Bebidas con tamaños/leches, items customizables, programa de lealtad,
 * modos take-away / dine-in, modificadores, combos.
 *
 * API global: window.CafeAPI
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Catálogos base ─────────────────────────────
  const SIZES = {
    short:  { id: 'short',  label: 'Short 8oz',   ml: 240, multiplier: 0.85 },
    tall:   { id: 'tall',   label: 'Tall 12oz',   ml: 355, multiplier: 1.00 },
    grande: { id: 'grande', label: 'Grande 16oz', ml: 473, multiplier: 1.20 },
    venti:  { id: 'venti',  label: 'Venti 20oz',  ml: 591, multiplier: 1.40 },
    trenta: { id: 'trenta', label: 'Trenta 30oz', ml: 887, multiplier: 1.65 }
  };

  const MILKS = {
    whole:    { id: 'whole',    label: 'Leche entera',     extra: 0.00 },
    skim:     { id: 'skim',     label: 'Leche descremada', extra: 0.00 },
    lactose:  { id: 'lactose',  label: 'Deslactosada',     extra: 0.50 },
    almond:   { id: 'almond',   label: 'Almendras',        extra: 1.00 },
    oat:      { id: 'oat',      label: 'Avena',            extra: 1.00 },
    soy:      { id: 'soy',      label: 'Soya',             extra: 0.80 },
    coconut:  { id: 'coconut',  label: 'Coco',             extra: 1.10 }
  };

  const SYRUPS = {
    vanilla:    { id: 'vanilla',    label: 'Vainilla',       price: 0.60 },
    caramel:    { id: 'caramel',    label: 'Caramelo',       price: 0.60 },
    hazelnut:   { id: 'hazelnut',   label: 'Avellana',       price: 0.60 },
    chocolate:  { id: 'chocolate',  label: 'Chocolate',      price: 0.60 },
    cinnamon:   { id: 'cinnamon',   label: 'Canela',         price: 0.50 },
    pumpkin:    { id: 'pumpkin',    label: 'Pumpkin Spice',  price: 0.80 },
    sf_vanilla: { id: 'sf_vanilla', label: 'Vainilla S/Az.', price: 0.60 }
  };

  const EXTRAS = {
    extra_shot:    { id: 'extra_shot',    label: 'Shot extra espresso', price: 1.00 },
    decaf:         { id: 'decaf',         label: 'Descafeinado',        price: 0.00 },
    whipped_cream: { id: 'whipped_cream', label: 'Crema batida',        price: 0.50 },
    extra_foam:    { id: 'extra_foam',    label: 'Espuma extra',        price: 0.00 },
    no_foam:       { id: 'no_foam',       label: 'Sin espuma',          price: 0.00 },
    light_ice:     { id: 'light_ice',     label: 'Poco hielo',          price: 0.00 },
    extra_ice:     { id: 'extra_ice',     label: 'Hielo extra',         price: 0.00 },
    drizzle_caramel:{id: 'drizzle_caramel',label:'Drizzle caramelo',    price: 0.40 },
    cinnamon_top:  { id: 'cinnamon_top',  label: 'Topping canela',      price: 0.30 }
  };

  const TEMPERATURES = ['hot', 'iced', 'blended', 'room'];

  // Menú de bebidas y comida
  const MENU = [
    // ESPRESSO
    { sku:'ESP001', name:'Espresso',          category:'espresso', basePrice:2.50, sizes:['short','tall'], temp:['hot'],          customizable:true,  loyaltyPoints:5  },
    { sku:'ESP002', name:'Americano',         category:'espresso', basePrice:3.00, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:6 },
    { sku:'ESP003', name:'Cappuccino',        category:'espresso', basePrice:3.75, sizes:['tall','grande','venti'], temp:['hot'],   customizable:true,  loyaltyPoints:7  },
    { sku:'ESP004', name:'Latte',             category:'espresso', basePrice:4.00, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:8 },
    { sku:'ESP005', name:'Macchiato',         category:'espresso', basePrice:4.25, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:8 },
    { sku:'ESP006', name:'Mocha',             category:'espresso', basePrice:4.50, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:9 },
    { sku:'ESP007', name:'Flat White',        category:'espresso', basePrice:4.25, sizes:['tall','grande'],          temp:['hot'],   customizable:true,  loyaltyPoints:8  },
    // FRAPPÉS
    { sku:'FRP001', name:'Frappé Café',       category:'frappe',   basePrice:5.25, sizes:['tall','grande','venti'], temp:['blended'], customizable:true, loyaltyPoints:10 },
    { sku:'FRP002', name:'Frappé Mocha',      category:'frappe',   basePrice:5.50, sizes:['tall','grande','venti'], temp:['blended'], customizable:true, loyaltyPoints:11 },
    { sku:'FRP003', name:'Frappé Vainilla',   category:'frappe',   basePrice:5.25, sizes:['tall','grande','venti'], temp:['blended'], customizable:true, loyaltyPoints:10 },
    // TÉ E INFUSIONES
    { sku:'TEA001', name:'Té Verde',          category:'tea',      basePrice:2.75, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:5 },
    { sku:'TEA002', name:'Chai Latte',        category:'tea',      basePrice:4.00, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:8 },
    { sku:'TEA003', name:'Matcha Latte',      category:'tea',      basePrice:4.75, sizes:['tall','grande','venti'], temp:['hot','iced'], customizable:true, loyaltyPoints:9 },
    // CHOCOLATES
    { sku:'CHO001', name:'Chocolate Caliente',category:'chocolate',basePrice:3.75, sizes:['tall','grande','venti'], temp:['hot'],   customizable:true,  loyaltyPoints:7  },
    // COMIDA
    { sku:'FOD001', name:'Croissant',         category:'food',     basePrice:2.95, sizes:null, temp:['room'], customizable:false, loyaltyPoints:6  },
    { sku:'FOD002', name:'Muffin Arándanos',  category:'food',     basePrice:3.25, sizes:null, temp:['room'], customizable:false, loyaltyPoints:6  },
    { sku:'FOD003', name:'Sándwich Jamón Queso',category:'food',   basePrice:5.95, sizes:null, temp:['hot','room'], customizable:true, loyaltyPoints:11 },
    { sku:'FOD004', name:'Bagel Salmón',      category:'food',     basePrice:7.50, sizes:null, temp:['room'], customizable:true, loyaltyPoints:14 },
    { sku:'FOD005', name:'Galleta Avena',     category:'food',     basePrice:1.95, sizes:null, temp:['room'], customizable:false, loyaltyPoints:4  }
  ];

  const COMBOS = [
    { id:'COMBO_DESAYUNO', name:'Combo Desayuno', items:['ESP004','FOD001'], discount:1.50 },
    { id:'COMBO_AFTERNOON',name:'Combo Tarde',    items:['ESP006','FOD002'], discount:1.25 },
    { id:'COMBO_BRUNCH',   name:'Combo Brunch',   items:['ESP003','FOD003'], discount:2.00 }
  ];

  // ───────────────────────────── Estado interno ─────────────────────────────
  const state = {
    orders: [],          // historial de tickets
    currentOrder: null,
    customers: {},       // customerId -> { name, points, tier, visits, totalSpent }
    config: {
      taxRate: 0.16,
      loyaltyRate: 1,         // 1 punto por dólar
      pointsPerReward: 100,   // 100 puntos = 1 bebida gratis
      tiers: {
        bronze: { min: 0,    discount: 0.00 },
        silver: { min: 500,  discount: 0.05 },
        gold:   { min: 2000, discount: 0.10 },
        platinum:{min: 5000, discount: 0.15 }
      },
      currency: 'USD'
    }
  };

  // ───────────────────────────── Helpers ─────────────────────────────
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function findItem(sku) {
    return MENU.find(m => m.sku === sku) || null;
  }

  function round(n) { return Math.round(n * 100) / 100; }

  function tierFor(points) {
    const t = state.config.tiers;
    if (points >= t.platinum.min) return 'platinum';
    if (points >= t.gold.min)     return 'gold';
    if (points >= t.silver.min)   return 'silver';
    return 'bronze';
  }

  // ───────────────────────────── Pricing ─────────────────────────────
  function priceLineItem(line) {
    const item = findItem(line.sku);
    if (!item) throw new Error('SKU no encontrado: ' + line.sku);

    let unit = item.basePrice;

    if (item.sizes && line.size && SIZES[line.size]) {
      unit = item.basePrice * SIZES[line.size].multiplier;
    }
    if (line.milk && MILKS[line.milk]) unit += MILKS[line.milk].extra;
    if (Array.isArray(line.syrups)) {
      line.syrups.forEach(s => { if (SYRUPS[s]) unit += SYRUPS[s].price; });
    }
    if (Array.isArray(line.extras)) {
      line.extras.forEach(e => { if (EXTRAS[e]) unit += EXTRAS[e].price; });
    }
    const qty = line.qty || 1;
    line.unitPrice = round(unit);
    line.subtotal  = round(unit * qty);
    return line.subtotal;
  }

  function applyCombos(order) {
    let comboDiscount = 0;
    const used = new Set();
    COMBOS.forEach(c => {
      const lines = c.items.map(sku => order.items.find(it => it.sku === sku && !used.has(it.id)));
      if (lines.every(Boolean)) {
        lines.forEach(l => used.add(l.id));
        comboDiscount += c.discount;
        order.appliedCombos.push({ id: c.id, name: c.name, discount: c.discount });
      }
    });
    return comboDiscount;
  }

  function recalcOrder(order) {
    order.appliedCombos = [];
    let subtotal = 0;
    order.items.forEach(line => { subtotal += priceLineItem(line); });

    const comboDiscount = applyCombos(order);
    const customer = order.customerId ? state.customers[order.customerId] : null;
    const tierKey  = customer ? tierFor(customer.points) : 'bronze';
    const tierDisc = state.config.tiers[tierKey].discount;
    const loyaltyDiscount = round(subtotal * tierDisc);

    const rewardDiscount = order.redeemReward ? Math.min(subtotal, 5.00) : 0;

    const taxable = Math.max(0, subtotal - comboDiscount - loyaltyDiscount - rewardDiscount);
    const tax = round(taxable * state.config.taxRate);
    const tip = order.tip || 0;
    const total = round(taxable + tax + tip);

    order.pricing = {
      subtotal: round(subtotal),
      comboDiscount: round(comboDiscount),
      loyaltyDiscount,
      rewardDiscount,
      tier: tierKey,
      tax,
      tip: round(tip),
      total
    };
    return order.pricing;
  }

  // ───────────────────────────── Orders ─────────────────────────────
  function newOrder(opts) {
    opts = opts || {};
    const order = {
      id: uid('ORD'),
      mode: opts.mode === 'dine_in' ? 'dine_in' : 'take_away',
      tableNumber: opts.tableNumber || null,
      customerId: opts.customerId || null,
      customerName: opts.customerName || 'Cliente',
      items: [],
      appliedCombos: [],
      redeemReward: false,
      tip: 0,
      status: 'open',
      createdAt: new Date().toISOString(),
      pricing: null,
      payment: null
    };
    state.currentOrder = order;
    return order;
  }

  function addItem(orderId, payload) {
    const order = getOrder(orderId);
    const item = findItem(payload.sku);
    if (!item) throw new Error('SKU inválido');
    if (item.sizes && !payload.size) payload.size = item.sizes[0];
    if (!payload.temp && item.temp && item.temp.length) payload.temp = item.temp[0];

    const line = {
      id: uid('LIN'),
      sku: payload.sku,
      name: item.name,
      qty: payload.qty || 1,
      size: payload.size || null,
      temp: payload.temp || null,
      milk: payload.milk || null,
      syrups: payload.syrups || [],
      extras: payload.extras || [],
      notes: payload.notes || ''
    };
    order.items.push(line);
    recalcOrder(order);
    return line;
  }

  function removeItem(orderId, lineId) {
    const order = getOrder(orderId);
    const idx = order.items.findIndex(l => l.id === lineId);
    if (idx === -1) return false;
    order.items.splice(idx, 1);
    recalcOrder(order);
    return true;
  }

  function updateItem(orderId, lineId, patch) {
    const order = getOrder(orderId);
    const line = order.items.find(l => l.id === lineId);
    if (!line) throw new Error('Línea no encontrada');
    Object.assign(line, patch);
    recalcOrder(order);
    return line;
  }

  function setTip(orderId, amount) {
    const order = getOrder(orderId);
    order.tip = Math.max(0, Number(amount) || 0);
    recalcOrder(order);
    return order.pricing;
  }

  function getOrder(orderId) {
    if (state.currentOrder && state.currentOrder.id === orderId) return state.currentOrder;
    const o = state.orders.find(x => x.id === orderId);
    if (!o) throw new Error('Orden no encontrada: ' + orderId);
    return o;
  }

  function checkout(orderId, payment) {
    const order = getOrder(orderId);
    if (!order.items.length) throw new Error('Orden vacía');
    recalcOrder(order);
    order.payment = {
      method: (payment && payment.method) || 'cash',
      amount: (payment && payment.amount) || order.pricing.total,
      change: Math.max(0, ((payment && payment.amount) || 0) - order.pricing.total),
      ref: (payment && payment.ref) || null,
      paidAt: new Date().toISOString()
    };
    order.status = 'paid';

    // Lealtad
    if (order.customerId) {
      const c = state.customers[order.customerId];
      if (c) {
        if (order.redeemReward) {
          c.points = Math.max(0, c.points - state.config.pointsPerReward);
        }
        const earned = Math.floor(order.pricing.total * state.config.loyaltyRate)
                     + order.items.reduce((s,l) => s + ((findItem(l.sku)||{}).loyaltyPoints||0), 0);
        c.points += earned;
        c.visits += 1;
        c.totalSpent = round(c.totalSpent + order.pricing.total);
        c.tier = tierFor(c.points);
        order.loyaltyEarned = earned;
      }
    }

    state.orders.push(order);
    if (state.currentOrder && state.currentOrder.id === order.id) state.currentOrder = null;
    return order;
  }

  function voidOrder(orderId, reason) {
    const order = getOrder(orderId);
    order.status = 'void';
    order.voidReason = reason || '';
    return order;
  }

  // ───────────────────────────── Loyalty ─────────────────────────────
  function registerCustomer(data) {
    const id = data.id || uid('CUS');
    state.customers[id] = {
      id,
      name: data.name || 'Sin nombre',
      phone: data.phone || '',
      email: data.email || '',
      points: data.points || 0,
      visits: 0,
      totalSpent: 0,
      tier: 'bronze',
      joinedAt: new Date().toISOString()
    };
    state.customers[id].tier = tierFor(state.customers[id].points);
    return state.customers[id];
  }

  function getCustomer(id) { return state.customers[id] || null; }

  function redeemReward(orderId, customerId) {
    const order = getOrder(orderId);
    const c = state.customers[customerId];
    if (!c) throw new Error('Cliente no encontrado');
    if (c.points < state.config.pointsPerReward) throw new Error('Puntos insuficientes');
    order.customerId = customerId;
    order.redeemReward = true;
    recalcOrder(order);
    return order.pricing;
  }

  function loyaltyStatus(customerId) {
    const c = state.customers[customerId];
    if (!c) return null;
    const tierKey = tierFor(c.points);
    const tiers = state.config.tiers;
    const ordered = ['bronze','silver','gold','platinum'];
    const idx = ordered.indexOf(tierKey);
    const next = ordered[idx + 1];
    const nextNeeds = next ? Math.max(0, tiers[next].min - c.points) : 0;
    return {
      customer: c,
      tier: tierKey,
      discount: tiers[tierKey].discount,
      pointsToNextTier: nextNeeds,
      nextTier: next || null,
      rewardsAvailable: Math.floor(c.points / state.config.pointsPerReward)
    };
  }

  // ───────────────────────────── Reportes ─────────────────────────────
  function dailyReport(dateISO) {
    const day = (dateISO || new Date().toISOString()).slice(0, 10);
    const paid = state.orders.filter(o => o.status === 'paid' && o.createdAt.slice(0,10) === day);
    const totals = paid.reduce((acc,o) => {
      acc.gross += o.pricing.total;
      acc.tax   += o.pricing.tax;
      acc.tip   += o.pricing.tip;
      acc.count += 1;
      acc.modes[o.mode] = (acc.modes[o.mode] || 0) + 1;
      return acc;
    }, { gross:0, tax:0, tip:0, count:0, modes:{} });
    totals.gross = round(totals.gross);
    totals.tax   = round(totals.tax);
    totals.tip   = round(totals.tip);
    totals.avgTicket = totals.count ? round(totals.gross / totals.count) : 0;
    totals.day = day;
    return totals;
  }

  function topItems(limit) {
    const counter = {};
    state.orders.filter(o => o.status === 'paid').forEach(o => {
      o.items.forEach(l => {
        counter[l.sku] = counter[l.sku] || { sku:l.sku, name:l.name, qty:0, revenue:0 };
        counter[l.sku].qty     += l.qty;
        counter[l.sku].revenue += l.subtotal;
      });
    });
    return Object.values(counter)
      .sort((a,b) => b.qty - a.qty)
      .slice(0, limit || 10);
  }

  // ───────────────────────────── Recibo ─────────────────────────────
  function renderReceipt(orderId) {
    const o = getOrder(orderId);
    const lines = [];
    lines.push('===== VOLVIX CAFÉ =====');
    lines.push('Orden: ' + o.id);
    lines.push('Modo:  ' + (o.mode === 'dine_in' ? 'Mesa ' + (o.tableNumber||'-') : 'Para llevar'));
    lines.push('Cliente: ' + (o.customerName || '-'));
    lines.push('-----------------------');
    o.items.forEach(l => {
      const meta = [l.size && SIZES[l.size] && SIZES[l.size].label, l.temp, l.milk && MILKS[l.milk] && MILKS[l.milk].label]
        .filter(Boolean).join(' / ');
      lines.push(`${l.qty}x ${l.name}  $${l.subtotal.toFixed(2)}`);
      if (meta) lines.push('   · ' + meta);
      if (l.syrups && l.syrups.length) lines.push('   · Syrups: ' + l.syrups.map(s=>SYRUPS[s].label).join(', '));
      if (l.extras && l.extras.length) lines.push('   · Extras: ' + l.extras.map(e=>EXTRAS[e].label).join(', '));
      if (l.notes) lines.push('   · Nota: ' + l.notes);
    });
    lines.push('-----------------------');
    const p = o.pricing;
    lines.push('Subtotal:  $' + p.subtotal.toFixed(2));
    if (p.comboDiscount)   lines.push('Combos:   -$' + p.comboDiscount.toFixed(2));
    if (p.loyaltyDiscount) lines.push('Lealtad:  -$' + p.loyaltyDiscount.toFixed(2) + ' (' + p.tier + ')');
    if (p.rewardDiscount)  lines.push('Reward:   -$' + p.rewardDiscount.toFixed(2));
    lines.push('Impuesto:  $' + p.tax.toFixed(2));
    if (p.tip) lines.push('Propina:   $' + p.tip.toFixed(2));
    lines.push('TOTAL:     $' + p.total.toFixed(2));
    if (o.loyaltyEarned) lines.push('Puntos ganados: ' + o.loyaltyEarned);
    lines.push('=======================');
    return lines.join('\n');
  }

  // ───────────────────────────── API pública ─────────────────────────────
  const CafeAPI = {
    // catálogos
    SIZES, MILKS, SYRUPS, EXTRAS, TEMPERATURES, MENU, COMBOS,
    listMenu: () => MENU.slice(),
    listByCategory: (cat) => MENU.filter(m => m.category === cat),
    findItem,
    // orden
    newOrder, addItem, removeItem, updateItem, setTip,
    getOrder, checkout, voidOrder, recalc: recalcOrder,
    currentOrder: () => state.currentOrder,
    listOrders: () => state.orders.slice(),
    // lealtad
    registerCustomer, getCustomer, redeemReward, loyaltyStatus,
    // reportes
    dailyReport, topItems, renderReceipt,
    // config
    config: state.config,
    setTaxRate: (r) => { state.config.taxRate = Number(r) || 0; },
    version: '1.0.0'
  };

  global.CafeAPI = CafeAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = CafeAPI;
})(typeof window !== 'undefined' ? window : globalThis);
