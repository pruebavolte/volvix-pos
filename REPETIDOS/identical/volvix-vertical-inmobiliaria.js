/* ============================================================================
 * VOLVIX VERTICAL — INMOBILIARIA
 * POS especializado para sector inmobiliario.
 * Gestiona: propiedades, agentes, leads, comisiones, contratos y visitas.
 * Expone: window.InmobiliariaAPI
 * ============================================================================ */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------
  const CONFIG = {
    storageKey: 'volvix_inmobiliaria_v1',
    currency: 'USD',
    commissionDefaultPct: 3.0,    // % por defecto sobre valor de venta
    commissionRentPct: 8.0,       // % sobre canon mensual (rentas)
    leadFollowUpDays: 3,
    contractTypes: ['VENTA', 'RENTA', 'ANTICIPO', 'OPCION'],
    propertyStatuses: ['DISPONIBLE', 'RESERVADA', 'VENDIDA', 'RENTADA', 'INACTIVA'],
    propertyTypes: ['CASA', 'DEPARTAMENTO', 'TERRENO', 'OFICINA', 'LOCAL', 'BODEGA'],
    leadStages: ['NUEVO', 'CONTACTADO', 'VISITA', 'OFERTA', 'CERRADO', 'PERDIDO']
  };

  // -------------------------------------------------------------------------
  // ESTADO
  // -------------------------------------------------------------------------
  const state = {
    properties: [],
    agents: [],
    leads: [],
    contracts: [],
    visits: [],
    commissions: []
  };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function nowISO() { return new Date().toISOString(); }

  function persist() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
      }
    } catch (e) { console.warn('[Inmobiliaria] persist fallo:', e); }
  }

  function restore() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(state, data);
    } catch (e) { console.warn('[Inmobiliaria] restore fallo:', e); }
  }

  // -------------------------------------------------------------------------
  // PROPIEDADES
  // -------------------------------------------------------------------------
  function addProperty(p) {
    if (!p || !p.titulo) throw new Error('Propiedad requiere titulo');
    if (!CONFIG.propertyTypes.includes(p.tipo)) {
      throw new Error('Tipo invalido: ' + p.tipo);
    }
    const prop = {
      id: uid('prop'),
      titulo: p.titulo,
      tipo: p.tipo,
      direccion: p.direccion || '',
      ciudad: p.ciudad || '',
      precio: Number(p.precio) || 0,
      precioRenta: Number(p.precioRenta) || 0,
      m2: Number(p.m2) || 0,
      habitaciones: Number(p.habitaciones) || 0,
      banos: Number(p.banos) || 0,
      estacionamientos: Number(p.estacionamientos) || 0,
      estado: p.estado || 'DISPONIBLE',
      descripcion: p.descripcion || '',
      fotos: p.fotos || [],
      agenteId: p.agenteId || null,
      propietario: p.propietario || '',
      comisionPct: Number(p.comisionPct) || CONFIG.commissionDefaultPct,
      creadoEn: nowISO(),
      actualizadoEn: nowISO()
    };
    state.properties.push(prop);
    persist();
    return prop;
  }

  function updateProperty(id, patch) {
    const idx = state.properties.findIndex(x => x.id === id);
    if (idx < 0) throw new Error('Propiedad no encontrada: ' + id);
    state.properties[idx] = Object.assign({}, state.properties[idx], patch, {
      actualizadoEn: nowISO()
    });
    persist();
    return state.properties[idx];
  }

  function removeProperty(id) {
    const before = state.properties.length;
    state.properties = state.properties.filter(x => x.id !== id);
    persist();
    return state.properties.length < before;
  }

  function listProperties(filter) {
    filter = filter || {};
    return state.properties.filter(p => {
      if (filter.estado && p.estado !== filter.estado) return false;
      if (filter.tipo && p.tipo !== filter.tipo) return false;
      if (filter.ciudad && p.ciudad !== filter.ciudad) return false;
      if (filter.agenteId && p.agenteId !== filter.agenteId) return false;
      if (filter.precioMin && p.precio < filter.precioMin) return false;
      if (filter.precioMax && p.precio > filter.precioMax) return false;
      return true;
    });
  }

  function getProperty(id) {
    return state.properties.find(x => x.id === id) || null;
  }

  // -------------------------------------------------------------------------
  // AGENTES
  // -------------------------------------------------------------------------
  function addAgent(a) {
    if (!a || !a.nombre) throw new Error('Agente requiere nombre');
    const agent = {
      id: uid('age'),
      nombre: a.nombre,
      email: a.email || '',
      telefono: a.telefono || '',
      licencia: a.licencia || '',
      comisionSplitPct: Number(a.comisionSplitPct) || 50, // % del split del agente
      activo: a.activo !== false,
      creadoEn: nowISO()
    };
    state.agents.push(agent);
    persist();
    return agent;
  }

  function listAgents(activos) {
    if (typeof activos === 'undefined') return state.agents.slice();
    return state.agents.filter(a => a.activo === activos);
  }

  function getAgent(id) { return state.agents.find(a => a.id === id) || null; }

  function deactivateAgent(id) {
    const a = getAgent(id);
    if (!a) return false;
    a.activo = false;
    persist();
    return true;
  }

  // -------------------------------------------------------------------------
  // LEADS
  // -------------------------------------------------------------------------
  function addLead(l) {
    if (!l || !l.nombre) throw new Error('Lead requiere nombre');
    const lead = {
      id: uid('lead'),
      nombre: l.nombre,
      email: l.email || '',
      telefono: l.telefono || '',
      interes: l.interes || '',           // VENTA / RENTA
      tipoBuscado: l.tipoBuscado || '',
      presupuesto: Number(l.presupuesto) || 0,
      etapa: l.etapa || 'NUEVO',
      propiedadId: l.propiedadId || null,
      agenteId: l.agenteId || null,
      origen: l.origen || 'WEB',
      notas: l.notas || '',
      creadoEn: nowISO(),
      ultimoContacto: null
    };
    state.leads.push(lead);
    persist();
    return lead;
  }

  function moveLeadStage(id, etapa) {
    if (!CONFIG.leadStages.includes(etapa)) {
      throw new Error('Etapa invalida: ' + etapa);
    }
    const l = state.leads.find(x => x.id === id);
    if (!l) throw new Error('Lead no encontrado');
    l.etapa = etapa;
    l.ultimoContacto = nowISO();
    persist();
    return l;
  }

  function listLeads(filter) {
    filter = filter || {};
    return state.leads.filter(l => {
      if (filter.etapa && l.etapa !== filter.etapa) return false;
      if (filter.agenteId && l.agenteId !== filter.agenteId) return false;
      return true;
    });
  }

  function leadsRequiringFollowUp() {
    const cutoff = Date.now() - CONFIG.leadFollowUpDays * 86400000;
    return state.leads.filter(l => {
      if (['CERRADO', 'PERDIDO'].includes(l.etapa)) return false;
      const ref = l.ultimoContacto ? Date.parse(l.ultimoContacto) : Date.parse(l.creadoEn);
      return ref < cutoff;
    });
  }

  // -------------------------------------------------------------------------
  // VISITAS
  // -------------------------------------------------------------------------
  function scheduleVisit(v) {
    if (!v || !v.propiedadId || !v.leadId || !v.fecha) {
      throw new Error('Visita requiere propiedadId, leadId y fecha');
    }
    const visit = {
      id: uid('vis'),
      propiedadId: v.propiedadId,
      leadId: v.leadId,
      agenteId: v.agenteId || null,
      fecha: v.fecha,
      estado: 'AGENDADA',
      feedback: '',
      creadoEn: nowISO()
    };
    state.visits.push(visit);
    persist();
    return visit;
  }

  function completeVisit(id, feedback) {
    const v = state.visits.find(x => x.id === id);
    if (!v) throw new Error('Visita no encontrada');
    v.estado = 'COMPLETADA';
    v.feedback = feedback || '';
    persist();
    return v;
  }

  function cancelVisit(id, motivo) {
    const v = state.visits.find(x => x.id === id);
    if (!v) throw new Error('Visita no encontrada');
    v.estado = 'CANCELADA';
    v.feedback = motivo || '';
    persist();
    return v;
  }

  // -------------------------------------------------------------------------
  // CONTRATOS Y COMISIONES
  // -------------------------------------------------------------------------
  function createContract(c) {
    if (!c || !c.tipo || !c.propiedadId) {
      throw new Error('Contrato requiere tipo y propiedadId');
    }
    if (!CONFIG.contractTypes.includes(c.tipo)) {
      throw new Error('Tipo de contrato invalido: ' + c.tipo);
    }
    const prop = getProperty(c.propiedadId);
    if (!prop) throw new Error('Propiedad no existe');

    const monto = Number(c.monto) ||
      (c.tipo === 'RENTA' ? prop.precioRenta : prop.precio);

    const contract = {
      id: uid('ctr'),
      tipo: c.tipo,
      propiedadId: c.propiedadId,
      leadId: c.leadId || null,
      agenteId: c.agenteId || prop.agenteId || null,
      comprador: c.comprador || '',
      vendedor: c.vendedor || prop.propietario || '',
      monto: monto,
      moneda: c.moneda || CONFIG.currency,
      fechaInicio: c.fechaInicio || nowISO(),
      fechaFin: c.fechaFin || null,
      estado: 'ACTIVO',
      condiciones: c.condiciones || '',
      creadoEn: nowISO()
    };
    state.contracts.push(contract);

    // Generar comision asociada
    const com = generateCommission(contract, prop);
    contract.comisionId = com.id;

    // Actualizar estado de la propiedad
    if (c.tipo === 'VENTA') updateProperty(prop.id, { estado: 'VENDIDA' });
    else if (c.tipo === 'RENTA') updateProperty(prop.id, { estado: 'RENTADA' });
    else if (c.tipo === 'OPCION' || c.tipo === 'ANTICIPO') {
      updateProperty(prop.id, { estado: 'RESERVADA' });
    }

    persist();
    return contract;
  }

  function generateCommission(contract, prop) {
    const pct = (contract.tipo === 'RENTA')
      ? CONFIG.commissionRentPct
      : (prop.comisionPct || CONFIG.commissionDefaultPct);
    const total = +(contract.monto * pct / 100).toFixed(2);

    const agent = contract.agenteId ? getAgent(contract.agenteId) : null;
    const splitPct = agent ? agent.comisionSplitPct : 50;
    const parteAgente = +(total * splitPct / 100).toFixed(2);
    const parteCasa = +(total - parteAgente).toFixed(2);

    const commission = {
      id: uid('com'),
      contratoId: contract.id,
      agenteId: contract.agenteId,
      propiedadId: contract.propiedadId,
      basePct: pct,
      total: total,
      parteAgente: parteAgente,
      parteCasa: parteCasa,
      estado: 'PENDIENTE',
      creadoEn: nowISO(),
      pagadoEn: null
    };
    state.commissions.push(commission);
    return commission;
  }

  function payCommission(id) {
    const c = state.commissions.find(x => x.id === id);
    if (!c) throw new Error('Comision no encontrada');
    c.estado = 'PAGADA';
    c.pagadoEn = nowISO();
    persist();
    return c;
  }

  function cancelContract(id, motivo) {
    const c = state.contracts.find(x => x.id === id);
    if (!c) throw new Error('Contrato no encontrado');
    c.estado = 'CANCELADO';
    c.motivoCancelacion = motivo || '';
    // revertir propiedad a disponible si aplica
    const p = getProperty(c.propiedadId);
    if (p && ['RESERVADA', 'VENDIDA', 'RENTADA'].includes(p.estado)) {
      updateProperty(p.id, { estado: 'DISPONIBLE' });
    }
    // anular comision asociada
    const com = state.commissions.find(x => x.contratoId === id);
    if (com && com.estado === 'PENDIENTE') com.estado = 'ANULADA';
    persist();
    return c;
  }

  // -------------------------------------------------------------------------
  // REPORTES
  // -------------------------------------------------------------------------
  function dashboard() {
    const totalProps = state.properties.length;
    const disponibles = state.properties.filter(p => p.estado === 'DISPONIBLE').length;
    const vendidas = state.properties.filter(p => p.estado === 'VENDIDA').length;
    const rentadas = state.properties.filter(p => p.estado === 'RENTADA').length;
    const inventarioValor = state.properties
      .filter(p => p.estado === 'DISPONIBLE')
      .reduce((s, p) => s + p.precio, 0);
    const comisionesPendientes = state.commissions
      .filter(c => c.estado === 'PENDIENTE')
      .reduce((s, c) => s + c.total, 0);
    const comisionesPagadas = state.commissions
      .filter(c => c.estado === 'PAGADA')
      .reduce((s, c) => s + c.total, 0);
    return {
      totalPropiedades: totalProps,
      disponibles, vendidas, rentadas,
      inventarioValor: +inventarioValor.toFixed(2),
      leadsActivos: state.leads.filter(l =>
        !['CERRADO', 'PERDIDO'].includes(l.etapa)).length,
      visitasAgendadas: state.visits.filter(v => v.estado === 'AGENDADA').length,
      contratosActivos: state.contracts.filter(c => c.estado === 'ACTIVO').length,
      comisionesPendientes: +comisionesPendientes.toFixed(2),
      comisionesPagadas: +comisionesPagadas.toFixed(2)
    };
  }

  function reportByAgent(agenteId) {
    const ag = getAgent(agenteId);
    if (!ag) throw new Error('Agente no encontrado');
    const props = state.properties.filter(p => p.agenteId === agenteId);
    const leads = state.leads.filter(l => l.agenteId === agenteId);
    const contratos = state.contracts.filter(c => c.agenteId === agenteId);
    const comisiones = state.commissions.filter(c => c.agenteId === agenteId);
    const ganado = comisiones
      .filter(c => c.estado === 'PAGADA')
      .reduce((s, c) => s + c.parteAgente, 0);
    const porCobrar = comisiones
      .filter(c => c.estado === 'PENDIENTE')
      .reduce((s, c) => s + c.parteAgente, 0);
    return {
      agente: ag,
      propiedades: props.length,
      leads: leads.length,
      contratos: contratos.length,
      ganado: +ganado.toFixed(2),
      porCobrar: +porCobrar.toFixed(2)
    };
  }

  function pipelineFunnel() {
    const out = {};
    CONFIG.leadStages.forEach(s => { out[s] = 0; });
    state.leads.forEach(l => { out[l.etapa] = (out[l.etapa] || 0) + 1; });
    return out;
  }

  // -------------------------------------------------------------------------
  // UTILIDADES / EXPORT
  // -------------------------------------------------------------------------
  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(json) {
    const data = (typeof json === 'string') ? JSON.parse(json) : json;
    ['properties', 'agents', 'leads', 'contracts', 'visits', 'commissions']
      .forEach(k => { if (Array.isArray(data[k])) state[k] = data[k]; });
    persist();
    return true;
  }

  function reset() {
    state.properties = [];
    state.agents = [];
    state.leads = [];
    state.contracts = [];
    state.visits = [];
    state.commissions = [];
    persist();
  }

  // -------------------------------------------------------------------------
  // INICIALIZACION
  // -------------------------------------------------------------------------
  restore();

  const InmobiliariaAPI = {
    CONFIG,
    // propiedades
    addProperty, updateProperty, removeProperty, listProperties, getProperty,
    // agentes
    addAgent, listAgents, getAgent, deactivateAgent,
    // leads
    addLead, moveLeadStage, listLeads, leadsRequiringFollowUp,
    // visitas
    scheduleVisit, completeVisit, cancelVisit,
    // contratos / comisiones
    createContract, cancelContract, payCommission,
    // reportes
    dashboard, reportByAgent, pipelineFunnel,
    // utilidades
    exportJSON, importJSON, reset,
    // estado interno (read-only practical)
    _state: state
  };

  global.InmobiliariaAPI = InmobiliariaAPI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InmobiliariaAPI;
  }

  console.log('[Volvix Inmobiliaria] vertical cargado. window.InmobiliariaAPI listo.');
})(typeof window !== 'undefined' ? window : globalThis);
