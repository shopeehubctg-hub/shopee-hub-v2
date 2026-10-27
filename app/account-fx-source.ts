import { previousMonth } from './account-ledger';
export const BNM_MONTHLY_URL='https://storage.data.gov.my/finsector/exr/monthly.csv';
export type BnmServiceRate={serviceMonth:string;rate:string;policy:'bnm-service-average';verified:true;reference:string};
const validMonth=(value:string)=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
/** Official series: 1200 middle rate, monthly trading-day average, MYR per SGD1. */
export function parseBnmServiceRate(csv:string,serviceMonth:string):BnmServiceRate|undefined {
 if(!validMonth(serviceMonth)||csv.length>1_000_000)return undefined;
 const lines=csv.trim().split(/\r?\n/);const header=lines.shift()?.replace(/^\uFEFF/,'').split(',')??[];
 const date=header.indexOf('date'),indicator=header.indexOf('indicator'),sgd=header.indexOf('SGD');
 if(date<0||indicator<0||sgd<0)return undefined;
 const matches=lines.map(line=>line.split(',')).filter(row=>row[date]===`${serviceMonth}-01`&&row[indicator]==='avg');
 if(matches.length!==1||matches[0].length!==header.length)return undefined;
 const rate=matches[0][sgd];
 if(!/^\d{1,3}(?:\.\d{1,8})?$/.test(rate)||!/[1-9]/.test(rate))return undefined;
 return {serviceMonth,rate,policy:'bnm-service-average',verified:true,reference:BNM_MONTHLY_URL};
}
let cache:{csv:string;expires:number}|undefined;
let pending:Promise<string|undefined>|undefined;
async function download(fetcher:typeof fetch):Promise<string|undefined>{
 try {
  const response=await fetcher(BNM_MONTHLY_URL,{signal:AbortSignal.timeout(3000),cache:'no-store',redirect:'error'});
  if(!response.ok)return undefined;
  const csv=await response.text();return csv.length<=1_000_000?csv:undefined;
 }catch{return undefined;}
}
/** Public-data read only. Missing source/month never falls back to spot, prior month or fixed 3.2. */
export async function bnmServiceRate(invoiceMonth:string,fetcher:typeof fetch=fetch):Promise<BnmServiceRate|undefined>{
 if(!validMonth(invoiceMonth))return undefined;
 let csv:string|undefined;
 if(fetcher!==fetch)csv=await download(fetcher);
 else if(cache&&cache.expires>Date.now())csv=cache.csv;
 else {
  if(!pending)pending=download(fetcher).then(value=>{if(value!==undefined)cache={csv:value,expires:Date.now()+6*60*60*1000};return value;}).finally(()=>{pending=undefined;});
  csv=await pending;
 }
 return csv===undefined?undefined:parseBnmServiceRate(csv,previousMonth(invoiceMonth));
}
