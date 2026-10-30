export const BERLANCO_CATALOG_STORE='shopee-berlanco-beauty-official';
export type InventoryProduct={sku:string;name:string};
export type StoredInventoryProduct=InventoryProduct & {store_id:string|null;active:boolean};
export class InventoryCatalogError extends Error {code='INVENTORY_CATALOG_CONFLICT';}
export function catalogProducts(items:{inventorySku:string;name:string}[]):InventoryProduct[]{
 if(!items.length||items.length>100)throw new InventoryCatalogError('Use between 1 and 100 inventory items.');
 const products=new Map<string,InventoryProduct>();
 for(const item of items){const sku=item.inventorySku.trim(),name=item.name.trim(),key=sku.toLowerCase();
  if(!sku||sku.length>200||!name||name.length>300)throw new InventoryCatalogError('Each inventory item needs a SKU (up to 200 characters) and Product Name (up to 300 characters).');
  const prior=products.get(key);if(prior&&(prior.sku!==sku||prior.name!==name))throw new InventoryCatalogError(`Inventory SKU ${sku} has inconsistent names or letter case. Select one saved product.`);
  products.set(key,{sku,name});
 }return [...products.values()].sort((a,b)=>a.sku.localeCompare(b.sku));
}
export function newCatalogProducts(existing:StoredInventoryProduct[],incoming:InventoryProduct[],storeId:string){
 return incoming.filter(product=>{const matches=existing.filter(e=>e.sku.toLowerCase()===product.sku.toLowerCase());
  if(!matches.length)return true;
  if(matches.length!==1||matches[0].store_id!==storeId||!matches[0].active)throw new InventoryCatalogError(`Inventory SKU ${product.sku} is unavailable for this project. Use a different SKU.`);
  if(matches[0].sku!==product.sku||matches[0].name!==product.name)throw new InventoryCatalogError(`Inventory SKU ${product.sku} is saved as "${matches[0].name}". Select the saved product; its name will not be overwritten.`);
  return false;
 });
}
