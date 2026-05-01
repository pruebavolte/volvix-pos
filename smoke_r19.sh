#!/bin/bash
TOKEN="$1"
BASE="https://salvadorexoficial.com"
ENDPOINTS=(
"/api/health"
"/api/login"
"/api/products"
"/api/sales"
"/api/customers"
"/api/cash/current"
"/api/cash/history"
"/api/loyalty/customers/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
"/api/loyalty/tiers"
"/api/billing/plans"
"/api/billing/subscription"
"/api/currencies"
"/api/fx/rates"
"/api/mfa/setup"
"/api/inventory/locations"
"/api/inventory/stock"
"/api/audit-log"
"/api/webhooks"
"/api/payments/wallets/config"
"/api/ml/inventory/forecast"
"/api/warehouses"
"/api/promotions"
"/api/appointments"
"/api/services"
"/api/reviews"
"/api/gift-cards"
"/api/tips/by-staff"
"/api/bundles"
"/api/segments"
"/api/fraud/alerts"
"/api/customer-subscriptions"
"/api/employees"
"/api/payroll/periods"
"/api/hr/attendance"
"/api/crm/leads"
"/api/marketplace/vendors"
"/api/integrations/square/status"
"/api/integrations/shopify/sync-orders"
"/api/admin/backup/list"
"/api/accounting/journal"
"/api/accounting/balance-sheet"
"/api/nft/collections"
"/api/kds/tickets/active"
)

for ep in "${ENDPOINTS[@]}"; do
  start=$(date +%s%N)
  if [ "$ep" = "/api/login" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE$ep" -H "Content-Type: application/json" -d '{"email":"admin@volvix.test","password":"Volvix2026!"}')
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$ep" -H "Authorization: Bearer $TOKEN")
  fi
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))
  echo "$code|$ms|$ep"
done
