# Mapa Sistema — salvadorex-pos.html ↔ paneldecontrol.html

Generado: 2026-05-18T22:41:46.888Z
Hash POS: `a09762759bf9` · Hash Panel: `6f2e85781ad7`

> Este archivo lo genera `scripts/system-map/render-markdown.js` desde el JSON producido por `scripts/system-map/scan-pos-panel.js`. **No editar a mano**: cualquier cambio se sobreescribe en el siguiente scan.

## 1. Resumen ejecutivo

| Métrica | POS (salvadorex-pos.html) | Panel (paneldecontrol.html) |
| --- | --- | --- |
| Líneas | 24193 | 9330 |
| Bytes | 1379763 | 485451 |
| Modales | 13 | 0 |
| Funciones | 321 | 67 |
| Botones | 577 | 64 |
| Endpoints /api/ consumidos | 45 | 18 |
| Referencias al otro archivo | 6 | 6 |

- Endpoints **compartidos** POS↔Panel: **1** (`/api/users/me`)
- Endpoints **solo POS**: 44
- Endpoints **solo Panel**: 17
- Funciones con **mismo nombre** en ambos: 13 → `_esc, _pdcMiniModal, _tok, escapeAttr, escapeHtml, getCachedUser, getToken, go, shouldRedirectToWizard, showSetupBanner, showWelcomeBanner, tToast`…
- Rutas backend declaradas en `api/index.js`: **899**
- Tablas Supabase detectadas: **79** (app_=1, giros_=1, pos_=39, volvix_=38)

## 2. Roles y flujo

- **POS** — cashier/owner — operación punto de venta
- **Panel** — superadmin/platform — control de plataforma y configuración

**Patrón de handoff:** panel define módulos/permisos/giros → pos consume vía /api/giro/config + /api/tenant/active-modules + /api/app/config

## 3. Navegación del Panel (v14)

| data-permv14-nav | data-permv14-pane existe |
| --- | --- |
| audit | ✅ |
| features | ✅ |
| giros | ❌ |
| modules | ✅ |
| users | ✅ |
| versions | ✅ |

Panes **sin nav** (huérfanos visualmente, accesibles vía código): `settings`

## 4. Modales del POS

| ID | Label visible |
| --- | --- |
| `modal-app-pay` | 💳 Pago en proceso... |
| `modal-calc` | 🧮 Calculadora |
| `modal-cash` | Entrada de efectivo |
| `modal-cfdi-cancel` | ❌ Cancelar CFDI |
| `modal-cfdi-refacturar` | 🔁 Refacturar (corregir RFC) |
| `modal-granel` | ⚖️ Venta a granel |
| `modal-late-invoice` | 📄 Factura tardía |
| `modal-pay` | Cobrar ticket # |
| `modal-pay-confirm` | Buscar venta |
| `modal-pay-verify` | ⚠️ Verificación de pago |
| `modal-sale-detail` | Detalle de venta |
| `modal-sale-search` | Buscar venta |
| `modal-search` | Buscar producto |

## 5. Tablas Supabase detectadas

Por prefijo:
- `app_*` → 1
- `giros_*` → 1
- `pos_*` → 39
- `volvix_*` → 38

Listado completo:

```
app_name
giros_modulos
pos_active_carts
pos_active_sessions
pos_app_config_versions
pos_arco_requests
pos_audit_log
pos_branches
pos_companies
pos_currencies
pos_customers
pos_cut_adjustments
pos_drawer_log
pos_event_stream
pos_features
pos_login_attempts
pos_login_fingerprints
pos_otp_verifications
pos_outgoing_messages_log
pos_oversell_log
pos_payment_pending_reconciliation
pos_payment_pending_reconciliation_insert_failed
pos_payment_verifications
pos_price_change_approvals
pos_price_overrides
pos_print_log
pos_print_queue
pos_print_queue_insert_failed
pos_product_barcodes
pos_products
pos_purchase_orders
pos_remote_session_actions
pos_remote_sessions
pos_returns
pos_revoked_tokens
pos_sales
pos_security_alerts
pos_tax_config
pos_tenant_module_permissions
pos_tenants
pos_users
volvix_active_count
volvix_audit_archive_old
volvix_audit_log
volvix_bt_device_id
volvix_bt_device_name
volvix_bt_prefs
volvix_cart_draft_
volvix_dev_mode
volvix_first_login_completed
volvix_first_run
volvix_impersonation_token
volvix_inactivity_lock_enabled
volvix_inactivity_lock_min
volvix_inactivity_lock_pin
volvix_last_contact
volvix_last_search
volvix_onboarding_done
volvix_perif_config
volvix_pin_enabled
volvix_pos_phase1
volvix_printer_cfg
volvix_recent_products
volvix_routing_rules
volvix_session
volvix_setup_banner_hidden
volvix_show_setup_banner
volvix_show_welcome_banner
volvix_super_token
volvix_system_printer
volvix_token
volvix_token_preview
volvix_tour_step
volvix_tours_enabled
volvix_update_dismissed_at
volvix_user
volvix_vendor_pos
volvix_vendors
volvix_wizard_seen
```

