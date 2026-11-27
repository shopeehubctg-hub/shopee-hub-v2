create schema if not exists private authorization postgres;
create table private.package_drive_oauth (
  singleton boolean primary key check (singleton),
  encrypted_token text not null
);
alter table private.package_drive_oauth enable row level security;
revoke all on table private.package_drive_oauth from public, anon, authenticated, service_role;
