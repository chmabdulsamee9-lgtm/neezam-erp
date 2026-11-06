-- STAGE 3b: returns. RISK: medium (Returns page, Profit & Loss damaged returns, the worker's return scan).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Returns page, scan on a TEST return only,
-- Profit & Loss, Orders, Booked, Home). On breakage run the ROLLBACK block immediately.
-- Before: any logged-in merchant could read every tenant's returns (authenticated SELECT true).
-- Browser needs: SELECT filtered by store_id (ProfitLoss.jsx). Writes are made by the worker / receive_return / create_return_record_if_needed.
-- Triggers or invoker-rights functions that write here as the logged-in user would ALREADY fail today (no authenticated write policy),
-- so selecting only keeps the present behaviour.

drop policy if exists ne_returns_service on public.returns;
drop policy if exists ne_returns_select on public.returns;
create policy ne_returns_service on public.returns for all to service_role using (true) with check (true);
create policy ne_returns_select on public.returns for select to authenticated using (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'returns' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.returns', r.policyname);
  end loop;
end $$;
alter table public.returns enable row level security;
revoke all on public.returns from anon, authenticated;
grant select on public.returns to authenticated;
grant all on public.returns to service_role;

-- ============================== ROLLBACK (stage 3b) ==============================
-- drop policy if exists ne_returns_service on public.returns;
-- drop policy if exists ne_returns_select on public.returns;
-- create policy rollback_returns_auth_select on public.returns for select to authenticated using (true);
-- grant select on public.returns to authenticated;
-- grant all on public.returns to service_role;
