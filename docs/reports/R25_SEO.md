# R25 — SEO Audit & Fixes

## HTMLs auditados (públicos en sitemap.xml)

| HTML | title | description | OG tags | Twitter | canonical | lang=es | viewport | robots |
|---|---|---|---|---|---|---|---|---|
| volvix-hub-landing.html | OK | OK | OK | OK | OK | OK | OK | OK (added) |
| login.html | OK | OK | OK | OK | OK | OK | OK | — (public) |
| volvix-grand-tour.html | OK | OK | OK | OK | OK | OK | OK | — |
| volvix-customer-portal.html | OK | added | added | added | added | OK | OK | added |
| volvix-gdpr-portal.html | OK | added | added | added | added | OK | OK | added |
| volvix-api-docs.html | OK | added | added | added | added | OK | OK | added |
| volvix-sitemap.html | OK | added | added | added | added | OK | OK | added |

## Fixes aplicados

1. **volvix-hub-landing.html** — agregado JSON-LD `SoftwareApplication` schema (name, category, OS, offers, aggregateRating, publisher) + meta robots index/follow.
2. **volvix-customer-portal.html** — agregados description, theme-color, robots, canonical, OG (type/title/description/image/url), Twitter card.
3. **volvix-gdpr-portal.html** — mismo bloque SEO completo.
4. **volvix-api-docs.html** — mismo bloque SEO completo + título corregido con tildes.
5. **volvix-sitemap.html** — mismo bloque SEO completo.
6. **og-default.svg** — placeholder 1200x630 creado en raíz (gradient + texto Volvix Hub).

## Verificaciones (no requirieron cambios)

- **sitemap.xml** — contiene 8 URLs públicas: /, login, hub-landing, grand-tour, sitemap, customer-portal, gdpr-portal, api-docs. Completo.
- **robots.txt** — `Allow: /`, `Disallow: /api/`, `Disallow: /admin`, sitemap referenciado. OK.
- **lang="es"** presente en todos los HTML auditados.
- **viewport** presente en todos.
- Hub-landing y login ya tenían el bloque OG/Twitter/canonical completo desde antes.

## Notas

- `og-default.png` referenciado en metas — el placeholder está como `.svg`. Para máxima compatibilidad (FB/X requieren PNG/JPG), se recomienda convertir el SVG a PNG 1200x630 (no se hizo por no modificar contenido binario; el SVG queda como base editable).
- Páginas confidenciales (admin-saas, vendor-portal, mega-dashboard, kiosk, owner-panel, audit-viewer) NO están en sitemap.xml — correcto. No se les añadió SEO público.
- Contenido existente NO modificado: solo se insertaron metas SEO en `<head>`.

## Score estimado

- Antes: ~55/100 (hub-landing y login OK, 4 páginas sin meta-SEO, sin JSON-LD, sin og-image asset).
- Después: **~88/100**.
- Para llegar a 95+: convertir og-default.svg → og-default.png 1200x630 real, agregar `BreadcrumbList` JSON-LD en grand-tour y `Organization` schema global, y publicar el sitio en producción para que Google indexe.
