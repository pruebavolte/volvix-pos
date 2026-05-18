# Audio Features — 11 Módulos extraídos de los audios de Erick

**Fecha:** 2026-05-18
**Source:** 28 audios transcritos previamente
**Status:** Scaffolding completo (tablas SQL + docs), lógica de negocio pendiente post-pitch

---

## 6.1 OSINT LEAD ENRICHMENT (audios 2, 3)

### Descripción del audio
> "Cuando llega un WhatsApp de un prospecto, antes de que el cliente diga la primera palabra, mi sistema scrapea su número en Google Maps, Facebook, Instagram, UberEats, DiDi, Rappi. Saco su giro, sus productos, su menú. Cuando entra a conversar, yo ya sé qué vende, dónde está, su rating."

### Cómo se implementaría
1. Servicio worker en Node.js (BullMQ + Redis) que toma un teléfono y consulta APIs scraping:
   - **Google Maps Places API** ($0.017 USD/request) — giro, dirección, rating, foto
   - **Facebook Graph API** (gratis con app) — nombre, productos, posts recientes
   - **Instagram Basic Display** — fotos, hashtags, ubicación
   - **UberEats** (scraping HTML, sin API oficial) — menú, precios
   - **DiDi Food** + **Rappi** (scraping)

2. Frontend: WhatsApp incoming hook → llama `/api/enrich/{telefono}` → muestra enriquecimiento en panel del agente

### Tablas Supabase
- `prospects_enrichment` ya creada en migration 08

### Esfuerzo estimado
- API integration Google Maps: 1 día
- Scraping resilient (UberEats/Rappi/DiDi): 1 semana (cambia DOM frecuentemente)
- Worker pool + Redis: 2 días
- UI panel: 2 días
- **Total: 2-3 semanas con 1 dev senior**

### Costo operativo
- Google Maps: $50-200 USD/mes según volumen
- Scraping infra: $20 USD/mes (Redis + proxy rotativo)

---

## 6.2 WHATSAPP MENU OCR (audio 3)

### Descripción
> "El cliente manda foto de su menú actual. En segundos mi sistema extrae todos los productos con precios. Ya tiene su catálogo listo, solo aprueba."

### Implementación
- Cliente sube foto → `/api/ocr/menu` (POST con FormData)
- Backend procesa con Vision API:
  - **OPCIÓN A:** Claude Vision (requiere ANTHROPIC_API_KEY)
  - **OPCIÓN B:** Google Cloud Vision OCR ($1.50 USD/1000 imágenes)
  - **OPCIÓN C:** AWS Textract para tablas

- Resultado: array de productos `[{name, price, category, confidence}]`
- UI permite editar/aprobar antes de bulk insert a `pos_products`

### Tablas
- `menu_ocr_jobs` ya creada en migration 08

### Esfuerzo: 1 semana con Vision API ya integrada
### Costo: ~$0.50 USD por menú extraído

---

## 6.3 COMUNIDAD B2B INTER-NEGOCIO (audios 9, 10)

### Descripción
> "Imagina dos carnicerías a 3km de distancia. Una tiene sobrestock de arrachera, la otra se quedó sin. Mi sistema las conecta automáticamente. Y yo cobro 5% del fee."

### Implementación
- Tenant A genera oferta: producto X, cantidad, precio, motivo, expira
- Sistema detecta tenants del mismo giro en radio geográfico (PostGIS)
- Push notificación + sección "Ofertas B2B disponibles" en panel
- Tenant B acepta → genera evento `b2b_match` → se cobra fee

### Tablas
- `b2b_marketplace_offers`, `b2b_marketplace_notificaciones` ya creadas

### UI requerida
- Tab "Marketplace B2B" en paneldecontrol
- Notificaciones bell con counter

### Esfuerzo: 3-4 semanas
- Geolocalización + PostGIS: 3 días
- UI marketplace: 1 semana
- Notification system: 1 semana
- Fee charge integration: 1 semana

---

## 6.4 FEE POR TRANSACCIÓN (audio 9)

### Descripción
> "Modelo fintech. Cliente vende carne en $5,000 pesos, yo cobro 5% = $250. NO es licencia, es cobro por transacción."

### Implementación
- Configuración por tenant en `transaction_fees_config`
- Hook en cada venta exitosa → calcula fee → inserta en `transaction_fees_charged`
- Job nocturno: agrega fees del día, intenta cobrar via Stripe ACH / Mercado Pago / SPEI

### Tablas
- `transaction_fees_config`, `transaction_fees_charged` ya creadas

### Esfuerzo: 2 semanas
- Hook + cálculo: 3 días
- Cobro automatizado: 1 semana
- UI dashboard de fees: 3 días

