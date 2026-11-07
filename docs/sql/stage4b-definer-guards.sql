-- STAGE 4b: guards for the SECURITY DEFINER functions that bypass RLS
-- GROUP: Group 1 (safe before the merge)
-- PREREQUISITES: stage 0 and stage 4a (this file sets its own grants)
-- ONE-LINE SMOKE TEST: Booked: add a remark on a TEST order works; a foreign store's order is refused.
-- 1. WHAT IT DOES: The five definer functions were described to me but their BODIES were never pasted, so this file does NOT re-create any body
--    (that would risk changing business logic). Instead each function is wrapped: the original is renamed to <name>_impl (body
--    untouched, search_path pinned, callable by service_role only) and a new SECURITY DEFINER wrapper with the same name, signature,
--    parameter names and return type adds the guard and calls the original. A signature check at the top aborts with nothing changed
--    if the real function differs from the description. protect_profile_privileged_fields is NOT touched here any more: it is replaced in ONE place, stage4c5-profiles.sql (see the privilege-escalation fix there).
-- 2. WHEN: BEFORE-MERGE for get_next_local_order_number and delete_store_cascade (the worker calls them with the service key; the browser
--    never does). append_order_remark is called by the old ERP's Booked page as a logged-in user for its own orders, which the guard
--    allows, so it is also safe before the merge. Needs stage 0 and stage 4a (apply 4a first; this file sets its own grants).
--    NOTE: the old master BookedOrders.jsx calls append_order_remark; the wrapper allows exactly its own store's orders, so it is a function guard and
--    not a table policy.
-- 3. RISK: MEDIUM (Booked remarks, new native order numbers, store deletion).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Booked: add a remark on a TEST order (works), then as a DIFFERENT store's admin the same call on that order
--    must fail (VERIFY below). Create a TEST native order. Do NOT delete a real store.
-- 5. ROLLBACK: Per function, the ROLLBACK block drops the wrapper and renames <name>_impl back: this restores the original function exactly
--    (body, security definer flag, original search_path setting). Run the block of the function that misbehaved.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- GUARD RULE: allowed when auth.role() = 'service_role' (the worker) or public.has_store_access(<the store of the row>); anything else raises
-- 'forbidden' (SQLSTATE 42501). Calls from the SQL editor (no JWT) are refused too: use the service key or run the *_impl function directly.
-- OWNER LOGIC and the 9 stores. is_store_owner(store) is true for the service role, for stores.user_id = the caller, and, when stores.user_id is NULL,
-- for an ADMIN linked to that store in user_stores. 8 of the 9 stores have user_id NULL (Bloomvera, dewarekhas.pk, Doctor Rubina, DoctorSaba, DR GLOW, Innovenza,
-- KhasWall.com, Quench); the 9th has user_id set (its name was not given to me: not sure which one it is).
-- AFTER THIS FILE, delete_store_cascade (called by the worker /admin-delete-store with the service key, and by nobody else): the service key, a creator, or the OWNER of the store
-- (for the 8 NULL-owner stores that is their linked admin, for the 9th the user in stores.user_id) may run it through the API; staff and other merchants get 'forbidden'.
-- NOTE: the worker route itself still lets ANY admin pass a foreign store_id (it uses the service key, which bypasses this guard): see the audit, section on privilege escalation.
-- RE-RUN: safe. Each block checks first; if <name>_impl exists it prints a notice and does nothing. A wrong signature stops with an error and changes nothing.
-- NEEDS-CHECK before applying: nothing else (a trigger, a view, another function) may call these by name expecting the old body; the owner's
-- trigger list shows none (docs/sql/before-state-facts.md).

