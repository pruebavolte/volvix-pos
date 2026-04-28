---
slug: inventario-bajo
title_es: Alertas de inventario bajo
title_en: Low inventory alerts
category: inventario
tags: [stock, reorden, alertas]
updated: 2026-04-28
---

# Alertas de inventario bajo

Volvix te avisa cuando un producto esta por agotarse para que tengas tiempo de reordenar.

## Configurar punto de reorden

1. **Inventario > Producto > [tu producto]**.
2. Captura **Stock minimo** (por ejemplo 10 unidades).
3. Captura **Stock optimo** (por ejemplo 50, lo que pides al proveedor).
4. Guarda.

Cuando el stock baja del minimo, Volvix:
- Marca el producto en rojo en la lista.
- Envia notificacion al owner via correo.
- Aparece en el dashboard como "Productos a reordenar".

## Reorden automatico (Plan Pro)

Si conectaste un proveedor (modulo **Compras**):
1. Volvix arma orden de compra automatica al llegar al minimo.
2. Te llega un correo para revisar y aprobar.
3. Click **Enviar al proveedor** y se manda por correo o EDI.

## Reportes utiles

- **Reportes > Movimientos de stock**: ve entradas/salidas por dia.
- **Reportes > Productos sin movimiento**: identifica stock muerto (90+ dias sin vender).
- **Reportes > Top vendidos**: ajusta tu reorden segun rotacion real.

## Alertas adicionales

- **Stock cero durante venta**: el cajero ve aviso antes de cobrar.
- **Producto vendido sin stock**: si permitiste venta en negativo, queda registro para auditoria.

## Buenas practicas

1. Calcula stock minimo = ventas promedio diarias x dias de entrega del proveedor + 20%.
2. Revisa el reporte semanal cada lunes.
3. Para temporadas altas (Buen Fin, Navidad), incrementa el minimo 30-50%.

> Si tienes mas de 200 SKUs, considera el modulo **Inventario IA** que predice rotacion con machine learning.
