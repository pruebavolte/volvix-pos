# R14 · Motor Fiscal SAT México — Reporte de Implementación

Fecha: 2026-04-26
Stack: Node serverless + Supabase + JS cliente
Alcance: motor fiscal MX más allá de CFDI básico (IVA multi-tasa, IEPS por categoría, retenciones, complementos CFDI 4.0, mapping productos → claveProdServ).

## Archivos creados / modificados

| Archivo | Tipo | Función |
|---|---|---|
| `public/volvix-tax-engine-mx.js` | nuevo | Motor cliente `Volvix.tax.mx.*` (calcular, retenciones, complemento, mapProductToSAT) |
| `db/R14_SAT_CATALOGS.sql` | nuevo | Tablas SAT + seeds (clave_prodserv top 200, clave_unidad, forma_pago, metodo_pago, uso_cfdi, regimen_fiscal, product_sat_mapping) |
| `api/index.js` | modificado | Endpoints REST `/api/tax/mx/*` (catálogos, calculate, product-mapping GET/POST) |
| `R14_TAX_MX.md` | nuevo | Este reporte |

## API JS — `Volvix.tax.mx`

```js
// 1. Calcular ticket completo
const r = Volvix.tax.mx.calcular([
  { nombre:'Coca-Cola 600ml', cantidad:2, precio_unitario:18 },
  { nombre:'Tortilla',         cantidad:1, precio_unitario:25 },        // -> IVA 0%
  { nombre:'Cerveza Modelo',   cantidad:6, precio_unitario:22, ieps_categoria:'cerveza' },
  { nombre:'Honorarios consultoría', cantidad:1, precio_unitario:10000 },
], { frontera:false, regimen:'612', uso_cfdi:'G03', retencion_tipo:'honorarios' });
// -> { subtotal, iva_16, iva_8, iva_0, exento_total, ieps_total, ret_isr, ret_iva, total, items[] }

// 2. Retenciones aisladas
Volvix.tax.mx.retenciones(10000, 'honorarios');     // ISR 1000, IVA ret 1066.67
Volvix.tax.mx.retenciones(10000, 'arrendamiento');  // idem
Volvix.tax.mx.retenciones(50000, 'fletes');         // IVA ret 4%
Volvix.tax.mx.retenciones(50000, 'subcontratacion');// IVA ret 6% (REPSE)

// 3. Complementos CFDI 4.0
Volvix.tax.mx.complemento('pagos',     { monto:5000, forma_pago:'03', moneda:'MXN' });
Volvix.tax.mx.complemento('nomina',    { tipo_nomina:'O', dias_pagados:15, percepciones:{...} });
Volvix.tax.mx.complemento('donativos', { no_autorizacion:'12345', fecha_autorizacion:'2024-01-01' });
Volvix.tax.mx.complemento('comercio_exterior', { clave_pedimento:'A1', total_usd:1500 });

// 4. Mapping producto -> SAT por nombre
Volvix.tax.mx.mapProductToSAT('Laptop Dell Inspiron'); // -> { clave:'43211503', unidad:'PIE' }
```

## Tasas / lógica implementada

### IVA
- 16% general
- 8% región fronteriza norte/sur (cuando `scenario.frontera=true` o `tipo_iva='8'`)
- 0% alimentos básicos, medicinas patente (heurística por nombre + override `tipo_iva='0'`)
- Exento: libros, revistas, periódicos, consultas médicas, colegiaturas autorizadas

### IEPS por categoría (LIEPS art. 2)
| Categoría | Tasa |
|---|---|
| Cerveza, alcohol ≤14° | 26.5% |
| Alcohol 14°–20° | 30% |
| Alcohol >20° | 53% |
| Bebidas energizantes | 25% |
| Tabacos labrados | 16% (+ cuota específica) |
| Alimentos alta densidad calórica (chatarra >275 kcal/100g) | 8% |
| Plaguicidas Cat 1-2 / 3 / 4 | 9 / 7 / 6% |
| Apuestas y sorteos | 30% |
| Telecomunicaciones | 3% |

