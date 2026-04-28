---
slug: multi-sucursal
title_es: Configurar multi sucursal
title_en: Multi branch setup
category: configuracion
tags: [sucursales, branches, escalado]
updated: 2026-04-28
---

# Configurar multi sucursal

Si tu negocio tiene mas de un local, Volvix te permite gestionar todos desde un solo dashboard.

## Crear sucursales

1. **Configuracion > Sucursales > Nueva**.
2. Captura:
   - Nombre (ej. "Sucursal Centro")
   - Direccion
   - Telefono
   - Encargado
   - Zona horaria (importante para cierres)
3. Guarda.

## Asignar inventario por sucursal

Por defecto, cada producto puede tener stock independiente por sucursal.

1. **Inventario > [producto] > Stock por sucursal**.
2. Captura cantidad inicial en cada sucursal.
3. Guarda.

Las ventas descuentan stock de la sucursal donde se hace la venta.

### Transferencias entre sucursales

1. **Inventario > Transferencias > Nueva**.
2. Origen, destino, productos, cantidades.
3. Click **Enviar**.
4. La sucursal destino recibe correo y debe **Aceptar** transferencia para que el stock se mueva.

## Reportes consolidados vs por sucursal

- **Reportes > Vista consolidada**: ventas totales, comparativos.
- **Reportes > Por sucursal**: cierre Z, top productos, devoluciones por local.

## Permisos

- **Owner**: ve todas las sucursales.
- **Gerente**: solo su sucursal asignada.
- **Cajero**: solo su sucursal.

Cambiar permisos: **Equipo > [usuario] > Sucursales asignadas**.

## Precios por sucursal

Si tus precios varian por zona:
1. **Configuracion > Listas de precios > Nueva**.
2. Crea lista (ej. "Lista Norte").
3. **Sucursales > [sucursal] > Lista de precios** -> selecciona la lista.

## Comparativos utiles

- **Reportes > Ventas por sucursal**: ranking diario/semanal/mensual.
- **Reportes > Top productos por sucursal**: identifica que vende mejor en cada zona.
- **Reportes > Productividad cajeros**: ventas/hora trabajada por cada cajero.

## Casos especiales

### Sucursal nueva: cargar inventario inicial

1. Crea la sucursal.
2. **Inventario > Carga masiva**.
3. Sube CSV con: SKU, sucursal, cantidad, costo.
4. Volvix valida y carga.

### Cierre nocturno simultaneo

Si tienes muchas sucursales, programa el cierre Z automatico:
**Configuracion > Cierre Z automatico > Hora 23:55** (cuidado con zonas horarias).

### Centralizar contabilidad

Conecta tu contabilidad (Contpaqi, Aspel) en **Configuracion > Integraciones**. Volvix exporta diariamente todas las sucursales en un solo archivo.

## Limites

- Plan Pro: 3 sucursales.
- Plan Enterprise: ilimitado.

> Si superas 50 sucursales, contactanos: tenemos optimizaciones especificas para chains.
