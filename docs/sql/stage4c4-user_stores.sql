-- STAGE 4c-4: user_stores (RLS currently DISABLED; store membership and staff permissions). RISK: HIGH (login resolves the user's stores
-- from it; has_store_access() reads it).
-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles. Apply one file at a time and
-- smoke-test BOTH production ERP (portal.eneezam.com) and the dev preview after it: login as admin (store list loads), as creator
-- (master dashboard lists admins), as staff (sees only own store), Team (change a permission, remove a TEST member), Settings > add brand
-- on a TEST account, sign-up of a TEST account on the dev preview. On breakage run the ROLLBACK block NOW. Needs stage 0 and stage 4a.
-- No recursion: has_store_access / is_store_admin are SECURITY DEFINER and read user_stores without RLS.
--
-- Browser needs: SELECT (App.jsx: own rows with embedded stores; creator: admins of all stores; Team.jsx: members of a store with
-- embedded profiles), INSERT (Login sign-up and Settings add brand: the user links THEMSELF to a store they own), UPDATE permissions and
-- DELETE a member (Team.jsx). Staff creation goes through the worker (/create-staff, service key).
-- Policies:
--   SELECT: own rows, or the store's admins/owner/creator see the whole team.
--   INSERT: a user may link themselves to a store whose stores.user_id is them (the dev ERP now sets user_id on every new store), or a
--           store admin/creator may add anyone.
--   UPDATE / DELETE: store admin (owner, an admin linked to the store, or creator).
-- NEEDS-CHECK: (1) the production ERP (old code) inserts brands without user_id, so on production the self-link INSERT fails until the dev
--   ERP is merged (sign-up and "add brand" only; existing users are unaffected). (2) Index suggestion for speed:
--   create index if not exists user_stores_user_store_idx on public.user_stores (user_id, store_id);   -- safe, additive (run it first)

drop policy if exists ne_user_stores_service on public.user_stores;
drop policy if exists ne_user_stores_select on public.user_stores;
drop policy if exists ne_user_stores_insert on public.user_stores;
drop policy if exists ne_user_stores_update on public.user_stores;
drop policy if exists ne_user_stores_delete on public.user_stores;
create policy ne_user_stores_service on public.user_stores for all to service_role using (true) with check (true);
create policy ne_user_stores_select on public.user_stores for select to authenticated
  using (user_id = auth.uid() or public.is_store_admin(store_id));
create policy ne_user_stores_insert on public.user_stores for insert to authenticated
  with check (public.is_store_admin(store_id)
              or (user_id = auth.uid() and exists (select 1 from public.stores s where s.id = store_id and s.user_id = auth.uid())));
create policy ne_user_stores_update on public.user_stores for update to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy ne_user_stores_delete on public.user_stores for delete to authenticated
  using (public.is_store_admin(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_stores' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.user_stores', r.policyname);
  end loop;
end $$;

alter table public.user_stores enable row level security;
revoke all on public.user_stores from anon, authenticated;
grant select, insert, update, delete on public.user_stores to authenticated;
grant all on public.user_stores to service_role;

-- VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.user_stores'::regclass;   -- expect true
-- As a staff user: select * from user_stores returns only their own rows.

-- ============================== ROLLBACK (stage 4c-4) ==============================
-- Old state: RLS disabled, full grants to anon and authenticated.
-- drop policy if exists ne_user_stores_service on public.user_stores;
-- drop policy if exists ne_user_stores_select on public.user_stores;
-- drop policy if exists ne_user_stores_insert on public.user_stores;
-- drop policy if exists ne_user_stores_update on public.user_stores;
-- drop policy if exists ne_user_stores_delete on public.user_stores;
-- alter table public.user_stores disable row level security;
-- grant all on public.user_stores to anon, authenticated, service_role;