IEPS se suma a la base antes del cálculo de IVA (LIVA art. 12).

### Retenciones
| Tipo | ISR | IVA retenido |
|---|---|---|
| Honorarios PF | 10% | 10.6667% (2/3 de 16%) |
| Arrendamiento PF | 10% | 10.6667% |
| Fletes / autotransporte | — | 4% |
| Subcontratación REPSE | — | 6% |
| Dividendos | 10% | — |

### Complementos soportados
`pagos` (2.0), `nomina` (1.2), `donativos` (1.1), `comercio_exterior` (2.0), `ine` (1.1), `leyendas` (1.0), `iedu` (1.0).

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/tax/mx/catalogs/:catalog` | Lee catálogo SAT (`clave_prodserv`, `clave_unidad`, `forma_pago`, `metodo_pago`, `uso_cfdi`, `regimen_fiscal`). Soporta `?q=...` para búsqueda en clave_prodserv. |
| POST | `/api/tax/mx/calculate` | Calcula impuestos server-side. Body: `{ items:[], scenario:{} }`. |
| GET | `/api/tax/mx/product-mapping/:product_id` | Lee mapping SAT del producto. |
| POST | `/api/tax/mx/product-mapping` | Crea/actualiza mapping (upsert por product_id). |

Todos requieren JWT (`requireAuth`). Validación de UUID activa.

## Schema BD

7 tablas nuevas en `db/R14_SAT_CATALOGS.sql`:
1. `sat_clave_prodserv` — 70 claves seed top retail/restaurante/servicios + índice GIN español
2. `sat_clave_unidad` — 23 unidades comunes
3. `sat_forma_pago` — 22 formas (catálogo SAT vigente 2024)
4. `sat_metodo_pago` — PUE / PPD
5. `sat_uso_cfdi` — 24 usos (G/I/D/CP/S — incluye CP01 para complemento de pagos y S01 sin efectos fiscales)
6. `sat_regimen_fiscal` — 21 regímenes (incluye 626 RESICO)
7. `product_sat_mapping` — RLS por tenant_id, FKs a clave_prodserv y clave_unidad, trigger updated_at

## Catálogo top 200 productos

70 claves SAT seed cubren las verticales principales:
- Restaurante / bar / cafetería (8 claves)
- Abarrotes / alimentos (12 claves base 0% IVA)
- Higiene y limpieza (8 claves)
- Vestido y calzado (4 claves)
- Electrónica / electrodomésticos (10 claves)
- Hogar y muebles (4 claves)
- Papelería / oficina / ferretería (4 claves)
- Salud / medicamentos (1 clave 0%)
- Combustibles (3 claves con IEPS)
- Servicios profesionales (5 claves)
- Mascotas, belleza, juguetes, deporte (varios)

El cliente JS extiende esto con 40+ patrones regex (`KEYWORD_MAP`) que mapean nombres de producto en español a clave/unidad/IEPS automáticamente. Para producción se debe poblar `product_sat_mapping` por tenant.

## Verificación recomendada

- [ ] Aplicar `db/R14_SAT_CATALOGS.sql` contra Supabase prod
- [ ] Cargar `public/volvix-tax-engine-mx.js` en pages POS/facturación
- [ ] Probar `POST /api/tax/mx/calculate` con ticket de 5 ítems mixto (16/8/0/exento + IEPS)
- [ ] Validar que cliente y servidor producen mismo total (paridad ±0.01 MXN)
- [ ] Smoke test catálogos: `GET /api/tax/mx/catalogs/clave_prodserv?q=laptop`

## Notas / limitaciones

- Cuotas específicas IEPS (combustibles fósiles, tabaco, bebidas saborizadas) requieren tablas adicionales SAT actualizadas mensualmente — no incluidas en este motor.
- Catálogo completo `c_ClaveProdServ` SAT tiene ~52,000 claves; se incluyeron 70 seed + heurística regex. Producción debe importar CSV oficial del SAT.
- Complementos generan estructura JSON; serialización a XML CFDI sigue siendo responsabilidad del PAC integrador (`volvix-cfdi-wiring.js`).
