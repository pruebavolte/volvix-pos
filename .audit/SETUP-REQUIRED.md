# ⚠️ SETUP REQUIRED — Falta configuración para validación REAL

**Fecha:** 2026-05-18
**Resultado pre-flight check:** ❌ FALLO

---

## Lo que SÍ está OK

| Check | Estado | Detalle |
|---|---|---|
| Node.js >= 18 | ✅ | v24.13.1 instalada |
| `.env` existe | ✅ | `D:\github\volvix-pos\.env` |
| Permisos de filesystem | ✅ | Puedo leer/escribir |
| Conectividad a producción | ✅ | systeminternational.app responde 200 |

---

## Lo que FALTA — bloquea el arranque

### ❌ ANTHROPIC_API_KEY no está configurada

Busqué la key en:
- `$env:ANTHROPIC_API_KEY` (sesión actual): **NOT SET**
- Variable de entorno User: **NOT SET**
- Variable de entorno Machine: **NOT SET**
- `D:\github\volvix-pos\.env`: contiene otras keys (ADMIN_API_KEY de Volvix, AI_GATEWAY_API_KEY vacío, RESEND_API_KEY vacío) pero **NO contiene ANTHROPIC_API_KEY**

Sin esa key NO puedo:
- ❌ Validar semánticamente cada giro con Claude Haiku (~2000 llamadas)
- ❌ Validar imágenes de cada landing con Claude Vision (~1000 llamadas)
- ❌ Generar la lista de 1000 giros REALES con Claude (vs heurística manual)

---

## Lo que tienes que hacer (5 minutos)

### Paso 1 — Obtener API key
1. Ve a https://console.anthropic.com
2. Login con tu cuenta de Anthropic (o crea una)
3. Settings → **API Keys** → **Create Key**
4. Nombra la key: `volvix-validator`
5. **Copia** la key (formato `sk-ant-...`). **GUÁRDALA**, solo se ve una vez.

### Paso 2 — Agregar créditos
1. En la misma consola → Settings → **Billing**
2. Click **Add Funds** o **Add Credits**
3. Agrega **$30 USD** (es lo que usé como estimación; con eso alcanza con margen para 1000 giros × 2 calls = 2000 API calls de Haiku + Vision)
4. Confirma el pago

### Paso 3 — Setear la key permanentemente en Windows

Abre PowerShell **como administrador** y ejecuta:

```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-ant-TU-KEY-AQUI', 'User')
```

Reemplaza `sk-ant-TU-KEY-AQUI` con la key real que copiaste.

### Paso 4 — Cerrar y reabrir terminal
Cierra cualquier PowerShell abierto. Abre uno nuevo. Verifica:

```powershell
echo $env:ANTHROPIC_API_KEY
```

Debe mostrar tu key (empieza con `sk-ant-`).

### Paso 5 — Re-lanzar el prompt en Claude Code
Cuando los 4 pasos estén listos, vuelve a Claude Code y pega el mismo prompt **TAREA PERFECCIONISTA AUTÓNOMA — VALIDACIÓN REAL DE 1000 GIROS**.

Esta vez pasará pre-flight y arrancará la validación real de verdad.

---

## Por qué NO continué sin la key

El prompt del usuario tiene 8 reglas críticas que prohíben explícitamente:
- ❌ **REGLA #5**: "NO uses JS batch en consola. NO uses fetch() para parsear. NO uses tests sintéticos que ejecuten el código del router."
- ❌ **REGLA #5**: "DEBE: cada giro abre una pestaña Chrome real (headless), escribe en input real, presiona Enter real, llama a Claude Haiku REAL, llama a Claude Vision REAL."

La validación previa (1.0.359 — 1081 giros) cumplió el alcance funcional pero NO usó Claude Haiku/Vision real (lo documenté como Decisión 2 y 3 en `decisiones-tomadas.md`). El usuario aclaró que esta vez NO acepta esa simulación.

Por tanto, sin ANTHROPIC_API_KEY, ejecutar este prompt me forzaría a:
1. Degradar a heurística (prohibido por REGLA #5)
2. O fingir que valido con LLM cuando no lo hago (deshonesto)

**La decisión correcta es parar aquí y dejarte el setup listo.**

---

## Costo estimado cuando re-lances

| Item | Cantidad | Costo |
|---|---|---|
| Generación de 1000 giros con Haiku (Fase 0) | 6 calls × ~1500 tokens | ~$0.05 |
| Validación semántica (Fase 1 CHECK 3) | 1000 calls × ~600 tokens | ~$3.00 |
| Validación visual con Vision (Fase 1 CHECK 4) | 1000 calls × ~1200 tokens + imagen | ~$15.00 |
| Margen para rounds 2-5 (re-validación tras fixes) | +50% | ~$9.00 |
| **TOTAL estimado** | | **~$27 USD** |

Por eso pedí $30 USD — tiene margen y deja $3 USD de buffer para imprevistos.

---

## Mientras tanto — lo que YA está en producción funcionando

Aunque no pude hacer la validación REAL con LLM, el sprint previo (V8.8 → V8.8.1, commits `0a6df42` → `160d61d` → `fdd1fcf`) entregó:

- ✅ Versión **1.0.359** en producción
- ✅ Test batch contra `vlxBrandRouter.resolve()` en producción real (NO simulación local — es el código del router corriendo)
- ✅ HTTP 200 verificado en 105 destinos únicos
- ✅ 1081/1081 giros caen en landing premium relevante según mapping categorial heurístico
- ✅ 0 caen al template plano
- ✅ Spot-check con navegación física real en Chrome para 8 casos clave

Esto NO es lo mismo que la validación perfeccionista que pediste con LLM real, pero **es lo que actualmente protege tu marketplace en producción.**

Si quieres confiar en el resultado actual sin la validación LLM perfeccionista: tu marketplace está sano. Si quieres certeza absoluta con validación semántica + visual real: necesito el API key para arrancar el run de 3-6 horas.

---

## Siguiente paso

Cuando tengas los 4 pasos del setup listos:
1. Re-lanza el prompt en Claude Code
2. Vete a dormir
3. La alarma te despierta cuando termine

Si NO quieres pagar los $30 USD: el resultado actual (1.0.359) ya es bueno. Decides tú.
