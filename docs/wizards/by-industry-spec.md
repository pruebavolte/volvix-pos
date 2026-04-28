# Wizards by Industry - Especificacion

> Modulo R12-O-5-E - Wizards especificos por giro que guian la primera venta paso a paso usando el catalogo demo R12a.

## Vision general

Cuando un usuario completa el onboarding (welcome wizard de R12-O-3-B), aparece un banner ofreciendole un tour guiado de su primera venta real. El sistema:

1. **Detecta el giro del tenant** (via `/api/tenant/settings`)
2. **Carga el wizard JSON** correspondiente desde `/wizards-by-industry/{giro}.json`
3. **Filtra los pasos por rol** del usuario (owner / cashier / manager / waiter / etc.)
4. **Guia paso a paso** mostrando tooltips, highlights y esperando acciones reales del POS
5. **Persiste el progreso** en `localStorage` para continuar si el usuario refresca

## Giros soportados (10)

| Giro | Archivo | Modulos | Duracion |
|------|---------|---------|----------|
| `cafe` | `cafe.json` | pos, inventory | 3 min |
| `restaurante` | `restaurante.json` | pos, inventory, tables | 5 min |
| `taqueria` | `taqueria.json` | pos, inventory | 3 min |
| `abarrotes` | `abarrotes.json` | pos, inventory, barcode | 3 min |
| `farmacia` | `farmacia.json` | pos, inventory, controlled_substances | 4 min |
| `ropa` | `ropa.json` | pos, inventory, variants | 4 min |
| `barberia` | `barberia.json` | pos, appointments, services | 4 min |
| `gimnasio` | `gimnasio.json` | pos, memberships, subscriptions | 5 min |
| `papeleria` | `papeleria.json` | pos, inventory, barcode, copy_service | 3 min |
| `autolavado` | `autolavado.json` | pos, services, vehicle_registry | 4 min |

Si el tenant tiene `business_type` que no esta en la lista, se usa `cafe` como default.

## Estructura JSON

```json
{
  "id": "cafe-first-sale",
  "title": "Tu primera venta en cafe",
  "industry": "cafe",
  "duration_min": 3,
  "modules_required": ["pos", "inventory"],
  "roles": ["owner", "cashier", "manager"],
  "demo_catalog_ref": "R12a",
  "steps": [ /* ... */ ]
}
```

### Campos de wizard

| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `id` | string | si | Identificador unico (kebab-case). |
| `title` | string | si | Titulo visible en el primer modal. |
| `industry` | string | si | Coincide con `business_type` del tenant. |
| `duration_min` | number | si | Estimacion en minutos. |
| `modules_required` | string[] | si | Modulos del POS que deben existir. |
| `roles` | string[] | si | Roles para los que aplica el wizard. |
| `demo_catalog_ref` | string | si | Catalogo demo usado (R12a). |
| `steps` | object[] | si | Lista ordenada de pasos. |

### Estructura de un paso

```json
{
  "id": "step3",
  "title": "Agregalo al carrito",
  "text": "Click en Latte Vainilla. Veras $45 en el total.",
  "image": "/tutorials/01-primera-venta.html",
  "highlight_selector": ".search-result-item",
  "action": "wait_for_cart",
  "expected_query": "latte",
  "expected_items": 2,
  "expected_barcode": "7501234567890",
  "next_link": "/reportes",
  "role_only": ["cashier"]
}
```

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | string | Id del paso (ej: `step1`). |
| `title` | string | Titulo grande del modal. |
| `text` | string | Texto descriptivo del paso. |
| `image` | string | URL opcional de imagen/embed (HTML del tutorial). |
| `highlight_selector` | string | CSS selector del elemento a resaltar. |
| `action` | string | Accion esperada (ver tabla siguiente). |
| `expected_query` | string | Query esperado en searchs. |
| `expected_items` | number | Cantidad de items que se esperan en el carrito. |
| `expected_barcode` | string | Codigo de barras especifico esperado. |
| `next_link` | string | URL a navegar al completar. |
| `role_only` | string[] | Limita el paso solo a ciertos roles. |

## Acciones disponibles

