# Intro / Outro Script Reusable - Volvix POS

## Filosofia de Branding

- Reconocible en 1 segundo (el sonido + logo)
- Consistencia: TODOS los videos usan el mismo intro/outro
- Memorable: el sonido se vuelve "asociacion-marca" (como Netflix "ta-dum")
- Corto: max 5s intro, max 5s outro
- No dispensable: pero el viewer no lo siente "filler"

## INTRO ESTANDAR (5 segundos)

### Estructura

**Frame 0:00-0:01 (1s)**: Logo bumper
- Pantalla negra
- Logo Volvix POS aparece con animacion "scale-in" suave
- Logo en color naranja (#FF6B35) sobre negro
- Sonido: whoosh corto + "ta-dum" musical 2 notas (tono mayor, energetico)

**Frame 0:01-0:03 (2s)**: Tagline
- Logo se hace pequeno y se mueve a esquina superior izquierda
- Aparece tagline en centro: "El POS de tu negocio"
- Font: Inter Bold, 64pt, color blanco
- Animacion: typewriter effect (palabra por palabra)
- Sonido: tipeo sutil

**Frame 0:03-0:05 (2s)**: Hook del video especifico
- Tagline desaparece con fade-out
- Aparece el HOOK del video (ej: "Cobrar en 5 segundos")
- Font: Inter Black, 80pt, color naranja con outline blanco
- Animacion: punch-in (rapido scale 1.0 -> 1.1 -> 1.0)
- Sonido: bass drop sutil (una vez)
- Transition al video real: cut directo

### Voiceover Intro (opcional)
- "Bienvenido a Volvix POS"
- Solo si el video lo requiere (videos de onboarding, intro a plataforma)
- Si NO necesita voiceover, dejar solo SFX musical

### Variantes del Intro

#### Variante A: Standard (default)
- Como descrito arriba
- Para videos: 1, 2, 3, 5, 8, 9

#### Variante B: Energetic (para videos cortos / TikTok)
- Solo 3 segundos total
- Logo (1s) + Hook (2s)
- Skip tagline
- Para videos: 1 (TikTok), 4, 6, 10

#### Variante C: Professional (para videos B2B / LinkedIn)
- 6 segundos
- Logo (1s) + Tagline en ingles "Your Business POS" (2s) + Hook (3s)
- Para videos: 7, partes corporate

### Specs Tecnicos Intro

- Resolucion: 1920x1080 (16:9) y 1080x1920 (9:16)
- Frame rate: 30fps
- Duration exacta: 5.00s (variant A) / 3.00s (B) / 6.00s (C)
- Audio:
  - Music sting: 2-note tone, key C major, BPM 120
  - SFX whoosh: 0.3s, frequency sweep 200Hz-2kHz
  - Volume: -6dB peak
- Color:
  - Background: #000000
  - Logo: #FF6B35
  - Text: #FFFFFF
  - Accent: #FFB800 (amarillo highlight)

### Archivos Source

Crear y guardar en `docs/videos/assets/`:
- `intro-variant-a-1080p.mp4` (16:9 standard)
- `intro-variant-a-1080x1920.mp4` (9:16 vertical)
- `intro-variant-b-1080p.mp4` (16:9 energetic)
- `intro-variant-b-1080x1920.mp4` (9:16 vertical)
- `intro-variant-c-1080p.mp4` (16:9 professional)
- `intro-variant-c-1080x1920.mp4` (9:16 vertical)

Cada uno con audio embedded + version "music only" para mezclar.

## OUTRO ESTANDAR (5 segundos)

### Estructura

**Frame 0:00-0:01 (1s)**: Transition del video al outro
- Fade-out del contenido video (0.5s fade to dark)
- Logo Volvix POS aparece en centro pantalla con scale-up
- Sonido: outro music sting 4 notas (resolucion del intro tono)

**Frame 0:01-0:03 (2s)**: CTA principal
- URL grande: "salvadorexoficial.com/registro"
- Font: Inter Bold, 72pt, color blanco
- Boton CTA naranja: "Empieza gratis"
- Subtitulo abajo: "Sin tarjeta de credito - 14 dias gratis"
- Animacion: bounce-in del boton
- Sonido: ding suave

**Frame 0:03-0:05 (2s)**: Suscribe + Social
- "Suscribete para mas tutoriales" texto centrado
- Iconos sociales abajo:
  - YouTube (subscribe)
  - TikTok @volvixpos
  - Instagram @volvixpos
  - LinkedIn /volvix-pos
- Animacion: stagger fade-in iconos
- Sonido: outro music sostiene
- End: fade-to-black 0.5s

### Voiceover Outro (estandar)

```
"Empieza gratis hoy en salvadorexoficial.com/registro. Sin tarjeta de credito. Suscribete para mas tutoriales semanales."
```

Duracion locucion: 5-6 segundos (encaja en outro)

### Variantes del Outro

#### Variante A: Standard (default - todos los videos)
- 5 segundos
- Voiceover incluido
- Tono: amigable, conclusivo

#### Variante B: Short (para TikTok / Reels < 30s)
- 3 segundos
- Solo URL + CTA boton
- Sin voiceover (subtitulo grande "salvadorexoficial.com/REGISTRO")
- Sin social links (no caben en vertical)

#### Variante C: Live event / urgencia
- 6 segundos
- Voiceover: "Solo este mes: descuento 30% en plan anual. Codigo VIDEO30."
- Para campanas especificas

### Specs Tecnicos Outro

- Misma resolucion intro
- Frame rate: 30fps
- Duration exacta: 5.00s (A) / 3.00s (B) / 6.00s (C)
- Audio:
  - Music: outro 4-note resolution, BPM 120
  - SFX ding: 0.5s
  - Volume voiceover: -3dB peak (mas alto que music)
  - Music ducking: -50% durante voiceover
- Color: mismo schema intro

### Archivos Source

- `outro-variant-a-1080p.mp4`
- `outro-variant-a-1080x1920.mp4`
- `outro-variant-b-1080p.mp4`
- `outro-variant-b-1080x1920.mp4`
- `outro-variant-c-1080p.mp4` (para campanas especiales)
- `outro-variant-c-1080x1920.mp4`

## Music / SFX Pack Reusable

### Track Principal Intro/Outro

**Track**: "Volvix Brand Stinger" (custom commission o royalty-free)
- Duracion: 8 segundos total (5s intro + 3s outro)
- BPM: 120
- Key: C major
- Style: lo-fi corporate hybrid
- Instruments: piano + soft synth pad + sub bass + percussion ligera
- Mood: profesional pero amigable, energetico pero no agresivo

**Donde conseguir**:
- Custom: Fiverr music composer ($150-300 USD una vez)
- Royalty-free alternativa: Epidemic Sound "Corporate Logo Stinger" pack
- Bensound: "Tenderness" o "Buddy" (necesita atribucion)

### SFX Pack

| SFX | Cuando usar | Source | Volume |
|-----|-------------|--------|--------|
| Whoosh transition | Inicio intro | Pixabay/freesound | -6dB |
| Ta-dum 2 notas | Logo reveal | Custom o royalty-free | -3dB |
| Tipeo teclado | Tagline typewriter | Pixabay | -12dB |
| Bass drop sutil | Hook punch-in | Pixabay | -6dB |
| Ding suave | CTA boton outro | Pixabay | -6dB |
| Outro 4-note resolution | Final outro | Custom | -3dB |

## Transition Music (entre escenas internas)

Cada video tiene cortes/transitions internos. Usar estos sounds:

| Transition | SFX | Cuando |
|-----------|-----|--------|
| Cut entre features | Whoosh corto (0.3s) | Cambio de modulo |
| Time-lapse | Tick clock acelerado | Mostrar acciones rapidas |
| Reveal numero/stat | Bass drop + ding | Total de venta, conversion |
| Notification toast | Ping suave | Toast aparece |
| Page transition | Slide whoosh | Cambio de pantalla |

## Color Palette Estandar

### Brand Colors

```
Primary Orange: #FF6B35
Secondary Yellow: #FFB800
Background Black: #000000
Text White: #FFFFFF
Success Green: #10B981
Error Red: #EF4444
Info Blue: #3B82F6
Neutral Gray: #6B7280
```

### Uso por Tipo de Texto

- Hooks principales: Orange (#FF6B35)
- Subtitulos: White (#FFFFFF)
- Highlights: Yellow (#FFB800)
- CTAs: Orange background + White text
- Toast success: Green (#10B981)
- Toast error: Red (#EF4444)

## Typography Estandar

### Fonts

- **Heading principal**: Inter Black 80-100pt
- **Subheading**: Inter Bold 48-64pt
- **Body text**: Inter Regular 32-40pt
- **Caption**: Inter Medium 28pt
- **CTA button**: Inter Bold 36pt
- **Subtitulos burned-in**: Inter Bold 32pt con outline 2px negro

### Reglas

- NUNCA mas de 2 fonts en un video
- NUNCA Comic Sans, Papyrus, Trajan, fuentes "fancy"
- Inter es la unica font para Volvix POS branding
- Para acentos: Inter Black o Inter ExtraBold

## Logo Usage

### Reglas de uso

1. SIEMPRE en intro (1s) y outro (5s)
2. SIEMPRE watermark esquina inferior derecha del video (sutil, 30% opacity, 80px tamano)
3. NUNCA distorsionar (mantener aspect ratio)
4. NUNCA cambiar colores fuera de paleta
5. Espacio libre alrededor: minimo 20px en todas direcciones

### Versiones

- Logo principal: full color (orange + white text)
- Logo invertido: blanco sobre fondo oscuro
- Logo monocromatico: para fondos complejos
- Icono solo (sin texto): para favicons / esquinas

## Workflow para Editores

### Setup Carpeta Master en Premiere/CapCut

```
volvix-master-template/
├── 01-intro/
│   ├── intro-variant-a-1080p.mp4
│   ├── intro-variant-a-1080x1920.mp4
│   ├── intro-variant-b-1080p.mp4
│   └── intro-variant-c-1080p.mp4
├── 02-outro/
│   ├── outro-variant-a-1080p.mp4
│   └── outro-variant-a-1080x1920.mp4
├── 03-sfx/
│   ├── whoosh.wav
│   ├── ding.wav
│   ├── ta-dum.wav
│   └── ...
├── 04-music/
│   ├── volvix-brand-stinger.wav
│   └── lo-fi-loop-30s.wav
├── 05-graphics/
│   ├── logo-volvix-orange.png
│   ├── logo-volvix-white.png
│   ├── watermark.png
│   └── lower-third-template.psd
├── 06-fonts/
│   ├── Inter-Regular.otf
│   ├── Inter-Bold.otf
│   └── Inter-Black.otf
├── 07-luts/
│   ├── volvix-warm-cinematic.cube
│   └── volvix-corporate-clean.cube
└── 08-templates/
    ├── premiere-template.prproj
    └── capcut-template.zip
```

### Pasos para Cada Video Nuevo

1. Abrir `templates/premiere-template.prproj` (o CapCut)
2. Reemplazar timeline central con grabacion del video
3. Mantener intro y outro intactos (NO modificar)
4. Agregar lower-thirds y SFX segun storyboard
5. Color grade con LUT de carpeta `07-luts/`
6. Audio: levels normalized -3dB peak
7. Subtitulos burned-in con font Inter
8. Watermark logo persiste (08-graphics/watermark.png)
9. Export con presets por plataforma (ver recording-guide.md)

## Quality Control Checklist

Antes de publicar cualquier video:

- [ ] Intro tiene logo + tagline + hook (5s exacto)
- [ ] Outro tiene logo + URL + CTA + social (5s exacto)
- [ ] Voiceover outro suena profesional
- [ ] Watermark logo visible esquina (no estorba contenido)
- [ ] Color palette consistente (orange + white predominante)
- [ ] Font es Inter en todo el video
- [ ] No hay fonts "fancy" prohibidas
- [ ] Music intro/outro reconocible (es el sound de Volvix)
- [ ] SFX pack usado consistentemente
- [ ] Subtitulos en blanco con outline negro 2px
- [ ] Transitions usan whoosh estandar
- [ ] Total duracion es la planeada (no sobrepasarse)
- [ ] CTA URL legible y persistente
- [ ] No hay errores typo en text overlays
- [ ] Brand consistency visual: si pones intro al lado de otro video, se ven igual

## Notas Finales

- El intro/outro NO debe ser visto como "perdida de tiempo"
- Es la parte que construye recordatoria de marca
- Despues de 10 videos consistentes, viewers asocian el sound + logo con Volvix
- Mantener consistencia ABSOLUTA: cualquier variacion debilita el branding
- Si futuras versiones cambian el logo o tagline, regrabar TODOS los intros
- Backup de archivos source en cloud (Drive + Dropbox + GitHub LFS)
