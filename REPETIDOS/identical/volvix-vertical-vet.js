/**
 * VOLVIX VERTICAL — VETERINARIA
 * Módulo POS especializado para clínicas veterinarias.
 * Gestiona mascotas, vacunas, peso histórico, recetas, cirugías y productos vet.
 *
 * Expone window.VetAPI con métodos completos para integración con el POS base.
 *
 * @module volvix-vertical-vet
 * @version 1.0.0
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // STORAGE KEYS
  // ──────────────────────────────────────────────────────────────
  const KEYS = {
    PETS:       'volvix_vet_pets',
    VACCINES:   'volvix_vet_vaccines',
    WEIGHTS:    'volvix_vet_weights',
    HISTORY:    'volvix_vet_history',
    PRESCRIPS:  'volvix_vet_prescriptions',
    SURGERIES:  'volvix_vet_surgeries',
    PRODUCTS:   'volvix_vet_products',
    OWNERS:     'volvix_vet_owners'
  };

  // ──────────────────────────────────────────────────────────────
  // CATÁLOGOS
  // ──────────────────────────────────────────────────────────────
  const SPECIES = ['perro', 'gato', 'ave', 'reptil', 'roedor', 'conejo', 'pez', 'exotico'];

  const VACCINE_CATALOG = {
    perro: [
      { id: 'puppy',      name: 'Puppy DP',           interval_days: 21,  required: true  },
      { id: 'multiple',   name: 'Múltiple (DHPP)',    interval_days: 365, required: true  },
      { id: 'rabia',      name: 'Antirrábica',        interval_days: 365, required: true  },
      { id: 'bordetella', name: 'Bordetella',         interval_days: 365, required: false },
      { id: 'leptos',     name: 'Leptospirosis',      interval_days: 365, required: false }
    ],
    gato: [
      { id: 'triple',  name: 'Triple Felina',     interval_days: 365, required: true  },
      { id: 'rabia',   name: 'Antirrábica',       interval_days: 365, required: true  },
      { id: 'leucemia',name: 'Leucemia Felina',   interval_days: 365, required: false }
    ],
    ave:    [{ id: 'newcastle', name: 'Newcastle', interval_days: 180, required: false }],
    conejo: [{ id: 'mixoma',    name: 'Mixomatosis', interval_days: 180, required: false }]
  };

  const SURGERY_TYPES = [
    'esterilizacion', 'castracion', 'limpieza_dental', 'extraccion_dental',
    'tumor', 'fractura', 'cesarea', 'oftalmologia', 'cirugia_general', 'urgencia'
  ];

  // ──────────────────────────────────────────────────────────────
  // STORAGE HELPERS
  // ──────────────────────────────────────────────────────────────
  function _get(key)         { try { return JSON.parse(localStorage.getItem(key)) || []; } catch(e) { return []; } }
  function _set(key, val)    { localStorage.setItem(key, JSON.stringify(val)); }
  function _uid(prefix)      { return prefix + '_' + Date.now() + '_' + Math.floor(Math.random()*10000); }
  function _now()            { return new Date().toISOString(); }
  function _addDays(iso, d)  { const dt = new Date(iso); dt.setDate(dt.getDate() + d); return dt.toISOString(); }
  function _daysBetween(a,b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

  // ──────────────────────────────────────────────────────────────
  // OWNERS (DUEÑOS)
  // ──────────────────────────────────────────────────────────────
  function createOwner(data) {
    if (!data || !data.name) throw new Error('Nombre del dueño requerido');
    const owner = {
      id:       _uid('own'),
      name:     data.name,
      phone:    data.phone || '',
      email:    data.email || '',
      address:  data.address || '',
      notes:    data.notes || '',
      created:  _now()
    };
    const owners = _get(KEYS.OWNERS); owners.push(owner); _set(KEYS.OWNERS, owners);
    return owner;
  }
  function getOwner(id)     { return _get(KEYS.OWNERS).find(o => o.id === id) || null; }
  function listOwners()     { return _get(KEYS.OWNERS); }
  function searchOwners(q)  { const t=(q||'').toLowerCase(); return _get(KEYS.OWNERS).filter(o => o.name.toLowerCase().includes(t) || o.phone.includes(t)); }

  // ──────────────────────────────────────────────────────────────
  // PETS (MASCOTAS)
  // ──────────────────────────────────────────────────────────────
  function createPet(data) {
    if (!data || !data.name)      throw new Error('Nombre de la mascota requerido');
    if (!data.species || !SPECIES.includes(data.species))
      throw new Error('Especie inválida. Permitidas: ' + SPECIES.join(', '));
    if (!data.owner_id || !getOwner(data.owner_id))
      throw new Error('owner_id inválido o inexistente');

    const pet = {
      id:          _uid('pet'),
      owner_id:    data.owner_id,
      name:        data.name,
      species:     data.species,
      breed:       data.breed || 'Mestizo',
      sex:         data.sex || 'desconocido',
      sterilized:  !!data.sterilized,
      birth_date:  data.birth_date || null,
      color:       data.color || '',
      microchip:   data.microchip || '',
      allergies:   data.allergies || [],
      conditions:  data.conditions || [],
      photo_url:   data.photo_url || '',
      notes:       data.notes || '',
      created:     _now(),
      updated:     _now()
    };
    const pets = _get(KEYS.PETS); pets.push(pet); _set(KEYS.PETS, pets);
    return pet;
  }

  function getPet(id) {
    const pet = _get(KEYS.PETS).find(p => p.id === id);
    if (!pet) return null;
    return Object.assign({}, pet, {
      age_years: pet.birth_date ? +(((Date.now() - new Date(pet.birth_date)) / (365.25*86400000))).toFixed(1) : null,
      owner:     getOwner(pet.owner_id)
    });
  }

  function listPets(owner_id) {
    const all = _get(KEYS.PETS);
    return owner_id ? all.filter(p => p.owner_id === owner_id) : all;
  }

  function updatePet(id, patch) {
    const pets = _get(KEYS.PETS);
    const i = pets.findIndex(p => p.id === id);
    if (i < 0) throw new Error('Mascota no encontrada');
    pets[i] = Object.assign({}, pets[i], patch, { updated: _now() });
    _set(KEYS.PETS, pets);
    return pets[i];
  }

  function deletePet(id) {
    _set(KEYS.PETS, _get(KEYS.PETS).filter(p => p.id !== id));
    return true;
  }

  function getPetProfile(id) {
    const pet = getPet(id);
    if (!pet) return null;
    return {
      pet:           pet,
      vaccines:      listVaccines(id),
      vaccines_due:  vaccinesDue(id),
      weights:       listWeights(id),
      last_weight:   lastWeight(id),
      history:       listHistory(id),
      prescriptions: listPrescriptions(id),
      surgeries:     listSurgeries(id)
    };
  }

  // ──────────────────────────────────────────────────────────────
  // VACUNAS
  // ──────────────────────────────────────────────────────────────
  function applyVaccine(pet_id, data) {
    if (!getPet(pet_id))     throw new Error('Mascota no encontrada');
    if (!data || !data.name) throw new Error('Nombre de la vacuna requerido');

    const v = {
      id:          _uid('vac'),
      pet_id:      pet_id,
      name:        data.name,
      type:        data.type || 'general',
      lot:         data.lot || '',
      brand:       data.brand || '',
      vet:         data.vet || '',
      applied_at:  data.applied_at || _now(),
      next_due:    data.next_due || (data.interval_days ? _addDays(data.applied_at || _now(), data.interval_days) : null),
      notes:       data.notes || ''
    };
    const all = _get(KEYS.VACCINES); all.push(v); _set(KEYS.VACCINES, all);
    addHistory(pet_id, { type: 'vaccine', ref_id: v.id, summary: 'Vacuna aplicada: ' + v.name });
    return v;
  }

  function listVaccines(pet_id) {
    return _get(KEYS.VACCINES).filter(v => v.pet_id === pet_id).sort((a,b) => b.applied_at.localeCompare(a.applied_at));
  }

  function vaccinesDue(pet_id) {
    const today = _now();
    return _get(KEYS.VACCINES)
      .filter(v => v.pet_id === pet_id && v.next_due && v.next_due <= today);
  }

  function vaccineCatalog(species) { return VACCINE_CATALOG[species] || []; }

  // ──────────────────────────────────────────────────────────────
  // PESO
  // ──────────────────────────────────────────────────────────────
  function recordWeight(pet_id, kg, notes) {
    if (!getPet(pet_id))                  throw new Error('Mascota no encontrada');
    if (typeof kg !== 'number' || kg <= 0) throw new Error('Peso inválido');
    const w = { id: _uid('w'), pet_id: pet_id, kg: kg, notes: notes || '', recorded_at: _now() };
    const all = _get(KEYS.WEIGHTS); all.push(w); _set(KEYS.WEIGHTS, all);
    addHistory(pet_id, { type: 'weight', ref_id: w.id, summary: 'Peso registrado: ' + kg + ' kg' });
    return w;
  }
  function listWeights(pet_id) {
    return _get(KEYS.WEIGHTS).filter(w => w.pet_id === pet_id).sort((a,b) => a.recorded_at.localeCompare(b.recorded_at));
  }
  function lastWeight(pet_id) {
    const arr = listWeights(pet_id); return arr.length ? arr[arr.length-1] : null;
  }
  function weightTrend(pet_id) {
    const arr = listWeights(pet_id);
    if (arr.length < 2) return 'sin_datos';
    const diff = arr[arr.length-1].kg - arr[0].kg;
    if (Math.abs(diff) < 0.2) return 'estable';
    return diff > 0 ? 'subiendo' : 'bajando';
  }

  // ──────────────────────────────────────────────────────────────
  // HISTORIAL CLÍNICO
  // ──────────────────────────────────────────────────────────────
  function addHistory(pet_id, entry) {
    const h = {
      id:        _uid('h'),
      pet_id:    pet_id,
      type:      entry.type || 'note',
      ref_id:    entry.ref_id || null,
      summary:   entry.summary || '',
      detail:    entry.detail || '',
      vet:       entry.vet || '',
      timestamp: entry.timestamp || _now()
    };
    const all = _get(KEYS.HISTORY); all.push(h); _set(KEYS.HISTORY, all);
    return h;
  }
  function listHistory(pet_id) {
    return _get(KEYS.HISTORY).filter(h => h.pet_id === pet_id).sort((a,b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ──────────────────────────────────────────────────────────────
  // RECETAS
  // ──────────────────────────────────────────────────────────────
  function createPrescription(pet_id, data) {
    if (!getPet(pet_id)) throw new Error('Mascota no encontrada');
    if (!data || !Array.isArray(data.items) || !data.items.length)
      throw new Error('Receta requiere al menos un medicamento');

    const rx = {
      id:           _uid('rx'),
      pet_id:       pet_id,
      vet:          data.vet || '',
      diagnosis:    data.diagnosis || '',
      items:        data.items.map(it => ({
                      drug:      it.drug,
                      dose:      it.dose      || '',
                      frequency: it.frequency || '',
                      duration:  it.duration  || '',
                      route:     it.route     || 'oral',
                      notes:     it.notes     || ''
                    })),
      indications:  data.indications || '',
      issued_at:    _now(),
      valid_until:  data.valid_until || _addDays(_now(), 30)
    };
    const all = _get(KEYS.PRESCRIPS); all.push(rx); _set(KEYS.PRESCRIPS, all);
    addHistory(pet_id, { type: 'prescription', ref_id: rx.id, summary: 'Receta: ' + rx.diagnosis });
    return rx;
  }
  function listPrescriptions(pet_id) {
    return _get(KEYS.PRESCRIPS).filter(r => r.pet_id === pet_id).sort((a,b) => b.issued_at.localeCompare(a.issued_at));
  }
  function printPrescription(rx_id) {
    const rx = _get(KEYS.PRESCRIPS).find(r => r.id === rx_id);
    if (!rx) return null;
    const pet = getPet(rx.pet_id);
    let out = '=== RECETA VETERINARIA ===\n';
    out += 'Paciente: ' + pet.name + ' (' + pet.species + ', ' + pet.breed + ')\n';
    out += 'Dueño:    ' + (pet.owner ? pet.owner.name : '-') + '\n';
    out += 'Fecha:    ' + rx.issued_at.split('T')[0] + '\n';
    out += 'Dx:       ' + rx.diagnosis + '\n\n';
    rx.items.forEach((it, i) => {
      out += (i+1) + '. ' + it.drug + ' — ' + it.dose + ' / ' + it.frequency + ' x ' + it.duration + ' (' + it.route + ')\n';
    });
    out += '\nIndicaciones: ' + rx.indications + '\n';
    out += 'Vet: ' + rx.vet + '\n';
    return out;
  }

  // ──────────────────────────────────────────────────────────────
  // CIRUGÍAS
  // ──────────────────────────────────────────────────────────────
  function scheduleSurgery(pet_id, data) {
    if (!getPet(pet_id))           throw new Error('Mascota no encontrada');
    if (!data || !data.type)       throw new Error('Tipo de cirugía requerido');
    if (!SURGERY_TYPES.includes(data.type))
      throw new Error('Tipo inválido. Válidos: ' + SURGERY_TYPES.join(', '));

    const s = {
      id:          _uid('sx'),
      pet_id:      pet_id,
      type:        data.type,
      surgeon:     data.surgeon || '',
      anesthesia:  data.anesthesia || 'general',
      scheduled:   data.scheduled || _now(),
      status:      'agendada',
      pre_notes:   data.pre_notes || '',
      post_notes:  '',
      complications: '',
      cost:        data.cost || 0,
      created:     _now()
    };
    const all = _get(KEYS.SURGERIES); all.push(s); _set(KEYS.SURGERIES, all);
    addHistory(pet_id, { type: 'surgery_scheduled', ref_id: s.id, summary: 'Cirugía agendada: ' + s.type });
    return s;
  }
  function completeSurgery(surgery_id, data) {
    const all = _get(KEYS.SURGERIES);
    const i = all.findIndex(s => s.id === surgery_id);
    if (i < 0) throw new Error('Cirugía no encontrada');
    all[i] = Object.assign({}, all[i], {
      status:        'completada',
      post_notes:    data.post_notes || '',
      complications: data.complications || '',
      completed_at:  _now()
    });
    _set(KEYS.SURGERIES, all);
    addHistory(all[i].pet_id, { type: 'surgery_done', ref_id: surgery_id, summary: 'Cirugía completada: ' + all[i].type });
    return all[i];
  }
  function listSurgeries(pet_id) {
    const all = _get(KEYS.SURGERIES);
    return (pet_id ? all.filter(s => s.pet_id === pet_id) : all).sort((a,b) => b.scheduled.localeCompare(a.scheduled));
  }

  // ──────────────────────────────────────────────────────────────
  // PRODUCTOS VETERINARIOS
  // ──────────────────────────────────────────────────────────────
  function addProduct(data) {
    if (!data || !data.name)            throw new Error('Nombre del producto requerido');
    if (typeof data.price !== 'number') throw new Error('Precio inválido');
    const p = {
      id:               _uid('prd'),
      name:             data.name,
      category:         data.category || 'general',     // medicamento, alimento, accesorio, servicio
      sku:              data.sku || '',
      price:            data.price,
      cost:             data.cost || 0,
      stock:            data.stock || 0,
      min_stock:        data.min_stock || 0,
      requires_rx:      !!data.requires_rx,
      controlled:       !!data.controlled,
      species_target:   data.species_target || [],
      presentation:     data.presentation || '',
      lot:              data.lot || '',
      expiry:           data.expiry || null,
      created:          _now()
    };
    const all = _get(KEYS.PRODUCTS); all.push(p); _set(KEYS.PRODUCTS, all);
    return p;
  }
  function listProducts(filter) {
    let arr = _get(KEYS.PRODUCTS);
    if (filter && filter.category) arr = arr.filter(p => p.category === filter.category);
    if (filter && filter.low_stock) arr = arr.filter(p => p.stock <= p.min_stock);
    if (filter && filter.requires_rx) arr = arr.filter(p => p.requires_rx);
    return arr;
  }
  function adjustStock(product_id, delta, reason) {
    const all = _get(KEYS.PRODUCTS);
    const i = all.findIndex(p => p.id === product_id);
    if (i < 0) throw new Error('Producto no encontrado');
    all[i].stock = Math.max(0, all[i].stock + delta);
    all[i].last_adjustment = { delta: delta, reason: reason || '', at: _now() };
    _set(KEYS.PRODUCTS, all);
    return all[i];
  }
  function lowStockAlerts() {
    return _get(KEYS.PRODUCTS).filter(p => p.stock <= p.min_stock);
  }
  function expiringProducts(days) {
    const limit = _addDays(_now(), days || 30);
    return _get(KEYS.PRODUCTS).filter(p => p.expiry && p.expiry <= limit);
  }

  // ──────────────────────────────────────────────────────────────
  // DASHBOARD / STATS
  // ──────────────────────────────────────────────────────────────
  function dashboard() {
    const pets = _get(KEYS.PETS);
    const today = _now();
    return {
      total_pets:          pets.length,
      total_owners:        _get(KEYS.OWNERS).length,
      species_breakdown:   pets.reduce((acc,p) => { acc[p.species]=(acc[p.species]||0)+1; return acc; }, {}),
      vaccines_overdue:    _get(KEYS.VACCINES).filter(v => v.next_due && v.next_due <= today).length,
      surgeries_pending:   _get(KEYS.SURGERIES).filter(s => s.status === 'agendada').length,
      low_stock_count:     lowStockAlerts().length,
      expiring_soon_count: expiringProducts(30).length
    };
  }

  // ──────────────────────────────────────────────────────────────
  // EXPORT — window.VetAPI
  // ──────────────────────────────────────────────────────────────
  const VetAPI = {
    // catálogos
    SPECIES:        SPECIES,
    SURGERY_TYPES:  SURGERY_TYPES,
    vaccineCatalog: vaccineCatalog,

    // owners
    createOwner: createOwner, getOwner: getOwner, listOwners: listOwners, searchOwners: searchOwners,

    // pets
    createPet: createPet, getPet: getPet, listPets: listPets, updatePet: updatePet,
    deletePet: deletePet, getPetProfile: getPetProfile,

    // vacunas
    applyVaccine: applyVaccine, listVaccines: listVaccines, vaccinesDue: vaccinesDue,

    // peso
    recordWeight: recordWeight, listWeights: listWeights, lastWeight: lastWeight, weightTrend: weightTrend,

    // historial
    addHistory: addHistory, listHistory: listHistory,

    // recetas
    createPrescription: createPrescription, listPrescriptions: listPrescriptions, printPrescription: printPrescription,

    // cirugías
    scheduleSurgery: scheduleSurgery, completeSurgery: completeSurgery, listSurgeries: listSurgeries,

    // productos
    addProduct: addProduct, listProducts: listProducts, adjustStock: adjustStock,
    lowStockAlerts: lowStockAlerts, expiringProducts: expiringProducts,

    // dashboard
    dashboard: dashboard,

    version: '1.0.0'
  };

  global.VetAPI = VetAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = VetAPI;

})(typeof window !== 'undefined' ? window : globalThis);
