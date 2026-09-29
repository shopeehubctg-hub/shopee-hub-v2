import { getChatGPTUser } from "../../../chatgpt-auth";
import { supabaseRest } from "../../../supabase-rest";
import { proposedStoreId, storeIdConflict, storeNameConflict } from "../../../store-registration";

export const dynamic = "force-dynamic";

type Membership = { tenant_id: string; role: string; active: boolean };
type Store = { id: string; name: string; bigseller_name: string; platform: string };

async function superAdminMembership() {
  const actor = await getChatGPTUser();
  if (!actor) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const members = await supabaseRest<Membership[]>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  const member = members[0];
  if (!member?.active || member.role !== "superadmin") return { error: Response.json({ error: "Super Admin access required" }, { status: 403 }) };
  return { member };
}

export async function POST(request: Request) {
  const auth = await superAdminMembership();
  if ("error" in auth) return auth.error;
  const member = auth.member;

  const body = await request.json().catch(() => null) as { name?: unknown; market?: unknown; sourceName?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) return Response.json({ error: "Store name is required (up to 120 characters)" }, { status: 400 });
  if (body?.market !== "MY" && body?.market !== "SG") return Response.json({ error: "Select MY or SG market" }, { status: 400 });
  if (sourceName.length > 120) return Response.json({ error: "Source name must be 120 characters or fewer" }, { status: 400 });
  const finalSourceName = sourceName || name;

  const existing = await supabaseRest<Store[]>(`stores?select=id,name,bigseller_name,platform&tenant_id=eq.${encodeURIComponent(member.tenant_id)}`);
  if (storeNameConflict(existing, name, finalSourceName)) {
    return Response.json({ error: "A store with this name or source name already exists" }, { status: 409 });
  }

  const id = proposedStoreId(name);
  if (storeIdConflict(existing, id)) return Response.json({ error: "This store ID already exists; use a more distinct store name" }, { status: 409 });
  try {
    const created = await supabaseRest<Store[]>("stores?select=id,name,bigseller_name,platform", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ id, tenant_id: member.tenant_id, name, platform: `Shopee ${body.market}`, bigseller_name: finalSourceName }),
    });
    return Response.json({ store: created[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('"code":"23505"')) {
      return Response.json({ error: "This store already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const auth = await superAdminMembership();
  if ("error" in auth) return auth.error;
  const member = auth.member;
  const body = await request.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!id) return Response.json({ error: "Store ID is required" }, { status: 400 });
  if (!name || name.length > 120) return Response.json({ error: "Store name is required (up to 120 characters)" }, { status: 400 });

  const existing = await supabaseRest<Store[]>(`stores?select=id,name,bigseller_name,platform&tenant_id=eq.${encodeURIComponent(member.tenant_id)}`);
  const target = existing.find(store => store.id === id);
  if (!target) return Response.json({ error: "Store not found" }, { status: 404 });
  if (storeNameConflict(existing, name, name, id)) return Response.json({ error: "This store name is already in use" }, { status: 409 });
  if (target.name === name) return Response.json({ store: target });
  const updated = await supabaseRest<Store[]>(`stores?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(member.tenant_id)}&select=id,name,bigseller_name,platform`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name }),
  });
  if (!updated[0]) return Response.json({ error: "Store not found" }, { status: 404 });
  return Response.json({ store: updated[0] });
}