-- ---------------------------------------------------------------- append_order_remark
-- append_order_remark: the store is derived from the order's order_statuses row (by order_id, or manual_order_number); no row or no access = forbidden.
do $$
declare v_oid oid; v_ret text; v_args text;
begin
  select p.oid, pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid) into v_oid, v_ret, v_args
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'append_order_remark';
  if v_oid is null then raise exception 'append_order_remark not found: nothing changed'; end if;
  -- re-run safety: if the original was already wrapped, do nothing (never rename a wrapper into _impl, never lose the original body)
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'append_order_remark_impl') then
    raise notice 'append_order_remark: already applied, skipped';
    return;
  end if;
  if v_args <> 'p_order_id text, p_manual_order_number text, p_text text, p_author text' then raise exception 'append_order_remark has an unexpected signature (%): nothing changed', v_args; end if;
  if v_ret like 'SETOF%' or v_ret like 'TABLE%' then raise exception 'append_order_remark returns a set (%): not supported here, nothing changed', v_ret; end if;

  -- 1. the ORIGINAL function keeps its body untouched; it is renamed, pinned to search_path public, and made callable by service_role only
  execute 'alter function public.append_order_remark(text, text, text, text) rename to append_order_remark_impl';
  execute 'alter function public.append_order_remark_impl(text, text, text, text) set search_path = public';
  execute 'revoke execute on function public.append_order_remark_impl(text, text, text, text) from public, anon, authenticated';
  execute 'grant execute on function public.append_order_remark_impl(text, text, text, text) to service_role';

  -- 2. a guarded SECURITY DEFINER wrapper takes over the old name, signature, parameter names and return type
  execute format($f$
    create function public.append_order_remark(p_order_id text, p_manual_order_number text, p_text text, p_author text)
    returns %s language plpgsql security definer set search_path = public as $b$
    declare v_store text;
    begin
      if auth.role() is distinct from 'service_role' then
        select os.store_id::text into v_store from public.order_statuses os
         where (p_order_id is not null and os.order_id::text = p_order_id)
            or (p_manual_order_number is not null and os.manual_order_number::text = p_manual_order_number)
         limit 1;
        if v_store is null or not public.has_store_access(v_store) then raise exception 'forbidden' using errcode = '42501'; end if;
      end if;
      %s public.append_order_remark_impl(p_order_id, p_manual_order_number, p_text, p_author);
    end $b$ $f$, v_ret, case when v_ret = 'void' then 'perform' else 'return' end);
  execute 'revoke execute on function public.append_order_remark(text, text, text, text) from public, anon';
  execute 'grant execute on function public.append_order_remark(text, text, text, text) to authenticated, service_role';
end $$;

