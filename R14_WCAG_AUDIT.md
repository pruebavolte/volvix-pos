# R14 — Auditoría de Accesibilidad WCAG 2.2 AA

**Fecha:** 2026-04-26
**Alcance:** `login.html`, `salvadorex_web_v25.html`, `volvix_owner_panel_v7.html`
**Estándar:** WCAG 2.2 nivel AA

---

## Resumen ejecutivo

| Archivo | Líneas | Botones | Inputs | Estado pre-fix | Estado post-fix |
|---|---|---|---|---|---|
| login.html | 424 | 1 | 2 | Labels sin `for`, inputs sin `aria-label` | OK (labels asociados, aria-label añadido) |
| salvadorex_web_v25.html | 3508 | 60+ | ~25 | Botones icon-only sólo con `title`; inputs de búsqueda sin label | Aria-label propagado desde `title`; aria-label añadido a inputs huérfanos |
| volvix_owner_panel_v7.html | 4263 | 30+ | ~30 | Igual: nav-items con sólo símbolo + texto; inputs de búsqueda sin label | Aria-label en buscadores; nav-items conservan texto descriptivo |

**Observaciones generales positivas:**

- Los tres documentos ya declaran `lang="es"` (criterio 3.1.1 ✓).
- No hay etiquetas `<img>` (no aplica criterio 1.1.1 sobre imágenes).
- La mayoría de botones de iconos en SalvadoreX llevaban atributo `title`, que muchos lectores de pantalla anuncian. Aun así WCAG 2.2 requiere `aria-label` o texto accesible explícito → se añadió de forma automática.

**Pendientes que requieren refactor manual** (NO se aplicaron por instrucción):

1. Contraste de colores (1.4.3 AA): variables CSS `--text-2`, `--muted`, `--border` deben verificarse con herramienta tipo Lighthouse. Estimación visual sugiere posibles fallos en texto secundario gris claro sobre fondo blanco.
2. Jerarquía de encabezados (1.3.1): SalvadoreX salta de `h1.page-title` a `h3` saltando `h2` en pantalla de Configuración (líneas 1922, 1931, 1940, 1946, 1966, 1978).
3. `tabindex` no se ha auditado caso por caso; ningún archivo usa `tabindex` positivo (bien), pero los modals abiertos por JS no implementan focus-trap.
4. Los inputs de Configuración (líneas 1932-1948 en SalvadoreX) son `<input>` sin `id` ni `<label for=...>`. Se usan `<label class="input-label">` adyacentes pero sin asociación programática.
5. `volvix_owner_panel_v7.html` líneas 1866-1868, 1933-1936, 2029, 2035-2037, 2096-2097: inputs con label hermano pero sin `for`/`id`.

---

## TOP 30 violaciones WCAG identificadas

