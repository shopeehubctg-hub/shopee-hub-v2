-- Map existing Shopee stores by their exact Dashboard names. Additional aliases
-- below cover the brand names used by weekly reports. Unknown names remain private.
insert into public.fake_seller_brands(tenant_id,brand_key,brand_name,store_id)
select tenant_id,lower(regexp_replace(name,'[^[:alnum:]]','','g')),name,id
from public.stores
where platform ilike '%shopee%'
on conflict (tenant_id,brand_key,store_id) do nothing;

insert into public.fake_seller_brands(tenant_id,brand_key,brand_name,store_id)
select s.tenant_id,a.brand_key,a.brand_name,s.id
from (values
  ('shopee-dr-smile-whitening-by-ctg4u','drsmile','Dr Smile'),
  ('shopee-dr-smile-whitening-by-ctg4u','drsmilewhitening','Dr Smile Whitening'),
  ('shopee-mizino-official-store','mizino','Mizino'),
  ('shopee-mizino-premium','mizino','Mizino'),
  ('shopee-moesie-malaysia','moesie','Moesie'),
  ('shopee-ninoko-official-store','ninoko','NINOKO'),
  ('shopee-berlanco-beauty-official','berlanco','Berlanco'),
  ('shopee-bonlife-official-store','bonlife','Bonlife'),
  ('shopee-skindae-my-by-ctg4u','skindae','SkinDae'),
  ('shopee-skindae-sg','skindae','SkinDae')
) as a(store_id,brand_key,brand_name)
join public.stores s on s.id=a.store_id
on conflict (tenant_id,brand_key,store_id) do nothing;
