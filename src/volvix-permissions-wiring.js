/**
 * volvix-permissions-wiring.js
 * RBAC Permissions System for Volvix POS
 * Roles: admin / manager / cashier / viewer
 * Modules: read / write / delete matrix
 * Public API: window.PermissionsAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. Roles & Permission Matrix
  // ─────────────────────────────────────────────────────────────
  const ROLES = ['admin', 'manager', 'cashier', 'viewer'];

  const MODULES = [
    'sales', 'products', 'inventory', 'customers', 'suppliers',
    'purchases', 'reports', 'users', 'settings', 'cash_register',
    'discounts', 'refunds', 'audit_log'
  ];

  const ACTIONS = ['read', 'write', 'delete'];

  // Matrix: PERMISSIONS[role][module] = { read, write, delete }
  const PERMISSIONS = {
    admin: {
      sales:         { read: true,  write: true,  delete: true  },
      products:      { read: true,  write: true,  delete: true  },
      inventory:     { read: true,  write: true,  delete: true  },
      customers:     { read: true,  write: true,  delete: true  },
      suppliers:     { read: true,  write: true,  delete: true  },
      purchases:     { read: true,  write: true,  delete: true  },
      reports:       { read: true,  write: true,  delete: true  },
      users:         { read: true,  write: true,  delete: true  },
      settings:      { read: true,  write: true,  delete: true  },
      cash_register: { read: true,  write: true,  delete: true  },
      discounts:     { read: true,  write: true,  delete: true  },
      refunds:       { read: true,  write: true,  delete: true  },
      audit_log:     { read: true,  write: false, delete: false }
    },
    manager: {
      sales:         { read: true,  write: true,  delete: true  },
      products:      { read: true,  write: true,  delete: false },
      inventory:     { read: true,  write: true,  delete: false },
      customers:     { read: true,  write: true,  delete: true  },
      suppliers:     { read: true,  write: true,  delete: false },
      purchases:     { read: true,  write: true,  delete: false },
      reports:       { read: true,  write: false, delete: false },
      users:         { read: true,  write: false, delete: false },
      settings:      { read: true,  write: false, delete: false },
      cash_register: { read: true,  write: true,  delete: false },
      discounts:     { read: true,  write: true,  delete: false },
      refunds:       { read: true,  write: true,  delete: false },
      audit_log:     { read: true,  write: false, delete: false }
    },
    cashier: {
      sales:         { read: true,  write: true,  delete: false },
      products:      { read: true,  write: false, delete: false },
      inventory:     { read: true,  write: false, delete: false },
      customers:     { read: true,  write: true,  delete: false },
      suppliers:     { read: false, write: false, delete: false },
      purchases:     { read: false, write: false, delete: false },
      reports:       { read: false, write: false, delete: false },
      users:         { read: false, write: false, delete: false },
      settings:      { read: false, write: false, delete: false },
      cash_register: { read: true,  write: true,  delete: false },
      discounts:     { read: true,  write: false, delete: false },
      refunds:       { read: true,  write: false, delete: false },
      audit_log:     { read: false, write: false, delete: false }
    },
    viewer: {
      sales:         { read: true,  write: false, delete: false },
      products:      { read: true,  write: false, delete: false },
      inventory:     { read: true,  write: false, delete: false },
      customers:     { read: true,  write: false, delete: false },
      suppliers:     { read: true,  write: false, delete: false },
      purchases:     { read: true,  write: false, delete: false },
      reports:       { read: true,  write: false, delete: false },
      users:         { read: false, write: false, delete: false },
      settings:      { read: false, write: false, delete: false },
      cash_register: { read: true,  write: false, delete: false },
      discounts:     { read: true,  write: false, delete: false },
      refunds:       { read: true,  write: false, delete: false },
      audit_log:     { read: false, write: false, delete: false }
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. State (current user/session)
  // ─────────────────────────────────────────────────────────────
  const State = {
    currentUser: null,   // { id, name, role }
    auditTrail: [],
    maxAuditEntries: 5000,
    listeners: []
  };

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('volvix_current_user');
      if (raw) State.currentUser = JSON.parse(raw);
      const audit = localStorage.getItem('volvix_audit_trail');
      if (audit) State.auditTrail = JSON.parse(audit);
    } catch (e) {
      console.warn('[Permissions] failed to restore state', e);
    }
  }

  function persistAudit() {
    try {
      const slice = State.auditTrail.slice(-State.maxAuditEntries);
      localStorage.setItem('volvix_audit_trail', JSON.stringify(slice));
    } catch (e) { /* quota — drop oldest */ State.auditTrail = State.auditTrail.slice(-1000); }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Audit logger (every check is logged)
  // ─────────────────────────────────────────────────────────────
  function audit(event, payload) {
    const entry = {
      ts: new Date().toISOString(),
      event: event,
      user: State.currentUser ? State.currentUser.id : 'anonymous',
      role: State.currentUser ? State.currentUser.role : null,
      ...payload
    };
    State.auditTrail.push(entry);
    if (State.auditTrail.length > State.maxAuditEntries) {
      State.auditTrail.shift();
    }
    persistAudit();
    State.listeners.forEach(fn => { try { fn(entry); } catch (_) {} });
    return entry;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Core: can(action, resource)
  // ─────────────────────────────────────────────────────────────
  function can(action, resource) {
    if (!State.currentUser) {
      audit('check_denied_no_user', { action, resource });
      return false;
    }
    const role = State.currentUser.role;
    if (!ROLES.includes(role)) {
      audit('check_denied_invalid_role', { action, resource, role });
      return false;
    }
    if (!ACTIONS.includes(action)) {
      audit('check_denied_invalid_action', { action, resource });
      return false;
    }
    const modulePerms = PERMISSIONS[role][resource];
    if (!modulePerms) {
      audit('check_denied_unknown_module', { action, resource, role });
      return false;
    }
    const allowed = !!modulePerms[action];
    audit(allowed ? 'check_allowed' : 'check_denied', {
      action, resource, role, result: allowed
    });
    return allowed;
  }

  function cannot(action, resource) { return !can(action, resource); }

  function require(action, resource) {
    if (!can(action, resource)) {
      const err = new Error(`Permission denied: ${action} on ${resource}`);
      err.code = 'PERMISSION_DENIED';
      audit('require_threw', { action, resource });
      throw err;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Session
  // ─────────────────────────────────────────────────────────────
  function login(user) {
    if (!user || !user.id || !ROLES.includes(user.role)) {
      throw new Error('login: invalid user');
    }
    State.currentUser = { id: user.id, name: user.name || user.id, role: user.role };
    localStorage.setItem('volvix_current_user', JSON.stringify(State.currentUser));
    audit('login', { userId: user.id });
    applyUIRestrictions();
  }

  function logout() {
    audit('logout', {});
    State.currentUser = null;
    localStorage.removeItem('volvix_current_user');
    applyUIRestrictions();
  }

  function whoami() { return State.currentUser ? { ...State.currentUser } : null; }

  // ─────────────────────────────────────────────────────────────
  // 6. UI wiring — gray out / disable disallowed elements
  // Convention: <button data-perm="write:sales"> ...
  // ─────────────────────────────────────────────────────────────
  function applyUIRestrictions(root) {
    const scope = root || document;
    if (!scope || !scope.querySelectorAll) return;
    const nodes = scope.querySelectorAll('[data-perm]');
    nodes.forEach(node => {
      const spec = node.getAttribute('data-perm');
      if (!spec) return;
      const [action, resource] = spec.split(':');
      const ok = can(action, resource);
      if (ok) {
        node.removeAttribute('disabled');
        node.classList.remove('perm-disabled');
        node.style.pointerEvents = '';
        node.style.opacity = '';
        node.removeAttribute('aria-disabled');
        node.title = node.dataset.permOriginalTitle || node.title || '';
      } else {
        node.setAttribute('disabled', 'disabled');
        node.classList.add('perm-disabled');
        node.style.pointerEvents = 'none';
        node.style.opacity = '0.45';
        node.setAttribute('aria-disabled', 'true');
        if (!node.dataset.permOriginalTitle && node.title) {
          node.dataset.permOriginalTitle = node.title;
        }
        node.title = `Sin permiso: ${action} ${resource}`;
      }
    });
  }

  // Auto observe DOM mutations
  function startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) applyUIRestrictions(n);
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Audit query / export
  // ─────────────────────────────────────────────────────────────
  function getAuditTrail(filter) {
    if (!filter) return State.auditTrail.slice();
    return State.auditTrail.filter(e => {
      if (filter.user && e.user !== filter.user) return false;
      if (filter.event && e.event !== filter.event) return false;
      if (filter.resource && e.resource !== filter.resource) return false;
      if (filter.since && new Date(e.ts) < new Date(filter.since)) return false;
      return true;
    });
  }

  function exportAuditCSV() {
    const rows = [['ts', 'event', 'user', 'role', 'action', 'resource', 'result']];
    State.auditTrail.forEach(e => {
      rows.push([e.ts, e.event, e.user || '', e.role || '',
                 e.action || '', e.resource || '', String(e.result ?? '')]);
    });
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function clearAudit() {
    State.auditTrail = [];
    persistAudit();
  }

  function onAudit(fn) {
    if (typeof fn === 'function') State.listeners.push(fn);
    return () => {
      const i = State.listeners.indexOf(fn);
      if (i >= 0) State.listeners.splice(i, 1);
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Introspection helpers
  // ─────────────────────────────────────────────────────────────
  function listRoles() { return ROLES.slice(); }
  function listModules() { return MODULES.slice(); }
  function getMatrix(role) {
    if (role) return JSON.parse(JSON.stringify(PERMISSIONS[role] || {}));
    return JSON.parse(JSON.stringify(PERMISSIONS));
  }
  function effectivePermissions() {
    if (!State.currentUser) return {};
    return getMatrix(State.currentUser.role);
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Bootstrap
  // ─────────────────────────────────────────────────────────────
  loadFromStorage();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        applyUIRestrictions();
        startObserver();
      });
    } else {
      applyUIRestrictions();
      startObserver();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Public API
  // ─────────────────────────────────────────────────────────────
  global.PermissionsAPI = {
    // checks
    can: can,
    cannot: cannot,
    require: require,
    // session
    login: login,
    logout: logout,
    whoami: whoami,
    // ui
    applyUIRestrictions: applyUIRestrictions,
    // audit
    audit: audit,
    getAuditTrail: getAuditTrail,
    exportAuditCSV: exportAuditCSV,
    clearAudit: clearAudit,
    onAudit: onAudit,
    // introspection
    listRoles: listRoles,
    listModules: listModules,
    getMatrix: getMatrix,
    effectivePermissions: effectivePermissions,
    // constants
    ROLES: ROLES,
    MODULES: MODULES,
    ACTIONS: ACTIONS,
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : globalThis);
