-- STAGE 2: column-level lockdown of the secret columns on public.stores.
--
-- DO NOT RUN BEFORE THE DEV BRANCH IS MERGED TO PRODUCTION (portal.eneezam.com).
-- The old production ERP does supabase.from('stores').select('*') and writes api_token / meta tokens straight from the browser;
-- after this stage `select *` from the browser fails with "permission denied for column ..." and the whole ERP stops loading.
-- Also needs: stage 1f applied, worker commit 72b2250 deployed (it already is), dev ERP commit with SAFE_STORE_COLUMNS merged.
--
-- Secret columns: meta_access_token, dex_access_token, dex_refresh_token, shopify_client_secret, api_token.
-- authenticated and anon lose SELECT / INSERT / UPDATE on exactly those columns; every other column keeps working through
-- column-level grants (computed from information_schema, so columns I do not know about stay accessible). service_role keeps all.
-- The worker (service_role) is unaffected. DELETE stays a table-level grant.
-- Apply one stage at a time, then smoke-test production ERP and dev preview: login, Home, Orders, Booked, Returns, Online Store,
-- Meta Connect (connect, disconnect), Settings > Courier Connect, Team. On breakage run the ROLLBACK block immediately.

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
