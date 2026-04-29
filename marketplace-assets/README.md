# Volvix POS — Marketplace Assets

Carpeta de assets gráficos requeridos por `marketplace.html`, `volvix-shop.html` y resto del portal Volvix.

Generada como parte del fix B43 (SEO + UX gaps).

---

## Estado actual

> **Pendiente generar.** Los meta tags OG/Twitter y `<link rel="icon">` ya apuntan a estas rutas, pero los archivos físicos aún no existen. Sin ellos, los previews de Facebook/Twitter/LinkedIn mostrarán fallback genérico y el favicon no aparecerá.

Producción: `https://volvix-pos.vercel.app/marketplace-assets/<archivo>`

---

## Archivos requeridos

### Open Graph / Twitter Card (CRÍTICO)

| Archivo | Tamaño | Uso | Páginas |
|---|---|---|---|
| `og-marketplace-1200x630.png` | 1200×630 px | Preview Facebook/Twitter/LinkedIn al compartir el marketplace | `marketplace.html` |
| `og-shop-1200x630.png` | 1200×630 px | Preview al compartir la tienda | `volvix-shop.html` |
| `og-default.png` | 1200×630 px | Fallback genérico para resto del portal | `volvix-customer-portal.html` y otros |

**Especificación:**
- Formato: PNG (preferido) o JPG con calidad ≥ 85
- Peso: ≤ 300 KB cada uno (Facebook recomienda < 8 MB, pero pesos bajos cargan más rápido)
- Aspecto: 1.91:1 exacto (1200×630 es el sweet spot que funciona en FB, Twitter `summary_large_image`, LinkedIn y Slack)
- Texto legible: el 30% central debe ser legible incluso en miniatura 200×104. Twitter recorta a veces.
- Brand: usar primario `#2D5F8F` (azul Volvix) y acento `#EA580C` (naranja)

**Sugerencia de diseño marketplace:**
```
[Logo Volvix V]    Marketplace Volvix POS
                   200+ giros · 37 demos en vivo
                   [iconos: 💈 🍽️ 💊 🔧 🏋️]
                   "Encuentra tu sistema en segundos"
                                                    volvix-pos.vercel.app
```

**Sugerencia de diseño shop:**
```
[Logo Volvix V]    Tienda Volvix POS
                   Hardware · Accesorios · Servicios
                   [render de impresora ticketera + escáner]
                                                    volvix-pos.vercel.app
```

---

### Favicons (RECOMENDADO)

| Archivo | Tamaño | Uso |
|---|---|---|
| `favicon-16x16.png` | 16×16 | Tab del navegador (resolución estándar) |
| `favicon-32x32.png` | 32×32 | Tab en pantallas Retina/HiDPI |
| `apple-touch-icon.png` | 180×180 | Home screen de iOS (Safari) |
| `favicon.ico` | 16×16 + 32×32 + 48×48 | Fallback legacy (IE, etc.) |

**Generación rápida:** subir el logo SVG/PNG a https://realfavicongenerator.net/ o usar:
```bash
npx pwa-asset-generator volvix-logo.svg ./marketplace-assets --icon-only --type png
```

---

### PWA Icons (OPCIONAL, para `manifest.webmanifest`)

| Archivo | Tamaño | Uso |
|---|---|---|
| `icon-192x192.png` | 192×192 | Android home screen (requerido si PWA) |
| `icon-512x512.png` | 512×512 | Splash screen Android, install prompts |
| `volvix-logo-512x512.png` | 512×512 | Schema.org `Organization.logo` (ya referenciado en JSON-LD) |
| `site.webmanifest` | — | Web App Manifest (referenciado en `<link rel="manifest">`) |

**Plantilla `site.webmanifest`:**
```json
{
  "name": "Volvix POS",
  "short_name": "Volvix",
  "description": "Sistema POS personalizado por giro de negocio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#2D5F8F",
  "icons": [
    { "src": "/marketplace-assets/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/marketplace-assets/icon-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/marketplace-assets/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## Plan de generación recomendado

1. **Diseño** (Figma / Canva / Photoshop) — crear template OG 1200×630 con la paleta Volvix.
2. **Exportar** las 3 variantes OG (`marketplace`, `shop`, `default`) como PNG ≤ 300 KB.
3. **Logo source** — necesitamos un SVG o PNG ≥ 1024×1024 del logo Volvix. Si no existe, generar con DALL-E/Midjourney usando el prompt:
   > "Minimalist letter V monogram, gradient orange to amber `#EA580C` to `#F59E0B`, white background, clean sans-serif, modern POS brand, 1024x1024 PNG"
4. **Favicons** — pasar el logo por https://realfavicongenerator.net/ y descargar el ZIP.
5. **Verificar OG** con https://www.opengraph.xyz/url/https%3A%2F%2Fvolvix-pos.vercel.app%2Fmarketplace.html después del deploy.

---

## Validadores externos

- **Facebook Sharing Debugger:** https://developers.facebook.com/tools/debug/
- **Twitter Card Validator:** https://cards-dev.twitter.com/validator (legacy) o postear un test draft.
- **LinkedIn Post Inspector:** https://www.linkedin.com/post-inspector/
- **Schema.org JSON-LD validator:** https://validator.schema.org/
- **Google Rich Results Test:** https://search.google.com/test/rich-results

---

## Brand colors de referencia

```css
--primary:      #2D5F8F;   /* Azul Volvix (CTA principal, headers) */
--primary-dark: #1E3A5F;
--accent:       #EA580C;   /* Naranja acento (CTAs secundarias, badges) */
--accent-dark:  #C2410C;
--success:      #16A34A;
--bg:           #FFFFFF;
--text:         #0A0A0A;
```

---

_Última actualización: 2026-04-27 · Fix B43 SEO + UX_