## 6. Endpoints `/api/` por origen

### 6.1 Compartidos POS+Panel

- `/api/users/me`

### 6.2 Solo POS

- `/api/app/branding`
- `/api/app/config`
- `/api/app/media`
- `/api/audit/manual-search`
- `/api/auth/logout-server`
- `/api/auth/resend-verify`
- `/api/auth/sessions/revoke`
- `/api/barcode-lookup`
- `/api/business-plan`
- `/api/customers`
- `/api/customers/credit`
- `/api/customers/credit/payment`
- `/api/cuts/movements`
- `/api/dashboard/summary`
- `/api/dashboard/today`
- `/api/drawer/log`
- `/api/drawer/manual-open`
- `/api/giro/config`
- `/api/inventory/dedupe`
- `/api/labels/print`
- `/api/login`
- `/api/logout`
- `/api/payments/health`
- `/api/payments/poll-external`
- `/api/payments/verify/pending`
- `/api/pilot/feedback`
- `/api/printer/raw`
- `/api/products`
- `/api/products/check-barcode`
- `/api/products/import`
- `/api/products/next-barcode`
- `/api/products/seed-from-giro`
- `/api/queue`
- `/api/remote-support/end`
- `/api/remote-support/incoming`
- `/api/remote-support/respond`
- `/api/remote-support/signal`
- `/api/remote-support/signal-pull`
- `/api/sales`
- `/api/sales/next-folio`
- `/api/search/log`
- `/api/tax-config`
- `/api/tenant/active-modules`
- `/api/version`

### 6.3 Solo Panel

- `/api/admin/feature-modules`
- `/api/admin/features`
- `/api/admin/features/catalog`
- `/api/admin/giros`
- `/api/admin/remote-support/request`
- `/api/admin/setup-defaults`
- `/api/admin/tenant`
- `/api/admin/tenants`
- `/api/admin/tenants/bulk`
- `/api/admin/user/by-email`
- `/api/admin/users/bulk`
- `/api/admin/users/devices`
- `/api/admin/users/hierarchy`
- `/api/admin/users/inline-quick`
- `/api/version/notify`
- `/api/version/report`
- `/api/version/status`

## 7. Backend — rutas declaradas en `api/index.js`

Total: **899**

