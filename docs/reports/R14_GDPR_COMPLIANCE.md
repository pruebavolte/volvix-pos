# R14 — Cumplimiento GDPR & Audit Log Inmutable

**Volvix POS — Release 14**
Última actualización: 2026-04-26

Este documento describe la implementación técnica y las políticas operativas que permiten a Volvix POS cumplir con el Reglamento (UE) 2016/679 (GDPR) y, de forma equivalente, con la LFPDPPP (México).

---

## 1. Componentes implementados

| Componente | Archivo | Propósito |
|---|---|---|
| Tabla audit log inmutable | `db/R14_AUDIT_GDPR.sql` (`volvix_audit_log`) | Registro WORM de todas las mutaciones |
| Triggers de auditoría | `db/R14_AUDIT_GDPR.sql` | Captura automática de INSERT/UPDATE/DELETE en tablas críticas |
| Tabla de solicitudes GDPR | `db/R14_AUDIT_GDPR.sql` (`volvix_gdpr_requests`) | Cola de solicitudes con estado y verificación |
| Función `gdpr_export_customer` | SQL | Exporta todos los datos personales en JSON |
| Función `gdpr_anonymize_customer` | SQL | Sustituye PII con hash SHA-256 determinista |
| Middleware audit | `api/index.js::auditMiddleware` | Loguea cada mutación HTTP |
| Endpoints REST | `api/index.js` | `/api/admin/audit-log`, `/api/gdpr/*` |
| Portal cliente | `public/volvix-gdpr-portal.html` | Interfaz pública sin login para ejercer derechos |

---

## 2. Mapping a artículos GDPR

| Artículo | Derecho | Implementación |
|---|---|---|
| **Art. 5(1)(f)** | Integridad y confidencialidad | Tabla `volvix_audit_log` con triggers que bloquean UPDATE/DELETE (inmutabilidad WORM) |
| **Art. 15** | Derecho de acceso | `POST /api/gdpr/access` → `gdpr_export_customer()` retorna JSON con todas las tablas que contienen al cliente |
| **Art. 17** | Derecho al olvido | `POST /api/gdpr/erasure` → `gdpr_anonymize_customer()` reemplaza PII con `anon_<sha256[:16]>@anon.invalid` |
| **Art. 20** | Portabilidad | `POST /api/gdpr/portability` → mismo export que Art. 15, formato JSON estructurado y descargable |
| **Art. 25** | Privacidad por diseño | RLS habilitado, claves enmascaradas en logs, hashing determinista para mantener integridad referencial sin PII |
| **Art. 30** | Registro de actividades | `volvix_audit_log` registra `user_id`, `tenant_id`, `action`, `resource`, IP, UA, timestamp |
| **Art. 32** | Seguridad del tratamiento | `service_role` único capaz de leer audit log; tokens de verificación con TTL 60 min |
| **Art. 33** | Notificación de brechas | El audit log permite reconstruir cualquier acceso anómalo en <72 h |

---

## 3. Políticas de retención

| Tipo de dato | Retención | Justificación legal |
|---|---|---|
| Datos personales activos (`volvix_usuarios`, `volvix_tenants`) | Mientras dure la relación contractual + 30 días tras cancelación | Art. 6(1)(b) GDPR — ejecución de contrato |
| Audit log (`volvix_audit_log`) | **5 años** desde la fecha del evento | Art. 30 GDPR + obligaciones fiscales (CFF Art. 30 México: 5 años) |
| Tickets de soporte (`volvix_tickets`) | 2 años desde el cierre | Interés legítimo Art. 6(1)(f) |
| Ventas anonimizadas (`volvix_ventas` post-erasure) | **10 años** | Obligación legal fiscal/contable |
| Solicitudes GDPR (`volvix_gdpr_requests`) | 3 años desde `completed_at` | Evidencia de cumplimiento Art. 5(2) |
| Tokens de verificación | 60 minutos | Minimización de datos Art. 5(1)(c) |

**Borrado automático:** se debe configurar un job diario (Supabase cron / pg_cron) que ejecute:

```sql
delete from volvix_gdpr_requests
 where completed_at < now() - interval '3 years';
```

> Nota: `volvix_audit_log` **no se borra**. Después de 5 años se exporta a archivado offline (cold storage) y se elimina del cluster.

---

## 4. Anonimización determinista

La función `gdpr_anonymize_customer(email)`:

1. Calcula `hash = sha256(email)[:16]`
2. Reemplaza email por `anon_<hash>@anon.invalid`
3. Reemplaza nombre por `Anonimizado-<hash>`
4. Limpia teléfono y dirección
5. Reescribe ocurrencias del email en campos de texto libre (notas, descripciones)
6. Marca todas las solicitudes `erasure` como `completed`
7. Inserta evento `ANONYMIZE` en audit log

