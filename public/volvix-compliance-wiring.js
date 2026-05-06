/**
 * volvix-compliance-wiring.js
 * GDPR / RGPD Compliance System for Volvix POS
 * Agent-40 — Ronda 8 Fibonacci
 *
 * Features:
 *  1. Cookie banner with granular consent
 *  2. Privacy policy generator
 *  3. Right to erasure
 *  4. Data export (JSON)
 *  5. Granular consent (analytics, marketing, functional, necessary)
 *  6. Retention policy enforcement
 *  7. DPO contact
 *  8. Audit trail of consents
 *  9. window.ComplianceAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = {
    companyName: 'Volvix POS',
    legalEntity: 'Grupo Volvix S.A. de C.V.',
    dpo: {
      name: 'Data Protection Officer',
      email: 'dpo@volvix.com',
      phone: '+52 55 0000 0000',
      address: 'Ciudad de México, México'
    },
    jurisdictions: ['GDPR', 'RGPD', 'LFPDPPP', 'CCPA'],
    retention: {
      analytics: 26,        // months
      marketing: 24,
      transactions: 60,     // 5 years for fiscal
      logs: 12,
      consents: 60,
      sessions: 1
    },
    cookieDomain: location.hostname,
    storageKey: 'volvix_compliance_v1',
    auditKey: 'volvix_compliance_audit_v1',
    consentVersion: '1.0.0',
    bannerPosition: 'bottom', // 'bottom' | 'top' | 'modal'
    autoExpireDays: 365
  };

  const CATEGORIES = {
    necessary:  { id: 'necessary',  label: 'Estrictamente necesarias', required: true,  default: true  },
    functional: { id: 'functional', label: 'Funcionales',              required: false, default: false },
    analytics:  { id: 'analytics',  label: 'Analíticas',               required: false, default: false },
    marketing:  { id: 'marketing',  label: 'Marketing / Publicidad',   required: false, default: false },
    personalization: { id: 'personalization', label: 'Personalización', required: false, default: false }
  };

  // ============================================================
  // STORAGE
  // ============================================================
  const Store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
    clear() { try { localStorage.clear(); sessionStorage.clear(); } catch {} }
  };

  // ============================================================
  // AUDIT TRAIL
  // ============================================================
  const Audit = {
    log(event, data = {}) {
      const entries = Store.get(CONFIG.auditKey) || [];
      const entry = {
        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        event,
        data,
        userAgent: navigator.userAgent,
        url: location.href,
        ipHash: 'client-side',
        consentVersion: CONFIG.consentVersion
      };
      entries.push(entry);
      // Keep last 500 audit events
      if (entries.length > 500) entries.splice(0, entries.length - 500);
      Store.set(CONFIG.auditKey, entries);
      return entry;
    },
    list(filter = {}) {
      const entries = Store.get(CONFIG.auditKey) || [];
      return entries.filter(e => {
        if (filter.event && e.event !== filter.event) return false;
        if (filter.since && new Date(e.timestamp) < new Date(filter.since)) return false;
        return true;
      });
    },
    clear() { Store.remove(CONFIG.auditKey); }
  };

  // ============================================================
  // CONSENT MANAGER
  // ============================================================
  const Consent = {
    state: null,

    load() {
      const saved = Store.get(CONFIG.storageKey);
      if (saved && this._valid(saved)) {
        this.state = saved;
      } else {
        this.state = this._defaults();
      }
      return this.state;
    },

    _valid(s) {
      if (!s || !s.timestamp || s.version !== CONFIG.consentVersion) return false;
      const ageMs = Date.now() - new Date(s.timestamp).getTime();
      return ageMs < CONFIG.autoExpireDays * 86400000;
    },

    _defaults() {
      const cats = {};
      Object.values(CATEGORIES).forEach(c => { cats[c.id] = c.default; });
      return {
        version: CONFIG.consentVersion,
        timestamp: null,
        decided: false,
        categories: cats
      };
    },

    save(categories, source = 'user') {
      const cats = {};
      Object.values(CATEGORIES).forEach(c => {
        cats[c.id] = c.required ? true : !!categories[c.id];
      });
      this.state = {
        version: CONFIG.consentVersion,
        timestamp: new Date().toISOString(),
        decided: true,
        categories: cats,
        source
      };
      Store.set(CONFIG.storageKey, this.state);
      Audit.log('consent.updated', { categories: cats, source });
      this._emit();
      return this.state;
    },

    acceptAll(source = 'banner-accept-all') {
      const all = {};
      Object.values(CATEGORIES).forEach(c => { all[c.id] = true; });
      return this.save(all, source);
    },

    rejectAll(source = 'banner-reject-all') {
      const min = {};
      Object.values(CATEGORIES).forEach(c => { min[c.id] = !!c.required; });
      return this.save(min, source);
    },

    has(category) {
      return !!(this.state && this.state.categories && this.state.categories[category]);
    },

    withdraw(category) {
      if (!this.state) this.load();
      this.state.categories[category] = false;
      this.state.timestamp = new Date().toISOString();
      Store.set(CONFIG.storageKey, this.state);
      Audit.log('consent.withdrawn', { category });
      this._emit();
    },

    _listeners: [],
    on(fn) { this._listeners.push(fn); },
    _emit() { this._listeners.forEach(fn => { try { fn(this.state); } catch {} }); }
  };

  // ============================================================
  // BANNER UI
  // ============================================================
  const Banner = {
    el: null,

    render() {
      if (this.el) return;
      const wrap = document.createElement('div');
      wrap.id = 'volvix-cookie-banner';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-label', 'Aviso de cookies');
      wrap.style.cssText = [
        'position:fixed', CONFIG.bannerPosition + ':0', 'left:0', 'right:0',
        'background:#0f1724', 'color:#fff', 'padding:18px 22px', 'z-index:2147483000',
        'box-shadow:0 -4px 20px rgba(0,0,0,.35)', 'font-family:system-ui,Segoe UI,Roboto,sans-serif',
        'font-size:14px', 'line-height:1.5'
      ].join(';');

      wrap.innerHTML = `
        <div style="max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between">
          <div style="flex:1;min-width:280px">
            <strong style="display:block;margin-bottom:4px">Usamos cookies — GDPR/RGPD</strong>
            <span>Utilizamos cookies para mejorar tu experiencia. Puedes aceptar todo, rechazar o personalizar.
              <a href="#" data-vlx="policy" style="color:#7dd3fc;text-decoration:underline">Política de privacidad</a>.
            </span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button data-vlx="reject"     style="${btn('#374151')}">Rechazar</button>
            <button data-vlx="customize"  style="${btn('#1f2937')}">Personalizar</button>
            <button data-vlx="accept"     style="${btn('#16a34a')}">Aceptar todo</button>
          </div>
        </div>`;

      function btn(bg){ return `background:${bg};color:#fff;border:0;padding:10px 16px;border-radius:8px;cursor:pointer;font-weight:600`; }

      wrap.addEventListener('click', (e) => {
        const t = e.target.getAttribute && e.target.getAttribute('data-vlx');
        if (!t) return;
        e.preventDefault();
        if (t === 'accept')    { Consent.acceptAll(); this.hide(); }
        if (t === 'reject')    { Consent.rejectAll(); this.hide(); }
        if (t === 'customize') { Modal.open(); }
        if (t === 'policy')    { PolicyView.open(); }
      });

      document.body.appendChild(wrap);
      this.el = wrap;
      Audit.log('banner.shown');
    },

    hide() {
      if (this.el) { this.el.remove(); this.el = null; }
    },

    // 2026-05-06: el banner ya no aparece globalmente. Solo se muestra cuando
    // el usuario esta en una pagina/seccion donde tiene sentido revisar el
    // consentimiento de cookies:
    //   - Paginas legales: cookies-policy, aviso-privacidad, terminos-condiciones
    //   - Seccion 'Mi Perfil' / 'Clientes' dentro de salvadorex-pos.html
    // Para forzarlo manualmente: window.VolvixCompliance.showBanner()
    _shouldShowOnThisPage() {
      try {
        var p = (location.pathname || '').toLowerCase();
        var h = (location.hash || '').toLowerCase();
        if (p.indexOf('cookies-policy') !== -1 ||
            p.indexOf('aviso-privacidad') !== -1 ||
            p.indexOf('terminos-condiciones') !== -1) return true;
        if (p.indexOf('salvadorex-pos') !== -1) {
          if (h.indexOf('perfil') !== -1 || h.indexOf('cliente') !== -1) return true;
          try {
            if (document.querySelector('#screen-perfil:not(.hidden)') ||
                document.querySelector('#screen-clientes:not(.hidden)')) return true;
          } catch (_) {}
        }
        return false;
      } catch (_) { return false; }
    },

    showIfNeeded() {
      if (Consent.state.decided) return;
      if (!this._shouldShowOnThisPage()) {
        // Re-evaluar cuando el user navegue a perfil/clientes dentro del POS
        var self = this;
        try {
          window.addEventListener('hashchange', function () {
            if (!Consent.state.decided && self._shouldShowOnThisPage() && !self.el) self.render();
          });
          document.addEventListener('click', function () {
            setTimeout(function () {
              if (!Consent.state.decided && self._shouldShowOnThisPage() && !self.el) self.render();
            }, 50);
          }, true);
        } catch (_) {}
        return;
      }
      this.render();
    }
  };

  // ============================================================
  // PREFERENCES MODAL
  // ============================================================
  const Modal = {
    el: null,
    open() {
      if (this.el) return;
      const m = document.createElement('div');
      m.id = 'volvix-cookie-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483001;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
      const rows = Object.values(CATEGORIES).map(c => `
        <label style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #e5e7eb">
          <span><strong>${c.label}</strong>${c.required ? ' <em style="color:#6b7280">(siempre activas)</em>' : ''}</span>
          <input type="checkbox" data-cat="${c.id}" ${Consent.has(c.id) ? 'checked' : ''} ${c.required ? 'disabled checked' : ''} />
        </label>`).join('');
      m.innerHTML = `
        <div style="background:#fff;color:#111;max-width:560px;width:92%;border-radius:12px;overflow:hidden">
          <div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
            <strong>Preferencias de cookies</strong>
            <button data-act="close" style="background:none;border:0;font-size:22px;cursor:pointer">&times;</button>
          </div>
          <div style="padding:6px 22px">${rows}</div>
          <div style="padding:16px 22px;display:flex;justify-content:flex-end;gap:8px">
            <button data-act="save" style="background:#16a34a;color:#fff;border:0;padding:10px 16px;border-radius:8px;cursor:pointer;font-weight:600">Guardar</button>
          </div>
        </div>`;
      m.addEventListener('click', (e) => {
        const a = e.target.getAttribute('data-act');
        if (a === 'close' || e.target === m) this.close();
        if (a === 'save') {
          const sel = {};
          m.querySelectorAll('input[data-cat]').forEach(i => { sel[i.getAttribute('data-cat')] = i.checked; });
          Consent.save(sel, 'modal');
          Banner.hide();
          this.close();
        }
      });
      document.body.appendChild(m);
      this.el = m;
      Audit.log('modal.opened');
    },
    close() { if (this.el) { this.el.remove(); this.el = null; } }
  };

  // ============================================================
  // PRIVACY POLICY GENERATOR
  // ============================================================
  const PolicyGenerator = {
    generate(fmt = 'html') {
      const today = new Date().toISOString().slice(0, 10);
      const sections = [
        ['1. Responsable del tratamiento', `${CONFIG.legalEntity} (${CONFIG.companyName}).`],
        ['2. DPO / Delegado de Protección de Datos',
         `${CONFIG.dpo.name} — ${CONFIG.dpo.email} — ${CONFIG.dpo.phone} — ${CONFIG.dpo.address}.`],
        ['3. Datos que tratamos',
         'Datos de identificación, datos transaccionales, datos de navegación (cookies), datos de contacto.'],
        ['4. Finalidades',
         'Prestación del servicio POS, facturación, soporte, mejora de producto (analítica), comunicación comercial (con consentimiento).'],
        ['5. Base jurídica',
         'Ejecución de contrato (necessary), interés legítimo (functional), consentimiento (analytics, marketing, personalization).'],
        ['6. Plazos de conservación',
         Object.entries(CONFIG.retention).map(([k, v]) => `${k}: ${v} meses`).join(' · ')],
        ['7. Derechos del titular (Art. 15-22 RGPD)',
         'Acceso, rectificación, supresión, oposición, limitación, portabilidad y a no ser objeto de decisiones automatizadas.'],
        ['8. Cómo ejercer tus derechos',
         `Escribe a ${CONFIG.dpo.email} o usa ComplianceAPI.exportData() / ComplianceAPI.eraseData() en la app.`],
        ['9. Transferencias internacionales',
         'Solo a proveedores con cláusulas contractuales tipo aprobadas por la Comisión Europea.'],
        ['10. Reclamaciones',
         'Puedes reclamar ante la AEPD (España), CNIL (Francia), INAI (México) u otra autoridad competente.'],
        ['11. Vigencia',
         `Versión ${CONFIG.consentVersion} — actualizada el ${today}.`]
      ];
      if (fmt === 'markdown') {
        return `# Política de Privacidad — ${CONFIG.companyName}\n\n` +
          sections.map(([h, b]) => `## ${h}\n\n${b}\n`).join('\n');
      }
      if (fmt === 'text') {
        return sections.map(([h, b]) => `${h}\n${'-'.repeat(h.length)}\n${b}\n`).join('\n');
      }
      // html
      return `<article class="vlx-policy"><h1>Política de Privacidad — ${CONFIG.companyName}</h1>` +
        sections.map(([h, b]) => `<h2>${h}</h2><p>${b}</p>`).join('') + `</article>`;
    }
  };

  const PolicyView = {
    open() {
      const w = window.open('', '_blank', 'width=720,height=800');
      if (!w) return;
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Privacy Policy</title>
        <style>body{font:14px/1.6 system-ui;padding:24px;max-width:720px;margin:auto;color:#111}h1{margin-top:0}h2{margin-top:24px;color:#0f1724}</style>
        </head><body>${PolicyGenerator.generate('html')}</body></html>`);
      w.document.close();
      Audit.log('policy.viewed');
    }
  };

  // ============================================================
  // DATA SUBJECT RIGHTS
  // ============================================================
  const Rights = {
    /** Right to access / data portability — Art. 15 / 20 RGPD */
    exportData() {
      const dump = {
        meta: {
          generatedAt: new Date().toISOString(),
          company: CONFIG.companyName,
          consentVersion: CONFIG.consentVersion,
          format: 'JSON-RGPD-1.0'
        },
        consent: Consent.state,
        audit: Audit.list(),
        localStorage: this._dumpStorage(localStorage),
        sessionStorage: this._dumpStorage(sessionStorage),
        cookies: this._dumpCookies()
      };
      Audit.log('rights.export', { sizeBytes: JSON.stringify(dump).length });
      return dump;
    },

    downloadExport(filename = 'volvix-mis-datos.json') {
      const data = this.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    },

    /** Right to erasure — Art. 17 RGPD */
    eraseData(opts = { confirm: false }) {
      if (!opts.confirm) {
        return { ok: false, error: 'confirm:true required' };
      }
      const snapshot = this.exportData();
      Audit.log('rights.erasure.requested', { hadConsent: !!Consent.state.decided });
      // Wipe cookies
      this._dumpCookies().forEach(c => {
        document.cookie = `${c.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${CONFIG.cookieDomain}`;
        document.cookie = `${c.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
      Store.clear();
      // Re-init defaults so app keeps working
      Consent.load();
      Audit.log('rights.erasure.completed');
      return { ok: true, erasedAt: new Date().toISOString(), snapshot };
    },

    /** Right to rectification — Art. 16 RGPD */
    rectify(field, value) {
      Audit.log('rights.rectify', { field, value });
      return { ok: true, message: `Rectification request logged. Contact ${CONFIG.dpo.email}` };
    },

    /** Right to object — Art. 21 RGPD */
    object(reason) {
      Audit.log('rights.object', { reason });
      Consent.rejectAll('rights-object');
      return { ok: true };
    },

    _dumpStorage(s) {
      const out = {};
      try { for (let i = 0; i < s.length; i++) { const k = s.key(i); out[k] = s.getItem(k); } } catch {}
      return out;
    },
    _dumpCookies() {
      return document.cookie.split(';').map(p => p.trim()).filter(Boolean).map(p => {
        const i = p.indexOf('=');
        return { name: p.slice(0, i), value: p.slice(i + 1) };
      });
    }
  };

  // ============================================================
  // RETENTION ENFORCER
  // ============================================================
  const Retention = {
    sweep() {
      const now = Date.now();
      const audit = Store.get(CONFIG.auditKey) || [];
      const cutoff = now - CONFIG.retention.consents * 30 * 86400000;
      const kept = audit.filter(e => new Date(e.timestamp).getTime() > cutoff);
      if (kept.length !== audit.length) {
        Store.set(CONFIG.auditKey, kept);
        Audit.log('retention.swept', { removed: audit.length - kept.length });
      }
      // Expire consent if old
      if (Consent.state && Consent.state.timestamp) {
        const age = now - new Date(Consent.state.timestamp).getTime();
        if (age > CONFIG.autoExpireDays * 86400000) {
          Audit.log('retention.consent.expired');
          Store.remove(CONFIG.storageKey);
          Consent.load();
          Banner.showIfNeeded();
        }
      }
      return { ok: true };
    },
    schedule() {
      try { setInterval(() => this.sweep(), 6 * 3600 * 1000); } catch {}
    }
  };

  // ============================================================
  // PUBLIC API
  // ============================================================
  const ComplianceAPI = {
    version: '1.0.0',
    config: CONFIG,
    categories: CATEGORIES,

    // Consent
    getConsent: () => Consent.state,
    hasConsent: (cat) => Consent.has(cat),
    setConsent: (cats, src) => Consent.save(cats, src),
    acceptAll: () => Consent.acceptAll(),
    rejectAll: () => Consent.rejectAll(),
    withdraw: (cat) => Consent.withdraw(cat),
    onConsentChange: (fn) => Consent.on(fn),

    // UI
    showBanner: () => Banner.render(),
    hideBanner: () => Banner.hide(),
    openPreferences: () => Modal.open(),
    showPolicy: () => PolicyView.open(),

    // Policy
    generatePolicy: (fmt) => PolicyGenerator.generate(fmt),

    // Rights
    exportData: () => Rights.exportData(),
    downloadMyData: (filename) => Rights.downloadExport(filename),
    eraseData: (opts) => Rights.eraseData(opts),
    rectify: (f, v) => Rights.rectify(f, v),
    object: (r) => Rights.object(r),

    // Audit
    getAuditTrail: (filter) => Audit.list(filter),
    clearAudit: () => Audit.clear(),

    // Retention
    runRetentionSweep: () => Retention.sweep(),

    // DPO
    getDPO: () => ({ ...CONFIG.dpo }),
    contactDPO: (subject, body) => {
      Audit.log('dpo.contact', { subject });
      const url = `mailto:${CONFIG.dpo.email}?subject=${encodeURIComponent(subject || 'GDPR Request')}&body=${encodeURIComponent(body || '')}`;
      try { location.href = url; } catch {}
      return { ok: true, mailto: url };
    },

    // Diagnostics
    diagnostics: () => ({
      version: CONFIG.consentVersion,
      jurisdictions: CONFIG.jurisdictions,
      consent: Consent.state,
      auditCount: (Store.get(CONFIG.auditKey) || []).length,
      retention: CONFIG.retention,
      bannerVisible: !!Banner.el
    })
  };

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    Consent.load();
    Audit.log('compliance.init', { url: location.href });
    Retention.sweep();
    Retention.schedule();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => Banner.showIfNeeded());
    } else {
      Banner.showIfNeeded();
    }
  }

  global.ComplianceAPI = ComplianceAPI;

  if (typeof window !== 'undefined') {
    init();
  }

  // CommonJS export for tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComplianceAPI;
  }

})(typeof window !== 'undefined' ? window : globalThis);
