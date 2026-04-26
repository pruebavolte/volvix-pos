/**
 * Volvix Vertical - Gimnasio / Fitness Center
 * POS especializado para gimnasios: membresías, check-in, clases, entrenadores, suplementos
 * Expone window.GymAPI
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'volvix_gym_v1';
  const TODAY = () => new Date().toISOString().slice(0, 10);
  const NOW = () => new Date().toISOString();
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // ---------- Estado ----------
  const defaultState = () => ({
    members: [],          // socios
    plans: [
      { id: 'plan_basic',   name: 'Básico Mensual',   price: 350,  days: 30, classesIncluded: 0,  description: 'Acceso a área de pesas y cardio' },
      { id: 'plan_full',    name: 'Full Mensual',     price: 550,  days: 30, classesIncluded: 8,  description: 'Acceso total + 8 clases grupales' },
      { id: 'plan_premium', name: 'Premium Mensual',  price: 850,  days: 30, classesIncluded: 999,description: 'Acceso ilimitado + clases ilimitadas + sauna' },
      { id: 'plan_trim',    name: 'Trimestral',       price: 1400, days: 90, classesIncluded: 24, description: 'Plan 3 meses con 10% descuento' },
      { id: 'plan_year',    name: 'Anual',            price: 4800, days: 365,classesIncluded: 999,description: 'Plan anual con clases ilimitadas' },
      { id: 'plan_day',     name: 'Pase Diario',      price: 60,   days: 1,  classesIncluded: 1,  description: 'Acceso por un día' }
    ],
    memberships: [],      // membresías activas/históricas
    checkIns: [],         // historial de accesos
    classes: [],          // catálogo de clases grupales
    classBookings: [],    // reservas de clases
    trainers: [],         // entrenadores
    ptSessions: [],       // sesiones personal training
    supplements: [],      // inventario suplementos / merch
    sales: [],            // ventas POS suplementos
    lockers: [],          // casilleros
    cashRegister: { opening: 0, sales: 0, isOpen: false, openedAt: null }
  });

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedDemo(defaultState());
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      console.warn('[GymAPI] estado corrupto, regenerando', e);
      return seedDemo(defaultState());
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[GymAPI] no se pudo guardar', e);
    }
  }

  function seedDemo(s) {
    s.trainers.push(
      { id: uid('trn'), name: 'Carlos Méndez',    specialty: 'Hipertrofia / Fuerza',  ratePerHour: 250, active: true },
      { id: uid('trn'), name: 'Lucía Hernández',  specialty: 'Yoga / Pilates',         ratePerHour: 220, active: true },
      { id: uid('trn'), name: 'Roberto Aguirre',  specialty: 'CrossFit / HIIT',        ratePerHour: 280, active: true }
    );
    s.classes.push(
      { id: uid('cls'), name: 'Spinning AM',  trainerId: s.trainers[2].id, schedule: 'Lun-Vie 06:00', capacity: 20, duration: 45 },
      { id: uid('cls'), name: 'Yoga Flow',    trainerId: s.trainers[1].id, schedule: 'Mar/Jue 19:00', capacity: 15, duration: 60 },
      { id: uid('cls'), name: 'CrossFit WOD', trainerId: s.trainers[2].id, schedule: 'Lun-Sab 18:00', capacity: 12, duration: 60 },
      { id: uid('cls'), name: 'Zumba',        trainerId: s.trainers[1].id, schedule: 'Sab 10:00',     capacity: 25, duration: 55 }
    );
    s.supplements.push(
      { id: uid('sup'), sku: 'WHEY-1KG',  name: 'Whey Protein 1kg',     price: 650, cost: 420, stock: 24, category: 'Proteína' },
      { id: uid('sup'), sku: 'CREA-300',  name: 'Creatina 300g',        price: 380, cost: 240, stock: 18, category: 'Performance' },
      { id: uid('sup'), sku: 'BCAA-30',   name: 'BCAA 30 servicios',    price: 290, cost: 180, stock: 30, category: 'Aminoácidos' },
      { id: uid('sup'), sku: 'PRE-300',   name: 'Pre-Workout 300g',     price: 420, cost: 270, stock: 15, category: 'Performance' },
      { id: uid('sup'), sku: 'SHK-BTL',   name: 'Shaker 700ml',         price: 120, cost: 60,  stock: 40, category: 'Accesorios' },
      { id: uid('sup'), sku: 'TWL-GYM',   name: 'Toalla deportiva',     price: 95,  cost: 45,  stock: 35, category: 'Accesorios' },
      { id: uid('sup'), sku: 'WTR-600',   name: 'Agua mineral 600ml',   price: 18,  cost: 7,   stock: 120,category: 'Bebidas' },
      { id: uid('sup'), sku: 'GTR-500',   name: 'Bebida isotónica',     price: 28,  cost: 14,  stock: 80, category: 'Bebidas' }
    );
    for (let i = 1; i <= 50; i++) {
      s.lockers.push({ id: uid('lk'), number: i, status: 'free', memberId: null, assignedAt: null });
    }
    saveStateFn(s);
    return s;
  }
  function saveStateFn(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} }

  // ---------- Utilidades ----------
  function findMember(idOrCode) {
    return state.members.find(m => m.id === idOrCode || m.accessCode === idOrCode);
  }
  function activeMembership(memberId) {
    const today = TODAY();
    return state.memberships
      .filter(m => m.memberId === memberId && m.endDate >= today && m.status === 'active')
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0] || null;
  }
  function generateAccessCode() {
    let code;
    do {
      code = 'GYM' + Math.floor(100000 + Math.random() * 900000);
    } while (state.members.some(m => m.accessCode === code));
    return code;
  }
  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ---------- Miembros ----------
  function registerMember({ name, email, phone, birthDate, emergencyContact, medicalNotes }) {
    if (!name || !phone) throw new Error('Nombre y teléfono son obligatorios');
    const member = {
      id: uid('mbr'),
      accessCode: generateAccessCode(),
      name, email: email || '', phone,
      birthDate: birthDate || null,
      emergencyContact: emergencyContact || '',
      medicalNotes: medicalNotes || '',
      registeredAt: NOW(),
      photo: null,
      totalCheckIns: 0,
      lastCheckIn: null
    };
    state.members.push(member);
    saveState();
    return member;
  }

  function updateMember(id, patch) {
    const m = state.members.find(x => x.id === id);
    if (!m) throw new Error('Miembro no encontrado');
    Object.assign(m, patch);
    saveState();
    return m;
  }

  // ---------- Membresías ----------
  function sellMembership({ memberId, planId, paymentMethod = 'efectivo', startDate }) {
    const member = findMember(memberId);
    if (!member) throw new Error('Miembro no encontrado');
    const plan = state.plans.find(p => p.id === planId);
    if (!plan) throw new Error('Plan no encontrado');
    const start = startDate || TODAY();
    const end = addDays(start, plan.days);
    const ms = {
      id: uid('ms'),
      memberId: member.id,
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      startDate: start,
      endDate: end,
      classesRemaining: plan.classesIncluded,
      paymentMethod,
      status: 'active',
      soldAt: NOW()
    };
    state.memberships.push(ms);
    state.cashRegister.sales += plan.price;
    saveState();
    return ms;
  }

  // ---------- Check-In ----------
  function checkIn(accessCodeOrId) {
    const member = findMember(accessCodeOrId);
    if (!member) return { ok: false, reason: 'Miembro no encontrado' };
    const ms = activeMembership(member.id);
    if (!ms) return { ok: false, reason: 'Sin membresía activa', member };
    const record = {
      id: uid('chk'),
      memberId: member.id,
      memberName: member.name,
      membershipId: ms.id,
      timestamp: NOW(),
      date: TODAY()
    };
    state.checkIns.push(record);
    member.totalCheckIns = (member.totalCheckIns || 0) + 1;
    member.lastCheckIn = record.timestamp;
    saveState();
    return { ok: true, member, membership: ms, daysRemaining: daysBetween(TODAY(), ms.endDate), record };
  }

  function daysBetween(a, b) {
    return Math.ceil((new Date(b) - new Date(a)) / 86400000);
  }

  function checkInsToday() {
    const today = TODAY();
    return state.checkIns.filter(c => c.date === today);
  }

  // ---------- Clases ----------
  function bookClass({ memberId, classId, date }) {
    const member = findMember(memberId);
    if (!member) throw new Error('Miembro no encontrado');
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) throw new Error('Clase no encontrada');
    const ms = activeMembership(member.id);
    if (!ms) throw new Error('Sin membresía activa');
    if (ms.classesRemaining <= 0) throw new Error('Sin clases disponibles en su plan');
    const targetDate = date || TODAY();
    const sameDay = state.classBookings.filter(b => b.classId === classId && b.date === targetDate && b.status === 'booked');
    if (sameDay.length >= cls.capacity) throw new Error('Clase llena');
    const booking = {
      id: uid('bk'),
      memberId: member.id,
      classId: cls.id,
      className: cls.name,
      date: targetDate,
      bookedAt: NOW(),
      status: 'booked'
    };
    state.classBookings.push(booking);
    if (ms.classesRemaining < 999) ms.classesRemaining -= 1;
    saveState();
    return booking;
  }

  function cancelBooking(bookingId) {
    const b = state.classBookings.find(x => x.id === bookingId);
    if (!b) throw new Error('Reserva no encontrada');
    b.status = 'cancelled';
    const ms = state.memberships.find(m => m.memberId === b.memberId && m.status === 'active');
    if (ms && ms.classesRemaining < 999) ms.classesRemaining += 1;
    saveState();
    return b;
  }

  function classRoster(classId, date) {
    const target = date || TODAY();
    return state.classBookings
      .filter(b => b.classId === classId && b.date === target && b.status === 'booked')
      .map(b => ({ ...b, member: state.members.find(m => m.id === b.memberId) }));
  }

  // ---------- Entrenadores / Personal Training ----------
  function bookPTSession({ memberId, trainerId, date, hours = 1, notes }) {
    const member = findMember(memberId);
    const trainer = state.trainers.find(t => t.id === trainerId);
    if (!member || !trainer) throw new Error('Miembro o entrenador inválido');
    const session = {
      id: uid('pt'),
      memberId: member.id,
      trainerId: trainer.id,
      date: date || TODAY(),
      hours,
      cost: trainer.ratePerHour * hours,
      notes: notes || '',
      status: 'scheduled',
      createdAt: NOW()
    };
    state.ptSessions.push(session);
    saveState();
    return session;
  }

  function completePTSession(sessionId) {
    const s = state.ptSessions.find(x => x.id === sessionId);
    if (!s) throw new Error('Sesión no encontrada');
    s.status = 'completed';
    s.completedAt = NOW();
    state.cashRegister.sales += s.cost;
    saveState();
    return s;
  }

  // ---------- POS Suplementos ----------
  function sellProducts({ memberId = null, items, paymentMethod = 'efectivo' }) {
    if (!Array.isArray(items) || !items.length) throw new Error('Carrito vacío');
    let total = 0;
    const lines = items.map(it => {
      const p = state.supplements.find(s => s.id === it.id || s.sku === it.id);
      if (!p) throw new Error(`Producto no encontrado: ${it.id}`);
      if (p.stock < it.qty) throw new Error(`Stock insuficiente: ${p.name}`);
      p.stock -= it.qty;
      const subtotal = p.price * it.qty;
      total += subtotal;
      return { sku: p.sku, name: p.name, qty: it.qty, price: p.price, subtotal };
    });
    const sale = {
      id: uid('sale'),
      memberId,
      lines,
      total,
      paymentMethod,
      timestamp: NOW(),
      date: TODAY()
    };
    state.sales.push(sale);
    state.cashRegister.sales += total;
    saveState();
    return sale;
  }

  function restockProduct(sku, qty) {
    const p = state.supplements.find(s => s.sku === sku || s.id === sku);
    if (!p) throw new Error('Producto no encontrado');
    p.stock += qty;
    saveState();
    return p;
  }

  // ---------- Casilleros ----------
  function assignLocker(memberId) {
    const free = state.lockers.find(l => l.status === 'free');
    if (!free) throw new Error('Sin casilleros disponibles');
    free.status = 'occupied';
    free.memberId = memberId;
    free.assignedAt = NOW();
    saveState();
    return free;
  }
  function releaseLocker(lockerId) {
    const l = state.lockers.find(x => x.id === lockerId || x.number === lockerId);
    if (!l) throw new Error('Casillero no encontrado');
    l.status = 'free'; l.memberId = null; l.assignedAt = null;
    saveState();
    return l;
  }

  // ---------- Caja ----------
  function openCash(opening = 0) {
    state.cashRegister = { opening, sales: 0, isOpen: true, openedAt: NOW() };
    saveState();
    return state.cashRegister;
  }
  function closeCash() {
    const snapshot = { ...state.cashRegister, closedAt: NOW(), total: state.cashRegister.opening + state.cashRegister.sales };
    state.cashRegister = { opening: 0, sales: 0, isOpen: false, openedAt: null };
    saveState();
    return snapshot;
  }

  // ---------- Reportes ----------
  function dashboard() {
    const today = TODAY();
    const todaysCheckIns = state.checkIns.filter(c => c.date === today).length;
    const activeMembers = state.members.filter(m => activeMembership(m.id)).length;
    const expiringSoon = state.memberships.filter(m => {
      if (m.status !== 'active') return false;
      const days = daysBetween(today, m.endDate);
      return days >= 0 && days <= 7;
    });
    const todaysSales = state.sales.filter(s => s.date === today).reduce((a, b) => a + b.total, 0);
    const lowStock = state.supplements.filter(p => p.stock <= 10);
    return {
      date: today,
      totalMembers: state.members.length,
      activeMembers,
      todaysCheckIns,
      expiringSoonCount: expiringSoon.length,
      expiringSoon: expiringSoon.slice(0, 10),
      todaysSales,
      lowStockProducts: lowStock,
      cashRegister: state.cashRegister
    };
  }

  function memberReport(memberId) {
    const m = findMember(memberId);
    if (!m) throw new Error('Miembro no encontrado');
    return {
      member: m,
      activeMembership: activeMembership(m.id),
      history: state.memberships.filter(x => x.memberId === m.id),
      checkIns: state.checkIns.filter(x => x.memberId === m.id),
      classBookings: state.classBookings.filter(x => x.memberId === m.id),
      ptSessions: state.ptSessions.filter(x => x.memberId === m.id),
      purchases: state.sales.filter(x => x.memberId === m.id)
    };
  }

  // ---------- API pública ----------
  window.GymAPI = {
    // miembros
    registerMember, updateMember, findMember,
    listMembers: () => [...state.members],
    // membresías
    listPlans: () => [...state.plans],
    sellMembership, activeMembership,
    // check-in
    checkIn, checkInsToday,
    // clases
    listClasses: () => [...state.classes],
    bookClass, cancelBooking, classRoster,
    // entrenadores
    listTrainers: () => state.trainers.filter(t => t.active),
    bookPTSession, completePTSession,
    // pos
    listProducts: () => [...state.supplements],
    sellProducts, restockProduct,
    // casilleros
    listLockers: () => [...state.lockers],
    assignLocker, releaseLocker,
    // caja
    openCash, closeCash,
    getCash: () => ({ ...state.cashRegister }),
    // reportes
    dashboard, memberReport,
    // utilidades
    reset: () => { localStorage.removeItem(STORAGE_KEY); state = loadState(); return true; },
    _state: () => state
  };

  console.log('[GymAPI] Volvix Vertical Gym cargado. Métodos:', Object.keys(window.GymAPI).length);
})();
