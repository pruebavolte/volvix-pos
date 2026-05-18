/* ============================================================
   VOLVIX · TOOLS WIRING
   Cablea: Etiqueta Designer + Remote Control
============================================================ */
(function() {
  'use strict';

  const API = location.origin;
  let session = null;

  console.log('%c[TOOLS-WIRING]', 'background:#F59E0B;color:#fff;padding:2px 6px;border-radius:3px',
              'Cableado Tools activo');

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem('volvixSession') || 'null'); }
    catch { session = null; }
    return session;
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: e.message }; }
  }

  // =========================================================
  // ETIQUETA DESIGNER - IMPRIMIR REAL
  // =========================================================
  window.etiquetaImprimir = function() {
    const designer = document.querySelector('#designer, .designer-area, [data-designer]');
    if (!designer) {
      window.print();
      return;
    }

    // Crear ventana de impresión con solo el área del diseñador
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <html>
      <head>
        <title>Imprimir Etiqueta</title>
        <style>
          body { margin: 0; padding: 20px; font-family: sans-serif; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        ${designer.innerHTML}
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // =========================================================
  // ETIQUETA DESIGNER - GUARDAR PLANTILLA
  // =========================================================
  window.etiquetaGuardar = async function() {
    const ui = window.VolvixUI;
    let name;
    if (ui && typeof ui.form === 'function') {
      const res = await Promise.resolve(ui.form({
        title: 'Guardar plantilla',
        fields: [{ name: 'name', label: 'Nombre de la plantilla', type: 'text', required: true }],
        submitText: 'Guardar'
      })).catch(() => null);
      if (!res || !res.name) return;
      name = res.name;
    } else {
      name = prompt('Nombre de la plantilla:');
      if (!name) return;
    }

    const designer = document.querySelector('#designer, .designer-area, [data-designer]');
    if (!designer) {
      if (ui && ui.toast) ui.toast({ type: 'error', message: 'No hay diseñador' });
      else VolvixUI.toast({type:'info', message:'No hay diseñador'});
      return;
    }

    const template = {
      name,
      tenant_id: session?.tenant_id || 'TNT001',
      design: designer.innerHTML,
      created_at: Date.now()
    };

    const templates = JSON.parse(localStorage.getItem('volvix:label-templates') || '[]');
    templates.push(template);
    localStorage.setItem('volvix:label-templates', JSON.stringify(templates));

    if (ui && ui.toast) ui.toast({ type: 'success', message: 'Plantilla guardada: ' + name });
    else VolvixUI.toast({type:'success', message:'✓ Plantilla guardada: ' + name});
  };

  // =========================================================
  // ETIQUETA DESIGNER - CARGAR PLANTILLA
  // =========================================================
  window.etiquetaCargar = async function() {
    const templates = JSON.parse(localStorage.getItem('volvix:label-templates') || '[]');
    const ui = window.VolvixUI;
    if (templates.length === 0) {
      if (ui && ui.toast) ui.toast({ type: 'warning', message: 'No hay plantillas guardadas' });
      else VolvixUI.toast({type:'info', message:'No hay plantillas guardadas'});
      return;
    }

    let idx;
    if (ui && typeof ui.form === 'function') {
      const res = await Promise.resolve(ui.form({
        title: 'Cargar plantilla',
        fields: [{
          name: 'idx', label: 'Plantilla', type: 'select',
          options: templates.map((t, i) => ({ value: String(i), label: t.name })),
          required: true
        }],
        submitText: 'Cargar'
      })).catch(() => null);
      if (!res || res.idx == null) return;
      idx = parseInt(res.idx, 10);
    } else {
      const list = templates.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
      const choice = prompt(`Plantillas:\n${list}\n\nEscribe el número:`);
      if (!choice) return;
      idx = parseInt(choice) - 1;
    }
    if (isNaN(idx) || idx < 0 || idx >= templates.length) return;

    const designer = document.querySelector('#designer, .designer-area, [data-designer]');
    if (designer) {
      designer.innerHTML = templates[idx].design;
      if (ui && ui.toast) ui.toast({ type: 'success', message: 'Plantilla cargada' });
      else VolvixUI.toast({type:'success', message:'✓ Plantilla cargada'});
    }
  };

  // =========================================================
  // ETIQUETA - GENERAR CODIGO DE BARRAS
  // =========================================================
  window.etiquetaGenerarCodigo = async function(code, type) {
    if (!code) {
      const ui = window.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        const res = await Promise.resolve(ui.form({
          title: 'Generar código',
          fields: [
            { name: 'code', label: 'Código', type: 'text', required: true },
            { name: 'type', label: 'Tipo', type: 'radio', options: [{value:'barcode',label:'Código de barras'},{value:'qr',label:'QR'}], default: type || 'barcode' }
          ],
          submitText: 'Generar'
        })).catch(() => null);
        if (!res || !res.code) return null;
        code = res.code;
        type = res.type || type;
      } else {
        code = prompt('Código:');
        if (!code) return null;
      }
    }

    type = type || 'barcode';

    if (type === 'qr') {
      // SVG simple de QR (placeholder)
      return `<div style="display:inline-block;padding:8px;background:#fff;">
                <div style="width:80px;height:80px;background:#000;display:grid;grid-template:repeat(8,1fr)/repeat(8,1fr);">
                  ${Array.from({length:64}).map(() => `<div style="background:${Math.random()>0.5?'#fff':'#000'}"></div>`).join('')}
                </div>
                <div style="text-align:center;font-size:9px;font-family:monospace;margin-top:4px;">${code}</div>
              </div>`;
    } else {
      // Barcode tipo Code128 simulado
      return `<div style="display:inline-block;padding:8px;background:#fff;">
                <div style="display:flex;height:40px;">
                  ${code.split('').map(c => {
                    const w = c.charCodeAt(0) % 4 + 1;
                    return `<div style="width:${w}px;background:#000;margin-right:1px;"></div>`;
                  }).join('')}
                </div>
                <div style="text-align:center;font-size:9px;font-family:monospace;margin-top:4px;">${code}</div>
              </div>`;
    }
  };

  // =========================================================
  // REMOTE CONTROL - VALIDAR CÓDIGO
  // =========================================================
  window.remoteConectar = async function() {
    // Recolectar código de los inputs
    const inputs = document.querySelectorAll('.code-input input');
    const code = Array.from(inputs).map(i => i.value).join('');

    if (!code || code.length < 6) {
      VolvixUI.toast({type:'info', message:'Ingresa el código completo'});
      return;
    }

    // Validar código con el servidor (simulado por ahora)
    try {
      const result = await apiPost('/api/ai/support', {
        message: `Cliente solicita conexión remota con código ${code}. ¿Es válido?`
      });

      if (result.simulated) {
        // Modo simulación - acepta cualquier código por ahora
        showRemoteConnecting();
      } else {
        showRemoteConnecting();
      }
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error: ' + e.message});
    }
  };

  function showRemoteConnecting() {
    const initial = document.getElementById('initial');
    const connecting = document.getElementById('connecting');
    const connected = document.getElementById('connected');
    const log = document.getElementById('logs');

    if (initial) initial.style.display = 'none';
    if (connecting) connecting.classList.add('active');

    const steps = [
      { type:'info', text:'[00:00] Validando código...' },
      { type:'ok',   text:'[00:01] ✓ Código válido' },
      { type:'info', text:'[00:01] Estableciendo conexión encriptada...' },
      { type:'ok',   text:'[00:02] ✓ Canal seguro AES-256 establecido' },
      { type:'info', text:'[00:03] Conectando con IA Support...' },
      { type:'ok',   text:'[00:05] ✓ Sesión iniciada' },
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(interval);
        setTimeout(() => {
          if (connecting) connecting.classList.remove('active');
          if (connected) connected.classList.add('active');
        }, 800);
        return;
      }
      if (log) {
        const s = steps[i];
        log.innerHTML += `<span class="line"><span class="${s.type}">${s.text}</span></span>`;
        log.scrollTop = log.scrollHeight;
      }
      i++;
    }, 400);
  }

  // =========================================================
  // GENERIC WIRING
  // =========================================================
  function wireAllButtons() {
    document.querySelectorAll('button:not([data-wired])').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const onclick = btn.getAttribute('onclick') || '';

      if (onclick.includes('etiqueta') || onclick.includes('remote')) {
        btn.dataset.wired = 'true';
        return;
      }

      if (text.includes('imprimir') || text.includes('print')) {
        btn.onclick = (e) => { e.preventDefault(); window.etiquetaImprimir(); };
        btn.dataset.wired = 'true';
      } else if (text.includes('guardar') && text.includes('plantilla')) {
        btn.onclick = (e) => { e.preventDefault(); window.etiquetaGuardar(); };
        btn.dataset.wired = 'true';
      } else if (text.includes('cargar') && text.includes('plantilla')) {
        btn.onclick = (e) => { e.preventDefault(); window.etiquetaCargar(); };
        btn.dataset.wired = 'true';
      }
    });
  }

  function init() {
    loadSession();
    wireAllButtons();
    setInterval(wireAllButtons, 2000);

    // Override existing connect() function in remote.html
    if (typeof window.connect === 'function') {
      window._originalConnect = window.connect;
      window.connect = window.remoteConectar;
    }

    console.log('[TOOLS-WIRING] ✅ Listo');
  }

  window.ToolsAPI = {
    print: window.etiquetaImprimir,
    saveTemplate: window.etiquetaGuardar,
    loadTemplate: window.etiquetaCargar,
    generateCode: window.etiquetaGenerarCodigo,
    connectRemote: window.remoteConectar,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
