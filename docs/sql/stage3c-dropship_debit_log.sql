-- STAGE 3c: dropship_debit_log. RISK: low (no browser code reads it directly; supplier ledger data comes through the worker).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Supplier Ledger, Orders, Home). On
-- breakage run the ROLLBACK block immediately.
-- Before: any logged-in merchant could read every tenant's dropship debits (authenticated SELECT true).
-- NEEDS-CHECK: assumes a store_id column (Q3).

drop policy if exists ne_dropship_debit_log_service on public.dropship_debit_log;
drop policy if exists ne_dropship_debit_log_select on public.dropship_debit_log;
create policy ne_dropship_debit_log_service on public.dropship_debit_log for all to service_role using (true) with check (true);
create policy ne_dropship_debit_log_select on public.dropship_debit_log for select to authenticated using (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'dropship_debit_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.dropship_debit_log', r.policyname);
  end loop;
end $$;
alter table public.dropship_debit_log enable row level security;
revoke all on public.dropship_debit_log from anon, authenticated;
grant select on public.dropship_debit_log to authenticated;
grant all on public.dropship_debit_log to service_role;

-- ============================== ROLLBACK (stage 3c) ==============================
-- drop policy if exists ne_dropship_debit_log_service on public.dropship_debit_log;
-- drop policy if exists ne_dropship_debit_log_select on public.dropship_debit_log;
-- create policy rollback_dropship_debit_log_auth_select on public.dropship_debit_log for select to authenticated using (true);
-- grant select on public.dropship_debit_log to authenticated;
-- grant all on public.dropship_debit_log to service_role;
