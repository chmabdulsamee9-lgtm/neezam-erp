-- STAGE 1b: store_custom_domains
-- 1. WHAT IT DOES: Members read their store's domains (the ERP embeds store_custom_domains(domain, role, status) in stores selects); every write is
--    done by the worker with the service key. anon loses everything.
-- 2. WHEN: BEFORE-MERGE. The old production ERP only reads this table as a logged-in user, which the new policy allows.
-- 3. RISK: MEDIUM (Online Store, Store Connect and Products show the domain).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Check Online Store shows the connected domain.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

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

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.store_custom_domains'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'store_custom_domains';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'store_custom_domains' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_store_custom_domains_service on public.store_custom_domains;
-- drop policy if exists ne_store_custom_domains_select on public.store_custom_domains;
-- create policy rollback_store_custom_domains_public_all on public.store_custom_domains for all to public using (true) with check (true);
-- grant all on public.store_custom_domains to anon, authenticated, service_role;
