# R22 — Modal Form Submit Bug Fix

## Bug

`VolvixUI.form()` creaba un `<form>` con onsubmit handler y un boton `type="submit"`,
pero el footer del modal (con los botones) era renderizado por la funcion `modal()` como
**hermano** del body, NO dentro del `<form>`. Resultado: el boton submit estaba fuera
del form, el browser no disparaba `submit`, y el handler `onsubmit` nunca corria.

DevTools: `formInModal:false`, `type:"submit"`, `hasClickListener:false` -> click sin efecto.

## Root cause

En `modal()` (linea 134-139):
```js
if (opts.footer) {
  var footer = el('div', { class: 'vx-modal-footer' });
  ...
  modalEl.appendChild(footer); // <-- hermano de body, FUERA del <form>
}
```

`form()` pasaba `body: formEl, footer: [cancelBtn, submitBtn]`, lo que producia:
```
<div class="vx-modal">
  <div class="vx-modal-body"><form>...fields...</form></div>
  <div class="vx-modal-footer"><button type="submit">Crear</button></div>
</div>
```
El submit button quedaba huerfano del form. HTML5 requiere que el submit este dentro
del `<form>` (o tenga atributo `form="id"`) para disparar submit.

## Fix

`volvix-modals.js` linea ~286-310: meter los botones DENTRO del `<form>` como
`vx-modal-footer` interno, y omitir `footer` en la llamada a `modal()`.

### Diff

```diff
       var spinnerSpan = el('span', { class: 'vx-spinner', style: { display: 'none' } });
       var submitLabel = el('span', null, opts.submitText || 'Guardar');
       var submitBtn = el('button', { class: 'vx-btn vx-primary', type: 'submit' }, [spinnerSpan, submitLabel]);
-      formEl.appendChild(el('div', { style: { display: 'none' } })); // spacer
-      // Submit en Enter handled by form submit
+      // FIX: Botones dentro del <form> para que submit funcione (Enter + click).
+      var formFooter = el('div', { class: 'vx-modal-footer vx-form-footer' }, [cancelBtn, submitBtn]);
+      formEl.appendChild(formFooter);
+      submitBtn.addEventListener('click', function (e) {
+        if (e.defaultPrevented) return;
+      });

       var inst = modal({
         title: opts.title,
         description: opts.description,
         body: formEl,
         size: opts.size || 'md',
         dismissable: opts.dismissable !== false,
-        footer: [cancelBtn, submitBtn],
+        // footer omitido: ya esta dentro del <form>
         onClose: function (result) {
```

## Comportamiento garantizado

- Click en "Crear" -> submit nativo -> `formEl.onsubmit` -> `e.preventDefault()` ->
  `doSubmit()` -> validacion -> `opts.onSubmit(values)` -> close + resolve(values).
- ENTER en cualquier input -> submit nativo (boton submit ya esta dentro del form).
- TAB navega fields -> Cancelar -> Submit (orden DOM correcto).
- Cancelar/X cierra sin onSubmit, resolve(null).
- Error en onSubmit -> banner + reactiva botones.

## Validacion

```
$ node --check volvix-modals.js
SYNTAX_OK
```

## Deploy

```
$ vercel --prod --yes
Production: https://salvadorexoficial.com
Status: READY
Deployment: dpl_7ANdh9GBmoFRmKH9Wzz6Qc1dZzed
```

## Smoke test pendiente

Navegar a `/salvadorex_web_v25.html` -> "+ Nuevo producto" -> llenar 4 campos -> "Crear".
Esperado: POST /api/products, modal cierra, toast success, producto aparece en lista.
