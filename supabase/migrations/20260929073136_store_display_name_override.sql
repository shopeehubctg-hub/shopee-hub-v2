alter table public.stores
  add column if not exists display_name text;

comment on column public.stores.display_name is
  'Admin-controlled Dashboard label. NULL uses the source store name; sheet sync must not update this column.';
