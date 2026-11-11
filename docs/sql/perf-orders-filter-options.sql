-- PERF: orders_filter_options (Orders page City/SKU dropdown list)
-- Measured 2026-11-11 on Doctor Rubina (6,123 orders): 1,377 ms now -> 525 ms with this change.
-- Only change: compare store_id as uuid and order_id as text without casts, so the
-- idx_orders_cache_store index and a plain hash join are used. Same rows, same output.
-- Safe to run any time (no data change, no permission change). Rollback below.

CREATE OR REPLACE FUNCTION public.orders_filter_options(p_store text, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH r AS (
  SELECT s.raw_data AS raw, os.city AS os_city
  FROM shopify_orders_cache s
  LEFT JOIN order_statuses os ON os.order_id = s.id
  WHERE s.store_id = p_store::uuid
    AND coalesce(s.quota_hidden, false) = false
    AND (p_from IS NULL OR s.created_at >= p_from)
    AND (p_to IS NULL OR s.created_at <= p_to)
)
SELECT jsonb_build_object(
  'cities', coalesce((SELECT jsonb_agg(c ORDER BY c) FROM (
      SELECT DISTINCT coalesce(nullif(os_city,''), raw->'shipping_address'->>'city') AS c FROM r) q
      WHERE c IS NOT NULL AND c <> ''), '[]'::jsonb),
  'skus', coalesce((SELECT jsonb_agg(k ORDER BY k) FROM (
      SELECT DISTINCT unnest(order_skus(raw)) AS k FROM r) q WHERE k <> ''), '[]'::jsonb))
$function$;

-- VERIFY: explain (analyze) select orders_filter_options('9d504f91-1362-4530-9372-ca7c2c7046dc', null, null);
--   Execution Time should be ~0.5 s (was ~1.4 s).

-- ROLLBACK (the definition before this change):
-- CREATE OR REPLACE FUNCTION public.orders_filter_options(p_store text, p_from timestamp with time zone, p_to timestamp with time zone)
--  RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- WITH r AS (
--   SELECT s.raw_data AS raw, os.city AS os_city
--   FROM shopify_orders_cache s
--   LEFT JOIN order_statuses os ON os.order_id::text = s.id::text
--   WHERE s.store_id::text = p_store
--     AND coalesce(s.quota_hidden, false) = false
--     AND (p_from IS NULL OR s.created_at >= p_from)
--     AND (p_to IS NULL OR s.created_at <= p_to)
-- )
-- SELECT jsonb_build_object(
--   'cities', coalesce((SELECT jsonb_agg(c ORDER BY c) FROM (
--       SELECT DISTINCT coalesce(nullif(os_city,''), raw->'shipping_address'->>'city') AS c FROM r) q
--       WHERE c IS NOT NULL AND c <> ''), '[]'::jsonb),
--   'skus', coalesce((SELECT jsonb_agg(k ORDER BY k) FROM (
--       SELECT DISTINCT unnest(order_skus(raw)) AS k FROM r) q WHERE k <> ''), '[]'::jsonb))
-- $function$;
