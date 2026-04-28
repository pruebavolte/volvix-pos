# Escenario 06 — Boutique con promo "2x1 fines de semana"

> Tiempo estimado: **8 minutos** desde mensaje hasta primera promo aplicada en venta real.
> Dificultad: Fácil-media. Requiere lógica de reglas.

## Cliente dice (WhatsApp textual)

> "Tengo una boutique. Cada fin de semana lanzamos promo 2x1 en blusas. Pero solo viernes-domingo, 6pm-cierre. Que el sistema lo aplique automático para no equivocarnos. Y necesito reporte de cuántas blusas vendí en promo vs precio normal."

## Tu respuesta inicial (template)

> "Perfecto, módulo Promociones lo hace nativo. Configuras la regla una vez y se aplica automático en horario. Reporte detallado con/sin promo incluido.
>
> Plan Lite $199/mes alcanza para esto. Te configuro la promo en 8 minutos.
>
> Confirma:
> 1) ¿Qué blusas exactamente entran? (todas o categoría específica)
> 2) ¿2x1 = paga 1 lleva 2, o paga el más caro?
> 3) ¿Aplica también cuando lleva 4 (paga 2)?"

## Pasos exactos

### Paso 1 — Cuenta + módulo promociones (2 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Lite** $199/mes.
3. Giro: Boutique.
4. Activar módulos:
   - [x] POS
   - [x] Inventario
   - [x] **Promociones**
   - [x] Reportes
   - [x] Cortes Z

### Paso 2 — Marcar productos de la promo (2 min)
URL: `/web/v25/inventory/products`

1. Filtrar por categoría "Blusas".
2. Seleccionar todas (o las específicas que apliquen).
3. Acción masiva: "Etiquetar para promo" → tag "promo-2x1-finsem".

### Paso 3 — Crear regla de promoción (3 min)
URL: `/web/v25/promos/create`

Configuración:
```
Nombre: 2x1 Blusas Fin de Semana
Tipo: Compra X obtén Y gratis
Trigger: Compra 2 productos con tag "promo-2x1-finsem"
Acción: Descuento 100% al de menor precio
Apilable con otras promos: NO
Aplica a:
  - Productos con tag "promo-2x1-finsem"

Horario:
  - Días: Viernes, Sábado, Domingo
  - Horas: 18:00 - 23:59
  - Zona horaria: America/Mexico_City

Vigencia:
  - Inicio: 2026-04-30
  - Fin: indefinido (puedes pausar cuando quieras)

Límite:
  - Por ticket: máximo 5 aplicaciones de la promo
  - Por cliente: ilimitado
```

### Paso 4 — Test que reglas funcionen (1 min)
1. Cambiar fecha del sistema a viernes 7pm (admin → debug → mock-time).
2. POS: agregar 4 blusas (precios $300, $400, $500, $600).
3. Verificar: descuento auto-aplicado al $300 y $500 (las dos baratas de cada par).
4. Total: $1000 en lugar de $1800.

### Paso 5 — Avisar al cliente cómo ver el reporte
URL: `/web/v25/reports/promos`

Reporte muestra:
- Cuántas ventas con promo aplicada.
- Cuántas blusas vendidas en promo.
- Cuántas blusas vendidas a precio normal.
- Comparativo ingresos con/sin promo.
- Día/hora pico de uso.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta + módulos | 2 min |
| Marcar productos | 2 min |
| Crear regla | 3 min |
| Test | 1 min |
| **Total** | **8 min** |

## Screenshots

- `docs/screenshots/scenarios/06/01-products-tagged.png`
- `docs/screenshots/scenarios/06/02-promo-rule-form.png`
- `docs/screenshots/scenarios/06/03-pos-promo-applied.png`
- `docs/screenshots/scenarios/06/04-ticket-with-discount.png`
- `docs/screenshots/scenarios/06/05-promo-report.png`

## Errores comunes y soluciones

### Error 1: "La promo se aplica fuera de horario"
**Causa**: Zona horaria mal configurada.
**Solución**: `/web/v25/settings/timezone` → America/Mexico_City. Verificar daylight saving si aplica.

### Error 2: "Cliente compró 3 blusas y solo se aplicó a 1"
**Causa**: Regla configurada como "1 promo por ticket".
**Solución**: Editar regla → "Hasta 5 aplicaciones por ticket" (1 par 2x1 = 1 aplicación).

### Error 3: "Promo se apila con descuento manual"
**Causa**: Apilable = SI por error.
**Solución**: Editar regla → "Apilable con otras promos: NO". Audit log muestra qué promo ganó.

### Error 4: "Cajera dio descuento manual de 50% sobre promo ya aplicada"
**Solución**: Permisos por rol → cajera no puede dar descuento manual >10%. Configurar en `/web/v25/settings/permissions/discount-limit`.

### Error 5: "Quiero promo solo para clientes con tarjeta de lealtad"
**Solución**: Agregar filtro al trigger: "Cliente tiene tarjeta lealtad activa". Requiere módulo Customers + Loyalty.

## Tipos de promociones soportadas

1. **2x1, 3x2, 4x3** — buy X get Y free.
2. **Descuento %** — 10% off, 20% off, etc.
3. **Descuento $** — $50 off por encima de $500.
4. **Combo** — 1 blusa + 1 falda = $700 (precio fijo).
5. **Happy hour** — descuento por horario.
6. **Cumpleaños** — 15% off el mes del cliente.
7. **Cashback** — 5% en puntos.
8. **Cupón código** — `VERANO20`.
9. **Primer compra** — 10% off.
10. **Compra mínima** — $1000+ free shipping (e-commerce).

## Casos avanzados

### Promos complejas con AND/OR
> "Si compra blusa Y zapato Y es fin de semana → 30% off"

Editor visual:
```
IF (
  product.tag IN ['blusa']
  AND product.tag IN ['zapato']
  AND day IN ['fri', 'sat', 'sun']
)
THEN apply_discount(30%)
```

### Promos por sucursal
Una sucursal en promo, otras no:
- Crear regla con filtro `branch_id = polanco`.

### Auditoría
Cada aplicación de promo queda en `audit_log` con: usuario, fecha, ticket, regla aplicada, descuento.
