# 🎨 Variaciones del AI Automation Hero

Aquí hay **3 versiones pre-customizadas** lisas para usar. Elige la que más te guste y úsala directamente.

---

## Variación 1: VOLVIX BRAND (RECOMENDADO)

**Colores:** Azul Volvix + Amarillo Volvix  
**Target:** GrupoVolvix, SalvadoreX, Guardián  
**Vibe:** Profesional, confiable, tech-forward

### Cambios CSS:
```css
/* Background */
background-color: #0f172a;  /* Dark navy Volvix */

/* Badge */
.hero__badge {
    border: 1px solid rgba(30, 64, 175, 0.3);
    background-color: rgba(30, 64, 175, 0.1);
}
.hero__badge-text {
    color: #1e40af;  /* Azul Volvix */
}

/* Botón Primario */
.btn-primary {
    background-color: #1e40af;  /* Azul Volvix */
    color: white;
}
.btn-primary:hover {
    background-color: #1e3a8a;
    box-shadow: 0 8px 16px rgba(30, 64, 175, 0.3);
}

/* Botón Secundario */
.btn-secondary {
    background-color: rgba(251, 191, 36, 0.2);  /* Amarillo Volvix */
    border: 1px solid rgba(251, 191, 36, 0.3);
    color: #fbbf24;
}
.btn-secondary:hover {
    background-color: rgba(251, 191, 36, 0.3);
    border-color: rgba(251, 191, 36, 0.5);
}
```

### Cambios HTML:
```html
<!-- Badge -->
<span class="hero__badge-text">Soluciones IA para tu Negocio</span>

<!-- Heading -->
<span class="hero__heading-line">
    <span class="word">Automatiza</span>
    <span class="word">tu</span>
    <span class="word">Negocio</span>
    <span class="word">con</span>
    <span class="word">IA</span>
</span>
<span class="hero__heading-line">
    <span class="word">Volvix</span>
</span>
<span class="hero__heading-line hero__heading-serif">
    <span class="word">Inteligente.</span>
</span>

<!-- Subtitle -->
<p class="hero__subtitle">Plataforma IA avanzada que automatiza procesos, analiza datos en tiempo real y acelera tu crecimiento empresarial con soluciones personalizadas.</p>

<!-- Botones -->
<a href="/agendar-demo" class="btn btn-primary">
    Agendar Demo Gratis
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
</a>
<a href="#caracteristicas" class="btn btn-secondary">Ver Cómo Funciona</a>
```

---

## Variación 2: DARK PREMIUM

**Colores:** Violeta Premium + Blanco  
**Target:** Presentaciones ejecutivas, B2B alto valor  
**Vibe:** Lujo, exclusividad, innovación

### Cambios CSS:
```css
/* Background */
background-color: #0a0410;  /* Ultra dark purple */

/* Badge */
.hero__badge {
    border: 1px solid rgba(168, 85, 247, 0.3);
    background-color: rgba(168, 85, 247, 0.1);
}
.hero__badge-text {
    color: #d8b4fe;  /* Light purple */
}

/* Botón Primario */
.btn-primary {
    background-color: #a855f7;  /* Vibrant purple */
    color: white;
    font-weight: 600;
}
.btn-primary:hover {
    background-color: #9333ea;
    box-shadow: 0 12px 24px rgba(168, 85, 247, 0.4);
}

/* Botón Secundario */
.btn-secondary {
    background-color: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(168, 85, 247, 0.5);
    color: #f3e8ff;
}
.btn-secondary:hover {
    background-color: rgba(168, 85, 247, 0.15);
    border-color: rgba(168, 85, 247, 0.7);
}
```

### Cambios HTML:
```html
<!-- Badge -->
<span class="hero__badge-text">Enterprise AI Suite</span>

<!-- Heading -->
<span class="hero__heading-line">
    <span class="word">Transform</span>
    <span class="word">Your</span>
    <span class="word">Enterprise</span>
</span>
<span class="hero__heading-line">
    <span class="word">with</span>
    <span class="word">Advanced</span>
</span>
<span class="hero__heading-line hero__heading-serif">
    <span class="word">Intelligence.</span>
</span>

<!-- Subtitle -->
<p class="hero__subtitle">Accelerate digital transformation with our cutting-edge AI platform. Trusted by global enterprises to deliver exceptional results.</p>

<!-- Botones -->
<a href="/enterprise-demo" class="btn btn-primary">Request Enterprise Demo</a>
<a href="#benefits" class="btn btn-secondary">View Benefits →</a>
```

---

## Variación 3: TECH MINIMAL

**Colores:** Cyan + Gris  
**Target:** Startups tech, Dev-first, Moderno  
**Vibe:** Limpio, rápido, innovador

