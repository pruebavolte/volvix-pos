// Genera public/data/modal-fields-catalog.json
// Fuente única de verdad para los campos dinámicos de los modales por giro.
// Filosofía: UN modal por entidad, los campos se activan/ocultan por giro vía data-module + data-giros.

const fs = require('fs');
const path = require('path');

// Helper para reducir verbosity
const f = (name, label, type, module, giros, extra) => Object.assign(
  { name, label, type: type || 'text', module: module || 'base', giros: giros || ['*'] },
  extra || {}
);

const catalog = {
  _meta: {
    version: '1.0',
    generated: '2026-05-18',
    description: 'Catálogo único de campos dinámicos por modal. Filtrados por giro vía applyGiroConfig.js.',
    philosophy: 'Un solo sistema configurable, no múltiples sistemas. Activar/ocultar campos por giro + cambiar terminologías.',
    integration: 'render dinámico en <div data-vlx-dynamic-fields="MODAL_NAME"></div>'
  },

  // Catálogo de módulos: si está inactivo en el giro, ningún campo de ese módulo se renderiza.
  modules: {
    base:           { label: 'Base',                always_active: true,  giros: ['*'] },
    fiscal:         { label: 'Fiscal / SAT',        giros: ['*'] },
    precios:        { label: 'Precios extendidos',  giros: ['*'] },
    comisiones:     { label: 'Comisiones',          giros: ['barberia','estetica','gym','retail','restaurante'] },
    lealtad:        { label: 'Lealtad y cashback',  giros: ['*'] },
    inventario:     { label: 'Inventario avanzado', giros: ['*'] },
    serializacion:  { label: 'Series/IMEI',         giros: ['celulares','electronica'] },
    lotes:          { label: 'Lotes',               giros: ['farmacia','abarrotes','carniceria'] },
    caducidad:      { label: 'Caducidad',           giros: ['farmacia','abarrotes','carniceria','restaurante'] },
    trazabilidad:   { label: 'Trazabilidad',        giros: ['farmacia','industrial','carniceria','export'] },
    compliance:     { label: 'Compliance',          giros: ['farmacia','industrial','alimentos','export'] },
    variantes:      { label: 'Variantes',           giros: ['ropa','zapateria','boutique','pintura','muebleria','abarrotes','farmacia'] },
    recetas:        { label: 'Recetas/Componentes', giros: ['restaurante','panaderia','bar','taqueria','cafeteria'] },
    combos:         { label: 'Kits/Combos',         giros: ['restaurante','papeleria','retail'] },
    servicios:      { label: 'Servicios',           giros: ['barberia','medico','taller','spa','estetica','veterinaria'] },
    agenda:         { label: 'Agenda/Citas',        giros: ['barberia','estetica','medico','veterinaria','spa'] },
    suscripciones:  { label: 'Suscripciones',       giros: ['gym','saas','membresia'] },
    rentas:         { label: 'Rentas/Alquileres',   giros: ['rentas','hotel','coworking','salones','trajes','parking','airbnb'] },
    cocina:         { label: 'Cocina/KDS',          giros: ['restaurante','taqueria','cafeteria','parrilla','bar'] },
    delivery:       { label: 'Delivery',            giros: ['restaurante','farmacia','abarrotes'] },
    medico:         { label: 'Médico',              giros: ['medico','dental','veterinaria','farmacia'] },
    veterinaria:    { label: 'Veterinaria',         giros: ['veterinaria'] },
    educacion:      { label: 'Educación',           giros: ['escuela','academia','kinder'] },
    hotel:          { label: 'Hotelería',           giros: ['hotel','airbnb'] },
    gym:            { label: 'Gimnasio',            giros: ['gym','club'] },
    eventos:        { label: 'Eventos',             giros: ['salones','concierto','teatro','bar'] },
    automotriz:     { label: 'Automotriz',          giros: ['taller','refaccionaria'] },
    marketplace:    { label: 'Marketplace',         giros: ['ecommerce'] },
    ecommerce:      { label: 'E-commerce',          giros: ['ecommerce'] },
    multimoneda:    { label: 'Multi-moneda',        giros: ['hotel','turismo','export'] },
    multisucursal:  { label: 'Multi-sucursal',      giros: ['*'] },
    multilang:      { label: 'Multi-idioma',        giros: ['hotel','turismo'] },
    promociones:    { label: 'Promociones',         giros: ['*'] },
    fiados:         { label: 'Fiados',              giros: ['abarrotes','carniceria','papeleria','tortilleria'] },
    documentos:     { label: 'Documentos adjuntos', giros: ['*'] },
    permisos:       { label: 'Permisos granulares', giros: ['*'] },
    biometria:      { label: 'Biometría',           giros: ['gym','medico','retail'] },
    auth:           { label: 'Acceso/Auth',         giros: ['*'] },
    crm:            { label: 'CRM',                 giros: ['*'] },
    rh:             { label: 'RRHH',                giros: ['*'] },
    pagos:          { label: 'Métodos de pago',     giros: ['*'] },
    integracion:    { label: 'Integraciones',       giros: ['*'] },
    hardware:       { label: 'Hardware',            giros: ['*'] },
    ia:             { label: 'IA / Auto',           giros: ['*'] },
    garantias:      { label: 'Garantías',           giros: ['electrodom','celulares','muebleria'] },
    devoluciones:   { label: 'Devoluciones',        giros: ['*'] },
    balanza:        { label: 'Báscula',             giros: ['carniceria','abarrotes','tortilleria','frutas'] },
    dimensiones:    { label: 'Dimensiones físicas', giros: ['ferreteria','muebleria'] },
    proveedores:    { label: 'Proveedores avanz.',  giros: ['*'] },
    logistica:      { label: 'Logística',           giros: ['*'] }
  },

  // Modales con sus secciones y campos.
  // current_fields = campos que YA existen en el HTML, NO regenerar.
  modals: {

    // ─────────────────────────────────────────────────────────
    // MODAL 1 — PRODUCTOS
    // ─────────────────────────────────────────────────────────
    productos: {
      label: 'Producto / Servicio',
      current_fields_keep: ['nombre','precio_venta','costo','stock','stock_minimo','categoria'],
      sections: {
        '1.1 Identidad completa': [
          f('sku', 'SKU', 'text', 'base'),
          f('sku_corto', 'SKU corto', 'text', 'base'),
          f('codigo_barras', 'Código de barras', 'text', 'base'),
          f('codigo_barras_secundario', 'Código de barras secundario', 'text', 'base', ['retail']),
          f('codigo_alterno_proveedor', 'Código del proveedor', 'text', 'proveedores'),
          f('qr_propio', 'QR propio', 'text', 'base', ['restaurante','delivery']),
          f('descripcion_corta', 'Descripción corta', 'textarea', 'base'),
          f('descripcion_larga', 'Descripción larga (web)', 'textarea', 'ecommerce', ['retail','ecommerce']),
          f('nombre_corto_ticket', 'Nombre corto en ticket', 'text', 'base'),
          f('nombre_para_cocina', 'Nombre para cocina', 'text', 'cocina', ['restaurante']),
          f('marca', 'Marca', 'text', 'base', ['retail']),
          f('sub_marca', 'Sub-marca', 'text', 'base', ['retail']),
          f('fabricante', 'Fabricante', 'text', 'base', ['retail','farmacia']),
          f('pais_origen', 'País de origen', 'text', 'base', ['retail']),
          f('denominacion_comercial', 'Denominación comercial', 'text', 'base', ['farmacia','abarrotes']),
          f('sub_categoria', 'Sub-categoría', 'text', 'base'),
          f('familia_producto', 'Familia de producto', 'text', 'base', ['retail']),
          f('etiquetas_libres', 'Etiquetas (separadas por coma)', 'text', 'base'),
          f('clave_interna', 'Clave interna', 'text', 'base'),
          f('codigo_producto_servicio_sat', 'Clave producto/servicio SAT', 'text', 'fiscal'),
          f('clave_unidad_medida_sat', 'Clave unidad de medida SAT', 'text', 'fiscal')
        ],
        '1.2 Multimedia': [
          f('imagen_principal', 'Imagen principal', 'file', 'base'),
          f('imagenes_galeria', 'Galería de imágenes (max 10)', 'file_multi', 'base'),
          f('video_demo_url', 'URL video demo', 'url', 'ecommerce', ['retail','ecommerce']),
          f('modelo_3d_url', 'URL modelo 3D', 'url', 'ecommerce', ['muebleria','electrodom']),
          f('archivo_pdf_ficha_tecnica', 'PDF ficha técnica', 'file', 'documentos', ['farmacia','ferreteria','refacciones']),
          f('archivo_pdf_certificado', 'PDF certificado', 'file', 'documentos', ['farmacia','industrial']),
          f('archivo_pdf_garantia', 'PDF garantía', 'file', 'documentos', ['electrodom','celulares'])
        ],
        '1.3 Precios completo': [
          f('precio_mayoreo_1', 'Precio mayoreo 1 (desde N und)', 'number', 'precios', ['abarrotes','ferreteria','carniceria']),
          f('precio_mayoreo_2', 'Precio mayoreo 2', 'number', 'precios', ['abarrotes','ferreteria']),
          f('precio_mayoreo_3', 'Precio mayoreo 3', 'number', 'precios', ['abarrotes','ferreteria']),
          f('precio_menudeo', 'Precio menudeo', 'number', 'precios', ['abarrotes','ferreteria']),
          f('precio_vip', 'Precio VIP', 'number', 'lealtad'),
          f('precio_empleado', 'Precio empleado', 'number', 'precios'),
          f('precio_promocion', 'Precio promoción', 'number', 'promociones'),
          f('precio_anterior_tachado', 'Precio anterior (tachado)', 'number', 'promociones', ['retail','ecommerce']),
          f('descuento_porcentaje', 'Descuento %', 'number', 'promociones'),
          f('descuento_monto_fijo', 'Descuento monto fijo', 'number', 'promociones'),
          f('descuento_valido_desde', 'Desde', 'date', 'promociones'),
          f('descuento_valido_hasta', 'Hasta', 'date', 'promociones'),
          f('margen_porcentaje', 'Margen % (auto)', 'number', 'precios', ['*'], { readonly: true }),
          f('margen_pesos', 'Margen $ (auto)', 'number', 'precios', ['*'], { readonly: true }),
          f('moneda_principal', 'Moneda', 'select', 'multimoneda', ['hotel','turismo'], { options: ['MXN','USD','EUR','CAD'] }),
          f('precio_en_dolares', 'Precio en USD', 'number', 'multimoneda', ['hotel','turismo']),
          f('precio_en_euros', 'Precio en EUR', 'number', 'multimoneda', ['hotel','turismo']),
          f('precio_dinamico_horario', 'Precio dinámico por horario', 'switch', 'precios', ['restaurante','bar','parking']),
          f('precio_dinamico_demanda', 'Precio dinámico por demanda', 'switch', 'precios', ['hotel','salones'])
        ],
        '1.4 Comisiones': [
          f('comision_vendedor_porcentaje', 'Comisión vendedor %', 'number', 'comisiones', ['barberia','estetica','gym','retail']),
          f('comision_vendedor_monto_fijo', 'Comisión vendedor $', 'number', 'comisiones', ['barberia','estetica','gym','retail']),
          f('comision_solo_efectivo', 'Comisión sólo en efectivo', 'switch', 'comisiones', ['barberia','estetica']),
          f('comision_solo_si_full_price', 'Comisión sólo a precio completo', 'switch', 'comisiones', ['retail']),
          f('cashback_cliente_porcentaje', 'Cashback cliente %', 'number', 'lealtad'),
          f('puntos_lealtad_otorgados', 'Puntos lealtad', 'number', 'lealtad'),
          f('multiplicador_puntos', 'Multiplicador puntos', 'number', 'lealtad')
        ],
        '1.5 Inventario': [
          f('stock_maximo', 'Stock máximo', 'number', 'inventario'),
          f('stock_reservado', 'Stock reservado', 'number', 'inventario', ['retail','ecommerce'], { readonly: true }),
          f('unidad_base', 'Unidad base', 'text', 'inventario'),
          f('unidad_compra', 'Unidad de compra', 'text', 'inventario'),
          f('unidad_venta', 'Unidad de venta', 'text', 'inventario'),
          f('factor_conversion', 'Factor caja → pieza', 'number', 'inventario', ['abarrotes','farmacia']),
          f('caja_contiene_unidades', 'Caja contiene N unidades', 'number', 'inventario', ['abarrotes','farmacia']),
          f('rotacion_promedio_dias', 'Rotación días (auto)', 'number', 'inventario', ['*'], { readonly: true }),
          f('abc_clasificacion', 'Clasificación ABC', 'select', 'inventario', ['*'], { options: ['A','B','C'], readonly: true }),
          f('ubicacion_fisica_almacen', 'Ubicación almacén', 'text', 'inventario', ['retail','abarrotes']),
          f('pasillo', 'Pasillo', 'text', 'inventario', ['abarrotes','super']),
          f('anaquel', 'Anaquel', 'text', 'inventario', ['abarrotes','super']),
          f('peso_kg', 'Peso (kg)', 'number', 'balanza', ['carniceria','abarrotes','tortilleria']),
          f('dim_alto_cm', 'Alto (cm)', 'number', 'dimensiones', ['ferreteria','muebleria']),
          f('dim_ancho_cm', 'Ancho (cm)', 'number', 'dimensiones', ['ferreteria','muebleria']),
          f('dim_largo_cm', 'Largo (cm)', 'number', 'dimensiones', ['ferreteria','muebleria'])
        ],
        '1.6 Serialización': [
          f('requiere_numero_serie', 'Requiere n° serie', 'switch', 'serializacion', ['celulares','electronica']),
          f('generacion_serial_auto', 'Generar serial auto', 'switch', 'serializacion', ['celulares']),
          f('imei_obligatorio', 'IMEI obligatorio', 'switch', 'serializacion', ['celulares']),
          f('estado_serial', 'Estado', 'select', 'serializacion', ['celulares'], { options: ['nuevo','usado','reparado','reacondicionado'] })
        ],
        '1.7 Lotes y caducidad': [
          f('maneja_lotes', 'Maneja lotes', 'switch', 'lotes', ['farmacia','abarrotes','carniceria']),
          f('numero_lote', 'Número de lote', 'text', 'lotes', ['farmacia','abarrotes','carniceria']),
          f('fecha_fabricacion', 'Fecha de fabricación', 'date', 'lotes', ['farmacia','abarrotes']),
          f('fecha_caducidad', 'Fecha de caducidad', 'date', 'caducidad', ['farmacia','abarrotes','carniceria','restaurante']),
          f('alerta_30_dias', 'Alertar 30 días antes', 'switch', 'caducidad', ['farmacia','abarrotes']),
          f('alerta_60_dias', 'Alertar 60 días antes', 'switch', 'caducidad', ['farmacia','abarrotes']),
          f('politica_fefo', 'FEFO (first-expire-first-out)', 'switch', 'caducidad', ['farmacia','abarrotes']),
          f('descuento_auto_proximo_vencer', 'Descuento auto al vencer', 'switch', 'caducidad', ['farmacia','abarrotes'])
        ],
        '1.8 Trazabilidad': [
          f('origen_lote', 'Origen del lote', 'text', 'trazabilidad', ['farmacia','industrial','carniceria']),
          f('proveedor_lote', 'Proveedor del lote', 'text', 'trazabilidad', ['farmacia','industrial','carniceria']),
          f('fecha_recepcion_lote', 'Fecha recepción', 'date', 'trazabilidad', ['farmacia','industrial']),
          f('ruta_logistica', 'Ruta logística', 'text', 'trazabilidad', ['industrial','export']),
          f('certificados_adjuntos', 'Certificados adjuntos', 'file_multi', 'trazabilidad', ['farmacia','industrial'])
        ],
        '1.9 Compliance / Certificaciones': [
          f('norma_oficial_mexicana', 'NOM aplicable', 'text', 'compliance', ['farmacia','industrial','alimentos']),
          f('iso_certificacion', 'ISO certificación', 'text', 'compliance', ['industrial','export']),
          f('fda_certificado', 'FDA certificado', 'text', 'compliance', ['export']),
          f('cofepris_registro', 'COFEPRIS registro', 'text', 'compliance', ['farmacia']),
          f('clave_cofepris', 'Clave COFEPRIS', 'text', 'compliance', ['farmacia']),
          f('controlado_grupo', 'Grupo controlado', 'select', 'compliance', ['farmacia'], { options: ['I','II','III','IV','V','no_controlado'] }),
          f('requiere_receta_medica', 'Requiere receta', 'switch', 'compliance', ['farmacia']),
          f('receta_retenida', 'Receta retenida', 'switch', 'compliance', ['farmacia']),
          f('receta_resurtible', 'Receta resurtible', 'switch', 'compliance', ['farmacia']),
          f('edad_minima_compra', 'Edad mínima compra', 'number', 'compliance', ['farmacia','bar','tabaqueria']),
          f('verificacion_id_obligatoria', 'Verificar ID obligatorio', 'switch', 'compliance', ['farmacia','bar'])
        ],
        '1.10 Variantes': [
          f('tiene_variantes', 'Tiene variantes', 'switch', 'variantes', ['ropa','zapateria','abarrotes']),
          f('tipo_variante', 'Tipo de variante', 'select', 'variantes', ['ropa','zapateria','abarrotes'], { options: ['talla','color','sabor','material','presentacion'] }),
          f('tallas_disponibles', 'Tallas disponibles (CSV)', 'text', 'variantes', ['ropa','zapateria']),
          f('colores_disponibles', 'Colores disponibles (CSV)', 'text', 'variantes', ['ropa','zapateria','pintura']),
          f('materiales_disponibles', 'Materiales (CSV)', 'text', 'variantes', ['ropa','muebleria']),
          f('sabores_disponibles', 'Sabores (CSV)', 'text', 'variantes', ['restaurante','helado']),
          f('presentaciones', 'Presentaciones (250ml,500ml,1L)', 'text', 'variantes', ['abarrotes','farmacia'])
        ],
        '1.11 Recetas y componentes': [
          f('es_producto_con_receta', 'Tiene receta', 'switch', 'recetas', ['restaurante','panaderia','bar']),
          f('ingredientes', 'Ingredientes (sub-tabla)', 'subtable', 'recetas', ['restaurante','panaderia']),
          f('merma_porcentaje', 'Merma %', 'number', 'recetas', ['restaurante','carniceria']),
          f('factor_rendimiento', 'Factor rendimiento', 'number', 'recetas', ['restaurante','panaderia']),
          f('permite_modificadores', 'Permite modificadores', 'switch', 'recetas', ['restaurante']),
          f('modificadores_disponibles', 'Modificadores disponibles', 'text', 'recetas', ['restaurante']),
          f('ingredientes_removibles_permitidos', 'Ingredientes removibles', 'text', 'recetas', ['restaurante','taqueria']),
          f('extras_con_costo', 'Extras con costo', 'text', 'recetas', ['restaurante','taqueria'])
        ],
        '1.12 Kits y combos': [
          f('es_kit_o_combo', 'Es kit/combo', 'switch', 'combos', ['restaurante','papeleria','retail']),
          f('productos_incluidos', 'Productos incluidos', 'subtable', 'combos', ['restaurante','papeleria']),
          f('combo_obligatorio_todos', 'Combo: todos obligatorios', 'switch', 'combos', ['restaurante']),
          f('combo_opcional_elegir_n', 'Combo: elegir N opcionales', 'number', 'combos', ['restaurante']),
          f('descuento_kit_calculado', 'Descuento kit %', 'number', 'combos', ['*'], { readonly: true })
        ],
        '1.13 Servicios': [
          f('es_servicio', 'Es servicio', 'switch', 'servicios', ['barberia','medico','taller','spa']),
          f('duracion_minutos', 'Duración (min)', 'number', 'servicios', ['barberia','medico','taller','spa']),
          f('requiere_cita', 'Requiere cita', 'switch', 'agenda', ['barberia','medico','spa']),
          f('empleado_asignable', 'Empleado asignable', 'switch', 'servicios', ['barberia','estetica','spa']),
          f('recursos_requeridos', 'Recursos requeridos', 'text', 'servicios', ['spa','medico','salones']),
          f('tiempo_descanso_entre_servicios', 'Descanso entre servicios (min)', 'number', 'servicios', ['spa','medico'])
        ],
        '1.14 Suscripciones': [
          f('es_suscripcion', 'Es suscripción', 'switch', 'suscripciones', ['gym','saas','membresia']),
          f('periodicidad', 'Periodicidad', 'select', 'suscripciones', ['gym','saas'], { options: ['mensual','trimestral','semestral','anual'] }),
          f('periodo_dias_prueba_gratis', 'Días de prueba gratis', 'number', 'suscripciones', ['gym','saas']),
          f('renovacion_automatica', 'Renovación automática', 'switch', 'suscripciones', ['gym','saas']),
          f('penalizacion_cancelacion', 'Penalización por cancelar', 'number', 'suscripciones', ['gym']),
          f('beneficios_incluidos', 'Beneficios incluidos', 'textarea', 'suscripciones', ['gym','club'])
        ],
        '1.15 Rentas': [
          f('es_rentable', 'Es rentable', 'switch', 'rentas', ['rentas','hotel','coworking','salones']),
          f('precio_por_hora', 'Precio/hora', 'number', 'rentas', ['rentas','parking','coworking']),
          f('precio_por_dia', 'Precio/día', 'number', 'rentas', ['rentas','hotel','trajes']),
          f('precio_por_semana', 'Precio/semana', 'number', 'rentas', ['rentas']),
          f('precio_por_mes', 'Precio/mes', 'number', 'rentas', ['rentas']),
          f('deposito_garantia', 'Depósito garantía', 'number', 'rentas', ['rentas']),
          f('check_in_hora', 'Hora check-in', 'time', 'rentas', ['hotel','airbnb','rentas']),
          f('check_out_hora', 'Hora check-out', 'time', 'rentas', ['hotel','airbnb','rentas'])
        ],
        '1.16 Restaurante / Cocina': [
          f('se_manda_a_cocina', 'Se manda a cocina', 'switch', 'cocina', ['restaurante','taqueria']),
          f('area_preparacion', 'Área preparación', 'select', 'cocina', ['restaurante'], { options: ['bar','cocina','postres','parrilla','fríos'] }),
          f('impresora_cocina_destino', 'Impresora cocina', 'select', 'cocina', ['restaurante']),
          f('tiempo_coccion_estimado_minutos', 'Tiempo cocción (min)', 'number', 'cocina', ['restaurante']),
          f('nivel_picante', 'Nivel picante', 'select', 'cocina', ['restaurante','taqueria'], { options: ['sin','poco','medio','muy_picante'] }),
          f('termino_carne_default', 'Término carne', 'select', 'cocina', ['restaurante','parrilla'], { options: ['rojo','medio','tres_cuartos','bien_cocido'] }),
          f('incluye_guarnicion', 'Incluye guarnición', 'switch', 'cocina', ['restaurante'])
        ],
        '1.17 Delivery': [
          f('disponible_delivery', 'Disponible delivery', 'switch', 'delivery', ['restaurante','farmacia','abarrotes']),
          f('tiempo_preparacion_delivery', 'Tiempo prep delivery (min)', 'number', 'delivery', ['restaurante','farmacia']),
          f('tiempo_entrega_promedio', 'Tiempo entrega prom (min)', 'number', 'delivery', ['restaurante','farmacia']),
          f('costo_envio_zona', 'Costo envío base', 'number', 'delivery', ['restaurante','farmacia']),
          f('comision_repartidor', 'Comisión repartidor', 'number', 'delivery', ['restaurante']),
          f('requiere_temperatura_controlada', 'Temperatura controlada', 'switch', 'delivery', ['farmacia','helados']),
          f('disponible_uber_eats', 'Uber Eats', 'switch', 'delivery', ['restaurante']),
          f('disponible_didi_food', 'DiDi Food', 'switch', 'delivery', ['restaurante']),
          f('disponible_rappi', 'Rappi', 'switch', 'delivery', ['restaurante']),
          f('sku_uber_eats', 'SKU Uber Eats', 'text', 'delivery', ['restaurante']),
          f('sku_didi_food', 'SKU DiDi Food', 'text', 'delivery', ['restaurante']),
          f('sku_rappi', 'SKU Rappi', 'text', 'delivery', ['restaurante'])
        ],
        '1.18 Médico / Farmacéutico': [
          f('requiere_expediente_paciente', 'Requiere expediente', 'switch', 'medico', ['medico','dental','veterinaria']),
          f('dosis_default', 'Dosis default', 'text', 'medico', ['farmacia','medico']),
          f('unidad_dosis', 'Unidad dosis', 'select', 'medico', ['farmacia','medico'], { options: ['mg','ml','UI','gotas','tabletas'] }),
          f('frecuencia_default', 'Frecuencia', 'text', 'medico', ['farmacia','medico']),
          f('duracion_tratamiento_dias', 'Duración (días)', 'number', 'medico', ['farmacia','medico']),
          f('via_administracion', 'Vía administración', 'select', 'medico', ['farmacia','medico'], { options: ['oral','IV','IM','tópica','rectal','sublingual','inhalada'] }),
          f('contraindicaciones_texto', 'Contraindicaciones', 'textarea', 'medico', ['farmacia']),
          f('efectos_secundarios_texto', 'Efectos secundarios', 'textarea', 'medico', ['farmacia']),
          f('embarazo_categoria', 'Categoría embarazo', 'select', 'medico', ['farmacia'], { options: ['A','B','C','D','X','N/A'] })
        ],
        '1.19 Automotriz': [
          f('es_refaccion', 'Es refacción', 'switch', 'automotriz', ['taller','refaccionaria']),
          f('vin_obligatorio', 'VIN obligatorio', 'switch', 'automotriz', ['taller','refaccionaria']),
          f('marca_vehiculo_compatible', 'Marca compatible', 'text', 'automotriz', ['refaccionaria']),
          f('modelo_vehiculo_compatible', 'Modelo compatible', 'text', 'automotriz', ['refaccionaria']),
          f('ano_desde', 'Año desde', 'number', 'automotriz', ['refaccionaria']),
          f('ano_hasta', 'Año hasta', 'number', 'automotriz', ['refaccionaria']),
          f('motor_compatible', 'Motor compatible', 'text', 'automotriz', ['refaccionaria']),
          f('posicion', 'Posición', 'select', 'automotriz', ['refaccionaria'], { options: ['delantera','trasera','izquierda','derecha','N/A'] }),
          f('es_mano_obra', 'Es mano de obra', 'switch', 'automotriz', ['taller']),
          f('horas_estimadas_servicio', 'Horas estimadas', 'number', 'automotriz', ['taller']),
          f('oem_original', 'OEM original', 'switch', 'automotriz', ['refaccionaria'])
        ],
        '1.20 Hotelería': [
          f('tipo_habitacion', 'Tipo habitación', 'select', 'hotel', ['hotel','airbnb'], { options: ['single','doble','triple','suite','presidencial'] }),
          f('ocupacion_maxima', 'Ocupación máxima', 'number', 'hotel', ['hotel']),
          f('camas_cantidad', 'N° camas', 'number', 'hotel', ['hotel']),
          f('desayuno_incluido', 'Desayuno incluido', 'switch', 'hotel', ['hotel']),
          f('wifi_incluido', 'WiFi incluido', 'switch', 'hotel', ['hotel']),
          f('estacionamiento_incluido', 'Estacionamiento incluido', 'switch', 'hotel', ['hotel']),
          f('precio_temporada_alta', 'Precio temporada alta', 'number', 'hotel', ['hotel']),
          f('precio_temporada_baja', 'Precio temporada baja', 'number', 'hotel', ['hotel']),
          f('politica_cancelacion', 'Política cancelación', 'textarea', 'hotel', ['hotel'])
        ],
        '1.21 Educación': [
          f('es_curso', 'Es curso', 'switch', 'educacion', ['escuela','academia']),
          f('duracion_total_horas', 'Duración (horas)', 'number', 'educacion', ['academia']),
          f('duracion_semanas', 'Duración (semanas)', 'number', 'educacion', ['academia','escuela']),
          f('cupos_maximos', 'Cupos máximos', 'number', 'educacion', ['academia']),
          f('nivel_dificultad', 'Nivel', 'select', 'educacion', ['academia'], { options: ['principiante','intermedio','avanzado'] }),
          f('certificado_emite', 'Emite certificado', 'switch', 'educacion', ['academia']),
          f('calificacion_minima_aprobacion', 'Calificación mínima', 'number', 'educacion', ['academia','escuela'])
        ],
        '1.22 Gimnasio': [
          f('es_membresia', 'Es membresía', 'switch', 'gym', ['gym','club']),
          f('acceso_qr', 'Acceso por QR', 'switch', 'gym', ['gym']),
          f('acceso_biometrico', 'Acceso biométrico', 'switch', 'gym', ['gym']),
          f('clases_incluidas', 'Clases incluidas', 'text', 'gym', ['gym']),
          f('limite_accesos_por_mes', 'Límite accesos/mes', 'number', 'gym', ['gym']),
          f('horario_acceso', 'Horario acceso', 'text', 'gym', ['gym']),
          f('incluye_invitado', 'Incluye invitado', 'switch', 'gym', ['gym']),
          f('nivel_membresia', 'Nivel membresía', 'select', 'gym', ['gym'], { options: ['básico','plus','premium','VIP'] })
        ],
        '1.23 Eventos': [
          f('es_evento', 'Es evento', 'switch', 'eventos', ['salones','concierto']),
          f('fecha_evento', 'Fecha evento', 'datetime', 'eventos', ['concierto','salones']),
          f('capacidad_maxima', 'Capacidad', 'number', 'eventos', ['concierto','salones']),
          f('asientos_numerados', 'Asientos numerados', 'switch', 'eventos', ['concierto','teatro']),
          f('qr_ticket_emite', 'Emite QR ticket', 'switch', 'eventos', ['concierto']),
          f('tickets_disponibles', 'Tickets disponibles', 'number', 'eventos', ['concierto'])
        ],
        '1.24 Impuestos / SAT': [
          f('iva_porcentaje', 'IVA %', 'select', 'fiscal', ['*'], { options: ['0','8','16','exento'] }),
          f('iva_retencion', 'Retención IVA %', 'number', 'fiscal', ['profesionales']),
          f('ieps_porcentaje', 'IEPS %', 'number', 'fiscal', ['abarrotes','bar','tabaqueria']),
          f('ish_porcentaje', 'ISH %', 'number', 'fiscal', ['hotel']),
          f('clave_cfdi_uso', 'Uso CFDI', 'text', 'fiscal'),
          f('exento_impuestos', 'Exento impuestos', 'switch', 'fiscal', ['medicamentos','libros']),
          f('factura_obligatoria', 'Factura obligatoria', 'switch', 'fiscal', ['corporativo']),
          f('incluye_iva_en_precio', 'IVA incluido en precio', 'switch', 'fiscal')
        ],
        '1.25 Marketplace / E-commerce': [
          f('publicado_en_amazon', 'Publicado Amazon', 'switch', 'marketplace', ['ecommerce']),
          f('sku_amazon', 'SKU Amazon', 'text', 'marketplace', ['ecommerce']),
          f('asin_amazon', 'ASIN', 'text', 'marketplace', ['ecommerce']),
          f('publicado_mercadolibre', 'Publicado ML', 'switch', 'marketplace', ['ecommerce']),
          f('sku_mercadolibre', 'SKU MercadoLibre', 'text', 'marketplace', ['ecommerce']),
          f('publicado_shopify', 'Publicado Shopify', 'switch', 'marketplace', ['ecommerce']),
          f('sku_shopify', 'SKU Shopify', 'text', 'marketplace', ['ecommerce']),
          f('sincronizar_stock_auto', 'Sync stock auto', 'switch', 'marketplace', ['ecommerce']),
          f('sincronizar_precio_auto', 'Sync precio auto', 'switch', 'marketplace', ['ecommerce']),
          f('seo_titulo', 'SEO título', 'text', 'ecommerce', ['ecommerce']),
          f('seo_descripcion', 'SEO descripción', 'textarea', 'ecommerce', ['ecommerce']),
          f('seo_keywords', 'SEO keywords', 'text', 'ecommerce', ['ecommerce']),
          f('slug_url_amigable', 'Slug URL', 'text', 'ecommerce', ['ecommerce'])
        ],
        '1.26 IA / Automatización': [
          f('ia_descripcion_generada', 'IA: descripción generada', 'textarea', 'ia', ['*'], { readonly: true }),
          f('ia_categoria_auto', 'IA: categoría auto', 'text', 'ia', ['*'], { readonly: true }),
          f('ia_codigo_sat_sugerido', 'IA: SAT sugerido', 'text', 'ia', ['*'], { readonly: true }),
          f('ia_precio_competencia', 'IA: precio competencia', 'number', 'ia', ['*'], { readonly: true }),
          f('ia_precio_sugerido', 'IA: precio sugerido', 'number', 'ia', ['*'], { readonly: true }),
          f('ia_prediccion_demanda', 'IA: predicción demanda', 'text', 'ia', ['*'], { readonly: true }),
          f('ia_reorden_automatico', 'IA: reorden auto', 'switch', 'ia')
        ],
        '1.27 Permisos': [
          f('permitir_descuento', 'Permitir descuento', 'switch', 'permisos'),
          f('descuento_maximo_porcentaje', 'Descuento máx %', 'number', 'permisos'),
          f('requiere_pin_descuento', 'PIN para descuento', 'switch', 'permisos'),
          f('permitir_cancelar_venta', 'Permitir cancelar venta', 'switch', 'permisos'),
          f('quien_puede_editar_precio', 'Quién puede editar precio', 'select', 'permisos', ['*'], { options: ['cualquiera','vendedor','gerente','admin'] }),
          f('quien_puede_ver_costo', 'Quién ve el costo', 'select', 'permisos', ['*'], { options: ['cualquiera','vendedor','gerente','admin'] }),
          f('requiere_doble_autorizacion', 'Doble autorización', 'switch', 'permisos', ['farmacia','bar'])
        ],
        '1.28 Garantías': [
          f('tiene_garantia', 'Tiene garantía', 'switch', 'garantias', ['electrodom','celulares','muebleria']),
          f('duracion_garantia_meses', 'Duración garantía (meses)', 'number', 'garantias', ['electrodom','celulares']),
          f('tipo_garantia', 'Tipo garantía', 'select', 'garantias', ['electrodom','celulares'], { options: ['fabricante','tienda','mixta'] }),
          f('garantia_extendida_disponible', 'Garantía extendida disponible', 'switch', 'garantias', ['electrodom','celulares']),
          f('costo_garantia_extendida', 'Costo garantía extendida', 'number', 'garantias', ['electrodom','celulares'])
        ],
        '1.29 Devoluciones': [
          f('permite_devolucion', 'Permite devolución', 'switch', 'devoluciones'),
          f('dias_para_devolver', 'Días para devolver', 'number', 'devoluciones'),
          f('politica_devolucion_texto', 'Política devolución', 'textarea', 'devoluciones'),
          f('reingreso_inventario_auto', 'Reingreso inventario auto', 'switch', 'devoluciones'),
          f('evidencia_foto_obligatoria', 'Evidencia foto obligatoria', 'switch', 'devoluciones')
        ]
      }
    }
  }
};

// Continúa más abajo con modales 2-6...
const modal2_5_6 = require('./build-modal-fields-catalog-part2.js');
Object.assign(catalog.modals, modal2_5_6);

// Stats finales
let totalFields = 0;
for (const modalKey of Object.keys(catalog.modals)) {
  const sections = catalog.modals[modalKey].sections || {};
  for (const sk of Object.keys(sections)) {
    totalFields += sections[sk].length;
  }
}
catalog._meta.total_fields = totalFields;
catalog._meta.total_modals = Object.keys(catalog.modals).length;
catalog._meta.total_modules = Object.keys(catalog.modules).length;

const outPath = path.join(__dirname, '..', '..', 'public', 'data', 'modal-fields-catalog.json');
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Total fields: ${totalFields}`);
console.log(`Total modals: ${catalog._meta.total_modals}`);
console.log(`Total modules: ${catalog._meta.total_modules}`);
