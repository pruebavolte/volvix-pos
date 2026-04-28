# SalvadoreX POS — Sales Playbook

> Guia oficial del vendedor / customer success de Volvix POS (SalvadoreX).
> Toda interacción con prospecto que entre por WhatsApp, llamada o web debe seguir este playbook.
> Última actualización: 2026-04-28.

---

## 1. Elevator Pitch (30 segundos)

> "SalvadoreX es el punto de venta en la nube más completo de México: vendes en 30 segundos, llevas inventario en tiempo real, facturas CFDI, controlas múltiples sucursales y nunca pierdes una venta aunque se caiga el internet. Lo configuramos en 3 minutos para tu giro (cafetería, restaurante, farmacia, boutique, etc.) y arrancas con 14 días gratis sin tarjeta. Si Aspel o MicroSIP te cobran $8,000/año por una licencia que solo corre en una computadora, nosotros te damos lo mismo y más por $399/mes en cualquier dispositivo."

### Versión 15s (para llamada en frío)

> "Hola, soy de SalvadoreX. Le ayudamos a negocios como el suyo a vender más rápido y dejar de perder dinero por inventario descuadrado. ¿Tiene 5 minutos para una demo?"

### Versión 60s (para reunión presencial)

Mismo guión expandido:
1. Problema: "Los POS tradicionales son caros, requieren hardware, no facturan, no tienen multi-sucursal".
2. Solución: "Nosotros: nube, multi-dispositivo, CFDI, multi-sucursal, offline, soporte 24/7".
3. Prueba: "+1,200 negocios activos en México, +60 giros configurados".
4. Pedido: "Démosle 14 días gratis y si no le gusta, no paga nada".

---

## 2. Demo Flow — 5 minutos

Orden estricto. NO improvisar.

### Minuto 0:00–0:30 — Onboarding wizard
- Abre `https://salvadorex.com/web/v25` en pestaña incógnito.
- Click "Empezar" → muestra wizard 8 pasos.
- Llena: nombre negocio, giro = "Cafetería", módulos = preset cafetería.
- Click "Crear cuenta demo" → bootstrap demo data (10 productos, 3 categorías).
- **Punto clave**: "En 30 segundos ya tienes catálogo, productos, categorías".

### Minuto 0:30–1:30 — Primera venta POS
- Click "POS".
- Agrega 3 productos con click rápido.
- Aplica descuento 10%.
- Cobrar tarjeta → modal Stripe (sandbox).
- Imprimir ticket → PDF en pantalla.
- **Punto clave**: "Una venta completa en menos de 1 minuto".

### Minuto 1:30–2:30 — Inventario + Etiquetas
- Click "Inventario".
- Sube CSV (tener archivo demo `productos-cafe-demo.csv` listo).
- Selecciona 5 productos → "Generar etiquetas con código de barras".
- Diseña etiqueta tamaño 50×30mm con QR + precio.
- Imprime PDF.
- **Punto clave**: "No necesitas comprar Bartender ni software extra".

### Minuto 2:30–3:30 — Reportes + Cortes
- Click "Reportes" → muestra ventas del día (ya hay datos por la venta de paso 2).
- Filtra por método de pago, por usuario, por categoría.
- Click "Cortes Z" → genera PDF firmado del corte.
- **Punto clave**: "Tu contador te lo va a agradecer".

### Minuto 3:30–4:30 — CFDI + Customers
- Click "Customers" → crea cliente con RFC.
- Vuelve a una venta → "Facturar".
- Genera CFDI 4.0 (sandbox Facturama).
- Envía por email automático.
- **Punto clave**: "Facturación incluida, sin Aspel ni Contpaq".

### Minuto 4:30–5:00 — Cierre
- Resume: "POS, Inventario, Etiquetas, Reportes, CFDI, Multi-sucursal, Offline, todo en una sola plataforma".
- "Le creo su cuenta ahora mismo y le mando los accesos por WhatsApp, ¿le parece?"
- Si dice sí → mandar onboarding.
- Si duda → ir a sección Objections.

---

## 3. Objection Handling

### Objeción 1: "Es muy caro"

**Respuesta**:
> "Entiendo. Comparemos: una licencia anual de Aspel SAE cuesta $7,800 + $3,500 de instalación + $1,200/año de soporte = $12,500 el primer año, solo para una computadora. MicroSIP igual. Nosotros: $399/mes = $4,788/año, dispositivos ilimitados, soporte 24/7, actualizaciones automáticas. Ahorra $7,712 el primer año."

