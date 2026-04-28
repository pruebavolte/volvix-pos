---
slug: cobrar-tarjeta
title_es: Cobrar con tarjeta de credito o debito
title_en: Charge a credit or debit card
category: cobros
tags: [tarjeta, terminal, stripe, conekta]
updated: 2026-04-28
---

# Cobrar con tarjeta de credito o debito

Volvix POS soporta cobros con tarjeta via Stripe, Conekta y terminales fisicas (Clip, BBVA, Banorte).

## Opcion 1: terminal fisica (recomendado para presencial)

1. **Configuracion > Pagos > Terminales fisicas**.
2. Selecciona tu proveedor: Clip, BBVA Spei Pos, Banorte.
3. Vincula via Bluetooth o USB.
4. En la venta, elige **Cobrar con tarjeta** y la terminal recibe el monto automaticamente.

### Comisiones tipicas

| Proveedor | Debito | Credito |
|-----------|--------|---------|
| Clip      | 1.85%  | 3.6%    |
| BBVA Pos  | 1.65%  | 3.5%    |
| Banorte   | 1.75%  | 3.5%    |

## Opcion 2: cobro online (Stripe / Conekta)

1. **Configuracion > Pagos > Stripe**.
2. Conecta tu cuenta (sera redireccionado a Stripe).
3. En la venta, elige **Enviar enlace de pago**.
4. El cliente recibe correo o WhatsApp con link a checkout.

## Errores comunes

- **"Tarjeta declinada"**: pide al cliente que verifique con su banco.
- **"No NFC detectado"**: la terminal requiere actualizacion de firmware. Llamar al proveedor.
- **"Tiempo agotado"**: la conexion 3G/WiFi se corto. Reintenta.

## Conciliacion

Las ventas con tarjeta aparecen en **Reportes > Pagos** segregadas por proveedor. El depositos a tu cuenta bancaria llega 24-48h despues (Stripe T+2, Clip T+1).

> Si una venta quedo en "pendiente" mas de 60 minutos, contacta soporte: hay un job que limpia transacciones huerfanas.
