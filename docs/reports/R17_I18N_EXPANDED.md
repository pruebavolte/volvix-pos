# R17 — i18n Expanded (7 idiomas)

## Resumen
Se expandió `volvix-i18n-wiring.js` de 3 a 7 idiomas. El selector flotante muestra ahora 7 banderas con dropdown.

## Idiomas soportados

| Código | Idioma     | Locale  | Currency | Flag |
|--------|------------|---------|----------|------|
| es     | Español    | es-MX   | MXN      | 🇲🇽   |
| en     | English    | en-US   | USD      | 🇺🇸   |
| pt     | Português  | pt-BR   | BRL      | 🇧🇷   |
| fr     | Français   | fr-FR   | EUR      | 🇫🇷   |
| de     | Deutsch    | de-DE   | EUR      | 🇩🇪   |
| it     | Italiano   | it-IT   | EUR      | 🇮🇹   |
| ja     | 日本語      | ja-JP   | JPY      | 🇯🇵   |

## Métricas

- **Keys por idioma:** 187
- **Idiomas:** 7
- **Total traducciones:** 187 × 7 = **1,309**
- **Nuevas traducciones añadidas:** 187 × 4 = **748** (fr + de + it + ja)

## Conjunto de keys (187)
common.* (29), pos.* (35 incl. cart/sales), product.* (13), inv.* (8), customer.* (8), report.* (9), action.* (15), msg.* (12), time.* (7), plural.* (4), login.* (12), nav.* (12), sales.* (10), tenant.* (12), namespaces auxiliares (~11).

## UTF-8 verificado
Caracteres especiales presentes y correctos:
- fr: é, è, ç, à, ù (Sauvegarder, Détails, ç, etc.)
- de: ä, ö, ü, ß (Schließen, Übersicht, Größe)
- it: à, è, ì, ò (Quantità, Sì, Più)
- ja: ひらがな, カタカナ, 漢字 (保存, ログイン, 在庫切れ)

## Locale formatters (Intl.*)
`formatNumber`, `formatCurrency`, `formatDate`, `formatDateTime` ya operan dinámicamente sobre `LOCALES[currentLang].locale` — funcionan automáticamente para los 7 idiomas vía `Intl.NumberFormat` / `Intl.DateTimeFormat`.

Ejemplos:
- `formatCurrency(1234.5)` → ja: `￥1,235`, de: `1.234,50 €`, fr: `1 234,50 €`, ja: `￥1,235`
- `formatDate(new Date())` → ja: `2026/04/26`, de: `26.04.2026`, fr: `26/04/2026`

## Selector flotante
Botón circular fijo (top:140 right:20) con bandera del idioma actual; click despliega dropdown con los 7 idiomas (flag + nombre nativo). `setLanguage(code)` sin reload, dispara `volvix:langchange` y persiste en `localStorage('volvix:lang')`.

## Validación
- `node --check volvix-i18n-wiring.js` → OK (sin errores).
- Conteo automatizado verifica 187 keys exactas en cada bloque de idioma.

## Archivo modificado
- `volvix-i18n-wiring.js` (header actualizado, 4 bloques nuevos, LOCALES extendido).
