-- STAGE 4c-1: order_sync_history (RLS currently DISABLED)
-- GROUP: Group 2 ONLY, after production redeploy
-- PREREQUISITES: stage 0
-- ONE-LINE SMOKE TEST: Orders: Sync then Undo on a TEST order.
-- 1. WHAT IT DOES: Turns RLS on. The BROWSER uses this table (Orders.jsx: reads ALL rows with no filter, upserts one snapshot per order before a
--    Shopify sync, deletes it on undo). The table has NO store_id column, so each row is scoped through its order: the caller needs
--    access to the store of the order_statuses row (or, for an order with no status row yet, the shopify_orders_cache row). Done with
--    a SECURITY DEFINER helper has_order_access(text) so it works whatever the RLS state of those tables is.
-- 2. WHEN: GROUP 2 ONLY, after production redeploy - NOT before the production redeploy: the old master Orders.jsx reads, upserts and deletes
--    order_sync_history from the browser. Run it only once production runs the security hotfix / dev ERP and its tests passed there.
-- 3. RISK: MEDIUM (Orders: Sync to Shopify and Undo Sync).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Orders: Sync a TEST order, then Undo it; the Undo button must appear for previously synced orders.
-- 5. ROLLBACK: The ROLLBACK block disables RLS and restores the full grants.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles.
-- NEEDS-CHECK: order_sync_history.order_id and order_statuses.order_id / shopify_orders_cache.id are compared as text, which works for text and numeric ids.
-- NEEDS-CHECK (Q6-style): this table has no triggers according to the owner's results (only order_statuses, product_costs and stores have triggers).

create or replace function public.has_order_access(p_order_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_order_id is not null and (
    auth.role() = 'service_role'
    or exists (select 1 from public.order_statuses os where os.order_id::text = p_order_id and public.has_store_access(os.store_id))
    or exists (select 1 from public.shopify_orders_cache c where c.id::text = p_order_id and public.has_store_access(c.store_id))
  );
$$;
revoke all on function public.has_order_access(text) from public, anon;
grant execute on function public.has_order_access(text) to authenticated, service_role;

drop policy if exists ne_order_sync_history_service on public.order_sync_history;
drop policy if exists ne_order_sync_history_all on public.order_sync_history;
create policy ne_order_sync_history_service on public.order_sync_history for all to service_role using (true) with check (true);
create policy ne_order_sync_history_all on public.order_sync_history for all to authenticated
  using (public.has_order_access(order_id::text)) with check (public.has_order_access(order_id::text));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'order_sync_history' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.order_sync_history', r.policyname);
  end loop;
end $$;

alter table public.order_sync_history enable row level security;
revoke all on public.order_sync_history from anon, authenticated;
grant select, insert, update, delete on public.order_sync_history to authenticated;
grant all on public.order_sync_history to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.order_sync_history'::regclass;   -- expect true
-- As an admin: select count(*) from order_sync_history  -> only rows of that admin's orders (less than the total).

-- ============================== ROLLBACK
-- drop policy if exists ne_order_sync_history_service on public.order_sync_history;
-- drop policy if exists ne_order_sync_history_all on public.order_sync_history;
-- alter table public.order_sync_history disable row level security;
-- grant all on public.order_sync_history to anon, authenticated, service_role;
-- drop function if exists public.has_order_access(text);   -- only after nothing else uses it
