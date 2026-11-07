-- STAGE 0: helper functions, privilege cleanup, safer defaults.
-- GROUP: Group 1 (safe before the merge)
-- PREREQUISITES: none (apply first)
-- ONE-LINE SMOKE TEST: Login, Home and Orders open exactly as before (nothing should change).
-- 1. WHAT IT DOES: creates the access helpers every later policy uses, removes TRUNCATE / REFERENCES / TRIGGER from anon and
--    authenticated on all public tables, and makes future tables / functions in public NOT default-grant to anon.
-- 2. WHEN: BEFORE-MERGE. Nothing here changes who can read or write a row, so the old production ERP is unaffected.
-- 3. RISK: low.
-- 4. SMOKE TEST (production ERP portal.eneezam.com AND dev preview, plus drglow.online): login, Home, Orders list, Booked, Online Store.
--    Nothing should look different.
-- 5. ROLLBACK: the block at the bottom (the helper functions are harmless and are dropped last, after every later stage was rolled back).
-- No BEGIN / COMMIT. Statements are ordered so that a failure part-way never locks anyone out.
-- NEEDS-CHECK: the four `alter default privileges for role supabase_admin` lines fail with "role does not exist" if that role is absent; the statements above them
-- are already applied, so just delete those four lines and run the rest.
-- RECURSION: every helper is SECURITY DEFINER and owned by the table owner, so reading profiles / user_stores / stores inside a helper bypasses RLS (owner bypass);
-- a policy on profiles or user_stores that calls a helper therefore never re-enters its own policy.
-- OWNER LOGIC and the 9 stores. is_store_owner(store) is true for the service role, for stores.user_id = the caller, and, when stores.user_id is NULL,
-- for an ADMIN linked to that store in user_stores. 8 of the 9 stores have user_id NULL (Bloomvera, dewarekhas.pk, Doctor Rubina, DoctorSaba, DR GLOW, Innovenza,
-- KhasWall.com, Quench); the 9th has user_id set (its name was not given to me: not sure which one it is).
-- After this file nothing changes for anyone (helpers only). After the files that USE it: the linked admin of each NULL-owner store counts as its owner (team
-- management, store-cascade delete); staff never do; a second admin of the 9th store is not its owner; the creator is handled by is_creator().

-- ------------------------------------------------------------------ helpers (all SECURITY DEFINER, fixed search_path)
create or replace function public.is_creator()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.role() = 'service_role'
        or (auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator')); $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'); $$;

-- true for: the service role, a creator, the store's owner (stores.user_id), or anybody linked to the store in user_stores.
-- (Same rule as the worker's hasStoreAccess() plus the owner clause, so a brand just inserted can be read back before its
-- user_stores link exists.)
create or replace function public.has_store_access(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_store_id is not null and (
    auth.role() = 'service_role'
    or (auth.uid() is not null and (
         exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator')
      or exists (select 1 from public.stores s where s.id = p_store_id and s.user_id = auth.uid())
      or exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = p_store_id)))
  );
$$;

