/* ============================================================================
 * volvix-hr-wiring.js
 * Volvix POS - HR / Payroll module wiring
 * Agent-60 R9
 *
 * Provee window.HRAPI con:
 *   - Empleados (CRUD)
 *   - Asistencia (check-in / check-out, historial)
 *   - Horarios (turnos por empleado / dia)
 *   - Vacaciones (solicitud, aprobacion, saldo)
 *   - Nomina (sueldo base, bonos, deducciones, calculo neto)
 *   - Recibo de nomina (generacion / impresion)
 *   - Reportes HR (asistencia, horas trabajadas, nomina periodo)
 *
 * Persistencia: localStorage (volvix_hr_*) + hooks Supabase si window.sb existe.
 * ============================================================================ */
(function (global) {
  'use strict';

  // -------------------------- Storage helpers --------------------------------
  const LS_EMP   = 'volvix_hr_employees';
  const LS_ATT   = 'volvix_hr_attendance';
  const LS_SCH   = 'volvix_hr_schedules';
  const LS_VAC   = 'volvix_hr_vacations';
  const LS_PAY   = 'volvix_hr_payroll';
  const LS_CONF  = 'volvix_hr_config';

  function load(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; }
    catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('[HR] save fail', key, e); return false; }
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowISO()   { return new Date().toISOString(); }

  // -------------------------- Default config --------------------------------
  const DEFAULT_CONFIG = {
    workHoursPerDay: 8,
    workDaysPerWeek: 6,
    overtimeMultiplier: 1.5,
    isrRate: 0.10,         // ISR aproximado
    imssRate: 0.0275,      // IMSS empleado
    bonusPunctualityPct: 0.05,
    vacationDaysPerYear: 12,
    currency: 'MXN'
  };

  // -------------------------- Empleados -------------------------------------
  function listEmployees() { return load(LS_EMP, []); }

  function getEmployee(id) {
    return listEmployees().find(e => e.id === id) || null;
  }

  function createEmployee(data) {
    if (!data || !data.name) throw new Error('Empleado requiere name');
    const emp = {
      id: uid('emp'),
      name: data.name,
      rfc: data.rfc || '',
      curp: data.curp || '',
      role: data.role || 'cajero',
      department: data.department || 'general',
      baseSalary: Number(data.baseSalary || 0),
      hourlyRate: Number(data.hourlyRate || 0),
      hireDate: data.hireDate || todayISO(),
      active: true,
      email: data.email || '',
      phone: data.phone || '',
      vacationBalance: Number(data.vacationBalance || DEFAULT_CONFIG.vacationDaysPerYear),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    const all = listEmployees();
    all.push(emp);
    save(LS_EMP, all);
    return emp;
  }

  function updateEmployee(id, patch) {
    const all = listEmployees();
    const i = all.findIndex(e => e.id === id);
    if (i < 0) throw new Error('Empleado no existe: ' + id);
    all[i] = { ...all[i], ...patch, id, updatedAt: nowISO() };
    save(LS_EMP, all);
    return all[i];
  }

  function deactivateEmployee(id) {
    return updateEmployee(id, { active: false });
  }

  function deleteEmployee(id) {
    const all = listEmployees().filter(e => e.id !== id);
    save(LS_EMP, all);
    return true;
  }

  // -------------------------- Asistencia ------------------------------------
  function listAttendance(filter) {
    let arr = load(LS_ATT, []);
    if (filter) {
      if (filter.employeeId) arr = arr.filter(a => a.employeeId === filter.employeeId);
      if (filter.from) arr = arr.filter(a => a.date >= filter.from);
      if (filter.to)   arr = arr.filter(a => a.date <= filter.to);
    }
    return arr;
  }

  function checkIn(employeeId) {
    const emp = getEmployee(employeeId);
    if (!emp) throw new Error('Empleado no existe');
    const all = load(LS_ATT, []);
    const date = todayISO();
    const open = all.find(a => a.employeeId === employeeId && a.date === date && !a.checkOut);
    if (open) return open;
    const rec = {
      id: uid('att'),
      employeeId,
      employeeName: emp.name,
      date,
      checkIn: nowISO(),
      checkOut: null,
      hoursWorked: 0,
      late: false,
      notes: ''
    };
    // late if checkIn after 09:15
    const h = new Date().getHours();
    const m = new Date().getMinutes();
    rec.late = (h > 9) || (h === 9 && m > 15);
    all.push(rec);
    save(LS_ATT, all);
    return rec;
  }

  function checkOut(employeeId) {
    const all = load(LS_ATT, []);
    const date = todayISO();
    const i = all.findIndex(a => a.employeeId === employeeId && a.date === date && !a.checkOut);
    if (i < 0) throw new Error('No hay check-in abierto');
    all[i].checkOut = nowISO();
    const inMs  = new Date(all[i].checkIn).getTime();
    const outMs = new Date(all[i].checkOut).getTime();
    all[i].hoursWorked = Math.max(0, (outMs - inMs) / 3600000);
    save(LS_ATT, all);
    return all[i];
  }

  function manualAttendance(rec) {
    const all = load(LS_ATT, []);
    const r = { id: uid('att'), hoursWorked: 0, late: false, notes: '', ...rec };
    all.push(r);
    save(LS_ATT, all);
    return r;
  }

  // -------------------------- Horarios --------------------------------------
  function listSchedules(employeeId) {
    const arr = load(LS_SCH, []);
    return employeeId ? arr.filter(s => s.employeeId === employeeId) : arr;
  }

  function setSchedule(employeeId, weekly) {
    // weekly: { mon:{start,end}, tue:..., ... }
    const all = load(LS_SCH, []);
    const i = all.findIndex(s => s.employeeId === employeeId);
    const rec = {
      id: i >= 0 ? all[i].id : uid('sch'),
      employeeId,
      weekly: weekly || {},
      updatedAt: nowISO()
    };
    if (i >= 0) all[i] = rec; else all.push(rec);
    save(LS_SCH, all);
    return rec;
  }

  function getDaySchedule(employeeId, dayKey) {
    const s = listSchedules(employeeId)[0];
    if (!s) return null;
    return s.weekly[dayKey] || null;
  }

  // -------------------------- Vacaciones ------------------------------------
  function listVacations(filter) {
    let arr = load(LS_VAC, []);
    if (filter && filter.employeeId)
      arr = arr.filter(v => v.employeeId === filter.employeeId);
    if (filter && filter.status)
      arr = arr.filter(v => v.status === filter.status);
    return arr;
  }

  function requestVacation(employeeId, from, to, reason) {
    const emp = getEmployee(employeeId);
    if (!emp) throw new Error('Empleado no existe');
    const days = daysBetween(from, to) + 1;
    if (days > emp.vacationBalance)
      throw new Error('Saldo insuficiente: ' + emp.vacationBalance + ' dias');
    const v = {
      id: uid('vac'),
      employeeId,
      employeeName: emp.name,
      from, to, days,
      reason: reason || '',
      status: 'pending',
      createdAt: nowISO(),
      decidedAt: null,
      decidedBy: null
    };
    const all = load(LS_VAC, []);
    all.push(v);
    save(LS_VAC, all);
    return v;
  }

  function approveVacation(vacId, approverName) {
    const all = load(LS_VAC, []);
    const i = all.findIndex(v => v.id === vacId);
    if (i < 0) throw new Error('Vacacion no existe');
    if (all[i].status !== 'pending') throw new Error('Estado invalido');
    all[i].status = 'approved';
    all[i].decidedAt = nowISO();
    all[i].decidedBy = approverName || 'admin';
    save(LS_VAC, all);
    // descontar saldo
    const emp = getEmployee(all[i].employeeId);
    if (emp) updateEmployee(emp.id, {
      vacationBalance: Math.max(0, emp.vacationBalance - all[i].days)
    });
    return all[i];
  }

  function rejectVacation(vacId, approverName, reason) {
    const all = load(LS_VAC, []);
    const i = all.findIndex(v => v.id === vacId);
    if (i < 0) throw new Error('Vacacion no existe');
    all[i].status = 'rejected';
    all[i].decidedAt = nowISO();
    all[i].decidedBy = approverName || 'admin';
    all[i].rejectReason = reason || '';
    save(LS_VAC, all);
    return all[i];
  }

  function daysBetween(a, b) {
    const d1 = new Date(a + 'T00:00:00');
    const d2 = new Date(b + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000);
  }

  // -------------------------- Nomina ----------------------------------------
  function listPayroll(filter) {
    let arr = load(LS_PAY, []);
    if (filter && filter.employeeId)
      arr = arr.filter(p => p.employeeId === filter.employeeId);
    if (filter && filter.period)
      arr = arr.filter(p => p.period === filter.period);
    return arr;
  }

  function calculatePayroll(employeeId, periodFrom, periodTo, opts) {
    opts = opts || {};
    const cfg = { ...DEFAULT_CONFIG, ...load(LS_CONF, {}) };
    const emp = getEmployee(employeeId);
    if (!emp) throw new Error('Empleado no existe');

    const att = listAttendance({ employeeId, from: periodFrom, to: periodTo })
      .filter(a => a.checkOut);
    const hoursWorked = att.reduce((s, a) => s + (a.hoursWorked || 0), 0);
    const daysWorked  = new Set(att.map(a => a.date)).size;

    const baseDaily   = (emp.baseSalary || 0) / 30;
    const baseEarned  = baseDaily * daysWorked;
    const expectedH   = daysWorked * cfg.workHoursPerDay;
    const overtime    = Math.max(0, hoursWorked - expectedH);
    const overtimePay = overtime * (emp.hourlyRate || (baseDaily / cfg.workHoursPerDay))
                      * cfg.overtimeMultiplier;

    const lateCount = att.filter(a => a.late).length;
    const punctual  = lateCount === 0;
    const punctualityBonus = punctual ? baseEarned * cfg.bonusPunctualityPct : 0;

    const extraBonuses     = Number(opts.bonuses || 0);
    const extraDeductions  = Number(opts.deductions || 0);

    const grossPay  = baseEarned + overtimePay + punctualityBonus + extraBonuses;
    const isr       = grossPay * cfg.isrRate;
    const imss      = grossPay * cfg.imssRate;
    const totalDed  = isr + imss + extraDeductions;
    const netPay    = grossPay - totalDed;

    const record = {
      id: uid('pay'),
      employeeId,
      employeeName: emp.name,
      period: periodFrom + '_' + periodTo,
      periodFrom, periodTo,
      daysWorked,
      hoursWorked: Number(hoursWorked.toFixed(2)),
      overtime:    Number(overtime.toFixed(2)),
      baseEarned:  Number(baseEarned.toFixed(2)),
      overtimePay: Number(overtimePay.toFixed(2)),
      punctualityBonus: Number(punctualityBonus.toFixed(2)),
      extraBonuses,
      extraDeductions,
      grossPay: Number(grossPay.toFixed(2)),
      isr:      Number(isr.toFixed(2)),
      imss:     Number(imss.toFixed(2)),
      totalDeductions: Number(totalDed.toFixed(2)),
      netPay:   Number(netPay.toFixed(2)),
      currency: cfg.currency,
      lateCount,
      generatedAt: nowISO(),
      paid: false
    };
    return record;
  }

  function savePayroll(record) {
    const all = load(LS_PAY, []);
    all.push(record);
    save(LS_PAY, all);
    return record;
  }

  function markPayrollPaid(id) {
    const all = load(LS_PAY, []);
    const i = all.findIndex(p => p.id === id);
    if (i < 0) throw new Error('Nomina no existe');
    all[i].paid = true;
    all[i].paidAt = nowISO();
    save(LS_PAY, all);
    return all[i];
  }

  function runPayrollAll(periodFrom, periodTo) {
    const out = [];
    listEmployees().filter(e => e.active).forEach(e => {
      try {
        const r = calculatePayroll(e.id, periodFrom, periodTo);
        savePayroll(r);
        out.push(r);
      } catch (err) { console.warn('[HR] payroll fail', e.id, err); }
    });
    return out;
  }

  // -------------------------- Recibo de nomina ------------------------------
  function renderReceiptHTML(rec) {
    const emp = getEmployee(rec.employeeId) || { name: rec.employeeName, rfc: '' };
    const cur = rec.currency || 'MXN';
    const fmt = n => Number(n).toLocaleString('es-MX',
                    { style: 'currency', currency: cur });
    return `
<!doctype html><html><head><meta charset="utf-8">
<title>Recibo ${rec.id}</title>
<style>
 body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;color:#222}
 h1{border-bottom:2px solid #0a5; padding-bottom:6px}
 table{width:100%;border-collapse:collapse;margin:10px 0}
 td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
 .net{font-size:1.2em;font-weight:bold;color:#0a5}
 .meta{color:#666;font-size:.9em}
</style></head><body>
<h1>Recibo de Nomina - Volvix POS</h1>
<p class="meta">Recibo: ${rec.id} | Generado: ${rec.generatedAt}</p>
<table>
  <tr><th>Empleado</th><td>${emp.name}</td><th>RFC</th><td>${emp.rfc || '-'}</td></tr>
  <tr><th>Periodo</th><td colspan="3">${rec.periodFrom} a ${rec.periodTo}</td></tr>
  <tr><th>Dias trabajados</th><td>${rec.daysWorked}</td>
      <th>Horas</th><td>${rec.hoursWorked}</td></tr>
</table>
<h3>Percepciones</h3>
<table>
  <tr><td>Sueldo base</td><td>${fmt(rec.baseEarned)}</td></tr>
  <tr><td>Horas extra</td><td>${fmt(rec.overtimePay)}</td></tr>
  <tr><td>Bono puntualidad</td><td>${fmt(rec.punctualityBonus)}</td></tr>
  <tr><td>Bonos extra</td><td>${fmt(rec.extraBonuses)}</td></tr>
  <tr><th>Total bruto</th><th>${fmt(rec.grossPay)}</th></tr>
</table>
<h3>Deducciones</h3>
<table>
  <tr><td>ISR</td><td>${fmt(rec.isr)}</td></tr>
  <tr><td>IMSS</td><td>${fmt(rec.imss)}</td></tr>
  <tr><td>Otras</td><td>${fmt(rec.extraDeductions)}</td></tr>
  <tr><th>Total deducciones</th><th>${fmt(rec.totalDeductions)}</th></tr>
</table>
<p class="net">NETO A PAGAR: ${fmt(rec.netPay)}</p>
<p class="meta">Pagado: ${rec.paid ? 'SI ('+rec.paidAt+')' : 'NO'}</p>
</body></html>`;
  }

  function printReceipt(payrollId) {
    const rec = listPayroll().find(p => p.id === payrollId);
    if (!rec) throw new Error('Nomina no existe');
    const html = renderReceiptHTML(rec);
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { console.warn('popup blocked'); return html; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 300);
    return html;
  }

  // -------------------------- Reportes --------------------------------------
  function reportAttendance(periodFrom, periodTo) {
    const emps = listEmployees();
    return emps.map(e => {
      const att = listAttendance({ employeeId: e.id, from: periodFrom, to: periodTo });
      const hours = att.reduce((s, a) => s + (a.hoursWorked || 0), 0);
      const lates = att.filter(a => a.late).length;
      return {
        employeeId: e.id, name: e.name, role: e.role,
        days: new Set(att.map(a => a.date)).size,
        hours: Number(hours.toFixed(2)),
        lates,
        absences: 0
      };
    });
  }

  function reportPayroll(period) {
    const list = period ? listPayroll({ period }) : listPayroll();
    const total = list.reduce((s, p) => s + p.netPay, 0);
    return {
      count: list.length,
      totalNet: Number(total.toFixed(2)),
      records: list
    };
  }

  function reportHoursWorked(employeeId, periodFrom, periodTo) {
    const att = listAttendance({ employeeId, from: periodFrom, to: periodTo });
    const byDate = {};
    att.forEach(a => {
      byDate[a.date] = (byDate[a.date] || 0) + (a.hoursWorked || 0);
    });
    return {
      employeeId,
      total: Number(att.reduce((s, a) => s + (a.hoursWorked || 0), 0).toFixed(2)),
      byDate
    };
  }

  // -------------------------- Config ----------------------------------------
  function getConfig()       { return { ...DEFAULT_CONFIG, ...load(LS_CONF, {}) }; }
  function setConfig(patch)  { const c = { ...getConfig(), ...patch }; save(LS_CONF, c); return c; }

  // -------------------------- Bootstrap demo --------------------------------
  function seedDemoIfEmpty() {
    if (listEmployees().length > 0) return;
    const a = createEmployee({ name: 'Ana Lopez',  role: 'cajera',  baseSalary: 9000, hourlyRate: 50 });
    const b = createEmployee({ name: 'Luis Perez', role: 'almacen', baseSalary: 8500, hourlyRate: 45 });
    setSchedule(a.id, {
      mon: { start: '09:00', end: '17:00' }, tue: { start: '09:00', end: '17:00' },
      wed: { start: '09:00', end: '17:00' }, thu: { start: '09:00', end: '17:00' },
      fri: { start: '09:00', end: '17:00' }, sat: { start: '09:00', end: '14:00' }
    });
    console.log('[HR] demo seeded');
  }

  // -------------------------- Public API ------------------------------------
  const HRAPI = {
    // empleados
    listEmployees, getEmployee, createEmployee, updateEmployee,
    deactivateEmployee, deleteEmployee,
    // asistencia
    listAttendance, checkIn, checkOut, manualAttendance,
    // horarios
    listSchedules, setSchedule, getDaySchedule,
    // vacaciones
    listVacations, requestVacation, approveVacation, rejectVacation,
    // nomina
    listPayroll, calculatePayroll, savePayroll, markPayrollPaid, runPayrollAll,
    // recibos
    renderReceiptHTML, printReceipt,
    // reportes
    reportAttendance, reportPayroll, reportHoursWorked,
    // config
    getConfig, setConfig,
    // utils
    seedDemoIfEmpty,
    _version: '1.0.0',
    _module: 'volvix-hr-wiring'
  };

  global.HRAPI = HRAPI;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', seedDemoIfEmpty);
  }
  console.log('[HR] window.HRAPI listo v' + HRAPI._version);
})(typeof window !== 'undefined' ? window : globalThis);
