export const DIRECTORY_TENANT_ID = "j-packaging";

export type RegistryStore = { id:string; name:string; display_name?:string|null; bigseller_name:string; platform:string };

const canonicalIdByDirectoryName:Record<string,string>={
  "skindae sg by ctg4u":"shopee-skindae-sg",
  "skindae sg":"shopee-skindae-sg",
};

export function canonicalStoreId(id:string) {
  return id === "shopee-skindae-sg-by-ctg4u" ? "shopee-skindae-sg" : id;
}

export function canonicalIdForDirectoryName(name:string) {
  return canonicalIdByDirectoryName[name.toLowerCase()]??`shopee-${name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}`;
}

export function matchingStore(name:string,stores:RegistryStore[]) {
  const explicit=canonicalIdByDirectoryName[name.toLowerCase()];
  // Explicit SG identities never fall through to a name alias or a MY store.
  if(explicit)return stores.find(store=>store.id===explicit&&storeZone(store)==="Asia/Singapore");
  const lowered=name.toLowerCase();
  return stores.find(store=>canonicalStoreId(store.id)===store.id&&(store.name.toLowerCase()===lowered||store.bigseller_name.toLowerCase()===lowered||store.id===canonicalIdForDirectoryName(name)));
}

export function platformForDirectoryName(name:string) {
  return /\bSG\b|Singapore|\.sg$/i.test(name)?"Shopee SG":"Shopee MY";
}

export function storeZone(store:{platform:string}) {
  return /\bSG\b|Singapore/i.test(store.platform) ? "Asia/Singapore" : "Asia/Kuala_Lumpur";
}

export function parseStoreLocal(value:unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  const localCheck = new Date(date.getTime() + 8*60*60*1000).toISOString().slice(0,16);
  return localCheck === value ? date.toISOString() : null;
}

export function storeDateKey(value:Date|string=new Date()) {
  return new Date(new Date(value).getTime()+8*60*60*1000).toISOString().slice(0,10);
}

export function storeCalendarAnchor(value:Date|string=new Date()) {
  return new Date(`${storeDateKey(value)}T00:00:00.000Z`);
}

export function calendarRange(view:"month"|"week"|"list",anchor:Date) {
  const addDays=(date:Date,days:number)=>new Date(date.getTime()+days*86400000);
  let startDay=anchor;
  let endDay:Date;
  if(view==="list")endDay=addDays(anchor,120);
  else if(view==="week") {
    startDay=addDays(anchor,-((anchor.getUTCDay()+6)%7));
    endDay=addDays(startDay,7);
  } else {
    const first=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth(),1));
    startDay=addDays(first,-((first.getUTCDay()+6)%7));
    endDay=addDays(startDay,42);
  }
  const from=new Date(startDay.getTime()-8*60*60*1000).toISOString();
  const to=new Date(endDay.getTime()-8*60*60*1000).toISOString();
  return {from,to,startDay,endDay};
}

export async function readAllCalendarPages<T>(readPage:(offset:number,limit:number)=>Promise<T[]>) {
  const rows:T[]=[];
  const pageSize=500;
  for(let offset=0;;offset+=pageSize) {
    const page=await readPage(offset,pageSize);
    rows.push(...page);
    if(page.length<pageSize)return rows;
  }
}

/** Half-open local-day intersection; an event ending at midnight stays on the prior day. */
export function sessionOccursOnDay(session:{start_at:string;end_at:string},day:Date) {
  const start=day.getTime()-8*60*60*1000;
  return Date.parse(session.start_at)<start+86400000&&Date.parse(session.end_at)>start;
}
