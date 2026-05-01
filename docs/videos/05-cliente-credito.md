# Video 5: Clientes a Credito - Maneja Cuentas sin Excel

## Meta
- Duracion objetivo: 45-60s
- Audiencia: dueno de negocio que da credito (tienda barrio, ferreteria, cremeria)
- Idioma: ES Mexico (formal-casual, didactico)
- Music: lo-fi instrumental medium (BPM 95-105)
- Aspect ratio: 16:9 desktop, 9:16 vertical
- Tono: profesional, "control total de tu cartera"

## Setup pre-grabacion
- Browser: Chrome perfil limpio
- Resolucion: 1920x1080
- Hidden: bookmarks, dev tools
- Tab: solo /salvadorex_web_v25.html
- Volumen sistema: 70%
- Mic: profesional
- Pantalla: modo claro
- Cursor: highlight on

## Datos demo a usar
- Tenant: TNT001 (Ferreteria El Tornillo)
- Login: admin@volvix.test / Volvix2026!
- Cliente: "Carlos Mendoza"
  - RFC: MECC850315ABC
  - Telefono: 5551234567
  - Limite credito: $10,000
  - Saldo actual: $3,450
  - Plazo: 30 dias
- Productos a vender:
  - Tornillos 1/4" caja (50): $890
  - Pintura blanca 4L: $450
  - Brocha 3": $85
  - Total: $1,425

## Storyboard (escenas con timestamps)

### 0:00-0:05 - Hook
**VOICEOVER**: "Le fias a tus clientes? Como llevas el control?"
**VISUAL**: Cuaderno viejo arrugado con nombres y numeros tachados, post-its desordenados
**ACTION**: Fade a pantalla limpia de Volvix
**TEXTO ON-SCREEN**: "Control de credito profesional"
**SFX**: Sonido pagina vieja

### 0:05-0:12 - Crear cliente con credito
**VOICEOVER**: "Creas tu cliente y le pones limite de credito..."
**VISUAL**: Click "Clientes" > "+ Nuevo"
**ACTION**: Modal abre, llena:
  - Nombre: "Carlos Mendoza"
  - Telefono: "5551234567"
  - RFC: "MECC850315ABC"
  - Toggle "Permitir credito": ON
  - Limite: $10,000
  - Plazo: 30 dias
**TEXTO ON-SCREEN**: "Limite: $10,000 / 30 dias"
**SFX**: Tipeo + click toggle

### 0:12-0:20 - Vender a credito
**VOICEOVER**: "Cuando viene a comprar, escribes su nombre..."
**VISUAL**: En POS, click input cliente, escribe "Carlos"
**ACTION**: Autocomplete muestra "Carlos Mendoza - Saldo: $3,450 / Limite: $10,000"
**TEXTO ON-SCREEN**: "Disponible: $6,550" (badge verde)

**VOICEOVER**: "Agregas productos como siempre..."
**VISUAL**: Agrega tornillos, pintura, brocha. Total: $1,425
**ACTION**: Carrito visible

### 0:20-0:28 - Cobrar a credito
**VOICEOVER**: "Al cobrar, eliges Credito..."
**VISUAL**: F12, modal de cobro abre
**ACTION**: Selecciona tab "Credito" (en lugar de efectivo/tarjeta)
**TEXTO ON-SCREEN**: "Pago: Credito"

**VOICEOVER**: "El sistema valida que tenga limite disponible..."
**VISUAL**: Modal muestra:
  - Saldo previo: $3,450
  - Compra actual: $1,425
  - Nuevo saldo: $4,875
  - Disponible: $5,125
  - Vence: 28 mayo 2026
**ACTION**: Click "Confirmar credito"
**TEXTO ON-SCREEN**: "Aprobado" (verde)
**SFX**: Approval ding

### 0:28-0:35 - Imprimir nota credito
**VOICEOVER**: "Imprime nota con saldo actualizado y fecha de pago."
**VISUAL**: Ticket sale con info credito visible: "SALDO: $4,875 - VENCE: 28 MAY 2026"
**ACTION**: Cliente firma en tablet (mostrar firma digital)
**TEXTO ON-SCREEN**: "Firma digital"
**SFX**: Impresora

### 0:35-0:42 - Recibir abono
**VOICEOVER**: "Cuando paga, registras el abono..."
**VISUAL**: Click cliente Carlos, "Recibir pago", input "$2000"
**ACTION**: Saldo actualiza:
  - Antes: $4,875
  - Pago: $2,000
  - Nuevo saldo: $2,875
**TEXTO ON-SCREEN**: "Saldo: $2,875"
**SFX**: Cha-ching

### 0:42-0:50 - Reportes
**VOICEOVER**: "Y ves todo en reporte: quien debe cuanto, vencimientos, recordatorios automaticos por WhatsApp."
**VISUAL**: Dashboard "Cartera de credito":
  - Total por cobrar: $45,890
  - Vencidos: $3,200 (rojo)
  - Por vencer 7 dias: $8,500 (amarillo)
  - Vigentes: $34,190 (verde)
**ACTION**: Hover sobre "Vencidos", muestra lista de clientes morosos
**TEXTO ON-SCREEN**: "WhatsApp recordatorio automatico"

**VOICEOVER**: "Boton enviar recordatorio masivo."
**VISUAL**: Click "Enviar recordatorios", modal con preview de mensaje WhatsApp
**ACTION**: 12 mensajes enviados, contador animado
**TEXTO ON-SCREEN**: "12 recordatorios enviados"

### 0:50-0:58 - CTA
**VOICEOVER**: "Adios cuaderno, hola Volvix POS. Pruebalo gratis."
**VISUAL**: Cuaderno viejo en basura, pantalla Volvix limpia
**ACTION**: Click CTA
**TEXTO ON-SCREEN**: "salvadorexoficial.com/registro"

## Caption (subtitulos)
- Auto-generar
- Blanco borde negro
- Inter Bold 32pt
- Word-by-word
- Highlight: Credito, Limite, Saldo, WhatsApp, Recordatorio

## Hashtags / Description
#ClientesCredito #FiarCredito #ControlCartera #PuntoDeVenta #FerreteriaMx #Volvix #NegocioBarrio

"Le fias a tus clientes? Volvix POS lleva el control: limite por cliente, saldos, vencimientos y recordatorios automaticos por WhatsApp. Adios al cuaderno. salvadorexoficial.com/registro"

## Metricas esperadas
- Watch time: >70% (caso de uso especifico)
- CTR: 3-5%
- Conversion: 2-3% (B2B-ish)
- Comments preguntando: "funciona para mi cremeria/abarrotes/etc": alto
- Save rate: >9%

## B-roll alternativo
- Tendero de barrio anotando en cuaderno
- Cliente firmando recibo en mostrador
- Notificacion WhatsApp en celular
- Lista de morosos imprimida vs digital
- Ferreteria con muchos productos

## Notas de edicion
- Hook fuerte (problema relatable)
- Color grade: tonos calidos (negocio familiar)
- Music: confiable, profesional
- Zoom en numeros clave: limite, saldo, vencimientos
- B-roll mexicano (no genericos americanos)
