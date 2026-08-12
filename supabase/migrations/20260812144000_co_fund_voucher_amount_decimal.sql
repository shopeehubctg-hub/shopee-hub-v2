alter table public.co_fund_vouchers
  drop constraint co_fund_vouchers_tenant_id_store_id_campaign_name_voucher_n_key;

alter table public.co_fund_vouchers
  add column discount_amount numeric(12, 2);

update public.co_fund_vouchers
set discount_amount = discount_amount_cents / 100.0;

alter table public.co_fund_vouchers
  alter column discount_amount set not null,
  add constraint co_fund_vouchers_discount_amount_check check (discount_amount >= 0),
  drop column discount_amount_cents,
  add unique (tenant_id, store_id, campaign_name, voucher_name, discount_amount);
