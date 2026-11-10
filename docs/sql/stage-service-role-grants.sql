-- STAGE SERVICE-ROLE GRANTS: explicit privileges for the worker's key on tables that lost them.
-- GROUP: Group 1 (safe before the merge). ALREADY APPLIED on the live database by the owner (the main block below). The deployment_log block at the bottom is NOT applied yet.
-- PREREQUISITES: none for the main block. The deployment_log block needs the creator-only /log-deployment worker to be deployed first (worker commit after 1459549).
-- ONE-LINE SMOKE TEST: sign up a TEST account on the dev preview (the worker inserts into store_subscriptions); it must complete, and Home / Orders still load.
-- 1. WHAT IT DOES: GRANT ALL on the listed tables to service_role (plus usage / select on all sequences). The worker uses the service key, which is the service_role database
--    role. Row-level security does not stop it, but a missing TABLE privilege does: the sign-up failed at the store_subscriptions step with 42501 (permission denied)
--    because service_role had no INSERT / UPDATE / DELETE there (stages 1 to 4 revoke or never grant privileges to some roles, and tables created later do not get them by default).
-- 2. WHY: every table the worker reads or writes must carry an explicit service_role grant. RULE FOR THE FUTURE: every NEW table must get
--    `grant all on public.<table> to service_role;` in the same migration (and `grant usage, select on its sequences`). Stage 0 only controls anon / authenticated defaults.
-- 3. RISK: LOW (only widens the worker's own role; anon and authenticated are untouched).
-- 4. SMOKE TEST: as above. Then run the VERIFY query: no public table the worker uses may be missing a privilege.
-- 5. ROLLBACK: normally none is wanted (revoking would break the worker). If ever needed: `revoke all on public.<table> from service_role;` for one table.
-- No BEGIN / COMMIT. Idempotent (GRANT can be repeated).

-- ============================== MAIN BLOCK (ALREADY APPLIED on the live database)
grant all on public.store_subscriptions to service_role;
grant all on public.activity_log to service_role;
grant all on public.addons to service_role;
grant all on public.address_abbreviations to service_role;
grant all on public.address_reference to service_role;
grant all on public.app_settings to service_role;
grant all on public.block_hints to service_role;
grant all on public.contact_submissions to service_role;
grant all on public.courier_feedback_log to service_role;
grant all on public.dev_monitoring_log to service_role;
grant all on public.dex_shipments_import to service_role;
grant all on public.export_history to service_role;
grant all on public.local_order_counter to service_role;
grant all on public.order_statuses to service_role;
grant all on public.otp_verifications to service_role;
grant all on public.password_reset_requests to service_role;
grant all on public.plans to service_role;
grant all on public.product_variant_archive to service_role;
grant all on public.store_performance_events to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ============================== SEPARATE BLOCK: deployment_log (NOT APPLIED YET)
-- Run ONLY AFTER the creator-only /log-deployment worker is deployed. Until then deployment_log deliberately has no service_role rights, because the old
-- /log-deployment was an open endpoint that anybody could use to write to it. Only INSERT and SELECT are granted (the worker writes rows and /admin-query reads them).
-- grant insert, select on public.deployment_log to service_role;
-- ROLLBACK of this block: revoke insert, select on public.deployment_log from service_role;

-- ============================== VERIFY (read-only): service_role privileges per public table (rows shown only where something is missing)
select c.relname as table_name,
       has_table_privilege('service_role', c.oid, 'select') as sel,
       has_table_privilege('service_role', c.oid, 'insert') as ins,
       has_table_privilege('service_role', c.oid, 'update') as upd,
       has_table_privilege('service_role', c.oid, 'delete') as del
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not (has_table_privilege('service_role', c.oid, 'select') and has_table_privilege('service_role', c.oid, 'insert')
           and has_table_privilege('service_role', c.oid, 'update') and has_table_privilege('service_role', c.oid, 'delete'))
order by c.relname;
-- expect: no rows once the deployment_log block is also applied (before it, only deployment_log is listed)
