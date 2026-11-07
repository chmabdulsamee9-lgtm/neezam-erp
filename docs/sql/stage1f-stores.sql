-- STAGE 1f: stores
-- GROUP: Group 2 ONLY, after production redeploy
-- PREREQUISITES: stage 0 + the security hotfix / dev ERP live in production
-- ONE-LINE SMOKE TEST: Settings > add a brand on a TEST account, sign up a TEST account, drglow.online home loads.
-- 1. WHAT IT DOES: Row-level security on stores for authenticated only: SELECT own / team / owned stores (creator: all), INSERT only with user_id =
--    the caller, UPDATE by members (non-secret columns are all the browser touches), DELETE by the owner, an admin linked to the
--    store, or the creator. anon gets nothing; service_role keeps everything.
-- 2. WHEN: GROUP 2 ONLY, after production redeploy - NOT before the production redeploy: the old master ERP selects / inserts / updates / deletes
--    stores from the browser (Login, Settings, Store Connect, Meta Connect, Courier Connect, App.jsx). Run it only once production runs the
--    security hotfix / dev ERP and its tests passed there.
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

-- OWNER LOGIC and the 9 stores. is_store_owner(store) is true for the service role, for stores.user_id = the caller, and, when stores.user_id is NULL,
-- for an ADMIN linked to that store in user_stores. 8 of the 9 stores have user_id NULL (Bloomvera, dewarekhas.pk, Doctor Rubina, DoctorSaba, DR GLOW, Innovenza,
-- KhasWall.com, Quench); each of them has exactly 1 member, an admin. The other store, Dewarekhas (id ce66dba7-36aa-4c8e-8a0a-cbd4bd27dc70), has user_id set and 3 members.
-- AFTER THIS FILE, per store: SELECT = creator, owner (stores.user_id), or anyone linked in user_stores. DELETE = is_store_admin(): the creator, the owner, or ANY admin linked to the store
-- (so on all 9 stores the linked admin can delete their own store row from Store Connect; staff cannot). INSERT = only with user_id = the caller (new brands are owned from now on).
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
