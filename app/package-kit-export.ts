export type KitComponent = { inventorySku:string; quantity:number };
export type KitPlatform = { platform:string; packageSku:string };
export type KitPackage = { id:string; name:string; platforms:KitPlatform[]; components:KitComponent[] };
export type KitRow = { kitSku:string; inventorySku:string; quantity:number; price:1 };

export class KitExportError extends Error {}

export function buildKitRows(packages:KitPackage[]):KitRow[] {
  if (!packages.length) throw new KitExportError("Select at least one package.");
  const rows:KitRow[]=[];
  const kitContents=new Map<string,string>();
  for (const item of packages) {
    const components=new Map<string,number>();
    if (!Array.isArray(item.components)||!item.components.length) throw new KitExportError(`${item.name} has no inventory items.`);
    for (const component of item.components) {
      const sku=typeof component.inventorySku==="string"?component.inventorySku.trim():"";
      const quantity=component.quantity;
      if (!sku||!Number.isSafeInteger(quantity)||quantity<=0) throw new KitExportError(`${item.name} has a missing inventory SKU or invalid quantity.`);
      const total=(components.get(sku)??0)+quantity;
      if (!Number.isSafeInteger(total)) throw new KitExportError(`${item.name} has an invalid total quantity for ${sku}.`);
      components.set(sku,total);
    }
    if (!Array.isArray(item.platforms)||!item.platforms.length) throw new KitExportError(`${item.name} has no platform Kit SKU.`);
    const contents=[...components].sort(([left],[right])=>left.localeCompare(right));
    const fingerprint=JSON.stringify(contents);
    for (const platform of item.platforms) {
      const kitSku=typeof platform.packageSku==="string"?platform.packageSku.trim():"";
      if (!kitSku) throw new KitExportError(`${item.name} is missing a ${platform.platform} Kit SKU.`);
      const prior=kitContents.get(kitSku);
      if (prior&&prior!==fingerprint) throw new KitExportError(`Kit SKU ${kitSku} is used by packages with different inventory items. Resolve the conflict before downloading.`);
      if (prior) continue;
      kitContents.set(kitSku,fingerprint);
      for (const [inventorySku,quantity] of components) rows.push({kitSku,inventorySku,quantity,price:1});
    }
  }
  if (rows.length>65_535) throw new KitExportError("This selection is too large for an .xls sheet. Export fewer packages at a time.");
  return rows;
}
