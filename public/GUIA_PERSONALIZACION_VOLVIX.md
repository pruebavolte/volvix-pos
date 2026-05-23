# 🎯 AI Automation Hero - Guía Rápida Volvix

**Status:** ✅ Clone exacto completado y listo para personalizar

---

## 📦 Archivos Nuevos

| Archivo | Descripción | Mejor Para |
|---------|-------------|-----------|
| `hero-ai-automation-volvix.html` | HTML standalone + fallback HLS.js | **🏆 USA ESTE** - Cero dependencias, listo ya |
| `ai-automation-hero.html` | Versión anterior (sin fallback mejorado) | Referencia |
| `ai-automation-hero.jsx` | React component | Si integras en app React |

---

## 🎨 Personalizar en 2 Minutos

### 1️⃣ Cambiar Colores a Branding Volvix

Abre `hero-ai-automation-volvix.html` y busca:

```css
/* ← BUSCA Y REEMPLAZA */

/* Background principal */
background-color: #070612;  /* AQUÍ: Cambiar a color Volvix */

/* Botón primario (blanco) */
.btn-primary {
    background-color: white;      /* ← CAMBIAR */
    color: #070612;               /* ← CAMBIAR */
}

/* Botón secundario (transparente) */
.btn-secondary {
    background-color: rgba(255, 255, 255, 0.2);  /* ← CAMBIAR */
    color: white;                                 /* ← CAMBIAR */
}
```

**Colores Volvix sugeridos:**
- **Primario:** `#1e40af` (azul Volvix)
- **Secundario:** `#fbbf24` (amarillo Volvix)
- **Fondo:** `#0f172a` (dark navy Volvix)

---

### 2️⃣ Cambiar Textos

```html
<!-- Badge -->
<span class="hero__badge-text">New AI Automation Ally</span>
<!-- ↓ CAMBIAR A: -->
<span class="hero__badge-text">Soluciones IA para tu Negocio</span>

<!-- Heading línea 1 -->
<span class="word">Unlock</span>
<span class="word">the</span>
<span class="word">Power</span>
<span class="word">of</span>
<span class="word">AI</span>
<!-- ↓ CAMBIAR A: -->
<span class="word">Automatiza</span>
<span class="word">tu</span>
<span class="word">Negocio</span>
<span class="word">con</span>
<span class="word">IA</span>

<!-- Heading línea 2 -->
<span class="word">for</span>
<span class="word">Your</span>
<!-- ↓ CAMBIAR A: -->
<span class="word">Volvix</span>

<!-- Heading línea 3 (serif italic) -->
<span class="word">Business.</span>
<!-- ↓ CAMBIAR A: -->
<span class="word">Inteligente.</span>

<!-- Subtitle -->
Our cutting-edge AI platform automates, analyzes, and accelerates your workflows...
<!-- ↓ CAMBIAR A: -->
Plataforma IA avanzada que automatiza procesos, analiza datos y acelera tu crecimiento...

<!-- Botones -->
<a href="/book-call" class="btn btn-primary">Book A Free Call</a>
<!-- ↓ CAMBIAR A: -->
<a href="/agendar-demo" class="btn btn-primary">Agendar Demo Gratis</a>

<a href="#learn" class="btn btn-secondary">Learn now</a>
<!-- ↓ CAMBIAR A: -->
<a href="#caracteristicas" class="btn btn-secondary">Ver Características</a>
```

---

### 3️⃣ Cambiar Video

```html
<!-- Busca esta línea: -->
<video class="hero__video" autoplay loop muted playsinline disablepictureinpicture></video>

<!-- En el <script>, reemplaza videoUrl: -->
const videoUrl = 'https://stream.mux.com/...';
<!-- CON TU VIDEO: -->
const videoUrl = 'https://tudominio.com/tu-video.m3u8';
<!-- O video MP4: -->
video.src = 'https://tudominio.com/video.mp4';
```

---

## 🚀 Deployment Opciones

### Opción A: Netlify Drop (Más Fácil)
1. Abre https://app.netlify.com/drop
2. Arrastra `hero-ai-automation-volvix.html` 
3. **Listo** - URL pública en 5 segundos

