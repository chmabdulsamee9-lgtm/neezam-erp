-- STAGE 4c-3: order_statuses (RLS currently DISABLED). RISK: HIGHEST of the whole plan (every order action in Orders, Booked, Returns,
-- Finance, Home reads or writes it; triggers run on it).
-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles. Apply one file at a time and
-- smoke-test BOTH production ERP (portal.eneezam.com) and the dev preview after it: login, Home, Orders (list, set a status, Edit Items,
-- cancel on a TEST order ONLY, sync + undo on a TEST order only), Booked (list, remark, export), Returns, Finance statement, Online Store,
-- Meta Connect, Settings, Team. On breakage run the ROLLBACK block NOW. Needs stage 0, stage 4a, the dev ERP merged to production
-- (it adds store_id to every order_statuses upsert; the OLD ERP omits it on 5 of its writes, see below), and the Q6 result read.
--
-- Browser needs: SELECT by store_id (Orders, Booked, Finance, bookedOrdersData), UPSERT (insert or update) from Orders.jsx.
-- Columns seen in code: id, order_id, store_id, status, manual_order_number, dex_tracking_number, dex_package_code, delivered_at, ...
-- WITH CHECK requires store_id to belong to the caller. The OLD production ERP upserts {order_id, cancellation_reason}, {order_id,
-- synced_at}, the edit-items payload, the billing-fallback payload and the undo payload WITHOUT store_id: Postgres evaluates the INSERT
-- check of an upsert before the conflict, so those would be REJECTED. The dev ERP now sends store_id on all of them. => do NOT apply this
-- file until the dev ERP is merged to production, or those actions fail on production.
-- NEEDS-CHECK:
--  (1) select count(*) from public.order_statuses where store_id is null;  -- such rows would become uneditable for browser users
--  (2) Q6 triggers on this table and the tables their functions write to (returns, inventory_deduction_log, dropship_debit_log,
--      order_sync_history ...). After stage 3 those tables are SELECT-only for authenticated: a trigger function running as the invoking
--      user that inserts there would fail. Today that already holds (they were SELECT-only before stage 3), so no NEW failure is expected,
--      but if Q6 shows a function that writes to order_sync_history / shopify_orders_cache as invoker, mark it SECURITY DEFINER with
--      `set search_path = public` (TEMPLATE only, not guessed here):  alter function public.<name>(<args>) security definer set search_path = public;
--  (3) realtime on this table (see 4c-2 note).

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
grant select, insert, update on public.order_statuses to authenticated;   -- no DELETE: the browser never deletes order_statuses rows
grant all on public.order_statuses to service_role;

-- VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.order_statuses'::regclass;   -- expect true
-- select count(*) from public.order_statuses where store_id is null;                    -- should be 0 (or known)

-- ============================== ROLLBACK (stage 4c-3) ==============================
-- Old state: RLS disabled, full grants to anon and authenticated.
-- drop policy if exists ne_order_statuses_service on public.order_statuses;
-- drop policy if exists ne_order_statuses_select on public.order_statuses;
-- drop policy if exists ne_order_statuses_insert on public.order_statuses;
-- drop policy if exists ne_order_statuses_update on public.order_statuses;
-- alter table public.order_statuses disable row level security;
-- grant all on public.order_statuses to anon, authenticated, service_role;
