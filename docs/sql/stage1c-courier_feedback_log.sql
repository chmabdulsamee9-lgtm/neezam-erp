-- STAGE 1c: courier_feedback_log
-- GROUP: Group 2 ONLY, after production redeploy
-- PREREQUISITES: stage 0
-- ONE-LINE SMOKE TEST: Booked: expand an order's courier history.
-- 1. WHAT IT DOES: Members read feedback rows of their store (Booked: expanded order history and export); the worker inserts rows with the service
--    key. anon can no longer read or insert.
-- 2. WHEN: GROUP 2 ONLY, after production redeploy - NOT before the production redeploy: the old master BookedOrders.jsx reads courier_feedback_log
--    from the browser. Run it only once production runs the security hotfix / dev ERP and its tests passed there.
-- 3. RISK: LOW-MEDIUM.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Booked: expand an order to see its courier history, and run an export.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_courier_feedback_log_service on public.courier_feedback_log;
drop policy if exists ne_courier_feedback_log_select on public.courier_feedback_log;
create policy ne_courier_feedback_log_service on public.courier_feedback_log for all to service_role using (true) with check (true);
-- variant A (the table has a store_id column; run docs/sql/needed-queries.sql Q3 to check). If CREATE POLICY fails nothing was dropped yet: use variant B.
create policy ne_courier_feedback_log_select on public.courier_feedback_log for select to authenticated using (public.has_store_access(store_id));
-- variant B (no store_id column) INSTEAD of variant A:
-- create policy ne_courier_feedback_log_select on public.courier_feedback_log for select to authenticated
--   using (exists (select 1 from public.order_statuses os where os.order_id::text = courier_feedback_log.order_id::text and public.has_store_access(os.store_id)));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'courier_feedback_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.courier_feedback_log', r.policyname);
  end loop;
end $$;

alter table public.courier_feedback_log enable row level security;
revoke all on public.courier_feedback_log from anon, authenticated;
grant select on public.courier_feedback_log to authenticated;
grant all on public.courier_feedback_log to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.courier_feedback_log'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'courier_feedback_log';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'courier_feedback_log' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_courier_feedback_log_service on public.courier_feedback_log;
-- drop policy if exists ne_courier_feedback_log_select on public.courier_feedback_log;
-- create policy rollback_courier_feedback_log_public_select on public.courier_feedback_log for select to public using (true);
-- create policy rollback_courier_feedback_log_public_insert on public.courier_feedback_log for insert to public with check (true);
-- grant select, insert on public.courier_feedback_log to anon, authenticated;
-- grant all on public.courier_feedback_log to service_role;
