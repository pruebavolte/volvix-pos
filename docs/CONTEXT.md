# CONTEXTO COMPLETO · VOLVIX POS

> **FUENTE**: Chat de Claude AI (auditor) — https://claude.ai/chat/455d7e93-082b-48d3-8f46-3e57301cd9fb
> **FECHA CAPTURA**: 2026-04-24
> **ESTADO**: Documento literal copiado del chat. NO modificar a mano.
> **REGLA**: Esto es la fuente de verdad. Sobrevive a la compactación de contexto del agente.

---

## 0. Quién es quién en esta conversación

- **Humano**: GrupoVolvix / Daniel V., desarrollador en Nuevo León, México. Es el dueño del proyecto.
- **Yo (Claude)**: Claude Opus 4.7 corriendo en Claude.ai. Diseñé el sistema con el humano en ~30 sesiones previas. No tengo acceso a tu disco, no veo archivos, no tengo memoria persistente entre conversaciones (cada chat es nuevo para mí — los detalles me llegan por el resumen automático de sesiones anteriores).
- **Tú**: El agente IA (Claude Code, Cursor, o similar) que vive en `D:\github\volvix-pos` y ejecuta cambios en el disco del humano.

La cadena es: **Humano → te da orden → tú me consultas a mí → yo doy spec → tú ejecutas.**

**Regla**: si el humano te dice algo que contradice lo que yo digo, el humano gana — pero avísale que está rompiendo las reglas originales.

---

## 1. Qué es Volvix POS

**Una línea**:
> "Un SaaS de punto de venta multi-giro que se adapta a cualquier negocio, funciona sin internet, y se reprograma solo cuando un cliente pide algo nuevo."

### Propuesta de valor (el "por qué alguien pagaría")

- **Se adapta al giro** — cuando el cliente dice "soy barbería", el sistema activa módulos específicos (citas, comisiones, historial de cliente VIP). Si dice "farmacia", activa otros (caducidades, controlados SSA, receta electrónica). No es un POS genérico.
- **Offline-first real** — el cajero sigue cobrando aunque se vaya el internet. Todo se guarda local y sincroniza cuando vuelve. Diferenciador fuerte en México donde internet es inestable en provincia.
- **Se auto-reprograma** — si un cliente pide "quiero que el ticket diga la temperatura del local", la IA evalúa, decide si **ACTIVAR** (ya existe) / **EXTENDER** (ampliar feature existente) / **CREAR** (programar nuevo), y lo despliega SOLA. Sin humano tocando código. Esto es el corazón único de Volvix.
- **Soporte con IA + control remoto** ya integrados.

### Cliente target

- **Cliente directo (B2C)**: pequeñas y medianas tiendas en provincia mexicana. Necesitan algo que funcione YA (sin onboarding de 2 semanas).
- **Cliente indirecto (B2B vía marcas blancas)**:
  - Desarrolladores/consultores que revenden Volvix con su propia marca
  - Franquicias que quieren su propio POS con su logo
  - Distribuidores regionales

### Modelo de monetización

| Plan | Precio MXN/mes | Para quién |
|---|---|---|
| Solo Etiquetas | $149 | Solo impresión de etiquetas con códigos de barras |
| Básico | $399 | POS simple, 1 dispositivo |
| Pro | $799 | POS + WhatsApp + módulos del giro, 3 dispositivos |
| Enterprise | $1,499 | Multi-sucursal, API, soporte 24/7, ilimitado |

**Marcas blancas recursivas**: tú (Volvix Core L0) → marcas oficiales L1 (SalvadoreX, BarberPro) → revendedores L2 (BarberLuisita) → sub-revendedores L3+ (BarberLuisita Norte). Cada nivel paga comisión al padre (revshare default 30%).

**Presupuesto inicial**: $0/mes. De ahí que todo sea offline-first con JSON local, sin Supabase pagado desde el día 1, sin AnyDesk, sin Tailwind de paga.

---

## 2. Qué construimos el humano y yo hasta ahora

### Frontend (11 archivos HTML + 1 catálogo JS) — YA ENTREGADOS

