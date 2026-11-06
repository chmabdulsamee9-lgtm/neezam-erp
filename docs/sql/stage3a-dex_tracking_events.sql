-- STAGE 3a: dex_tracking_events. RISK: low (Booked orders: failure reasons list).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Booked list and export, Orders, Home,
-- Returns). On breakage run the ROLLBACK block immediately.
-- Before: any logged-in merchant could read every tenant's tracking events (authenticated SELECT true).
-- Browser needs: SELECT. Writes come from the worker (service key).
-- NEEDS-CHECK: assumes a store_id column (Q3). If missing, CREATE POLICY fails before anything is dropped; use variant B.

drop policy if exists ne_dex_tracking_events_service on public.dex_tracking_events;
drop policy if exists ne_dex_tracking_events_select on public.dex_tracking_events;
create policy ne_dex_tracking_events_service on public.dex_tracking_events for all to service_role using (true) with check (true);
create policy ne_dex_tracking_events_select on public.dex_tracking_events for select to authenticated using (public.has_store_access(store_id));
-- variant B (no store_id column), use INSTEAD of the line above:
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

-- ============================== ROLLBACK (stage 3a) ==============================
-- drop policy if exists ne_dex_tracking_events_service on public.dex_tracking_events;
-- drop policy if exists ne_dex_tracking_events_select on public.dex_tracking_events;
-- create policy rollback_dex_tracking_events_auth_select on public.dex_tracking_events for select to authenticated using (true);
-- grant select on public.dex_tracking_events to authenticated;
-- grant all on public.dex_tracking_events to service_role;
