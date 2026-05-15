# Contrato: Screen `pos`

> TIER 1 — DETALLADO
> Wave 2A · 2026-05-15
> Fuente: análisis estático de `public/salvadorex-pos.html` (líneas 4089–4311) + `public/system-map.json` + `.specify/schema-truth.md`

---

## 1. Identidad

| Campo | Valor |
|---|---|
| ID en system-map | `screen_pos_pos` |
| `<section>` HTML | `id="screen-pos"` línea 4089 |
| Ruta de activación | `showScreen('pos')` — es la pantalla por defecto al cargar |
| Parent | `mod_pos` |
| Archivo padre | `public/salvadorex-pos.html` (22 919 líneas) |
| Título visible | Banner "VENTA — Ticket N" (`#currentFolio`) |
| Rol mínimo requerido | `cashier` / `cajero` |
| Sub-tabs | Ninguna — es la pantalla principal del POS |
| `_block_found` (system-map) | `true` |

---

## 2. Responsabilidades

1. Recibir productos por escaneo de código de barras o búsqueda manual y agregarlos al carrito activo (`CART[]`).
2. Mostrar y gestionar el carrito en tiempo real: cantidad, precio unitario, importe, existencia.
3. Aplicar descuentos, cambio de precio, precio mayoreo, y cupones sobre el carrito.
4. Abrir el modal de cobro (`modal-pay`) y completar la venta vía `completePay()` → `POST /api/sales`.
5. Guardar ventas en cola offline cuando el backend no responde (service worker + IndexedDB).
6. Soportar múltiples métodos de pago (efectivo, tarjeta, transferencia, app-pago, sinpe, OXXO) con verificación bancaria cuando aplica.
7. Reimprimir el último ticket y enviar a impresora térmica directa.
8. Gestionar entradas/salidas de efectivo (movimientos de caja) y ventas pendientes (F6).

---

## 3. UI — Árbol de elementos

```
#screen-pos  (class="pos-screen")
  .pos-sidebar-toggle           [☰] → togglePosSidebar()

  .pos-main-area
    .pos-banner                 "VENTA — Ticket" + #currentFolio

    .pos-code-bar               Barra de código del producto
      #barcode-input            <input text> onkeypress Enter → searchProduct(value)
      .btn-enter                [ENTER — Agregar Producto] onclick → searchProduct()
      #r8a-manual-search-btn    [🔍] onclick → r8aOpenManualSearch()   (Ctrl+M / F2)

    .pos-actions                Barra de botones de acción
      [INS Varios]              → openVarios()           data-feature="pos.ins_varios"
      [CTRL+P Art. Común]       → addCommonProduct()     data-feature="pos.art_comun"
      [F10 Buscar]              → openSearch()           data-feature="pos.buscar"
      [F11 Mayoreo]             → togglePriceTier()      data-feature="pos.mayoreo"
      [F7 Entradas]             → cashIn()               data-feature="pos.entradas"
      [F8 Salidas]              → cashOut()              data-feature="pos.salidas"
      [DEL Borrar Art.]         → deleteCartItem()       data-feature="pos.borrar"
      [F9 Verificador]          → priceChecker()         data-feature="pos.verificador"
      --- divider ---
      [📒 Panel]                → openCatalogPanel()     data-feature="pos.panel"
      [🖼️ Catálogo]             → openVisualCatalog()    data-feature="pos.catalogo"
      [⚖ Granel]               → openGranel()           data-feature="pos.granel"
      [% Descuento]             → applyDiscount()        data-feature="pos.descuento"
      [📱 Recargas]             → showScreen('recargas') data-feature="pos.recargas_btn"
      [💡 Servicios]            → showScreen('servicios')data-feature="pos.servicios_btn"
      [🧮 Calc]                 → openCalc()             data-feature="pos.calculadora"

    .pos-tabs
      .ticket-tab               "Ticket 1"
      .btn-new-ticket           [+ Nuevo] → newTicket()

    .pos-cart-wrap
      table.pos-cart
        thead: [Código de Barras | Descripción | Precio Venta | Cant. | Importe | Existencia | ✕]
        #cart-body              <tbody> filas dinámicas generadas por renderCart()

    .pos-bottom
      #item-count               Contador de productos en venta
      [F5 - Cambiar]            → openChangePriceModal()  data-feature="pos.cambiar"
      [F6 - Pendiente]          → savePendingSale()        data-feature="pos.pendiente"
      [Eliminar]                → clearCart()
      [Asignar cliente]         → openCustomerSelector()
      .btn-cobrar [F12 Cobrar]  → openPayment()            data-feature="pos.cobrar"
      #total-big                Total visible en tiempo real

    #pos-coupon-bar
      #pos-coupon-code          <input> código cupón — Enter → applyCouponToCart()
      [Aplicar]                 → applyCouponToCart()
      [✕ Quitar]                → clearCouponFromCart()   (oculto hasta aplicar)
      #pos-coupon-status        Mensaje de estado del cupón

    .pos-summary
      #footer-total             Total
      #footer-pago              Pagó Con
      #footer-cambio            Cambio
      .pay-method-indicator     "💵 Efectivo" (indicador del método)
      [Reimprimir Último]       → reimprimirUltimoTicket()
      [Enviar a Impresora]      → enviarAImpresora()
      [Ventas del día]          → showScreen('ventas')

    .pos-footer                 Versión dinámica / año / soporte

  aside.pos-sidebar-right       Panel derecho: Categorías + Quick-pick
    #cat-list                   Lista de categorías (hidratada desde CATALOG)
    #qp-grid                    Cuadrícula quick-pick (botones de producto frecuente)
```

