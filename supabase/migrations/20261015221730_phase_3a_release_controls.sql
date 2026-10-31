-- Internal milestones are not production releases. No runtime flag can enable
-- unfinished execution modules; a future reviewed migration is required.
begin;
update public.company_modules set enabled=false where module='contracts' and enabled;
alter table public.company_modules add constraint unfinished_execution_modules_disabled
  check(module not in ('contracts','invoices','payments') or not enabled);
commit;
