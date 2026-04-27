"""B29.2 — Pass i18n EN ampliado con frases multi-palabra comunes."""
import json, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# Diccionario expandido con frases compuestas comunes UI
PHRASES = {
  # Frases de botones / acciones
  "Iniciar sesion": "Sign in", "Iniciar sesión": "Sign in",
  "Cerrar sesion": "Sign out", "Cerrar sesión": "Sign out",
  "Crear cuenta": "Create account", "Crear nuevo": "Create new",
  "Olvide mi contrasena": "Forgot password", "Olvidé mi contraseña": "Forgot password",
  "Recordar contrasena": "Remember password", "Recordar contraseña": "Remember password",
  "Cambiar contrasena": "Change password", "Cambiar contraseña": "Change password",
  "Volver al inicio": "Back to home", "Volver atras": "Go back", "Volver atrás": "Go back",
  "Guardar cambios": "Save changes", "Guardar y continuar": "Save and continue",
  "Cancelar pedido": "Cancel order", "Cancelar venta": "Cancel sale",
  "Confirmar pago": "Confirm payment", "Confirmar pedido": "Confirm order",
  "Agregar producto": "Add product", "Agregar cliente": "Add customer",
  "Agregar al carrito": "Add to cart", "Quitar del carrito": "Remove from cart",
  "Editar producto": "Edit product", "Editar cliente": "Edit customer",
  "Eliminar producto": "Delete product", "Eliminar cliente": "Delete customer",
  "Buscar producto": "Search product", "Buscar cliente": "Search customer",
  "Ver detalle": "View detail", "Ver detalles": "View details", "Ver mas": "View more", "Ver más": "View more",
  "Ocultar detalles": "Hide details", "Mostrar detalles": "Show details",
  "Seleccionar todo": "Select all", "Deseleccionar todo": "Deselect all",
  "Aplicar filtro": "Apply filter", "Aplicar filtros": "Apply filters",
  "Limpiar filtros": "Clear filters", "Limpiar busqueda": "Clear search", "Limpiar búsqueda": "Clear search",
  "Exportar a CSV": "Export to CSV", "Exportar a Excel": "Export to Excel", "Exportar a PDF": "Export to PDF",
  "Imprimir recibo": "Print receipt", "Imprimir factura": "Print invoice", "Imprimir ticket": "Print ticket",
  "Descargar reporte": "Download report", "Descargar PDF": "Download PDF",
  "Subir archivo": "Upload file", "Subir imagen": "Upload image",
  "Tomar foto": "Take photo", "Escanear codigo": "Scan code", "Escanear código": "Scan code",
  "Escanear codigo de barras": "Scan barcode", "Escanear código de barras": "Scan barcode",
  "Codigo de barras": "Barcode", "Código de barras": "Barcode",
  "Codigo QR": "QR code", "Código QR": "QR code",
  "Numero de serie": "Serial number", "Número de serie": "Serial number",

  # Etiquetas comunes
  "Nombre del producto": "Product name", "Nombre del cliente": "Customer name",
  "Nombre completo": "Full name", "Nombre comercial": "Trade name", "Razon social": "Business name", "Razón social": "Business name",
  "Correo electronico": "Email", "Correo electrónico": "Email",
  "Numero de telefono": "Phone number", "Número de teléfono": "Phone number",
  "Direccion de envio": "Shipping address", "Dirección de envío": "Shipping address",
  "Direccion de facturacion": "Billing address", "Dirección de facturación": "Billing address",
  "Codigo postal": "ZIP code", "Código postal": "ZIP code",
  "Fecha de nacimiento": "Date of birth", "Fecha de registro": "Registration date",
  "Fecha de creacion": "Creation date", "Fecha de creación": "Creation date",
  "Fecha de vencimiento": "Due date", "Fecha de pago": "Payment date",
  "Fecha de inicio": "Start date", "Fecha de fin": "End date",
  "Fecha de venta": "Sale date", "Fecha de compra": "Purchase date",
  "Hora de inicio": "Start time", "Hora de fin": "End time",
  "Estado del pedido": "Order status", "Estado de pago": "Payment status",
  "Metodo de pago": "Payment method", "Método de pago": "Payment method",
  "Forma de pago": "Payment form", "Tipo de pago": "Payment type",
  "Numero de orden": "Order number", "Número de orden": "Order number",
  "Numero de factura": "Invoice number", "Número de factura": "Invoice number",
  "Numero de ticket": "Ticket number", "Número de ticket": "Ticket number",

  # Estados / status
  "En proceso": "In progress", "En camino": "On the way",
  "En espera": "On hold", "En curso": "Ongoing",
  "Sin existencias": "Out of stock", "En stock": "In stock", "Bajo stock": "Low stock",
  "Stock disponible": "Available stock", "Stock bajo": "Low stock",
  "Pago pendiente": "Pending payment", "Pago completado": "Payment completed",
  "Pago fallido": "Payment failed", "Pago aprobado": "Payment approved",
  "Pago rechazado": "Payment declined",
  "Pedido entregado": "Order delivered", "Pedido enviado": "Order shipped",
  "Pedido cancelado": "Order canceled", "Pedido completado": "Order completed",

  # Mensajes / labels
  "No hay datos": "No data", "No hay resultados": "No results",
  "No se encontraron resultados": "No results found",
  "Cargando datos": "Loading data", "Cargando productos": "Loading products",
  "Procesando pago": "Processing payment", "Procesando pedido": "Processing order",
  "Guardando cambios": "Saving changes", "Eliminando registro": "Deleting record",
  "Operacion exitosa": "Operation successful", "Operación exitosa": "Operation successful",
  "Operacion fallida": "Operation failed", "Operación fallida": "Operation failed",
  "Algo salio mal": "Something went wrong", "Algo salió mal": "Something went wrong",
  "Intenta de nuevo": "Try again", "Intentar nuevamente": "Try again",
  "Por favor espere": "Please wait", "Por favor intenta de nuevo": "Please try again",

  # Periodos
  "Esta semana": "This week", "Ultima semana": "Last week", "Última semana": "Last week",
  "Este mes": "This month", "Ultimo mes": "Last month", "Último mes": "Last month",
  "Este ano": "This year", "Este año": "This year", "Ultimo ano": "Last year", "Último año": "Last year",
  "Hoy mismo": "Today", "Ayer mismo": "Yesterday",
  "Ultimos 7 dias": "Last 7 days", "Últimos 7 días": "Last 7 days",
  "Ultimos 30 dias": "Last 30 days", "Últimos 30 días": "Last 30 days",
  "Ultimos 90 dias": "Last 90 days", "Últimos 90 días": "Last 90 days",

  # Reportes / KPIs
  "Total de ventas": "Total sales", "Total de pedidos": "Total orders",
  "Total de clientes": "Total customers", "Total de productos": "Total products",
  "Ingresos totales": "Total revenue", "Gastos totales": "Total expenses",
  "Margen de ganancia": "Profit margin", "Margen bruto": "Gross margin",
  "Ticket promedio": "Average ticket", "Venta promedio": "Average sale",
  "Productos vendidos": "Products sold", "Clientes nuevos": "New customers",
  "Mas vendidos": "Best sellers", "Más vendidos": "Best sellers",
  "Mejores clientes": "Top customers", "Mejores productos": "Top products",

  # Settings / config
  "Configuracion general": "General settings", "Configuración general": "General settings",
  "Configuracion avanzada": "Advanced settings", "Configuración avanzada": "Advanced settings",
  "Preferencias de usuario": "User preferences",
  "Cuenta de usuario": "User account", "Mi cuenta": "My account",
  "Mi perfil": "My profile", "Mi tienda": "My store", "Mis pedidos": "My orders",
  "Mis productos": "My products", "Mis clientes": "My customers", "Mis ventas": "My sales",
  "Cerrar caja": "Close cashbox", "Abrir caja": "Open cashbox",
  "Corte de caja": "Cash cut", "Reporte de caja": "Cashbox report",
}

