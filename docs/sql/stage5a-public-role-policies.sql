-- STAGE 5a: switch {public}-role member policies to authenticated
-- 1. WHAT IT DOES: For each listed table, every policy whose role is {public} is altered to TO authenticated (ALTER POLICY ... TO). The policy text
--    (who may see which rows) is unchanged; anon simply stops matching. The exact list of changed policies is printed with RAISE
--    NOTICE: SAVE that output, it is your rollback record.
-- 2. WHEN: AFTER-MERGE group, optional. Safe before the merge too (all ERP code uses these tables as a logged-in user), but it is the
--    lowest-value step, so it comes after the table fixes.
-- 3. RISK: LOW-MEDIUM (these are the Products, Suppliers, pickup addresses and cost screens).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Products (list, edit a cost), Suppliers / Supplier Ledger, Courier Connect pickup addresses, Products
--    collections, Product costing, Creator Gemini key page.
-- 5. ROLLBACK: Per table, the ROLLBACK block alters the policies named in the saved NOTICE output back to PUBLIC.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- Tables (all appear in the owner's results with a {public}-role member policy): cost_component_labels, inventory_levels, pickup_addresses,
-- product_collections, product_cost_components, product_costs, products_cache, store_collections, suppliers, product_variant_archive, app_settings,
-- gemini_api_keys, dex_shipments_import, dex_serviceable_cities.
-- "Only where safe": dex_serviceable_cities, app_settings and gemini_api_keys are read by logged-in pages only in src/ (Orders / OrderDetail / BookedOrders;
-- App.jsx creator pages), so anon never needs them. NEEDS-CHECK: if app_settings is read by a logged-OUT page outside these repos, skip that table.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('cost_component_labels','inventory_levels','pickup_addresses','product_collections','product_cost_components','product_costs',
                         'products_cache','store_collections','suppliers','product_variant_archive','app_settings','gemini_api_keys',
                         'dex_shipments_import','dex_serviceable_cities')
       and roles = '{public}'
  loop
    raise notice 'ROLLBACK RECORD: alter policy % on public.% to public;', quote_ident(r.policyname), quote_ident(r.tablename);
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;

-- ============================== VERIFY (read-only)
-- select tablename, policyname, roles from pg_policies where schemaname = 'public' and roles = '{public}' order by 1, 2;
--   -- expect none of the 14 tables above any more

-- ============================== ROLLBACK
-- One line per policy from the saved NOTICE output, for example:
-- alter policy "<policy name>" on public.<table> to public;
