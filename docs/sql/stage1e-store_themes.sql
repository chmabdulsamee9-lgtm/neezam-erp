-- STAGE 1e: store_themes
-- 1. WHAT IT DOES: service_role only. The ERP reads and writes themes exclusively through the worker (list / get / create / update / publish /
--    delete), and the storefront reads the published theme through the worker too, so no browser role needs this table.
-- 2. WHEN: BEFORE-MERGE. Neither the old nor the new ERP touches the table directly (checked with git grep on master and dev).
-- 3. RISK: MEDIUM (the published theme of drglow.online lives here; the worker uses the service key, so the live store must not notice).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Online Store list, open the theme editor (NO Publish and NO Save on a real store), and open drglow.online home,
--    a product, the cart.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_store_themes_service on public.store_themes;
create policy ne_store_themes_service on public.store_themes for all to service_role using (true) with check (true);

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'store_themes' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.store_themes', r.policyname);
  end loop;
end $$;

alter table public.store_themes enable row level security;
revoke all on public.store_themes from anon, authenticated;
-- no direct privileges for browser roles
grant all on public.store_themes to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.store_themes'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'store_themes';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'store_themes' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_store_themes_service on public.store_themes;
-- create policy rollback_store_themes_public_all on public.store_themes for all to public using (true) with check (true);
-- grant all on public.store_themes to anon, authenticated, service_role;
