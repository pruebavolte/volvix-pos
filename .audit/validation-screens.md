# Validación Wave 3.3 — Screens

> Generado: 2026-05-15 · Wave 3 SalvadoreX SDD Blitz
> Fuente: system-map.json (v2.0) + .specify/contracts/screens/

---

## Cobertura

| Categoría | Total en system-map | Con contrato Tier 1 | Con stub Tier 2 | SIN contrato |
|---|---|---|---|---|
| screen | 29 | 5 | 24 | 0 |
| cfg_tab | 9 | 0 | 0 | 9 |
| pdc_tab | 5 | 0 | 5 | 0 |
| **TOTAL** | **43** | **5** | **29** | **9** |

**Nota**: Los 9 cfg_tabs (general, impresion, impuestos, licencia, modulos, negocio, pwa, sync, vista) no tienen archivos `.spec.md` propios — están cubiertos implícitamente por `config.spec.md` (Tier 2). Se cuenta como SIN contrato propio.

---

## Tabla de calidad

| Screen | Tier | Líneas | TODOs | API refs | Notas |
|--------|------|--------|-------|----------|-------|
| pos | 1 | 283 | 0 | 37 | Core screen — detallado |
| inventario | 1 | 315 | 0 | 42 | Core screen — más profundo |
| clientes | 1 | 174 | 0 | 12 | Core screen |
| ventas | 1 | 220 | 0 | 20 | Core screen |
| corte | 1 | 228 | 0 | 19 | Core screen |
| pdc-audit | 2 | 24 | 2 | n/a | Stub PDC |
| pdc-feats | 2 | 24 | 2 | n/a | Stub PDC |
| pdc-hierarchy | 2 | 24 | 2 | n/a | Stub PDC |
| pdc-mods | 2 | 24 | 2 | n/a | Stub PDC |
| pdc-users | 2 | 24 | 2 | n/a | Stub PDC |
| actualizador | 2 | 37 | 6 | n/a | Stub |
| apertura | 2 | 38 | 6 | n/a | Stub |
| ayuda | 2 | 37 | 6 | n/a | Stub |
| config | 2 | 38 | 6 | n/a | Stub — cubre 9 cfg_tabs implícitamente |
| cotizaciones | 2 | 37 | 6 | n/a | Stub |
| credito | 2 | 38 | 6 | n/a | Stub |
| dashboard | 2 | 37 | 6 | n/a | Stub |
| departamentos | 2 | 37 | 6 | n/a | Stub |
| devoluciones | 2 | 38 | 6 | n/a | Stub |
| facturacion | 2 | 41 | 6 | n/a | Stub — más líneas por subtabs CFDI |
| kardex | 2 | 36 | 6 | n/a | Stub |
| mapa | 2 | 35 | 6 | n/a | Stub |
| mobile-apps | 2 | 35 | 6 | n/a | Stub |
| perfil | 2 | 37 | 5 | n/a | Stub |
| promociones | 2 | 37 | 6 | n/a | Stub |
| proveedores | 2 | 36 | 6 | n/a | Stub |
| quickpos | 2 | 37 | 6 | n/a | Stub |
| recargas | 2 | 36 | 6 | n/a | Stub |
| rentas | 2 | 36 | 6 | n/a | Stub |
| reportes | 2 | 36 | 5 | n/a | Stub |
| reservaciones | 2 | 36 | 6 | n/a | Stub |
| salud | 2 | 36 | 6 | n/a | Stub |
| servicios | 2 | 36 | 6 | n/a | Stub |
| usuarios | 2 | 37 | 5 | n/a | Stub |

---

## Screens SIN contrato propio

Los siguientes nodos de tipo `cfg_tab` existen en system-map.json pero NO tienen archivo `.spec.md` propio:

| cfg_tab | ID nodo | Observación |
|---------|---------|-------------|
| general | cfg_general | Cubierto por config.spec.md (Tier 2) |
| impresion | cfg_impresion | Cubierto por config.spec.md (Tier 2) |
| impuestos | cfg_impuestos | Cubierto por config.spec.md (Tier 2) |
| licencia | cfg_licencia | Cubierto por config.spec.md (Tier 2) |
| modulos | cfg_modulos | Cubierto por config.spec.md (Tier 2) |
| negocio | cfg_negocio | Cubierto por config.spec.md (Tier 2) |
| pwa | cfg_pwa | Cubierto por config.spec.md (Tier 2) |
| sync | cfg_sync | Cubierto por config.spec.md (Tier 2) |
| vista | cfg_vista | Cubierto por config.spec.md (Tier 2) |

**Acción recomendada**: Crear stubs Tier 2 individuales para cada cfg_tab, o marcar en config.spec.md que cada sub-sección está documentada.

---

## Resumen de calidad

- 5 screens Tier 1 concentran toda la profundidad real (pos, inventario, clientes, ventas, corte)
- 24 screens Tier 2 tienen 35–41 líneas cada uno y 5–6 TODOs pendientes por completar
- 5 pdc_tabs tienen stubs mínimos (24 líneas, 2 TODOs cada uno)
- 9 cfg_tabs carecen de contrato propio — GAP de documentación
- Total TODOs abiertos en contratos Tier 2: ~138 (24 screens × ~5.8 avg)
