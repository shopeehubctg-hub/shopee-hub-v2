import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatorSnapshots, packageHistoryChanges, packageHistoryFields, packageHistoryTime, publicCalculatorSettings } from '../app/package-history.ts';

const initial = {
  name: 'Package A', market: 'MY,SG',
  platforms: [{platform:'Shopee',packageSku:'A'}, {platform:'Lazada',packageSku:'LZA'}],
  components: [{inventorySku:'SKU1',name:'Product',quantity:1,kind:'product'}],
  priceSchedules: [
    {market:'MY',priceType:'non_campaign',originalPrice:100,sellingPrice:80,promotionType:'monthly',effectiveFrom:'2026-09-01',effectiveTo:'2026-09-30'},
    {market:'SG',priceType:'campaign',originalPrice:50,sellingPrice:40,promotionType:'custom',effectiveFrom:'2026-09-07',effectiveTo:'2026-09-09'},
    {market:'SG',priceType:'campaign',originalPrice:50,sellingPrice:40,promotionType:'custom',effectiveFrom:'2026-09-24',effectiveTo:'2026-09-25'},
  ],
};

test('history shows old and new prices, dates, SKUs, quantities and names', () => {
  const edited = structuredClone(initial);
  edited.name = 'Package B';
  edited.market = 'MY';
  edited.platforms[0].packageSku = 'B';
  edited.components[0].quantity = 3;
  edited.priceSchedules[0].sellingPrice = 75;
  edited.priceSchedules[0].effectiveTo = '2026-09-29';
  const changes = packageHistoryChanges(initial, edited);
  assert.equal(changes.length, 5);
  assert.deepEqual(changes.find(row=>row.field==='Package name'), {field:'Package name',before:'Package A',after:'Package B'});
  const inventory = changes.find(row=>row.field==='Inventory items');
  assert.match(inventory.before,/×1/); assert.match(inventory.after,/×3/);
  const prices = changes.find(row=>row.field==='Prices & promotion dates');
  assert.match(prices.before,/80\.00/); assert.match(prices.after,/75\.00/);
  assert.match(prices.before,/2026-09-30/); assert.match(prices.after,/2026-09-29/);
  assert.match(prices.after,/S\$ 50\.00 → 40\.00/);
  assert.match(prices.after,/2026-09-24 → 2026-09-25/);
  assert.equal(initial.components[0].quantity,1);
});

test('row ordering does not create false edit history', () => {
  const reordered = structuredClone(initial);
  reordered.market = 'SG,MY';
  reordered.platforms.reverse();
  reordered.priceSchedules.reverse();
  assert.deepEqual(packageHistoryChanges(initial,reordered),[]);
});

test('legacy records remain unknown rather than borrowing current package details', () => {
  assert.equal(packageHistoryFields({})['Package name'], 'Not recorded');
});

test('incomplete legacy price rows do not crash View History', () => {
  const history = packageHistoryFields({
    priceSchedules: [{ market: 'MY', priceType: 'campaign', originalPrice: undefined,
      sellingPrice: undefined, promotionType: 'custom', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10' }],
  });
  assert.match(history['Prices & promotion dates'], /RM Not recorded → Not recorded/);
});

test('initial version and removals retain complete snapshots', () => {
  assert.equal(packageHistoryChanges(undefined,initial).length,5);
  const removed = {...initial,components:[],platforms:[]};
  const changes = packageHistoryChanges(initial,removed);
  assert.equal(changes.find(row=>row.field==='Inventory items').after,'None');
  assert.equal(changes.find(row=>row.field==='Platform listing SKUs').after,'None');
});

test('audit timestamps use Malaysia time and tolerate legacy missing dates', () => {
  assert.match(packageHistoryTime('2026-09-28T10:00:00Z'),/18:00:00 MYT$/);
  assert.equal(packageHistoryTime(''),'Not recorded');
  assert.equal(packageHistoryTime('invalid'),'Not recorded');
});

test('edited package with metadata-only calculator history opens without a calculator snapshot', () => {
  const stored = {
    _packageMetadata: { name: 'Kata Combo C PWP', market: 'MY' },
    _packageHistorySummary: { schema: 1, summary: '配套资料修改' },
  };
  const publicSettings = publicCalculatorSettings(stored);
  assert.equal(publicSettings, null);
  assert.deepEqual(calculatorSnapshots(stored), []);
  assert.deepEqual(calculatorSnapshots(publicSettings), []);
});

test('complete normal and campaign calculator snapshots remain available in history', () => {
  const makeSnapshot = serviceScenario => ({
    source: 'Shopee Pricing Calculator', serviceScenario, category: 'Skincare',
    facebookPrice: 100, suggestedShopeePrice: 120, commissionRate: 9.72,
    serviceRate: 5.94, actualPayout: 80,
  });
  const normal = makeSnapshot('Non-Campaign Day');
  const campaign = makeSnapshot('Campaign Day');
  const stored = {
    scenarios: [normal, campaign],
    _packageMetadata: { name: 'Kata Combo C PWP' },
    _packageHistorySummary: { schema: 1, summary: '配套资料修改' },
  };
  assert.deepEqual(publicCalculatorSettings(stored), { scenarios: [normal, campaign] });
  assert.deepEqual(calculatorSnapshots(publicCalculatorSettings(stored)), [normal, campaign]);
  assert.deepEqual(publicCalculatorSettings({ ...normal, _packageHistorySummary: stored._packageHistorySummary }), normal);
  assert.deepEqual(calculatorSnapshots({ scenarios: [{ serviceScenario: 'Campaign Day' }, campaign] }), [campaign]);
  assert.deepEqual(calculatorSnapshots({ scenarios: [{ ...campaign, discountValue: 'invalid' }, campaign] }), [campaign]);
});
