# 📊 Dashboard Admin v8 - Guía de Usuario

## 🎯 Acceso Rápido

### URL de Acceso
```
https://volvix-pos.vercel.app/volvix_owner_panel_v8.html
```

### Requisitos
- Navegador moderno (Chrome, Safari, Firefox, Edge)
- Conexión a internet
- Usuario autenticado en el sistema
- Rol de Owner, Admin o Manager

## 🏠 Dashboard Principal

### Qué ves al cargar
1. **4 Métricas Clave (KPIs)**
   - Total de Ventas (mes actual)
   - Número de Transacciones
   - Ticket Promedio (venta)
   - Productos Activos + Bajo Stock

2. **4 Gráficos Interactivos**
   - Ventas por Día (últimos 30 días)
   - Métodos de Pago (circular)
   - Top 10 Productos (barras)
   - Ventas por Categoría (barras)

### Cómo usar
- **Refrescar datos**: Botón "🔄 Actualizar" arriba a la derecha
- **Cambiar tab**: Click en la izquierda (Ventas, Transacciones, etc.)
- **Exportar**: Botón "📥 Exportar CSV" (descarga datos)

## 💰 Tab: Ventas

### Funcionalidad
Análisis detallado de ventas por producto

### Controles
1. **Selector de Período**
   - Hoy: Solo ventas de hoy
   - Esta Semana: Últimos 7 días
   - Este Mes: Últimos 30 días (default)
   - Este Año: Desde 1 de enero

2. **Tabla de Resultados**
   - Producto: Nombre del artículo
   - Cantidad: Unidades vendidas
   - Monto: Total en moneda
   - % del Total: Participación en ventas

### Ejemplo
Si vendes 100 tacos a $100 MXN, verás:
```
Taco de Carne    | 100 | $10,000.00 | 45.5%
```

### Exportar
Click en "📥 Exportar CSV" → Descarga archivo con todos los productos

## 📋 Tab: Transacciones

### Funcionalidad
Historial completo de cada venta realizada

### Controles

1. **Búsqueda**
   - Escribe nombre del cliente
   - Escribe ID de transacción
   - Búsqueda en tiempo real

2. **Filtro de Estado**
   - Todas: Muestra todas las ventas
   - Completadas: Solo pagadas
   - Pendientes: Impresas pero no pagadas
   - Reembolsadas: Ventas devueltas

3. **Tabla**
   - Fecha: Cuándo se realizó
   - Cliente: Quién compró
   - Monto: Cuánto se vendió
   - Método: Cómo pagó (Efectivo, Tarjeta, etc.)
   - Estado: Completada, Pendiente, Reembolsada
   - Acciones: Ver detalles

### Paginación
- Muestra 20 transacciones por página
- Botones de navegación al final
- Total de transacciones arriba

## 📦 Tab: Inventario

### Funcionalidad
Control de stock en tiempo real

### Controles

1. **Búsqueda**
   - Busca por nombre de producto
   - Búsqueda en tiempo real

2. **Filtros**
   - Checkbox "Solo bajo stock"
   - Muestra solo productos con <5 unidades
   - Útil para reordenar

3. **Tabla**
   - Producto: Nombre
   - SKU: Código único
   - Stock Actual: Unidades disponibles
   - Stock Mínimo: Cantidad ideal
   - Estado: "Bajo" (rojo) o "Disponible" (verde)
   - Categoría: Tipo de producto

### Alertas
- Rojo: Stock bajo (< mínimo)
- Verde: Stock disponible
- Título del tab muestra contador de alertas

## 👥 Tab: Usuarios

### Funcionalidad
Gestión de empleados y accesos

### Controles

1. **Búsqueda**
   - Busca por nombre o email

2. **Filtro de Rol**
   - Propietario: Owner del negocio
   - Administrador: Acceso completo
   - Cajero: Solo puede vender
   - Empleado: Rol general

3. **Tabla**
   - Nombre/Email: Quién es
   - Rol: Qué permisos tiene
   - Estado: Activo o Inactivo
   - Último Login: Cuándo entró
   - Acciones: Editar usuario

4. **Acciones**
   - Click "Editar": Cambiar rol o estado
   - Click "➕ Invitar": Invita nuevo usuario por email

### Importante
- Solo Owner puede cambiar roles
- Los cambios se aplican inmediatamente
- Email de invitación se envía automáticamente

## 📊 Tab: Reportes

### Funcionalidad
Reportes avanzados y análisis

### Controles

1. **Selector de Tipo**
   - Ventas por Empleado: Quién vende más
   - Horas Pico: Cuándo hay más ventas
   - Desglose de Pagos: Efectivo vs Tarjeta
   - Reembolsos: Devoluciones por causa
   - Valor Vida del Cliente: Clientes recurrentes

2. **Botones**
   - "📊 Generar": Crea el reporte
   - "📄 Descargar PDF": Exporta formato PDF

