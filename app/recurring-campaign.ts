export type RecurringEventId = "dday" | "mid_month" | "payday";
export type RecurringMarket = "MY" | "SG";
export type RecurringEventPrice = { originalPrice:number; sellingPrice:number };
export type RecurringCampaignEvent = {
  id:RecurringEventId;
  startOffset?:number;
  endOffset?:number;
  startDay?:number;
  endDay?:number;
  prices:Partial<Record<RecurringMarket,RecurringEventPrice>>;
};
export type RecurringCampaignRule = {
  schema:1;
  startDate:string;
  endDate:string|null;
  events:RecurringCampaignEvent[];
};

export const recurringEventLabels:Record<RecurringEventId,string> = {
  dday:"Double Day",
  mid_month:"Mid Month Madness",
  payday:"Payday",
};
export const recurringEventIds:RecurringEventId[]=["dday","mid_month","payday"];

export function defaultRecurringEvent(id:RecurringEventId):RecurringCampaignEvent {
  if (id==="dday") return {id,startOffset:-2,endOffset:0,prices:{}};
  return {id,startDay:id==="mid_month"?14:24,endDay:id==="mid_month"?15:25,prices:{}};
}

function validDate(value:unknown):value is string {
  if (typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}

function monthLastDay(month:string) {
  const [year,number]=month.split("-").map(Number);
  return new Date(Date.UTC(year,number,0)).getUTCDate();
}

export function recurringEventWindow(month:string,event:Pick<RecurringCampaignEvent,"id"|"startOffset"|"endOffset"|"startDay"|"endDay">) {
  const last=monthLastDay(month);
  const eventDay=Number(month.slice(5));
  const start=event.id==="dday"?eventDay+(event.startOffset??-2):event.startDay??1;
  const end=event.id==="dday"?eventDay+(event.endOffset??0):event.endDay??last;
  const date=(day:number)=>`${month}-${String(Math.min(last,Math.max(1,day))).padStart(2,"0")}`;
  return {from:date(start),to:date(end)};
}

export function validateRecurringCampaign(input:unknown,markets:RecurringMarket[]):RecurringCampaignRule {
  if (!input||typeof input!=="object") throw new Error("Choose at least one monthly Campaign event.");
  const value=input as Record<string,unknown>;
  if (value.schema!==1||!validDate(value.startDate)||!(value.endDate===null||validDate(value.endDate))||(value.endDate!==null&&value.endDate<value.startDate)) {
    throw new Error("Choose valid start and end dates for the recurring Campaign.");
  }
  if (!Array.isArray(value.events)||!value.events.length||value.events.length>3) throw new Error("Select at least one monthly Campaign event.");
  const seen=new Set<string>();
  const events=value.events.map(raw=>{
    if (!raw||typeof raw!=="object") throw new Error("A monthly Campaign event is incomplete.");
    const item=raw as Record<string,unknown>;
    if (!recurringEventIds.includes(item.id as RecurringEventId)||seen.has(String(item.id))) throw new Error("Monthly Campaign events must be unique.");
    const id=item.id as RecurringEventId;
    seen.add(id);
    if (id==="dday") {
      if (!Number.isInteger(item.startOffset)||Number(item.startOffset)<-5||Number(item.startOffset)>0||!Number.isInteger(item.endOffset)||Number(item.endOffset)<0||Number(item.endOffset)>5) {
        throw new Error("Double Day offsets must be within five days of the monthly double date.");
      }
    } else if (!Number.isInteger(item.startDay)||Number(item.startDay)<1||Number(item.startDay)>31||!Number.isInteger(item.endDay)||Number(item.endDay)<Number(item.startDay)||Number(item.endDay)>31) {
      throw new Error("Mid Month Madness and Payday need valid monthly day ranges.");
    }
    const rawPrices=item.prices as Record<string,unknown>|undefined;
    const prices:Partial<Record<RecurringMarket,RecurringEventPrice>>={};
    for (const market of markets) {
      const rawPrice=rawPrices?.[market] as Record<string,unknown>|undefined;
      const originalPrice=Number(rawPrice?.originalPrice);
      const sellingPrice=Number(rawPrice?.sellingPrice);
      if (!Number.isFinite(originalPrice)||!Number.isFinite(sellingPrice)||originalPrice<=0||sellingPrice<=0||sellingPrice>originalPrice||Math.abs(originalPrice*100-Math.round(originalPrice*100))>0.000001||Math.abs(sellingPrice*100-Math.round(sellingPrice*100))>0.000001) {
        throw new Error(`Enter valid ${market} original and selling prices for ${recurringEventLabels[id]}.`);
      }
      prices[market]={originalPrice,sellingPrice};
    }
    return id==="dday"
      ? {id,startOffset:Number(item.startOffset),endOffset:Number(item.endOffset),prices}
      : {id,startDay:Number(item.startDay),endDay:Number(item.endDay),prices};
  });
  const rule:RecurringCampaignRule={schema:1,startDate:value.startDate,endDate:value.endDate as string|null,events};
  for(let monthNumber=1;monthNumber<=12;monthNumber++){
    const month=`2028-${String(monthNumber).padStart(2,"0")}`;
    const windows=events.map(event=>({...recurringEventWindow(month,event),id:event.id}));
    for(let i=0;i<windows.length;i++)for(let j=i+1;j<windows.length;j++){
      if(windows[i].from<=windows[j].to&&windows[j].from<=windows[i].to) throw new Error(`${recurringEventLabels[windows[i].id]} overlaps ${recurringEventLabels[windows[j].id]}. Adjust their monthly dates.`);
    }
  }
  return rule;
}

export function readRecurringCampaign(value:unknown,markets:RecurringMarket[]):RecurringCampaignRule|null {
  try { return validateRecurringCampaign(value,markets); } catch { return null; }
}

export function activeRecurringEvent(rule:RecurringCampaignRule,date:string) {
  if(date<rule.startDate||(rule.endDate!==null&&date>rule.endDate)) return null;
  return rule.events.find(event=>{
    const window=recurringEventWindow(date.slice(0,7),event);
    return window.from<=date&&date<=window.to;
  })??null;
}

export function upcomingRecurringEvents(rule:RecurringCampaignRule,from:string,limit=3) {
  const candidates:Array<{id:RecurringEventId;from:string;to:string}>=[];
  const [year,month]=from.slice(0,7).split("-").map(Number);
  for(let offset=0;offset<24&&candidates.length<limit+3;offset++){
    const date=new Date(Date.UTC(year,month-1+offset,1));
    const monthKey=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
    for(const event of rule.events){
      const window=recurringEventWindow(monthKey,event);
      const first=window.from<rule.startDate?rule.startDate:window.from;
      const last=rule.endDate&&window.to>rule.endDate?rule.endDate:window.to;
      if(first<=last&&last>=from)candidates.push({id:event.id,from:first,to:last});
    }
  }
  return candidates.sort((a,b)=>a.from.localeCompare(b.from)).slice(0,limit);
}
