/** Extract only explicitly labelled store names; raw invoice descriptions are never retained. */
export function extractXeroStoreNames(descriptions: string[]): string[] {
 const names = new Map<string, string>();
 for (const description of descriptions) {
  if (typeof description !== 'string') continue;
  for (const line of description.normalize('NFKC').split(/\r?\n/u)) {
   const labels = [...line.matchAll(/\bSTORE\s+NAME\s*[:：]\s*/giu)];
   for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    const end = labels[index + 1]?.index ?? line.length;
    const value = line.slice(label.index! + label[0].length, end)
     .split(/\s+(?:PICK\s*UP|PICKUP|SERVICE\s+PERIOD|INVOICE\s+MONTH|ADDRESS|CONTACT|REMARKS?)\s*(?::|$)/iu)[0]
     .trim().replace(/\s+/gu, ' ');
    // Invalid, truncated or composite labels stay unresolved rather than guessing a store.
    if (!value || value.length > 120 || /[\u0000-\u001f\u007f]|https?:\/\/|www\.|@/iu.test(value)) return [];
    names.set(value.toLowerCase(), value);
    if (names.size > 8) return [];
   }
  }
 }
 return [...names.values()];
}