---

## 4. Modales que abre

| Modal ID | Se abre en | Handler de apertura |
|---|---|---|
| `modal-pay` | F12 / botón Cobrar | `openPayment()` → `$('#modal-pay').classList.add('open')` |
| `modal-search` | F10 / botón Buscar | `openSearch()` → `$('#modal-search').classList.add('open')` |
| `modal-cash` | cashIn() / cashOut() (F7/F8) | interno en `cashIn()`/`cashOut()` |
| `modal-calc` | botón Calc | `openCalc()` |
| `modal-granel` | botón Granel | `openGranel()` |
| `modal-pay-confirm` | flujo de tarjeta / verificación | sub-flujo dentro de `completePay()` |
| `modal-pay-verify` | método transferencia/sinpe/oxxo | `window.__vlxOpenPayVerifyModal()` |
| `modal-app-pay` | método app-pago | `window.__vlxOpenAppPayModal()` |
| `modal-sale-search` | Ventas del día (nav) | desde screen ventas |
| `modal-sale-detail` | Ver detalle de venta | desde screen ventas |

---

## 5. Estado en memoria

| Variable | Tipo | Descripción |
|---|---|---|
| `CART` | `Array` (let, scope módulo) | Carrito activo. Cada ítem: `{id, name, price, qty, stock, code, ...}` |
| `window.CART` | alias live — asignado tras clearCart | Accedido por módulos externos (p.ej. savePendingSale) |
| `CATALOG` | `Array` (const) | Catálogo local en memoria, hidratado desde `/api/products` al cargar |
| `CUSTOMERS` | `Array` (let) | Clientes del tenant, usados por `openCustomerSelector()` |
| `SALES` | `Array` (let) | Historial local de ventas (últimas 200) |
| `window.CART_CUSTOMER` | `Object\|null` | Cliente asignado a la venta activa |
| `window.__volvixCartLocked` | `Boolean` | `true` mientras otra pestaña está cobrando |
| `window.__volvixSaleInFlight` | `Boolean` | Guard anti double-submit en `completePay()` |
| `window.__volvixSelectedPayMethod` | `String` | Método seleccionado en modal-pay (efectivo, tarjeta…) |
| `window.__volvixPayVerified` | `Boolean` | `true` tras confirmar transferencia/sinpe/oxxo |
| `window.__volvixAppPayConfirmed` | `Boolean` | `true` tras confirmar app-pago externa |
| `window.__volvixCurrentCartToken` | `String` | Token UUID por carrito, enviado como `X-Cart-Token` |
| `VOLVIX_CART_CHANNEL` | `BroadcastChannel` | Sincronización multi-tab del carrito (`'volvix-cart-sync'`) |
| `window.__volvixGiro` | `String` | Giro del tenant, usado para validar reglas de venta (farmacia, etc.) |
| `#currentFolio` | DOM `span` | Número de ticket visible en banner |

---

## 6. Endpoints API que consume

