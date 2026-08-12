create function public.co_fund_vouchers_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.co_fund_vouchers_set_updated_at() from public;

create trigger co_fund_vouchers_set_updated_at
before update on public.co_fund_vouchers
for each row
execute function public.co_fund_vouchers_set_updated_at();
