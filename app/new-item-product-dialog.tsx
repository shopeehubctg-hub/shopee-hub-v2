'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {InventoryProduct} from './inventory-catalog-model';
import {inventoryKey} from './inventory-items';

type Props = {
  initialName: string;
  initialSku: string;
  savedBySku: ReadonlyMap<string, InventoryProduct>;
  onCancel: () => void;
  onAdd: (product: InventoryProduct) => void;
};

export function NewItemProductDialog({initialName, initialSku, savedBySku, onCancel, onAdd}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstEmptyField = useRef<HTMLInputElement>(null);
  const focusSku = !!initialName.trim() && !initialSku.trim();
  const title = useId();
  const [name, setName] = useState(initialName);
  const [sku, setSku] = useState(initialSku);
  const saved = savedBySku.get(inventoryKey(sku));
  const conflict = !!saved && !!name.trim() && inventoryKey(saved.name) !== inventoryKey(name);
  useEffect(() => {
    dialog.current?.showModal();
    firstEmptyField.current?.focus();
  }, []);

  function cancel() {
    dialog.current?.close();
    onCancel();
  }

  return createPortal(<dialog ref={dialog} className="inventory-edit-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); cancel(); }}>
    <form onSubmit={event => {
      event.preventDefault();
      if (!name.trim() || !sku.trim() || conflict) return;
      dialog.current?.close();
      onAdd(saved ?? {name: name.trim(), sku: sku.trim()});
    }}>
      <h3 id={title}>Add New Product</h3>
      <label>Product Name<input ref={focusSku ? undefined : firstEmptyField} required maxLength={300}
        value={name} onChange={event => setName(event.target.value)}/></label>
      <label>Inventory SKU<input ref={focusSku ? firstEmptyField : undefined} required maxLength={200}
        value={sku} aria-invalid={conflict || undefined} onChange={event => setSku(event.target.value)}/></label>
      {conflict && <p role="alert" className="inventory-notice">This SKU belongs to {saved.name}. Confirm the product name or enter a different SKU.</p>}
      <p>This product will be added to the library when you save the package.</p>
      <footer>
        <button type="button" onClick={cancel}>Cancel</button>
        <button type="submit" disabled={!name.trim() || !sku.trim() || !!conflict}>Add to Item</button>
      </footer>
    </form>
  </dialog>, document.body);
}
