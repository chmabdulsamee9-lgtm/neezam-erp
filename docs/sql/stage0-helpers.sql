-- STAGE 0: helper functions, privilege cleanup, safer defaults. RISK: low. Apply this FIRST; nothing else works without it.
-- Apply one stage / table at a time and smoke-test after each (see docs/db-access-audit.md section 9):
--   production ERP (portal.eneezam.com) AND dev preview: login, Home, Orders (list, Edit Items, cancel on a TEST order only),
--   Booked, Returns, Online Store, Meta Connect, Settings, Team. On any breakage run this file's ROLLBACK block immediately.
-- No BEGIN/COMMIT. Statements are ordered so that a failure part-way never locks anyone out.

-- ------------------------------------------------------------------ has_store_access
-- Mirrors the worker's hasStoreAccess() exactly: a creator may access every store; everyone else (admin or staff) only the
-- stores they are linked to in user_stores. (The worker does NOT treat stores.user_id as access; the stores policies in
-- stage 1 add the owner clause only where it is needed: reading back a just-inserted store row.)
create or replace function public.has_store_access(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and p_store_id is not null and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator')
    or exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = p_store_id)
  );
$$;

-- same check for tables whose store_id column is text
create or replace function public.has_store_access(p_store_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case when p_store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.has_store_access(p_store_id::uuid) else false end;
$$;

-- store_subscriptions and some logs are keyed by stores.eneezam_id instead of stores.id
create or replace function public.has_store_access_eneezam(p_eneezam_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_eneezam_id is not null and exists (
    select 1 from public.stores s where s.eneezam_id::text = p_eneezam_id and public.has_store_access(s.id)
  );
$$;

create or replace function public.is_creator()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator'); $$;

create or replace function public.is_admin_or_creator()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','creator')); $$;

-- may manage the team and delete the store: creator, the store's owner (stores.user_id), or an admin linked to the store
create or replace function public.is_store_admin(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and p_store_id is not null and (
    public.is_creator()
    or exists (select 1 from public.stores s where s.id = p_store_id and s.user_id = auth.uid())
    or exists (select 1 from public.user_stores us join public.profiles p on p.id = us.user_id
               where us.user_id = auth.uid() and us.store_id = p_store_id and p.role = 'admin')
  );
$$;

-- true when the given user shares at least one store with the caller (team members see each other's profile rows)
create or replace function public.shares_store_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_stores a join public.user_stores b on b.store_id = a.store_id
    where a.user_id = auth.uid() and b.user_id = p_user_id
  );
$$;

revoke all on function public.has_store_access(uuid) from public, anon;
revoke all on function public.has_store_access(text) from public, anon;
revoke all on function public.has_store_access_eneezam(text) from public, anon;
revoke all on function public.is_creator() from public, anon;
revoke all on function public.is_admin_or_creator() from public, anon;
revoke all on function public.is_store_admin(uuid) from public, anon;
revoke all on function public.shares_store_with(uuid) from public, anon;
grant execute on function public.has_store_access(uuid) to authenticated, service_role;
grant execute on function public.has_store_access(text) to authenticated, service_role;
grant execute on function public.has_store_access_eneezam(text) to authenticated, service_role;
grant execute on function public.is_creator() to authenticated, service_role;
grant execute on function public.is_admin_or_creator() to authenticated, service_role;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;
grant execute on function public.shares_store_with(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ dangerous table privileges
-- Nobody but the owner / service_role needs TRUNCATE, REFERENCES or TRIGGER on application tables.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ------------------------------------------------------------------ safer defaults for FUTURE objects
-- Default privileges are per creating role; the two roles that create objects in a Supabase project are postgres and supabase_admin.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role supabase_admin in schema public revoke truncate, references, trigger on tables from authenticated;

-- VERIFY (read-only)
-- select has_function_privilege('anon', 'public.has_store_access(uuid)', 'execute');            -- expect false
-- select has_function_privilege('authenticated', 'public.has_store_access(uuid)', 'execute');   -- expect true
-- select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')
--   and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');                                  -- expect 0

-- ============================== ROLLBACK (stage 0) ==============================
-- Restores the old table privileges and default privileges. The helper functions are harmless; they are NOT dropped here
-- because later stages' policies depend on them (drop them only after every later stage has been rolled back).
-- grant truncate, references, trigger on all tables in schema public to anon, authenticated;
-- alter default privileges for role postgres in schema public grant all on tables to anon;
-- alter default privileges for role postgres in schema public grant all on sequences to anon;
-- alter default privileges for role postgres in schema public grant execute on functions to public, anon;
-- alter default privileges for role supabase_admin in schema public grant all on tables to anon;
-- alter default privileges for role supabase_admin in schema public grant all on sequences to anon;
-- alter default privileges for role supabase_admin in schema public grant execute on functions to public, anon;
-- alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to authenticated;
-- alter default privileges for role supabase_admin in schema public grant truncate, references, trigger on tables to authenticated;
