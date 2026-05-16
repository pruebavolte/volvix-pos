# ADR-003: Unificar 6 sistemas de tabs en `window.VolvixTabs`

**Status**: Propuesto
**Fecha**: 2026-05-15

---

## Contexto

`salvadorex-pos.html` tiene **6 implementaciones independientes** del mismo patrón "activar tab seleccionado, desactivar resto":

| Función | Pantalla | Args |
|---|---|---|
| `showInvTab(tab, btn)` | `screen-inventario` | (`stock`/`movs`/`count`/`adjust`, this) |
| `showPromoTab(tab, btn)` | `screen-promociones` | (`active`/`scheduled`/`expired`/`all`, this) |
| `provTab(tab, btn)` | `screen-proveedores` | (`lista`/`ordenes`/`cuentas`, this) |
| `showCfg(tab, btn)` | `screen-config` | (10+ sub-tabs, this) |
| `ingApp.switchTab(tab, btn)` | `screen-ingredientes` | (`ingredientes`/`recetas`, this) |
| `mktApp.filtrarPlat(plat, btn)` | `screen-marketing` | (`instagram`/`facebook`/`tiktok`/`whatsapp`, btn) |

Cada uno hace exactamente lo mismo: `querySelector('.tab')` para deactivar, marcar activo en el clicked, mostrar pane correspondiente, ocultar otros panes. **6 implementaciones = 6 lugares donde puede romperse el comportamiento**.

## Alternativas consideradas

### A. Dejar como está
"Funciona, no toques". El cost: cuando un cajero reporta "el tab no responde", el ingeniero / IA tiene que adivinar cuál de las 6 funciones investigar.

### B. **Crear `window.VolvixTabs.activate(group, tab, btn)`** (recomendado)
Una sola función que cubre los 6 casos. Cada `showInvTab/provTab/...` se vuelve un alias que delega.

## Decisión

**Opción B**.

```js
// public/volvix-tabs.js
window.VolvixTabs = {
  activate(group, tab, btn) {
    // 1. Marcar el botón clicked como activo
    if (btn) {
      const siblings = btn.parentNode.querySelectorAll('.config-tab, .tab, .nav-tab, .mkt-plat-tab, .ing-tab');
      siblings.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    // 2. Mostrar el pane correspondiente, ocultar los demás
    const paneSelector = `[data-tab-group="${group}"]`;
    document.querySelectorAll(paneSelector).forEach(pane => {
      pane.classList.toggle('active', pane.dataset.tab === tab);
      pane.classList.toggle('hidden', pane.dataset.tab !== tab);
    });
    // 3. Guardar el tab activo en sessionStorage para preservar al re-navegar
    try { sessionStorage.setItem(`vlx:tab:${group}`, tab); } catch(_){}
    // 4. Disparar evento para que módulos custom (kardex, conteo físico) reaccionen
    document.dispatchEvent(new CustomEvent(`volvix:tab-changed`, { detail: { group, tab } }));
  },
  getActive(group) {
    try { return sessionStorage.getItem(`vlx:tab:${group}`); } catch(_){ return null; }
  }
};
```

### Plan de migración (4h)

1. Crear `public/volvix-tabs.js` con `window.VolvixTabs`.
2. Agregar `data-tab-group="inv"` y `data-tab="stock"` etc. a los panes del HTML.
3. Reemplazar `showInvTab('stock', this)` con alias: `window.showInvTab = (t, b) => VolvixTabs.activate('inv', t, b);`.
4. Idem para los otros 5 sistemas (alias preservan el HTML sin cambios).
5. Test cross-tab navigation.

## Consecuencias

### Más fácil
- Una sola función para debug.
- Nuevo tab system para feature future = solo definir `data-tab-group` y listo.
- Persistencia automática del tab activo en sessionStorage.

### Más difícil
- Necesita migración HTML (`data-tab-group`/`data-tab`).

## Métricas de éxito
- Solo 1 función `VolvixTabs.activate()` en el codebase.
- Los 6 entry points originales son aliases de 1 línea.
- Tabs persistidos: cerrar y reabrir pantalla mantiene el tab activo.
