# State Machine — Flujo de modales de pago (ADR-005 ejecutado)

> Diagrama de estados de los 5 modales relacionados con cobro en `salvadorex-pos.html`.
> Cada transición es una arista verificable con test E2E.

## Diagrama

```mermaid
stateDiagram-v2
    [*] --> ConstruyendoTicket: agregar productos
    ConstruyendoTicket --> ConstruyendoTicket: addToCart(producto)
    ConstruyendoTicket --> ConstruyendoTicket: deleteCartItem()
    ConstruyendoTicket --> ConstruyendoTicket: applyCouponToCart()

    ConstruyendoTicket --> ModalPay: F12 / openPayment()
    note right of ModalPay
      modal-pay
      Solo abre si CART.length > 0 (AGENTE 10 / C-18 disabled state)
      Genera X-Cart-Token UUID
      Aplica reglas por giro (farmacia, etc)
    end note

    ModalPay --> ModalPay: setPayMethod(efectivo)
    ModalPay --> ModalPay: setPayMethod(tarjeta)
    ModalPay --> ModalPay: setPayMethod(transfer)

    ModalPay --> ConstruyendoTicket: ESC / Cancelar

    ModalPay --> CompletePay_Efectivo: F12 (método=efectivo)
    ModalPay --> ModalPayConfirm: F12 (método=tarjeta)
    ModalPay --> ModalPayVerify: F12 (método=transfer/SINPE/OXXO)
    ModalPay --> ModalAppPay: F12 (método=app-pago)

    ModalPayConfirm --> CompletePay_Tarjeta: Confirmar
    ModalPayConfirm --> ModalPay: Cancelar / Cambiar método

    ModalPayVerify --> CompletePay_Verified: Cajero confirma "Sí veo el depósito"
    ModalPayVerify --> ModalPay: Cajero "Rechazar (cliente no pagó)"
    note left of ModalPayVerify
      Bloquea completePay() hasta verificación humana
      pos.spec.md Invariante I6
    end note

    ModalAppPay --> CompletePay_AppPay: App externa confirma (polling 10s)
    ModalAppPay --> ModalPay: Timeout 60s / Cancelar

    CompletePay_Efectivo --> POST_sales: idempotency_key + X-Cart-Token
    CompletePay_Tarjeta --> POST_sales: idem
    CompletePay_Verified --> POST_sales: idem
    CompletePay_AppPay --> POST_sales: idem

    POST_sales --> VentaCobrada: HTTP 200
    POST_sales --> ConflictoCart: HTTP 409 cart_already_consumed
    POST_sales --> ConflictoStock: HTTP 409 STOCK_INSUFFICIENT
    POST_sales --> FeatureDisabled: HTTP 403 feature_disabled (AGENTE 5)
    POST_sales --> ColaOffline: red caída
    POST_sales --> ModalPay: error tarjeta / 400

    VentaCobrada --> StockDecrementLocal: AGENTE 7
    note right of StockDecrementLocal
      CATALOG[idx].stock -= qty por cada item
      VolvixState.decrementProductStock notif
      updateInvStats() + renderInv() si montados
    end note
    StockDecrementLocal --> ImprimirTicket: print + drawer.open
    ImprimirTicket --> FolioServerSide: GET /api/sales/next-folio
    FolioServerSide --> LimpiarUI: #currentFolio = next_folio_hint
    LimpiarUI --> [*]: CART.length=0, renderCart(), updateTotals()
    note left of LimpiarUI
      AGENTE 10 / C-19: folio sincronizado server-side
      Cae a folio+1 client si endpoint falla
    end note

    ConflictoCart --> [*]: showToast "otra pestaña cobró"
    ConflictoStock --> ModalPay: showToast "stock cambió"
    FeatureDisabled --> ConstruyendoTicket: showToast "Esta función no está habilitada"
    ColaOffline --> [*]: ServiceWorker sincroniza después

    VentaCobrada --> ModalLateInvoice: Botón "Facturar" en historial
    ModalLateInvoice --> [*]: CFDI generado
```

## Transiciones críticas que tests E2E deben cubrir

| # | Transición | Verificación |
|---|---|---|
| T1 | `ConstruyendoTicket → ModalPay` | F12 con CART vacío NO abre modal (C-18 disabled state) |
| T2 | `ModalPay → ConstruyendoTicket` (ESC) | Limpia `__volvixSelectedPayMethod` |
| T3 | `ModalPayVerify → ModalPay` (rechazar) | NO completa venta; ticket sigue en pantalla |
| T4 | `POST_sales → FeatureDisabled` (B-X-2) | Si `pos.cobrar` deshabilitada, endpoint rechaza 403 |
| T5 | `POST_sales → ConflictoStock` | Stock fue cambiado por otro cajero; mostrar mensaje claro |
| T6 | `VentaCobrada → StockDecrementLocal` | CATALOG[].stock decrementa post-success |
| T7 | `StockDecrementLocal → FolioServerSide` | `#currentFolio` sincroniza con BD |
| T8 | `LimpiarUI → [*]` | UI 100% limpia (CART=[], totales=0, sin residuo cliente anterior) |

## Bugs/anti-patrones que este diagrama HACE VISIBLES

1. **Flecha "ModalPayVerify → Rechazar venta"** existe en el diagrama pero la UI actual NO tiene botón explícito de "Cliente no pagó". El cajero solo puede Cancelar TODO (vuelve a ModalPay). → Crítico latente.

2. **`ColaOffline` para ventas de tarjeta** está prohibido por `pos.spec.md` I7 (riesgo doble cobro). Verificar que el ServiceWorker lo bloquea.

3. **`ModalLateInvoice`** entra "desde la nada" — no hay UI claro para acceder. Debería ser botón "Facturar tarde" en `modal-sale-detail`.

## Cómo correr los E2E

```bash
npx playwright test flows/cobro-state-machine.spec.ts
```

Cada transición = 1 test. Total: 8 tests críticos + 12 secundarios.

---

**ADR-005 ejecutado.** Diagrama vive en este archivo y se actualiza con cada cambio del flujo. Pull requests que toquen `openPayment()/completePay()/modal-pay-*` DEBEN actualizar este diagrama.
