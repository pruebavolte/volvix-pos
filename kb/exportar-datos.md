---
slug: exportar-datos
title_es: Exportar datos (ventas, inventario, clientes)
title_en: Export data
category: datos
tags: [export, csv, excel, backup, contabilidad]
updated: 2026-04-28
---

# Exportar datos (ventas, inventario, clientes)

Tus datos son **tuyos**. Volvix permite exportar todo en CSV, Excel o PDF cuando quieras.

## Exportar ventas

1. **Reportes > Ventas**.
2. Filtra rango de fechas, sucursal, cajero, metodo de pago.
3. Click **Exportar > CSV** o **Exportar > Excel**.

El archivo incluye: folio, fecha, cliente, productos, cantidades, precios, IVA, total, metodo, cajero, sucursal.

## Exportar inventario

1. **Inventario > Lista**.
2. Click **Exportar**.
3. Elige formato: CSV (para edicion masiva), Excel (para reportes), PDF (para impresion).

Util para:
- Conteo fisico (imprimir, marcar a mano, recapturar).
- Comparar precios con competidores.
- Migrar a otro sistema.

## Exportar clientes

1. **Clientes > Lista**.
2. **Exportar > CSV**.
3. Incluye: nombre, RFC, correo, telefono, total comprado, ultima compra, segmento.

Util para:
- Campana de email marketing.
- Cobrar saldos pendientes.
- Compartir con tu equipo de ventas.

## Backup completo de tu cuenta

1. **Configuracion > Backups**.
2. Click **Generar backup completo**.
3. Recibes correo con enlace de descarga (vigente 7 dias).
4. ZIP con: ventas, inventario, clientes, cierres Z, configuracion.

> Backup automatico **diario** se ejecuta a las 04:00 AM y guarda 30 dias en nuestro servidor (Plan Pro+).

## API y webhooks

Si necesitas exportacion automatica a tu CRM/contabilidad:

1. **Configuracion > API > Generar token**.
2. Endpoints disponibles:
   - `GET /api/sales` (paginado)
   - `GET /api/inventory`
   - `GET /api/customers`
3. Webhooks:
   - `sale.completed` (despues de cobrar)
   - `inventory.updated` (cambio de stock)
   - `customer.created`

Documentacion completa: `https://volvix.app/docs/api`.

## Integraciones predefinidas

Conexion directa sin programar:
- **Contpaqi**: contabilidad mexicana.
- **Aspel COI**: contabilidad mexicana.
- **QuickBooks**: contabilidad internacional.
- **Mailchimp**: email marketing.
- **HubSpot**: CRM.
- **Google Sheets**: sincronizacion bidireccional.

Activarlas: **Configuracion > Integraciones**.

## Formatos para SAT (Mexico)

- **Reporte mensual SAT**: **Reportes > SAT > DIOT** (Declaracion Informativa de Operaciones con Terceros).
- **Reporte XML CFDI**: **Facturacion > Descargar XML masivo**.
- **Polizas contables**: **Reportes > Polizas** en formato Aspel/Contpaqi.

## Eliminar mi cuenta y datos

1. **Configuracion > Cuenta > Eliminar mi cuenta**.
2. Confirma con contrasena.
3. Te enviamos backup ZIP de TODOS tus datos.
4. **30 dias de gracia** por si te arrepientes.
5. Despues de 30 dias, datos eliminados permanentemente (cumplimos LFPDPPP / GDPR).

> Si necesitas que firmemos NDA o DPA para tu compliance, escribe a `legal@volvix.app`.
