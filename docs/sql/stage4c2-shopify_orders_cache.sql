-- STAGE 4c-2: shopify_orders_cache (RLS currently DISABLED; customer name, phone, address)
-- 1. WHAT IT DOES: Turns RLS on. Members read the cached orders of their stores only (has_store_access(store_id)); nobody in the browser writes it
--    (all writers are the worker, service key, which bypasses RLS). anon loses everything.
-- 2. WHEN: BEFORE-MERGE. The old ERP reads it as a logged-in user and always filters by store_id (App.jsx, bookedOrdersData, GlobalSearch,
--    Booked, Store Connect, labels).
-- 3. RISK: HIGH (Orders, Home, Booked, Returns, global search and labels all read it).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Orders list and search, Booked, global search, print a label on a TEST order; open the Orders page in two tabs
--    and change a TEST order's status in one: the other tab updates (realtime: App.jsx subscribes to shopify_orders_cache with filter
--    store_id).
-- 5. ROLLBACK: The ROLLBACK block disables RLS and restores the full grants; takes effect immediately.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles.
-- Invoker trigger functions READ this table (handle_* chains); they run as a store member and read only that store's rows, which the policy allows.
-- Realtime: with RLS on, Supabase Realtime delivers a row only to subscribers the SELECT policy allows (same policy).
-- NEEDS-CHECK: select count(*) from public.shopify_orders_cache where store_id is null;   -- such rows become invisible to browser users
-- NEEDS-CHECK (speed): the policy calls has_store_access(store_id) per matching row; test the Orders list on the biggest store. If slow, add
--   create index if not exists user_stores_user_store_idx on public.user_stores (user_id, store_id);   -- additive and safe, run it first

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

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.shopify_orders_cache'::regclass;   -- expect true
-- As an admin of store A a query for store B's orders returns zero rows.

-- ============================== ROLLBACK
-- drop policy if exists ne_shopify_orders_cache_service on public.shopify_orders_cache;
-- drop policy if exists ne_shopify_orders_cache_select on public.shopify_orders_cache;
-- alter table public.shopify_orders_cache disable row level security;
-- grant all on public.shopify_orders_cache to anon, authenticated, service_role;
