# DEPLOY · Volvix Brand Generator

Pasos concretos para tener el generador corriendo y conectado a tu marketplace.

## Pre-requisitos

- Node.js 18+ instalado (Windows: descarga de nodejs.org)
- Cuenta Anthropic con créditos (https://console.anthropic.com)
- Cuenta Unsplash dev (https://unsplash.com/developers — 5 min)
- Tu marketplace.html corriendo (lo que ya tienes)
- Supabase (opcional, recomendado para producción)

---

## PASO 1 · Prueba local en Windows (10 min)

### 1.1. Descomprime el zip
```cmd
cd D:\proyectos\volvix
mkdir generator-test
cd generator-test
# Copia el contenido del volvix-generator.zip aquí
```

### 1.2. Instala dependencias
```cmd
npm install
```

### 1.3. Configura keys (en tu terminal, no en archivo)
**Windows CMD:**
```cmd
set ANTHROPIC_API_KEY=sk-ant-tu-key
set UNSPLASH_ACCESS_KEY=tu-key-unsplash
```

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-tu-key"
$env:UNSPLASH_ACCESS_KEY="tu-key-unsplash"
```

**Linux/Mac:**
```bash
export ANTHROPIC_API_KEY=sk-ant-tu-key
export UNSPLASH_ACCESS_KEY=tu-key-unsplash
```

### 1.4. Genera tu primera marca real
```cmd
node generator/brand-generator.js "nevería"
```

Si todo va bien (10-15 segundos):
```json
{
  "slug": "neveria",
  "cached": false,
  "brand": "Nevero",  // o lo que el AI haya decidido
  "vibe": "vibrant",
  "url": "/landings/neveria.html"
}
```

Y revisa los archivos:
```cmd
dir cache\neveria.json    # el config
dir landings\neveria.html # el HTML estático
```

### 1.5. Abre el HTML en el navegador
```cmd
start landings\neveria.html
```

**Inspecciona la calidad** — esto es lo importante:
- ¿El brand name suena bien?
- ¿El copy es específico del giro?
- ¿Los 3 robos son creíbles?
- ¿Las imágenes coinciden con el giro?

Si algo huele genérico → **itera el prompt** en `generator/brand-prompt.js` y regenera.

### 1.6. Genera 5 más para validar consistencia
```cmd
node generator/brand-generator.js "florería"
node generator/brand-generator.js "veterinaria"
node generator/brand-generator.js "lavandería"
node generator/brand-generator.js "papelería"
node generator/brand-generator.js "ferretería"
```

Cada una cuesta ~$0.04 USD = $0.20 total de prueba. Te da un signal claro de calidad.

---

## PASO 2 · Levanta el servidor local

### 2.1. Inicia
```cmd
npm start
# o: node generator/server.js
```

Salida esperada:
```
Volvix Brand Generator listening on :3000
```

### 2.2. Prueba con curl
```cmd
curl -X POST http://localhost:3000/api/giros/generate ^
  -H "content-type: application/json" ^
  -d "{\"giro\":\"vulcanizadora\"}"
```

Devuelve:
```json
{
  "slug": "vulcanizadora",
  "url": "/landings/vulcanizadora.html",
  "cached": false,
  "status": "pending",
  "estimatedTime": 12
}
```

### 2.3. Poll status hasta done
```cmd
curl http://localhost:3000/api/giros/status/vulcanizadora
```

Cuando responda `"status": "done"`:
```cmd
start http://localhost:3000/landings/vulcanizadora.html
```

---

## PASO 3 · Conecta con tu marketplace local

### 3.1. Copia el router v2 al directorio de tu marketplace
Tu marketplace está donde tengas `marketplace.html`. Copia el archivo nuevo al
mismo directorio:
```cmd
copy generator\volvix-brand-router-v2.js d:\ruta\a\tu\marketplace\
```

### 3.2. Edita marketplace.html
Busca esta línea:
```html
<script defer src="/volvix-brand-router.js"></script>
```

Reemplázala por:
```html
<script>window.VLX_API_BASE = 'http://localhost:3000';</script>
<script defer src="/volvix-brand-router-v2.js"></script>
```

### 3.3. Prueba el flujo completo
1. Abre tu marketplace.html en el navegador
2. Escribe "salón de uñas" en el input
3. Presiona Enter
4. Debes ver la pantalla "Diseñando tu sistema..." con 5 pasos animados
5. Después de ~12 seg, te redirige a `/landings/salon-de-unas.html`

---

## PASO 4 · Producción (servidor)

### 4.1. Sube el código a tu servidor
Si tienes acceso SSH a tu hosting actual:
```bash
# En tu Mac/Linux/WSL
scp -r volvix-generator usuario@tu-server.com:/var/www/
ssh usuario@tu-server.com
cd /var/www/volvix-generator
npm install
```

Si usas Vercel/Railway:
- Sube como proyecto separado
- Configura env vars en su UI
- Para Railway: `railway up`
- Para Vercel: `vercel deploy` (pero el filesystem no es persistente — usa Supabase)

### 4.2. Configura env vars en producción
En tu hosting / panel:
```
ANTHROPIC_API_KEY=sk-ant-...
UNSPLASH_ACCESS_KEY=...
PEXELS_API_KEY=...  (opcional, fallback)
PORT=3000  (o el que uses)
```

### 4.3. Configura systemd (para Linux) o PM2
**Con PM2 (recomendado):**
```bash
npm install -g pm2
pm2 start generator/server.js --name volvix-generator
pm2 save
pm2 startup  # sigue las instrucciones que imprime
```

### 4.4. Reverse proxy en tu nginx
```nginx
location /api/giros/ {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}

location /landings/ {
  alias /var/www/volvix-generator/landings/;
  try_files $uri =404;
  add_header Cache-Control "public, max-age=3600";
}
```

### 4.5. Actualiza marketplace.html para producción
```html
<script>window.VLX_API_BASE = 'https://api.tudominio.com';</script>
<script defer src="/volvix-brand-router-v2.js"></script>
```

Recarga, prueba con un giro nuevo, listo.

---

## PASO 5 · Migra cache a Supabase (recomendado)

El filesystem funciona pero Supabase es mejor para:
- Multi-server (load balancing)
- Backup automático
- Queries (¿cuáles giros se buscan más?)
- Editor admin

### 5.1. Crea la tabla en Supabase SQL editor
```sql
create table generated_brands (
  slug text primary key,
  brand text not null,
  giro text not null,
  vibe text not null,
  config jsonb not null,
  html text,                          -- el HTML completo (opcional)
  visits integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_brands_created on generated_brands(created_at desc);
create index idx_brands_visits on generated_brands(visits desc);
```

### 5.2. Modifica brand-generator.js
Reemplaza las funciones `checkCache` y `saveCache`:

```js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service key, no anon
);

async function checkCache(slug) {
  const { data } = await supabase
    .from('generated_brands')
    .select('config')
    .eq('slug', slug)
    .single();
  if (data?.config) {
    // increment visits async
    supabase.rpc('increment', { tbl: 'generated_brands', slug, col: 'visits' })
      .then(() => {}).catch(() => {});
  }
  return data?.config || null;
}

async function saveCache(slug, config) {
  await supabase.from('generated_brands').upsert({
    slug,
    brand: config.brand,
    giro: config.giro,
    vibe: config.vibe,
    config,
    updated_at: new Date().toISOString(),
  });
}
```

Instala el cliente:
```bash
npm install @supabase/supabase-js
```

Y agrega env vars:
```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...  (service key, NO anon)
```

---

## PASO 6 · Pre-warm de las marcas top

Para que los primeros usuarios no esperen 12 seg, pre-genera las top 15:

```bash
# Save este script como warm.js en el directorio root
node -e "
const { generateBrand } = require('./generator/brand-generator');
const top = [
  'cafetería','florería','veterinaria','taller mecánico','gimnasio',
  'panadería','papelería','lavandería','carwash','tortillería',
  'clínica dental','spa','óptica','joyería','librería'
];
(async () => {
  for (const g of top) {
    try {
      const r = await generateBrand(g);
      console.log('✓', r.slug, '—', r.config.brand);
    } catch (e) {
      console.error('✗', g, ':', e.message);
    }
  }
})();
"
```

Total: ~3 min + ~$0.60 USD. Las 15 marcas quedan instantáneas para siempre.

---

## TROUBLESHOOTING

### "Error: AI generation failed"
- Revisa que `ANTHROPIC_API_KEY` esté seteada
- Revisa créditos en https://console.anthropic.com/settings/billing
- Mira el log del servidor para el error exacto

### Las imágenes no cargan
- Sin `UNSPLASH_ACCESS_KEY`, el sistema usa placeholders genéricos
- Verifica tu key en https://unsplash.com/oauth/applications
- Free tier: 50 búsquedas/hora. Para más, solicita producción (gratis, demora 2 días).

### El brand name suena genérico
- Itera el prompt: agrega MÁS anti-ejemplos específicos
- Sube la temperatura de la AI si usas un modelo que la soporte
- Considera generar 3 variantes y elegir la mejor

### El servidor se cae
- PM2 lo restart automáticamente
- Mira `pm2 logs volvix-generator` para el error

---

## MONITOREO

Ve cuántas marcas generadas tienes y cuáles son las más visitadas:

```bash
# Filesystem:
ls cache/ | wc -l
# Supabase:
psql ... -c "select slug, brand, visits from generated_brands order by visits desc limit 20"
```

O agrega un endpoint admin a `server.js`:
```js
app.get('/api/admin/stats', async (req, res) => {
  const { data } = await supabase
    .from('generated_brands')
    .select('slug, brand, giro, visits, created_at')
    .order('visits', { ascending: false })
    .limit(50);
  res.json(data);
});
```

---

## SIGUIENTE ITERACIÓN

Cuando ya tengas 20-30 marcas generadas reales, vuelve aquí con:
1. 3 marcas que salieron MAL
2. 3 marcas que salieron BIEN

Con eso puedo refinar el prompt v2 → v3 dirigido a tus problemas reales.
