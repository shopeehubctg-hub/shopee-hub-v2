import { createHash } from "node:crypto";

export type RegisteredStore = { id: string; name: string; bigseller_name: string; display_name?: string | null };

export function normalizeStoreName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function proposedStoreId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = slug || `store-${createHash("sha256").update(normalizeStoreName(name)).digest("hex").slice(0, 16)}`;
  return `shopee-${suffix}`;
}

export function storeNameConflict(stores: RegisteredStore[], name: string, sourceName: string, excludeId?: string) {
  const candidates = new Set([normalizeStoreName(name), normalizeStoreName(sourceName)]);
  return stores.some(store => store.id !== excludeId && [store.name, store.bigseller_name, store.display_name].some(value => value && candidates.has(normalizeStoreName(value))));
}

export function storeIdConflict(stores: RegisteredStore[], id: string) {
  return stores.some(store => store.id === id);
}
