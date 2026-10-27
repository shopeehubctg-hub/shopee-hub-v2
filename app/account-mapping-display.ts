import type { AccountStoreRow } from './account-contract';
/** Selector presentation only; a unique live candidate does not create a financial binding. */
export function accountMappingDisplay(row:Pick<AccountStoreRow,'storeId'|'storeName'|'candidates'>){
 const candidates=[...new Map((row.candidates??[]).filter(item=>item.storeId&&item.storeName.trim()).map(item=>[item.storeId!,item])).values()];
 const names=row.storeId?[row.storeName]:candidates.map(item=>item.storeName);
 return {candidates,names,needsReview:names.length!==1};
}
