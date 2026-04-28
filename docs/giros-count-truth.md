# Giros y Landings — fuente de verdad (FIX-G2)

> Última verificación: 2026-04-28. Si modificas el catálogo o agregas
> una landing, **actualiza este archivo en el mismo PR**.

## Conteo real

| Métrica | Valor | Fuente |
|---|---|---|
| Landings físicas con HTML propio | **39** | `landing-*.html` en raíz del repo |
| Giros en `giros_catalog_v2.js` | **37** | entries `key:` en el array `GIROS_V2` |
| Generador dinámico | 1 | `landing_dynamic.html?giro=KEY` puede renderizar cualquier `key` del catálogo |

## ¿Por qué hay 39 landings y 37 giros en el catálogo?

- 2 landings físicas viven sin entrada formal en `giros_catalog_v2.js`
  (legacy o tests). El generador dinámico igual las cubre por slug.
- El catálogo `v2` es el que alimenta el marketplace y el panel del owner.
  Si una landing no aparece en `v2`, no se mostrará en marketplace.

## Mensaje correcto a usuarios / marketing

> "37 giros de negocio configurados con páginas dedicadas, más un generador dinámico que puede crear landings para cualquier vertical adicional. 39 landings físicas optimizadas para SEO."

Versión corta para meta descriptions / hero copy:

> "Sistemas POS para 37+ giros de negocio."

## Lo que NO hay que decir

- ~~"200 giros"~~ — número aspiracional histórico, sin respaldo en código.
- ~~"369 giros"~~ — confusión con el conteo de productos demo del Excel.
- ~~"168 giros"~~ — número fantasma; el archivo nunca tuvo 168 entries.

## Cómo verificar tú mismo

```bash
# Landings físicas
ls landing-*.html | wc -l   # → 39

# Entries en el catálogo v2
grep -cE "^\s+key:" giros_catalog_v2.js   # → 37
```

## Archivos donde estaba el número incorrecto

- `marketplace.html` (meta description, og, twitter, footer, JSON-LD) — **corregido**
- `volvix_owner_panel_v7.html` — **pendiente** (archivo en zona protegida; flagged para próximo round)