### Cambios CSS:
```css
/* Background */
background-color: #020817;  /* Almost black */

/* Badge */
.hero__badge {
    border: 1px solid rgba(34, 211, 238, 0.2);
    background-color: transparent;
}
.hero__badge-text {
    color: #22d3ee;  /* Cyan */
}

/* Botón Primario */
.btn-primary {
    background-color: #22d3ee;  /* Cyan */
    color: #020817;
    font-weight: 500;
}
.btn-primary:hover {
    background-color: #06b6d4;
    box-shadow: 0 8px 16px rgba(34, 211, 238, 0.2);
}

/* Botón Secundario */
.btn-secondary {
    background-color: transparent;
    border: 1px solid #64748b;  /* Slate */
    color: #cbd5e1;
}
.btn-secondary:hover {
    border-color: #22d3ee;
    color: #22d3ee;
    background-color: rgba(34, 211, 238, 0.05);
}

/* Heading serif más sutil */
.hero__heading-serif {
    font-style: normal;  /* No italic */
    font-weight: 400;
}
```

### Cambios HTML:
```html
<!-- Badge -->
<span class="hero__badge-text">AI for Developers</span>

<!-- Heading -->
<span class="hero__heading-line">
    <span class="word">Build</span>
    <span class="word">Intelligent</span>
    <span class="word">Products</span>
</span>
<span class="hero__heading-line">
    <span class="word">Faster</span>
</span>
<span class="hero__heading-line hero__heading-serif">
    <span class="word">With AI.</span>
</span>

<!-- Subtitle -->
<p class="hero__subtitle">Integrate powerful AI capabilities into your product in minutes. No AI expertise required. Just developer-friendly APIs.</p>

<!-- Botones -->
<a href="/docs" class="btn btn-primary">
    Get Started Free
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
</a>
<a href="/pricing" class="btn btn-secondary">View Pricing</a>
```

---

## 📊 Comparativa Rápida

| Aspecto | Volvix | Dark Premium | Tech Minimal |
|---------|--------|--------------|-------------|
| **Color Primario** | #1e40af (Azul) | #a855f7 (Púrpura) | #22d3ee (Cyan) |
| **Color Secundario** | #fbbf24 (Amarillo) | Blanco/Purple | Gris |
| **Background** | #0f172a | #0a0410 | #020817 |
| **Target Audience** | Empresas MX | Ejecutivos | Startups/Dev |
| **Energía** | Profesional | Lujo | Moderno |
| **Mejor Para** | GrupoVolvix | Pitches C-level | Demos técnicas |

---

## 🚀 Cómo Usar Una Variación

### Paso 1: Copiar tu archivo base
```bash
cp hero-ai-automation-volvix.html mi-variacion.html
```

### Paso 2: Abre en editor (VS Code, Sublime, etc.)

### Paso 3: Copia el bloque CSS de la variación elegida
Busca `<style>` y reemplaza los estilos de:
- `.btn-primary`
- `.btn-secondary`
- `.hero__badge`
- `background-color: #070612`

### Paso 4: Copia el contenido HTML
Reemplaza los textos dentro de los spans

### Paso 5: Prueba en navegador
```bash
# En Windows
start mi-variacion.html

# En Mac
open mi-variacion.html

# En Linux
xdg-open mi-variacion.html
```

---

## 💾 Copiar y Pegar Completo

Si prefieres copiar TODO, aquí está cada variación como código listo para pegar.

### Volvix Brand (Código Completo)

```css
/* Solo reemplaza la sección <style> con esto: */
background-color: #0f172a;

.btn-primary {
    background-color: #1e40af;
    color: white;
}
.btn-primary:hover {
    background-color: #1e3a8a;
    box-shadow: 0 8px 16px rgba(30, 64, 175, 0.3);
}

.btn-secondary {
    background-color: rgba(251, 191, 36, 0.2);
    border: 1px solid rgba(251, 191, 36, 0.3);
    color: #fbbf24;
}
.btn-secondary:hover {
    background-color: rgba(251, 191, 36, 0.3);
    border-color: rgba(251, 191, 36, 0.5);
}

.hero__badge {
    border: 1px solid rgba(30, 64, 175, 0.3);
    background-color: rgba(30, 64, 175, 0.1);
}
```

---

## 🎯 Mi Recomendación

**VOLVIX BRAND** es la mejor para ti porque:
- ✅ Usa colores de Volvix ya establecidos
- ✅ Profesional pero energético
- ✅ Funciona para SalvadoreX + Guardián
- ✅ A/B testing ready

Empieza con esa, y luego testa las otras si lo necesitas.

---

## 📝 Notas

- Todas las variaciones mantienen las **animaciones exactas**
- El **video HLS es el mismo** en las tres (puedes reemplazarlo)
- El **layout responsive** funciona igual en todas
- Puedes **mezclar elementos** de diferentes variaciones

**Ejemplo mezcla:**
- Colores de "Volvix Brand" + Heading de "Tech Minimal" + Botones de "Dark Premium"

---

¿Cuál te gusta más? 🚀
