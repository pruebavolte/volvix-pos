# Escenario 01 — Café que quiere POS completo

> Tiempo estimado: **8 minutos** desde primer mensaje hasta primera venta real.
> Dificultad: Fácil. Es el caso "ideal".

## Cliente dice (WhatsApp textual)

> "Hola, tengo una cafetería en la esquina de Reforma. Vendemos cafés, pasteles y panes. Necesito un sistema para cobrar, llevar el inventario, sacar cortes de caja al final del día y reportes para mi contador. ¿Me sirve lo suyo?"

## Tu respuesta inicial (template para copiar)

> "¡Hola! Sí, SalvadoreX es perfecto para cafetería. Te dejo todo configurado en 3 minutos: POS rápido para cobros, inventario en tiempo real (ves cuántos granos te quedan), cortes Z firmados para tu contador, reportes diarios/semanales/mensuales y manejo de clientes frecuentes con su programa de puntos.
>
> Te abro cuenta gratis 14 días sin tarjeta. ¿Me confirmas:
> 1) Nombre del negocio
> 2) Tu nombre y email
> 3) ¿Tienes 1 o más sucursales?
>
> Te mando credenciales en cuanto las tenga."

## Pasos exactos

### Paso 1 — Crear cuenta (1 min)
1. Vendedor abre `https://salvadorex.com/web/v25/admin/create-tenant`.
2. Llenar:
   - Nombre negocio: "Café El Despertar"
   - Email dueño: prospecto@correo.com
   - Plan: Starter (14 días gratis)
   - Giro: **Cafetería**
3. Click "Crear" → obtiene credenciales temporales.

### Paso 2 — Bootstrap demo data (30 seg)
1. Sistema detecta giro = Cafetería.
2. Auto-carga preset:
   - 12 productos demo (espresso, americano, capuccino, latte, croissant, etc.)
   - 3 categorías (Bebidas, Panadería, Otros)
   - 2 promos demo (2x1 de 7-9am, 10% descuento estudiantes)
   - 1 método pago "Efectivo" + 1 "Tarjeta"
3. Cliente ya puede vender desde el primer click.

### Paso 3 — Activar módulos esenciales (1 min)
URL: `/web/v25/settings/modulos`

Marcar:
- [x] POS (default)
- [x] Inventario
- [x] Cortes Z
- [x] Reportes
- [x] Customers + Loyalty
- [x] Promociones

Dejar OFF (no lo necesita aún):
- KDS (no tiene cocina con varios cocineros)
- Multi-sucursal (1 sola)
- CFDI (la mayoría de cafés no facturan al inicio)
- Mesas

### Paso 4 — Tour 8 pasos (3 min)
1. Mandar URL: `https://salvadorex.com/web/v25/onboarding/tour?step=1`.
2. Cliente sigue tour:
   - Step 1: Bienvenida + video 30s.
   - Step 2: Conoce tu POS.
   - Step 3: Hacer primera venta de prueba.
   - Step 4: Inventario — ajustar stock inicial.
   - Step 5: Customers — crear cliente frecuente.
   - Step 6: Reportes — ver venta de prueba.
   - Step 7: Cortes Z — generar primer corte.
   - Step 8: ¡Listo! Felicitación.

### Paso 5 — Primera venta REAL (1 min)
1. Cliente entra a `/web/v25/pos`.
2. Click espresso → carrito.
3. Click capuccino → carrito.
4. Pago: "Efectivo" → tecla número 50 → cambio.
5. Imprimir ticket (PDF en pantalla, opcional impresora térmica).

### Paso 6 — Configurar impresora (opcional, 1 min)
Si el cliente tiene impresora térmica USB:
1. `/web/v25/settings/impresora`
2. Detectar dispositivo automáticamente.
3. Test ticket.

### Paso 7 — Hand-off a customer success (30 seg)
1. Notificar Slack `#new-customers`: "Café El Despertar onboardeado".
2. Crear ticket Calendly: "Llamada follow-up día 3 + día 7 + día 14".
3. Mandar WhatsApp: "Listo, ya estás vendiendo. En 3 días te llamo para ver dudas".

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta + bootstrap | 1.5 min |
| Activar módulos | 1 min |
| Tour 8 pasos | 3 min |
| Primera venta | 1 min |
| Impresora (opcional) | 1 min |
| Hand-off | 0.5 min |
| **Total** | **8 min** |

## Screenshots (rutas placeholder)

- `docs/screenshots/scenarios/01/01-create-tenant.png`
- `docs/screenshots/scenarios/01/02-preset-cafeteria.png`
- `docs/screenshots/scenarios/01/03-modules-toggle.png`
- `docs/screenshots/scenarios/01/04-tour-step1.png`
- `docs/screenshots/scenarios/01/05-first-sale.png`
- `docs/screenshots/scenarios/01/06-ticket-pdf.png`

## Errores comunes y soluciones

### Error 1: "El bootstrap demo data no se cargó"
**Causa**: Tenant creado pero el job de bootstrap no corrió.
**Solución**:
```bash
curl -X POST https://api.salvadorex.com/v1/tenants/{tenant_id}/bootstrap-demo \
  -H "Authorization: Bearer {admin_token}" \
  -d '{"giro": "cafeteria"}'
```

### Error 2: "Cliente dice que no ve el POS"
**Causa**: Módulo POS no activado por default.
**Solución**: Ir a `/web/v25/settings/modulos` y activar POS. Verificar que `feature_flag pos.enabled = true`.

### Error 3: "Imprime ticket en blanco"
**Causa**: Plantilla ticket no configurada.
**Solución**: `/web/v25/settings/ticket-template` → seleccionar "Café estándar 80mm".

### Error 4: "Cliente quiere agregar más productos rápido"
**Solución**: Mandarle template CSV `cafeteria-productos-template.csv` y subirlo en `/web/v25/inventory/import-csv`.

## Follow-up post-venta

- Día 1: WhatsApp "¿Cómo te fue con la primera venta real?"
- Día 3: Llamada video 15 min — resolver dudas inventario.
- Día 7: WhatsApp "Te mando reportes que generaste, ¿necesitas algo más?".
- Día 14: Antes de que termine trial, llamada de upsell a Pro.