PLAN = "v3"
es_block = open('volvix-i18n-wiring.js', encoding='utf-8').read()
en = json.load(open('i18n/en.json', encoding='utf-8'))
auto_entries = dict(re.findall(r'"([a-zA-Z0-9._]+)":\s*"([^"]+)"', es_block))

# Ordenar frases por longitud descendente (match larger first)
sorted_phrases = sorted(PHRASES.items(), key=lambda x: -len(x[0]))

applied = 0
for key, es_text in auto_entries.items():
  current = en.get(key, '')
  # Solo traducir entradas que son iguales al ES (sin traducir)
  if current and current != es_text:
    continue
  # Buscar match exacto primero
  if es_text in PHRASES:
    en[key] = PHRASES[es_text]
    applied += 1
    continue
  # Buscar substitución parcial: si el texto contiene una frase exacta
  translated = es_text
  for src, tgt in sorted_phrases:
    if src in translated:
      translated = translated.replace(src, tgt)
  if translated != es_text:
    en[key] = translated
    applied += 1

with open('i18n/en.json', 'w', encoding='utf-8') as f:
  json.dump(en, f, ensure_ascii=False, indent=2)

# Re-contar
equal = sum(1 for k,v in en.items() if auto_entries.get(k) == v)
print(f"PLAN {PLAN} aplicadas: {applied}")
print(f"Total EN: {len(en)} | iguales a ES: {equal} | traducidas: {len(en)-equal}")
