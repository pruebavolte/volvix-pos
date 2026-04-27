# R13 Wiring Audit — verion 340

Total archivos .js analizados: **271**  
Conectan a Supabase real: **4**  
Tienen datos demo/fixtures: **58**  
Tienen console.log: **136**  
Tienen TODO/FIXME: **12**  
Usan fetch/XHR/axios: **60**  

## Tabla resumen

| Archivo | Líneas | Conecta Supabase | Tiene Demo | TODOs | Console | Fetch/XHR |
|---|---:|:-:|:-:|:-:|:-:|:-:|
| `./api/index.js` | 785 | ✅ | — | — | — | — |
| `./auth-gate.js` | 44 | — | — | — | — | — |
| `./build-apps.js` | 151 | — | — | — | ✅ | — |
| `./giros_catalog_v2.js` | 580 | — | ✅ | — | — | — |
| `./public/auth-gate.js` | 44 | — | — | — | — | — |
| `./server.js` | 736 | — | ✅ | ✅ | ✅ | — |
| `./sw.js` | 262 | — | — | — | ✅ | ✅ |
| `./volvix-a11y-wiring.js` | 372 | — | — | — | — | — |
| `./volvix-ab-testing-wiring.js` | 533 | — | ✅ | — | ✅ | — |
| `./volvix-abtest-suite.js` | 297 | — | ✅ | — | — | — |
| `./volvix-accounting-wiring.js` | 563 | — | — | — | ✅ | — |
| `./volvix-ai-real-wiring.js` | 622 | — | — | — | ✅ | ✅ |
| `./volvix-ai-wiring.js` | 286 | — | — | — | ✅ | ✅ |
| `./volvix-airtable-wiring.js` | 347 | — | — | — | ✅ | ✅ |
| `./volvix-anomaly-wiring.js` | 448 | — | — | — | ✅ | — |
| `./volvix-api.js` | 307 | — | ✅ | — | ✅ | ✅ |
| `./volvix-appointments-wiring.js` | 495 | — | — | — | ✅ | — |
| `./volvix-asana-wiring.js` | 285 | — | — | — | — | ✅ |
| `./volvix-audit-wiring.js` | 654 | — | — | — | — | ✅ |
| `./volvix-backup-wiring.js` | 518 | — | — | ✅ | ✅ | ✅ |
| `./volvix-barcode-wiring.js` | 400 | — | — | — | — | — |
| `./volvix-bi-wiring.js` | 619 | — | — | — | ✅ | — |
| `./volvix-cache-wiring.js` | 490 | — | — | — | ✅ | — |
| `./volvix-calendar-wiring.js` | 701 | — | — | — | — | — |
| `./volvix-cashdrawer-wiring.js` | 348 | — | — | — | ✅ | — |
| `./volvix-categories-wiring.js` | 430 | — | ✅ | — | — | — |
| `./volvix-changelog-auto.js` | 317 | — | ✅ | — | — | — |
| `./volvix-charts-wiring.js` | 502 | — | — | — | — | ✅ |
| `./volvix-clip-wiring.js` | 362 | — | ✅ | — | — | — |
| `./volvix-compliance-wiring.js` | 538 | — | — | — | — | — |
| `./volvix-conekta-wiring.js` | 353 | — | — | — | ✅ | ✅ |
| `./volvix-coupons-wiring.js` | 402 | — | — | — | ✅ | — |
| `./volvix-crm-wiring.js` | 671 | — | — | — | ✅ | — |
| `./volvix-cron-wiring.js` | 477 | — | — | — | ✅ | — |
| `./volvix-crypto-wiring.js` | 393 | — | — | — | — | — |
| `./volvix-cs-wiring.js` | 570 | — | — | — | — | — |
| `./volvix-currency-wiring.js` | 408 | — | ✅ | — | ✅ | ✅ |
| `./volvix-cypress-tests.js` | 337 | — | ✅ | — | — | — |
| `./volvix-delivery-wiring.js` | 461 | — | — | — | — | — |
| `./volvix-discord-wiring.js` | 362 | — | — | — | — | ✅ |
| `./volvix-donations-wiring.js` | 282 | — | ✅ | ✅ | ✅ | — |
| `./volvix-drinks-wiring.js` | 344 | — | — | — | — | — |
| `./volvix-email-wiring.js` | 501 | — | ✅ | — | — | ✅ |
| `./volvix-extras-wiring.js` | 1163 | — | ✅ | ✅ | ✅ | ✅ |
| `./volvix-fb-pixel-wiring.js` | 315 | — | — | — | ✅ | ✅ |
| `./volvix-feedback-wiring.js` | 781 | — | — | — | — | ✅ |
| `./volvix-fiscal-wiring.js` | 460 | — | — | ✅ | ✅ | — |
| `./volvix-forecasting-wiring.js` | 681 | — | ✅ | — | — | — |
| `./volvix-fulltext-wiring.js` | 727 | — | — | — | ✅ | — |
| `./volvix-gamification-wiring.js` | 395 | — | — | — | — | — |
| `./volvix-geofence-wiring.js` | 323 | — | — | — | ✅ | — |
| `./volvix-google-analytics-wiring.js` | 289 | — | — | ✅ | ✅ | — |
| `./volvix-health-wiring.js` | 421 | ✅ | — | — | ✅ | ✅ |
| `./volvix-heatmap-wiring.js` | 361 | — | ✅ | — | — | — |
| `./volvix-hotjar-wiring.js` | 320 | — | ✅ | — | ✅ | — |
| `./volvix-hr-wiring.js` | 502 | — | ✅ | — | ✅ | — |
| `./volvix-hubspot-wiring.js` | 363 | — | — | — | — | ✅ |
| `./volvix-i18n-wiring.js` | 638 | — | — | — | — | — |
| `./volvix-indexeddb-wiring.js` | 342 | — | — | — | ✅ | — |
| `./volvix-intercom-wiring.js` | 269 | — | — | — | ✅ | — |
| `./volvix-inventory-ai-wiring.js` | 526 | — | ✅ | — | ✅ | ✅ |
| `./volvix-inventory-pro-wiring.js` | 457 | — | — | — | ✅ | — |
| `./volvix-kds-wiring.js` | 534 | — | ✅ | — | — | — |
| `./volvix-keyboard-nav.js` | 352 | — | — | — | ✅ | — |
| `./volvix-layaway-wiring.js` | 426 | — | — | — | ✅ | — |
| `./volvix-lighthouse-lite.js` | 333 | — | — | — | ✅ | — |
| `./volvix-loadtest-wiring.js` | 332 | — | ✅ | — | ✅ | ✅ |
| `./volvix-logger-wiring.js` | 531 | — | — | — | ✅ | — |
| `./volvix-lottery-wiring.js` | 306 | — | — | — | ✅ | — |
| `./volvix-loyalty-wiring.js` | 523 | — | — | — | ✅ | — |
| `./volvix-mailchimp-wiring.js` | 428 | — | — | — | ✅ | ✅ |
| `./volvix-maps-wiring.js` | 374 | — | ✅ | — | — | — |
| `./volvix-marketing-wiring.js` | 446 | — | ✅ | — | ✅ | — |
| `./volvix-master-controller.js` | 381 | — | — | ✅ | ✅ | — |
| `./volvix-mercadopago-wiring.js` | 432 | — | — | — | ✅ | ✅ |
| `./volvix-mobile-wiring.js` | 379 | — | ✅ | — | ✅ | — |
| `./volvix-modifiers-wiring.js` | 495 | — | — | — | — | — |
| `./volvix-multipos-extra-wiring.js` | 738 | — | ✅ | — | ✅ | ✅ |
| `./volvix-multipos-wiring.js` | 238 | — | — | — | ✅ | ✅ |
| `./volvix-multistore-wiring.js` | 547 | — | ✅ | — | ✅ | ✅ |
| `./volvix-notifications-wiring.js` | 518 | — | — | — | ✅ | ✅ |
| `./volvix-notion-wiring.js` | 291 | — | — | — | ✅ | ✅ |
| `./volvix-offline-queue.js` | 390 | — | — | — | ✅ | ✅ |
| `./volvix-offline-wiring.js` | 375 | — | — | — | ✅ | ✅ |
| `./volvix-onboarding-wiring.js` | 525 | — | — | — | — | — |
| `./volvix-owner-extra-wiring.js` | 683 | — | — | — | ✅ | ✅ |
| `./volvix-owner-wiring.js` | 402 | — | — | ✅ | ✅ | ✅ |
| `./volvix-payments-wiring.js` | 577 | — | ✅ | — | ✅ | — |
| `./volvix-paypal-wiring.js` | 407 | — | — | — | ✅ | ✅ |
| `./volvix-perf-monitor.js` | 353 | — | ✅ | — | — | ✅ |
| `./volvix-perf-wiring.js` | 434 | — | — | — | ✅ | — |
| `./volvix-permissions-wiring.js` | 345 | — | — | — | — | — |
| `./volvix-photo-wiring.js` | 576 | — | — | — | ✅ | — |
| `./volvix-pin-wiring.js` | 487 | — | ✅ | — | ✅ | — |
| `./volvix-playwright-tests.js` | 366 | — | ✅ | — | ✅ | — |
| `./volvix-plugins-wiring.js` | 631 | — | ✅ | — | ✅ | ✅ |
| `./volvix-pos-extra-wiring.js` | 976 | — | — | ✅ | ✅ | ✅ |
| `./volvix-pos-wiring.js` | 491 | — | — | ✅ | ✅ | ✅ |
| `./volvix-pricing-wiring.js` | 442 | — | ✅ | — | ✅ | — |
| `./volvix-print-hub.js` | 612 | — | — | — | ✅ | ✅ |
| `./volvix-printer-wiring.js` | 615 | — | — | — | ✅ | — |
| `./volvix-purchase-wiring.js` | 655 | — | — | — | — | — |
| `./volvix-pwa-install-prompt.js` | 328 | — | — | — | ✅ | — |
| `./volvix-pwa-wiring.js` | 394 | — | — | — | ✅ | — |
| `./volvix-queue-wiring.js` | 565 | — | — | — | ✅ | — |
| `./volvix-quickactions-wiring.js` | 523 | — | — | — | — | — |
| `./volvix-quickbooks-wiring.js` | 433 | — | ✅ | — | ✅ | — |
| `./volvix-ratelimit-wiring.js` | 423 | — | — | — | ✅ | ✅ |
| `./volvix-realtime-wiring.js` | 592 | ✅ | — | — | ✅ | — |
| `./volvix-receipt-customizer-wiring.js` | 623 | — | ✅ | — | — | — |
| `./volvix-recommendations-wiring.js` | 535 | — | — | — | ✅ | ✅ |
| `./volvix-reminders-wiring.js` | 437 | — | — | — | ✅ | — |
| `./volvix-reports-wiring.js` | 730 | — | — | — | ✅ | ✅ |
| `./volvix-reservations-wiring.js` | 517 | — | — | — | — | — |
| `./volvix-returns-wiring.js` | 545 | — | — | — | ✅ | — |
| `./volvix-routes-wiring.js` | 431 | — | ✅ | — | — | — |
| `./volvix-scale-wiring.js` | 454 | — | ✅ | — | — | — |
| `./volvix-search-wiring.js` | 430 | — | — | — | — | ✅ |
| `./volvix-security-scan.js` | 562 | — | ✅ | — | — | ✅ |
| `./volvix-sendgrid-wiring.js` | 309 | — | — | — | — | ✅ |
| `./volvix-sentry-wiring.js` | 344 | — | ✅ | — | ✅ | ✅ |
| `./volvix-seo-wiring.js` | 272 | — | — | — | — | — |
| `./volvix-service-wiring.js` | 584 | — | — | — | ✅ | — |
| `./volvix-shortcuts-wiring.js` | 395 | — | — | — | — | — |
| `./volvix-signature-wiring.js` | 382 | — | — | — | ✅ | — |
| `./volvix-slack-wiring.js` | 374 | — | — | — | ✅ | ✅ |
| `./volvix-stocktake-wiring.js` | 418 | — | — | — | ✅ | — |
| `./volvix-stripe-wiring.js` | 541 | — | ✅ | — | — | — |
| `./volvix-subscriptions-wiring.js` | 612 | — | — | — | ✅ | — |
| `./volvix-sync-widget.js` | 187 | — | — | — | — | — |
| `./volvix-sync.js` | 398 | — | — | — | ✅ | ✅ |
| `./volvix-tables-wiring.js` | 621 | ✅ | ✅ | — | ✅ | — |
| `./volvix-tags-wiring.js` | 414 | — | ✅ | — | ✅ | — |
| `./volvix-tax-wiring.js` | 665 | — | ✅ | — | ✅ | — |
| `./volvix-telegram-wiring.js` | 427 | — | — | — | ✅ | ✅ |
| `./volvix-tests-wiring.js` | 412 | — | — | — | ✅ | ✅ |
| `./volvix-theme-wiring.js` | 306 | — | — | — | ✅ | — |
| `./volvix-tools-wiring.js` | 261 | — | — | — | ✅ | ✅ |
| `./volvix-trello-wiring.js` | 284 | — | — | — | ✅ | — |
| `./volvix-twilio-wiring.js` | 269 | — | — | — | ✅ | ✅ |
| `./volvix-ui-accordion.js` | 338 | — | — | — | — | — |
| `./volvix-ui-animations.js` | 219 | — | — | — | — | — |
| `./volvix-ui-avatar.js` | 207 | — | — | — | — | — |
| `./volvix-ui-badge.js` | 211 | — | — | — | — | — |
| `./volvix-ui-banner.js` | 265 | — | — | — | — | — |
| `./volvix-ui-card.js` | 277 | — | — | — | — | — |
| `./volvix-ui-carousel.js` | 306 | — | — | — | — | — |
| `./volvix-ui-charts-pro.js` | 567 | — | — | — | — | — |
| `./volvix-ui-codeeditor.js` | 501 | — | — | — | — | — |
| `./volvix-ui-colorpicker.js` | 297 | — | — | — | — | — |
| `./volvix-ui-colorwheel.js` | 257 | — | — | — | — | — |
| `./volvix-ui-contextmenu.js` | 342 | — | — | — | — | — |
| `./volvix-ui-datepicker.js` | 526 | — | — | — | — | — |
| `./volvix-ui-diff.js` | 302 | — | — | — | — | — |
| `./volvix-ui-drawer.js` | 261 | — | — | — | — | — |
| `./volvix-ui-dropdown.js` | 333 | — | — | — | — | — |
| `./volvix-ui-editor.js` | 422 | — | — | — | — | — |
| `./volvix-ui-emoji.js` | 624 | — | ✅ | — | — | — |
| `./volvix-ui-empty.js` | 197 | — | — | — | — | — |
| `./volvix-ui-errors.js` | 271 | — | — | — | — | ✅ |
| `./volvix-ui-fileupload.js` | 404 | — | — | — | — | ✅ |
| `./volvix-ui-flowchart.js` | 528 | — | — | — | — | — |
| `./volvix-ui-form-designer.js` | 500 | — | — | — | — | — |
| `./volvix-ui-form.js` | 370 | — | — | — | — | — |
| `./volvix-ui-fullcalendar.js` | 429 | — | — | — | — | — |
| `./volvix-ui-gantt.js` | 420 | — | — | — | — | — |
| `./volvix-ui-imageviewer.js` | 339 | — | — | — | — | — |
| `./volvix-ui-kanban.js` | 391 | — | — | — | — | — |
| `./volvix-ui-list.js` | 336 | — | — | — | — | — |
| `./volvix-ui-map.js` | 347 | — | — | — | ✅ | — |
| `./volvix-ui-markdown.js` | 362 | — | — | — | — | — |
| `./volvix-ui-mention.js` | 347 | — | — | — | — | — |
| `./volvix-ui-mindmap.js` | 408 | — | — | — | — | — |
| `./volvix-ui-modal.js` | 281 | — | — | — | — | — |
| `./volvix-ui-numinput.js` | 289 | — | — | — | ✅ | — |
| `./volvix-ui-orgchart.js` | 345 | — | ✅ | — | — | — |
| `./volvix-ui-otp.js` | 298 | — | — | — | ✅ | — |
| `./volvix-ui-pagination.js` | 310 | — | — | — | — | — |
| `./volvix-ui-phone.js` | 363 | — | — | — | — | — |
| `./volvix-ui-pivot.js` | 481 | — | — | — | — | — |
| `./volvix-ui-progress.js` | 316 | — | — | — | — | — |
| `./volvix-ui-searchbox.js` | 452 | — | — | — | ✅ | ✅ |
| `./volvix-ui-signature.js` | 359 | — | — | — | — | — |
| `./volvix-ui-skeleton.js` | 263 | — | — | — | — | — |
| `./volvix-ui-slider.js` | 380 | — | — | — | — | — |
| `./volvix-ui-snackbar.js` | 319 | — | — | — | — | — |
| `./volvix-ui-spinner.js` | 202 | — | — | — | — | — |
| `./volvix-ui-splash.js` | 266 | — | — | — | — | — |
| `./volvix-ui-spreadsheet.js` | 654 | — | — | — | — | — |
| `./volvix-ui-stars.js` | 257 | — | — | — | — | — |
| `./volvix-ui-steps.js` | 278 | — | — | — | — | — |
| `./volvix-ui-table.js` | 425 | — | ✅ | — | — | — |
| `./volvix-ui-tabs.js` | 309 | — | — | — | — | — |
| `./volvix-ui-timeline.js` | 231 | — | — | — | — | — |
| `./volvix-ui-toggle.js` | 226 | — | — | — | — | — |
| `./volvix-ui-tooltip.js` | 316 | — | — | — | — | — |
| `./volvix-ui-tour.js` | 336 | — | — | — | — | — |
| `./volvix-ui-treeview.js` | 514 | — | — | — | — | — |
| `./volvix-ui-whiteboard.js` | 467 | — | — | — | — | — |
| `./volvix-ui-wizard.js` | 394 | — | — | — | ✅ | — |
| `./volvix-vertical-autolavado.js` | 338 | — | — | — | ✅ | — |
| `./volvix-vertical-bicicletas.js` | 337 | — | — | — | — | — |
| `./volvix-vertical-bowling.js` | 284 | — | — | — | — | — |
| `./volvix-vertical-buffet.js` | 366 | — | — | — | ✅ | — |
| `./volvix-vertical-cafe.js` | 456 | — | — | — | — | — |
| `./volvix-vertical-cafeinternet.js` | 347 | — | — | — | ✅ | — |
| `./volvix-vertical-cantina.js` | 263 | — | — | — | ✅ | — |
| `./volvix-vertical-carniceria.js` | 391 | — | — | — | ✅ | — |
| `./volvix-vertical-cine.js` | 370 | — | ✅ | — | — | — |
| `./volvix-vertical-cremeria.js` | 291 | — | ✅ | — | — | — |
| `./volvix-vertical-dental.js` | 365 | — | — | — | — | — |
| `./volvix-vertical-disco.js` | 364 | — | — | — | — | — |
| `./volvix-vertical-dulceria.js` | 338 | — | ✅ | — | — | — |
| `./volvix-vertical-educacion.js` | 522 | — | — | — | — | — |
| `./volvix-vertical-estetica.js` | 371 | — | — | — | ✅ | — |
| `./volvix-vertical-eventos.js` | 424 | — | ✅ | — | ✅ | — |
| `./volvix-vertical-farmacia.js` | 378 | — | — | — | ✅ | — |
| `./volvix-vertical-ferreteria.js` | 421 | — | — | — | — | — |
| `./volvix-vertical-floreria.js` | 262 | — | — | — | — | — |
| `./volvix-vertical-foodtruck.js` | 386 | — | — | — | — | — |
| `./volvix-vertical-fotografia.js` | 346 | — | — | — | ✅ | — |
| `./volvix-vertical-fruteria.js` | 256 | — | — | — | ✅ | — |
| `./volvix-vertical-funeraria.js` | 323 | — | ✅ | — | ✅ | — |
| `./volvix-vertical-guarderia.js` | 447 | — | — | — | ✅ | — |
| `./volvix-vertical-gym.js` | 412 | — | ✅ | — | ✅ | — |
| `./volvix-vertical-helado.js` | 360 | — | — | — | — | — |
| `./volvix-vertical-hotel.js` | 463 | — | — | — | — | — |
| `./volvix-vertical-inmobiliaria.js` | 479 | — | — | — | ✅ | — |
| `./volvix-vertical-joyeria.js` | 498 | — | — | — | — | — |
| `./volvix-vertical-karaoke.js` | 253 | — | — | — | — | — |
| `./volvix-vertical-lavanderia.js` | 347 | — | — | — | ✅ | — |
| `./volvix-vertical-libreria.js` | 331 | — | — | — | ✅ | — |
| `./volvix-vertical-mecanica.js` | 484 | — | — | — | — | — |
| `./volvix-vertical-muebleria.js` | 350 | — | — | — | ✅ | — |
| `./volvix-vertical-notaria.js` | 327 | — | — | — | ✅ | — |
| `./volvix-vertical-optometria.js` | 339 | — | ✅ | — | — | — |
| `./volvix-vertical-panaderia.js` | 391 | — | — | — | ✅ | — |
| `./volvix-vertical-papeleria.js` | 384 | — | — | — | — | — |
| `./volvix-vertical-paqueteria.js` | 335 | — | — | — | ✅ | — |
| `./volvix-vertical-parking.js` | 381 | — | — | — | — | — |
| `./volvix-vertical-pescaderia.js` | 273 | — | — | — | ✅ | — |
| `./volvix-vertical-pethotel.js` | 403 | — | ✅ | — | ✅ | — |
| `./volvix-vertical-pizza.js` | 346 | — | — | — | — | — |
| `./volvix-vertical-polleria.js` | 354 | — | — | — | — | — |
| `./volvix-vertical-recauchutado.js` | 276 | — | — | — | — | — |
| `./volvix-vertical-rentaequipo.js` | 378 | — | — | — | — | — |
| `./volvix-vertical-ropa.js` | 462 | — | — | ✅ | — | — |
| `./volvix-vertical-spa.js` | 400 | — | ✅ | — | ✅ | — |
| `./volvix-vertical-sushi.js` | 273 | — | — | — | — | — |
| `./volvix-vertical-tabaqueria.js` | 306 | — | — | — | ✅ | — |
| `./volvix-vertical-tintoreria.js` | 293 | — | — | — | — | — |
| `./volvix-vertical-tlapaleria.js` | 283 | — | — | — | — | — |
| `./volvix-vertical-tortilleria.js` | 303 | — | — | — | ✅ | — |
| `./volvix-vertical-vet.js` | 450 | — | — | — | — | — |
| `./volvix-vertical-vinateria.js` | 388 | — | — | — | ✅ | — |
| `./volvix-vertical-zapateria.js` | 346 | — | — | — | ✅ | — |
| `./volvix-voice-wiring.js` | 539 | — | — | — | ✅ | — |
| `./volvix-wallet-wiring.js` | 400 | — | — | — | ✅ | — |
| `./volvix-webextensions-wiring.js` | 318 | — | — | — | — | ✅ |
| `./volvix-webhooks-wiring.js` | 509 | — | ✅ | — | ✅ | ✅ |
| `./volvix-webrtc-wiring.js` | 568 | — | — | — | ✅ | — |
| `./volvix-whatsapp-wiring.js` | 401 | — | ✅ | — | — | — |
| `./volvix-wiring.js` | 358 | — | — | ✅ | ✅ | ✅ |
| `./volvix-workflow-closeday.js` | 450 | — | — | — | — | — |
| `./volvix-workflow-collections.js` | 347 | — | — | — | ✅ | ✅ |
| `./volvix-workflow-onboarding.js` | 347 | — | ✅ | — | ✅ | — |
| `./volvix-workflow-openday.js` | 358 | — | — | — | ✅ | ✅ |
| `./volvix-workflow-reconciliation.js` | 445 | — | — | — | — | — |
| `./volvix-workflow-restock.js` | 465 | — | — | — | ✅ | — |
| `./volvix-workflow-wiring.js` | 640 | — | ✅ | — | ✅ | ✅ |
| `./volvix-zapier-wiring.js` | 403 | — | ✅ | — | ✅ | ✅ |

