# VOLVIX POS GODMODE — SYSTEM MAP

> Bottom-up complete reference. Generated 2026-04-26. Version 3.4.0 GODMODE.
> Total: 154+ JS files, 18 HTMLs, 43 API endpoints, 152 agents, 25 verticals, 29 UI components.

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Module Tree](#3-module-tree)
4. [JavaScript Files (154+)](#4-javascript-files)
5. [HTML Files (18)](#5-html-files)
6. [API Endpoints (43)](#6-api-endpoints)
7. [Agents Registry (152)](#7-agents-registry)
8. [POS Verticals (25)](#8-pos-verticals)
9. [UI Components (29)](#9-ui-components)
10. [Enterprise Modules](#10-enterprise-modules)
11. [Pricing Tiers](#11-pricing-tiers)
12. [Dependencies](#12-dependencies)
13. [Data Flow](#13-data-flow)
14. [Deployment](#14-deployment)

---

## 1. SYSTEM OVERVIEW

```
+---------------------------------------------------------------+
|                    VOLVIX POS GODMODE 3.4                     |
|              Multi-tenant SaaS POS + AI Agents                |
+---------------------------------------------------------------+
| Stack: Node.js + Express + Supabase + Vanilla JS + HTML5      |
| Hosting: Vercel (edge) + Supabase (PG + Auth + Storage)       |
| AI: Claude 4.7 Opus + GPT-4o + Gemini 2.5 Pro (multi-IA)      |
| Tenancy: Row-Level Security (RLS) per organization            |
| Realtime: Supabase channels + WebSockets                      |
+---------------------------------------------------------------+
```

### Key facts
- **Codebase size**: 154+ JS modules, 18 HTML entry points, 43 REST endpoints.
- **Agent fleet**: 152 specialized AI agents, each with creation lineage tracking.
- **Verticals**: 25 industry-specific POS configurations (retail, food, services, etc).
- **UI library**: 29 reusable web components.
- **Pricing**: 5 tiers (Free, Starter, Pro, Business, Enterprise).

---

## 2. ARCHITECTURE DIAGRAM

```
+-------------------+      +-------------------+      +-------------------+
|   Browser (SPA)   | <--> |  Vercel Edge API  | <--> |   Supabase Core   |
|  HTML + Vanilla   |      |   Express + JWT   |      |  PG + Auth + Bus  |
+-------------------+      +-------------------+      +-------------------+
         |                           |                          |
         v                           v                          v
+-------------------+      +-------------------+      +-------------------+
|   IndexedDB       |      |  Agent Router     |      |  Storage (S3)    |
|   (offline POS)   |      |  152 agents       |      |  receipts/img    |
+-------------------+      +-------------------+      +-------------------+
                                     |
                                     v
                +-----------------------------------------+
                |        AI Provider Layer                |
                |  Claude 4.7 | GPT-4o | Gemini 2.5 Pro   |
                +-----------------------------------------+
```

### Request Lifecycle

```
Click  -->  UI Component  -->  Action Dispatcher  -->  API Client
                                                            |
                                                            v
JWT verify <-- Express Router <-- Vercel Edge <-- HTTPS Request
   |
   v
RLS Policy --> Postgres Query --> JSON Response --> UI Update
```

---

## 3. MODULE TREE

```
volvix-pos/
├── api/                          (43 endpoints)
│   ├── auth/
│   ├── pos/
│   ├── inventory/
│   ├── agents/
│   ├── billing/
│   ├── reports/
│   └── admin/
├── public/                       (18 HTMLs + assets)
│   ├── index.html
│   ├── pos.html
│   ├── admin.html
│   └── ...
├── src/
│   ├── core/                     (kernel, dispatcher, state)
│   ├── modules/                  (POS, inv, crm, hr, fin)
│   ├── agents/                   (152 agent definitions)
│   ├── components/               (29 UI components)
│   ├── verticals/                (25 industry packs)
│   ├── enterprise/               (multi-org, audit, SSO)
│   ├── utils/
│   └── adapters/                 (supabase, stripe, ai)
├── tests/
├── docs/
└── scripts/
```

---

## 4. JAVASCRIPT FILES

### 4.1 Core Kernel (12 files)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/core/kernel.js` | Boot sequence, module registry, lifecycle |
| 2 | `src/core/dispatcher.js` | Central event/action dispatcher |
| 3 | `src/core/state.js` | Reactive global store (proxy-based) |
| 4 | `src/core/router.js` | Hash + history router |
| 5 | `src/core/auth.js` | JWT, session, refresh token logic |
| 6 | `src/core/rbac.js` | Role-based access control matrix |
| 7 | `src/core/i18n.js` | Translations es/en/pt |
| 8 | `src/core/logger.js` | Structured logging + Sentry hook |
| 9 | `src/core/errors.js` | Custom error classes + handler |
| 10 | `src/core/cache.js` | LRU + IndexedDB cache |
| 11 | `src/core/sync.js` | Offline queue + conflict resolution |
| 12 | `src/core/bus.js` | PubSub event bus |

### 4.2 POS Modules (24 files)

| # | File | Purpose |
|---|------|---------|
| 13 | `src/modules/pos/cart.js` | Shopping cart, line items, discounts |
| 14 | `src/modules/pos/checkout.js` | Checkout flow controller |
| 15 | `src/modules/pos/payments.js` | Payment methods orchestrator |
| 16 | `src/modules/pos/payment-cash.js` | Cash drawer |
| 17 | `src/modules/pos/payment-card.js` | Card terminal integration |
| 18 | `src/modules/pos/payment-stripe.js` | Stripe Terminal SDK |
| 19 | `src/modules/pos/payment-mp.js` | MercadoPago Point |
| 20 | `src/modules/pos/payment-qr.js` | QR/PIX/SPEI |
| 21 | `src/modules/pos/payment-crypto.js` | BTC/USDC via Coinbase |
| 22 | `src/modules/pos/receipt.js` | Receipt builder + printer |
| 23 | `src/modules/pos/printer-escpos.js` | ESC/POS thermal printer |
| 24 | `src/modules/pos/printer-pdf.js` | PDF e-receipt |
| 25 | `src/modules/pos/tax.js` | Tax calculator (multi-jurisdiction) |
| 26 | `src/modules/pos/discount.js` | Discount engine + coupons |
| 27 | `src/modules/pos/loyalty.js` | Points, tiers, redemption |
| 28 | `src/modules/pos/giftcard.js` | Gift card issuance/redemption |
| 29 | `src/modules/pos/refund.js` | Returns and refunds |
| 30 | `src/modules/pos/void.js` | Void transactions |
| 31 | `src/modules/pos/split.js` | Split bill / split tender |
| 32 | `src/modules/pos/tip.js` | Tip suggestions + assignment |
| 33 | `src/modules/pos/till.js` | Till open/close, cash count |
| 34 | `src/modules/pos/shift.js` | Shift management |
| 35 | `src/modules/pos/zreport.js` | End-of-day Z-report |
| 36 | `src/modules/pos/offline.js` | Offline POS queue |

### 4.3 Inventory (14 files)

| # | File | Purpose |
|---|------|---------|
| 37 | `src/modules/inv/products.js` | Product CRUD |
| 38 | `src/modules/inv/variants.js` | Size/color/SKU variants |
| 39 | `src/modules/inv/categories.js` | Hierarchical categories |
| 40 | `src/modules/inv/stock.js` | Stock levels, reservations |
| 41 | `src/modules/inv/movements.js` | Stock movements ledger |
| 42 | `src/modules/inv/suppliers.js` | Supplier directory |
| 43 | `src/modules/inv/po.js` | Purchase orders |
| 44 | `src/modules/inv/receiving.js` | Goods receipt |
| 45 | `src/modules/inv/transfers.js` | Inter-warehouse transfers |
| 46 | `src/modules/inv/adjustments.js` | Stock adjustments |
| 47 | `src/modules/inv/cycle-count.js` | Cycle counting |
| 48 | `src/modules/inv/barcode.js` | Barcode scan + generate |
| 49 | `src/modules/inv/labels.js` | Label printing |
| 50 | `src/modules/inv/forecast.js` | AI demand forecasting |

### 4.4 CRM & Customers (10 files)

| # | File | Purpose |
|---|------|---------|
| 51 | `src/modules/crm/customers.js` | Customer CRUD |
| 52 | `src/modules/crm/segments.js` | Segmentation engine |
| 53 | `src/modules/crm/campaigns.js` | Email/SMS campaigns |
| 54 | `src/modules/crm/loyalty-program.js` | Loyalty config |
| 55 | `src/modules/crm/feedback.js` | NPS, reviews capture |
| 56 | `src/modules/crm/birthdays.js` | Birthday automations |
| 57 | `src/modules/crm/sms.js` | Twilio SMS adapter |
| 58 | `src/modules/crm/email.js` | Resend email adapter |
| 59 | `src/modules/crm/whatsapp.js` | WhatsApp Cloud API |
| 60 | `src/modules/crm/insights.js` | RFM analysis |

### 4.5 HR & Staff (8 files)

| # | File | Purpose |
|---|------|---------|
| 61 | `src/modules/hr/employees.js` | Employee directory |
| 62 | `src/modules/hr/roles.js` | Role assignment |
| 63 | `src/modules/hr/timeclock.js` | Time clock + biometric |
| 64 | `src/modules/hr/scheduling.js` | Shift scheduling |
| 65 | `src/modules/hr/payroll.js` | Payroll calculator |
| 66 | `src/modules/hr/commissions.js` | Sales commissions |
| 67 | `src/modules/hr/training.js` | Training modules |
| 68 | `src/modules/hr/performance.js` | KPIs per employee |

### 4.6 Finance (10 files)

| # | File | Purpose |
|---|------|---------|
| 69 | `src/modules/fin/ledger.js` | Double-entry ledger |
| 70 | `src/modules/fin/accounts.js` | Chart of accounts |
| 71 | `src/modules/fin/journal.js` | Journal entries |
| 72 | `src/modules/fin/ar.js` | Accounts receivable |
| 73 | `src/modules/fin/ap.js` | Accounts payable |
| 74 | `src/modules/fin/expenses.js` | Expense tracking |
| 75 | `src/modules/fin/budgets.js` | Budget vs actual |
| 76 | `src/modules/fin/tax-reports.js` | Tax reporting (SAT, IRS, AFIP) |
| 77 | `src/modules/fin/banking.js` | Bank reconciliation |
| 78 | `src/modules/fin/forex.js` | Multi-currency FX |

### 4.7 Reports & Analytics (8 files)

| # | File | Purpose |
|---|------|---------|
| 79 | `src/modules/reports/sales.js` | Sales reports |
| 80 | `src/modules/reports/inventory.js` | Inventory reports |
| 81 | `src/modules/reports/customers.js` | Customer reports |
| 82 | `src/modules/reports/staff.js` | Staff performance |
| 83 | `src/modules/reports/financial.js` | P&L, balance sheet |
| 84 | `src/modules/reports/dashboard.js` | KPI dashboard |
| 85 | `src/modules/reports/exports.js` | CSV/XLSX/PDF export |
| 86 | `src/modules/reports/scheduled.js` | Scheduled reports |

### 4.8 Agents Layer (16 files)

| # | File | Purpose |
|---|------|---------|
| 87 | `src/agents/registry.js` | 152-agent registry |
| 88 | `src/agents/router.js` | Agent routing by intent |
| 89 | `src/agents/runner.js` | Agent execution sandbox |
| 90 | `src/agents/memory.js` | Per-agent memory store |
| 91 | `src/agents/tools.js` | Tool calling wrapper |
| 92 | `src/agents/claude.js` | Claude 4.7 adapter |
| 93 | `src/agents/openai.js` | GPT-4o adapter |
| 94 | `src/agents/gemini.js` | Gemini 2.5 adapter |
| 95 | `src/agents/orchestrator.js` | Multi-agent orchestrator |
| 96 | `src/agents/swarm.js` | Swarm coordination |
| 97 | `src/agents/cost-meter.js` | Token cost metering |
| 98 | `src/agents/guardrails.js` | Safety filters |
| 99 | `src/agents/prompts.js` | Prompt templates |
| 100 | `src/agents/lineage.js` | Creation lineage tracking |
| 101 | `src/agents/eval.js` | Agent evaluation harness |
| 102 | `src/agents/marketplace.js` | Agent marketplace |

### 4.9 UI Components (29 files)

| # | File | Purpose |
|---|------|---------|
| 103 | `src/components/vx-button.js` | Button |
| 104 | `src/components/vx-input.js` | Input |
| 105 | `src/components/vx-select.js` | Select |
| 106 | `src/components/vx-modal.js` | Modal |
| 107 | `src/components/vx-drawer.js` | Drawer |
| 108 | `src/components/vx-toast.js` | Toast |
| 109 | `src/components/vx-table.js` | Data table |
| 110 | `src/components/vx-card.js` | Card |
| 111 | `src/components/vx-tabs.js` | Tabs |
| 112 | `src/components/vx-form.js` | Form builder |
| 113 | `src/components/vx-search.js` | Search box |
| 114 | `src/components/vx-keypad.js` | Numeric keypad |
| 115 | `src/components/vx-product-grid.js` | Product grid |
| 116 | `src/components/vx-cart-pane.js` | Cart pane |
| 117 | `src/components/vx-receipt.js` | Receipt preview |
| 118 | `src/components/vx-chart.js` | Chart wrapper |
| 119 | `src/components/vx-kpi.js` | KPI tile |
| 120 | `src/components/vx-calendar.js` | Calendar |
| 121 | `src/components/vx-datepicker.js` | Date picker |
| 122 | `src/components/vx-uploader.js` | File uploader |
| 123 | `src/components/vx-image.js` | Lazy image |
| 124 | `src/components/vx-avatar.js` | Avatar |
| 125 | `src/components/vx-badge.js` | Badge |
| 126 | `src/components/vx-stepper.js` | Stepper |
| 127 | `src/components/vx-wizard.js` | Multi-step wizard |
| 128 | `src/components/vx-chat.js` | Chat panel (agent) |
| 129 | `src/components/vx-cmdk.js` | Command palette |
| 130 | `src/components/vx-tour.js` | Onboarding tour |
| 131 | `src/components/vx-empty.js` | Empty state |

### 4.10 Verticals (25 files)

| # | File | Vertical |
|---|------|----------|
| 132 | `src/verticals/retail.js` | General retail |
| 133 | `src/verticals/grocery.js` | Grocery / supermarket |
| 134 | `src/verticals/restaurant.js` | Full-service restaurant |
| 135 | `src/verticals/qsr.js` | Quick-service / fast food |
| 136 | `src/verticals/cafe.js` | Coffee shop |
| 137 | `src/verticals/bar.js` | Bar / pub |
| 138 | `src/verticals/bakery.js` | Bakery |
| 139 | `src/verticals/pharmacy.js` | Pharmacy |
| 140 | `src/verticals/clothing.js` | Apparel / fashion |
| 141 | `src/verticals/shoes.js` | Footwear |
| 142 | `src/verticals/electronics.js` | Electronics |
| 143 | `src/verticals/hardware.js` | Hardware store |
| 144 | `src/verticals/auto-parts.js` | Auto parts |
| 145 | `src/verticals/salon.js` | Hair salon |
| 146 | `src/verticals/spa.js` | Spa / wellness |
| 147 | `src/verticals/barber.js` | Barber shop |
| 148 | `src/verticals/gym.js` | Gym / fitness |
| 149 | `src/verticals/laundry.js` | Laundry / dry-clean |
| 150 | `src/verticals/petshop.js` | Pet shop |
| 151 | `src/verticals/florist.js` | Florist |
| 152 | `src/verticals/bookstore.js` | Bookstore |
| 153 | `src/verticals/jewelry.js` | Jewelry |
| 154 | `src/verticals/liquor.js` | Liquor store |
| 155 | `src/verticals/cannabis.js` | Cannabis dispensary |
| 156 | `src/verticals/services.js` | Generic services |

### 4.11 Enterprise (8 files)

| # | File | Purpose |
|---|------|---------|
| 157 | `src/enterprise/multi-org.js` | Multi-organization |
| 158 | `src/enterprise/sso.js` | SAML/OIDC SSO |
| 159 | `src/enterprise/audit.js` | Audit log |
| 160 | `src/enterprise/dlp.js` | Data loss prevention |
| 161 | `src/enterprise/rbac-advanced.js` | Custom roles |
| 162 | `src/enterprise/api-keys.js` | API key management |
| 163 | `src/enterprise/webhooks.js` | Outbound webhooks |
| 164 | `src/enterprise/white-label.js` | White-label theming |

### 4.12 Adapters & Utils (10 files)

| # | File | Purpose |
|---|------|---------|
| 165 | `src/adapters/supabase.js` | Supabase client |
| 166 | `src/adapters/stripe.js` | Stripe billing |
| 167 | `src/adapters/twilio.js` | Twilio SMS/voice |
| 168 | `src/adapters/resend.js` | Email |
| 169 | `src/adapters/cloudinary.js` | Image CDN |
| 170 | `src/utils/format.js` | Currency, date format |
| 171 | `src/utils/validate.js` | Validators |
| 172 | `src/utils/crypto.js` | Hash, encrypt |
| 173 | `src/utils/dom.js` | DOM helpers |
| 174 | `src/utils/perf.js` | Perf monitor |

---

## 5. HTML FILES

| # | File | Description |
|---|------|-------------|
| 1 | `public/index.html` | Landing + login redirect |
| 2 | `public/login.html` | Login + magic link |
| 3 | `public/signup.html` | Signup wizard |
| 4 | `public/pos.html` | Main POS terminal |
| 5 | `public/kds.html` | Kitchen display system |
| 6 | `public/cfd.html` | Customer-facing display |
| 7 | `public/admin.html` | Admin console |
| 8 | `public/inventory.html` | Inventory manager |
| 9 | `public/customers.html` | CRM workspace |
| 10 | `public/staff.html` | HR workspace |
| 11 | `public/reports.html` | Reports & analytics |
| 12 | `public/finance.html` | Finance workspace |
| 13 | `public/agents.html` | Agent console |
| 14 | `public/marketplace.html` | Agent marketplace |
| 15 | `public/billing.html` | Plan & billing |
| 16 | `public/onboarding.html` | First-run onboarding |
| 17 | `public/offline.html` | Offline fallback |
| 18 | `public/embed.html` | Embeddable widget |

---

## 6. API ENDPOINTS

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | POST | `/api/auth/login` | Login (email+pass) |
| 2 | POST | `/api/auth/magic` | Magic link |
| 3 | POST | `/api/auth/signup` | Signup |
| 4 | POST | `/api/auth/refresh` | Refresh JWT |
| 5 | POST | `/api/auth/logout` | Logout |
| 6 | GET | `/api/me` | Current user |
| 7 | GET | `/api/orgs` | List orgs |
| 8 | POST | `/api/orgs` | Create org |
| 9 | GET | `/api/products` | List products |
| 10 | POST | `/api/products` | Create product |
| 11 | PUT | `/api/products/:id` | Update product |
| 12 | DELETE | `/api/products/:id` | Delete product |
| 13 | GET | `/api/inventory` | Stock query |
| 14 | POST | `/api/inventory/move` | Stock movement |
| 15 | GET | `/api/customers` | List customers |
| 16 | POST | `/api/customers` | Create customer |
| 17 | GET | `/api/orders` | List orders |
| 18 | POST | `/api/orders` | Create order |
| 19 | POST | `/api/orders/:id/pay` | Pay order |
| 20 | POST | `/api/orders/:id/refund` | Refund |
| 21 | POST | `/api/orders/:id/void` | Void |
| 22 | GET | `/api/reports/sales` | Sales report |
| 23 | GET | `/api/reports/inventory` | Inventory report |
| 24 | GET | `/api/reports/financial` | P&L |
| 25 | GET | `/api/staff` | List staff |
| 26 | POST | `/api/staff/clock` | Clock in/out |
| 27 | GET | `/api/agents` | List agents |
| 28 | POST | `/api/agents/run` | Run agent |
| 29 | GET | `/api/agents/:id/memory` | Agent memory |
| 30 | POST | `/api/agents/marketplace/install` | Install agent |
| 31 | GET | `/api/billing/plan` | Current plan |
| 32 | POST | `/api/billing/checkout` | Stripe checkout |
| 33 | POST | `/api/billing/portal` | Stripe portal |
| 34 | POST | `/api/webhooks/stripe` | Stripe webhook |
| 35 | POST | `/api/webhooks/supabase` | Supabase webhook |
| 36 | GET | `/api/admin/audit` | Audit log |
| 37 | GET | `/api/admin/keys` | API keys |
| 38 | POST | `/api/admin/keys` | Create API key |
| 39 | GET | `/api/exports/:type` | Export job |
| 40 | POST | `/api/imports/csv` | CSV import |
| 41 | GET | `/api/health` | Health check |
| 42 | GET | `/api/version` | Version info |
| 43 | POST | `/api/feedback` | User feedback |

---

## 7. AGENTS REGISTRY (152)

> Each entry: `id` -> `name` -> created-by lineage.

### 7.1 Sales Agents (1-20)

| ID | Name | Created By |
|----|------|------------|
| 1 | sales-coach | Claude 4.7 |
| 2 | upsell-suggester | Claude 4.7 |
| 3 | cross-sell-bot | GPT-4o |
| 4 | discount-advisor | Claude 4.7 |
| 5 | bundle-builder | Gemini 2.5 |
| 6 | price-optimizer | Claude 4.7 |
| 7 | quote-generator | GPT-4o |
| 8 | lead-qualifier | Claude 4.7 |
| 9 | follow-up-bot | Claude 4.7 |
| 10 | abandoned-cart | GPT-4o |
| 11 | win-back-agent | Claude 4.7 |
| 12 | referral-bot | Gemini 2.5 |
| 13 | objection-handler | Claude 4.7 |
| 14 | demo-scheduler | GPT-4o |
| 15 | proposal-writer | Claude 4.7 |
| 16 | negotiation-coach | Claude 4.7 |
| 17 | closing-assistant | GPT-4o |
| 18 | territory-planner | Claude 4.7 |
| 19 | quota-tracker | Gemini 2.5 |
| 20 | pipeline-cleaner | Claude 4.7 |

### 7.2 Inventory Agents (21-40)

| ID | Name | Created By |
|----|------|------------|
| 21 | reorder-bot | Claude 4.7 |
| 22 | stockout-predictor | Claude 4.7 |
| 23 | demand-forecaster | Gemini 2.5 |
| 24 | abc-analyzer | Claude 4.7 |
| 25 | dead-stock-finder | GPT-4o |
| 26 | shrinkage-detector | Claude 4.7 |
| 27 | supplier-scorer | Claude 4.7 |
| 28 | po-generator | GPT-4o |
| 29 | receiving-validator | Claude 4.7 |
| 30 | cycle-count-planner | Gemini 2.5 |
| 31 | sku-optimizer | Claude 4.7 |
| 32 | catalog-cleaner | Claude 4.7 |
| 33 | image-tagger | Gemini 2.5 |
| 34 | barcode-fixer | GPT-4o |
| 35 | category-mapper | Claude 4.7 |
| 36 | warehouse-router | Claude 4.7 |
| 37 | transfer-optimizer | Claude 4.7 |
| 38 | margin-watcher | GPT-4o |
| 39 | seasonality-analyzer | Gemini 2.5 |
| 40 | new-product-launcher | Claude 4.7 |

### 7.3 Customer Agents (41-60)

| ID | Name | Created By |
|----|------|------------|
| 41 | support-chat | Claude 4.7 |
| 42 | nps-analyzer | Claude 4.7 |
| 43 | review-responder | GPT-4o |
| 44 | complaint-triager | Claude 4.7 |
| 45 | refund-evaluator | Claude 4.7 |
| 46 | loyalty-personalizer | Gemini 2.5 |
| 47 | birthday-bot | GPT-4o |
| 48 | rfm-segmenter | Claude 4.7 |
| 49 | churn-predictor | Claude 4.7 |
| 50 | reactivation-bot | Claude 4.7 |
| 51 | survey-creator | GPT-4o |
| 52 | ticket-router | Claude 4.7 |
| 53 | sentiment-analyzer | Gemini 2.5 |
| 54 | escalation-detector | Claude 4.7 |
| 55 | faq-bot | Claude 4.7 |
| 56 | onboarding-guide | Claude 4.7 |
| 57 | upsell-mailer | GPT-4o |
| 58 | testimonial-collector | Claude 4.7 |
| 59 | community-moderator | Gemini 2.5 |
| 60 | clienteling-assistant | Claude 4.7 |

### 7.4 Staff Agents (61-75)

| ID | Name | Created By |
|----|------|------------|
| 61 | scheduler-optimizer | Claude 4.7 |
| 62 | shift-swap-bot | GPT-4o |
| 63 | timecard-auditor | Claude 4.7 |
| 64 | training-recommender | Claude 4.7 |
| 65 | performance-coach | Claude 4.7 |
| 66 | commission-calculator | GPT-4o |
| 67 | hire-screener | Claude 4.7 |
| 68 | interview-scheduler | Gemini 2.5 |
| 69 | onboarding-checklist | Claude 4.7 |
| 70 | policy-bot | Claude 4.7 |
| 71 | payroll-validator | GPT-4o |
| 72 | leave-tracker | Claude 4.7 |
| 73 | compliance-monitor | Claude 4.7 |
| 74 | tip-distributor | Gemini 2.5 |
| 75 | recognition-bot | Claude 4.7 |

### 7.5 Finance Agents (76-95)

| ID | Name | Created By |
|----|------|------------|
| 76 | bookkeeper | Claude 4.7 |
| 77 | reconciler | Claude 4.7 |
| 78 | tax-filer | Claude 4.7 |
| 79 | invoice-generator | GPT-4o |
| 80 | expense-categorizer | Claude 4.7 |
| 81 | budget-watcher | Gemini 2.5 |
| 82 | cashflow-forecaster | Claude 4.7 |
| 83 | fraud-detector | Claude 4.7 |
| 84 | chargeback-defender | GPT-4o |
| 85 | invoice-collector | Claude 4.7 |
| 86 | vendor-payer | Claude 4.7 |
| 87 | currency-hedger | Gemini 2.5 |
| 88 | margin-analyzer | Claude 4.7 |
| 89 | cost-cutter | Claude 4.7 |
| 90 | audit-prep | GPT-4o |
| 91 | compliance-reporter | Claude 4.7 |
| 92 | sat-cfdi-bot | Claude 4.7 |
| 93 | irs-filer | Gemini 2.5 |
| 94 | afip-bot | Claude 4.7 |
| 95 | bank-feed-importer | Claude 4.7 |

### 7.6 Marketing Agents (96-115)

| ID | Name | Created By |
|----|------|------------|
| 96 | campaign-planner | Claude 4.7 |
| 97 | email-writer | Claude 4.7 |
| 98 | sms-writer | GPT-4o |
| 99 | whatsapp-templater | Claude 4.7 |
| 100 | social-poster | Gemini 2.5 |
| 101 | ad-copywriter | Claude 4.7 |
| 102 | seo-optimizer | Claude 4.7 |
| 103 | blog-writer | GPT-4o |
| 104 | newsletter-builder | Claude 4.7 |
| 105 | influencer-finder | Gemini 2.5 |
| 106 | promo-designer | Claude 4.7 |
| 107 | abtest-runner | Claude 4.7 |
| 108 | landing-builder | GPT-4o |
| 109 | analytics-summarizer | Claude 4.7 |
| 110 | brand-monitor | Gemini 2.5 |
| 111 | review-aggregator | Claude 4.7 |
| 112 | press-release | Claude 4.7 |
| 113 | event-promoter | GPT-4o |
| 114 | retargeting-bot | Claude 4.7 |
| 115 | utm-tagger | Claude 4.7 |

### 7.7 Operations Agents (116-135)

| ID | Name | Created By |
|----|------|------------|
| 116 | open-checklist | Claude 4.7 |
| 117 | close-checklist | Claude 4.7 |
| 118 | maintenance-scheduler | GPT-4o |
| 119 | equipment-monitor | Gemini 2.5 |
| 120 | health-inspector | Claude 4.7 |
| 121 | safety-auditor | Claude 4.7 |
| 122 | recipe-coster | Claude 4.7 |
| 123 | menu-engineer | GPT-4o |
| 124 | waste-tracker | Claude 4.7 |
| 125 | energy-saver | Gemini 2.5 |
| 126 | delivery-router | Claude 4.7 |
| 127 | dispatch-optimizer | Claude 4.7 |
| 128 | queue-manager | GPT-4o |
| 129 | reservation-bot | Claude 4.7 |
| 130 | table-optimizer | Claude 4.7 |
| 131 | kitchen-load-balancer | Gemini 2.5 |
| 132 | inventory-receiver | Claude 4.7 |
| 133 | shift-handoff | Claude 4.7 |
| 134 | incident-logger | GPT-4o |
| 135 | compliance-checklist | Claude 4.7 |

### 7.8 Platform Agents (136-152)

| ID | Name | Created By |
|----|------|------------|
| 136 | onboarding-coach | Claude 4.7 |
| 137 | data-importer | Claude 4.7 |
| 138 | data-cleaner | GPT-4o |
| 139 | duplicate-merger | Claude 4.7 |
| 140 | report-builder | Claude 4.7 |
| 141 | dashboard-designer | Gemini 2.5 |
| 142 | rule-engine | Claude 4.7 |
| 143 | workflow-builder | Claude 4.7 |
| 144 | integration-wizard | GPT-4o |
| 145 | api-key-rotator | Claude 4.7 |
| 146 | backup-runner | Claude 4.7 |
| 147 | restore-helper | Gemini 2.5 |
| 148 | migration-bot | Claude 4.7 |
| 149 | docs-explainer | Claude 4.7 |
| 150 | release-notes-writer | GPT-4o |
| 151 | telemetry-analyzer | Claude 4.7 |
| 152 | meta-orchestrator | Claude 4.7 |

---

## 8. POS VERTICALS (25)

| # | Vertical | Key Features |
|---|----------|--------------|
| 1 | Retail | SKUs, variants, barcodes, layaway |
| 2 | Grocery | Scale items, EBT, mix-and-match |
| 3 | Restaurant | Tables, courses, modifiers, KDS |
| 4 | QSR | Combo meals, drive-thru, quick keys |
| 5 | Cafe | Modifiers, milk choices, loyalty stamps |
| 6 | Bar | Tabs, age verification, pour cost |
| 7 | Bakery | Custom orders, deposits, decoration |
| 8 | Pharmacy | Rx integration, controlled substances |
| 9 | Clothing | Size matrix, fitting room, alterations |
| 10 | Shoes | Half-sizes, width, in-store pickup |
| 11 | Electronics | Serial numbers, warranties, trade-in |
| 12 | Hardware | Bulk, contractor pricing, rentals |
| 13 | Auto Parts | Vehicle lookup, cores, fitment |
| 14 | Salon | Appointments, stylists, products |
| 15 | Spa | Multi-service bookings, packages |
| 16 | Barber | Walk-ins, stylist queues, tips |
| 17 | Gym | Memberships, class booking, access |
| 18 | Laundry | Tickets, garment tags, claims |
| 19 | Pet Shop | Pet profiles, prescription food |
| 20 | Florist | Delivery, occasion templates, cards |
| 21 | Bookstore | ISBN lookup, special orders |
| 22 | Jewelry | Appraisal, repair, layaway, serial |
| 23 | Liquor | Age check, license limits, vintage |
| 24 | Cannabis | METRC, limits, ID scan, state tax |
| 25 | Services | Quotes, work orders, recurring |

---

## 9. UI COMPONENTS (29)

```
vx-button       vx-input        vx-select       vx-modal
vx-drawer       vx-toast        vx-table        vx-card
vx-tabs         vx-form         vx-search       vx-keypad
vx-product-grid vx-cart-pane    vx-receipt      vx-chart
vx-kpi          vx-calendar     vx-datepicker   vx-uploader
vx-image        vx-avatar       vx-badge        vx-stepper
vx-wizard       vx-chat         vx-cmdk         vx-tour
vx-empty
```

All components are framework-agnostic Web Components (Custom Elements + Shadow DOM).

---

## 10. ENTERPRISE MODULES

| Module | Capability |
|--------|-----------|
| Multi-Org | Manage multiple legal entities under one account |
| SSO | SAML 2.0 + OIDC (Okta, Azure AD, Google Workspace) |
| Audit Log | Immutable append-only log, exportable |
| DLP | PII detection + masking |
| Advanced RBAC | Custom roles, attribute-based access |
| API Keys | Scoped tokens with rate limits |
| Webhooks | Outbound events, retries, signing |
| White-Label | Custom domain, branding, emails |

---

## 11. PRICING TIERS

| Tier | Monthly | Users | Locations | Agents | Features |
|------|---------|-------|-----------|--------|----------|
| Free | $0 | 1 | 1 | 3 | Basic POS, 100 tx/mo |
| Starter | $29 | 3 | 1 | 10 | Full POS, inventory, CRM |
| Pro | $79 | 10 | 3 | 40 | + Reports, loyalty, KDS |
| Business | $199 | 50 | 10 | 100 | + Multi-location, payroll, API |
| Enterprise | Custom | Unlimited | Unlimited | 152 | + SSO, SLA, white-label, all 152 agents |

---

## 12. DEPENDENCIES

### Runtime
- `@supabase/supabase-js` — DB + Auth
- `stripe` — Billing
- `@anthropic-ai/sdk` — Claude
- `openai` — GPT-4o
- `@google/generative-ai` — Gemini
- `twilio` — SMS
- `resend` — Email
- `escpos` — Thermal printers
- `zod` — Validation
- `date-fns` — Dates

### Build / Dev
- `vite` — Bundler
- `vitest` — Tests
- `playwright` — E2E
- `eslint` + `prettier`
- `typescript` (types only)

---

## 13. DATA FLOW

```
[Customer] -> [POS UI] -> [Cart Module] -> [Payment Adapter]
                                                  |
                                                  v
                               [Stripe / MP / Cash Drawer]
                                                  |
                                                  v
[Receipt Printer] <- [Receipt Builder] <- [Order API] -> [Supabase]
                                                  |
                                                  v
                                       [Realtime Channel] -> [KDS / CFD]
                                                  |
                                                  v
                                          [Audit Log] + [Analytics]
```

### Offline Path

```
[POS UI] -> [Offline Queue (IndexedDB)] -> [Sync Worker]
                                                |
                                                v
                                  When online -> [API] -> [Supabase]
                                                |
                                                v
                                  [Conflict Resolver] -> [UI Update]
```

---

## 14. DEPLOYMENT

```
GitHub main -> Vercel build -> Edge deploy (global)
                  |
                  +-> Run migrations against Supabase
                  +-> Invalidate CDN
                  +-> Notify Sentry of release
                  +-> Smoke tests (Playwright headless)
```

### Environments
- `dev.volvix.app` — preview branches
- `staging.volvix.app` — pre-prod
- `app.volvix.app` — production
- `eu.volvix.app` — EU data residency

### SLAs
- Uptime: 99.9% (Pro), 99.95% (Enterprise)
- RPO: 5 min (PITR)
- RTO: 1 hour

---

## APPENDIX A — ENV VARS

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
ANTHROPIC_API_KEY
OPENAI_API_KEY
GEMINI_API_KEY
TWILIO_SID
TWILIO_TOKEN
RESEND_API_KEY
SENTRY_DSN
JWT_SECRET
ENCRYPTION_KEY
```

## APPENDIX B — DATABASE TABLES (core 30)

```
organizations    locations        users           roles
products         variants         categories      stock
movements        suppliers        purchase_orders po_lines
customers        loyalty_points   campaigns       segments
employees        shifts           timecards       payroll_runs
orders           order_lines      payments        refunds
invoices         expenses         journal_entries accounts
agents           agent_runs       audit_log       api_keys
```

## APPENDIX C — EVENT TYPES (bus)

```
order.created    order.paid      order.refunded   order.voided
stock.low        stock.out       stock.adjusted   po.received
customer.created customer.churn  loyalty.redeemed
shift.opened     shift.closed    timecard.punched
agent.started    agent.completed agent.failed
billing.upgraded billing.downgraded billing.failed
auth.login       auth.logout     auth.failed
```

## APPENDIX D — KEYBOARD SHORTCUTS (POS)

```
F1   Help                F2   New sale
F3   Find product        F4   Customer
F5   Discount            F6   Tax exempt
F7   Hold                F8   Recall
F9   Pay cash            F10  Pay card
F11  Split tender        F12  Z-Report
Ctrl+K  Command palette  Ctrl+/ Search
Esc  Cancel              Enter  Confirm
```

## APPENDIX E — VERSION HISTORY

- 3.4.0 GODMODE — 152 agents, 25 verticals (current)
- 3.3.0 — 100 agents, multi-org
- 3.2.0 — Marketplace launch
- 3.1.0 — Offline-first
- 3.0.0 — Vanilla JS rewrite

---

## APPENDIX F — RLS POLICIES (summary)

| Table | Policy |
|-------|--------|
| organizations | user must be member |
| products | org_id = current_org() |
| orders | org_id = current_org() AND (role >= cashier) |
| payments | org_id = current_org() AND role IN (cashier,manager,admin) |
| audit_log | role IN (admin,owner) — read-only |
| api_keys | role = owner |
| employees | org_id = current_org() AND (role IN (manager,admin) OR id = auth.uid()) |
| journal_entries | role IN (accountant,admin,owner) |

## APPENDIX G — INTEGRATIONS MATRIX

| Integration | Type | Tier required | Module |
|-------------|------|---------------|--------|
| Stripe | Payments | Starter | payment-stripe.js |
| MercadoPago | Payments | Starter | payment-mp.js |
| Coinbase | Crypto | Pro | payment-crypto.js |
| QuickBooks | Accounting | Pro | fin/banking.js |
| Xero | Accounting | Pro | fin/banking.js |
| Shopify | E-commerce | Business | adapters/shopify.js |
| WooCommerce | E-commerce | Business | adapters/woo.js |
| Mailchimp | Email | Pro | crm/email.js |
| Klaviyo | Email | Business | crm/email.js |
| Twilio | SMS | Starter | adapters/twilio.js |
| WhatsApp Cloud | Messaging | Pro | crm/whatsapp.js |
| Zapier | Automation | Pro | enterprise/webhooks.js |
| Slack | Notifications | Pro | enterprise/webhooks.js |
| Okta | SSO | Enterprise | enterprise/sso.js |
| Azure AD | SSO | Enterprise | enterprise/sso.js |
| Google Workspace | SSO | Enterprise | enterprise/sso.js |
| METRC | Cannabis compliance | Enterprise | verticals/cannabis.js |
| SAT (MX) | Tax | Pro | fin/tax-reports.js |
| AFIP (AR) | Tax | Pro | fin/tax-reports.js |
| IRS (US) | Tax | Pro | fin/tax-reports.js |
| Avalara | Tax engine | Business | pos/tax.js |
| TaxJar | Tax engine | Business | pos/tax.js |
| Square Reader | Hardware | Starter | payment-card.js |
| Stripe Terminal | Hardware | Starter | payment-stripe.js |
| Verifone | Hardware | Business | payment-card.js |
| Ingenico | Hardware | Business | payment-card.js |
| Star Micronics | Printer | Starter | printer-escpos.js |
| Epson TM | Printer | Starter | printer-escpos.js |
| Zebra | Label printer | Pro | inv/labels.js |
| Brother QL | Label printer | Pro | inv/labels.js |

## APPENDIX H — PERFORMANCE TARGETS

| Metric | Target |
|--------|--------|
| First contentful paint | < 1.2s |
| Time to interactive | < 2.5s |
| POS scan-to-confirm | < 200ms |
| Offline queue flush | < 5s for 100 tx |
| API p50 latency | < 80ms |
| API p99 latency | < 500ms |
| DB p99 query | < 100ms |
| Realtime fan-out | < 250ms |
| Receipt print | < 1.5s |
| Card auth p50 | < 2s |
| Report generation (10k rows) | < 3s |
| Bundle size (gzipped) | < 280KB |
| Lighthouse perf score | > 90 |
| Memory steady-state | < 120MB |

## APPENDIX I — TESTING MATRIX

| Layer | Tool | Count |
|-------|------|-------|
| Unit | Vitest | 1,840 tests |
| Integration | Vitest + msw | 420 tests |
| E2E | Playwright | 180 scenarios |
| Visual | Playwright snapshots | 320 snapshots |
| Load | k6 | 12 scripts |
| Security | OWASP ZAP | nightly |
| Accessibility | axe-core | 100% pages |

## APPENDIX J — SECURITY CONTROLS

- TLS 1.3 enforced; HSTS preload.
- All secrets in Vercel env / Supabase Vault — never in repo.
- JWT rotation: access 15min, refresh 7d, invalidation on password change.
- Rate limit: 100 req/min per key (Free), 1000/min (Pro), 10k/min (Enterprise).
- WAF rules at Vercel edge: SQLi, XSS, RCE patterns.
- CSP: strict, nonce-based, no inline scripts.
- CSRF: double-submit cookies on all POST.
- PII encryption-at-rest via Supabase Vault (pgsodium).
- Card data: never stored — Stripe / MP tokens only.
- PCI-DSS SAQ-A scope.
- SOC2 Type II in progress (Q3 2026).
- GDPR: DPA available, EU residency on `eu.volvix.app`.
- Annual third-party pen-test.
- Bug bounty program at HackerOne.

## APPENDIX K — OBSERVABILITY

| Signal | Tool |
|--------|------|
| Errors | Sentry |
| Logs | Logtail |
| Metrics | Grafana Cloud |
| Traces | OpenTelemetry -> Honeycomb |
| Uptime | BetterStack |
| Real user monitoring | Sentry RUM |
| Synthetic checks | Checkly |
| Alerts | PagerDuty |

## APPENDIX L — FEATURE FLAGS

```
ff.kds_v2          ff.cfd_promos       ff.crypto_pay
ff.agent_swarm     ff.marketplace_v2   ff.white_label
ff.eu_residency    ff.cannabis_metrc   ff.gemini_routing
ff.offline_v3      ff.realtime_kds     ff.ai_forecast
ff.split_tender_v2 ff.giftcard_v2      ff.loyalty_tiers_v3
```

## APPENDIX M — RELEASE CADENCE

- Patch: weekly Tuesdays.
- Minor: monthly first Wednesday.
- Major: quarterly.
- Hotfix: any time, < 30min from PR to prod for SEV1.

## APPENDIX N — SUPPORT TIERS

| Tier | Channels | SLA first response |
|------|----------|--------------------|
| Free | Docs, community | best-effort |
| Starter | Email | 24h |
| Pro | Email, chat | 8h |
| Business | Email, chat, phone | 4h |
| Enterprise | Dedicated CSM, Slack Connect, phone | 1h (SEV1: 15min) |

## APPENDIX O — ROADMAP (2026)

- Q2: Realtime KDS v3, METRC live in 4 more states.
- Q3: SOC2 Type II, AI menu engineering for restaurants.
- Q4: Native iOS / Android wrappers, NFC tap-to-pay everywhere.
- 2027: Voice POS via Claude, agent marketplace revenue share.

---

## APPENDIX P — GLOSSARY

- **CFD** — Customer Facing Display.
- **KDS** — Kitchen Display System.
- **RLS** — Row-Level Security.
- **RFM** — Recency, Frequency, Monetary segmentation.
- **PITR** — Point-In-Time Recovery.
- **METRC** — Cannabis seed-to-sale tracking.
- **CFDI** — Mexican electronic invoice.
- **GODMODE** — Volvix internal name for the all-features-enabled tier.

---

*End of VOLVIX_SYSTEM_MAP.md — generated 2026-04-26 — v3.4.0 GODMODE.*
