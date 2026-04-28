# Escenario 04 — Farmacia que necesita CFDI obligatorio

> Tiempo estimado: **20 minutos** (espera + setup). Bloquea hasta que cliente entregue keys Facturama.
> Dificultad: Media-alta. Requiere keys de proveedor PAC.

## Cliente dice (WhatsApp textual)

> "Tengo una farmacia en CDMX. Por SAT necesito facturar el 100% de mis ventas con CFDI 4.0 a partir del próximo mes. ¿Su sistema lo hace? Y necesito control de caducidades de medicamentos por lote."

## Tu respuesta inicial (template)

> "Sí, soportamos CFDI 4.0 vía Facturama (PAC autorizado SAT). También control de lotes y caducidades para farmacia.
>
> Para activar CFDI necesito que tramites tu cuenta Facturama (15 min en facturama.mx) y me pases:
> 1) API Key Facturama
> 2) API Secret Facturama
> 3) Tu CSD (Certificado Sello Digital) — archivos .cer y .key + contraseña
> 4) RFC del negocio
>
> Mientras tanto te abro tu cuenta SalvadoreX en plan Pro $399/mes y precargamos demo. Cuando me mandes los keys, activamos CFDI."

## Pasos exactos

### Paso 1 — Crear cuenta Pro (1 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Pro** ($399/mes incluye 200 CFDI/mes).
3. Giro: **Farmacia**.
4. Bootstrap demo: 50 medicamentos típicos pre-cargados con lotes/caducidad.

### Paso 2 — Activar módulos (1 min)
URL: `/web/v25/settings/modulos`

- [x] POS
- [x] Inventario + **Lotes y Caducidades** (sub-módulo)
- [x] **CFDI 4.0** (estará en estado "pendiente keys")
- [x] Customers (con RFC)
- [x] Cortes Z
- [x] Reportes

### Paso 3 — Setup catálogo medicamentos (5 min)

URL: `/web/v25/inventory/products`

CSV template farmacia:
```csv
sku,nombre,precio,categoria,clave_sat,unidad_sat,controlado,receta_requerida
MED001,Paracetamol 500mg 20pz,45,Analgesicos,51160100,H87,no,no
MED002,Amoxicilina 500mg 12pz,180,Antibioticos,51160100,H87,no,si
...
```

Sub-tabla: **Lotes** (`/web/v25/inventory/products/{id}/lots`):
```
SKU       | Lote     | Caducidad   | Cantidad
MED001    | LT2024A  | 2026-12-31  | 50
MED001    | LT2025B  | 2027-06-30  | 30
MED002    | LTRX01   | 2026-08-15  | 12
```

### Paso 4 — Configurar alertas caducidad (1 min)
URL: `/web/v25/settings/alerts`

- Alerta **30 días antes** de caducidad → email + dashboard.
- Alerta **7 días antes** → notificación push + WhatsApp.
- Auto-bloqueo de venta cuando caduca.

### Paso 5 — Cliente tramita Facturama (15 min, NO depende de nosotros)
**Aviso al cliente**:
> "Mientras tu sistema arranca, registra tu cuenta en facturama.mx. Te tarda 10 minutos. Necesitas tener tu CSD del SAT a la mano. Cuando tengas API Key y Secret, mándamelos."

### Paso 6 — Configurar Facturama keys (2 min, BLOQUEADO hasta paso 5)
URL: `/web/v25/settings/cfdi`

1. Pegar API Key Facturama.
2. Pegar API Secret.
3. Subir certificados:
   - Archivo .cer
   - Archivo .key
   - Contraseña CSD
4. Test con CFDI ping a Facturama sandbox.
5. Cambiar a producción.
6. RFC del emisor.
7. Régimen fiscal (601, 612, 626, etc.).
8. Lugar expedición (CP).

### Paso 7 — Crear primer cliente con RFC (1 min)
URL: `/web/v25/customers/new`

1. Nombre: Cliente Genérico (XAXX010101000) **o** RFC real.
2. Régimen fiscal cliente.
3. Uso CFDI default: G03 (Gastos en general).

### Paso 8 — Primera venta con CFDI (2 min)
1. POS: agregar 2 medicamentos.
2. Cobrar tarjeta $250.
3. Click "Facturar".
4. Seleccionar cliente.
5. Sistema llama Facturama → genera CFDI 4.0.
6. PDF + XML descargables.
7. Email automático al cliente con el CFDI.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta Pro | 1 min |
| Activar módulos | 1 min |
| Setup medicamentos | 5 min |
| Alertas caducidad | 1 min |
| **Cliente trámite Facturama** | 15 min (paralelo) |
| Configurar keys | 2 min |
| Cliente con RFC | 1 min |
| Primer CFDI | 2 min |
| **Total** | **~28 min (con espera)** |

## Screenshots

- `docs/screenshots/scenarios/04/01-modules-pharma.png`
- `docs/screenshots/scenarios/04/02-products-with-lots.png`
- `docs/screenshots/scenarios/04/03-caducity-alerts.png`
- `docs/screenshots/scenarios/04/04-facturama-keys.png`
- `docs/screenshots/scenarios/04/05-cfdi-generated.png`

## Errores comunes y soluciones

### Error 1: "Facturama rechaza con error CSD inválido"
**Causa**: CSD vencido o contraseña incorrecta.
**Solución**: Verificar CSD vigente en SAT. Re-subir archivo .key con contraseña correcta. Probar primero en sandbox.

### Error 2: "RFC del cliente inválido"
**Causa**: RFC mal escrito o no registrado en SAT.
**Solución**: Validar formato (12 chars persona moral, 13 chars física). API Facturama tiene endpoint `/validate-rfc`.

### Error 3: "Medicamento caducado se vendió"
**Causa**: Auto-bloqueo no activado.
**Solución**: `/web/v25/settings/alerts` → activar "Bloqueo venta caducados". Audit log lo registra.

### Error 4: "Cliente extranjero sin RFC"
**Solución**: Usar RFC genérico extranjero `XEXX010101000` con dirección en EUA o país.

### Error 5: "Necesito cancelar CFDI emitido"
**Solución**: `/web/v25/cfdi/{id}/cancel` → motivo (01, 02, 03, 04). SAT cancela en 72hrs.

## Cumplimiento SAT

- CFDI 4.0 obligatorio desde 2024 ✓
- Carta Porte: NO aplica para farmacia.
- Complemento de Pago: aplica si hay venta a crédito (módulo customers + crédito).
- Reportes contables: exporta XLSX para SAT.
