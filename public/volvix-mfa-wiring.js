/* ============================================================
 * volvix-mfa-wiring.js — cliente MFA (TOTP + backup codes)
 * Endpoints:
 *   POST /api/mfa/setup     (auth)
 *   POST /api/mfa/verify    (auth)
 *   POST /api/mfa/challenge (público; usa mfa_token de /api/login)
 *   POST /api/mfa/disable   (auth, requiere password)
 *
 * Uso:
 *   VolvixMFA.setupWizard(containerEl)
 *   VolvixMFA.challengeWizard(containerEl, mfa_token)
 *   VolvixMFA.disable(password)
 *   VolvixMFA.handleLoginResponse(resp, mountEl)  // si resp.requires_mfa
 * ============================================================ */
(function (global) {
  'use strict';

  const API_BASE = global.API_BASE || '';
  const TOKEN_KEY = 'volvix_token';
  const SESSION_KEY = 'volvix_session';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function setSession(token, session) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session || {}));
    } catch {}
  }

  async function api(path, opts = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {}
    );
    if (opts.auth !== false) {
      const t = getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    const res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let json = {};
    try { json = await res.json(); } catch {}
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return json;
  }

  // ---- Public API ----
  const VolvixMFA = {
    async setup() {
      return api('/api/mfa/setup', { method: 'POST', body: {} });
    },
    async verify(code) {
      return api('/api/mfa/verify', { method: 'POST', body: { code } });
    },
    async challenge(mfa_token, code) {
      return api('/api/mfa/challenge', {
        method: 'POST', auth: false, body: { mfa_token, code }
      });
    },
    async disable(password) {
      return api('/api/mfa/disable', { method: 'POST', body: { password } });
    },

    // Wizard de setup: pinta otpauth como link + input para verificar
    async setupWizard(mountEl) {
      mountEl.innerHTML = '<div class="mfa-setup">Generando secret...</div>';
      let data;
      try {
        data = await this.setup();
      } catch (e) {
        mountEl.innerHTML = '<div class="mfa-error">Error: ' + escapeHtml(e.message) + '</div>';
        return;
      }
      const codes = (data.backup_codes || []).map(c => `<li><code>${escapeHtml(c)}</code></li>`).join('');
      mountEl.innerHTML = `
        <div class="mfa-setup">
          <h3>Activar autenticación de dos factores</h3>
          <p>1. Abre Google Authenticator / Authy / 1Password y escanea o usa este enlace:</p>
          <p><a href="${escapeHtml(data.otpauth_url)}" target="_blank" rel="noopener">${escapeHtml(data.otpauth_url)}</a></p>
          <p>O captura manualmente el secret:</p>
          <p><code style="user-select:all">${escapeHtml(data.secret)}</code></p>
          <p>2. Guarda estos <strong>códigos de respaldo</strong> (solo se muestran una vez):</p>
          <ul class="mfa-backup-codes">${codes}</ul>
          <p>3. Escribe el código de 6 dígitos que ves en la app:</p>
          <input id="mfa-code" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
          <button id="mfa-verify-btn" type="button">Activar MFA</button>
          <div id="mfa-msg"></div>
        </div>`;
      const btn = mountEl.querySelector('#mfa-verify-btn');
      const inp = mountEl.querySelector('#mfa-code');
      const msg = mountEl.querySelector('#mfa-msg');
      btn.addEventListener('click', async () => {
        msg.textContent = 'Verificando...';
        try {
          await this.verify(inp.value.trim());
          msg.innerHTML = '<span style="color:#0a0">MFA activado correctamente.</span>';
          mountEl.dispatchEvent(new CustomEvent('mfa:enabled'));
        } catch (e) {
          msg.innerHTML = '<span style="color:#c00">' + escapeHtml(e.message) + '</span>';
        }
      });
    },

    // Wizard de challenge (post-login con requires_mfa)
    async challengeWizard(mountEl, mfa_token) {
      mountEl.innerHTML = `
        <div class="mfa-challenge">
          <h3>Verificación en dos pasos</h3>
          <p>Ingresa el código de 6 dígitos de tu app autenticadora, o un código de respaldo.</p>
          <input id="mfa-c-code" maxlength="11" autocomplete="one-time-code" />
          <button id="mfa-c-btn" type="button">Continuar</button>
          <div id="mfa-c-msg"></div>
        </div>`;
      const btn = mountEl.querySelector('#mfa-c-btn');
      const inp = mountEl.querySelector('#mfa-c-code');
      const msg = mountEl.querySelector('#mfa-c-msg');
      return new Promise((resolve, reject) => {
        btn.addEventListener('click', async () => {
          msg.textContent = 'Verificando...';
          try {
            const r = await this.challenge(mfa_token, inp.value.trim());
            setSession(r.token, r.session);
            msg.innerHTML = '<span style="color:#0a0">OK</span>';
            mountEl.dispatchEvent(new CustomEvent('mfa:authenticated', { detail: r }));
            resolve(r);
          } catch (e) {
            msg.innerHTML = '<span style="color:#c00">' + escapeHtml(e.message) + '</span>';
            reject(e);
          }
        });
      });
    },

    // Helper: tras /api/login si trae requires_mfa, monta el challenge
    handleLoginResponse(resp, mountEl) {
      if (resp && resp.requires_mfa && resp.mfa_token) {
        return this.challengeWizard(mountEl, resp.mfa_token);
      }
      if (resp && resp.token) {
        setSession(resp.token, resp.session);
        return Promise.resolve(resp);
      }
      return Promise.reject(new Error('respuesta de login inválida'));
    }
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  global.VolvixMFA = VolvixMFA;
})(typeof window !== 'undefined' ? window : globalThis);
