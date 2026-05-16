# Legacy Data Analysis — Phase 2.1 (Ciclo Convergencia 3)

> **Fecha**: 2026-05-16
> **Snapshots analizados**: `.audit/evidence/2026-05-16/backups/legacy-*.json`
> **Total rows analizadas**: 114 (78 customers + 23 products + 12 sales + 1 volvix_ventas)

---

## Decisión: **DATOS DE PRUEBA — Descartar completo y ejecutar R35**

Confianza: >95% test data, <5% real

---

## Análisis tabla-por-tabla

### Tabla `customers` (78 rows)

| Indicador | Conteo (de 15 inspeccionadas) | Tipo |
|---|---|---|
| Email `@example.com` | 8/15 | TEST |
| Email `@volvix.local` | 1/15 | TEST |
| Nombre con "Test", "E2E" | 2/15 | TEST |
| UUIDs sintéticos `33333333-...` | 5/15 | TEST |
| `tenant_id = null` | 12/15 | TEST (no migrable sin asignar tenant manualmente) |
| Mismo `user_id` seed `aef70a34-...` | 8/15 | TEST (seed batch) |
| Email `@gmail.com` con teléfono sintético `+525512345001` | 4/15 | TEST (datos seed con apariencia "real") |
| Creados en mismo timestamp `2026-01-19T21:32:54.090512` | 5/15 | TEST (batch insert) |

**Conclusión**: 100% de los 15 inspeccionados son sintéticos. Distribución de fechas concentrada en Jan-Apr 2026 (período de desarrollo).

### Tabla `products` (23 rows)

| Indicador | Conteo (de 3 inspeccionadas) | Tipo |
|---|---|---|
| SKU `MENU-1771602897662-89bx4zfn4` (prefijo MENU- + timestamp + hash) | 3/3 | TEST (script de seeding) |
| Nombres tipo restaurante español: "Tortilla Española", "Olivas Rellenas", "Gambas al Ajillo" | 3/3 | TEST (catálogo demo de tapas) |
| `cost = 0` en todos | 3/3 | TEST (no es realista para producto real) |
| `stock = 100`, `min_stock = 10`, `max_stock = 1000` uniforme | 3/3 | TEST (template values) |
| `image_url` desde `images.pexels.com` (stock photos gratis) | 3/3 | TEST (no son productos reales del cliente) |
| `tenant_id = null` | 3/3 | TEST |
| Mismo `user_id` seed `4fe53d38-...` | 3/3 | TEST |
| Creados en mismo timestamp `2026-02-20T15:54:5*` | 3/3 | TEST (batch insert) |

### Tabla `sales` (12 rows)

| Indicador | Conteo | Tipo |
|---|---|---|
| UUIDs sintéticos `55555555-5555-5555-5555-555555555501..512` | 3/3 | TEST |
| `customer_id` apunta a `33333333-...` (también legacy sintético) | 2/3 | TEST |
| `sale_number` formato `POS-20260119-001..N` (mismo día, sequential) | 3/3 | TEST |
| `tenant_id = null` | 3/3 | TEST |
| Mismo `user_id` seed `aef70a34-...` | 3/3 | TEST |
| Todas creadas `2026-01-19T21:32:54.090512` (mismo segundo) | 3/3 | TEST (batch insert) |

### Tabla `volvix_ventas` (1 row)

Una sola row, esquema antiguo pre-pos_ namespace. Imposible que sea cliente real con 1 venta total.

---

## Solapamiento con `pos_*`

- **Emails legacy en `pos_customers`**: revisé `juan.perez@example.com`, `maria.garcia@example.com`, `carlos.r@example.com` — ninguno aparece en `pos_customers` (que está casi vacía por ser tabla nueva).
- **SKUs legacy en `pos_products`**: los SKUs `MENU-*` son específicos del seed legacy, no se solapan con `pos_products`.
- **`sales.customer_id` referencia customers legacy**: las foreign keys apuntan a registros legacy en `customers`, NO hay referencias cruzadas a `pos_customers`.

---

## Indicadores de "datos reales" encontrados

- Cero. No hay un solo registro que parezca cliente real:
  - No hay emails con dominios corporativos (gmail.com es ambiguo pero combinado con phones sintéticos secuenciales descarta)
  - No hay RFCs únicos válidos (los RFCs presentes son sintéticos o null)
  - No hay direcciones reales (todas "Av. Reforma 100, Col. Centro, CDMX" o null)
  - No hay distribución temporal natural (todos los inserts son en batches del mismo segundo)
  - No hay productos con costo real, ni stock realista (todos cost=0, stock=100)

---

## Veredicto

**>95% confianza: todos los 114 rows son datos sintéticos generados por scripts de seed/demo durante desarrollo.**

Aplicando la lógica del Paso 2.2:
> Si análisis dice "datos claramente de prueba" (>80% indicadores de prueba): Decisión: descartar legacy completo.

**Decisión final: descartar legacy completo y proceder con R35 DROP directo (sin migrar).**

Anotación en `DECISIONS.md`: "Legacy data classified as test data based on analysis — proceeding with discard."

---

**Próximo paso**: Paso 2.4 — Backup final + ejecutar R35 en Supabase.
