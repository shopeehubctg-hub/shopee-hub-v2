-- Keep deleted packages and their versions/audit history, but remove them from
-- active listings and allow the store to reuse their listing SKU.
alter table public.packages add column if not exists deleted_at timestamptz;
alter table public.packages add column if not exists deleted_by text;

drop index if exists public.package_sku_store_idx;
create unique index package_sku_store_idx
  on public.packages (store_id, package_sku) where deleted_at is null;

-- Draft versions are never sent to the Google Sheet.
alter table public.package_versions drop constraint package_versions_sync_status_check;
alter table public.package_versions add constraint package_versions_sync_status_check
  check (sheet_sync_status in ('not_sent', 'pending', 'synced', 'failed'));
alter table public.package_versions alter column sheet_sync_status set default 'not_sent';
