// Parte 2: modales 2-6. Importado por build-modal-fields-catalog.js
const f = (name, label, type, module, giros, extra) => Object.assign(
  { name, label, type: type || 'text', module: module || 'base', giros: giros || ['*'] },
  extra || {}
);

module.exports = {

  // ─────────────────────────────────────────────────────────
  // MODAL 2 — PROVEEDORES
  // ─────────────────────────────────────────────────────────
  proveedores: {
    label: 'Proveedor',
    current_fields_keep: ['nombre','telefono','direccion'],
    sections: {
      '2.1 Identidad ampliada': [
        f('nombre_comercial', 'Nombre comercial', 'text', 'base'),
        f('razon_social_fiscal', 'Razón social', 'text', 'fiscal'),
        f('rfc', 'RFC', 'text', 'fiscal'),
        f('contacto_principal_nombre', 'Contacto principal', 'text', 'base'),
        f('contacto_principal_puesto', 'Puesto contacto', 'text', 'base'),
        f('contacto_telefono_directo', 'Tel directo contacto', 'tel', 'base'),
        f('contacto_whatsapp', 'WhatsApp', 'tel', 'base'),
        f('contacto_email', 'Email', 'email', 'base'),
        f('contacto_secundario_nombre', 'Contacto secundario', 'text', 'base'),
        f('contacto_secundario_telefono', 'Tel contacto secundario', 'tel', 'base'),
        f('sitio_web', 'Sitio web', 'url', 'base'),
        f('direccion_fiscal', 'Dirección fiscal', 'textarea', 'fiscal'),
        f('direccion_almacen', 'Dirección almacén', 'textarea', 'logistica'),
        f('ciudad', 'Ciudad', 'text', 'base'),
        f('estado', 'Estado', 'text', 'base'),
        f('codigo_postal', 'CP', 'text', 'base'),
        f('pais_origen', 'País', 'text', 'base', ['export']),
        f('giro_proveedor', 'Giro del proveedor', 'text', 'base'),
        f('nivel_proveedor', 'Nivel', 'select', 'base', ['*'], { options: ['preferente','normal','backup','en_revision'] })
      ],
      '2.2 Comercial y crédito': [
        f('categoria_principal_proveedor', 'Categoría principal', 'text', 'proveedores'),
        f('sub_categorias_proveedor', 'Sub-categorías', 'text', 'proveedores'),
        f('productos_que_vende', 'Productos que vende', 'subtable', 'proveedores'),
        f('volumen_minimo_compra', 'Volumen mínimo compra', 'number', 'proveedores'),
        f('volumen_minimo_descuento', 'Volumen para descuento', 'number', 'proveedores'),
        f('descuento_por_volumen_escalado', 'Descuento por volumen escalado', 'textarea', 'proveedores'),
        f('descuento_pronto_pago_porcentaje', 'Descuento pronto pago %', 'number', 'proveedores'),
        f('dias_para_pronto_pago', 'Días para pronto pago', 'number', 'proveedores'),
        f('tipo_terminos_pago', 'Términos pago', 'select', 'proveedores', ['*'], { options: ['contado','7_dias','15_dias','30_dias','60_dias','90_dias','consignacion'] }),
        f('dias_credito_autorizados', 'Días crédito autorizados', 'number', 'proveedores'),
        f('limite_credito_pesos', 'Límite crédito $', 'number', 'proveedores'),
        f('credito_usado_actual', 'Crédito usado actual', 'number', 'proveedores', ['*'], { readonly: true }),
        f('credito_disponible', 'Crédito disponible', 'number', 'proveedores', ['*'], { readonly: true }),
        f('tiene_consignacion', 'Tiene consignación', 'switch', 'proveedores', ['retail']),
        f('permite_devolucion_caducados', 'Acepta devolución caducados', 'switch', 'proveedores', ['farmacia','abarrotes']),
        f('permite_canjes', 'Acepta canjes', 'switch', 'proveedores', ['retail']),
        f('metodo_pago_preferido', 'Método pago preferido', 'select', 'proveedores', ['*'], { options: ['efectivo','transferencia_spei','cheque','tarjeta_credito','tarjeta_debito','oxxo'] }),
        f('cuenta_bancaria', 'Cuenta bancaria', 'text', 'fiscal'),
        f('banco', 'Banco', 'text', 'fiscal'),
        f('clabe_interbancaria', 'CLABE', 'text', 'fiscal'),
        f('codigo_swift', 'SWIFT (internacional)', 'text', 'fiscal', ['export'])
      ],
      '2.3 Logística y surtido': [
        f('frecuencia_surtido', 'Frecuencia surtido', 'select', 'proveedores', ['*'], { options: ['diario','2_veces_semana','semanal','quincenal','mensual','a_pedido','bajo_demanda'] }),
        f('dia_semana_surtido_preferido', 'Día semana surtido', 'select', 'proveedores', ['*'], { options: ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'] }),
        f('horario_recepcion_pedidos', 'Horario recepción pedidos', 'text', 'proveedores'),
        f('hora_cierre_pedido', 'Hora cierre pedido', 'time', 'proveedores'),
        f('tiempo_entrega_horas_pedido', 'Tiempo entrega (horas)', 'number', 'proveedores'),
        f('tiempo_entrega_dias_pedido', 'Tiempo entrega (días)', 'number', 'proveedores'),
        f('flete_incluido_desde_monto', 'Flete gratis desde', 'number', 'proveedores'),
        f('costo_flete_estandar', 'Costo flete estándar', 'number', 'proveedores'),
        f('zona_cobertura_envio', 'Zona cobertura', 'text', 'proveedores'),
        f('recoge_mercancia_propio', 'Recoge mercancía propia', 'switch', 'proveedores'),
        f('recolectar_devoluciones', 'Recolecta devoluciones', 'switch', 'proveedores'),
        f('requiere_orden_compra_formal', 'Requiere OC formal', 'switch', 'proveedores'),
        f('plataforma_pedidos_url', 'URL plataforma pedidos', 'url', 'proveedores'),
        f('api_integracion_disponible', 'API integración', 'switch', 'proveedores', ['retail'])
      ],
      '2.4 Historial y evaluación': [
        f('fecha_alta_proveedor', 'Fecha alta', 'date', 'proveedores', ['*'], { readonly: true }),
        f('fecha_primer_compra', 'Primera compra', 'date', 'proveedores', ['*'], { readonly: true }),
        f('fecha_ultima_compra', 'Última compra', 'date', 'proveedores', ['*'], { readonly: true }),
        f('ultima_compra_monto', 'Última compra $', 'number', 'proveedores', ['*'], { readonly: true }),
        f('total_comprado_30_dias', 'Total 30d', 'number', 'proveedores', ['*'], { readonly: true }),
        f('total_comprado_90_dias', 'Total 90d', 'number', 'proveedores', ['*'], { readonly: true }),
        f('total_comprado_anual', 'Total anual', 'number', 'proveedores', ['*'], { readonly: true }),
        f('total_comprado_historico', 'Total histórico', 'number', 'proveedores', ['*'], { readonly: true }),
        f('ticket_promedio_compra', 'Ticket promedio', 'number', 'proveedores', ['*'], { readonly: true }),
        f('numero_pedidos_historico', 'N° pedidos', 'number', 'proveedores', ['*'], { readonly: true }),
        f('porcentaje_pedidos_completos', '% pedidos completos', 'number', 'proveedores', ['*'], { readonly: true }),
        f('porcentaje_pedidos_a_tiempo', '% a tiempo', 'number', 'proveedores', ['*'], { readonly: true }),
        f('porcentaje_devoluciones', '% devoluciones', 'number', 'proveedores', ['*'], { readonly: true }),
        f('evaluacion_calidad_estrellas', 'Calidad (1-5)', 'rating', 'proveedores'),
        f('evaluacion_precio_estrellas', 'Precio (1-5)', 'rating', 'proveedores'),
        f('evaluacion_servicio_estrellas', 'Servicio (1-5)', 'rating', 'proveedores'),
        f('evaluacion_global_estrellas', 'Global', 'rating', 'proveedores', ['*'], { readonly: true })
      ],
      '2.5 Documentos': [
        f('constancia_situacion_fiscal_pdf', 'Constancia situación fiscal', 'file', 'documentos'),
        f('cedula_rfc_pdf', 'Cédula RFC', 'file', 'documentos'),
        f('acta_constitutiva_pdf', 'Acta constitutiva', 'file', 'documentos'),
        f('identificacion_oficial_pdf', 'ID oficial', 'file', 'documentos'),
        f('comprobante_domicilio_pdf', 'Comprobante domicilio', 'file', 'documentos'),
        f('contrato_marco_pdf', 'Contrato marco', 'file', 'documentos'),
        f('nda_firmado_pdf', 'NDA firmado', 'file', 'documentos'),
        f('licencia_sanitaria_pdf', 'Licencia sanitaria', 'file', 'documentos', ['farmacia','alimentos']),
        f('certificado_iso_pdf', 'Certificado ISO', 'file', 'documentos', ['industrial','export']),
        f('licencia_alcohol_pdf', 'Licencia alcohol', 'file', 'documentos', ['bar','abarrotes']),
        f('cofepris_pdf', 'COFEPRIS', 'file', 'documentos', ['farmacia']),
        f('facturas_pendientes_lista', 'Facturas pendientes', 'subtable', 'documentos', ['*'], { readonly: true })
      ],
      '2.6 Notas y alertas': [
        f('notas_internas', 'Notas internas', 'textarea', 'base'),
        f('alertas_visibles_al_comprar', 'Alertas al comprar', 'textarea', 'base'),
        f('nivel_riesgo', 'Nivel riesgo', 'select', 'base', ['*'], { options: ['bajo','medio','alto'] }),
        f('proveedor_alternativo', 'Proveedor backup', 'text', 'proveedores')
      ]
    }
  },

  // ─────────────────────────────────────────────────────────
  // MODAL 3 — CLIENTES
  // ─────────────────────────────────────────────────────────
  clientes: {
    label: 'Cliente',
    current_fields_keep: ['nombre','telefono'],
    sections: {
      '3.1 Identidad': [
        f('apellido_paterno', 'Apellido paterno', 'text', 'base'),
        f('apellido_materno', 'Apellido materno', 'text', 'base'),
        f('nombre_corto_ticket', 'Nombre corto ticket', 'text', 'base'),
        f('fecha_nacimiento', 'Fecha nacimiento', 'date', 'base'),
        f('edad', 'Edad', 'number', 'base', ['*'], { readonly: true }),
        f('genero', 'Género', 'select', 'base', ['*'], { options: ['masculino','femenino','no_binario','prefiere_no_decir'] }),
        f('ocupacion', 'Ocupación', 'text', 'base', ['medico','banca']),
        f('estado_civil', 'Estado civil', 'select', 'base', ['medico','banca'], { options: ['soltero','casado','divorciado','viudo','union_libre'] }),
        f('foto_cliente', 'Foto', 'file', 'base'),
        f('huella_registrada', 'Huella registrada', 'switch', 'biometria', ['gym','medico'])
      ],
      '3.2 Contacto': [
        f('telefono_whatsapp', 'WhatsApp', 'tel', 'base'),
        f('telefono_casa', 'Tel casa', 'tel', 'base', ['medico']),
        f('telefono_trabajo', 'Tel trabajo', 'tel', 'base', ['medico']),
        f('email_principal', 'Email', 'email', 'base'),
        f('email_facturacion', 'Email facturación', 'email', 'fiscal'),
        f('direccion_completa', 'Dirección', 'textarea', 'base'),
        f('calle_numero', 'Calle y número', 'text', 'base'),
        f('colonia', 'Colonia', 'text', 'base'),
        f('ciudad', 'Ciudad', 'text', 'base'),
        f('estado_republica', 'Estado', 'text', 'base'),
        f('codigo_postal', 'CP', 'text', 'base'),
        f('referencias_ubicacion', 'Referencias ubicación', 'textarea', 'delivery', ['restaurante','farmacia']),
        f('gps_coordenadas', 'GPS', 'text', 'delivery', ['restaurante','farmacia']),
        f('zona_reparto_asignada', 'Zona reparto', 'text', 'delivery', ['restaurante','farmacia'])
      ],
      '3.3 Comercial': [
        f('tipo_cliente', 'Tipo cliente', 'select', 'lealtad', ['*'], { options: ['regular','VIP','mayorista','frecuente','corporativo','empleado'] }),
        f('descuento_aplicable_porcentaje', 'Descuento aplicable %', 'number', 'lealtad'),
        f('descuento_aplicable_monto', 'Descuento aplicable $', 'number', 'lealtad'),
        f('acepta_publicidad', 'Acepta publicidad', 'switch', 'crm'),
        f('fuente_origen', 'Fuente origen', 'select', 'crm', ['*'], { options: ['referido','facebook_ads','instagram','google','walk_in','whatsapp','flyer'] }),
        f('referido_por_cliente', 'Referido por', 'text', 'crm'),
        f('asesor_ventas_asignado', 'Asesor asignado', 'text', 'crm'),
        f('canal_preferido_contacto', 'Canal preferido', 'select', 'crm', ['*'], { options: ['whatsapp','email','sms','llamada','presencial'] })
      ],
      '3.4 Crédito y fiados': [
        f('tiene_fiado_autorizado', 'Tiene fiado autorizado', 'switch', 'fiados', ['abarrotes','carniceria','papeleria','tortilleria']),
        f('limite_credito_pesos', 'Límite crédito $', 'number', 'fiados', ['abarrotes','carniceria']),
        f('credito_usado_actual', 'Crédito usado', 'number', 'fiados', ['abarrotes','carniceria'], { readonly: true }),
        f('credito_disponible', 'Disponible', 'number', 'fiados', ['abarrotes','carniceria'], { readonly: true }),
        f('dias_credito', 'Días crédito', 'number', 'fiados', ['abarrotes','carniceria']),
        f('fecha_corte_fiado', 'Fecha corte fiado', 'text', 'fiados', ['abarrotes','carniceria']),
        f('dia_pago_acordado', 'Día pago acordado', 'text', 'fiados', ['abarrotes','carniceria']),
        f('penalizacion_atraso', 'Penalización atraso', 'number', 'fiados', ['abarrotes','carniceria']),
        f('recordatorio_whatsapp_auto', 'Recordatorio WA auto', 'switch', 'fiados', ['abarrotes','carniceria']),
        f('saldo_deudor_total', 'Saldo deudor total', 'number', 'fiados', ['abarrotes','carniceria'], { readonly: true })
      ],
      '3.5 Historial': [
        f('fecha_alta', 'Fecha alta', 'date', 'base', ['*'], { readonly: true }),
        f('fecha_primer_compra', 'Primera compra', 'date', 'base', ['*'], { readonly: true }),
        f('fecha_ultima_compra', 'Última compra', 'date', 'base', ['*'], { readonly: true }),
        f('dias_desde_ultima_compra', 'Días sin comprar', 'number', 'base', ['*'], { readonly: true }),
        f('frecuencia_visitas_dias', 'Frecuencia visitas (días)', 'number', 'base', ['*'], { readonly: true }),
        f('total_compras_acumulado_pesos', 'Total compras $', 'number', 'base', ['*'], { readonly: true }),
        f('numero_compras_total', 'N° compras', 'number', 'base', ['*'], { readonly: true }),
        f('ticket_promedio_pesos', 'Ticket promedio', 'number', 'base', ['*'], { readonly: true }),
        f('ticket_mas_alto', 'Ticket más alto', 'number', 'base', ['*'], { readonly: true }),
        f('producto_mas_comprado', 'Producto fav', 'text', 'base', ['*'], { readonly: true }),
        f('categoria_favorita', 'Categoría fav', 'text', 'base', ['*'], { readonly: true }),
        f('estado_cliente', 'Estado cliente', 'select', 'crm', ['*'], { options: ['activo','inactivo_30d','inactivo_60d','inactivo_90d','en_riesgo_churn'], readonly: true })
      ],
      '3.6 Fiscal': [
        f('rfc_personal_o_moral', 'RFC', 'text', 'fiscal'),
        f('razon_social_fiscal', 'Razón social', 'text', 'fiscal'),
        f('direccion_fiscal', 'Dirección fiscal', 'textarea', 'fiscal'),
        f('uso_cfdi_preferido', 'Uso CFDI', 'text', 'fiscal'),
        f('regimen_fiscal', 'Régimen fiscal', 'text', 'fiscal'),
        f('correo_recepcion_factura', 'Email factura', 'email', 'fiscal'),
        f('requiere_factura_siempre', 'Requiere factura siempre', 'switch', 'fiscal', ['corporativo'])
      ],
      '3.7 Lealtad': [
        f('puntos_acumulados_total', 'Puntos acumulados', 'number', 'lealtad', ['*'], { readonly: true }),
        f('puntos_disponibles_redimir', 'Puntos disponibles', 'number', 'lealtad', ['*'], { readonly: true }),
        f('nivel_lealtad', 'Nivel lealtad', 'select', 'lealtad', ['*'], { options: ['bronce','plata','oro','platino','diamante'] }),
        f('multiplicador_puntos', 'Multiplicador', 'number', 'lealtad'),
        f('cashback_acumulado_pesos', 'Cashback acumulado $', 'number', 'lealtad', ['*'], { readonly: true }),
        f('cashback_disponible', 'Cashback disponible', 'number', 'lealtad', ['*'], { readonly: true }),
        f('codigo_referido_personal', 'Código referido', 'text', 'lealtad'),
        f('referidos_traidos_count', 'Referidos traídos', 'number', 'lealtad', ['*'], { readonly: true })
      ],
      '3.8 Comunicación': [
        f('prefiere_whatsapp', 'Prefiere WhatsApp', 'switch', 'crm'),
        f('prefiere_email', 'Prefiere email', 'switch', 'crm'),
        f('prefiere_sms', 'Prefiere SMS', 'switch', 'crm'),
        f('acepta_promociones_email', 'Acepta promos email', 'switch', 'crm'),
        f('acepta_promociones_whatsapp', 'Acepta promos WA', 'switch', 'crm'),
        f('acepta_recordatorios_citas', 'Acepta recordatorios citas', 'switch', 'crm', ['barberia','medico','spa']),
        f('ultimo_contacto_fecha', 'Último contacto', 'date', 'crm', ['*'], { readonly: true }),
        f('satisfaccion_ultima_nps', 'NPS última', 'number', 'crm', ['*'], { readonly: true })
      ],
      '3.9 Médico/Dental': [
        f('expediente_medico_id', 'Expediente ID', 'text', 'medico', ['medico','dental']),
        f('historial_clinico', 'Historial clínico', 'textarea', 'medico', ['medico','dental']),
        f('alergias_conocidas', 'Alergias', 'textarea', 'medico', ['medico','dental','veterinaria']),
        f('padecimientos_cronicos', 'Padecimientos crónicos', 'textarea', 'medico', ['medico']),
        f('medicamentos_actuales', 'Medicamentos actuales', 'textarea', 'medico', ['medico','farmacia']),
        f('tipo_sangre', 'Tipo sangre', 'select', 'medico', ['medico','dental'], { options: ['A+','A-','B+','B-','AB+','AB-','O+','O-','desconocido'] }),
        f('contacto_emergencia_nombre', 'Contacto emergencia', 'text', 'medico', ['medico','dental','gym']),
        f('contacto_emergencia_telefono', 'Tel emergencia', 'tel', 'medico', ['medico','dental','gym']),
        f('seguro_medico', 'Seguro médico', 'text', 'medico', ['medico','dental']),
        f('poliza_seguro', 'Póliza', 'text', 'medico', ['medico','dental'])
      ],
      '3.10 Veterinaria': [
        f('mascotas_sub_tabla', 'Mascotas (sub-tabla)', 'subtable', 'veterinaria', ['veterinaria'])
      ],
      '3.11 Hotel': [
        f('pasaporte_numero', 'Pasaporte', 'text', 'hotel', ['hotel']),
        f('ine_numero', 'INE', 'text', 'hotel', ['hotel']),
        f('nacionalidad', 'Nacionalidad', 'text', 'hotel', ['hotel']),
        f('preferencia_habitacion', 'Preferencia habitación', 'text', 'hotel', ['hotel']),
        f('restricciones_alimentarias', 'Restricciones alimentarias', 'text', 'hotel', ['hotel','restaurante'])
      ],
      '3.12 Educación': [
        f('nivel_escolar_actual', 'Nivel escolar', 'text', 'educacion', ['escuela','academia']),
        f('padre_tutor_nombre', 'Padre/Tutor', 'text', 'educacion', ['escuela','kinder']),
        f('padre_tutor_telefono', 'Tel padre/tutor', 'tel', 'educacion', ['escuela','kinder']),
        f('calificaciones_promedio', 'Promedio', 'number', 'educacion', ['escuela']),
        f('materias_inscritas', 'Materias inscritas', 'text', 'educacion', ['academia'])
      ],
      '3.13 Gym': [
        f('peso_actual_kg', 'Peso (kg)', 'number', 'gym', ['gym']),
        f('estatura_cm', 'Estatura (cm)', 'number', 'gym', ['gym']),
        f('objetivo_fitness', 'Objetivo', 'text', 'gym', ['gym']),
        f('entrenador_asignado', 'Entrenador', 'text', 'gym', ['gym']),
        f('clases_inscritas', 'Clases inscritas', 'text', 'gym', ['gym']),
        f('horario_preferido_gym', 'Horario preferido', 'text', 'gym', ['gym'])
      ]
    }
  },

  // ─────────────────────────────────────────────────────────
  // MODAL 4 — EMPLEADOS
  // ─────────────────────────────────────────────────────────
  empleados: {
    label: 'Empleado',
    current_fields_keep: ['nombre','telefono','email','rol'],
    sections: {
      '4.1 Identidad': [
        f('apellido_paterno', 'Apellido paterno', 'text', 'rh'),
        f('apellido_materno', 'Apellido materno', 'text', 'rh'),
        f('nombre_corto_ticket', 'Nombre corto ticket', 'text', 'rh'),
        f('nick_o_apodo', 'Nick/apodo', 'text', 'rh'),
        f('foto_perfil', 'Foto', 'file', 'rh'),
        f('fecha_nacimiento', 'Fecha nacimiento', 'date', 'rh'),
        f('genero', 'Género', 'select', 'rh', ['*'], { options: ['masculino','femenino','no_binario'] }),
        f('estado_civil', 'Estado civil', 'text', 'rh'),
        f('nacionalidad', 'Nacionalidad', 'text', 'rh'),
        f('curp', 'CURP', 'text', 'rh'),
        f('rfc', 'RFC', 'text', 'rh'),
        f('nss_imss', 'NSS', 'text', 'rh')
      ],
      '4.2 Contacto': [
        f('whatsapp', 'WhatsApp', 'tel', 'rh'),
        f('email_personal', 'Email personal', 'email', 'rh'),
        f('direccion_completa', 'Dirección', 'textarea', 'rh'),
        f('codigo_postal', 'CP', 'text', 'rh'),
        f('ciudad', 'Ciudad', 'text', 'rh'),
        f('contacto_emergencia_nombre', 'Contacto emergencia', 'text', 'rh'),
        f('contacto_emergencia_parentesco', 'Parentesco', 'text', 'rh'),
        f('contacto_emergencia_telefono', 'Tel emergencia', 'tel', 'rh')
      ],
      '4.3 Laboral': [
        f('puesto', 'Puesto', 'text', 'rh'),
        f('departamento', 'Departamento', 'text', 'rh'),
        f('sucursal_asignada', 'Sucursal asignada', 'text', 'multisucursal'),
        f('fecha_ingreso', 'Fecha ingreso', 'date', 'rh'),
        f('fecha_alta_imss', 'Fecha alta IMSS', 'date', 'rh'),
        f('antigüedad_meses', 'Antigüedad (meses)', 'number', 'rh', ['*'], { readonly: true }),
        f('tipo_contrato', 'Tipo contrato', 'select', 'rh', ['*'], { options: ['tiempo_indefinido','tiempo_determinado','obra_o_servicio','prueba','capacitacion','honorarios'] }),
        f('fecha_termino_contrato', 'Fecha término', 'date', 'rh'),
        f('hora_entrada', 'Hora entrada', 'time', 'rh'),
        f('hora_salida', 'Hora salida', 'time', 'rh'),
        f('dias_laborales', 'Días laborales', 'text', 'rh'),
        f('turnos_rotativos', 'Turnos rotativos', 'switch', 'rh', ['restaurante','gas'])
      ],
      '4.4 Compensación': [
        f('salario_base_mensual', 'Salario base mensual', 'number', 'rh'),
        f('salario_base_diario', 'Salario base diario', 'number', 'rh', ['*'], { readonly: true }),
        f('periodicidad_pago', 'Periodicidad pago', 'select', 'rh', ['*'], { options: ['semanal','quincenal','mensual'] }),
        f('metodo_pago_nomina', 'Método pago nómina', 'select', 'rh', ['*'], { options: ['transferencia','efectivo','cheque'] }),
        f('banco_nomina', 'Banco nómina', 'text', 'rh'),
        f('clabe_nomina', 'CLABE nómina', 'text', 'rh'),
        f('tiene_comisiones', 'Tiene comisiones', 'switch', 'comisiones'),
        f('esquema_comision_tipo', 'Esquema comisión', 'select', 'comisiones', ['barberia','estetica','retail'], { options: ['porcentaje_sobre_venta','monto_fijo_por_venta','mixto_escalonado','por_objetivo_cumplido'] }),
        f('porcentaje_comision', 'Comisión %', 'number', 'comisiones', ['barberia','estetica','retail']),
        f('monto_fijo_comision', 'Comisión $', 'number', 'comisiones', ['barberia','estetica','retail']),
        f('comision_solo_efectivo', 'Comisión sólo efectivo', 'switch', 'comisiones', ['barberia','estetica']),
        f('bono_cumpleaños', 'Bono cumpleaños', 'number', 'rh'),
        f('bono_antigüedad', 'Bono antigüedad', 'number', 'rh'),
        f('bono_productividad', 'Bono productividad', 'number', 'rh'),
        f('dias_vacaciones_disponibles', 'Vacaciones disponibles', 'number', 'rh'),
        f('dias_vacaciones_tomados_año', 'Vacaciones tomadas', 'number', 'rh', ['*'], { readonly: true })
      ],
      '4.5 Permisos del sistema': [
        f('rol_principal', 'Rol principal', 'select', 'permisos', ['*'], { options: ['administrador','gerente_sucursal','cajero','mesero','cocinero','barbero','estilista','despachador','vendedor','repartidor','bodeguero'] }),
        f('puede_dar_descuento', 'Puede dar descuento', 'switch', 'permisos'),
        f('descuento_maximo_permitido_porcentaje', 'Descuento máx %', 'number', 'permisos'),
        f('puede_cancelar_venta', 'Puede cancelar venta', 'switch', 'permisos'),
        f('puede_ver_costos', 'Ve costos', 'switch', 'permisos'),
        f('puede_ver_margenes', 'Ve márgenes', 'switch', 'permisos'),
        f('puede_modificar_inventario', 'Modifica inventario', 'switch', 'permisos'),
        f('puede_dar_alta_productos', 'Alta productos', 'switch', 'permisos'),
        f('puede_dar_alta_clientes', 'Alta clientes', 'switch', 'permisos'),
        f('puede_facturar', 'Puede facturar', 'switch', 'permisos'),
        f('puede_corte_caja', 'Corte de caja', 'switch', 'permisos'),
        f('puede_apertura_caja', 'Apertura caja', 'switch', 'permisos'),
        f('puede_ver_reportes', 'Ve reportes', 'switch', 'permisos'),
        f('puede_exportar_datos', 'Exporta datos', 'switch', 'permisos'),
        f('puede_administrar_empleados', 'Administra empleados', 'switch', 'permisos')
      ],
      '4.6 Acceso': [
        f('usuario_login', 'Usuario login', 'text', 'auth'),
        f('pin_personal', 'PIN personal', 'password', 'auth'),
        f('debe_cambiar_password', 'Debe cambiar password', 'switch', 'auth'),
        f('2fa_habilitado', '2FA habilitado', 'switch', 'auth'),
        f('huella_dactilar_registrada', 'Huella registrada', 'switch', 'biometria', ['gym','medico']),
        f('horarios_acceso_permitidos', 'Horarios acceso', 'text', 'auth'),
        f('ultimo_login_fecha', 'Último login', 'datetime', 'auth', ['*'], { readonly: true }),
        f('ultimo_login_ip', 'IP último login', 'text', 'auth', ['*'], { readonly: true }),
        f('bloqueado', 'Bloqueado', 'switch', 'auth')
      ],
      '4.7 Desempeño': [
        f('ventas_dia_actual', 'Ventas hoy', 'number', 'rh', ['*'], { readonly: true }),
        f('ventas_semana_actual', 'Ventas semana', 'number', 'rh', ['*'], { readonly: true }),
        f('ventas_mes_actual', 'Ventas mes', 'number', 'rh', ['*'], { readonly: true }),
        f('meta_ventas_mes', 'Meta mes', 'number', 'rh'),
        f('porcentaje_cumplimiento_meta', '% cumplimiento meta', 'number', 'rh', ['*'], { readonly: true }),
        f('comisiones_acumuladas_periodo', 'Comisiones periodo', 'number', 'comisiones', ['*'], { readonly: true }),
        f('ticket_promedio_vendedor', 'Ticket promedio', 'number', 'rh', ['*'], { readonly: true }),
        f('clientes_atendidos_dia', 'Clientes hoy', 'number', 'rh', ['*'], { readonly: true }),
        f('tiempo_promedio_servicio_minutos', 'Tiempo prom servicio', 'number', 'rh', ['barberia','medico','spa'], { readonly: true }),
        f('asistencia_porcentaje', 'Asistencia %', 'number', 'rh', ['*'], { readonly: true }),
        f('puntualidad_porcentaje', 'Puntualidad %', 'number', 'rh', ['*'], { readonly: true }),
        f('faltas_injustificadas', 'Faltas', 'number', 'rh', ['*'], { readonly: true }),
        f('retardos_count', 'Retardos', 'number', 'rh', ['*'], { readonly: true }),
        f('horas_extra_mes', 'Horas extra', 'number', 'rh', ['*'], { readonly: true })
      ],
      '4.8 Documentos': [
        f('ine_foto_frontal', 'INE frontal', 'file', 'documentos'),
        f('ine_foto_reverso', 'INE reverso', 'file', 'documentos'),
        f('comprobante_domicilio', 'Comprobante domicilio', 'file', 'documentos'),
        f('acta_nacimiento', 'Acta nacimiento', 'file', 'documentos'),
        f('curp_oficial', 'CURP oficial', 'file', 'documentos'),
        f('contrato_laboral_firmado', 'Contrato firmado', 'file', 'documentos'),
        f('nda_firmado', 'NDA', 'file', 'documentos'),
        f('reglamento_interno_firmado', 'Reglamento interno', 'file', 'documentos'),
        f('examen_medico', 'Examen médico', 'file', 'documentos'),
        f('licencia_manejo', 'Licencia manejo', 'file', 'documentos', ['repartidor','chofer'])
      ]
    }
  },

  // ─────────────────────────────────────────────────────────
  // MODAL 5 — VENTAS / CARRITO
  // ─────────────────────────────────────────────────────────
  ventas: {
    label: 'Venta / Carrito',
    current_fields_keep: ['cliente','productos','total','metodo_pago'],
    sections: {
      '5.1 Identificación venta': [
        f('folio_venta_consecutivo', 'Folio', 'text', 'base', ['*'], { readonly: true }),
        f('serie_venta', 'Serie', 'text', 'base'),
        f('hora_venta', 'Hora', 'time', 'base', ['*'], { readonly: true }),
        f('sucursal_id', 'Sucursal', 'select', 'multisucursal'),
        f('caja_id', 'Caja', 'text', 'base'),
        f('turno_id', 'Turno', 'text', 'rh'),
        f('vendedor_asignado', 'Vendedor', 'text', 'comisiones'),
        f('mesero_asignado', 'Mesero', 'text', 'cocina', ['restaurante']),
        f('mesa_numero', 'Mesa N°', 'text', 'cocina', ['restaurante']),
        f('comanda_numero', 'Comanda N°', 'text', 'cocina', ['restaurante'])
      ],
      '5.2 Cliente': [
        f('cliente_es_anonimo', 'Cliente anónimo', 'switch', 'base'),
        f('cliente_telefono_capturado', 'Teléfono', 'tel', 'base'),
        f('cliente_email_capturado', 'Email', 'email', 'base'),
        f('cliente_rfc_capturado', 'RFC', 'text', 'fiscal'),
        f('es_nuevo_cliente', 'Cliente nuevo', 'switch', 'base'),
        f('canal_origen_venta', 'Canal', 'select', 'crm', ['*'], { options: ['presencial','whatsapp','llamada','delivery_propio','uber_eats','didi_food','rappi','ecommerce_propio'] })
      ],
      '5.4 Totales y pagos': [
        f('subtotal_sin_impuestos', 'Subtotal', 'number', 'base', ['*'], { readonly: true }),
        f('iva_total', 'IVA', 'number', 'fiscal', ['*'], { readonly: true }),
        f('ieps_total', 'IEPS', 'number', 'fiscal', ['abarrotes','bar']),
        f('ish_total', 'ISH', 'number', 'fiscal', ['hotel']),
        f('descuento_general', 'Descuento general', 'number', 'base'),
        f('descuento_general_motivo', 'Motivo descuento', 'text', 'base'),
        f('propina_sugerida', 'Propina sugerida', 'number', 'base', ['restaurante']),
        f('propina_efectiva', 'Propina recibida', 'number', 'comisiones', ['restaurante','barberia']),
        f('total_a_pagar', 'Total a pagar', 'number', 'base', ['*'], { readonly: true }),
        f('metodo_pago_principal', 'Método pago', 'select', 'base', ['*'], { options: ['efectivo','tarjeta_credito','tarjeta_debito','transferencia_spei','cheque','vales_despensa','oxxo','codi','mercado_pago','paypal','clip'] }),
        f('es_pago_mixto', 'Pago mixto', 'switch', 'base'),
        f('monto_recibido_efectivo', 'Recibido efectivo', 'number', 'base'),
        f('cambio_entregado', 'Cambio', 'number', 'base', ['*'], { readonly: true }),
        f('referencia_terminal', 'Referencia terminal', 'text', 'base'),
        f('autorizacion_bancaria', 'Autorización', 'text', 'base'),
        f('ultimos_4_tarjeta', 'Últimos 4 tarjeta', 'text', 'base')
      ],
      '5.5 Facturación': [
        f('requiere_factura', 'Requiere factura', 'switch', 'fiscal'),
        f('uuid_factura', 'UUID', 'text', 'fiscal', ['*'], { readonly: true }),
        f('folio_fiscal', 'Folio fiscal', 'text', 'fiscal'),
        f('estado_factura', 'Estado factura', 'select', 'fiscal', ['*'], { options: ['pendiente','emitida','cancelada','rechazada'], readonly: true }),
        f('xml_url', 'XML', 'url', 'fiscal', ['*'], { readonly: true }),
        f('pdf_url', 'PDF', 'url', 'fiscal', ['*'], { readonly: true }),
        f('metodo_pago_factura', 'MP factura', 'text', 'fiscal'),
        f('forma_pago_factura', 'FP factura', 'text', 'fiscal'),
        f('uso_cfdi', 'Uso CFDI', 'text', 'fiscal')
      ],
      '5.6 Estado': [
        f('estado_venta', 'Estado', 'select', 'base', ['*'], { options: ['cotizacion','reservada','pendiente_pago','parcialmente_pagada','pagada','facturada','entregada','cancelada','devuelta_parcial','devuelta_total'] }),
        f('es_fiado', 'Es fiado', 'switch', 'fiados', ['abarrotes','carniceria','papeleria']),
        f('fecha_promesa_pago_fiado', 'Promesa pago fiado', 'date', 'fiados', ['abarrotes','carniceria']),
        f('es_cotizacion', 'Es cotización', 'switch', 'base'),
        f('vigencia_cotizacion_dias', 'Vigencia cotización (días)', 'number', 'base'),
        f('es_pedido_anticipo', 'Pedido con anticipo', 'switch', 'base'),
        f('porcentaje_anticipo_pagado', '% anticipo pagado', 'number', 'base'),
        f('notas_internas_venta', 'Notas internas', 'textarea', 'base'),
        f('firma_cliente_recibida', 'Firma cliente recibida', 'switch', 'base'),
        f('ticket_impreso', 'Ticket impreso', 'switch', 'base', ['*'], { readonly: true }),
        f('ticket_enviado_email', 'Ticket enviado email', 'switch', 'base', ['*'], { readonly: true }),
        f('ticket_enviado_whatsapp', 'Ticket enviado WA', 'switch', 'base', ['*'], { readonly: true })
      ],
      '5.7 Delivery': [
        f('es_para_delivery', 'Es delivery', 'switch', 'delivery', ['restaurante','farmacia','abarrotes']),
        f('direccion_entrega', 'Dirección entrega', 'textarea', 'delivery', ['restaurante','farmacia']),
        f('zona_reparto', 'Zona reparto', 'text', 'delivery', ['restaurante','farmacia']),
        f('costo_envio', 'Costo envío', 'number', 'delivery', ['restaurante','farmacia']),
        f('repartidor_asignado', 'Repartidor', 'text', 'delivery', ['restaurante']),
        f('hora_promesa_entrega', 'Hora promesa', 'datetime', 'delivery', ['restaurante','farmacia']),
        f('hora_real_entrega', 'Hora real entrega', 'datetime', 'delivery', ['restaurante','farmacia'], { readonly: true }),
        f('tracking_url', 'Tracking URL', 'url', 'delivery', ['restaurante','farmacia'], { readonly: true }),
        f('firma_recibido', 'Firma recibido', 'switch', 'delivery', ['restaurante','farmacia']),
        f('foto_evidencia_entrega', 'Foto evidencia', 'file', 'delivery', ['restaurante','farmacia'])
      ]
    }
  },

  // ─────────────────────────────────────────────────────────
  // MODAL 6 — CONFIGURACIÓN
  // ─────────────────────────────────────────────────────────
  configuracion: {
    label: 'Configuración del negocio',
    current_fields_keep: ['nombre_negocio','giro','rfc'],
    sections: {
      '6.1 Datos negocio': [
        f('nombre_comercial', 'Nombre comercial', 'text', 'base'),
        f('razon_social', 'Razón social', 'text', 'fiscal'),
        f('rfc_negocio', 'RFC', 'text', 'fiscal'),
        f('regimen_fiscal', 'Régimen fiscal', 'text', 'fiscal'),
        f('giros_secundarios', 'Giros secundarios', 'text', 'base'),
        f('logo_principal', 'Logo principal', 'file', 'base'),
        f('logo_ticket', 'Logo ticket', 'file', 'base'),
        f('favicon', 'Favicon', 'file', 'base'),
        f('colores_marca_primario', 'Color primario', 'color', 'base'),
        f('colores_marca_secundario', 'Color secundario', 'color', 'base'),
        f('descripcion_negocio', 'Descripción', 'textarea', 'base'),
        f('horario_apertura', 'Apertura', 'time', 'base'),
        f('horario_cierre', 'Cierre', 'time', 'base'),
        f('dias_laborales', 'Días laborales', 'text', 'base'),
        f('zona_horaria', 'Zona horaria', 'text', 'base'),
        f('moneda_principal', 'Moneda', 'select', 'multimoneda', ['*'], { options: ['MXN','USD','EUR'] }),
        f('idioma_principal', 'Idioma', 'select', 'multilang', ['*'], { options: ['es-MX','en-US','fr-FR'] })
      ],
      '6.2 Ubicación y contacto': [
        f('direccion_principal', 'Dirección', 'textarea', 'base'),
        f('gps_coordenadas', 'GPS', 'text', 'base'),
        f('telefono_negocio', 'Tel negocio', 'tel', 'base'),
        f('whatsapp_business', 'WhatsApp Business', 'tel', 'base'),
        f('email_negocio', 'Email', 'email', 'base'),
        f('sitio_web', 'Sitio web', 'url', 'base'),
        f('facebook_url', 'Facebook', 'url', 'base'),
        f('instagram_url', 'Instagram', 'url', 'base'),
        f('tiktok_url', 'TikTok', 'url', 'base'),
        f('google_my_business_url', 'Google My Business', 'url', 'base')
      ],
      '6.3 Sucursales': [
        f('es_multi_sucursal', 'Multi-sucursal', 'switch', 'multisucursal'),
        f('sucursal_matriz_id', 'Sucursal matriz', 'text', 'multisucursal'),
        f('sucursales_sub_tabla', 'Sucursales', 'subtable', 'multisucursal')
      ],
      '6.4 Módulos activos': [
        f('modulos_activos_lista', 'Módulos activos', 'multi_module_switches', 'base'),
        f('modulos_inactivos_lista', 'Módulos inactivos', 'multi_module_switches', 'base')
      ],
      '6.5 Terminologías por giro': [
        f('terminologias_overrides', 'Terminologías custom', 'terminology_grid', 'base')
      ],
      '6.6 Fiscal e impuestos': [
        f('iva_default_porcentaje', 'IVA default %', 'select', 'fiscal', ['*'], { options: ['0','8','16','exento'] }),
        f('ieps_aplica', 'IEPS aplica', 'switch', 'fiscal', ['abarrotes','bar']),
        f('ieps_porcentaje_default', 'IEPS %', 'number', 'fiscal', ['abarrotes','bar']),
        f('ish_aplica', 'ISH aplica', 'switch', 'fiscal', ['hotel']),
        f('es_responsable_factura_electronica', 'Factura electrónica', 'switch', 'fiscal'),
        f('proveedor_pac', 'Proveedor PAC', 'select', 'fiscal', ['*'], { options: ['Facturama','SW','Solución Factible','Otro'] }),
        f('serie_facturas', 'Serie facturas', 'text', 'fiscal'),
        f('folio_inicial', 'Folio inicial', 'number', 'fiscal'),
        f('clave_uso_cfdi_default', 'Uso CFDI default', 'text', 'fiscal')
      ],
      '6.7 Métodos pago': [
        f('acepta_efectivo', 'Efectivo', 'switch', 'pagos'),
        f('acepta_tarjeta_credito', 'Tarjeta crédito', 'switch', 'pagos'),
        f('acepta_tarjeta_debito', 'Tarjeta débito', 'switch', 'pagos'),
        f('acepta_transferencia', 'Transferencia', 'switch', 'pagos'),
        f('acepta_codi', 'CoDi', 'switch', 'pagos'),
        f('acepta_mercado_pago', 'Mercado Pago', 'switch', 'pagos'),
        f('acepta_clip', 'Clip', 'switch', 'pagos'),
        f('acepta_oxxo', 'OXXO', 'switch', 'pagos'),
        f('acepta_vales_despensa', 'Vales despensa', 'switch', 'pagos'),
        f('acepta_vales_gasolina', 'Vales gasolina', 'switch', 'pagos', ['gas']),
        f('acepta_cheque', 'Cheque', 'switch', 'pagos', ['corporativo']),
        f('acepta_dolares', 'Dólares', 'switch', 'pagos', ['hotel','turismo']),
        f('acepta_paypal', 'PayPal', 'switch', 'pagos', ['ecommerce'])
      ],
      '6.8 Integraciones': [
        f('whatsapp_business_api', 'WhatsApp Business API', 'text', 'integracion'),
        f('facebook_pixel_id', 'Facebook Pixel ID', 'text', 'integracion'),
        f('google_analytics_id', 'Google Analytics ID', 'text', 'integracion'),
        f('stripe_publishable_key', 'Stripe public key', 'text', 'integracion'),
        f('mercado_pago_access_token', 'Mercado Pago token', 'password', 'integracion'),
        f('uber_eats_merchant_id', 'Uber Eats merchant', 'text', 'integracion', ['restaurante']),
        f('didi_food_merchant_id', 'DiDi Food merchant', 'text', 'integracion', ['restaurante']),
        f('rappi_merchant_id', 'Rappi merchant', 'text', 'integracion', ['restaurante']),
        f('zapier_webhook', 'Zapier webhook', 'url', 'integracion'),
        f('make_webhook', 'Make webhook', 'url', 'integracion'),
        f('telegram_bot_token', 'Telegram bot', 'password', 'integracion')
      ],
      '6.9 Hardware': [
        f('impresora_ticket_principal', 'Impresora ticket principal', 'text', 'hardware'),
        f('impresora_cocina_1', 'Impresora cocina 1', 'text', 'hardware', ['restaurante']),
        f('impresora_cocina_2', 'Impresora cocina 2', 'text', 'hardware', ['restaurante']),
        f('impresora_etiquetas', 'Impresora etiquetas', 'text', 'hardware', ['abarrotes','farmacia']),
        f('caja_dinero_modelo', 'Caja dinero modelo', 'text', 'hardware'),
        f('basculas_conectadas', 'Básculas', 'text', 'hardware', ['carniceria','abarrotes']),
        f('lectores_codigo_barras', 'Lectores código barras', 'text', 'hardware'),
        f('lectores_huella', 'Lectores huella', 'text', 'hardware', ['gym','medico']),
        f('pantallas_cocina_kds', 'Pantallas KDS', 'text', 'hardware', ['restaurante'])
      ]
    }
  }
};
