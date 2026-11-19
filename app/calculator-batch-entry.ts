import type {PackagePrefill, CalculatorSnapshot} from './calculator-types';
import type {BatchPackage, MarketChoice} from './package-batch-model';
import {snapshotAmounts} from './pricing-evidence';

export type CalculatorEntry = {requestId:string; name:string; scenarios:CalculatorSnapshot[]};
export type CalculatorBatch = {id:string; storeId:string; owner:string; market:MarketChoice; entries:CalculatorEntry[]};

export function calculatorEntries(prefills:PackagePrefill[]):CalculatorEntry[] {
  const groups = new Map<string, CalculatorEntry>();
  for (const item of prefills) {
    if (!item.calculatorGroupId) throw Error('Select the Calculator packages again.');
    let group = groups.get(item.calculatorGroupId);
    if (!group) {
      group = {requestId:crypto.randomUUID(), name:item.name, scenarios:[]};
      groups.set(item.calculatorGroupId, group);
    }
    group.scenarios.push(item.calculatorSettings);
  }
  const entries = [...groups.values()];
  if (!entries.length || entries.length > 500) throw Error('Select between 1 and 500 packages.');
  for (const entry of entries) {
    const periods = new Set(entry.scenarios.map(s => s.pricingPeriod));
    if (entry.scenarios.length !== 3 || !periods.has('campaign') || !periods.has('normal_1_15') || !periods.has('normal_16_end')) {
      throw Error('Complete all three Calculator prices before creating this package.');
    }
  }
  return entries;
}

export function calculatorCells(entry:CalculatorEntry) {
  const prices = snapshotAmounts(entry.scenarios);
  const qty = entry.scenarios[0].mainProductQuantity;
  return {name:entry.name, 'MY.normal':prices.normal.toFixed(2), 'MY.campaign':prices.campaign.toFixed(2),
    'MY.normalLate':prices.normalLate!.toFixed(2), '0.qty':qty ? String(qty) : ''};
}

export async function linkCalculatorRows(batch:CalculatorBatch, rows:BatchPackage[]):Promise<BatchPackage[]> {
  const res = await fetch('/api/calculator-exports', {method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({storeId:batch.storeId, rows:batch.entries})});
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'Unable to link Calculator prices. Try again.');
  if (data.storeId !== batch.storeId || !Array.isArray(data.rows)) throw Error('Unable to verify the Calculator prices for this store.');
  const byRequest = new Map<string,string>(data.rows.map((record:{requestId:string;id:string})=>[record.requestId,record.id]));
  return rows.map(row=>{
    const exportId=byRequest.get(row.id);
    if (!exportId) throw Error('A Calculator price record is missing. Try again.');
    return {...row, exportId, fileStoreId:batch.storeId};
  });
}

// Session-only drafts use a unique handoff ID. The parent checks store and signed-in owner before mounting.
export function readBatchSession<T>(key:string|undefined):T|null {
  try { return key ? JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as T|null : null; }
  catch { return null; }
}
export function writeBatchSession(key:string|undefined, value:unknown) {
  if (!key) return;
  try { window.sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* Edits stay available in memory. */ }
}