### Uso Típico
```
1. Selecciona "Ventas por Empleado"
2. Click "Generar Reporte"
3. Espera 1-2 segundos
4. Click "Descargar PDF" para compartir con gerencia
```

## 🔗 Tab: Integraciones

### Funcionalidad
Estado de servicios externos

### Servicios Disponibles

1. **📱 WhatsApp Business**
   - Estado: Activo/Inactivo
   - Función: Enviar mensajes a clientes
   - Botón: "🧪 Probar Conexión"

2. **☎️ Twilio SMS**
   - Estado: Activo/Inactivo
   - Función: Enviar SMS
   - Botón: "🧪 Probar Conexión"

3. **💳 PayPal**
   - Estado: Activo/Inactivo
   - Función: Pagos en línea
   - Botón: "🧪 Probar Conexión"

4. **📧 Email (Resend)**
   - Estado: Activo/Inactivo
   - Función: Enviar correos
   - Botón: "🧪 Probar Conexión"

### Estados
- 🟢 Verde: Configurado y activo
- 🔴 Rojo: No configurado
- Click "Probar" para verificar conexión

## ⚙️ Opciones Globales

### Botones Superiores (Arriba a la derecha)

1. **📥 Exportar CSV**
   - Descarga datos del tab actual
   - Formato compatible con Excel
   - Incluye todos los registros

2. **🔄 Actualizar**
   - Recarga datos desde servidor
   - Muestra spinner mientras carga
   - Ideal cada 5-10 minutos

## 📱 En Móvil

### Cambios de diseño
- Sidebar se convierte en horizontal
- Gráficos ocupan pantalla completa
- Tablas se adaptan con scroll horizontal
- Botones más grandes para touch

### Recomendación
- Usar en pantalla completa
- Rotar a horizontal para mejor vista
- Usar con Chrome o Safari (navegadores modernos)

## 🚀 Consejos de Uso

### Diario
1. Mañana: Revisar KPIs del mes
2. Mediodía: Consultar top productos
3. Tarde: Revisar transacciones pendientes
4. Noche: Generar reporte diario

### Semanal
1. Revisar usuarios activos
2. Analizar métodos de pago
3. Exportar reportes de ventas
4. Verificar integraciones

### Mensual
1. Generar reportes completos
2. Análisis de horas pico
3. Evaluar desempeño de empleados
4. Reajustar stock mínimos

## ❓ Preguntas Frecuentes

### ¿Qué significa "Ticket Promedio"?
Promedio de venta por transacción. Si vendiste $10,000 MXN en 100 ventas, el ticket promedio es $100.

### ¿Por qué no veo todos mis productos?
- Revisa el filtro "Solo bajo stock"
- Busca por nombre en la caja de búsqueda
- Algunos pueden estar inactivos

### ¿Cómo invito un nuevo usuario?
1. Tab Usuarios
2. Click "➕ Invitar Usuario"
3. Escribe email
4. Sistema envía invitación automática

### ¿Puedo descargar datos en Excel?
Sí, click "📥 Exportar CSV" en cualquier tab. Abre en Excel.

### ¿Con qué frecuencia se actualiza?
En tiempo real. Los datos son frescos del servidor.

### ¿Qué significan las alertas rojas?
Stock bajo (menos del mínimo). Necesita reorden.

## 🔒 Seguridad

### Lo que está protegido
- Solo ves datos de TU negocio (tenant isolation)
- Cada usuario ve solo su departamento
- Contraseñas nunca se muestran
- Las sesiones expiran automáticamente

### Qué no compartir
- Links del dashboard con clientes
- Credenciales de acceso
- Datos de otros usuarios
- Reportes sensibles (salarios, etc.)

## 🐛 Si Algo No Funciona

### Página no carga
1. Recarga la página (Ctrl+R o Cmd+R)
2. Limpia caché del navegador
3. Intenta con navegador diferente

### Datos no aparecen
1. Click "🔄 Actualizar"
2. Espera 2-3 segundos
3. Verifica tu conexión a internet

### Gráficos no se muestran
1. Actualiza la página
2. Desactiva extensions del navegador
3. Prueba en incógnito

### Error "No autorizado"
1. Tu sesión expiró
2. Vuelve a iniciar sesión
3. Verifica tu rol (debe ser Owner/Admin)

## 📞 Soporte

Si tienes problemas:
1. Intenta los pasos de "Si Algo No Funciona"
2. Contacta al administrador del sistema
3. Proporciona screenshot del error
4. Menciona qué navegador usas

## 📝 Términos

| Término | Significado |
|---------|------------|
| KPI | Indicador clave de desempeño |
| Ticket | Una venta/transacción |
| Tenant | Tu negocio/empresa |
| SKU | Código único del producto |
| CSV | Formato de datos (Excel) |
| Dashboard | Panel de control |
| Método de Pago | Cómo pagó (Efectivo, Tarjeta) |

---

**¡Disfruta tu nuevo dashboard! 🎉**

Para más detalles técnicos, consulta `DASHBOARD_V8_IMPLEMENTATION.md`

Última actualización: 2026-04-29
