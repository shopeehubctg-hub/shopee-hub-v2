-- Existing rows remain available; new store details are maintained in the portal.
alter table public.link_directory_stores
  alter column source_sheet_id drop not null;

alter table public.link_directory_projects
  add column if not exists google_drive_link text;

update public.link_directory_projects p
set google_drive_link = d.google_drive_link
from public.link_directory_stores d
where p.store_id = d.store_id and p.google_drive_link is null;

-- The two Mizino projects have different Drive folders in the source export.
update public.link_directory_projects p
set google_drive_link = 'https://drive.google.com/drive/folders/1AsCcHVv4zfbvUJ0ZO8kl2LD_BFH3dJ5D'
from public.stores s
where p.store_id = s.id and s.name = 'Mizino Premium' and p.project_name = 'Mizino SlimPro';

-- SUPU already has a registered store but its source name differs from the old export.
insert into public.link_directory_stores
  (store_id, tenant_id, store_name, ads_top_up_owner, store_group_link, google_drive_link, source_sheet_id)
select id, tenant_id, 'SUPU • 食补', 'Client', null,
  'https://drive.google.com/drive/folders/1-Fs8W3BpuCi55I1PYkw2iBGRHc9QZ1c-?usp=drive_link', null
from public.stores where lower(name) = 'supu' and tenant_id = 'j-packaging'
on conflict (store_id) do update set
  store_name = excluded.store_name,
  ads_top_up_owner = excluded.ads_top_up_owner,
  google_drive_link = excluded.google_drive_link;

insert into public.link_directory_projects
  (store_id, project_name, project_group_link, google_drive_link)
select d.store_id, 'SUPU • 食补', 'https://chat.whatsapp.com/EpxEHh0vSlBAVh6UMObtvy',
  'https://drive.google.com/drive/folders/1-Fs8W3BpuCi55I1PYkw2iBGRHc9QZ1c-?usp=drive_link'
from public.link_directory_stores d where d.store_name = 'SUPU • 食补' and d.tenant_id = 'j-packaging'
on conflict (store_id, project_name) do update set
  project_group_link = excluded.project_group_link,
  google_drive_link = excluded.google_drive_link;
