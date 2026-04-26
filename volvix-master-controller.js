/**
 * VOLVIX MASTER CONTROLLER
 * Agent-26 - Ronda 7 Fibonacci - ULTIMO AGENTE
 *
 * Master controller que integra TODOS los wiring scripts del sistema Volvix POS.
 * - Auto-detect de APIs disponibles (window.OwnerAPI, window.ChartsAPI, etc)
 * - Panel central con todas las funciones disponibles
 * - Boton flotante "Volvix Tools"
 * - Status indicators de cada modulo
 * - Quick actions (top 10 mas usados)
 * - Health check de todos los wiring
 * - Disable/enable modulos individualmente
 * - Settings persistentes en localStorage
 */
(function() {
  'use strict';

  // ===== CONFIGURACION =====
  const STORAGE_KEY = 'volvix_master_settings_v1';
  const VERSION = '1.0.0';
  const BUILD = 'agent26-r7';

  // ===== MODULOS REGISTRADOS =====
  const MODULES = [
    { id: 'tests',        name: '🧪 Tests',          api: 'VolvixTests',     action: 'run',         category: 'dev' },
    { id: 'charts',       name: '📊 Charts',         api: 'VolvixCharts',    action: 'loadAll',     category: 'data' },
    { id: 'notifs',       name: '🔔 Notificaciones', api: 'NotificationsAPI',action: 'show',        category: 'ui' },
    { id: 'backup',       name: '💾 Backup',         api: 'BackupAPI',       action: 'create',      category: 'data' },
    { id: 'logs',         name: '📋 Logs',           api: 'logger',          action: 'openPanel',   category: 'dev' },
    { id: 'reports',      name: '📊 Reportes',       api: 'ReportsAPI',      action: 'sales',       category: 'data' },
    { id: 'offline',      name: '🌐 Offline',        api: 'OfflineAPI',      action: 'status',      category: 'sys' },
    { id: 'onboarding',   name: '🎓 Tutorial',       api: 'OnboardingAPI',   action: 'start',       category: 'ui' },
    { id: 'pwa',          name: '📱 PWA',            api: 'PWAAPI',          action: 'install',     category: 'sys' },
    { id: 'i18n',         name: '🌍 Idiomas',        api: 'I18nAPI',         action: 'toggle',      category: 'ui' },
    { id: 'theme',        name: '🎨 Tema',           api: 'ThemeAPI',        action: 'toggle',      category: 'ui' },
    { id: 'shortcuts',    name: '⌨️ Atajos',         api: 'ShortcutsAPI',    action: 'showHelp',    category: 'ui' },
    { id: 'search',       name: '🔍 Buscar',         api: 'SearchAPI',       action: 'open',        category: 'ui' },
    { id: 'voice',        name: '🎙️ Voz',            api: 'VoiceAPI',        action: 'start',       category: 'io' },
    { id: 'calendar',     name: '📅 Calendario',     api: 'CalendarAPI',     action: 'open',        category: 'data' },
    { id: 'email',        name: '📧 Email',          api: 'EmailAPI',        action: 'compose',     category: 'io' },
    { id: 'payments',     name: '💳 Pagos',          api: 'PaymentsAPI',     action: 'process',     category: 'biz' },
    { id: 'gamification', name: '🏆 Logros',         api: 'GamificationAPI', action: 'show',        category: 'ui' },
    { id: 'perf',         name: '⚡ Performance',    api: 'PerfAPI',         action: 'measure',     category: 'dev' },
    { id: 'webrtc',       name: '🖥️ Remote',         api: 'WebRTCAPI',       action: 'connect',     category: 'io' },
    { id: 'ai',           name: '🤖 IA',             api: 'AIRealAPI',       action: 'chat',        category: 'biz' },
    { id: 'owner',        name: '👨‍💼 Owner',         api: 'OwnerAPI',        action: 'dashboard',   category: 'biz' },
    { id: 'pos',          name: '🛒 POS',            api: 'POSAPI',          action: 'open',        category: 'biz' },
    { id: 'multipos',     name: '🏢 MultiPOS',       api: 'MultiposAPI',     action: 'sync',        category: 'biz' },
    { id: 'extras',       name: '🎯 Extras',         api: 'ExtrasAPI',       action: 'show',        category: 'ui' }
  ];

  // Top 10 quick actions - los mas usados
  const QUICK_ACTIONS = ['pos', 'reports', 'backup', 'charts', 'owner', 'search', 'theme', 'i18n', 'logs', 'tests'];

  // ===== SETTINGS PERSISTENTES =====
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { disabled: [], lastOpen: 0, opens: 0 };
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[MASTER] settings corruptas, reseteando');
      return { disabled: [], lastOpen: 0, opens: 0 };
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  let settings = loadSettings();

  // ===== HEALTH CHECK / DETECCION =====
  function checkModules() {
    return MODULES.map(m => {
      const obj = window[m.api];
      const available = typeof obj !== 'undefined' && obj !== null;
      const disabled = settings.disabled.includes(m.id);
      let methods = [];
      if (available && typeof obj === 'object') {
        try { methods = Object.keys(obj).filter(k => typeof obj[k] === 'function'); } catch (e) {}
      }
      return {
        ...m,
        available,
        disabled,
        active: available && !disabled,
        object: obj,
        methods,
        hasAction: available && m.action && typeof obj[m.action] === 'function'
      };
    });
  }

  function healthReport() {
    const mods = checkModules();
    const total = mods.length;
    const ok = mods.filter(m => m.available).length;
    const dis = mods.filter(m => m.disabled).length;
    const actionable = mods.filter(m => m.hasAction).length;
    return {
      version: VERSION,
      build: BUILD,
      timestamp: new Date().toISOString(),
      total, available: ok, disabled: dis, actionable,
      score: Math.round((ok / total) * 100),
      modules: mods.map(m => ({ id: m.id, name: m.name, available: m.available, disabled: m.disabled, methods: m.methods.length }))
    };
  }

  // ===== ESTILOS =====
  function injectStyles() {
    if (document.getElementById('volvix-master-styles')) return;
    const s = document.createElement('style');
    s.id = 'volvix-master-styles';
    s.textContent = `
      @keyframes vmx-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }
      @keyframes vmx-fadein { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
      #volvix-master { animation: vmx-pulse 2.4s ease-in-out infinite; transition: transform .15s; }
      #volvix-master:hover { transform: scale(1.12) rotate(45deg); }
      #master-panel { animation: vmx-fadein .22s ease-out; }
      #master-panel button.vmx-mod:hover:not(:disabled) { background:#334155 !important; transform:translateY(-1px); }
      #master-panel button.vmx-mod { transition: all .12s; }
      #master-panel .vmx-tab { padding:6px 10px; cursor:pointer; border-radius:6px; font-size:12px; }
      #master-panel .vmx-tab.active { background:#3B82F6; }
      #master-panel ::-webkit-scrollbar { width:6px; }
      #master-panel ::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }
    `;
    document.head.appendChild(s);
  }

  // ===== UI: BOTON FLOTANTE =====
  function createMasterButton() {
    if (document.getElementById('volvix-master')) return;
    const btn = document.createElement('button');
    btn.id = 'volvix-master';
    btn.innerHTML = '⚙️';
    btn.title = 'Volvix Tools (Ctrl+Shift+V)';
    btn.style.cssText = `
      position:fixed;bottom:20px;right:20px;width:60px;height:60px;
      border-radius:50%;background:linear-gradient(135deg,#3B82F6,#8B5CF6);
      color:#fff;border:none;cursor:pointer;font-size:28px;z-index:99999;
      box-shadow:0 8px 24px rgba(59,130,246,0.5);
    `;
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
  }

  // ===== UI: PANEL =====
  let panelOpen = false;
  let currentTab = 'quick';

  function togglePanel() {
    let panel = document.getElementById('master-panel');
    if (panelOpen) { panel?.remove(); panelOpen = false; return; }
    renderPanel();
  }

  function renderPanel() {
    document.getElementById('master-panel')?.remove();
    const modules = checkModules();
    const available = modules.filter(m => m.available).length;
    const total = modules.length;
    settings.opens++; settings.lastOpen = Date.now(); saveSettings(settings);

    const panel = document.createElement('div');
    panel.id = 'master-panel';
    panel.style.cssText = `
      position:fixed;bottom:90px;right:20px;width:420px;max-height:640px;
      background:#0f172a;color:#fff;border-radius:16px;padding:18px;
      overflow:auto;z-index:99998;border:1px solid #1e293b;
      box-shadow:0 20px 60px rgba(0,0,0,0.6);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;

    const score = Math.round((available / total) * 100);
    const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <h2 style="font-size:18px;margin:0;font-weight:700;">⚙️ Volvix Tools</h2>
          <div style="font-size:10px;color:#64748b;">v${VERSION} · ${BUILD}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;color:${scoreColor};font-weight:700;">${available}/${total}</div>
          <div style="font-size:10px;color:#64748b;">${score}% activos</div>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid #1e293b;padding-bottom:8px;">
        <div class="vmx-tab ${currentTab==='quick'?'active':''}" data-tab="quick">⚡ Rapido</div>
        <div class="vmx-tab ${currentTab==='all'?'active':''}" data-tab="all">📦 Todos</div>
        <div class="vmx-tab ${currentTab==='health'?'active':''}" data-tab="health">❤️ Health</div>
        <div class="vmx-tab ${currentTab==='settings'?'active':''}" data-tab="settings">⚙️ Config</div>
      </div>

      <div id="vmx-content"></div>
    `;

    document.body.appendChild(panel);
    panelOpen = true;

    panel.querySelectorAll('.vmx-tab').forEach(t => {
      t.onclick = () => { currentTab = t.dataset.tab; renderTabContent(); };
    });

    renderTabContent();
  }

  function renderTabContent() {
    const c = document.getElementById('vmx-content');
    if (!c) return;
    const modules = checkModules();

    if (currentTab === 'quick') {
      const quick = QUICK_ACTIONS.map(id => modules.find(m => m.id === id)).filter(Boolean);
      c.innerHTML = `
        <div style="font-size:11px;color:#64748b;margin-bottom:8px;">TOP 10 acciones rapidas</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${quick.map(m => moduleButton(m)).join('')}
        </div>
      `;
    } else if (currentTab === 'all') {
      c.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${modules.map(m => moduleButton(m)).join('')}
        </div>
      `;
    } else if (currentTab === 'health') {
      const h = healthReport();
      c.innerHTML = `
        <div style="font-size:12px;line-height:1.7;">
          <div><b>Score:</b> ${h.score}%</div>
          <div><b>Total:</b> ${h.total} modulos</div>
          <div><b>Disponibles:</b> <span style="color:#22c55e;">${h.available}</span></div>
          <div><b>Deshabilitados:</b> <span style="color:#f59e0b;">${h.disabled}</span></div>
          <div><b>Con accion:</b> ${h.actionable}</div>
          <div><b>Build:</b> ${h.build}</div>
          <div style="margin-top:10px;"><b>Modulos:</b></div>
          <div style="max-height:280px;overflow:auto;font-size:11px;font-family:monospace;background:#020617;padding:8px;border-radius:6px;margin-top:4px;">
            ${h.modules.map(m => `<div style="color:${m.available?'#22c55e':'#475569'}">${m.available?'✓':'✗'} ${m.id.padEnd(14)} (${m.methods}m)${m.disabled?' [OFF]':''}</div>`).join('')}
          </div>
          <button onclick="window.MasterAPI.exportHealth()" style="margin-top:10px;padding:8px 12px;background:#3B82F6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Exportar JSON</button>
        </div>
      `;
    } else if (currentTab === 'settings') {
      c.innerHTML = `
        <div style="font-size:12px;">
          <div style="margin-bottom:10px;color:#64748b;">Habilitar/deshabilitar modulos:</div>
          <div style="max-height:340px;overflow:auto;">
            ${modules.map(m => `
              <label style="display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;cursor:pointer;${m.available?'':'opacity:.4;'}">
                <input type="checkbox" ${!m.disabled?'checked':''} ${!m.available?'disabled':''} data-mod="${m.id}" class="vmx-toggle"/>
                <span style="flex:1;">${m.name}</span>
                <span style="font-size:10px;color:${m.available?'#22c55e':'#ef4444'};">${m.available?'OK':'N/A'}</span>
              </label>
            `).join('')}
          </div>
          <div style="display:flex;gap:6px;margin-top:10px;">
            <button onclick="window.MasterAPI.resetSettings()" style="flex:1;padding:8px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Reset</button>
            <button onclick="window.MasterAPI.enableAll()" style="flex:1;padding:8px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Habilitar todos</button>
          </div>
          <div style="margin-top:10px;font-size:10px;color:#64748b;">Aperturas: ${settings.opens} · Ultima: ${settings.lastOpen?new Date(settings.lastOpen).toLocaleString():'-'}</div>
        </div>
      `;
      c.querySelectorAll('.vmx-toggle').forEach(cb => {
        cb.onchange = () => {
          const id = cb.dataset.mod;
          if (cb.checked) settings.disabled = settings.disabled.filter(x => x !== id);
          else if (!settings.disabled.includes(id)) settings.disabled.push(id);
          saveSettings(settings);
        };
      });
    }
  }

  function moduleButton(m) {
    const enabled = m.available && !m.disabled;
    const bg = enabled ? '#1e293b' : '#0a0a0a';
    const fg = enabled ? '#fff' : '#475569';
    const border = enabled ? '#334155' : '#1e293b';
    const status = !m.available ? '✗ No cargado' : m.disabled ? '⊘ OFF' : '✓ Activo';
    const stColor = !m.available ? '#475569' : m.disabled ? '#f59e0b' : '#22c55e';
    return `
      <button class="vmx-mod" onclick="window.runModule('${m.id}')" ${!enabled?'disabled':''}
        style="padding:10px;background:${bg};color:${fg};border:1px solid ${border};border-radius:8px;cursor:${enabled?'pointer':'not-allowed'};font-size:12px;text-align:left;">
        <div style="font-weight:600;">${m.name}</div>
        <div style="font-size:10px;color:${stColor};margin-top:2px;">${status}</div>
      </button>
    `;
  }

  // ===== EJECUCION DE MODULOS =====
  window.runModule = function(id) {
    const module = MODULES.find(m => m.id === id);
    if (!module) { console.warn('[MASTER] modulo desconocido:', id); return; }
    if (settings.disabled.includes(id)) {
      alert(`Modulo ${module.name} esta deshabilitado en settings`);
      return;
    }
    const obj = window[module.api];
    if (!obj) {
      alert(`Modulo ${module.name} no esta disponible (window.${module.api} undefined)`);
      return;
    }
    try {
      if (module.action && typeof obj[module.action] === 'function') {
        const r = obj[module.action]();
        console.log(`[MASTER] ${module.name}.${module.action}() ->`, r);
      } else {
        const methods = Object.keys(obj).filter(k => typeof obj[k] === 'function');
        console.log(`[MASTER] ${module.name} disponible:`, obj);
        alert(`✓ ${module.name} cargado.\nMetodos: ${methods.join(', ') || '(sin metodos)'}`);
      }
    } catch (e) {
      console.error(`[MASTER] error ejecutando ${module.name}:`, e);
      alert(`Error en ${module.name}: ${e.message}`);
    }
  };

  // ===== ATAJO DE TECLADO =====
  function bindShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        togglePanel();
      }
    });
  }

  // ===== API PUBLICA =====
  window.MasterAPI = {
    version: VERSION,
    build: BUILD,
    checkModules,
    runModule: window.runModule,
    listModules: () => MODULES,
    available: () => checkModules().filter(m => m.available),
    health: healthReport,
    open: () => { if (!panelOpen) togglePanel(); },
    close: () => { if (panelOpen) togglePanel(); },
    toggle: togglePanel,
    enable: (id) => { settings.disabled = settings.disabled.filter(x => x !== id); saveSettings(settings); },
    disable: (id) => { if (!settings.disabled.includes(id)) settings.disabled.push(id); saveSettings(settings); },
    enableAll: () => { settings.disabled = []; saveSettings(settings); if (panelOpen) renderTabContent(); },
    resetSettings: () => { settings = { disabled: [], lastOpen: 0, opens: 0 }; saveSettings(settings); if (panelOpen) renderTabContent(); },
    exportHealth: () => {
      const blob = new Blob([JSON.stringify(healthReport(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `volvix-health-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  // ===== INIT =====
  function init() {
    injectStyles();
    setTimeout(() => {
      createMasterButton();
      bindShortcut();
      const h = healthReport();
      console.log(
        `%c[VOLVIX MASTER]`,
        'background:#8B5CF6;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;',
        `${h.available}/${h.total} modulos cargados (score ${h.score}%) · v${VERSION}`
      );
      if (typeof window.toast === 'function') {
        window.toast(`✓ Volvix listo: ${h.available}/${h.total} modulos`, 'success');
      }
      window.dispatchEvent(new CustomEvent('volvix:master:ready', { detail: h }));
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
