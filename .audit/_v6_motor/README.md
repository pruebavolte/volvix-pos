# Volvix Motor — Generador de landings por marca

Una arquitectura **config-driven** para generar landings independientes por giro
de negocio. La misma estructura HTML, identidades completamente distintas.

## Archivos

| Archivo | Propósito |
|---|---|
| `motor.html` | Template universal. Renderiza cualquier marca leyendo `?b=slug` |
| `brands.config.js` | Datos de todas las marcas (paleta, fuentes, copy, imágenes, robos) |
| `build.js` | Generador estático Node — produce un HTML por marca en `/dist` |

## Uso rápido

### Modo dev (sin build, sirve cualquier marca)

Sube `motor.html` y `brands.config.js` al mismo directorio. Abre:

- `motor.html` → muestra el picker con todas las marcas
- `motor.html?b=pareo` → renderiza Pareo (zapatería)
- `motor.html?b=comandero` → renderiza Comandero (restaurante)
- `motor.html?b=navaja` → renderiza Navaja (barbería)
- `motor.html?b=receta` → renderiza Receta (farmacia)
- `motor.html?b=tendito` → renderiza Tendito (abarrotes)

### Modo producción (SSG, HTMLs estáticos)

```bash
node build.js
```

Genera en `/dist`:

```
dist/
├── pareo.html
├── comandero.html
├── navaja.html
├── receta.html
├── tendito.html
├── motor.html         (copia)
└── brands.config.js   (copia)
```

Cada HTML es **standalone** — puedes subirlo a cualquier hosting estático
(Vercel, Netlify, GitHub Pages, S3, tu servidor) sin nada extra.

Para generar solo algunas:

```bash
node build.js pareo navaja
```

## Cómo agregar una marca nueva

Abre `brands.config.js` y agrega un objeto. Plantilla mínima:

```js
const BRAND_ESPUMA = {
  slug: 'espuma',
  brand: 'Espuma',
  tagline: 'El sistema para cafeterías que sí cobran cada extra',
  giro: 'cafetería',
  giroPlural: 'cafeterías',
  vibe: 'editorial', // 'editorial' | 'vibrant' | 'darkPremium' | 'clinical' | 'warmLocal'

  palette: {
    bg: '#FAF3E7', surface: '#FFFFFF', paper: '#F5EBD8',
    ink: '#3D2817', ink2: '#5C3815', muted: '#8B6F47',
    line: '#E8D9BD', accent: '#3D2817', accent2: '#C97A2E',
  },
  fonts: {
    display: 'DM Serif Display',
    body:    'Inter',
    script:  'Caveat',
    mono:    'JetBrains Mono',
  },

  hero: {
    eyebrow: 'El sistema para cafeterías mexicanas',
    h1: 'Cada <em>shot</em>.<br>Cada <em>modificador</em>.<br>Cobrado.',
    deck: 'Espuma es el POS hecho para cafeterías. Modificadores ilimitados, lealtad digital, comandera para barista y reportes por hora pico.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver demo',
    metaLine: '$0 inicial · setup en 5 min',
  },

  images: {
    hero: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&h=1600&fit=crop&q=85',
    heroAlt: 'Barista preparando café',
    showcase: [
      // 9 imágenes con {url, tag, size: 'lg'|'md'|'sm'}
      {url:'...', tag:'Latte art', size:'lg'},
      // ...
    ],
    context: [
      {url:'...', caption:'Barista usa la comandera'},
      {url:'...', caption:'Cliente paga con QR'},
      {url:'...', caption:'Tarjeta de lealtad digital'},
    ],
  },

  features: [
    {ico:'edit',    h:'Modificadores ilimitados', d:'Tamaño, leche, extras, shots. Cada combinación con su precio.'},
    // ...6 funciones
  ],

  stats: [
    {v:'186', l:'Tickets hoy'},
    {v:'60',  l:'Ticket promedio', prefix:'$'},
    {v:'5',   l:'Min de setup', suffix:'min'},
    {v:'0',   l:'Costo inicial', prefix:'$'},
  ],

  quote: {
    text: 'Antes...',
    sig: 'Nombre',
    role: 'Cafetería en...',
  },

  thefts: [
    {title:'...', rob:'...', fix:'...'},
    // 3 robos
  ],
};

// Y registrar al final:
const BRANDS = {
  pareo:     BRAND_PAREO,
  comandero: BRAND_COMANDERO,
  navaja:    BRAND_NAVAJA,
  receta:    BRAND_RECETA,
  tendito:   BRAND_TENDITO,
  espuma:    BRAND_ESPUMA,  // ← NUEVA
};
```

