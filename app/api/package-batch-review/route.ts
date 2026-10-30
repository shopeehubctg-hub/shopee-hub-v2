import {inventoryAccess,inventoryResponseError} from '../inventory-skus/access';
import {projectProducts,productName} from '../inventory-skus/catalog';
import {findExport} from '../packages/pricing-evidence';
import {BERLANCO_CATALOG_STORE} from '../../inventory-catalog-model';
import type {BatchPackage} from '../../package-batch-model';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const b=await request.json(),storeId=String(b.storeId??''),{db,member}=await inventoryAccess(storeId);
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>500||JSON.stringify(b.rows).length>3000000)throw Error('Review between 1 and 500 packages.');
 const products=await projectProducts(db,member.tenantId,storeId),snapshots=new Map();
 const rows:BatchPackage[]=[];
 for(const original of b.rows as BatchPackage[]){const row=structuredClone(original);if(row.fileStoreId&&row.fileStoreId!==storeId)throw Error('This file belongs to a different store. Select its original store before uploading.');
  if(!Array.isArray(row.items)||row.items.length>20)throw Error('Use up to 20 inventory items per package.');
  row.catalogRequired=storeId===BERLANCO_CATALOG_STORE;
  row.items=row.items.map(i=>({sku:String(i.sku??'').trim(),quantity:String(i.quantity??''),name:productName(products,String(i.sku??''),i.name??''),uiKey:crypto.randomUUID()}));
  delete row.exportSnapshot;
  if(row.exportId){if(!snapshots.has(row.exportId))snapshots.set(row.exportId,await findExport(db,member.tenantId,storeId,row.exportId));row.exportSnapshot=snapshots.get(row.exportId);}
  rows.push(row);
 }
 return Response.json({rows,products},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return inventoryResponseError(error);}}
