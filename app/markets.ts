export const MARKET_CODES = ['MY','SG','TH','PH'] as const;
export type MarketCode = typeof MARKET_CODES[number];
export const MARKET_CONFIG = {
  MY:{name:'Malaysia',currency:'MYR',symbol:'RM',timeZone:'Asia/Kuala_Lumpur'},
  SG:{name:'Singapore',currency:'SGD',symbol:'S$',timeZone:'Asia/Singapore'},
  TH:{name:'Thailand',currency:'THB',symbol:'฿',timeZone:'Asia/Bangkok'},
  PH:{name:'Philippines',currency:'PHP',symbol:'₱',timeZone:'Asia/Manila'},
} as const;
export function isMarket(value:unknown):value is MarketCode {
  return typeof value==='string'&&(MARKET_CODES as readonly string[]).includes(value);
}
export function marketFromPlatform(platform:string|undefined|null):MarketCode {
  if(/\bTH\b|Thailand/i.test(platform??''))return 'TH';
  if(/\bPH\b|Philippines/i.test(platform??''))return 'PH';
  if(/\bSG\b|Singapore/i.test(platform??''))return 'SG';
  return 'MY';
}
// Old SG rows sometimes retain the original MY market default. Currency is authoritative.
export function priceMarket(market:unknown,currency:unknown):MarketCode {
  const byCurrency=MARKET_CODES.find(code=>MARKET_CONFIG[code].currency===currency);
  // A legacy MYR default must not erase an explicitly saved non-MY market.
  return byCurrency&&byCurrency!=='MY'?byCurrency:isMarket(market)?market:byCurrency??'MY';
}
export function marketMoney(value:number,market:string,stored=false):string {
  const symbol=isMarket(market)?MARKET_CONFIG[market].symbol:market;
  return `${symbol} ${(stored?value/100:value).toFixed(2)}`;
}
export function marketDate(market:MarketCode,date=new Date()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:MARKET_CONFIG[market].timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
