<<<<<<< HEAD
# Volvix SaaS · v7.0.0

Sistema POS multi-giro **offline-first** con IA autónoma. Funciona como:
- **Web** (cualquier navegador)
- **App Android** (APK nativa)
- **App Windows** (MSI instalable)
- **App Mac** (DMG)
- **App Linux** (AppImage / deb)

---

## 🔌 Offline-first REAL — no es marketing

### Lo que pasa cuando se cae internet:

1. **Todo sigue funcionando.** El cliente sigue cobrando, agregando productos, emitiendo tickets.
2. **Cada operación se guarda local en IndexedDB/localStorage** instantáneamente.
3. **Se encola en la cola de pendientes** (persistente, no se pierde si cierras el navegador).
4. **Un indicador flotante** muestra "Offline · 7 pendientes" en la esquina.

### Cuando vuelve internet:

1. **El sync engine lo detecta automáticamente** (heartbeat cada 30s + evento del navegador).
2. **Procesa la cola en orden FIFO** (primero lo más viejo).
3. **Resuelve conflictos con last-write-wins** (gana el timestamp más reciente).
4. **Reintenta con backoff exponencial** si algo falla (1s, 2s, 4s, 8s... hasta 60s).
5. **Notifica al UI** con un toast verde "✓ Sincronizados 7 cambios".

### Los 3 archivos del sistema offline:

| Archivo | Qué hace |
|---|---|
| `volvix-api.js` | Cliente API universal. Detecta si hay server o usa localStorage. |
| `volvix-sync.js` | Motor de sincronización. Queue + retry + conflict resolution. |
| `volvix-sync-widget.js` | Widget flotante visible (verde = online / rojo = offline). |

Todos se auto-inyectan. Tú no haces nada.

---

## 📱 Plataformas soportadas

| Plataforma | Binario | Comando | Tamaño |
|---|---|---|---|
| **Web** | HTMLs servidos por Node | `node server.js` | — |
| **Android** | APK (Capacitor + WebView) | `npm run build:android` | ~8 MB |
| **Windows** | MSI (Tauri) | `npm run build:windows` | ~12 MB |
| **macOS** | DMG (Tauri) | `npm run build:mac` | ~10 MB |
| **Linux** | AppImage + deb (Tauri) | `npm run build:linux` | ~15 MB |

**El código es el mismo.** Los 10 HTMLs + JS corren igual en los 5 entornos. Capacitor/Tauri son solo wrappers que:
- Empaquetan los archivos en un binario instalable
- Dan acceso a APIs nativas (impresora bluetooth, NFC, cámara, huella)
- Hacen que la app aparezca en el menú de inicio / cajón de apps

### Cuándo usar cada una:

| Uso | Recomendación |
|---|---|
| Cliente final abarrotes / cajero fijo | **Windows MSI** (instalar una vez, funciona siempre) |
| Mesero tomando comandas | **Android APK** (tablets baratas) |
| Múltiples sucursales con internet estable | **Web** (actualizaciones instantáneas) |
| Dueño del sistema (tú) | **Web** desde cualquier dispositivo |

---

## 🚀 Arranque en 30 segundos (modo web)

### 1. Instalar Node.js
https://nodejs.org → versión LTS → doble clic

### 2. Pon todos los archivos en una carpeta
La carpeta puede llamarse como tú quieras.

### 3. Arrancar

**Windows:** doble clic a `start.bat`
**Mac / Linux:**
```bash
chmod +x start.sh && ./start.sh
```

**O manualmente:**
```bash
node server.js
```

El server:
- Auto-detecta puerto libre (3000, 3001, 3002...)
- Mueve los HTMLs a `public/` si están sueltos
- Abre el navegador solo
- Te dice la URL exacta

---

## 📦 Compilar apps nativas

### Android APK

**Requisitos:**
- JDK 17+ (`apt install openjdk-17-jdk`)
- Android Studio (para el SDK)

**Comando:**
```bash
npm run build:android
```

APK listo en: `android/app/build/outputs/apk/release/app-release.apk`

Arrastra ese APK al teléfono, lo instalas, y tienes Volvix como app nativa.

### Windows MSI

