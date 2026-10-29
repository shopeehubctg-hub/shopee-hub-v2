import "server-only";
import sourceData from "./account-rate-mapping-preview.json";
import type { PreviewRateSource } from "./fee-preview-currency";

export const previewRateSource = sourceData as PreviewRateSource;
export function rateSourceForTenant(tenantId: string): PreviewRateSource {
  return tenantId === "j-packaging" ? previewRateSource : { records: [] };
}
