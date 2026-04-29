// volvix-crm-kanban.js — Kanban drag&drop CRM (B2B)
(function () {
  const API = (window.VOLVIX_API_BASE || '') + '/api/crm';
  const auth = () => ({ 'Content-Type': 'application/json',
    ...(window.VOLVIX_TOKEN ? { Authorization: 'Bearer ' + window.VOLVIX_TOKEN } : {}) });

  async function loadPipeline(containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;
    root.innerHTML = '<div class="vx-loading">Cargando pipeline...</div>';
    try {
      const r = await fetch(`${API}/pipeline-view`, { headers: auth() });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'fetch failed');
      render(root, data.columns || []);
      attachForecast();
    } catch (e) {
      root.innerHTML = `<div class="vx-error">Error: ${e.message}</div>`;
    }
  }

  function render(root, columns) {
    root.innerHTML = '';
    root.className = 'vx-kanban';
    Object.assign(root.style, { display: 'flex', gap: '12px', overflowX: 'auto', padding: '12px' });
    for (const col of columns) {
      const colEl = document.createElement('div');
      colEl.className = 'vx-kanban-col';
      colEl.dataset.stageId = col.stage.id;
      Object.assign(colEl.style, {
        minWidth: '260px', background: '#f4f5f7', borderRadius: '8px',
        padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px'
      });
      const total = col.leads.reduce((a, b) => a + Number(b.value_estimated || 0), 0);
      colEl.innerHTML = `
        <div class="vx-kanban-head" style="font-weight:600;display:flex;justify-content:space-between;">
          <span>${escapeHtml(col.stage.name)} (${col.leads.length})</span>
          <span style="color:#666;font-size:12px;">$${total.toLocaleString()}</span>
        </div>`;
      const list = document.createElement('div');
      list.className = 'vx-kanban-list';
      list.style.minHeight = '50px';
      list.style.flex = '1';
      colEl.appendChild(list);

      for (const lead of col.leads) list.appendChild(buildCard(lead));

      list.addEventListener('dragover', e => { e.preventDefault(); colEl.style.background = '#e3eafc'; });
      list.addEventListener('dragleave', () => { colEl.style.background = '#f4f5f7'; });
      list.addEventListener('drop', async e => {
        e.preventDefault();
        colEl.style.background = '#f4f5f7';
        const leadId = e.dataTransfer.getData('lead-id');
        const toStage = colEl.dataset.stageId;
        if (!leadId) return;
        await moveStage(leadId, toStage);
        loadPipeline(root.id);
      });
      root.appendChild(colEl);
    }
  }

  function buildCard(lead) {
    const c = document.createElement('div');
    c.className = 'vx-kanban-card';
    c.draggable = true;
    c.dataset.leadId = lead.id;
    Object.assign(c.style, {
      background: '#fff', borderRadius: '6px', padding: '10px',
      boxShadow: '0 1px 2px rgba(0,0,0,.08)', cursor: 'grab', fontSize: '13px'
    });
    c.innerHTML = `
      <div style="font-weight:600;">${escapeHtml(lead.name)}</div>
      <div style="color:#666;font-size:12px;">${escapeHtml(lead.company || '')}</div>
      <div style="margin-top:4px;color:#0a7;">$${Number(lead.value_estimated || 0).toLocaleString()}</div>`;
    c.addEventListener('dragstart', e => {
      e.dataTransfer.setData('lead-id', lead.id);
      c.style.opacity = '0.5';
    });
    c.addEventListener('dragend', () => { c.style.opacity = '1'; });
    return c;
  }

  async function moveStage(leadId, toStageId) {
    try {
      await fetch(`${API}/leads/${leadId}/move-stage`, {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ to_stage_id: Number(toStageId) })
      });
    } catch (e) { console.error('move-stage failed', e); }
  }

  async function attachForecast() {
    const fc = document.getElementById('vx-crm-forecast');
    if (!fc) return;
    try {
      const r = await fetch(`${API}/forecast`, { headers: auth() });
      const d = await r.json();
      if (!d.ok) return;
      fc.innerHTML = `
        <div style="padding:10px;background:#fff;border-radius:8px;">
          <strong>Forecast ponderado:</strong> $${Number(d.forecast_total).toLocaleString()}
        </div>`;
    } catch (_) {}
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  window.VolvixCRMKanban = { loadPipeline };
  document.addEventListener('DOMContentLoaded', () => {
    const auto = document.querySelector('[data-volvix-crm-kanban]');
    if (auto) { auto.id = auto.id || 'vx-crm-kanban-auto'; loadPipeline(auto.id); }
  });
})();
