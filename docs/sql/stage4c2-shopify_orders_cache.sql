-- STAGE 4c-2: shopify_orders_cache (RLS currently DISABLED; holds customer name, phone, address). RISK: HIGH (Orders, Home, Booked,
-- Returns, Global search, Store Connect, labels all read it).
-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles. Apply one file at a time and
-- smoke-test BOTH production ERP (portal.eneezam.com) and the dev preview after it: login, Home, Orders (list, search, Edit Items, cancel
-- on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team, drglow.online checkout is unaffected (service key).
-- On breakage run the ROLLBACK block NOW. Needs stage 0 and stage 4a.
--
-- Browser needs (audit section 1): SELECT only (App.jsx, bookedOrdersData.js, EneezamLabel.jsx, GlobalSearch.jsx, BookedOrders.jsx,
-- StoreConnect.jsx). Columns seen in code: id, store_id, raw_data. All writes (sync, webhooks, native shadow rows) are made by the worker
-- with the service key, so authenticated gets SELECT only.
-- NEEDS-CHECK before applying:
--  (1) rows whose store_id is NULL become invisible to every browser user:  select count(*) from public.shopify_orders_cache where store_id is null;
--  (2) Q6: triggers on this table. A trigger function that writes to another table as the invoking user is fine here because every writer
--      of this table is service_role (RLS bypass), so no trigger fires under a browser user.
--  (3) Realtime: App.jsx setupRealtime subscribes to this table; with RLS on, Supabase Realtime delivers a row only to users whose SELECT
--      policy allows it (this policy does). Test: change an order status on a TEST order in a second tab and watch the first tab update.
--  (4) PERFORMANCE: policies call has_store_access(store_id) per row; the table is large. The browser already filters by store_id, so the
--      planner evaluates the function once per matching row; test the Orders list speed on the biggest store. If slow, add (user_id, store_id)
--      index on user_stores (stage 4c-4 suggests it).

drop policy if exists ne_shopify_orders_cache_service on public.shopify_orders_cache;
drop policy if exists ne_shopify_orders_cache_select on public.shopify_orders_cache;
create policy ne_shopify_orders_cache_service on public.shopify_orders_cache for all to service_role using (true) with check (true);
create policy ne_shopify_orders_cache_select on public.shopify_orders_cache for select to authenticated using (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'shopify_orders_cache' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.shopify_orders_cache', r.policyname);
  end loop;
end $$;

alter table public.shopify_orders_cache enable row level security;
revoke all on public.shopify_orders_cache from anon, authenticated;
grant select on public.shopify_orders_cache to authenticated;
grant all on public.shopify_orders_cache to service_role;

-- VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.shopify_orders_cache'::regclass;   -- expect true
-- Orders page of a store loads its orders; as an admin of store A, a query for store B's orders returns zero rows.

-- ============================== ROLLBACK (stage 4c-2) ==============================
-- Old state: RLS disabled, full grants to anon and authenticated.
-- drop policy if exists ne_shopify_orders_cache_service on public.shopify_orders_cache;
-- drop policy if exists ne_shopify_orders_cache_select on public.shopify_orders_cache;
-- alter table public.shopify_orders_cache disable row level security;
-- grant all on public.shopify_orders_cache to anon, authenticated, service_role;