-- same check for tables whose store_id column is text (a non-uuid value is simply "no access")
create or replace function public.has_store_access(p_store_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select case when p_store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.has_store_access(p_store_id::uuid) else false end;
$$;

-- store_subscriptions.store_id is TEXT = stores.eneezam_id (not the uuid)
create or replace function public.has_store_access_by_eneezam_id(p_eneezam_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_eneezam_id is not null and exists (
    select 1 from public.stores s where s.eneezam_id::text = p_eneezam_id and public.has_store_access(s.id));
$$;

-- the store's OWNER. Eight of the nine stores have stores.user_id NULL, so ownership is: the service role, OR stores.user_id = the caller,
-- OR (stores.user_id IS NULL AND the caller is linked to the store in user_stores AND the caller's profile role is 'admin').
-- A creator is NOT an owner here: callers that also allow creators say so explicitly (public.is_creator() or public.is_store_owner(...)).
create or replace function public.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_store_id is not null and (
    auth.role() = 'service_role'
    or (auth.uid() is not null and exists (
          select 1 from public.stores s
           where s.id = p_store_id
             and (s.user_id = auth.uid()
                  or (s.user_id is null and exists (
                        select 1 from public.user_stores us join public.profiles p on p.id = us.user_id
                         where us.user_id = auth.uid() and us.store_id = s.id and p.role = 'admin'))))));
$$;

-- creator, owner, or any admin linked to the store (editing the store row, deleting it)
create or replace function public.is_store_admin(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_creator() or public.is_store_owner(p_store_id)
      or (p_store_id is not null and auth.uid() is not null and exists (
            select 1 from public.user_stores us join public.profiles p on p.id = us.user_id
             where us.user_id = auth.uid() and us.store_id = p_store_id and p.role = 'admin'));
$$;

-- true when the store already has at least one member (used by the user_stores insert rule)
create or replace function public.store_has_members(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_stores us where us.store_id = p_store_id); $$;

-- may add / change / remove the members of a store: a creator or the store's owner
create or replace function public.can_manage_team(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_creator() or public.is_store_owner(p_store_id); $$;

-- true when the given user is linked to at least one store the caller is linked to (an admin sees his team's profiles)
create or replace function public.shares_store_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and p_user is not null and exists (
    select 1 from public.user_stores a join public.user_stores b on b.store_id = a.store_id
     where a.user_id = auth.uid() and b.user_id = p_user);
$$;

-- execute only for logged-in users and the service role (never anon / PUBLIC)
revoke all on function public.is_creator() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.has_store_access(uuid) from public, anon;
revoke all on function public.has_store_access(text) from public, anon;
revoke all on function public.has_store_access_by_eneezam_id(text) from public, anon;
revoke all on function public.is_store_owner(uuid) from public, anon;
revoke all on function public.is_store_admin(uuid) from public, anon;
revoke all on function public.store_has_members(uuid) from public, anon;
revoke all on function public.can_manage_team(uuid) from public, anon;
revoke all on function public.shares_store_with(uuid) from public, anon;
grant execute on function public.is_creator() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.has_store_access(uuid) to authenticated, service_role;
grant execute on function public.has_store_access(text) to authenticated, service_role;
grant execute on function public.has_store_access_by_eneezam_id(text) to authenticated, service_role;
grant execute on function public.is_store_owner(uuid) to authenticated, service_role;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;
grant execute on function public.store_has_members(uuid) to authenticated, service_role;
grant execute on function public.can_manage_team(uuid) to authenticated, service_role;
grant execute on function public.shares_store_with(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ dangerous table privileges
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ------------------------------------------------------------------ safer defaults for FUTURE objects
-- (default privileges are per creating role: postgres and supabase_admin are the ones that create objects in a Supabase project)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role supabase_admin in schema public revoke truncate, references, trigger on tables from authenticated;

-- ============================== VERIFY (read-only)
-- select has_function_privilege('anon', 'public.has_store_access(uuid)', 'execute');            -- expect false
-- select has_function_privilege('authenticated', 'public.has_store_access(uuid)', 'execute');   -- expect true
-- select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated')
--   and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');                                  -- expect 0
-- select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('is_creator','is_admin','has_store_access','has_store_access_by_eneezam_id','is_store_owner','is_store_admin','store_has_members','can_manage_team','shares_store_with');
--   -- expect prosecdef = true, provolatile = 's' (stable) and proconfig = {search_path=public} on all
-- select proname, has_function_privilege('anon', oid, 'execute') as anon_exec, has_function_privilege('authenticated', oid, 'execute') as auth_exec from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('is_creator','is_admin','has_store_access','has_store_access_by_eneezam_id','is_store_owner','is_store_admin','store_has_members','can_manage_team','shares_store_with');   -- anon false, authenticated true

-- ============================== ROLLBACK (stage 0)
-- grant truncate, references, trigger on all tables in schema public to anon, authenticated;
-- alter default privileges for role postgres in schema public grant all on tables to anon;
-- alter default privileges for role postgres in schema public grant all on sequences to anon;
-- alter default privileges for role postgres in schema public grant execute on functions to public, anon;
-- alter default privileges for role supabase_admin in schema public grant all on tables to anon;
-- alter default privileges for role supabase_admin in schema public grant all on sequences to anon;
-- alter default privileges for role supabase_admin in schema public grant execute on functions to public, anon;
-- alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to authenticated;
-- alter default privileges for role supabase_admin in schema public grant truncate, references, trigger on tables to authenticated;
-- Helpers (only after EVERY later stage is rolled back, because policies depend on them):
-- drop function if exists public.shares_store_with(uuid), public.can_manage_team(uuid), public.store_has_members(uuid), public.is_store_admin(uuid), public.is_store_owner(uuid),
--   public.has_store_access_by_eneezam_id(text), public.has_store_access(text), public.has_store_access(uuid),
--   public.is_admin(), public.is_creator();
