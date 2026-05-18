"""B21 — Aplica traducciones EN multipalabra a auto.* entries."""
import json, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

TR = {
  "Inicio":"Home","Salir":"Exit","Volver":"Back","Siguiente":"Next","Anterior":"Previous",
  "Aceptar":"Accept","Rechazar":"Reject","Confirmar":"Confirm","Cancelar":"Cancel","Guardar":"Save",
  "Editar":"Edit","Eliminar":"Delete","Agregar":"Add","Buscar":"Search","Filtrar":"Filter",
  "Exportar":"Export","Importar":"Import","Imprimir":"Print","Descargar":"Download","Subir":"Upload",
  "Activo":"Active","Inactivo":"Inactive","Pendiente":"Pending","Aprobado":"Approved","Rechazado":"Rejected",
  "Bienvenido":"Welcome","Hola":"Hello","Configuracion":"Settings","Configuración":"Settings",
  "Ajustes":"Settings","Preferencias":"Preferences","Idioma":"Language","Tema":"Theme",
  "Claro":"Light","Oscuro":"Dark","Automatico":"Automatic","Automático":"Automatic","Sistema":"System",
  "Notificaciones":"Notifications","Mensajes":"Messages","Alertas":"Alerts","Avisos":"Notices",
  "Ayuda":"Help","Soporte":"Support","Documentacion":"Documentation","Documentación":"Documentation","Tutorial":"Tutorial",
  "Cliente":"Customer","Clientes":"Customers","Producto":"Product","Productos":"Products",
  "Venta":"Sale","Ventas":"Sales","Compra":"Purchase","Compras":"Purchases",
  "Factura":"Invoice","Facturas":"Invoices","Pago":"Payment","Pagos":"Payments",
  "Recibo":"Receipt","Recibos":"Receipts","Cotizacion":"Quote","Cotización":"Quote","Cotizaciones":"Quotes",
  "Orden":"Order","Ordenes":"Orders","Órdenes":"Orders","Pedido":"Order","Pedidos":"Orders",
  "Catalogo":"Catalog","Catálogo":"Catalog","Inventario":"Inventory","Stock":"Stock",
  "Precio":"Price","Precios":"Prices","Costo":"Cost","Costos":"Costs","Margen":"Margin","Utilidad":"Profit",
  "Tarjeta":"Card","Efectivo":"Cash","Transferencia":"Transfer","Cheque":"Check",
  "Total":"Total","Subtotal":"Subtotal","Descuento":"Discount","Descuentos":"Discounts",
  "Impuesto":"Tax","Impuestos":"Taxes","IVA":"VAT","IEPS":"IEPS",
  "Cantidad":"Quantity","Unidad":"Unit","Unidades":"Units","Pieza":"Piece","Piezas":"Pieces",
  "Caja":"Cashbox","Cajas":"Cashboxes","Apertura":"Opening","Cierre":"Close","Corte":"Cut",
  "Sucursal":"Branch","Sucursales":"Branches","Almacen":"Warehouse","Almacén":"Warehouse",
  "Hoy":"Today","Ayer":"Yesterday","Manana":"Tomorrow","Mañana":"Tomorrow",
  "Dia":"Day","Día":"Day","Dias":"Days","Días":"Days","Semana":"Week","Semanas":"Weeks",
  "Mes":"Month","Meses":"Months","Ano":"Year","Año":"Year","Anos":"Years","Años":"Years",
  "Hora":"Time","Horas":"Hours","Minuto":"Minute","Minutos":"Minutes",
  "Lunes":"Monday","Martes":"Tuesday","Miercoles":"Wednesday","Miércoles":"Wednesday",
  "Jueves":"Thursday","Viernes":"Friday","Sabado":"Saturday","Sábado":"Saturday","Domingo":"Sunday",
  "Enero":"January","Febrero":"February","Marzo":"March","Abril":"April","Mayo":"May",
  "Junio":"June","Julio":"July","Agosto":"August","Septiembre":"September","Octubre":"October",
  "Noviembre":"November","Diciembre":"December",
  "Si":"Yes","Sí":"Yes","No":"No","Mas":"More","Más":"More","Menos":"Less",
  "Todo":"All","Todos":"All","Ninguno":"None","Otros":"Others","Nuevo":"New","Antiguo":"Old",
  "Reciente":"Recent","Proximo":"Next","Próximo":"Next","Pasado":"Past","Futuro":"Future",
  "Disponible":"Available","En":"In","Sin":"Without","De":"Of","Por":"By","Para":"For",
  "Conectado":"Connected","Desconectado":"Disconnected","Linea":"Line","Línea":"Line",
  "Conexion":"Connection","Conexión":"Connection","Sincronizado":"Synced","Sincronizar":"Sync",
  "Verificado":"Verified","Suspendido":"Suspended","Bloqueado":"Blocked",
  "Empresa":"Company","Empresas":"Companies","Tienda":"Store","Tiendas":"Stores","Negocio":"Business",
  "Cuenta":"Account","Cuentas":"Accounts","Saldo":"Balance","Credito":"Credit","Crédito":"Credit",
  "Reporte":"Report","Reportes":"Reports","Informe":"Report","Informes":"Reports","Analisis":"Analysis","Análisis":"Analysis",
  "Estadisticas":"Statistics","Estadísticas":"Statistics","Metricas":"Metrics","Métricas":"Metrics",
  "Tablero":"Dashboard","Panel":"Panel","Resumen":"Summary","Detalle":"Detail","Detalles":"Details",
  "Acciones":"Actions","Accion":"Action","Acción":"Action","Vista":"View","Vistas":"Views",
  "Permisos":"Permissions","Roles":"Roles","Rol":"Role",
  "Usuario":"User","Usuarios":"Users","Administrador":"Administrator","Empleado":"Employee",
  "Cajero":"Cashier","Gerente":"Manager","Dueno":"Owner","Dueño":"Owner","Proveedor":"Vendor","Proveedores":"Vendors",
  "Estado":"Status","Categoria":"Category","Categoría":"Category","Marca":"Brand","Tipo":"Type",
  "Aplicar":"Apply","Restablecer":"Reset","Limpiar":"Clear","Mostrar":"Show","Ocultar":"Hide",
  "Habilitar":"Enable","Deshabilitar":"Disable","Activar":"Activate","Desactivar":"Deactivate",
  "Crear":"Create","Crear cuenta":"Create account",
  "Iniciar":"Start","Iniciar sesion":"Sign in","Iniciar sesión":"Sign in",
  "Cerrar":"Close","Cerrar sesion":"Sign out","Cerrar sesión":"Sign out",
  "Olvide":"Forgot","Olvidé":"Forgot","Recordar":"Remember",
  "Email":"Email","Correo":"Email","Contrasena":"Password","Contraseña":"Password",
  "Telefono":"Phone","Teléfono":"Phone","Direccion":"Address","Dirección":"Address",
  "Ciudad":"City","Pais":"Country","País":"Country",
  "Multi":"Multi","Tenant":"Tenant","Tiempo":"Time","Real":"Real",
  "Bajo":"Low","Alto":"High","Normal":"Normal","Bajo stock":"Low stock",
  "Vencido":"Overdue","Pagado":"Paid","Pendientes":"Pending","Completados":"Completed",
  "Recompensas":"Rewards","Puntos":"Points","Puntaje":"Score","Lealtad":"Loyalty",
  "Promociones":"Promotions","Promocion":"Promotion","Promoción":"Promotion",
  "Cupones":"Coupons","Cupon":"Coupon","Cupón":"Coupon","Codigos":"Codes","Codigo":"Code","Código":"Code",
  "Suscripcion":"Subscription","Suscripción":"Subscription","Suscripciones":"Subscriptions",
  "Mensual":"Monthly","Anual":"Annual","Trimestral":"Quarterly","Semestral":"Biannual",
  "Acumula":"Earn","y":"and","canjea":"redeem",
  "Aqui":"Here","Aquí":"Here","esta":"is","está":"is","el":"the","la":"the",
  "tu":"your","tus":"your","mi":"my","sus":"its","su":"its",
  "vuelta":"back","de":"of","del":"of the",
}
TR_LOWER = {k.lower(): v for k, v in TR.items()}

es_block = open('volvix-i18n-wiring.js', encoding='utf-8').read()
auto_entries = dict(re.findall(r'"(auto\.[a-z_0-9]+)":\s*"([^"]+)"', es_block))
en = json.load(open('i18n/en.json', encoding='utf-8'))

def translate_phrase(es_text):
  if es_text in TR: return TR[es_text]
  if es_text.lower() in TR_LOWER: return TR_LOWER[es_text.lower()]
  parts = es_text.split()
  if len(parts) > 6: return None
  translated = []
  any_match = False
  for p in parts:
    tp = p.lower().strip('.,:;!?')
    if tp in TR_LOWER:
      translated.append(TR_LOWER[tp])
      any_match = True
    else:
      translated.append(p)
  return ' '.join(translated) if any_match else None

applied = 0
for key, es_text in auto_entries.items():
  current = en.get(key, '')
  if current and current != es_text:
    continue
  tr = translate_phrase(es_text)
  if tr and tr != es_text:
    en[key] = tr
    applied += 1

with open('i18n/en.json', 'w', encoding='utf-8') as f:
  json.dump(en, f, ensure_ascii=False, indent=2)
print(f"Traducciones aplicadas: {applied}")
print(f"Total dict EN: {len(en)}")