-- ---------------------------------------------------------------- get_next_local_order_number
-- get_next_local_order_number: guard on p_store_id.
do $$
declare v_oid oid; v_ret text; v_args text;
begin
  select p.oid, pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid) into v_oid, v_ret, v_args
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'get_next_local_order_number';
  if v_oid is null then raise exception 'get_next_local_order_number not found: nothing changed'; end if;
  -- re-run safety: if the original was already wrapped, do nothing (never rename a wrapper into _impl, never lose the original body)
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_next_local_order_number_impl') then
    raise notice 'get_next_local_order_number: already applied, skipped';
    return;
  end if;
  if v_args <> 'p_store_id uuid' then raise exception 'get_next_local_order_number has an unexpected signature (%): nothing changed', v_args; end if;
  if v_ret like 'SETOF%' or v_ret like 'TABLE%' then raise exception 'get_next_local_order_number returns a set (%): not supported here, nothing changed', v_ret; end if;

  -- 1. the ORIGINAL function keeps its body untouched; it is renamed, pinned to search_path public, and made callable by service_role only
  execute 'alter function public.get_next_local_order_number(uuid) rename to get_next_local_order_number_impl';
  execute 'alter function public.get_next_local_order_number_impl(uuid) set search_path = public';
  execute 'revoke execute on function public.get_next_local_order_number_impl(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.get_next_local_order_number_impl(uuid) to service_role';

  -- 2. a guarded SECURITY DEFINER wrapper takes over the old name, signature, parameter names and return type
  execute format($f$
    create function public.get_next_local_order_number(p_store_id uuid)
    returns %s language plpgsql security definer set search_path = public as $b$
    begin
      if auth.role() is distinct from 'service_role' then
        if not public.has_store_access(p_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
      end if;
      %s public.get_next_local_order_number_impl(p_store_id);
    end $b$ $f$, v_ret, case when v_ret = 'void' then 'perform' else 'return' end);
  execute 'revoke execute on function public.get_next_local_order_number(uuid) from public, anon';
  execute 'grant execute on function public.get_next_local_order_number(uuid) to authenticated, service_role';
end $$;

-- ---------------------------------------------------------------- delete_store_cascade
-- delete_store_cascade: allowed for the service role, a creator, or the store OWNER (stores.user_id = auth.uid()); team members are refused. What it deletes is unchanged.
-- It does NOT yet clean the newer tables: store_themes, store_custom_domains, store_orders, store_order_items, store_order_events, store_products,
-- store_newsletter_subscribers, store_performance_events, merchant_notifications and anything else with a store_id. Left alone on purpose (see the report).
do $$
declare v_oid oid; v_ret text; v_args text;
begin
  select p.oid, pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid) into v_oid, v_ret, v_args
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'delete_store_cascade';
  if v_oid is null then raise exception 'delete_store_cascade not found: nothing changed'; end if;
  -- re-run safety: if the original was already wrapped, do nothing (never rename a wrapper into _impl, never lose the original body)
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'delete_store_cascade_impl') then
    raise notice 'delete_store_cascade: already applied, skipped';
    return;
  end if;
  if v_args <> 'p_store_id uuid' then raise exception 'delete_store_cascade has an unexpected signature (%): nothing changed', v_args; end if;
  if v_ret like 'SETOF%' or v_ret like 'TABLE%' then raise exception 'delete_store_cascade returns a set (%): not supported here, nothing changed', v_ret; end if;

  -- 1. the ORIGINAL function keeps its body untouched; it is renamed, pinned to search_path public, and made callable by service_role only
  execute 'alter function public.delete_store_cascade(uuid) rename to delete_store_cascade_impl';
  execute 'alter function public.delete_store_cascade_impl(uuid) set search_path = public';
  execute 'revoke execute on function public.delete_store_cascade_impl(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.delete_store_cascade_impl(uuid) to service_role';

  -- 2. a guarded SECURITY DEFINER wrapper takes over the old name, signature, parameter names and return type
  execute format($f$
    create function public.delete_store_cascade(p_store_id uuid)
    returns %s language plpgsql security definer set search_path = public as $b$
    begin
      if auth.role() is distinct from 'service_role' then
        if not (public.is_creator() or public.is_store_owner(p_store_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
      end if;
      %s public.delete_store_cascade_impl(p_store_id);
    end $b$ $f$, v_ret, case when v_ret = 'void' then 'perform' else 'return' end);
  execute 'revoke execute on function public.delete_store_cascade(uuid) from public, anon';
  execute 'grant execute on function public.delete_store_cascade(uuid) to authenticated, service_role';
end $$;

-- ---------------------------------------------------------------- protect_profile_privileged_fields
-- Moved to stage4c5-profiles.sql (one place only): that file replaces the whole function (search_path, service-role bypass, no self-promotion).

-- ---------------------------------------------------------------- next_store_order_number
-- Checked from the worker code (allocateOrderNumber, called only with the service key; it guesses the parameter name): behaviour is an atomic
-- counter for NATIVE store orders, owned by the invoker, authenticated-only today. Left as it is. Its caller list is the worker only; if you want
-- it service_role-only later, that is a one-line revoke from authenticated, but stage 4a deliberately keeps authenticated execute.

-- ============================== VERIFY (read-only)
-- select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('append_order_remark','append_order_remark_impl','get_next_local_order_number','get_next_local_order_number_impl',
--                   'delete_store_cascade','delete_store_cascade_impl');
--   -- expect wrappers: prosecdef true, search_path=public; *_impl: search_path=public
-- select has_function_privilege('authenticated', 'public.append_order_remark_impl(text,text,text,text)', 'execute');   -- expect false
-- As an admin of store A calling rpc append_order_remark for an order of store B must raise 'forbidden'; for own order it works.

-- ============================== ROLLBACK (restores the original functions exactly)
-- drop function public.append_order_remark(text, text, text, text);
-- alter function public.append_order_remark_impl(text, text, text, text) rename to append_order_remark;
-- alter function public.append_order_remark(text, text, text, text) reset search_path;
-- grant execute on function public.append_order_remark(text, text, text, text) to public, anon, authenticated, service_role;
--
-- drop function public.get_next_local_order_number(uuid);
-- alter function public.get_next_local_order_number_impl(uuid) rename to get_next_local_order_number;
-- alter function public.get_next_local_order_number(uuid) reset search_path;
-- grant execute on function public.get_next_local_order_number(uuid) to public, anon, authenticated, service_role;
--
-- drop function public.delete_store_cascade(uuid);
-- alter function public.delete_store_cascade_impl(uuid) rename to delete_store_cascade;
-- alter function public.delete_store_cascade(uuid) reset search_path;
-- grant execute on function public.delete_store_cascade(uuid) to public, anon, authenticated, service_role;
