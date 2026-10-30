export const MAX_INVENTORY_ITEMS=20;
export const inventoryKey=(value:string)=>value.trim().toLowerCase();
export function duplicateInventory(items:{inventorySku?:string;sku?:string}[]){
 const first=new Map<string,number>();
 return items.flatMap((item,index)=>{const sku=(item.inventorySku??item.sku??'').trim(),key=inventoryKey(sku);if(!key)return [];const prior=first.get(key);if(prior!==undefined)return [{index,first:prior,sku,message:`Inventory ${index+1}: SKU ${sku} is already added in item ${prior+1}. Update its quantity instead.`}];first.set(key,index);return [];});
}
