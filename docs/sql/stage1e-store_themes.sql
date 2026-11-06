-- STAGE 1e: store_themes. RISK: medium (Online Store and the theme editor; the PUBLISHED theme of drglow.online is stored here).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Online Store list, open the editor,
-- NO Publish / NO Save on a real store) and open drglow.online (home, product, cart). On breakage run the ROLLBACK block immediately.
-- Browser needs: NONE. The ERP reads and writes themes only through the worker (/list-store-themes, /get-store-theme,
-- /create-store-theme, /update-store-theme, /publish-store-theme, /delete-store-theme), which use the service key. The storefront
-- reads the published theme through the worker too. So: service_role only.
-- Realtime on this table (if you ever enabled it) would stop delivering to browsers; the code does not subscribe to it.

drop policy if exists ne_store_themes_service on public.store_themes;
create policy ne_store_themes_service on public.store_themes for all to service_role using (true) with check (true);

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'store_themes' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.store_themes', r.policyname);
  end loop;
end $$;

alter table public.store_themes enable row level security;
revoke all on public.store_themes from anon, authenticated;
grant all on public.store_themes to service_role;

-- VERIFY (read-only)
-- select policyname, roles, cmd from pg_policies where tablename = 'store_themes';   -- expect only ne_store_themes_service

-- ============================== ROLLBACK (stage 1e) ==============================
-- drop policy if exists ne_store_themes_service on public.store_themes;
-- create policy rollback_store_themes_public_all on public.store_themes for all to public using (true) with check (true);
-- grant all on public.store_themes to anon, authenticated, service_role;