| Método | Endpoint | Cuándo | Tabla backend (deuda D2) |
|---|---|---|---|
| `GET` | `/api/products?limit=2000` | Hidratación inicial de CATALOG | `pos_products` / `products` |
| `GET` | `/api/productos?...&select=*&limit=10` | Búsqueda L2 en `searchProduct()` (timeout 1.2 s) | `pos_products` / `productos` |
| `GET` | `/api/owner/products/lookup` | Búsqueda L3 — catálogo global del sistema | (tabla global) |
| `GET` | `/api/customers?limit=500` | Hidratación inicial de CUSTOMERS | `customers` / `pos_customers` (D4) |
| `GET` | `/api/giro/config` | Carga configuración por giro al iniciar | `pos_giro_config` |
| `GET` | `/api/sales?limit=1` | Reimprimir — obtener último sale_id | `pos_sales` / `sales` (D2) |
| `GET` | `/api/sales/{id}` | Reimprimir — obtener detalle de venta | `pos_sales` |
| `POST` | `/api/sales` | Cobro final en `completePay()` | `pos_sales` (24 menciones en API) |
| `POST` | `/api/sales/{id}/print-history` | Registrar reimpresión | `pos_print_history` |
| `POST` | `/api/printer/raw` | Enviar ticket a impresora térmica | (driver ESC/POS) |
| `POST` | `/api/drawer/log` | Registrar apertura automática de cajón | `pos_drawer_log` |
| `POST` | `/api/drawer/manual-open` | Cajón manual (F7/F8 entradas/salidas) | `pos_drawer_log` |
| `POST` | `/api/search/log` | Auditoría de búsquedas manuales | `pos_search_log` |
| `POST` | `/api/audit/manual-search` | Auditoría de búsqueda manual (modal-search) | `pos_audit` |
| `POST` | `/api/cart/draft` | Guardar borrador de carrito (R8a draft) | `pos_cart_drafts` |
| `POST` | `/api/cart/draft/clear` | Limpiar borrador tras cobro/cancel | `pos_cart_drafts` |
| `GET` | `/api/pos/app-orders` | Polling de pedidos desde app móvil | `pos_app_orders` |
| `GET` | `/api/print-log/paper-status` | Estado papel impresora | (driver) |
| `GET` | `/api/print-queue` | Cola de impresión pendiente | `pos_print_queue` |
| `GET` | `/api/sales/pending` | Ventas pendientes (F6) | `pos_sales` |
| `POST` | `/api/sales/pending/{id}` | Recuperar venta pendiente | `pos_sales` |

---

## 7. Flujo principal (happy path)

```
1. Cajero abre salvadorex-pos.html
   → auth-gate valida JWT/session (localStorage 'volvixSession')
   → showScreen('pos') por defecto
   → VolvixDataLoader hidrata CATALOG desde /api/products (≤2000 registros)
   → CATALOG disponible en memoria para búsquedas L1 (sin red)

2. Cajero escanea código de barras (hardware → Enter automático)
   → Input #barcode-input recibe valor → onkeypress Enter → searchProduct(value)
   → L1: busca en CATALOG local (instantáneo)
   → Si no encontrado → L2: /api/productos (timeout 1.2 s)
   → Si no encontrado → L3: /api/owner/products/lookup (timeout 4 s)
   → Si barcode y no encontrado → L4: UPCitemDB / Open Food Facts (timeout 5 s)
   → Si encontrado → addToCart(producto) → renderCart() → updateTotals()
   → Si no encontrado en ningún nivel → modal "Nuevo producto" pre-llenado

3. Carrito se actualiza en DOM (#cart-body)
   → updateTotals() recalcula #total-big, #footer-total, #item-count
   → Borrador guardado en /api/cart/draft (R8a anti-pérdida)

4. Cajero presiona F12 / botón "Cobrar"
   → openPayment()
   → Valida CART no vacío
   → Valida window.__volvixCartLocked (multi-tab)
   → Aplica reglas por giro (ej. receta en farmacia → confirm)
   → Genera X-Cart-Token (UUID)
   → Abre #modal-pay con total, items, botón F12 auto-focalizado

5. Cajero selecciona método de pago en modal-pay
   → setPayMethod(el) → window.__volvixSelectedPayMethod
   → Para transferencia/sinpe/oxxo → bloquea hasta verificación manual (modal-pay-verify)
   → Para app-pago → polling 10 s → modal-app-pay con timer

6. Cajero confirma cobro → completePay()
   → Guard anti double-submit (window.__volvixSaleInFlight = true)
   → Construye saleData: tenant_id, user_id, total, items, payment_method, folio…
   → Genera Idempotency-Key determinista (SHA-256 o FNV-1a fallback)
   → POST /api/sales con headers: Authorization, Idempotency-Key, X-Cart-Token
   → Si 200: venta guardada → showToast + limpiar carrito + closeModal
   → Si 409 cart_already_consumed: otra pestaña cobró → warning
   → Si 409 STOCK_INSUFFICIENT: stock vendido por otro cajero → warning
   → Si red caída: __volvixEnqueueSaleOffline() → service worker sincroniza luego

7. Post-cobro
   → closeModal('modal-pay')
   → CART = [] → renderCart() → updateTotals()
   → /api/cart/draft/clear
   → Ticket impreso (automático si está configurado): /api/printer/raw
   → /api/sales/{id}/print-history (registro)
   → /api/drawer/log (apertura cajón si es efectivo)
   → Folio incrementa → listo para siguiente venta
```

