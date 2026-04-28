# Escenario 08 — Gimnasio con membresías mensuales recurrentes

> Tiempo estimado: **15 minutos** desde mensaje hasta primer cliente con mensualidad activa.
> Dificultad: Media. Requiere setup de cobro recurrente.

## Cliente dice (WhatsApp textual)

> "Tengo un gym chico, 80 socios. Cada uno paga $500 al mes. Hoy llevo todo en Excel y me robo a mí mismo porque pierdo gente que no paga. Necesito sistema que me cobre automático cada mes y que me avise quién está al día y quién no."

## Tu respuesta inicial (template)

> "Justo lo que necesitas. SalvadoreX maneja membresías recurrentes con cobro automático tarjeta o aviso para efectivo. Dashboard te dice quién está al día, quién en mora, quién por vencer.
>
> Plan Pro $399/mes (incluye módulo Membresías). 14 días gratis.
>
> Confirma:
> 1) ¿Tienes terminal Stripe o quieres que te ayudemos a darte de alta?
> 2) ¿Aceptas también pago en efectivo en recepción?
> 3) ¿Nivel de planes? (básico $500, premium $800, etc.)"

## Pasos exactos

### Paso 1 — Cuenta Pro (1 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Pro** $399/mes.
3. Giro: **Gimnasio / Fitness**.
4. Bootstrap demo: 5 planes membresía típicos.

### Paso 2 — Módulos activos (1 min)
- [x] POS (para venta de extras: protein shakes, ropa)
- [x] Customers + **Membresías recurrentes**
- [x] **Cobro recurrente Stripe** (sub-módulo)
- [x] Inventario (extras que vende)
- [x] Reportes
- [x] Cortes Z

### Paso 3 — Configurar Stripe Connect (3 min)
URL: `/web/v25/settings/payments/stripe`

1. Cliente ya tiene Stripe → mete API keys (publishable + secret).
2. Si no tiene → "Crear cuenta Stripe asistida" → onboarding 5 min.
3. Test transacción con tarjeta de prueba `4242 4242 4242 4242`.
4. Cambiar a producción.

### Paso 4 — Crear planes membresía (3 min)
URL: `/web/v25/memberships/plans`

3 planes:
```
Plan Básico
  Precio: $500/mes
  Periodo: mensual
  Beneficios: pesas + cardio
  Auto-renovación: SI
  Periodo gracia mora: 5 días

Plan Premium
  Precio: $800/mes
  Beneficios: básico + clases grupales + sauna

Plan Anual
  Precio: $5400 (descuento 10% vs mensual)
  Periodo: anual
  Pago único o 12 mensualidades
```

### Paso 5 — Migrar 80 socios actuales (5 min)

**Opción A**: Cliente tiene Excel.
1. Mandarle template CSV `gym-members-template.csv`:
```csv
nombre,email,telefono,plan,fecha_inicio,metodo_pago,tarjeta_terminacion,saldo_inicial
Juan Perez,juan@email.com,5512345678,Basico,2026-01-15,tarjeta,4242,0
Ana Garcia,ana@email.com,5598765432,Premium,2025-12-01,efectivo,,1500_mora
...
```
2. Sube en `/web/v25/customers/import-csv`.
3. Sistema crea customer + membership + saldo deudor.

**Opción B**: Captura manual (si pocos).

### Paso 6 — Configurar cobro automático (1 min)
URL: `/web/v25/memberships/settings`

```
Día de corte: 1 de cada mes
Hora de cargo: 03:00 AM
Reintento si falla: 3 días después, luego 7 días
Notificaciones:
  - 3 días antes: "Te cobramos en X días"
  - Día de cobro exitoso: "Pago recibido"
  - Si falla: "Hubo problema con tu tarjeta"
  - 7 días en mora: "Suspendemos acceso"
Tarjeta vencida: pedir actualización vía link
```

### Paso 7 — Dashboard de membresías (30 seg)
URL: `/web/v25/memberships/dashboard`

Muestra:
- 80 socios totales
- 65 al día (verde)
- 10 por vencer próximos 7 días (amarillo)
- 5 en mora (rojo) — accionables
- Ingresos recurrentes mensuales (MRR): $40,000
- Churn rate último mes
- Top 5 clientes que llevan más años

### Paso 8 — Test cobro (30 seg)
1. Crear membership de prueba con tarjeta test.
2. Forzar cobro manual.
3. Verificar webhook Stripe → success.
4. Customer pasa a "al día".

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta + Pro | 1 min |
| Módulos | 1 min |
| Stripe Connect | 3 min |
| Crear planes | 3 min |
| Migrar 80 socios | 5 min |
| Cobro auto config | 1 min |
| Dashboard tour | 0.5 min |
| Test cobro | 0.5 min |
| **Total** | **15 min** |

## Screenshots

- `docs/screenshots/scenarios/08/01-stripe-keys.png`
- `docs/screenshots/scenarios/08/02-membership-plans.png`
- `docs/screenshots/scenarios/08/03-import-members-csv.png`
- `docs/screenshots/scenarios/08/04-recurring-billing-config.png`
- `docs/screenshots/scenarios/08/05-dashboard-mrr.png`
- `docs/screenshots/scenarios/08/06-test-charge.png`

## Errores comunes y soluciones

### Error 1: "El cliente quiere cancelar pero ya le cobramos"
**Solución**: `/web/v25/memberships/{id}/cancel`. Opción:
- Cancelar al final del periodo (no reembolso).
- Cancelar inmediato + reembolso prorrateado vía Stripe.

### Error 2: "Tarjeta del cliente venció, no podemos cobrar"
**Solución**: Sistema manda email automático "Actualiza tu método de pago" con link Stripe Customer Portal. Cliente actualiza solo.

### Error 3: "Cliente paga efectivo, no quiere tarjeta"
**Solución**: Membership marcado como "manual_payment". Recepcionista cobra al venir y registra en POS. Sistema envía recordatorio cada mes.

### Error 4: "Quiero descuento del 10% en pareja (2 inscritos)"
**Solución**: Promo en `/web/v25/promos` con condición "customer.linked_to_member = true".

### Error 5: "Necesito reporte fiscal de ingresos recurrentes"
**Solución**: `/web/v25/reports/recurring-revenue` exporta XLSX con MRR/ARR/churn/LTV. Si hace CFDI, link a CFDI generado por cobro.

## Casos similares

### Plataformas de streaming, software, suscripciones
Mismo módulo membresías. Soporta:
- Trial gratis 7/14/30 días.
- Upgrade/downgrade con prorrateo.
- Pausa membresía (vacaciones).
- Family plans (1 cuenta paga, 4 usuarios).

### Renta de espacio (coworking)
- Membership "Hot desk" $200/día, $1500/mes.
- Membership "Oficina privada" $5000/mes.
- Acceso por QR.

### Servicios profesionales recurrentes
- Limpieza casa $1500/mes.
- Mantenimiento jardín $800/mes.
- Detallado auto $2000/mes.
