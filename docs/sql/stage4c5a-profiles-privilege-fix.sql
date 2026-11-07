-- STAGE 4c5a: profiles privilege-escalation fix (trigger functions only, no RLS change)
-- GROUP: Group 1 (safe before the merge) - URGENT, apply right after stage 0
-- PREREQUISITES: stage 0 (is_creator, is_admin, shares_store_with)
-- ONE-LINE SMOKE TEST: TEST admin console: updating own role / approved changes nothing; Team edit of a teammate and the creator approving a TEST account still
--    work.
-- 1. WHAT IT DOES: Closes a hole that exists TODAY: the BEFORE UPDATE trigger function protect_profile_privileged_fields() lets any caller whose
--    own profile role is 'admin' or 'creator' change everything, and every merchant owner is an admin, so an admin can set their own
--    role to 'creator' (full takeover of every tenant) or their own approved = true. This file replaces the function and adds a
--    BEFORE INSERT guard. New rules: the service role (worker) and the SQL editor bypass; a creator may change anything; for every
--    other caller role, approved, email and id of their OWN row can never change; on ANOTHER user's row role, approved and id can
--    never change, and email only by an admin on a teammate (shares a store) who is not a creator. Name and phone follow the normal
--    row rules. Insert guard: a caller who is not the service role and not a creator cannot insert role 'creator' or approved = true.
-- 2. WHEN: BEFORE-MERGE and URGENT: apply right after stage 0, before everything else in group 1. It does not depend on RLS (it protects
--    while RLS on profiles is still off), and it changes nothing any page does today (checked in the audit below).
--    NOTE: It is a trigger-function change, not a policy: it adds no restriction any page of the old ERP relies on (checked in the audit), so it is
--    safe before the redeploy even though the old ERP uses profiles.
-- 3. RISK: LOW to apply, HIGH value. The only behaviour it removes is self-promotion / self-approval.
-- 4. SMOKE TEST: On the dev preview with a TEST admin account, open the browser console and run: `const {data:{session}} = await
--    supabase.auth.getSession(); (await supabase.from('profiles').update({role:'creator', approved:true}).eq('id',
--    session.user.id).select('role,approved'))` -> the returned role must still be 'admin' (and approved unchanged). Then: My
--    account: change own name / phone (works). Team (admin): edit a teammate's name, phone and email (works). Master dashboard as the
--    creator: edit an admin's name / phone / email and approve a TEST pending account (works). Sign up a TEST account (works, lands
--    as pending). Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list,
--    Edit Items, cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home /
--    product / cart / checkout.
-- 5. ROLLBACK: The ROLLBACK block restores the previous function body (reconstructed from the owner's Q4 summary; the EXACT original is
--    whatever `select pg_get_functiondef('public.protect_profile_privileged_fields'::regproc)` returns, SAVE it first, needed-
--    queries.sql Q11) and drops the insert guard.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- WHAT THE PAGES NEED (audit, file:line): Team.jsx:176 an admin edits a teammate's full_name, phone, email; Accounts.jsx:49 a user edits their own full_name, phone;
-- App.jsx:594 the creator edits an admin's full_name, phone, email; App.jsx:1585 the creator sets approved = true. No page changes role anywhere, and no page
-- lets an admin change another user's approved. `approved` IS a login gate (App.jsx:1549 shows the pending screen, :1381 and :1389 stop loading data until approved),
-- which is why self-approval is as serious as self-promotion. Staff and admin users are created by the worker (service key), never by the browser.
-- So admins are NOT given role / approved changes on teammates (not needed by any page). To allow it later: relax the second branch below.
--
-- Needs stage 0 (is_creator, is_admin, shares_store_with). STEP 0: save the current definition for the rollback:
--   select pg_get_functiondef('public.protect_profile_privileged_fields'::regproc);

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. the worker (service key) and direct database sessions (SQL editor / postgres): full bypass
  if auth.role() = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  -- 2. a creator may change anything
  if public.is_creator() then
    return new;
  end if;
  -- 3. everybody else
  new.id := old.id;
  if old.id = auth.uid() then
    -- own row: role, approved and email can never be changed
    new.role := old.role;
    new.approved := old.approved;
    new.email := old.email;
  else
    -- another user's row: role and approved can never be changed; email only by an admin on a teammate who is not a creator
    new.role := old.role;
    new.approved := old.approved;
    if not (public.is_admin() and old.role is distinct from 'creator' and public.shares_store_with(old.id)) then
      new.email := old.email;
    end if;
  end if;
  return new;
end
$$;

-- BEFORE INSERT guard (a second function, the existing UPDATE trigger trg_protect_profile_fields is left exactly as it is)
create or replace function public.profiles_block_privileged_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or session_user in ('postgres', 'supabase_admin') or public.is_creator() then
    return new;
  end if;
  if new.role = 'creator' or coalesce(new.approved, false) = true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.profiles_block_privileged_insert() from public, anon;
grant execute on function public.profiles_block_privileged_insert() to authenticated, service_role;
drop trigger if exists trg_profiles_block_privileged_insert on public.profiles;
create trigger trg_profiles_block_privileged_insert before insert on public.profiles
  for each row execute function public.profiles_block_privileged_insert();

-- OLD BROWSER SIGN-UP STILL PASSES the insert guard: it inserts role 'admin' with approved = false (master Login.jsx:222); the guard only rejects role 'creator' or approved = true.
-- grants of the replaced function are unchanged (stage 4a keeps authenticated execute; trigger functions need no grant to fire)

-- ============================== VERIFY (read-only)
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('protect_profile_privileged_fields','profiles_block_privileged_insert');   -- expect prosecdef true, proconfig {search_path=public}
-- select tgname, tgtype, tgenabled from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--   -- expect trg_protect_profile_fields (BEFORE UPDATE) and trg_profiles_block_privileged_insert (BEFORE INSERT), both enabled ('O')
-- select pg_get_functiondef('public.protect_profile_privileged_fields'::regproc) like '%service_role%';   -- expect true
-- Behaviour tests are the browser-console and page tests in the SMOKE TEST above (they need a real logged-in user):
--   admin cannot self-promote to creator, cannot self-approve, can still manage teammates (name / phone / email), creator can approve pending users.

-- ============================== ROLLBACK
-- >>> PASTE THE EXACT ORIGINAL HERE <<< (the output of Q11 / STEP 0: `select pg_get_functiondef('public.protect_profile_privileged_fields'::regproc);`)
-- If you saved it, run THAT text (a `create or replace function ...`) and IGNORE the reconstructed body below. The reconstructed body is only a fallback.
-- drop trigger if exists trg_profiles_block_privileged_insert on public.profiles;
-- drop function if exists public.profiles_block_privileged_insert();
-- (the two statements above are replaced by this single copy; do not run them twice)
-- Restore the previous UPDATE function. RECONSTRUCTED from the owner's description (acting role read from profiles where id = auth.uid(); anything other than
-- admin / creator gets role, approved and email reset to OLD; admin and creator pass). Prefer the saved exact definition from STEP 0 if you have it:
-- create or replace function public.protect_profile_privileged_fields()
-- returns trigger language plpgsql security definer
-- as $$
-- declare acting_role text;
-- begin
--   select role into acting_role from public.profiles where id = auth.uid();
--   if acting_role is distinct from 'admin' and acting_role is distinct from 'creator' then
--     new.role := old.role; new.approved := old.approved; new.email := old.email;
--   end if;
--   return new;
-- end $$;
-- NOTE: the previous version had no search_path; leaving search_path = public set in the rollback is harmless, but `alter function public.protect_profile_privileged_fields() reset search_path;` restores it exactly.
