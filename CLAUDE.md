# CLAUDE.md — Reglas universales de System International / Volvix POS

> Lee este archivo COMPLETO antes de tocar cualquier cosa.
> SOBREVIVE a la compactación de contexto. Si vuelves a este proyecto y NO recuerdas nada, lee esto PRIMERO.

> **⚠️ HANDOFF MÁS RECIENTE: `docs/HANDOFF_2026-05-15.md`** ← lee ese ANTES que este.
> Contiene: versión actual (v1.0.315), estado del sistema de impresión completo,
> arquitectura de 5,500 LOC nuevas, pendientes priorizados, comandos para continuar.

---

## 0. COMPORTAMIENTO GENERAL

- NO preguntas innecesarias. Si puedes tomar una decisión lógica, tómala.
- NO pausas entre fases. Ejecuta de corrido hasta terminar.
- NO "¿Continúo?" ni "¿Procedo con la siguiente fase?"
- Si algo falla, documéntalo y continúa con lo siguiente.
- Si hay ambigüedad, elige la opción más segura y conservadora.
- Al terminar cualquier tarea, genera siempre un reporte de lo que hiciste.

---

## 1. STACK Y ENTORNO

- **Frontend:** HTML vanilla + JS modular (sin framework). Archivos en `public/`.
- **Backend:** Node serverless en `api/index.js` (handlers map). Funciones edge en Supabase.
- **Base de datos:** Supabase Postgres (project id `cd6936c4-d884-4d4d-ad42-0d74f02aa106`).
- **Auth:** Custom JWT firmado en backend + email OTP (`/api/auth/register-simple`, `/api/auth/verify-simple`, `/api/login`).
- **Deploy:** Vercel — auto-deploy en push a `main`.
- **Repo:** `pruebavolte/volvix-pos` — branch principal: `main`.
- **Producción:** https://systeminternational.app/
- **Staging:** N/A (deploy directo a producción).

---

## 2. REGLAS DE DATOS — ANTI-HARDCODE

### PROHIBIDO:
- Nombres reales de negocios (ej. "Abarrotes Don Chucho"), personas o datos de demo visibles en producción.
- Arrays/objetos con datos falsos en el frontend.
- IDs fijos en queries sin filtro de `tenant_id` del JWT.
- Textos de UI quemados en código que deberían venir de BD.
- Credenciales/tokens/API keys en código fuente.

### OBLIGATORIO:
- Toda info dinámica viene de Supabase o variables de entorno.
- `.env` nunca al repo.
- Seed solo en scripts de seed.

---

## 3. REGLAS DE AUTENTICACIÓN

1. Registro → auto-login (NO segundo login).
2. Después de login/registro → redirigir al destino correcto del usuario (`/salvadorex-pos.html` para owner, `/volvix-launcher.html` para platform).
3. NO redirigir a páginas genéricas si hay destino personalizado.
4. JWT en `localStorage.volvix_token` disponible en toda la app.

---

## 4. REGLAS MULTI-TENANT

### Regla absoluta:
**Ningún usuario puede ver, editar ni eliminar datos de otro usuario.**

### Implementación:
- Toda query a Supabase filtra por `tenant_id` del JWT.
- RLS activo en todas las tablas críticas (Phase 1-5 OK, Phase 6 pendiente para `pos_sales`/`pos_products`/`kds_*`).
- Al crear registro: asociar al `tenant_id` autenticado.

### Test mental:
> "¿Puede A ver datos de B con esta query?" SÍ → bug → corregir antes de continuar.

---

## 5. REGLAS DE INTERFAZ

### Organización (ia-arquitectura aplicada):
- **CONFIGURACIÓN**: Usuarios, Roles, Datos del negocio, Terminología, Integraciones, Plan.
- **INVENTARIO**: Productos, Alta/Edición, Historial, Alertas stock bajo, Categorías, Proveedores.
- **CLIENTES**: Lista, Alta, Búsqueda, Historial, Saldo/crédito.
- **VENTAS/POS**: Caja, Historial, Devoluciones, Descuentos.
- **CORTE**: Corte del día, Historial cortes, Arqueo.
- **REPORTES**: Ventas, Top productos, Clientes frecuentes, Inventario valorado.

### Funcionalidad:
- Todo botón visible debe tener acción real.
- Prohibido `onClick` vacío, `console.log` solo, `alert('TODO')`.
- Formularios: validar, loading, éxito, error.

---

## 6. REGLAS DE CONFIGURACIÓN DINÁMICA

### Principio:
**UN solo sistema. Comportamiento cambia por config, no código separado.**

### Implementación (ver ROADMAP-GIRO-ARCHITECTURE.md):
- `giros_modulos` (giro_slug, modulo, activo).
- `giros_terminologia` (giro_slug, clave, valor) — "Cliente" → "Paciente".
- `giros_campos` (giro_slug, modal, campo, visible).
- `GET /api/giro/config` devuelve config del tenant.
- `salvadorex-pos.html` aplica al cargar.

---

## 7. CALIDAD DE CÓDIGO

- Sin `console.log` de debug en producción.
- Sin `TODO` sin issue.
- Sin datos hardcodeados visibles.
- Todos los `catch` hacen algo útil.
- Schema en migraciones versionadas Supabase.

---

## 8. SEGURIDAD MÍNIMA

- Secrets en env, no en código.
- Si secret en git history: rotar (Pexels + Google CSE pendientes).
- Sanitizar inputs (`htmlEsc` para XSS).
- Permisos en servidor (`requireAuth`), no solo UI.

---

## 9. METODOLOGÍA DE AUDITORÍA

1. Inventario completo (sin saltar archivos).
2. User journey: registro→primer uso, login→uso normal, cada función, errores, edge cases.
3. QA hostil: campos vacíos, valores fuera de rango, URLs ajenas, sin permisos, perder conexión.
4. Corregir AHORA, no documentar para después.
5. Reporte final: qué se corrigió, archivos modificados, cambios BD, pendientes.

---

## 10. VARIABLES DE ESTE PROYECTO

```
NOMBRE_PROYECTO=Volvix POS / System International
REPO=pruebavolte/volvix-pos
BRANCH_PRINCIPAL=main
URL_PRODUCCION=https://systeminternational.app/
URL_STAGING=N/A
BASE_DE_DATOS=Supabase Postgres (cd6936c4-d884-4d4d-ad42-0d74f02aa106)
AUTH_PROVIDER=Custom JWT + email OTP
IDENTIFICADOR_TENANT=tenant_id
TABLA_CONFIGURACION=giros_modulos, giros_terminologia, giros_campos
DEPLOY_AUTOMATICO=sí — push a main dispara deploy en Vercel
```

---

## FIN
