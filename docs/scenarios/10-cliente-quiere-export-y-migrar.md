# Escenario 10 — Cliente quiere TODOS sus datos para auditoría / migración (GDPR export)

> Tiempo estimado: **10 minutos** desde mensaje hasta ZIP descargado.
> Dificultad: Media. Requiere autorización del owner + verificación 2FA.

## Cliente dice (WhatsApp textual)

> "Mi contador me pide TODA mi información de los últimos 2 años para auditoría: ventas, clientes, productos, inventario, cortes, todo. ¿Pueden mandármelo en Excel o me lo bajo yo? Y de paso quiero saber si puedo cancelar después y llevarme mi data."

## Tu respuesta inicial (template)

> "Claro, soportamos export GDPR completo. Tu data es tuya siempre. Generas ZIP con todo (sales, customers, inventory, cortes, audit log) en formato CSV + JSON. Listo en 10 minutos.
>
> Y sí, si cancelas, te quedas con tu ZIP completo durante 90 días post-cancelación. Sin reten.
>
> Pasos:
> 1) Te confirmo tu email para mandar enlace seguro
> 2) Verifico tu identidad con código 2FA
> 3) Sistema arma el ZIP
> 4) Te bajas vía link único válido 24hrs"

## Pasos exactos

### Paso 1 — Cliente entra a panel (30 seg)
URL: `/web/v25/settings/data-export`

Solo el **owner** puede iniciar export. Si llama empleado, decirle que el dueño lo haga.

### Paso 2 — Verificación 2FA (1 min)
1. Click "Solicitar export completo".
2. Sistema pide código 2FA (SMS o email).
3. Cliente mete código.
4. Confirma scope:
   - [x] Todo (default)
   - [ ] Solo ventas
   - [ ] Solo customers
   - [ ] Solo inventario
   - [ ] Solo audit log

### Paso 3 — Configurar rango (30 seg)
```
Rango fechas:
  Desde: 2024-01-01
  Hasta: 2026-04-28 (hoy)

Formato:
  [x] CSV (para Excel)
  [x] JSON (para devs)
  [x] PDF (cortes, CFDI)

Incluir:
  [x] Sales (todas las ventas)
  [x] Customers (clientes y RFCs)
  [x] Inventory (productos + ajustes stock)
  [x] Cortes Z (PDFs firmados)
  [x] CFDI emitidos (XML + PDF)
  [x] Audit log (quién hizo qué cuándo)
  [x] Promos aplicadas
  [x] Memberships (si aplica)
```

### Paso 4 — Sistema genera ZIP (5 min, async)
1. Job asíncrono empieza: `audit.export.start`.
2. Email "Tu export está en proceso, llega en 5–10 min".
3. Cliente puede cerrar sesión, no afecta.

Estructura del ZIP:
```
salvadorex-export-{tenant_id}-{timestamp}.zip
├── README.txt              (qué incluye, formato)
├── manifest.json           (checksums + scope)
├── sales/
│   ├── sales-2024.csv
│   ├── sales-2025.csv
│   ├── sales-2026.csv
│   ├── sales-items-2024.csv  (líneas detalle)
│   ├── sales-items-2025.csv
│   └── sales-items-2026.csv
├── customers/
│   ├── customers.csv
│   └── customer-payments.csv
├── inventory/
│   ├── products.csv
│   ├── inventory-movements.csv
│   └── stock-snapshots.csv
├── cortes/
│   ├── cortes-z.csv
│   └── cortes-pdfs/
│       ├── corte-2024-01-01.pdf
│       └── ...
├── cfdi/
│   ├── cfdi-list.csv
│   └── xmls/
│       ├── ABC123.xml
│       └── ABC123.pdf
├── audit-log/
│   ├── audit-2024.csv
│   ├── audit-2025.csv
│   └── audit-2026.csv
├── promos/
│   ├── promos-rules.csv
│   └── promos-applied.csv
└── memberships/
    └── memberships.csv (si aplica)
```

### Paso 5 — Email de descarga (instantáneo cuando termina)
Cliente recibe:
```
Asunto: Tu export SalvadoreX está listo

Tu ZIP de respaldo completo está listo.
Tamaño: 47 MB
Contenido: 2 años de datos

Descargar (link válido 24 horas, encriptado):
https://salvadorex.com/exports/download/abc123xyz

SHA-256: 3f8a9b...
```

