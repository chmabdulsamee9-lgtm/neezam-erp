-- Ads manager (2026-11-16): the product SKU assigned to a Meta campaign / ad set / ad, for costing and profit.
-- Only the worker (service key) reads and writes it; RLS on with no policies keeps it closed to browsers.
CREATE TABLE public.meta_ad_products (store_id uuid references stores(id) on delete cascade, level text check (level in ('campaign','adset','ad')), object_id text, sku text, updated_at timestamptz default now(), primary key (store_id, level, object_id));
ALTER TABLE public.meta_ad_products ENABLE ROW LEVEL SECURITY;
-- this project does not grant new tables to service_role by default
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_products TO service_role;
NOTIFY pgrst, 'reload schema';

-- Rollback:
-- DROP TABLE public.meta_ad_products;
