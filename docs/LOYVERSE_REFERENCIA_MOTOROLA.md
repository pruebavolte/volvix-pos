# Loyverse — referencia observada en el Motorola (moto g24, `adb` ZT322LGDTN)

> Observado 2026-09-19 en la app real `com.loyverse.sale` **v2.74**, cuenta "Kists Venta" (tema oscuro).
> Fuente de verdad para "clon exacto" (regla 11 de `LOYVERSE_CLONE_EJECUCION.md`). Solo se NAVEGÓ; nada se modificó
> (se agregó 1 artículo a un ticket propio y se despejó). Herramienta: `docs/loyverse-ref/loy.js`
> (`node loy.js dump | tap "<texto>" | tapxy X Y | back | shot nombre | scroll up|down`; lista negra de acciones destructivas).
> Capturas: `docs/loyverse-ref/ticket.png`, `cobrar.png`, `editar-linea.png`.

## Menú lateral (drawer)
Ventas · Recibos · Turno · Artículos ▸ (Artículos · Categorías · Modificadores · Descuentos) ·
Configuración ▸ (Impresoras · Pantalla para clientes · Impuestos · General · CERRAR SESIÓN) · Back office · Apps · Soporte · versión.
Encabezado del drawer: nombre de tienda, punto de venta (POS), nombre del negocio.

## 1. Ventas (pantalla de venta)
- Barra superior: ☰ · título "Ticket" con **contador de artículos en el ticket** (recuadro con número) · botón **+persona** (cliente) · ⋮.
- Fila verde de 2 botones: **TICKETS ABIERTOS** | **COBRAR $0.00** (con ticket con items: **GUARDAR** | **COBRAR $25.00**).
- Filtro desplegable "**Todos los artículos**" con: Favoritos · Descuentos · <categorías> + botón 🔍 búsqueda.
- Lista de artículos (default): mosaico gris/imagen a la izquierda, nombre, precio a la derecha ("–" si sin precio).
  Ajuste General permite cambiar a **Cuadrícula**. Tocar = agrega al ticket (el contador sube).
- ⋮: **Despejar el ticket** (confirma CANCELAR/BORRAR) · **Editar ticket** · **Asignar ticket** · **Dividir ticket** · **Mover ticket** · **Sincronizar**.

## 2. Vista de Ticket (tocar el contador)
- Flecha atrás · "Ticket [n]" · +persona · ⋮.
- **Selector desplegable de tipo de venta** (aquí "Mayoreo de computo": es la dining option / tipo de pedido).
- Renglones: `NOMBRE x N` a la izquierda, importe a la derecha; línea divisoria; **Total**.
- Pie: **GUARDAR** | **COBRAR $**.
- **Tocar un renglón → editor**: título `NOMBRE $precio` + botón GUARDAR; **Cantidad** (− campo +); **Comentario** ("Introducir comentario");
  **Descuentos** (lista con casilla: "DEL DIA DEL PADRE 10%", "POR PELO EN PLATILLO $20.00"); **RETIRAR DEL TICKET**.

## 3. Cobro
- Flecha atrás · **DIVIDIR** (arriba a la derecha).
- Importe grande + "Importe total adeudado".
- Campo **"Efectivo recibido"** (editable, precargado con el total).
- Botones anchos: **EFECTIVO** · **POR TARJETA** · **TRANFERENCIA** (tipos de pago configurables; cada uno con icono).
- (Al confirmar: recibo/cambio — no se ejecutó para no crear ventas.)

## 4. Recibos
Título "Recibos" · botón **Buscar** · lista cronológica (vacía en la cuenta observada).

## 5. Turno (caja)
- Botones: **GESTIÓN DE TESORERÍA** · **CERRAR EL TURNO**.
- "Número de cierre de caja: N" · "Abierto: <POS> <fecha/hora>".
- Sección **Cajón de efectivo**: Fondo de caja anterior · Cobros en efectivo · Reembolsos en efectivo · Depositado · Pagos/Salidas · **Efectivo teórico en caja**.
- Sección **Resumen de ventas**: Ventas brutas · Reembolsos · Descuentos · Ventas netas.
- **Gestión de tesorería**: campo de monto ($0.00) · "Comentario" · botones **DEPOSITAR** | **PAGOS/SALIDAS**.

