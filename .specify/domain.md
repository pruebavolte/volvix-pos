# Lenguaje del dominio — Volvix POS

Vocabulario único para que la IA y los humanos hablemos lo mismo. Si un término no está aquí, agrégalo antes de usarlo en código.

---

## Conceptos centrales

### Producto
Item que se vende. Vive en tabla `productos`. Tiene `codigo_barras` (único, opcional), `sku` (opcional), `nombre`, `precio_venta`, `costo`, `stock`, `categoria_id`, `unidad_medida`.

### Cliente
Persona o empresa a quien se le vende. Vive en tabla `clientes`. Tiene `nombre`, `rfc` (opcional), `telefono`, `email`, `direccion`, `credito_disponible`. Un ticket puede no tener cliente (venta de mostrador → `cliente_id = null`).

### Ticket
Documento de venta. Es la unidad transaccional principal. Vive en tabla `tickets`. Tiene `folio` (consecutivo por sucursal), `cliente_id`, `usuario_id`, `sucursal_id`, `subtotal`, `iva`, `total`, `metodo_pago`, `estado` (`abierto`, `cobrado`, `cancelado`), `created_at`.

Items del ticket en tabla `ticket_items`: `ticket_id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`.

### Venta
Sinónimo de **ticket cobrado**. No es una tabla aparte, es el estado `cobrado` de un ticket. Si alguien dice "ventas del día", significa `SELECT * FROM tickets WHERE estado = 'cobrado' AND DATE(created_at) = CURRENT_DATE`.

### Corte
Cierre de turno o de día. Resumen de ventas de un periodo. Vive en tabla `cortes`. Tiene `usuario_id`, `sucursal_id`, `fecha_inicio`, `fecha_fin`, `total_efectivo`, `total_tarjeta`, `total_transferencia`, `total_general`, `notas`.

### Historial
**No es una tabla**. Es el módulo de UI que muestra `tickets` ordenados por `created_at DESC`. Si alguien dice "el historial no muestra X", el problema está en la query del módulo, no en una "tabla historial" (que no existe ni debe existir).

### Inventario
Conjunto de productos con su stock. **No es una tabla aparte**. La fuente de verdad del stock es la columna `productos.stock`. El "módulo Inventario" es la UI que muestra/edita `productos` con foco en stock.

### Sucursal
Tienda física. Vive en tabla `sucursales`. Toda transacción tiene `sucursal_id`.

### Usuario
Persona que opera el POS. Vive en `auth.users` de Supabase + perfil extendido en `usuarios`. Roles: `owner`, `admin`, `cajero`, `mesero`, `repartidor`.

### Comandera
Módulo de toma de orden (típicamente restaurantero). Genera un ticket en estado `abierto`. No cobra todavía.

### KDS (Kitchen Display System)
Pantalla de cocina. Muestra `ticket_items` de tickets `abiertos` con `estado_preparacion` (`pendiente`, `en_proceso`, `listo`).

### CDS (Customer Display System)
Pantalla del cliente. Muestra el ticket en construcción en tiempo real.

---

## Distinciones que la IA confunde

### "Guardar" vs "Cobrar"

- **Guardar** un ticket: persiste el ticket en estado `abierto`. El cliente todavía no paga.
- **Cobrar** un ticket: transiciona el ticket de `abierto` → `cobrado`, registra método de pago, descuenta stock, **limpia el form**.

Son operaciones distintas. No las mezcles.

### "Ticket" vs "Pedido" vs "Orden"

En Volvix POS son **sinónimos**. Usamos siempre **ticket** para evitar confusión. Si encuentras tablas `pedidos` u `ordenes` separadas de `tickets`, es deuda: **consolidar**.

### "Inventario" vs "Productos"

- **Productos**: el catálogo (qué se vende, precios, descripciones).
- **Inventario**: el stock de esos productos (cuántos hay).

Misma tabla (`productos`), distinta vista en UI. No crear tabla `inventario`.

### "Cliente" vs "Usuario"

- **Cliente**: a quien le vendes (paga).
- **Usuario**: quien opera el POS (cobra).

Tablas distintas (`clientes` y `usuarios`). No las mezcles aunque parezca que ambos son "personas".

---

## Términos prohibidos en nombres de tablas

Las siguientes palabras **no deben aparecer en nombres de tablas**:

- `_v2`, `_v3`, `_nuevo`, `_temp`, `_test`, `_old`, `_backup`, `_copy`
- `data_`, `info_`, `tabla_`
- Cualquier sufijo numérico que sugiera "otra versión de"

Si necesitas migrar una tabla, hazlo con una migración formal (rename + ADR), no creando una paralela.

---

## Plural vs singular

- **Tablas**: plural (`productos`, `clientes`, `tickets`).
- **Tipos / modelos / clases en código**: singular (`Producto`, `Cliente`, `Ticket`).
- **Variables que representan colecciones**: plural (`productos = []`).
- **Variables que representan un item**: singular (`producto = productos[0]`).
