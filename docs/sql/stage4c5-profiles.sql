-- STAGE 4c-5: profiles (RLS currently DISABLED; roles, approval flag, phone, email)
-- 1. WHAT IT DOES: Turns RLS on. SELECT: own row, a creator, or a user who shares a store with the caller (admin viewing the team). UPDATE: own
--    row, a creator, or an admin updating a teammate (same semantics as today's profiles_update_self_or_privileged but through
--    helpers: no self-query, no recursion). INSERT: only your own row, only as role 'admin' with approved = false (exactly what the
--    sign-up writes). DELETE: creator only. The privilege trigger functions (no self-promotion, no self-approval, insert guard) are
--    in stage4c5a-profiles-privilege-fix.sql, which MUST be applied first: it is also what makes the UPDATE-own-row policy safe.
-- 2. WHEN: Needs stage4c5a first (urgent, before-merge). This RLS step is AFTER-MERGE (conservative; same reasoning as 4c-4). It CAN run
--    before the merge only when the owner has confirmed "Confirm email" is OFF, because the old sign-up inserts its profile as the
--    new user. On the new code the profile is created by the worker, so it is independent of the setting.
-- 3. RISK: HIGH (login reads the profile; the master dashboard lists and approves accounts; Team lists members).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Login as admin, creator, staff. Master dashboard: pending approvals list, approve a TEST account, edit an
--    admin's name on a TEST account. Team: member names listed, edit a TEST member's phone. My account: change own name. Sign up a
--    TEST account. The self-promotion / self-approval console tests from stage4c5a must still fail.
-- 5. ROLLBACK: The ROLLBACK block disables RLS and restores the grants (stage4c5a has its own rollback).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- ORDER OF 4c: 1 order_sync_history, 2 shopify_orders_cache, 3 order_statuses, 4 user_stores (before this one), 5 profiles.
-- Browser use (Part 1): own row (App.jsx select *, Orders/Booked/StoreConnect/CourierConnect/OnlineStore/ThemeEditorV2 select own); creator lists pending
-- accounts (approved = false, role <> creator) and approves / edits; Team.jsx reads teammates through user_stores(profiles(...)) and edits a teammate's
-- name / phone / email; Accounts.jsx updates own name / phone; Login.jsx inserts the sign-up row. Staff and admin users added by an admin are created by the
-- worker (/create-staff-user, service key), never by a browser insert under another user's id.
-- PREREQUISITE: stage4c5a-profiles-privilege-fix.sql applied (the UPDATE-own-row policy below is only safe because that trigger refuses role / approved / email changes).

drop policy if exists ne_profiles_service on public.profiles;
drop policy if exists ne_profiles_select on public.profiles;
drop policy if exists ne_profiles_insert on public.profiles;
drop policy if exists ne_profiles_update on public.profiles;
drop policy if exists ne_profiles_delete on public.profiles;
create policy ne_profiles_service on public.profiles for all to service_role using (true) with check (true);
create policy ne_profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_creator() or public.shares_store_with(id));
create policy ne_profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'admin' and coalesce(approved, false) = false);
create policy ne_profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_creator() or (public.is_admin() and public.shares_store_with(id)))
  with check (id = auth.uid() or public.is_creator() or (public.is_admin() and public.shares_store_with(id)));
create policy ne_profiles_delete on public.profiles for delete to authenticated using (public.is_creator());

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname not like 'ne\_%' escape '\' loop
    execute format('drop policy %I on public.profiles', r.policyname);
  end loop;
end $$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ============================== VERIFY (read-only)
-- select relrowsecurity from pg_class where oid = 'public.profiles'::regclass;   -- expect true
-- As a normal admin: select count(*) from profiles -> only themselves and their team (not all 12).
-- Browser-console tests on a TEST admin (dev preview): updating own role / approved changes nothing; inserting a profile with role 'creator' fails with 42501.
-- An admin can still edit a teammate's name / phone / email (Team page); the creator can approve a pending TEST account.

-- ============================== ROLLBACK
-- drop policy if exists ne_profiles_service on public.profiles;
-- drop policy if exists ne_profiles_select on public.profiles;
-- drop policy if exists ne_profiles_insert on public.profiles;
-- drop policy if exists ne_profiles_update on public.profiles;
-- drop policy if exists ne_profiles_delete on public.profiles;
-- create policy profiles_update_self_or_privileged on public.profiles for update to authenticated
--   using (id = auth.uid() or public.is_creator() or (public.is_admin() and public.shares_store_with(id)))
--   with check (id = auth.uid() or public.is_creator() or (public.is_admin() and public.shares_store_with(id)));
--   -- (the original text used a self-query on profiles; Q1 in needed-queries.sql holds it. RLS is disabled again on the next line, so this policy is inert.)
-- alter table public.profiles disable row level security;
-- grant all on public.profiles to anon, authenticated, service_role;
