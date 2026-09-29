import { createHmac, timingSafeEqual } from "node:crypto";

export function validSyncJobSignature(body: string, timestamp: string | null, signature: string | null, secret: string | undefined, now = Date.now()) {
  if (!secret || !timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`package-sheet-sync\n${timestamp}\n${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
