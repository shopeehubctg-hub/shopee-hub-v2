import {sql} from 'drizzle-orm';
import type {getDb} from '../../../db';
import {BERLANCO_CATALOG_STORE,type InventoryProduct} from '../../inventory-catalog-model';
type DB=Pick<Awaited<ReturnType<typeof getDb>>,'execute'>;
export async function projectProducts(db:DB,tenantId:string,storeId:string):Promise<InventoryProduct[]>{
 if(storeId!==BERLANCO_CATALOG_STORE)return [];
 return Array.from(await db.execute(sql`select id,sku,name from public.inventory_skus where tenant_id=${tenantId} and store_id=${storeId} and active=true order by lower(sku),sku limit 1000`)) as InventoryProduct[];
}
export function productName(products:InventoryProduct[],sku:string,name?:string){const match=products.find(p=>p.sku===sku.trim());return match&&(!name?.trim()||name.trim().toLowerCase()===sku.trim().toLowerCase())?match.name:name??sku;}
