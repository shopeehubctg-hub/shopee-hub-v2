import {and,desc,eq,isNull,sql} from 'drizzle-orm';
import {packages,packageVersions,packagePrices,packagePlatformSkus,packageAuditLog,stores} from '../../../../db/schema';
import {inventoryAccess,inventoryResponseError} from '../../inventory-skus/access';
import {canAccessModule} from '../../../module-access';
import {deploymentTarget,assertDeploymentIsolation} from '../../../deployment-isolation';
import {packageLifecycleStatus,marketToday} from '../../../package-lifecycle';
import {marketFromPlatform} from '../../../markets';
import {exportSnapshots} from '../../../pricing-evidence';
import {findExport} from '../pricing-evidence';
import {inventoryFingerprint} from '../inventory-capture';
import {repricedState,replacementEvidence,repriceSelection,selectedRepriceAmounts,type RepriceType} from '../../../package-repricing';
import {PATCH as retryPackageHistory} from '../route';

export const dynamic='force-dynamic';
const fail=(message:string,status=409)=>Object.assign(Error(message),{status});
export async function POST(request:Request){try{
 if(!['staging','production'].includes(deploymentTarget()))throw fail('Price updates require a configured Dashboard environment.',404);
 assertDeploymentIsolation();
 const b=await request.json();
 const allowed=['storeId','packageId','expectedVersion','requestId','exportId','priceTypes','priceSelection'];
 if(!b||Object.keys(b).some(k=>!allowed.includes(k))||typeof b.storeId!=='string'||typeof b.packageId!=='string'||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.requestId??'')||typeof b.exportId!=='string'||!Array.isArray(b.priceTypes))throw fail('Invalid price update. Reopen the Calculator and review the package.',400);
 const selection=repriceSelection(b.priceSelection);
 const types=[...b.priceTypes].sort() as RepriceType[];
 if(!types.length||types.length>3||new Set(types).size!==types.length||types.some(t=>!['non_campaign','campaign','normal_early','normal_late'].includes(t)))throw fail('Choose Normal Day, Campaign Day, or both.',400);
 const {db,member,user}=await inventoryAccess(b.storeId);
 if(!await canAccessModule(db,member,'calculator'))throw fail('Price Calculator access is required.',403);
 const hash=inventoryFingerprint({packageId:b.packageId,expectedVersion:b.expectedVersion,storeId:b.storeId,exportId:b.exportId,priceTypes:types,priceSelection:selection});
 const receipt=await db.transaction(async tx=>{
  const [item]=await tx.select().from(packages).where(and(eq(packages.id,b.packageId),eq(packages.storeId,b.storeId),eq(packages.tenantId,member.tenantId),isNull(packages.deletedAt))).for('update').limit(1);
  if(!item)throw fail('Package not found or store access denied.',404);
  const [prior]=await tx.select().from(packageVersions).where(and(eq(packageVersions.packageId,item.id),sql`${packageVersions.calculatorSettings}->'_calculatorReprice'->>'requestId'=${b.requestId}`)).limit(1);
  if(prior){const ref=prior.calculatorSettings?._calculatorReprice as {hash:string;actor:string};if(ref.hash!==hash||ref.actor!==user.email)throw fail('This request was already used for different price settings.');return {packageId:item.id,version:prior.version,sheetSyncStatus:prior.sheetSyncStatus,replayed:true};}
  const [previous]=await tx.select().from(packageVersions).where(eq(packageVersions.packageId,item.id)).orderBy(desc(packageVersions.version)).limit(1);
  if(!previous||previous.version!==b.expectedVersion)throw fail('This package changed after you opened it. Refresh and review its latest version.');
  if(previous.sheetSyncStatus!=='synced')throw fail('Finish the pending History sync before updating this package.');
  const [prices,platforms,store]=await Promise.all([
   tx.select().from(packagePrices).where(eq(packagePrices.versionId,previous.id)),
   tx.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,previous.id)),
   tx.select({platform:stores.platform}).from(stores).where(and(eq(stores.id,item.storeId),eq(stores.tenantId,member.tenantId))).limit(1),
  ]);
  if(!store.length||['draft','review','expired'].includes(item.status)||!['active','scheduled'].includes(packageLifecycleStatus(prices,previous.calculatorSettings,marketToday(marketFromPlatform(store[0].platform)))))throw fail('Only active or scheduled packages can have prices updated here.');
  const snapshot=await findExport(tx,member.tenantId,item.storeId,b.exportId);
  const scenarios=exportSnapshots({scenarios:snapshot.scenarios});
  const amounts=selectedRepriceAmounts(scenarios,previous.calculatorSettings,types,selection);
  const state=repricedState(prices,previous.calculatorSettings,types,amounts);
  const legacyNormal=scenarios.find(s=>s.pricingPeriod===selection.normalSourcePeriod);
  const appliedScenarios=previous.calculatorSettings?._pricingMode!=='split_normal'&&previous.calculatorSettings?._pricingMode!=='uniform'&&legacyNormal
   ?[...scenarios.filter(s=>s.serviceScenario==='Campaign Day'),{...legacyNormal,calculationKind:undefined,pricingMode:'normal_campaign' as const,pricingPeriod:'normal_all' as const}]:scenarios;
  const evidence={...replacementEvidence(previous.calculatorSettings,appliedScenarios,types,{...snapshot,...amounts},state.prices,user.email),recommendations:scenarios,priceSelection:selection,...(previous.calculatorSettings?._pricingMode==='uniform'&&selection.uniformSourcePeriod?{priceApplication:{mode:'uniform' as const,sourcePeriod:selection.uniformSourcePeriod},originalPrices:{MY:{normal:snapshot.normal,campaign:snapshot.campaign,normalLate:snapshot.normalLate}}}:{})};
  const versionId=crypto.randomUUID(),version=previous.version+1;
  const summary=`Calculator price update · ${types.map(t=>t==='campaign'?'Campaign Day':t==='normal_late'?'Normal 16th–End':t==='normal_early'?'Normal 1st–15th':'Normal Day').join(' + ')} · MY · Package periods retained`;
  await tx.insert(packageVersions).values({id:versionId,packageId:item.id,version,components:previous.components,promotionType:previous.promotionType,addedComponents:[],removedComponents:[],sheetSyncStatus:'pending',calculatorSettings:{...previous.calculatorSettings,scenarios:evidence.scenarios,_pricingEvidence:evidence,_recurringCampaign:state.recurring,_normalMonthlyRule:state.normalRule,_samePricing:state.samePricing,_calculatorReprice:{requestId:b.requestId,hash,actor:user.email,previousVersion:previous.version,exportId:b.exportId,priceTypes:types,priceSelection:selection},_packageHistorySummary:{schema:1,summary}},changeNote:summary,effectiveFrom:previous.effectiveFrom,effectiveTo:previous.effectiveTo,createdBy:user.email});
  for(const p of state.prices){const {id,versionId:oldVersion,createdAt,createdBy,...values}=p;void id;void oldVersion;void createdAt;void createdBy;await tx.insert(packagePrices).values({...values,id:crypto.randomUUID(),versionId,createdBy:user.email});}
  for(const p of platforms){const {id,versionId:oldVersion,createdAt,...values}=p;void id;void oldVersion;void createdAt;await tx.insert(packagePlatformSkus).values({...values,id:crypto.randomUUID(),versionId});}
  await tx.insert(packageAuditLog).values({packageId:item.id,action:'calculator_price_updated',detail:`Version ${version}: ${summary}`,actor:user.email});
  return {packageId:item.id,version,sheetSyncStatus:'pending',replayed:false};
 });
 if(receipt.sheetSyncStatus==='synced')return Response.json({ok:true,saved:true,...receipt},{headers:{'Cache-Control':'private, no-store'}});
 // Reuse the environment-isolated publisher and the saved version's existing Change ID.
 try{
 const publish=await retryPackageHistory(new Request(new URL('/api/packages',request.url),{method:'PATCH',headers:request.headers,body:JSON.stringify({action:'retry',packageId:receipt.packageId,expectedVersion:receipt.version})}));
 const result=await publish.json();
 return Response.json({...receipt,...result,saved:true},{status:publish.status,headers:{'Cache-Control':'private, no-store'}});
 }catch{ return Response.json({...receipt,ok:false,saved:true,error:'Prices are saved. History confirmation is pending; retry this update to confirm its result.'},{status:503,headers:{'Cache-Control':'private, no-store'}}); }
 }catch(error){return inventoryResponseError(error);}}
