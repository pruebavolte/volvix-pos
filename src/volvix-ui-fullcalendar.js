/* volvix-ui-fullcalendar.js
 * Volvix Full Calendar UI Component
 * Provides month/week/day views, drag-and-drop events, recurring events, iCal export.
 * Exposes: window.FullCalendar
 */
(function (global) {
  'use strict';

  // ---------- Utilities ----------
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => 'evt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDateTime = (d) => `${fmtDate(d)} ${fmtTime(d)}`;
  const parseDate = (s) => (s instanceof Date ? new Date(s) : new Date(s));

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const startOfWeek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; };
  const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };
  const endOfMonth = (d) => { const x = startOfMonth(d); x.setMonth(x.getMonth() + 1); x.setDate(0); return endOfDay(x); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
  const sameDay = (a, b) => fmtDate(a) === fmtDate(b);

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- Recurring expansion ----------
  // recurrence: { freq:'daily'|'weekly'|'monthly'|'yearly', interval:1, count?, until? }
  function expandRecurring(evt, rangeStart, rangeEnd) {
    if (!evt.recurrence) return [evt];
    const out = [];
    const r = evt.recurrence;
    const interval = r.interval || 1;
    const limit = r.count || 500;
    const until = r.until ? parseDate(r.until) : null;
    const duration = parseDate(evt.end) - parseDate(evt.start);
    let cur = new Date(evt.start);
    let i = 0;
    while (i < limit) {
      if (until && cur > until) break;
      if (cur > rangeEnd) break;
      const occEnd = new Date(cur.getTime() + duration);
      if (occEnd >= rangeStart) {
        out.push(Object.assign({}, evt, {
          _occurrence: i,
          start: new Date(cur),
          end: occEnd,
          _recurringId: evt.id,
        }));
      }
      switch (r.freq) {
        case 'daily': cur = addDays(cur, interval); break;
        case 'weekly': cur = addDays(cur, 7 * interval); break;
        case 'monthly': cur = addMonths(cur, interval); break;
        case 'yearly': cur = addMonths(cur, 12 * interval); break;
        default: return out;
      }
      i++;
    }
    return out;
  }

  // ---------- iCal export ----------
  function escapeICS(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  function toICSDate(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }
  function exportICal(events) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Volvix//FullCalendar//EN',
      'CALSCALE:GREGORIAN',
    ];
    events.forEach((e) => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@volvix`);
      lines.push(`DTSTAMP:${toICSDate(new Date())}`);
      lines.push(`DTSTART:${toICSDate(parseDate(e.start))}`);
      lines.push(`DTEND:${toICSDate(parseDate(e.end))}`);
      lines.push(`SUMMARY:${escapeICS(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
      if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`);
      if (e.recurrence) {
        const r = e.recurrence;
        let rule = `FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
        if (r.count) rule += `;COUNT=${r.count}`;
        if (r.until) rule += `;UNTIL=${toICSDate(parseDate(r.until))}`;
        lines.push(`RRULE:${rule}`);
      }
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function downloadICal(events, filename) {
    const ics = exportICal(events);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'calendar.ics';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ---------- Styles ----------
  const CSS = `
  .vfc-root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff;color:#222;}
  .vfc-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f7f7fa;border-bottom:1px solid #e5e5ea;}
  .vfc-toolbar h2{margin:0;font-size:18px;}
  .vfc-toolbar button{background:#fff;border:1px solid #ccd;padding:6px 10px;border-radius:6px;cursor:pointer;margin-left:4px;font-size:13px;}
  .vfc-toolbar button:hover{background:#eef;}
  .vfc-toolbar button.vfc-active{background:#3b6cf3;color:#fff;border-color:#3b6cf3;}
  .vfc-grid{display:grid;}
  .vfc-month-grid{grid-template-columns:repeat(7,1fr);}
  .vfc-month-grid .vfc-head{background:#f0f0f5;padding:6px;text-align:center;font-weight:600;font-size:12px;border-bottom:1px solid #e5e5ea;}
  .vfc-cell{min-height:90px;border-right:1px solid #eee;border-bottom:1px solid #eee;padding:4px;position:relative;cursor:pointer;}
  .vfc-cell.vfc-other{background:#fafafa;color:#aaa;}
  .vfc-cell.vfc-today{background:#fff7d6;}
  .vfc-cell.vfc-drop{background:#dfe9ff;}
  .vfc-daynum{font-size:12px;font-weight:600;}
  .vfc-evt{background:#3b6cf3;color:#fff;border-radius:4px;font-size:11px;padding:2px 5px;margin-top:2px;cursor:grab;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .vfc-evt.vfc-recurring::before{content:"\\21bb ";}
  .vfc-evt[draggable="true"]:active{cursor:grabbing;opacity:.6;}
  .vfc-week-grid,.vfc-day-grid{grid-template-columns:60px 1fr;}
  .vfc-week-grid{grid-template-columns:60px repeat(7,1fr);}
  .vfc-time-col{background:#fafafa;border-right:1px solid #eee;}
  .vfc-time-slot{height:40px;border-bottom:1px dashed #eee;font-size:10px;color:#888;text-align:right;padding-right:4px;}
  .vfc-day-col{position:relative;border-right:1px solid #eee;min-height:960px;}
  .vfc-day-col .vfc-hour{height:40px;border-bottom:1px dashed #eee;}
  .vfc-day-evt{position:absolute;left:2px;right:2px;background:#3b6cf3;color:#fff;border-radius:4px;font-size:11px;padding:3px 5px;cursor:grab;overflow:hidden;}
  .vfc-day-head{text-align:center;font-weight:600;padding:6px;background:#f0f0f5;border-bottom:1px solid #e5e5ea;font-size:12px;}
  `;

  function injectStyles() {
    if (document.getElementById('vfc-styles')) return;
    const s = document.createElement('style');
    s.id = 'vfc-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Calendar Class ----------
  class Calendar {
    constructor(el, options = {}) {
      this.el = typeof el === 'string' ? document.querySelector(el) : el;
      if (!this.el) throw new Error('FullCalendar: element not found');
      this.events = options.events ? options.events.map(this._normalizeEvent) : [];
      this.view = options.view || 'month';
      this.current = options.date ? parseDate(options.date) : new Date();
      this.onEventClick = options.onEventClick || null;
      this.onEventDrop = options.onEventDrop || null;
      this.onDateClick = options.onDateClick || null;
      this._dragId = null;
      injectStyles();
      this.render();
    }

    _normalizeEvent(e) {
      return Object.assign({
        id: e.id || uid(),
        title: e.title || '(no title)',
        start: parseDate(e.start),
        end: e.end ? parseDate(e.end) : new Date(parseDate(e.start).getTime() + 3600000),
        color: e.color || '#3b6cf3',
        recurrence: e.recurrence || null,
      }, e, {
        id: e.id || uid(),
        start: parseDate(e.start),
        end: e.end ? parseDate(e.end) : new Date(parseDate(e.start).getTime() + 3600000),
      });
    }

    addEvent(e) { this.events.push(this._normalizeEvent(e)); this.render(); }
    removeEvent(id) { this.events = this.events.filter((e) => e.id !== id); this.render(); }
    updateEvent(id, patch) {
      const i = this.events.findIndex((e) => e.id === id);
      if (i >= 0) { this.events[i] = this._normalizeEvent(Object.assign({}, this.events[i], patch)); this.render(); }
    }
    setView(v) { this.view = v; this.render(); }
    next() {
      if (this.view === 'month') this.current = addMonths(this.current, 1);
      else if (this.view === 'week') this.current = addDays(this.current, 7);
      else this.current = addDays(this.current, 1);
      this.render();
    }
    prev() {
      if (this.view === 'month') this.current = addMonths(this.current, -1);
      else if (this.view === 'week') this.current = addDays(this.current, -7);
      else this.current = addDays(this.current, -1);
      this.render();
    }
    today() { this.current = new Date(); this.render(); }

    getVisibleEvents(rangeStart, rangeEnd) {
      const out = [];
      this.events.forEach((e) => {
        const occ = expandRecurring(e, rangeStart, rangeEnd);
        occ.forEach((o) => {
          if (o.end >= rangeStart && o.start <= rangeEnd) out.push(o);
        });
      });
      return out;
    }

    exportICal(filename) { downloadICal(this.events, filename); }
    getICalString() { return exportICal(this.events); }

    // ---------- Rendering ----------
    render() {
      this.el.innerHTML = '';
      this.el.classList.add('vfc-root');
      this._renderToolbar();
      const body = document.createElement('div');
      body.className = 'vfc-body';
      this.el.appendChild(body);
      if (this.view === 'month') this._renderMonth(body);
      else if (this.view === 'week') this._renderWeek(body);
      else this._renderDay(body);
    }

    _renderToolbar() {
      const tb = document.createElement('div');
      tb.className = 'vfc-toolbar';
      const left = document.createElement('div');
      const prev = document.createElement('button'); prev.textContent = '<'; prev.onclick = () => this.prev();
      const today = document.createElement('button'); today.textContent = 'Today'; today.onclick = () => this.today();
      const next = document.createElement('button'); next.textContent = '>'; next.onclick = () => this.next();
      left.appendChild(prev); left.appendChild(today); left.appendChild(next);

      const title = document.createElement('h2');
      if (this.view === 'month') title.textContent = `${MONTHS[this.current.getMonth()]} ${this.current.getFullYear()}`;
      else if (this.view === 'week') {
        const ws = startOfWeek(this.current);
        title.textContent = `Week of ${fmtDate(ws)}`;
      } else title.textContent = fmtDate(this.current);

      const right = document.createElement('div');
      ['month', 'week', 'day'].forEach((v) => {
        const b = document.createElement('button');
        b.textContent = v[0].toUpperCase() + v.slice(1);
        if (this.view === v) b.classList.add('vfc-active');
        b.onclick = () => this.setView(v);
        right.appendChild(b);
      });
      const ical = document.createElement('button');
      ical.textContent = 'Export iCal'; ical.onclick = () => this.exportICal();
      right.appendChild(ical);

      tb.appendChild(left); tb.appendChild(title); tb.appendChild(right);
      this.el.appendChild(tb);
    }

    _renderMonth(body) {
      const grid = document.createElement('div');
      grid.className = 'vfc-grid vfc-month-grid';
      DAYS.forEach((d) => {
        const h = document.createElement('div'); h.className = 'vfc-head'; h.textContent = d;
        grid.appendChild(h);
      });
      const monthStart = startOfMonth(this.current);
      const monthEnd = endOfMonth(this.current);
      const gridStart = startOfWeek(monthStart);
      const today = new Date();
      const visible = this.getVisibleEvents(gridStart, addDays(gridStart, 42));

      for (let i = 0; i < 42; i++) {
        const day = addDays(gridStart, i);
        const cell = document.createElement('div');
        cell.className = 'vfc-cell';
        if (day.getMonth() !== this.current.getMonth()) cell.classList.add('vfc-other');
        if (sameDay(day, today)) cell.classList.add('vfc-today');
        cell.dataset.date = fmtDate(day);

        const dn = document.createElement('div');
        dn.className = 'vfc-daynum';
        dn.textContent = day.getDate();
        cell.appendChild(dn);

        cell.onclick = (ev) => {
          if (ev.target === cell || ev.target === dn) {
            if (this.onDateClick) this.onDateClick(day);
          }
        };
        cell.ondragover = (e) => { e.preventDefault(); cell.classList.add('vfc-drop'); };
        cell.ondragleave = () => cell.classList.remove('vfc-drop');
        cell.ondrop = (e) => {
          e.preventDefault(); cell.classList.remove('vfc-drop');
          this._handleDrop(this._dragId, day);
        };

        visible.filter((ev) => sameDay(ev.start, day)).forEach((ev) => {
          const chip = document.createElement('div');
          chip.className = 'vfc-evt';
          if (ev.recurrence) chip.classList.add('vfc-recurring');
          chip.style.background = ev.color;
          chip.textContent = `${fmtTime(ev.start)} ${ev.title}`;
          chip.draggable = true;
          chip.ondragstart = (e) => { this._dragId = ev._recurringId || ev.id; e.dataTransfer.effectAllowed = 'move'; };
          chip.onclick = (e) => { e.stopPropagation(); if (this.onEventClick) this.onEventClick(ev); };
          cell.appendChild(chip);
        });

        grid.appendChild(cell);
      }
      body.appendChild(grid);
    }

    _renderTimeGrid(body, days) {
      const grid = document.createElement('div');
      grid.className = 'vfc-grid';
      grid.style.gridTemplateColumns = `60px repeat(${days.length},1fr)`;

      const corner = document.createElement('div');
      corner.className = 'vfc-day-head'; corner.textContent = '';
      grid.appendChild(corner);
      days.forEach((d) => {
        const h = document.createElement('div'); h.className = 'vfc-day-head';
        h.textContent = `${DAYS[d.getDay()]} ${d.getDate()}`;
        grid.appendChild(h);
      });

      const timeCol = document.createElement('div'); timeCol.className = 'vfc-time-col';
      for (let h = 0; h < 24; h++) {
        const slot = document.createElement('div'); slot.className = 'vfc-time-slot';
        slot.textContent = `${pad(h)}:00`;
        timeCol.appendChild(slot);
      }
      grid.appendChild(timeCol);

      const rangeStart = startOfDay(days[0]);
      const rangeEnd = endOfDay(days[days.length - 1]);
      const visible = this.getVisibleEvents(rangeStart, rangeEnd);

      days.forEach((d) => {
        const col = document.createElement('div'); col.className = 'vfc-day-col';
        col.dataset.date = fmtDate(d);
        for (let h = 0; h < 24; h++) {
          const hr = document.createElement('div'); hr.className = 'vfc-hour';
          hr.dataset.hour = h;
          col.appendChild(hr);
        }
        col.ondragover = (e) => { e.preventDefault(); };
        col.ondrop = (e) => {
          e.preventDefault();
          const rect = col.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          const hour = Math.max(0, Math.min(23, Math.floor(offsetY / 40)));
          const target = new Date(d); target.setHours(hour, 0, 0, 0);
          this._handleDrop(this._dragId, target, true);
        };
        col.onclick = (e) => {
          const rect = col.getBoundingClientRect();
          const hour = Math.floor((e.clientY - rect.top) / 40);
          const target = new Date(d); target.setHours(hour, 0, 0, 0);
          if (this.onDateClick) this.onDateClick(target);
        };

        visible.filter((ev) => sameDay(ev.start, d)).forEach((ev) => {
          const top = ev.start.getHours() * 40 + (ev.start.getMinutes() / 60) * 40;
          const dur = (ev.end - ev.start) / 60000;
          const height = Math.max(20, (dur / 60) * 40);
          const chip = document.createElement('div');
          chip.className = 'vfc-day-evt';
          chip.style.top = top + 'px';
          chip.style.height = height + 'px';
          chip.style.background = ev.color;
          chip.textContent = `${fmtTime(ev.start)} ${ev.title}`;
          chip.draggable = true;
          chip.ondragstart = (e) => { this._dragId = ev._recurringId || ev.id; e.stopPropagation(); };
          chip.onclick = (e) => { e.stopPropagation(); if (this.onEventClick) this.onEventClick(ev); };
          col.appendChild(chip);
        });

        grid.appendChild(col);
      });
      body.appendChild(grid);
    }

    _renderWeek(body) {
      const ws = startOfWeek(this.current);
      const days = []; for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
      this._renderTimeGrid(body, days);
    }

    _renderDay(body) {
      this._renderTimeGrid(body, [this.current]);
    }

    _handleDrop(id, targetDate, preserveTime) {
      if (!id) return;
      const evt = this.events.find((e) => e.id === id);
      if (!evt) return;
      const dur = evt.end - evt.start;
      const newStart = new Date(targetDate);
      if (!preserveTime) {
        newStart.setHours(evt.start.getHours(), evt.start.getMinutes(), 0, 0);
      }
      const newEnd = new Date(newStart.getTime() + dur);
      const oldStart = evt.start;
      evt.start = newStart; evt.end = newEnd;
      this._dragId = null;
      if (this.onEventDrop) this.onEventDrop(evt, oldStart);
      this.render();
    }
  }

  // ---------- Public API ----------
  const FullCalendar = {
    create: (el, opts) => new Calendar(el, opts),
    Calendar,
    exportICal,
    downloadICal,
    expandRecurring,
    version: '1.0.0',
  };

  global.FullCalendar = FullCalendar;
  if (typeof module !== 'undefined' && module.exports) module.exports = FullCalendar;
})(typeof window !== 'undefined' ? window : this);