## 6. Artículos
- **Artículos**: lista/alta/edición (form no volcado aún — pendiente de recorrer con `loy.js`).
- **Categorías**: lista con nombre y "N artículos" (ej. Alimentos 1 artículo, Bebidas 2, ELOTES 0).
- **Modificadores**: lista de grupos con sus opciones en línea (ej. "TIPO TORTILLA — ARINA, MAIZ"; "ADER — CHICHARRON, RAMOS, EXTRA DE MAYONES, SALSA PICA, SALSA QUE NO PICA").
- **Descuentos**: lista con % o $ (ej. "DEL DIA DEL PADRE 10%", "POR PELO EN PLATILLO $20.00").

## 7. Configuración
- **Impresoras**: vacío → "Todavía no hay impresoras. Aquí puedes conectar tu impresora de recibos y de cocina." + botón (+).
- **Pantalla para clientes**: vacío → "Todavía no tienes pantallas…" + (+).
- **Impuestos**: vacío → "Aún no tiene impuestos en esta tienda. Los impuestos se pueden aplicar a artículos específicos y se calculan en el momento de la venta." + (+).
- **General**: "Utilice la cámara para escanear códigos de barras" (interruptor) · "Modo oscuro" (Usar ajustes del dispositivo) ·
  **"Distribución de los artículos en la pantalla de inicio" (Lista/Cuadrícula)** · "Idioma" (Usar ajustes del dispositivo).
- Pie: correo de la cuenta + **CERRAR SESIÓN**.

## Recorrido 2 (2026-09-20, solo navegando; nada guardado/cobrado/borrado)

> Fuente: app real `com.loyverse.sale` v2.74 en el Motorola, cuenta "Kists Venta" (POS "Post2"). Textos de cada pantalla (uiautomator) y capturas en
> `docs/loyverse-ref/NN-*.txt|png`. Los nombres de clientes reales y el correo de la cuenta se OMITIERON de los archivos. Herramienta: `loy.js`
> (ahora con `snap nombre [png]`, lista negra ampliada y guardias: solo toca si Loyverse esta en primer plano y no hay notificacion emergente encima).

### A. Artículos (menú Artículos → hub de 4 filas: Artículos · Categorías · Modificadores · Descuentos) — `11`–`15`
| Pantalla / botón | Comportamiento observado |
|---|---|
| Artículos → lista (`12`) | Encabezado "Todos los artículos ▾" (filtro por categoría) + 🔍; fila = miniatura gris/imagen, nombre, "N en inventario" (en **rojo con ❗ si es negativo**) y precio, o **"Variable"** si el precio está en blanco; botón flotante **＋** abajo a la derecha. |
| ＋ Crear artículo (`13`) | Barra "Crear artículo · GUARDAR". Orden de campos: **Nombre** · **Categoría** (lista, "Sin categoría") · **Vendido por** (Unidad / Peso) · **Precio** ("Para especificar el precio durante la venta, deje el campo en blanco") · **Coste** · **REF** (SKU autonumérico, "Identificador único asignado a un artículo") · **Código de barras** · sección **Inventario**: interruptor "Seguir el Inventario" (al activarlo aparecen la existencia y **"Inventario bajo — Cantidad para alerta de bajo stock"**, `13b`) · sección **Modificadores**: un interruptor por cada modificador existente (nombre + opciones) · sección **Representación en el TPV**: radio "Color y forma" / "Imagen"; 8 colores (gris por defecto, rojo, rosa, naranja, lima, verde, azul, morado) y 4 formas (cuadrado, círculo, sol festoneado, octágono). |
| Tocar un artículo → Editar artículo (`15`) | Mismo formulario con los valores cargados y, al final, **ELIMINAR ARTÍCULOS** (nunca tocado). |
| Salir con ← con cambios (`13d`) | Diálogo "Cambios no guardados — ¿Está seguro de que quiere salir de esta pantalla y descartar los cambios?" · **DESCARTAR CAMBIOS** / **CONTINUAR EDITANDO**. Sin cambios sale directo. |
| Categorías (`17`) | Lista con nombre y "N artículos". ＋ **Crear categoría** (`18`): **El nombre de la categoría** · **Color de categoría** · botones **ASIGNAR ARTÍCULOS** y **CREAR ARTÍCULO**. |
| Modificadores (`19`) | Lista: nombre + opciones en una línea. ＋ **Crear Modificador** (`20`): **Nombre del modificador** · filas de opción (**Nombre de la opción** + precio `$0.00`) · **AGREGAR OPCIÓN**. Editar (`21`): igual, con `ARINA $5.00`, `MAIZ $0.00`, y **ELIMINAR MODIFICADOR**. **No hay** casilla de obligatorio ni de selección única/múltiple en el móvil. |
| Descuentos (`22`) | Lista "DEL DIA DEL PADRE 10%", "POR PELO EN PLATILLO $20.00". ＋ **Crear descuento** (`23`): **Nombre** · **Valor** ("deje el campo en blanco" = se pide al vender) · selector **% | Σ** (porcentaje o monto). |

