-- STAGE 4a: function EXECUTE grants in schema public
-- GROUP: Group 1 (safe before the merge)
-- PREREQUISITES: stage 0
-- ONE-LINE SMOKE TEST: Booked add a remark, change a TEST order status, edit a product cost (fires the triggers).
-- 1. WHAT IT DOES: For every function in the lists below: REVOKE EXECUTE from PUBLIC and anon, then GRANT EXECUTE explicitly to authenticated and
--    service_role (revoking from PUBLIC also removes authenticated's implicit grant, so it is re-granted). Extension-owned functions
--    (pg_trgm: gin_*, gtrgm_*, similarity*, word_similarity*, strict_word_similarity*, set_limit, show_*) are excluded in every loop
--    through pg_depend deptype 'e'. No function body is changed.
-- 2. WHEN: BEFORE-MERGE (it only removes anon / PUBLIC; logged-in users keep EXECUTE).
-- 3. RISK: LOW-MEDIUM.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Booked (add a remark), Orders (change a status on a TEST order: fires the triggers), Product costs edit (fires
--    the dropship backfill trigger), Supplier Ledger, Home.
-- 5. ROLLBACK: The ROLLBACK block at the bottom grants EXECUTE back to PUBLIC for the same functions.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- FUNCTIONS TOUCHED (revoke EXECUTE from PUBLIC and anon; grant EXECUTE to authenticated and service_role; nothing is ever revoked from authenticated):
--   definer:    append_order_remark, delete_store_cascade, get_next_local_order_number, protect_profile_privileged_fields, rls_auto_enable
--   write:      charge_dropship_debit_for_order, create_return_record_if_needed, deduct_inventory_for_order, receive_return, sync_all_dropship_debits,
--               sync_all_inventory_deductions, set_eneezam_id, generate_eneezam_id
--   by pattern: every handle_* function (handle_dispatch_event, handle_order_returned, handle_order_shipped_dropship_debit, handle_product_cost_dropship_backfill)
--               and every order_statuses_* function (order_statuses_preserve_set_once, order_statuses_touch_updated_at)
--   read:       booked_classify, booked_final_bucket, build_matched_address, get_product_cost_as_of, get_store_stats, match_address, norm_pk_phone,
--               normalize_addr_text, order_skus, order_source, soc_phone_key
--   NOT touched: pg_trgm and any other extension-owned function (pg_depend deptype 'e'), the access helpers from stage 0, the *_impl functions from stage 4b
--               (stage 4b revokes those itself), booked_page / orders_page / dashboard_stats / home_* / orders_filter_options / next_store_order_number (already authenticated-only).
-- WHY authenticated MUST KEEP EXECUTE: the trigger functions are SECURITY INVOKER and call other functions, and EXECUTE is checked on every
-- nested call (a trigger function itself needs no grant to fire, but what it calls does):
--   handle_dispatch_event -> charge_dropship_debit_for_order, deduct_inventory_for_order
--   handle_order_returned -> get_product_cost_as_of
--   handle_order_shipped_dropship_debit, handle_product_cost_dropship_backfill, sync_all_dropship_debits -> charge_dropship_debit_for_order
--   set_eneezam_id -> generate_eneezam_id;  sync_all_inventory_deductions -> deduct_inventory_for_order
--   match_address -> normalize_addr_text;  booked_page -> booked_classify -> booked_final_bucket
--   orders_page, dashboard_stats, orders_filter_options -> order_skus, order_source, soc_phone_key
-- So the rule here is never "revoke from authenticated". Cross-tenant protection for the two functions that bypass RLS is done inside them
-- (stage 4b guards) and by the RLS on the tables the invoker functions write.

do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname not in ('has_store_access','has_store_access_by_eneezam_id','is_creator','is_admin','is_store_owner','is_store_admin','shares_store_with','has_order_access','store_has_members','can_manage_team')
      and (p.proname in (
            -- SECURITY DEFINER (guards are added by stage 4b)
            'append_order_remark','delete_store_cascade','get_next_local_order_number','protect_profile_privileged_fields','rls_auto_enable',
            -- write-capable, invoker
            'charge_dropship_debit_for_order','create_return_record_if_needed','deduct_inventory_for_order','receive_return',
            'sync_all_dropship_debits','sync_all_inventory_deductions','set_eneezam_id','generate_eneezam_id',
            -- read helpers
            'booked_classify','booked_final_bucket','build_matched_address','get_product_cost_as_of','get_store_stats','match_address',
            'norm_pk_phone','normalize_addr_text','order_skus','order_source','soc_phone_key')
           or p.proname like 'handle\_%' escape '\'
           or p.proname like 'order\_statuses\_%' escape '\')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- Trigger functions and event-trigger functions (handle_*, set_eneezam_id, order_statuses_*, protect_profile_privileged_fields, rls_auto_enable)
-- fire without any EXECUTE grant; they are included only so that anon / PUBLIC cannot call them as plain functions.

-- ============================== VERIFY (read-only)
-- anon-executable public functions that remain (expect only extension-owned ones):
-- select p.proname, p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
--    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1;
-- authenticated must still execute the chains:
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('charge_dropship_debit_for_order','deduct_inventory_for_order','get_product_cost_as_of','generate_eneezam_id','normalize_addr_text','booked_classify','booked_final_bucket','order_skus','order_source','soc_phone_key');  -- all true

-- ============================== ROLLBACK
-- do $$ declare r record; begin
--   for r in
--     select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prokind = 'f'
--       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--       and p.proname not in ('has_store_access','has_store_access_by_eneezam_id','is_creator','is_admin','is_store_owner','is_store_admin','shares_store_with','has_order_access','store_has_members','can_manage_team')
--       and (p.proname in ('append_order_remark','delete_store_cascade','get_next_local_order_number','protect_profile_privileged_fields','rls_auto_enable',
--             'charge_dropship_debit_for_order','create_return_record_if_needed','deduct_inventory_for_order','receive_return','sync_all_dropship_debits',
--             'sync_all_inventory_deductions','set_eneezam_id','generate_eneezam_id','booked_classify','booked_final_bucket','build_matched_address',
--             'get_product_cost_as_of','get_store_stats','match_address','norm_pk_phone','normalize_addr_text','order_skus','order_source','soc_phone_key')
--            or p.proname like 'handle\_%' escape '\' or p.proname like 'order\_statuses\_%' escape '\')
--   loop
--     execute format('grant execute on function %s to public', r.sig);
--   end loop;
-- end $$;
