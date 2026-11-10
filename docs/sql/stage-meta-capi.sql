-- Stage: Meta data sharing levels (Standard / Enhanced / Maximum) and the Conversions API test code.
-- STATUS: NOT APPLIED. Nothing in the worker, the storefront or the ERP needs this to exist: until it is run every store stays on Standard
-- (the worker reads these two columns in a separate guarded query, any error means "standard"), and the ERP selector shows
-- "not switched on yet". Run it only when you want to switch the feature on.
-- Run in the Supabase SQL editor, as one block. It is idempotent.

begin;

alter table public.stores
  add column if not exists meta_data_sharing text not null default 'standard',
  add column if not exists meta_capi_test_code text;

-- a named constraint so the rollback can drop it; added only when it is not there yet
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.stores'::regclass and conname = 'stores_meta_data_sharing_check') then
    alter table public.stores
      add constraint stores_meta_data_sharing_check check (meta_data_sharing in ('standard', 'enhanced', 'maximum'));
  end if;
end $$;

commit;

-- VERIFY (expect two rows, default 'standard', no store on anything else)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'stores' and column_name in ('meta_data_sharing', 'meta_capi_test_code');

select meta_data_sharing, count(*) from public.stores group by 1;

-- NOTE: the browser (anon / authenticated) roles must not read meta_capi_test_code or write either column directly. The worker uses the
-- service role. If your stores table has column-level grants, do not grant these two columns to anon / authenticated.

-- ROLLBACK (the worker and storefront go back to Standard on their own when the columns are gone)
-- begin;
-- alter table public.stores drop constraint if exists stores_meta_data_sharing_check;
-- alter table public.stores drop column if exists meta_capi_test_code;
-- alter table public.stores drop column if exists meta_data_sharing;
-- commit;
