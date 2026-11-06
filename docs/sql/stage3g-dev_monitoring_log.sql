-- STAGE 3g: dev_monitoring_log. RISK: low (developer tooling only: Dev Monitor, Gemini Monitor, the worker's log writes).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Master dashboard > Dev Monitor and Gemini
-- Monitor as the creator; a normal merchant must NOT see them; then Orders, Home). On breakage run the ROLLBACK block immediately.
-- Before: authenticated SELECT (every merchant read every tenant's logs); INSERT for anon, authenticated, service_role.
-- Code audit: the browser inserts logs only in App.jsx logDevMonitoring (dev/preview hosts only, with a session when there is one);
-- the worker inserts with the service key. So anon INSERT is dropped (pre-login dev logs from preview hosts will be lost, harmless);
-- authenticated INSERT stays but may only carry the caller's own user_id (or none). READ is the creator only (the monitor pages are
-- under "master-dashboard").

drop policy if exists ne_dev_monitoring_log_service on public.dev_monitoring_log;
drop policy if exists ne_dev_monitoring_log_select on public.dev_monitoring_log;
drop policy if exists ne_dev_monitoring_log_insert on public.dev_monitoring_log;
create policy ne_dev_monitoring_log_service on public.dev_monitoring_log for all to service_role using (true) with check (true);
create policy ne_dev_monitoring_log_select on public.dev_monitoring_log for select to authenticated using (public.is_creator());
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

-- NEEDS-CHECK: user_id must be a uuid column (the ERP sends session.user.id). If it is text, cast: user_id::text = auth.uid()::text.

-- ============================== ROLLBACK (stage 3g) ==============================
-- drop policy if exists ne_dev_monitoring_log_service on public.dev_monitoring_log;
-- drop policy if exists ne_dev_monitoring_log_select on public.dev_monitoring_log;
-- drop policy if exists ne_dev_monitoring_log_insert on public.dev_monitoring_log;
-- create policy rollback_dev_monitoring_log_auth_select on public.dev_monitoring_log for select to authenticated using (true);
-- create policy rollback_dev_monitoring_log_insert_all on public.dev_monitoring_log for insert to anon, authenticated, service_role with check (true);
-- grant select, insert on public.dev_monitoring_log to anon, authenticated;
-- grant all on public.dev_monitoring_log to service_role;
