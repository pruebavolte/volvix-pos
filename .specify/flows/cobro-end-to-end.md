# Flujo end-to-end: Cobro completo

> Este flujo describe el camino crítico desde "cajero recibe al cliente" hasta "ticket está en historial". Es **el test de aceptación** del sistema.
>
> Si este flujo no pasa todos sus checkpoints, **el sistema no está listo para producción**, sin importar lo que diga la IA.

## Pre-condiciones

- Usuario logueado con rol `cajero`, `admin` u `owner`.
- Sucursal activa configurada.
- Al menos 1 producto existente en `productos` con stock > 0.

## Pasos y checkpoints

### Paso 1. Cajero busca producto por código de barras

**Acción**: en `pos.html`, escribe/escanea `7501234567890` en el input principal.

**Checkpoints**:

- ✅ `CK1.1`: el input dispara `buscarProducto('7501234567890', sucursalId)`.
- ✅ `CK1.2`: la función **única** de `productos.spec.md` se invoca (no una copia).
- ✅ `CK1.3`: si existe, el producto se agrega al ticket con `cantidad = 1`.
- ✅ `CK1.4`: el input se limpia y queda enfocado para el siguiente código.

**Query de verificación**:
```sql
SELECT id, nombre, codigo_barras, precio_venta
FROM productos
WHERE codigo_barras = '7501234567890'
  AND sucursal_id = '<id>'
  AND deleted_at IS NULL;
```

### Paso 2. Cajero agrega 2 productos más

**Checkpoints**:

- ✅ `CK2.1`: cada producto aparece como línea en el ticket.
- ✅ `CK2.2`: si un producto se escanea dos veces, **se incrementa cantidad**, no se duplica línea.
- ✅ `CK2.3`: subtotal, IVA y total se recalculan en cada cambio.
- ✅ `CK2.4`: **NO hay queries de INSERT en BD todavía** (el ticket vive en memoria).

**Verificación negativa**:
```sql
-- Esto debe regresar 0 rows aún (no se ha cobrado):
SELECT COUNT(*) FROM tickets
WHERE usuario_id = '<id>'
  AND created_at > NOW() - INTERVAL '1 minute'
  AND estado IN ('abierto', 'cobrado');
```

### Paso 3. Cajero asigna cliente

**Acción**: click en "Asignar cliente", busca por nombre "Juan", selecciona uno.

**Checkpoints**:

- ✅ `CK3.1`: la búsqueda usa la función única `buscarCliente()` de `clientes.spec.md`.
- ✅ `CK3.2`: el nombre del cliente aparece en el header del ticket.
- ✅ `CK3.3`: `ticket.cliente_id` se setea en memoria.

### Paso 4. Cajero selecciona método de pago "Efectivo"

**Checkpoints**:

- ✅ `CK4.1`: `ticket.metodo_pago = 'efectivo'`.
- ✅ `CK4.2`: el botón "COBRAR" se habilita.

### Paso 5. Cajero presiona "COBRAR"

**Acción**: click en el botón "COBRAR".

**Checkpoints**:

- ✅ `CK5.1`: se ejecuta una **transacción atómica** que hace:
  - INSERT en `tickets` (con folio consecutivo).
  - N INSERT en `ticket_items` (uno por producto del ticket).
  - N UPDATE en `productos` (descontar stock).
- ✅ `CK5.2`: si cualquier paso falla, **rollback completo** y el ticket sigue en pantalla.
- ✅ `CK5.3`: si éxito, se hace `SELECT` del ticket recién creado **antes** de marcar éxito.

**Query de verificación (después del éxito)**:
```sql
-- 1 ticket nuevo:
SELECT id, folio, total, estado FROM tickets
WHERE usuario_id = '<id>'
ORDER BY created_at DESC LIMIT 1;

-- N items del ticket:
SELECT producto_id, cantidad, subtotal FROM ticket_items
WHERE ticket_id = '<id_del_ticket>';

-- Stock decrementado:
SELECT id, stock FROM productos WHERE id IN (<ids>);
```

### Paso 6. Se imprime/muestra el ticket

**Checkpoints**:

- ✅ `CK6.1`: se genera HTML/PDF del ticket con folio, items, totales, fecha.
- ✅ `CK6.2`: el folio impreso coincide con `tickets.folio` en BD.

### Paso 7. La UI se limpia para el siguiente cliente

**Checkpoints CRÍTICOS** (donde más se rompe):

- ✅ `CK7.1`: la lista de items del ticket está **vacía**.
- ✅ `CK7.2`: el campo de cliente está **vacío** (no muestra el cliente anterior).
- ✅ `CK7.3`: los totales muestran **$0.00**.
- ✅ `CK7.4`: el método de pago se resetea.
- ✅ `CK7.5`: el input de búsqueda de producto está **vacío y enfocado**.
- ✅ `CK7.6`: aparece un toast "Ticket #<folio> cobrado" que desaparece a los 3 segundos.

### Paso 8. El ticket aparece en el Historial sin recargar

**Acción**: abrir `historial.html` en otra pestaña ANTES del paso 5. Mantenerla abierta. Después del paso 5, mirar esa pestaña.

**Checkpoints CRÍTICOS**:

- ✅ `CK8.1`: el ticket recién cobrado **aparece en la lista** sin que se haya recargado la página.
- ✅ `CK8.2`: aparece **en el tope** de la lista (orden DESC por `created_at`).
- ✅ `CK8.3`: muestra folio, cliente, total y método de pago correctos.
- ✅ `CK8.4`: click en él abre el detalle con los items correctos.

### Paso 9. (Mismo flujo, segundo ticket)

**Acción**: repetir desde paso 1 con un cliente y productos distintos.

**Checkpoints**:

- ✅ `CK9.1`: el folio es el anterior + 1 (consecutivo).
- ✅ `CK9.2`: el ticket anterior **NO** dejó residuo en la UI (ningún campo de cliente, item o total del ticket #1 aparece en el ticket #2).
- ✅ `CK9.3`: ambos tickets están en el Historial, el más nuevo arriba.

---

## Anti-patrones que este flujo detecta

- ❌ "Cobré pero el historial dice que no hay tickets" → `CK8.1` falla → Realtime no está suscrito o cache no invalidado.
- ❌ "Cobré y la información del cliente anterior sigue en pantalla" → `CK7.2` falla → form no se limpia.
- ❌ "Cobré pero no se guardó nada" → `CK5.1` falla → el INSERT no se hizo o falló silenciosamente.
- ❌ "Cobré y el ticket aparece pero los items están mal" → `CK5.1` (segunda parte) → no se insertaron `ticket_items`.
- ❌ "El historial muestra el ticket pero desde hace 3 semanas" → contrato de `historial.spec.md` violado.

---

## Cómo correr este flujo automáticamente

Usar Playwright + queries directas a Supabase (vía MCP o supabase-js).

```bash
npx playwright test flows/cobro-end-to-end.spec.ts
```

El test debe:

1. Logearse como cajero.
2. Ejecutar pasos 1–9.
3. Después de cada paso, **verificar BD via MCP** (no asumir).
4. Después de cada paso, **verificar UI con screenshot/assertion** (no asumir).
5. Reportar pass/fail por checkpoint, no globalmente.

Si un checkpoint falla, el reporte debe decir **exactamente cuál** falló y por qué — no un genérico "el flujo de cobro falla".
