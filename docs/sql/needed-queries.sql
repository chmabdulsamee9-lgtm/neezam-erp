-- READ-ONLY queries for the questions that are STILL open (the earlier ones are answered in docs/sql/before-state-facts.md).
-- The Supabase editor shows only the LAST result: run each query on its own and paste the result back. Nothing here changes data.

-- Q1. Save the exact current policies BEFORE applying anything (this is the precise "before" record; rollback blocks restore the same MEANING).
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- Q2. Does "Confirm email" apply to self sign-ups? For the last self sign-ups: if confirmation_sent_at is NOT NULL and email_confirmed_at was set
--     later than created_at, confirmation is ON; if email_confirmed_at = created_at (set at once) it is OFF (or the worker created the user).
select email, created_at, confirmation_sent_at, email_confirmed_at, last_sign_in_at
from auth.users order by created_at desc limit 8;
-- (Also visible at: Supabase dashboard > Authentication > Providers > Email > "Confirm email".)

-- Q3. store_id columns (and types) on the tables whose policies assume one. Expect store_id on each; tell me if one is missing.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('dex_tracking_events','returns','dropship_debit_log','inventory_deduction_log','courier_feedback_log','export_history',
                     'order_statuses','shopify_orders_cache','store_subscriptions','order_sync_history')
  and column_name in ('store_id','order_id','id','status','manual_order_number')
order by table_name, column_name;

-- Q4. Rows that would become invisible once the store_id based policies apply (expect all 0)
select 'order_statuses' as t, count(*) as null_store_id from public.order_statuses where store_id is null
union all select 'shopify_orders_cache', count(*) from public.shopify_orders_cache where store_id is null
union all select 'stores without owner and without team', count(*) from public.stores s
  where s.user_id is null and not exists (select 1 from public.user_stores us where us.store_id = s.id);

-- Q5. Stores that have no recorded owner (the Team page then uses the legacy-admin clause of stage 4c-4)
select id, store_name, user_id from public.stores where user_id is null;

-- Q6. Storage objects of the exports bucket whose first folder is not a store uuid (stage 5b; expect 0)
select count(*) from storage.objects
where bucket_id = 'courier-exports'
  and (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Q7. Exact signatures of the three functions that stage 4b wraps (the block aborts with nothing changed if they differ)
select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as returns, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('append_order_remark','delete_store_cascade','get_next_local_order_number','protect_profile_privileged_fields','next_store_order_number');

-- Q8. Does a trigger or another function call append_order_remark / delete_store_cascade / get_next_local_order_number by name? (expect no rows)
select p.proname as caller from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (pg_get_functiondef(p.oid) ilike '%append_order_remark%' or pg_get_functiondef(p.oid) ilike '%delete_store_cascade%' or pg_get_functiondef(p.oid) ilike '%get_next_local_order_number%')
  and p.proname not in ('append_order_remark','delete_store_cascade','get_next_local_order_number');

-- Q9. Do supplier_transactions and expenses allow member INSERT (needed by the invoker triggers once order_statuses has RLS)?
select tablename, policyname, roles, cmd, with_check
from pg_policies where schemaname = 'public' and tablename in ('supplier_transactions','expenses','inventory_levels','suppliers','products_cache','product_costs')
order by tablename, cmd, policyname;

-- Q10. Counts only (no values) of the secrets that must be rotated
select count(*) filter (where api_token is not null) as shopify_tokens,
       count(*) filter (where meta_access_token is not null) as meta_tokens,
       count(*) filter (where shopify_client_secret is not null) as shopify_client_secrets
from public.stores;

-- Q11. SAVE the current trigger function before stage4c5a (the exact original, for a precise rollback) and the profiles triggers
select pg_get_functiondef('public.protect_profile_privileged_fields'::regproc) as protect_function;
select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;
