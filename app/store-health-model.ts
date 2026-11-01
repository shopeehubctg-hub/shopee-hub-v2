import type {SourceStore} from './source-store-mapping';
export const HEALTH_METRICS=[
 {key:'penalty_points',label:'Penalty points',unit:''},
 {key:'nfr',label:'Non-fulfilment rate',unit:'%'},
 {key:'lsr',label:'Late shipment rate',unit:'%'},
 {key:'fhr',label:'Fast handover rate',unit:'%'},
 {key:'response_rate',label:'Response rate',unit:'%'},
 {key:'rating',label:'Shop rating',unit:'/ 5'},
] as const;
export type HealthMetricKey=typeof HEALTH_METRICS[number]['key'];
export type HealthMetrics=Record<HealthMetricKey,number|null>;
export type StoreHealthRow={storeId:string;storeName:string;checkDate:string;metrics:HealthMetrics;flags:HealthMetricKey[];state:'attention'|'no_flags'|'incomplete'};
export type StoreHealthData={stores:StoreHealthRow[];selectedStoreId:string;latestCheckDate:string|null};
export type HealthSourceRow={check_date:unknown;store_name:unknown;platform?:unknown;created_at?:unknown;failing:unknown}&Partial<Record<HealthMetricKey,unknown>>;
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function metric(value:unknown,key:HealthMetricKey){if(typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value))return null;if(typeof value!=='string'&&typeof value!=='number')return null;const number=Number(value);if(!Number.isFinite(number)||number<0)return null;if(key==='penalty_points')return Number.isSafeInteger(number)?number:null;return number<=(key==='rating'?5:100)?number:null;}
function publicMetrics(row:HealthSourceRow){const metrics=Object.fromEntries(HEALTH_METRICS.map(({key})=>[key,metric(row[key],key)])) as HealthMetrics;const flags:HealthMetricKey[]=[];let incomplete=!Array.isArray(row.failing);if(Array.isArray(row.failing))for(const item of row.failing){const key=item&&typeof item==='object'?(item as {key?:unknown}).key:null;if(HEALTH_METRICS.some(metric=>metric.key===key)){if(!flags.includes(key as HealthMetricKey))flags.push(key as HealthMetricKey);}else incomplete=true;}
 return {metrics,flags,state:flags.length?'attention' as const:incomplete||Object.values(metrics).some(value=>value===null)?'incomplete' as const:'no_flags' as const};}
/** Reads only metric values and failing keys. Workflow status and notification contents are never health facts. */
export function buildStoreHealth(rows:HealthSourceRow[],resolve:(name:string)=>SourceStore|null,allowedStoreIds:Set<string>,today:string,selectedStoreId='all'):StoreHealthData{
 const grouped=new Map<string,Array<{row:HealthSourceRow;store:SourceStore}>>();
 for(const row of rows){if(row.platform!=='Shopee'||typeof row.store_name!=='string'||!validDate(row.check_date)||row.check_date>today)continue;const store=resolve(row.store_name);if(!store||!/^Shopee(?:\s|$)/i.test(store.platform)||!allowedStoreIds.has(store.id)||selectedStoreId!=='all'&&store.id!==selectedStoreId)continue;const group=grouped.get(store.id)??[];group.push({row,store});grouped.set(store.id,group);}
 const stores:StoreHealthRow[]=[];
 for(const [storeId,group] of grouped){const sorted=group.sort((a,b)=>String(b.row.check_date).localeCompare(String(a.row.check_date))||String(b.row.created_at??'').localeCompare(String(a.row.created_at??'')));const latest=sorted[0];let values=publicMetrics(latest.row);const ties=group.filter(item=>item.row.check_date===latest.row.check_date&&item.row.created_at===latest.row.created_at);if(ties.some(item=>JSON.stringify(publicMetrics(item.row))!==JSON.stringify(values)))values={metrics:Object.fromEntries(HEALTH_METRICS.map(({key})=>[key,null])) as HealthMetrics,flags:[],state:'incomplete'};
  stores.push({storeId,storeName:latest.store.display_name??latest.store.name,checkDate:String(latest.row.check_date),...values});
 }
 const order={attention:0,incomplete:1,no_flags:2};stores.sort((a,b)=>order[a.state]-order[b.state]||a.storeName.localeCompare(b.storeName));
 return {stores,selectedStoreId,latestCheckDate:stores.map(row=>row.checkDate).sort().at(-1)??null};
}
export function healthMetricText(value:number|null,key:HealthMetricKey){if(value===null)return '—';if(key==='rating')return `${value.toFixed(2)} / 5`;return `${value.toLocaleString('en-MY',{maximumFractionDigits:2})}${key==='penalty_points'?'':'%'}`;}
