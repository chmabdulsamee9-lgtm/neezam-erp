-- STAGE 0: helper functions, privilege cleanup, safer defaults.
-- 1. WHAT IT DOES: creates the access helpers every later policy uses, removes TRUNCATE / REFERENCES / TRIGGER from anon and
--    authenticated on all public tables, and makes future tables / functions in public NOT default-grant to anon.
-- 2. WHEN: BEFORE-MERGE. Nothing here changes who can read or write a row, so the old production ERP is unaffected.
-- 3. RISK: low.
-- 4. SMOKE TEST (production ERP portal.eneezam.com AND dev preview, plus drglow.online): login, Home, Orders list, Booked, Online Store.
--    Nothing should look different.
-- 5. ROLLBACK: the block at the bottom (the helper functions are harmless and are dropped last, after every later stage was rolled back).
-- No BEGIN / COMMIT. Statements are ordered so that a failure part-way never locks anyone out.

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

-- the store's owner or a creator (team management, store deletion)
create or replace function public.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_store_id is not null and (
    auth.role() = 'service_role'
    or (auth.uid() is not null and (
         exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator')
      or exists (select 1 from public.stores s where s.id = p_store_id and s.user_id = auth.uid())))
  );
$$;

-- owner, creator, or an admin linked to the store (editing the store row, deleting it)
create or replace function public.is_store_admin(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_store_owner(p_store_id)
      or (auth.uid() is not null and exists (
            select 1 from public.user_stores us join public.profiles p on p.id = us.user_id
             where us.user_id = auth.uid() and us.store_id = p_store_id and p.role = 'admin'));
$$;

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
revoke all on function public.shares_store_with(uuid) from public, anon;
grant execute on function public.is_creator() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.has_store_access(uuid) to authenticated, service_role;
grant execute on function public.has_store_access(text) to authenticated, service_role;
grant execute on function public.has_store_access_by_eneezam_id(text) to authenticated, service_role;
grant execute on function public.is_store_owner(uuid) to authenticated, service_role;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;
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
--   and proname in ('is_creator','is_admin','has_store_access','has_store_access_by_eneezam_id','is_store_owner','is_store_admin','shares_store_with');
--   -- expect prosecdef = true and proconfig = {search_path=public} on all

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
-- drop function if exists public.shares_store_with(uuid), public.is_store_admin(uuid), public.is_store_owner(uuid),
--   public.has_store_access_by_eneezam_id(text), public.has_store_access(text), public.has_store_access(uuid),
--   public.is_admin(), public.is_creator();