| Grupo `/api/<seg>/` | Rutas |
| --- | --- |
| `/academy` | 1 |
| `/academy-progress` | 2 |
| `/admin` | 88 |
| `/ai` | 12 |
| `/airtime-purchases` | 2 |
| `/analytics` | 4 |
| `/app` | 11 |
| `/appointments` | 9 |
| `/approvals` | 4 |
| `/audit` | 2 |
| `/audit-log` | 3 |
| `/audit_log` | 1 |
| `/auth` | 26 |
| `/availability` | 1 |
| `/barcode-lookup` | 1 |
| `/best-sellers` | 1 |
| `/billing` | 10 |
| `/blockchain` | 2 |
| `/branch_inventory` | 2 |
| `/branches` | 12 |
| `/bundles` | 5 |
| `/business-plan` | 1 |
| `/cart` | 3 |
| `/carts` | 1 |
| `/cash` | 2 |
| `/cds` | 1 |
| `/cfdi` | 3 |
| `/clientes` | 2 |
| `/cobro` | 1 |
| `/conekta` | 1 |
| `/config` | 2 |
| `/cortes` | 2 |
| `/crm` | 2 |
| `/currencies` | 2 |
| `/customer` | 3 |
| `/customer-payments` | 1 |
| `/customer-subscriptions` | 6 |
| `/customers` | 4 |
| `/cuts` | 11 |
| `/dashboard` | 12 |
| `/debug` | 1 |
| `/devoluciones` | 2 |
| `/discord` | 6 |
| `/docs` | 1 |
| `/downloads` | 2 |
| `/drawer` | 3 |
| `/email` | 3 |
| `/employees` | 4 |
| `/errors` | 2 |
| `/events` | 2 |
| `/exchange-rates` | 1 |
| `/fb` | 1 |
| `/feature-flags` | 5 |
| `/feature-modules` | 1 |
| `/features` | 1 |
| `/feedback` | 2 |
| `/fingerprints` | 4 |
| `/forecasts` | 2 |
| `/fraud` | 4 |
| `/fx` | 3 |
| `/gdpr` | 6 |
| `/gift-cards` | 5 |
| `/giros` | 1 |
| `/health` | 1 |
| `/healthcheck` | 5 |
| `/hr` | 9 |
| `/i18n` | 1 |
| `/industry-schema` | 1 |
| `/industry-seed` | 1 |
| `/ingredientes` | 4 |
| `/integrations` | 17 |
| `/inventory` | 18 |
| `/inventory-counts` | 10 |
| `/inventory-movements` | 4 |
| `/invoices` | 3 |
| `/kds` | 14 |
| `/kiosk` | 3 |
| `/kitchen` | 2 |
| `/knowledge` | 3 |
| `/label-templates` | 5 |
| `/labels` | 2 |
| `/leads` | 3 |
| `/licencias` | 1 |
| `/login` | 1 |
| `/logs` | 2 |
| `/loyalty` | 6 |
| `/marketing` | 3 |
| `/marketplace` | 7 |
| `/me` | 1 |
| `/menu-digital` | 3 |
| `/mercadopago` | 1 |
| `/messaging` | 3 |
| `/mfa` | 2 |
| `/ml` | 4 |
| `/mobile` | 2 |
| `/module-pricing` | 2 |
| `/module-terminology` | 2 |
| `/nft` | 2 |
| `/notas-credito` | 1 |
| `/notifications` | 3 |
| `/observability` | 2 |
| `/onboarding` | 8 |
| `/openapi` | 1 |
| `/openapi.yaml` | 1 |
| `/owner` | 26 |
| `/payments` | 20 |
| `/payroll` | 7 |
| `/pedidos-externos` | 1 |
| `/pilot` | 1 |
| `/ping` | 1 |
| `/pos` | 3 |
| `/pos-users` | 4 |
| `/print` | 2 |
| `/print-history` | 1 |
| `/print-log` | 1 |
| `/print-queue` | 5 |
| `/printer` | 1 |
| `/printer-routes` | 4 |
| `/printer-status` | 2 |
| `/printers` | 4 |
| `/private` | 1 |
| `/product-lots` | 4 |
| `/product-serials` | 3 |
| `/productos` | 5 |
| `/products` | 32 |
| `/promotions` | 6 |
| `/purchase-orders` | 4 |
| `/purchases` | 4 |
| `/push` | 6 |
| `/qr` | 3 |
| `/queue` | 6 |
| `/recargas` | 7 |
| `/recetas` | 3 |
| `/refresh` | 1 |
| `/remote` | 9 |
| `/remote-support` | 5 |
| `/reorder` | 2 |
| `/reports` | 42 |
| `/reservations` | 3 |
| `/returns` | 3 |
| `/reviews` | 6 |
| `/roadmap` | 2 |
| `/roles` | 4 |
| `/sales` | 25 |
| `/search` | 4 |
| `/security` | 1 |
| `/segments` | 5 |
| `/service-payments` | 5 |
| `/services` | 6 |
| `/shop` | 5 |
| `/sms` | 1 |
| `/staff` | 2 |
| `/stats` | 1 |
| `/status` | 1 |
| `/stock` | 2 |
| `/sub-tenants` | 2 |
| `/subscribe` | 1 |
| `/suppliers` | 4 |
| `/support` | 3 |
| `/sync` | 2 |
| `/tax` | 2 |
| `/tax-config` | 2 |
| `/tax-rates` | 3 |
| `/telegram` | 1 |
| `/tenant` | 12 |
| `/tenant-settings` | 3 |
| `/tenants` | 1 |
| `/terminals` | 2 |
| `/test` | 3 |
| `/tickets` | 4 |
| `/tips` | 6 |
| `/twilio` | 1 |
| `/user` | 7 |
| `/users` | 14 |
| `/v1` | 1 |
| `/vendor` | 12 |
| `/ventas` | 2 |
| `/version` | 4 |
| `/voice` | 1 |
| `/warehouses` | 5 |
| `/webhooks` | 9 |
| `/whatsapp` | 5 |

