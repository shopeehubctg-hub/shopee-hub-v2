alter table public.co_fund_vouchers
  add column if not exists campaign_start_at timestamptz,
  add column if not exists campaign_end_at timestamptz;

create index if not exists co_fund_vouchers_campaign_end_at_idx
  on public.co_fund_vouchers (campaign_end_at desc);
