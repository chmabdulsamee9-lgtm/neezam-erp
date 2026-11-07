-- STAGE 2: column-level lockdown of the secret columns on public.stores
-- 1. WHAT IT DOES: authenticated and anon lose SELECT / INSERT / UPDATE on exactly meta_access_token, dex_access_token, dex_refresh_token,
--    shopify_client_secret and api_token; every other column keeps working through column-level grants computed from
--    information_schema. service_role keeps all (the worker is unaffected). DELETE stays a table-level grant.
-- 2. WHEN: AFTER-MERGE. DO NOT RUN BEFORE THE SECURITY CODE IS IN PRODUCTION: the old production ERP does
--    supabase.from('stores').select('*') and writes tokens straight from the browser; after this stage `select *` fails with
--    "permission denied for column" and the whole ERP stops loading. Needs stage 1f.
-- 3. RISK: HIGH (one wrong assumption stops every page that loads the store row).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Meta Connect (connect, disconnect), Store Connect (reconnect Shopify on a TEST store), Courier Connect
--    (weights, label mode), Settings > add a brand.
-- 5. ROLLBACK: The ROLLBACK block at the bottom is one line and instant.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

do $$
declare
  safe text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into safe
  from information_schema.columns
  where table_schema = 'public' and table_name = 'stores'
    and column_name not in ('meta_access_token','dex_access_token','dex_refresh_token','shopify_client_secret','api_token');

  -- drop table-level privileges, then grant back column by column (a table-level grant would override a column-level revoke)
  revoke select, insert, update on public.stores from anon, authenticated;
  execute format('grant select (%s) on public.stores to authenticated', safe);
  execute format('grant insert (%s) on public.stores to authenticated', safe);
  execute format('grant update (%s) on public.stores to authenticated', safe);
end $$;
grant all on public.stores to service_role;

-- VERIFY (read-only)
-- select column_name, privilege_type, grantee from information_schema.column_privileges
--   where table_name = 'stores' and grantee in ('anon','authenticated')
--     and column_name in ('meta_access_token','dex_access_token','dex_refresh_token','shopify_client_secret','api_token');   -- expect no rows
-- select has_column_privilege('authenticated', 'public.stores', 'store_name', 'select');                                   -- expect true
-- select has_column_privilege('authenticated', 'public.stores', 'api_token', 'select');                                    -- expect false

-- ============================== ROLLBACK (stage 2) ==============================
-- grant select, insert, update on public.stores to authenticated;
-- (anon had no access after stage 1f, so it is not re-granted here)
