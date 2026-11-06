-- READ-ONLY queries the owner must run in the Supabase SQL editor BEFORE applying any stage, and paste the results back.
-- The Supabase editor shows only the LAST result, so run each query on its own.
-- Nothing here changes data. Save Q1 (original policies) somewhere safe: the ROLLBACK blocks restore a permissive
-- policy by semantics, and Q1 is the exact record of what existed.

-- Q1. Every current policy on the tables this work touches (the exact "before" state)
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('stores','store_themes','store_custom_domains','whatsapp_sessions','courier_feedback_log','export_history',
                    'dex_tracking_events','returns','dropship_debit_log','gemini_match_log','inventory_deduction_log',
                    'dev_monitoring_log','dex_rate_card','store_subscriptions','order_statuses','order_sync_history',
                    'profiles','shopify_orders_cache','user_stores')
order by tablename, policyname;

-- Q2. Columns of the 6 RLS-disabled tables
select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema = 'public'
  and table_name in ('order_statuses','order_sync_history','profiles','shopify_orders_cache','user_stores','whatsapp_sessions')
group by table_name order by table_name;

-- Q3. Columns of the stage 3 tables and of stores (confirms store_id / eneezam_id / user_id exist and their types;
--     lists the exact secret and safe columns used by stage 2)
select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema = 'public'
  and table_name in ('stores','store_themes','store_custom_domains','courier_feedback_log','export_history','dex_tracking_events',
                     'returns','dropship_debit_log','gemini_match_log','inventory_deduction_log','dev_monitoring_log',
                     'dex_rate_card','store_subscriptions')
group by table_name order by table_name;

-- Q4. Definitions of the five SECURITY DEFINER functions
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('append_order_remark','delete_store_cascade','get_next_local_order_number','protect_profile_privileged_fields','rls_auto_enable')
order by p.proname;

-- Q5. Current anon / authenticated grants on the 6 RLS-disabled tables
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('order_statuses','order_sync_history','profiles','shopify_orders_cache','user_stores','whatsapp_sessions')
  and grantee in ('anon','authenticated')
group by table_name, grantee order by table_name, grantee;

-- Q6. Triggers on the 6 tables (and the function each one runs)
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition, p.proname as function_name, p.prosecdef as security_definer
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('order_statuses','order_sync_history','profiles','shopify_orders_cache','user_stores','whatsapp_sessions')
order by c.relname, t.tgname;

-- Q7. Functions that call another function of the list (stage 4a: a function that is called INSIDE another invoker-rights
--     function must stay executable by authenticated). Look at the "calls" column.
select caller.proname as caller, caller.prosecdef as caller_is_definer, callee.proname as calls
from pg_proc caller
join pg_namespace n on n.oid = caller.pronamespace and n.nspname = 'public'
join pg_proc callee on callee.pronamespace = n.oid
 and callee.proname in ('charge_dropship_debit_for_order','create_return_record_if_needed','deduct_inventory_for_order','receive_return',
                        'sync_all_dropship_debits','sync_all_inventory_deductions','booked_classify','booked_final_bucket',
                        'build_matched_address','get_product_cost_as_of','match_address','norm_pk_phone','normalize_addr_text',
                        'order_skus','order_source','soc_phone_key','get_next_local_order_number','next_store_order_number')
where caller.prokind = 'f' and caller.oid <> callee.oid
  and pg_get_functiondef(caller.oid) ilike '%' || callee.proname || '(%'
order by caller.proname, callee.proname;

-- Q8. Every public function with its definer flag and who can execute it (the "before" state for stage 4a)
select p.proname, p.oid::regprocedure as signature, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') as extension_owned
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by extension_owned, p.proname;

-- Q9. Which public tables currently have RLS enabled, and anon/authenticated table privileges overall (the "before" state
--     for stage 4d)
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'anon') as anon_privileges
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Q10. Storage: does anything in the Supabase "courier-exports" bucket rely on anon? (policies on storage.objects)
select policyname, roles, cmd, qual from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- Q11. Is email confirmation on? (sign-up creates the store row right after auth.signUp: with confirmation ON there is no
--      session yet and the stage 1 stores INSERT policy would reject it). Check in Dashboard: Authentication > Providers > Email >
--      "Confirm email". Tell me ON or OFF.

-- Q12. Rows that would become invisible once store_id based policies apply (expect 0, or tell me the numbers)
select 'order_statuses' as t, count(*) as null_store_id from public.order_statuses where store_id is null
union all select 'shopify_orders_cache', count(*) from public.shopify_orders_cache where store_id is null
union all select 'stores (no owner and no team link)', count(*) from public.stores s
  where s.user_id is null and not exists (select 1 from public.user_stores us where us.store_id = s.id);

-- Q13. Which secret columns of stores actually exist and how many rows have a value (counts only, no values are shown)
select count(*) filter (where api_token is not null) as shopify_tokens,
       count(*) filter (where meta_access_token is not null) as meta_tokens,
       count(*) filter (where shopify_client_secret is not null) as shopify_client_secrets
from public.stores;
-- (dex_access_token / dex_refresh_token: run the same count if those columns exist; the code never reads them)
