# Constitución de Volvix POS

Las reglas de este documento son **inviolables**. Cualquier código, refactor, feature nuevo o migración debe respetarlas. Si una regla parece que estorba, **eso es señal de que estás haciendo algo mal**, no de que la regla esté mal.

Para cambiar una regla: abrir un ADR en `.specify/decisions/` y obtener aprobación explícita del owner.

---

## Principio rector

**Una tabla, un módulo, un flujo, una verdad.**

No hay "versión 2" de nada que no sea fruto de una migración formal. No hay duplicación silenciosa. No hay tablas paralelas creadas "mientras tanto".

---

## C1. Schema único

- La estructura de datos vive en Supabase, schema `public`.
- El archivo `.specify/schema-truth.md` debe coincidir 1:1 con lo que devuelve el MCP de Supabase.
- Si difieren, **schema-truth.md está mal y se regenera**, no al revés.
- Cualquier tabla nueva requiere ADR aprobado **antes** de la migración.

## C2. Nomenclatura

- Tablas: `snake_case`, plural (`productos`, `tickets`, `clientes`).
- Columnas: `snake_case`, singular (`nombre`, `codigo_barras`, `precio_venta`).
- IDs: `id` (uuid) como PK. FKs como `<tabla_singular>_id` (`producto_id`, `cliente_id`).
- Timestamps: `created_at`, `updated_at` (UTC, con timezone).
- Soft delete: `deleted_at` (nullable). **Nunca borrar físicamente**.

## C3. Búsqueda de productos

El módulo de búsqueda de productos **siempre** busca por:

1. Coincidencia exacta de `codigo_barras` (más rápido, primero).
2. ILIKE en `nombre` (case-insensitive).
3. ILIKE en `sku` si existe.

**Una sola tabla** (`productos`), un solo módulo de búsqueda, una sola función. Si encuentras dos módulos haciendo búsqueda de productos en archivos distintos, **consolida**, no agregues un tercero.

## C4. Tickets y cobro

El flujo de cobro:

1. Usuario agrega productos al ticket en memoria.
2. Al cobrar, se hace **UN** INSERT en `tickets` + N INSERT en `ticket_items` (transaccional).
3. Si el INSERT falla, **rollback completo** y mantener el ticket en pantalla.
4. Si el INSERT tiene éxito:
   - Imprimir/mostrar ticket.
   - **Limpiar el form** (estado vacío, listo para siguiente cliente).
   - El módulo `Historial de Tickets` debe reflejar el nuevo ticket **sin recargar**.

Toda la información del ticket (cliente, items, totales, método de pago, fecha) **debe persistir en BD**. Está prohibido mantenerla solo en memoria una vez cobrado.

## C5. Historial e listados

Todo listado de transacciones (`tickets`, `cortes`, `ventas`):

- Orden por defecto: `created_at DESC`.
- Paginación: 50 items por página.
- Filtro de fecha por defecto: últimas 24 horas.
- Opción explícita para expandir rango.
- **Realtime**: suscribirse al canal de la tabla para reflejar nuevos registros sin recargar.

## C6. Clientes

- Tabla única: `clientes`.
- Búsqueda por: nombre, RFC, teléfono, email.
- Un cliente puede tener N tickets (FK `cliente_id` en `tickets`, nullable para venta de mostrador).

## C7. Realtime y refresh

Toda mutación de datos transaccionales debe **propagarse automáticamente** a los módulos que los consumen:

- Usar Supabase Realtime (canales por tabla).
- Cuando no aplique realtime, invalidar cache local y re-fetch.
- **Prohibido**: que el usuario tenga que recargar la página para ver datos recién guardados.

## C8. Multi-sucursal y multi-usuario

- Toda tabla transaccional debe tener `sucursal_id` y `usuario_id`.
- RLS (Row Level Security) de Supabase activado por defecto.
- Un usuario solo ve datos de su sucursal salvo que tenga rol `owner` o `admin`.

## C9. Sin localStorage para datos críticos

- `localStorage` y `sessionStorage` están permitidos solo para:
  - Preferencias UI no críticas (tema, idioma).
  - Tokens de sesión de Supabase (gestionados por su SDK).
- **Prohibido**: usar localStorage como BD primaria, validar licencias, almacenar tickets pendientes sin reflejo en Supabase, o sustituir el estado del servidor.

## C10. Verificación end-to-end como definición de "hecho"

Una feature está **HECHA** cuando se cumplen las tres condiciones:

1. **BD**: query directo via MCP confirma el cambio en Supabase.
2. **UI**: screenshot o test de Playwright confirma el cambio visible sin recargar.
3. **Flujo**: el flujo end-to-end correspondiente en `.specify/flows/` corre verde de punta a punta.

Sin las tres, **no está hecha**. Reportar como pendiente, no como completa.

---

## Sobre cambiar la constitución

Esta constitución se cambia con ADR formal en `.specify/decisions/ADR-XXX-<tema>.md`. El ADR debe incluir:

- **Contexto**: qué problema motivó el cambio.
- **Alternativas**: qué otras opciones se consideraron.
- **Decisión**: la regla nueva o el reemplazo de la regla vieja.
- **Consecuencias**: qué se vuelve más fácil, qué se vuelve más difícil, qué hay que refactorizar.

Sin ADR aprobado por el owner, la regla **sigue vigente**.
