import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {batchMarkets,marketChoices,type MarketChoice,type BatchPackage} from './package-batch-model';
import {MARKET_CONFIG} from './markets';
import {MAX_INVENTORY_ITEMS,inventoryKey} from './inventory-items';
import type {InventoryProduct} from './inventory-catalog-model';
import type {CalculatorSnapshot} from './calculator-types';
export type BatchRow={code:string;name:string;normal:number;campaign:number;scenarios?:CalculatorSnapshot[];exportId?:string};
export type BatchExcelOptions={products?:InventoryProduct[];storeId?:string;entry?:'By Product Name'|'By SKU'};
export const headersFor=(choice:MarketChoice|'SG',slots=MAX_INVENTORY_ITEMS)=>['Package Name *',...batchMarkets(choice).flatMap(m=>[`${m} Original Price (${MARKET_CONFIG[m].symbol}) *`,`${m} Normal Price (${MARKET_CONFIG[m].symbol}) *`,`${m} Campaign Price (${MARKET_CONFIG[m].symbol})`]),'Shopee SKU','Lazada SKU','TikTok SKU',...Array.from({length:slots},(_,i)=>[`Inventory SKU ${i+1}${i===0?' *':''}`,`Quantity ${i+1}${i===0?' *':''}`]).flat()];
const letter=(number:number)=>{let s='';for(let n=number;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const labels=(choice:MarketChoice,byName:boolean)=>[...headersFor(choice).slice(0,4+batchMarkets(choice).length*3),...Array.from({length:MAX_INVENTORY_ITEMS},(_,i)=>[`${byName?'Product Name':'Inventory SKU'} ${i+1}${i===0?' *':''}`,`Quantity ${i+1}${i===0?' *':''}`,`${byName?'Inventory SKU':'Product Name'} ${i+1} (Auto)`]).flat(),'_CalculatorRef','_StoreId'];
export async function downloadBatch(rows:BatchRow[],choice:MarketChoice='MY',options:BatchExcelOptions={}){
 const b=new ExcelJS.Workbook(),markets=batchMarkets(choice),products=options.products??[],base=4+markets.length*3,lastRow=Math.max(106,rows.length+6),libraryLast=Math.max(106,products.length+106);
 b.creator='Shopee Hub';b.calcProperties.fullCalcOnLoad=true;
 for(const byName of [true,false]){
  const s=b.addWorksheet(byName?'By Product Name':'By SKU'),headers=labels(choice,byName);
  s.views=[{state:'frozen',xSplit:1,ySplit:6,showGridLines:false}];
  s.columns=headers.map((h,i)=>({width:i===0?34:i<1+markets.length*3?Math.max(28,h.length+2):i<base?23:(i-base)%3===1?15:byName?43:30,hidden:i>=base&&((i-base)%3===2||i>=base+MAX_INVENTORY_ITEMS*3)}));
  const notes=['PACKAGE BATCH · '+(byName?'BY PRODUCT NAME':'BY INVENTORY SKU'),'* Required. Use ONE entry tab per upload; select the same tab in Dashboard. Up to 20 items per package.',`Choose ${byName?'Product Name':'Inventory SKU'} and enter Quantity. Its matching ${byName?'SKU':'Product Name'} is filled in a hidden, protected column.`,'New product? Fill SKU and Product Name in the yellow Product Library rows, then select it here. Red = duplicate or unmatched product.','Calculator MY Normal / Campaign prices are locked. Change them in Dashboard Review with a reason. Fill Original Price and other markets manually.'];
  notes.forEach((v,i)=>{s.mergeCells(i+1,1,i+1,Math.min(headers.length,9));const c=s.getCell(i+1,1);c.value=v;c.font={name:'Noto Sans',size:i===0?14:11,bold:i===0,color:{argb:'FF075670'}};c.alignment={wrapText:false,vertical:'middle'};s.getRow(i+1).height=30;});
  s.getRow(6).values=headers;s.getRow(6).height=27;s.getRow(6).eachCell(c=>{c.font={name:'Noto Sans',size:11,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF075670'}};c.alignment={wrapText:false,vertical:'middle'};});
  for(let r=7;r<=lastRow;r++)for(let i=0;i<headers.length;i++){
   const c=s.getCell(r,i+1),price=i>=1&&i<1+markets.length*3,qty=i>=base&&i<base+60&&(i-base)%3===1,auto=i>=base&&((i-base)%3===2||i>=base+60);
   c.font={name:'Noto Sans',size:11,color:{argb:'FF174B70'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:auto?'FFEFF3F6':'FFFFF9E8'}};c.numFmt=price?'0.00':qty?'0':'@';c.protection={locked:auto};
   if(price||qty)c.dataValidation={type:qty?'whole':'decimal',operator:qty?'between':'greaterThan',allowBlank:true,formulae:qty?[1,100000]:[0],showErrorMessage:true,errorStyle:'stop',error:qty?'Enter a whole quantity from 1 to 100,000.':'Enter a positive numeric price.'};
  }
  for(let i=0;i<20;i++){
   const input=base+i*3+1,auto=input+2,L=letter(input),A=byName?'B':'A',other=byName?'A':'B';
   for(let r=7;r<=lastRow;r++){
    s.getCell(r,input).dataValidation={type:'list',allowBlank:true,formulae:[`INDIRECT("'Product Library'!$${A}$6:$${A}$${libraryLast}")`],showErrorMessage:true,errorStyle:'stop',error:'Choose an existing product or add its SKU and name to Product Library first.'};
    const key=`${L}${r}`,match=`MATCH(${key},'Product Library'!$${A}$6:$${A}$${libraryLast},0)`;
    s.getCell(r,auto).value={formula:`IF(${key}="","",IF(COUNTIF('Product Library'!$${A}$6:$${A}$${libraryLast},${key})=1,INDEX('Product Library'!$${other}$6:$${other}$${libraryLast},${match}),"Product missing or ambiguous"))`,result:''};
   }
   const counts=Array.from({length:20},(_,j)=>`COUNTIF($${letter(base+j*3+1)}7,${L}7)`).join(',');
   s.addConditionalFormatting({ref:`${L}7:${L}${lastRow}`,rules:[{type:'expression',priority:i+1,formulae:[`AND(${L}7<>"",OR(SUM(${counts})>1,COUNTIF(INDIRECT("'Product Library'!$${A}$6:$${A}$${libraryLast}"),${L}7)<>1))`],style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFFDE8E7'}},font:{color:{argb:'FFB32424'}}}}]});
  }
  rows.forEach((row,i)=>{const r=i+7;s.getCell(r,1).value=row.name;if(markets.includes('MY')){s.getCell(r,3).value=row.normal;s.getCell(r,4).value=row.campaign;if(row.exportId)for(const c of [3,4]){s.getCell(r,c).protection={locked:true};s.getCell(r,c).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFF3F6'}};}}s.getCell(r,base+61).value=row.exportId??'';s.getCell(r,base+62).value=options.storeId??'';});
  await s.protect('',{selectLockedCells:true,selectUnlockedCells:true,autoFilter:true,spinCount:1});
 }
 const lib=b.addWorksheet('Product Library');lib.views=[{state:'frozen',ySplit:5,showGridLines:false}];lib.columns=[{width:58},{width:64}];
 const descriptions=['PROJECT PRODUCT LIBRARY',`Existing product list for ${options.storeId??'the selected store'}. Add new products in yellow rows.`, 'Fill BOTH SKU and Product Name for each new product; leave existing mappings unchanged.','Downloaded product list is a snapshot. Dashboard validates the latest saved products on upload.'];
 descriptions.forEach((v,i)=>{lib.mergeCells(i+1,1,i+1,2);lib.getCell(i+1,1).value=v;lib.getCell(i+1,1).font={name:'Noto Sans',size:i?11:14,bold:i===0,color:{argb:'FF075670'}};lib.getRow(i+1).height=28;});
 lib.getRow(5).values=['Inventory SKU','Product Name'];lib.getRow(5).eachCell(c=>{c.font={name:'Noto Sans',size:11,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF075670'}};});
 for(let i=0;i<libraryLast-5;i++){const p=products[i],r=i+6;for(let c=1;c<=2;c++){const cell=lib.getCell(r,c);cell.value=p?(c===1?p.sku:p.name):'';cell.numFmt='@';cell.font={name:'Noto Sans',size:11,color:{argb:'FF174B70'}};cell.protection={locked:!!p};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:p?'FFEFF3F6':'FFFFF1BC'}};}lib.getRow(r).height=26;}
 lib.autoFilter={from:'A5',to:`B${libraryLast}`};await lib.protect('',{selectLockedCells:true,selectUnlockedCells:true,autoFilter:true,spinCount:1});return b.xlsx.writeBuffer();
}
export async function saveBatch(rows:BatchRow[],choice:MarketChoice='MY',options:BatchExcelOptions={}){const bytes=await downloadBatch(rows,choice,options),url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`Package_Batch_${choice.replaceAll('+','_')}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const cellValue=(sheet:XLSX.WorkSheet,r:number,c:number,allowFormula=false)=>{const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.f&&!allowFormula)throw Error(`Formula input is not allowed at ${XLSX.utils.encode_cell({r,c})}. Choose a product or enter values.`);return String(cell?.v??'').trim();};
export function readBatch(data:ArrayBuffer,entry:'By Product Name'|'By SKU'='By SKU'):BatchPackage[]{
 const b=XLSX.read(data,{type:'array',cellDates:false}),sheetName=b.Sheets[entry]?entry:b.Sheets.Packages?'Packages':b.SheetNames.find(n=>n==='By SKU'||n==='By Product Name');if(!sheetName)throw Error('Missing package entry sheet. Download the current template.');
 const s=b.Sheets[sheetName],range=XLSX.utils.decode_range(s['!ref']||'A1');if(range.e.r>2006||range.e.c>90)throw Error('Workbook is too large. Use at most 500 packages.');
 const library=b.Sheets['Product Library'],products:InventoryProduct[]=[];
 if(library){const lr=XLSX.utils.decode_range(library['!ref']||'A1');if(lr.e.r>2100)throw Error('Product Library is too large.');for(let r=5;r<=lr.e.r;r++){const sku=cellValue(library,r,0),name=cellValue(library,r,1);if(sku||name){if(!sku||!name)throw Error(`Product Library row ${r+1}: fill both SKU and Product Name.`);if(products.some(p=>inventoryKey(p.sku)===inventoryKey(sku)))throw Error(`Product Library row ${r+1}: duplicate SKU ${sku}.`);products.push({sku,name});}}}
 let choice:MarketChoice|'SG'|undefined,start=-1,slots=20,isNew=sheetName!=='Packages';
 for(let r=0;r<=Math.min(range.e.r,10)&&!choice;r++)for(const candidate of [...marketChoices,'SG'] as const){for(const count of [20,10]){const expected=isNew?labels(candidate as MarketChoice,sheetName==='By Product Name'):headersFor(candidate,count);if(expected.every((v,c)=>cellValue(s,r,c)===v)){choice=candidate;start=r;slots=count;break;}}if(choice)break;}
 if(!choice)throw Error('Headers do not match. Download the current template and keep the headers unchanged.');
 const markets=batchMarkets(choice),base=4+markets.length*3,output:BatchPackage[]=[];
 for(let r=start+1;r<=range.e.r;r++){
  const relevant=[...Array.from({length:base},(_,c)=>c),...Array.from({length:slots},(_,j)=>isNew?[base+j*3,base+j*3+1]:[base+j*2,base+j*2+1]).flat()];
  if(!relevant.some(c=>cellValue(s,r,c)))continue;
  let c=1;const prices:BatchPackage['prices']={};for(const m of markets){prices[m]={original:cellValue(s,r,c),normal:cellValue(s,r,c+1),campaign:cellValue(s,r,c+2)};c+=3;}
  const skus={Shopee:cellValue(s,r,c),Lazada:cellValue(s,r,c+1),TikTok:cellValue(s,r,c+2)};c+=3;
  const items=Array.from({length:slots},(_,j)=>{const key=cellValue(s,r,c+j*(isNew?3:2)),quantity=cellValue(s,r,c+j*(isNew?3:2)+1);if(!key&&!quantity)return null;
   const matches=products.filter(p=>inventoryKey(sheetName==='By Product Name'?p.name:p.sku)===inventoryKey(key));
   if(sheetName==='By Product Name'&&matches.length!==1)throw Error(`Row ${r+1}, item ${j+1}: Product Name "${key}" is missing or ambiguous. Add it in Product Library or use By SKU.`);
   return {sku:sheetName==='By Product Name'?matches[0].sku:key,name:matches.length===1?matches[0].name:'',quantity};
  }).filter((v):v is NonNullable<typeof v>=>!!v);
  const exportId=isNew?cellValue(s,r,base+60):'',fileStoreId=isNew?cellValue(s,r,base+61):'';
  output.push({id:`row-${r}`,name:cellValue(s,r,0),prices,skus,items:items.length?items:[{sku:'',quantity:'',name:''}],dates:null,...(exportId?{exportId}:{}),...(fileStoreId?{fileStoreId}:{})});
 }
 if(!output.length)throw Error('No packages found in the selected tab.');if(output.length>500)throw Error('Use at most 500 packages per preview.');
 const refs=output.map(p=>p.exportId).filter(Boolean);if(new Set(refs).size!==refs.length)throw Error('A Calculator export row is repeated. Keep one package per exported row.');return output;
}
