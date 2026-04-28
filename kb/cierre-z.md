---
slug: cierre-z
title_es: Cierre Z diario (corte de caja)
title_en: Daily Z close
category: operaciones
tags: [cierre, corte, contabilidad]
updated: 2026-04-28
---

# Cierre Z diario (corte de caja)

El **cierre Z** es el corte de caja del dia. Cierra ventas, cuadra efectivo y genera el reporte para tu contador.

## Cuando hacer cierre Z

- Al finalizar el turno (cada cajero hace **cierre X**, parcial).
- Al cerrar el dia (gerente o owner hace **cierre Z**, definitivo).
- Maximo una vez por dia, ya cerrado no se puede modificar.

## Pasos

1. En el cajero, **Caja > Cierre Z**.
2. Volvix muestra:
   - Total ventas del dia
   - Desglose por metodo (efectivo, tarjeta, transferencia)
   - Tickets cancelados
   - Devoluciones
3. Captura el **efectivo contado** (lo que hay en la caja).
4. Si hay **diferencia** (faltante o sobrante), escribe la razon.
5. Click **Cerrar Z**.

## Reporte generado

Se genera un PDF con:
- Folio de cierre
- Hora apertura / cierre
- Cajero responsable
- Resumen ventas
- Diferencia (si la hay)
- Firma digital

Descargable desde **Reportes > Cierres Z**.

## Que pasa si no hago cierre Z

- Las ventas del dia siguiente se acumulan al cierre anterior.
- El reporte SAT (CFDI 4.0) puede salir con totales incorrectos.
- **Recomendado**: hacer cierre Z antes de las 23:59 todos los dias.

## Errores frecuentes

| Error | Causa | Solucion |
|-------|-------|----------|
| "Hay tickets pendientes" | Ventas no cobradas | Cobra o cancela esos tickets antes |
| "Diferencia > $500" | Efectivo no cuadra | Revisa devoluciones y propinas |
| "Cierre ya existe" | Doble click | Refresca pagina, ver Reportes |

> El cierre Z es **inmutable**. Si necesitas ajustar, contacta soporte para crear un asiento contable de correccion.
