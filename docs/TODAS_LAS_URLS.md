# 🌐 TODAS LAS URLs Y SISTEMAS - Volvix POS

## 📊 Resumen Ejecutivo

| Categoría | Cantidad | Estado |
|-----------|----------|--------|
| Páginas públicas (HTML) | 60+ | ✅ Activas |
| Endpoints de API | 25+ | ✅ Activos |
| Landings por giro | 43 | ✅ Generadas |
| Sistemas POS | 6 | ✅ Implementados |
| Sistema de autenticación | 2 endpoints | ✅ Implementados |

---

## 🏠 PÁGINAS PRINCIPALES

### Acceso Público

| URL | Descripción | Status |
|-----|-------------|--------|
| `/` | Landing principal | ✅ |
| `/login.html` | Login usuario/owner | ✅ |
| `/registro.html` | Wizard 4 pasos (NUEVO) | ✅ |
| `/offline.html` | Página offline (PWA) | ✅ |

### Dashboards Internos

| URL | Descripción | Rol | Status |
|-----|-------------|-----|--------|
| `/pos.html` | POS principal (ventas) | cajero, owner | ✅ |
| `/pos-inventario.html` | Gestión inventario | supervisor, owner | ✅ |
| `/pos-clientes.html` | CRM clientes | supervisor, owner | ✅ |
| `/pos-corte.html` | Corte de caja | admin, owner | ✅ |
| `/pos-reportes.html` | Reportes y analytics | supervisor, owner | ✅ |
| `/pos-config.html` | Configuración tenant | admin, owner | ✅ |
| `/owner.html` | Panel owner legacy | owner | ✅ |
| `/volvix_owner_panel_v7.html` | Panel owner v7 | owner | ✅ |
| `/ai.html` | Motor IA auto-evolución | admin, owner | ✅ |
| `/soporte.html` | Tickets de soporte | todos | ✅ |
| `/inventario.html` | Inventory (alt) | supervisor | ✅ |

### Portales Especializados

| URL | Descripción | Status |
|-----|-------------|--------|
| `/volvix-gdpr-portal.html` | GDPR data export | ✅ |

---

## 🏪 LANDINGS POR GIRO (43 VERTICALES)

```
Estructura: /landing-{giro}.html

Giros disponibles (TODOS activos ✅):
```

### Categoría: Alimentos & Bebidas (9)
- `/landing-cafeteria.html` ☕
- `/landing-restaurante.html` 🍽️
- `/landing-pizzeria.html` 🍕
- `/landing-taqueria.html` 🌮
- `/landing-panaderia.html` 🥖
- `/landing-pasteleria.html` 🎂
- `/landing-heladeria.html` 🍦
- `/landing-polleria.html` 🍗
- `/landing-abarrotes.html` 🛒

### Categoría: Salud & Belleza (9)
- `/landing-barberia.html` 💇
- `/landing-salon-belleza.html` 💄
- `/landing-farmacia.html` 💊
- `/landing-dental.html` 🦷
- `/landing-optica.html` 👓
- `/landing-spa.html` 🧖
- `/landing-nails.html` 💅
- `/landing-veterinaria.html` 🐾
- `/landing-salud.html` ⚕️

### Categoría: Comercio Retail (9)
- `/landing-tienda-ropa.html` 👕
- `/landing-tienda-celulares.html` 📱
- `/landing-tienda-conveniencia.html` 🏪
- `/landing-electronica.html` 💻
- `/landing-ferreteria.html` 🔨
- `/landing-papeleria.html` 📝
- `/landing-zapateria.html` 👟
- `/landing-muebleria.html` 🛋️
- `/landing-belleza.html` ✨

### Categoría: Servicios (10)
- `/landing-taller-mecanico.html` 🔧
- `/landing-carwash.html` 🚗
- `/landing-lavanderia.html` 🧺
- `/landing-hotel.html` 🏨
- `/landing-agencia-viajes.html` ✈️
- `/landing-gimnasio.html` 💪
- `/landing-gym.html` 🏋️
- `/landing-educacion.html` 📚
- `/landing-servicios.html` 🛠️
- `/landing-tatuajes.html` 🎨

