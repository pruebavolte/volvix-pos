# Agente Wave 2B — Screens BATCH (Tier 2, stubs)

## Misión

Crear contratos STUB (esqueletos estructurados) para múltiples screens en una sola corrida. Recibes una `LISTA_SCREENS` con 5 nombres.

## Inputs

- `LISTA_SCREENS`: array de 5 strings (ej. `["actualizador", "apertura", "ayuda", "config", "cotizaciones"]`)
- `public/system-map.json`
- `public/salvadorex-pos.html` (para extracción rápida, NO análisis profundo)
- `.specify/contracts/screens/SCREEN_TEMPLATE.md`

## Proceso por cada screen

Para CADA screen en LISTA_SCREENS, genera **un stub básico**. No análisis profundo. 5 minutos por screen máximo.

### Datos a extraer (rápido)

Del `system-map.json`:
- ¿Hay nodo `screen_pos_<nombre>`?
- Relaciones salientes → endpoints
- Sub-tabs (cfg_tab parents) si aplica
- Modales abiertos (si Parche 1 ya corrió)

Del HTML (un solo grep):
- `grep -n "showScreen('<nombre>'" public/salvadorex-pos.html` para conocer dónde se invoca.
- Si quieres, leer ±50 líneas alrededor del id="screen-<nombre>".

## Output por screen

Crea `.specify/contracts/screens/<SCREEN>.spec.md`:

```markdown
# Contrato (STUB): Screen `<SCREEN>`

> ⚠️ STUB Tier 2 — generado en blitz. Detalles a completar manualmente.

## Identidad

- **Nombre del showScreen()**: `<SCREEN>`
- **Archivo padre**: `public/salvadorex-pos.html`
- **Detectada en línea**: <approx>
- **Rol mínimo requerido**: TODO (inferir o asumir `cashier`)

## Responsabilidades

TODO — describir 3-5 bullets.

Inferido del nombre: <una línea de qué probablemente hace>

## UI principal

TODO

## Endpoints API que consume

(extraídos de system-map.json, validar manualmente)

| Método | Endpoint | Contrato |
|--------|----------|----------|
| TODO   | <endpoint1> | ⚠️ sin contrato |
| TODO   | <endpoint2> | ⚠️ sin contrato |

## Modales que abre

<lista del system-map o "ninguno detectado">

## Invariantes

TODO — escribir 3-5 después de revisar UI.

## Anti-patrones aplicables

- ❌ Hacer .from('tabla') directo (constitución C1).
- ❌ No re-fetchear después de mutar.
- ❌ Default sort distinto a `created_at DESC`.

## Checklist (sin verificar)

- [ ] Endpoints listados.
- [ ] Tabla(s) backend identificadas.
- [ ] Flujo end-to-end documentado.
- [ ] Verificación R9 ejecutada.

---

> STUB generado por blitz · Wave 2B · <timestamp>
> Prioridad para llenar: ⭐ baja por defecto. Subir si el usuario reporta bugs en esta screen.
```

## Eficiencia

Como debes hacer 5 screens, **NO uses 30 min por cada una**. Apunta a 2-3 min cada una:

1. Lee system-map.json UNA VEZ y memoriza.
2. Para cada screen, copia la plantilla stub y rellena solo los campos extraíbles del JSON.
3. Marca el resto como TODO.
4. Avanza.

## Reporte

Crea `.blitz/status/wave-2b-batch-<N>.md`:

```markdown
# Wave 2B — Screens batch <N>

- Estado: ✓
- Screens procesadas: <lista>
- Stubs creados: 5
- Total endpoints referenciados: N (sin validar)
- Total TODOs marcados: N
```
