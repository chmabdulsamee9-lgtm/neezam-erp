-- STAGE 3b: returns
-- 1. WHAT IT DOES: Members read their store's returns (Profit & Loss, Returns). Trigger support: members may INSERT rows for their own store
--    (create_return_record_if_needed runs as the user). Before: any merchant could read every tenant's rows (authenticated SELECT
--    true), and no authenticated INSERT policy existed.
-- 2. WHEN: BEFORE-MERGE. Old ERP reads these as a logged-in user; the new INSERT policy only adds a permission. MUST be applied BEFORE
--    stage4c3.
-- 3. RISK: LOW-MEDIUM.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Returns page, Profit & Loss damaged returns. Change a status on a TEST order (fires the triggers).
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- Trigger support: the invoker trigger functions (handle_order_returned, handle_order_shipped_dropship_debit, handle_dispatch_event ...) run as the
-- logged-in user and INSERT into this table, so authenticated gets an INSERT policy scoped by has_store_access(store_id). This file must be
-- applied BEFORE stage4c3 (RLS on order_statuses).
-- NEEDS-CHECK: assumes a store_id column (Q3). If CREATE POLICY fails nothing was changed. If a trigger also UPDATEs this table, add the
-- optional update policy shown in the comment below.

drop policy if exists ne_returns_service on public.returns;
drop policy if exists ne_returns_select on public.returns;
drop policy if exists ne_returns_insert on public.returns;
create policy ne_returns_service on public.returns for all to service_role using (true) with check (true);
create policy ne_returns_select on public.returns for select to authenticated using (public.has_store_access(store_id));
create policy ne_returns_insert on public.returns for insert to authenticated with check (public.has_store_access(store_id));
-- optional, only if a trigger is found to UPDATE this table (not needed by anything seen so far):
-- create policy ne_returns_update on public.returns for update to authenticated using (public.has_store_access(store_id)) with check (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'returns' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.returns', r.policyname);
  end loop;
end $$;

alter table public.returns enable row level security;
revoke all on public.returns from anon, authenticated;
grant select, insert on public.returns to authenticated;
grant all on public.returns to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.returns'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'returns';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'returns' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_returns_service on public.returns;
-- drop policy if exists ne_returns_select on public.returns;
-- drop policy if exists ne_returns_insert on public.returns;
-- create policy rollback_returns_auth_select on public.returns for select to authenticated using (true);
-- grant select on public.returns to authenticated;
-- grant all on public.returns to service_role;
