-- STAGE 4c5b: a safer "is this the worker (service key)?" check for the two profiles trigger functions.
-- GROUP: Group 1 - only needed IF /create-staff-user (or any worker write of profiles with approved = true / another role) fails after stage 4c5a.
-- PREREQUISITES: stage 0, stage 4c5a applied.
-- ONE-LINE SMOKE TEST: create a TEST staff user from Team on the dev preview (the worker inserts a profile with approved = true); it must succeed.
-- 1. WHAT IT DOES: stage 4c5a recognises the worker by `auth.role() = 'service_role' or session_user in ('postgres','supabase_admin')`. auth.role() reads the
--    request.jwt.claims setting that PostgREST fills from the key. With the legacy JWT service_role key that is reliable. With the NEW secret key format
--    (sb_secret_...) the gateway exchanges the key for an internal token; the role claim is expected to be 'service_role' too, but this is the one thing that cannot be
--    proven from the code. This file adds a helper that accepts ANY of the usual signals (auth.role(), the jwt role claim, the old claim setting) and makes both
--    trigger functions use it. Nothing else changes: a normal logged-in user still cannot self-promote or insert role 'creator' / approved = true.
-- 2. WHEN: apply only if the staff-creation smoke test fails (profile insert error 42501 'forbidden'). Sign-up (/signup-create-account) is NOT affected either way:
--    it inserts role 'admin', approved = false, which the insert guard allows for everybody.
-- 3. RISK: LOW (two function bodies, same logic, a wider "is the worker" test).
-- 4. SMOKE TEST: as above, then the browser-console self-promotion test of stage 4c5a must still fail for a TEST admin.
-- 5. ROLLBACK: re-run the two functions from stage4c5a-profiles-privilege-fix.sql.
-- No BEGIN / COMMIT.

create or replace function public.is_service_request()
returns boolean language sql stable set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin');
$$;
revoke all on function public.is_service_request() from public, anon;
grant execute on function public.is_service_request() to authenticated, service_role;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_request() then
    return new;
  end if;
  if public.is_creator() then
    return new;
  end if;
  new.id := old.id;
  if old.id = auth.uid() then
    new.role := old.role;
    new.approved := old.approved;
    new.email := old.email;
  else
    new.role := old.role;
    new.approved := old.approved;
    if not (public.is_admin() and old.role is distinct from 'creator' and public.shares_store_with(old.id)) then
      new.email := old.email;
    end if;
  end if;
  return new;
end
$$;

create or replace function public.profiles_block_privileged_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_request() or public.is_creator() then
    return new;
  end if;
  if new.role = 'creator' or coalesce(new.approved, false) = true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end
$$;

-- ============================== VERIFY (read-only)
-- select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('is_service_request','protect_profile_privileged_fields','profiles_block_privileged_insert');
-- select pg_get_functiondef('public.profiles_block_privileged_insert'::regproc) like '%is_service_request%';   -- expect true

-- ============================== ROLLBACK
-- Re-run the two functions exactly as written in stage4c5a-profiles-privilege-fix.sql, then:
-- drop function if exists public.is_service_request();
