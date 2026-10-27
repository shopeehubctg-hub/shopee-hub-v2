import * as XLSX from "xlsx";
import type { KitRow } from "./package-kit-export";

export function makeKitWorkbook(rows:KitRow[]):ArrayBuffer {
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["File Version:",1,"Last Updated: 08-01-2019 19:50"]]),"Sheet1");
  const lines:Array<Array<string|number>>=[
    ["Kit SKU*","Inventory SKU*","Quantity*","Price"],
    ...rows.map(row=>[row.kitSku,row.inventorySku,row.quantity,1]),
  ];
  const kitSheet=XLSX.utils.aoa_to_sheet(lines);
  kitSheet["!cols"]=[{width:13.5},{width:16.5},{width:11},{width:11}];
  XLSX.utils.book_append_sheet(workbook,kitSheet,"Kit Products");
  return XLSX.write(workbook,{bookType:"biff8",type:"array"}) as ArrayBuffer;
}