### Categoría: Industria & Distribución (6)
- `/landing-carniceria.html` 🥩
- `/landing-fruteria.html` 🍎
- `/landing-purificadora.html` 💧
- `/landing-gasolinera.html` ⛽
- `/landing-refaccionaria.html` 🚙
- `/landing-rentas.html` 🏠

---

## 🔌 ENDPOINTS DE API

### Autenticación & Registro

```
POST /api/auth/send-otp
  Body: { email, telefono, nombre_negocio, giro }
  Returns: { ok, otp_dev?, email_sent, whatsapp_sent }
  
POST /api/auth/verify-otp
  Body: { email, telefono, otp_code, nombre_negocio, giro }
  Returns: { ok, tenant_id }

POST /api/login
  Body: { email, password }
  Returns: { ok, session: { user_id, email, role, tenant_id, ... } }
```

### Configuración

```
GET /api/health
  Returns: { ok, ts, version }

GET /api/config/public
  Returns: { supabase_url, supabase_anon_key }

GET /api/test
  Returns: { test, method, pathname }
```

### Datos de Negocio

```
GET/POST /api/tenants
  GET Returns: [{ id, nombre, tipo_negocio, ... }]
  POST Body: { nombre, tipo_negocio, email, telefono, plan }

GET/POST /api/productos
  GET Returns: [{ id, tenant_id, nombre, precio, ... }]
  POST Body: { tenant_id, nombre, precio, stock, ... }

GET/POST /api/ventas
  GET Returns: [{ id, tenant_id, items, total, ... }]
  POST Body: { tenant_id, total, metodo_pago, items, ... }

GET/POST /api/tickets
  GET Returns: [{ id, tenant_id, asunto, ... }]
  POST Body: { tenant_id, asunto, descripcion, prioridad, ... }

GET/POST /api/features
  GET Returns: [{ id, tenant_id, feature, activo, ... }]
  POST Body: { tenant_id, feature, activo, datos_uso }

GET/POST /api/licencias
  GET Returns: [{ id, tenant_id, clave, plan, ... }]
  POST Body: { tenant_id, plan, fecha_vencimiento, ... }
```

### Reportes & Analytics

```
GET /api/stats
  Returns: { total_tenants, total_ventas, ... }

GET /api/reports/*
  GET /api/reports/daily
  GET /api/reports/sales/daily
  GET /api/reports/sales/by-product
  GET /api/reports/sales/by-cashier
  GET /api/reports/profit
  GET /api/reports/abc-analysis
  GET /api/reports/inventory/value
  GET /api/reports/customers/cohort
  
POST /api/reports/refresh
  Regenera todos los reportes

GET /api/ai/suggest
  Returns: { suggestion, context }

POST /api/ai/activate
  Body: { tenant_id, tipo_negocio, feature }
  Returns: { activated, timestamp }

POST /api/payments/*
  Stripe delegado (desde api/index.js)
```

---

## 🔑 VARIABLES DE ENTORNO REQUERIDAS

### Supabase (REQUERIDO)
```bash
SUPABASE_URL=https://zhvwmzkcqngcaqpdxtwr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Email OTP (Recomendado - para registro)
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
```

