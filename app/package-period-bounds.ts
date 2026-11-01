type Period = {market:string;priceType:string;effectiveFrom:string;effectiveTo:string|null};

// Campaign prices cannot outlive a finite package's Normal Day availability.
// Apply this to legacy finite packages too, not just former long-term ones.
export function boundCampaignPeriods<T extends Period>(schedules:T[]):T[] {
  const result=schedules.map(line=>({...line}));
  for(const market of new Set(result.map(line=>line.market))){
    const normal=result.filter(line=>line.market===market&&line.priceType==="non_campaign");
    if(!normal.length||normal.some(line=>line.effectiveTo===null))continue;
    const end=normal.reduce((last,line)=>line.effectiveTo!>last?line.effectiveTo!:last,"");
    for(let index=result.length-1;index>=0;index--){
      const line=result[index];
      if(line.market!==market||line.priceType!=="campaign")continue;
      if(line.effectiveFrom>end)result.splice(index,1);
      else if(line.effectiveTo===null||line.effectiveTo>end)line.effectiveTo=end;
    }
    if(!result.some(line=>line.market===market&&line.priceType==="campaign")){
      result.push({...normal[0],priceType:"campaign"});
    }
  }
  return result;
}
