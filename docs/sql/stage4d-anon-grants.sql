-- STAGE 4d: anon grants cleanup (the final sweep)
-- 1. WHAT IT DOES: Revokes every privilege of anon on all tables and sequences in schema public, then grants back ONLY: SELECT on addons and plans;
--    INSERT on password_reset_requests; INSERT on contact_submissions. Grant-back list = what logged-out visitors need: the pricing
--    page reads plans / addons; the public Contact form inserts into contact_submissions with the anon key (Contact.jsx);
--    password_reset_requests is kept per the intended list (no code in either repo uses it today: the reset flow uses the worker +
--    otp_verifications).
-- 2. WHEN: AFTER everything else (last of the table steps). The new grant on contact_submissions FIXES the contact form (today anon has no
--    INSERT, so the form fails); this is a behaviour change, an anon INSERT-only grant with RLS decides the rows. Spam risk: consider
--    a worker endpoint later.
-- 3. RISK: MEDIUM (public pages: landing, pricing, contact form).
-- 4. SMOKE TEST: Logged OUT on production and dev preview: landing page, pricing (plans and add-ons show), Contact form (submit a TEST message),
--    sign-up and forgot-password (OTP mail arrives), login. Then logged in: Home, Orders, Booked, Returns, Online Store, Meta
--    Connect, Settings, Team.
-- 5. ROLLBACK: The ROLLBACK block re-grants ALL privileges on all tables / sequences to anon (the old state was broader than the grant-back
--    list and is only partly recorded in before-state-facts.md; RLS policies decide row access again).
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- GRANT-BACK LIST (anon keeps only this):
--   SELECT  public.addons, public.plans
--   INSERT  public.password_reset_requests, public.contact_submissions
-- NEEDS-CHECK: the owner's results show anon had SELECT on addons and plans, INSERT / SELECT / UPDATE on password_reset_requests. If another logged-out page
-- needs a table, add one grant line below and tell me.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.addons, public.plans to anon;
grant insert on public.password_reset_requests, public.contact_submissions to anon;

-- sequences behind the two insert tables (serial / identity), only if they have any
do $$ declare r record; begin
  for r in
    select c.table_name, c.column_name from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in ('contact_submissions','password_reset_requests')
      and pg_get_serial_sequence('public.' || c.table_name, c.column_name) is not null
  loop
    execute format('grant usage on sequence %s to anon', pg_get_serial_sequence('public.' || r.table_name, r.column_name));
  end loop;
end $$;

-- ============================== VERIFY (read-only)
-- select table_name, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--  where table_schema = 'public' and grantee = 'anon' group by 1 order by 1;   -- expect exactly addons (SELECT), plans (SELECT), password_reset_requests (INSERT), contact_submissions (INSERT)

-- ============================== ROLLBACK
-- grant all on all tables in schema public to anon;
-- grant all on all sequences in schema public to anon;
