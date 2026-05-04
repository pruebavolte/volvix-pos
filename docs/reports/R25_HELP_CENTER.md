# R25 — Help Center

## Resumen
Centro de ayuda estático para Volvix POS con buscador en vivo, filtros por categoría y 19 artículos navegables. Diseño coherente con el resto del sistema (dark mode + paleta Volvix gradient indigo→purple→pink).

## Archivos creados

- `docs.html` — Landing del centro de ayuda
- `docs/_article-style.css` — Estilos compartidos para artículos
- `docs/*.html` — 19 artículos individuales

## Artículos creados (19)

| # | Categoría | Título | URL |
|---|-----------|--------|-----|
| 1 | Inicio rápido | Cómo hacer mi primera venta | `docs/primera-venta.html` |
| 2 | Productos | Crear un producto | `docs/crear-producto.html` |
| 3 | Productos | Importar productos desde CSV | `docs/importar-csv.html` |
| 4 | Ventas | Cobrar con tarjeta | `docs/cobrar-tarjeta.html` |
| 5 | Ventas | Aplicar descuentos | `docs/aplicar-descuentos.html` |
| 6 | Ventas | Procesar devoluciones | `docs/devoluciones.html` |
| 7 | Clientes | Crear cliente con RFC | `docs/crear-cliente-rfc.html` |
| 8 | Facturación | Generar factura CFDI 4.0 | `docs/facturar-cfdi.html` |
| 9 | Caja | Corte de caja Z | `docs/corte-z.html` |
| 10 | Caja | Abrir caja con fondo inicial | `docs/abrir-caja.html` |
| 11 | Reportes | Reportes de ventas | `docs/reportes-ventas.html` |
| 12 | Configuración | Configurar impresora térmica | `docs/impresora-termica.html` |
| 13 | Configuración | Crear usuarios y roles | `docs/crear-usuarios.html` |
| 14 | Configuración | Respaldos automáticos | `docs/backup.html` |
| 15 | Integraciones | Conectar Stripe | `docs/stripe.html` |
| 16 | Integraciones | Notificaciones por WhatsApp | `docs/whatsapp.html` |
| 17 | Integraciones | Sincronizar con Shopify | `docs/shopify.html` |
| 18 | POS básico | Atajos de teclado del POS | `docs/pos-basico.html` |
| 19 | FAQ | Preguntas frecuentes | `docs/faq-general.html` |

## Features de la landing (`docs.html`)

- Buscador en vivo (filtra por título, resumen, keywords y categoría)
- 12 pills de categoría (Todos, Inicio rápido, POS básico, Productos, Clientes, Ventas, Reportes, Facturación, Caja, Configuración, Integraciones, FAQ)
- Cards con hover gradient + categoría en badge
- Estado vacío cuando no hay resultados
- Sticky nav con backdrop-blur
- Responsive < 720px

## Features de los artículos

- Breadcrumb (Inicio / Ayuda / Categoría)
- Pasos numerados con badge gradient
- Bloques `tip` (verde) y `warn` (ámbar)
- Placeholders de screenshot con borde dashed
- Tablas (en atajos de teclado)
- Code blocks con syntax highlight ámbar
- CTA al final: volver al centro y contacto soporte

## Links integrados

- `volvix-hub-landing.html` → nav-link "Ayuda" agregado (línea ~414)
- `multipos_suite_v3.html` → botón "? Ayuda" en topbar (abre en pestaña nueva)

## Total LOC añadidas
~1100 líneas HTML/CSS/JS, sin dependencias externas.
