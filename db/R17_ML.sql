-- =============================================================
-- R17 — ML PREDICTIONS (inventory forecast / reorder / anomalies / clustering)
-- =============================================================

CREATE TABLE IF NOT EXISTS ml_predictions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  uuid NULL REFERENCES products(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('forecast','reorder','anomaly','cluster')),
  value       numeric NOT NULL DEFAULT 0,
  confidence  numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_tenant       ON ml_predictions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_product      ON ml_predictions(product_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_type         ON ml_predictions(type);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_generated_at ON ml_predictions(generated_at DESC);

ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ml_predictions_tenant_select ON ml_predictions;
CREATE POLICY ml_predictions_tenant_select ON ml_predictions
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id::text = current_setting('request.jwt.claim.tenant_id', true)
  );

DROP POLICY IF EXISTS ml_predictions_service_all ON ml_predictions;
CREATE POLICY ml_predictions_service_all ON ml_predictions
  FOR ALL
  USING (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');
