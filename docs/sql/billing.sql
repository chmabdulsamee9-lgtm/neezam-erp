-- Plan checkout: gateway + bank transfer payments, promo codes, trials (Nov 2026). Additive, safe to run twice.
-- Every billing table is service-role only: the browser goes through the worker (billing.js).

create table if not exists public.billing_settings (
  id int primary key default 1 check (id = 1),
  rapid_enabled boolean not null default false,
  rapid_mode text not null default 'TEST' check (rapid_mode in ('TEST','LIVE')),
  rapid_merchant_id text,
  bank_enabled boolean not null default false,
  bank_details jsonb not null default '{}'::jsonb,
  notify_email text not null default 'support@eneezam.com',
  grace_days int not null default 3 check (grace_days between 0 and 30),
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (1) on conflict do nothing;

create table if not exists public.billing_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  kind text not null check (kind in ('trial','percent')),
  trial_days int check (trial_days between 1 and 90),
  percent int check (percent between 1 and 90),
  plan_id uuid references public.plans(id),
  max_uses int check (max_uses > 0),
  used_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  check ((kind = 'trial' and trial_days is not null) or (kind = 'percent' and percent is not null))
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null,
  plan_id uuid not null references public.plans(id),
  promo_id uuid references public.billing_promo_codes(id) on delete set null,
  promo_code text,
  method text not null check (method in ('rapid','bank')),
  environment text not null default 'LIVE' check (environment in ('TEST','LIVE')),
  list_amount int not null,
  discount int not null default 0,
  amount int not null check (amount > 0),
  status text not null check (status in ('pending','submitted','paid','failed','rejected','review')),
  basket_id text unique,
  gateway_ref text,
  proof_path text,
  reference text,
  note text,
  reviewed_by uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_payments_store_idx on public.billing_payments (store_id, created_at desc);
create index if not exists billing_payments_status_idx on public.billing_payments (status, created_at desc);
-- one bank transfer waiting for review per store
create unique index if not exists billing_payments_one_submitted on public.billing_payments (store_id) where status = 'submitted';

create table if not exists public.billing_redemptions (
  promo_id uuid not null references public.billing_promo_codes(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_id uuid references public.billing_payments(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (promo_id, store_id)
);

-- stores without a row here (every store before this change) are never locked or reminded
create table if not exists public.store_billing (
  store_id uuid primary key references public.stores(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status text not null check (status in ('trial','active')),
  period_start timestamptz not null default now(),
  period_end timestamptz not null,
  trial_used boolean not null default false,
  trial_phone text,
  reminded_for timestamptz,
  expired_mail_for timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  event_id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['billing_settings','billing_promo_codes','billing_payments','billing_redemptions','store_billing','billing_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- the plan goes onto the store's subscription and the owner's account is opened
create or replace function public.billing_apply_plan(p_store uuid, p_user uuid, p_plan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_key text; v_sub uuid;
begin
  select eneezam_id into v_key from stores where id = p_store;
  if v_key is null then raise exception 'store has no eneezam_id'; end if;
  select id into v_sub from store_subscriptions where store_id = v_key
    order by (status = 'approved') desc, approved_at desc nulls last, created_at desc limit 1;
  if v_sub is null then
    insert into store_subscriptions (store_id, plan_id, status, approved_at) values (v_key, p_plan, 'approved', now());
  else
    update store_subscriptions set plan_id = p_plan, status = 'approved', approved_at = now(), reminder_enabled = false where id = v_sub;
  end if;
  update profiles set approved = true where id = p_user and role = 'admin' and approved is distinct from true;
end $$;

-- idempotent: a payment is applied once, however many times the webhook or the approve button fires
create or replace function public.billing_mark_paid(p_payment uuid, p_ref text, p_reviewer uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p billing_payments; b store_billing; v_from timestamptz;
begin
  select * into p from billing_payments where id = p_payment for update;
  if p.id is null then return 'not_found'; end if;
  if p.status = 'paid' then return 'already'; end if;
  update billing_payments set status = 'paid', paid_at = now(), updated_at = now(),
    gateway_ref = coalesce(p_ref, gateway_ref), reviewed_by = coalesce(p_reviewer, reviewed_by) where id = p.id;
  if p.environment = 'TEST' then return 'test'; end if; -- sandbox money never opens a plan
  perform pg_advisory_xact_lock(hashtext(p.store_id::text));
  select * into b from store_billing where store_id = p.store_id for update;
  v_from := now();
  if b.store_id is not null and b.period_end > now() and (b.status = 'trial' or b.plan_id = p.plan_id) then v_from := b.period_end; end if;
  insert into store_billing (store_id, plan_id, status, period_start, period_end)
    values (p.store_id, p.plan_id, 'active', now(), v_from + interval '1 month')
    on conflict (store_id) do update set plan_id = excluded.plan_id, status = 'active', period_start = now(),
      period_end = excluded.period_end, updated_at = now();
  if p.promo_id is not null then
    insert into billing_redemptions (promo_id, store_id, payment_id) values (p.promo_id, p.store_id, p.id) on conflict do nothing;
    if found then update billing_promo_codes set used_count = used_count + 1 where id = p.promo_id; end if;
  end if;
  perform billing_apply_plan(p.store_id, p.user_id, p.plan_id);
  return 'activated';
end $$;

create or replace function public.billing_start_trial(p_store uuid, p_user uuid, p_plan uuid, p_code text, p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare c billing_promo_codes; v_phone text := nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '');
begin
  select * into c from billing_promo_codes where code = upper(p_code) for update;
  if c.id is null or c.kind <> 'trial' or not c.active then return 'invalid'; end if;
  if c.expires_at is not null and c.expires_at < now() then return 'expired'; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return 'used_up'; end if;
  if c.plan_id is not null and c.plan_id <> p_plan then return 'wrong_plan'; end if;
  perform pg_advisory_xact_lock(hashtext(p_store::text));
  if exists (select 1 from store_billing where store_id = p_store) then return 'trial_used'; end if;
  if v_phone is not null and exists (select 1 from store_billing where trial_phone = v_phone) then return 'trial_used'; end if;
  insert into store_billing (store_id, plan_id, status, period_end, trial_used, trial_phone)
    values (p_store, p_plan, 'trial', now() + make_interval(days => c.trial_days), true, v_phone);
  insert into billing_redemptions (promo_id, store_id) values (c.id, p_store) on conflict do nothing;
  update billing_promo_codes set used_count = used_count + 1 where id = c.id;
  perform billing_apply_plan(p_store, p_user, p_plan);
  return 'activated';
end $$;

revoke all on function public.billing_apply_plan(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.billing_mark_paid(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.billing_start_trial(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.billing_apply_plan(uuid, uuid, uuid) to service_role;
grant execute on function public.billing_mark_paid(uuid, text, uuid) to service_role;
grant execute on function public.billing_start_trial(uuid, uuid, uuid, text, text) to service_role;

-- private bucket for payment screenshots (5 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('billing-proofs', 'billing-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do nothing;

-- SECURITY: until now any signed-in user could insert a subscription and any merchant (role admin) could update any store's
-- subscription, i.e. give themselves a plan. Only the creator writes from the browser (ERP code, dev and master).
drop policy if exists "Authenticated users can insert subscription requests" on public.store_subscriptions;
drop policy if exists "creator can insert store_subscriptions" on public.store_subscriptions;
drop policy if exists "creator can update store_subscriptions" on public.store_subscriptions;

-- ============================== ROLLBACK
-- create policy "Authenticated users can insert subscription requests" on public.store_subscriptions for insert to authenticated with check (true);
-- create policy "creator can insert store_subscriptions" on public.store_subscriptions for insert to authenticated with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = any (array['creator','admin'])));
-- create policy "creator can update store_subscriptions" on public.store_subscriptions for update to authenticated using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = any (array['creator','admin'])));
-- drop function public.billing_start_trial, public.billing_mark_paid, public.billing_apply_plan;
-- drop table public.billing_events, public.store_billing, public.billing_redemptions, public.billing_payments, public.billing_promo_codes, public.billing_settings;