## 8. Scripts JS cargados

### 8.1 POS

```
...
/auth-gate.js
/js/applyGiroConfig.js
/volvix-barcode-print.js
/volvix-button-flags.js
/volvix-capacitor-bridge.js
/volvix-cobro-modal.js
/volvix-cobro-state.js
/volvix-error-reporter.js
/volvix-feature-flags.js
/volvix-mobile-fixes.js
/volvix-modules-wiring.js
/volvix-onboarding-wizard.js
/volvix-owner-only-wiring.js
/volvix-pos-payments-integration.js
/volvix-print-config.js
/volvix-print-universal.js
/volvix-printer-errors.js
/volvix-reservations-wiring.js
/volvix-sales-sync.js?v=2026-05-15
/volvix-ticket-customizer.js?v=2026-05-15-rawprint
/volvix-ticket-editor.js?v=2026-05-15-rawprint
/volvix-uplift-wiring.js
/volvix-version-display.js
/volvix-vertical-rentaequipo.js
auth-helper.js
https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
volvix-a11y-wiring.js
volvix-ab-testing-wiring.js
volvix-abtest-suite.js
volvix-accessibility-wiring.js
volvix-accounting-wiring.js
volvix-ai-assistant.js
volvix-ai-real-wiring.js
volvix-airtable-wiring.js
volvix-anomaly-wiring.js
volvix-api.js
volvix-appointments-wiring.js
volvix-asana-wiring.js
volvix-audit-wiring.js
volvix-backup-wiring.js
volvix-barcode-resolver.js
volvix-barcode-wiring.js
volvix-bi-wiring.js
volvix-cache-wiring.js
volvix-calendar-wiring.js
volvix-cashdrawer-wiring.js
volvix-categories-wiring.js
volvix-changelog-auto.js
volvix-charts-wiring.js
volvix-clip-wiring.js
volvix-compliance-wiring.js
volvix-conekta-wiring.js
volvix-coupons-wiring.js
volvix-crm-wiring.js
volvix-cron-wiring.js
volvix-crypto-wiring.js
volvix-cs-wiring.js
volvix-currency-wiring.js
volvix-delivery-wiring.js
volvix-discord-wiring.js
volvix-donations-wiring.js
volvix-drinks-wiring.js
volvix-email-wiring.js
volvix-fb-pixel-wiring.js
volvix-feedback-wiring.js
volvix-fiscal-wiring.js
volvix-forecasting-wiring.js
volvix-fulltext-wiring.js
volvix-gamification-wiring.js
volvix-geofence-wiring.js
volvix-google-analytics-wiring.js
volvix-health-wiring.js
volvix-heatmap-wiring.js
volvix-hotjar-wiring.js
volvix-hr-wiring.js
volvix-hubspot-wiring.js
volvix-i18n-wiring.js
volvix-import-wizard.js
volvix-indexeddb-wiring.js
volvix-intercom-wiring.js
volvix-intro-tour-wiring.js
volvix-inventory-ai-wiring.js
volvix-inventory-pro-wiring.js
volvix-kds-wiring.js
volvix-keyboard-nav.js
volvix-layaway-wiring.js
volvix-lighthouse-lite.js
volvix-logger-wiring.js
volvix-lottery-wiring.js
volvix-loyalty-wiring.js
volvix-mailchimp-wiring.js
volvix-maps-wiring.js
volvix-marketing-wiring.js
volvix-master-controller.js
volvix-mercadopago-wiring.js
volvix-mobile-responsive-wiring.js
volvix-mobile-wiring.js
volvix-modals.js
volvix-modifiers-wiring.js
volvix-multistore-wiring.js
volvix-notifications-wiring.js
volvix-notion-wiring.js
volvix-offline-queue.js
volvix-offline-wiring.js
volvix-onboarding-tour-wiring.js
volvix-onboarding-wiring.js
volvix-payments-wiring.js
volvix-paypal-wiring.js
volvix-perf-monitor.js
volvix-perf-wiring.js
volvix-permissions-wiring.js
volvix-photo-wiring.js
volvix-pin-wiring.js
volvix-platform-orders.js
volvix-plugins-wiring.js
volvix-pos-extra-wiring.js
volvix-pos-wiring.js
volvix-pricing-wiring.js
volvix-print-hub.js
volvix-printer-wiring.js
volvix-product-search.js
volvix-purchase-wiring.js
volvix-pwa-install-prompt.js
volvix-pwa-wiring.js
volvix-queue-fail-notifier.js
volvix-queue-wiring.js
volvix-quickactions-wiring.js
volvix-quickbooks-wiring.js
volvix-ratelimit-wiring.js
volvix-real-data-loader.js
volvix-realtime-wiring.js
volvix-receipt-customizer-wiring.js
volvix-recommendations-wiring.js
volvix-reminders-wiring.js
volvix-reports-wiring.js
volvix-reservations-wiring.js
volvix-returns-wiring.js
volvix-routes-wiring.js
volvix-scale-wiring.js
volvix-search-wiring.js
volvix-security-scan.js
volvix-sendgrid-wiring.js
volvix-sentry-wiring.js
volvix-seo-wiring.js
volvix-service-wiring.js
volvix-shortcuts-wiring.js
volvix-signature-wiring.js
volvix-slack-wiring.js
volvix-state.js
volvix-stocktake-wiring.js
volvix-stripe-wiring.js
volvix-subscriptions-wiring.js
volvix-sync-widget.js
volvix-sync.js
volvix-tables-wiring.js
volvix-tabs.js
volvix-tags-wiring.js
volvix-tax-wiring.js
volvix-telegram-wiring.js
volvix-telemetry.js
volvix-theme-wiring.js
volvix-trello-wiring.js
volvix-twilio-wiring.js
volvix-ui-accordion.js
volvix-ui-animations.js
volvix-ui-avatar.js
volvix-ui-badge.js
volvix-ui-banner.js
volvix-ui-card.js
volvix-ui-carousel.js
volvix-ui-charts-pro.js
volvix-ui-codeeditor.js
volvix-ui-colorpicker.js
volvix-ui-colorwheel.js
volvix-ui-contextmenu.js
volvix-ui-datepicker.js
volvix-ui-diff.js
volvix-ui-drawer.js
volvix-ui-dropdown.js
volvix-ui-editor.js
volvix-ui-empty.js
volvix-ui-errors.js
volvix-ui-fileupload.js
volvix-ui-flowchart.js
volvix-ui-form-designer.js
volvix-ui-form.js
volvix-ui-fullcalendar.js
volvix-ui-gantt.js
volvix-ui-imageviewer.js
volvix-ui-kanban.js
volvix-ui-list.js
volvix-ui-map.js
volvix-ui-markdown.js
volvix-ui-mention.js
volvix-ui-mindmap.js
volvix-ui-modal.js
volvix-ui-numinput.js
volvix-ui-orgchart.js
volvix-ui-otp.js
volvix-ui-pagination.js
volvix-ui-phone.js
volvix-ui-pivot.js
volvix-ui-progress.js
volvix-ui-searchbox.js
volvix-ui-signature.js
volvix-ui-skeleton.js
volvix-ui-slider.js
volvix-ui-snackbar.js
volvix-ui-spinner.js
volvix-ui-splash.js
volvix-ui-spreadsheet.js
volvix-ui-stars.js
volvix-ui-steps.js
volvix-ui-table.js
volvix-ui-tabs.js
volvix-ui-timeline.js
volvix-ui-toggle.js
volvix-ui-tooltip.js
volvix-ui-tour.js
volvix-ui-treeview.js
volvix-ui-whiteboard.js
volvix-ui-wizard.js
volvix-vertical-autolavado.js
volvix-vertical-bicicletas.js
volvix-vertical-bowling.js
volvix-vertical-buffet.js
volvix-vertical-cafe.js
volvix-vertical-cafeinternet.js
volvix-vertical-cantina.js
volvix-vertical-carniceria.js
volvix-vertical-cine.js
volvix-vertical-cremeria.js
volvix-vertical-dental.js
volvix-vertical-disco.js
volvix-vertical-dulceria.js
volvix-vertical-educacion.js
volvix-vertical-estetica.js
volvix-vertical-eventos.js
volvix-vertical-farmacia.js
volvix-vertical-ferreteria.js
volvix-vertical-floreria.js
volvix-vertical-foodtruck.js
volvix-vertical-fotografia.js
volvix-vertical-fruteria.js
volvix-vertical-funeraria.js
volvix-vertical-guarderia.js
volvix-vertical-gym.js
volvix-vertical-helado.js
volvix-vertical-hotel.js
volvix-vertical-inmobiliaria.js
volvix-vertical-joyeria.js
volvix-vertical-karaoke.js
volvix-vertical-lavanderia.js
volvix-vertical-libreria.js
volvix-vertical-mecanica.js
volvix-vertical-muebleria.js
volvix-vertical-notaria.js
volvix-vertical-optometria.js
volvix-vertical-panaderia.js
volvix-vertical-papeleria.js
volvix-vertical-paqueteria.js
volvix-vertical-parking.js
volvix-vertical-pescaderia.js
volvix-vertical-pethotel.js
volvix-vertical-pizza.js
volvix-vertical-polleria.js
volvix-vertical-recauchutado.js
volvix-vertical-rentaequipo.js
volvix-vertical-ropa.js
volvix-vertical-spa.js
volvix-vertical-sushi.js
volvix-vertical-tabaqueria.js
volvix-vertical-tintoreria.js
volvix-vertical-tlapaleria.js
volvix-vertical-tortilleria.js
volvix-vertical-vet.js
volvix-vertical-vinateria.js
volvix-vertical-zapateria.js
volvix-voice-wiring.js
volvix-wallet-wiring.js
volvix-webextensions-wiring.js
volvix-webhooks-wiring.js
volvix-webrtc-wiring.js
volvix-whatsapp-wiring.js
volvix-wiring.js
volvix-workflow-closeday.js
volvix-workflow-collections.js
volvix-workflow-onboarding.js
volvix-workflow-openday.js
volvix-workflow-reconciliation.js
volvix-workflow-restock.js
volvix-workflow-wiring.js
volvix-zapier-wiring.js
```

