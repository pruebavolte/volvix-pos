# Embed Volvix Tutorials — Instrucciones

Los 10 tutoriales animados de Volvix POS son archivos HTML self-contained
(CSS animations + JS mínimo, sin dependencias externas, sin requests de red).

Funcionan offline, son livianos (~6-10 KB c/u) y accesibles en cualquier navegador.

---

## Catálogo

| # | ID | Título | Duración |
|---|----|--------|----------|
| 01 | `01-primera-venta` | Tu primera venta | 30s |
| 02 | `02-crear-producto` | Crear un producto | 25s |
| 03 | `03-cierre-z` | Cierre Z (fin del día) | 25s |
| 04 | `04-modo-offline` | Modo offline | 25s |
| 05 | `05-cliente-credito` | Cliente a crédito | 25s |
| 06 | `06-mis-modulos` | Activar módulos | 25s |
| 07 | `07-etiqueta-disenar` | Diseñar etiqueta | 25s |
| 08 | `08-devolucion` | Devolución | 25s |
| 09 | `09-promocion` | Crear promoción | 25s |
| 10 | `10-registro-3min` | Registro en 3 min | 25s |

URL base de producción (ejemplo):
`https://volvix-pos.vercel.app/tutorials/{id}.html`

URL local (development):
`http://localhost:3000/tutorials/{id}.html`

Galería index: `/tutorials/index.html`

---

## 1. iframe básico (cualquier sitio)

```html
<iframe src="https://volvix-pos.vercel.app/tutorials/01-primera-venta.html"
        width="800" height="600"
        frameborder="0"
        loading="lazy"
        title="Tutorial Volvix POS — Tu primera venta">
</iframe>
```

Recomendado:
- `loading="lazy"` para que no cargue hasta que el usuario haga scroll
- Aspect ratio sugerido: `4:3` o `16:10`
- Mobile responsive: ver sección iframe responsive abajo

---

## 2. iframe responsive (mobile-first)

```html
<div style="position:relative; width:100%; max-width:760px; aspect-ratio:4/3;">
  <iframe src="https://volvix-pos.vercel.app/tutorials/02-crear-producto.html"
          style="position:absolute; inset:0; width:100%; height:100%; border:0; border-radius:12px;"
          loading="lazy"
          title="Tutorial — Crear producto">
  </iframe>
</div>
```

---

## 3. Notion

Notion no permite iframes arbitrarios pero sí soporta `/embed`:

1. En la página de Notion, escribe `/embed` y selecciona "Embed"
2. Pega la URL: `https://volvix-pos.vercel.app/tutorials/01-primera-venta.html`
3. Ajusta el tamaño arrastrando la esquina inferior derecha

Si Notion bloquea el embed (por CSP), usa la galería pública:
`https://volvix-pos.vercel.app/tutorials/`

---

## 4. Webflow

1. En el editor, arrastra un componente **Embed** (HTML embed)
2. Pega:

```html
<iframe src="https://volvix-pos.vercel.app/tutorials/03-cierre-z.html"
        width="100%" height="600"
        frameborder="0" loading="lazy"
        style="border-radius:12px;">
</iframe>
```

3. Publica el sitio.

---

## 5. WordPress

### Bloque "HTML personalizado" (Gutenberg)
1. Añade un nuevo bloque -> "HTML personalizado"
2. Pega el código iframe del paso 1

### Editor clásico
1. Cambia a vista "Texto"/"HTML"
2. Pega:

```html
<iframe src="https://volvix-pos.vercel.app/tutorials/04-modo-offline.html"
        width="800" height="600" loading="lazy"></iframe>
```

### Plugin recomendado si tu tema bloquea iframes
- "Iframe Embed for Gutenberg" — permite iframes seguros vía shortcode

```
[iframe src="https://volvix-pos.vercel.app/tutorials/05-cliente-credito.html" width="800" height="600"]
```

---

## 6. Modal con el wiring JS (recomendado para apps internas)

Si tu app ya carga `volvix-tutorial-player-wiring.js`, basta con:

```html
<script src="/volvix-tutorial-player-wiring.js"></script>

<!-- Cualquier botón con este atributo abre modal -->
<button data-volvix-tutorial="01-primera-venta">
  ¿Cómo hacer mi primera venta?
</button>

<!-- O programático -->
<script>
  document.getElementById("ayuda").onclick = () => {
    window.VolvixTutorial.play("06-mis-modulos");
  };
</script>
```

Ventajas:
- No deja la página actual
- Cierra con ESC o click fuera
- Lazy load del iframe

---

## 7. Email (HTML email)

Los clientes de email **no soportan iframes** ni JS. En su lugar:

```html
<a href="https://volvix-pos.vercel.app/tutorials/01-primera-venta.html"
   target="_blank">
  <img src="https://volvix-pos.vercel.app/tutorials/preview/01-primera-venta.png"
       alt="Ver tutorial: Tu primera venta"
       width="600" style="border-radius:12px;">
</a>
```

(Las previews PNG se generan a parte; alternativa: link de texto al `index.html` de la galería.)

---

## 8. React / Next.js

```jsx
export function VolvixTutorialEmbed({ id, height = 600 }) {
  return (
    <iframe
      src={`/tutorials/${id}.html`}
      width="100%"
      height={height}
      style={{ border: 0, borderRadius: 12 }}
      loading="lazy"
      title={`Tutorial Volvix ${id}`}
    />
  );
}

// Uso:
<VolvixTutorialEmbed id="07-etiqueta-disenar" />
```

---

## 9. Vue

```vue
<template>
  <iframe
    :src="`/tutorials/${id}.html`"
    width="100%"
    :height="height"
    style="border:0; border-radius:12px"
    loading="lazy"
  />
</template>

<script setup>
defineProps({ id: String, height: { type: Number, default: 600 } });
</script>
```

---

## 10. Headers / CSP

Si servís los tutoriales desde un dominio distinto al sitio padre, asegurate
de NO bloquearlos con `X-Frame-Options: DENY`. Para permitir embed en sitios externos:

```
Content-Security-Policy: frame-ancestors 'self' https://*.tu-cliente.com
```

O para permitir embed universal (galería pública):
```
X-Frame-Options: SAMEORIGIN
```

---

## Tips de UX

- **Ponelos cerca del botón que enseñan**: el tutorial de "Crear producto"
  va al lado del botón "Nuevo producto", no en una pestaña Help separada.
- **Caption explicativo arriba** del iframe: "Te lleva 25 seg ver cómo se hace".
- **Pause/restart visible**: cada tutorial trae botones; respetalos en CSS.
- **Mobile**: usa aspect-ratio responsive (ver sección 2).

---

## Verificar que funciona

```bash
# Local
open http://localhost:3000/tutorials/index.html

# Producción
curl -I https://volvix-pos.vercel.app/tutorials/01-primera-venta.html
# Debe responder 200 y Content-Type: text/html
```
