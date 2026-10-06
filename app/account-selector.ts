import { canonicalStoreId } from './live-calendar-model';
import type { AccountMappingCandidate } from './account-contract';
/** Reviewed historical MAP identity -> current selector ID, presentation only.
 * This does not confirm invoice allocation, fee applicability or financial store linkage.
 * SG identities are deliberately independent from MY identities.
 */
const selectorIdByMapping:Record<string,{market:'MY'|'SG';id:string}>={
  MAP0026:{market:'MY',id:'shopee-nomoq-by-ctg4u'},
  MAP0009:{market:'MY',id:'shopee-dr-smile-whitening-by-ctg4u'},
  MAP0010:{market:'MY',id:'shopee-naturelish-eco-plus-by-ctg4u'},
  MAP0102:{market:'MY',id:'shopee-funffy-by-ctg4u'},
  MAP0011:{market:'MY',id:'shopee-ilady-haircare-by-ctg4u'},
  MAP0017:{market:'MY',id:'shopee-m-skinpro-by-ctg4u'},
  MAP0014:{market:'MY',id:'shopee-kata-skincare-malaysia'},
  MAP0028:{market:'MY',id:'shopee-scale-story-official-store'},
  MAP0027:{market:'MY',id:'shopee-scale-gem-collagen-by-ctg4u'},
  MAP0101:{market:'MY',id:'shopee-true-golden-care-by-naturelish'},
  MAP0018:{market:'MY',id:'shopee-master-nerv-official-store'},
  MAP0006:{market:'MY',id:'shopee-biotech-by-swissmed'},
  MAP0005:{market:'MY',id:'shopee-beyoute-official-store'},
  MAP0019:{market:'MY',id:'shopee-mcs-skincare-by-ctg4u'},
  MAP0021:{market:'MY',id:'shopee-mizino-premium'},
  MAP0022:{market:'MY',id:'shopee-mizino-premium'},
  MAP0008:{market:'MY',id:'shopee-ctg4u-malaysia'},
  MAP0030:{market:'MY',id:'shopee-zeero-skincare-official'},
  MAP0004:{market:'MY',id:'shopee-agepros-by-swissmed'},
  MAP0032:{market:'MY',id:'shopee-naturelish-uro360-by-ctg4u'},
  MAP0016:{market:'MY',id:'shopee-livact-official-store'},
  MAP0012:{market:'MY',id:'shopee-jourish-natural-wellness'},
  MAP0007:{market:'MY',id:'shopee-naturelish-bugucare-by-ctg4u'},
  MAP0095:{market:'MY',id:'shopee-naturelish-isokae-by-ctg4u'},
  MAP0023:{market:'MY',id:'shopee-moesie-malaysia'},
  MAP0025:{market:'MY',id:'shopee-ninoko-official-store'},
  MAP0024:{market:'MY',id:'shopee-naturelish-recovit-by-ctg4u'},
  MAP0020:{market:'MY',id:'shopee-mformula-official'},
  MAP0029:{market:'MY',id:'shopee-skindae-my-by-ctg4u'},
  MAP0031:{market:'MY',id:'shopee-yuan-chuan-tang-herbal-by-ctg4u'},
  MAP0002:{market:'MY',id:'shopee-goherb-official-store'},
  MAP0065:{market:'MY',id:'shopee-berlanco-beauty-official'},
  MAP0067:{market:'MY',id:'shopee-bonlife-official-store'},
  MAP0069:{market:'MY',id:'shopee-daionica-official-store'},
  MAP0070:{market:'MY',id:'shopee-dancoly-paris-hq'},
  MAP0003:{market:'MY',id:'shopee-mizino-official-store'},
  MAP0075:{market:'MY',id:'shopee-paw-paws-official'},
  MAP0076:{market:'MY',id:'shopee-petavit-official-store'},
  MAP0071:{market:'MY',id:'shopee-hair-factory-official'},
  MAP0072:{market:'MY',id:'shopee-j-packaging'},
  MAP0073:{market:'MY',id:'shopee-jen-mommy-essential-oil'},
  MAP0042:{market:'SG',id:'shopee-skindae-sg'},
};
export function accountSelectorCandidates(candidates:AccountMappingCandidate[],market:'MY'|'SG',storeNames:Map<string,string>):AccountMappingCandidate[] {
  return candidates.map(candidate=>{
    const audited=selectorIdByMapping[candidate.mappingId];
    // Direct IDs were explicitly reviewed in the snapshot. Financial confirmation is separate.
    const id=audited?.market===market?audited.id:!audited&&candidate.storeId?canonicalStoreId(candidate.storeId):null;
    const name=id?storeNames.get(id):undefined;
    return {mappingId:candidate.mappingId,username:candidate.username,storeId:name!==undefined?id:null,storeName:name??''};
  });
}
