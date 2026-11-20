"use client";

import {useId, useLayoutEffect, useRef, type ClipboardEvent} from 'react';
import {listingValues, type ListingPlatform} from './listing-skus';

export function PlatformListingInputs({platform, value, label, disabled, invalid, describedBy, conflict, onChange, row, col, onEnter, onGridPaste}: {
  platform: ListingPlatform; value: string; label: string; disabled?: boolean; invalid?: boolean; describedBy?: string;
  conflict: (sku: string) => string; onChange: (value: string) => void;
  row?: number; col?: number; onEnter?: (backward: boolean) => void; onGridPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
}) {
  const fields = value.split(/\r\n|[\r\n]/);
  const container = useRef<HTMLDivElement>(null);
  const focus = useRef<number | null>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (focus.current === null) return;
    container.current?.querySelectorAll('input')[focus.current]?.focus();
    focus.current = null;
  }, [value]);
  function replace(index: number, next: string[], focusAt?: number) {
    if (focusAt !== undefined) focus.current = focusAt;
    const updated = [...fields];
    updated.splice(index, 1, ...next);
    onChange(updated.join('\n'));
  }
  return <div className="platform-listing-inputs" ref={container}>
    {fields.map((sku, i) => {
      const error = conflict(sku);
      const errorId = id + '-' + i;
      return <div key={i}>
        <div className="platform-listing-line">
          <input data-row={i===0 ? row : undefined} data-col={i===0 ? col : undefined}
            aria-label={i===0 ? label : label + ' · Listing ' + (i+1)} placeholder="Listing SKU"
            autoComplete="off" spellCheck={false} disabled={disabled} value={sku}
            aria-invalid={!!error || invalid || undefined} aria-describedby={error ? errorId : describedBy}
            onChange={e=>replace(i, [e.target.value])}
            onKeyDown={e=>{if (e.key==='Enter' && !e.nativeEvent.isComposing && onEnter) {e.preventDefault(); onEnter(e.shiftKey);}}}
            onPaste={e=>{
              const text=e.clipboardData.getData('text/plain');
              if (text.includes('\t') && onGridPaste) {onGridPaste(e); return;}
              if (!/[\r\n]/.test(text)) return;
              e.preventDefault();
              const lines=listingValues(text);
              if (lines.length) replace(i,lines,i+lines.length-1);
            }}/>
          {fields.length>1 && <button type="button" className="remove-listing" aria-label={'Remove '+label+' listing '+(i+1)}
            disabled={disabled} onClick={()=>replace(i,[],Math.min(i,fields.length-2))}>×</button>}
        </div>
        {error && <span className="batch-field-error" id={errorId} aria-live="polite">{error}</span>}
      </div>;
    })}
    {fields.every(sku=>sku.trim()) && <button type="button" className="add-listing" disabled={disabled}
      aria-label={'Add '+platform+' listing'+(row===undefined?'':' to row '+(row+1))} onClick={()=>replace(fields.length,[''],fields.length)}>+ Add Listing</button>}
  </div>;
}
