# Agente Wave 2B — PDC Permission Tabs (stubs)

## Misión

Crear stubs para las 5 perm-tabs del paneldecontrol.html.

## Inputs

- `LISTA_PERM_TABS`: `["audit", "feats", "hierarchy", "mods", "users"]`
- `public/paneldecontrol.html`
- `public/system-map.json`

## Output

Para cada `<tab>`, crea `.specify/contracts/screens/pdc-<tab>.spec.md`:

```markdown
# Contrato (STUB): PDC Tab `perm-tab-<tab>`

> ⚠️ STUB Tier 2

## Identidad

- **Tab id en DOM**: `perm-tab-<tab>`
- **Archivo padre**: `public/paneldecontrol.html`
- **Rol REQUERIDO**: `platform_owner` (super-admin)
- **Detectada en línea**: <approx>

## Propósito (inferido del nombre)

- `audit`: probablemente log de acciones administrativas
- `feats`: probablemente flags de features por tenant
- `hierarchy`: probablemente jerarquía de tenants/sucursales
- `mods`: probablemente módulos habilitados por tenant
- `users`: probablemente gestión cross-tenant de usuarios

(Validar al revisar HTML)

## UI principal

TODO

## Endpoints API que consume

(de system-map.json)

| Método | Endpoint | Contrato |
|--------|----------|----------|
| ... | ... | ⚠️ sin contrato |

## Acceso

Esta tab es accesible SOLO a `platform_owner`. Verificación:
- Frontend: ¿muestra/oculta UI por rol?
- Backend: ¿endpoints rechazan rol < platform_owner?

## Iframe preview

Esta tab puede usar el patrón de cargar POS como iframe `?preview=1&module=X&giro=G` para "previsualizar como cliente final".

¿Esta tab específicamente lo usa? TODO (revisar HTML).

## Invariantes

- Solo `platform_owner` puede acceder.
- Cambios aquí afectan a TODOS los tenants (peligroso, requiere confirmación).
- Cualquier cambio debe quedar en log de audit.

## Anti-patrones

- ❌ Permitir acceso a rol < platform_owner.
- ❌ Hacer cambios sin registrar en audit log.
- ❌ Modificar config global sin opción de rollback.

---

> STUB por blitz · Wave 2B · <timestamp>
```

## Reporte

`.blitz/status/wave-2b-pdctabs.md`:

```markdown
# Wave 2B — PDC Tabs

- Estado: ✓
- Tabs procesadas: 5 (audit, feats, hierarchy, mods, users)
- Stubs creados: 5
```
