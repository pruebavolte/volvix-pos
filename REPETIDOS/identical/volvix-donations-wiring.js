/* ============================================================================
 * volvix-donations-wiring.js
 * Módulo de Donaciones para Volvix POS
 * - Donativos a causas/ONGs
 * - Redondeo de cambio (round-up)
 * - Campañas con metas y vigencia
 * - Certificados deducibles de impuestos
 * Expone: window.DonationsAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix.donations.v1';
  const CAMPAIGNS_KEY = 'volvix.donations.campaigns.v1';
  const CERTS_KEY = 'volvix.donations.certs.v1';

  // ---------------------------------------------------------------- utilidades
  const uid = (p = 'don') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = () => new Date().toISOString();
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[Donations] loadJSON fail', key, e);
      return fallback;
    }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('[Donations] saveJSON fail', key, e); return false; }
  }

  // ---------------------------------------------------------------- estado
  let _donations = loadJSON(STORAGE_KEY, []);
  let _campaigns = loadJSON(CAMPAIGNS_KEY, []);
  let _certs     = loadJSON(CERTS_KEY, []);

  function persistAll() {
    saveJSON(STORAGE_KEY, _donations);
    saveJSON(CAMPAIGNS_KEY, _campaigns);
    saveJSON(CERTS_KEY, _certs);
  }

  // ---------------------------------------------------------------- causas seed
  const DEFAULT_CAUSES = [
    { id: 'cruz_roja',     name: 'Cruz Roja Mexicana',          rfc: 'CRM6707106K7', deducible: true },
    { id: 'unicef',        name: 'UNICEF México',               rfc: 'UNI540101AAA', deducible: true },
    { id: 'banco_alimentos', name: 'Banco de Alimentos',        rfc: 'BAM900101XXX', deducible: true },
    { id: 'teleton',       name: 'Fundación Teletón',           rfc: 'FTM970801ABC', deducible: true },
    { id: 'redondeo_propio', name: 'Programa interno Volvix',   rfc: null,           deducible: false }
  ];

  // ---------------------------------------------------------------- CAMPAÑAS
  function createCampaign({ causeId, name, goal = 0, startsAt, endsAt, description = '' }) {
    if (!causeId || !name) throw new Error('campaign requiere causeId y name');
    const c = {
      id: uid('camp'),
      causeId,
      name,
      goal: round2(goal),
      raised: 0,
      description,
      startsAt: startsAt || now(),
      endsAt: endsAt || null,
      active: true,
      createdAt: now()
    };
    _campaigns.push(c);
    saveJSON(CAMPAIGNS_KEY, _campaigns);
    return c;
  }

  function listCampaigns({ activeOnly = false } = {}) {
    const t = Date.now();
    return _campaigns
      .filter(c => !activeOnly || (c.active && (!c.endsAt || new Date(c.endsAt).getTime() > t)))
      .map(c => ({ ...c, progress: c.goal > 0 ? Math.min(1, c.raised / c.goal) : 0 }));
  }

  function closeCampaign(id) {
    const c = _campaigns.find(x => x.id === id);
    if (!c) return null;
    c.active = false;
    c.closedAt = now();
    saveJSON(CAMPAIGNS_KEY, _campaigns);
    return c;
  }

  // ---------------------------------------------------------------- REDONDEO
  /**
   * Calcula el monto a redondear.
   * mode: 'next_peso' | 'next_5' | 'next_10' | 'fixed'
   */
  function calcRoundUp(total, mode = 'next_peso', fixed = 0) {
    const t = Number(total) || 0;
    switch (mode) {
      case 'next_peso': return round2(Math.ceil(t) - t);
      case 'next_5':    return round2(Math.ceil(t / 5) * 5 - t);
      case 'next_10':   return round2(Math.ceil(t / 10) * 10 - t);
      case 'fixed':     return round2(Math.max(0, Number(fixed) || 0));
      default:          return 0;
    }
  }

  // ---------------------------------------------------------------- DONATIVOS
  function recordDonation({
    amount,
    causeId,
    campaignId = null,
    saleId = null,
    customerId = null,
    customerRFC = null,
    method = 'cash',
    type = 'manual',  // 'manual' | 'roundup' | 'recurring'
    note = ''
  }) {
    const amt = round2(amount);
    if (!(amt > 0)) throw new Error('amount debe ser > 0');
    if (!causeId) throw new Error('causeId requerido');

    const d = {
      id: uid('don'),
      amount: amt,
      causeId,
      campaignId,
      saleId,
      customerId,
      customerRFC,
      method,
      type,
      note,
      createdAt: now()
    };
    _donations.push(d);

    // Acumular en campaña
    if (campaignId) {
      const c = _campaigns.find(x => x.id === campaignId);
      if (c) { c.raised = round2(c.raised + amt); }
    }

    persistAll();
    return d;
  }

  function listDonations({ from, to, causeId, campaignId, customerId } = {}) {
    return _donations.filter(d => {
      if (from && d.createdAt < from) return false;
      if (to && d.createdAt > to) return false;
      if (causeId && d.causeId !== causeId) return false;
      if (campaignId && d.campaignId !== campaignId) return false;
      if (customerId && d.customerId !== customerId) return false;
      return true;
    });
  }

  function totals({ from, to } = {}) {
    const list = listDonations({ from, to });
    const byCause = {};
    let grand = 0;
    list.forEach(d => {
      byCause[d.causeId] = round2((byCause[d.causeId] || 0) + d.amount);
      grand = round2(grand + d.amount);
    });
    return { grand, byCause, count: list.length };
  }

  // ---------------------------------------------------------------- CERTIFICADOS
  function issueCertificate({ customerId, customerName, customerRFC, year }) {
    if (!customerRFC) throw new Error('customerRFC requerido para deducibilidad');
    const yr = year || new Date().getFullYear();
    const from = `${yr}-01-01T00:00:00.000Z`;
    const to   = `${yr}-12-31T23:59:59.999Z`;

    const eligible = _donations.filter(d => {
      if (d.customerRFC !== customerRFC) return false;
      if (d.createdAt < from || d.createdAt > to) return false;
      const cause = DEFAULT_CAUSES.find(c => c.id === d.causeId);
      return cause && cause.deducible;
    });

    const totalAmount = round2(eligible.reduce((s, d) => s + d.amount, 0));
    if (totalAmount <= 0) throw new Error('sin donativos deducibles en el periodo');

    const cert = {
      id: uid('cert'),
      folio: `VLX-DED-${yr}-${(_certs.length + 1).toString().padStart(5, '0')}`,
      customerId,
      customerName,
      customerRFC,
      year: yr,
      totalAmount,
      donationIds: eligible.map(d => d.id),
      issuedAt: now(),
      status: 'issued'
    };
    _certs.push(cert);
    saveJSON(CERTS_KEY, _certs);
    return cert;
  }

  function listCertificates({ customerRFC, year } = {}) {
    return _certs.filter(c =>
      (!customerRFC || c.customerRFC === customerRFC) &&
      (!year || c.year === year)
    );
  }

  // ---------------------------------------------------------------- HOOK POS
  /**
   * Aplica donación a una venta cerrada.
   * sale: { id, total, customer? }
   * opts: { causeId, campaignId?, roundupMode?, fixed?, manualAmount? }
   */
  function attachToSale(sale, opts = {}) {
    if (!sale || !sale.id) throw new Error('sale invalida');
    const { causeId, campaignId, roundupMode, fixed, manualAmount } = opts;
    let amount = 0;
    let type = 'manual';

    if (manualAmount && manualAmount > 0) {
      amount = round2(manualAmount);
      type = 'manual';
    } else if (roundupMode) {
      amount = calcRoundUp(sale.total, roundupMode, fixed);
      type = 'roundup';
    }
    if (amount <= 0) return null;

    return recordDonation({
      amount,
      causeId,
      campaignId,
      saleId: sale.id,
      customerId: sale.customer?.id || null,
      customerRFC: sale.customer?.rfc || null,
      method: sale.payMethod || 'cash',
      type,
      note: `Adjunto a venta ${sale.id}`
    });
  }

  // ---------------------------------------------------------------- API
  const DonationsAPI = {
    // metadata
    causes: () => DEFAULT_CAUSES.slice(),
    // campañas
    createCampaign,
    listCampaigns,
    closeCampaign,
    // redondeo
    calcRoundUp,
    // donativos
    recordDonation,
    listDonations,
    totals,
    attachToSale,
    // certificados
    issueCertificate,
    listCertificates,
    // mantenimiento
    _reset() {
      _donations = []; _campaigns = []; _certs = [];
      persistAll();
    },
    _dump() {
      return {
        donations: _donations.slice(),
        campaigns: _campaigns.slice(),
        certificates: _certs.slice()
      };
    },
    version: '1.0.0'
  };

  global.DonationsAPI = DonationsAPI;
  console.log('[Volvix] DonationsAPI listo v' + DonationsAPI.version);
})(window);
