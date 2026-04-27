# R14 — Multi-Currency + FX Rates

## Resumen

Sistema multi-moneda completo para Volvix POS:
- Catálogo de 8 monedas (MXN, USD, EUR, COP, ARS, BRL, GBP, CAD).
- Tabla `fx_rates` con tasas históricas (UNIQUE diario por par).
- Función SQL `convert(amount, from, to)` con triangulación vía MXN.
- Endpoints API públicos (catálogo, tasas) y admin (refresh).
- Cliente JS con selector, cache local de tasas y formatter `Volvix.fmt()`.

## Archivos entregados

| Archivo | Descripción |
|---|---|
| `db/R14_CURRENCIES.sql` | Schema, seed, función `convert`, RLS, extiende `pos_products`/`pos_sales`. |
| `api/index.js` | Helper `convertCurrency` + 3 endpoints. |
| `volvix-currency-wiring.js` | Cliente con selector, cache, conversión y `Volvix.fmt`. |

## SQL

```sql
\i db/R14_CURRENCIES.sql
```

Crea:
- `currencies(code PK, name, symbol, decimals, active)` con seed.
- `fx_rates(id, base_code, quote_code, rate, source, fetched_at)` con índice único diario por par.
- `convert(amount, from, to)` STABLE, busca rate directo → inverso → triangula vía MXN.
- Columnas `pos_products.currency_code` (default `'MXN'`) y `pos_sales.currency_code` + `pos_sales.fx_rate_to_base`.
- RLS lectura pública.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/currencies` | pública | Catálogo activo. |
| GET | `/api/fx/rates?base=MXN` | pública | Última tasa por par para `base`. |
| POST | `/api/fx/refresh` | admin/owner/superadmin | Fetcha de `api.exchangerate.host` y guarda. |

`POST /api/fx/refresh` body opcional:
```json
{ "base": "MXN" }
```
Estrategia idempotente: borra filas del día para `base` y re-inserta (respeta el UNIQUE diario).

## Helper servidor

```js
const mxn = await convertCurrency(100, 'USD', 'MXN');
```
Internamente llama a `POST /rpc/convert` (la función SQL).

## Cliente — `volvix-currency-wiring.js`

```html
<script src="/volvix-currency-wiring.js" defer></script>
```

API:
```js
Volvix.Currency.mountSelector('#currency-host');
Volvix.fmt(1234.5, 'USD');                 // "US$1,234.50"
Volvix.Currency.setCurrent('EUR');         // dispara 'volvix:currency-changed'
Volvix.Currency.convert(100, 'USD', 'MXN');
```

Cache:
- Moneda actual en `localStorage['volvix.currency']`.
- Tasas FX en `localStorage['volvix.fx.cache']` con TTL 6h.

Evento:
```js
window.addEventListener('volvix:currency-changed', e => {
  console.log('Nueva moneda:', e.detail.code);
});
```

## Flujo recomendado

1. Aplicar `db/R14_CURRENCIES.sql` en Supabase.
2. Llamar `POST /api/fx/refresh` (cron diario sugerido).
3. Incluir `volvix-currency-wiring.js` en POS y owner panel.
4. Montar selector con `Volvix.Currency.mountSelector(...)`.
5. Reemplazar formateos manuales por `Volvix.fmt(amount, code)`.

## Notas

- `exchangerate.host` no requiere API key.
- La función `convert` es STABLE: usable en queries y vistas.
- Para reportes en moneda base, almacenar siempre `pos_sales.fx_rate_to_base` al cerrar la venta.
- El UNIQUE diario evita duplicados al re-correr el refresh.
