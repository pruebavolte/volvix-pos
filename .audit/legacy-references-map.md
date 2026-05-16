# Mapa de referencias legacy en api/index.js (Fase 1.1)

> **Fecha**: 2026-05-16
> **Conteo total**: 28 ocurrencias (más de las 13 reportadas en V3)
> **Hallazgo crítico**: `pos_customers` NO EXISTE en Supabase (HTTP 404). `pos_products` y `pos_sales` SÍ existen.

## Estado de tablas en Supabase

| Tabla | HTTP status | Notas |
|---|---|---|
| `pos_customers` | **404 NOT FOUND** | 🚨 Tabla destino del refactor NO EXISTE |
| `pos_products` | 200 OK | Schema con `pos_user_id`, `tenant_id` |
| `pos_sales` | 200 OK | Funcional |
| `pos_tenants` | 200 OK | Funcional |
| `customers` (legacy) | 200 OK | Schema con 37 columnas |
| `products` (legacy) | 200 OK | — |
| `sales` (legacy) | 200 OK | — |
| `volvix_ventas` (legacy) | 200 OK | — |

## Tabla `customers` (legacy) — schema detallado

37 columnas: `id, name, email, phone, address, credit_limit, credit_balance, points, loyalty_points, active, user_id, created_at, updated_at, tenant_id, nombre, telefono, rfc, notas, activo, current_tier_id, last_visit_at, source, version, balance, deleted_at, deleted_by_user_id, credit_days, last_purchase_at, total_purchases, avg_ticket, razon_social, regimen_fiscal, uso_cfdi_default, codigo_postal, email_facturacion, whatsapp, monedero_balance`

## 28 referencias legacy mapeadas

| # | Línea | Tabla | Op | Endpoint | Destino requerido |
|---|---|---|---|---|---|
| 1 | 2929 | customers | GET | `GET /api/customers` (path principal) | pos_customers |
| 2 | 2939 | customers | GET | `GET /api/customers` (fallback) | pos_customers |
| 3 | 2944 | customers | GET | `GET /api/customers` (fallback profundo) | pos_customers |
| 4 | 2993 | customers | POST | `POST /api/customers` | pos_customers |
| 5 | 3353 | customers | GET | endpoint admin stats | pos_customers |
| 6 | 4223 | customers | POST | bootstrap tenant nuevo | pos_customers |
| 7 | 7215 | products | POST | catálogo bootstrap | pos_products |
| 8 | 7653 | products | GET | inventario | pos_products |
| 9 | 7714 | products | GET | reportes | pos_products |
| 10 | 8336 | products | (var) | mapeo interno | pos_products |
| 11 | 8337 | sales | (var) | mapeo interno | pos_sales |
| 12 | 8339 | customers | (var) | mapeo interno | pos_customers |
| 13 | 11334 | customers | POST | otro path | pos_customers |
| 14 | 18641 | customers | GET | export endpoint | pos_customers |
| 15 | 21485 | customers | GET | resolver names para sales | pos_customers |
| 16 | 21846 | sales | POST | wrapper venta (fallback) | pos_sales |
| 17 | 21860 | sales | POST | wrapper venta (2nd intento) | pos_sales |
| 18-26 | 22752-22963 | customers | PATCH/GET | individual customer ops (id-based) | pos_customers |
| 27 | 25043 | customers | GET | RFC lookup | pos_customers |
| 28 | 26212 | customers | POST | auto-create en venta | pos_customers |

## Decisión técnica

**No es viable hacer text-replace `customers` → `pos_customers` con seguridad en este ciclo**:
1. `pos_customers` NO existe — cualquier refactor produciría 5xx en producción
2. Las 28 referencias incluyen JOINs, queries complejas (PATCH individual, búsqueda por RFC, resolver names)
3. Schema diff entre legacy customers (37 cols) y pos_customers (vacío) requiere prep

**Path forward viable (R37 → refactor → R35)**:
- **R37** (este ciclo): crear `pos_customers` con `CREATE TABLE pos_customers (LIKE customers INCLUDING ALL)` + `INSERT INTO pos_customers SELECT * FROM customers`. Aditivo, no rompe nada.
- **Refactor** (siguiente ciclo): bulk replace + tests endpoint-por-endpoint
- **R35** (después del refactor): destructivo, ejecutar solo después de E2E verde

**Decisión D-V4-1**: Ejecutar SOLO R37 en este ciclo (aditivo, seguro). Deferir refactor + R35 a siguiente ciclo. ADR-004 sigue 4/5.

Razón: la regla "Si descubres data loss potencial en Fase 1: PARA y reporta" aplica. R35 sin refactor + sin pos_customers existiendo = production down completo en `/api/customers`. Eso es peor que data loss — es service loss.
