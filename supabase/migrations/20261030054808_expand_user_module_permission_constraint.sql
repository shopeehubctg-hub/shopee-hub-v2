begin;

-- Keep the canonical module vocabulary aligned with save_user_access. The old
-- constraint predates the three Overview capabilities and rejected every
-- custom permission save when the RPC wrote their false/true state rows.
alter table public.user_module_permissions
  drop constraint if exists user_module_permissions_module_check;

alter table public.user_module_permissions
  add constraint user_module_permissions_module_check
  check (module_id = any (array[
    'overview'::text,
    'design'::text,
    'calculator'::text,
    'packages'::text,
    'advertising'::text,
    'orders'::text,
    'health'::text,
    'protection'::text,
    'actions'::text,
    'individual_ads'::text,
    'live_calendar'::text,
    'overview_leaderboard'::text,
    'overview_leaderboard_all_stores'::text,
    'overview_store_sales'::text
  ]));

commit;
