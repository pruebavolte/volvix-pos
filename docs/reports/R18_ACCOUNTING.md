# R18 ACCOUNTING — Contabilidad SAT México automática

**Status:** implementado · **Fecha:** 2026-04-26 · **Slice:** 204 (idx 3080-3100)

## Objetivo
Sistema de contabilidad fiscal mexicano (SAT) automatizado: cada venta del POS genera asiento doble; gastos con CFDI proveedor se importan parseando XML; reportes financieros (balance, edo. resultados) y entrega de Contabilidad Electrónica Anexo 24 RMF (3 XML mensuales: Catálogo, Balanza, Pólizas).

## Entregables

### SQL — `db/R18_ACCOUNTING_SAT.sql`
- `accounting_accounts` — catálogo SAT (rangos 100=activo, 200=pasivo, 300=capital, 400=ingresos, 500=costos, 600=gastos, 700=resultado, 800=orden); seed estándar 15 cuentas para tenant_id=0 (template).
- `accounting_journal` — libro diario / pólizas (tipo D/I/E), columnas `debe`, `haber`, `cuenta`, `sale_id`, `expense_id`, `cfdi_uuid`, `origen`. CHECK `debe = 0 OR haber = 0`.
- `expenses` — gastos con CFDI (subtotal, IVA, total, RFC emisor, deducible, categoría, método/forma pago, UUID); índice único `(tenant_id, cfdi_uuid)`.
- Trigger **`trg_after_sale_insert`** (función `fn_after_sale_insert_journal`) — al insertar en `sales` genera 3 asientos automáticos: 101.01 Caja debe (total) / 401.01 Ventas haber (subtotal) / 208.01 IVA trasladado haber (IVA).
- Vista `v_accounting_balance` — balance de comprobación en vivo.

### API — `api/accounting-sat.js` (módulo) + wiring en `api/index.js`
| Endpoint | Método | Función |
|---|---|---|
| `/api/accounting/journal` | GET | Pólizas con filtros from/to/cuenta/sale_id/expense_id (LIMIT 500). |
| `/api/accounting/expenses` | POST | Crea gasto + asiento triple (601.01 + 118.01 IVA acreditable / 102.01 Bancos). |
| `/api/accounting/balance-sheet?as_of=` | GET | Activo/Pasivo/Capital con verificación ecuación contable. |
| `/api/accounting/income-statement?from=&to=` | GET | Ingresos − Costos − Gastos, ISR estimado 30% PM, utilidad neta. |
| `/api/accounting/cfdi-import` | POST | Parsea XML CFDI 4.0 (UUID, SubTotal, Total, Emisor RFC, Método/Forma de pago) y registra expense + póliza con conflicto idempotente. |
| `/api/accounting/contabilidad-electronica/generate?period=YYYY-MM` | POST | Genera 3 XML SAT Anexo 24 RMF v1.3: `{RFC}{YYYY}{MM}CT.xml` (Catálogo), `BN.xml` (Balanza), `PL.xml` (Pólizas con CompNal UUID_CFDI). |

## Lógica contable
- **Venta** (trigger DB): cargo Caja, abono Ventas + IVA trasladado.
- **Gasto manual**: cargo Gasto + IVA acreditable, abono Bancos (PUE pagado contado).
- **CFDI importado**: cargo Gasto + IVA acreditable, abono Proveedores 201.01 (PPD por pagar).
- **ISR**: estimado 30% sobre utilidad operativa positiva (régimen general PM).

## Wiring
`api/index.js` carga `accounting-sat.js` vía `require()` al final del IIFE, inyectando handlers, sendJSON, sendError, requireAuth y dbQuery — patrón compatible con `crm-advanced.js` / `qr-payments.js`.

## Cobertura SAT
Anexo 24 RMF cumple: Catálogo (CodAgrup, Natur D/A, Nivel) + Balanza (SaldoIni/Debe/Haber/SaldoFin) + Pólizas (Transaccion + CompNal UUID para vinculación CFDI).

## Próximos pasos
- Sellado XML con CSD del contribuyente (firma .cer/.key SAT).
- Régimen RESICO (tasa efectiva variable) y reportes DIOT.
- Conciliación bancaria automática contra estado de cuenta.
