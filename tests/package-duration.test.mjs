import test from 'node:test';import assert from 'node:assert/strict';
import {packageDurationType} from '../app/package-duration.ts';
const long={id:'long',version:1,calculatorSettings:{_longTermLifecycle:true}};
const monthly={id:'monthly',version:2,calculatorSettings:{_packageEnded:false}};
const ended={id:'ended',version:3,calculatorSettings:{_packageEnded:true}};
const prices=new Map([['long',[{priceType:'non_campaign',effectiveTo:null}]],['monthly',[{priceType:'non_campaign',effectiveTo:'2026-10-31'},{priceType:'campaign',effectiveTo:null}]],['ended',[{priceType:'non_campaign',effectiveTo:'2026-10-27'}]]]);
test('campaign-only open end cannot reclassify a fixed normal period as Long Term',()=>{
 assert.equal(packageDurationType(long,[long],prices),'long_term');assert.equal(packageDurationType(monthly,[long,monthly],prices),'monthly');
 assert.equal(packageDurationType(undefined,[],prices),'monthly');
});
test('End Package preserves immediately preceding term type, rather than arbitrary older history',()=>{
 const history=[long,monthly,ended];const before=structuredClone(history);
 assert.equal(packageDurationType(ended,history,prices),'monthly');
 assert.equal(packageDurationType({...ended,version:2},[long,{...ended,version:2}],prices),'long_term');
 assert.deepEqual(history,before);
});
