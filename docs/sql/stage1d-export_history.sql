-- STAGE 1d: export_history. RISK: low (Booked orders CSV export history).
-- Needs stage 0. Apply one table at a time; smoke-test production ERP + dev preview after it (Booked: export, then open the
-- export history list; Orders; Home). On breakage run the ROLLBACK block immediately.
-- Browser needs: SELECT (filtered by store_id) and INSERT (store_id, created_by, file_path, row_count) in BookedOrders.jsx.
-- The Supabase Storage bucket "courier-exports" has its own policies (Q10 in needed-queries.sql) and is not changed here.

drop policy if exists ne_export_history_service on public.export_history;
drop policy if exists ne_export_history_select on public.export_history;
drop policy if exists ne_export_history_insert on public.export_history;
create policy ne_export_history_service on public.export_history for all to service_role using (true) with check (true);
create policy ne_export_history_select on public.export_history for select to authenticated using (public.has_store_access(store_id));
create policy ne_export_history_insert on public.export_history for insert to authenticated with check (public.has_store_access(store_id));

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'export_history' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.export_history', r.policyname);
  end loop;
end $$;

alter table public.export_history enable row level security;
revoke all on public.export_history from anon, authenticated;
grant select, insert on public.export_history to authenticated;
grant all on public.export_history to service_role;

-- VERIFY (read-only)
-- select policyname, roles, cmd from pg_policies where tablename = 'export_history';

-- ============================== ROLLBACK (stage 1d) ==============================
-- Old state: public SELECT true + INSERT.
-- drop policy if exists ne_export_history_service on public.export_history;
-- drop policy if exists ne_export_history_select on public.export_history;
-- drop policy if exists ne_export_history_insert on public.export_history;
-- create policy rollback_export_history_public_select on public.export_history for select to public using (true);
-- create policy rollback_export_history_public_insert on public.export_history for insert to public with check (true);
-- grant select, insert on public.export_history to anon, authenticated;
-- grant all on public.export_history to service_role;
