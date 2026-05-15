# Validation 3.2 — Endpoints sin contrato

> Generado por Wave 3 · 2026-05-15
> Fuente: public/system-map.json + .specify/contracts/endpoints/

---

## Resumen ejecutivo

| Métrica | Valor | % |
|---|---|---|
| Total endpoints en system-map | 86 | 100% |
| Con contrato dedicado (.spec.md) | 9 | 10% |
| Con stub solamente (_stubs-pos.md) | 20 | 23% |
| Sin nada (no documentados) | 57 | 66% |

**Cobertura total**: 29/86 = **34%**
**Brecha crítica**: 57 endpoints sin ninguna documentación de contrato

---

## Endpoints CON contrato dedicado (.spec.md)

| Endpoint | Archivo spec |
|---|---|
| `GET /api/admin/giros` | GET-api-admin-giros.spec.md |
| `GET /api/admin/giros/` | GET-api-admin-giros.spec.md |
| `GET|POST /api/admin/tenant/` | GET-POST-api-admin-tenant.spec.md |
| `GET /api/admin/tenants` | GET-api-admin-tenants.spec.md |
| `GET /api/app/config` | GET-api-app-config.spec.md |
| `POST /api/log/client` | POST-api-log-client.spec.md |
| `GET /api/owner/low-stock` | GET-api-owner-low-stock.spec.md |
| `GET /api/pos/app-orders` | GET-api-pos-app-orders.spec.md |
| `GET /api/users/me` | GET-api-users-me.spec.md |

---

## Endpoints CON stub (_stubs-pos.md)

| Endpoint | Exclusivo | Tablas (TODO) |
|---|---|---|
| `POST /api/admin/backup/trigger` | POS | TODO |
| `GET /api/app/branding` | POS | `pos_app_branding` |
| `GET /api/app/branding/` | POS | `pos_app_branding` |
| `GET|POST /api/app/media` | POS | `pos_app_media` |
| `GET|POST /api/app/media/` | POS | `pos_app_media` |
| `POST /api/audit/manual-search` | POS | TODO |
| `POST /api/auth/heartbeat` | POS | TODO |
| `POST /api/auth/resend-verify` | POS | TODO |
| `GET /api/auth/session-config` | POS | TODO |
| `POST /api/auth/sessions/revoke` | POS | TODO |
| `GET /api/barcode-lookup` | POS | `pos_products` |
| `GET /api/business-plan` | POS | `volvix_licencias` o `pos_companies` |
| `GET|POST /api/cart/draft` | POS | `pos_cart_drafts` |
| `GET /api/cart/draft.` | POS | artefacto posible |
| `POST /api/cart/draft/clear` | POS | `pos_cart_drafts` |
| `GET|POST /api/customers` | POS | `pos_clientes` o `customers` |
| `GET /api/cuts` | POS | tabla de cortes |
| `GET /api/cuts/` | POS | tabla de cortes |
| `POST /api/cuts/close` | POS | `cuts` + ventas |
| `POST /api/cuts/open` | POS | tabla de cortes |

---

## Endpoints SIN nada — PRIORIDAD ALTA (flujos críticos)

### Cobro / Pagos (flujo de venta principal)

| Endpoint | Exclusivo | Riesgo |
|---|---|---|
| `POST /api/login` | POS | CRÍTICO — endpoint de auth principal, sin spec |
| `POST /api/logout` | POS | ALTO — invalidación de sesión |
| `GET /api/payments/check-pending/` | POS | ALTO — verificación pagos pendientes |
| `GET /api/payments/health` | POS | MEDIO — salud del gateway de pagos |
| `GET /api/payments/pending` | POS | ALTO — lista pagos pendientes |
| `POST /api/payments/poll-external` | POS | ALTO — polling de pago externo (OXXO, QR) |
| `POST /api/payments/poll-external/` | POS | ALTO — trailing slash variant |
| `POST /api/payments/verify/pending` | POS | ALTO — verificación final de pago |
| `GET /api/dashboard/today` | POS | MEDIO — KPIs del día (posible data leak) |

### Inventario / Productos

| Endpoint | Exclusivo | Riesgo |
|---|---|---|
| `GET /api/inventory-movements` | POS | ALTO — trazabilidad de stock |
| `POST /api/inventory/bulk-adjust` | POS | ALTO — ajuste masivo de inventario |
| `GET /api/inventory/alerts` | POS | MEDIO — alertas de stock |
| `GET /api/inventory/duplicates` | POS | BAJO |
| `POST /api/inventory/dedupe` | POS | BAJO |
| `GET|POST /api/inventory-counts/` | POS | MEDIO — conteos de inventario |
| `POST /api/inventory-counts/start` | POS | MEDIO |
| `GET /api/owner/products/lookup` | POS | MEDIO |
| `GET /api/inventory/movements` | POS | ALTO — duplicado o alias de inventory-movements |

