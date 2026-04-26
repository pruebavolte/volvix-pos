# 🤖 INSTRUCCIONES PARA SIGUIENTE IA

**IMPORTANTE**: Lee este archivo COMPLETO antes de hacer nada. Contiene TODO el contexto.

---

## 🎯 OBJETIVO PRINCIPAL

Cablear los 354 botones pendientes del proyecto Volvix POS para que TODOS guarden datos en Supabase real (no solo UI demo).

---

## 📂 UBICACIÓN Y CREDENCIALES

```
Carpeta del proyecto: C:\Users\DELL\Downloads\verion 340

URL Producción: https://volvix-pos.vercel.app
Vercel CLI:    Ya configurado, usa `vercel --prod --yes` para deploy

Supabase:
  URL:         https://zhvwmzkcqngcaqpdxtwr.supabase.co
  Service Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE2NzAxOCwiZXhwIjoyMDc5NzQzMDE4fQ.rvPkcyE7Cu1BzAhM_GdZjmqXvQe67gIpPaI7tLESD-Q
  Anon Key:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjcwMTgsImV4cCI6MjA3OTc0MzAxOH0.ygTc754INgqYJEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk

Usuarios de prueba:
  admin@volvix.test  / Volvix2026!  (superadmin)
  owner@volvix.test  / Volvix2026!  (owner)
  cajero@volvix.test / Volvix2026!  (cajero)
```

---

## ✅ LO QUE YA ESTÁ HECHO (NO TOCAR)

1. **Backend** (`api/index.js`):
   - Conexión a Supabase via REST API
   - Endpoints: /api/login, /api/health, /api/products, /api/sales, /api/customers, /api/tenants, /api/sync, /api/debug
   - Function `supabaseRequest(method, path, body)` para llamar a Supabase

2. **Tablas Supabase usadas**:
   - `pos_users` (3 usuarios cargados)
   - `pos_companies` (3 tenants cargados)
   - `pos_products` (5 productos cargados)
   - `pos_sales` (recibe ventas)
   - `customers` (existente)

3. **Frontend**:
   - `login.html` - 100% funcional
   - `salvadorex_web_v25.html` - login + cobro funcionando
   - `auth-gate.js` - Protección de páginas
   - `volvix-wiring.js` - Capa de cableado universal

4. **Deploy**:
   - Git inicializado en la carpeta
   - Vercel project: `volvix-pos`
   - Auto-deploy con `vercel --prod --yes`
   - Variables de entorno: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

5. **Bitácora viva**:
   - `BITACORA_LIVE.html` - HTML con auto-refresh
   - `status.json` - Estado actual del proyecto
   - Cuando completes una tarea, ACTUALIZA status.json

---

## 🔄 FLUJO DE TRABAJO PARA CADA TAREA

### Paso 1: Lee el archivo HTML que vas a cablear

```
Read: C:\Users\DELL\Downloads\verion 340\<archivo>.html
```

### Paso 2: Identifica los botones (busca onclick=)

```
Grep: pattern="onclick=" en el archivo
```

### Paso 3: Para cada onclick, decide:

- **Si es navegación** (showScreen, etc): NO necesita backend, déjalo
- **Si es acción CRUD** (guardar, editar, borrar): NECESITA endpoint API + cableado

### Paso 4: Crea el endpoint en api/index.js

Usa este patrón EXACTO:

```javascript
'POST /api/<recurso>': async (req, res) => {
  try {
    const body = await readBody(req);
    const result = await supabaseRequest('POST', '/<tabla_supabase>', {
      // mapeo de campos
      ...body
    });
    sendJSON(res, result[0] || result);
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
},
```

### Paso 5: Cablea el botón en el HTML

Cambia esto:
```html
<button onclick="miFuncion()">Click</button>
```

A esto:
```html
<button onclick="miFuncionCableada()">Click</button>

<script>
async function miFuncionCableada() {
  const session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
  try {
    const res = await fetch('/api/<recurso>', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: session?.tenant_id,
        user_id: session?.user_id,
        // datos del botón
      })
    });
    if (res.ok) {
      const data = await res.json();
      showToast('✓ Guardado en DB: ' + data.id);
      // refresh UI si es necesario
    } else {
      showToast('Error');
    }
  } catch(e) {
    // Offline: agregar a cola
    const queue = JSON.parse(localStorage.getItem('volvix:queue') || '[]');
    queue.push({ endpoint: '/api/<recurso>', data: {...}, timestamp: Date.now() });
    localStorage.setItem('volvix:queue', JSON.stringify(queue));
    showToast('⚠ Sin conexión, en cola');
  }
}
</script>
```