**Requisitos:**
- Rust (https://rustup.rs)
- Microsoft C++ Build Tools (Visual Studio Installer)

**Comando:**
```bash
npm run build:windows
```

MSI listo en: `src-tauri/target/release/bundle/msi/Volvix_7.0.0_x64.msi`

Doble clic → instala Volvix como programa Windows.

### Mac DMG

**Requisitos:**
- Xcode Command Line Tools: `xcode-select --install`

**Comando:**
```bash
npm run build:mac
```

DMG listo en: `src-tauri/target/release/bundle/dmg/Volvix_7.0.0_universal.dmg`

### Linux

**Requisitos:**
```bash
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**Comando:**
```bash
npm run build:linux
```

AppImage + `.deb` en: `src-tauri/target/release/bundle/`

### Todos a la vez

```bash
npm run build:all
=======
# Volvix POS

Sistema de punto de venta multi-tenant con Motor IA, PWA y Realtime.  
Stack: Node.js · Supabase · Vercel · Vanilla JS

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js (http nativo, sin framework) |
| Base de datos | Supabase (PostgreSQL) |
| Realtime | Supabase Realtime (`postgres_changes`) |
| Frontend | HTML/CSS/JS vanilla, sin bundler |
| PWA | Web App Manifest + Service Worker |
| Deploy | Vercel (serverless) |

---

## Inicio rápido

```bash
git clone https://github.com/pruebavolte/volvix-pos
cd volvix-pos
npm install
cp .env.example .env   # completar variables
node server.js
# → http://localhost:3000
```

Variables de entorno requeridas:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
>>>>>>> origin/master
```

---

<<<<<<< HEAD
## 🌐 Subir a internet (producción)

### Vercel (recomendado · gratis)
```bash
npm install -g vercel
vercel --prod
```

### Railway
```bash
npm install -g @railway/cli
railway login
railway up
```

### Render
1. https://render.com → "New Web Service"
2. Conecta tu repo GitHub
3. Start command: `node server.js`

En cualquier opción, configura `ANTHROPIC_API_KEY` en las variables de entorno.

---

## 🧠 IA real (opcional)

Por defecto la IA corre en **modo simulación** (funciona sin internet). Para llamadas reales a Claude:

1. https://console.anthropic.com → crea API key
2. En Vercel/Railway/Render: agrega variable `ANTHROPIC_API_KEY=sk-ant-xxxxx`
3. En local: crea archivo `.env` con esa línea
4. Reinicia

**Costos aproximados con Claude Opus 4.7:**
- Decisión de feature (activar/extender/crear): ~$0.02 USD
- Generación de video capacitación: ~$0.18 USD (una sola vez, se reutiliza)
- Resolución de ticket de soporte: ~$0.01 USD

Sin la key, el sistema sigue funcionando 100% offline pero con respuestas pre-programadas (no Claude real).

---

## 📁 Estructura completa

```
tu-carpeta/
├── server.js                    # Backend Node.js
├── package.json
├── vercel.json                  # Config Vercel
├── railway.json                 # Config Railway
├── tauri.conf.json              # Config Tauri (Windows/Mac/Linux)
├── capacitor.config.json        # Config Capacitor (Android/iOS)
├── build-apps.js                # Script de build multi-plataforma
├── start.bat                    # Auto-arranque Windows
├── start.sh                     # Auto-arranque Mac/Linux
├── .env.example                 # Template variables de entorno
├── README.md
├── db/
│   └── volvix.db.json           # BD local (se crea sola)
└── public/
    ├── volvix-api.js            # Cliente API universal
    ├── volvix-sync.js           # Sync engine (offline-first)
    ├── volvix-sync-widget.js    # Widget visual de sync
    ├── giros_catalog_v2.js      # 35 giros con pain-points
    ├── volvix_owner_panel_v7.html
    ├── volvix_ai_engine.html
    ├── volvix_ai_support.html
    ├── volvix_ai_academy.html
    ├── volvix_remote.html
    ├── marketplace.html
    ├── landing_dynamic.html
    ├── salvadorex_web_v25.html
    ├── multipos_suite_v3.html
    └── etiqueta_designer.html
```

---

## 🔀 API endpoints

Todos en `/api/*`:

### Core
- `GET /api/health` — estado
- `GET /api/config` — config
- `GET /api/stats` — KPIs

### Tenants (clientes finales)
- `GET /api/tenants` · `POST /api/tenants` · `PATCH /api/tenants/:id`

### Features (auto-evolución)
- `GET /api/features`
- `POST /api/features/request` ← **IA decide activar/extender/crear**

### Tickets (soporte)
- `GET /api/tickets` · `POST /api/tickets` · `POST /api/tickets/:id/resolve`

### Knowledge base
- `GET /api/knowledge` · `GET /api/knowledge/search?q=...`

### Control remoto
- `POST /api/remote/start` · `POST /api/remote/connect`

### IA
- `POST /api/ai/chat`

### WebSocket
- `ws://HOST/` — sync en vivo

---

## 🔒 Por qué esta arquitectura

- **Cero dependencias npm**: arranca en <1 segundo, sin `npm install`
- **JSON como BD por default**: sin instalar nada
- **Mismo origen frontend/backend**: los `<a href="landing.html">` funcionan siempre
- **Auto-detección de puerto**: nunca "Error: port in use"
- **Sync engine real**: queue persistente + retry + conflict resolution
- **Wrappers Capacitor/Tauri**: mismo código → 5 plataformas
- **Cuando crezcas**: migra a PostgreSQL/Supabase sin tocar frontend

---

## 🆘 Troubleshooting

**"La IA no responde con inteligencia real"**
Falta `ANTHROPIC_API_KEY`. Sin eso, la IA usa respuestas simuladas.

**"Puerto ocupado"**
El server lo resuelve solo. Si aún falla: `PORT=4000 node server.js`

**"No abre el navegador"**
Abre manualmente la URL que muestra el server.

**"Los HTMLs dan 404"**
Verifica que estén dentro de `public/`.

**"Capacitor: Android SDK not found"**
Abre Android Studio → Settings → Android SDK → copia la ruta → exporta como `ANDROID_HOME`.

**"Tauri: MSVC not found"**
En Windows: https://visualstudio.microsoft.com/visual-cpp-build-tools/

**"Los cambios offline no se sincronizan"**
Abre el widget de sync (esquina inferior-derecha) → clic → "Sincronizar ahora".

---

**Stack:** Node.js 18+ · HTML/CSS/JS vanilla · WebSocket nativo · Capacitor · Tauri
**Licencia:** Proprietary · GrupoVolvix
**Versión:** 7.0.0
=======
## Páginas

| Ruta | Descripción |
|---|---|
| `/` | Landing principal |
| `/pos.html` | Punto de venta |
| `/owner.html` | Dashboard propietario |
| `/inventario.html` | Gestión de stock |
| `/ai.html` | Motor IA |
| `/soporte.html` | Tickets de soporte |
| `/landing-*.html` | Landings por tipo de negocio (8 verticales) |

---

## API Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| GET/POST | `/api/tenants` | Listar / crear tenants |
| GET/PUT/DELETE | `/api/tenants/:id` | CRUD tenant por ID |
| GET/POST | `/api/productos` | Catálogo de productos |
| GET/POST | `/api/ventas` | Registro de ventas |
| GET/POST | `/api/features` | Feature flags por tenant |
| GET/POST | `/api/tickets` | Tickets de soporte |
| GET/POST | `/api/licencias` | Licencias activas |
| GET | `/api/stats` | Estadísticas generales |
| POST | `/api/ai/activate` | Activar features por IA |
| GET | `/api/ai/suggest?tipo=retail` | Sugerencias por tipo de negocio |

---

## Tablas Supabase

```
volvix_tenants    — empresas registradas
volvix_productos  — catálogo por tenant
volvix_ventas     — historial de ventas
volvix_features   — feature flags
volvix_licencias  — planes activos
volvix_tickets    — soporte al cliente
volvix_usuarios   — usuarios por tenant
```

---

## Motor IA

Activa features automáticamente según tipo de negocio:

| Tipo | Features |
|---|---|
| retail | pos, inventario, proveedores, descuentos, codigo_barras, facturacion |
| salud | citas, expediente, recetas, historial, recordatorios, telemedicina |
| belleza | citas, servicios, fidelidad, galeria, whatsapp, pagos_online |
| alimentos | menu, pedidos, delivery, mesas, cocina_display, propinas |
| rentas | contratos, pagos, mantenimiento, calendario, inquilinos, reportes |
| servicios | ordenes, tecnicos, garantias, diagnostico, refacciones, cobros |
| gym | membresias, asistencia, clases, locker, pagos, rutinas |
| educacion | alumnos, calificaciones, pagos, horarios, comunicados, tareas |

---

## Tests E2E

```bash
node scripts/e2e.mjs                                    # contra producción
node scripts/e2e.mjs http://localhost:3000              # contra local
```

Valida 17 endpoints y páginas. Requiere 17/17 para pasar.

---

## Roadmap

- [x] Multi-tenant architecture
- [x] Motor IA por tipo de negocio
- [x] Supabase Realtime (sin WebSocket)
- [x] PWA (instalable, offline-ready)
- [x] 8 landing pages por vertical
- [ ] CFDI / Facturación electrónica (próximamente)
- [ ] App móvil nativa
- [ ] Integración pagos (Stripe / Conekta)
>>>>>>> origin/master
