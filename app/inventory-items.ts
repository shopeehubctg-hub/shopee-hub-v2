export const MAX_INVENTORY_ITEMS=20;
export const inventoryKey=(value:string)=>value.trim().toLowerCase();
type SavedItem={inventorySku:string;name:string;quantity:number;kind?:string};
export const inventoryLinesUnchanged=(before:SavedItem[],after:SavedItem[])=>JSON.stringify(before.map(i=>[i.inventorySku.trim(),i.name.trim(),Number(i.quantity),i.kind??'product']))===JSON.stringify(after.map(i=>[i.inventorySku.trim(),i.name.trim(),Number(i.quantity),i.kind??'product']));
export const newInventoryMappings=(before:SavedItem[],after:SavedItem[])=>after.filter(i=>!before.some(p=>p.inventorySku.trim()===i.inventorySku.trim()&&p.name.trim()===i.name.trim()));
export function duplicateInventory(items:{inventorySku?:string;sku?:string}[]){
 const first=new Map<string,number>();
 return items.flatMap((item,index)=>{const sku=(item.inventorySku??item.sku??'').trim(),key=inventoryKey(sku);if(!key)return [];const prior=first.get(key);if(prior!==undefined)return [{index,first:prior,sku,message:`Inventory ${index+1}: SKU ${sku} is already added in item ${prior+1}. Update its quantity instead.`}];first.set(key,index);return [];});
}
