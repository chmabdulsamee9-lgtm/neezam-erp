-- STAGE 4c-3: order_statuses (RLS currently DISABLED)
-- 1. WHAT IT DOES: Turns RLS on. Members select, insert and update the statuses of their store's orders (has_store_access(store_id)); there is no
--    DELETE for the browser. The INVOKER trigger functions are NOT changed (making them SECURITY DEFINER would let anybody call them
--    cross-tenant through rpc): they keep running as the logged-in user and write to returns, dropship_debit_log,
--    inventory_deduction_log, supplier_transactions, expenses, which have INSERT policies for members (stage 3b, 3c, 3e and the
--    existing member policies).
-- 2. WHEN: AFTER-MERGE. The OLD production ERP upserts order_statuses WITHOUT store_id in 5 places (cancellation reason, sync timestamp,
--    edit items, billing fallback, undo); Postgres checks the INSERT arm of an upsert first, so those would be rejected. The hotfix /
--    dev ERP sends store_id on all of them. ALSO requires stage 3b, 3c, 3e applied first (trigger support) and stage 4a.
-- 3. RISK: HIGHEST of the whole plan (every order action in Orders, Booked, Returns, Finance and Home reads or writes it; three triggers
--    run on it).
-- 4. SMOKE TEST: On BOTH production (after the hotfix is live) and dev preview: Orders list; change the courier/status on a TEST order only; Edit
--    Items on a TEST order; cancel a TEST order; Returns page; Products > edit a product cost (fires
--    handle_product_cost_dropship_backfill); Booked (list, add a remark); Home. Then drglow.online home / product / cart / checkout.
-- 5. ROLLBACK: The ROLLBACK block disables RLS and restores the full grants; takes effect immediately.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles.
-- Write gaps for the trigger chain, checked against docs/sql/before-state-facts.md:
--   dropship_debit_log, inventory_deduction_log, returns : need member INSERT -> stage 3b / 3c / 3e (APPLY FIRST).
--   supplier_transactions, expenses, inventory_levels, suppliers, products_cache, product_costs : already have member policies (the owner's list shows
--     good member / creator policies, some with a {public} role that stage 5a moves to authenticated). NEEDS-CHECK: confirm with the Q1 listing that
--     supplier_transactions and expenses allow member INSERT; if either does not, add the same pattern as stage 3c for that table.
-- Realtime: App.jsx and BookedOrders subscribe to order_statuses with filter store_id; the SELECT policy below lets members receive their own rows.
-- NEEDS-CHECK: select count(*) from public.order_statuses where store_id is null;   -- such rows become uneditable for browser users

drop policy if exists ne_order_statuses_service on public.order_statuses;
drop policy if exists ne_order_statuses_select on public.order_statuses;
drop policy if exists ne_order_statuses_insert on public.order_statuses;
drop policy if exists ne_order_statuses_update on public.order_statuses;
create policy ne_order_statuses_service on public.order_statuses for all to service_role using (true) with check (true);
create policy ne_order_statuses_select on public.order_statuses for select to authenticated using (public.has_store_access(store_id));
create policy ne_order_statuses_insert on public.order_statuses for insert to authenticated with check (public.has_store_access(store_id));
create policy ne_order_statuses_update on public.order_statuses for update to authenticated using (public.has_store_access(store_id)) with check (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'order_statuses' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.order_statuses', r.policyname);
  end loop;
end $$;

alter table public.order_statuses enable row level security;
revoke all on public.order_statuses from anon, authenticated;
grant select, insert, update on public.order_statuses to authenticated;
grant all on public.order_statuses to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.order_statuses'::regclass;   -- expect true
-- select count(*) from public.order_statuses where store_id is null;                    -- 0 (or known)

-- ============================== ROLLBACK
-- drop policy if exists ne_order_statuses_service on public.order_statuses;
-- drop policy if exists ne_order_statuses_select on public.order_statuses;
-- drop policy if exists ne_order_statuses_insert on public.order_statuses;
-- drop policy if exists ne_order_statuses_update on public.order_statuses;
-- alter table public.order_statuses disable row level security;
-- grant all on public.order_statuses to anon, authenticated, service_role;
