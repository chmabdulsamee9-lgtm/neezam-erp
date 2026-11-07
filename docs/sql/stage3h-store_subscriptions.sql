-- STAGE 3h: store_subscriptions
-- 1. WHAT IT DOES: Closes the open `authenticated INSERT with_check true` policy: a member may insert only a 'pending_approval' request for their
--    own store; everything else (approve, edit access, quota) stays with the existing creator policies and the worker. The existing
--    SELECT policy (which maps through stores.eneezam_id) and the creator policies are NOT touched.
-- 2. WHEN: BEFORE-MERGE. The old ERP's sign-up inserts {store_id: eneezam_id, status: 'pending_approval'} as the new user (Login.jsx),
--    which the new policy allows once that user is linked to the store (user_stores row exists before the insert; stores.user_id is
--    also accepted). If "Confirm email" is ON the old sign-up has no session and would already fail today.
-- 3. RISK: MEDIUM (sign-up approval flow, module access, quota banner).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Log in as a normal admin (modules visible, no quota error); as the creator approve / edit access on a TEST
--    store; sign up a TEST account on the dev preview (new code) and see it appear under pending approvals.
-- 5. ROLLBACK: The ROLLBACK block recreates the open INSERT policy.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- store_subscriptions.store_id is TEXT = stores.eneezam_id, so the helper maps it. NEEDS-CHECK: the status value written by the ERP is
-- 'pending_approval' (Login.jsx, worker /signup-create-account); the task text said 'pending', the code says 'pending_approval'.

drop policy if exists ne_store_subscriptions_service on public.store_subscriptions;
drop policy if exists ne_store_subscriptions_insert_pending on public.store_subscriptions;
create policy ne_store_subscriptions_service on public.store_subscriptions for all to service_role using (true) with check (true);
create policy ne_store_subscriptions_insert_pending on public.store_subscriptions for insert to authenticated
  with check (status = 'pending_approval' and public.has_store_access_by_eneezam_id(store_id::text));

-- drop ONLY the open insert policy(ies): authenticated INSERT with check = true. Creator policies and the SELECT policy stay.
do $$ declare r record; begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'store_subscriptions' and cmd = 'INSERT'
              and policyname not like 'ne\_%' escape '\' and btrim(coalesce(with_check, 'true')) = 'true' loop
    raise notice 'dropping open insert policy %', r.policyname;
    execute format('drop policy %I on public.store_subscriptions', r.policyname);
  end loop;
end $$;

alter table public.store_subscriptions enable row level security;
revoke all on public.store_subscriptions from anon;
grant all on public.store_subscriptions to service_role;

-- ============================== VERIFY (read-only)
-- select policyname, roles, cmd, with_check from pg_policies where tablename = 'store_subscriptions' order by cmd, policyname;
--   -- expect: the creator policies, the SELECT policy, ne_store_subscriptions_insert_pending, ne_store_subscriptions_service; no INSERT with check true
-- as a normal admin: insert into store_subscriptions (store_id, status) values ('<own eneezam_id>', 'approved');   -- must FAIL

-- ============================== ROLLBACK
-- drop policy if exists ne_store_subscriptions_service on public.store_subscriptions;
-- drop policy if exists ne_store_subscriptions_insert_pending on public.store_subscriptions;
-- create policy rollback_store_subscriptions_auth_insert on public.store_subscriptions for insert to authenticated with check (true);
-- grant all on public.store_subscriptions to anon, authenticated, service_role;
