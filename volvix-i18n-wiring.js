/**
 * volvix-i18n-wiring.js
 * Sistema i18n multi-idioma para Volvix POS
 * Idiomas: Español (es), English (en), Português (pt), Français (fr), Deutsch (de), Italiano (it), 日本語 (ja)
 * Agent-15 - Ronda 7 Fibonacci - Expandido R17
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // TRADUCCIONES (100+ keys por idioma)
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  // TRADUCCIONES (code-split: es eager, otros 6 lazy via fetch)
  // ═══════════════════════════════════════════════════════════
  const TRANSLATIONS = {
    es: {
      "login.title": "Iniciar sesión",
      "login.subtitle": "Bienvenido a Volvix POS",
      "login.email": "Correo electrónico",
      "login.password": "Contraseña",
      "login.submit": "Entrar",
      "login.forgot": "¿Olvidaste tu contraseña?",
      "login.register": "Crear cuenta",
      "login.remember": "Recordarme",
      "login.error.invalid": "Credenciales inválidas",
      "login.error.empty": "Completa todos los campos",
      "login.loading": "Iniciando sesión...",
      "login.logout": "Cerrar sesión",
      "nav.dashboard": "Panel",
      "nav.pos": "Punto de venta",
      "nav.products": "Productos",
      "nav.inventory": "Inventario",
      "nav.customers": "Clientes",
      "nav.suppliers": "Proveedores",
      "nav.reports": "Reportes",
      "nav.settings": "Configuración",
      "nav.users": "Usuarios",
      "nav.help": "Ayuda",
      "nav.profile": "Perfil",
      "nav.notifications": "Notificaciones",
      "pos.cart.empty": "Carrito vacío",
      "pos.cart.title": "Carrito",
      "pos.cart.add": "Agregar al carrito",
      "pos.cart.remove": "Quitar",
      "pos.cart.clear": "Vaciar carrito",
      "pos.cart.items": "artículos",
      "pos.subtotal": "Subtotal",
      "pos.tax": "Impuestos",
      "pos.discount": "Descuento",
      "pos.total": "Total",
      "pos.checkout": "Cobrar",
      "pos.cash": "Efectivo",
      "pos.card": "Tarjeta",
      "pos.transfer": "Transferencia",
      "auto.a_medida": "A medida",
      "auto.a_todos_los_admins": "A todos los admins",
      "auto.a_b_testing": "A/B testing",
      "auto.activar": "ACTIVAR",
      "auto.ai_academy": "AI Academy",
      "auto.ai_copilot_incluido": "AI Copilot incluido",
      "auto.ai_engine": "AI Engine",
      "auto.ai_support": "AI Support",
      "auto.api_docs": "API Docs",
      "auto.api_gateway": "API Gateway",
      "auto.api_rest_completa": "API REST completa",
      "auto.api_calls": "API calls",
      "auto.arr": "ARR",
      "auto.auto_reprogramaci_n": "AUTO-REPROGRAMACIÓN",
      "auto.abarrotes_don_chucho": "Abarrotes Don Chucho",
      "auto.abonar_a_cr_dito": "Abonar a crédito",
      "auto.abonar_ahora": "Abonar ahora",
      "auto.abono": "Abono",
      "auto.abonos": "Abonos",
      "auto.abril_2026": "Abril 2026",
      "auto.abrir_caja": "Abrir caja",
      "auto.abrir_caj_n_al_cobrar": "Abrir cajón al cobrar",
      "auto.academy": "Academy",
      "auto.academy_online": "Academy online",
      "auto.accesorio_pro": "Accesorio Pro",
      "auto.acciones_directas": "Acciones directas",
      "auto.acciones_directas_al_cliente": "Acciones directas al cliente",
      "auto.acci_n": "Acción",
      "auto.aceite_multigrado_15w_40_4l": "Aceite multigrado 15W-40 4L",
      "auto.aclaraci_n": "Aclaración",
      "auto.aclaraci_n_de_puntos": "Aclaración de puntos",
      "auto.acme_corp": "Acme Corp",
      "auto.actividad_en_vivo": "Actividad en vivo",
      "auto.activo_desde_2024": "Activo desde 2024",
      "auto.activos_fijos": "Activos fijos",
      "auto.actualizador_masivo": "Actualizador masivo",
      "auto.actualizados_autom_ticamente": "Actualizados automáticamente",
      "auto.acumula_y_canjea_recompensas": "Acumula y canjea recompensas",
      "auto.agendar_demo_personalizado": "Agendar demo personalizado",
      "auto.agrega_al_existente": "Agrega al existente",
      "auto.ahorra_hasta": "Ahorra hasta",
      "auto.ahorro_en_soporte_humano": "Ahorro en soporte humano",
      "auto.ahorro_vs_programar_todo": "Ahorro vs programar todo",
      "auto.ajustes_globales": "Ajustes globales",
      "auto.al_d_a": "Al día",
      "auto.alimentos": "Alimentos",
      "auto.almacenamiento_ilimitado": "Almacenamiento ilimitado",
      "auto.analytics_web": "Analytics web",
      "auto.anal_tica": "Analítica",
      "auto.ancho_ticket": "Ancho ticket",
      "auto.andrea_l_pez": "Andrea López",
      "auto.android": "Android",
      "auto.anticongelante_org_nico_5l": "Anticongelante orgánico 5L",
      "auto.an_lisis_sentimiento": "Análisis sentimiento",
      "auto.aplicar_cr_dito": "Aplicar Crédito",
      "auto.app_android": "App Android",
      "auto.app_m_vil_nativa": "App Móvil Nativa",
      "auto.app_web": "App Web",
      "auto.app_windows": "App Windows",
      "auto.app_del_gerente": "App del gerente",
      "auto.app_m_vil_del_mesero": "App móvil del mesero",
      "auto.apps_suite": "Apps Suite",
      "auto.apps_del_ecosistema": "Apps del ecosistema",
      "auto.apps_disponibles_en_el_suite": "Apps disponibles en el Suite",
      "auto.arquitectura": "Arquitectura",
      "auto.arquitectura_del_ecosistema": "Arquitectura del ecosistema",
      "auto.asunto": "Asunto",
      "auto.atajos": "Atajos",
      "auto.audio_y_video": "Audio y video",
      "auto.auditor_a_completa": "Auditoría completa",
      "auto.auth_service": "Auth Service",
      "auto.automatizaciones": "Automatizaciones",
      "auto.automatizaciones_avanzadas": "Automatizaciones avanzadas",
      "auto.av_insurgentes_sur_1234_cdmx": "Av. Insurgentes Sur 1234, CDMX",
      "auto.backup": "Backup",
      "auto.backups_ok": "Backups OK",
      "auto.backups_autom_ticos": "Backups automáticos",
      "auto.bajo_stock": "Bajo stock",
      "auto.balatas_freno_cer_micas": "Balatas freno cerámicas",
      "auto.banco": "Banco",
      "auto.banner_global": "Banner global",
      "auto.barberpro_com": "BarberPro.com",
      "auto.barber_a_luisita_centro": "Barbería Luisita Centro",
      "auto.base_de_datos_local": "Base de datos local",
      "auto.bater_a_12v_60ah_libre_mant": "Batería 12V 60Ah libre mant.",
      "auto.bebidas": "Bebidas",
      "auto.belleza": "Belleza",
      "auto.bienvenido_a_volvix": "Bienvenido a Volvix",
      "auto.billing_global": "Billing Global",
      "auto.billing_resumen": "Billing Resumen",
      "auto.blog": "Blog",
      "auto.bloquea_acceso_hasta_reactivar": "Bloquea acceso hasta reactivar",
      "auto.bloquea_las_4_apps_al_instante": "Bloquea las 4 apps al instante",
      "auto.bot_instagram": "Bot Instagram",
      "auto.bot_messenger": "Bot Messenger",
      "auto.botones_extras_salvadorex": "Botones extras SalvadoreX",
      "auto.branding_total": "Branding total",
      "auto.bridge_conectado": "Bridge conectado",
      "auto.bronze": "Bronze",
      "auto.buj_a_ngk_iridium_g_power": "Bujía NGK Iridium G-Power",
      "auto.business": "Business",
      "auto.business_intelligence": "Business Intelligence",
      "auto.b_sico": "Básico",
      "auto.canary": "CANARY",
      "auto.cdn_global": "CDN global",
      "auto.cds_cliente": "CDS Cliente",
      "auto.ci_cd_pipeline": "CI/CD pipeline",
      "auto.crear": "CREAR",
      "auto.caja_chica": "Caja chica",
      "auto.caja_r_pida": "Caja rápida",
      "auto.calendario_unificado": "Calendario unificado",
      "auto.calidad_sin_rechazos": "Calidad / sin rechazos",
      "auto.calificaci_n_promedio": "Calificación promedio",
      "auto.cambio_a_entregar": "Cambio a entregar",
      "auto.cambio_de_direcci_n": "Cambio de dirección",
      "auto.canal": "Canal",
      "auto.canjea_tus_puntos": "Canjea tus puntos",
      "auto.canjear_recompensa": "Canjear recompensa",
      "auto.cant": "Cant.",
      "auto.capacitaciones": "Capacitaciones",
      "auto.capacitaci_n_incluida": "Capacitación incluida",
      "auto.cargo": "Cargo",
      "auto.carlos_p_rez": "Carlos Pérez",
      "auto.carreras": "Carreras",
      "auto.categor_a_general": "Categoría general",
      "auto.categor_as": "Categorías",
      "auto.cat_logo": "Catálogo",
      "auto.cat_logo_de_productos": "Catálogo de Productos",
      "auto.cat_logo_digital": "Catálogo digital",
      "auto.centro_de_control": "Centro de Control",
      "auto.centro_de_avisos": "Centro de avisos",
      "auto.centro_de_ayuda": "Centro de ayuda",
      "auto.centro_de_llamadas": "Centro de llamadas",
      "auto.centros_de_costo": "Centros de costo",
      "auto.cerrar_corte": "Cerrar corte",
      "auto.cerrar_todas_las_sesiones": "Cerrar todas las sesiones",
      "auto.certificaciones": "Certificaciones",
      "auto.changelog": "Changelog",
      "auto.chat_en_vivo": "Chat en vivo",
      "auto.chat_whatsapp_o_el_pos": "Chat, WhatsApp o el POS",
      "auto.chatbot_whatsapp": "Chatbot WhatsApp",
      "auto.cierra_la_sesi_n_del_cajero": "Cierra la sesión del cajero",
      "auto.cierre_caja": "Cierre Caja",
      "auto.claude_pro_max_x20": "Claude Pro Max x20",
      "auto.cliente": "Cliente",
      "auto.cliente_entra_a": "Cliente entra a",
      "auto.cliente_moroso": "Cliente moroso",
      "auto.cliente_pide_x": "Cliente pide X",
      "auto.cliente_puede_usar_el_pos_normalmente": "Cliente puede usar el POS normalmente",
      "auto.clientes_con_m_dulo_etiquetas": "Clientes con módulo etiquetas",
      "auto.clientes_top": "Clientes top",
      "auto.clients_sincronizados": "Clients sincronizados",
      "auto.cobertura": "Cobertura",
      "auto.cobrado": "Cobrado",
      "auto.cobrado_este_mes": "Cobrado este mes",
      "auto.cobro_calculado_autom_ticamente": "Cobro calculado automáticamente.",
      "auto.cobros_recurrentes": "Cobros recurrentes",
      "auto.cocina_kds": "Cocina KDS",
      "auto.cohorte": "Cohorte",
      "auto.cola_de_sync_pendiente": "Cola de sync pendiente",
      "auto.color_primario": "Color primario",
      "auto.comandas_d_a": "Comandas / día",
      "auto.comandera": "Comandera",
      "auto.comandera_kds_manager_cds": "Comandera, KDS, Manager, CDS",
      "auto.compartidas_y_privadas": "Compartidas y privadas",
      "auto.compensaci_n": "Compensación",
      "auto.comprar": "Comprar",
      "auto.compras": "Compras",
      "auto.compras_proveedores": "Compras / Proveedores",
      "auto.compras_recientes": "Compras recientes",
      "auto.compras_totales": "Compras totales",
      "auto.comunidad": "Comunidad",
      "auto.comunidad_activa": "Comunidad activa",
      "auto.concepto": "Concepto",
      "auto.concepto_base": "Concepto base",
      "auto.conciliaci_n_bancaria": "Conciliación bancaria",
      "auto.configuraci_n_de_volvix_core": "Configuración de Volvix Core.",
      "auto.confirmaci_n_del_proveedor": "Confirmación del proveedor",
      "auto.confirmadas": "Confirmadas",
      "auto.confirmar_abono": "Confirmar abono",
      "auto.confirmar_canje": "Confirmar canje",
      "auto.conflictos_hoy": "Conflictos hoy",
      "auto.constancia_de_situaci_n_fiscal": "Constancia de situación fiscal",
      "auto.consulta_sobre_factura_f_a2031": "Consulta sobre factura F-A2031",
      "auto.contactar_ventas": "Contactar ventas",
      "auto.contacto": "Contacto",
      "auto.contacto_principal": "Contacto principal",
      "auto.conteo_f_sico": "Conteo físico",
      "auto.contrato_marco_2026": "Contrato marco 2026",
      "auto.contratos_digitales": "Contratos digitales",
      "auto.control_de_apps_suite": "Control de Apps Suite",
      "auto.control_de_asistencia": "Control de asistencia",
      "auto.control_de_servicio": "Control de servicio",
      "auto.control_en_tiempo_real": "Control en tiempo real",
      "auto.control_granular_de_botones_y_funciones": "Control granular de botones y funciones",
      "auto.control_granular_por_app": "Control granular por app",
      "auto.control_total_de_las_4_apps": "Control total de las 4 apps",
      "auto.controlado_por_el_propietario_del_sistem": "Controlado por el propietario del sistema",
      "auto.cont_ctanos_para_cotizaci_n": "Contáctanos para cotización",
      "auto.conversion": "Conversion",
      "auto.cookies": "Cookies",
      "auto.correos_transaccionales": "Correos transaccionales",
      "auto.corte": "Corte",
      "auto.corte_de_caja": "Corte de caja",
      "auto.corte_pendiente": "Corte pendiente",
      "auto.costo_de_duplicados": "Costo de duplicados",
      "auto.crear_tenant": "Crear Tenant",
      "auto.crear_ticket_de_soporte": "Crear ticket de soporte",
      "auto.crecimiento": "Crecimiento",
      "auto.cr_dito_disponible": "Crédito disponible",
      "auto.cr_dito_otorgado": "Crédito otorgado",
      "auto.cr_dito_y_pagos": "Crédito y pagos",
      "auto.cuenta": "Cuenta",
      "auto.cuenta_bancaria": "Cuenta bancaria",
      "auto.cuentas_por_cobrar": "Cuentas por cobrar",
      "auto.cuentas_por_pagar": "Cuentas por pagar",
      "auto.cumplimiento_gdpr": "Cumplimiento GDPR",
      "auto.cupones_y_promos": "Cupones y promos",
      "auto.custom_fields": "Custom fields",
      "auto.custom_workflows": "Custom workflows",
      "auto.customer_success_manager": "Customer Success Manager",
      "auto.c_digo_postal": "Código postal",
      "auto.c_digos_de_barra": "Códigos de barra",
      "auto.c_mo_mantenemos_los_3_clients_alineados": "Cómo mantenemos los 3 clients alineados",
      "auto.c_mo_se_conecta_todo": "Cómo se conecta todo",
      "auto.del_borrar_art": "DEL Borrar Art.",
      "auto.dev": "DEV",
      "auto.dpa": "DPA",
      "auto.daniel_v": "Daniel V.",
      "auto.datos_del_negocio": "Datos del negocio",
      "auto.datos_fiscales": "Datos fiscales",
      "auto.datos_personales_y_de_facturaci_n": "Datos personales y de facturación",
      "auto.delivery_integrado": "Delivery integrado",
      "auto.departamentos": "Departamentos",
      "auto.deploys_recientes": "Deploys Recientes",
      "auto.descargas": "Descargas",
      "auto.descripci_n_del_producto": "Descripción del Producto",
      "auto.detalle": "Detalle",
      "auto.detecci_n_anomal_as": "Detección anomalías",
      "auto.device_id": "Device ID",
      "auto.devoluciones_rma": "Devoluciones RMA",
      "auto.devoluci_n": "Devolución",
      "auto.diego_guzm_n": "Diego Guzmán",
      "auto.direcciones": "Direcciones",
      "auto.direcciones_de_env_o": "Direcciones de envío",
      "auto.dispositivos_activos": "Dispositivos activos",
      "auto.dispositivos_online": "Dispositivos online",
      "auto.distribuci_n_geogr_fica": "Distribución Geográfica",
      "auto.documentaci_n": "Documentación",
      "auto.documentos": "Documentos",
      "auto.dominio_admin": "Dominio admin",
      "auto.dominio_propio": "Dominio propio",
      "auto.dropshipping": "Dropshipping",
      "auto.d_as_promedio_cobro": "Días promedio cobro",
      "auto.e_commerce": "E-commerce",
      "auto.extender": "EXTENDER",
      "auto.editar_landing": "Editar landing",
      "auto.editor_web_wysiwyg": "Editor Web WYSIWYG",
      "auto.efectivo_en_caja": "Efectivo en caja",
      "auto.efectivo_esperado": "Efectivo esperado",
      "auto.elevenlabs": "ElevenLabs",
      "auto.email_masivo": "Email Masivo",
      "auto.embarque_y_tracking": "Embarque y tracking",
      "auto.emergencia_p0": "Emergencia P0",
      "auto.empezar_14_d_as_gratis": "Empezar 14 días gratis",
      "auto.empezar_gratis": "Empezar gratis",
      "auto.empieza_a_operar_mejor_hoy_mismo": "Empieza a operar mejor hoy mismo",
      "auto.empresa": "Empresa",
      "auto.empresas_activas": "Empresas activas",
      "auto.empresas_que_conf_an_en_volvix": "Empresas que confían en Volvix",
      "auto.en_proceso": "En proceso",
      "auto.en_uso": "En uso",
      "auto.en_validaci_n": "En validación",
      "auto.en_vivo_con_pos": "En vivo con POS",
      "auto.en_vivo_con_restaurante_los_compadres": "En vivo con Restaurante Los Compadres",
      "auto.encriptaci_n_tls": "Encriptación TLS",
      "auto.encuestas_nps": "Encuestas NPS",
      "auto.endpoints_api": "Endpoints API",
      "auto.enterprise": "Enterprise",
      "auto.enterprise_only": "Enterprise only",
      "auto.entrada_de_efectivo": "Entrada de efectivo",
      "auto.entrega_a_tiempo": "Entrega a tiempo",
      "auto.entrega_en_sucursal": "Entrega en sucursal",
      "auto.entrega_solicitada": "Entrega solicitada",
      "auto.entregadas": "Entregadas",
      "auto.enviar": "Enviar",
      "auto.enviar_a_todas": "Enviar a todas",
      "auto.enviar_a_validaci_n": "Enviar a validación",
      "auto.enviar_mensaje_al_cliente": "Enviar mensaje al cliente",
      "auto.enviar_mensaje_al_tenant": "Enviar mensaje al tenant",
      "auto.enviar_por_whatsapp": "Enviar por WhatsApp",
      "auto.enviar_ticket": "Enviar ticket",
      "auto.env_os_y_gu_as": "Envíos y guías",
      "auto.escaneo_m_vil": "Escaneo móvil",
      "auto.estado_en_tiempo_real": "Estado en tiempo real",
      "auto.estamos_para_ayudarte": "Estamos para ayudarte",
      "auto.estatus": "Estatus",
      "auto.esteticapluz": "EsteticaPluz",
      "auto.etiquetas": "Etiquetas",
      "auto.etiquetas_rfid": "Etiquetas RFID",
      "auto.evaluaci_n_360": "Evaluación 360",
      "auto.eventos_cr_ticos_24h": "Eventos críticos 24h",
      "auto.eventos_de_sync_en_vivo": "Eventos de sync en vivo",
      "auto.existencia": "Existencia",
      "auto.exportador_excel": "Exportador Excel",
      "auto.extensiones": "Extensiones",
      "auto.f1_ventas": "F1 Ventas",
      "auto.f10_buscar": "F10 Buscar",
      "auto.f11_mayoreo": "F11 Mayoreo",
      "auto.f12_cobrar": "F12 - Cobrar",
      "auto.f2_cr_ditos": "F2 Créditos",
      "auto.f3_productos": "F3 Productos",
      "auto.f4_inventario": "F4 Inventario",
      "auto.f5_cambiar": "F5 - Cambiar",
      "auto.f6_pendiente": "F6 - Pendiente",
      "auto.f7_entradas": "F7 Entradas",
      "auto.f8_salidas": "F8 Salidas",
      "auto.f9_verificador": "F9 - Verificador",
      "auto.fac_a_9789": "FAC-A-9789",
      "auto.fac_a_9803_fac_a_9810": "FAC-A-9803, FAC-A-9810",
      "auto.fac_a_9821": "FAC-A-9821",
      "auto.fac_a_9847": "FAC-A-9847",
      "auto.fac_a_9847_fac_a_9859": "FAC-A-9847, FAC-A-9859",
      "auto.fac_a_9852": "FAC-A-9852",
      "auto.fac_a_9859": "FAC-A-9859",
      "auto.fac_a_9866": "FAC-A-9866",
      "auto.fac_a_9870": "FAC-A-9870",
      "auto.fac_a_9871": "FAC-A-9871",
      "auto.fail": "FAIL",
      "auto.faq": "FAQ",
      "auto.facturaci_n": "Facturación",
      "auto.facturaci_n_cfdi": "Facturación CFDI",
      "auto.facturaci_n_electr_nica": "Facturación Electrónica",
      "auto.facturaci_n_correcta": "Facturación correcta",
      "auto.facturado_mes": "Facturado mes",
      "auto.facturar": "Facturar",
      "auto.facturas_emitidas": "Facturas emitidas",
      "auto.facturas_recientes": "Facturas recientes",
      "auto.falta_cortar": "Falta cortar",
      "auto.farmaciaspro_com": "FarmaciasPro.com",
      "auto.favoritos": "Favoritos",
      "auto.feature_flags": "Feature Flags",
      "auto.features_existentes_ampliados": "Features existentes ampliados",
      "auto.features_totales": "Features totales",
      "auto.fecha_nacimiento": "Fecha nacimiento",
      "auto.filtro_de_aire_premium_a_220": "Filtro de aire premium A-220",
      "auto.finanzas": "Finanzas",
      "auto.firma_electr_nica": "Firma electrónica",
      "auto.firmado": "Firmado",
      "auto.flujo_de_tu_saas": "Flujo de tu SaaS",
      "auto.folio": "Folio",
      "auto.forecasting_ia": "Forecasting IA",
      "auto.form_builder": "Form builder",
      "auto.forzar": "Forzar",
      "auto.fuerza_instalar_la_ltima_versi_n": "Fuerza instalar la última versión",
      "auto.funciona_sin_internet": "Funciona sin internet",
      "auto.funciones": "Funciones",
      "auto.funciones_integradas": "Funciones integradas",
      "auto.ganancias": "Ganancias",
      "auto.garant_as": "Garantías",
      "auto.gastos": "Gastos",
      "auto.generaci_n_contenido_ia": "Generación contenido IA",
      "auto.gestiona_tu_l_nea_de_cr_dito_y_abonos": "Gestiona tu línea de crédito y abonos",
      "auto.gesti_n_de_citas": "Gestión de citas",
      "auto.gesti_n_documental": "Gestión documental",
      "auto.gift_cards": "Gift cards",
      "auto.giros_compatibles_con_la_suite_completa": "Giros compatibles con la Suite completa",
      "auto.giros_de_negocio_soportados": "Giros de negocio soportados",
      "auto.giros_m_s_populares": "Giros más populares",
      "auto.giros_populares": "Giros populares",
      "auto.giros_y_landings": "Giros y Landings",
      "auto.globex": "Globex",
      "auto.grabaci_n_de_llamadas": "Grabación de llamadas",
      "auto.graphql": "GraphQL",
      "auto.grupovolvix": "GrupoVolvix",
      "auto.gr_fica_diaria": "Gráfica diaria",
      "auto.guardar_preferencias": "Guardar preferencias",
      "auto.hipaa_ready": "HIPAA ready",
      "auto.hace_2_segundos": "Hace 2 segundos",
      "auto.hasta_25_usuarios": "Hasta 25 usuarios",
      "auto.hasta_3_usuarios": "Hasta 3 usuarios",
      "auto.hay_clientes_que": "Hay clientes que",
      "auto.heatmap_actividad_semanal": "Heatmap Actividad Semanal",
      "auto.heatmaps": "Heatmaps",
      "auto.helpdesk": "Helpdesk",
      "auto.hereda_de_la_vertical": "Hereda de la vertical",
      "auto.historial": "Historial",
      "auto.historial_completo_de_tus_rdenes": "Historial completo de tus órdenes",
      "auto.historial_de_ventas_y_devoluciones": "Historial de ventas y devoluciones",
      "auto.hist_rico_de_pagos": "Histórico de pagos",
      "auto.hola": "Hola,",
      "auto.hosting_us_eu_latam": "Hosting US/EU/LATAM",
      "auto.hosting_dedicado": "Hosting dedicado",
      "auto.ia_busca": "IA busca",
      "auto.ia_programa_sola": "IA programa sola",
      "auto.id_proveedor": "ID proveedor",
      "auto.ieps": "IEPS",
      "auto.ins_varios": "INS Varios",
      "auto.iso_27001": "ISO 27001",
      "auto.iva_est_ndar": "IVA estándar",
      "auto.identidad": "Identidad",
      "auto.identidad_y_marca": "Identidad y marca",
      "auto.idioma": "Idioma",
      "auto.implementaci_n_en": "Implementación en",
      "auto.importador_csv": "Importador CSV",
      "auto.importe": "Importe",
      "auto.impresi_n": "Impresión",
      "auto.impresora": "Impresora",
      "auto.imprimir_resumen": "Imprimir resumen",
      "auto.imprimir_ticket_auto": "Imprimir ticket auto",
      "auto.im_genes_ia": "Imágenes IA",
      "auto.im_genes_para_videos": "Imágenes para videos",
      "auto.informaci_n_de_licencia": "Información de licencia",
      "auto.informaci_n_personal": "Información personal",
      "auto.ingresos": "Ingresos",
      "auto.ingresos_del_mes": "Ingresos del mes",
      "auto.inicio": "Inicio",
      "auto.initech": "Initech",
      "auto.integraciones_api": "Integraciones API",
      "auto.integraciones_core": "Integraciones core",
      "auto.integraci_n_make": "Integración Make",
      "auto.integraci_n_zapier": "Integración Zapier",
      "auto.inteligencia_operativa": "Inteligencia Operativa",
      "auto.interfaz_general": "Interfaz general",
      "auto.inventario_multi_bodega": "Inventario Multi-bodega",
      "auto.inventario_de_productos": "Inventario de Productos",
      "auto.ir_al_login": "Ir al login",
      "auto.items": "Items",
      "auto.juan_dom_nguez": "JUAN DOMÍNGUEZ",
      "auto.jerarqu_a_saas": "Jerarquía SaaS",
      "auto.jerarqu_a_profunda": "Jerarquía profunda",
      "auto.juan_mendoza": "Juan Mendoza",
      "auto.kds": "KDS",
      "auto.kardex": "Kardex",
      "auto.kill_switch": "Kill Switch",
      "auto.kill_switch_total": "Kill switch total",
      "auto.kitchen_display_system": "Kitchen Display System",
      "auto.live_sync": "LIVE SYNC",
      "auto.la_plataforma": "La plataforma",
      "auto.lacteos": "Lacteos",
      "auto.landing_builder": "Landing builder",
      "auto.landing_publicada": "Landing publicada",
      "auto.las_3_apps_consumen_el_mismo": "Las 3 apps consumen el mismo",
      "auto.latencia": "Latencia",
      "auto.latencia_promedio": "Latencia promedio",
      "auto.licencia": "Licencia",
      "auto.limpieza": "Limpieza",
      "auto.links_de_pago": "Links de pago",
      "auto.liquidado": "Liquidado",
      "auto.llamadas_voip": "Llamadas VoIP",
      "auto.logs": "Logs",
      "auto.logs_de_actividad": "Logs de actividad",
      "auto.logs_del_sistema": "Logs del sistema",
      "auto.logs_en_tiempo_real": "Logs en Tiempo Real",
      "auto.los_m_s_vendidos": "Los más vendidos",
      "auto.lun_dom_x_24h": "Lun-Dom x 24h",
      "auto.lun_vie_9_18h": "Lun-Vie 9-18h",
      "auto.l_mite": "Límite",
      "auto.l_nea_de_tiempo": "Línea de tiempo",
      "auto.l_nea_disponible": "Línea disponible",
      "auto.m12": "M12",
      "auto.mastercard": "MASTERCARD",
      "auto.mrr": "MRR",
      "auto.mrr_del_m_dulo": "MRR del módulo",
      "auto.mrr_por_marca": "MRR por marca",
      "auto.mrr_suite": "MRR suite",
      "auto.mrr_total": "MRR total",
      "auto.manager": "Manager",
      "auto.manda_se_al_al_caj_n_autom_tico": "Manda señal al cajón automático",
      "auto.mantente_informado_de_tu_actividad": "Mantente informado de tu actividad",
      "auto.manuales_pdf": "Manuales PDF",
      "auto.manufactura": "Manufactura",
      "auto.marca_blanca": "Marca blanca",
      "auto.marcar_todo_le_do": "Marcar todo leído",
      "auto.marcas_blancas": "Marcas blancas",
      "auto.margen_neto": "Margen neto",
      "auto.margen_por_producto": "Margen por producto",
      "auto.marketing": "Marketing",
      "auto.marketplace": "Marketplace",
      "auto.marketplace_de_apps": "Marketplace de apps",
      "auto.mar_a_rodr_guez": "María Rodríguez",
      "auto.mas_vendidos_hoy": "Mas vendidos hoy",
      "auto.mensajes": "Mensajes",
      "auto.mensual_ejecutivo": "Mensual ejecutivo",
      "auto.mesas_y_meseros": "Mesas y meseros",
      "auto.metas_del_mes": "Metas del Mes",
      "auto.metricas_en_vivo": "Metricas en Vivo",
      "auto.mi_cr_dito": "Mi crédito",
      "auto.mi_perfil": "Mi perfil",
      "auto.migraci_n_asistida": "Migración asistida",
      "auto.mis_compras": "Mis compras",
      "auto.mis_direcciones": "Mis direcciones",
      "auto.mis_favoritos": "Mis favoritos",
      "auto.mix_de_categorias": "Mix de Categorias",
      "auto.mixto": "Mixto",
      "auto.mockups_productos": "Mockups productos",
      "auto.modo_mantenimiento": "Modo Mantenimiento",
      "auto.moneda": "Moneda",
      "auto.monedas": "Monedas",
      "auto.monto_a_abonar": "Monto a abonar",
      "auto.monto_inicial": "Monto inicial",
      "auto.motor_de_sincronizaci_n": "Motor de sincronización",
      "auto.movilidad": "Movilidad",
      "auto.movimiento": "Movimiento",
      "auto.movimientos_de_cr_dito": "Movimientos de crédito",
      "auto.movimientos_de_puntos": "Movimientos de puntos",
      "auto.multi_empresa": "Multi-empresa",
      "auto.multi_idioma": "Multi-idioma",
      "auto.multi_moneda": "Multi-moneda",
      "auto.multi_sucursal": "Multi-sucursal",
      "auto.m_vil": "MÓVIL",
      "auto.m_s_de_12_000_empresas_crecen_con_volvix": "Más de 12,000 empresas crecen con Volvix",
      "auto.m_todo_de_pago": "Método de pago",
      "auto.m_todos_de_pago": "Métodos de pago",
      "auto.m_dulos_activos": "Módulos activos",
      "auto.m_dulos_principales": "Módulos principales",
      "auto.nda": "NDA",
      "auto.navegador_pwa": "Navegador / PWA",
      "auto.net_new": "Net New",
      "auto.ninguna": "Ninguna",
      "auto.nivel": "Nivel",
      "auto.no_hay_mensajes_nuevos_en_este_momento": "No hay mensajes nuevos en este momento.",
      "auto.nombre_completo": "Nombre completo",
      "auto.nombre_de_la_marca": "Nombre de la marca",
      "auto.nombre_del_negocio": "Nombre del negocio",
      "auto.northwind": "Northwind",
      "auto.nosotros": "Nosotros",
      "auto.notas_para_ap": "Notas para AP",
      "auto.notificaciones_a_tenants": "Notificaciones a tenants",
      "auto.notificaciones_por_email": "Notificaciones por email",
      "auto.nunca_generamos_lo_mismo_2_veces": "Nunca generamos lo mismo 2 veces",
      "auto.n_mina_y_rrhh": "Nómina y RRHH",
      "auto.ocr_inteligente": "OCR inteligente",
      "auto.off": "OFF",
      "auto.oxxo_pay": "OXXO Pay",
      "auto.objetivos_y_heatmap": "Objetivos y Heatmap",
      "auto.observaciones": "Observaciones",
      "auto.onboarding": "Onboarding",
      "auto.onboarding_gratis": "Onboarding gratis",
      "auto.onboarding_white_glove": "Onboarding white-glove",
      "auto.operaciones_de_super_admin": "Operaciones de Super Admin",
      "auto.operaciones_en_cola": "Operaciones en cola",
      "auto.operaciones_min": "Operaciones/min",
      "auto.operaci_n": "Operación",
      "auto.opini_n_positiva_sat_32_d": "Opinión positiva SAT 32-D",
      "auto.otro": "Otro",
      "auto.otros": "Otros",
      "auto.overview": "Overview",
      "auto.partial": "PARTIAL",
      "auto.pass": "PASS",
      "auto.pci_dss_level_1": "PCI DSS Level 1",
      "auto.po_asociada": "PO asociada",
      "auto.po_emitida": "PO emitida",
      "auto.po_2026_04748": "PO-2026-04748",
      "auto.po_2026_04754": "PO-2026-04754",
      "auto.po_2026_04766": "PO-2026-04766",
      "auto.po_2026_04772": "PO-2026-04772",
      "auto.po_2026_04779": "PO-2026-04779",
      "auto.po_2026_04781": "PO-2026-04781",
      "auto.pos_inteligente": "POS Inteligente",
      "auto.pos_web": "POS Web",
      "auto.pos_activas": "POs Activas",
      "auto.pagada": "Pagada",
      "auto.pagado": "Pagado",
      "auto.pagado_ytd": "Pagado YTD",
      "auto.pago_de_servicios": "Pago de servicios",
      "auto.pagos_recibidos": "Pagos Recibidos",
      "auto.panel_saas": "Panel SaaS",
      "auto.panel_del_propietario": "Panel del propietario",
      "auto.panel_lateral_y_otros": "Panel lateral y otros",
      "auto.partners": "Partners",
      "auto.pasarela_de_pagos": "Pasarela de pagos",
      "auto.pausados": "Pausados",
      "auto.pausar": "Pausar",
      "auto.paypal": "PayPal",
      "auto.pendiente_fallido": "Pendiente / fallido",
      "auto.pendiente_confirmar": "Pendiente confirmar",
      "auto.pendientes": "Pendientes",
      "auto.perfil_del_proveedor": "Perfil del Proveedor",
      "auto.performance_metrics": "Performance Metrics",
      "auto.performance_sla": "Performance SLA",
      "auto.picking_y_packing": "Picking y packing",
      "auto.plantillas_creadas": "Plantillas creadas",
      "auto.plantillas_del_sistema": "Plantillas del sistema",
      "auto.plantillas_legales": "Plantillas legales",
      "auto.plantillas_pre_armadas": "Plantillas pre-armadas",
      "auto.plataforma": "Plataforma",
      "auto.por_cajero": "Por cajero",
      "auto.por_cobrar": "Por cobrar",
      "auto.por_confirmar": "Por confirmar",
      "auto.por_volumen": "Por volumen",
      "auto.portal_del_cliente": "Portal del Cliente",
      "auto.posterior_a_confirmaci_n": "Posterior a confirmación",
      "auto.postgresql": "PostgreSQL",
      "auto.precio_por_seat": "Precio por seat",
      "auto.precios": "Precios",
      "auto.predeterminada": "Predeterminada",
      "auto.predicci_n_demanda": "Predicción demanda",
      "auto.preferencias_de_comunicaci_n": "Preferencias de comunicación",
      "auto.preferencias_generales": "Preferencias generales",
      "auto.preferencias_y_control_de_funciones": "Preferencias y control de funciones",
      "auto.preguntas_frecuentes": "Preguntas frecuentes",
      "auto.prensa": "Prensa",
      "auto.presupuestos": "Presupuestos",
      "auto.preview_apps_m_viles": "Preview apps móviles",
      "auto.privacidad": "Privacidad",
      "auto.pro": "Pro",
      "auto.problema_con_compra": "Problema con compra",
      "auto.procesos_bpmn": "Procesos BPMN",
      "auto.productividad": "Productividad",
      "auto.producto": "Producto",
      "auto.producto_premium": "Producto Premium",
      "auto.productos_en_la_venta_actual": "Productos en la venta actual.",
      "auto.productos_m_s_vendidos_hoy": "Productos más vendidos hoy",
      "auto.programa_de_lealtad": "Programa de lealtad",
      "auto.programada_28_abr_2026": "Programada 28 abr 2026",
      "auto.programado": "Programado",
      "auto.programado_30_abr": "Programado 30 abr",
      "auto.promedio_de_rdenes_enviadas_a_cocina": "Promedio de órdenes enviadas a cocina",
      "auto.promociones": "Promociones",
      "auto.propietario": "Propietario",
      "auto.provisi_n_manual": "Provisión manual",
      "auto.prueba_gratis_sin_tarjeta": "Prueba gratis sin tarjeta",
      "auto.pr_ximo_pago": "Próximo pago",
      "auto.puntos": "Puntos",
      "auto.puntos_loyalty": "Puntos Loyalty",
      "auto.puntos_disponibles": "Puntos disponibles",
      "auto.p_liza_de_seguro": "Póliza de seguro",
      "auto.qr_men_digital": "QR menú digital",
      "auto.queue_maintenance": "Queue maintenance",
      "auto.quick_actions": "Quick Actions",
      "auto.quick_pick": "Quick-pick",
      "auto.qui_nes_compran_m_s": "Quiénes compran más",
      "auto.raz_n_social": "Razón social",
      "auto.recargas_electr_nicas": "Recargas electrónicas",
      "auto.rechazada": "Rechazada",
      "auto.rechazadas": "Rechazadas",
      "auto.rechazar": "Rechazar",
      "auto.recibido_del_cliente": "Recibido del cliente",
      "auto.recientes": "Recientes",
      "auto.reclutamiento": "Reclutamiento",
      "auto.recomendaciones_ia": "Recomendaciones IA",
      "auto.recursos": "Recursos",
      "auto.recursos_del_sistema": "Recursos del sistema",
      "auto.redis_cache": "Redis Cache",
      "auto.reembolsos": "Reembolsos",
      "auto.ref": "Ref",
      "auto.registra_el_efectivo_inicial_del_turno": "Registra el efectivo inicial del turno",
      "auto.registrar": "Registrar",
      "auto.regi_n": "Región",
      "auto.reimprimir_ltimo_ticket": "Reimprimir Último Ticket",
      "auto.rentas": "Rentas",
      "auto.reporte": "Reporte",
      "auto.reportes_ad_hoc": "Reportes ad-hoc",
      "auto.reproduce_sonido_al_completar_venta": "Reproduce sonido al completar venta",
      "auto.requests_al_api": "Requests al API",
      "auto.reservas_online": "Reservas online",
      "auto.rese_as_y_reviews": "Reseñas y reviews",
      "auto.resp_en_24h": "Resp. en 24h",
      "auto.restart_workers": "Restart Workers",
      "auto.restauraci_n_1_click": "Restauración 1-click",
      "auto.restaurantman": "RestaurantMan",
      "auto.restaurantes": "Restaurantes",
      "auto.resuelto": "Resuelto",
      "auto.resumen": "Resumen",
      "auto.resumen_autom_tico": "Resumen automático",
      "auto.resumen_de_tu_actividad_en_volvix": "Resumen de tu actividad en Volvix",
      "auto.resumen_del_turno": "Resumen del turno",
      "auto.retail": "Retail",
      "auto.retenci_n_por_cohorte": "Retención por Cohorte",
      "auto.reutilizaciones": "Reutilizaciones",
      "auto.revshare": "Revshare",
      "auto.revshare_pagado": "Revshare pagado",
      "auto.roadmap": "Roadmap",
      "auto.rol": "Rol",
      "auto.roles_y_permisos": "Roles y permisos",
      "auto.rotaci_n": "Rotación",
      "auto.r_pido": "RÁPIDO",
      "auto.r_gimen_fiscal": "Régimen fiscal",
      "auto.saas": "SAAS",
      "auto.saml_2_0": "SAML 2.0",
      "auto.scoped": "SCOPED",
      "auto.sdk_javascript": "SDK JavaScript",
      "auto.sdk_python": "SDK Python",
      "auto.seo_tools": "SEO tools",
      "auto.skip": "SKIP",
      "auto.soc_2_type_ii": "SOC 2 Type II",
      "auto.sso_google": "SSO Google",
      "auto.sso_microsoft": "SSO Microsoft",
      "auto.sso_configurado": "SSO configurado",
      "auto.super_admin_saas": "SUPER ADMIN SAAS",
      "auto.saldo_pendiente": "Saldo pendiente",
      "auto.salud": "Salud",
      "auto.salvadorex": "SalvadoreX",
      "auto.seats_android": "Seats Android",
      "auto.seats_web": "Seats Web",
      "auto.seats_windows": "Seats Windows",
      "auto.seats_contratados_por_este_tenant": "Seats contratados por este tenant.",
      "auto.seguridad_empresarial": "Seguridad Empresarial",
      "auto.selecciona_un_giro_para_editar_su_landin": "Selecciona un giro para editar su landing",
      "auto.sendgrid": "SendGrid",
      "auto.servicio_t_cnico": "Servicio técnico",
      "auto.servicios": "Servicios",
      "auto.sesiones": "Sesiones",
      "auto.sesiones_de_control_remoto": "Sesiones de control remoto",
      "auto.session_replay": "Session replay",
      "auto.silver": "Silver",
      "auto.simula_licencia_expirada": "Simula licencia expirada",
      "auto.sin_compras": "Sin compras",
      "auto.sin_corte_desde_ayer": "Sin corte desde ayer",
      "auto.sin_datos_de_cohortes": "Sin datos de cohortes",
      "auto.sin_datos_de_gateways": "Sin datos de gateways",
      "auto.sin_datos_de_power_users": "Sin datos de power users",
      "auto.sin_duplicar_trabajo": "Sin duplicar trabajo",
      "auto.sin_movimiento": "Sin movimiento",
      "auto.sin_stock": "Sin stock",
      "auto.sin_tickets_registrados": "Sin tickets registrados",
      "auto.sincronizaci_n": "Sincronización",
      "auto.sincronizaci_n_offline": "Sincronización offline",
      "auto.sincronizado": "Sincronizado",
      "auto.skywork_ai": "Skywork.ai",
      "auto.smartwatch_x1": "Smartwatch X1",
      "auto.snacks": "Snacks",
      "auto.sobre_nosotros": "Sobre nosotros",
      "auto.sof_a_fern_ndez": "Sofía Fernández",
      "auto.solicitar": "Solicitar",
      "auto.solicitar_cambio": "Solicitar cambio",
      "auto.solo_importantes": "Solo importantes",
      "auto.soluciones": "Soluciones",
      "auto.soluci_n_integral": "Solución integral",
      "auto.sonido_al_cobrar": "Sonido al cobrar",
      "auto.soporte_24_7": "Soporte 24/7",
      "auto.soporte_24_7_prioritario": "Soporte 24/7 prioritario",
      "auto.soporte_por_chat": "Soporte por chat",
      "auto.soporte_y_ayuda": "Soporte y ayuda",
      "auto.split_de_pagos": "Split de pagos",
      "auto.starter": "Starter",
      "auto.status": "Status",
      "auto.stellar_co": "Stellar Co",
      "auto.storage_s3": "Storage S3",
      "auto.stream_en_vivo": "Stream en vivo",
      "auto.stream_t_cnico_de_toda_la_plataforma": "Stream técnico de toda la plataforma.",
      "auto.stripe": "Stripe",
      "auto.subir_factura": "Subir factura",
      "auto.sucursal": "Sucursal",
      "auto.supabase": "Supabase",
      "auto.suscripciones": "Suscripciones",
      "auto.sync_google_calendar": "Sync Google Calendar",
      "auto.sync_outlook": "Sync Outlook",
      "auto.trf_87881": "TRF-87881",
      "auto.trf_87998": "TRF-87998",
      "auto.trf_88072": "TRF-88072",
      "auto.trf_88154": "TRF-88154",
      "auto.trf_88291": "TRF-88291",
      "auto.tagline_corto": "Tagline corto",
      "auto.tarjeta_de_cr_dito_d_bito": "Tarjeta de crédito/débito",
      "auto.tarjetas_guardadas": "Tarjetas guardadas",
      "auto.tarjetas_y_formas_de_pago_guardadas": "Tarjetas y formas de pago guardadas",
      "auto.telegram_business": "Telegram Business",
      "auto.temas_personalizables": "Temas personalizables",
      "auto.tenants_registrados_por_mes": "Tenants registrados por mes",
      "auto.tenants_usando_suite": "Tenants usando Suite",
      "auto.terminolog_a": "Terminología",
      "auto.tesorer_a": "Tesorería",
      "auto.test_status": "Test Status",
      "auto.testimonios": "Testimonios",
      "auto.text_to_voice": "Text-to-voice",
      "auto.ticket": "Ticket",
      "auto.ticket_1": "Ticket 1",
      "auto.tickets_de_soporte": "Tickets de Soporte",
      "auto.tickets_recientes": "Tickets recientes",
      "auto.tickets_resueltos_por_ia": "Tickets resueltos por IA",
      "auto.tiempo_prom_entrega": "Tiempo prom. entrega",
      "auto.tiempo_promedio": "Tiempo promedio",
      "auto.tienda_online": "Tienda online",
      "auto.tier": "Tier",
      "auto.todas": "Todas",
      "auto.todas_las_rdenes": "Todas las órdenes",
      "auto.todo_en_tu_plan_sin_costos_ocultos": "Todo en tu plan, sin costos ocultos.",
      "auto.todos": "Todos",
      "auto.todos_por_ia": "Todos por IA",
      "auto.todos_resueltos_autom_ticamente": "Todos resueltos automáticamente",
      "auto.top_power_users": "Top Power Users",
      "auto.top_tenants": "Top Tenants",
      "auto.top_tenants_por_ingresos": "Top Tenants por Ingresos",
      "auto.top_seller": "Top seller",
      "auto.total_cr_dito": "Total crédito",
      "auto.total_mensual": "Total mensual",
      "auto.tracking_en_vivo": "Tracking en vivo",
      "auto.trafico_por_hora": "Trafico por Hora",
      "auto.transfer": "Transfer",
      "auto.transferencia_spei": "Transferencia SPEI",
      "auto.trigger_deploy": "Trigger Deploy",
      "auto.tr_fico_por_plataforma": "Tráfico por plataforma",
      "auto.tu_plan_actual_tiene": "Tu plan actual tiene",
      "auto.t_rmino_mostrado": "Término mostrado",
      "auto.t_rminos": "Términos",
      "auto.t_rminos_de_pago": "Términos de pago",
      "auto.ultimas_ventas": "Ultimas Ventas",
      "auto.ultimos_eventos_del_sistema": "Ultimos eventos del sistema",
      "auto.uptime": "Uptime",
      "auto.uptime_garantizado": "Uptime garantizado",
      "auto.uso_de_api": "Uso de API",
      "auto.usuarios_ilimitados": "Usuarios ilimitados",
      "auto.visa": "VISA",
      "auto.vlvx_a3f9_c2e1_b8d4": "VLVX-A3F9-C2E1-B8D4",
      "auto.volvix": "VOLVIX",
      "auto.vx_4821": "VX-4821",
      "auto.vacaciones": "Vacaciones",
      "auto.vence_en_18_d_as": "Vence en 18 días",
      "auto.vendidos": "Vendidos",
      "auto.vendor_portal": "Vendor Portal",
      "auto.ventas_ultimos_7_dias": "Ventas Ultimos 7 Dias",
      "auto.ventas_del_d_a_y_devoluciones": "Ventas del día y Devoluciones",
      "auto.ventas_productos_clientes_inventario": "Ventas, productos, clientes, inventario",
      "auto.ver_todos": "Ver todos",
      "auto.ver_1_0_0": "Ver. 1.0.0",
      "auto.versi_n_de_la_app": "Versión de la app",
      "auto.verticales": "Verticales",
      "auto.videoconferencias": "Videoconferencias",
      "auto.videos_generados": "Videos generados",
      "auto.vigente": "Vigente",
      "auto.vista_global_de_toda_tu_operaci_n_saas": "Vista global de toda tu operación SaaS",
      "auto.vista_previa": "Vista previa",
      "auto.voice_to_text": "Voice-to-text",
      "auto.volvix_ai_copilot": "Volvix AI Copilot",
      "auto.volvix_cedis": "Volvix CEDIS",
      "auto.volvix_core": "Volvix Core",
      "auto.volvix_hub": "Volvix Hub",
      "auto.volvix_mega_dashboard": "Volvix MEGA Dashboard",
      "auto.volvix_pos_mega_dashboard": "Volvix POS MEGA Dashboard",
      "auto.volvix_portal": "Volvix Portal",
      "auto.voz_espa_ol_mx": "Voz español MX",
      "auto.wallet_digital": "Wallet digital",
      "auto.wearables": "Wearables",
      "auto.web": "Web",
      "auto.webhooks_personalizados": "Webhooks personalizados",
      "auto.webinars": "Webinars",
      "auto.whatsapp": "WhatsApp",
      "auto.whatsapp_business": "WhatsApp Business",
      "auto.white_label": "White label",
      "auto.white_label_disponible": "White-label disponible",
      "auto.windows": "Windows",
      "auto.workers_queue": "Workers Queue",
      "auto.workflow_approvals": "Workflow approvals",
      "auto.y_muchas_m_s_funciones_incluidas": "Y muchas más funciones incluidas",
      "auto.zona_horaria": "Zona horaria",
      "auto.abarrotes_ferreter_a": "abarrotes, ferretería",
      "auto.activos_solicita_cambios_a_tu_proveedor": "activos. Solicita cambios a tu proveedor.",
      "auto.ai_assistant_v2": "ai-assistant-v2",
      "auto.autos_trajes_eventos": "autos, trajes, eventos",
      "auto.barber_a_est_tica": "barbería, estética",
      "auto.building": "building",
      "auto.con_migraci_n_asistida_gratuita": "con migración asistida gratuita",
      "auto.contratos_de_datos": "contratos de datos",
      "auto.custom": "custom",
      "auto.dark_mode_mobile": "dark-mode-mobile",
      "auto.deprecated": "deprecated",
      "auto.design_system": "design system",
      "auto.empleado": "empleado",
      "auto.failed": "failed",
      "auto.farmacia_cl_nica": "farmacia, clínica",
      "auto.hace_12m": "hace 12m",
      "auto.hace_14_min": "hace 14 min",
      "auto.hace_1d": "hace 1d",
      "auto.hace_1h": "hace 1h",
      "auto.hace_2h": "hace 2h",
      "auto.hace_3h": "hace 3h",
      "auto.hace_6h": "hace 6h",
      "auto.hace_9h": "hace 9h",
      "auto.legacy_export": "legacy-export",
      "auto.menos_de_7_d_as": "menos de 7 días",
      "auto.multi_region_db": "multi-region-db",
      "auto.new_billing_ui": "new-billing-ui",
      "auto.outbox": "outbox",
      "auto.pts": "pts",
      "auto.que_tu_negocio_merece": "que tu negocio merece",
      "auto.restaurante_caf": "restaurante, café",
      "auto.sales": "sales",
      "auto.salvadorex_com": "salvadorex.com",
      "auto.seats": "seats",
      "auto.sin_intervenci_n_humana": "sin intervención humana",
      "auto.solo_el_m_dulo_de_etiquetas": "solo el módulo de etiquetas",
      "auto.solo_quieren_imprimir_etiquetas": "solo quieren imprimir etiquetas",
      "auto.soporte_volvix_com_remoto": "soporte.volvix.com/remoto",
      "auto.staging_only": "staging only",
      "auto.success": "success",
      "auto.todo_en_uno": "todo-en-uno",
      "auto.v1_0_0": "v1.0.0",
      "auto.v3_0": "v3.0",
      "auto.v4_12_0": "v4.12.0",
      "auto.v4_12_1": "v4.12.1",
      "auto.v4_12_2": "v4.12.2",
      "auto.v4_12_3": "v4.12.3",
      "auto.v4_12_4_rc1": "v4.12.4-rc1",
      "auto.vs_1h_12min_de_un_t_cnico_humano": "vs 1h 12min de un técnico humano",
      "auto.vs_ayer": "vs ayer",
      "auto.vs_tu_stack_actual_de_saas_dispersos": "vs. tu stack actual de SaaS dispersos",
      "auto.webhook_retry_v3": "webhook-retry-v3",
      "auto.y_los_mismos": "y los mismos",
      "auto.y_recibe_los_cambios_desde_el_ltimo": "y recibe los cambios desde el último",
      "auto.rbol_de_marcas_blancas": "Árbol de marcas blancas",
      "auto.rdenes": "Órdenes",
      "auto.ltima_actividad": "Última actividad",
      "auto.ltima_compra": "Última compra",
      "auto.ltima_conexi_n": "Última conexión",
      "auto.ltima_sync": "Última sync",
      "auto.ltimas_decisiones_de_la_ia": "Últimas decisiones de la IA",
      "auto.ltimas_ventas_procesadas": "Últimas ventas procesadas",
      "auto.ltimo_abono": "Último abono",
      "auto.ltimos_6_meses": "Últimos 6 meses",
      "auto.ltimos_registros_de_dispositivos": "Últimos registros de dispositivos",
      "pos.change": "Cambio",
      "pos.payment": "Pago",
      "pos.receipt": "Recibo",
      "pos.print": "Imprimir",
      "pos.scan": "Escanear código",
      "pos.search.product": "Buscar producto",
      "pos.quantity": "Cantidad",
      "pos.price": "Precio",
      "product.name": "Nombre",
      "product.code": "Código",
      "product.barcode": "Código de barras",
      "product.category": "Categoría",
      "product.brand": "Marca",
      "product.stock": "Stock",
      "product.cost": "Costo",
      "product.price.sale": "Precio venta",
      "product.description": "Descripción",
      "product.image": "Imagen",
      "product.new": "Nuevo producto",
      "product.edit": "Editar producto",
      "product.delete": "Eliminar producto",
      "inv.title": "Inventario",
      "inv.in": "Entrada",
      "inv.out": "Salida",
      "inv.adjust": "Ajuste",
      "inv.transfer": "Traspaso",
      "inv.low": "Stock bajo",
      "inv.out_of_stock": "Agotado",
      "inv.warehouse": "Almacén",
      "customer.name": "Nombre",
      "customer.phone": "Teléfono",
      "customer.email": "Correo",
      "customer.address": "Dirección",
      "customer.rfc": "RFC",
      "customer.new": "Nuevo cliente",
      "customer.balance": "Saldo",
      "customer.credit": "Crédito",
      "report.sales": "Ventas",
      "report.daily": "Diario",
      "report.weekly": "Semanal",
      "report.monthly": "Mensual",
      "report.yearly": "Anual",
      "report.export": "Exportar",
      "report.from": "Desde",
      "report.to": "Hasta",
      "report.generate": "Generar reporte",
      "action.save": "Guardar",
      "action.cancel": "Cancelar",
      "action.delete": "Eliminar",
      "action.edit": "Editar",
      "action.add": "Agregar",
      "action.search": "Buscar",
      "action.filter": "Filtrar",
      "action.refresh": "Actualizar",
      "action.close": "Cerrar",
      "action.confirm": "Confirmar",
      "action.back": "Atrás",
      "action.next": "Siguiente",
      "action.finish": "Finalizar",
      "action.yes": "Sí",
      "action.no": "No",
      "msg.success": "Operación exitosa",
      "msg.error": "Ocurrió un error",
      "msg.loading": "Cargando...",
      "msg.saving": "Guardando...",
      "msg.confirm.delete": "¿Estás seguro de eliminar?",
      "msg.no_data": "Sin datos",
      "msg.no_results": "Sin resultados",
      "msg.welcome": "Bienvenido",
      "msg.goodbye": "Hasta pronto",
      "msg.required": "Campo obligatorio",
      "msg.saved": "Guardado correctamente",
      "msg.deleted": "Eliminado correctamente",
      "time.today": "Hoy",
      "time.yesterday": "Ayer",
      "time.tomorrow": "Mañana",
      "time.now": "Ahora",
      "time.minutes": "minutos",
      "time.hours": "horas",
      "time.days": "días",
      "plural.item.one": "{n} artículo",
      "plural.item.other": "{n} artículos",
      "plural.product.one": "{n} producto",
      "plural.product.other": "{n} productos",
      "common.save": "Guardar",
      "common.cancel": "Cancelar",
      "common.delete": "Eliminar",
      "common.edit": "Editar",
      "common.search": "Buscar",
      "common.export": "Exportar",
      "common.import": "Importar",
      "common.close": "Cerrar",
      "common.open": "Abrir",
      "common.new": "Nuevo",
      "common.view": "Ver",
      "common.status": "Estado",
      "common.type": "Tipo",
      "common.date": "Fecha",
      "common.user": "Usuario",
      "common.email": "Email",
      "common.phone": "Teléfono",
      "common.total": "Total",
      "common.subtotal": "Subtotal",
      "common.active": "Activos",
      "common.inactive": "Inactivos",
      "common.expires": "Vence",
      "common.expired": "Vencido",
      "common.version": "Versión",
      "common.system": "Sistema",
      "common.config": "Configuración",
      "common.logout": "Salir",
      "common.save_changes": "Guardar cambios",
      "common.no_results": "Sin resultados",
      "pos.products": "Productos",
      "pos.sales": "Ventas",
      "pos.customers": "Clientes",
      "pos.inventory": "Inventario",
      "pos.cash_register": "Caja",
      "pos.cashier": "Cajero",
      "pos.shift": "Turno",
      "pos.opening": "Apertura",
      "pos.dashboard": "Dashboard",
      "pos.reports": "Reportes",
      "pos.returns": "Devoluciones",
      "pos.quotes": "Cotizaciones",
      "pos.tickets": "Tickets",
      "pos.low_stock": "Stock bajo",
      "sales.new": "Nueva venta",
      "sales.cobrar": "Cobrar",
      "sales.cancel": "Cancelar venta",
      "sales.discount": "Descuento",
      "sales.today": "Ventas hoy",
      "sales.cash": "Ventas efectivo",
      "sales.card": "Ventas tarjeta",
      "sales.daily": "Ventas por día",
      "sales.top_products": "Top productos",
      "sales.total_to_collect": "Total a cobrar",
      "tenant.title": "Tenant",
      "tenant.list": "Tenants",
      "tenant.active": "Tenants activos",
      "tenant.plan": "Plan",
      "tenant.modules": "Módulos",
      "tenant.devices": "Dispositivos",
      "tenant.domain": "Dominio",
      "tenant.subdomain": "Subdominio",
      "tenant.vertical": "Vertical",
      "tenant.role.admin": "Administrador",
      "tenant.brand": "Marca",
      "tenant.commercial_name": "Nombre comercial",
      // R29: ampliación para mega-dashboard + admin-saas
      "dash.metrics_live": "Métricas en vivo",
      "dash.sales_today": "Ventas hoy",
      "dash.tickets": "Tickets",
      "dash.products": "Productos",
      "dash.customers": "Customers",
      "dash.tenants_active": "Tenants Activos",
      "dash.conversion": "Conversión",
      "dash.analytics": "Analytics",
      "dash.sales_7d": "Ventas Últimos 7 Días",
      "dash.sales_daily_mxn": "Suma diaria en MXN",
      "dash.system_health": "Salud del Sistema",
      "dash.uptime_general": "Uptime general",
      "dash.latency_avg": "Latencia avg",
      "dash.req_per_min": "Req/min",
      "dash.modules_available": "Módulos disponibles",
      "dash.recent_activity": "Actividad reciente",
      "dash.timeline": "Cronología",
      "dash.system_events": "Eventos del sistema",
      "dash.no_data_period": "Sin datos del periodo",
      "dash.no_data_weekly": "Sin datos de ventas semanales",
      // Admin SaaS
      "saas.dashboard_global": "Dashboard Global",
      "saas.realtime_panorama": "Panorama multi-tenant en tiempo real",
      "saas.last_update": "última actualización",
      "saas.export": "Exportar",
      "saas.last_30_days": "Últimos 30 días",
      "saas.new_tenant": "Nuevo Tenant",
      "saas.mrr": "MRR (Recurrente Mensual)",
      "saas.arr": "ARR (Recurrente Anual)",
      "saas.tenants_active": "Tenants Activos",
      "saas.churn_rate": "Churn Rate",
      "saas.open_incidents": "Incidentes Abiertos",
      "saas.nps_score": "NPS Score",
      "saas.revenue_growth": "Crecimiento de Ingresos · MRR",
      "saas.last_12_months": "Últimos 12 meses",
      "saas.plan_distribution": "Distribución por Plan",
      "saas.tenants": "tenants",
      "saas.users_total": "usuarios totales",
      "saas.no_plan_data": "Sin datos de planes",
      "saas.endpoint_unavail": "Endpoint no disponible",
      "saas.principal": "Principal",
      "saas.operations": "Operaciones",
      "saas.deploys": "Deploys",
      "saas.support": "Soporte",
      "saas.system_health": "System Health",
      "saas.alerts": "Alertas",
      "saas.database": "Base de Datos",
      "saas.settings": "Settings",
      "saas.plans_pricing": "Planes & Precios",
      "saas.security": "Seguridad",
      "saas.integrations": "Integraciones",
      "saas.audit_logs": "Audit Logs",
      "saas.preferences": "Ajustes",
      // Common UI
      "ui.live": "LIVE",
      "ui.online": "EN LÍNEA",
      "ui.offline": "Sin conexión",
      "ui.search_placeholder": "Buscar tenants, usuarios, transacciones...",
      "ui.notifications_title": "Notificaciones",
      "ui.theme": "Tema",
      "ui.no_data_available": "Catálogo no disponible",
      "ui.cargando_ordenes": "Cargando órdenes…",
      "ui.no_orders": "Sin órdenes registradas",
      "ui.error_loading": "Error cargando órdenes",
      // B4: ampliación crítica para auto-translate text walker
      "status.active": "Activo",
      "status.inactive": "Inactivo",
      "status.pending": "Pendiente",
      "status.transit": "En tránsito",
      "status.delivered": "Entregado",
      "status.invoiced": "Facturado",
      "status.rejected": "Rechazado",
      "status.approved": "Aprobada",
      "status.suspended": "Suspendido",
      "status.trial": "Trial",
      "status.online": "En línea",
      "ui.see_detail": "Ver detalle",
      "ui.see_all": "Ver todas",
      "ui.see_all_2": "Ver todos",
      "ui.export": "Exportar",
      "ui.filters": "Filtros",
      "ui.refresh": "Actualizar",
      "ui.export_btn": "Exportar",
      "ui.loading_dots": "Cargando…",
      "ui.no_data": "Sin datos",
      "ui.no_data_period": "Sin datos del periodo",
      "ui.no_orders_registered": "Sin órdenes registradas",
      "ui.no_tenants": "Sin tenants registrados",
      "ui.no_alerts": "Sin alertas activas",
      "ui.endpoint_unavail": "Endpoint no disponible",
      "ui.welcome_back": "Bienvenido de vuelta",
      "ui.account_status": "Aquí está el estado de tu cuenta hoy",
      "ui.summary": "Resumen General",
      "ui.dashboard": "Dashboard",
      "ui.configuration": "Configuración",
      "ui.preferences": "Ajustes",
      "ui.recent_orders": "Órdenes recientes",
      "ui.recent_activity": "Actividad reciente",
      "ui.quick_actions": "Acciones rápidas",
      "ui.global_activity": "Actividad Global",
      "ui.notifications": "Notificaciones",
      "ui.help": "Ayuda",
      "ui.profile": "Perfil",
      "ui.search": "Buscar",
      "ui.cancel": "Cancelar",
      "ui.save": "Guardar",
      "ui.confirm": "Confirmar",
      "ui.delete": "Eliminar",
      "ui.edit": "Editar",
      "ui.add": "Agregar",
      "ui.new": "Nuevo",
      "ui.close": "Cerrar",
      "ui.back": "Atrás",
      "ui.continue": "Continuar",
      "ui.next": "Siguiente",
      "ui.previous": "Anterior",
      "ui.action_required": "Acción requerida",
      "ui.last_30d": "Últimos 30 días",
      "ui.this_week": "Esta semana",
      "ui.this_month": "Este mes",
      "ui.month_over_month": "vs mes anterior",
      "ui.year_over_year": "YoY",
      "vendor.po": "PO",
      "vendor.buyer": "Comprador",
      "vendor.amount": "Monto",
      "vendor.delivery": "Entrega",
      "vendor.invoice": "Factura",
      "vendor.invoices": "Facturas",
      "vendor.payments": "Pagos",
      "vendor.purchase_orders": "Órdenes de Compra",
      "pos.opening": "Apertura",
      "pos.opening_cashbox": "Apertura de caja",
      "pos.assign_customer": "Asignar cliente",
      "pos.charge": "Cobrar",
      "pos.cash": "Efectivo",
      "pos.card": "Tarjeta",
      "pos.transfer": "Transferencia"
    }
  };

  // Idiomas disponibles (carga lazy salvo es)
  const AVAILABLE_LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja'];
  const I18N_BASE = (function() {
    try {
      const s = document.currentScript && document.currentScript.src;
      if (s) return s.replace(/[^/]*$/, '') + 'i18n/';
    } catch (e) {}
    return 'i18n/';
  })();
  const CACHE_PREFIX = 'volvix:i18n:cache:';
  const CACHE_VERSION = 'v1';
  const _loading = {}; // lang -> Promise

  function _cacheGet(lang) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + lang);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === CACHE_VERSION && parsed.d) return parsed.d;
    } catch (e) {}
    return null;
  }
  function _cacheSet(lang, dict) {
    try {
      localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify({ v: CACHE_VERSION, d: dict, t: Date.now() }));
    } catch (e) { /* quota */ }
  }

  async function loadLanguage(lang) {
    if (TRANSLATIONS[lang]) return TRANSLATIONS[lang];
    if (!AVAILABLE_LANGS.includes(lang)) return null;
    const cached = _cacheGet(lang);
    if (cached) { TRANSLATIONS[lang] = cached; return cached; }
    if (_loading[lang]) return _loading[lang];
    _loading[lang] = fetch(I18N_BASE + lang + '.json', { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(dict => {
        TRANSLATIONS[lang] = dict;
        _cacheSet(lang, dict);
        return dict;
      })
      .catch(err => {
        console.warn('[i18n] failed to load ' + lang + ':', err);
        delete _loading[lang];
        return null;
      });
    return _loading[lang];
  }

// ═══════════════════════════════════════════════════════════
  // CONFIG locale / moneda
  // ═══════════════════════════════════════════════════════════
  const LOCALES = {
    es: { locale: 'es-MX', currency: 'MXN', flag: '🇲🇽', name: 'Español' },
    en: { locale: 'en-US', currency: 'USD', flag: '🇺🇸', name: 'English' },
    pt: { locale: 'pt-BR', currency: 'BRL', flag: '🇧🇷', name: 'Português' },
    fr: { locale: 'fr-FR', currency: 'EUR', flag: '🇫🇷', name: 'Français' },
    de: { locale: 'de-DE', currency: 'EUR', flag: '🇩🇪', name: 'Deutsch' },
    it: { locale: 'it-IT', currency: 'EUR', flag: '🇮🇹', name: 'Italiano' },
    ja: { locale: 'ja-JP', currency: 'JPY', flag: '🇯🇵', name: '日本語' }
  };

  const FALLBACK = 'es';
  const STORAGE_KEY = 'volvix:lang';

  // Detectar idioma inicial
  let currentLang = localStorage.getItem(STORAGE_KEY);
  if (!currentLang || !AVAILABLE_LANGS.includes(currentLang)) {
    const navLang = (navigator.language || navigator.userLanguage || FALLBACK).slice(0, 2).toLowerCase();
    currentLang = AVAILABLE_LANGS.includes(navLang) ? navLang : FALLBACK;
  }

  // ═══════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════
  window.t = function(key, fallback, params) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS[FALLBACK];
    let text = dict[key] || TRANSLATIONS[FALLBACK][key] || fallback || key;
    if (params && typeof text === 'string') {
      Object.keys(params).forEach(p => {
        text = text.replace(new RegExp('\\{' + p + '\\}', 'g'), params[p]);
      });
    }
    return text;
  };

  window.tPlural = function(baseKey, n) {
    const suffix = n === 1 ? '.one' : '.other';
    return window.t(baseKey + suffix, null, { n: n });
  };

  window.formatNumber = function(n) {
    try { return new Intl.NumberFormat(LOCALES[currentLang].locale).format(n); }
    catch (e) { return String(n); }
  };

  window.formatCurrency = function(n) {
    try {
      return new Intl.NumberFormat(LOCALES[currentLang].locale, {
        style: 'currency', currency: LOCALES[currentLang].currency
      }).format(n);
    } catch (e) { return String(n); }
  };

  window.formatDate = function(d) {
    try {
      const dt = (d instanceof Date) ? d : new Date(d);
      return new Intl.DateTimeFormat(LOCALES[currentLang].locale, {
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(dt);
    } catch (e) { return String(d); }
  };

  window.formatDateTime = function(d) {
    try {
      const dt = (d instanceof Date) ? d : new Date(d);
      return new Intl.DateTimeFormat(LOCALES[currentLang].locale, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(dt);
    } catch (e) { return String(d); }
  };

  // ═══════════════════════════════════════════════════════════
  // R10c-B FIX-N3-4: Snapshot/Restore para preservar contexto al cambiar idioma
  // (carrito, modales abiertos, ruta, scroll position)
  // ═══════════════════════════════════════════════════════════
  const SNAPSHOT_KEY = 'volvix_i18n_state_snapshot';

  function captureStateSnapshot() {
    try {
      const snapshot = {
        ts: Date.now(),
        scrollY: window.scrollY || 0,
        scrollX: window.scrollX || 0,
        route: location.pathname + location.search + location.hash,
        cart: null,
        modal: null,
        formInputs: {}
      };
      // Cart: try multiple known storage keys
      const cartKeys = ['volvix_cart', 'volvix_pos_cart', 'cart', 'salvadorex_cart', 'volvix_kiosk_cart', 'volvix_shop_cart'];
      for (const k of cartKeys) {
        const v = localStorage.getItem(k);
        if (v) { snapshot.cart = { key: k, value: v }; break; }
      }
      // Detect open modal (data-modal-open, .modal.show, [aria-modal=true])
      const openModal = document.querySelector('[data-modal-open="true"], .modal.show, .modal.open, [aria-modal="true"]:not([hidden])');
      if (openModal) {
        snapshot.modal = {
          id: openModal.id || '',
          dataModal: openModal.getAttribute('data-modal') || '',
          className: openModal.className || ''
        };
      }
      // Capture form input values (so checkout flow doesn't lose data)
      const inputs = document.querySelectorAll('input[name]:not([type=password]), select[name], textarea[name]');
      inputs.forEach(el => {
        if (el.name && el.value) {
          snapshot.formInputs[el.name] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
        }
      });
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
      return snapshot;
    } catch (e) {
      console.warn('[i18n] captureStateSnapshot failed:', e);
      return null;
    }
  }

  function restoreStateSnapshot(snapshot) {
    if (!snapshot) return;
    try {
      // Restore scroll
      if (typeof snapshot.scrollY === 'number') {
        window.scrollTo(snapshot.scrollX || 0, snapshot.scrollY);
      }
      // Restore cart (re-write to localStorage if missing/different)
      if (snapshot.cart && snapshot.cart.key) {
        const current = localStorage.getItem(snapshot.cart.key);
        if (!current || current !== snapshot.cart.value) {
          localStorage.setItem(snapshot.cart.key, snapshot.cart.value);
        }
      }
      // Restore form inputs
      if (snapshot.formInputs) {
        Object.keys(snapshot.formInputs).forEach(name => {
          const el = document.querySelector(`[name="${CSS.escape(name)}"]`);
          if (!el) return;
          const v = snapshot.formInputs[name];
          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = !!v;
          } else if (el.value !== v) {
            el.value = v;
          }
        });
      }
      // Re-open modal if it was open (delegate to app via event)
      if (snapshot.modal) {
        window.dispatchEvent(new CustomEvent('volvix:i18n:restoreModal', { detail: snapshot.modal }));
        // Try to re-show by id if app uses common patterns
        if (snapshot.modal.id) {
          const m = document.getElementById(snapshot.modal.id);
          if (m) {
            m.classList.add('show', 'open');
            m.removeAttribute('hidden');
            m.setAttribute('aria-modal', 'true');
            m.setAttribute('data-modal-open', 'true');
          }
        }
      }
      // Notify app for any custom restore logic
      window.dispatchEvent(new CustomEvent('volvix:i18n:stateRestored', { detail: snapshot }));
    } catch (e) {
      console.warn('[i18n] restoreStateSnapshot failed:', e);
    }
  }

  window.setLanguage = async function(lang) {
    if (!AVAILABLE_LANGS.includes(lang)) return false;
    // FIX-N3-4: capture state BEFORE language change
    const snapshot = captureStateSnapshot();
    if (!TRANSLATIONS[lang]) {
      const dict = await loadLanguage(lang);
      if (!dict) return false;
    }
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    translateAll();
    updateSelectorButton();
    // FIX-N3-4: restore state AFTER re-render (next tick to let DOM settle)
    setTimeout(() => restoreStateSnapshot(snapshot), 50);
    window.dispatchEvent(new CustomEvent('volvix:langchange', { detail: { lang: lang, snapshot: snapshot } }));
    return true;
  };

  // Expose snapshot helpers for app code
  window.__volvixI18nSnapshot = { capture: captureStateSnapshot, restore: restoreStateSnapshot };

  // ═══════════════════════════════════════════════════════════
  // DOM helpers
  // ═══════════════════════════════════════════════════════════
  // Build inverse map: lowercased Spanish text → translation key (lazy)
  let _esIndex = null;
  function buildEsIndex() {
    if (_esIndex) return _esIndex;
    _esIndex = {};
    const es = TRANSLATIONS.es || {};
    for (const key in es) {
      const txt = String(es[key] || '').trim();
      if (txt && txt.length >= 2 && txt.length <= 60) {
        const k = txt.toLowerCase();
        if (!_esIndex[k]) _esIndex[k] = key;
      }
    }
    return _esIndex;
  }

  // Walk text nodes and translate Spanish text to current language
  function autoTranslateTextNodes() {
    if (currentLang === 'es') return; // no-op when in Spanish
    const idx = buildEsIndex();
    const dict = TRANSLATIONS[currentLang] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = (p.tagName || '').toUpperCase();
        if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const toTranslate = [];
    let node;
    while ((node = walker.nextNode())) toTranslate.push(node);
    toTranslate.forEach(n => {
      const original = n.nodeValue;
      const trimmed = original.trim();
      if (!trimmed) return;
      const lookup = trimmed.toLowerCase();
      const key = idx[lookup];
      if (!key) return;
      if (!n._volvixOriginal) n._volvixOriginal = original;
      const translated = dict[key];
      if (translated && translated !== trimmed) {
        // preserve whitespace
        const pre = original.match(/^\s*/)[0];
        const post = original.match(/\s*$/)[0];
        n.nodeValue = pre + translated + post;
      } else if (currentLang === 'es' && n._volvixOriginal) {
        n.nodeValue = n._volvixOriginal;
      }
    });
    // Also placeholders and titles without data-i18n
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      if (!el._origPlaceholder) el._origPlaceholder = el.placeholder;
      const k = idx[String(el._origPlaceholder).trim().toLowerCase()];
      if (k && dict[k]) el.placeholder = dict[k];
    });
    document.querySelectorAll('[title]').forEach(el => {
      if (!el._origTitle) el._origTitle = el.getAttribute('title') || '';
      const k = idx[String(el._origTitle).trim().toLowerCase()];
      if (k && dict[k]) el.setAttribute('title', dict[k]);
    });
    document.querySelectorAll('button[value], input[type=button][value], input[type=submit][value]').forEach(el => {
      if (!el._origValue) el._origValue = el.value;
      const k = idx[String(el._origValue).trim().toLowerCase()];
      if (k && dict[k]) el.value = dict[k];
    });
  }

  // Restore original Spanish text when switching back to es
  function restoreSpanish() {
    document.querySelectorAll('input, textarea, button').forEach(el => {
      if (el._origPlaceholder !== undefined) el.placeholder = el._origPlaceholder;
      if (el._origValue !== undefined && 'value' in el) el.value = el._origValue;
    });
    document.querySelectorAll('[title]').forEach(el => {
      if (el._origTitle !== undefined) el.setAttribute('title', el._origTitle);
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node._volvixOriginal) node.nodeValue = node._volvixOriginal;
    }
  }

  function translateAll() {
    // 1) Explicit data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (!el.dataset.i18nOriginal) el.dataset.i18nOriginal = el.textContent;
      el.textContent = window.t(key, el.dataset.i18nOriginal);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = window.t(key, el.placeholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      el.title = window.t(key, el.title);
    });
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.dataset.i18nValue;
      el.value = window.t(key, el.value);
    });
    // 2) Auto-translate text nodes (NEW)
    if (currentLang === 'es') {
      restoreSpanish();
    } else {
      try { autoTranslateTextNodes(); } catch(e) { console.warn('[i18n] auto-translate failed:', e); }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Selector flotante
  // ═══════════════════════════════════════════════════════════
  let selectorBtn = null;
  let dropdownEl = null;

  function updateSelectorButton() {
    if (selectorBtn) selectorBtn.innerHTML = LOCALES[currentLang].flag;
  }

  function createLangSelector() {
    selectorBtn = document.createElement('button');
    selectorBtn.id = 'volvix-i18n-btn';
    selectorBtn.innerHTML = LOCALES[currentLang].flag;
    selectorBtn.title = 'Idioma / Language / Idioma';
    // Inline (non-floating): position:relative so it sits in the normal flow
    selectorBtn.style.cssText = [
      'position:relative',
      'width:44px', 'height:44px', 'border-radius:50%',
      'background:#fff', 'border:2px solid #2563eb',
      'cursor:pointer', 'font-size:22px', 'z-index:1',
      'display:flex', 'align-items:center', 'justify-content:center',
      'transition:transform .2s'
    ].join(';');
    selectorBtn.onmouseenter = () => selectorBtn.style.transform = 'scale(1.1)';
    selectorBtn.onmouseleave = () => selectorBtn.style.transform = 'scale(1)';
    selectorBtn.onclick = (e) => {
      e.stopPropagation();
      toggleDropdown();
    };

    // Mount inline: prefer existing #volvix-i18n-slot in header, else append to header, else body
    const slot = document.getElementById('volvix-i18n-slot');
    if (slot) {
      slot.appendChild(selectorBtn);
    } else {
      const header = document.querySelector('header');
      if (header) {
        const slotDiv = document.createElement('div');
        slotDiv.id = 'volvix-i18n-slot';
        slotDiv.style.cssText = 'display:inline-flex;align-items:center;margin-left:auto;';
        slotDiv.appendChild(selectorBtn);
        header.appendChild(slotDiv);
      } else {
        document.body.appendChild(selectorBtn);
      }
    }

    dropdownEl = document.createElement('div');
    dropdownEl.id = 'volvix-i18n-dropdown';
    dropdownEl.style.cssText = [
      'position:absolute', 'top:50px', 'right:0',
      'background:#fff', 'border:1px solid #ccc', 'border-radius:8px',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'z-index:9990', 'display:none', 'min-width:160px',
      'font-family:system-ui,sans-serif', 'font-size:14px'
    ].join(';');

    Object.keys(LOCALES).forEach(code => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;';
      item.innerHTML = '<span style="font-size:20px">' + LOCALES[code].flag + '</span><span>' + LOCALES[code].name + '</span>';
      item.onmouseenter = () => item.style.background = '#f3f4f6';
      item.onmouseleave = () => item.style.background = '';
      item.onclick = () => {
        window.setLanguage(code);
        hideDropdown();
      };
      dropdownEl.appendChild(item);
    });

    // Dropdown attached to button's parent for relative positioning
    selectorBtn.style.position = 'relative';
    const wrapper = selectorBtn.parentElement || document.body;
    wrapper.style.position = wrapper.style.position || 'relative';
    wrapper.appendChild(dropdownEl);
    document.addEventListener('click', hideDropdown);
  }

  function toggleDropdown() {
    if (!dropdownEl) return;
    dropdownEl.style.display = dropdownEl.style.display === 'block' ? 'none' : 'block';
  }
  function hideDropdown() {
    if (dropdownEl) dropdownEl.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════
  function init() {
    document.documentElement.lang = currentLang;
    createLangSelector();
    if (currentLang !== 'es' && !TRANSLATIONS[currentLang]) {
      loadLanguage(currentLang).then(() => translateAll()).catch(() => translateAll());
    } else {
      translateAll();
    }
    // Re-traducir periódicamente para SPA dinámicas
    setInterval(translateAll, 3000);
    // MutationObserver para nodos nuevos
    if (window.MutationObserver) {
      const obs = new MutationObserver(() => translateAll());
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.I18nAPI = {
    t: window.t,
    tPlural: window.tPlural,
    setLanguage: window.setLanguage,
    current: () => currentLang,
    available: () => AVAILABLE_LANGS.slice(),
    locale: () => LOCALES[currentLang],
    formatNumber: window.formatNumber,
    formatCurrency: window.formatCurrency,
    formatDate: window.formatDate,
    formatDateTime: window.formatDateTime,
    retranslate: translateAll,
    loadLanguage: loadLanguage,
    // R10c-B FIX-N3-4
    captureState: captureStateSnapshot,
    restoreState: restoreStateSnapshot
  };

  // Namespace Volvix.i18n (alias) — Volvix.i18n.setLanguage('en') sin reload
  window.Volvix = window.Volvix || {};
  window.Volvix.i18n = window.I18nAPI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