### Paso 6: Test local

```bash
# Probar endpoint
curl -X POST https://volvix-pos.vercel.app/api/<recurso> \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Paso 7: Commit + Deploy

```bash
cd "C:\Users\DELL\Downloads\verion 340"
git add .
git commit -m "Cablear <módulo>: <botones>"
vercel --prod --yes
```

### Paso 8: Actualizar status.json

Edita `status.json`:
- Aumenta `stats.done`
- Disminuye `stats.pending`
- Actualiza el módulo correspondiente
- Agrega entrada al `log`

---

## 📋 LISTA DE TAREAS POR MÓDULO

### 🔥 PRIORIDAD 1: Owner Panel (volvix_owner_panel_v7.html)

**123 botones | Tiempo estimado: 20 horas**

#### Tablas Supabase a crear (si no existen):

```sql
-- En Supabase Dashboard SQL Editor, ejecutar:

-- Tabla volvix_dashboard_metrics
CREATE TABLE IF NOT EXISTS volvix_dashboard_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  metric_type TEXT NOT NULL,  -- 'mrr', 'churn', 'active_users', etc
  value NUMERIC,
  period TEXT,  -- 'daily', 'monthly', 'yearly'
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla volvix_billing_logs
CREATE TABLE IF NOT EXISTS volvix_billing_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  amount NUMERIC,
  status TEXT,  -- 'paid', 'pending', 'failed'
  invoice_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla volvix_features (si quieres feature management)
CREATE TABLE IF NOT EXISTS volvix_features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  module TEXT,
  status TEXT,  -- 'stable', 'beta', 'extended'
  parent_id UUID,
  usage_count INT DEFAULT 0,
  created_by_ai BOOLEAN DEFAULT FALSE,
  tenant_scope JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla volvix_tickets (soporte)
CREATE TABLE IF NOT EXISTS volvix_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'open',  -- 'open', 'in_progress', 'solved'
  ai_handling BOOLEAN DEFAULT FALSE,
  solved_by TEXT,
  solved_in_seconds INT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  solved_at TIMESTAMPTZ
);

-- Tabla volvix_knowledge_base
CREATE TABLE IF NOT EXISTS volvix_knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  problem TEXT NOT NULL,
  cases_count INT DEFAULT 0,
  most_common_fix TEXT,
  success_rate NUMERIC,
  avg_time_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla volvix_ai_decisions
CREATE TABLE IF NOT EXISTS volvix_ai_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  request TEXT,
  decision TEXT,  -- 'activate', 'extend', 'create'
  feature_id UUID,
  confidence_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**INSTRUCCIÓN**: Usuario debe ejecutar este SQL en https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/editor

#### Botones a cablear (Owner Panel):

Lee el archivo y busca cada onclick. Para cada uno:
1. Identifica qué hace (crear tenant, ver métricas, etc)
2. Crea endpoint correspondiente en api/index.js
3. Reemplaza la función JS para llamar al endpoint
4. Marca como hecho en status.json

**Lista detallada** (Grep en el archivo para verlas todas):
```bash
grep -n "onclick=" volvix_owner_panel_v7.html
```

### 🔥 PRIORIDAD 2: Marketplace (marketplace.html)

**12 botones | Tiempo estimado: 2 horas**

Endpoints necesarios:
- `GET  /api/features` (lista features)
- `POST /api/features/activate` (activar para tenant)
- `POST /api/features/request` (cliente pide nueva)

### 🔥 PRIORIDAD 3: AI Modules (engine, support, academy)

**34 botones | Tiempo estimado: 8 horas**

Necesita integración con Claude API:
```javascript
// En api/index.js, agregar:
async function callClaude(messages, system) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { simulated: true, content: '...' };

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages, system
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
```

### 🔥 PRIORIDAD 4: SalvadoreX POS (resto de 138 botones)

**138 botones | Tiempo estimado: 23 horas**

Botones agrupados:
- Modules navigation (33 onclick `showScreen`): NO necesita backend
- Búsqueda producto (1 onclick): YA HECHO
- Cobrar (1 onclick): YA HECHO
- Inventario (~30 botones): Cablear a /api/inventory
- Clientes (~20 botones): Cablear a /api/customers
- Reportes (~15 botones): Crear /api/reports
- Configuración (~10 botones): Crear /api/settings
- Otros (~30 botones): caso por caso

### 🔥 PRIORIDAD 5: MultiPOS Suite (multipos_suite_v3.html)

**192 botones | Tiempo estimado: 32 horas**

