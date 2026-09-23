alter table public.store_voucher_presets
  alter column non_campaign_rate type numeric(5,2) using non_campaign_rate::numeric,
  alter column campaign_rate type numeric(5,2) using campaign_rate::numeric;

update public.store_voucher_presets
set non_campaign_rate = non_campaign_average,
    campaign_rate = campaign_average,
    updated_at = now()
where source_sheet_id = '1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k';
