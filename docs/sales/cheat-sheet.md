# SalvadoreX — Cheat Sheet Vendedor (1 página)

> Imprimir y tener a la mano. Versión 2026-04-28.

---

## URLs CLAVE

| Función | URL |
|---|---|
| Landing público | `https://salvadorex.com` |
| App principal | `https://salvadorex.com/web/v25` |
| Crear tenant (admin) | `https://salvadorex.com/web/v25/admin/create-tenant` |
| Onboarding tour | `https://salvadorex.com/web/v25/onboarding/tour?step=1` |
| POS | `/web/v25/pos` |
| KDS cocina | `/web/v25/kds` |
| Mapa salón | `/web/v25/restaurant/floor-plan` |
| Inventario | `/web/v25/inventory/products` |
| Importar CSV | `/web/v25/inventory/import-csv` |
| Diseñador etiquetas | `/web/v25/labels/designer` |
| Customers | `/web/v25/customers` |
| Memberships | `/web/v25/memberships` |
| Promos | `/web/v25/promos` |
| Reportes | `/web/v25/reports` |
| Cortes Z | `/web/v25/cortes` |
| CFDI | `/web/v25/cfdi` |
| Export GDPR | `/web/v25/settings/data-export` |
| FAQ pública | `/docs/faq-general.html` |

---

## CREDENCIALES DEMO

```
URL:      https://salvadorex.com/web/v25
Usuario:  demo@salvadorex.com
Password: Demo2026!
Tenant:   demo-cafeteria
Plan:     Pro (sandbox)
```

> Resetear demo: `POST /api/admin/reset-demo` con `Authorization: Bearer SALVADOREX_DEMO_RESET_TOKEN`.

---

## COMANDOS curl SOPORTE

### Status sistema
```bash
curl https://api.salvadorex.com/v1/health
```

### Re-bootstrap demo
```bash
curl -X POST https://api.salvadorex.com/v1/tenants/{tenant_id}/bootstrap-demo \
  -H "Authorization: Bearer {admin_token}" \
  -d '{"giro": "cafeteria"}'
```

### Reset password usuario
```bash
curl -X POST https://api.salvadorex.com/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### Forzar sync offline
```bash
curl -X POST https://api.salvadorex.com/v1/offline/force-sync/{tenant_id}
```

### Verificar webhook Stripe
```bash
curl https://api.salvadorex.com/v1/webhooks/stripe/test \
  -H "Stripe-Signature: ..."
```

### Generar export GDPR manual
```bash
curl -X POST https://api.salvadorex.com/v1/tenants/{tenant_id}/export \
  -H "Authorization: Bearer {admin_token}" \
  -d '{"scope": "all", "from": "2024-01-01", "to": "2026-04-28"}'
