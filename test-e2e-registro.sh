#!/bin/bash

# Test E2E del flujo de registro
# Uso: bash test-e2e-registro.sh [URL_BASE]

URL_BASE="${1:-http://localhost:3000}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== TEST E2E: FLUJO DE REGISTRO ===${NC}\n"

# Test data
TEST_EMAIL="claude-test-$(date +%s)@volvix.test"
TEST_TELEFONO="+52 5551234567"
TEST_NOMBRE="Café Test Claude"
TEST_GIRO="cafeteria"

echo -e "📋 Datos de prueba:"
echo "   Email: $TEST_EMAIL"
echo "   Teléfono: $TEST_TELEFONO"
echo "   Negocio: $TEST_NOMBRE"
echo "   Giro: $TEST_GIRO"
echo ""

# PASO 1: Enviar OTP
echo -e "${YELLOW}[PASO 1]${NC} Enviar OTP..."

SEND_OTP_RESPONSE=$(curl -s -X POST "$URL_BASE/api/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"telefono\": \"$TEST_TELEFONO\",
    \"nombre_negocio\": \"$TEST_NOMBRE\",
    \"giro\": \"$TEST_GIRO\"
  }")

echo "Respuesta: $SEND_OTP_RESPONSE"

# Extraer el OTP (solo en desarrollo)
OTP=$(echo "$SEND_OTP_RESPONSE" | grep -o '"otp_dev":"[^"]*' | cut -d'"' -f4)

if [ -z "$OTP" ]; then
  echo -e "${RED}❌ Error: No se recibió OTP${NC}"
  echo "Asegúrate de tener configuradas las variables:"
  echo "  - RESEND_API_KEY (para email)"
  echo "  - TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (para WhatsApp)"
  exit 1
fi

echo -e "${GREEN}✅ OTP recibido: $OTP${NC}\n"

# PASO 2: Verificar OTP
echo -e "${YELLOW}[PASO 2]${NC} Verificar OTP..."

VERIFY_OTP_RESPONSE=$(curl -s -X POST "$URL_BASE/api/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"telefono\": \"$TEST_TELEFONO\",
    \"otp_code\": \"$OTP\",
    \"nombre_negocio\": \"$TEST_NOMBRE\",
    \"giro\": \"$TEST_GIRO\"
  }")

echo "Respuesta: $VERIFY_OTP_RESPONSE"

# Extraer tenant_id
TENANT_ID=$(echo "$VERIFY_OTP_RESPONSE" | grep -o '"tenant_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$TENANT_ID" ]; then
  echo -e "${RED}❌ Error: No se creó el tenant${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Tenant creado: $TENANT_ID${NC}\n"

# PASO 3: Verificar que el tenant tiene productos
echo -e "${YELLOW}[PASO 3]${NC} Verificar bootstrap de productos..."

# Nota: Requiere auth token válido. Para desarrollo, saltamos este paso.
echo -e "${YELLOW}⚠️  Para verificar productos, necesitas:${NC}"
echo "   1. Loguearme con el usuario creado"
echo "   2. Obtener un JWT válido"
echo "   3. Consultar /api/productos?tenant_id=$TENANT_ID"
echo ""

# Resumen final
echo -e "${GREEN}=== TEST COMPLETADO EXITOSAMENTE ===${NC}"
echo ""
echo "📊 Resumen:"
echo "   ✅ OTP enviado correctamente"
echo "   ✅ OTP verificado correctamente"
echo "   ✅ Tenant creado: $TENANT_ID"
echo "   ✅ Email: $TEST_EMAIL"
echo ""
echo "🎯 Próximos pasos:"
echo "   1. Ejecuta en el navegador: $URL_BASE/registro.html"
echo "   2. Ingresa los mismos datos de prueba"
echo "   3. Deberías recibir el código OTP en email/WhatsApp"
echo "   4. Completa el flujo"
