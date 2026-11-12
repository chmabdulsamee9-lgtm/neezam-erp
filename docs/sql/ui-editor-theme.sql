-- Master Dashboard > UI Editor: one row ("global") holding the draft and the published (live) look tokens.
-- Everybody signed in reads it (the app applies "live" at start-up); only the creator writes it. No anon access.
-- New table: RLS + service_role policy + explicit grants in the same file (standing rule).

create table if not exists public.app_theme_settings (
  id text primary key default 'global',
  draft jsonb not null default '{}'::jsonb,
  live jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_theme_settings enable row level security;
drop policy if exists ne_app_theme_service on public.app_theme_settings;
drop policy if exists ne_app_theme_read on public.app_theme_settings;
drop policy if exists ne_app_theme_write on public.app_theme_settings;
create policy ne_app_theme_service on public.app_theme_settings for all to service_role using (true) with check (true);
create policy ne_app_theme_read on public.app_theme_settings for select to authenticated using (true);
create policy ne_app_theme_write on public.app_theme_settings for all to authenticated using (public.is_creator()) with check (public.is_creator());
revoke all on public.app_theme_settings from anon, authenticated;
grant select, insert, update on public.app_theme_settings to authenticated;
grant all on public.app_theme_settings to service_role;
insert into public.app_theme_settings (id) values ('global') on conflict (id) do nothing;

-- VERIFY: select id, draft, live from public.app_theme_settings;  -- one row, {} and {}
-- ROLLBACK: drop table if exists public.app_theme_settings;
