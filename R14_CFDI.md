# R14 — CFDI 4.0 (Facturación electrónica México)

Integración de Comprobante Fiscal Digital por Internet versión 4.0 en Volvix POS,
con timbrado vía PAC Finkok y modo test sin dependencias externas.

## 1. Componentes

| Capa     | Archivo                              | Responsabilidad                                         |
| -------- | ------------------------------------ | ------------------------------------------------------- |
| Frontend | `public/volvix-cfdi-wiring.js`       | Cliente `Volvix.cfdi.*` + validadores RFC/CP/régimen    |
| Backend  | `api/index.js` (handler `handleCFDI`)| 3 endpoints REST + cliente SOAP Finkok via `https`      |
| DB       | `db/R14_CFDI_TABLES.sql`             | Tablas `invoices`, `invoice_lines`, `invoice_log` + RLS |

Sólo se usan módulos built-in (`https`, `crypto`). Ninguna dependencia npm
adicional.

## 2. Endpoints

Todos requieren `Authorization: Bearer <token>` y rol `owner` o `admin`
(verificado contra `volvix_usuarios.rol`).

### POST `/api/invoices/cfdi`
Genera y timbra un CFDI 4.0 a partir de una venta existente.

Body:
```json
{
  "sale_id": "uuid-de-venta",
  "receptor": {
    "rfc": "XAXX010101000",
    "razon_social": "PUBLICO EN GENERAL",
    "codigo_postal": "06000",
    "regimen_fiscal": "616",
    "uso_cfdi": "G03"
  }
}
```

Si se omite `receptor`, el backend resuelve los datos desde
`volvix_clientes` usando `venta.cliente_id`.

Respuesta `201`:
```json
{
  "ok": true,
  "uuid": "F5E8C9...",
  "sello": "...",
  "certificado_no": "30001000000500003456",
  "fecha_timbrado": "2026-04-26T12:00:00",
  "xml": "<?xml ...>",
  "pdf_url": null,
  "modo_test": true
}
```

### POST `/api/invoices/cfdi/cancel`
Body: `{ "uuid": "...", "motivo": "02", "folio_sustitucion": null }`.
Motivos SAT: `01` (sustituye CFDI — requiere `folio_sustitucion`),
`02` (errores sin relación), `03` (no se llevó a cabo), `04` (operación nominativa global).

### GET `/api/invoices/cfdi/:uuid/status`
Devuelve `estatus_local` (DB) y `estatus_sat` (consulta al PAC en producción).

## 3. Validadores SAT (front + back, espejo)

| Campo            | Regla                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| `rfc`            | `^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$` (física) / 3 letras (moral) / `XAXX010101000`    |
| `codigo_postal`  | 5 dígitos                                                                         |
| `regimen_fiscal` | Catálogo `c_RegimenFiscal` (601, 603, 605, 606, 607, 608, 610–612, 614–616, 620–626, 628–630) |
| `uso_cfdi`       | Catálogo `c_UsoCFDI` v4.0 (G01-G03, I01-I08, D01-D10, S01, CP01, CN01)            |
| `motivo cancel.` | `01` / `02` / `03` / `04`                                                         |

## 4. Modo test vs producción

`NODE_ENV !== 'production'` (default):
- No se llama al PAC.
- `crypto.randomUUID()` genera el UUID.
- Sello: SHA-256 base64 de `uuid + total + rfc_receptor`.
- `modo_test: true` se persiste en `invoices.modo_test`.

`NODE_ENV === 'production'`:
- SOAP a `FINKOK_HOST` (`facturacion.finkok.com` por default) usando
  `https.request` con header `SOAPAction`.
- Endpoints SOAP usados:
  `/servicios/soap/stamp.wsdl` (timbrado),
  `/servicios/soap/cancel.wsdl` (cancelación),
  `/servicios/soap/utilities.wsdl` (consulta SAT).
- Credenciales: `FINKOK_USER`, `FINKOK_PASS`.

## 5. Variables de entorno

```
NODE_ENV=production              # activar PAC real
FINKOK_HOST=facturacion.finkok.com
FINKOK_USER=<usuario_pac>
FINKOK_PASS=<password_pac>
CFDI_EMISOR_RFC=ABC010101AB1
CFDI_EMISOR_NOMBRE=MI EMPRESA SA DE CV
CFDI_EMISOR_REGIMEN=601
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

En desarrollo basta dejar `NODE_ENV` sin definir; el backend timbra mock.

## 6. Esquema de base de datos

Aplicar con:
```bash
psql "$SUPABASE_DB_URL" -f db/R14_CFDI_TABLES.sql
```
o pegar el SQL en el editor de Supabase.

Tablas creadas:
- **invoices** — cabecera CFDI: emisor, receptor, importes, sello, certificado, XML, `pdf_url`, estatus, `modo_test`.
- **invoice_lines** — partidas con clave SAT, cantidad, importe, IVA/IEPS.
- **invoice_log** — bitácora de timbrado/cancelación/consulta con request/response XML y http_status.

Indices: por `tenant_id`, `sale_id`, `uuid`, `rfc_receptor`, `estatus`, `fecha_timbrado`.

RLS: aislamiento por `tenant_id` vía `volvix_usuarios`. El backend con
service-role key bypassea RLS (correcto, ya valida rol owner|admin manualmente).

## 7. Integración en server.js

Importar y montar antes del fallback estático:
```js
const { handleCFDI } = require('./api');
// dentro del request handler, en el bloque /api:
if (await handleCFDI(req, res, method, pathname, parsed)) return;
```

## 8. Uso desde el front

Cargar el script en `pos.html` u `owner.html`:
```html
<script src="/volvix-cfdi-wiring.js"></script>
```

Ejemplo:
```js
const cfdi = await Volvix.cfdi.generar(saleId, {
  rfc: 'CCO110630AB1',
  razon_social: 'CLIENTE COMERCIAL SA DE CV',
  codigo_postal: '64000',
  regimen_fiscal: '601',
  uso_cfdi: 'G03'
});
console.log('UUID:', cfdi.uuid);

await Volvix.cfdi.cancelar(cfdi.uuid, '02');
const st = await Volvix.cfdi.consultarEstatus(cfdi.uuid);
```

Validadores expuestos:
```js
Volvix.cfdi.validators.validarRFC('XAXX010101000');     // {ok:true, tipo:'generico'}
Volvix.cfdi.validators.validarCP('06000');              // {ok:true, cp:'06000'}
Volvix.cfdi.validators.validarRegimen('601');           // {ok:true, regimen:'601'}
Volvix.cfdi.validators.validarReceptor({...});          // {ok:true} | {ok:false, errors:[...]}
```

## 9. Pendientes / fuera de alcance

- Generación de PDF (actualmente `pdf_url: null`). Se puede implementar con
  un renderer server-side; el campo ya existe en el schema.
- Carga del CSD (.cer/.key) y firmado real del XML antes de timbrar — en
  producción Finkok exige el XML pre-sellado por el emisor.
- Complementos (Pagos, Nómina, Carta Porte) — el schema soporta extender
  `invoice_lines` y agregar tablas de complemento sin romper compatibilidad.
- UI de facturación en `pos.html`/`owner.html` (botón "Facturar venta").

## 10. Verificación

```bash
node --check api/index.js
node --check public/volvix-cfdi-wiring.js
```
Ambos archivos pasan validación de sintaxis.
