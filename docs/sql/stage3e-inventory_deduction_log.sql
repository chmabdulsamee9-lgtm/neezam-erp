-- STAGE 3e: inventory_deduction_log. RISK: low-medium (Profit & Loss cost of goods).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Profit & Loss, Products, Orders, Home).
-- On breakage run the ROLLBACK block immediately.
-- Before: any logged-in merchant could read every tenant's inventory deductions (authenticated SELECT true).
-- Browser needs: SELECT filtered by store_id (ProfitLoss.jsx). Writes come from deduct_inventory_for_order / worker.

drop policy if exists ne_inventory_deduction_log_service on public.inventory_deduction_log;
drop policy if exists ne_inventory_deduction_log_select on public.inventory_deduction_log;
create policy ne_inventory_deduction_log_service on public.inventory_deduction_log for all to service_role using (true) with check (true);
create policy ne_inventory_deduction_log_select on public.inventory_deduction_log for select to authenticated using (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'inventory_deduction_log' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.inventory_deduction_log', r.policyname);
  end loop;
end $$;
alter table public.inventory_deduction_log enable row level security;
revoke all on public.inventory_deduction_log from anon, authenticated;
grant select on public.inventory_deduction_log to authenticated;
grant all on public.inventory_deduction_log to service_role;

-- ============================== ROLLBACK (stage 3e) ==============================
-- drop policy if exists ne_inventory_deduction_log_service on public.inventory_deduction_log;
-- drop policy if exists ne_inventory_deduction_log_select on public.inventory_deduction_log;
-- create policy rollback_inventory_deduction_log_auth_select on public.inventory_deduction_log for select to authenticated using (true);
-- grant select on public.inventory_deduction_log to authenticated;
-- grant all on public.inventory_deduction_log to service_role;
