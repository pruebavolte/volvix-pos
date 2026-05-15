# System Map Report v2 — 2026-05-15

## Patches aplicados
- P1: botón→handler/modal/screen (calls, opens_modal, navigates_to)
- P2: screen→endpoint por bloque HTML `<section id="screen-X">`
- P3: roles hardcoded detectados
- P4: realtime channels
- P5: window vars globales

## Resumen

| Métrica | salvadorex-pos.html | paneldecontrol.html |
|---------|---------------------|---------------------|
| Líneas | 22919 | 9097 |
| Screens | 29 | — |
| Screens con bloque encontrado | 29 | — |
| Config tabs | 9 | — |
| Perm tabs | — | 5 |
| Modales | 13 | — |
| Botones únicos | 80 | 51 |
| Funciones window | 672 | 104 |
| Endpoints /api/* | 121 | 26 |
| Roles detectados | superadmin, owner, admin, delivery, manager, cajero, cashier | superadmin, owner, admin, cajero, manager, platform_owner |
| Realtime channels | 2 | 0 |
| Window vars globales | 188 | 27 |

## Endpoints API
- Solo POS: 113
- Solo PDC: 18
- Compartidos: 8

### Compartidos:
- `/api/admin/giros/`
- `/api/admin/tenant/`
- `/api/admin/tenants`
- `/api/app/config`
- `/api/log/client`
- `/api/owner/low-stock`
- `/api/pos/app-orders`
- `/api/users/me`

## Deudas detectadas (blitz 2026-05-15)
- ⚠️ DEUDA: coexisten "cashier" y "cajero" sin normalización
- ✅ Todas las screens tienen bloque HTML detectado
- ⚠️ window vars de riesgo: window.IMPERSONATING, window.fetch, window.VOLVIX
- ℹ️ BroadcastChannels (verificar .close()): CHANNEL_NAME, 'volvix-cart-sync'

---
Generado por `generate-system-map.v2.js` · 2026-05-15T21:11:01.154Z