### Notificaciones / Caja

| Endpoint | Exclusivo | Riesgo |
|---|---|---|
| `GET /api/notifications` | POS | MEDIO |
| `GET /api/notifications/` | POS | MEDIO |
| `POST /api/notifications/read-all` | POS | BAJO |
| `POST /api/drawer/log` | POS | MEDIO — log de apertura de cajón |
| `POST /api/drawer/manual-open` | POS | MEDIO — apertura manual de cajón físico |
| `POST /api/print-queue` | POS | ALTO — cola de impresión de tickets |
| `GET /api/print-queue/` | POS | ALTO |
| `GET /api/print-log/paper-status` | POS | MEDIO |

### CFDI / Fiscal

| Endpoint | Exclusivo | Riesgo |
|---|---|---|
| `GET /api/facturama/invoices` | POS | ALTO — facturas CFDI |
| `POST /api/facturama/invoice/` | POS | ALTO — emitir factura |
| `POST /api/facturama/cancel/` | POS | ALTO — cancelar factura |
| `GET /api/facturama/credentials` | POS | CRÍTICO — credenciales PAC expuestas? |
| `GET /api/giro/config` | POS | MEDIO |

### Admin (PDC)

| Endpoint | Exclusivo | Riesgo |
|---|---|---|
| `GET /api/admin/feature-modules` | PDC | MEDIO |
| `GET /api/admin/features` | PDC | MEDIO |
| `GET /api/admin/features/catalog` | PDC | BAJO |
| `POST /api/admin/remote-support/request` | PDC | ALTO — acceso remoto sin spec |
| `POST /api/admin/setup-defaults` | PDC | MEDIO |
| `GET /api/admin/tenants/` | PDC | BAJO — alias |
| `POST /api/admin/tenants/bulk` | PDC | MEDIO |
| `POST /api/admin/user-override` | PDC | ALTO — override de usuario |
| `GET /api/admin/user/by-email` | PDC | ALTO — lookup sin filtro documentado |
| `GET /api/admin/users/` | PDC | MEDIO |
| `POST /api/admin/users/bulk` | PDC | MEDIO |
| `GET /api/admin/users/devices` | PDC | MEDIO |
| `GET /api/admin/users/hierarchy` | PDC | BAJO |
| `POST /api/admin/users/inline-quick` | PDC | MEDIO |

### Otros

| Endpoint | Exclusivo | Riesgo |
|---|---|---|
| `GET /api/events/poll` | POS | MEDIO — SSE o polling de eventos |
| `GET|POST /api/ingredientes` | POS | BAJO |
| `GET /api/ingredientes/` | POS | BAJO |
| `GET|POST /api/labels/print` | POS | MEDIO |
| `GET|POST /api/marketing/generar-post` | POS | BAJO |
| `GET /api/marketing/posts` | POS | BAJO |
| `GET|POST /api/menu-digital` | POS | MEDIO |
| `GET /api/menu-digital/` | POS | BAJO |
| `POST /api/menu-digital/digitalize` | POS | MEDIO |
| `GET /api/version/notify` | PDC | BAJO |
| `GET /api/version/report` | PDC | BAJO |
| `GET /api/version/status` | PDC | BAJO |

---

## Deudas críticas de seguridad (Wave 2C — ya detectadas)

| # | Endpoint | Deuda | Severidad |
|---|---|---|---|
| S1 | `GET /api/owner/low-stock` | No filtra `tenant_id` — con service_role_key retorna productos de todos los tenants | **CRÍTICA** |
| S2 | `GET /api/users/me` | No verifica contra DB — usuarios desactivados mantienen acceso hasta expiración JWT | **ALTA** |
| S3 | `GET /api/app/config` | Público sin auth — expone config de cualquier tenant con solo `tenant_id` param | **ALTA** |

**Total deudas críticas de seguridad: 3**

---

## Próximos contratos sugeridos por prioridad

1. `POST /api/login` — auth principal, sin spec (CRÍTICO)
2. `POST /api/payments/poll-external` — cobro con QR/OXXO (CRÍTICO)  
3. `GET /api/facturama/credentials` — posible exposición de credenciales PAC (CRÍTICO)
4. `POST /api/admin/remote-support/request` — acceso remoto sin documentar (ALTO)
5. `POST /api/admin/user-override` — operación privilegiada sin spec (ALTO)
6. `GET /api/inventory-movements` — trazabilidad de stock (ALTO)
7. `POST /api/inventory/bulk-adjust` — ajuste masivo sin spec (ALTO)
8. `GET|POST /api/print-queue` — impresión de tickets (ALTO)