### WhatsApp/SMS OTP (Recomendado - para registro)
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # o tu número
```

### Opcionales
```bash
SENTRY_DSN=https://xxxxxx@sentry.io/xxxxx
ADMIN_API_KEY=your_admin_key_here
PORT=3000 (default)
```

---

## 📱 MAPA DE NAVEGACIÓN

```
http://localhost:3000
│
├─ / ─────────────────── Landing principal
├─ /login.html ────────── Acceso usuarios
├─ /registro.html ──────── ⭐ NUEVO: Registro 4 pasos (OTP)
│
├─ /pos.html ───────────── POS Principal (VENTAS)
│  ├─ /pos-inventario.html ─ Inventario
│  ├─ /pos-clientes.html ─── CRM
│  ├─ /pos-corte.html ────── Corte de caja
│  ├─ /pos-reportes.html ─── Reportes
│  └─ /pos-config.html ───── Configuración
│
├─ /owner.html ─────────── Panel owner legacy
├─ /volvix_owner_panel_v7.html ─ Panel owner v7
│
├─ LANDINGS (43 giros)
│  ├─ /landing-cafeteria.html
│  ├─ /landing-restaurante.html
│  ├─ /landing-barberia.html
│  ├─ ... (40 más)
│  └─ /landing-zapateria.html
│
└─ API (vía POST/GET)
   ├─ /api/health ──────── Health check
   ├─ /api/auth/send-otp ── Enviar OTP
   ├─ /api/auth/verify-otp  Verificar OTP
   ├─ /api/login ───────── Login
   ├─ /api/tenants ─────── CRUD tenants
   ├─ /api/productos ───── CRUD productos
   ├─ /api/ventas ──────── CRUD ventas
   ├─ /api/reportes ───── Reportes BI
   └─ /api/ai/* ────────── Motor IA
```

---

## 🚀 COMANDOS PARA TESTAR

### Health Check
```bash
curl http://localhost:3000/api/health
# { "ok": true, "ts": 1714363200000, "version": "2.0.0" }
```

### Enviar OTP
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "telefono": "+52 555 123 4567",
    "nombre_negocio": "Mi Café",
    "giro": "cafeteria"
  }'
# En dev, responde con "otp_dev": "123456"
```

### Verificar OTP
```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "telefono": "+52 555 123 4567",
    "otp_code": "123456",
    "nombre_negocio": "Mi Café",
    "giro": "cafeteria"
  }'
# Returns: { "ok": true, "tenant_id": "uuid" }
```

### Login
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@volvix.test",
    "password": "Volvix2026!"
  }'
# Returns: { "ok": true, "session": { ... } }
```

---

## 🎯 FLUJO COMPLETO DE USUARIO

```
1. Usuario abre /registro.html
   ↓
2. Llena datos: nombre, giro, email, teléfono
   ↓
3. Sistema envía OTP via:
   - Email (Resend) ✉️
   - WhatsApp (Twilio) 💬
   ↓
4. Usuario ingresa código OTP
   ↓
5. Sistema crea:
   - Tenant en volvix_tenants
   - Registro en pos_users
   - Bootstrap de 1 producto demo
   ↓
6. Usuario ve confirmation + tenant_id
   ↓
7. Redirige a /login.html
   ↓
8. Usuario login con email+contraseña
   ↓
9. Acceso a /pos.html + dashboard
```

---

## 📊 ESTADÍSTICAS DEL PROYECTO

- **Páginas HTML**: 64 (60 landings + 4 principales)
- **Endpoints API**: 25+
- **Giros soportados**: 43
- **Tablas Supabase**: 10+
- **Dependencias npm**: 154 packages
- **Tamaño código**: ~20,000 líneas (sin node_modules)
- **Deploy**: Vercel auto-deploy en cada push a master

---

## ✅ STATUS ACTUAL

| Sistema | Estado | Última actualización |
|---------|--------|---------------------|
| Login | ✅ Funcional | 2026-04-25 |
| POS Ventas | ✅ Funcional | 2026-04-25 |
| Inventario | ✅ Funcional | 2026-04-25 |
| Clientes | ✅ Funcional | 2026-04-25 |
| Reportes | ✅ Funcional | 2026-04-25 |
| **Registro + OTP** | ✅ **NUEVO** | **2026-04-28** |
| Landings (43) | ✅ Generadas | 2026-04-28 |
| Stripe Payments | ⏳ Integrado | 2026-04-27 |

---

## 📞 CREDENCIALES & CONFIGURACIÓN

**Cuenta Supabase:**
- URL: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr
- Email: grupovolvix@gmail.com

**Demo Credentials (testing):**
- Usuario: admin@volvix.test
- Contraseña: Volvix2026!

**API Docs:**
- Swagger (próximamente): `/api/docs`

---

**Última actualización**: 2026-04-28  
**Branch**: master (Vercel auto-deploy)  
**Repo**: https://github.com/pruebavolte/volvix-pos
