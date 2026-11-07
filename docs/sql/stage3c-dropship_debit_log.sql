-- STAGE 3c: dropship_debit_log
-- 1. WHAT IT DOES: Members read their store's dropship debits. Trigger support: members may INSERT rows for their own store
--    (charge_dropship_debit_for_order runs as the user). Before: any merchant could read every tenant's rows (authenticated SELECT
--    true), and no authenticated INSERT policy existed.
-- 2. WHEN: BEFORE-MERGE. Old ERP reads these as a logged-in user; the new INSERT policy only adds a permission. MUST be applied BEFORE
--    stage4c3.
-- 3. RISK: LOW-MEDIUM.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Supplier Ledger. Change a status on a TEST order (fires the triggers).
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- Trigger support: the invoker trigger functions (handle_order_returned, handle_order_shipped_dropship_debit, handle_dispatch_event ...) run as the
-- logged-in user and INSERT into this table, so authenticated gets an INSERT policy scoped by has_store_access(store_id). This file must be
-- applied BEFORE stage4c3 (RLS on order_statuses).
-- NEEDS-CHECK: assumes a store_id column (Q3). If CREATE POLICY fails nothing was changed. If a trigger also UPDATEs this table, add the
-- optional update policy shown in the comment below.

drop policy if exists ne_dropship_debit_log_service on public.dropship_debit_log;
drop policy if exists ne_dropship_debit_log_select on public.dropship_debit_log;
drop policy if exists ne_dropship_debit_log_insert on public.dropship_debit_log;
create policy ne_dropship_debit_log_service on public.dropship_debit_log for all to service_role using (true) with check (true);
create policy ne_dropship_debit_log_select on public.dropship_debit_log for select to authenticated using (public.has_store_access(store_id));
create policy ne_dropship_debit_log_insert on public.dropship_debit_log for insert to authenticated with check (public.has_store_access(store_id));
-- optional, only if a trigger is found to UPDATE this table (not needed by anything seen so far):
-- create policy ne_dropship_debit_log_update on public.dropship_debit_log for update to authenticated using (public.has_store_access(store_id)) with check (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'dropship_debit_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.dropship_debit_log', r.policyname);
  end loop;
end $$;

alter table public.dropship_debit_log enable row level security;
revoke all on public.dropship_debit_log from anon, authenticated;
grant select, insert on public.dropship_debit_log to authenticated;
grant all on public.dropship_debit_log to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.dropship_debit_log'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'dropship_debit_log';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'dropship_debit_log' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_dropship_debit_log_service on public.dropship_debit_log;
-- drop policy if exists ne_dropship_debit_log_select on public.dropship_debit_log;
-- drop policy if exists ne_dropship_debit_log_insert on public.dropship_debit_log;
-- create policy rollback_dropship_debit_log_auth_select on public.dropship_debit_log for select to authenticated using (true);
-- grant select on public.dropship_debit_log to authenticated;
-- grant all on public.dropship_debit_log to service_role;