---

## 8. Invariantes

- **I1**: `CART` siempre sincronizado con `#cart-body` DOM — cada mutación del array llama `renderCart()`.
- **I2**: `#total-big` y `#footer-total` actualizados en cada cambio de CART mediante `updateTotals()`.
- **I3**: `#barcode-input` recibe foco tras cada búsqueda (re-focus para scanners hardware).
- **I4**: `completePay()` tiene guard `window.__volvixSaleInFlight` — nunca dos POST /api/sales concurrentes desde la misma pestaña.
- **I5**: El botón Cobrar (F12) solo abre modal si `CART.length > 0`.
- **I6**: Métodos bancarios (transferencia, sinpe, oxxo) **bloquean** `completePay()` hasta verificación humana.
- **I7**: Ventas en tarjeta con timeout NO se encolan offline (riesgo de doble cobro — R10a).
- **I8**: Multi-tab: `X-Cart-Token` + backend `cart_tokens` table previenen que dos pestañas cobren el mismo carrito.

---

## 9. Anti-patrones

- ❌ Llamar a `supabase.from('pos_sales')` directamente — siempre usar `POST /api/sales`.
- ❌ Recargar la página (`location.reload()`) después de completar una venta.
- ❌ Encolar offline una venta de tarjeta cuando hay timeout (riesgo doble cobro).
- ❌ Insertar filas en `#cart-body` manualmente sin pasar por `renderCart()` + `updateTotals()`.
- ❌ Cobrar sin validar reglas por giro (`INDUSTRY_SELL_RULES`).
- ❌ Omitir `Idempotency-Key` en el POST de venta — el servidor necesita deduplicar.

---

## 10. Deudas detectadas

| # | Deuda | Severidad | Detalle |
|---|---|---|---|
| T1 | Roles no normalizados | MEDIA | Coexisten `"cashier"` y `"cajero"` sin normalización (deuda global del sistema en `schema-truth.md`) |
| T2 | Tabla de ventas ambigua | ALTA | `POST /api/sales` escribe en `pos_sales` (24x) pero `pdf-export.js` lee de `sales` — posible desincronía (deuda D2) |
| T3 | `window.CART` vs `CART` | BAJA | `CART` es `let` en scope de módulo; módulos externos acceden como `window.CART` (alias asignado sólo tras clearCart/completePay) — inconsistencia de acceso |
| T4 | BroadcastChannel sin cierre | BAJA | `'volvix-cart-sync'` y `CHANNEL_NAME` no tienen `.close()` garantizado al desmontar |
| T5 | Búsqueda L4 (internet) sin caché | BAJA | UPCitemDB/Open Food Facts llamados sin caché — mismo barcode hace request HTTP externo cada vez |
| T6 | `openCatalogPanel` / `openVisualCatalog` | BAJA | Funciones referenciadas en HTML pero no encontradas como `function` declarada en el grep — posible carga dinámica o nombre diferente |

---

## 11. Checklist R9

- [x] API endpoints documentados (POST /api/sales principal + 20 auxiliares)
- [x] Flujo sin recargar verificado (clearCart + renderCart, no location.reload)
- [x] DB: tabla correcta en cobro — `pos_sales` vía `POST /api/sales`
- [x] Permisos: rol `cashier`/`cajero` requerido; viewer no puede cobrar
- [x] Multi-tab: X-Cart-Token + BroadcastChannel documentados
- [x] Offline: cola service worker documentada
- [ ] Validar `openCatalogPanel` y `openVisualCatalog` existen en runtime
- [ ] Confirmar que `pos_sales` y `sales` no son tablas distintas con mismo endpoint (deuda D2)
- [ ] Rotar JWT_SECRET y ADMIN_API_KEY (pendiente desde limpieza 2026-05-04)
