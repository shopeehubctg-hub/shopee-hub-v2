"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryProduct } from './inventory-catalog-model';
import { inventoryKey, MAX_INVENTORY_ITEMS } from './inventory-items';
import { batchMarkets, marketChoices, marketChoiceLabel, type BatchPackage, type MarketChoice } from './package-batch-model';
import { gridColumns, gridReview, MAX_GRID_ROWS, pasteGrid, type GridMode, type GridRow } from './package-grid-model';

import {calculatorCells,readBatchSession,writeBatchSession,type CalculatorBatch} from './calculator-batch-entry';
import {adjustedPrices,snapshotAmounts} from './pricing-evidence';

type GridDraft = {rows:GridRow[];choice:MarketChoice;mode:GridMode;slots:number};
const pageSize = 12;
export function PackageEntryGrid({storeId, busy, onEdit, onReview, calculatorBatch}: {
  calculatorBatch?:CalculatorBatch; storeId: string; busy: boolean; onEdit: () => void; onReview: (rows: BatchPackage[]) => void;
}) {
  const draftKey=calculatorBatch && 'calculator-grid:'+calculatorBatch.id;
  const [draft]=useState(()=>readBatchSession<GridDraft>(draftKey));
  const [rows, setRows] = useState<GridRow[]>(()=>draft?.rows ?? calculatorBatch?.entries.map(calculatorCells) ?? [{},{},{}]);
  const [choice, setChoice] = useState<MarketChoice>(draft?.choice ?? calculatorBatch?.market ?? 'MY');
  const [mode, setMode] = useState<GridMode>(draft?.mode ?? 'product');
  const [slots, setSlots] = useState(draft?.slots ?? 1);
  useEffect(()=>writeBatchSession(draftKey,{rows,choice,mode,slots}),[draftKey,rows,choice,mode,slots]);
  const [page, setPage] = useState(0);
  const [validate, setValidate] = useState(false);
  const [message, setMessage] = useState('');
  const [products, setProducts] = useState<InventoryProduct[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const table = useRef<HTMLTableElement>(null);
  const focusTarget = useRef<[number,number] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setProducts(null); setCatalogError('');
    (async () => {
      try {
        const res = await fetch('/api/inventory-skus?storeId=' + encodeURIComponent(storeId), {cache:'no-store', signal:controller.signal});
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.products)) throw Error(data.error || 'Unable to load the product library.');
        if (!controller.signal.aborted) setProducts(data.products);
      } catch (err) {
        if (!controller.signal.aborted) setCatalogError(err instanceof Error ? err.message : 'Unable to load the product library.');
      }
    })();
    return () => controller.abort();
  }, [storeId, attempt]);
  const columns = gridColumns(choice, slots, mode);
  const groups: {label:string; width:number}[] = [];
  for (const col of columns) {
    const group = groups[groups.length - 1];
    if (group?.label === col.group) group.width++;
    else groups.push({label:col.group, width:1});
  }
  const issues = useMemo(() => validate ? gridReview(rows, choice, slots, products ?? [], calculatorBatch?.entries).issues : [], [rows, choice, slots, products, validate, calculatorBatch]);
  const goToCell = (row:number, col:number) => {
    if (row < 0 || row >= (calculatorBatch?.entries.length ?? MAX_GRID_ROWS)) return;
    setRows(current => current.length > row ? current : [...current, {}]);
    focusTarget.current = [row,col];
    setPage(Math.floor(row / pageSize));
    const input = table.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (input) { input.focus(); focusTarget.current = null; }
  };
  useEffect(() => {
    if (!focusTarget.current) return;
    const [row,col] = focusTarget.current;
    table.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`)?.focus();
    focusTarget.current = null;
  }, [page, rows]);
  function changeMarket(next: MarketChoice) {
    const removed = batchMarkets(choice).filter(code => !batchMarkets(next).includes(code));
    if (removed.some(code => rows.some(row => Object.entries(row).some(([key,v]) => key.startsWith(code + '.') && v.trim())))) {
      if (!window.confirm('Only prices for the selected markets will go to review. Switch markets?')) return;
    }
    setChoice(next); setMessage(''); if (rows.some(row => Object.values(row).some(Boolean))) onEdit();
  }
  function review() {
    if (!products) return;
    const result = gridReview(rows, choice, slots, products, calculatorBatch?.entries);
    setValidate(true);
    if (!result.rows.length) { setMessage('Enter at least one package.'); return; }
    if (result.issues.length) {
      setMessage(''); const first = result.issues[0];
      goToCell(first.row, Math.max(0, columns.findIndex(c => first.fields.includes(c.key))));
      return;
    }
    setMessage(''); onReview(result.rows);
  }
  const start = page * pageSize;
  return <div className="batch-grid-panel">
    <div className="batch-grid-tools">
      <label className="batch-country-picker">Markets<select value={choice} disabled={busy} onChange={e=>changeMarket(e.target.value as MarketChoice)}>{marketChoices.map(m=><option key={m} value={m}>{marketChoiceLabel(m)}</option>)}</select></label>
      <label className="batch-country-picker">Inventory entry<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as GridMode)}><option value="product">By Product</option><option value="sku">By SKU</option></select></label>
      <button type="button" className="batch-secondary" disabled={busy || slots >= MAX_INVENTORY_ITEMS} onClick={()=>setSlots(slots+1)}>+ Item column</button>
    </div>
    <p id="batch-grid-help">{calculatorBatch ? 'Your three Calculator prices are filled in. Add original prices, platform SKUs and products for the selected packages.' : 'One package per row.'} Paste multiple rows, or use Tab to move across and Enter to move down.</p>
    {catalogError && <p role="alert" className="batch-error">{catalogError} <button type="button" className="batch-text-button" onClick={()=>setAttempt(attempt+1)}>Retry product library</button></p>}
    {!catalogError && !products && <p role="status">Loading product library…</p>}
    {products && !products.length && <p className="batch-muted">Your product library is empty. Enter a product name and inventory SKU for each new product.</p>}
    {message && <p role="alert" className="batch-error">{message}</p>}
    {!!issues.length && <p role="alert" className="batch-error">Check the highlighted cells in {new Set(issues.map(issue => issue.row)).size} package row(s).</p>}
    <datalist id="batch-grid-names">{products?.map(p=><option key={p.sku} value={p.name}>{p.sku}</option>)}</datalist>
    <datalist id="batch-grid-skus">{products?.map(p=><option key={p.sku} value={p.sku}>{p.name}</option>)}</datalist>
    <div className="batch-grid-scroll" role="region" aria-label="Package entry table" tabIndex={0}>
      <table ref={table} className="batch-entry-table" aria-label="Batch package entry" aria-describedby="batch-grid-help">
        <thead><tr><th scope="col" rowSpan={2}>Row</th>{groups.map(g=><th key={g.label} scope="colgroup" colSpan={g.width}>{g.label}</th>)}{!calculatorBatch&&<th rowSpan={2} scope="col">Action</th>}</tr>
        <tr>{columns.map(col=><th key={col.key} scope="col">{col.label}</th>)}</tr></thead>
        <tbody>{rows.slice(start,start+pageSize).map((draft, offset) => {
          const index = start + offset;
          const entry=calculatorBatch?.entries[index];
          const adjusted=entry && adjustedPrices({MY:{normal:draft['MY.normal']??'', campaign:draft['MY.campaign']??'', normalLate:draft['MY.normalLate']??''}},snapshotAmounts(entry.scenarios));
          const rowIssues = issues.filter(issue=>issue.row===index);
          return <Fragment key={index}><tr><th scope="row">{index+1}</th>{columns.map((col,c)=>{
            const slot = col.key.split('.')[0];
            let hint = '';
            if (col.lookup) {
              const byName = col.lookup === 'sku';
              const otherKey = byName ? 'name' : 'sku';
              const value = inventoryKey(draft[slot+'.'+otherKey] ?? '');
              const matches = value ? products?.filter(p=>inventoryKey(p[otherKey])===value) : undefined;
              hint = matches?.length===1 ? matches[0][col.lookup] : '';
            }
            const invalid = rowIssues.some(issue=>issue.fields.includes(col.key));
            return <td key={col.key}><input data-row={index} data-col={c} aria-label={`Row ${index+1} · ${col.group} · ${col.label}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? 'grid-errors-'+index : undefined}
              disabled={busy} list={col.lookup==='name'?'batch-grid-names':col.lookup==='sku'?'batch-grid-skus':undefined} placeholder={hint} value={draft[col.key] ?? ''}
              onChange={e=>{const value=e.target.value;setRows(current=>current.map((row,i)=>i===index?{...row,[col.key]:value}:row));setMessage('');onEdit();}}
              onKeyDown={e=>{if(e.key==='Enter' && !e.nativeEvent.isComposing){e.preventDefault();goToCell(index+(e.shiftKey?-1:1),c);}}}
              onPaste={e=>{
                const raw=e.clipboardData.getData('text/plain');if(!/[\r\n\t]/.test(raw))return;
                e.preventDefault();
                try {const next=pasteGrid(rows,choice,mode,slots,index,c,raw);if(calculatorBatch && next.rows.length>rows.length)throw Error('Paste within the selected Calculator rows.');setRows(next.rows);setSlots(next.slots);setMessage('');onEdit();}
                catch(err){setMessage((err as Error).message);}
              }}/></td>;
          })}{!calculatorBatch&&<td><button type="button" className="batch-text-button" aria-label={'Duplicate row '+(index+1)} disabled={busy||rows.length>=MAX_GRID_ROWS||!Object.values(draft).some(Boolean)}
            onClick={()=>{setRows([...rows.slice(0,index+1),{...draft},...rows.slice(index+1)]);setPage(Math.floor((index+1)/pageSize));onEdit();}}>Duplicate</button></td>}</tr>
          {adjusted&&<tr><td colSpan={columns.length+1}><label>Price change reason <input aria-label={'Row '+(index+1)+' price change reason'} value={draft.priceAdjustmentReason??''} disabled={busy} onChange={e=>{const reason=e.target.value;setRows(current=>current.map((row,i)=>i===index?{...row,priceAdjustmentReason:reason}:row));onEdit();}}/></label></td></tr>}
          {!!rowIssues.length&&<tr><td colSpan={columns.length+2} id={'grid-errors-'+index} className="batch-grid-errors">Row {index+1} · {[...new Set(rowIssues.map(i=>i.message))].join(' ')}</td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    <div className="batch-grid-footer">{!calculatorBatch&&<button type="button" disabled={busy||rows.length>=MAX_GRID_ROWS} className="batch-secondary" onClick={()=>goToCell(rows.length,0)}>+ Add row</button>}
      {rows.length>pageSize&&<><button type="button" disabled={page===0} className="batch-text-button" onClick={()=>setPage(page-1)}>Previous</button><span>Rows {start+1}–{Math.min(start+pageSize,rows.length)} of {rows.length}</span><button type="button" disabled={start+pageSize>=rows.length} className="batch-text-button" onClick={()=>setPage(page+1)}>Next</button></>}
      <button type="button" className="batch-primary" disabled={busy||!products} onClick={review}>{busy?'Checking packages…':'Review Packages'}</button>
    </div>
  </div>;
}
