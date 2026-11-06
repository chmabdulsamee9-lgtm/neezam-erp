-- STAGE 3f: dex_rate_card. RISK: low (global courier rate table; the worker reads it, the browser does not).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Finance Statement, Booked, Home). On
-- breakage run the ROLLBACK block immediately.
-- Before: authenticated ALL true: any logged-in merchant could change the global rates.
-- After: every logged-in user keeps READ; WRITE is for the creator only (stricter than "admin/creator": the table is global, not per
-- store, and no browser code writes to it; the worker writes with the service key). Change is_creator() to is_admin_or_creator() below if
-- an admin really must edit rates in the browser.

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

-- ============================== ROLLBACK (stage 3f) ==============================
-- drop policy if exists ne_dex_rate_card_service on public.dex_rate_card;
-- drop policy if exists ne_dex_rate_card_select on public.dex_rate_card;
-- drop policy if exists ne_dex_rate_card_write on public.dex_rate_card;
-- create policy rollback_dex_rate_card_auth_all on public.dex_rate_card for all to authenticated using (true) with check (true);
-- grant all on public.dex_rate_card to authenticated, service_role;
