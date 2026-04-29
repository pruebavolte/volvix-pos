# Setup: Sistema de Registro y Onboarding

## 📋 Pasos para activar el sistema completo

### 1. **Crear la migración SQL en Supabase**
   - Ve a [Supabase Dashboard](https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new)
   - Copia todo el contenido de `db/R15_REGISTRATION.sql`
   - Ejecuta la migración

   **Tablas creadas:**
   - `pos_users` — Registro de nuevos clientes con OTP
   - `pos_products_demo` — Catálogo demo por giro (cafeteria, barbería, etc.)

### 2. **Configurar variables de entorno**
   
   Agrega a tu `.env`:

   ```bash
   # Email OTP (Resend)
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

   # WhatsApp OTP (Twilio)
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Sandbox (cambiar cuando apruebes produción)
   ```

   **Cómo obtener las keys:**

   - **Resend:**
     1. Ve a https://resend.com/dashboard/api-keys
     2. Crea una API Key
     3. Copia en `.env`

   - **Twilio:**
     1. Ve a https://console.twilio.com
     2. Account → Account SID (en dashboard)
     3. Account → API Keys → crear key → copiar SID + token
     4. Usa el sandbox number por ahora (whatsapp:+14155238886)
     5. Agrega tu teléfono al sandbox: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn

### 3. **Instalar dependencias**
   ```bash
   npm install
   ```

### 4. **Ejecutar el servidor**
   ```bash
   npm start
   # o en desarrollo:
   node server.js
   ```

### 5. **Probar el flujo completo**
   - Abre http://localhost:3000/registro.html
   - Llena los datos del negocio
   - Recibe OTP en email (Resend) y/o WhatsApp (Twilio)
   - Ingresa el código OTP
   - ¡Listo! Tenant creado con productos demo

---

## 🔧 Cómo funcionan los 3 bugs arreglados

### BUG-T1 (P0): Phone Duplicate — ERROR SQL CRUDO ✅ ARREGLADO
**Antes:**
```
Error: code:23505, duplicate key violates pos_users_phone_key
```

**Ahora:**
```
Error: "Este teléfono ya está registrado, intenta otro o haz login"
```

**Dónde:** `/api/auth/send-otp` — línea `if (existingUser)` valida duplicados antes de intentar insertar.

---

### BUG-T2 (P0): Bootstrap — CARGA TODOS LOS GIROS ✅ ARREGLADO
**Antes:**
```
Tenant café → recibe [Aceite Barba, Aceite Mobil, Corte Cabello, ...]
(todo el catálogo sin filtrar)
```

**Ahora:**
```
Tenant café → recibe [Café Americano]
(solo productos cuyo giro = "cafeteria")
```

**Dónde:** `/api/auth/verify-otp` — Query a `pos_products_demo` filtra por `.eq('giro', giro)`.

---

### BUG-T3 (P1): Bootstrap — PRODUCTOS DUPLICADOS x3-x4 ✅ ARREGLADO
**Antes:**
```
Café Americano × 3
Café Americano × 4 (sin ON CONFLICT)
```

**Ahora:**
```
Café Americano × 1
(cada producto se inserta exactamente 1 vez)
```

**Dónde:** `/api/auth/verify-otp` — `pos_products_demo` tiene `group by` en la query para evitar duplicados.

---

## 📝 Estructura de datos

### `pos_users`
```sql
id uuid
email text unique
telefono text unique (pos_users_phone_key)
nombre_negocio text
giro text
password_hash text nullable
otp_code text nullable
otp_expires_at timestamptz nullable
otp_verified_at timestamptz nullable
auth_user_id uuid (references auth.users)
tenant_id uuid (references volvix_tenants)
ip_address text
user_agent text
created_at timestamptz
updated_at timestamptz
```

### `pos_products_demo`
```sql
id uuid
giro text (cafeteria, barberia, taller, restaurante, etc.)
nombre text
precio numeric
costo numeric
stock integer
categoria text
imagen_url text nullable
created_at timestamptz
```

---

## 🔐 Seguridad

- ✅ OTP se genera aleatoriamente (6 dígitos)
- ✅ OTP expira en 5 minutos
- ✅ Máximo 3 intentos fallidos → bloquea
- ✅ Hash de teléfono evita duplicados via UNIQUE constraint
- ✅ Error messages genéricos (sin exponer SQL)
- ✅ RLS habilitado en `pos_users`
- ✅ Resend API Key nunca se expone al cliente
- ✅ Twilio Token nunca se expone al cliente

---

## 🧪 Prueba local (sin Resend/Twilio)

En desarrollo, los códigos OTP se imprimen en la respuesta (`otp_dev` field):

```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "telefono": "+52 555 123 4567",
    "nombre_negocio": "Mi Café",
    "giro": "cafeteria"
  }'

# Respuesta (dev):
# {
#   "ok": true,
#   "otp_dev": "123456"  ← Copiar este código
# }
```

---

## 📞 Contacto & Soporte

- Email: support@volvix.mx (configurar en Resend)
- WhatsApp: Tu número Twilio
