import { previousMonth } from './account-ledger';
export const BNM_MONTHLY_URL='https://storage.data.gov.my/finsector/exr/monthly.csv';
export type BnmServiceRate={serviceMonth:string;rate:string;policy:'bnm-service-average';verified:true;reference:string};
export type BnmMarketCurrency='SGD'|'THB'|'PHP';
export type BnmMarketServiceRate=BnmServiceRate&{currency:BnmMarketCurrency;quotationUnit:1};
const validMonth=(value:string)=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
const validCurrency=(value:unknown):value is BnmMarketCurrency=>['SGD','THB','PHP'].includes(String(value));
/** Official normalized series: monthly trading-day average, MYR per ONE currency unit. */
export function parseBnmMarketServiceRate(csv:string,serviceMonth:string,currency:BnmMarketCurrency):BnmMarketServiceRate|undefined {
 if(!validMonth(serviceMonth)||!validCurrency(currency)||csv.length>1_000_000)return undefined;
 const lines=csv.trim().split(/\r?\n/);const header=lines.shift()?.replace(/^\uFEFF/,'').split(',')??[];
 // Do not infer units from THB100/PHP100 or accept ambiguous duplicate columns.
 if(['date','indicator',currency].some(field=>header.filter(column=>column===field).length!==1))return undefined;
 const date=header.indexOf('date'),indicator=header.indexOf('indicator'),column=header.indexOf(currency);
 const matches=lines.map(line=>line.split(',')).filter(row=>row[date]===`${serviceMonth}-01`&&row[indicator]==='avg');
 if(matches.length!==1||matches[0].length!==header.length)return undefined;
 const rate=matches[0][column];
 if(!/^\d{1,3}(?:\.\d{1,8})?$/.test(rate)||!/[1-9]/.test(rate))return undefined;
 return {serviceMonth,rate,policy:'bnm-service-average',verified:true,reference:BNM_MONTHLY_URL,currency,quotationUnit:1};
}
function legacyRate(rate:BnmMarketServiceRate|undefined):BnmServiceRate|undefined {
 if(!rate)return undefined;
 return {serviceMonth:rate.serviceMonth,rate:rate.rate,policy:rate.policy,verified:rate.verified,reference:rate.reference};
}
/** Preserve the existing SGD API and exact result shape. */
export function parseBnmServiceRate(csv:string,serviceMonth:string):BnmServiceRate|undefined{return legacyRate(parseBnmMarketServiceRate(csv,serviceMonth,'SGD'));}

type CsvCache={csv?:string;expires:number;pending?:Promise<string|undefined>};
// All currencies share one CSV download/cache. Injected fetchers remain isolated.
const caches=new WeakMap<typeof fetch,CsvCache>();
async function download(fetcher:typeof fetch):Promise<string|undefined>{
 try {
  const response=await fetcher(BNM_MONTHLY_URL,{signal:AbortSignal.timeout(3000),cache:'no-store',redirect:'error'});
  if(!response.ok)return undefined;
  const csv=await response.text();return csv.length<=1_000_000?csv:undefined;
 }catch{return undefined;}
}
async function monthlyCsv(fetcher:typeof fetch){
 let cache=caches.get(fetcher);if(!cache){cache={expires:0};caches.set(fetcher,cache);}
 if(cache.csv!==undefined&&cache.expires>Date.now())return cache.csv;
 if(!cache.pending){const entry=cache;entry.pending=download(fetcher).then(value=>{if(value!==undefined){entry.csv=value;entry.expires=Date.now()+6*60*60*1000;}return value;}).finally(()=>{entry.pending=undefined;});}
 return cache.pending;
}
/** Public read only. Missing service month never falls back to spot, stale or another currency. */
export async function bnmMarketServiceRate(invoiceMonth:string,currency:BnmMarketCurrency,fetcher:typeof fetch=fetch):Promise<BnmMarketServiceRate|undefined>{
 if(!validMonth(invoiceMonth)||!validCurrency(currency))return undefined;
 const csv=await monthlyCsv(fetcher);
 return csv===undefined?undefined:parseBnmMarketServiceRate(csv,previousMonth(invoiceMonth),currency);
}
export async function bnmServiceRate(invoiceMonth:string,fetcher:typeof fetch=fetch):Promise<BnmServiceRate|undefined>{return legacyRate(await bnmMarketServiceRate(invoiceMonth,'SGD',fetcher));}
