import ExcelJS from "exceljs";
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
export const NEW_HEADERS=[...HEADERS.slice(0,12).map((h,i)=>h+([0,1,8,9].includes(i)?" *":"")),"Campaign Month 2","Campaign Month 3","Double Day","Mid Month Madness","Payday",...HEADERS.slice(13),"Inventory SKU *","Quantity *","Item Type *"];
NEW_HEADERS[11]="Campaign Month 1";
export async function downloadBatch(rows:BatchRow[]) {
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet("Packages");
 sheet.views=[{state:"frozen",ySplit:8,xSplit:2}];
 const notes=["PACKAGE BATCH UPLOAD · STAGING PREVIEW", "* Required. One package per first row; add its other inventory items on the following rows with the same Package Code. Leave other package fields blank on continuation rows.","For each selling market: Original + Normal Price required. Blank Campaign Price = Normal Price. Leave all SG prices blank for MY only. At least one platform SKU required.","Period Type: choose from dropdown. Start Date required; End Date required for Full Month / Custom Dates. Long-term Package: leave End Date blank. Enter dates as DD/MM/YYYY.","Campaign: select up to 3 months and Yes/No for each event. Long-term: leave months blank for recurring events. This trial applies selected events to all selected months.","Inventory SKU, whole Quantity and Product/Gift are required for every item. Use rows 9–508. Add extra items using the same Package Code; do not create new codes for components.","Preview only: uploading does not save packages. Calculator prices are copied values, not Excel formulas. MY = RM, SG = S$." ];
 notes.forEach((v,i)=>{sheet.mergeCells(i+1,1,i+1,23);sheet.getCell(i+1,1).value=v;sheet.getRow(i+1).height=i===0?30:32;sheet.getCell(i+1,1).alignment={wrapText:true,vertical:"middle"};});
 sheet.getRow(8).values=NEW_HEADERS;sheet.getRow(8).height=36;
 sheet.columns=NEW_HEADERS.map((h,i)=>({width:i===1?32:i>=20?23:22}));
 const options=book.addWorksheet("Options");options.state="veryHidden";
 const year=new Date().getFullYear();for(let i=0;i<60;i++)options.getCell(i+1,1).value=`${year-1+Math.floor(i/12)}-${String(i%12+1).padStart(2,"0")}`;
 for(let row=9;row<=508;row++){
  const r=sheet.getRow(row);r.height=24;
  for(let col=1;col<=23;col++){const cell=r.getCell(col);cell.font={name:"Noto Sans",size:11,color:{argb:"FF16465A"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:row%2?"FFF2F7FA":"FFFFFFFF"}};cell.numFmt=col>=3&&col<=8?"0.00":col===10||col===11?"dd/mm/yyyy":"@";}
  const list=(col:number,formula:string)=>{r.getCell(col).dataValidation={type:"list",allowBlank:true,formulae:[formula],showErrorMessage:true,errorStyle:"stop",errorTitle:"Choose a value",error:"Use the dropdown list."};};
  list(9,'"Long-term Package,Full Month,Custom Dates"');for(const col of [12,13,14])list(col,"'Options'!$A$1:$A$60");for(const col of [15,16,17])list(col,'"Yes,No"');list(23,'"Product,Gift"');
  for(const col of [10,11])r.getCell(col).dataValidation={type:"date",operator:"between",allowBlank:true,formulae:[new Date(Date.UTC(2020,0,1)),new Date(Date.UTC(2100,11,31))],showErrorMessage:true,errorStyle:"stop",errorTitle:"Valid date required",error:"Enter a real date, for example 01/11/2026."};
  r.getCell(22).numFmt="0";r.getCell(22).dataValidation={type:"whole",operator:"between",allowBlank:true,formulae:[1,100000],showErrorMessage:true,errorStyle:"stop",error:"Quantity must be a positive whole number."};
 }
 rows.forEach((r,i)=>{const row=sheet.getRow(i+9);row.getCell(1).value=r.code;row.getCell(2).value=r.name;row.getCell(4).value=r.normal;row.getCell(5).value=r.campaign;});
 sheet.getRow(8).eachCell(c=>{c.font={name:"Noto Sans",bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF075670"}};c.alignment={wrapText:true};});
 const bytes=await book.xlsx.writeBuffer();return bytes;
}
export async function saveBatch(rows:BatchRow[]){const bytes=await downloadBatch(rows);const blob=new Blob([bytes as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Package_Batch_Staging_v2.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
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
 let packages:string[][],items:string[][];
 if(book.Sheets["Package Items"]){packages=rows("Packages",HEADERS);items=rows("Package Items",ITEM_HEADERS);}
 else {
  const input=rows("Packages",NEW_HEADERS);packages=[];items=[];
  for(const r of input){
   const existing=packages.find(p=>p[0]===r[0]);
   if(!existing){
    const events=["Double Day","Mid Month Madness","Payday"].filter((_,i)=>r[14+i]==="Yes").join(", ");
    for(const value of r.slice(14,17))if(value&&!['Yes','No'].includes(value))throw new Error("Campaign event choices must be Yes or No.");
    for(const value of r.slice(11,14))if(value&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))throw new Error("Select a valid Campaign Month from the dropdown.");
    packages.push([...r.slice(0,11),[...new Set(r.slice(11,14).filter(Boolean))].join(", "),events,...r.slice(17,20)]);
   }else if(r.slice(1,20).some(Boolean))throw new Error(`Repeat only Package Code and inventory fields for extra items (${r[0]}).`);
   if(r.slice(20,23).some(Boolean))items.push([r[0],...r.slice(20,23)]);
  }
 }
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
  const date=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);if(!m)return null;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]?d:null;};
  if(!date(r[9]))issues.push("Start Date must be a valid DD/MM/YYYY date.");
  if(r[10]&&!date(r[10]))issues.push("End Date must be a valid DD/MM/YYYY date.");
  if(date(r[9])&&date(r[10])&&date(r[10])!<date(r[9])!)issues.push("End Date cannot be before Start Date.");
  if(r[8]==="Long-term Package"&&r[10])issues.push("Leave End Date blank for Long-term Package.");
  if(r[8]!=="Long-term Package"&&!r[10])issues.push("End Date is required for a fixed period.");
  if(!r.slice(13,16).some(Boolean))issues.push("Add at least one platform SKU.");
  if(!linked.length)issues.push("Add inventory rows in Package Items.");
  if(linked.some(i=>!i[1]||!Number.isInteger(Number(i[2]))||Number(i[2])<=0||!["Product","Gift"].includes(i[3])))issues.push("Inventory rows need an SKU, a positive whole quantity and Product/Gift type.");
  return {code:r[0],name:r[1],prices,period:`${r[8]||"Period not set"} · ${r[9]||"—"} – ${r[8]==="Long-term Package"?"Ongoing":r[10]||"—"}${r[11]?` · ${r[11]}`:""}${r[12]?` · ${r[12]}`:""}`,items:linked.map(i=>`${i[1]} × ${i[2]} (${i[3]})`),issues};
 });
}
