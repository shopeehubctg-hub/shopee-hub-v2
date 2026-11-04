import {isMarket, type MarketCode} from './markets';
import {activeRecurringEvent,readRecurringCampaign} from './recurring-campaign';

export const PRICING_MODES = ['uniform', 'normal_campaign', 'split_normal'] as const;
export type PricingMode = typeof PRICING_MODES[number];
export type PricingPeriod = 'normal_all' | 'normal_1_15' | 'campaign' | 'normal_16_end';
export const pricingModeLabels:Record<PricingMode,string> = {
  uniform:'Same Price All Month', normal_campaign:'Normal & Campaign Prices', split_normal:'Early Month, Campaign & Late Month Prices',
};
export const pricingPeriodLabels:Record<PricingPeriod,string> = {
  normal_all:'Normal Day', normal_1_15:'Normal Day · 1st–15th', campaign:'Campaign Day', normal_16_end:'Normal Day · 16th–End',
};
export const pricingPeriods=(mode:PricingMode):PricingPeriod[] => mode!=='normal_campaign'
  ? ['normal_1_15','campaign','normal_16_end'] : ['normal_all','campaign'];
export function pricingMode(value:unknown):PricingMode {
  if(value==null)return 'normal_campaign';
  if(!PRICING_MODES.includes(value as PricingMode))throw Error('Unknown pricing mode. Reopen this package with the latest Dashboard.');
  return value as PricingMode;
}
export function snapshotPeriod(value:{pricingPeriod?:PricingPeriod;serviceScenario:string}):PricingPeriod {
  return value.pricingPeriod??(value.serviceScenario==='Campaign Day'?'campaign':'normal_all');
}
export type NormalMonthlyPrice={originalPrice:number;sellingPrice:number};
export type NormalMonthlyRule={schema:1;prices:Partial<Record<MarketCode,{early:NormalMonthlyPrice;late:NormalMonthlyPrice}>>};
type Schedule={market:string;priceType:string;originalPrice:number;sellingPrice:number;effectiveFrom:string;effectiveTo:string|null};
const validPrice=(v:unknown):v is NormalMonthlyPrice=>!!v&&typeof v==='object'&&['originalPrice','sellingPrice'].every(k=>{
  const n=(v as Record<string,unknown>)[k];return typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=1e7&&Math.abs(n*100-Math.round(n*100))<1e-6;
})&&(v as NormalMonthlyPrice).sellingPrice<=(v as NormalMonthlyPrice).originalPrice;

// Amounts in this versioned rule are decimal currency units, as in recurring Campaign rules.
// Canonical Normal schedules alone own availability. The rule never creates additional dates.
export function validateNormalMonthlyRule(value:unknown,mode:PricingMode,schedules:Schedule[],minorUnits=false):NormalMonthlyRule|null {
  if(mode!=='split_normal'){if(value!=null)throw Error('Monthly Normal prices require the three-period pricing mode.');return null;}
  const v=value as NormalMonthlyRule;
  if(!v||v.schema!==1||!v.prices||typeof v.prices!=='object'||Array.isArray(v.prices))throw Error('Complete both early-month and late-month Normal prices.');
  const markets=[...new Set(schedules.filter(s=>s.priceType==='non_campaign').map(s=>s.market))];
  if(!markets.length||Object.keys(v.prices).some(m=>!isMarket(m)||!markets.includes(m)))throw Error('Normal price markets do not match this package.');
  for(const market of markets){
    const pair=v.prices[market as MarketCode];
    if(!pair||!validPrice(pair.early)||!validPrice(pair.late)||pair.early.originalPrice!==pair.late.originalPrice)throw Error(`${market}: enter positive Normal prices within their Original Prices.`);
    const base=schedules.filter(s=>s.market===market&&s.priceType==='non_campaign');
    const factor=minorUnits?100:1;
    if(base.some(s=>Math.round(s.originalPrice*100/factor)!==Math.round(pair.early.originalPrice*100)||Math.round(s.sellingPrice*100/factor)!==Math.round(pair.early.sellingPrice*100)))throw Error(`${market}: early-month Normal prices must match the Normal price card.`);
  }
  return {schema:1,prices:Object.fromEntries(markets.map(m=>[m,structuredClone(v.prices[m as MarketCode])]))};
}
export function readNormalMonthlyRule(settings:Record<string,unknown>|null|undefined):NormalMonthlyRule|null {
  if(settings?._pricingMode!=null)pricingMode(settings._pricingMode);
  if(settings?._pricingMode!=='split_normal')return null;
  const value=settings._normalMonthlyRule as NormalMonthlyRule;
  if(value?.schema!==1||!value.prices||!Object.keys(value.prices).length||Object.entries(value.prices).some(([m,p])=>!isMarket(m)||!validPrice(p?.early)||!validPrice(p?.late)))throw Error('Monthly Normal pricing is incomplete. Open Edit / Modify to review this package.');
  return value;
}
export function resolvedNormalPrice<T extends Schedule>(base:T,date:string,settings:Record<string,unknown>|null|undefined,minorUnits=false):T {
  if(date<base.effectiveFrom||base.effectiveTo!==null&&date>base.effectiveTo)throw Error('The requested date is outside the saved Normal period.');
  const pair=readNormalMonthlyRule(settings)?.prices[base.market as MarketCode];
  if(!pair||base.priceType!=='non_campaign')return base;
  const p=Number(date.slice(8,10))<=15?pair.early:pair.late,factor=minorUnits?100:1;
  return {...base,originalPrice:Math.round(p.originalPrice*100)*factor/100,sellingPrice:Math.round(p.sellingPrice*100)*factor/100};
}
export function effectivePackagePrice<T extends Schedule>(prices:T[],settings:Record<string,unknown>|null|undefined,date:string,market:MarketCode,minorUnits=false):Pick<T,'originalPrice'|'sellingPrice'>|null {
  if(settings?._packageEnded===true)return null;
  const inRange=(p:T)=>p.market===market&&p.effectiveFrom<=date&&(p.effectiveTo===null||p.effectiveTo>=date);
  const normal=prices.find(p=>p.priceType==='non_campaign'&&inRange(p));
  if(!normal)return null;
  const recurring=readRecurringCampaign(settings?._recurringCampaign,[market]);
  const event=recurring?activeRecurringEvent(recurring,date)?.prices[market]:null;
  if(event){const factor=minorUnits?100:1;return {originalPrice:Math.round(event.originalPrice*100)*factor/100,sellingPrice:Math.round(event.sellingPrice*100)*factor/100};}
  if(!recurring){const campaign=prices.find(p=>p.priceType==='campaign'&&inRange(p));if(campaign)return campaign;}
  return resolvedNormalPrice(normal,date,settings,minorUnits);
}
export function normalPeriodAmounts(rule:NormalMonthlyRule|null,market:MarketCode){
  const p=rule?.prices[market];return p?[{period:'normal_1_15' as const,...p.early},{period:'normal_16_end' as const,...p.late}]:[];
}

export function normalPricingSummary(settings:Record<string,unknown>|null|undefined):string {
 const rule=readNormalMonthlyRule(settings);
 return rule?Object.entries(rule.prices).map(([market,p])=>`${market} Normal 1st–15th ${p!.early.sellingPrice.toFixed(2)} (Original ${p!.early.originalPrice.toFixed(2)}); Normal 16th–End ${p!.late.sellingPrice.toFixed(2)} (Original ${p!.late.originalPrice.toFixed(2)})`).join(' | '):'';
}
