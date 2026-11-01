-- Run only after both delegated migrations, against isolated Staging. All fixtures roll back.
begin;
insert into public.tenants(id,name,active) values('qc-store-delegate','QC Store delegate',true),('qc-store-foreign','QC foreign',true);
insert into public.customer_users(id,email,tenant_id,display_name,role,active,module_access_mode,store_access_mode,can_manage_permissions,permissions_version)
 values(-980128,'qc-store-delegate@example.invalid','qc-store-delegate','QC delegate','customer',true,'role_default','selected',true,0);
set local role service_role;
do $$
declare setup jsonb;details jsonb;created jsonb;again jsonb;request uuid:='e1280000-0000-4000-8000-000000000001';month text:=to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM');
begin
 setup:=jsonb_build_object('version',2,'legalEntity','QC company','effectiveMonth',month,'clientType','External','rateCard',null,'feeRule',jsonb_build_object('type','fixed','currency','MYR','basis','fixed_monthly','fixedAmount','100.00'),'inputCurrency','MYR','billingCurrency','MYR','fxPolicy','none');
 details:='{"projectLinks":[],"storeGroupLink":"","googleDriveLink":"","adsTopUpOwner":null}'::jsonb;
 created:=public.account_create_store_with_setup_v2('qc-store-delegate','qc-store-delegate@example.invalid','shopee-qc-delegated-store','QC delegated','QC delegated','MY',setup,details,request);
 if not exists(select 1 from public.user_store_access where user_id=-980128 and store_id='shopee-qc-delegated-store' and enabled) then raise exception 'QC creator access missing';end if;
 if (select permissions_version from public.customer_users where id=-980128)<>1 then raise exception 'QC permission CAS not advanced';end if;
 if (select count(*) from public.user_access_audit_log where tenant_id='qc-store-delegate' and actor_user_id=-980128)<>1 then raise exception 'QC access audit missing';end if;
 again:=public.account_create_store_with_setup_v2('qc-store-delegate','qc-store-delegate@example.invalid','shopee-qc-delegated-store','QC delegated','QC delegated','MY',setup,details,request);
 if created is distinct from again or (select permissions_version from public.customer_users where id=-980128)<>1 then raise exception 'QC replay duplicated grant/version';end if;
 perform public.account_update_store_with_setup_v2('qc-store-delegate','qc-store-delegate@example.invalid','shopee-qc-delegated-store','QC renamed','QC delegated','MY',null,details,'e1280000-0000-4000-8000-000000000002',null,null);
 update public.user_store_access set enabled=false where user_id=-980128 and store_id='shopee-qc-delegated-store';
 begin
  perform public.account_update_store_with_setup_v2('qc-store-delegate','qc-store-delegate@example.invalid','shopee-qc-delegated-store','Forbidden','QC delegated','MY',null,details,'e1280000-0000-4000-8000-000000000003',null,null);
  raise exception 'QC disabled grant accepted';
 exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 begin
  perform public.account_create_store_with_setup_v2('qc-store-foreign','qc-store-delegate@example.invalid','shopee-qc-cross-tenant','Foreign','Foreign','MY',setup,details,'e1280000-0000-4000-8000-000000000004');
  raise exception 'QC cross tenant accepted';
 exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 update public.customer_users set can_manage_permissions=false where id=-980128;
 begin
  perform public.account_create_store_with_setup_v2('qc-store-delegate','qc-store-delegate@example.invalid','shopee-qc-revoked','Revoked','Revoked','MY',setup,details,'e1280000-0000-4000-8000-000000000005');
  raise exception 'QC revoked capability accepted';
 exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 update public.customer_users set can_manage_permissions=true where id=-980128;
 begin
  perform public.account_create_store_with_setup_v2('qc-store-delegate','qc-store-delegate@example.invalid','shopee-qc-late-failure','Late failure','Late failure','MY',setup,'{"projectLinks":"invalid"}'::jsonb,'e1280000-0000-4000-8000-000000000006');
  raise exception 'QC late invalid details accepted';
 exception when others then if sqlerrm<>'STORE_DETAILS_INVALID' then raise;end if;end;
 if exists(select 1 from public.stores where id='shopee-qc-late-failure') or exists(select 1 from public.user_store_access where store_id='shopee-qc-late-failure') then raise exception 'QC partial store/access leaked';end if;
 if (select permissions_version from public.customer_users where id=-980128)<>1 then raise exception 'QC failed transaction advanced permissions';end if;
end $$;
reset role;
rollback;
