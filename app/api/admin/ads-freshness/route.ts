import { getChatGPTUser } from "../../../chatgpt-auth";
import { supabaseRest } from "../../../supabase-rest";
import { assessAdsFreshness } from "../../../ads-freshness.js";

export const dynamic = "force-dynamic";

type Membership = { tenant_id: string; role: string; active: boolean };
type Store = { id: string; name: string };
type AdRow = { store_id: string; performance_date: string; synced_at: string };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  try {
    const memberships = await supabaseRest<Membership[]>(
      `customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`,
    );
    const membership = memberships[0];
    if (!membership?.active || membership.role !== "superadmin") {
      return Response.json({ error: "Super Admin access required" }, { status: 403 });
    }

    const tenant = encodeURIComponent(membership.tenant_id);
    const [stores, latestRows, latestWrites] = await Promise.all([
      supabaseRest<Store[]>(`stores?select=id,name&tenant_id=eq.${tenant}&order=name.asc`),
      supabaseRest<AdRow[]>(`ad_performance_daily?select=store_id,performance_date,synced_at&tenant_id=eq.${tenant}&order=performance_date.desc&limit=1`),
      supabaseRest<AdRow[]>(`ad_performance_daily?select=store_id,performance_date,synced_at&tenant_id=eq.${tenant}&order=synced_at.desc&limit=1`),
    ]);
    const latestBusinessDate = latestRows[0]?.performance_date ?? null;
    const latestDateRows = latestBusinessDate
      ? await supabaseRest<Pick<AdRow, "store_id">[]>(`ad_performance_daily?select=store_id&tenant_id=eq.${tenant}&performance_date=eq.${latestBusinessDate}&limit=1000`)
      : [];
    const covered = new Set(latestDateRows.map((row) => row.store_id));
    const missingStores = stores.filter((store) => !covered.has(store.id));
    const missingWithHistory = await Promise.all(missingStores.map(async (store) => {
      const rows = await supabaseRest<Pick<AdRow, "performance_date">[]>(
        `ad_performance_daily?select=performance_date&tenant_id=eq.${tenant}&store_id=eq.${encodeURIComponent(store.id)}&order=performance_date.desc&limit=1`,
      );
      return { ...store, latestBusinessDate: rows[0]?.performance_date ?? null };
    }));

    return Response.json({
      source: "Google Sheets FullAd → Supabase",
      ...assessAdsFreshness({
        now: new Date(), latestBusinessDate, lastWriteAt: latestWrites[0]?.synced_at ?? null,
        storeCount: stores.length, coveredStoreCount: stores.length - missingStores.length,
      }),
      missingStores: missingWithHistory,
      syncLogStatus: "unverified",
      syncLogNote: "Last write is not proof that the Apps Script run completed; check _SyncLog for failed or warning runs.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[ads-freshness] Supabase read failed", error);
    return Response.json({ error: "Advertising freshness is temporarily unavailable" }, { status: 502 });
  }
}
