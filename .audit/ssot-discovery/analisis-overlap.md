# SSOT — Análisis de Overlap & Conflictos

## Decisiones humanas aplicadas
- ✅ **Giro = NEGOCIO puro** (no producto+especialización)
- ✅ **Slugs basura se borran del SSOT pero se mantienen en F001** (resolvidos via fuzzy match)
- ✅ **Estrategia: crear giros_maestro nuevo + vista compat + migrar gradualmente**

## Estadísticas finales

| Métrica | Valor |
|---|---|
| Giros canónicos en SSOT | **36** |
| Sinónimos consolidados | **266** |
| Slugs F008 (ecosystem JSON) totales | 300 |
| Slugs F008 mapeados a un canónico | 300 |
| Slugs F008 sin mapeo (review humano) | **0** |
| Cobertura F008 | **100%** |

## Distribución por categoría

- **alimentos**: 16 giros
- **retail**: 9 giros
- **salud**: 4 giros
- **belleza**: 2 giros
- **automotriz**: 1 giros
- **servicios**: 3 giros
- **industrial**: 1 giros

## Slugs sin mapeo (revisar 1×1)

Esos son slugs que aparecieron en alguna fuente pero el script no pudo asignarlos a un canónico. Probablemente requieren decisión humana:

✅ Ninguno — cobertura 100%

## Artefactos generados (NO ejecutados)

1. `.audit/ssot-discovery/giros-canonicos.json` — los 36 giros raíz
2. `.audit/ssot-discovery/merges-propuestos.json` — mapping completo
3. `.audit/ssot-discovery/giros-maestro.sql` — DDL + seed + vistas compat
4. `.audit/ssot-discovery/analisis-overlap.md` — este archivo

## ⚠️ NADA SE EJECUTÓ TODAVÍA EN PRODUCCIÓN

Para aplicar:
1. Revisa los 4 archivos
2. Si OK, dame autorización explícita para FASE 4 (backup + apply SQL + actualizar consumers)
