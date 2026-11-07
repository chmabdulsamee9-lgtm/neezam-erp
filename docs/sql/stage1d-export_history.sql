-- STAGE 1d: export_history
-- GROUP: Group 2 ONLY, after production redeploy
-- PREREQUISITES: stage 0
-- ONE-LINE SMOKE TEST: Booked: run an export, open the history list, download the file.
-- 1. WHAT IT DOES: Members read and add export-history rows of their store (Booked: the list of exported files). anon can no longer read or insert.
-- 2. WHEN: GROUP 2 ONLY, after production redeploy - NOT before the production redeploy: the old master BookedOrders.jsx reads and inserts
--    export_history from the browser. Run it only once production runs the security hotfix / dev ERP and its tests passed there.
-- 3. RISK: LOW.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Booked: run an export, then open the export history list and download the file.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_export_history_service on public.export_history;
drop policy if exists ne_export_history_select on public.export_history;
drop policy if exists ne_export_history_insert on public.export_history;
create policy ne_export_history_service on public.export_history for all to service_role using (true) with check (true);
create policy ne_export_history_select on public.export_history for select to authenticated using (public.has_store_access(store_id));
create policy ne_export_history_insert on public.export_history for insert to authenticated with check (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'export_history' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.export_history', r.policyname);
  end loop;
end $$;

alter table public.export_history enable row level security;
revoke all on public.export_history from anon, authenticated;
grant select, insert on public.export_history to authenticated;
grant all on public.export_history to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.export_history'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'export_history';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'export_history' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_export_history_service on public.export_history;
-- drop policy if exists ne_export_history_select on public.export_history;
-- drop policy if exists ne_export_history_insert on public.export_history;
-- create policy rollback_export_history_public_select on public.export_history for select to public using (true);
-- create policy rollback_export_history_public_insert on public.export_history for insert to public with check (true);
-- grant select, insert on public.export_history to anon, authenticated;
-- grant all on public.export_history to service_role;