### Paso 6 — Verificación post-descarga (1 min)
1. Cliente descarga ZIP.
2. Verifica SHA-256 con archivo descargado.
3. Abre en Excel/Numbers/cualquier app.
4. Cuenta que tenga las ventas/customers/etc esperados.

### Paso 7 — Si cliente quiere cancelar (opcional, 2 min)
URL: `/web/v25/settings/account/cancel`

1. Click "Cancelar cuenta".
2. Encuesta corta (¿por qué te vas?).
3. Confirmar contraseña.
4. Sistema:
   - Genera export final automático.
   - Mantiene data 90 días en read-only.
   - Cancela cobro recurrente.
   - Email "Hemos cancelado tu cuenta. Tu data está disponible 90 días".

### Paso 8 — Soft-delete data después 90 días
- Día 90: email "Eliminamos tu data en 7 días si no la recuperas".
- Día 97: data se borra permanentemente (excepto fiscal/legal por ley).

## Tiempo total

| Paso | Tiempo |
|---|---|
| Acceso panel | 0.5 min |
| 2FA | 1 min |
| Configurar scope | 0.5 min |
| Generación async | 5 min (background) |
| Email + descarga | 1 min |
| Verificar | 1 min |
| Cancelación opcional | 2 min |
| **Total interactivo** | **~10 min** |

## Screenshots

- `docs/screenshots/scenarios/10/01-data-export-panel.png`
- `docs/screenshots/scenarios/10/02-2fa-prompt.png`
- `docs/screenshots/scenarios/10/03-export-scope.png`
- `docs/screenshots/scenarios/10/04-export-progress.png`
- `docs/screenshots/scenarios/10/05-download-email.png`
- `docs/screenshots/scenarios/10/06-zip-content.png`
- `docs/screenshots/scenarios/10/07-cancel-account.png`

## Errores comunes y soluciones

### Error 1: "El ZIP es muy grande, no descarga"
**Causa**: >500 MB en cuentas grandes.
**Solución**: Sistema parte en chunks de 500 MB. Email manda 3 links separados.

### Error 2: "Mi 2FA falla porque cambié de teléfono"
**Solución**: Recovery codes en `/web/v25/settings/security/recovery-codes`. Si los perdió → soporte por video con verificación INE.

### Error 3: "El CSV se ve mal en Excel (caracteres raros)"
**Causa**: Excel default abre con encoding equivocado.
**Solución**: Importar en Excel → Datos → Desde texto → UTF-8. O abrir en Numbers/Google Sheets que lo detectan auto.

### Error 4: "Quiero solo audit log de mis empleados"
**Solución**: Scope filtrado: `audit_log` con `actor_role = 'cashier'`. Customizable.

### Error 5: "Necesito el export en formato del SAT"
**Solución**: Opción "Formato SAT XML" → genera XMLs CFDI + complementos pago + balanza contable. Importable en Aspel/Contpaq.

### Error 6: "Mi contador quiere acceso lectura sin que vea pricing"
**Solución**: Crear usuario rol "auditor" con scope read-only y campo `hide_costs = true`. Ve ventas pero no márgenes.

## Cumplimiento legal

### GDPR / LFPDPPP
- Derecho de acceso: cumplido con este export.
- Derecho de portabilidad: ZIP es máquina-legible.
- Derecho al olvido: cancelación + soft-delete 97 días.

### SAT México
- Contabilidad electrónica: export incluye balanzas + pólizas.
- Resguardo fiscal: 5 años obligatorios. Exporta cubre.

### Auditoría externa
- Audit log inmutable con timestamps.
- Hash chain (block N referencia hash N-1) → no se puede alterar.
- Verificable por terceros con tool open-source.

## Caso especial: Migración a competidor

Si el cliente se va a Aspel/MicroSIP/QuickBooks:

1. Generar export estándar.
2. Pedir formato del destino:
   - Aspel: usa formato XLSX con columnas específicas.
   - MicroSIP: importa CSV con encoding Win-1252.
   - QuickBooks: IIF format.
3. Tenemos converters para los 3 (en `/web/v25/data-export/convert-to/{system}`).

Filosofía: NO bloqueamos al cliente que se va. Si se van por algo que les falta, anotamos para roadmap.
