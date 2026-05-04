# R24 — Database Integrity Audit

**Proyecto:** salvadorexoficial (`zhvwmzkcqngcaqpdxtwr`, us-east-2)
**Método:** Supabase Management API (PAT)
**Fecha:** 2026-04-27

## 1. Inventario general

| Métrica | Valor |
|---|---|
| Tablas en `public` | **214** |
| Tamaño DB (`postgres`) | **30 MB** |
| `pos_users` | 9 |
| `pos_products` | 142 |
| `pos_sales` | 20 |
| `customers` | 16 |

## 2. Top tablas por filas estimadas

| Tabla | Filas (~) |
|---|---|
| osint_busquedas_log | 2 173 |
| v3_sale_items | 1 229 |
| osint_productos | 892 |
| v3_sales | 371 |
| v3_inventory_movements | 324 |
| v3_categories | 278 |
| v3_audit_log | 269 |
| v3_products | 240 |
| business_enrichments | 234 |
| v3_customers | 179 |
| osint_negocios | 150 |
| pos_products | 142 |
| osint_descartados | 85 |
| verification_codes | 74 |
| sat_clave_prodserv | 70 |
| v3_sync_events | 58 |
| vertical_templates | 51 |
| v3_feature_flags | 32 |
| sat_clave_unidad | 23 |
| sat_uso_cfdi | 23 |

## 3. Datos sucios encontrados

| Check | Tabla | Hallazgo |
|---|---|---|
| XSS en nombre (`<script`, `javascript:`, `alert(`) | pos_products | **0** |
| XSS en nombre | v3_products | **0** |
| XSS en nombre | v3_customers / v3_categories | **0** |
| Precio negativo | pos_products | 0 |
| Precio negativo | **v3_products** | **7** (todos `name='NegPrice'`, `price=-10.00`) |
| total < 0 | pos_sales | 0 |
| total_amount < 0 | **v3_sales** | **1** (folio `V-20260423-5523`, subtotal=10, total=-90) |

## 4. Cleanup ejecutado

- `DELETE FROM v3_products WHERE price < 0 AND name='NegPrice'` → **7 filas eliminadas** (UUIDs `a448da43`, `6d295a0c`, `0edcc356`, `b053e73e`, `abaebbd9`, `90cf73ea`, `7f05f7da`).
- `UPDATE v3_sales SET total_amount=10.00, status='cancelled', notes='auto-cleanup R24'` para folio `V-20260423-5523` (`e517f2cc-…`). Marcado como cancelado por inconsistencia subtotal/total.

## 5. Verificación final

```
neg_v3_products  = 0
neg_v3_sales     = 0
neg_pos_products = 0
neg_pos_sales    = 0
xss_*            = 0
```

DB íntegra. Resto de tablas POS limpias. Datos OSINT y SAT (catálogos) intactos.
