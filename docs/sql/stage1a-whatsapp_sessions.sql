-- STAGE 1a: whatsapp_sessions. RISK: low (no ERP or worker code reads or writes this table; see audit section 3).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (login, Home, Orders, Booked,
-- Returns, Online Store, Meta Connect, Settings, Team, WhatsApp page). On breakage run the ROLLBACK block immediately.
-- NEEDS-CHECK: something outside these two repos (a WhatsApp bot / n8n / edge function) may write here with the anon key.
-- Q2 in needed-queries.sql shows the columns; if you know of such a writer, give it the service key BEFORE running this file.

-- 1. new policy first (service_role only)
drop policy if exists ne_whatsapp_sessions_service on public.whatsapp_sessions;
create policy ne_whatsapp_sessions_service on public.whatsapp_sessions for all to service_role using (true) with check (true);

-- 2. remove every older policy (the public ALL true one)
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'whatsapp_sessions' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.whatsapp_sessions', r.policyname);
  end loop;
end $$;

-- 3. RLS on, and no direct privileges for browser roles
alter table public.whatsapp_sessions enable row level security;
revoke all on public.whatsapp_sessions from anon, authenticated;
grant all on public.whatsapp_sessions to service_role;

-- VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.whatsapp_sessions'::regclass;                       -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'whatsapp_sessions';                       -- expect only ne_whatsapp_sessions_service
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'whatsapp_sessions' and grantee in ('anon','authenticated'); -- expect no rows

-- ============================== ROLLBACK (stage 1a) ==============================
-- Restores the old open table: RLS stays ON (as before it was OFF, but the old policy was permissive for public), so this
-- recreates the permissive public policy and the default Supabase grants.
-- drop policy if exists ne_whatsapp_sessions_service on public.whatsapp_sessions;
-- create policy rollback_whatsapp_sessions_public_all on public.whatsapp_sessions for all to public using (true) with check (true);
-- grant all on public.whatsapp_sessions to anon, authenticated, service_role;