## Top 10 archivos CRÍTICOS sin conexión a Supabase real

Criterio: archivos del dominio core (POS, pagos, inventario, reportes, contabilidad, multi-tienda, IA, etc.) ordenados por tamaño que **NO** importan ni llaman a Supabase. Suelen operar contra `localStorage`, `IndexedDB` o datos demo.

| # | Archivo | Líneas | Tiene Demo | TODOs | Fetch/XHR |
|---:|---|---:|:-:|:-:|:-:|
| 1 | `./volvix-pos-extra-wiring.js` | 976 | — | ✅ | ✅ |
| 2 | `./volvix-multipos-extra-wiring.js` | 738 | ✅ | — | ✅ |
| 3 | `./volvix-reports-wiring.js` | 730 | — | — | ✅ |
| 4 | `./volvix-fulltext-wiring.js` | 727 | — | — | — |
| 5 | `./volvix-owner-extra-wiring.js` | 683 | — | — | ✅ |
| 6 | `./volvix-forecasting-wiring.js` | 681 | ✅ | — | — |
| 7 | `./volvix-crm-wiring.js` | 671 | — | — | — |
| 8 | `./volvix-tax-wiring.js` | 665 | ✅ | — | — |
| 9 | `./volvix-purchase-wiring.js` | 655 | — | — | — |
| 10 | `./volvix-audit-wiring.js` | 654 | — | — | ✅ |

## Notas

- Solo **4 archivos** referencian Supabase de forma real: `api/index.js`, `volvix-health-wiring.js`, `volvix-tables-wiring.js`, `volvix-realtime-wiring.js`. Todo lo demás es UI/lógica local.
- 66 archivos contienen patrones tipo demo/mock/fixture/sample/seed (incluye verticales con catálogos hardcodeados de productos por giro).
- 136 archivos contienen `console.log` que deberían filtrarse antes de producción.
- 12 archivos tienen TODO/FIXME explícitos: `server.js`, `volvix-fiscal-wiring.js`, `volvix-backup-wiring.js`, `volvix-extras-wiring.js`, `volvix-donations-wiring.js`, `volvix-master-controller.js`, `volvix-pos-extra-wiring.js`, `volvix-owner-wiring.js`, `volvix-pos-wiring.js`, `volvix-google-analytics-wiring.js`, `volvix-vertical-ropa.js`, `volvix-wiring.js`.