### 8.2 Panel

```
...
/auth-gate.js
/js/applyGiroConfig.js
/volvix-button-flags.js
/volvix-capacitor-bridge.js
/volvix-error-reporter.js
/volvix-feature-flags.js
auth-helper.js
volvix-ai-assistant.js
volvix-api.js
volvix-intro-tour-wiring.js
volvix-modals.js
volvix-onboarding-tour-wiring.js
volvix-sync-widget.js
volvix-sync.js
volvix-wiring.js
```

## 9. Hints tabla → endpoints que la mencionan

_(heurística por substring entre nombre de tabla y path del endpoint — útil para sospechar qué endpoint toca qué tabla; verificar siempre con `git grep`)_

| Tabla | #endpoints | Ejemplos (top 3) |
| --- | --- | --- |
| `pos_products` | 45 | `POST /api/onboarding/import-products`<br>`POST /api/ml/products/cluster`<br>`POST /api/products` |
| `volvix_user` | 39 | `POST /api/owner/users`<br>`GET /api/users/me`<br>`GET /api/user/tutorials` |
| `pos_sales` | 36 | `GET /api/ml/sales/anomalies`<br>`POST /api/sales`<br>`GET /api/reports/sales` |
| `pos_users` | 28 | `POST /api/owner/users`<br>`GET /api/users/me`<br>`POST /api/users/me/first-login-complete` |
| `volvix_session` | 16 | `GET /api/auth/session`<br>`POST /api/auth/sessions/revoke`<br>`GET /api/auth/sessions` |
| `pos_tenants` | 14 | `POST /api/tenants`<br>`DELETE /api/admin/tenants/:id`<br>`GET /api/admin/tenants` |
| `pos_branches` | 12 | `GET /api/branches`<br>`POST /api/branches`<br>`PATCH /api/branches/:id` |
| `pos_customers` | 7 | `GET /api/loyalty/customers/:id`<br>`GET /api/reports/customers/cohort`<br>`POST /api/customers` |
| `pos_features` | 4 | `GET /api/admin/features/catalog`<br>`GET /api/admin/features`<br>`POST /api/admin/features` |
| `pos_returns` | 3 | `POST /api/returns`<br>`POST /api/returns/:id/approve`<br>`POST /api/returns/:id/cancel` |
| `volvix_vendors` | 3 | `GET /api/marketplace/vendors`<br>`POST /api/marketplace/vendors`<br>`POST /api/marketplace/vendors/:id/kyc` |
| `pos_currencies` | 2 | `GET /api/currencies`<br>`POST /api/currencies/refresh-rates` |
| `app_name` | 1 | `PATCH /api/employees/by-name/:name` |
| `pos_audit_log` | 1 | `GET /api/audit_log` |
| `volvix_audit_log` | 1 | `GET /api/audit_log` |

---

## Cómo regenerar

```bash
node scripts/system-map/scan-pos-panel.js --pretty
node scripts/system-map/render-markdown.js
```
