-- STAGE 5c: whatsapp_sessions and whatsapp_replies (service_role only)
-- 1. WHAT IT DOES: Turns RLS on and removes all access for anon and authenticated; only service_role keeps access. Today whatsapp_sessions has one
--    {public} ALL true policy with RLS DISABLED (so everybody can read / write it) and anon has full privileges on whatsapp_replies.
-- 2. WHEN: LAST STEP, BLOCKED until the owner confirms (a) whether a separate WhatsApp server uses these tables, and (b) that such a server
--    uses the SERVICE key (or that no such server exists). Neither repo reads or writes them (grep of src/, the worker and the
--    storefront finds nothing), so an outside program probably does; if it uses the anon key, this file would stop it.
-- 3. RISK: UNKNOWN until the owner answers (low if no server exists).
-- 4. SMOKE TEST: If a WhatsApp server exists: send and receive one TEST message through it after applying. Then: ERP WhatsApp page loads, Orders,
--    Home.
-- 5. ROLLBACK: The ROLLBACK block restores the open policy and grants.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- Do NOT apply until the two questions in the header are answered. Q2-style column listing: select table_name, string_agg(column_name, ', ') from information_schema.columns
-- where table_name in ('whatsapp_sessions','whatsapp_replies') group by 1;

drop policy if exists ne_whatsapp_sessions_service on public.whatsapp_sessions;
create policy ne_whatsapp_sessions_service on public.whatsapp_sessions for all to service_role using (true) with check (true);
drop policy if exists ne_whatsapp_replies_service on public.whatsapp_replies;
create policy ne_whatsapp_replies_service on public.whatsapp_replies for all to service_role using (true) with check (true);

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'whatsapp_sessions' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.whatsapp_sessions', r.policyname);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'whatsapp_replies' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.whatsapp_replies', r.policyname);
  end loop;
end $$;

alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_replies enable row level security;
revoke all on public.whatsapp_sessions from anon, authenticated;
revoke all on public.whatsapp_replies from anon, authenticated;
grant all on public.whatsapp_sessions to service_role;
grant all on public.whatsapp_replies to service_role;

-- ============================== VERIFY (read-only)
-- select relname, relrowsecurity from pg_class where oid in ('public.whatsapp_sessions'::regclass, 'public.whatsapp_replies'::regclass);   -- expect true, true
-- select tablename, policyname, roles from pg_policies where tablename in ('whatsapp_sessions','whatsapp_replies');                        -- only the two ne_* service policies

-- ============================== ROLLBACK
-- drop policy if exists ne_whatsapp_sessions_service on public.whatsapp_sessions;
-- drop policy if exists ne_whatsapp_replies_service on public.whatsapp_replies;
-- create policy rollback_whatsapp_sessions_public_all on public.whatsapp_sessions for all to public using (true) with check (true);
-- alter table public.whatsapp_sessions disable row level security;
-- alter table public.whatsapp_replies disable row level security;
-- grant all on public.whatsapp_sessions to anon, authenticated, service_role;
-- grant all on public.whatsapp_replies to anon, authenticated, service_role;
