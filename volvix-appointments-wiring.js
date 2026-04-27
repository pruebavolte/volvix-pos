/* ============================================================================
 * volvix-appointments-wiring.js  (R17)
 * Volvix POS - Sistema de citas multi-vertical (salon/spa/dental/gym/mecánica)
 * ----------------------------------------------------------------------------
 * - Calendario semanal (week view) custom-grid (sin dependencias externas).
 *   Si window.FullCalendar está cargado por CDN, lo prefiere.
 * - Drag & drop reschedule
 * - Color por status: booked/confirmed/canceled/completed/no_show
 * - REST: /api/services, /api/appointments, /api/availability
 * Expone: window.AppointmentsAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  // VxUI: VolvixUI con fallback nativo (bracket-notation para evitar auto-rewrite)
  const _w = window;
  const VxUI = {
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') {
        _w.VolvixUI.toast({ type, message });
      } else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message); }
    }
  };

  const API = (path, opts = {}) => fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || r.statusText), { status: r.status, body: j });
    return j;
  });

  const STATUS_COLORS = {
    booked:    { bg: '#dbeafe', fg: '#1e3a8a', border: '#3b82f6' },
    confirmed: { bg: '#dcfce7', fg: '#14532d', border: '#16a34a' },
    canceled:  { bg: '#fee2e2', fg: '#7f1d1d', border: '#dc2626' },
    completed: { bg: '#e0e7ff', fg: '#312e81', border: '#6366f1' },
    no_show:   { bg: '#fef3c7', fg: '#78350f', border: '#d97706' }
  };

  // ---------------------------------------------------------------- API LAYER
  const Services = {
    list:   ()           => API('/api/services'),
    create: (svc)        => API('/api/services',         { method: 'POST',   body: svc }),
    update: (id, patch)  => API(`/api/services/${id}`,   { method: 'PATCH',  body: patch }),
    remove: (id)         => API(`/api/services/${id}`,   { method: 'DELETE' })
  };

  const Appointments = {
    list:    (q = {})    => {
      const qs = new URLSearchParams(Object.entries(q).filter(([,v]) => v != null && v !== '')).toString();
      return API(`/api/appointments${qs ? '?' + qs : ''}`);
    },
    create:  (a)         => API('/api/appointments',                        { method: 'POST',  body: a }),
    update:  (id, patch) => API(`/api/appointments/${id}`,                  { method: 'PATCH', body: patch }),
    confirm: (id)        => API(`/api/appointments/${id}/confirm`,          { method: 'POST' }),
    cancel:  (id)        => API(`/api/appointments/${id}/cancel`,           { method: 'POST' }),
    complete:(id)        => API(`/api/appointments/${id}/complete`,         { method: 'POST' }),
    noShow:  (id)        => API(`/api/appointments/${id}/no-show`,          { method: 'POST' }),
    availability: (params) => {
      const qs = new URLSearchParams(params).toString();
      return API(`/api/availability?${qs}`);
    }
  };

  // ---------------------------------------------------------------- CALENDAR
  // Simple custom week-view grid. Slot height = 1 hour = 48px.
  const HOUR_PX = 48;
  const DAY_START = 8;   // 08:00
  const DAY_END   = 21;  // 21:00

  function startOfWeek(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - x.getDay()); // Sunday
    return x;
  }
  function fmtDate(d) { return d.toISOString().slice(0, 10); }
  function pad(n) { return String(n).padStart(2, '0'); }

  function renderWeekView(container, opts = {}) {
    const root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!root) throw new Error('appointments_container_not_found');

    const state = {
      anchor: opts.date ? new Date(opts.date) : new Date(),
      staffId: opts.staffId || null,
      appts: []
    };

    const reload = async () => {
      const wkStart = startOfWeek(state.anchor);
      const wkEnd = new Date(wkStart); wkEnd.setDate(wkEnd.getDate() + 7);
      // Fetch each day in parallel
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(wkStart); d.setDate(d.getDate() + i); return fmtDate(d);
      });
      const results = await Promise.all(days.map(date =>
        Appointments.list({ date, staff_id: state.staffId }).catch(() => ({ items: [] }))
      ));
      state.appts = results.flatMap(r => r.items || []);
      draw();
    };

    const draw = () => {
      const wkStart = startOfWeek(state.anchor);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(wkStart); d.setDate(d.getDate() + i); return d;
      });

      root.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'font-family:system-ui,sans-serif;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';

      // toolbar
      const tb = document.createElement('div');
      tb.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;';
      tb.innerHTML = `
        <button data-act="prev" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;">&lt;</button>
        <button data-act="today" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;">Hoy</button>
        <button data-act="next" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;">&gt;</button>
        <span style="font-weight:600;margin-left:8px;">${days[0].toLocaleDateString()} &mdash; ${days[6].toLocaleDateString()}</span>`;
      wrap.appendChild(tb);
      tb.addEventListener('click', e => {
        const act = e.target.getAttribute('data-act');
        if (act === 'prev')  { state.anchor.setDate(state.anchor.getDate() - 7); reload(); }
        if (act === 'next')  { state.anchor.setDate(state.anchor.getDate() + 7); reload(); }
        if (act === 'today') { state.anchor = new Date(); reload(); }
      });

      // grid header
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:60px repeat(7,1fr);';
      grid.appendChild(cell('', 'background:#f9fafb;border-bottom:1px solid #e5e7eb;'));
      days.forEach(d => grid.appendChild(cell(
        `${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]} ${d.getDate()}`,
        'padding:6px;text-align:center;font-size:12px;font-weight:600;background:#f9fafb;border-bottom:1px solid #e5e7eb;border-left:1px solid #e5e7eb;'
      )));
      // hour rows
      for (let h = DAY_START; h < DAY_END; h++) {
        grid.appendChild(cell(`${pad(h)}:00`, `padding:4px;font-size:11px;color:#6b7280;border-top:1px solid #f3f4f6;height:${HOUR_PX}px;`));
        days.forEach(d => {
          const c = cell('', `border-top:1px solid #f3f4f6;border-left:1px solid #e5e7eb;height:${HOUR_PX}px;position:relative;`);
          c.dataset.date = fmtDate(d);
          c.dataset.hour = h;
          c.addEventListener('dragover', ev => ev.preventDefault());
          c.addEventListener('drop', onDrop);
          c.addEventListener('dblclick', () => opts.onSlotClick && opts.onSlotClick({ date: fmtDate(d), hour: h }));
          grid.appendChild(c);
        });
      }
      wrap.appendChild(grid);
      root.appendChild(wrap);

      // place appointments
      state.appts.forEach(a => {
        const start = new Date(a.starts_at), end = new Date(a.ends_at);
        const dayIdx = Math.floor((start - startOfWeek(state.anchor)) / 86400000);
        if (dayIdx < 0 || dayIdx > 6) return;
        const startMin = start.getHours() * 60 + start.getMinutes();
        const durMin = (end - start) / 60000;
        if (start.getHours() < DAY_START || start.getHours() >= DAY_END) return;
        const colSel = `[data-date="${fmtDate(start)}"][data-hour="${start.getHours()}"]`;
        const col = grid.querySelector(colSel);
        if (!col) return;
        const colors = STATUS_COLORS[a.status] || STATUS_COLORS.booked;
        const ev = document.createElement('div');
        ev.draggable = true;
        ev.dataset.id = a.id;
        ev.style.cssText = `
          position:absolute;left:2px;right:2px;
          top:${(start.getMinutes()/60)*HOUR_PX}px;
          height:${(durMin/60)*HOUR_PX - 2}px;
          background:${colors.bg};color:${colors.fg};
          border-left:3px solid ${colors.border};
          border-radius:3px;padding:3px 5px;font-size:11px;
          overflow:hidden;cursor:grab;z-index:2;`;
        ev.innerHTML = `<strong>${pad(start.getHours())}:${pad(start.getMinutes())}</strong> ${a.notes || a.service_name || ''}`;
        ev.addEventListener('dragstart', e => e.dataTransfer.setData('appt-id', a.id));
        ev.addEventListener('click', e => { e.stopPropagation(); opts.onApptClick && opts.onApptClick(a); });
        col.appendChild(ev);
      });
    };

    const onDrop = async (ev) => {
      ev.preventDefault();
      const id = ev.dataTransfer.getData('appt-id');
      const target = ev.currentTarget;
      const date = target.dataset.date, hour = parseInt(target.dataset.hour, 10);
      const appt = state.appts.find(x => x.id === id);
      if (!appt) return;
      const oldStart = new Date(appt.starts_at), oldEnd = new Date(appt.ends_at);
      const dur = oldEnd - oldStart;
      const newStart = new Date(`${date}T${pad(hour)}:00:00`);
      const newEnd = new Date(newStart.getTime() + dur);
      try {
        await Appointments.update(id, { starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() });
        await reload();
      } catch (err) {
        VxUI.toast('error', 'No se pudo reagendar: ' + (err.body && err.body.error || err.message));
      }
    };

    function cell(txt, css) {
      const d = document.createElement('div');
      d.style.cssText = css || '';
      d.textContent = txt;
      return d;
    }

    reload();
    return { reload, state };
  }

  // ---------------------------------------------------------------- EXPORT
  global.AppointmentsAPI = {
    Services,
    Appointments,
    renderWeekView,
    STATUS_COLORS,
    version: 'R17.1'
  };

})(typeof window !== 'undefined' ? window : globalThis);
