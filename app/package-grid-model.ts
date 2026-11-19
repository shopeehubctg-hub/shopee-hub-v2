import { batchIssues, batchMarkets, type BatchPackage, type MarketChoice, type BatchMarket } from './package-batch-model';
import type { InventoryProduct } from './inventory-catalog-model';
import { inventoryKey, MAX_INVENTORY_ITEMS } from './inventory-items';
import type {CalculatorEntry} from './calculator-batch-entry';
import {adjustedPrices,snapshotAmounts} from './pricing-evidence';
import { MARKET_CONFIG } from './markets';

export const DEFAULT_GRID_ITEM_SLOTS=20;
export const MAX_GRID_ROWS = 500;
export type GridRow = Record<string, string>;
export type GridMode = 'product' | 'sku';
export type GridColumn = { key: string; label: string; group: string; lookup?: 'sku' | 'name' };
const priceLabels = { original: 'Original Price', normal: 'Normal · 1st–15th', campaign: 'Campaign Day', normalLate: 'Normal · 16th–End' };
const platforms = ['Shopee', 'Lazada', 'TikTok'] as const;

const mySellingFields = ['MY.normal', 'MY.campaign', 'MY.normalLate'];
const roundingReason = 'Rounded MY selling prices to the nearest RM.';

export function gridMarketPrices(row:GridRow, market:BatchMarket) {
  return {original:row[market+'.original']?.trim() ?? '', normal:row[market+'.normal']?.trim() ?? '',
    campaign:row[market+'.campaign']?.trim() ?? '', normalLate:row[market+'.normalLate']?.trim() ?? ''};
}

export function roundMYPrices(row:GridRow, entry:CalculatorEntry):GridRow {
  const changes:GridRow = {};
  for (const field of mySellingFields) {
    const raw = row[field]?.trim();
    if (!raw || !/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(raw)) continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const rounded = String(Math.round(amount));
    if (raw !== rounded) changes[field] = rounded;
  }
  if (!Object.keys(changes).length) return row;
  const amountChanged = Object.keys(changes).some(field => Number(row[field]) !== Number(changes[field]));
  if (amountChanged && !row.priceAdjustmentReason?.trim() && !adjustedPrices({MY:gridMarketPrices(row,'MY')},snapshotAmounts(entry.scenarios))) {
    changes.priceAdjustmentReason = roundingReason;
  }
  return {...row,...changes};
}

export function indexGridProducts(products:InventoryProduct[]) {
  const byName=new Map<string,InventoryProduct|null>(), bySku=new Map<string,InventoryProduct>();
  for(const product of products){
    const key=inventoryKey(product.name);
    byName.set(key,byName.has(key)?null:product);
    bySku.set(inventoryKey(product.sku),product);
  }
  return {name:byName,sku:bySku};
}

export function editGridCells(previous:GridRow, changes:GridRow, library?:ReturnType<typeof indexGridProducts>):GridRow {
  const next={...previous,...changes};
  if (previous.priceAdjustmentReason === roundingReason && mySellingFields.some(field =>
    field in changes && Number(previous[field]) !== Number(changes[field]))) next.priceAdjustmentReason = '';
  if(!library)return next;
  for(const [key,value] of Object.entries(changes)){
    const [slot,field]=key.split('.');
    if(field!=='name' && field!=='sku')continue;
    const other=field==='name'?'sku':'name', partner=slot+'.'+other;
    if(partner in changes && changes[partner].trim())continue;
    if(!value.trim() && partner in changes)continue;
    const saved=library.sku.get(inventoryKey(previous[slot+'.sku']??''));
    if(saved && inventoryKey(saved.name)===inventoryKey(previous[slot+'.name']??''))next[partner]='';
    const match=library[field].get(inventoryKey(value));
    if(match && !next[partner]?.trim())next[partner]=match[other];
  }
  return next;
}

export function gridColumns(choice: MarketChoice, slots: number, mode: GridMode): GridColumn[] {
  const columns: GridColumn[] = [{key: 'name', label: 'Package Name', group: 'Package'}];
  for (const market of batchMarkets(choice)) {
    for (const [key, label] of Object.entries(priceLabels)) {
      columns.push({key: market + '.' + key, label, group: market + ' · ' + MARKET_CONFIG[market].symbol});
    }
  }
  for (const key of platforms) columns.push({key, label: key + ' SKU', group: 'Platform SKUs'});
  for (let slot = 0; slot < slots; slot++) {
    const group = 'Inventory item ' + (slot + 1);
    const name: GridColumn = {key: slot + '.name', label: 'Product Name', group, lookup: 'name'};
    const sku: GridColumn = {key: slot + '.sku', label: 'Inventory SKU', group, lookup: 'sku'};
    columns.push(mode === 'product' ? name : sku, {key:slot + '.qty', label:'Qty', group}, mode === 'product' ? sku : name);
  }
  return columns;
}

