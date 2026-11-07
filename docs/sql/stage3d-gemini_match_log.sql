-- STAGE 3d: gemini_match_log
-- 1. WHAT IT DOES: service_role only. Only the worker uses this table (address matching); no browser code references it. Before, any merchant could
--    read every tenant's match log.
-- 2. WHEN: BEFORE-MERGE (no browser caller in either ERP version).
-- 3. RISK: LOW.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Orders: use the address match on a TEST order.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_gemini_match_log_service on public.gemini_match_log;
create policy ne_gemini_match_log_service on public.gemini_match_log for all to service_role using (true) with check (true);

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'gemini_match_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.gemini_match_log', r.policyname);
  end loop;
end $$;

alter table public.gemini_match_log enable row level security;
revoke all on public.gemini_match_log from anon, authenticated;
-- no direct privileges for browser roles
grant all on public.gemini_match_log to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.gemini_match_log'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'gemini_match_log';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'gemini_match_log' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_gemini_match_log_service on public.gemini_match_log;
-- create policy rollback_gemini_match_log_auth_select on public.gemini_match_log for select to authenticated using (true);
-- grant select on public.gemini_match_log to authenticated;
-- grant all on public.gemini_match_log to service_role;
