update public.store_voucher_presets
set non_campaign_rate = round(non_campaign_average),
    campaign_rate = round(campaign_average),
    updated_at = now()
where source_sheet_id = '1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k';
