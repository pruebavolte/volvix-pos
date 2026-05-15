# Validación Wave 3.4 — Huérfanos

> Generado: 2026-05-15 · Wave 3 SalvadoreX SDD Blitz
> Fuente: system-map.json (v2.0) + schema-truth.md + .specify/contracts/endpoints/

---

## 3.4.1 — Nodos huérfanos en el grafo (0 relaciones)

**Resultado: 0 nodos con 0 relaciones.**

El grafo tiene 144 nodos y 220 relaciones. Todos los nodos tienen al menos 1 relación.

Sin embargo, existen **102 nodos de baja conectividad** (≤1 relación) — casi el 71% del grafo. Esto es señal de un grafo subpoblado: los endpoints no están conectados a sus screens consumidoras.

### Nodos de muy baja conectividad por tipo

| Tipo | Nodos totales | Nodos con ≤1 relación | % |
|------|---------------|----------------------|---|
| endpoint | 86 | 86 | 100% |
| modal | 13 | 11 | 85% |
| cfg_tab | 9 | 9 | 100% |
| pdc_tab | 5 | 4 | 80% |
| screen | 29 | 2 | 7% |
| modulo | 2 | 0 | 0% |

**Interpretación**: Los 86 endpoints tienen exactamente 1 relación cada uno (solo su arista de "pertenece a archivo"). Ningún endpoint está conectado explícitamente a las screens que lo consumen. El grafo está incompleto en la dimensión screen→endpoint.

---

## 3.4.2 — Tablas huérfanas en BD

Tablas documentadas en schema-truth.md que NINGÚN contrato de endpoint menciona:

### Core tables sin cobertura en contratos de endpoint (top 10 por criticidad)

| Tabla | Menciones en API | Contratos que la documentan | Riesgo |
|-------|------------------|-----------------------------|--------|
| `pos_sales` | 24 (más usada) | **0** | CRÍTICO |
| `pos_users` | 24 (más usada) | **0** | CRÍTICO |
| `pos_security_alerts` | 20 | **0** | ALTO |
| `inventory_movements` | 13 | **0** | ALTO |
| `customers` | 9 | **0** | ALTO |
| `volvix_audit_log` | 5 | **0** | MEDIO |
| `pos_otp_verifications` | 5 | **0** | MEDIO |
| `invoices` | 5 | **0** | MEDIO |
| `cuts` | 2 | **0** | MEDIO |
| `pending_sales` | 2 | **0** | MEDIO |

**Tablas WITH contrato**: Solo 3 tablas son mencionadas en contratos de endpoint:
- `pos_companies` → en GET-api-admin-tenants.spec.md
- `pos_products` → en GET-api-admin-tenant.spec.md
- `volvix_tenants` → en GET-api-admin-tenant.spec.md

**Conclusión**: 28 de las 31 tablas core analizadas (90%) no tienen cobertura en contratos de endpoint. Solo se documentaron 8 endpoints de los 121 detectados en el POS — cobertura del 6.6%.

---

## 3.4.3 — Sufijos prohibidos detectados

| Tabla | Sufijo | Detectado en | Riesgo |
|-------|--------|--------------|--------|
| `product_variants_v2` | `_v2` | schema-truth.md | MEDIO — ambigüedad con v1 |

**Total**: 1 tabla con sufijo prohibido.

Sufijos buscados y resultado:
- `_v2` → 1 tabla detectada (`product_variants_v2`)
- `_temp` → 0 detectados
- `_old` → 0 detectados
- `_backup` → 0 detectados
- `_copy` → 0 detectados

**Nota**: El schema-truth registra grupos de duplicación semántica más grave (D2–D11): tablas con nombres diferentes para el mismo concepto (`sales`/`pos_sales`/`volvix_ventas`, `tenants`/`pos_tenants`/`volvix_tenants`/`companies`/`pos_companies`), que son "huérfanos de naming" aunque no tengan sufijos prohibidos.

---

## 3.4.4 — Grupos de duplicación semántica (de schema-truth)

| Grupo | Tablas | Severidad |
|-------|--------|-----------|
| D2 — Ventas | `sales` + `pos_sales` + `volvix_ventas` | ALTA |
| D3 — Tenants | `tenants` + `pos_tenants` + `volvix_tenants` + `companies` + `pos_companies` | ALTA |
| D4 — Clientes | `customers` + `pos_customers` | MEDIA |
| D5 — Órdenes compra | `purchase_orders` + `pos_purchase_orders` | MEDIA |
| D6 — Cortes | `cuts` + `pos_cortes` + `pos_cut_adjustments` | MEDIA |
| D7 — OTP | `otp_verifications` + `pos_otp_verifications` + `otp_codes` | MEDIA |
| D8 — Settings | `tenant_settings` + `pos_tenant_settings` | BAJA |
| D9 — Módulos | `tenant_module_overrides` + `tenant_module_flags` + `pos_tenant_modules` | BAJA |
| D10 — Academia | `academy_progress` + `user_academy_progress` | BAJA |
| D11 — Sync | `sync_sessions` + `sync_queue` | BAJA |

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Nodos totales en grafo | 144 |
| Relaciones totales | 220 |
| Nodos con 0 relaciones (huérfanos puros) | **0** |
| Nodos con ≤1 relación (semi-huérfanos) | **102** (71%) |
| Endpoints con 0 conexiones a screens | **86/86** (100%) |
| Tablas core sin cobertura en endpoint contracts | **28/31** (90%) |
| Tablas con sufijos prohibidos | **1** (`product_variants_v2`) |
| Grupos de duplicación semántica | **10** (D2–D11) |
