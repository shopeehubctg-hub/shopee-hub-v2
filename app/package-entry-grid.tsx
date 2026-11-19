"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import {NewItemProductDialog} from './new-item-product-dialog';
import {useInventoryMenuStyle} from './use-inventory-menu-style';
import type { InventoryProduct } from './inventory-catalog-model';
import { inventoryKey, MAX_INVENTORY_ITEMS } from './inventory-items';
import { batchMarkets, originalPriceWarning, marketChoices, marketChoiceLabel, type BatchPackage, type MarketChoice } from './package-batch-model';
import { DEFAULT_GRID_ITEM_SLOTS, editGridCells, indexGridProducts, gridMarketPrices, roundMYPrices, gridColumns, gridReview, MAX_GRID_ROWS, pasteGrid, type GridMode, type GridRow } from './package-grid-model';

import {calculatorCells,readBatchSession,writeBatchSession,type CalculatorBatch} from './calculator-batch-entry';
import {isMarket} from './markets';

type Lookup = {input:HTMLInputElement;row:number;slot:string;query:string};
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
  const [slots, setSlots] = useState(Math.max(DEFAULT_GRID_ITEM_SLOTS,draft?.slots??0));
  const [addCount,setAddCount]=useState('1');
  const [lookup,setLookup]=useState<Lookup|null>(null);
  const [addingProduct, setAddingProduct] = useState<Lookup | null>(null);
  const addProductButton = useRef<HTMLButtonElement>(null);
  const [highlight,setHighlight]=useState(-1);
  const listId=useId();
  const menuStyle=useInventoryMenuStyle(lookup?.input??null);
  useEffect(()=>writeBatchSession(draftKey,{rows,choice,mode,slots}),[draftKey,rows,choice,mode,slots]);
  const [page, setPage] = useState(0);
  const [validate, setValidate] = useState(false);
  const [message, setMessage] = useState('');
  const [products, setProducts] = useState<InventoryProduct[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const table = useRef<HTMLTableElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
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
  const library = useMemo(()=>indexGridProducts(products??[]),[products]);
  const choices=useMemo(()=>{
    if(!lookup || !products)return [];
    const query=inventoryKey(lookup.query);
    return query ? products.filter(p=>inventoryKey(p.name).includes(query)||inventoryKey(p.sku).includes(query)) : products;
  },[lookup,products]);
  useEffect(()=>{
    const option=document.getElementById(listId+'-'+highlight);
    if(option)option.scrollIntoView?.({block:'nearest',inline:'nearest'});
  },[listId,highlight]);
  function openLibrary(input:HTMLInputElement,row:number,slot:string,query=''){
    setLookup({input,row,slot,query});setHighlight(-1);
  }
  const canAddProduct = !!lookup && !!products && !catalogError && choices.length === 0;
  function beginAddProduct() {
    if (!canAddProduct) return;
    setAddingProduct(lookup);
    setLookup(null);
  }
  function chooseProduct(product:InventoryProduct, target = lookup){
    if (!target) return;
    setRows(current=>current.map((row,i)=>i===target.row?{...row,[target.slot+'.name']:product.name,[target.slot+'.sku']:product.sku}:row));
    setLookup(null);setMessage('');onEdit();
  }
  const columns = gridColumns(choice, slots, mode);
  const roundedRows = useMemo(() => calculatorBatch ? rows.map(roundMYPrices) : rows, [rows,calculatorBatch]);
  const canRound = roundedRows.some((row,i) => row !== rows[i]);
  const groups: {label:string; width:number; firstKey:string}[] = [];
  for (const col of columns) {
    const group = groups[groups.length - 1];
    if (group?.label === col.group) group.width++;
    else groups.push({label:col.group, width:1, firstKey:col.key});
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
  }, [page, rows, slots]);
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
      <button type="button" className="batch-secondary" disabled={busy} onClick={()=>{
        const cell=table.current?.querySelector<HTMLInputElement>('tbody input[role="combobox"]');
        cell?.scrollIntoView({block:'nearest',inline:'center'});cell?.focus();
      }}>Product Library</button>
      <div className="batch-item-columns"><label>Columns to add<input type="number" min="1" max={MAX_INVENTORY_ITEMS-slots} value={addCount} disabled={busy||slots===MAX_INVENTORY_ITEMS} onChange={e=>setAddCount(e.target.value)}/></label>
      <button type="button" className="batch-secondary" disabled={busy || !Number.isInteger(Number(addCount)) || Number(addCount)<1 || slots+Number(addCount)>MAX_INVENTORY_ITEMS} onClick={()=>{
        focusTarget.current=[page*pageSize,columns.length];setSlots(slots+Number(addCount));setMessage('');
      }}>Add columns</button><span>{slots} / {MAX_INVENTORY_ITEMS}</span></div>
    </div>
    <p id="batch-grid-help">{calculatorBatch ? 'Your three Calculator prices are filled in. Add original prices, platform SKUs and products for the selected packages.' : 'One package per row.'} Paste multiple rows, or use Tab to move across and Enter to move down.</p>
    {catalogError && <p role="alert" className="batch-error">{catalogError} <button type="button" className="batch-text-button" onClick={()=>setAttempt(attempt+1)}>Retry product library</button></p>}
    {!catalogError && !products && <p role="status">Loading product library…</p>}
    {products && !products.length && <p className="batch-muted">Your product library is empty. Open an inventory item and choose + Add New Product.</p>}
    {message && <p role="alert" className="batch-error">{message}</p>}
    {!!issues.length && <p role="alert" className="batch-error">Check the highlighted cells in {new Set(issues.map(issue => issue.row)).size} package row(s).</p>}
    <div className="batch-grid-scroll" role="region" aria-label="Package entry table" tabIndex={0}>
      <table ref={table} className="batch-entry-table" aria-label="Batch package entry" aria-describedby="batch-grid-help">
        <thead><tr><th scope="col" rowSpan={2}>Row</th>{groups.map(g=><th key={g.label} scope="colgroup" colSpan={g.width}>{g.label}
          {calculatorBatch && g.firstKey === 'MY.original' && <button type="button" className="batch-secondary batch-round-price"
            title="Round all three MY selling prices in every row to the nearest RM (50 sen rounds up)" disabled={busy || !canRound}
            onClick={()=>{setRows(roundedRows);setMessage('');onEdit();}}>Round to nearest RM</button>}
        </th>)}{!calculatorBatch&&<th rowSpan={2} scope="col">Action</th>}</tr>
        <tr>{columns.map(col=><th key={col.key} scope="col">{col.label}</th>)}</tr></thead>
        <tbody>{rows.slice(start,start+pageSize).map((draft, offset) => {
          const index = start + offset;
          const rowIssues = issues.filter(issue=>issue.row===index);
          return <Fragment key={index}><tr><th scope="row">{index+1}</th>{columns.map((col,c)=>{
            const slot = col.key.split('.')[0];
            const other=col.lookup==='name'?'sku':'name';
            const partnerKey=slot+'.'+other;
            const partner=inventoryKey(draft[partnerKey]??'');
            const hint=col.lookup && partner ? library[other].get(partner)?.[col.lookup] : '';
            const menuOpen=!!col.lookup && lookup?.row===index && lookup.input.dataset.col===String(c);
            const warning = col.key === slot+'.original' && isMarket(slot)
              ? originalPriceWarning(slot,gridMarketPrices(draft,slot),true) : '';
            const warningId = 'grid-original-' + index + '-' + slot;
            const invalid = rowIssues.some(issue=>issue.fields.includes(col.key));
            return <td key={col.key}><input data-row={index} data-col={c} aria-label={`Row ${index+1} · ${col.group} · ${col.label}`} aria-invalid={!!warning || invalid || undefined} aria-describedby={warning ? warningId : invalid ? 'grid-errors-'+index : undefined}
              disabled={busy} role={col.lookup?'combobox':undefined} aria-expanded={col.lookup?menuOpen:undefined} aria-controls={menuOpen?listId:undefined} aria-autocomplete={col.lookup?'list':undefined}
              aria-activedescendant={menuOpen&&highlight>=0?listId+'-'+highlight:undefined} autoComplete="off"
              placeholder={hint || (col.lookup?'Search name or SKU':'')} value={draft[col.key] ?? ''}
              onFocus={col.lookup?e=>openLibrary(e.currentTarget,index,slot):undefined}
              onClick={col.lookup?e=>{if(!menuOpen)openLibrary(e.currentTarget,index,slot);}:undefined}
              onBlur={col.lookup?e=>{if (!e.relatedTarget || e.relatedTarget !== addProductButton.current) setLookup(null);}:undefined}
              onChange={e=>{
                const value=e.target.value, field=col.lookup;
                if(field)openLibrary(e.currentTarget,index,slot,value);
                setRows(current=>current.map((row,i)=>i===index ? editGridCells(row,{[col.key]:value},library) : row));
                setMessage('');onEdit();
              }}
              onKeyDown={e=>{
                if(e.nativeEvent.isComposing)return;
                if (menuOpen && canAddProduct && !e.shiftKey) {
                  if (e.key === 'Enter') { e.preventDefault(); beginAddProduct(); return; }
                  if (e.key === 'Tab' || e.key === 'ArrowDown') {
                    e.preventDefault(); addProductButton.current?.focus(); return;
                  }
                }
                if(col.lookup && (e.key==='ArrowDown'||e.key==='ArrowUp')){
                  e.preventDefault();if(!menuOpen)openLibrary(e.currentTarget,index,slot);
                  const last=(menuOpen?choices.length:products?.length??0)-1;
                  setHighlight(h=>last<0?-1:e.key==='ArrowDown'?Math.min(last,h+1):h<0?last:Math.max(0,h-1));return;
                }
                if(menuOpen && e.key==='Escape'){e.preventDefault();setLookup(null);return;}
                if(e.key==='Enter'){
                  e.preventDefault();
                  if(menuOpen&&!e.shiftKey&&choices[highlight])chooseProduct(choices[highlight]);
                  else goToCell(index+(e.shiftKey?-1:1),c);
                }
              }}
              onPaste={e=>{
                const raw=e.clipboardData.getData('text/plain');if(!/[\r\n\t]/.test(raw))return;
                e.preventDefault();setLookup(null);
                try {const next=pasteGrid(rows,choice,mode,slots,index,c,raw,library);if(calculatorBatch && next.rows.length>rows.length)throw Error('Paste within the selected Calculator rows.');setRows(next.rows);setSlots(next.slots);setMessage('');onEdit();}
                catch(err){setMessage((err as Error).message);}
              }}/>{warning && <div className="grid-original-warning" id={warningId} aria-live="polite">{warning}</div>}</td>;
          })}{!calculatorBatch&&<td><button type="button" className="batch-text-button" aria-label={'Duplicate row '+(index+1)} disabled={busy||rows.length>=MAX_GRID_ROWS||!Object.values(draft).some(Boolean)}
            onClick={()=>{setRows([...rows.slice(0,index+1),{...draft},...rows.slice(index+1)]);setPage(Math.floor((index+1)/pageSize));onEdit();}}>Duplicate</button></td>}</tr>
          {!!rowIssues.length&&<tr><td colSpan={columns.length+2} id={'grid-errors-'+index} className="batch-grid-errors">Row {index+1} · {[...new Set(rowIssues.map(i=>i.message))].join(' ')}</td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    {lookup&&createPortal(<div className="batch-library-menu" style={menuStyle}>
      <div role="listbox" id={listId} aria-label="Product Library" aria-busy={!products&&!catalogError}>
        {choices.map((p,i)=><button key={p.sku} id={listId+'-'+i} type="button" role="option" tabIndex={-1} aria-selected={highlight===i}
          onMouseDown={e=>e.preventDefault()} onClick={()=>chooseProduct(p)}><strong>{p.name}</strong><span>{p.sku}</span></button>)}
      </div>
      {!choices.length&&<p role="status">{catalogError?'Product library unavailable. Use Retry product library.':!products?'Loading product library…':products.length?'No matching products':'This store’s product library is empty.'}</p>}
      {canAddProduct && <button ref={addProductButton} type="button" className="batch-library-add"
        aria-haspopup="dialog" onMouseDown={e=>e.preventDefault()} onClick={beginAddProduct}
        onBlur={()=>setLookup(null)} onKeyDown={e=>{
          if (e.key === 'Tab') {
            e.preventDefault();
            const nextColumn = Number(lookup.input.dataset.col) + 1;
            if (e.shiftKey) lookup.input.focus();
            else if (nextColumn < columns.length) goToCell(lookup.row, nextColumn);
            else if (lookup.row + 1 < rows.length) goToCell(lookup.row + 1, 0);
            else reviewButton.current?.focus();
          }
        }}>+ Add New Product</button>}
    </div>,document.body)}
    {addingProduct && <NewItemProductDialog
      initialName={rows[addingProduct.row][addingProduct.slot+'.name'] ?? ''}
      initialSku={rows[addingProduct.row][addingProduct.slot+'.sku'] ?? ''}
      savedBySku={library.sku}
      onCancel={()=>{
        addingProduct.input.focus();
        setAddingProduct(null);
      }}
      onAdd={product=>{
        chooseProduct(product, addingProduct);
        const quantityColumn = columns.findIndex(col => col.key === addingProduct.slot + '.qty');
        goToCell(addingProduct.row, quantityColumn);
        setAddingProduct(null);
      }}/>}
    <div className="batch-grid-footer">{!calculatorBatch&&<button type="button" disabled={busy||rows.length>=MAX_GRID_ROWS} className="batch-secondary" onClick={()=>goToCell(rows.length,0)}>+ Add row</button>}
      {rows.length>pageSize&&<><button type="button" disabled={page===0} className="batch-text-button" onClick={()=>setPage(page-1)}>Previous</button><span>Rows {start+1}–{Math.min(start+pageSize,rows.length)} of {rows.length}</span><button type="button" disabled={start+pageSize>=rows.length} className="batch-text-button" onClick={()=>setPage(page+1)}>Next</button></>}
      <button ref={reviewButton} type="button" className="batch-primary" disabled={busy||!products} onClick={review}>{busy?'Checking packages…':'Review Packages'}</button>
    </div>
  </div>;
}
