# R20 — Inventario de prompt() / confirm() / alert()

**Fecha:** 2026-04-26
**Stack detectado:**
- Vanilla JS sin framework
- HTML directo, sin React/Vue/Angular
- Sin librería de formularios
- Sin librería de validación
- UI: CSS puro / Tailwind-like custom
- Idioma: Español MX

## Resumen ejecutivo

| Tipo | Cantidad |
|---|---|
| `prompt()` | **167** |
| `confirm()` | **57** |
| `alert()` | **149** |
| **Total a migrar** | **373 llamadas** |

Concentrados en 25 archivos. Los 5 archivos más grandes acumulan **104/167 prompts** (62%):

| Archivo | prompts |
|---|---|
| volvix-pos-extra-wiring.js | 29 |
| volvix-extras-wiring.js | 27 |
| volvix-multipos-extra-wiring.js | 21 |
| volvix-pos-wiring.js | 17 |
| volvix-owner-extra-wiring.js | 13 |

---

## Acciones identificadas (top 30 más usadas/críticas)

### 🔥 ALTA PRIORIDAD (POS core)

#### 1. **Crear promoción** (`volvix-pos-extra-wiring.js:96-100`)
- **Propósito:** Alta de promoción/cupón
- **Prompts encadenados (4):**
  | Campo | Tipo correcto | Validación |
  |---|---|---|
  | Nombre de promoción | `<input type="text">` | required, 3-60 chars, único por tenant |
  | Tipo (descuento/2x1/combo) | **Radio buttons** (3 opciones) | required, enum estricto |
  | % descuento o ahorro | `<input type="number">` min=0 max=100 step=0.01 | required si tipo=descuento |
  | Vigencia hasta | `<input type="date">` | required, > hoy |

#### 2. **Recarga de tiempo aire** (`volvix-pos-extra-wiring.js:174-178`)
- **Propósito:** Procesar recarga prepago
- **3 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Número celular | `<input type="tel">` con máscara `(XXX) XXX-XXXX` | required, regex 10 dígitos MX |
  | Compañía | **Radio buttons** (Telcel/Movistar/AT&T/Unefon/Bait) | required |
  | Monto | **Radio buttons** ($10/$20/$30/$50/$100/$200/$500) o "otro" | required, en lista de denominaciones |

#### 3. **Pago de servicios** (`volvix-pos-extra-wiring.js:240-243`)
- **3 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Servicio | **Combobox** con autocomplete (CFE/Agua/Telmex/Gas/Internet/Sky/...) | required, enum |
  | Referencia | `<input type="text">` con `inputmode="numeric"` | required, regex según servicio |
  | Monto a pagar | `<input type="number">` step=0.01 min=1 | required, > 0 |

#### 4. **Crear departamento** (`volvix-pos-extra-wiring.js:302-304`)
- **2 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Nombre del departamento | `<input type="text">` | required, único por tenant |
  | % IVA aplicable | **Radio buttons** (0% / 8% frontera / 16% general) | required |

#### 5. **Cotización rápida** (`volvix-pos-extra-wiring.js:384-387`)
- **3 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Cliente | **Autocomplete con búsqueda** (lista de clientes existentes) o "+ nuevo" | required |
  | Concepto | `<textarea>` 2 rows | required, 3-200 chars |
  | Total estimado | `<input type="number">` step=0.01 | required, > 0 |

#### 6. **Movimiento de inventario** (`volvix-pos-extra-wiring.js:533-538`)
- **4 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | SKU/código | **Autocomplete** sobre catálogo + scanner barcode | required, debe existir |
  | Tipo | **Radio buttons** (entrada/salida/ajuste) | required |
  | Cantidad | `<input type="number">` step=1 min=1 | required, > 0 |
  | Motivo | `<textarea>` o `<select>` con motivos predefinidos | required, 3-200 chars |

#### 7. **Alta de proveedor** (`volvix-pos-extra-wiring.js:599-602`)
- **3 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Razón social | `<input type="text">` | required, 3-100 chars |
  | RFC | `<input type="text">` uppercase, regex SAT | optional, formato RFC válido |
  | Teléfono/contacto | `<input type="tel">` | optional, regex |

#### 8. **Timbrar CFDI** (`volvix-pos-extra-wiring.js:695-699`)
- **3 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Folio de venta | **Autocomplete** ventas no timbradas | required, debe existir |
  | RFC del cliente | `<input type="text">` con autocomplete clientes | required, formato SAT |
  | Uso CFDI | **Combobox** con catálogo SAT (24 opciones) | required, enum SAT |

#### 9. **Crear usuario** (`volvix-pos-extra-wiring.js:753-757`)
- **3 prompts:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | Nombre de usuario | `<input type="text">` | required, único |
  | Email | `<input type="email">` | required, formato email, único |
  | Rol | **Radio buttons** (admin/cajero/vendedor/supervisor) | required, enum |

#### 10. **Aplicar % a todos los precios** (`volvix-pos-extra-wiring.js:848`)
- **1 prompt CRÍTICO destructivo:**
  | Campo | Tipo | Validación |
  |---|---|---|
  | % aumento/descuento | `<input type="number">` step=0.01 min=-100 max=1000 | required |
- **DEBE pedir confirmación** con preview "afectará N productos" + escribir "CONFIRMAR" para ejecutar

### 🟡 MEDIA PRIORIDAD (Owner Panel + Reports)

