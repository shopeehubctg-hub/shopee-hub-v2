-- Existing rows remain available; new store details are maintained in the portal.
alter table public.link_directory_stores
  alter column source_sheet_id drop not null;

alter table public.link_directory_stores
  alter column source_tab set default 'Dashboard';

alter table public.link_directory_projects
  add column if not exists google_drive_link text;
