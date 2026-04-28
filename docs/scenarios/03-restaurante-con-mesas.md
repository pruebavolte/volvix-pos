# Escenario 03 — Restaurante con mesas, KDS y meseros

> Tiempo estimado: **15 minutos** desde mensaje hasta primera comanda enviada a cocina.
> Dificultad: Media. Requiere mapear mesas y crear roles.

## Cliente dice (WhatsApp textual)

> "Tengo un restaurante de comida mexicana, 18 mesas, 3 meseros, 1 cocinero. Quiero que el mesero tome la orden en su celular y le llegue a la cocina sin papel. Que la cocina vea qué platillo va para qué mesa y cuándo está listo. Y que el mesero cobre desde su celular cuando el cliente pide la cuenta."

## Tu respuesta inicial (template)

> "¡Excelente caso! SalvadoreX hace exactamente eso: módulo Mesas (mapa de tu salón) + KDS Cocina (pantalla en tiempo real con órdenes) + MultiPOS (cada mesero en su celular). Plan Pro $399/mes.
>
> Te abro cuenta y configuramos las 18 mesas en 10 minutos. ¿Me mandas:
> 1) Nombre del restaurante + email
> 2) Layout aprox del salón (foto o describe filas y mesas)
> 3) Nombres de tus 3 meseros + el cocinero?"

## Pasos exactos

### Paso 1 — Crear cuenta plan Pro (1 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Pro** ($399/mes, 14 días gratis).
3. Giro: **Restaurante**.
4. Bootstrap demo: 25 platillos típicos mexicanos pre-cargados.

### Paso 2 — Activar módulos (1 min)
URL: `/web/v25/settings/modulos`

Activar:
- [x] POS
- [x] **Mesas** (gestión mapa salón)
- [x] **KDS** (Kitchen Display System)
- [x] **MultiPOS** (varios usuarios simultáneos)
- [x] Inventario
- [x] Cortes Z
- [x] Reportes
- [x] Customers

### Paso 3 — Mapear salón (4 min)
URL: `/web/v25/restaurant/floor-plan`

1. Click "Nuevo salón principal".
2. Drag & drop 18 mesas:
   - Mesa 1–6: zona ventana (4 personas c/u)
   - Mesa 7–12: zona central (4 personas c/u)
   - Mesa 13–16: zona terraza (6 personas c/u)
   - Mesa 17–18: barra (2 personas c/u)
3. Numerar y guardar.
4. Asignar zonas de meseros (opcional).

### Paso 4 — Crear usuarios (3 min)
URL: `/web/v25/users/create`

Crear 4 usuarios:
1. **Mesero Juan** (rol: mesero, zona: ventana)
2. **Mesera María** (rol: mesero, zona: central)
3. **Mesero Pedro** (rol: mesero, zona: terraza+barra)
4. **Cocinero Luis** (rol: cocina-kds, sin acceso POS)

Mandar credenciales a cada uno por WhatsApp.

### Paso 5 — Configurar KDS cocina (1 min)
1. Cocinero Luis abre `/web/v25/kds` en tablet de cocina.
2. Pantalla muestra: Orden Mesa #X | Platillos | Tiempo desde pedido.
3. Cocinero hace tap en "Listo" cuando platillo está hecho → mesero recibe notificación.

### Paso 6 — Configurar menú (3 min)
URL: `/web/v25/menu`

1. Verificar 25 platillos demo o subir CSV propio.
2. Categorías: Entradas, Platos fuertes, Postres, Bebidas.
3. Modificadores por platillo (sin cebolla, extra queso, término carne).
4. Imágenes opcionales para cada platillo.

### Paso 7 — Test de flujo completo (2 min)
1. Mesero Juan en su celular: `/web/v25/pos`.
2. Selecciona Mesa 3 → orden:
   - 2 Tacos al pastor
   - 1 Quesadilla con extra queso
   - 2 Coca colas
3. Click "Enviar a cocina".
4. **Cocinero Luis** ve en KDS: orden Mesa 3, 5 ítems.
5. Cocinero hace tacos → tap "Listo" → notificación a Juan.
6. Cliente pide la cuenta → Juan en su celular: "Cobrar Mesa 3".
7. Pago: efectivo $350, cambio $0.
8. Mesa se libera automáticamente.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta + plan | 1 min |
| Activar módulos | 1 min |
| Mapear salón | 4 min |
| Crear usuarios | 3 min |
| Setup KDS | 1 min |
| Configurar menú | 3 min |
| Test flujo | 2 min |
| **Total** | **15 min** |

## Screenshots

- `docs/screenshots/scenarios/03/01-modules-restaurant.png`
- `docs/screenshots/scenarios/03/02-floor-plan-design.png`
- `docs/screenshots/scenarios/03/03-users-list.png`
- `docs/screenshots/scenarios/03/04-kds-screen.png`
- `docs/screenshots/scenarios/03/05-menu-modifiers.png`
- `docs/screenshots/scenarios/03/06-flow-test-mesa3.png`

## Errores comunes y soluciones

### Error 1: "El KDS no recibe órdenes"
**Causa**: Mesero no le dio "Enviar a cocina", solo guardó como borrador.
**Solución**: Confirmar que botón es "Enviar" (verde) no "Guardar" (gris). Verificar permisos rol cocina-kds en `audit_log`.

### Error 2: "Mesero no ve sus mesas asignadas"
**Causa**: Zona no configurada.
**Solución**: `/web/v25/users/{user_id}/zones` → asignar zona.

### Error 3: "Dos meseros entran a la misma mesa"
**Solución**: Sistema bloquea con "Mesa ocupada por X". Si necesitan compartir, activar flag "mesa-multi-mesero".

### Error 4: "El cliente pidió cambiar de mesa"
**Solución**: `/web/v25/restaurant/transfer-table` → seleccionar origen → destino → confirmar. Orden completa se mueve.

### Error 5: "Cocinero terminó platillo pero mesero no se entera"
**Causa**: Notificaciones push no activadas en celular del mesero.
**Solución**: Pedir habilitar notificaciones del navegador. Como fallback, KDS hace sonido de campana.

## Setup avanzado (opcional)

- **Reservaciones**: módulo Reservations link `/web/v25/reservations`.
- **Propinas**: configurar % sugerido (10/15/18%) en `/web/v25/settings/tips`.
- **División de cuenta**: cliente paga 60%, otro 40% — soportado en POS al momento de cobrar.
- **Comanda impresa duplicada**: cocina + barra (impresoras separadas).