### Opción B: Tu Servidor
```bash
# Copiar archivo a tu carpeta public
cp hero-ai-automation-volvix.html /ruta/a/public/hero.html

# Servir con tu app
# URL será: https://tudominio.com/hero.html
```

### Opción C: Integrar en Sistema Internacional v3
```html
<!-- En salvadorex-pos.html o paneldecontrol.html -->
<iframe 
    src="/components/hero-ai-automation-volvix.html" 
    style="border: none; width: 100%; height: 100vh;">
</iframe>

<!-- O copiar directamente todo el HTML -->
<!-- Y personalizar desde allá -->
```

---

## 🎬 Animaciones

Las animaciones ya están configuradas:

- **Badge:** `0s` delay (aparece inmediatamente)
- **Heading:** `0.15s` delay (después del badge)
- **Subtítulo:** `0.4s` delay
- **Botones:** `0.6s` delay (último)

**Para cambiar velocidad:**
```css
/* Reduce duration de 0.6s a 0.3s */
.hero__badge {
    animation: blur-in 0.3s ease-out 0s both;
}

.word {
    animation: split-text 0.3s ease-out both;
}
```

---

## 📱 Responsive

El hero ya es responsive automáticamente:
- **Mobile (<640px):** Font más chico, padding reducido
- **Tablet (640-1024px):** Intermedio
- **Desktop (>1024px):** Full size

No necesitas hacer nada.

---

## 🎯 Quick Wins - Cambios Visibles Inmediatos

```html
<!-- 1. Badge (se ve siempre primero) -->
"New AI Automation Ally" → "Tu texto aquí"

<!-- 2. Heading grande (lo más visible) -->
"Unlock the Power of AI" → "Automatiza tu Negocio"

<!-- 3. Botones (calls-to-action) -->
"Book A Free Call" → "Agendar Demo"

<!-- 4. Color fondo -->
#070612 → #tu-color-aqui
```

Cambia estos 4 elementos y el hero es **100% tuyo**.

---

## ✅ Testing Checklist

- [ ] Video carga (o placeholder se ve 3 segundos)
- [ ] Badge aparece con animación
- [ ] Heading se anima palabra por palabra
- [ ] Botones son clickeables
- [ ] Responsive en mobile
- [ ] Sin errores en console (F12)

---

## 🆘 Troubleshooting

| Problema | Solución |
|----------|----------|
| Video no carga | Esperar 3s (fallback HLS.js) o reemplazar URL |
| Texto se corta | Reducir font-size o acortar texto |
| Botones no clickean | Verificar z-index (debe ser 20) |
| Colores no cambian | Buscar todas las instancias (Ctrl+F) |
| Animaciones lentas | Reducir animation-duration |

---

## 💡 Pro Tips

1. **Usa tu video HLS:** La URL Mux actual se puede cambiar
2. **Typography:** Georgia serif (línea 3) se ve premium - mantenla
3. **Spacing:** Los 48px entre secciones son perfectos, no cambiar
4. **Hover states:** Los botones tienen transiciones suaves, no borrar

---

## 📊 Specs Originales (Para Referencia)

| Elemento | Original | Puedes Cambiar |
|----------|----------|---|
| Background | #070612 | ✅ Sí |
| Badge text | "New AI..." | ✅ Sí |
| Heading | "Unlock..." | ✅ Sí |
| Font serif | Georgia | ⚠️ Opcional |
| Video URL | Mux HLS | ✅ Sí |
| Animaciones | 0.6s | ✅ Sí |
| Botones | 2 CTA | ✅ Personalizar |
| Layout | Full-screen | ❌ No (core) |
| Mobile padding | 16px | ⚠️ Puede cambiar |

---

## 🎁 Próximos Pasos

1. **Hoy:** Personaliza colores + textos
2. **Mañana:** Integra video Volvix
3. **Próxima semana:** A/B test con usuarios

---

**¿Preguntas?** El archivo es 100% editable - cualquier cambio CSS/HTML es válido.
