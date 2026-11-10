-- STAGE 3f: dex_rate_card
-- GROUP: Group 1 (safe before the merge)
-- PREREQUISITES: stage 0
-- ONE-LINE SMOKE TEST: Finance Statement loads.
-- 1. WHAT IT DOES: Everyone logged in keeps READ; only the creator can WRITE (global courier rates, not per store; no browser code writes it, the
--    worker patches it with the service key). Before: authenticated ALL true.
-- 2. WHEN: BEFORE-MERGE (no browser caller).
-- 3. RISK: LOW.
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Finance Statement and Booked still show rates / fees.
-- 5. ROLLBACK: The ROLLBACK block at the bottom restores a permissive policy and the default grants (policy names of the old state are in
--    before-state-facts.md; the exact original text is whatever your pg_policies listing showed).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

drop policy if exists ne_dex_rate_card_service on public.dex_rate_card;
drop policy if exists ne_dex_rate_card_select on public.dex_rate_card;
drop policy if exists ne_dex_rate_card_write on public.dex_rate_card;
create policy ne_dex_rate_card_service on public.dex_rate_card for all to service_role using (true) with check (true);
create policy ne_dex_rate_card_select on public.dex_rate_card for select to authenticated using (true);
create policy ne_dex_rate_card_write on public.dex_rate_card for all to authenticated using (public.is_creator()) with check (public.is_creator());

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'dex_rate_card' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.dex_rate_card', r.policyname);
  end loop;
end $$;

alter table public.dex_rate_card enable row level security;
revoke all on public.dex_rate_card from anon, authenticated;
grant select, insert, update, delete on public.dex_rate_card to authenticated;
grant all on public.dex_rate_card to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.dex_rate_card'::regclass;   -- expect true
-- select policyname, roles, cmd from pg_policies where tablename = 'dex_rate_card';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'dex_rate_card' and grantee in ('anon','authenticated');

-- ============================== ROLLBACK
-- drop policy if exists ne_dex_rate_card_service on public.dex_rate_card;
-- drop policy if exists ne_dex_rate_card_select on public.dex_rate_card;
-- drop policy if exists ne_dex_rate_card_write on public.dex_rate_card;
-- create policy rollback_dex_rate_card_auth_all on public.dex_rate_card for all to authenticated using (true) with check (true);
-- grant all on public.dex_rate_card to authenticated, service_role;
