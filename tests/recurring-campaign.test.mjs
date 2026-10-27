import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';

const outputDir=new URL('../node_modules/.recurring-campaign-test/',import.meta.url);
await mkdir(outputDir,{recursive:true});
await build({entryPoints:[new URL('../app/recurring-campaign.ts',import.meta.url).pathname],outfile:new URL('recurring-campaign.mjs',outputDir).pathname,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {defaultRecurringEvent,recurringEventWindow,validateRecurringCampaign,activeRecurringEvent,upcomingRecurringEvents}=await import(pathToFileURL(new URL('recurring-campaign.mjs',outputDir).pathname));

const event=(id,sellingPrice)=>({...defaultRecurringEvent(id),prices:{MY:{originalPrice:100,sellingPrice}}});
const rule=()=>({schema:1,startDate:'2026-10-01',endDate:null,events:[event('dday',90),event('mid_month',85),event('payday',80)]});

test('monthly windows select the matching event and leave other days at normal price',()=>{
  const validated=validateRecurringCampaign(rule(),['MY']);
  assert.deepEqual(recurringEventWindow('2026-10',validated.events[0]),{from:'2026-10-08',to:'2026-10-10'});
  assert.deepEqual(recurringEventWindow('2026-11',validated.events[0]),{from:'2026-11-09',to:'2026-11-11'});
  assert.equal(activeRecurringEvent(validated,'2026-10-09')?.prices.MY.sellingPrice,90);
  assert.equal(activeRecurringEvent(validated,'2026-10-14')?.prices.MY.sellingPrice,85);
  assert.equal(activeRecurringEvent(validated,'2026-10-24')?.prices.MY.sellingPrice,80);
  assert.equal(activeRecurringEvent(validated,'2026-10-12'),null);
  assert.deepEqual(upcomingRecurringEvents(validated,'2026-10-12',2).map(item=>item.id),['mid_month','payday']);
});

test('optional end date stops future campaigns and overlapping windows are rejected',()=>{
  const finite=validateRecurringCampaign({...rule(),endDate:'2026-10-20'},['MY']);
  assert.equal(activeRecurringEvent(finite,'2026-10-24'),null);
  assert.throws(()=>validateRecurringCampaign({...rule(),events:[event('mid_month',85),{...event('payday',80),startDay:15,endDay:16}]},['MY']),/overlaps/);
});

test('every chosen market must have valid event prices',()=>{
  assert.throws(()=>validateRecurringCampaign(rule(),['MY','SG']),/SG original and selling prices/);
  assert.throws(()=>validateRecurringCampaign({...rule(),events:[event('dday',101)]},['MY']),/MY original and selling prices/);
});
