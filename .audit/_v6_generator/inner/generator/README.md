# Volvix Brand Generator

Sistema que **genera landings de marca on-demand** cuando un usuario busca un giro
que no existe. Cada landing nueva queda **cacheada**, así que el siguiente usuario
que busque el mismo giro ve la landing al instante.

## Cómo funciona

```
Usuario en marketplace.html escribe "vendo nieves"
        ↓
brand-router intercepta: ¿hardcoded? NO
        ↓
POST /api/giros/generate { giro: "vendo nieves" }
        ↓
[BACKEND]
   ↓ checkCache("nieves") → no existe
   ↓ AI genera config (slug, brand, paleta, copy, robos, queries de imágenes)
   ↓ image-search trae 13 imágenes de Unsplash
   ↓ render HTML usando motor.html template
   ↓ guarda /cache/nieves.json + /landings/nieves.html
        ↓
Respuesta: { url: '/landings/nieves.html', status: 'pending' }
        ↓
[FRONTEND]
   ↓ Muestra UI "Diseñando tu sistema..." con 5 pasos animados
   ↓ Polls /api/giros/status/nieves cada 1.2s
   ↓ Cuando status=done → redirige a /landings/nieves.html
        ↓
Usuario ve una landing 100% diseñada para nieverías

═══ El SEGUNDO usuario ═══
Usuario en marketplace.html escribe "nieves"
        ↓
POST /api/giros/generate { giro: "nieves" }
        ↓
checkCache("nieves") → ya existe ✓
        ↓
Respuesta INMEDIATA: { url, cached: true }
        ↓
Redirige al instante. Sin AI, sin esperar.
```

## Estructura

```
generator/
├── brand-prompt.js          # El prompt de IA (LA pieza clave)
├── brand-generator.js       # Orquestador: AI + images + render
├── image-search.js          # Unsplash + Pexels + placeholder
├── render.js                # Server-side HTML rendering
├── server.js                # Express API (3 endpoints)
└── volvix-brand-router-v2.js # Cliente: intercepta + UI de progreso

cache/
└── {slug}.json              # Configs generadas

landings/
└── {slug}.html              # HTMLs estáticos generados
```

## Setup

### 1. Instalar dependencias
```bash
npm init -y
npm install express
# Node 18+ ya trae fetch global. Si usas Node 16, agrega: npm install node-fetch
```

### 2. Configurar API keys
```bash
# Anthropic (recomendado, mejor calidad)
export ANTHROPIC_API_KEY=sk-ant-...

# O OpenAI
export OPENAI_API_KEY=sk-...

# Unsplash (gratis, 50 req/hr)
export UNSPLASH_ACCESS_KEY=...
# Pexels (gratis, 200 req/hr) — fallback
export PEXELS_API_KEY=...
```

Obtén las keys:
- **Unsplash**: https://unsplash.com/developers (5 minutos, demo app está bien)
- **Anthropic**: https://console.anthropic.com/
- **Pexels**: https://www.pexels.com/api/

### 3. Copiar el motor.html
El generador necesita `motor.html` y `brands.config.js` un nivel arriba:
```
proyecto/
├── motor.html              ← del paquete volvix-motor
├── brands.config.js        ← del paquete volvix-motor
└── generator/
    ├── server.js
    └── ...
```

### 4. Arrancar
```bash
node generator/server.js
# → Volvix Brand Generator listening on :3000
```

### 5. Probar
```bash
curl -X POST http://localhost:3000/api/giros/generate \
  -H "content-type: application/json" \
  -d '{"giro":"nevería"}'
```

Si todo va bien:
- `/cache/neveria.json` se crea con el config
- `/landings/neveria.html` se crea con la landing
- Visita http://localhost:3000/landings/neveria.html para verla

### 6. Conectar tu marketplace
En `marketplace.html`, **reemplaza** la línea actual del router:
```html
<script defer src="/volvix-brand-router.js"></script>
```
por la nueva v2:
```html
<script defer src="/volvix-brand-router-v2.js"></script>
```

