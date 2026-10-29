import {defaultRecurringEvent,recurringEventWindow,recurringEventIds,type RecurringEventId} from './recurring-campaign';
import type {MarketCode} from './markets';
export type BatchMarket=MarketCode;
export const marketChoices=['MY','MY+SG','MY+TH','MY+PH','MY+SG+TH','MY+SG+TH+PH'] as const;
export type MarketChoice=typeof marketChoices[number];
export const marketChoiceLabel=(choice:MarketChoice)=>choice==='MY'?'MY Only':choice;
export const batchMarkets=(choice:MarketChoice|'SG'):BatchMarket[]=>choice.split('+') as BatchMarket[];
export type BatchDates={normal:{mode:'months'|'custom'|'long';months:string[];start:string;end:string};campaign:{mode:'months'|'long';months:Record<string,RecurringEventId[]>;start:string;events:RecurringEventId[]}};
export type BatchPackage={id:string;name:string;prices:Partial<Record<BatchMarket,{original:string;normal:string;campaign:string}>>;skus:{Shopee:string;Lazada:string;TikTok:string};items:{sku:string;quantity:string}[];dates:BatchDates|null};
export const blankDates=():BatchDates=>({normal:{mode:'months',months:[],start:'',end:''},campaign:{mode:'months',months:{},start:'',events:[]}});
export const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export const validMonth=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function monthRange(m:string){return {from:m+'-01',to:m+'-'+new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5)),0)).getUTCDate()};}
export const sameBatchPrice=(p:BatchPackage)=>Object.values(p.prices).every(v=>!v.campaign||Number(v.normal)===Number(v.campaign));
export function dateIssues(d:BatchDates|null,same:boolean):string[]{
 if(!d)return ['Dates: set the Normal Day period.'];const errors:string[]=[];const n=d.normal,c=d.campaign;
 if(n.mode==='months'){if(!n.months.length||n.months.some(m=>!validMonth(m)))errors.push('Normal dates: select valid months.');}
 else {if(!validDate(n.start))errors.push('Normal dates: enter a valid start date.');if(n.mode==='custom'&&(!validDate(n.end)||n.end<n.start))errors.push('Normal dates: end must be on or after start.');}
 if(same)return errors;
 const covered=(from:string,to:string)=>n.mode==='long'?from>=n.start:n.mode==='custom'?from>=n.start&&to<=n.end:n.months.includes(from.slice(0,7));
 if(c.mode==='long'){
  if(!validDate(c.start)||!c.events.length||c.events.some(e=>!recurringEventIds.includes(e)))errors.push('Campaign dates: select a start date and monthly events.');
  if(n.mode!=='long'||c.start<n.start)errors.push('Campaign dates: recurring campaigns require Long-term Normal dates starting no later.');
 }else {
  if(!Object.keys(c.months).length)errors.push('Campaign dates: add a month and its events.');
  for(const [month,events] of Object.entries(c.months)){
   if(!validMonth(month)||!events.length||events.some(e=>!recurringEventIds.includes(e))){errors.push(`Campaign dates: select valid events for ${month}.`);continue;}
   if(events.some(e=>{const w=recurringEventWindow(month,defaultRecurringEvent(e));return !covered(w.from,w.to);}))errors.push(`Campaign dates: ${month} events must fall within the Normal Day period.`);
  }
 }
 return errors;
}
export function batchIssues(p:BatchPackage,all:BatchPackage[],includeDates=true){
 const issues:string[]=[];if(!p.name.trim())issues.push('Package Name: required.');
 if(!Object.values(p.skus).some(v=>v.trim()))issues.push('Platform SKU: fill at least one platform.');
 for(const platform of ['Shopee','Lazada','TikTok'] as const)if(p.skus[platform].trim()&&all.some(other=>other.id!==p.id&&other.skus[platform].trim()===p.skus[platform].trim()))issues.push(`${platform} SKU: duplicated in another package.`);
 if(!Object.keys(p.prices).length)issues.push('Prices: choose a selling market.');
 for(const [market,v] of Object.entries(p.prices))for(const key of ['original','normal','campaign'] as const){if(key==='campaign'&&!v[key])continue;if(!v[key].trim()||!Number.isFinite(Number(v[key]))||Number(v[key])<=0)issues.push(`${market} ${key} price: enter a positive number.`);}
 const entered=p.items.filter(i=>i.sku||i.quantity);if(!entered.length)issues.push('Inventory: add at least one item.');if(entered.length>10)issues.push('Inventory: maximum 10 items.');
 entered.forEach((i,index)=>{if(!i.sku.trim()||!Number.isInteger(Number(i.quantity))||Number(i.quantity)<=0||Number(i.quantity)>100000)issues.push(`Inventory ${index+1}: SKU and whole quantity 1–100,000 required.`);if(i.sku&&entered.slice(0,index).some(v=>v.sku.trim()===i.sku.trim()))issues.push(`Inventory ${index+1}: duplicate SKU; combine quantities.`);});
 return includeDates?[...issues,...dateIssues(p.dates,sameBatchPrice(p))]:issues;
}
export function applyBatchDates(rows:BatchPackage[],ids:string[],dates:BatchDates){return rows.map(p=>ids.includes(p.id)?{...p,dates:structuredClone(dates)}:p);}
