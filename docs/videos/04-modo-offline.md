# Video 4: Modo Offline - Vende Sin Internet

## Meta
- Duracion objetivo: 30-45s
- Audiencia: dueno de negocio en zonas con mala conexion / cajero
- Idioma: ES Mexico (formal-casual, tranquilizador)
- Music: lo-fi instrumental con momentos dramaticos (BPM 90-100)
- Aspect ratio: 16:9 desktop, 9:16 vertical
- Tono: heroico, "tu negocio nunca se detiene"

## Setup pre-grabacion
- Browser: Chrome perfil limpio
- Resolucion: 1920x1080
- Hidden: bookmarks, dev tools
- Tab: solo /salvadorex_web_v25.html
- Volumen sistema: 70%
- Mic: Blue Yeti / RODE NT-USB
- Pantalla: modo claro
- Cursor: highlight on
- Network tab abierto en DevTools (cerrado durante grabacion, solo para simular offline)
- Tener listo: comando para cortar wifi (Win+A panel, modo avion toggle)

## Datos demo a usar
- Tenant: TNT001 (Cafe Pepe)
- Login: previo (sesion guardada)
- Productos: Latte, Espresso, Croissant
- Caja abierta con $500 fondo
- Service worker registrado y cache pre-cargado

## Storyboard (escenas con timestamps)

### 0:00-0:05 - Hook
**VOICEOVER**: "Se cae el internet. La fila crece. Que haces?"
**VISUAL**: Tension: pantalla con icono WiFi tachado, fila de clientes esperando, reloj corriendo
**ACTION**: Foco en la pantalla del POS
**TEXTO ON-SCREEN**: "Y si se cae el WiFi?"
**SFX**: Sonido de tension / drop dramatic

### 0:05-0:10 - Solucion
**VOICEOVER**: "Con Volvix POS, sigues vendiendo."
**VISUAL**: Banner amarillo aparece en POS: "Modo Offline activo - 0 ventas pendientes"
**ACTION**: Toggle wifi del sistema operativo a OFF (mostrar visualmente)
**TEXTO ON-SCREEN**: "Modo offline activado"
**SFX**: Click suave + heroico

### 0:10-0:18 - Vender en offline
**VOICEOVER**: "Buscas, agregas, cobras..."
**VISUAL**: Misma flujo que video 1:
  - Buscar "latte"
  - Click producto
  - F12 cobrar
  - Pago $50, cambio $5
  - Imprimir ticket
**ACTION**: Todo funciona normal, ticket sale igual
**TEXTO ON-SCREEN**: "Sin internet" (banner amarillo persistente)

**VOICEOVER**: "Todo funciona igual. El ticket se imprime."
**VISUAL**: Toast "Venta guardada offline - Folio #1025 (pendiente sync)"
**ACTION**: Counter en banner sube: "1 venta pendiente"
**TEXTO ON-SCREEN**: "Folio #1025" + "1 pendiente"
**SFX**: Success ding (con tono "guardado")

### 0:18-0:25 - Hacer 3 ventas mas offline
**VOICEOVER**: "Haces tantas ventas como necesites..."
**VISUAL**: Time-lapse 3 ventas rapidas, counter sube: "2, 3, 4 pendientes"
**ACTION**: Banner amarillo cambia: "4 ventas pendientes - sincronizara cuando regrese WiFi"
**TEXTO ON-SCREEN**: "4 ventas guardadas localmente"

### 0:25-0:32 - Volver el internet
**VOICEOVER**: "Cuando regresa el WiFi..."
**VISUAL**: Toggle WiFi a ON, icono WiFi se restaura
**ACTION**: Banner cambia a verde: "Sincronizando..." con spinner
**TEXTO ON-SCREEN**: "WiFi recuperado"
**SFX**: Connect chime

**VOICEOVER**: "...todo se sincroniza solo. Sin perder ni una venta."
**VISUAL**: Counter baja rapido: 4, 3, 2, 1, 0. Banner desaparece
**ACTION**: Toast "Todas las ventas sincronizadas - $580 al servidor"
**TEXTO ON-SCREEN**: "Sincronizado: 4 ventas, $580"
**SFX**: Multiple ding (uno por venta)

### 0:32-0:40 - Beneficio
**VOICEOVER**: "Tu negocio nunca se detiene. Aunque se caiga el internet de toda la zona."
**VISUAL**: B-roll de zona rural / mercado / playa con puesto de comida usando POS
**ACTION**: Mostrar Volvix funcionando en lugares con mal internet
**TEXTO ON-SCREEN**: "Funciona en cualquier lugar"

### 0:40-0:45 - CTA
**VOICEOVER**: "Volvix POS. Pruebalo gratis."
**VISUAL**: URL + CTA grande
**ACTION**: Click animado
**TEXTO ON-SCREEN**: "volvix-pos.vercel.app/registro"

## Caption (subtitulos)
- Auto-generar
- Blanco borde negro
- Inter Bold 32pt
- Word-by-word
- Highlight: Offline, Sincroniza, Sin perder, Cualquier lugar

## Hashtags / Description
#ModoOffline #PuntoDeVenta #InternetCaido #NegocioRural #POS #Volvix #VentasSinInternet #PWA

"Tu negocio NO se detiene. Volvix POS funciona offline y sincroniza solo cuando regresa el WiFi. Sin perder ventas. volvix-pos.vercel.app/registro"

## Metricas esperadas
- Watch time: >75% (alta utilidad)
- CTR: 4-6% (pain point claro)
- Conversion: 2-3%
- Save rate: >10% (caso de uso critico)
- Comments preguntando "funciona en mi pueblo?": alto

## B-roll alternativo
- Vendedor en mercado tradicional con tablet
- Camion de tacos / food truck con POS
- Zona rural Mexico con vendedor usando celular
- Tienda de abarrotes con conexion intermitente
- Mapa Mexico con zonas rojas (sin cobertura)

## Notas de edicion
- Drama en primera escena (hook fuerte)
- Color grade: tonos calidos en escenas de venta, tonos frios en escena de "sin internet"
- Music: build-up hasta la sincronizacion, climax en el "Sin perder ni una venta"
- SFX importante: el tono de "guardado" debe sentir seguridad
- Zoom dramatico en counter "4 pendientes -> 0"
- Pausa antes del CTA
