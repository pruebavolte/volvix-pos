# R17 — Anti-Fraud Rules Engine

Motor de reglas anti-fraude para detectar y revisar ventas sospechosas en POS Volvix.

## Componentes

### 1. Backend (`api/index.js`)
IIFE `attachFraudEngine()` añadida antes del MAIN HANDLER.

#### `evaluateFraudRisk(saleData, ctx)`
Calcula score 0-100 ejecutando reglas activas. Devuelve:
```json
{ "score": 85, "triggered": [...], "flagged": true, "threshold": 70 }
```

#### Hook automático
Wrap del handler `POST /api/sales`: intercepta `res.end`, parsea la sale, evalua riesgo asíncrono. Si `score > FRAUD_THRESHOLD` (default 70) crea registro en `fraud_alerts` y marca `pos_sales.fraud_review = true`.

#### Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET  | `/api/fraud/alerts?status=pending\|approved\|rejected` | admin, owner, superadmin | Listar alertas |
| GET  | `/api/fraud/rules` | admin, owner, superadmin | Listar reglas configuradas |
| POST | `/api/fraud/evaluate` | auth | Evaluar payload manualmente (testing) |
| POST | `/api/fraud/review/:sale_id` | admin, owner, superadmin | `{action:"approve"\|"reject", notes}` |

### 2. SQL (`db/R17_FRAUD.sql`)

#### `fraud_rules`
- `id, tenant_id, name, description, condition jsonb, weight (0-100), active, created_at, updated_at`
- 6 reglas seed insertadas: `high_amount`, `velocity_customer`, `card_test_pattern`, `geo_mismatch`, `new_high_amount`, `refund_frequency`.

#### `fraud_alerts`
- `id, tenant_id, sale_id, customer_id, score, triggered_rules jsonb, status (pending/approved/rejected), reviewed_by, reviewed_at, notes, created_at`
- Índices en `status`, `sale_id`, `tenant_id`, `created_at desc`.

#### Mod `pos_sales`
- `+ fraud_review boolean DEFAULT false`
- `+ fraud_score integer NULL`

### 3. Reglas y pesos por defecto

| Regla | Condición JSONB | Peso |
|---|---|---|
| `high_amount` | `{type:"amount_gt", value:10000}` | 25 |
| `velocity_customer` | `{type:"velocity", window:3600, max:5}` | 25 |
| `card_test_pattern` | `{type:"card_test", threshold:5, max_amount:100}` | 30 |
| `geo_mismatch` | `{type:"geo_mismatch"}` | 20 |
| `new_customer_high` | `{type:"new_customer_high", amount:2000}` | 20 |
| `refund_frequency` | `{type:"refund_freq", window:86400, max:3}` | 15 |

Threshold por defecto: 70 (env `FRAUD_THRESHOLD`).

### 4. Dashboard (`public/volvix-fraud-dashboard.html`)
- Lista alertas pendientes / aprobadas / rechazadas con filtro
- Auto-refresh cada 30s
- Botones Aprobar / Rechazar inline (llamada a `/api/fraud/review/:sale_id`)
- Muestra score con color (rojo ≥85, ámbar 70-84) y reglas disparadas

## Flujo end-to-end
1. POS POST `/api/sales` → handler crea `pos_sales`
2. Wrap intercepta saleRow → `evaluateFraudRisk` corre reglas activas
3. Si `score > 70` → INSERT `fraud_alerts (status=pending)` + UPDATE `pos_sales (fraud_review=true)`
4. Admin revisa en dashboard → POST `/api/fraud/review/:sale_id` con `approve|reject`
5. `approve` limpia flag; `reject` marca `pos_sales.status='void'`

## Variables de entorno
- `FRAUD_THRESHOLD` (default 70)

## Migración
```sql
\i db/R17_FRAUD.sql
```

## Pendientes / extensiones
- Geo-IP lookup real (ahora requiere header `X-IP-Country`)
- Webhooks `fraud.flagged` / `fraud.reviewed`
- Notificación Telegram al admin cuando score ≥ 90