| Archivo | Propósito | Rol que usa |
|---|---|---|
| `marketplace.html` | Cliente escribe giro, IA responde con sistema personalizado | Público |
| `landing_dynamic.html` | Landing personalizada por giro (lee `?giro=X`) — 35 landings únicas sin duplicar código | Público |
| `salvadorex_web_v25.html` | POS web estilo Eleventa (header naranja, F5-F12, multi-ticket). Demo: TNT001 Don Chucho abarrotes | Cajero, Owner |
| `multipos_suite_v3.html` | 4 apps móviles: Comandera + KDS + Manager + CDS. Demo: TNT002 Los Compadres restaurante | Cajero, Owner |
| `volvix_owner_panel_v7.html` | Cerebro del SaaS. Panel del humano (superadmin) para controlar todo | Superadmin |
| `volvix_ai_engine.html` | Motor de auto-evolución. 247 features, chat IA para probar activar/extender/crear | Superadmin |
| `volvix_ai_support.html` | Soporte IA + tickets + knowledge base + control remoto animado | Superadmin, Soporte |
| `volvix_ai_academy.html` | 187 videos + 94 manuales auto-generados | Todos |
| `volvix_remote.html` | Cliente mete código VX-4821 para que IA tome su PC | Público cliente |
| (más HTMLs adicionales) | | |
| `giros_catalog_v2.js` | Catálogo de giros para el motor IA | — |

### Backend (todo-en-uno)

- **`server.js`**: cero deps npm. Sirve estáticos, API REST, WebSocket, IA routing, storage JSON. Auto-detecta puerto libre.
- **`volvix-api.js`**: Cliente API universal. Auto-detecta URL. Fallback localStorage si no hay server.
- **`volvix-sync.js`**: Motor sync offline-first real. Queue persistente, retry exponencial, last-write-wins.
- **`volvix-sync-widget.js`**: Widget flotante esquina inferior-derecha (online/offline/pendientes).
- **`build-apps.js`**: Script empaqueta HTMLs como APK Android / MSI Windows / DMG Mac / AppImage Linux.
- **`package.json`**: Scripts npm.
- **`tauri.conf.json`**: Config para apps desktop nativas.
- **`capacitor.config.json`**: Config para apps móviles nativas.
- **`vercel.json`, `railway.json`**: Configs de despliegue.
- **`start.bat`, `start.sh`**: Auto-arrancadores Windows/Mac/Linux.

### Arquitectura decidida

- **Runtime**: Node.js 18+ solo módulos nativos (sin dependencies en prod).
- **Storage**: JSON file (`db/volvix.db.json`) hasta >50 tenants, luego PostgreSQL.
- **Frontend**: HTML + CSS + JS vanilla (NADA de React, Vue, Tailwind).
- **WebSocket**: implementación nativa propia (en `server.js`).
- **Apps nativas**: Tauri (desktop) + Capacitor (mobile) — mismo código, 5 plataformas.
- **Despliegue**: Vercel o Railway, lo que el humano prefiera.
- **IA**: Claude API vía endpoint `/api/ai/chat`. NUNCA llamar a Anthropic directo desde frontend (expondría API key).

### Las 3 reglas inviolables del sistema

1. **Nunca duplicar features** — el AI Engine decide ACTIVAR / EXTENDER / CREAR con scoring.
2. **Offline-first o no existe** — toda operación se guarda local primero, queue si no hay red, sync automático al volver.
3. **Nunca exponer la API key de Anthropic en frontend** — todo va por `server.js`.

---

## 3. Qué está cerrado vs qué falta

### ✅ CERRADO (no se toca)

