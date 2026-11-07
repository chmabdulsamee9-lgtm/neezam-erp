-- STAGE 4c-4: user_stores (RLS currently DISABLED; store membership and staff permissions)
-- 1. WHAT IT DOES: Turns RLS on. SELECT: own rows, plus every row of a store the caller owns / administers (creator: all). INSERT: the store owner
--    or a creator adds anyone; or a user adds THEIR OWN row for a store that has no members yet or that they own (this keeps the old
--    sign-up working while closing the join-any-store hole). UPDATE / DELETE: the store owner or a creator; for a legacy store with
--    no recorded owner (stores.user_id is null) an admin linked to it. SECURITY DEFINER helpers avoid recursion.
-- 2. WHEN: AFTER-MERGE (conservative; see the next line). It CAN run before the merge only if the owner has confirmed that Supabase
--    "Confirm email" is OFF: then the old sign-up and "add brand" have a session when they insert the user's own row (policy b), and
--    Team / App.jsx reads work unchanged. If "Confirm email" is ON the old sign-up has no session and would fail at this row.
--    Evidence that it is OFF: store_subscriptions INSERT is authenticated-only today and sign-ups work, but this is NOT proof.
-- 3. RISK: HIGH (login resolves the user's stores from it; has_store_access() reads it).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Log in as admin (store list loads), creator (master dashboard lists admins and their stores), staff (only own
--    store). Team: change a staff permission and remove a TEST member. Settings > add a brand on a TEST account. Sign up a TEST
--    account on the new code.
-- 5. ROLLBACK: The ROLLBACK block disables RLS and restores the full grants.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles.
-- Browser use (Part 1): App.jsx reads own rows (+ embedded stores) and, for the creator, all admin links; Team.jsx selects a store's members, updates
-- permissions and deletes a member; Login/Settings insert the user's own link. Nobody in the browser deletes their OWN row. Staff creation is in the
-- worker (/create-staff-user, service key).
-- NEEDS-CHECK before applying: select id, store_name, user_id from public.stores where user_id is null;   -- stores without a recorded owner.
--   For those, the Team page still works through the legacy-admin clause below. Optional cleanup so every store has an owner (run only if you agree,
--   it changes data; not run by anyone automatically):
--   update public.stores s set user_id = (select us.user_id from public.user_stores us join public.profiles p on p.id = us.user_id
--       where us.store_id = s.id and p.role = 'admin' order by us.user_id limit 1) where s.user_id is null;
-- Index (additive, safe, run first): create index if not exists user_stores_user_store_idx on public.user_stores (user_id, store_id);

create or replace function public.store_has_members(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_stores us where us.store_id = p_store_id); $$;

-- may add / change / remove members of this store: the owner or a creator; if the store has no recorded owner, an admin linked to it
create or replace function public.can_manage_team(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_store_owner(p_store_id)
      or (not exists (select 1 from public.stores s where s.id = p_store_id and s.user_id is not null) and public.is_store_admin(p_store_id));
$$;
revoke all on function public.store_has_members(uuid) from public, anon;
revoke all on function public.can_manage_team(uuid) from public, anon;
grant execute on function public.store_has_members(uuid) to authenticated, service_role;
grant execute on function public.can_manage_team(uuid) to authenticated, service_role;

drop policy if exists ne_user_stores_service on public.user_stores;
drop policy if exists ne_user_stores_select on public.user_stores;
drop policy if exists ne_user_stores_insert on public.user_stores;
drop policy if exists ne_user_stores_update on public.user_stores;
drop policy if exists ne_user_stores_delete on public.user_stores;
create policy ne_user_stores_service on public.user_stores for all to service_role using (true) with check (true);
create policy ne_user_stores_select on public.user_stores for select to authenticated
  using (user_id = auth.uid() or public.is_store_admin(store_id));
create policy ne_user_stores_insert on public.user_stores for insert to authenticated
  with check (public.can_manage_team(store_id)
              or (user_id = auth.uid() and (not public.store_has_members(store_id)
                                            or exists (select 1 from public.stores s where s.id = store_id and s.user_id = auth.uid()))));
create policy ne_user_stores_update on public.user_stores for update to authenticated
  using (public.can_manage_team(store_id)) with check (public.can_manage_team(store_id));
create policy ne_user_stores_delete on public.user_stores for delete to authenticated
  using (public.can_manage_team(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_stores' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.user_stores', r.policyname);
  end loop;
end $$;

alter table public.user_stores enable row level security;
revoke all on public.user_stores from anon, authenticated;
grant select, insert, update, delete on public.user_stores to authenticated;
grant all on public.user_stores to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.user_stores'::regclass;   -- expect true
-- As a staff user: select * from user_stores returns only their own rows. As a staff user: insert into user_stores for another store must FAIL.

-- ============================== ROLLBACK
-- drop policy if exists ne_user_stores_service on public.user_stores;
-- drop policy if exists ne_user_stores_select on public.user_stores;
-- drop policy if exists ne_user_stores_insert on public.user_stores;
-- drop policy if exists ne_user_stores_update on public.user_stores;
-- drop policy if exists ne_user_stores_delete on public.user_stores;
-- alter table public.user_stores disable row level security;
-- grant all on public.user_stores to anon, authenticated, service_role;
-- drop function if exists public.can_manage_team(uuid), public.store_has_members(uuid);   -- only after nothing else uses them