| Accion | Evento POS escuchado | Avance automatico |
|--------|----------------------|---------------------|
| `next` | (boton manual) | si, al click |
| `complete` | (boton manual, marca fin) | si, al click |
| `wait_for_search` | `volvix:search` | si, cuando query coincide |
| `wait_for_cart` | `volvix:cart-add` | si, al primer add |
| `wait_for_multiple_items` | `volvix:cart-add` | si, al alcanzar `expected_items` |
| `wait_for_payment` | `volvix:payment-done` | si |
| `wait_for_payment_with_tip` | `volvix:payment-done` | si |
| `wait_for_barcode` | `volvix:barcode-scan` | si, si codigo coincide |
| `wait_for_table_select` | `volvix:table-select` | si |
| `wait_for_kitchen_send` | `volvix:kitchen-send` | si |
| `wait_for_walkin` | `volvix:walkin-create` | si |
| `wait_for_customer_create` | `volvix:customer-create` | si |
| `wait_for_membership_select` | `volvix:membership-add` | si |
| `wait_for_vehicle_register` | `volvix:vehicle-register` | si |
| `wait_for_variant_select` | `volvix:variant-add` | si |
| `wait_for_discount` | `volvix:discount-apply` | si |
| `wait_for_service` | `volvix:service-add` | si |

> Los eventos `volvix:*` deben ser disparados por el POS via `window.dispatchEvent(new CustomEvent('volvix:search', { detail: { query: 'latte' } }))`.

## Tracking de progreso

`localStorage` keys:

- `volvix_wizard_progress_{giro}`: JSON con `{ stepIndex, completedSteps[], startedAt, completedAt }`
- `volvix_wizard_first_sale_done`: `'1'` cuando el usuario completo la primera venta
- `volvix_wizard_banner_dismissed`: `'1'` para no volver a mostrar el banner
- `volvix_welcome_completed`: `'1'` se setea por el wizard de onboarding R12-O-3-B
- `volvix_user_role`: rol del usuario activo (owner, cashier, etc.)

## Variantes por rol (FIX-O5-E-4)

El engine filtra los pasos segun el rol detectado en `window.VolvixUser.role` o `localStorage.volvix_user_role`:

- **owner / manager**: ven todos los pasos
- **cashier**: solo flow de venta (search, cart, payment)
- **inventarista / stockist**: solo pasos de tipo inventory
- **waiter / barber / pharmacist / trainer / operator / salesperson**: solo pasos marcados `role_only` con su rol

Para limitar un paso a ciertos roles, agrega `"role_only": ["cashier"]` al step.

## Auto-trigger banner (FIX-O5-E-3)

`volvix-wizard-by-industry-wiring.js` se auto-ejecuta al cargar y muestra un banner en el topbar cuando:

- El usuario completo el welcome wizard (`volvix_welcome_completed === '1'`)
- Aun no ha hecho su primera venta (`volvix_wizard_first_sale_done !== '1'`)
- No ha dismisseado el banner permanentemente

El banner ofrece un boton **"Comenzar"** que llama a `VolvixWizardByIndustry.start()`. Si el POS dispara `volvix:sale-completed` en algun momento, el banner se cierra y nunca vuelve.

## API publica

```js
// Lanzar wizard auto-detectando giro y rol
window.VolvixWizardByIndustry.start();

// Lanzar para un giro especifico
window.VolvixWizardByIndustry.startForGiro('cafe');

// Mostrar el banner manualmente
window.VolvixWizardByIndustry.injectBanner();

// Dismiss permanente
window.VolvixWizardByIndustry.dismiss();

// Helpers de detection
window.VolvixWizardByIndustry.detectGiro().then(g => console.log(g));
window.VolvixWizardByIndustry.detectRole();

// Lista de giros soportados
window.VolvixWizardByIndustry.SUPPORTED_GIROS;
```

## Como agregar un wizard para un giro nuevo

1. **Crea** `/public/wizards-by-industry/{giro}.json` siguiendo la estructura de arriba.
2. **Agrega** el id del giro al array `SUPPORTED_GIROS` dentro de `volvix-wizard-by-industry-wiring.js`.
3. **Asegurate** de que el catalogo demo del giro existe en R12a (productos, servicios y precios reales).
4. **Define** los `modules_required` y `roles` del wizard.
5. **Diseña 4-6 steps** que cubran: ver catalogo > agregar al carrito > cobrar > confirmar.
6. **Reusa selectors** existentes del POS (`#search-input`, `#btn-cobrar`, `.search-result-item`, etc.) para `highlight_selector`.
7. **Agrega entrada** en la tabla de "Giros soportados" en este documento.