```

---

## MÓDULOS × GIROS RECOMENDADOS

| Giro | POS | Inv | KDS | Mesas | Promos | CFDI | Loyalty | Multi-Pos | Memberships |
|---|---|---|---|---|---|---|---|---|---|
| Cafetería | ● | ● | ○ | ○ | ● | ○ | ● | ○ | ○ |
| Restaurante | ● | ● | ● | ● | ● | ○ | ● | ● | ○ |
| Bar / Cantina | ● | ● | ● | ● | ● | ○ | ● | ● | ○ |
| Boutique ropa | ● | ● | ─ | ─ | ● | ○ | ● | ○ | ○ |
| Farmacia | ● | ● | ─ | ─ | ○ | ● | ○ | ○ | ○ |
| Papelería | ● | ● | ─ | ─ | ○ | ○ | ○ | ○ | ○ |
| Abarrotes | ● | ● | ─ | ─ | ● | ○ | ● | ○ | ○ |
| Gimnasio | ● | ○ | ─ | ─ | ● | ○ | ● | ○ | ● |
| Salón belleza | ● | ○ | ─ | ─ | ● | ○ | ● | ○ | ● |
| Vendedor móvil | ● | ○ | ─ | ─ | ○ | ○ | ○ | ○ | ○ |
| E-commerce | ● | ● | ─ | ─ | ● | ● | ● | ─ | ○ |
| Coworking | ● | ○ | ─ | ─ | ○ | ● | ○ | ─ | ● |

`●` Esencial | `○` Opcional | `─` No aplica

---

## PRICING (MXN, IVA incluido)

| Plan | Precio mensual | Anual | Ahorro anual |
|---|---|---|---|
| Starter | $0 (14 días) | — | Trial |
| Lite | $199 | $1,990 | $398 (2 meses) |
| Lite-Etiquetas | $99 | $990 | $198 |
| Pro | $399 | $3,990 | $798 |
| Business | $799 | $7,990 | $1,598 |
| Enterprise | Contactar | Contactar | Volumen |

### Comparativa rápida vs competencia (Año 1)

| Solución | Costo Año 1 | SalvadoreX ahorro |
|---|---|---|
| Aspel SAE | $44,100 | $39,312 |
| MicroSIP | $20,000 | $15,212 |
| QuickBooks POS | $14,000 | $9,212 |
| **SalvadoreX Pro** | **$4,788** | — |

---

## FORMAS DE PAGO ACEPTADAS

- Tarjeta crédito/débito (Stripe)
- Transferencia SPEI
- OXXO (link de pago)
- PayPal (en plan Pro+)
- Efectivo (deposito en sucursal bancaria)

---

## SLAs

| Plan | Uptime | Soporte | Tiempo respuesta |
|---|---|---|---|
| Starter/Lite | 99% | Email | 24 hrs |
| Pro | 99.5% | WhatsApp 24/7 | 1 hr business hours, 4 hrs fines de semana |
| Business | 99.9% | WhatsApp dedicado | 30 min |
| Enterprise | 99.95% | Account manager + Slack | 15 min |

---

## TELÉFONOS Y CANALES SOPORTE

| Canal | Contacto | Horario |
|---|---|---|
| WhatsApp soporte | +52 55 1234 5678 | 24/7 (Pro+) |
| Teléfono soporte | 800-SALVADO | L-V 9-19, S 10-14 |
| Email soporte | help@salvadorex.com | 24 hrs |
| Slack comunidad | salvadorex-community.slack.com | Asincronico |
| Facebook | /salvadorex.mx | Asincronico |
| Estado servicio | https://status.salvadorex.com | Real-time |

---

## RAMPA SUBIR TICKETS A INGENIERÍA

Si soporte L1 no resuelve en 30 min:

1. **L2 (Customer Success)** — escalación con video. WhatsApp interno `#cs-escalation`.
2. **L3 (Engineering on-call)** — solo bugs P0/P1. PagerDuty.
3. **CTO directo** — solo data loss / breach. WhatsApp directo CTO.

### Severidades

| Sev | Descripción | SLA respuesta |
|---|---|---|
| P0 | Sistema caído, data loss | 15 min |
| P1 | Función crítica rota | 1 hr |
| P2 | Función no crítica rota | 4 hrs |
| P3 | Cosmético / feature request | 1 día |

---

## TROUBLESHOOTING RÁPIDO

| Síntoma | Causa común | Fix rápido |
|---|---|---|
| POS no carga | Cache navegador | Ctrl+Shift+R |
| No imprime ticket | Plantilla mal | `/settings/ticket-template` |
| CFDI rechazado | CSD vencido | Re-subir CSD |
| Stock no descuenta | Branch_id ausente | Re-login en branch |
| Sync offline pendiente | Conexión inestable | Forzar sync manual |
| Reporte vacío | Sin filtros bien | Reset filtros |
| Login bloqueado | 5 intentos fallidos | Esperar 15 min o admin reset |
| 2FA perdido | Recovery codes | `/security/recovery-codes` |
| Email no llega | Spam folder | Whitelist `noreply@salvadorex.com` |

---

## CHECKLIST CIERRE DE VENTA

Antes de mandar credenciales al nuevo cliente:

- [ ] Tenant creado con plan correcto.
- [ ] Bootstrap demo data según giro.
- [ ] Email enviado con accesos + tour link.
- [ ] WhatsApp con voz amigable + Calendly link.
- [ ] CRM actualizado (etiqueta "vendido").
- [ ] Slack `#new-customers` notificado.
- [ ] Tarea Customer Success: llamada día 3.
- [ ] Si plan Pro+: agendar onboarding 30 min.

---

## REFERENCIAS RÁPIDAS

- Playbook completo: `docs/sales/playbook.md`
- 10 escenarios paso a paso: `docs/scenarios/01..10`
- Onboarding por giro: `docs/onboarding/by-industry.md`
- Templates outreach: `docs/sales/outreach-templates.md`
- FAQs cliente: `docs/faq-general.html`
- Disaster recovery: `docs/runbook-disaster-recovery.md`
