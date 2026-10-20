import { createHmac, timingSafeEqual } from "node:crypto";

export function brandKey(value:string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
}

export function canonicalReportUrl(value:string) {
  try {
    const url=new URL(value.trim());
    if (url.protocol!=="https:" || !/(^|\.)shopee\.(com\.my|sg|com)$/.test(url.hostname.toLowerCase())) return null;
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/,"") || "/"}`;
  } catch { return null; }
}

export function malaysiaReportDate(iso:string) {
  const time=new Date(iso);
  if (!Number.isFinite(time.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(time);
}

export function validFakeSellerImportSignature(body:string,timestamp:string|null,signature:string|null,secret:string|undefined,now=Date.now()) {
  if (!secret || !timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(now-Number(timestamp))>5*60*1000) return false;
  const expected=createHmac("sha256",secret).update(`fake-seller-report\n${timestamp}\n${body}`).digest();
  return timingSafeEqual(expected,Buffer.from(signature,"hex"));
}
