# 🗺️ Volvix POS — Mapa del Sistema

**Última actualización:** 2026-05-10
**Versión deploy:** ver `public/version.json`

---

## 🌐 Dominios y entornos

| Entorno | URL | Estado |
|---------|-----|--------|
| Producción Vercel | https://volvix-pos.vercel.app | activo |
| Producción custom | https://systeminternational.app | activo (apunta al mismo Vercel) |
| Producción legacy | https://salvadorexoficial.com | activo |
| GitHub repo | https://github.com/pruebavolte/volvix-pos | rama `main` |
| Backup local | `D:\volvix-pos-GITHUB-BACKUP-2026-04-29` | rama `main` |
| Supabase project | `zhvwmzkcqngcaqpdxtwr` (org `hrqasyeoxsdzybayqyad`) | postgres 17 |

---

## 🧩 Frontend — archivos principales

| Archivo | Propósito | LOC |
|---------|-----------|-----|
| `public/marketplace.html` | Landing principal (index) — Apple-style refresh | 2351 |
| `public/salvadorex-pos.html` | POS completo (dueño) | ~26k |
| `public/app/index.html` | PWA cliente (Volvix Adapt) | 525 |
| `public/registro.html` | Registro tenant nuevo (lee `?giro=` URL) | ~1k |
| `public/login.html` | Login pos_users | ~600 |
| `public/landing-<giro>.html` | 55 landings personalizadas por giro | 800-1500 c/u |
| `public/volvix-import-wizard.js` | Wizard 4 cards + 4-tier OCR (TextDetector + Tesseract×2 + OCR.space) | ~1100 |
| `public/volvix-platform-orders.js` | Pedidos PWA → POS modal rojo | ~390 |
| `api/index.js` | Backend Vercel function (todos los `/api/*`) | ~38k |
| `vercel.json` | Routing + CSP + headers | 78 |

---

## 🛢️ Tablas BD principales (Supabase)

### Multi-tenant
| Tabla | tenant_id type | Notas |
|-------|----------------|-------|
| `pos_companies` | text (PK alias) | maestra. business_type=giro |
| `tenants` | uuid | ref FK |
| `pos_users` | uuid | role=ADMIN/USER/SUPERADMIN/CUSTOMER |
| `pos_products` | text | source=wizard_import|manual |
| `customers` | uuid | source=app|manual. requires UUID lookup |
| `pos_app_clients` | text | clientes PWA |
| `pos_app_orders` | text | pedidos PWA → POS |
| `pos_sales` | text | ventas finalizadas |
| `cuts` | text | apertura/cierre caja (Z) |
| `pos_cash_sessions` | uuid | LEGACY — `/api/cash/*` roto, usar `/api/cuts/*` |

### Volvix Adapt (data-driven UI)
| Tabla | Columnas clave |
|-------|----------------|
| `giros_modulos` | `(giro_slug, modulo)` UNIQUE · `state`(enabled/hidden/locked) · `name_override` |
| `giros_buttons` | `(giro_slug, button_key)` UNIQUE · `state` · `name_override` |
| `giros_terminologia` | clave/valor por giro |
| `giros_campos` | campos custom por giro |
| `tenant_module_overrides` | overrides por tenant individual (auto-pob al register) |
| `landing_pages` | 55 landings + content jsonb |

---

## 🔌 Endpoints API críticos

### Auth
- `POST /api/auth/register-simple` → tenant + OTP
- `POST /api/auth/verify-simple` → JWT
- `POST /api/auth/login` → JWT

### Giros / config
- `GET /api/app/config?t=<tenant>` → tenant + giro + modulesState + moduleNameOverrides + buttonsState + buttonNameOverrides + branding + media

### Productos
- `GET /api/products` · `POST /api/products` · `PATCH /api/products/:id`
- `POST /api/products/bulk-import` (idempotente — UPSERT por code)
- `GET /api/products/top` (smart search)

### Customers / PWA
- `GET /api/customers` (resuelve tenant alias→UUID)
- `POST /api/app/register` (PWA cliente, auto-vincula a customers)
- `POST /api/app/orders` · `GET /api/app/orders?tenant_slug=...&email=...`
- `GET /api/pos/app-orders?status=nuevo` (polling 8s)
- `PATCH /api/app/orders/:id` {status: nuevo|aceptado|rechazado|en_preparacion|entregado|cancelado}

### Cortes
- `POST /api/cuts/open` (requiere Idempotency-Key)
- `POST /api/cuts/close`
- `GET /api/cuts/:id/check-pending`

### OCR
- `POST /api/products/bulk-import` (recibe wizard output)
- Externo: `https://api.ocr.space/parse/image` (Tier 2 fallback)

---

## 🛠️ Sistema Volvix Adapt

**3 estados** de cada elemento UI (data-driven desde BD):
- `enabled` → visible + clickeable
- `hidden` → no se muestra (`display:none !important`)
- `locked` → visible pero gris (`opacity:0.4 + pointer-events:none`)

**Selectores frontend:**
- `[data-feature="module.<slug>"]` — 38 módulos del menubar POS
- `[data-vlx-button="<key>"]` — 35 botones internos POS + 8 PWA (`app.bottom_*`, `app.section_*`)

**Para cambiar config de un giro = SQL:**
```sql
UPDATE giros_modulos SET state='hidden' WHERE giro_slug='X' AND modulo='Y';
UPDATE giros_buttons SET name_override='Carta' WHERE giro_slug='restaurante' AND button_key='inventario';
```
Sin redeploy. Frontend lee al boot y aplica.

