-- STAGE 4d: anon grants cleanup (the final sweep). RISK: medium (public pages: landing, pricing, contact form, password reset).
-- Run LAST, after every table above is done. Needs stage 0.
-- Apply, then smoke-test BOTH production ERP and the dev preview as a LOGGED-OUT visitor: landing page, pricing (plans/addons), contact
-- form submit (TEST message), forgot-password / OTP, login; then logged in: Home, Orders, Booked, Returns, Online Store, Meta Connect,
-- Settings, Team. On breakage run the ROLLBACK block immediately.
--
-- GRANT-BACK LIST (the only things anon keeps, from the code audit and the "fine / intended" list):
--   SELECT  plans, addons, release_notes, address_abbreviations, address_reference, block_hints     (public read data; RLS still applies)
--   INSERT  contact_submissions, password_reset_requests                                              (public forms)
-- Everything else loses all privileges for anon, on all tables and all sequences in schema public.
-- NEEDS-CHECK: Q9 shows the current anon privileges per table. If a table is missing from the grant-back list but an anonymous page needs
-- it, add one grant line (and tell me). The worker handles OTP / password reset with the service key; the browser (anon) only needs the two
-- INSERT tables if the page writes them directly: contact_submissions is inserted from the browser (Contact page); password_reset_requests
-- is kept per the intended list.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.plans, public.addons, public.release_notes, public.address_abbreviations, public.address_reference, public.block_hints to anon;
grant insert on public.contact_submissions, public.password_reset_requests to anon;

-- sequences used by the two insert tables (serial / identity), only if they have any:
do $$ declare r record; begin
  for r in
    select c.table_name, c.column_name from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in ('contact_submissions','password_reset_requests')
      and pg_get_serial_sequence('public.' || c.table_name, c.column_name) is not null
  loop
    execute format('grant usage on sequence %s to anon', pg_get_serial_sequence('public.' || r.table_name, r.column_name));
  end loop;
end $$;

-- VERIFY (read-only)
-- select table_name, string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' group by 1;
--   -- expect only the 8 tables listed above

-- ============================== ROLLBACK (stage 4d) ==============================
-- Restores the Supabase default anon privileges on everything that exists in schema public (RLS policies decide row access again):
-- grant all on all tables in schema public to anon;
-- grant all on all sequences in schema public to anon;
