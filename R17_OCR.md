# R17 — OCR de tickets / recibos

**Objetivo**: captura rápida de gastos y proveedores escaneando ticket con la cámara o subiendo imagen.

## Componentes entregados

| Archivo | Función |
|---|---|
| `volvix-ocr-wiring.js` | Cliente: Tesseract.js v5 (CDN), parser ticket MX, UI input+preview+form |
| `api/index.js` | Endpoints `POST /api/ocr/parse-receipt` y `POST /api/purchases/from-ocr` |
| `db/R17_OCR.sql` | Tabla `ocr_scans` + índices + RLS |

## Cliente (`Volvix.ocr`)
- `scanReceipt(file)` → `{raw, total, date, rfc, items[]}`
- `parseMexicanTicket(text)` → mismo shape (sin OCR, parsing puro)
- `openScannerUI(el)` → renderiza `<input type=file accept=image/* capture=environment>` + preview + form pre-rellenado
- `createPurchaseFromOcr(parsed)` → POST autenticado a `/api/purchases/from-ocr`

## Heurísticas de parsing (ticket MX)
- **Total**: `TOTAL\s*\$?\s*([0-9]+(?:[.,][0-9]{2}))`
- **RFC**: `[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}` (12 moral / 13 física)
- **Fecha**: `DD/MM/YYYY` o `DD-MM-YYYY`, normaliza a `YYYY-MM-DD`
- **Items**: líneas `descripción + $precio`, excluye TOTAL/SUBTOTAL/IVA/CAMBIO/EFECTIVO

## API

### `POST /api/ocr/parse-receipt` (auth)
Body: `{ raw: string, parsed?: {rfc,total,date,items} }`
Response:
```json
{ "vendor": {"rfc":"XAXX010101000","valid":true},
  "total": 234.50, "date":"2026-04-26",
  "items_detected": 5, "suggested_purchase_id": null,
  "scan_id": "uuid" }
```
Persiste fila en `ocr_scans` (si tabla existe; si no, no bloquea).

### `POST /api/purchases/from-ocr` (auth)
Body: `{rfc,date,total,items,scan_id?,raw?}`
Crea `purchase` con `source='ocr'`, vincula `ocr_scans.purchase_id` y status `linked`.
Validación: `total > 0` (sendValidation 400). Tolera tabla `purchases` faltante (devuelve dry-run id).

## SQL `db/R17_OCR.sql`
- `ocr_scans(id, user_id, tenant_id, raw_text, parsed jsonb, image_url, purchase_id, status, created_at)`
- 5 índices (user, tenant, created DESC, purchase, GIN parsed)
- RLS: SELECT/INSERT/UPDATE filtrados por `user_id = auth.uid()`

## Pendiente (no bloqueante)
- Subir imagen a Supabase Storage (`image_url` queda nullable hasta entonces)
- Cruzar `vendor_rfc` con catálogo SAT (R14_SAT_CATALOGS) para auto-completar razón social
- Aprendizaje: si `RFC ya existió`, sugerir mismo `vendor_id` (`suggested_purchase_id` real)

## Estado
**LISTO PARA DEPLOY**. Compatible con R13 auth + R16 RLS hardening. Sin breaking changes.
