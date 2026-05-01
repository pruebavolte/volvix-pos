# Volvix POS — Runbook: Disaster Recovery

> **Round 8e — FIX-DR2**
> Owner: Equipo Plataforma
> Última actualización: 2026-04-28

Este runbook cubre los procedimientos operativos para recuperarse de una caída total o parcial de Volvix POS.

---

## 1. Métricas objetivo

| Métrica | Valor objetivo | Definición |
|---|---|---|
| **RTO** (Recovery Time Objective) | **< 30 min** | Tiempo máximo desde detección hasta servicio restaurado |
| **RPO** (Recovery Point Objective) | **< 1 hora** | Pérdida máxima de datos aceptable (frecuencia de backup) |
| **MTTD** (Mean Time To Detect) | < 5 min | Mediante `/api/health/full` polling cada minuto |
| **MTTR** (Mean Time To Recover) | < 25 min | Sin contar tiempo de detección |

---

## 2. Cuándo activar DR

Activa el plan de DR si se cumple **cualquiera** de estos disparadores:

1. **Supabase down**: el endpoint `/api/health/full` reporta `checks.supabase.ok=false` durante > 5 min
2. **API down**: > 50% de requests devuelven 5xx durante > 3 min
3. **Vercel down**: `https://salvadorexoficial.com` no responde
4. **Datos corruptos**: detectado por audit trail o reportado por owner
5. **Compromiso de seguridad**: leak de credenciales, RLS bypass detectado, etc.
6. **Decisión humana**: el owner activa DR vía status page (mensaje del owner)

### Cómo detectar (automatización)

```bash
# Cron cada 5min — alerta si hay 5xx
*/5 * * * * /opt/volvix/scripts/health-check-exhaustive.sh || curl -X POST $SLACK_WEBHOOK -d "DR triggered"
```

---

## 3. Procedimiento de Recovery (RTO < 30 min)

### Fase 1 — Detección y triage (0-5 min)

1. Confirmar que NO es un falso positivo:
   ```bash
   ./scripts/health-check-exhaustive.sh --base https://salvadorexoficial.com
   curl -s https://salvadorexoficial.com/api/health/full | jq .
   ```
2. Notificar al canal `#volvix-incidents` con: hora, tipo de incidente, alcance.
3. Designar **Incident Commander** (IC). El IC tiene autoridad para activar feature flags y rollback.

### Fase 2 — Mitigación inmediata (5-10 min)

**Antes de restaurar**, intenta mitigaciones rápidas para volver a operar:

#### Opción A — Activar emergency_mode (sigue vendiendo en cash)

```sql
-- Vía Supabase SQL editor (si la API está caída pero la DB no)
UPDATE pos_feature_flags SET enabled = TRUE WHERE key = 'emergency_mode';
INSERT INTO pos_emergency_mode_log (activated_by, reason, scope)
  VALUES (NULL, 'API down — fallback to cash-only', 'global');
```

Esto hace que el front-end exponga `volvix-emergency-mode.html` y los puntos de venta puedan seguir operando offline.

#### Opción B — Activar readonly_mode (deja vender pero sin writes)

```sql
UPDATE pos_feature_flags SET enabled = TRUE WHERE key = 'readonly_mode';
```

Útil cuando la DB está degradada pero responde a lecturas.

#### Opción C — Disable módulos sospechosos

```sql
UPDATE pos_feature_flags SET enabled = TRUE WHERE key IN ('disable_promotions', 'disable_kds');
```

Si crees que un módulo nuevo causó el incidente.

#### Opción D — Rollback de Vercel

```bash
# Vercel CLI
vercel ls --prod                          # listar deploys
vercel rollback <deploy-url-anterior>     # volver al deploy previo
```

### Fase 3 — Restore (10-25 min)

Solo si las mitigaciones no resuelven el incidente:

#### 3.1 — Detener tráfico al front actual

```bash
# Pausar Vercel (evita que sigan cayendo writes corruptos)
vercel pause volvix-pos
```

#### 3.2 — Identificar último backup válido

```bash
# Listar backups locales
ls -lh backups/volvix_pos_backup_*.sql

# O desde S3
aws s3 ls s3://volvix-backups/backups/ | tail -10

# Verificar checksum
cd backups
sha256sum -c volvix_pos_backup_<TS>.sql.sha256
```

#### 3.3 — Restaurar la DB

```bash
# Opción 1: usando el script
./scripts/backup-restore-drill.sh --restore backups/volvix_pos_backup_<TS>.sql

# Opción 2: manual
supabase db reset --linked          # SOLO si hay corrupción total
supabase db query --linked < backups/volvix_pos_backup_<TS>.sql
```

> **CUIDADO**: `supabase db reset` borra TODO. Solo úsalo si el restore completo es la única opción.

#### 3.4 — Re-deploy

```bash
vercel resume volvix-pos
vercel --prod --yes
```

#### 3.5 — Sincronizar ventas de emergency_mode

Si durante el outage se usaron `volvix-emergency-mode.html`, las ventas quedan en `pos_emergency_sync_queue`:

```sql
-- Ver pendientes
SELECT COUNT(*) FROM pos_emergency_sync_queue WHERE processed_at IS NULL;

-- Procesar manualmente o via API:
-- POST /api/sales/emergency-sync/flush  (futuro round R8c+)
```

### Fase 4 — Verificación post-restore (25-30 min)

```bash
# 1. Health check exhaustivo
./scripts/health-check-exhaustive.sh

# 2. Verificar feature flags están en estado correcto
echo "SELECT key, enabled FROM pos_feature_flags;" | supabase db query --linked

# 3. Desactivar emergency_mode si estaba activo
echo "UPDATE pos_feature_flags SET enabled = FALSE WHERE key = 'emergency_mode';" | supabase db query --linked
echo "UPDATE pos_emergency_mode_log SET deactivated_at = NOW() WHERE deactivated_at IS NULL;" | supabase db query --linked

# 4. Smoke manual:
#    - Login con cuenta admin
#    - Crear producto
#    - Hacer venta de prueba
#    - Verificar audit log
#    - Verificar reportes muestran datos
```

---

## 4. Checklist post-restore

Marca cada item ANTES de declarar "incidente cerrado":

- [ ] `health-check-exhaustive.sh` exit 0
- [ ] Login funciona (admin + owner + cashier)
- [ ] POS abre carrito y crea venta de prueba ($1)
- [ ] Audit log registra la venta de prueba
- [ ] Reportes (dashboard) muestran datos consistentes
- [ ] Inventario muestra cantidades correctas
- [ ] Cortes anteriores están intactos
- [ ] Emergency mode flag = FALSE
- [ ] Todas las ventas de `pos_emergency_sync_queue` procesadas
- [ ] Comunicación al canal: incidente cerrado + resumen
- [ ] Postmortem programado (en < 48h)

---

## 5. Backup strategy

### Frecuencia
- **Producción**: cada hora (cron en GitHub Actions)
- **Pre-deploy**: antes de cada migration nueva
- **Bajo demanda**: cualquier admin puede ejecutar drill

### Retention
- Local: 30 días
- S3 (offsite): 90 días estándar + 1 año en glacier
- Pre-deploy: indefinido (snapshots)

### Storage offsite
Configura ANY de:
```bash
# AWS S3 (recomendado)
export AWS_S3_BUCKET=volvix-backups
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# O Google Drive
export GDRIVE_FOLDER_ID=...
```

### Drill mensual (mandatory)

```bash
# Primer lunes de cada mes — restore drill en ambiente staging
./scripts/backup-restore-drill.sh                                  # crea backup
./scripts/backup-restore-drill.sh --restore <último_backup>        # en staging
./scripts/health-check-exhaustive.sh --base https://staging.salvadorexoficial.com
```

Documenta el resultado en `docs/dr-drill-history.md`.

---

## 6. Comunicación durante incidente

### Status page
URL pública: `https://salvadorexoficial.com/status-page.html`

Para mostrar mensaje de owner durante incidente, abre la consola del browser y ejecuta:
```js
localStorage.setItem('volvix_status_owner_message',
  '[2026-04-28 15:00 UTC] Mantenimiento de emergencia. Volvemos en 30 min.');
```

> Nota: en futuro round se moverá a un endpoint público `/api/status/message` para que sea visible a todos los clientes simultáneamente.

### Plantilla de comunicación inicial

> 🚨 **[INCIDENT]** Volvix POS - <descripción breve>
> - Inicio: <hora UTC>
> - Impacto: <qué módulos / cuántos tenants afectados>
> - Estado: investigando | mitigando | recuperando | resuelto
> - IC: @<usuario>
> - Próximo update: <hora>

---

## 7. Contactos de escalación

| Nivel | Canal | Tiempo de respuesta |
|---|---|---|
| L1 | Slack `#volvix-support` | < 15 min |
| L2 | Slack `#volvix-eng` + page IC | < 5 min |
| L3 | Llamada al CTO + dueño Supabase | inmediato |
| Vendor | Supabase status: https://status.supabase.com | varía |
| Vendor | Vercel status: https://www.vercel-status.com | varía |

---

## 8. Postmortem template

Después de cada DR, crea `docs/postmortems/YYYY-MM-DD-<slug>.md` con:

- Resumen ejecutivo (1 párrafo)
- Línea de tiempo (timestamp UTC + acción)
- Causa raíz (5 Whys)
- Impacto: tenants afectados, transacciones perdidas, downtime
- Qué funcionó bien
- Qué no funcionó
- Action items (con owner + deadline)

---

## 9. Referencias

- `migrations/r8e-dr-feature-flags.sql` — schema de feature flags + emergency log
- `scripts/backup-restore-drill.sh` — script de backup
- `scripts/health-check-exhaustive.sh` — verificación post-restore
- `volvix-emergency-mode.html` — UI de fallback offline
- `status-page.html` — página pública de estado
- `docs/feature-flags-runbook.md` — uso de flags durante DR
