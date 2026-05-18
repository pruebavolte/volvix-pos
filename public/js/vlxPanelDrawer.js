/* ============================================================
 * vlxPanelDrawer.js — Drawer Config por Giro inyectado en runtime
 * Branch: feature/ampliacion-modulos
 *
 * Razón: paneldecontrol.html tiene scripts que re-renderizan
 * el body, eliminando cualquier HTML estático que injectemos.
 * Solución: inyectar después de un setTimeout/MutationObserver.
 * ============================================================ */

(function () {
  'use strict';

  let _data = null;
  let _injected = false;

  async function loadData() {
    if (_data) return _data;
    try {
      const r = await fetch('/data/giros-terminologias.json?v=' + Date.now());
      _data = await r.json();
      return _data;
    } catch (e) {
      console.error('[vlxPanelDrawer] loadData error:', e);
      return null;
    }
  }

  function buildStyles() {
    if (document.getElementById('vlx-drawer-styles')) return;
    const css = `
      #vlx-giro-config-fab {
        position: fixed; bottom: 24px; right: 24px; z-index: 99998;
        background: linear-gradient(135deg, #7c3aed, #2563eb);
        color: #fff; border: none; border-radius: 999px;
        padding: 12px 20px; font-size: 14px; font-weight: 600;
        box-shadow: 0 8px 24px rgba(124,58,237,.4);
        cursor: pointer; transition: transform .2s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #vlx-giro-config-fab:hover { transform: translateY(-2px); }
      #vlx-giro-config-drawer {
        position: fixed; top: 0; right: -800px; width: min(800px, 95vw); height: 100vh;
        background: #fff; z-index: 99999; box-shadow: -10px 0 40px rgba(0,0,0,.2);
        transition: right .3s ease; overflow-y: auto; padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #111;
      }
      #vlx-giro-config-drawer.open { right: 0; }
      #vlx-giro-config-drawer h2 { margin: 0 0 8px; font-size: 20px; }
      #vlx-giro-config-drawer .vlx-close {
        float: right; background: none; border: none; font-size: 28px; cursor: pointer; color: #666;
      }
      #vlx-giro-config-drawer .vlx-tab-list {
        display: flex; gap: 8px; margin: 16px 0; border-bottom: 1px solid #e5e7eb;
      }
      #vlx-giro-config-drawer .vlx-tab {
        padding: 8px 16px; cursor: pointer; border: none; background: none;
        font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent;
      }
      #vlx-giro-config-drawer .vlx-tab.active { color: #7c3aed; border-bottom-color: #7c3aed; }
      #vlx-giro-config-drawer .vlx-search {
        width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;
        font-size: 14px; margin-bottom: 12px;
      }
      #vlx-giro-config-drawer table { width: 100%; border-collapse: collapse; font-size: 13px; }
      #vlx-giro-config-drawer th, #vlx-giro-config-drawer td {
        padding: 8px 12px; text-align: left; border-bottom: 1px solid #f3f4f6;
      }
      #vlx-giro-config-drawer th { background: #f9fafb; font-weight: 600; color: #374151; position: sticky; top: 0; }
      #vlx-giro-config-drawer tr:hover { background: #fafafa; }
      #vlx-giro-config-drawer .vlx-pill {
        display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500;
      }
      #vlx-giro-config-drawer .vlx-pill.green { background: #dcfce7; color: #166534; }
      #vlx-giro-config-drawer .vlx-pill.gray { background: #f3f4f6; color: #6b7280; }
      #vlx-giro-config-drawer .vlx-btn {
        padding: 6px 12px; border-radius: 6px; border: 1px solid #d1d5db;
        background: #fff; cursor: pointer; font-size: 12px;
      }
      #vlx-giro-config-drawer .vlx-btn.primary { background: #7c3aed; color: #fff; border-color: #7c3aed; }
      #vlx-giro-config-drawer .vlx-meta { color: #6b7280; font-size: 13px; }
      #vlx-giro-config-drawer .vlx-stat-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0;
      }
      #vlx-giro-config-drawer .vlx-stat {
        background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;
      }
      #vlx-giro-config-drawer .vlx-stat .num { font-size: 24px; font-weight: 700; color: #7c3aed; }
      #vlx-giro-config-drawer .vlx-stat .lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; }
    `;
    const style = document.createElement('style');
    style.id = 'vlx-drawer-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildFab() {
    if (document.getElementById('vlx-giro-config-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'vlx-giro-config-fab';
    fab.textContent = '🌐 Config por Giro';
    fab.title = 'Configuración por giro de negocio (FASE 5 sprint nocturno)';
    fab.onclick = openDrawer;
    document.body.appendChild(fab);
  }

  function buildDrawer() {
    if (document.getElementById('vlx-giro-config-drawer')) return;
    const drawer = document.createElement('div');
    drawer.id = 'vlx-giro-config-drawer';
    drawer.innerHTML = `
      <button class="vlx-close" id="vlx-drawer-close">×</button>
      <h2>🌐 Configuración por Giro de Negocio</h2>
      <p class="vlx-meta">Activa/desactiva módulos y edita terminologías por giro. Source: <code>/data/giros-terminologias.json</code></p>
      <div class="vlx-stat-grid">
        <div class="vlx-stat"><div class="num" id="vlx-stat-giros">—</div><div class="lbl">Giros</div></div>
        <div class="vlx-stat"><div class="num" id="vlx-stat-modulos">—</div><div class="lbl">Módulos</div></div>
        <div class="vlx-stat"><div class="num" id="vlx-stat-terms">—</div><div class="lbl">Términos</div></div>
        <div class="vlx-stat"><div class="num">217</div><div class="lbl">Marcas premium</div></div>
      </div>
      <div class="vlx-tab-list">
        <button class="vlx-tab active" data-tab="giros">Giros</button>
        <button class="vlx-tab" data-tab="modulos">Módulos</button>
        <button class="vlx-tab" data-tab="terminologias">Terminologías</button>
        <button class="vlx-tab" data-tab="preview">Vista previa</button>
      </div>
      <div data-tab-content="giros">
        <input type="search" class="vlx-search" id="vlx-search-giros" placeholder="Buscar giro: navaja, comandero, pulso…">
        <table><thead><tr><th>Giro</th><th>Módulos activos</th><th>Términos</th><th>Acciones</th></tr></thead><tbody id="vlx-tbody-giros"></tbody></table>
      </div>
      <div data-tab-content="modulos" style="display:none">
        <p class="vlx-meta">Módulos disponibles agrupados por categoría.</p>
        <table><thead><tr><th>Módulo</th><th>Descripción</th><th>Giros que lo usan</th></tr></thead><tbody id="vlx-tbody-modulos"></tbody></table>
      </div>
      <div data-tab-content="terminologias" style="display:none">
        <p class="vlx-meta">Términos del diccionario por giro.</p>
        <table><thead><tr><th>Término</th><th>Restaurante</th><th>Barbería</th><th>Dental</th><th>Default</th><th>Gimnasio</th></tr></thead><tbody id="vlx-tbody-terms"></tbody></table>
      </div>
      <div data-tab-content="preview" style="display:none">
        <p class="vlx-meta">Selecciona un giro para previsualizar.</p>
        <select id="vlx-preview-giro-select" style="padding:8px;border-radius:6px;border:1px solid #d1d5db;font-size:14px;"><option value="">— Selecciona —</option></select>
        <button class="vlx-btn primary" id="vlx-preview-apply" style="margin-left:8px">Aplicar</button>
        <button class="vlx-btn" id="vlx-preview-reset" style="margin-left:4px">Reset</button>
        <div id="vlx-preview-result" style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;"></div>
      </div>
    `;
    document.body.appendChild(drawer);

    // Wire up
    drawer.querySelector('#vlx-drawer-close').onclick = closeDrawer;
    drawer.querySelectorAll('.vlx-tab').forEach(b => b.onclick = () => switchTab(b.getAttribute('data-tab')));
    drawer.querySelector('#vlx-search-giros').oninput = filterGiros;
    drawer.querySelector('#vlx-preview-apply').onclick = previewSelected;
    drawer.querySelector('#vlx-preview-reset').onclick = resetPreview;
  }

  function switchTab(name) {
    document.querySelectorAll('#vlx-giro-config-drawer .vlx-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('#vlx-giro-config-drawer [data-tab-content]').forEach(c => {
      c.style.display = c.getAttribute('data-tab-content') === name ? '' : 'none';
    });
  }

  async function openDrawer() {
    document.getElementById('vlx-giro-config-drawer').classList.add('open');
    const data = await loadData();
    if (!data) return;
    renderStats(data);
    renderGiros(data);
    renderModulos(data);
    renderTerms(data);
    renderPreviewSelect(data);
  }

  function closeDrawer() {
    document.getElementById('vlx-giro-config-drawer').classList.remove('open');
  }

  function renderStats(data) {
    const giros = Object.keys(data).filter(k => !k.startsWith('_') && k !== 'default');
    document.getElementById('vlx-stat-giros').textContent = giros.length;
    const ms = new Set(), ts = new Set();
    giros.forEach(g => {
      (data[g].modulos_activos || []).forEach(m => ms.add(m));
      Object.keys(data[g].terminologias || {}).forEach(t => ts.add(t));
    });
    document.getElementById('vlx-stat-modulos').textContent = ms.size;
    document.getElementById('vlx-stat-terms').textContent = ts.size;
  }

  function renderGiros(data) {
    const tbody = document.getElementById('vlx-tbody-giros');
    tbody.innerHTML = '';
    const giros = Object.keys(data).filter(k => !k.startsWith('_') && k !== 'default').sort();
    giros.forEach(slug => {
      const cfg = data[slug];
      const tr = document.createElement('tr');
      tr.setAttribute('data-giro-slug', slug);
      const ma = (cfg.modulos_activos || []).length;
      const mi = (cfg.modulos_inactivos || []).length;
      const tc = Object.keys(cfg.terminologias || {}).length;
      tr.innerHTML = `<td><strong>${slug}</strong></td><td><span class="vlx-pill green">${ma} act</span> <span class="vlx-pill gray">${mi} ina</span></td><td>${tc}</td><td><button class="vlx-btn" data-action="preview" data-slug="${slug}">Preview</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-action="preview"]').forEach(b => {
      b.onclick = () => {
        document.getElementById('vlx-preview-giro-select').value = b.getAttribute('data-slug');
        switchTab('preview');
        previewSelected();
      };
    });
  }

  function renderModulos(data) {
    const tbody = document.getElementById('vlx-tbody-modulos');
    tbody.innerHTML = '';
    const map = {};
    Object.keys(data).filter(k => !k.startsWith('_') && k !== 'default').forEach(slug => {
      (data[slug].modulos_activos || []).forEach(m => {
        if (!map[m]) map[m] = [];
        map[m].push(slug);
      });
    });
    const descs = {
      core: 'Núcleo POS', inventory: 'Inventario', taxes: 'Impuestos',
      kitchen: 'Cocina (KDS)', recipes: 'Recetas', modifiers: 'Modificadores',
      delivery: 'Delivery', commissions: 'Comisiones', loyalty: 'Lealtad',
      appointments: 'Citas', services: 'Servicios', medical: 'Expediente médico',
      automotive: 'Compatibilidad vehicular', rentals: 'Rentas/alquileres',
      hotel: 'Hotelería', gym: 'Membresías', events: 'Eventos',
      education: 'Cursos', subscriptions: 'Suscripciones',
      permissions: 'Permisos granulares', warranties: 'Garantías',
      serials: 'Serialización', lots: 'Lotes/caducidad', kits: 'Kits/combos',
      multibranch: 'Multisucursal', marketplace: 'Marketplaces externos',
      ecommerce: 'Ecommerce', variants: 'Variantes', sat: 'SAT CFDI',
      discounts: 'Descuentos', logistics: 'Logística', wholesale: 'Mayoreo'
    };
    Object.keys(map).sort().forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${m}</strong></td><td>${descs[m] || '—'}</td><td>${map[m].slice(0,6).map(g => `<span class="vlx-pill gray">${g}</span>`).join(' ')}${map[m].length > 6 ? ` <span class="vlx-pill gray">+${map[m].length - 6}</span>` : ''}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderTerms(data) {
    const tbody = document.getElementById('vlx-tbody-terms');
    tbody.innerHTML = '';
    const terms = ['cliente', 'producto', 'venta', 'empleado', 'ticket', 'mesa'];
    terms.forEach(t => {
      const tr = document.createElement('tr');
      const get = g => (data[g] && data[g].terminologias && data[g].terminologias[t]) || '—';
      tr.innerHTML = `<td><strong>${t}</strong></td><td>${get('restaurante')}</td><td>${get('navaja')}</td><td>${get('pulso')}</td><td>${get('default')}</td><td>${get('forja')}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderPreviewSelect(data) {
    const sel = document.getElementById('vlx-preview-giro-select');
    while (sel.options.length > 1) sel.remove(1);
    Object.keys(data).filter(k => !k.startsWith('_') && k !== 'default').sort().forEach(slug => {
      const o = document.createElement('option');
      o.value = slug; o.textContent = slug;
      sel.appendChild(o);
    });
  }

  async function previewSelected() {
    const slug = document.getElementById('vlx-preview-giro-select').value;
    if (!slug) return;
    if (typeof window.applyGiroConfig !== 'function') {
      document.getElementById('vlx-preview-result').textContent = 'applyGiroConfig no está cargado.';
      return;
    }
    await window.applyGiroConfig(slug);
    const cfg = _data[slug];
    document.getElementById('vlx-preview-result').textContent =
      'Giro aplicado: ' + slug + '\n' +
      'Módulos activos: ' + (cfg.modulos_activos || []).join(', ') + '\n' +
      'Terminologías: ' + JSON.stringify(cfg.terminologias, null, 2);
  }

  function resetPreview() {
    if (typeof window.resetGiroConfig === 'function') window.resetGiroConfig();
    document.getElementById('vlx-preview-result').textContent = '(Reseteado)';
  }

  function filterGiros() {
    const q = document.getElementById('vlx-search-giros').value.toLowerCase();
    document.querySelectorAll('#vlx-tbody-giros tr').forEach(tr => {
      const slug = (tr.getAttribute('data-giro-slug') || '').toLowerCase();
      tr.style.display = slug.includes(q) ? '' : 'none';
    });
  }

  function injectAll() {
    if (_injected) return;
    buildStyles();
    buildFab();
    buildDrawer();
    _injected = true;
    console.log('[vlxPanelDrawer] FAB + Drawer inyectados en runtime');
  }

  // Estrategia: inyectar varias veces para resistir re-renders del panel
  function smartInject() {
    injectAll();
    // Re-inject si el FAB desaparece (algún script lo borra)
    setTimeout(() => {
      if (!document.getElementById('vlx-giro-config-fab')) {
        _injected = false;
        injectAll();
      }
    }, 1500);
    setTimeout(() => {
      if (!document.getElementById('vlx-giro-config-fab')) {
        _injected = false;
        injectAll();
      }
    }, 4000);
    // MutationObserver para re-inject si el body cambia drásticamente
    if (typeof MutationObserver === 'function') {
      const obs = new MutationObserver(() => {
        if (!document.getElementById('vlx-giro-config-fab')) {
          _injected = false;
          injectAll();
        }
      });
      obs.observe(document.body, { childList: true, subtree: false });
    }
  }

  // Exponer públicamente
  window.vlxOpenGiroConfig = openDrawer;
  window.vlxCloseGiroConfig = closeDrawer;
  window.vlxPanelDrawerInject = injectAll;

  // Auto-inject cuando DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', smartInject, { once: true });
  } else {
    smartInject();
  }
})();
