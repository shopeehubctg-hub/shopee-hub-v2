// Source facts only. Authorization and the final per-user response are never cached.
type Entry = { expires: number; promise: Promise<unknown> };
const entries = new Map<string, Entry>();
export async function dashboardReadCache<T>(key: string, load: () => Promise<T>, refresh = false): Promise<T> {
  const existing = entries.get(key);
  if (!refresh && existing && existing.expires > Date.now()) return existing.promise as Promise<T>;
  const entry: Entry = { expires: Date.now() + 30_000, promise: Promise.resolve().then(load) };
  entries.set(key, entry);
  while (entries.size > 16) entries.delete(entries.keys().next().value!);
  try { return await entry.promise as T; }
  catch (error) { if (entries.get(key) === entry) entries.delete(key); throw error; }
}