**Tabla rápida**:
| Concepto | Aspel SAE | MicroSIP | SalvadoreX |
|---|---|---|---|
| Licencia inicial | $7,800 | $6,500 | $0 |
| Instalación | $3,500 | $2,000 | $0 |
| Soporte/año | $1,200 | $1,000 | Incluido |
| Dispositivos | 1 | 1 | Ilimitado |
| Multi-sucursal | $$ extra | No | Incluido |
| CFDI | Aparte | Aparte | Incluido |
| Offline | No | No | Sí |
| Total año 1 | $12,500 | $9,500 | $4,788 |

### Objeción 2: "No sé usar tecnología"

**Respuesta**:
> "Por eso tenemos onboarding asistido. Te tomamos de la mano por 8 pasos guiados (3 minutos), te dejamos demo data ya cargada, y nuestro equipo te llama por video los primeros 3 días para resolver dudas. Además, el sistema es como una app de celular: 3 botones grandes y ya."

**Plus**: ofrecer "Tour guiado en vivo gratis" agendado por Calendly.

### Objeción 3: "Mi negocio es muy chico"

**Respuesta**:
> "Mejor aún: tenemos plan Starter $0 por 14 días sin tarjeta. Si vendes menos de $30,000/mes, te vas con el plan Lite a $199/mes. Negocios chicos son nuestros mejores clientes porque no cargan con software heredado caro."

### Objeción 4: "Tengo Aspel/MicroSIP, ¿migro?"

**Respuesta**:
> "Sí, sin perder un solo dato. Tenemos importador CSV asistido: nos exportas tu catálogo de productos y clientes en CSV, lo subes y queda en 5 minutos. También respetamos tus folios de facturación. Te lo hacemos nosotros gratis si quieres."

**Pasos**:
1. Aspel → Catálogos → Productos → Exportar Excel.
2. Convertir a CSV (template lo damos).
3. Subir en `/web/v25/inventory/import-csv`.
4. Validar y confirmar.

### Objeción 5: "¿Y si se cae internet?"

**Respuesta**:
> "Sigues vendiendo. SalvadoreX tiene modo offline en PWA: cobras, imprimes ticket, todo. Cuando vuelve internet, sincroniza automáticamente. Es la única razón por la que muchos clientes nos eligen sobre Aspel: Aspel no tiene cómo."

**Tech**: PWA + IndexedDB + sync queue (R6b/R8a). Probado en cafés con WiFi malo.

### Objeción 6: "¿Y mi competencia ve mis ventas?"

**Respuesta**:
> "Imposible. Cada negocio es un tenant aislado con Row Level Security a nivel base de datos. Ni siquiera nuestro CEO puede ver tus ventas sin tu autorización explícita. Además, audit log registra cada acceso. Cumplimos GDPR y LFPDPPP."

**Tech**: PostgreSQL RLS por tenant_id. Audit trail en tabla `audit_log`.

### Objeción 7: "¿Funciona en mi tablet vieja?"

**Respuesta**:
> "Sí. Es web, corre en cualquier navegador moderno (Chrome, Safari, Edge) en Android, iOS, Windows. Hasta en una tablet de $1,500. Y si quieres, instalas la PWA y la usas como app nativa sin descargar nada de Play Store."

**Mínimo**: 2GB RAM, navegador moderno (últimos 2 años).

### Objeción 8: "¿Tengo que comprar hardware?"

**Respuesta**:
> "No. Funciona con lo que ya tienes: tu celular, tablet, laptop, computadora. Solo si quieres impresora térmica de tickets es opcional ($600 en Amazon). Lector de código de barras también opcional ($300). Pero no hardware obligatorio."

### Objeción 9: "¿Soporta CFDI?"

**Respuesta**:
> "Sí, CFDI 4.0 vía Facturama integrado. Generas factura desde el POS en 1 click, se manda al cliente por email automáticamente. Manejamos retenciones, complementos de pago, notas de crédito. Tienes folios ilimitados en plan Pro."

**Status**: Esperando keys de Facturama producción del cliente. Actualmente sandbox.

### Objeción 10: "¿Cuánto tarda configurar?"

**Respuesta**:
> "3 minutos para arrancar con demo data. Si quieres tu catálogo real, súbelo en CSV (5 min más) o lo cargamos nosotros gratis si nos mandas tu lista. Total: 8 minutos para empezar a vender de verdad."

### Bonus — Objeciones secundarias

