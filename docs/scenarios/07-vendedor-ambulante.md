# Escenario 07 — Vendedor ambulante con POS móvil offline

> Tiempo estimado: **6 minutos** desde mensaje hasta venta offline funcionando.
> Dificultad: Fácil. Es la fortaleza de la PWA.

## Cliente dice (WhatsApp textual)

> "Soy vendedor ambulante de tamales. Vendo en la calle, en parques, en mercados. No siempre tengo internet bueno. Necesito cobrar y dar ticket aunque esté en zona sin señal. ¿Su sistema funciona offline?"

## Tu respuesta inicial (template)

> "Sí, ESA es nuestra ventaja. Modo offline real con PWA: cobras, das ticket, todo sin internet. Cuando vuelve la señal, se sincroniza solo. Plan Lite $199/mes te alcanza.
>
> Confirma:
> 1) ¿Qué celular tienes? (Android / iPhone, modelo)
> 2) ¿Cuántos productos vendes (1 producto = tamales? o varios sabores)?
> 3) ¿Aceptas solo efectivo o también transferencia?"

## Pasos exactos

### Paso 1 — Cuenta + plan minimal (1 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Lite** $199/mes.
3. Giro: "Otro / Vendedor móvil".
4. Bootstrap demo skip (cargamos 5 productos a mano).

### Paso 2 — Activar módulos (30 seg)
- [x] POS
- [x] **Modo Offline (PWA)**
- [x] Inventario simple
- [x] Cortes Z
- [ ] Resto OFF

### Paso 3 — Cargar productos (1 min)
URL: `/web/v25/inventory/products/new`

5 productos típicos:
```
SKU      | Nombre              | Precio
TAM001   | Tamal verde         | 15
TAM002   | Tamal rojo          | 15
TAM003   | Tamal dulce         | 15
TAM004   | Atole champurrado   | 25
TAM005   | Atole frutas        | 25
```

### Paso 4 — Instalar PWA en celular (2 min)

**En Android Chrome**:
1. Abrir `https://salvadorex.com/web/v25/pos` en celular.
2. Login con credenciales.
3. Banner "Instalar app" → tap.
4. Aparece icono SalvadoreX en home screen.
5. Abrir como app nativa.

**En iPhone Safari**:
1. Abrir `https://salvadorex.com/web/v25/pos` en Safari.
2. Login.
3. Compartir → "Añadir a inicio".
4. Icono en home screen.

### Paso 5 — Test offline (1 min)
1. Activar avión mode en celular.
2. Abrir SalvadoreX (app PWA).
3. POS sigue cargando (cache local).
4. Hacer venta:
   - 2 tamales verdes
   - 1 atole champurrado
   - Total $55
5. Cobrar efectivo.
6. **Imprimir ticket** (PDF en pantalla, Bluetooth a impresora térmica si tiene).
7. Banner "Offline — venta guardada local, se sincroniza al reconectar".

### Paso 6 — Test sync (30 seg)
1. Desactivar avión.
2. Sistema detecta conexión.
3. Banner "Sincronizando 1 venta..." → success.
4. Venta aparece en `/web/v25/sales` desde laptop.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta + plan | 1 min |
| Activar módulos | 0.5 min |
| Cargar productos | 1 min |
| Instalar PWA | 2 min |
| Test offline | 1 min |
| Test sync | 0.5 min |
| **Total** | **6 min** |

## Screenshots

- `docs/screenshots/scenarios/07/01-pwa-install-banner.png`
- `docs/screenshots/scenarios/07/02-pwa-installed-home.png`
- `docs/screenshots/scenarios/07/03-pos-offline-mode.png`
- `docs/screenshots/scenarios/07/04-offline-sale-saved.png`
- `docs/screenshots/scenarios/07/05-sync-after-online.png`

## Errores comunes y soluciones

### Error 1: "PWA no aparece banner para instalar"
**Causa**: Navegador no soporta o ya instalado.
**Solución**: 
- Android: Chrome → menú 3 puntos → "Añadir a pantalla principal".
- iPhone: Safari → compartir → "Añadir a inicio".
- Si Firefox: no soporta tan bien, recomendar Chrome.

### Error 2: "Vendí offline pero al sincronizar dice 'venta duplicada'"
**Causa**: Cliente abrió desde 2 dispositivos al mismo tiempo.
**Solución**: Sistema detecta UUID de venta. Si ya existe, hace merge. Verificar `audit_log` para resolver conflicto manual.

### Error 3: "El stock no se descuenta hasta que sincronizo"
**Solución**: Comportamiento esperado. El stock local se proyecta optimista, pero la fuente de verdad es el server. Si vende 10 mientras offline pero solo había 5 → al sync hay sobre-venta. Recomendar mantener stock alto o sync frecuente.

### Error 4: "Mi celular se quedó sin batería con ventas pendientes"
**Causa**: IndexedDB se borra cuando se desinstala la app.
**Solución**: Recordar al cliente "no desinstales sin sincronizar". Hacer backup automático cada 10 min al server cuando hay conexión.

### Error 5: "Quiere imprimir ticket pero no tiene impresora"
**Solución**: PDF en pantalla → mostrar al cliente. Opcional: enviar por WhatsApp share del PDF.

## Hardware recomendado

| Item | Modelo sugerido | Precio aprox MXN |
|---|---|---|
| Impresora térmica Bluetooth | Goojprt PT-210 | $700 |
| Celular Android entrada | Cualquiera con 3GB RAM | $3,000 |
| Power bank | 10,000 mAh | $400 |
| **Total kit** | | **$4,100** |

## Caso similar: Repartidor de comida

Aplica lo mismo. Diferencia: agregar campo "domicilio" en customer. POS con flujo:
1. Cliente llama → tomar pedido.
2. Repartidor lleva → cobra en la puerta (efectivo / transfer).
3. Si offline al cobrar (zona mala) → sync luego.

## Caso similar: Vendedor de seguros / multinivel

Sin venta física pero captura órdenes. Misma PWA, mismos productos, mismo offline.
