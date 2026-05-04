# R18 — Nómina Mexicana (Payroll CFDI 4.0)

## Resumen
Sistema completo de nómina mexicana con cálculo de ISR (tabla 2024) e IMSS,
y emisión de CFDI 4.0 Nómina (mock si no hay PAC configurado).

## Esquema SQL — `db/R18_PAYROLL.sql`
- `employees(id uuid, tenant_id, rfc, curp, nss, name, email, salary_daily numeric(12,2), position, hire_date, status[active|suspended|terminated])`
  - UNIQUE `(tenant_id, rfc)`
- `payroll_periods(id uuid, tenant_id, period_start date, period_end date, type[weekly|biweekly|monthly], status[draft|calculated|stamped|paid])`
- `payroll_receipts(id uuid, period_id, employee_id, gross, isr, imss, deductions jsonb, net, cfdi_nomina_uuid, xml, status)`
  - UNIQUE `(period_id, employee_id)` — idempotencia
- Triggers `updated_at`, RLS por tenant, índices en estatus / RFC / UUID CFDI.

## Endpoints — `api/index.js`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/employees` | Lista por tenant, ordenado por nombre |
| POST   | `/api/employees` | Alta con RFC/CURP/NSS, salario diario |
| PATCH  | `/api/employees/:id` | Edita campos seleccionables |
| POST   | `/api/payroll/periods` | Crea periodo en estado `draft` |
| POST   | `/api/payroll/periods/:id/calculate` | Calcula ISR + IMSS por empleado activo del tenant |
| POST   | `/api/payroll/periods/:id/stamp` | Emite CFDI 4.0 Nómina (PAC real si `PAC_*` configurado, mock si no) |
| GET    | `/api/payroll/receipts/:id/xml` | Descarga XML CFDI Nómina 1.2 |

## Cálculos
- **Días por periodo**: weekly=7, biweekly=15, monthly=30.
- **ISR (tabla mensual 2024 LISR Art. 96)**: 11 rangos (1.92%–35%). Base = `gross * (30/days_periodo)`; resultado mensual prorrateado a días del periodo.
- **IMSS empleado**: 7% × SBC × días, con tope de SBC en 25 UMA (UMA 2024 = $108.57).
- **Neto** = `gross - isr - imss`.
- `deductions jsonb` guarda desglose `{isr, imss}`.

## CFDI 4.0 Nómina (Mock + PAC)
- Si no hay `PAC_USER`/`PAC_PASS`/`PAC_URL`: genera `cfdi_nomina_uuid` con `crypto.randomUUID()`, status `mock`.
- XML completo con `cfdi:Comprobante` + `nomina12:Nomina v1.2` (Emisor/Receptor/Percepciones/Deducciones), claves 001 (IMSS) / 002 (ISR).
- Periodicidad mapeada: weekly→02, biweekly→04, monthly→05. RegimenFiscalReceptor 605, UsoCFDI CN01.

## Idempotencia
- `calculate` borra recibos previos del mismo `(period_id, employee_id)` antes de insertar.
- Solo se permite `calculate` desde `draft`/`calculated`; `stamp` exige `calculated`.

## Variables de entorno
`PAC_USER`, `PAC_PASS`, `PAC_URL` (opcionales — sin ellas se firma en modo mock).

## Estado
SQL listo para Supabase Editor. Endpoints sirven sobre `supabaseRequest()` existente con manejo de errores RFC 6585.
