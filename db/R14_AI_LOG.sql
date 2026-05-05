-- R14_AI_LOG.sql
-- Tabla de tracking de costos del AI Assistant (Claude API)
-- Permite calcular gasto por usuario/mes, tokens consumidos y modelo usado.

CREATE TABLE IF NOT EXISTS ai_chat_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model TEXT NOT NULL DEFAULT 'claude-3-5-haiku-20241022'
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_log_user_ts ON ai_chat_log (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_log_ts      ON ai_chat_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_log_model   ON ai_chat_log (model);

-- RLS: solo el dueño y admins pueden leer su log
ALTER TABLE ai_chat_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_chat_log_select_own ON ai_chat_log;
CREATE POLICY ai_chat_log_select_own ON ai_chat_log
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM pos_users u
            WHERE u.id = auth.uid()
              AND u.role IN ('admin', 'superadmin', 'owner', 'ADMIN')
        )
    );

DROP POLICY IF EXISTS ai_chat_log_insert_service ON ai_chat_log;
CREATE POLICY ai_chat_log_insert_service ON ai_chat_log
    FOR INSERT
    WITH CHECK (true);

-- Vista de costo estimado mensual (precios Haiku 3.5: $0.80 / 1M input, $4.00 / 1M output)
CREATE OR REPLACE VIEW ai_chat_cost_monthly AS
SELECT
    date_trunc('month', ts) AS month,
    user_id,
    model,
    SUM(prompt_tokens) AS total_input_tokens,
    SUM(completion_tokens) AS total_output_tokens,
    ROUND(
        (SUM(prompt_tokens)::numeric * 0.80 / 1000000.0)
      + (SUM(completion_tokens)::numeric * 4.00 / 1000000.0)
    , 4) AS estimated_cost_usd
FROM ai_chat_log
GROUP BY 1, 2, 3;
