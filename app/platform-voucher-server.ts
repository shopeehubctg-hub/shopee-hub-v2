import "server-only";
import { supabaseRest } from "./supabase-rest";
import { platformVoucherFromRow, type PlatformVoucherPreset } from "./platform-voucher";

// Called only after Dashboard has resolved the selected store from its authorized list.
export async function readPlatformVoucher(storeId:string,tenantId:string):Promise<PlatformVoucherPreset|null>{
  try {
    const query=new URLSearchParams({select:"non_campaign_average,campaign_average,late_month_average,source_updated_at",store_id:`eq.${storeId}`,tenant_id:`eq.${tenantId}`,limit:"1"});
    const rows=await supabaseRest<Array<{non_campaign_average:string|number;campaign_average:string|number;late_month_average:string|number|null;source_updated_at:string}>>(`store_voucher_presets?${query}`);
    return rows[0]?platformVoucherFromRow(rows[0]):null;
  } catch {
    // Do not silently substitute an older hardcoded voucher after a live read fails.
    return null;
  }
}
