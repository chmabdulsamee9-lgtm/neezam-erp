-- STAGE 3g: dev_monitoring_log
-- 1. WHAT IT DOES: READ is creator only (the monitor pages are under master-dashboard). INSERT stays for authenticated, but only with their own
--    user_id (or none). anon INSERT is dropped: the browser logs only on dev/preview hosts (isDevEnv) and only through the Supabase
--    client of the logged-in user; the worker inserts with the service key. Before: authenticated SELECT true, INSERT for anon,
--    authenticated, service_role.
-- 2. WHEN: BEFORE-MERGE (production never logs from the browser; the old dev-host logging keeps working for logged-in users).
-- 3. RISK: LOW (developer tooling only).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. As the creator open Master dashboard > Dev Monitor and Gemini Monitor; as a normal admin those pages must show
--    nothing / be hidden.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_dev_monitoring_log_service on public.dev_monitoring_log;
drop policy if exists ne_dev_monitoring_log_select on public.dev_monitoring_log;
drop policy if exists ne_dev_monitoring_log_insert on public.dev_monitoring_log;
create policy ne_dev_monitoring_log_service on public.dev_monitoring_log for all to service_role using (true) with check (true);
create policy ne_dev_monitoring_log_select on public.dev_monitoring_log for select to authenticated using (public.is_creator());
-- NEEDS-CHECK: user_id is a uuid column (the ERP sends session.user.id). If it is text, compare user_id::text = auth.uid()::text.
create policy ne_dev_monitoring_log_insert on public.dev_monitoring_log for insert to authenticated with check (user_id is null or user_id = auth.uid());

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'dev_monitoring_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.dev_monitoring_log', r.policyname);
  end loop;
end $$;

alter table public.dev_monitoring_log enable row level security;
revoke all on public.dev_monitoring_log from anon, authenticated;
grant select, insert on public.dev_monitoring_log to authenticated;
grant all on public.dev_monitoring_log to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.dev_monitoring_log'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'dev_monitoring_log';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'dev_monitoring_log' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_dev_monitoring_log_service on public.dev_monitoring_log;
-- drop policy if exists ne_dev_monitoring_log_select on public.dev_monitoring_log;
-- drop policy if exists ne_dev_monitoring_log_insert on public.dev_monitoring_log;
-- create policy rollback_dev_monitoring_log_auth_select on public.dev_monitoring_log for select to authenticated using (true);
-- create policy rollback_dev_monitoring_log_insert_all on public.dev_monitoring_log for insert to anon, authenticated, service_role with check (true);
-- grant select, insert on public.dev_monitoring_log to anon, authenticated;
-- grant all on public.dev_monitoring_log to service_role;