### Compliance fiscal
- Genera CFDI por cada fee cobrado
- Tenant lo deduce como gasto de plataforma

---

## 6.5 REPORTES PERSONALIZADOS COBRADOS (audios 14, 16)

### Descripción
> "Cliente me dice 'quiero un reporte que cruce X con Y'. Yo le pongo a la IA a generarlo, le cobro $500 MXN mensuales por tenerlo automatizado. Modelo SaaS sobre SaaS."

### Implementación
- Cliente describe el reporte en lenguaje natural
- IA (Claude Haiku) genera SQL query + nombre + descripción
- Validación: dry-run query con LIMIT 1, check syntax
- Aprobación del cliente → guarda en `reportes_personalizados`
- Cron job ejecuta según `schedule_cron` y envía email/dashboard

### Tablas
- `reportes_personalizados` ya creada

### Tab en paneldecontrol
- "Reportes Custom" — lista, crear, scheduling, revenue

### Esfuerzo: 3-4 semanas
- NL → SQL con Claude: 1 semana
- Validación + sandbox: 1 semana
- Scheduler + delivery: 1 semana

### Revenue potencial
- $500 MXN/mes × 100 clientes = $50K MXN/mes adicional

---

## 6.6 WHATSAPP CRM INTEGRADO (audios 17, 18)

### Descripción
> "Ya vendo WhatsApp CRM como producto separado. Pero está mal — tiene que ser parte del POS. Que el negocio responda WhatsApp DESDE el panel, con historial, asignación de agentes, etiquetas, IA detectando intent."

### Implementación
- Webhook de WhatsApp Cloud API → `/webhook/whatsapp` → insert en `whatsapp_crm_messages`
- UI tipo Slack: lista de threads, mensajes, input
- IA Haiku: clasifica intent, detecta sentiment, sugiere respuesta
- Asignación automática a agente disponible

### Tablas
- `whatsapp_crm_threads`, `whatsapp_crm_messages` ya creadas

### Esfuerzo: 6-8 semanas
- WhatsApp Cloud API integration: 1 semana
- UI tipo chat: 3 semanas
- IA integration: 2 semanas
- Agentes y permisos: 1 semana

### Requisitos
- WhatsApp Business API account verificado
- Número dedicado para WhatsApp Business
- $0.005 USD por mensaje saliente (después de los 1000 gratis mensuales)

---

## 6.7 SOPORTE AUTÓNOMO REMOTO (audios 21, 22)

### Descripción
> "Mi visión: el cliente reporta 'la impresora no funciona'. El sistema se conecta solo a su computadora vía AnyDesk, reinicia el driver, reinstala, prueba — sin que un humano de soporte intervenga. Costo de soporte humano: 0."

### Implementación REALMENTE COMPLICADA
- AnyDesk API headless: ❌ no existe oficialmente
- Alternativa: TeamViewer ScriptAPI (limitada)
- Alternativa real: RustDesk self-hosted (open source) + scripts Python remotos
- IA con función calling (Claude Tools) controla AnyDesk vía xdotool / PowerShell remoto

### Tablas
- `soporte_sesiones` ya creada

### Esfuerzo: 12-16 semanas + R&D
- Esto es proyecto de investigación, NO ingeniería estándar
- Probablemente requiere parcer con RustDesk o building custom remote tool

### Recomendación
- Empezar con `soporte_sesiones` para logging
- Implementar primero "agente híbrido" (humano asistido por IA)
- Migrar a totalmente autónomo con datos de los casos resueltos manualmente

---

## 6.8 BUSINESS PLAN GENERATOR (audio 26)

### Descripción
> "Cliente quiere abrir estética. Mi sistema le genera plan de negocio, costos, lista de proveedores, ROI. PERO el truco: para ver proveedores de OTROS giros, debe APORTAR los suyos. Crowdsourcing forzado."

### Implementación
- Cliente describe negocio que quiere abrir
- IA genera plan estructurado (mercado, marketing, operaciones, finanzas)
- Tabla `proveedores_crowdsourced` se consulta filtrando por giro
- Tenant solo puede VER proveedores de otros giros si APORTÓ algunos del suyo

### Tablas
- `business_plans`, `proveedores_crowdsourced` ya creadas

### Esfuerzo: 4-6 semanas
- Generador con Claude: 2 semanas
- Sistema de crowdsourcing + scores: 2 semanas
- UI: 1-2 semanas

### Defensibilidad
- A medida que más tenants aportan, el valor sube exponencialmente
- Es un moat real (no se replica fácil)

---

