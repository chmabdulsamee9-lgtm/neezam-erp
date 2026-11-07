-- STAGE 3a: dex_tracking_events
-- GROUP: Group 2 ONLY, after production redeploy
-- PREREQUISITES: stage 0
-- ONE-LINE SMOKE TEST: Booked list and export (failure reasons column).
-- 1. WHAT IT DOES: Members read tracking events of their store (Booked: failure reasons). The worker writes with the service key. Before, any
--    merchant could read every tenant's events (authenticated SELECT true).
-- 2. WHEN: GROUP 2 ONLY, after production redeploy - NOT before the production redeploy: the old master BookedOrders.jsx reads dex_tracking_events from
--    the browser. Run it only once production runs the security hotfix / dev ERP and its tests passed there.
-- 3. RISK: LOW.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Booked list and export (failure reasons column).
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_dex_tracking_events_service on public.dex_tracking_events;
drop policy if exists ne_dex_tracking_events_select on public.dex_tracking_events;
create policy ne_dex_tracking_events_service on public.dex_tracking_events for all to service_role using (true) with check (true);
create policy ne_dex_tracking_events_select on public.dex_tracking_events for select to authenticated using (public.has_store_access(store_id));
-- variant B (no store_id column) INSTEAD of the line above:
-- create policy ne_dex_tracking_events_select on public.dex_tracking_events for select to authenticated
--   using (exists (select 1 from public.order_statuses os where os.order_id::text = dex_tracking_events.order_id::text and public.has_store_access(os.store_id)));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'dex_tracking_events' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.dex_tracking_events', r.policyname);
  end loop;
end $$;

alter table public.dex_tracking_events enable row level security;
revoke all on public.dex_tracking_events from anon, authenticated;
grant select on public.dex_tracking_events to authenticated;
grant all on public.dex_tracking_events to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.dex_tracking_events'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'dex_tracking_events';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'dex_tracking_events' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_dex_tracking_events_service on public.dex_tracking_events;
-- drop policy if exists ne_dex_tracking_events_select on public.dex_tracking_events;
-- create policy rollback_dex_tracking_events_auth_select on public.dex_tracking_events for select to authenticated using (true);
-- grant select on public.dex_tracking_events to authenticated;
-- grant all on public.dex_tracking_events to service_role;
