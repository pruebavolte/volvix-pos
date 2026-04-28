# Escenario 09 — Papelería que vende a crédito a escuela

> Tiempo estimado: **12 minutos** desde mensaje hasta cliente con crédito activo.
> Dificultad: Media. Requiere configurar límite de crédito + bloqueo automático.

## Cliente dice (WhatsApp textual)

> "Tengo papelería frente a una escuela. La escuela me compra material todos los días para los maestros, pero pagan a fin de mes. Necesito llevar cuánto me deben y que el sistema no me deje seguir vendiendo cuando ya pasaron de cierto monto. Antes lo hacía a mano y se me pasó cobrar $8000 una vez."

## Tu respuesta inicial (template)

> "Caso clásico de cliente a crédito. SalvadoreX maneja crédito por cliente con límite y bloqueo automático cuando exceda.
>
> Plan Lite $199/mes alcanza. Te configuro la escuela con $5,000 de límite y al pasarse, el POS te bloquea hasta que paguen.
>
> Confirma:
> 1) ¿Cuánto crédito le quieres dar a la escuela? ($5,000? $10,000?)
> 2) ¿Pagan exactamente fin de mes o tienen otro corte?
> 3) ¿Hay otros clientes a crédito o solo esta escuela?"

## Pasos exactos

### Paso 1 — Cuenta Lite (1 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Lite** $199/mes.
3. Giro: **Papelería**.

### Paso 2 — Activar módulos (30 seg)
- [x] POS
- [x] Inventario
- [x] **Customers + Crédito**
- [x] Reportes
- [x] Cortes Z

### Paso 3 — Crear cliente "Escuela Primaria Sor Juana" (3 min)
URL: `/web/v25/customers/new`

```
Tipo: Empresa / Institución
Nombre: Escuela Primaria Sor Juana
Razón social: Centro Educativo Sor Juana A.C.
RFC: CES120304ABC
Email: admin@escuela.edu.mx
Teléfono contacto: 5598765432
Dirección: Reforma 123, CDMX

═══ Pestaña Crédito ═══
Crédito habilitado: SI
Límite de crédito: $5,000
Días de plazo: 30 días
Acción al exceder límite: BLOQUEAR ventas
Acción al exceder plazo: BLOQUEAR + alertar
Permite venta sin crédito si paga: SI
```

### Paso 4 — Test venta normal (1 min)
1. POS → seleccionar cliente "Escuela Sor Juana".
2. Agregar productos: 50 cuadernos $30 = $1,500.
3. Método pago: **Crédito** (nueva opción aparece porque cliente tiene crédito habilitado).
4. Sistema registra:
   - Saldo deudor escuela: $1,500.
   - Disponible: $3,500.
5. Imprime ticket con leyenda "PENDIENTE DE PAGO".

### Paso 5 — Test bloqueo (1 min)
1. POS → mismo cliente.
2. Agregar productos por $4,000.
3. Total $4,000 + saldo $1,500 = $5,500 → excede $5,000.
4. Sistema **bloquea**: "Cliente excede límite de crédito. Pague para continuar".
5. Opciones:
   - Cobrar lo que pagan ahora y aplicar resto.
   - Forzar venta (requiere autorización admin con código).

### Paso 6 — Registro de pago (1 min)
URL: `/web/v25/customers/{id}/payments`

1. Cliente paga $1,500 efectivo.
2. Click "Registrar pago".
3. Saldo se reduce a $0.
4. Crédito disponible vuelve a $5,000.

### Paso 7 — Estado de cuenta (1 min)
URL: `/web/v25/customers/{id}/statement`

Muestra:
- Tickets a crédito últimos 30 días.
- Pagos recibidos.
- Saldo actual.
- Días de mora.
- Botón "Enviar estado por email" (PDF).

### Paso 8 — Recordatorios automáticos (1 min)
URL: `/web/v25/customers/{id}/reminders`

```
Recordatorio día 25 (5 días antes corte):
  "Hola Escuela Sor Juana, su saldo es $X. Vence el 30."

Recordatorio día 28:
  "Su corte es en 2 días. Saldo $X."

Recordatorio día 31 (mora):
  "Vencido. Pague para evitar bloqueo de crédito."

Bloqueo automático día 35:
  Sistema bloquea ventas a crédito. Solo paga al contado.
```

### Paso 9 — Reporte crédito (1 min)
URL: `/web/v25/reports/credit`

- Total cuentas por cobrar (CxC).
- Aging: 0-30, 31-60, 61-90, 90+.
- Top deudores.
- Top clientes (más compran a crédito).
- Cobranza prevista del mes.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta + módulos | 1.5 min |
| Crear cliente crédito | 3 min |
| Test venta | 1 min |
| Test bloqueo | 1 min |
| Registrar pago | 1 min |
| Estado cuenta | 1 min |
| Recordatorios | 1 min |
| Reporte | 1 min |
| **Total** | **12 min** |

## Screenshots

- `docs/screenshots/scenarios/09/01-customer-credit-form.png`
- `docs/screenshots/scenarios/09/02-pos-credit-payment.png`
- `docs/screenshots/scenarios/09/03-credit-blocked-modal.png`
- `docs/screenshots/scenarios/09/04-payment-register.png`
- `docs/screenshots/scenarios/09/05-statement-pdf.png`
- `docs/screenshots/scenarios/09/06-credit-aging-report.png`

## Errores comunes y soluciones

### Error 1: "Vendí a crédito pero no especifiqué cliente"
**Causa**: Cajera pasó "Crédito" sin seleccionar cliente.
**Solución**: Sistema obliga seleccionar cliente. Si no hay cliente registrado, "Nuevo cliente rápido" inline.

### Error 2: "Cliente paga con tarjeta el saldo, no veo cómo registrar"
**Solución**: `/web/v25/customers/{id}/payments` → método: tarjeta → procesa Stripe → reduce saldo.

### Error 3: "Quiero permitir crédito a un cliente solo este mes"
**Solución**: Crear flag temporal con `expira_el = 2026-05-31`. Después se desactiva auto.

### Error 4: "Necesito que Director apruebe ventas sobre $3000 a crédito"
**Solución**: Workflow de aprobación. Configurar en `/web/v25/settings/approval-rules`:
```
IF venta_credito > 3000
THEN requiere autorización rol = "director"
```

### Error 5: "Mi cliente quebró, no me va a pagar nunca"
**Solución**: Marcar como "Incobrable" → mueve saldo a cuenta "Cuentas Incobrables" + audit log + bloqueo permanente.

## Casos similares

### Tienda de abarrotes con clientes "fiados"
- Múltiples clientes pequeños a crédito.
- Cada uno límite bajo ($500-$1500).
- Cobro semanal o quincenal.

### Distribuidor B2B
- Vende a tiendas más chicas.
- Crédito 30/60/90 días según cliente.
- Líneas de crédito grandes ($50,000+).

### Servicios profesionales
- Despacho contable factura mensual.
- Cliente paga a 30 días.
- Recordatorios automáticos.

## Integración con módulo CFDI

Si el cliente factura, el flujo:
1. Venta a crédito → CFDI con método "PUE" (Pago en una exhibición) o "PPD" (Pago en parcialidades).
2. Cuando paga → Complemento de Pago automático.
3. Reporte SAT incluye ambos.
