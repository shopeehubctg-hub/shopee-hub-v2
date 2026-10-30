import {sql} from 'drizzle-orm';
import {inventoryAccess,inventoryResponseError} from './access';
import {projectProducts} from './catalog';
import {BERLANCO_CATALOG_STORE,catalogProducts} from '../../inventory-catalog-model';
import {inventoryFingerprint,lockInventoryCatalog} from '../packages/inventory-capture';
export const dynamic='force-dynamic';
const fail=(message:string,status=409)=>Object.assign(Error(message),{status});
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams,storeId=params.get('storeId')??'',query=(params.get('q')??'').trim();
 const {db,member}=await inventoryAccess(storeId);
 if(storeId!==BERLANCO_CATALOG_STORE)return Response.json({products:[],storeId,canEdit:false},{headers:{'Cache-Control':'private, no-store'}});
 if(query.length>200)throw fail('Search with up to 200 characters.',400);
 let products=await projectProducts(db,member.tenantId,storeId);
 const sku=params.get('sku'),name=params.get('name');
 if(sku!==null||name!==null)products=products.filter(p=>p.sku.toLowerCase()===sku?.trim().toLowerCase()||p.name.toLowerCase()===name?.trim().toLowerCase());
 else if(query)products=products.filter(p=>(p.sku+' '+p.name).toLowerCase().includes(query.toLowerCase())).slice(0,100);
 return Response.json({products,storeId,canEdit:member.role==='superadmin'},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return inventoryResponseError(error);}}
export async function PATCH(request:Request){try{
 const b=await request.json();const {db,member,user}=await inventoryAccess(String(b.storeId??''));
 if(member.role!=='superadmin')throw fail('Ask your Super Admin to edit an existing product.',403);
 if(b.storeId!==BERLANCO_CATALOG_STORE)throw fail('Catalog editing is enabled for Berlanco only.',403);
 if(!/^[0-9a-f-]{36}$/i.test(b.requestId??'')||typeof b.id!=='string'||!b.expected)throw fail('Refresh the product before editing.',400);
 const [after]=catalogProducts([{inventorySku:String(b.sku??''),name:String(b.name??'')}]);
 const hash=inventoryFingerprint({id:b.id,expected:b.expected,after});
 const result=await db.transaction(async tx=>{
  await lockInventoryCatalog(tx,member.tenantId);
  const prior=Array.from(await tx.execute(sql`select actor,payload_hash,after_value from public.inventory_sku_changes where tenant_id=${member.tenantId} and request_id=${b.requestId}::uuid`))[0] as {actor:string;payload_hash:string;after_value:unknown}|undefined;
  if(prior){if(prior.actor!==user.email||prior.payload_hash!==hash)throw fail('This edit request was already used. Refresh and review the product.');return {...prior.after_value as {sku:string;name:string},id:b.id};}
  const current=Array.from(await tx.execute(sql`select id,sku,name from public.inventory_skus where id=${b.id} and tenant_id=${member.tenantId} and store_id=${b.storeId} and active=true for update`))[0] as {id:string;sku:string;name:string}|undefined;
  if(!current)throw fail('Product is unavailable for this project.',404);
  if(current.sku!==b.expected.sku||current.name!==b.expected.name)throw fail('This product has changed. Refresh it before editing.');
  const collisions=Array.from(await tx.execute(sql`select id from public.inventory_skus where tenant_id=${member.tenantId} and lower(sku)=${after.sku.toLowerCase()} and id<>${b.id}`));
  if(collisions.length)throw fail('This SKU already exists. Select that product or enter a different SKU.');
  await tx.execute(sql`update public.inventory_skus set sku=${after.sku},name=${after.name} where id=${b.id} and tenant_id=${member.tenantId} and store_id=${b.storeId}`);
  await tx.execute(sql`insert into public.inventory_sku_changes(id,tenant_id,store_id,catalog_id,actor,request_id,payload_hash,before_value,after_value) values(${crypto.randomUUID()}::uuid,${member.tenantId},${b.storeId},${b.id},${user.email},${b.requestId}::uuid,${hash},${JSON.stringify({sku:current.sku,name:current.name})}::jsonb,${JSON.stringify(after)}::jsonb)`);
  return {...after,id:b.id};
 });return Response.json({product:result},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return inventoryResponseError(error);}}