---

## ⚙️ Variables de entorno Vercel (pendientes)

| Var | Estado | Propósito |
|-----|--------|-----------|
| `RESEND_API_KEY` | ⏳ falta | Email OTP en producción (sin esto solo `dev_code`) |
| `RESEND_FROM` | ⏳ falta | Remitente, ej. `Volvix <noreply@volvix.com>` |
| `SUPABASE_URL` | ✅ activa | https://zhvwmzkcqngcaqpdxtwr.supabase.co |
| `SUPABASE_SERVICE_KEY` | ✅ activa | service_role para backend |
| `JWT_SECRET` | ✅ activa | firma tokens |

---

## 📦 Comandos de mantenimiento

| Trigger | Acción |
|---------|--------|
| `/fortress` | Respaldo emergencia + limpieza + sync git + actualizar este mapa |
| `/optimize` | Token optimization checklist |
| `/walkthrough` | Click manual cada botón + verificar coherencia |
| `/ready-to-ship` | Audit pre-producción |

---

## 📊 Bugs conocidos abiertos

| ID | Severidad | Descripción | Workaround |
|----|-----------|-------------|------------|
| B1 | bajo | `/api/cash/*` rota tenant uuid mismatch | usar `/api/cuts/*` |
| B2 | medio | Email OTP solo `dev_code` en respuesta | activar Resend en Vercel |
| B3 | bajo | Wizard plantilla solo 30/50+ giros | extender SQL `name_override` |
| B4 | cosmetic | Header "0 clientes" si DataLoader async tarda | FIXED 2026-05-10 (event listener) |

---

## 🔄 Flujo end-to-end usuario

```
1. landing-<giro>.html
   → CTA /registro.html?giro=<slug>
   
2. POST /api/auth/register-simple
   → crea tenant + pos_users + auto-pobla tenant_module_overrides
   → emite OTP (Resend si configurado, sino dev_code)
   
3. POST /api/auth/verify-simple
   → JWT 347 chars
   
4. /salvadorex-pos.html
   → GET /api/app/config?t=<tnt> aplica giro + modulesState + renames
   → autoOpenIfEmpty → wizard 4 cards
   
5. Wizard "No lo tengo"
   → carga plantilla del giro (10 productos)
   → POST /api/products/bulk-import (idempotente)
   
6. PWA cliente shareable
   → /app/?t=<tnt>
   → cliente registra → POST /api/app/register
   → auto-vincula a customers (visible en POS)
   
7. Cliente hace pedido
   → POST /api/app/orders
   → POS polling 8s detecta → modal rojo
   → PATCH /api/app/orders/:id status='aceptado' o 'rechazado'
   
8. Vender
   → addToCart respeta qty
   → F12 + Enter cobra (autofocus)
   → POST /api/sales
   
9. Cierre del día
   → POST /api/cuts/open (apertura)
   → POST /api/cuts/close (Z)
```

---

## 🏛️ Arquitectura multi-canal

| Canal | Estado | Build/Deploy | Sync centralizado |
|-------|--------|--------------|-------------------|
| **Web principal** (`marketplace.html`) | ✅ activo | Vercel auto-deploy | API REST `/api/*` |
| **PWA POS dueño** (`salvadorex-pos.html`) | ✅ activo | Vercel + manifest.json + sw.js | API + IndexedDB offline-first |
| **PWA App Cliente** (`/app/index.html`) | ✅ activo | Vercel | API `/api/app/*` |
| **Electron .exe Win** | ⚙️ scripts listos (`npm run electron:build:win`) | manual build → distribuye .exe | Misma API HTTPS |
| **Electron .dmg Mac** | ⚙️ scripts listos (`electron:build:mac`) | manual | Misma API |
| **APK Android (Capacitor)** | ⚙️ scripts listos (`mobile:android:release`) | manual `mobile:sync` + Android Studio | Misma API |
| **iOS** | ⚙️ scripts listos (`mobile:ios`) | requiere Xcode | Misma API |

### Cómo se "cablea" todo
- **Una sola fuente de verdad**: `https://volvix-pos.vercel.app/api/*`
- **Mismo backend**: todos los canales hablan al mismo `api/index.js` en Vercel
- **Mismo BD**: Supabase `zhvwmzkcqngcaqpdxtwr`
- **Misma config por giro**: `GET /api/app/config?t=<tnt>` retorna idéntico JSON sin importar el canal
- **Misma terminología custom**: `tenant_terminology` aplica a todos los canales del tenant
- **Sync offline → online**: IndexedDB queue (`volvix-db`) reenvía pendientes cuando reconecta

### Botón "🔄 Actualizar" (banner offline)
Disponible en `salvadorex-pos.html` cuando `navigator.onLine === false`. Al click:
1. Limpia caches (`caches.delete()`)
2. Re-registra Service Worker (descarga nueva versión)
3. Procesa cola de eventos offline (`__r8aProcessQueue`)
4. Heartbeat (`__r8bHeartbeat`)
5. Si hay internet → recarga con cache-bust `?_t=<timestamp>`
6. Si sigue offline → toast "Aún sin conexión"

## 🚀 Última versión deploy

Ver `public/version.json` y `git log -3 --oneline` para el snapshot vigente.
Comando rápido:
```bash
curl -s https://volvix-pos.vercel.app/version.json | head -3
```
