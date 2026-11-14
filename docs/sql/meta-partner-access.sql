-- Meta permanent access (2026-11-14): when a store's Meta assets were shared with the eNeezam business portfolio
-- (partner access, used with eNeezam's never-expiring system user token).
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS meta_partner_at timestamptz;

-- Rollback:
-- ALTER TABLE public.stores DROP COLUMN IF EXISTS meta_partner_at;
