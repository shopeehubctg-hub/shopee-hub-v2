import {priceMarket} from './markets';

type Period = {market?:string|null;currency?:string|null;priceType:string;effectiveFrom:string};

// A monthly extension may add periods, but must retain the saved origin of each
// market/day type. Status is read from the locked package, never from the payload.
export function startedPackageDates(prices:Period[],status:string,today:string) {
  const starts=new Map<string,string>();
  if(status==='draft'||status==='review')return starts;
  for(const price of prices){
    const key=`${priceMarket(price.market,price.currency)}:${price.priceType}`;
    const previous=starts.get(key);
    if(!previous||price.effectiveFrom<previous)starts.set(key,price.effectiveFrom);
  }
  return new Map([...starts].filter(([,start])=>start<=today));
}

export function changedPackageStart(previous:Period[],next:Period[],status:string,today:string):string|null {
  for(const [key,start] of startedPackageDates(previous,status,today)){
    const candidates=next.filter(price=>`${priceMarket(price.market,price.currency)}:${price.priceType}`===key);
    const nextStart=candidates.map(price=>price.effectiveFrom).sort()[0];
    if(nextStart!==start){
      const [market,type]=key.split(':');
      return `${market} ${type==='campaign'?'Campaign':'Normal'} Day has already started on ${start}. Its Start Date cannot be changed. You can adjust the End Date.`;
    }
  }
  return null;
}
