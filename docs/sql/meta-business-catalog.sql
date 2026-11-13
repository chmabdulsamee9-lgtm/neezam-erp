-- Meta Connect: business + product catalogue columns (additive, nullable, no data change).
-- The worker only writes these when they exist (patchStoreOptional), so the order of deploy vs. SQL does not matter.
alter table public.stores
  add column if not exists meta_business_id text,
  add column if not exists meta_business_name text,
  add column if not exists meta_catalog_id text,
  add column if not exists meta_catalog_name text,
  add column if not exists meta_catalog_synced_at timestamptz,
  add column if not exists meta_catalog_item_count integer;

-- check
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'stores' and column_name like 'meta\_%' order by column_name;

-- rollback
-- alter table public.stores
--   drop column if exists meta_business_id, drop column if exists meta_business_name,
--   drop column if exists meta_catalog_id, drop column if exists meta_catalog_name,
--   drop column if exists meta_catalog_synced_at, drop column if exists meta_catalog_item_count;

-- 2026-11-13: terms + review submission (applied)
alter table public.stores
  add column if not exists meta_terms_accepted_at timestamptz,
  add column if not exists meta_review_submitted_at timestamptz;
-- rollback: alter table public.stores drop column if exists meta_terms_accepted_at, drop column if exists meta_review_submitted_at;
