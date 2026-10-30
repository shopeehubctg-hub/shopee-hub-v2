import {sql} from 'drizzle-orm';
import {inventoryAccess,inventoryResponseError} from '../inventory-skus/access';
import {canAccessModule} from '../../module-access';
import {exportSnapshots} from '../../pricing-evidence';
import {inventoryFingerprint} from '../packages/inventory-capture';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const b=await request.json(),storeId=String(b.storeId??''),{db,member,user}=await inventoryAccess(storeId);
 if(!await canAccessModule(db,member,'calculator'))throw Object.assign(Error('Price Calculator access required.'),{status:403});
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>500||JSON.stringify(b.rows).length>3000000)throw Error('Export between 1 and 500 packages.');
 const entries=b.rows.map((r:{requestId?:string;name?:string;scenarios?:unknown})=>{
  if(!/^[0-9a-f-]{36}$/i.test(r.requestId??'')||!r.name?.trim()||r.name.length>300)throw Error('Invalid export row. Refresh and export again.');
  const scenarios=exportSnapshots({scenarios:r.scenarios}),normal=scenarios.find(v=>v.serviceScenario==='Non-Campaign Day')!,campaign=scenarios.find(v=>v.serviceScenario==='Campaign Day')!;
  const payload={name:r.name.trim(),market:'MY',currency:'MYR',normal:Number(normal.suggestedShopeePrice.toFixed(2)),campaign:Number(campaign.suggestedShopeePrice.toFixed(2)),scenarios};
  return {requestId:r.requestId!,payload,hash:inventoryFingerprint(payload)};
 });
 if(new Set(entries.map((e:{requestId:string})=>e.requestId)).size!==entries.length)throw Error('Duplicate export request rows.');
 const rows=await db.transaction(async tx=>{const result=[];for(const entry of entries){const id=crypto.randomUUID();await tx.execute(sql`insert into public.calculator_export_snapshots(id,tenant_id,store_id,actor,request_id,payload_hash,rules_version,payload) values(${id}::uuid,${member.tenantId},${storeId},${user.email},${entry.requestId}::uuid,${entry.hash},'shopee-my-2026-10',${JSON.stringify(entry.payload)}::jsonb) on conflict(tenant_id,request_id) do nothing`);
   const saved=Array.from(await tx.execute(sql`select id,actor,store_id,payload_hash,created_at,payload from public.calculator_export_snapshots where tenant_id=${member.tenantId} and request_id=${entry.requestId}::uuid`))[0] as {id:string;actor:string;store_id:string;payload_hash:string;created_at:string;payload:typeof entry.payload};
   if(!saved||saved.actor!==user.email||saved.store_id!==storeId||saved.payload_hash!==entry.hash)throw Error('This export request already contains different settings. Export again.');
   result.push({...saved.payload,id:saved.id,requestId:entry.requestId,createdAt:saved.created_at});
  }return result;});
 return Response.json({rows,storeId},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return inventoryResponseError(error);}}
