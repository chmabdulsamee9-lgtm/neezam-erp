-- STAGE 1c: courier_feedback_log. RISK: low-medium (Booked orders: courier feedback history and export).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Booked: expand an order's
-- courier history; Booked export; Orders; Home; Returns). On breakage run the ROLLBACK block immediately.
-- Browser needs: SELECT (BookedOrders.jsx filters by order_id). The worker inserts rows (service key).
-- NEEDS-CHECK: this file assumes the table has a store_id column (Q3 in needed-queries.sql). If it does not, CREATE POLICY
-- fails on the select policy BEFORE anything is dropped (nothing changes); then use variant B below.

drop policy if exists ne_courier_feedback_log_service on public.courier_feedback_log;
drop policy if exists ne_courier_feedback_log_select on public.courier_feedback_log;
create policy ne_courier_feedback_log_service on public.courier_feedback_log for all to service_role using (true) with check (true);
-- variant A (store_id column exists)
create policy ne_courier_feedback_log_select on public.courier_feedback_log for select to authenticated using (public.has_store_access(store_id));
-- variant B (no store_id column): scope through the order's status row. Use INSTEAD of variant A:
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

-- VERIFY (read-only)
-- select policyname, roles, cmd from pg_policies where tablename = 'courier_feedback_log';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'courier_feedback_log' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK (stage 1c) ==============================
-- Old state: public SELECT true + INSERT (confirmed by the owner's earlier SQL).
-- drop policy if exists ne_courier_feedback_log_service on public.courier_feedback_log;
-- drop policy if exists ne_courier_feedback_log_select on public.courier_feedback_log;
-- create policy rollback_courier_feedback_log_public_select on public.courier_feedback_log for select to public using (true);
-- create policy rollback_courier_feedback_log_public_insert on public.courier_feedback_log for insert to public with check (true);
-- grant select, insert on public.courier_feedback_log to anon, authenticated;
-- grant all on public.courier_feedback_log to service_role;
