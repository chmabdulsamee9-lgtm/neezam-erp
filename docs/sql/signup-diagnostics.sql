-- READ-ONLY diagnostics for "Subscription request nahi bani" (sign-up failed at the subscription step). Run each query on its own; paste the results back.
-- The worker now also logs the real database error of the failed step: Master dashboard > Dev Monitor, action "signup_step_failed" (details.step, details.code).

-- D1. Columns, types, NOT NULL and defaults of store_subscriptions (a NOT NULL column without a default breaks an insert of only {store_id, status})
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'store_subscriptions'
order by ordinal_position;

-- D2. Constraints (CHECK on status, UNIQUE on store_id, foreign keys)
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.store_subscriptions'::regclass;

-- D3. Triggers on store_subscriptions and on stores (a trigger that creates or changes a subscription row, or that needs auth.uid())
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relname in ('store_subscriptions', 'stores');

-- D4. Which status values exist today (is 'pending_approval' really in use?)
select status, count(*) from public.store_subscriptions group by status order by 2 desc;

-- D5. Is there a subscription row for the stores that signed up recently without one? (store_id is the eneezam_id, TEXT)
select s.store_name, s.eneezam_id, (select count(*) from public.store_subscriptions q where q.store_id = s.eneezam_id) as subscription_rows
from public.stores s order by s.created_at desc limit 10;

-- D6. Any leftover from the failed attempts (expect no rows)
select 'auth.users' as t, count(*) from auth.users where created_at > now() - interval '2 days' and email_confirmed_at is not null and id not in (select id from public.profiles)
union all select 'stores without link', count(*) from public.stores s where not exists (select 1 from public.user_stores us where us.store_id = s.id) and s.user_id is not null;
