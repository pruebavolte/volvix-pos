/* ============================================================================
 * volvix-admin-helpers.js — Phase 5 ghost-button rescue
 *
 * Reusable helpers for Volvix admin panels (owner panel + super-admin SaaS).
 * Provides:
 *   VolvixAdmin.api(method, path, body)     -> JWT-aware fetch wrapper
 *   VolvixAdmin.toast(msg, type)            -> toast wrapper around VolvixUI
 *   VolvixAdmin.openFormModal({...})        -> generic create/edit modal
 *   VolvixAdmin.confirmAction({...})        -> generic confirmation modal
 *   VolvixAdmin.confirmDestructive({...})   -> destructive confirmation
 *   VolvixAdmin.downloadCSV(file, rows, hdr)-> client-side CSV export
 *   VolvixAdmin.lockButton(btn, label)      -> disable+spinner during async
 *   VolvixAdmin.unlockButton(btn)           -> restore button state
 *
 * Vanilla JS, no dependencies beyond optional VolvixUI for modals.
 * Falls back to native dialogs when VolvixUI is missing.
 * ==========================================================================*/
(function (global) {
  'use strict';
  if (global.VolvixAdmin) return; // idempotent

  // ---------- AUTH-AWARE FETCH ----------
  function getToken() {
    try {
      if (global.VolvixAuth && typeof global.VolvixAuth.getToken === 'function') {
        return global.VolvixAuth.getToken() || '';
      }
      if (global.Volvix && global.Volvix.auth && typeof global.Volvix.auth.getToken === 'function') {
        return global.Volvix.auth.getToken() || '';
      }
    } catch (e) {}
    try {
      return localStorage.getItem('volvix_token') ||
             localStorage.getItem('volvixAuthToken') || '';
    } catch (e) { return ''; }
  }

  /**
   * api(method, path, body?) -> Promise<{ok, status, data, error}>
   * Always returns a normalized object — never throws on HTTP error,
   * only on network / parse failure.
   */
  async function api(method, path, body) {
    var token = getToken();
    var headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var opts = { method: (method || 'GET').toUpperCase(), headers: headers };
    if (body !== undefined && body !== null && opts.method !== 'GET' && opts.method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      opts.body = (typeof body === 'string') ? body : JSON.stringify(body);
    }
    try {
      var res = await fetch(path, opts);
      var text = await res.text();
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (res.ok) return { ok: true, status: res.status, data: data };
      var msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      return { ok: false, status: res.status, data: data, error: msg };
    } catch (e) {
      return { ok: false, status: 0, error: 'Sin conexión: ' + (e && e.message ? e.message : 'red'), networkError: true };
    }
  }

  // ---------- TOAST ----------
  function toast(message, type) {
    type = type || 'info';
    if (global.VolvixUI && typeof global.VolvixUI.toast === 'function') {
      return global.VolvixUI.toast({ type: type, message: String(message) });
    }
    // Fallback minimal toast
    try {
      var t = document.createElement('div');
      t.textContent = message;
      t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;top:20px;right:20px;background:#1f2937;color:#fff;padding:12px 18px;border-radius:8px;z-index:99999;font:13px/1.4 system-ui;box-shadow:0 4px 12px rgba(0,0,0,.25);max-width:340px;';
      if (type === 'success') t.style.background = '#10b981';
      else if (type === 'error') t.style.background = '#ef4444';
      else if (type === 'warn' || type === 'warning') t.style.background = '#f59e0b';
      document.body.appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (_) {} }, 4000);
    } catch (e) { /* last resort */ try { console.log('[toast]', message); } catch (_) {} }
  }

  // ---------- LOADING SPINNER (button) ----------
  function lockButton(btn, label) {
    if (!btn) return;
    if (btn.dataset._origHtml === undefined) {
      btn.dataset._origHtml = btn.innerHTML;
      btn.dataset._origDisabled = btn.disabled ? '1' : '0';
    }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:vlx-spin .8s linear infinite;vertical-align:-2px;margin-right:6px;"></span>' + (label || 'Procesando…');
    if (!document.getElementById('vlx-admin-helpers-style')) {
      var st = document.createElement('style');
      st.id = 'vlx-admin-helpers-style';
      st.textContent = '@keyframes vlx-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
  }
  function unlockButton(btn) {
    if (!btn) return;
    if (btn.dataset._origHtml !== undefined) {
      btn.innerHTML = btn.dataset._origHtml;
      btn.disabled = btn.dataset._origDisabled === '1';
      delete btn.dataset._origHtml;
      delete btn.dataset._origDisabled;
    } else {
      btn.disabled = false;
    }
    btn.removeAttribute('aria-busy');
  }

  // ---------- GENERIC FORM MODAL ----------
  /**
   * openFormModal({
   *   title, description, fields:[{name,label,type,required,placeholder,options,validate,default}],
   *   initialValues, submitText, onSubmit:async(values)=>{...}
   * }) -> Promise<values|null>
   */
  function openFormModal(opts) {
    opts = opts || {};
    if (global.VolvixUI && typeof global.VolvixUI.form === 'function') {
      return global.VolvixUI.form({
        title: opts.title,
        description: opts.description,
        fields: opts.fields || [],
        initialValues: opts.initialValues || {},
        size: opts.size || 'md',
        submitText: opts.submitText || 'Guardar',
        cancelText: opts.cancelText || 'Cancelar',
        onSubmit: opts.onSubmit
      });
    }
    // Fallback: prompt() per field (very basic)
    return new Promise(function (resolve) {
      var values = Object.assign({}, opts.initialValues || {});
      var fields = opts.fields || [];
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var v = global.prompt(f.label + (f.required ? ' *' : ''), values[f.name] != null ? String(values[f.name]) : '');
        if (v === null) { resolve(null); return; }
        if (f.required && !String(v).trim()) {
          alert('Campo obligatorio: ' + f.label);
          i--; continue;
        }
        values[f.name] = v;
      }
      Promise.resolve(opts.onSubmit ? opts.onSubmit(values) : true).then(function () {
        resolve(values);
      }).catch(function (e) { alert('Error: ' + (e && e.message)); resolve(null); });
    });
  }

  // ---------- CONFIRM ----------
  function confirmAction(opts) {
    opts = opts || {};
    if (global.VolvixUI && typeof global.VolvixUI.confirm === 'function') {
      return global.VolvixUI.confirm({
        title: opts.title || 'Confirmar',
        message: opts.message || '¿Continuar?',
        confirmText: opts.confirmText || 'Confirmar',
        cancelText: opts.cancelText || 'Cancelar'
      });
    }
    return Promise.resolve(global.confirm(opts.message || '¿Continuar?'));
  }
  function confirmDestructive(opts) {
    opts = opts || {};
    if (global.VolvixUI && typeof global.VolvixUI.destructiveConfirm === 'function') {
      return global.VolvixUI.destructiveConfirm({
        title: opts.title || '¿Eliminar?',
        message: opts.message || 'Esta acción no se puede deshacer.',
        confirmText: opts.confirmText || 'Eliminar',
        cancelText: opts.cancelText || 'Cancelar',
        confirmWord: opts.confirmWord
      });
    }
    return Promise.resolve(global.confirm(opts.message || '¿Eliminar?'));
  }

  // ---------- CSV EXPORT ----------
  function downloadCSV(filename, rows, headers) {
    function esc(v) {
      if (v == null) return '';
      var s = String(v);
      if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var lines = [];
    if (Array.isArray(headers) && headers.length) {
      lines.push(headers.map(esc).join(','));
    }
    (rows || []).forEach(function (r) {
      if (Array.isArray(r)) {
        lines.push(r.map(esc).join(','));
      } else if (r && typeof r === 'object') {
        var keys = headers && headers.length ? headers : Object.keys(r);
        lines.push(keys.map(function (k) { return esc(r[k]); }).join(','));
      }
    });
    var BOM = '﻿'; // for Excel UTF-8 compat
    var blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { a.remove(); URL.revokeObjectURL(url); } catch (_) {} }, 200);
  }

  // ---------- PUBLIC API ----------
  global.VolvixAdmin = {
    api: api,
    getToken: getToken,
    toast: toast,
    openFormModal: openFormModal,
    confirmAction: confirmAction,
    confirmDestructive: confirmDestructive,
    downloadCSV: downloadCSV,
    lockButton: lockButton,
    unlockButton: unlockButton
  };
})(typeof window !== 'undefined' ? window : this);