## Como testear

### Smoke local sin POS

```js
// En la consola del browser:
window.VolvixWizardByIndustry.startForGiro('cafe');
// Avanza paso a paso con el boton "Siguiente".
```

### Test con eventos simulados

```js
// Simular que el POS disparo un search
window.dispatchEvent(new CustomEvent('volvix:search', { detail: { query: 'latte' } }));

// Simular agregar al carrito
window.dispatchEvent(new CustomEvent('volvix:cart-add', { detail: { sku: 'LAT-001' } }));

// Simular cobro completado
window.dispatchEvent(new CustomEvent('volvix:payment-done', { detail: { method: 'cash', amount: 50 } }));
```

### Test del banner

```js
// Forzar el banner
localStorage.setItem('volvix_welcome_completed', '1');
localStorage.removeItem('volvix_wizard_first_sale_done');
localStorage.removeItem('volvix_wizard_banner_dismissed');
location.reload();
```

### Reset completo

```js
['volvix_wizard_first_sale_done',
 'volvix_wizard_banner_dismissed',
 'volvix_wizard_progress_cafe',
 'volvix_wizard_progress_restaurante',
 'volvix_wizard_progress_taqueria',
 'volvix_wizard_progress_abarrotes',
 'volvix_wizard_progress_farmacia',
 'volvix_wizard_progress_ropa',
 'volvix_wizard_progress_barberia',
 'volvix_wizard_progress_gimnasio',
 'volvix_wizard_progress_papeleria',
 'volvix_wizard_progress_autolavado'
].forEach(k => localStorage.removeItem(k));
```

### Checklist QA

- [ ] El banner aparece solo despues del welcome wizard
- [ ] El banner se cierra al completar la primera venta
- [ ] El boton "Saltar tour" guarda dismiss permanente
- [ ] Los pasos se renderizan con titulo, texto y barra de progreso
- [ ] El `highlight_selector` resalta visualmente el elemento
- [ ] Los pasos `wait_for_*` avanzan al recibir el evento real
- [ ] El progreso se guarda en localStorage y se reanuda si refrescas
- [ ] Los wizards de los 10 giros cargan sin error 404
- [ ] El filtrado por rol funciona (cashier no ve pasos de inventory)
- [ ] El catalogo demo R12a aparece en el `text` de cada step

## Catalogo demo R12a (referencia)

Cada wizard hace referencia a productos reales que el seed R12a debe haber cargado en la BD del tenant. Si los textos del wizard mencionan precios y nombres que no existen, el usuario se confundira. Mantener sincronizado:

- `cafe.json` -> Latte Vainilla $45, Cafe Americano $30, Espresso $35, etc.
- `restaurante.json` -> Hamburguesa Clasica $120, Pizza Margarita $180, etc.
- `taqueria.json` -> Taco Pastor $18, Quesadilla $35, Refresco $25, etc.
- `abarrotes.json` -> Coca-Cola 600ml $18 (cod 7501234567890), Sabritas $17, etc.
- `farmacia.json` -> Paracetamol $48, Ibuprofeno $85, Amoxicilina $145 (controlled), etc.
- `ropa.json` -> Camisa Algodon $385 (variantes S/M/L/XL), Jean $585, etc.
- `barberia.json` -> Corte Caballero $150, Corte+Barba $220, Cera $185, etc.
- `gimnasio.json` -> Mensual $850, Trimestral $2295, Whey $890, etc.
- `papeleria.json` -> Cuaderno $48, Pluma Bic $8, Copia BN $0.50, etc.
- `autolavado.json` -> Lavado Express $80, Premium $280, Cera $185, etc.

## Compatibilidad

- Vanilla JS (no requiere framework)
- Funciona offline si los JSON estan cacheados por el SW
- Compatible con Electron y Capacitor
- No depende de jQuery ni de librerias externas
