export const listingPlatforms = ['Shopee', 'Lazada', 'TikTok'] as const;
export type ListingPlatform = typeof listingPlatforms[number];
export type ListingFields = Partial<Record<ListingPlatform, string>>;
type ListingRow = {id: string; name?: string; skus: ListingFields};

export function listingValues(value = '') {
  return value.split(/\r\n|[\r\n]/).map(sku => sku.trim()).filter(Boolean);
}

export function platformListings(skus: ListingFields) {
  return listingPlatforms.flatMap(platform =>
    listingValues(skus[platform]).map(packageSku => ({platform, packageSku})));
}

export function indexListings(rows: ListingRow[]) {
  const owners = new Map<string, {packages: Map<string, number>; platforms: Map<ListingPlatform, ListingRow[]>}>();
  for (const row of rows) {
    for (const {platform, packageSku} of platformListings(row.skus)) {
      const key = packageSku.toUpperCase();
      const entry = owners.get(key) ?? {packages: new Map<string, number>(), platforms: new Map<ListingPlatform, ListingRow[]>()};
      entry.packages.set(row.id, (entry.packages.get(row.id) ?? 0) + 1);
      const matches = entry.platforms.get(platform) ?? [];
      matches.push(row);
      entry.platforms.set(platform, matches);
      owners.set(key, entry);
    }
  }
  return owners;
}

export function listingConflict(index: ReturnType<typeof indexListings>, id: string, platform: ListingPlatform, sku: string) {
  const entry = index.get(sku.trim().toUpperCase());
  if (!entry) return '';
  if ((entry.packages.get(id) ?? 0) > 1) return 'This SKU is duplicated in this package.';
  const other = entry.platforms.get(platform)?.find(row => row.id !== id);
  return other ? 'This SKU is duplicated in ' + (other.name?.trim() || 'another package') + '.' : '';
}
