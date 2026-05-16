# Script de demo en vivo — 30 minutos

## Antes de la demo (5 min de prep)

- Tener navegador en https://systeminternational.app/marketplace.html, listo
- Tener un segundo dispositivo (celular o tablet) con la misma URL para mostrar PWA
- Cerrar pestañas y notificaciones
- Tener el pricing tier en pantalla aparte (no enseñar todavía)

## Min 0–5 — Introducción y entender al cliente

**Qué decir:**
> "Antes de mostrarte el sistema, cuéntame: ¿cómo registras tus ventas hoy? ¿Usas algún POS, cuaderno, Excel, o nada? ¿Qué te frustra de tu sistema actual?"

**Por qué:** ajustas el resto de la demo a sus dolores específicos. Si ya tiene un POS, enfocas en migración. Si está empezando, enfocas en alta rápida.

**Preguntas clave:**
- ¿Cuántas sucursales?
- ¿Cuántos cajeros?
- ¿Vende productos físicos o servicios?
- ¿Qué herramienta odia más hoy?

## Min 5–10 — Alta del negocio en marketplace (en vivo)

**Qué hacer:**
1. Abre https://systeminternational.app/marketplace.html
2. Busca el giro del cliente en el buscador (ej. "cafetería", "abarrotes", "barbería")
3. Muestra los giros que aparecen + catálogos pre-cargados
4. Selecciona uno y abre el registro
5. Llena email del cliente, teléfono, nombre del negocio (puede ser real si decide quedarse)
6. Resuelve el captcha (mostrar que existe — punto a favor)
7. Recibe OTP en correo → ingresa
8. Sistema lo lleva al panel y al POS

**Tiempo total:** ~3 minutos.

**Punto a remarcar:**
> "Mira: el sistema ya tiene tus productos típicos cargados. No tuviste que crear nada manualmente. En Soft Restaurant esto te toma 2-4 horas con un consultor que cobra $500/hr."

## Min 10–20 — POS funcionando + venta de ejemplo + corte de caja

**Qué hacer:**
1. En `/salvadorex-pos.html`:
   - Agrega 3 productos al carrito (uno con IVA, otro con descuento, otro de prueba)
   - Aplica un descuento de 10% (mostrar que se recalcula IVA correctamente)
   - Cobra con pago mixto: $200 efectivo + resto tarjeta
   - Genera ticket — muestra el folio server-side y los desgloses
2. Ve a Inventario → muestra que el stock bajó automáticamente
3. Ve a Corte de Caja → genera corte parcial
4. Ve a Clientes → registra un cliente nuevo con email
5. (Opcional) Muestra modo multi-sucursal si tiene >1

**Tiempo total:** ~10 minutos.

**Puntos a remarcar:**
- IVA configurable por sucursal y por tasa especial (frontera, exentos)
- Pago mixto al centavo exacto
- Corte de caja con auditoría completa de movimientos
- Stock se decrementa automáticamente (no hay riesgo de vender producto agotado)

## Min 20–25 — Panel del dueño

**Qué hacer:**
1. Logout del POS, login al panel del dueño (`/volvix_owner_panel_v7.html`)
2. Muestra el dashboard con KPIs reales (no hardcoded — son del DB)
3. Cambia un módulo activo/inactivo y muestra que el POS lo refleja en <5 segundos
4. Muestra reportes de ventas, top productos, top clientes

**Tiempo total:** ~5 minutos.

**Punto a remarcar:**
> "Como dueño, ves tu negocio en tiempo real. Si estás de viaje, abres tu celular y sabes cuánto vendieron hoy sin llamar a nadie."

## Min 25–30 — Cierre + pricing + siguientes pasos

**Qué decir:**
> "Resumen rápido: alta en 60 segundos, POS funcional, panel del dueño, sin contrato. La pregunta es: ¿quieres probarlo 90 días gratis con tu negocio real?"

**Enseña pricing tier ahora.**

**Si dice sí:**
- Le mandas el acuerdo del piloto por WhatsApp (`docs/venta/06-acuerdo-piloto.md`)
- Acuerdan fecha de seguimiento en 2 semanas
- Le creas el tenant en el panel super-admin con `is_pilot=true`

**Si dice "déjame pensarlo":**
- Mándale el pitch de 1 página (`docs/venta/01-pitch-1pagina.md`) por correo
- Cierra con: "El sistema se queda online — entra cuando quieras y haces una prueba más"

---

## Bugs/limitaciones conocidos a EVITAR mostrar en la demo

- NO uses el flujo de CFDI/factura — todavía no está integrado con PAC
- NO toques el modo offline — requiere internet, no está offline-first
- NO uses Firefox/Safari para la demo — está optimizado para Chrome (Firefox tiene 1-2 quirks visuales no críticos)
- NO muestres el panel de seguridad 2FA — la UI está parcial, el código existe

## Si el cliente pregunta algo NO listo

> "Buena pregunta. Eso está en el roadmap de los próximos 60 días. Si lo necesitas crítico, podemos priorizarlo si te conviertes en cliente pagando."

Honesto, sin prometer fechas exactas.
