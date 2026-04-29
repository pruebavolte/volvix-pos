// R18 Cloud Backup admin UI
// Consume: POST /api/admin/backup/cloud, GET /api/admin/backup/list, POST /api/admin/backup/restore/:id
(function () {
  'use strict';
  const API = (typeof window !== 'undefined' && window.VOLVIX_API_BASE) || '';

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = (typeof localStorage !== 'undefined') && (localStorage.getItem('volvix_token') || localStorage.getItem('token'));
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  async function listBackups() {
    const r = await fetch(API + '/api/admin/backup/list', { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503) throw new Error('Cloud storage no configurado (faltan AWS_ACCESS_KEY/AWS_SECRET/S3_BUCKET)');
    if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  async function triggerBackup(type) {
    const r = await fetch(API + '/api/admin/backup/cloud', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ type: type || 'full' })
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503) throw new Error('Cloud storage no configurado');
    if (!j.ok) throw new Error(j.detail || j.error || ('HTTP ' + r.status));
    return j;
  }

  async function restoreBackup(id) {
    if (!id) throw new Error('id requerido');
    if (typeof window !== 'undefined' && !window.confirm('Restaurar backup ' + id + '?\nEsto sobrescribe la base de datos actual.')) {
      return { ok: false, cancelled: true };
    }
    const r = await fetch(API + '/api/admin/backup/restore/' + encodeURIComponent(id), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ confirm: true })
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  function fmtSize(b) {
    if (!b) return '0 B';
    const u = ['B','KB','MB','GB']; let i = 0; let n = Number(b);
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(1) + ' ' + u[i];
  }

  function render(target) {
    const el = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = '<div class="vx-cloud-backup">'
      + '<div class="vx-cb-actions">'
      + '<button data-action="full">Backup completo</button>'
      + '<button data-action="incremental">Backup incremental</button>'
      + '<button data-action="refresh">Refrescar</button>'
      + '</div>'
      + '<div class="vx-cb-status"></div>'
      + '<table class="vx-cb-table"><thead><tr>'
      + '<th>Inicio</th><th>Tipo</th><th>Estado</th><th>Tamano</th><th>Ubicacion</th><th>Acciones</th>'
      + '</tr></thead><tbody></tbody></table>'
      + '</div>';

    const statusEl = el.querySelector('.vx-cb-status');
    const tbody = el.querySelector('tbody');
    const setStatus = (m, isErr) => { statusEl.textContent = m || ''; statusEl.style.color = isErr ? '#c00' : '#080'; };

    async function refresh() {
      setStatus('Cargando...');
      try {
        const data = await listBackups();
        tbody.innerHTML = (data.backups || []).map(b => '<tr>'
          + '<td>' + (b.started_at || '') + '</td>'
          + '<td>' + (b.type || '') + '</td>'
          + '<td>' + (b.status || '') + '</td>'
          + '<td>' + fmtSize(b.size_bytes) + '</td>'
          + '<td>' + (b.location ? '<a href="' + b.location + '" target="_blank" rel="noopener">link</a>' : '-') + '</td>'
          + '<td>' + (b.status === 'success' ? '<button data-restore="' + b.id + '">Restaurar</button>' : '') + '</td>'
          + '</tr>').join('');
        setStatus('Provider: ' + (data.provider || 's3') + ' - ' + ((data.backups || []).length) + ' backups');
      } catch (e) { setStatus(e.message, true); }
    }

    el.addEventListener('click', async (ev) => {
      const a = ev.target.getAttribute('data-action');
      const r = ev.target.getAttribute('data-restore');
      try {
        if (a === 'refresh') return refresh();
        if (a === 'full' || a === 'incremental') {
          setStatus('Ejecutando backup ' + a + '...');
          const j = await triggerBackup(a);
          setStatus('Backup OK: ' + j.id + ' (' + fmtSize(j.size_bytes) + ')');
          return refresh();
        }
        if (r) {
          setStatus('Encolando restore...');
          const j = await restoreBackup(r);
          if (j.cancelled) return setStatus('Cancelado');
          setStatus('Restore encolado: job ' + j.job_id);
        }
      } catch (e) { setStatus(e.message, true); }
    });

    refresh();
  }

  if (typeof window !== 'undefined') {
    window.VolvixCloudBackup = { list: listBackups, trigger: triggerBackup, restore: restoreBackup, render };
  }
  if (typeof module !== 'undefined') module.exports = { listBackups, triggerBackup, restoreBackup, render };
})();