Es el archivo más grande. Funcionalidad: gestión multi-sucursal.

Tablas necesarias:
```sql
CREATE TABLE volvix_branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  name TEXT,
  address TEXT,
  status TEXT,
  ...
);

CREATE TABLE volvix_branch_sales (
  -- agregada de pos_sales por branch
);
```

### PRIORIDAD 6: Etiqueta Designer (etiqueta_designer.html)

**18 botones | Tiempo estimado: 3 horas**

- Imprimir REAL (usar window.print() o jsPDF)
- Guardar plantillas en Supabase

```sql
CREATE TABLE volvix_label_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  name TEXT,
  design JSONB,  -- elementos del diseño
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### PRIORIDAD 7: Remote Control (volvix_remote.html)

**2 botones | Tiempo estimado: 4 horas**

Necesita WebRTC + servidor de señalización (complicado).
Alternativa: usar servicio externo como Daily.co, Twilio.

---

## 🛠️ COMANDOS ÚTILES

### Test endpoint:
```bash
curl https://volvix-pos.vercel.app/api/health
```

### Ver datos en Supabase:
```bash
SUPABASE="https://zhvwmzkcqngcaqpdxtwr.supabase.co"
KEY="eyJhbGciOiJI..."  # service key

# Listar usuarios
curl "$SUPABASE/rest/v1/pos_users?select=email,role" \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY"

# Insertar dato
curl -X POST "$SUPABASE/rest/v1/pos_products" \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"code":"123","name":"Test","price":10}'
```

### Deploy:
```bash
cd "C:\Users\DELL\Downloads\verion 340"
git add .
git commit -m "mensaje"
vercel --prod --yes
```

### Ver logs Vercel:
```bash
vercel inspect <deployment-url>
```

---

## 📊 ACTUALIZAR BITÁCORA

Cada vez que completes algo, actualiza `status.json`:

```javascript
// Estructura:
{
  "stats": {
    "total": 360,
    "done": <incrementar>,
    "in_progress": <activos>,
    "pending": <decrementar>
  },
  "modules": [
    {
      "name": "🛒 SalvadoreX POS",
      "total": 141,
      "done": <actualizar>,
      ...
    }
  ],
  "log": [
    // agregar entrada nueva
    { "time": "HH:MM:SS", "type": "ok", "text": "✅ Cableado X" }
  ]
}
```

El archivo `BITACORA_LIVE.html` se auto-refresh cada 5 segundos y mostrará tus cambios.

---

## 🎯 ESTRATEGIA RECOMENDADA

**Si tienes 80 horas (cableado completo)**:
1. Día 1-2: Owner Panel (20 hrs)
2. Día 3: AI modules + Marketplace (10 hrs)
3. Día 4-7: MultiPOS (32 hrs)
4. Día 8: SalvadoreX POS resto (10 hrs)
5. Día 9: Etiqueta + Remote (8 hrs)

**Si tienes menos tiempo (priorizar)**:
1. Owner Panel: dashboard + tenants (4 hrs)
2. Marketplace básico (2 hrs)
3. SalvadoreX POS: inventario + clientes (4 hrs)
4. Resto: dejar como UI demo

---

## ⚠️ ERRORES COMUNES A EVITAR

1. **NO modificar** `api/login` - Ya funciona
2. **NO cambiar** las URLs de Supabase
3. **NO deployar** sin testear localmente primero (curl)
4. **NO olvidar** el header `apikey:` en llamadas a Supabase
5. **SIEMPRE** usar `\.trim().replace(/[\r\n]+/g, '')` con env vars
6. **NUNCA** poner el Service Key en archivos públicos del cliente
7. **Verificar** que Supabase tabla existe ANTES de hacer POST
8. **Respetar** el schema de las tablas (algunos campos son NOT NULL)

---

## 🆘 SI TE TRABAS

1. Lee `BITACORA_PRUEBAS.md` para contexto histórico
2. Verifica `status.json` para ver estado actual
3. `vercel logs <url>` para errores backend
4. Browser DevTools (F12) para errores frontend
5. Supabase Dashboard para ver datos directos

---

## 📞 HANDOFF FINAL

Cuando termines todo, deja:
1. `status.json` con `done = total`
2. `BITACORA_LIVE.html` mostrando 100%
3. Commit final con mensaje "✅ COMPLETO: todos los botones cableados"
4. Actualizar este archivo con notas para el siguiente

---

**Última actualización**: 2026-04-25 19:30
**Por**: Claude Sonnet 4.7
**Próxima IA**: [Inserta aquí cuando cambies]
