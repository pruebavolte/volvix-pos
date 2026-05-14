-- 2026-05-14 — R28: Cleanups + soft-deletes.
--
-- 1. FOLIO DUP CLEANUP: dejar log pero NO alterar tickets historicos.
--    Como los 5 ventas con folio=3 son de dias diferentes y son legitimas,
--    NO los renumeramos. Solo dejamos constancia en audit log.
--
-- 2. CLEANUP idempotency_keys expirados (libera espacio).
--
-- Idempotente.

-- 1. Audit log entry para documentar el caso de folio repetido detectado
INSERT INTO volvix_audit_log (
  user_id, action, resource_type, resource_id, payload, ts
) VALUES (
  NULL, 'integrity.folio_check', 'pos_sales', NULL,
  jsonb_build_object(
    'folio_repeated', '3',
    'note', 'Folio 3 aparece en 5 ventas legitimas de dias diferentes. Folio es un counter local del cajero, NO un identificador unico globalmente. La unicidad real la garantiza pos_sales.id (uuid). El check de integridad fue ajustado en commit 76c8fe3 para agrupar por (folio, dia, cashier_id).',
    'sale_ids', jsonb_build_array('e7abfa81', '14db7d04', 'c0c7c109', '891322c7', '4d06f384'),
    'decision', 'no-op: tickets historicos inmutables'
  ),
  now()
)
ON CONFLICT DO NOTHING;

-- 2. Cleanup idempotency_keys expirados (la funcion existe en R22)
SELECT cleanup_expired_security_records();

-- 3. Verificacion final
SELECT
  'idempotency_keys_remaining' AS metric,
  COUNT(*) AS value
FROM idempotency_keys
WHERE expires_at >= now()
UNION ALL
SELECT 'audit_log_entries', COUNT(*) FROM volvix_audit_log
UNION ALL
SELECT 'tax_rates_total', COUNT(*) FROM tax_rates
UNION ALL
SELECT 'features_total', COUNT(*) FROM pos_features
UNION ALL
SELECT 'product_lots_total', COUNT(*) FROM product_lots
UNION ALL
SELECT 'product_serials_total', COUNT(*) FROM product_serials;