Configura el endpoint si no es relativo:
```html
<script>window.VLX_API_BASE = 'https://api.tudominio.com';</script>
<script defer src="/volvix-brand-router-v2.js"></script>
```

## Tu sistema existente

Tienes ~150 landings ya generadas con tu sistema actual. **No las traigas todas**.
La estrategia óptima:

1. **Deja las hardcoded como están**: Comandero, Navaja, Pareo, Receta, Tendito
   son tus 5 hero brands. Trabajadas a mano = mejor calidad. El router las usa
   primero.

2. **Las 145 restantes se regeneran on-demand** la primera vez que alguien las
   visite. Una vez cacheadas, son instantáneas. Después de unas semanas, todas
   las relevantes ya estarán cacheadas en alta calidad.

3. **Si quieres acelerar**: puedes hacer un script de "warm-up" que genere las
   marcas más populares en batch:
   ```bash
   node -e "
   const { generateBrand } = require('./generator/brand-generator');
   ['cafeteria','floreria','veterinaria','taller mecanico','gimnasio','panaderia']
     .forEach(g => generateBrand(g).then(r => console.log(r.slug)));
   "
   ```

## Costos estimados

Por marca generada:
- **Anthropic Opus**: ~$0.05 USD (3-4k tokens output)
- **OpenAI GPT-4o**: ~$0.03 USD
- **Unsplash**: gratis (50 búsquedas/hora → 4 marcas/hora si no haces caché)
- **Pexels**: gratis (200/hora)

Con caché efectivo, **una marca solo se paga UNA vez**. Para 145 giros únicos
generados: ~$7.25 USD total. Para siempre.

## El prompt es lo más importante

`brand-prompt.js` define la calidad. Ahí están:
- 10 reglas no negociables (nombre, vibe, copy, etc.)
- 5 vibes con cuándo usar cada uno
- 2 ejemplos few-shot completos (Pareo + Comandero)
- El schema exacto del output

**Itera el prompt cuando veas patrones malos** en lo generado. Cada cambio mejora
TODAS las landings futuras.

## Endpoints del API

| Método | Path | Descripción |
|--|--|--|
| `POST` | `/api/giros/generate` | Genera o devuelve cache. Body: `{giro: string}` |
| `GET`  | `/api/giros/status/:slug` | Polling del estado |
| `GET`  | `/api/giros/list` | Lista todas las marcas generadas |
| `GET`  | `/landings/:slug.html` | Sirve el HTML estático |

## Integración con tu Supabase actual

Si quieres guardar los configs en Supabase (no en filesystem), reemplaza
`checkCache` y `saveCache` en `brand-generator.js`:

```js
// En vez de filesystem, usar Supabase:
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCache(slug) {
  const { data } = await supabase
    .from('generated_brands')
    .select('config')
    .eq('slug', slug)
    .single();
  return data?.config || null;
}

async function saveCache(slug, config) {
  await supabase.from('generated_brands').upsert({
    slug,
    config,
    brand: config.brand,
    giro: config.giro,
    vibe: config.vibe,
    created_at: new Date().toISOString(),
  });
}
```

Schema de la tabla:
```sql
create table generated_brands (
  slug text primary key,
  brand text not null,
  giro text not null,
  vibe text not null,
  config jsonb not null,
  created_at timestamptz default now(),
  visits int default 0
);
create index idx_generated_brands_created on generated_brands(created_at desc);
```

## Próximos pasos sugeridos

1. **Conectar a tu API actual**: tu marketplace ya tiene `/api/giros/search` — adapta
   ese endpoint para usar `generateBrand()` cuando no encuentre nada en tu DB.

2. **Pre-warm las top 20**: genera las marcas más buscadas históricamente para
   que la primera visita ya sea instantánea.

3. **Editor de brands**: una pantalla admin donde puedas editar el config de una
   marca generada y regenerar el HTML. Útil cuando una marca específica necesita
   tweaks manuales.

4. **A/B testing**: genera 2 variantes de la misma marca y mide cuál convierte
   más. El prompt ya soporta esto: pásale `hints: "variant A: aggressive copy"`.
