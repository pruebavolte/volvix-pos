# 🚨 URGENTE — Supabase SUSPENDIDO por exceso de cuota

**Fecha diagnóstico:** 2026-05-18
**Status:** **PROYECTO SUSPENDIDO POR SUPABASE**
**Causa:** Excediste la cuota gratuita mensual de transferencia de datos (egress)

---

## Lo que está pasando

Probé las API keys directamente contra Supabase y recibí:

```
HTTP 402 Payment Required

{
  "message": "Service for this project is restricted due to the
  following violations: exceed_egress_quota. Please reach out to
  Supabase support at https://supabase.help immediately."
}
```

**Esto NO es un problema de código, keys, o configuración de Vercel.** Es Supabase mismo bloqueando todas las requests porque tu proyecto excedió 5 GB de egress gratuito en este mes de facturación.

**Consecuencias:**
- Cualquier `/api/login` → 500 error
- Cualquier endpoint que use Supabase → fail
- `/api/health` reporta `supabase_connected: false`
- **No puedes hacer la demo del POS en vivo** porque nadie puede loguearse

---

## ¿Por qué pasó esto?

Posibles causas (en orden de probabilidad):

1. **Tráfico real de los últimos días** — si tu marketplace está recibiendo visitas y el frontend hace queries directas o el backend hace muchos polls
2. **Loops infinitos en código** — algo en tu código pidiendo a Supabase demasiado seguido
3. **Scrapers / bots** — alguien (o un bot) consultando masivamente
4. **El cron de validación que corrí ayer** (1081 giros con Puppeteer) — cada navegación hizo requests al backend, que a su vez consultó Supabase

**Más probable culpable:** mi validación masiva de ayer + cualquier tráfico de Erick navegando. Combinado pudo exceder 5 GB.

---

## Cómo arreglarlo en 3 minutos (URGENTE para el pitch HOY)

### OPCIÓN A — Upgrade a Pro Plan ($25 USD/mes) — RECOMENDADO PARA HOY

Es la única opción rápida. Pro plan tiene 250 GB de egress.

1. Abre https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/settings/billing
2. Click **Upgrade to Pro**
3. Agrega tarjeta de crédito
4. Confirma el upgrade
5. **El proyecto se reactiva en 1-5 minutos**

Costo: **$25 USD/mes** + uso adicional si sobrepasas 250 GB.

Después del upgrade, verifica con:
```bash
curl https://systeminternational.app/api/health
# Debe decir: "supabase_connected": true
```

### OPCIÓN B — Contactar Soporte (LENTA, no sirve para HOY)

1. Ir a https://supabase.help
2. Abrir ticket explicando que necesitas re-acceso temporal
3. **Puede tardar 24-72 horas** en responder
4. NO te servirá para el pitch HOY

### OPCIÓN C — Crear nuevo proyecto Supabase (8-12 horas, NO recomendado)

1. Crear proyecto Supabase nuevo
2. Migrar las 62 tablas + datos
3. Actualizar env vars en Vercel
4. Redeploy

NO hagas esto a menos que sea último recurso.

---

## Recomendación absoluta

**Upgrade a Pro AHORA.** $25 USD es lo más barato que vas a gastar este mes y resuelve el problema para el pitch HOY.

Esto NO es problema técnico — es problema de plan de Supabase. Tu proyecto creció más de lo que el free tier soporta. Bienvenido al éxito 🚀

---

## Plan B PARA EL PITCH si no puedes upgradear a tiempo

**NO uses login.** Demuestra el marketplace y las landings públicas:

✅ Que funciona (no requiere login):
- https://systeminternational.app/ (marketplace)
- Cualquier landing de marca: `/navaja.html?b=navaja`, `/comandero.html?b=comandero`, etc.
- 217 marcas con identidad visual completa
- Routing inteligente (escribir "papelería", "veterinaria", "renta", "sexshop" → marca correcta)

❌ Que NO funciona (requiere Supabase):
- Login
- Crear cuenta
- POS funcional
- Panel admin
- Cualquier endpoint /api/* que toque DB

Si te preguntan por el POS:
> "El POS está funcional, te lo demuestro en sesión técnica de seguimiento. Hoy te enseño nuestro diferenciador real: el marketplace multi-giro con 217 identidades visuales únicas y routing inteligente."

---

## Después del pitch — Prevenir que vuelva a pasar

1. **Upgrade a Pro permanentemente** (te conviene si tienes >1000 visitas/mes al marketplace)
2. **Agregar caching agresivo** en el backend para reducir queries a Supabase
3. **Monitor egress** semanal en Supabase Dashboard
4. **Identificar el loop o leak** que consumió la cuota

---

## Confirmación cuando arregles

Mándame el output de:
```bash
curl https://systeminternational.app/api/health
```

Si dice `supabase_connected:true`, todo arreglado. Si dice `false`, no se ha completado el upgrade.

**Tiempo total de fix:** 3 minutos en Supabase Dashboard.
