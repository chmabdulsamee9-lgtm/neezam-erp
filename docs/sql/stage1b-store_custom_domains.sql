-- STAGE 1b: store_custom_domains. RISK: medium (the ERP reads it embedded in stores selects: Online Store, Store Connect, Products).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (login, Home, Orders, Booked,
-- Returns, Online Store (domain shown), Meta Connect, Settings, Team). On breakage run the ROLLBACK block immediately.
-- Browser needs: SELECT only (embedded `store_custom_domains(domain, role, status)`). All writes are made by the worker (service key).
-- The storefront resolves domains through the worker (service key), never with the anon key.

drop policy if exists ne_store_custom_domains_service on public.store_custom_domains;
drop policy if exists ne_store_custom_domains_select on public.store_custom_domains;
create policy ne_store_custom_domains_service on public.store_custom_domains for all to service_role using (true) with check (true);
create policy ne_store_custom_domains_select on public.store_custom_domains for select to authenticated using (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'store_custom_domains' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.store_custom_domains', r.policyname);
  end loop;
end $$;

alter table public.store_custom_domains enable row level security;
revoke all on public.store_custom_domains from anon, authenticated;
grant select on public.store_custom_domains to authenticated;
grant all on public.store_custom_domains to service_role;

-- VERIFY (read-only)
-- select policyname, roles, cmd from pg_policies where tablename = 'store_custom_domains';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'store_custom_domains' and grantee in ('anon','authenticated');  -- expect only authenticated SELECT

-- ============================== ROLLBACK (stage 1b) ==============================
-- drop policy if exists ne_store_custom_domains_service on public.store_custom_domains;
-- drop policy if exists ne_store_custom_domains_select on public.store_custom_domains;
-- create policy rollback_store_custom_domains_public_all on public.store_custom_domains for all to public using (true) with check (true);
-- grant all on public.store_custom_domains to anon, authenticated, service_role;