**Ventajas del hash determinista:**
- La integridad referencial se mantiene (el mismo cliente sigue agrupando ventas históricas anonimizadas).
- Cumple con el Considerando 26 GDPR: dato anonimizado ≠ dato pseudonimizado, pero la determinación es irreversible sin la PII original.
- Permite reconstruir vínculos analíticos sin re-identificar.

---

## 5. Flujo del derecho al olvido

```
Cliente → Portal volvix-gdpr-portal.html
        → POST /api/gdpr/erasure { email }
        → volvix_gdpr_requests (status=verifying, token, expires=+60min)
        → Email con link /volvix-gdpr-portal.html?verify=<token>&id=<req_id>
Cliente hace click → POST /api/gdpr/erasure { request_id, verify_token }
        → status=processing → SELECT gdpr_anonymize_customer(email)
        → status=completed, completed_at=now()
        → Audit log: action=ANONYMIZE
        → Respuesta: hash, filas afectadas, fecha
```

SLA: **30 días naturales máximo** (Art. 12(3) GDPR). En la práctica el flujo automatizado completa en <60 segundos tras la verificación.

---

## 6. Endpoints API

### `GET /api/admin/audit-log`

Requiere header `X-Admin-Key: <ADMIN_API_KEY>`.

Query params: `from`, `to` (ISO8601), `user_id`, `action`, `tenant_id`, `resource`, `limit` (max 5000).

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "https://volvix.mx/api/admin/audit-log?from=2026-04-01&action=DELETE&limit=100"
```

### `POST /api/gdpr/{access|erasure|portability}`

**Fase 1 — solicitud:**
```json
POST /api/gdpr/erasure
{ "email": "cliente@dominio.com", "reason": "opcional" }
→ 202 { "ok": true, "request_id": "...", "verify_url": "..." }
```

**Fase 2 — verificación + ejecución:**
```json
POST /api/gdpr/erasure
{ "request_id": "...", "verify_token": "..." }
→ 200 { "ok": true, "data": {...}, "gdpr_article": "Art.17" }
```

---

## 7. Audit log — esquema y garantías

```sql
volvix_audit_log (
  id bigserial PK,
  ts timestamptz NOT NULL,
  user_id text, tenant_id uuid,
  action text CHECK IN (INSERT,UPDATE,DELETE,LOGIN,LOGOUT,EXPORT,ANONYMIZE,GDPR_REQUEST),
  resource text, resource_id text,
  before jsonb, after jsonb,
  ip text, user_agent text
)
```

**Garantías:**
- INSERT permitido únicamente vía `service_role` o triggers internos.
- UPDATE y DELETE bloqueados por triggers `volvix_audit_no_update` / `volvix_audit_no_delete`. Cualquier intento eleva una excepción explícita.
- RLS activo: solo `service_role` puede leer.
- Indexado por `ts`, `user_id`, `tenant_id`, `action`, `(resource, resource_id)`.

**Captura de contexto HTTP:** el middleware Node inserta `user_id`, `ip`, `user_agent` desde headers (`X-User-Id`, `X-Forwarded-For`). A nivel SQL, los triggers leen `current_setting('volvix.user_id', true)` etc., que la aplicación setea por sesión vía `SET LOCAL`.

---

## 8. Roles y responsabilidades

| Rol | Responsabilidad |
|---|---|
| **DPO** (privacy@volvix.mx) | Recibe escalaciones, supervisa SLA de 30 días, mantiene registro Art. 30 |
| **Admin del tenant** | Puede consultar `audit-log` filtrado por su `tenant_id` |
| **Cliente final** | Ejerce derechos vía portal sin necesidad de cuenta |
| **Operador del cluster** | Ejecuta jobs de retención, archiva audit log >5 años |

---

## 9. Pruebas obligatorias antes de producción

- [ ] Ejecutar `db/R14_AUDIT_GDPR.sql` en Supabase prod
- [ ] Verificar que `UPDATE volvix_audit_log SET ts=now()` falla con la excepción esperada
- [ ] Crear un usuario de prueba, ejecutar `gdpr_export_customer('test@x.com')` y validar JSON
- [ ] Ejecutar `gdpr_anonymize_customer('test@x.com')` y validar que el email original ya no aparece en ninguna tabla
- [ ] Validar que el portal `volvix-gdpr-portal.html` completa el flow E2E
- [ ] Configurar `ADMIN_API_KEY` en variables de entorno y probar `/api/admin/audit-log` con y sin key
- [ ] Configurar envío real de email para el token de verificación (sustituir `verify_token_dev` por entrega SMTP)

---

## 10. Mejoras futuras (R15+)

- Firmar entradas del audit log con HMAC encadenado (blockchain interna) para detectar manipulación al nivel de almacenamiento.
- Migrar tokens de verificación a JWT firmados para no requerir lookup en DB.
- Job diario que verifique consistencia hash-encadenada del audit log y emita alerta a Sentry si detecta gap.
- Soporte para "right to rectification" (Art. 16) vía endpoint dedicado.
- Dashboard admin en `owner.html` con visualización del audit log y métricas de solicitudes GDPR.
