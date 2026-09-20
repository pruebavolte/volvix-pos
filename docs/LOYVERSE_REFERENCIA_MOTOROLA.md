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

## Pendiente de recorrer (siguiente sesión, con `loy.js`)
Alta/edición de artículo (campos), alta de categoría/modificador/descuento/impuesto/impresora, detalle de un recibo (reembolso, reimprimir),
lista de Tickets abiertos con datos, Editar/Asignar/Dividir/Mover ticket, selector de cliente, Back office y Apps (probablemente web).