- **"¿Y si me arrepiento?"** → "Cancelas cuando quieras. Plan mensual sin contrato anual. Te exportamos toda tu data en ZIP (R8c GDPR export)."
- **"¿Tienen app nativa?"** → "PWA + Capacitor wrapper para Play Store/App Store en plan Pro+."
- **"¿Manejan inventario por sucursal?"** → "Sí, multi-tenant + multi-branch. Cada sucursal su propio stock, traspasos entre sucursales, reportes consolidados."
- **"¿Pueden integrar con Shopify/WooCommerce?"** → "Sí, integración Shopify nativa (R12 wirings). WooCommerce vía Zapier."

---

## 4. Pricing Comparison vs Competidores

### Tabla maestra (precios MXN 2026)

| Plan SalvadoreX | Precio | Ventas/mes | Productos | Sucursales | Usuarios | CFDI/mes | Soporte |
|---|---|---|---|---|---|---|---|
| Starter (14 días) | $0 | Ilimitado | 50 | 1 | 1 | 0 | Email |
| Lite | $199 | $30,000 | 500 | 1 | 2 | 50 | Email |
| Pro | $399 | $100,000 | Ilimitado | 3 | 10 | 200 | WhatsApp 24/7 |
| Business | $799 | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Dedicado |
| Enterprise | Contactar | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | SLA 99.9% |

### Vs Aspel SAE (Año 1)

| Concepto | Aspel SAE | SalvadoreX Pro |
|---|---|---|
| Setup | $11,300 | $0 |
| Licencia | $7,800/año | $4,788/año |
| Hardware necesario | $25,000 (PC dedicada) | $0 |
| Total año 1 | **$44,100** | **$4,788** |
| Ahorro | — | **$39,312 (89%)** |

### Vs MicroSIP

| Concepto | MicroSIP | SalvadoreX Pro |
|---|---|---|
| Setup | $8,500 | $0 |
| Licencia | $6,500/año | $4,788/año |
| Multi-sucursal | +$5,000 | Incluido |
| Total año 1 | **$20,000** | **$4,788** |
| Ahorro | — | **$15,212 (76%)** |

### Vs QuickBooks POS

| Concepto | QB POS | SalvadoreX Pro |
|---|---|---|
| Setup | $5,000 | $0 |
| Licencia | $9,000/año (USD pricing) | $4,788/año |
| CFDI | No (no soporta México) | Incluido |
| Total año 1 | **$14,000 + sin CFDI** | **$4,788 con CFDI** |
| Ahorro | — | **$9,212 + cumplimiento fiscal** |

---

## 5. Casos de Éxito (Plantilla)

### Plantilla a llenar cuando se obtenga testimonio

```
**Nombre del negocio**: ___________________________
**Giro**: __________________________________________
**Ubicación**: _____________________________________
**Tamaño**: _______ empleados, _______ sucursales
**Cliente desde**: __ / __ / ____
**Plan**: __________________________________________

**Reto antes de SalvadoreX**:
______________________________________________________

**Solución implementada**:
______________________________________________________

**Resultados (con números)**:
- Tiempo en cobro: antes ___ s → ahora ___ s
- Mermas: antes ___ % → ahora ___ %
- Ahorro mensual: $______
- Aumento ventas: ___ %

**Testimonio textual** (1–2 párrafos del dueño):
"_________________________________________________"

**Foto / Logo**: [path/to/logo.png]
**Autorización publicar**: SI / NO
**Contacto referencia**: ____________________________
```

### Casos en proceso de levantar

1. Café "El Despertar" — Querétaro — 3 sucursales — testimonio pendiente.
2. Restaurante "La Casona" — CDMX — KDS + mesas — testimonio pendiente.
3. Farmacia "San Rafael" — GDL — CFDI obligatorio — testimonio pendiente.
4. Boutique "Aurora" — Monterrey — 5 sucursales — testimonio pendiente.

> **TODO equipo ventas**: cuando un cliente cumpla 1 mes activo y NPS >= 8, ofrecer testimonio con incentivo (1 mes gratis del plan Pro).

---

## 6. ROI Calculator

Usar con prospectos para concretar el valor monetario. Llenar con sus datos.

### Variables de entrada

```
A. Ventas mensuales actuales: $__________
B. Tickets por día: __________
C. Tiempo promedio por venta hoy (segundos): __________
D. Costo hora cajero: $__________ (default $50)
E. Mermas por desconocer stock (% mensual): __________
F. Costo software actual mensual: $__________
G. Costo CFDI actual mensual: $__________
```

### Cálculo