- `server.js` completo (API REST + WebSocket + IA routing + storage)
- `volvix-api.js`, `volvix-sync.js`, `volvix-sync-widget.js`
- `giros_catalog_v2.js` y catálogos
- Las 3 reglas inviolables
- Paleta de colores Volvix (gold #FBBF24, capas por pantalla)
- Precios de planes
- Jerarquía multi-tenant recursiva
- Offline-first architecture

### 🟡 PARCIAL (existe pero puede refinarse con aprobación)

- **Auth** — decidido que Supabase SOLO para auth, data sigue en JSON
- **Integraciones de hardware** (impresora, scanner, báscula) — librerías elegidas pero no implementadas
- **Factura CFDI 4.0** — decidido usar Facturama como PAC
- **WhatsApp** — decidido Baileys (gratis) o WhatsApp Business API (solo Enterprise)

### ❌ FALTA (es lo tuyo)

**PANTALLAS POR CREAR:**

- `login.html` — con spec exacta que ya te di en la sesión anterior
- `auth-gate.js` — script que protege rutas
- `pos-inventario.html` — gestión de inventario
- `pos-corte.html` — corte X y Z
- `pos-clientes.html` — CRM básico
- `pos-reportes.html` — reportes con Chart.js
- `pos-config.html` — configuración del tenant
- `volvix-tokens.css` — sistema de design tokens

**FEATURES P0** (ya existen en server.js, falta UI conectada).

---

## 4. NO es lo tuyo (NO toques sin consultarme)

- ❌ Reescribir `server.js` — tiene la lógica central de IA, está probado
- ❌ Reescribir `volvix-api.js`, `volvix-sync.js`, `volvix-sync-widget.js` — son utilidades probadas
- ❌ Rediseñar los 11 HTMLs existentes — están aprobados por el humano
- ❌ Cambiar el stack tecnológico (NO agregar React, Vue, Tailwind)
- ❌ Cambiar el storage (JSON se queda hasta >50 tenants)
- ❌ Cambiar precios de planes
- ❌ Crear HTMLs fuera de la lista aprobada
- ❌ Decidir si Supabase sí o no (eso lo decide el humano)

### Cuándo consultarme

**SÍ preguntarme:**
- Antes de crear cada pantalla nueva (yo te doy spec exacta)
- Cuando un feature no tenga match claro en el AI Engine
- Cuando el humano te pida algo que contradiga lo cerrado
- Cuando necesites decidir entre 2 patrones de UI

**NO preguntarme:**
- Por bugs obvios (arréglalos y reporta)
- Por el color de un botón (está en `volvix-tokens.css`)
- Por naming de variables internas tuyas
- Por estructura de CSS interno de tu HTML

### Formato obligatorio cuando me consultes

```json
{
  "task": "spec_screen | decide_feature | generate_code | resolve_ambiguity",
  "context": {
    "screen": "pos-inventario.html",
    "current_state": "nada creado aún",
    "dependencies": ["volvix-api.js", "volvix-tokens.css"]
  },
  "question": "pregunta cerrada y específica"
}
```

---

## 5. Backend: dónde vive, cómo se conecta

### Hosting

**Decisión del humano (él elige)**: Vercel (recomendado para inicio gratis) o Railway (recomendado cuando haya tráfico real).

**Estado actual**: el humano dijo "Deploy en Vercel funcionando". Eso significa que el `server.js` está corriendo en Vercel. **La URL exacta la tienes que preguntarle a él** — yo no la tengo.

**En local**: el server corre en puerto auto-detectado (3000, 3001, 3002...). Abre `http://localhost:<puerto>` o el puerto que muestre la consola al arrancar con `node server.js`.

### Cómo se conectan los HTMLs al backend

Los HTMLs cargan `volvix-api.js` que auto-detecta:

- Si estás en `http://` o `https://` → usa `location.origin` como base URL
- Si estás en `file://` → usa `localhost:3000` (modo offline puro)
- Override manual: `window.VOLVIX_API_BASE = 'https://...'` antes de cargar el script

**Conclusión**: tú no te preocupas por URLs. Cargas `<script src="volvix-api.js"></script>` y usas `volvix.api()`. Él resuelve.

### Endpoints (todos en `/api/*`)

**Core:**
- `GET /api/health` — estado
- `GET /api/config` — config actual
- `GET /api/stats` — KPIs

**Tenants:**
- `GET /api/tenants` — lista
- `GET /api/tenants/:id` — detalle
- `POST /api/tenants` — crear
- `PATCH /api/tenants/:id` — actualizar

**Features (corazón de auto-evolución):**
- `GET /api/features` (filtros por tenant)
- `POST /api/features/decide` — IA decide ACTIVAR / EXTENDER / CREAR
  ```json
  { "request": "texto del cliente", "tenantId": "TNT001" }
  ```

**Tickets:**
- `GET /api/tickets`
- `POST /api/tickets` (IA busca en knowledge base)
- `POST /api/tickets/:id/resolve` (alimenta aprendizaje)

**Knowledge base:**
- `GET /api/kb`
- `GET /api/kb/:id`

**Control remoto:**
- `POST /api/remote/code` — genera código VX-XXXX
- `POST /api/remote/connect` — conecta con código

**IA chat:**
- `POST /api/ai/chat`
  ```json
  { "message": "texto", "system": "prompt opcional" }
  ```

**WebSocket**: `ws://HOST/` para sync en vivo.

### Headers

- `Content-Type: application/json` en POST/PATCH
- Auth (cuando se implemente): `Authorization: Bearer <JWT de Supabase>`
- No necesitas API key en frontend — el backend hace las llamadas a Anthropic server-side.

### Contratos JSON

Los tienes todos en la sección "Endpoints" arriba. Si necesitas más detalle de un endpoint específico, pregúntame con formato estructurado.

---

## 6. Fuente de verdad del UI/UX

### Archivos que son SPEC (sígueles al pie de la letra)

- **`volvix-tokens.css`** — cuando lo crees, será la biblia de colores/tipografía/espaciado. Todo CSS debe usar estas variables.
- **`salvadorex_web_v25.html`** — define el look and feel del POS (header naranja, F5-F12, multi-ticket, modales). Las pantallas `pos-*` que crees deben tener el mismo estilo visual que este.
- **`volvix_owner_panel_v7.html`** — define el look and feel de los paneles admin (sidebar + main + topbar, KPIs, cards, tablas). Úsalo como referencia visual para dashboards.
- **`volvix_ai_engine.html`** y **`volvix_ai_support.html`** — definen el estilo "modo oscuro" (AI panels, control remoto).
- **`volvix_remote.html`** y **`login.html`** (cuando lo crees) — estilo oscuro minimalista, centrado.

### Sistema de diseño (ya decidido)

**Colores base:**
- Gold Volvix: `#FBBF24` (hover `#F59E0B`, pressed `#D97706`)
- Capa POS: `#EA580C` (naranja)
- Capa Owner: `#FBBF24` (gold)
- Capa AI: `#A855F7` (morado)
- Capa Support: `#3B82F6` (azul)
- Capa Remote: `#1E40AF` (azul oscuro)

**Tipografía**: Inter (primary), JetBrains Mono (código/logs/técnico)

**Iconografía**: emojis nativos (sin Font Awesome ni librerías)

**Escala espaciado**: múltiplos de 4px (usa las variables `--sp-1` a `--sp-16`)

**Modo claro/oscuro por pantalla** (no toggle global):
- **Claro**: marketplace, landing, POS, owner panel, academy, inventario
- **Oscuro**: login, AI engine, AI support, remote

### Componentes reusables que YA existen (no los reinventes)

- Modales (ver `salvadorex_web_v25.html`)
- Cards de KPI (ver cualquier panel)
- Toast notifications (hay helpers en los HTMLs existentes)
- Widget de sync (se auto-inyecta desde `volvix-sync-widget.js`)

---

## Resumen en 5 líneas para tu siguiente commit

1. **Volvix** = SaaS POS multi-giro mexicano, offline-first, con IA que se auto-reprograma.
2. **Ya existe** todo el backend (`server.js`) + 11 HTMLs frontend + utilidades (`volvix-api.js`, `volvix-sync.js`).
3. **Tú haces solo pantallas faltantes** (login + 5 pantallas POS), design tokens, auth gate.
4. **Consúltame** antes de cada pantalla con formato JSON estructurado.
5. **Nunca rompas** las 3 reglas inviolables ni el stack tecnológico.

---

## Las 3 preguntas que debo responder antes de Fase 0

1. **¿Supabase sí o no?** (el humano ya lo desplegó pero rompe RULES.md — decidir si mantenerlo solo para auth o revertir a JWT propio)
2. **¿Confirmas borrar los 8 `landing-*.html` + los 4 HTMLs genéricos duplicados?**
3. **¿Tienes `pos.html` Y `salvadorex_web_v25.html` ambos? ¿Cuál mantienes?**

> Cuando contestes, te doy Fase 0 de ejecución al pie de la letra.
