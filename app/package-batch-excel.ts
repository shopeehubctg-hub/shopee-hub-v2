import * as XLSX from "xlsx";
export const HEADERS = ["Package Code","Package Name","MY Original Price","MY Normal Price","MY Campaign Price","SG Original Price","SG Normal Price","SG Campaign Price","Period Type","Start Date","End Date","Campaign Months","Campaign Events","Shopee SKU","Lazada SKU","TikTok SKU"];
export const ITEM_HEADERS = ["Package Code","Inventory SKU","Quantity","Item Type"];
export type BatchRow = {code:string; name:string; normal:number; campaign:number};
export function batchWorkbook(rows:BatchRow[]) {
 const book=XLSX.utils.book_new();
 const packages=XLSX.utils.aoa_to_sheet([HEADERS,...rows.map(r=>[r.code,r.name,"",r.normal,r.campaign,"","","","","","","","","","",""])]);
 packages["!cols"]=HEADERS.map(()=>({wch:24}));
 const items=XLSX.utils.aoa_to_sheet([ITEM_HEADERS]);items["!cols"]=ITEM_HEADERS.map(()=>({wch:24}));
 XLSX.utils.book_append_sheet(book,packages,"Packages");XLSX.utils.book_append_sheet(book,items,"Package Items");return book;
}
export function downloadBatch(rows:BatchRow[]) { XLSX.writeFile(batchWorkbook(rows),"Package_Batch_Staging.xlsx"); }
export type PreviewPackage={code:string;name:string;prices:string[];period:string;items:string[];issues:string[]};
export function readBatch(data:ArrayBuffer):PreviewPackage[] {
 const book=XLSX.read(data,{type:"array",cellDates:false});
 function rows(name:string,headers:string[]) {
  const sheet=book.Sheets[name];if(!sheet)throw new Error(`Missing sheet: ${name}`);
  if(Object.values(sheet).some(c=>c&&typeof c==="object"&&"f" in c))throw new Error("Please paste values only; formulas are not supported in this preview.");
  const all=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",raw:false});
  const start=all.findIndex(row=>headers.every((h,i)=>row[i]===h));if(start<0)throw new Error(`Headers do not match in ${name}. Use the downloaded template.`);
  const result=all.slice(start+1).filter(r=>r.some(v=>String(v).trim()));if(result.length>2000)throw new Error("Please use at most 2,000 rows per sheet.");return result.map(r=>r.map(v=>String(v).trim()));
 }
 const packages=rows("Packages",HEADERS),items=rows("Package Items",ITEM_HEADERS);
 if(!packages.length)throw new Error("No packages found. Fill the Packages sheet first.");
 if(items.some(r=>!packages.some(p=>p[0]===r[0])))throw new Error("An inventory row has an unknown Package Code.");
 return packages.map(r=>{
  const issues:string[]=[];const linked=items.filter(i=>i[0]===r[0]);
  if(!r[0]||!r[1])issues.push("Package Code and Package Name are required.");
  if(packages.filter(p=>p[0]===r[0]).length>1)issues.push("Duplicate Package Code.");
  const prices:string[]=[];
  for(const [market,start] of [["MY",2],["SG",5]] as const){
   const values=r.slice(start,start+3);if(!values.some(Boolean))continue;
   if(!values[0]||!values[1]||values.some(v=>v!==""&&(!Number.isFinite(Number(v))||Number(v)<=0)))issues.push(`${market}: enter positive Original and Normal prices; Campaign can be blank for same price.`);
   prices.push(`${market} · Original ${values[0]||"—"} · Normal ${values[1]||"—"} · Campaign ${values[2]||values[1]||"—"}`);
  }
  if(!prices.length)issues.push("Add MY or SG prices.");
  if(!["Long-term Package","Full Month","Custom Dates"].includes(r[8]))issues.push("Choose Period Type: Long-term Package, Full Month or Custom Dates.");
  if(!r[9])issues.push("Start Date is required.");
  if(r[8]!=="Long-term Package"&&!r[10])issues.push("End Date is required for a fixed period.");
  if(!r.slice(13,16).some(Boolean))issues.push("Add at least one platform SKU.");
  if(!linked.length)issues.push("Add inventory rows in Package Items.");
  if(linked.some(i=>!i[1]||!Number.isInteger(Number(i[2]))||Number(i[2])<=0||!["Product","Gift"].includes(i[3])))issues.push("Inventory rows need an SKU, a positive whole quantity and Product/Gift type.");
  return {code:r[0],name:r[1],prices,period:`${r[8]||"Period not set"} · ${r[9]||"—"} – ${r[8]==="Long-term Package"?"Ongoing":r[10]||"—"}${r[11]?` · ${r[11]}`:""}${r[12]?` · ${r[12]}`:""}`,items:linked.map(i=>`${i[1]} × ${i[2]} (${i[3]})`),issues};
 });
}
