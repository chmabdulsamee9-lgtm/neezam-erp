-- STAGE 4a: function EXECUTE grants in schema public (anon and PUBLIC lose execute on everything listed here).
-- RISK: medium. Needs stage 0. Run docs/sql/needed-queries.sql Q7 and Q8 FIRST and read section "BEFORE YOU RUN".
-- Apply one function group at a time (each DO block below is independent); smoke-test production ERP + dev preview after each (login,
-- Home, Orders (list, Edit Items, cancel on a TEST order only), Booked (add a remark), Returns (scan on a TEST return), Online Store,
-- Meta Connect, Settings, Team, Supplier Ledger). On any breakage run that group's ROLLBACK block immediately.
-- Extension-owned functions (pg_trgm: gin_*, gtrgm_*, similarity*, word_similarity*, strict_word_similarity*, set_limit, show_*) are
-- excluded in every loop through pg_depend deptype 'e'. Nothing here changes function bodies or business logic.
--
-- BEFORE YOU RUN: a function that is called INSIDE another invoker-rights function or trigger runs with the privileges of the logged-in
-- user and needs EXECUTE for authenticated. Trigger functions themselves do NOT need EXECUTE to fire, but anything they call does.
-- Q7 lists "caller -> calls" pairs. If a function in group B (service_role only) appears as "calls" of a caller that is NOT security
-- definer and runs for browser users (e.g. a trigger on order_statuses), move that function into group C by running the optional
-- block at the bottom for it.
--
-- Browser calls found in src/: supabase.rpc('get_store_stats'), supabase.rpc('append_order_remark'). Worker calls (service key):
-- get_next_local_order_number, next_store_order_number, handle_dispatch_event, create_return_record_if_needed, receive_return,
-- sync_all_dropship_debits, sync_all_inventory_deductions, match_address, delete_store_cascade, booked_page(+_export), orders_page,
-- home_overview, home_stats and the other dashboard RPCs.

-- ------------------------------------------------------------------ group A: browser may call, anon may not (authenticated + service_role)
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('get_store_stats','append_order_remark',
                        -- pure read helpers, possibly used inside the authenticated-only dashboard functions:
                        'booked_classify','booked_final_bucket','build_matched_address','get_product_cost_as_of','match_address',
                        'norm_pk_phone','normalize_addr_text','order_skus','order_source','soc_phone_key',
                        -- called from the set_eneezam_id trigger function as the inserting user:
                        'generate_eneezam_id')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ------------------------------------------------------------------ group B: worker / trigger only (service_role)
-- Write-capable functions with no browser caller: the logged-in user must not run them directly (they are cross-tenant: some take no
-- store argument at all, e.g. sync_all_*).
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proname in ('charge_dropship_debit_for_order','create_return_record_if_needed','deduct_inventory_for_order','receive_return',
                         'sync_all_dropship_debits','sync_all_inventory_deductions','get_next_local_order_number','delete_store_cascade',
                         'set_eneezam_id')
           or p.proname like 'handle\_%' escape '\'
           or p.proname like 'order\_statuses\_%' escape '\')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
-- Trigger functions fire without any EXECUTE grant, so revoking from anon/authenticated does not stop the triggers (set_eneezam_id,
-- handle_*, order_statuses_*). The Q7 caveat above is the one thing to check.

-- ------------------------------------------------------------------ group D: SECURITY DEFINER trigger / event-trigger functions
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('protect_profile_privileged_fields','rls_auto_enable')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- VERIFY (read-only): anon-executable functions that remain (expect only extension-owned ones, e.g. pg_trgm)
-- select p.proname, p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
--    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1;

-- ------------------------------------------------------------------ OPTIONAL: move one group-B function back to authenticated
-- (only if Q7 shows an invoker-rights caller that browser users trigger). Replace the name:
-- do $$ declare r record; begin
--   for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public' and p.proname = 'deduct_inventory_for_order' loop
--     execute format('grant execute on function %s to authenticated', r.sig);
--   end loop; end $$;

-- ============================== ROLLBACK (stage 4a) ==============================
-- Restores the default (PUBLIC can execute) for every function touched above. Run the whole block, or just the group that broke.
-- do $$ declare r record; begin
--   for r in
--     select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prokind = 'f'
--       and (p.proname in ('get_store_stats','append_order_remark','booked_classify','booked_final_bucket','build_matched_address',
--                          'get_product_cost_as_of','match_address','norm_pk_phone','normalize_addr_text','order_skus','order_source',
--                          'soc_phone_key','generate_eneezam_id','charge_dropship_debit_for_order','create_return_record_if_needed',
--                          'deduct_inventory_for_order','receive_return','sync_all_dropship_debits','sync_all_inventory_deductions',
--                          'get_next_local_order_number','delete_store_cascade','set_eneezam_id','protect_profile_privileged_fields','rls_auto_enable')
--            or p.proname like 'handle\_%' escape '\' or p.proname like 'order\_statuses\_%' escape '\')
--       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--   loop
--     execute format('grant execute on function %s to public, anon, authenticated, service_role', r.sig);
--   end loop;
-- end $$;
