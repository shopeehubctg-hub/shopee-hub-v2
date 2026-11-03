-- INDEPENDENT STAGING ubjfuveoqbvouryldqfu ONLY. Parent reviews this rollback result before a separate explicit COMMIT.
-- Only the two user-confirmed SkinDae Store IDs are grouped. No suffix/name heuristic, Store clone or Account/grant update.
begin;
set local role service_role;
do $$
declare result jsonb;before_grants text;before_units text;before_identity text;
begin
 if not exists(select 1 from public.tenants where id='test-staging') then raise exception 'Expected independent Staging marker missing';end if;
 if not exists(select 1 from public.stores where tenant_id='j-packaging' and id='shopee-skindae-my-by-ctg4u' and platform in ('Shopee','Shopee MY'))
 or not exists(select 1 from public.stores where tenant_id='j-packaging' and id='shopee-skindae-sg' and platform='Shopee SG') then raise exception 'Confirmed SkinDae identity changed';end if;
 select md5(string_agg(row(user_id,store_id,enabled,service_access_version)::text,'|' order by user_id,store_id)) into before_grants from public.user_store_access;
 select md5(string_agg(id::text,'|' order by id)) into before_units from public.account_billing_unit_versions;
 select md5(string_agg(row(id,tenant_id,name,display_name,platform,bigseller_name,service_status,service_status_version)::text,'|' order by id)) into before_identity from public.stores;
 result:=public.save_store_project('j-packaging','shopeehub.ctg@gmail.com',null,
  '{"name":"SkinDae","markets":[{"market":"MY","enabled":true,"storeIds":["shopee-skindae-my-by-ctg4u"]},{"market":"SG","enabled":true,"storeIds":["shopee-skindae-sg"]}],"newStores":[]}',
  0,md5('stage-project:skindae:2026-11-03')::uuid);
 if (select count(*) from public.stores where tenant_id='j-packaging' and project_id=(result->>'id')::uuid)<>2 then raise exception 'SkinDae grouping incomplete';end if;
 if before_grants is distinct from (select md5(string_agg(row(user_id,store_id,enabled,service_access_version)::text,'|' order by user_id,store_id)) from public.user_store_access)
 or before_units is distinct from (select md5(string_agg(id::text,'|' order by id)) from public.account_billing_unit_versions)
 or before_identity is distinct from (select md5(string_agg(row(id,tenant_id,name,display_name,platform,bigseller_name,service_status,service_status_version)::text,'|' order by id)) from public.stores) then raise exception 'Grouping changed access/Account/Store identity';end if;
 perform set_config('store_project.review_result',result::text,true);
end $$;
select current_setting('store_project.review_result')::jsonb as saved,
 public.read_store_projects('j-packaging','shopeehub.ctg@gmail.com',false) as authorized_selector_projection;
reset role;
rollback;
