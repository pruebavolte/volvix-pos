# NEW_BUGS_DETECTED.md

Bugs nuevos detectados durante el monitoreo post-deploy (semana 1+).

**REGLA**: NO reparar automáticamente. Solo documentar para revisión humana.

---

## Estado inicial: ninguno detectado

Última verificación: 2026-05-12 (deploy v1.0.181).

Mantener este archivo actualizado cada vez que `alerts.js` detecte algo nuevo o el daily smoke falle por razón no documentada en `RUNBOOK.md`.

### Template para nuevos bugs

```
## BUG-Mw1 (semana 1) — Título corto
**Detectado**: YYYY-MM-DD HH:MM
**Métrica**: M1/M2/M3/M4/M5
**Tenant(s)**: <ids>
**Síntoma**: <descripción>
**Evidencia**: <link a query Supabase o logs>
**Reproducible**: SÍ/NO
**Severidad estimada**: P0/P1/P2/P3
**Acción tomada**: <ninguna / mitigación temporal>
**Para reparación**: SÍ - asignar a equipo / NO - tech debt aceptado
```
