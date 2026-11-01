type Shop={name:string;storeId:string|null;salesCents:number;observed:boolean;rank:number};
type Board={shops:Shop[];pending:Array<{name:string}>;totalCents:number|null;status:unknown;currency:string;updated:string|null};
/** Scope before serializing: never expose global ranks, totals or missing-store names. */
export function scopeLeaderboard(board:Board,allBoard:boolean,allowed:Set<string>):Board & {scope:"all"|"assigned"}{
 const shops=board.shops.filter(shop=>allBoard||shop.storeId!==null&&allowed.has(shop.storeId)).sort((a,b)=>b.salesCents-a.salesCents||a.name.localeCompare(b.name));
 let rank=0;
 const ranked=shops.map((shop,index)=>{if(index===0||shop.salesCents!==shops[index-1].salesCents)rank=index+1;return {...shop,rank:board.status==='pending'?0:rank};});
 const pending=ranked.filter(shop=>!shop.observed).map(shop=>({name:shop.name}));
 const total=board.totalCents===null?null:ranked.reduce((sum,shop)=>sum+(shop.observed?shop.salesCents:0),0);
 if(total!==null&&!Number.isSafeInteger(total))throw Error('Invalid scoped total');
 return {...board,scope:allBoard?"all":"assigned",shops:ranked,pending,totalCents:total,status:board.status==='pending'?'pending':!ranked.length?'pending':pending.length?'partial':'complete'};
}
