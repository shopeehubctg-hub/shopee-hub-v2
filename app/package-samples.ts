import type { MarketCode } from './markets';
import type { PackageItem } from './package-control';

// Presentation fixtures only. Never submit these IDs to package write/export APIs.
export function packageSamples(storeId:string,storeName:string):PackageItem[] {
  const rows:Array<{name:string;status:string;market?:MarketCode;long?:boolean;sg?:boolean;start?:string;end?:string;sync?:PackageItem['sheetSyncStatus'];pending?:number;gift?:boolean}>=[
    {name:'Daily Wellness · 日常保健套装',status:'active',long:true,gift:true},
    {name:'October Beauty Bundle',status:'active',sg:true},
    {name:'Family Value Pack',status:'active',long:true,sg:true},
    {name:'11.11 Mega Sale Bundle',status:'scheduled',start:'2026-11-01',end:'2026-11-30'},
    {name:'New Launch Starter Kit',status:'draft',sync:'not_sent'},
    {name:'Premium Gift Collection',status:'review',sync:'not_sent',gift:true},
    {name:'September Saver',status:'expired',start:'2026-09-01',end:'2026-09-30'},
    {name:'Hydration Duo · Updated price',status:'active',sync:'failed',pending:3},
    {name:'Thailand Wellness · ชุดสุขภาพ',status:'active',market:'TH',long:true},
    {name:'Philippines Monthly Essentials',status:'active',market:'PH'},
  ];
  return rows.map((row,index)=>{
    const id=`sample-package-${index+1}`,from=row.start??'2026-10-01',to=row.long?null:row.end??'2026-10-31';
    const market=row.market??'MY';
    const normal=89.9+index*20,campaign=normal-10,original=normal+60;
    const components:PackageItem['components']=[{inventorySku:`DEMO-P${index+1}`,name:'Sample main product',quantity:index%3+1,kind:'product'},...(row.gift?[{inventorySku:'DEMO-GIFT',name:'Travel pouch',quantity:1,kind:'gift' as const}]:[])];
    const platforms:PackageItem['platforms']=[{platform:'Shopee',packageSku:`DEMO-SHP-${index+1}`},...(index%2===0?[{platform:'Lazada' as const,packageSku:`DEMO-LAZ-${index+1}`}]:[])];
    const priceSchedules:NonNullable<PackageItem['priceSchedules']>=[{market,priceType:'non_campaign',originalPrice:original,sellingPrice:normal,promotionType:row.long?'custom':'monthly',effectiveFrom:from,effectiveTo:to}];
    if(!row.long)priceSchedules.push({market,priceType:'campaign',originalPrice:original,sellingPrice:campaign,promotionType:'custom',effectiveFrom:from.slice(0,7)+'-24',effectiveTo:from.slice(0,7)+'-25'});
    if(row.sg)priceSchedules.push({market:'SG',priceType:'non_campaign',originalPrice:59.9+index*10,sellingPrice:39.9+index*10,promotionType:row.long?'custom':'monthly',effectiveFrom:from,effectiveTo:to});
    return {id,storeId:storeId==='all'?`sample-store-${index%2}`:storeId,storeName:storeId==='all'?(index%2?'Demo Beauty Store':'Demo Wellness Store'):storeName,
      name:row.name,packageSku:platforms[0].packageSku,market:row.sg?'MY,SG':market,status:row.status,version:row.pending?2:index%3+1,pendingVersion:row.pending??null,durationType:row.long?'long_term':'monthly',
      promotionType:row.long?'custom':'monthly',originalPrice:Math.round(original*100),sellingPrice:Math.round(normal*100),effectiveFrom:from,effectiveTo:to,
      components,platforms,priceSchedules,sheetSyncStatus:row.sync??'synced',
      history:[{version:1,name:row.name,market:row.sg?'MY,SG':market,changeNote:'Sample initial version',promotionType:row.long?'custom':'monthly',effectiveFrom:from,effectiveTo:to,createdAt:'2026-10-01T02:00:00Z',createdBy:'Demo Admin',components,platforms,priceSchedules,addedComponents:components,removedComponents:[],sheetSyncStatus:row.sync??'synced'}],
    };
  });
}
