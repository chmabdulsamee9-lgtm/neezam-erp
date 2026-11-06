-- STAGE 1f: stores. RISK: HIGHEST of stage 1 (every page loads the store row; the worker's getStores() and the storefront depend on it).
-- Needs stage 0 and the deployed worker commit 72b2250 (service key in getStores). Apply LAST in stage 1.
-- Apply one table at a time; smoke-test production ERP + dev preview after it (login, Home, Orders, Booked, Returns, Online Store,
-- Meta Connect, Settings > add brand, Team, Courier Connect) and drglow.online (home, product, cart, checkout). On breakage run the
-- ROLLBACK block immediately.
-- After this stage the secret columns are no longer readable by OTHER tenants, but any logged-in member of a store can still read
-- that store's own secret columns until STAGE 2. Stage 2 must wait for the production ERP merge (the old ERP does select('*')).
--
-- Browser needs (audit section 1): SELECT own/team stores (+ all stores for the creator), INSERT a new brand with user_id = auth.uid()
-- (Login sign-up, Settings add brand; the dev ERP now sends user_id), UPDATE non-secret columns (store_name by creator, default
-- weights, label mode), DELETE a store (Store Connect delete: owner/admin/creator).
-- NEEDS-CHECK before applying (a) the PRODUCTION ERP (old code) inserts a brand WITHOUT user_id: with the policy below that insert is
-- rejected until the dev ERP is merged. If you must apply stage 1f before the merge, replace ne_stores_insert with the relaxed
-- variant at the bottom (marked TEMPORARY). (b) Q11: if "Confirm email" is ON, sign-up has no session when it inserts the store.

drop policy if exists ne_stores_service on public.stores;
drop policy if exists ne_stores_select on public.stores;
drop policy if exists ne_stores_insert on public.stores;
drop policy if exists ne_stores_update on public.stores;
drop policy if exists ne_stores_delete on public.stores;
create policy ne_stores_service on public.stores for all to service_role using (true) with check (true);
create policy ne_stores_select on public.stores for select to authenticated using (public.has_store_access(id) or user_id = auth.uid());
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

-- VERIFY (read-only)
-- select policyname, roles, cmd from pg_policies where tablename = 'stores';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'stores' and grantee in ('anon','authenticated');
--   -- expect authenticated: DELETE, INSERT, SELECT, UPDATE and nothing for anon; no TRUNCATE / REFERENCES / TRIGGER
-- Logged in as a normal admin the ERP must list only that admin's stores; as the creator all stores.

-- TEMPORARY relaxed insert (only if the production ERP is not merged yet; remove after the merge):
-- drop policy ne_stores_insert on public.stores;
-- create policy ne_stores_insert on public.stores for insert to authenticated with check (user_id is null or user_id = auth.uid());
-- Caveat: a row inserted with user_id null is not readable by its creator until the user_stores link exists (the old ERP
-- does `.insert().select()`), so with the relaxed variant also run stage 4c user_stores BEFORE users sign up, or accept that
-- brand creation returns an error toast while still creating the row. Prefer merging the dev ERP first.

-- ============================== ROLLBACK (stage 1f) ==============================
-- Old state: public ALL true; anon and authenticated also held TRUNCATE / REFERENCES / TRIGGER (stage 0 removed those).
-- drop policy if exists ne_stores_service on public.stores;
-- drop policy if exists ne_stores_select on public.stores;
-- drop policy if exists ne_stores_insert on public.stores;
-- drop policy if exists ne_stores_update on public.stores;
-- drop policy if exists ne_stores_delete on public.stores;
-- create policy rollback_stores_public_all on public.stores for all to public using (true) with check (true);
-- grant all on public.stores to anon, authenticated, service_role;