| # | Archivo | Línea | Criterio | Severidad | Descripción | Fix |
|---|---|---|---|---|---|---|
| 1 | login.html | 281 | 1.3.1 / 4.1.2 | Alta | `<label>` sin `for` apuntando a `emailInput` | **APLICADO**: agregado `for="emailInput"` |
| 2 | login.html | 286 | 1.3.1 / 4.1.2 | Alta | `<label>` sin `for` apuntando a `passwordInput` | **APLICADO**: agregado `for="passwordInput"` |
| 3 | login.html | 282 | 4.1.2 | Media | Input email sin `aria-label` redundante | **APLICADO**: `aria-label="Correo electrónico"` |
| 4 | login.html | 287 | 4.1.2 | Media | Input password sin `aria-label` | **APLICADO**: `aria-label="Contraseña"` |
| 5 | salvadorex | 1338 | 4.1.2 | Alta | Botón icono `notif` solo con `title` | **APLICADO**: `aria-label="Notificaciones"` |
| 6 | salvadorex | 1344-1352 | 4.1.2 | Media | Toggle plataforma (Windows/Android/Web) | **APLICADO**: aria-label desde title |
| 7 | salvadorex | 1358-1384 | 4.1.2 | Alta | Toolbar buttons (rapido, saas, movil, perfil, ayuda, salir) | **APLICADO**: aria-label desde title |
| 8 | salvadorex | 1506 | 4.1.2 | Alta | `pos-sidebar-toggle` (carácter ☰ sin contexto) | **APLICADO**: aria-label="Categorías" |
| 9 | salvadorex | 1530-1589 | 4.1.2 | Alta | 13+ action-btn de POS (varios, buscar, mayoreo, cobrar…) | **APLICADO**: aria-label desde title |
| 10 | salvadorex | 1631-1674 | 4.1.2 | Alta | bottom-btn (cambiar precio, pendiente, eliminar, cliente, reimprimir) | **APLICADO**: aria-label desde title |
| 11 | salvadorex | 1520 | 1.3.1 / 4.1.2 | Alta | `barcode-input` sin label asociado por `for` | **APLICADO**: `aria-label="Código del producto"` |
| 12 | salvadorex | 2131 | 1.3.1 / 4.1.2 | Alta | `search-input` sin label | **APLICADO**: `aria-label="Buscar producto..."` |
| 13 | salvadorex | 1894-1897 | 1.3.1 | Media | Inputs de billetes con label adyacente sin `for` | **PENDIENTE refactor** (asignar id+for) |
| 14 | salvadorex | 1922-1978 | 1.3.1 | Alta | Sección Configuración: `<h3>` directo tras `<h1>` (salta h2) | **PENDIENTE refactor** (cambiar a h2) |
| 15 | salvadorex | 1932-1948 | 1.3.1 | Media | Inputs Datos del negocio sin asociación label/for | **PENDIENTE refactor** |
| 16 | salvadorex | 2015-2018 | 1.3.1 | Media | Inputs Apertura de caja sin asociación | **PENDIENTE refactor** |
| 17 | salvadorex | 2107 | 1.3.1 | Media | Input "Recibido del cliente" sin `for` | **PENDIENTE refactor** |
| 18 | salvadorex | 2145-2148 | 1.3.1 | Media | Inputs "Concepto/Monto" sin `for` | **PENDIENTE refactor** |
| 19 | salvadorex | 2207-2212 | 1.3.1 | Media | Granel: peso/total sin `for` | **PENDIENTE refactor** |
| 20 | salvadorex | global | 1.4.3 | Media | Texto secundario `var(--text-2)` y `.muted` posibles bajos contraste | **PENDIENTE auditoría tooling** (axe/Lighthouse) |
| 21 | salvadorex | global | 2.4.3 | Media | Modals abiertos por JS sin focus-trap (openVarios, openSearch, openCalc) | **PENDIENTE refactor JS** |
| 22 | salvadorex | global | 2.1.1 | Media | Toolbar y botones SVG dependen del `onclick` directo (mouse-only en algunos `<div role="button">`) | Revisar manualmente |
| 23 | volvix | 612-685 | 4.1.2 | Baja | nav-items con `<span>` icono + texto: ya tienen texto accesible (OK) | OK |
| 24 | volvix | 708 | 1.3.1 / 4.1.2 | Alta | Input búsqueda sin label | **APLICADO**: aria-label="Buscar marca, tenant o licencia" |
| 25 | volvix | 1046 | 1.3.1 / 4.1.2 | Alta | `giros-search` sin label | **APLICADO**: aria-label="Buscar giro" |
| 26 | volvix | 1510 | 1.3.1 / 4.1.2 | Alta | `we-search` sin label | **APLICADO**: aria-label="Buscar giro en editor" |
| 27 | volvix | 1866-1868 | 1.3.1 | Media | Inputs Identidad sin `for`/`id` (label hermano) | **PENDIENTE refactor** |
| 28 | volvix | 1933-1936 | 1.3.1 | Media | Inputs taxonomía con label en `<td>` previo | **PENDIENTE refactor** |
| 29 | volvix | 2029-2097 | 1.3.1 | Media | `ctrl-row` con `<div class="lbl">` en vez de `<label>` | **PENDIENTE refactor** estructural |
| 30 | volvix | global | 1.4.3 | Media | `.muted` color bajo contraste a verificar | **PENDIENTE auditoría tooling** |

---

## Fixes aplicados automáticamente

1. **`lang="es"`**: ya presente en los tres archivos. Sin cambios.
2. **`<img alt="">`**: no hay imágenes `<img>` en ninguno. Sin cambios.
3. **`aria-label` en botones icon-only** que tenían `title`: añadido automáticamente preservando el `title` (regex sobre `<button …title="X">` → `<button …aria-label="X" title="X">`). Aplicado en SalvadoreX y Volvix Owner Panel.
4. **Asociación `<label for="…">`** en login.html para los dos campos del formulario.
5. **`aria-label` en inputs de búsqueda/código** sin label visible asociado: `barcode-input`, `search-input` (SalvadoreX) y los tres buscadores en Volvix Owner Panel.

## Archivos modificados

- `C:\Users\DELL\Downloads\verion 340\login.html`
- `C:\Users\DELL\Downloads\verion 340\salvadorex_web_v25.html`
- `C:\Users\DELL\Downloads\verion 340\volvix_owner_panel_v7.html`

## Violaciones que requieren refactor manual

- **Contraste de colores (1.4.3)** — requiere medir tokens `--text-2`, `--muted` con axe/Lighthouse, ajustar paleta. **No se modifican colores por instrucción.**
- **Jerarquía de encabezados (1.3.1)** — Sección Configuración de SalvadoreX salta `h1 → h3`. Requiere cambiar a `h2` o agregar nivel intermedio.
- **Asociación label/input estructural** — múltiples inputs en formularios de SalvadoreX (Configuración, Apertura, Caja, Modales) y Volvix Owner Panel (Identidad, Taxonomía, Control rows) usan label hermano sin `for`. Requiere asignar `id` único y `for` correspondiente caso por caso (~40 ocurrencias).
- **Focus management en modales** (2.4.3, 2.1.2) — JS de modales (`openVarios`, `openSearch`, `openCalc`, `openControl`, etc.) no implementa focus-trap ni restauración del foco al cerrar.
- **Operabilidad teclado (2.1.1)** — revisar `<div onclick=…>` y elementos con role implícito incorrecto.
- **Foco visible (2.4.7)** — verificar que `:focus-visible` esté estilado en CSS (no solo `:hover`).
