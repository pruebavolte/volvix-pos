#!/bin/bash
# ============================================================
# VOLVIX · Production Testing Script
# Prueba automática de los 3 usuarios en Vercel
# ============================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Config
BASE_URL="${1:-https://volvix-saas.vercel.app}"
API_URL="$BASE_URL/api/login"

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  VOLVIX POS v7.0.0 — PRODUCTION TESTS${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "Testing: ${YELLOW}$BASE_URL${NC}\n"

# Test data
# Password se lee desde env var TEST_USER_PASSWORD (sin default).
: "${TEST_USER_PASSWORD:?ERROR: exporta TEST_USER_PASSWORD antes de ejecutar este script}"
USERS=(
  "admin@volvix.test|${TEST_USER_PASSWORD}|superadmin|Abarrotes Don Chucho"
  "owner@volvix.test|${TEST_USER_PASSWORD}|owner|Restaurante Los Compadres"
  "cajero@volvix.test|${TEST_USER_PASSWORD}|cajero|Abarrotes Don Chucho"
)

PASSED=0
FAILED=0

# ============================================================
# Test 1: Health Check
# ============================================================
echo -e "${YELLOW}[1/4] Health Check${NC}"
if curl -s "$BASE_URL/api/health" | grep -q '"ok":true'; then
  echo -e "${GREEN}✓ Server is up and responding${NC}\n"
  ((PASSED++))
else
  echo -e "${RED}✗ Server health check failed${NC}\n"
  ((FAILED++))
fi

# ============================================================
# Test 2-4: Login Tests
# ============================================================
for i in "${!USERS[@]}"; do
  IFS='|' read -r email password role expected_tenant <<< "${USERS[$i]}"
  test_num=$((i + 2))

  echo -e "${YELLOW}[$test_num/4] Testing $email (role: $role)${NC}"

  # Make request
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}")

  # Check response
  if echo "$response" | grep -q '"ok":true'; then
    # Verify role
    if echo "$response" | grep -q "\"role\":\"$role\""; then
      # Verify tenant
      if echo "$response" | grep -q "$expected_tenant"; then
        echo -e "${GREEN}✓ Login successful${NC}"
        echo -e "${GREEN}  Role: $role${NC}"
        echo -e "${GREEN}  Tenant: $expected_tenant${NC}"
        ((PASSED++))
      else
        echo -e "${RED}✗ Tenant mismatch${NC}"
        ((FAILED++))
      fi
    else
      echo -e "${RED}✗ Role mismatch${NC}"
      ((FAILED++))
    fi
  else
    echo -e "${RED}✗ Login failed${NC}"
    echo -e "${RED}  Response: $response${NC}"
    ((FAILED++))
  fi
  echo ""
done

# ============================================================
# Summary
# ============================================================
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED - READY FOR PRODUCTION${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED - REVIEW ABOVE${NC}"
  exit 1
fi