#### Ahorro 1 — Tiempo cajero
```
Tickets_mes = B × 30
Segundos_ahorrados_por_venta = C - 30   (SalvadoreX cobra en 30s)
Horas_ahorradas_mes = (Tickets_mes × Segundos_ahorrados) / 3600
Ahorro_tiempo = Horas_ahorradas × D
```

**Ejemplo**: 100 tickets/día × 30 días = 3000 tickets/mes.
Si hoy tarda 90s y con SalvadoreX 30s → ahorra 60s × 3000 = 180,000s = 50hrs.
50hrs × $50 = **$2,500/mes ahorrados solo en tiempo**.

#### Ahorro 2 — Reducción mermas
```
Merma_actual = A × (E/100)
Merma_con_salvadorex = A × (E/100) × 0.4  (asumimos reducción 60%)
Ahorro_mermas = Merma_actual - Merma_con_salvadorex
```

**Ejemplo**: Ventas $200,000 × 5% merma = $10,000 perdidos.
Con SalvadoreX: $4,000 perdidos.
**$6,000/mes ahorrados en mermas**.

#### Ahorro 3 — Software consolidado
```
Ahorro_software = F + G - 399  (plan Pro)
```

**Ejemplo**: Aspel $700/mes + Facturama $300/mes = $1,000.
SalvadoreX Pro $399.
**$601/mes ahorrados en software**.

### Total ROI mensual

```
ROI_mensual = Ahorro_tiempo + Ahorro_mermas + Ahorro_software
ROI_anual = ROI_mensual × 12
Payback = (Costo_setup_salvadorex) / ROI_mensual   (siempre 0 días, no hay setup)
```

**Ejemplo total**: $2,500 + $6,000 + $601 = **$9,101/mes** = **$109,212/año** ahorrados.

### Mensaje al prospecto

> "Cliente, según sus números: SalvadoreX le ahorra $9,101 al mes. El plan Pro cuesta $399/mes. Eso significa que SalvadoreX se paga solo y le deja $8,702/mes de ganancia neta. Si firmamos hoy, en 12 meses recupera $104,424 que de otra forma se le iban en mermas, tiempo perdido y software fragmentado."

---

## 7. Discovery Questions (antes de la demo)

Antes de mostrar nada, descubre:

1. ¿Qué negocio tiene? (giro)
2. ¿Cuántas sucursales?
3. ¿Cuántos empleados que cobran?
4. ¿Hoy qué usa para vender? (papel, Aspel, Excel, ninguno)
5. ¿Factura CFDI? ¿Quién se la hace?
6. ¿Maneja inventario? ¿Cómo?
7. ¿Cuánto vende al mes aprox?
8. ¿Qué le frustra hoy de su sistema actual?
9. ¿En cuánto tiempo necesita arrancar?
10. ¿Quién toma la decisión final?

→ Con estas respuestas, personalizas la demo (módulos a mostrar) y precierres la venta.

---

## 8. Cierre

### Frases de cierre validadas

- "¿Le abro la cuenta ahora mismo o prefiere mañana?" (asumido)
- "¿Plan Lite o Pro?" (alternativa)
- "Si le mando los accesos en 5 minutos, ¿empezamos hoy?" (urgencia)
- "Lo único que necesito es su nombre, email y giro. ¿Me los pasa?" (acción)

### Si dice "déjame pensarlo"

> "Por supuesto. ¿Qué dato me falta darle para que decida? ¿Precio, demo más larga, hablar con un cliente actual?"

### Si dice "te aviso"

> "Le mando WhatsApp en 3 días con un caso de éxito de un negocio igual al suyo. Si para entonces no le interesa, lo dejo de molestar. ¿OK?"

---

## 9. Hand-off a Onboarding

Una vez cerrada la venta, el vendedor debe:

1. Crear cuenta en `/web/v25/admin/create-tenant`.
2. Mandar credenciales por WhatsApp con plantilla `outreach-templates.md`.
3. Agendar tour onboarding por Calendly (30 min).
4. Etiquetar en CRM como "vendido + onboarding pendiente".
5. Notificar a customer success en Slack `#new-customers`.

---

## 10. Recursos asociados

- `cheat-sheet.md` — referencia rápida 1 página.
- `outreach-templates.md` — copy listo para WhatsApp/email.
- `../onboarding/by-industry.md` — qué activar por giro.
- `../scenarios/01..10` — guiones paso-a-paso por caso real.
- `../faq-general.html` — FAQs públicas para mandar al prospecto.

---

**Mantén este playbook a la mano en cada llamada. Actualízalo al final de cada semana con nuevas objeciones.**
