---
slug: devoluciones
title_es: Procesar devoluciones y reembolsos
title_en: Process returns and refunds
category: operaciones
tags: [devolucion, reembolso, cancelacion]
updated: 2026-04-28
---

# Procesar devoluciones y reembolsos

Cuando un cliente devuelve un producto, Volvix te ayuda a registrar el reembolso y ajustar inventario.

## Tipos de devolucion

1. **Devolucion total**: cliente devuelve todo el ticket, le regresas todo el dinero.
2. **Devolucion parcial**: solo algunos productos.
3. **Cambio**: cliente entrega producto y se lleva otro de igual o distinto valor.

## Pasos

1. En cajero, **Ventas > Buscar ticket**.
2. Captura folio o escanea ticket.
3. Click **Devolver**.
4. Marca productos a devolver.
5. Elige metodo de reembolso:
   - **Efectivo**: sale del cajon de caja.
   - **Tarjeta**: reversion al mismo plastico (puede tardar 3-5 dias en bancos).
   - **Vale**: genera nota de credito que el cliente usa despues.

6. Confirma. Volvix:
   - Genera ticket de devolucion (folio negativo).
   - Suma stock al inventario.
   - Registra en cuenta del cajero.

## Politicas comunes

- Plazo maximo: 30 dias (configurable en **Configuracion > Devoluciones**).
- Producto debe estar **sin uso** y con etiqueta.
- Articulos de **liquidacion** generalmente no aplican (configurable).

## Casos especiales

### Cliente sin ticket

1. Si tienes datos del cliente (telefono, correo), buscalo en **Clientes > Compras**.
2. Si no aparece, requiere autorizacion de gerente.

### Devolucion de venta a credito

1. Si ya hubo abono parcial, Volvix calcula el reembolso proporcional.
2. Si la venta esta totalmente liquidada, devolucion como cualquier otra.

### Producto descontinuado

- No se puede aumentar stock de un SKU dado de baja. Reactivalo temporalmente: **Inventario > [producto] > Reactivar**.

## Reportes

- **Reportes > Devoluciones**: filtra por dia/cajero/producto.
- **Devoluciones > 5% del total**: posible problema de calidad o capacitacion. Revisa con tu equipo.

> En Plan Enterprise, las devoluciones requieren foto del producto subida desde el celular del cajero (anti-fraude).
