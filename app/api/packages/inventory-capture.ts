import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import type {getDb} from '../../../db';
import {catalogProducts,newCatalogProducts,type StoredInventoryProduct} from '../../inventory-catalog-model';
type Execute=Pick<Awaited<ReturnType<typeof getDb>>,'execute'>;
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
export const inventoryFingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export async function lockInventoryCatalog(tx:Execute,tenantId:string){await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}),hashtext('inventory-catalog'))`);}
export async function captureInventoryProducts(tx:Execute,tenantId:string,storeId:string,versionId:string,items:{inventorySku:string;name:string}[]){
 const incoming=catalogProducts(items);
 const keys=sql.join(incoming.map(p=>sql`${p.sku.toLowerCase()}`),sql`, `);
 const existing=await tx.execute(sql`select sku,name,store_id,active from public.inventory_skus where tenant_id=${tenantId} and lower(sku) in (${keys})`);
 const additions=newCatalogProducts(Array.from(existing) as StoredInventoryProduct[],incoming,storeId);
 for(const p of additions)await tx.execute(sql`insert into public.inventory_skus(id,tenant_id,store_id,sku,name,source,active) values(${crypto.randomUUID()},${tenantId},${storeId},${p.sku},${p.name},${'package-version:'+versionId},true)`);
 return additions.length;
}
