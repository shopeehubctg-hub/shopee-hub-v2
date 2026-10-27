type DurationVersion={id:string;version:number;calculatorSettings?:Record<string,unknown>|null};
type DurationPrice={priceType:string;effectiveTo?:string|null};
/** Duration describes the original package term; manual End changes lifecycle, not term type. */
export function packageDurationType(current:DurationVersion|undefined,history:DurationVersion[],pricesByVersion:ReadonlyMap<string,ReadonlyArray<DurationPrice>>):'long_term'|'monthly'{
 const original=current?.calculatorSettings?._packageEnded===true
  ? history.filter(version=>version.version<current.version).sort((a,b)=>b.version-a.version)[0]
  : current;
 const prices=original?pricesByVersion.get(original.id)??[]:[];
 return prices.some(price=>price.priceType==='non_campaign'&&price.effectiveTo===null)?'long_term':'monthly';
}
