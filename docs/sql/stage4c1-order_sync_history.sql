-- STAGE 4c-1: order_sync_history (RLS currently DISABLED). RISK: medium (Orders page: Sync to Shopify and Undo).
-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles. Order matters; order_statuses
-- and shopify_orders_cache are the RISKIEST (Orders, Home, Booked, Returns all read them). Apply one file at a time and smoke-test BOTH
-- production ERP (portal.eneezam.com) and the dev preview after each: login, Home, Orders (list, Edit Items, cancel on a TEST order only,
-- Sync + Undo on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team. On breakage run the ROLLBACK block NOW.
-- Needs stage 0 and stage 4a.
--
-- Browser: Orders.jsx selects the WHOLE table with no filter (fetchAllSyncHistory), upserts one snapshot per order, deletes on undo.
-- After this stage each user only sees the history of their own stores' orders. The dev ERP filter is unchanged; RLS does the scoping.
-- NEEDS-CHECK: columns (Q2). The table is keyed by order_id; I do not know whether it has a store_id column.
--   Variant A (store_id exists): scope directly.   Variant B (no store_id): scope through order_statuses / shopify_orders_cache.
-- CREATE POLICY fails if the column does not exist, BEFORE anything is dropped, so a wrong guess changes nothing: then use variant B.
-- Triggers (Q6): if a trigger on this table writes to an RLS table as the invoking user, flag it to me; do not guess.

drop policy if exists ne_order_sync_history_service on public.order_sync_history;
drop policy if exists ne_order_sync_history_all on public.order_sync_history;
create policy ne_order_sync_history_service on public.order_sync_history for all to service_role using (true) with check (true);
-- variant A
create policy ne_order_sync_history_all on public.order_sync_history for all to authenticated
  using (public.has_store_access(store_id)) with check (public.has_store_access(store_id));
-- variant B, use INSTEAD of variant A:
-- create policy ne_order_sync_history_all on public.order_sync_history for all to authenticated
--   using (exists (select 1 from public.order_statuses os where os.order_id::text = order_sync_history.order_id::text and public.has_store_access(os.store_id))
--       or exists (select 1 from public.shopify_orders_cache c where c.id::text = order_sync_history.order_id::text and public.has_store_access(c.store_id)))
--   with check (exists (select 1 from public.order_statuses os where os.order_id::text = order_sync_history.order_id::text and public.has_store_access(os.store_id))
--       or exists (select 1 from public.shopify_orders_cache c where c.id::text = order_sync_history.order_id::text and public.has_store_access(c.store_id)));
-- NOTE for variant A: the dev ERP upsert of a snapshot does not send store_id today (Orders.jsx ensureHistorySnapshot). If you choose
-- variant A, tell me and I add store_id to that upsert before you apply this file. Variant B needs no ERP change.

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'order_sync_history' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.order_sync_history', r.policyname);
  end loop;
end $$;

alter table public.order_sync_history enable row level security;
revoke all on public.order_sync_history from anon, authenticated;
grant select, insert, update, delete on public.order_sync_history to authenticated;
grant all on public.order_sync_history to service_role;

-- VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.order_sync_history'::regclass;   -- expect true
-- As a normal admin, Orders > an order with a past Sync still offers Undo.

-- ============================== ROLLBACK (stage 4c-1) ==============================
-- Old state: RLS disabled, full grants to anon and authenticated.
-- drop policy if exists ne_order_sync_history_service on public.order_sync_history;
-- drop policy if exists ne_order_sync_history_all on public.order_sync_history;
-- alter table public.order_sync_history disable row level security;
-- grant all on public.order_sync_history to anon, authenticated, service_role;
