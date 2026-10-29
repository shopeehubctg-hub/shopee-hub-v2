import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {batchMarkets,marketChoices,type MarketChoice,type BatchPackage} from './package-batch-model';
import {MARKET_CONFIG} from './markets';
export type BatchRow={code:string;name:string;normal:number;campaign:number};
export const headersFor=(choice:MarketChoice|'SG')=>['Package Name *',...batchMarkets(choice).flatMap(m=>[`${m} Original Price (${MARKET_CONFIG[m].symbol}) *`,`${m} Normal Price (${MARKET_CONFIG[m].symbol}) *`,`${m} Campaign Price (${MARKET_CONFIG[m].symbol})`]),'Shopee SKU','Lazada SKU','TikTok SKU',...Array.from({length:10},(_,i)=>[`Inventory SKU ${i+1}${i===0?' *':''}`,`Quantity ${i+1}${i===0?' *':''}`]).flat()];
export async function downloadBatch(rows:BatchRow[],choice:MarketChoice='MY'){
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('Packages'),headers=headersFor(choice),markets=batchMarkets(choice),base=1+markets.length*3+3;
 s.views=[{state:'frozen',xSplit:1,ySplit:6}];s.columns=headers.map((header,i)=>({width:i===0?34:i>=base&&(i-base)%2===1?14:Math.max(23,header.length+3)}));
 const notes=['PACKAGE BATCH · ONE PACKAGE PER ROW','* Required. Fill at least one platform SKU. Fill up to 10 Inventory SKU / Quantity pairs; leave unused pairs blank.','Blank Campaign Price = Normal Price. Original and Normal prices are required for each selling market.','Calculator supplies MY prices only. SG / TH / PH prices remain blank for you to fill; no currency conversion is applied.','Set dates after upload in Dashboard. Review all details before creating packages in Staging.'];
 notes.forEach((v,i)=>{s.mergeCells(i+1,1,i+1,Math.min(headers.length,9));const c=s.getCell(i+1,1);c.value=v;c.font={name:'Noto Sans',size:i===0?14:11,bold:i===0,color:{argb:'FF075670'}};c.alignment={wrapText:true,vertical:'middle'};s.getRow(i+1).height=32;});
 s.getRow(6).values=headers;s.getRow(6).height=26;s.getRow(6).eachCell(c=>{c.font={name:'Noto Sans',bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF075670'}};c.alignment={wrapText:false,vertical:'middle'};});
 for(let r=7;r<=506;r++)for(let i=0;i<headers.length;i++){
  const c=s.getCell(r,i+1),price=i>=1&&i<1+markets.length*3,quantity=i>=base&&(i-base)%2===1;c.font={name:'Noto Sans',size:11,color:{argb:'FF174B70'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:r%2?'FFF0F6F9':'FFFFFFFF'}};c.numFmt=price?'0.00':quantity?'0':'@';
  if(price||quantity)c.dataValidation={type:quantity?'whole':'decimal',operator:quantity?'between':'greaterThan',allowBlank:true,formulae:quantity?[1,100000]:[0],showErrorMessage:true,errorStyle:'stop',error:quantity?'Enter a whole quantity from 1 to 100,000.':'Enter a positive numeric price.'};
 }
 rows.forEach((r,i)=>{s.getCell(i+7,1).value=r.name;if(markets.includes('MY')){s.getCell(i+7,3).value=r.normal;s.getCell(i+7,4).value=r.campaign;}});return b.xlsx.writeBuffer();
}
export async function saveBatch(rows:BatchRow[],choice:MarketChoice='MY'){const bytes=await downloadBatch(rows,choice),url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`Package_Batch_${choice.replaceAll('+','_')}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function readBatch(data:ArrayBuffer):BatchPackage[]{
 const b=XLSX.read(data,{type:'array',cellDates:false}),s=b.Sheets.Packages;if(!s)throw new Error('Missing Packages sheet. Download the current template.');
 if(Object.entries(s).some(([k,c])=>!k.startsWith('!')&&c&&typeof c==='object'&&'f' in c))throw new Error('Formulas are not supported. Paste values only.');
 const range=XLSX.utils.decode_range(s['!ref']||'A1');if(range.e.r>2006||range.e.c>40)throw new Error('Workbook is too large. Use at most 2,000 package rows.');
 const raw=XLSX.utils.sheet_to_json<unknown[]>(s,{header:1,defval:'',raw:true}).map(r=>r.map(v=>String(v).trim()));
 if(raw.some(r=>r.some(v=>v.startsWith('Parent SKU')||v==='Package Code')))throw new Error('This is an older template. Download the new template with Shopee / Lazada / TikTok SKU columns.');
 let choice:MarketChoice|'SG'|undefined,start=-1;
 for(const candidate of [...marketChoices,'SG'] as const){const h=headersFor(candidate);const i=raw.findIndex(r=>h.every((v,col)=>v===r[col]));if(i>=0){choice=candidate;start=i;break;}}
 if(!choice)throw new Error('Headers do not match. Download the current template; keep the headers unchanged.');
 const rows=raw.slice(start+1).filter(r=>r.some(Boolean));if(!rows.length)throw new Error('No packages found.');if(rows.length>500)throw new Error('Use at most 500 packages per preview.');const markets=batchMarkets(choice);
 return rows.map((r,i)=>{let c=1;const prices:BatchPackage['prices']={};for(const m of markets){prices[m]={original:r[c]||'',normal:r[c+1]||'',campaign:r[c+2]||''};c+=3;}const skus={Shopee:r[c]||'',Lazada:r[c+1]||'',TikTok:r[c+2]||''};c+=3;const items=Array.from({length:10},(_,j)=>({sku:r[c+j*2]||'',quantity:r[c+j*2+1]||''})).filter(v=>v.sku||v.quantity);return {id:`row-${i}`,name:r[0]||'',prices,skus,items:items.length?items:[{sku:'',quantity:''}],dates:null};});
}
