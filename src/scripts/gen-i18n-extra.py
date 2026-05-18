"""Genera entries de i18n para strings UI no cubiertos."""
import re, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

PAGES = ['login.html', 'salvadorex_web_v25.html', 'volvix-mega-dashboard.html',
  'volvix-admin-saas.html', 'volvix_owner_panel_v7.html',
  'volvix-vendor-portal.html', 'volvix-customer-portal.html',
  'marketplace.html', 'volvix-hub-landing.html']

def strip(html):
  html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S | re.I)
  html = re.sub(r'<style\b[^>]*>.*?</style>', '', html, flags=re.S | re.I)
  return re.sub(r'<!--.*?-->', '', html, flags=re.S)

visible = set()
for p in PAGES:
  try:
    txt = strip(open(p, encoding='utf-8').read())
    for m in re.findall(r'>\s*([A-ZA-Za-zÀ-ſ][A-Za-zÀ-ſ0-9 ./,\-]{2,40})\s*<', txt):
      m = m.strip()
      if not m or m.isdigit() or re.match(r'^[\d\.\,\s\-/$%]+$', m): continue
      if '@' in m and ' ' not in m: continue
      if 'http' in m.lower() or '.js' in m or '.css' in m: continue
      visible.add(m)
  except FileNotFoundError: pass

es_dict_existing = set()
txt = open('volvix-i18n-wiring.js', encoding='utf-8').read()
for m in re.findall(r'"[a-z]+\.[a-z._]+"\s*:\s*"([^"]+)"', txt):
  es_dict_existing.add(m.strip().lower())

def slug(s):
  s2 = re.sub(r'[^A-Za-z0-9]+', '_', s.lower())
  return re.sub(r'_+', '_', s2).strip('_')[:40]

new = sorted(s for s in visible if s.lower() not in es_dict_existing)
print('strings nuevos:', len(new))

TR = {
  'Activo':'Active','Inactivo':'Inactive','Pendiente':'Pending','Entregado':'Delivered',
  'En transito':'In transit','En tránsito':'In transit','Facturado':'Invoiced','Rechazado':'Rejected',
  'Cobrar':'Charge','Comprar':'Buy','Vender':'Sell','Guardar':'Save','Cancelar':'Cancel',
  'Eliminar':'Delete','Editar':'Edit','Agregar':'Add','Buscar':'Search','Filtrar':'Filter',
  'Cliente':'Customer','Clientes':'Customers','Producto':'Product','Productos':'Products',
  'Venta':'Sale','Ventas':'Sales','Ticket':'Ticket','Tickets':'Tickets',
  'Reporte':'Report','Reportes':'Reports','Inventario':'Inventory','Configuracion':'Settings','Configuración':'Settings',
  'Sucursal':'Branch','Sucursales':'Branches','Caja':'Cashbox','Cajas':'Cashboxes',
  'Pago':'Payment','Pagos':'Payments','Factura':'Invoice','Facturas':'Invoices',
  'Tarjeta':'Card','Efectivo':'Cash','Transferencia':'Transfer','Total':'Total',
  'Subtotal':'Subtotal','Descuento':'Discount','Impuestos':'Taxes','Cantidad':'Quantity',
  'Precio':'Price','Stock':'Stock','Bodega':'Warehouse','Almacen':'Warehouse','Almacén':'Warehouse',
  'Bienvenido':'Welcome','Hola':'Hello','Cerrar sesion':'Sign out','Iniciar sesion':'Sign in',
  'Correo':'Email','Contrasena':'Password','Contraseña':'Password','Usuario':'User','Usuarios':'Users',
  'Nuevo':'New','Cerrar':'Close','Confirmar':'Confirm','Aceptar':'Accept',
  'Continuar':'Continue','Siguiente':'Next','Anterior':'Previous',
  'Volver':'Back','Atras':'Back','Atrás':'Back','Hoy':'Today','Ayer':'Yesterday','Manana':'Tomorrow',
  'Dia':'Day','Día':'Day','Semana':'Week','Mes':'Month','Ano':'Year','Año':'Year','Hora':'Time',
  'Lunes':'Monday','Martes':'Tuesday','Miercoles':'Wednesday','Miércoles':'Wednesday','Jueves':'Thursday','Viernes':'Friday','Sabado':'Saturday','Sábado':'Saturday','Domingo':'Sunday',
  'Enero':'January','Febrero':'February','Marzo':'March','Abril':'April','Mayo':'May','Junio':'June',
  'Julio':'July','Agosto':'August','Septiembre':'September','Octubre':'October','Noviembre':'November','Diciembre':'December',
  'Si':'Yes','Sí':'Yes','No':'No','Sin datos':'No data','Sin resultados':'No results','Cargando':'Loading',
  'Acciones':'Actions','Accion':'Action','Acción':'Action','Detalle':'Detail','Detalles':'Details',
  'Estado':'Status','Activos':'Active','Inactivos':'Inactive','Vista':'View',
  'Resumen':'Summary','Analisis':'Analysis','Análisis':'Analysis','Metricas':'Metrics','Métricas':'Metrics','Grafica':'Chart','Gráfica':'Chart',
  'Panel':'Panel','Tablero':'Dashboard','Inicio':'Home','Salir':'Exit','Ayuda':'Help',
  'Soporte':'Support','Notificaciones':'Notifications','Mensajes':'Messages','Perfil':'Profile',
  'Empresa':'Company','Empresas':'Companies','Tienda':'Store','Tiendas':'Stores',
  'Solicitar':'Request','Aprobar':'Approve','Pagar':'Pay','Devolver':'Return',
  'Imprimir':'Print','Descargar':'Download','Subir':'Upload','Compartir':'Share','Exportar':'Export',
  'Importar':'Import','Conectado':'Connected','Desconectado':'Disconnected','En linea':'Online','En línea':'Online',
  'Sin conexion':'Offline','Sin conexión':'Offline','Sincronizar':'Sync','Sincronizado':'Synced',
  'Verificado':'Verified','Sin verificar':'Unverified','Aprobada':'Approved','Suspendido':'Suspended',
  'Pendientes':'Pending','Completados':'Completed','Cancelados':'Cancelled',
  'Mostrar':'Show','Ocultar':'Hide','Mas':'More','Más':'More','Menos':'Less','Todo':'All','Ninguno':'None',
  'Aplicar':'Apply','Restablecer':'Reset','Limpiar':'Clear',
}

def translate(s):
  if s in TR: return TR[s]
  parts = s.split()
  if all(p in TR for p in parts):
    return ' '.join(TR[p] for p in parts)
  return s

es_entries = {}
en_entries = {}
seen = set()
for s in new:
  if len(s) > 60 or len(s) < 2: continue
  k = 'auto.' + slug(s)
  if not k or k == 'auto.' or k in seen: continue
  seen.add(k)
  es_entries[k] = s
  en_entries[k] = translate(s)

print('entries:', len(es_entries))
os.makedirs('.audit', exist_ok=True)
with open('.audit/i18n-extra-es.json', 'w', encoding='utf-8') as f:
  json.dump(es_entries, f, ensure_ascii=False, indent=2)
with open('.audit/i18n-extra-en.json', 'w', encoding='utf-8') as f:
  json.dump(en_entries, f, ensure_ascii=False, indent=2)
print('OK persistido')
