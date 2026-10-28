import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_CODES,MARKET_CONFIG,isMarket,marketFromPlatform,priceMarket,marketMoney,marketDate} from '../app/markets.ts';

test('four markets retain their own currencies and legacy SG price identities',()=>{
  assert.deepEqual(MARKET_CODES,['MY','SG','TH','PH']);
  for(const [market,currency,symbol] of [['MY','MYR','RM'],['SG','SGD','S$'],['TH','THB','฿'],['PH','PHP','₱']]){
    assert.equal(MARKET_CONFIG[market].currency,currency);
    assert.equal(marketFromPlatform(`Shopee ${market}`),market);
    assert.equal(priceMarket(market,currency),market);
    assert.equal(marketMoney(12345,market,true),`${symbol} 123.45`);
    assert.equal(isMarket(market),true);
  }
  assert.equal(isMarket('XX'),false);
  assert.equal(priceMarket('MY','SGD'),'SG');
  assert.equal(priceMarket('SG','MYR'),'SG');
  assert.equal(priceMarket('MY','THB'),'TH');
  assert.equal(priceMarket('MY','PHP'),'PH');
});

test('Thailand uses its local date at the Malaysia midnight boundary',()=>{
  const instant=new Date('2026-10-27T16:30:00Z');
  assert.equal(marketDate('TH',instant),'2026-10-27');
  for(const market of ['MY','SG','PH'])assert.equal(marketDate(market,instant),'2026-10-28');
});
