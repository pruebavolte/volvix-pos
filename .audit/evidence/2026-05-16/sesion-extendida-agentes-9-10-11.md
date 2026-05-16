# Sesion extendida 2026-05-16 — agentes 9, 10, 11

## AGENTE 10 — C-18 F12 disabled state
- btn-cobrar-f12 con disabled=true por default
- updateTotals() toggle disabled segun CART.length > 0 && totals.total > 0
- Tooltip cambia: "Agrega productos al carrito para cobrar" vs "F12 - Cobrar"

## AGENTE 10 — C-19 Folio server-side
- Endpoint nuevo GET /api/sales/next-folio (requireAuth)
- Lee max(folio) de pos_sales del tenant
- Cliente lo invoca post-venta exitosa para actualizar #currentFolio
- Fallback: folio+1 client-side si endpoint falla

## AGENTE 9 — C-37 Logout server-side
- Endpoint nuevo POST /api/auth/logout-server (requireAuth)
- Inserta jti del request en pos_revoked_tokens con reason='user_logout'
- Cliente lo invoca en doLogout() ANTES de limpiar localStorage
- Tolera fallo de red (sigue con logout local)

## ADR-003 — VolvixTabs unificado
- Nuevo public/volvix-tabs.js con window.VolvixTabs.activate(group, tab, btn)
- Cargado en POS antes de wirings
- Persiste tab activo en sessionStorage (vlx:tab:<group>)
- Dispara evento volvix:tab-changed para consumers reactivos
- BACKWARD-COMPAT: los 6 sistemas legacy siguen funcionando
- Migracion futura: reemplazar showInvTab/provTab/etc con aliases de 1 linea

## ADR-005 — State machine de pago documentado
- .specify/flows/state-machine-pago.md con diagrama Mermaid
- 5 modales mapeados: modal-pay, modal-pay-confirm, modal-pay-verify, modal-app-pay, modal-late-invoice
- 8 transiciones criticas que tests E2E deben cubrir
- 3 bugs latentes hechos visibles (sin boton rechazar verify, cola offline tarjeta, late-invoice sin entrada UI)