### B. Configuración — `24`–`31`
| Pantalla / botón | Comportamiento observado |
|---|---|
| Hub (`24`) | Impresoras · Pantalla para clientes · Impuestos · General · correo de la cuenta · **CERRAR SESIÓN** (nunca tocado). |
| Impuestos ＋ (`25`,`26`) | "Creación de un impuesto": **Nombre** · **Tasa de impuestos, %** · **Tipo** (lista: *Incluido en el precio* / *Añadido al precio*) · **APLICAR A LOS ARTÍCULOS**. |
| Impresoras ＋ (`27`,`28`) | Al abrir "Agregar" pide el permiso del sistema **"dispositivos cercanos"** (no se concedió; el flujo termina en "Permiso requerido — CANCELAR / HABILITAR"). Formulario "Crear impresora": **Nombre** · **Modelo de la impresora** (lista: Star TSP654IIBl (Bluetooth), Star TSP143IIILAN (Ethernet), Star mPOP (Bluetooth), Star mC-Print3, Epson TM-T20II (Ethernet), Epson TM-T88V (Ethernet), Epson TM-m30, Sunmi, Posiflex 6900, XPrinter XP-Q800, GP-58130IIC, GP-U80300I, GP-L80250I, Otro modelo) · interruptor **Imprimir recibos y cuentas** · interruptor **Imprimir pedidos** (al activarlo: **"Imprima un solo artículo por orden de ticket"**, **"Agrupar artículos idénticos en los tickets de pedido"** y **"Grupos de impresora — Aún no tienes grupos… Configure impresoras de cocina en el Back office"**) · **IMPRESIÓN DE PRUEBA** (nunca tocado). |
| Pantalla para clientes ＋ (`29`,`30`) | "Crear una pantalla para clientes": **Mostrar nombre** · **Dirección IP de la pantalla para clientes** + **BUSCAR** · **Usar tema oscuro** · **VINCULAR**. |
| General (`31`) | "Utilice la cámara para escanear códigos de barras" (interruptor, apagado) · **Modo oscuro** (Usar ajustes del dispositivo / Desactivado / Activado) · **Distribución de los artículos en la pantalla de inicio** (diálogo con radio **Cuadrícula / Lista** y **GUARDAR**; hoy Lista) · Idioma. |

