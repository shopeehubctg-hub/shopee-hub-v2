create table public.package_image_versions (
  id uuid primary key default gen_random_uuid(),
  package_version_id text not null references public.package_versions(id),
  market text not null check (market in ('MY','SG','TH','PH')),
  kind text not null check (kind in ('main','package')),
  folder_id text not null,
  project_name text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  drive_file_id text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 4000000),
  actor text not null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  unique (package_version_id, market, kind, folder_id, sha256)
);
alter table public.package_image_versions enable row level security;
revoke all on public.package_image_versions from public, anon, authenticated;