#### 11-15. Owner Panel (`volvix-owner-wiring.js`, `volvix-owner-extra-wiring.js`)
- Crear tenant: nombre + plan (radio: Free/Pro/Enterprise) + email admin (email) + RFC (text)
- Pausar tenant: **modal confirmación destructiva**
- Cambiar plan: radio buttons + preview prorateo
- Invitar usuario: email + rol (radio) + magic link option
- Editar permisos: **multi-select** de scopes

#### 16-20. Multi-POS (`volvix-multipos-extra-wiring.js`)
- Transfer stock entre sucursales: from (combobox) + to (combobox) + producto (autocomplete) + cantidad (number)
- Crear sucursal: nombre + dirección (textarea) + tipo (radio: warehouse/branch/transit) + lat/lng (geo)
- Cerrar caja: monto cierre (number) + notas (textarea)

### 🟢 BAJA PRIORIDAD (utilidades)

#### 21-30. Resto (`volvix-extras-wiring.js`, `volvix-tools-wiring.js`, etc.)
- Editor de receipts (texto + colores con color picker)
- UI builders (kanban/gantt/mindmap/flowchart): nombre nodo + color + categoría
- Email templates: subject (text) + body (textarea) + variables (multi-select)
- PWA install prompts: 1 confirm "instalar?" → modal con beneficios + screenshot

---

## Confirmaciones destructivas (57 `confirm()`)

Patrones detectados:
1. Eliminar producto/cliente/venta → modal con nombre del recurso + escribir nombre para confirmar
2. Cancelar venta → modal con monto + razón obligatoria
3. Pausar tenant → modal advertencia + impacto
4. Cerrar caja con variance → modal con monto faltante/sobrante
5. Salir sin guardar → modal "tienes cambios sin guardar"
6. Cerrar sesión → modal simple
7. Borrar usuario → escribir email para confirmar
8. Resetear datos → escribir "ELIMINAR" en mayúsculas

## Alerts (149)

Patrones:
- Notificaciones success/error → **toast notifications** (no modal)
- Validaciones simples → **inline error en campo** (no popup)
- Info contextual → **tooltip** o **toast**

---

## Componentes a crear (Paso 2)

### Componente base `<VolvixModal>`:
- Backdrop con click-to-close (configurable)
- Header con título + close button
- Body scrollable
- Footer con botones primario/secundario
- ESC para cerrar
- Focus trap dentro del modal
- Restore focus al elemento anterior al cerrar
- Confirmación si tiene cambios sin guardar
- Loading state (botones disabled + spinner)
- Error banner inline

### Componentes de input wrappers:
- `VolvixInput` (text/email/tel/url/password)
- `VolvixNumberInput` (con step/min/max)
- `VolvixTextarea`
- `VolvixSelect` (dropdown nativo para 8-50 opciones)
- `VolvixCombobox` (con búsqueda, para 50+)
- `VolvixRadioGroup` (2-7 opciones)
- `VolvixCheckboxGroup`
- `VolvixSwitch` (toggle on/off)
- `VolvixDatePicker`
- `VolvixDateRange`
- `VolvixTimePicker`
- `VolvixAutocomplete` (búsqueda + select existente)
- `VolvixFileUpload` (drag&drop + preview)
- `VolvixColorPicker`
- `VolvixIconPicker`
- `VolvixPasswordInput` (con toggle show/hide)

### Componentes de feedback:
- `VolvixToast` (success/error/warn/info, 4s auto-hide)
- `VolvixConfirm` (modal sí/no simple)
- `VolvixDestructiveConfirm` (escribir nombre/palabra para confirmar)

### Sistema de validación:
- Validators encadenables: `required()`, `email()`, `min(n)`, `max(n)`, `regex(pat)`, `unique(asyncFn)`, `length(min,max)`, `oneOf([...])`, `match(otherField)`
- Validación en blur + submit
- Mensajes en español
- Visual: borde rojo + texto error debajo del input

---

## Plan de migración (Paso 3)

**Orden propuesto** (por impacto/uso):

1. ✅ Crear `<VolvixModal>` + `VolvixInput` + `VolvixNumberInput` + `VolvixRadioGroup` (componentes base)
2. ✅ Migrar **Crear promoción** (4 prompts → 1 modal con 4 campos)
3. ✅ Migrar **Recarga de tiempo aire** (alto volumen de uso)
4. ✅ Migrar **Pago de servicios**
5. ✅ Migrar **Movimiento de inventario** (autocomplete crítico)
6. ✅ Migrar **Crear/editar usuario**
7. ✅ Migrar **Crear tenant** (Owner Panel)
8. ✅ Migrar **Cancelar/eliminar venta** (confirmación destructiva)
9. ✅ Migrar **Timbrar CFDI**
10. ✅ Migrar resto en lotes de 5

**Estimación:** ~3-4 horas de trabajo concentrado para los 30 más críticos. ~6-8 h total para los 373.

---

## ⚠️ Espero tu visto bueno antes de programar (Paso 2)

Confírmame:
1. ¿Apruebas la tabla de mapeo (tipos de input por tipo de dato)?
2. ¿Quieres CSS custom o uso una librería ya cargada por CDN (Tailwind/Bootstrap/none)?
3. ¿Validación: solo HTML5 nativa (`required`, `pattern`) o agrego validators JS custom encadenables?
4. ¿Toasts para notificaciones success/error o seguimos con modal para todo?
5. Empezar por los 10 más críticos (POS core) o los 30 completos de una vez?
