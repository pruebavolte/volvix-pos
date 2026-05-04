# Sugerencias post-MVP (no aplicar ahora)

## Naming inconsistencies (riesgo medio — requiere refactor cuidadoso)
- "Salir" / "Cerrar sesión" / "Logout" — coexisten en distintos buttons. El handler también varía (`logout()` vs `doLogout()`). Unificar requiere fusionar las dos funciones.
- "Recargar" / "🔄 Recargar" / "Refrescar" / "Actualizar" — todos = reload. Decidir un canonical (sugerencia: "Recargar" + emoji 🔄).
- "Nuevo producto" / "Agregar producto" / "Crear producto" — usar uno: "+ Nuevo producto".
- "Empezar gratis" / "Comenzar Pro" / "Iniciar ahora" / "Crear mi negocio" — el primary CTA ya es "Empezar gratis", el resto son context-specific OK.

## Branch master
- Local + origin tienen `master` atrás de `main`. Vercel está conectado a `main` ✅.
- Acción opcional: `git push origin --delete master` (eliminar) o `git checkout master && git reset --hard main && git push --force` (sincronizar). Decisión humana.

## Onboarding-wizard
- `volvix-onboarding-wizard.html` (40 líneas) es un redirect a `volvix-onboarding-v2.html`. Lo enlazan: marketplace, launcher, 404, sitemap, _generate_landings.py, tests b36.
- Para eliminarlo: agregar redirect 301 en `vercel.json` (`{ "source": "/volvix-onboarding-wizard.html", "destination": "/volvix-onboarding-v2.html", "permanent": true }`) y luego mover a REPETIDOS.

## inventario.html — bulk price update modal
- Funcionalidad única en `inventario.html` (ahora archivada en REPETIDOS): modal de actualización masiva de precios (subir/bajar %, asignar fijo, sumar, redondear).
- `pos-inventario.html` ya tiene "Actualizador masivo" en sección distinta. Si se quiere portar el modal, copiar de REPETIDOS.

## Multipos vs salvadorex
- `multipos_suite_v3.html` (2562 líneas) y `salvadorex_web_v25.html` (13121 líneas) coexisten como POS distintos. multipos es POS alterno simplificado. Decidir si mantener ambos o consolidar.
