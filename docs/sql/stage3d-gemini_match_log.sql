-- STAGE 3d: gemini_match_log. RISK: low (only the worker uses it: address matching).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Orders: address match / AI address
-- fix on a TEST order, Home). On breakage run the ROLLBACK block immediately.
-- Before: any logged-in merchant could read every tenant's address-match log (authenticated SELECT true).
-- Browser needs: NONE (no src/ reference). So: service_role only. If a later feature needs browser access add a has_store_access(store_id) select policy.

drop policy if exists ne_gemini_match_log_service on public.gemini_match_log;
create policy ne_gemini_match_log_service on public.gemini_match_log for all to service_role using (true) with check (true);

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'gemini_match_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.gemini_match_log', r.policyname);
  end loop;
end $$;
alter table public.gemini_match_log enable row level security;
revoke all on public.gemini_match_log from anon, authenticated;
grant all on public.gemini_match_log to service_role;

-- ============================== ROLLBACK (stage 3d) ==============================
-- drop policy if exists ne_gemini_match_log_service on public.gemini_match_log;
-- create policy rollback_gemini_match_log_auth_select on public.gemini_match_log for select to authenticated using (true);
-- grant select on public.gemini_match_log to authenticated;
-- grant all on public.gemini_match_log to service_role;
