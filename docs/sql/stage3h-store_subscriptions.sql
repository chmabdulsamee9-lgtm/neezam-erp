-- STAGE 3h: store_subscriptions. RISK: medium (sign-up, module access control, quota banner, creator approvals).
-- Needs stage 0 (and stage 4c user_stores is NOT required). Apply one table at a time; smoke-test production ERP + dev preview after
-- it (login as a normal admin: Home loads, modules visible; login as creator: Master dashboard, approve/edit access on a TEST store;
-- sign-up of a TEST account on dev preview only). On breakage run the ROLLBACK block immediately.
-- INVESTIGATE result: store_subscriptions.store_id is stores.eneezam_id (text), not stores.id. Browser code:
--   select (own store: App.jsx refreshStoreSubscription; creator: all stores), insert (Login sign-up: status 'pending_approval';
--   creator: Master dashboard approve/access), update (creator only: App.jsx 559/1594).
-- Policies: SELECT = has access to the store with that eneezam_id; INSERT = creator any row, or anyone for their own store only as
-- 'pending_approval' (so nobody can self-approve); UPDATE / DELETE = creator only. The worker uses the service key.
-- NEEDS-CHECK: the columns `status` and `store_id` exist (they do in code); confirm with Q3.

drop policy if exists ne_store_subscriptions_service on public.store_subscriptions;
drop policy if exists ne_store_subscriptions_select on public.store_subscriptions;
drop policy if exists ne_store_subscriptions_insert on public.store_subscriptions;
drop policy if exists ne_store_subscriptions_update on public.store_subscriptions;
drop policy if exists ne_store_subscriptions_delete on public.store_subscriptions;
create policy ne_store_subscriptions_service on public.store_subscriptions for all to service_role using (true) with check (true);
create policy ne_store_subscriptions_select on public.store_subscriptions for select to authenticated using (public.has_store_access_eneezam(store_id::text));
create policy ne_store_subscriptions_insert on public.store_subscriptions for insert to authenticated
  with check (public.is_creator() or (status = 'pending_approval' and public.has_store_access_eneezam(store_id::text)));
create policy ne_store_subscriptions_update on public.store_subscriptions for update to authenticated using (public.is_creator()) with check (public.is_creator());
create policy ne_store_subscriptions_delete on public.store_subscriptions for delete to authenticated using (public.is_creator());

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'store_subscriptions' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.store_subscriptions', r.policyname);
  end loop;
end $$;
alter table public.store_subscriptions enable row level security;
revoke all on public.store_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.store_subscriptions to authenticated;
grant all on public.store_subscriptions to service_role;

-- ============================== ROLLBACK (stage 3h) ==============================
-- Old state: authenticated could INSERT (check unknown) and SELECT; Q1 holds the exact original text.
-- drop policy if exists ne_store_subscriptions_service on public.store_subscriptions;
-- drop policy if exists ne_store_subscriptions_select on public.store_subscriptions;
-- drop policy if exists ne_store_subscriptions_insert on public.store_subscriptions;
-- drop policy if exists ne_store_subscriptions_update on public.store_subscriptions;
-- drop policy if exists ne_store_subscriptions_delete on public.store_subscriptions;
-- create policy rollback_store_subscriptions_auth_all on public.store_subscriptions for all to authenticated using (true) with check (true);
-- grant all on public.store_subscriptions to authenticated, service_role;
