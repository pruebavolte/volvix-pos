# Escenario 02 — Cliente solo quiere etiquetas con código de barras

> Tiempo estimado: **6 minutos** desde mensaje hasta primera etiqueta impresa.
> Dificultad: Fácil. Caso de "ticket promedio bajo".

## Cliente dice (WhatsApp textual)

> "Necesito imprimir etiquetas con código de barras para 200 productos de mi tienda. ¿Cuánto cobran solo por eso? No necesito POS, ya tengo otro."

## Tu respuesta inicial (template)

> "¡Claro! Te activo solo el módulo de Inventario + Etiquetas. Es $99/mes plan Lite-Etiquetas. Diseñas tus etiquetas (50×30mm, 70×40mm, custom), generas códigos de barras EAN-13 o Code128, e imprimes en cualquier impresora normal o térmica.
>
> Te dejo demo cargada con 200 productos de prueba para que veas cómo se ven. ¿Me confirmas:
> 1) Tu nombre y email
> 2) ¿Tamaño de etiqueta que necesitas?
> 3) ¿Tienes impresora térmica o normal?"

## Pasos exactos

### Paso 1 — Crear cuenta minimalista (1 min)
1. URL: `/web/v25/admin/create-tenant`
2. Plan: **Lite-Etiquetas** ($99/mes, 14 días gratis).
3. Giro: "Tienda general" (o el suyo).
4. Marcar **solo** estos módulos:
   - [x] Inventario
   - [x] Etiquetas + Códigos de barras
   - [ ] Todo lo demás OFF

### Paso 2 — Subir productos vía CSV (2 min)
URL: `/web/v25/inventory/import-csv`

Template CSV mínimo (solo 4 columnas obligatorias):
```csv
sku,nombre,precio,categoria
PROD001,Camisa M Azul,250,Ropa
PROD002,Pantalon 32 Gris,450,Ropa
PROD003,Tenis 27 Negro,890,Calzado
...
```

1. Cliente descarga template.
2. Llena 200 productos en Excel/Google Sheets.
3. Guarda como CSV UTF-8.
4. Sube en `/web/v25/inventory/import-csv`.
5. Sistema valida y muestra preview.
6. Click "Confirmar" → importa.

### Paso 3 — Generar códigos de barras (30 seg)
URL: `/web/v25/inventory/products`

1. Click "Seleccionar todo" (200 productos).
2. Click "Acciones masivas" → "Generar código de barras".
3. Tipo: **EAN-13** (estándar mexicano).
4. Sistema genera 200 códigos únicos en 5 segundos.

### Paso 4 — Diseñar etiqueta (2 min)
URL: `/web/v25/labels/designer`

1. Crear nueva plantilla "Etiqueta tienda 50×30mm".
2. Drag & drop:
   - Logo de la tienda (top-left)
   - Nombre del producto (centro)
   - Precio en grande (debajo del nombre)
   - Código de barras EAN-13 (bottom)
   - SKU pequeño (esquina)
3. Vista previa.
4. Guardar plantilla.

### Paso 5 — Imprimir (30 seg)
1. Click "Imprimir etiquetas".
2. Seleccionar todos los 200 productos.
3. Plantilla: "Etiqueta tienda 50×30mm".
4. Output:
   - PDF (12 páginas A4 con 16 etiquetas/página) si normal.
   - Comandos ESC/POS si térmica.
5. Imprimir desde navegador.

### Paso 6 — Configurar impresora térmica (opcional)
Si el cliente tiene térmica de etiquetas:
1. Conectar USB.
2. `/web/v25/settings/impresora-etiquetas`.
3. Seleccionar marca/modelo.
4. Test print.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta minimalista | 1 min |
| Importar CSV | 2 min |
| Generar barcodes | 0.5 min |
| Diseñar etiqueta | 2 min |
| Imprimir | 0.5 min |
| **Total** | **6 min** |

## Screenshots

- `docs/screenshots/scenarios/02/01-modules-only-labels.png`
- `docs/screenshots/scenarios/02/02-csv-template.png`
- `docs/screenshots/scenarios/02/03-import-preview.png`
- `docs/screenshots/scenarios/02/04-bulk-barcodes.png`
- `docs/screenshots/scenarios/02/05-label-designer.png`
- `docs/screenshots/scenarios/02/06-print-preview.png`

## Errores comunes y soluciones

### Error 1: "Mi CSV tiene caracteres raros"
**Causa**: Excel guardó como Windows-1252.
**Solución**: Guardar como "CSV UTF-8 (delimitado por comas)" en Excel → Archivo → Guardar como.

### Error 2: "Códigos de barras se duplican"
**Causa**: SKUs duplicados.
**Solución**: Sistema rechaza el import. Limpiar duplicados antes.

### Error 3: "La etiqueta sale cortada al imprimir"
**Causa**: Tamaño hoja navegador != tamaño plantilla.
**Solución**: Imprimir → Configuración → "Tamaño real" + márgenes 0.

### Error 4: "Quiero QR en lugar de barcode"
**Solución**: Etiqueta designer soporta ambos. Cambiar tipo en propiedades del elemento.

## Upsell oportunidad

> A los 14 días, cuando vea el panel: "¿Te interesa probar el POS para vender directo desde aquí? Te ahorras la doble captura."

Cambio de plan: Lite-Etiquetas $99 → Lite $199.
