# ADR-004: Canonizar tablas `pos_*` y eliminar referencias legacy a `sales`/`volvix_ventas`

**Status**: Propuesto
**Fecha**: 2026-05-15

---

## Contexto

Análisis estático de `api/index.js` (servidor) confirma que **el backend usa consistentemente las tablas `pos_*`**:

| Tabla canónica | Usos en backend | Tabla legacy mencionada | Usos legacy |
|---|---|---|---|
| `pos_sales` | **181** | `sales`, `volvix_ventas` | 0 (backend), pero menciones en `public/pdf-export.js` |
| `pos_products` | **141** | `products`, `volvix_productos` | 0 |
| `pos_customers` | **6** | `customers` | 0 |

**Sin embargo**, los contratos `.specify/contracts/screens/*.spec.md` documentan que:
- `pdf-export.js` lee de `sales` (deuda **D2** marcada como ALTA en `pos.spec.md` §10)
- Migraciones SQL antiguas usan `volvix_ventas` y `volvix_productos`
- Los stubs PDC pueden estar leyendo de `customers` (no verificado)

## Riesgo

Si en algún momento alguien crea un endpoint nuevo y por copy-paste lee de `sales` en lugar de `pos_sales`, los datos quedarán divergentes. Worse: si las dos tablas existen físicamente en Supabase con RLS distinta, **un cajero con permiso `cobrar` podría ver ventas de OTRO tenant** vía la tabla mal protegida.

## Decisión

**Auditar y consolidar en `pos_*` con DROP de tablas legacy**.

### Plan (estimado 6h + migración SQL)

**Fase 1 — Auditoría (1h)**:
```sql
-- En Supabase, listar todas las tablas:
SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) AS cols
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;

-- Para cada tabla "sospechosa" (sales, customers, products, volvix_*):
SELECT COUNT(*) FROM sales;
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM products;
-- Si > 0 → tienen datos. Migrar.
-- Si 0 → vacías. Drop directo.
```

**Fase 2 — Migrar datos huérfanos (2h)**:
```sql
INSERT INTO pos_sales (...) SELECT ... FROM sales WHERE NOT EXISTS (SELECT 1 FROM pos_sales WHERE pos_sales.id = sales.id);
-- Idem para customers/products.
```

**Fase 3 — Refactor código frontend (2h)**:
- `public/pdf-export.js`: cambiar `from('sales')` → `from('pos_sales')`.
- Buscar globalmente `'sales'` (string literal) en todos los archivos `public/*.js` y migrar.
- Grep similar para `customers`, `products`, `volvix_ventas`, `volvix_productos`.

**Fase 4 — DROP de tablas legacy (1h, con respaldo)**:
```sql
DROP TABLE sales CASCADE;
DROP TABLE customers CASCADE;
DROP TABLE products CASCADE;
DROP TABLE volvix_ventas CASCADE;
DROP TABLE volvix_productos CASCADE;
```

## Consecuencias

### Más fácil
- Backup/restore: una sola tabla por concepto.
- RLS: políticas en un solo lugar (no hay riesgo de tabla "olvidada" sin RLS).
- IA: el contrato dice "tabla única `pos_sales`", sin ambigüedad.

### Más difícil
- Si alguien tiene scripts externos (Excel, Looker, Metabase) leyendo de `sales`, romperá.
- DROP es irreversible (mitigado por respaldo).

### Pre-requisitos
- Tener respaldo verificado de Supabase ANTES de la Fase 4.
- Notificar a usuarios de scripts externos con 7 días de anticipación.

## Métricas de éxito
- ✅ `SELECT count(*)` regresa el mismo número antes y después de la migración para `pos_*`.
- ✅ `grep -r "from('sales')"` en `public/` retorna 0 matches.
- ✅ `DROP TABLE sales` succeed sin errors.
- ✅ Smoke test en producción: cobrar ticket → aparece en historial → backup contiene la venta.