Eso es todo. Luego `node build.js` y aparece `espuma.html` en `/dist`.

## Sistema de "vibes"

Cada marca declara un `vibe`. El motor aplica overrides de CSS según el vibe
para que cada familia se sienta diferente sin duplicar HTML:

| Vibe | Uso | Tipografía típica | Característica visual |
|---|---|---|---|
| `editorial` | Pareo (zapatería) | Bodoni Moda italic | Refined, magazine, italics |
| `vibrant` | Comandero (restaurante) | Archivo Black | Bold caps con highlights amarillos |
| `darkPremium` | Navaja (barbería) | Oswald condensed | UPPERCASE + underlines dorados |
| `clinical` | Receta (farmacia) | Plus Jakarta Sans 800 | Clean, medical, bold sans |
| `warmLocal` | Tendito (abarrotes) | Fraunces serif | Script italic para acentos |

## Imágenes por giro

Cada marca tiene en `images`:

- **`hero`** — 1 imagen para el hero (3:4 vertical)
- **`showcase`** — **9 imágenes** para la galería masonry (mezcla de tamaños lg/md/sm)
- **`context`** — **3 imágenes** mostrando el sistema en uso (4:3 horizontal)

Total: **13 imágenes por marca**, todas específicas del giro. La galería es el
WOW visual principal.

## Integración con marketplace

El `volvix-brand-router.js` que ya tienes mapea `giro → URL`. Cuando el cliente
hace click en "Restaurante" en tu marketplace, lo redirige a `comandero.html`.

```
Marketplace.html
       ↓ (chip "Restaurante")
volvix-brand-router.js intercepta
       ↓
window.location = 'comandero.html'  ← generado por build.js
       ↓
Cliente ve landing de Comandero
       ↓
Footer dice "Powered by Volvix Systems"
```

## Deploy

### Opción A: Subdominio por marca
```
pareo.volvix.app    → pareo.html
comandero.volvix.app → comandero.html
navaja.volvix.app    → navaja.html
```

### Opción B: Paths
```
volvix.app/pareo     → pareo.html
volvix.app/comandero → comandero.html
```

### Opción C: Dominios separados (cuando puedas)
```
pareo.mx       → pareo.html
comandero.mx   → comandero.html
navaja.mx      → navaja.html
```

## Marcas ya pobladas

| Slug | Marca | Giro | Vibe |
|---|---|---|---|
| `pareo` | Pareo | Zapatería | editorial |
| `comandero` | Comandero | Restaurante | vibrant |
| `navaja` | Navaja | Barbería | darkPremium |
| `receta` | Receta | Farmacia | clinical |
| `tendito` | Tendito | Abarrotes | warmLocal |

## Pendientes (agrega al config cuando los necesites)

- `espuma` — Cafetería (warmLocal o editorial)
- `petalo` — Florería (warmLocal con scripts)
- `pata` — Veterinaria (clinical con friendly)
- `refacciona` — Taller mecánico (industrial, mono fonts)
- `repe` — Gimnasio (energetic, verde neón)
- `bloque` — Papelería (clean)
- `burbuja` — Lavandería (clean con celeste)
