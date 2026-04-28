# pos_sales status state machine

> Documenta los 7 estados de la tabla `pos_sales.status` y las transiciones
> válidas que enforce el sistema (vía RPC + triggers + bloqueos en API).
>
> Referencias:
> - Trigger: `migrations/r8g-approvals-fraud.sql` (`pos_sales_block_post_z`)
> - Bypass RPC: `update_sale_with_post_z_bypass` (R9b)
> - Auditoría: `migrations/r5c-audit-rewrite.sql` (`zz_audit_pos_sales`)

## Estados

- **pending**: venta iniciada, items en carrito, NO cobrada
- **printed**: ticket impreso, NO cobrada (cliente revisando)
- **paid**: cobrada, transacción completa
- **cancelled**: cancelada (antes de paid o autorizada post-print)
- **refunded**: 100% devuelta
- **partially_refunded**: algunos items devueltos (R3a)
- **reversed**: cobro completo revertido (R8g, no items pero anula)

## Transiciones válidas

| Desde \\ Hacia      | pending | printed | paid | cancelled | refunded | partially_refunded | reversed |
|---------------------|---------|---------|------|-----------|----------|--------------------|----------|
| (nuevo)             | OK      | -       | -    | -         | -        | -                  | -        |
| pending             | -       | OK      | OK   | OK        | -        | -                  | -        |
| printed             | -       | -       | OK   | OK (auth) | -        | -                  | -        |
| paid                | -       | -       | -    | NO        | OK       | OK                 | OK       |
| partially_refunded  | -       | -       | -    | -         | OK       | OK (mas items)     | NO (R9b) |
| refunded            | -       | -       | -    | -         | -        | -                  | -        |
| cancelled           | -       | -       | -    | -         | -        | -                  | -        |
| reversed            | -       | -       | -    | -         | -        | -                  | -        |

Leyenda:
- **OK**   = transicion permitida.
- **NO**   = bloqueada explicitamente por trigger o handler.
- **(auth)** = requiere rol manager+ (autorizacion explicita).
- **-**   = no aplicable / estado terminal.

## Triggers / Bloqueos

- **R8g `pos_sales_block_post_z`**: bloquea `UPDATE` si la fecha de la venta
  ya cae dentro de un corte Z cerrado. El unico bypass autorizado es via la
  RPC `update_sale_with_post_z_bypass` (introducida en R9b) que registra
  motivo + audit-log antes de levantar el bloqueo.
- **R9b `PARTIAL_REFUND_EXISTS`**: bloquea `reverse` si la venta ya tiene
  refunds parciales registrados (`already_refunded > 0`). El usuario debe
  completar refunds parciales hasta llegar a `refunded` total.
- **R3a `affects_z`**: cuando se hace refund de una venta cuyo Z ya esta
  cerrado, el refund registra `compensation_z_date` en lugar de mutar la
  venta original. Esto preserva integridad del corte Z historico.

## Audit

Toda transicion de status se audita en `volvix_audit_log` via trigger
`zz_audit_pos_sales` (R5c). Los campos auditados incluyen:

- `actor_user_id`: quien ejecuto el cambio
- `previous_status` y `new_status`
- `reason`: motivo (cuando aplica, ej. cancellation/reverse)
- `bypassed_z_block`: boolean que marca si se uso la RPC de bypass

## Estados terminales

`refunded`, `cancelled`, `reversed` son estados terminales — no se permite
salir de ellos. Cualquier intento de UPDATE genera 409 Conflict desde la
API y el trigger DB lo rechaza.

## Notas de implementacion

- El estado `printed` es opcional: ventas tipo kiosk pueden saltar de
  `pending` directo a `paid` sin pasar por `printed`.
- `partially_refunded` puede iterar (varios refunds parciales) hasta
  acumular el total, momento en que se promueve a `refunded`.
- `reversed` no genera items de devolucion — anula la venta como si no
  hubiera ocurrido (caso de fraude detectado, cobro duplicado por error
  de hardware, etc.).
