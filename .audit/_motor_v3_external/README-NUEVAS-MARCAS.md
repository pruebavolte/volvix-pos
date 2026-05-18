# Volvix Motor v3 — 10 marcas hero

## Lo que hay ahora

| Slug | Marca | Sector / Giros que cubre | Vibe | Live Demo |
|---|---|---|---|---|
| pareo | **Pareo** | Zapatería, calzado | editorial | stock |
| comandero | **Comandero** | Restaurante, taquería, pizzería | vibrant | kds |
| navaja | **Navaja** | Barbería | darkPremium | booking |
| receta | **Receta** | Farmacia | clinical | expiry |
| tendito | **Tendito** | Abarrotes, tiendita, frutería | warmLocal | fiado |
| **pulso** | **Pulso** | **Salud y bienestar (50 giros)** | clinical | booking |
| **brillo** | **Brillo** | **Belleza y estética (45 giros)** | editorial | booking |
| **folio** | **Folio** | **Servicios profesionales (35 giros)** | editorial | booking |
| **forja** | **Forja** | **Deporte y recreación (35 giros)** | vibrant | booking |
| **tarima** | **Tarima** | **Entretenimiento y eventos (35 giros)** | darkPremium | kds |

Las 5 marcas en **negritas** son las nuevas. Cubren los 200 giros "más identitarios" de tu catálogo.

## Cómo conectarlas (esto es lo que le pides a tu IA)

### Para tu Claude Code / IA de coding:

```
He agregado 5 nuevas marcas hero al sistema Volvix:
- pulso.html     → Salud y Bienestar (clínicas, doctores, dental, óptica, fisio, nutriólogo, psicólogo, etc.)
- brillo.html    → Belleza y Estética (salones, spa, estéticas, uñas, depilación, etc.)
- folio.html     → Servicios Profesionales (abogados, contadores, asesores, notarios, etc.)
- forja.html     → Deporte y Recreación (gym, crossfit, yoga, pilates, danza, etc.)
- tarima.html    → Entretenimiento y Eventos (bares, antros, salones de eventos, banquetes, etc.)

Tarea: actualiza el archivo volvix-brand-router-v2.js (o el equivalente que tengo en producción)
para mapear los giros de los sectores 5-9 del catálogo a estas marcas, en el objeto VLX_BRANDS.

Reglas de mapeo:
1. Cualquier giro de salud, médico, clínica, dental, óptica, fisio, nutrió, psicología → pulso
2. Cualquier giro de estética, salón, spa, uñas, maquillaje, depilación, barbería de mujer → brillo
3. Cualquier giro de despacho, abogado, contador, asesor, notario, consultor, arquitecto → folio
4. Cualquier giro de gym, fitness, yoga, pilates, danza, deporte, artes marciales → forja
5. Cualquier giro de bar, antro, salón de eventos, banquete, catering, karaoke → tarima

Para los demás giros que NO caigan en estas 5 categorías ni en las 5 originales (pareo, comandero, navaja, receta, tendito),
sigue usando el sistema de generación on-demand existente.
```

## Archivos en este zip

```
volvix-motor-v3/
├── motor.html              ← Template universal (sin cambios)
├── brands.config.js        ← Config con las 10 marcas (vs 5 antes)
├── build.js                ← Script para regenerar
└── dist/                   ← 10 HTMLs estáticos
    ├── pareo.html
    ├── comandero.html
    ├── navaja.html
    ├── receta.html
    ├── tendito.html
    ├── pulso.html          ★ NUEVA
    ├── brillo.html         ★ NUEVA
    ├── folio.html          ★ NUEVA
    ├── forja.html          ★ NUEVA
    └── tarima.html         ★ NUEVA
```

## Cómo probar antes de subir a producción

```bash
cd dist
python3 -m http.server 8000
# Abre http://localhost:8000/pulso.html
# http://localhost:8000/brillo.html
# http://localhost:8000/folio.html
# http://localhost:8000/forja.html
# http://localhost:8000/tarima.html
```

Cada una debe verse claramente distinta de las demás (paleta, fuente, tono).
