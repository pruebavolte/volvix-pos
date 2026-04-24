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
```

---

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
