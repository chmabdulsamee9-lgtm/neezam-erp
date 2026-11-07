-- STAGE 1f: stores
-- 1. WHAT IT DOES: Row-level security on stores for authenticated only: SELECT own / team / owned stores (creator: all), INSERT only with user_id =
--    the caller, UPDATE by members (non-secret columns are all the browser touches), DELETE by the owner, an admin linked to the
--    store, or the creator. anon gets nothing; service_role keeps everything.
-- 2. WHEN: AFTER-MERGE (needs the new ERP code in production). The old production ERP inserts a brand WITHOUT user_id (Login sign-up,
--    Settings > add brand), which this INSERT policy rejects. The hotfix branch / dev code sends user_id and moves sign-up to the
--    worker (/signup-create-account).
-- 3. RISK: HIGHEST of stage 1 (every page loads the store row; the worker's getStores() and the storefront depend on it, both use the
--    service key and are unaffected).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Settings > add a brand on a TEST account, sign-up of a TEST account on the new code, Courier Connect weights,
--    Store Connect.
-- 5. ROLLBACK: The ROLLBACK block restores the old open policy. After this stage other tenants can no longer read this store's secrets, but
--    members still can until STAGE 2.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- UPDATE is for members (not only admins) on purpose: staff with the courier permission save default weights and the label mode from the browser.
-- Which columns a member may change is decided by stage 2 (secret columns are blocked there).

drop policy if exists ne_stores_service on public.stores;
drop policy if exists ne_stores_select on public.stores;
drop policy if exists ne_stores_insert on public.stores;
drop policy if exists ne_stores_update on public.stores;
drop policy if exists ne_stores_delete on public.stores;
create policy ne_stores_service on public.stores for all to service_role using (true) with check (true);
create policy ne_stores_select on public.stores for select to authenticated using (public.has_store_access(id));
create policy ne_stores_insert on public.stores for insert to authenticated with check (user_id = auth.uid());
create policy ne_stores_update on public.stores for update to authenticated using (public.has_store_access(id)) with check (public.has_store_access(id));
create policy ne_stores_delete on public.stores for delete to authenticated using (public.is_store_admin(id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'stores' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.stores', r.policyname);
  end loop;
end $$;

alter table public.stores enable row level security;
revoke all on public.stores from anon, authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant all on public.stores to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.stores'::regclass;                       -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'stores';                       -- expect 5 ne_stores_* policies
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'stores' and grantee in ('anon','authenticated');
--   -- expect authenticated: DELETE, INSERT, SELECT, UPDATE; nothing for anon; no TRUNCATE / REFERENCES / TRIGGER
-- Logged in as a normal admin the ERP lists only that admin's stores; as the creator all 9.

-- ============================== ROLLBACK
-- drop policy if exists ne_stores_service on public.stores;
-- drop policy if exists ne_stores_select on public.stores;
-- drop policy if exists ne_stores_insert on public.stores;
-- drop policy if exists ne_stores_update on public.stores;
-- drop policy if exists ne_stores_delete on public.stores;
-- create policy rollback_stores_public_all on public.stores for all to public using (true) with check (true);
-- grant all on public.stores to anon, authenticated, service_role;
