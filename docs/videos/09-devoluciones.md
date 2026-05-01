# Video 9: Procesar Devoluciones sin Conflictos

## Meta
- Duracion objetivo: 30-45s
- Audiencia: cajero / encargado / dueno
- Idioma: ES Mexico (formal-casual, profesional)
- Music: lo-fi instrumental calmado (BPM 90-95)
- Aspect ratio: 16:9 desktop, 9:16 vertical
- Tono: profesional, "controlado y trazable"

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
- Tenant: TNT001 (Tienda de Ropa Trendy)
- Login: cajero@trendy.mx / Volvix2026!
- Venta original a devolver:
  - Folio: #1018
  - Fecha: 25 abril 2026
  - Cliente: Maria Lopez
  - Productos:
    - Blusa azul talla M: $450
    - Pantalon negro talla 28: $680
    - Cinturon cafe: $230
  - Total: $1,360
  - Pago: Tarjeta Visa terminacion 4523
- Motivo devolucion: cliente devuelve solo blusa porque no le quedo
- Devolucion: $450 a misma tarjeta

## Storyboard (escenas con timestamps)

### 0:00-0:04 - Hook
**VOICEOVER**: "Cliente devuelve un producto. Como lo procesas sin pelearte?"
**VISUAL**: Mostrador con cliente mostrando ticket arrugado, cajera buscando en computadora
**ACTION**: Fade-in al modulo de devoluciones
**TEXTO ON-SCREEN**: "Devoluciones sin conflicto"
**SFX**: Whoosh

### 0:04-0:10 - Buscar venta original
**VOICEOVER**: "Buscas la venta por folio o por cliente..."
**VISUAL**: Click sidebar "Ventas" > "Devoluciones"
**ACTION**: Pantalla muestra search bar
**TEXTO ON-SCREEN**: "Buscar por folio / cliente / fecha"

**VOICEOVER**: "Tipea folio 1018..."
**VISUAL**: Tipea "1018" en search
**ACTION**: Resultado aparece: "Venta #1018 - Maria Lopez - $1,360 - 25 Abr 2026"
**TEXTO ON-SCREEN**: "Encontrada"
**SFX**: Search ding

### 0:10-0:18 - Seleccionar productos a devolver
**VOICEOVER**: "Click en la venta. Te muestra todos los productos."
**VISUAL**: Click venta, pantalla muestra:
  - [x] Blusa azul talla M: $450
  - [ ] Pantalon negro talla 28: $680
  - [ ] Cinturon cafe: $230
**ACTION**: Cliente solo devuelve blusa, marca solo ese checkbox
**TEXTO ON-SCREEN**: "Selecciona productos"

**VOICEOVER**: "Marcas solo lo que devuelve."
**VISUAL**: Total devolucion calcula: $450
**ACTION**: Animacion total
**TEXTO ON-SCREEN**: "Devolucion: $450"

### 0:18-0:25 - Motivo y autorizacion
**VOICEOVER**: "Eliges motivo..."
**VISUAL**: Dropdown:
  - No le quedo (talla)
  - Defectuoso
  - No era lo que esperaba
  - Producto duplicado
  - Otro
**ACTION**: Selecciona "No le quedo (talla)"
**TEXTO ON-SCREEN**: "Motivo registrado"

**VOICEOVER**: "Si requiere autorizacion supervisor, pides el codigo."
**VISUAL**: Modal: "Devolucion >$300 requiere supervisor. Ingresa codigo:"
**ACTION**: Tipea PIN supervisor "4521"
**TEXTO ON-SCREEN**: "Auditoria activa"
**SFX**: Approval

### 0:25-0:32 - Procesar reembolso
**VOICEOVER**: "Eliges como devolver el dinero..."
**VISUAL**: Opciones:
  - Reembolso a tarjeta original (Visa **4523)
  - Efectivo
  - Nota de credito en tienda
  - Cambio por otro producto
**ACTION**: Selecciona "Reembolso tarjeta original"
**TEXTO ON-SCREEN**: "Reembolso automatico"

**VOICEOVER**: "El sistema procesa el reembolso a la misma tarjeta automaticamente."
**VISUAL**: Modal procesando con Stripe/Mercado Pago, progreso 0%-100%
**ACTION**: Toast "Reembolso aprobado - $450 a Visa **4523"
**TEXTO ON-SCREEN**: "Aprobado"
**SFX**: Cha-ching reverso

### 0:32-0:38 - Stock vuelve y nota
**VOICEOVER**: "El producto vuelve a tu inventario..."
**VISUAL**: Notificacion: "+1 Blusa azul M agregada a stock"
**ACTION**: Sidebar muestra inventario actualizado
**TEXTO ON-SCREEN**: "Stock actualizado"

**VOICEOVER**: "...y se imprime nota de credito firmada."
**VISUAL**: Ticket sale con todo el detalle:
  - "DEVOLUCION FOLIO #DV-0234"
  - Producto, motivo, monto
  - Firma cliente requerida
  - Codigo barras para tracking
**ACTION**: Cliente firma con stylus en tablet
**TEXTO ON-SCREEN**: "Firma + comprobante"
**SFX**: Impresora

### 0:38-0:44 - Reportes y auditoria
**VOICEOVER**: "Y queda registrado en auditoria. Puedes ver: que se devuelve mas, por que motivo, que cajero, que cliente."
**VISUAL**: Dashboard "Devoluciones del mes":
  - Total: 23 devoluciones, $14,500
  - Top motivo: "No le quedo" (40%)
  - Top producto devuelto: Pantalon X
  - Top cajero devolucion: Maria (45%)
**ACTION**: Hover muestra tendencias
**TEXTO ON-SCREEN**: "Auditoria completa"

### 0:44-0:50 - CTA
**VOICEOVER**: "Volvix POS te da control. Pruebalo gratis."
**VISUAL**: URL + CTA
**ACTION**: Click
**TEXTO ON-SCREEN**: "salvadorexoficial.com/registro"

## Caption (subtitulos)
- Auto-generar
- Blanco borde negro
- Inter Bold 32pt
- Word-by-word
- Highlight: Devolucion, Reembolso, Auditoria, Firma, Motivo

## Hashtags / Description
#Devoluciones #PuntoDeVenta #ServicioCliente #TiendaRopa #Volvix #Auditoria #Reembolso

"Procesa devoluciones en 30 segundos con auditoria completa. Reembolso a tarjeta original, stock actualizado, firma digital. Volvix POS. salvadorexoficial.com/registro"

## Metricas esperadas
- Watch time: >68%
- CTR: 2.5-3.5%
- Conversion: 1-2%
- Save rate: >7%
- Comments cajeros: alto engagement

## B-roll alternativo
- Cajero confundido con cliente molesto
- Bolsa de ropa siendo regresada al estante
- Terminal punto venta procesando reembolso
- Cliente firmando recibo digital
- Reporte mensual de devoluciones

## Notas de edicion
- Tono profesional pero empatico
- Color grade: tienda de ropa moderna
- Music: tranquilo (devoluciones suelen ser tensas)
- Zoom en motivo seleccionado y reembolso aprobado
- Mostrar dashboard al final con calma (deja respirar)
