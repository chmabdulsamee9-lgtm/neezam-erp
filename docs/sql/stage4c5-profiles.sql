-- STAGE 4c-5: profiles (RLS currently DISABLED; roles, approval flag, phone, email). RISK: HIGH (login reads the profile; the creator
-- master dashboard lists and approves accounts; Team lists members).
-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores, 5 profiles (LAST: policies use user_stores
-- through SECURITY DEFINER helpers). Apply one file at a time and smoke-test BOTH production ERP and the dev preview after it: login as
-- admin, creator and staff; master dashboard (pending approvals, edit an admin on a TEST account); Team (members listed with names);
-- sign-up of a TEST account on the dev preview. On breakage run the ROLLBACK block NOW. Needs stage 0, 4a, 4c-4.
--
-- Browser needs: SELECT own row (App.jsx, Orders, Booked, Store Connect, Courier Connect, Online Store, Theme editor); SELECT teammates
-- (Team.jsx embedded profiles(...)); creator SELECT all (master dashboard, pending accounts); UPDATE own row (profile) and creator UPDATE
-- others (approve, edit name/phone/email); INSERT own row at sign-up (Login.jsx: role 'admin', approved false). Worker uses the service key.
-- Policies:
--   SELECT: own row, creator, or a user who shares a store with the caller.
--   INSERT: own row only, never as creator, never pre-approved.
--   UPDATE: own row, or creator.
--   DELETE: nobody in the browser (the worker deletes with the service key).
-- KEEP the protect_profile_privileged_fields trigger on profiles: it is what stops a user from changing their own role / approved flag in
-- the UPDATE-own-row policy. NEEDS-CHECK (Q4/Q6): confirm that trigger exists and covers `role`, `approved` and the creator flag; if it
-- does not, split the UPDATE own-row policy so it cannot touch those columns (column-level revoke update (role, approved) from authenticated).
-- NEEDS-CHECK: profiles columns used by the ERP: id, email, full_name, phone, role, approved (Q2).

drop policy if exists ne_profiles_service on public.profiles;
drop policy if exists ne_profiles_select on public.profiles;
drop policy if exists ne_profiles_insert on public.profiles;
drop policy if exists ne_profiles_update on public.profiles;
create policy ne_profiles_service on public.profiles for all to service_role using (true) with check (true);
create policy ne_profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_creator() or public.shares_store_with(id));
create policy ne_profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and role is distinct from 'creator' and coalesce(approved, false) = false);
create policy ne_profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_creator()) with check (id = auth.uid() or public.is_creator());

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.profiles', r.policyname);
  end loop;
end $$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.profiles'::regclass;   -- expect true
-- As a normal admin: select count(*) from profiles  -> only themselves and their team, not everyone.

-- ============================== ROLLBACK (stage 4c-5) ==============================
-- Old state: RLS disabled, full grants to anon and authenticated.
-- drop policy if exists ne_profiles_service on public.profiles;
-- drop policy if exists ne_profiles_select on public.profiles;
-- drop policy if exists ne_profiles_insert on public.profiles;
-- drop policy if exists ne_profiles_update on public.profiles;
-- alter table public.profiles disable row level security;
-- grant all on public.profiles to anon, authenticated, service_role;
