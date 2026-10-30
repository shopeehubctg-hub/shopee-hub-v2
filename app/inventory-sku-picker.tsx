'use client';
import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {InventoryProduct} from './inventory-catalog-model';
import './inventory-sku-picker.css';
import {InventoryProductDialog} from './inventory-product-dialog';
type Line={inventorySku:string;name:string;quantity:number;kind:'product'|'gift'};
export function InventorySkuPicker({storeId,value,index,onChange,onRemove,duplicateMessage}:{duplicateMessage?:string;storeId:string;value:Line;index:number;onChange:(v:Line)=>void;onRemove:()=>void}){
 const searchRef=useRef<HTMLDivElement>(null);
 const [menuStyle,setMenuStyle]=useState<CSSProperties>({});
 const id=useId(),[query,setQuery]=useState(value.inventorySku),[open,setOpen]=useState(false),[manual,setManual]=useState(false),[products,setProducts]=useState<InventoryProduct[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(0),[retry,setRetry]=useState(0),[matches,setMatches]=useState<InventoryProduct[]>([]),[editing,setEditing]=useState<InventoryProduct|null>(null),[canEdit,setCanEdit]=useState(false),[keepSeparate,setKeepSeparate]=useState(false);
 useEffect(()=>{if(!manual)return;const controller=new AbortController();setMatches([]);setKeepSeparate(false);const timer=setTimeout(async()=>{try{const response=await fetch('/api/inventory-skus?'+new URLSearchParams({storeId,sku:value.inventorySku,name:value.name}),{signal:controller.signal,cache:'no-store'});const data=await response.json();if(response.ok&&!controller.signal.aborted){setMatches(data.products);setCanEdit(data.canEdit===true);}}catch{}},220);return()=>{clearTimeout(timer);controller.abort();};},[manual,value.inventorySku,value.name,storeId]);
 useEffect(()=>{if(!open||manual)return;const controller=new AbortController();setBusy(true);setError('');setProducts([]);const timer=setTimeout(async()=>{try{const response=await fetch(`/api/inventory-skus?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(query)}`,{signal:controller.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Product search is unavailable.');if(!controller.signal.aborted){setProducts(data.products);setActive(0);}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Product search is unavailable.');}finally{if(!controller.signal.aborted)setBusy(false);}},180);return()=>{clearTimeout(timer);controller.abort();};},[open,query,storeId,manual,retry]);
 useEffect(()=>{if(!open&&!manual)setQuery(value.inventorySku);},[value.inventorySku,open,manual]);
 useLayoutEffect(()=>{
  if(!open||manual)return;
  const positionMenu=()=>{
   const input=searchRef.current?.querySelector('input');if(!input)return;
   const rect=input.getBoundingClientRect(),viewport=window.visualViewport;
   const top=(viewport?.offsetTop??0)+8,bottom=(viewport?.offsetTop??0)+(viewport?.height??window.innerHeight)-8;
   const container=searchRef.current?.closest('.package-form')?.getBoundingClientRect();
   const ceiling=Math.max(top,container?.top??top),floor=Math.min(bottom,container?.bottom??bottom);
   const above=Math.max(0,rect.top-ceiling-4),below=Math.max(0,floor-rect.bottom-4);
   const upwards=below<280&&above>below;
   const width=Math.min(Math.max(rect.width,280),(viewport?.width??window.innerWidth)-16);
   setMenuStyle({position:'fixed',top:upwards?rect.top-4:rect.bottom+4,left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),width,minWidth:0,maxHeight:Math.min(330,upwards?above:below),transform:upwards?'translateY(-100%)':undefined});
  };
  positionMenu();
  window.addEventListener('scroll',positionMenu,true);window.addEventListener('resize',positionMenu);
  window.visualViewport?.addEventListener('resize',positionMenu);
  return()=>{window.removeEventListener('scroll',positionMenu,true);window.removeEventListener('resize',positionMenu);window.visualViewport?.removeEventListener('resize',positionMenu);};
 },[open,manual]);
 useEffect(()=>{if(open)document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({block:'nearest'});},[active,open,id]);
 const choose=(product:InventoryProduct)=>{onChange({...value,inventorySku:product.sku,name:product.name});setQuery(product.sku);setOpen(false);setManual(false);};
 return <div className="inventory-picker-row"><div ref={searchRef} className="inventory-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>{!manual&&<><label htmlFor={id}>Search Product / Inventory SKU</label><input id={id} role="combobox" aria-label={`Search Product / Inventory SKU ${index+1}`} aria-invalid={!!duplicateMessage} aria-expanded={open&&!manual} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open&&!busy&&!error&&products[active]?`${id}-option-${active}`:undefined} placeholder="Search by product name or SKU" value={query} onFocus={()=>{if(!manual)setOpen(true);}} onChange={e=>{setQuery(e.target.value);setManual(false);setOpen(true);onChange({...value,inventorySku:'',name:''});}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(n=>Math.max(0,Math.min(products.length-1,n+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'&&open&&products[active]){e.preventDefault();choose(products[active]);}}}/></>}
 {open&&!manual&&<div className="inventory-product-menu" style={menuStyle}><div role="listbox" id={`${id}-list`} aria-label="Matching Products" aria-busy={busy}>{!busy&&!error&&products.map((p,i)=><button type="button" role="option" id={`${id}-option-${i}`} aria-selected={i===active} key={p.sku} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(p)}><b>{p.sku}</b><span>{p.name}</span></button>)}</div>{busy&&<p role="status">Searching…</p>}{error?<p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:!busy&&!products.length&&<p>No Matching Products</p>}<button type="button" className="inventory-add-product" onMouseDown={e=>e.preventDefault()} onClick={()=>{setManual(true);setOpen(false);onChange({...value,inventorySku:query.trim(),name:''});}}>+ Add New Product</button></div>}
 {manual&&<label>New Inventory SKU<input aria-label={`New Inventory SKU ${index+1}`} aria-invalid={!!duplicateMessage||matches.some(p=>p.sku.toLowerCase()===value.inventorySku.trim().toLowerCase())} maxLength={200} value={value.inventorySku} onChange={e=>{setQuery(e.target.value);onChange({...value,inventorySku:e.target.value});}}/></label>}</div>
 <label>Product Name<input aria-label={`Product Name ${index+1}`} readOnly={!manual} maxLength={300} value={value.name} placeholder={manual?'Enter Product Name':'Select a product to fill its name'} onChange={e=>onChange({...value,name:e.target.value})}/>{manual&&<small>Added to this project's product list when the package is saved.</small>}</label>
 <label>Quantity<input aria-label={`Inventory Quantity ${index+1}`} type="number" min="1" step="1" value={value.quantity} onChange={e=>onChange({...value,quantity:Number(e.target.value)})}/></label><button type="button" aria-label={`Remove ${value.inventorySku||'Inventory Item '+(index+1)}`} onClick={onRemove}>×</button>
 {duplicateMessage&&<p role="alert" className="inventory-notice">{duplicateMessage}</p>}
 {manual&&matches.length>0&&!keepSeparate&&<div role="alert" className="inventory-notice"><b>{matches.some(p=>p.sku.toLowerCase()===value.inventorySku.trim().toLowerCase())?'This SKU already exists.':'A product with this name already exists.'}</b>{matches.map(p=><div key={p.sku}><span>{p.sku} · {p.name}</span><button type="button" onClick={()=>choose(p)}>Use Existing Product</button>{canEdit&&p.id&&<button type="button" onClick={()=>setEditing(p)}>Edit Existing Product</button>}</div>)}{!matches.some(p=>p.sku.toLowerCase()===value.inventorySku.trim().toLowerCase())&&<button type="button" onClick={()=>setKeepSeparate(true)}>Keep as a Separate Product</button>}</div>}
 {editing&&<InventoryProductDialog storeId={storeId} product={editing} onClose={()=>setEditing(null)} onSaved={p=>{choose(p);setMatches([]);}}/>}
 </div>;
}
