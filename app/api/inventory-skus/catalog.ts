import {sql} from 'drizzle-orm';
import type {getDb} from '../../../db';
import type {InventoryProduct} from '../../inventory-catalog-model';
type DB=Pick<Awaited<ReturnType<typeof getDb>>,'execute'>;
export async function projectProducts(db:DB,tenantId:string,storeId:string):Promise<InventoryProduct[]>{
 return Array.from(await db.execute(sql`select id,sku,name from public.inventory_skus where tenant_id=${tenantId} and store_id=${storeId} and active=true order by lower(sku),sku limit 1000`)) as InventoryProduct[];
}
export async function projectProductGroups(db:DB,tenantId:string,storeIds:string[]){
 const groups=new Map<string,InventoryProduct[]>();if(!storeIds.length)return groups;
 const ids=sql.join(storeIds.map(id=>sql`${id}`),sql`, `);
 const products=Array.from(await db.execute(sql`select store_id,id,sku,name from public.inventory_skus where tenant_id=${tenantId} and store_id in (${ids}) and active=true order by store_id,lower(sku),sku limit 20000`)) as (InventoryProduct&{store_id:string})[];
 for(const product of products){const list=groups.get(product.store_id)??[];list.push(product);groups.set(product.store_id,list);}return groups;
}
export function productName(products:InventoryProduct[],sku:string,name?:string){const match=products.find(p=>p.sku===sku.trim());return match&&(!name?.trim()||name.trim().toLowerCase()===sku.trim().toLowerCase())?match.name:name??sku;}