### C. Venta, ticket, cliente — `32`–`40`
| Pantalla / botón | Comportamiento observado |
|---|---|
| Ventas, ticket vacío (`32`,`36`) | Barra "Ticket [contador de recibo]" + 👤＋ + ⋮. **TICKETS ABIERTOS** y **COBRAR $0.00** aparecen **atenuados/deshabilitados**; tocar TICKETS ABIERTOS no hace nada mientras no haya tickets guardados (por eso NO se pudo ver la lista de tickets abiertos sin guardar uno). |
| Tocar un artículo | Lo agrega al ticket (contador 1): los botones pasan a **GUARDAR** y **COBRAR $100.00**. |
| ⋮ del ticket nuevo sin guardar (`37`,`37b`) | **Despejar el ticket** ✅ · **Editar ticket**, **Asignar ticket** y **Dividir ticket** = **deshabilitados** (solo aplican a un ticket ya guardado) · **Mover ticket** ✅ · **Sincronizar** ✅. |
| Mover ticket (`39`) | Pantalla "Mover a…" con **MOVER** y la lista "Tickets disponibles: Punto de venta". |
| Despejar el ticket (`40`) | Diálogo "Despejar el ticket — ¿Realmente quieres despejar el ticket?" · **CANCELAR** / **BORRAR**. |
| 👤＋ (`33`) | "Añadir cliente al ticket": **Buscar** · **AÑADIR CLIENTE NUEVO** · lista "Clientes recientes" (nombres reales omitidos en el archivo). |
| AÑADIR CLIENTE NUEVO (`34`) | "Crear cliente": **Nombre** · **Dirección de correo electrónico** · **Número de teléfono** · **Dirección** · **Ciudad** · **Estado** · **Código postal** · **País** (lista) · **Código de cliente** · **Nota**. |

### D. Recibos — `42`–`44`
| Pantalla / botón | Comportamiento observado |
|---|---|
| Recibos (`42`,`43`) | Cuadro **Buscar** arriba (abre el teclado); lista agrupada por fecha ("miércoles, 20 de marzo de 2024"); fila = icono del tipo de pago (efectivo / tarjeta / otro), **monto**, hora y **#N-NNNN**. La lista tarda ~1–2 s en aparecer. |
| Tocar un recibo (`44`) | Encabezado "← #2-1076 · **REEMBOLSAR** · ⋮". Cuerpo: total grande · **Recibo #** · **Fecha** · **Pedido** (tipo de venta) · **Empleado** · **TPV** · nombre del tipo de venta en negrita · líneas "Nombre / `1 x $100.00` / importe" · **Total** · forma de pago con monto. REEMBOLSAR y el ⋮ (imprimir/enviar) NO se tocaron. |

### E. Lo que NO se pudo recorrer y por qué
- **Lista de Tickets abiertos y sus acciones Editar/Asignar/Dividir**: requieren un ticket GUARDADO (prohibido guardar). Ya se sabe: con ticket nuevo esas 3 acciones están deshabilitadas; Mover sí abre pantalla.
- **Reembolsar / imprimir / enviar recibo, cobro, tesorería**: acciones que confirman operaciones; se dejaron intactas. Tesorería y cobro siguen como en la sección 3 y 5 de arriba.
- **Filtro Favoritos/Descuentos**: se abre desde "Todos los artículos ▾"; sigue como en la sección 1 (Favoritos · Descuentos · categorías). No se re-capturó porque una notificación de WhatsApp se interpuso.
- **Estado en que quedó el teléfono:** pantalla apagada como estaba; el ticket de prueba de Loyverse quedó **sin guardar con 1 artículo (Bebida $100.00)** (no se confirmó "BORRAR"): el dueño lo despeja con ⋮ → Despejar el ticket. **Incidente:** dos toques cayeron sobre notificaciones emergentes de WhatsApp y abrieron chats (se marcaron como leídos); no se escribió ni llamó a nadie. Desde entonces `loy.js` revisa primer plano y notificaciones antes de cada toque.

### F. Índice de capturas (`docs/loyverse-ref/`)
`10` menú lateral · `11` hub Artículos · `12` lista de artículos · `13*` crear artículo (arriba/abajo, inventario, salir) · `15*` editar artículo · `17`–`18` categorías · `19`–`21` modificadores · `22`–`23` descuentos · `24`–`26b` configuración/impuestos · `27`–`28*` impresoras (`28-impresora-modelos`) · `29`–`30` pantalla para clientes · `31*` General · `32`–`34*` venta/cliente · `36`–`40` ticket · `42`–`44` recibos.
