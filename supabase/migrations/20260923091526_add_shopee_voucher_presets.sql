create table public.store_voucher_presets (
  store_id text primary key references public.stores(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  source_store_name text not null,
  non_campaign_average numeric(5,2) not null check (non_campaign_average between 0 and 100),
  campaign_average numeric(5,2) not null check (campaign_average between 0 and 100),
  non_campaign_rate smallint not null check (non_campaign_rate between 0 and 100),
  campaign_rate smallint not null check (campaign_rate between 0 and 100),
  source_sheet_id text not null,
  source_tab text not null default 'Final',
  source_row integer not null check (source_row > 1),
  source_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index store_voucher_presets_tenant_id_idx
  on public.store_voucher_presets (tenant_id);

alter table public.store_voucher_presets enable row level security;

revoke all on table public.store_voucher_presets from anon, authenticated;
grant select, insert, update, delete on table public.store_voucher_presets to service_role;

create policy store_voucher_presets_service_role_only
  on public.store_voucher_presets
  for all
  to service_role
  using (true)
  with check (true);

insert into public.store_voucher_presets (
  store_id, tenant_id, source_store_name,
  non_campaign_average, campaign_average,
  non_campaign_rate, campaign_rate,
  source_sheet_id, source_tab, source_row,
  source_updated_at, updated_at
) values
  ('shopee-agepros-by-swissmed','j-packaging','AgePros By Swissmed',15.62,20.05,16,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',2,now(),now()),
  ('shopee-berlanco-beauty-official','j-packaging','Berlanco Beauty Official',14.08,19.36,15,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',3,now(),now()),
  ('shopee-beyoute-official-store','j-packaging','Beyoute Official Store',15.20,20.65,16,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',4,now(),now()),
  ('shopee-biotech-by-swissmed','j-packaging','BioTech by Swissmed',15.75,19.08,16,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',5,now(),now()),
  ('shopee-naturelish-bugucare-by-ctg4u','j-packaging','Naturelish Bugucare by CTG4u',15.83,22.19,16,23,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',6,now(),now()),
  ('shopee-ctg4u-malaysia','j-packaging','CTG4u Malaysia',14.65,20.15,15,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',7,now(),now()),
  ('shopee-dr-smile-whitening-by-ctg4u','j-packaging','Dr Smile Whitening by CTG4u',10.00,19.82,10,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',8,now(),now()),
  ('shopee-naturelish-eco-plus-by-ctg4u','j-packaging','Naturelish Eco Plus by CTG4u',17.61,26.16,18,27,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',9,now(),now()),
  ('shopee-funffy-by-ctg4u','j-packaging','Funffy by CTG4u',15.00,18.65,15,19,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',10,now(),now()),
  ('shopee-goherb-official-store','j-packaging','GoHerb Official Store',14.51,20.21,15,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',11,now(),now()),
  ('shopee-naturelish-isokae-by-ctg4u','j-packaging','Naturelish Isokae by CTG4u',15.51,19.88,16,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',12,now(),now()),
  ('shopee-jeeroul-by-ctg4u','j-packaging','Jeeroul by CTG4u',15.00,21.39,15,22,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',13,now(),now()),
  ('shopee-jourish-natural-wellness','j-packaging','Jourish Natural Wellness',14.02,14.89,15,15,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',14,now(),now()),
  ('shopee-kata-skincare-malaysia','j-packaging','Kata Skincare Malaysia',15.02,19.79,16,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',15,now(),now()),
  ('shopee-livact-official-store','j-packaging','LivAct Official Store',15.01,20.30,16,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',16,now(),now()),
  ('shopee-m-skinpro-by-ctg4u','j-packaging','M+ SkinPro by CTG4u',15.00,20.62,15,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',17,now(),now()),
  ('shopee-mcs-skincare-by-ctg4u','j-packaging','MCS Skincare by CTG4u',14.38,19.50,15,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',18,now(),now()),
  ('shopee-mformula-official','j-packaging','MFormula Official',14.02,20.14,15,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',19,now(),now()),
  ('shopee-master-nerv-official-store','j-packaging','Master Nerv Official Store',15.06,23.07,16,24,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',20,now(),now()),
  ('shopee-mizino-official-store','j-packaging','Mizino Official Store',14.14,18.99,15,19,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',21,now(),now()),
  ('shopee-mizino-premium','j-packaging','Mizino Premium',14.02,19.26,15,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',22,now(),now()),
  ('shopee-moesie-malaysia','j-packaging','Moesie',14.03,18.87,15,19,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',23,now(),now()),
  ('shopee-ninoko-official-store','j-packaging','NINOKO Official Store',14.07,22.51,15,23,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',24,now(),now()),
  ('shopee-nomoq-by-ctg4u','j-packaging','NomoQ by CTG4u',13.78,18.69,14,19,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',25,now(),now()),
  ('shopee-naturelish-recovit-by-ctg4u','j-packaging','NatureLish Recovit by CTG4u',15.28,22.92,16,23,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',26,now(),now()),
  ('shopee-scale-gem-collagen-by-ctg4u','j-packaging','Scale Gem Collagen by CTG4u',13.23,21.22,14,22,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',27,now(),now()),
  ('shopee-scale-story-official-store','j-packaging','Scale Story Official Store',13.91,20.88,14,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',28,now(),now()),
  ('shopee-skindae-my-by-ctg4u','j-packaging','SkinDae MY by CTG4u',14.62,20.11,15,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',29,now(),now()),
  ('shopee-supu','j-packaging','SUPU • 食补',9.00,20.00,9,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',30,now(),now()),
  ('shopee-true-golden-care-by-naturelish','j-packaging','True Golden Care by Naturelish',14.71,20.53,15,21,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',31,now(),now()),
  ('shopee-naturelish-uro360-by-ctg4u','j-packaging','Naturelish Uro360 by CTG4u',15.02,19.85,16,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',32,now(),now()),
  ('shopee-yuan-chuan-tang-herbal-by-ctg4u','j-packaging','Yuan Chuan Tang Herbal by CTG4u',14.17,19.86,15,20,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',33,now(),now()),
  ('shopee-zeero-skincare-official','j-packaging','Zeero Skincare Official',13.81,18.52,14,19,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',34,now(),now()),
  ('shopee-ilady-haircare-by-ctg4u','j-packaging','iLady Haircare by CTG4u',15.44,21.65,16,22,'1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k','Final',35,now(),now())
on conflict (store_id) do update set
  tenant_id = excluded.tenant_id,
  source_store_name = excluded.source_store_name,
  non_campaign_average = excluded.non_campaign_average,
  campaign_average = excluded.campaign_average,
  non_campaign_rate = excluded.non_campaign_rate,
  campaign_rate = excluded.campaign_rate,
  source_sheet_id = excluded.source_sheet_id,
  source_tab = excluded.source_tab,
  source_row = excluded.source_row,
  source_updated_at = excluded.source_updated_at,
  updated_at = excluded.updated_at;