// Spreadsheet clipboards quote cells containing tabs, double quotes, or line breaks.
export function clipboardRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && quoted && raw[i + 1] === '"') { cell += '"'; i++; continue; }
    if (ch === '"' && (quoted || cell === '')) { quoted = !quoted; continue; }
    if (!quoted && ch === '\t') { row.push(cell); cell = ''; continue; }
    if (!quoted && (ch === '\r' || ch === '\n')) {
      if (ch === '\r' && raw[i+1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; continue;
    }
    cell += ch;
  }
  if (quoted) throw Error('The pasted cells contain an unclosed quote.');
  if (cell || row.length || !rows.length) rows.push([...row, cell]);
  return rows;
}

export function pasteGrid(rows: GridRow[], choice: MarketChoice, mode: GridMode, slots: number,
                         rowIndex: number, colIndex: number, text: string, library?:ReturnType<typeof indexGridProducts>) {
  const data = clipboardRows(text);
  if (rowIndex + data.length > MAX_GRID_ROWS) throw Error('Paste up to 500 package rows at a time.');
  const fixedColumns = gridColumns(choice, 0, mode).length;
  const width = Math.max(...data.map(row => row.length));
  const nextSlots = Math.max(slots, Math.ceil((colIndex + width - fixedColumns) / 3));
  if (nextSlots > MAX_INVENTORY_ITEMS) throw Error(`Use up to ${MAX_INVENTORY_ITEMS} inventory items per package.`);
  const columns = gridColumns(choice, nextSlots, mode);
  const nextRows = [...rows];
  data.forEach((values, offset) => {
    const changes:GridRow = {};
    values.forEach((value, col) => { changes[columns[colIndex + col].key] = value.trim(); });
    nextRows[rowIndex + offset] = editGridCells(nextRows[rowIndex + offset]??{},changes,library);
  });
  return {rows: nextRows, slots: nextSlots};
}

export function gridReview(grid: GridRow[], choice: MarketChoice, slots: number, products: InventoryProduct[], entries?: CalculatorEntry[]) {
  const rows: BatchPackage[] = [];
  const issues: {row: number; message: string; fields: string[]}[] = [];
  const positions: number[] = [];
  const bySku = new Map(products.map(product => [inventoryKey(product.sku), product]));
  const byName = new Map<string, InventoryProduct[]>();
  for (const product of products) {
    const key = inventoryKey(product.name);
    byName.set(key, [...byName.get(key) ?? [], product]);
  }
  grid.forEach((draft, index) => {
    if (!entries && !Object.values(draft).some(value => value.trim())) return;
    const get = (key: string) => (draft[key] ?? '').trim();
    const prices: BatchPackage['prices'] = {};
    for (const market of batchMarkets(choice)) {
      prices[market] = gridMarketPrices(draft, market);
    }
    const items: BatchPackage['items'] = [];
    for (let slot = 0; slot < slots; slot++) {
      const name = get(slot + '.name'), sku = get(slot + '.sku'), quantity = get(slot + '.qty');
      if (!name && !sku && !quantity) continue;
      const matches = byName.get(inventoryKey(name)) ?? [];
      const saved = sku ? bySku.get(inventoryKey(sku)) : matches.length === 1 ? matches[0] : undefined;
      let message = '';
      if (saved && name && inventoryKey(saved.name) !== inventoryKey(name)) message = 'Product name does not match this inventory SKU.';
      else if (name && !sku && !saved) message = matches.length > 1 ? 'Several products have this name. Enter the inventory SKU.' : 'Enter an inventory SKU for this new product.';
      if (message) issues.push({row:index, message, fields:[slot + '.name', slot + '.sku']});
      items.push({sku:saved?.sku ?? sku, name:saved?.name ?? name, quantity, uiKey:String(slot)});
    }
    positions.push(index);
    const entry = entries?.[index];
    if (entry && adjustedPrices(prices,snapshotAmounts(entry.scenarios)) && !get('priceAdjustmentReason')) {
      issues.push({row:index, message:'Enter a reason for changing the Calculator price.', fields:['priceAdjustmentReason']});
    }
    rows.push({id:entry?.requestId ?? 'grid-' + index, priceAdjustmentReason:get('priceAdjustmentReason') || undefined, name:get('name'), prices, pricingMode:'split_normal', skus:{Shopee:get('Shopee'), Lazada:get('Lazada'), TikTok:get('TikTok')}, items, dates:null, catalogRequired:true});
  });
  rows.forEach((pkg, i) => {
    for (const message of batchIssues(pkg, rows, false)) {
      let fields: string[] = [];
      const [prefix, detail] = message.split(' ');
      if (prefix === 'Package') fields = ['name'];
      else if (prefix === 'Platform') fields = [...platforms];
      else if (platforms.some(platform => platform === prefix)) fields = [prefix];
      else if (prefix.startsWith('Inventory')) {
        const item = Number.parseInt(detail, 10) - 1;
        const slot = pkg.items[item]?.uiKey ?? '0';
        fields = [slot + '.name', slot + '.sku', slot + '.qty'];
      } else if (prefix in MARKET_CONFIG) {
        const key = detail === 'late-month' ? 'normalLate' : detail?.toLowerCase();
        fields = key in priceLabels ? [prefix + '.' + key] : Object.keys(priceLabels).map(k => prefix + '.' + k);
      }
      issues.push({row:positions[i], message, fields});
    }
  });
  return {rows, issues};
}