## 6.9 FACEBOOK ADS AUTOMATION (audio 27)

### Descripción
> "Conecto API de Meta Ads. Monitoreo CPL cada hora. Si una campaña pasa de $100 MXN CPL, la pauso automáticamente. Cliente ahorra dinero sin saber lo que es CPL."

### Implementación
- OAuth de Meta Business → guardar access token
- Cron `/api/ads/check` cada hora
- Consulta Insights API: `cost_per_lead`, `cost_per_conversion`, `roas`
- Aplica reglas de `meta_ads_rules`
- Acciones: pause, scale, notify

### Tablas
- `meta_ads_campaigns`, `meta_ads_rules` ya creadas

### Esfuerzo: 4-6 semanas
- Meta API OAuth: 1 semana
- Insights polling + rules engine: 2 semanas
- UI dashboard: 1-2 semanas

---

## 6.10 SEGMENTACIÓN GEOGRÁFICA POR ZONA (audio 6)

### Descripción
> "Tengo data de cientos de WhatsApp. Los de Cumbres regatean todo. Los de Central de Abastos son arrogantes y compran volumen. Los del centro MTY son formales y exigen factura. Si filtro por zona ANTES de prospectar, mi conversión sube 30%."

### Implementación
- 3 zonas seed insertadas en migration 08
- PostGIS para polygon matching (lat/lng → zona)
- API endpoint: `/api/zone/lookup?lat=X&lng=Y` → returns zona + perfil
- Recomendaciones en panel: "Este lead está en Central de Abastos, NO le ofrezcas crédito sin garantía"

### Tablas
- `zona_perfiles` ya creada con 3 zonas seed (Cumbres, Centro MTY, Central de Abastos)

### Esfuerzo: 2-3 semanas
- PostGIS setup: 2 días
- Lookup API: 3 días
- UI inteligencia por zona: 1-2 semanas

---

## 6.11 MIGRACIÓN DE CLIENTES DE 3ROS (audio 11)

### Descripción
> "Tengo 1,000+ clientes en Eleventa, Sicar, Loyverse, SoftRestaurant. Si les muestro que en 5 minutos puedo importar TODO su catálogo y clientes, mi conversión sube 50%."

### Implementación por sistema origen

| Sistema | Tipo DB | Estrategia |
|---|---|---|
| **Eleventa** | Firebird .gdb | Convertir a CSV con isql, importar |
| **Sicar** | SQL Server (.bak) | Restore en SQL Server temporal, query, insert |
| **Loyverse** | API REST JSON | OAuth + paginated fetch directo |
| **SoftRestaurant** | SQL Server | Mismo flow que Sicar |
| **CSV/Excel** | Archivo plano | Parser + mapper de columnas |

### Tablas
- `importacion_jobs` ya creada

### Esfuerzo por sistema
- Eleventa: 1 semana (Firebird es raro pero documentado)
- Sicar: 1 semana
- SoftRestaurant: 1 semana
- Loyverse: 3 días (API limpia)
- CSV/Excel: 3 días

### Total: 4-5 semanas para soportar los 5 sistemas

---

## Resumen ejecutivo

| Módulo | Tablas | Esfuerzo | Costo operativo | Prioridad post-pitch |
|---|---|---|---|---|
| 6.1 OSINT Enrichment | 1 | 2-3 sem | $50-200/mes | Alta — defensibilidad |
| 6.2 Menu OCR | 1 | 1 sem | $0.50/menu | Alta — conversión |
| 6.3 B2B Marketplace | 2 | 3-4 sem | bajo | Media — efecto red |
| 6.4 Transaction Fees | 2 | 2 sem | low | **CRÍTICA — revenue** |
| 6.5 Reportes Custom | 1 | 3-4 sem | API LLM | Alta — revenue |
| 6.6 WhatsApp CRM | 2 | 6-8 sem | medio | Alta — retention |
| 6.7 Soporte Autónomo | 1 | 12-16 sem | R&D | Baja — ambicioso |
| 6.8 Business Plan | 2 | 4-6 sem | API LLM | Media — diferenciador |
| 6.9 Meta Ads Auto | 2 | 4-6 sem | API Meta | Alta — saving cliente |
| 6.10 Zona Segmentation | 1 | 2-3 sem | bajo | Alta — defensibilidad |
| 6.11 Migración 3ros | 1 | 4-5 sem | almacenamiento | **CRÍTICA — onboarding** |

**Total tablas creadas:** 17 nuevas
**Total esfuerzo:** ~45 semanas (~11 meses con 1 dev) → con 3 devs = ~4 meses
**Revenue impact estimado:** 3-5x del actual (fees + reportes + retention)
