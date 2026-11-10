import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { customerUsers, tenants } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { assertDeploymentIsolation } from "../../deployment-isolation";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
type Peer = { token?: string; offer?: string; answer?: string; seen?: number };
type Room = { room_id: string; host_id: string | number; viewers: Record<string, Peer>; active: boolean };

function relayServers(): RTCIceServer[] {
  const value = process.env.SALES_CAST_TURN;
  if (!value) return [];
  const { url, username, credential, expiresAt } = JSON.parse(value);
  if (typeof url !== "string" || !/^turns:[a-z0-9.-]+:443(?:\?transport=tcp)?$/i.test(url) ||
      typeof username !== "string" || !username || typeof credential !== "string" || !credential ||
      typeof expiresAt !== "string" || !(Date.parse(expiresAt) > Date.now())) {
    throw Error("Invalid sales cast relay configuration");
  }
  return [{ urls: url, username, credential }];
}

async function handle(request: Request) {
  if (assertDeploymentIsolation() !== "staging") return reply({}, 404);
  if (request.method === "POST" && request.headers.get("origin") !== new URL(request.url).origin) return reply({}, 403);
  const actor = await getChatGPTUser();
  if (!actor) return reply({}, 401);
  const db = await getDb();
  const [member] = await db.select({ id: customerUsers.id, tenant: customerUsers.tenantId, role: customerUsers.role })
    .from(customerUsers).innerJoin(tenants, and(eq(tenants.id, customerUsers.tenantId), eq(tenants.active, true)))
    .where(and(eq(customerUsers.email, actor.email.toLowerCase()), eq(customerUsers.active, true))).limit(1);
  if (!member) return reply({}, 403);
  const isAdmin = member.role === "superadmin";
  if (request.method === "GET") {
    if (isAdmin && new URL(request.url).searchParams.has("viewers")) {
      const viewers = await db.select({ email: customerUsers.email, name: customerUsers.displayName })
        .from(customerUsers)
        .where(and(eq(customerUsers.tenantId, member.tenant), eq(customerUsers.active, true),
          sql`${customerUsers.role} <> 'superadmin'`))
        .orderBy(customerUsers.displayName, customerUsers.email);
      return reply({ viewers });
    }
    const [room] = await db.execute<Room>(sql`select room_id, host_id, viewers, expires_at > now() as active
      from public.staging_sales_cast where tenant_id = ${member.tenant}`);
    const peer = room?.viewers[String(member.id)];
    return reply({ allowed: isAdmin || Boolean(room?.active && peer) });
  }
  const raw = await request.text();
  if (raw.length > 32000) return reply({}, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return reply({}, 400); }
  if (!body || typeof body !== "object") return reply({}, 400);

  if (body.action === "connect") {
    const [room] = await db.execute<Room>(sql`select room_id, host_id, viewers, expires_at > now() as active
      from public.staging_sales_cast where tenant_id = ${member.tenant}`);
    if (!room?.active || (body.room && body.room !== room.room_id)) return reply({}, 410);
    const host = isAdmin && body.room === room.room_id && String(room.host_id) === String(member.id);
    if (!host && !Object.hasOwn(room.viewers, String(member.id))) return reply({}, 403);
    return reply({ room: room.room_id, iceServers: relayServers() });
  }

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('staging-sales-cast'), hashtext(${member.tenant}))`);
    const [room] = await tx.execute<Room>(sql`select room_id, host_id, viewers, expires_at > now() as active
      from public.staging_sales_cast where tenant_id = ${member.tenant}`);
    if (body.action === "start" || body.action === "viewers") {
      if (!isAdmin) return reply({}, 403);
      if (body.action === "start") {
        if (room?.active) return reply({}, 409);
        const id = randomUUID();
        await tx.execute(sql`insert into public.staging_sales_cast (tenant_id, room_id, host_id, expires_at)
          values (${member.tenant}, ${id}, ${member.id}, now() + interval '20 seconds')
          on conflict (tenant_id) do update set room_id = excluded.room_id, host_id = excluded.host_id,
          viewers = excluded.viewers, expires_at = excluded.expires_at`);
        return reply({ room: id });
      }

      if (!room?.active || body.room !== room.room_id || String(room.host_id) !== String(member.id)) return reply({}, 403);
      if (!Array.isArray(body.emails) ||
          body.emails.some((email: unknown) => typeof email !== "string" || email.length > 254)) return reply({}, 400);
      const emails: string[] = [...new Set<string>(body.emails)];
      const members = emails.length ? await tx.execute<{ id: string }>(sql`select id from public.customer_users
        where tenant_id = ${member.tenant} and active and role <> 'superadmin'
        and lower(email) in (${sql.join(emails.map(email => sql`${email}`), sql`, `)})`) : [];
      if (members.length !== emails.length) return reply({}, 400);
      const viewers = Object.fromEntries(members.map(user => [String(user.id), room.viewers[String(user.id)] ?? {}]));
      await tx.execute(sql`update public.staging_sales_cast set viewers = ${JSON.stringify(viewers)}::jsonb
        where tenant_id = ${member.tenant}`);
      return reply({});
    }

    if (!room?.active || (body.room && body.room !== room.room_id)) return reply({}, 410);
    const viewers = room.viewers;
    const viewer = viewers[String(member.id)];
    const host = isAdmin && String(room.host_id) === String(member.id) && body.room === room.room_id;
    if (host && body.action === "stop") {
      await tx.execute(sql`update public.staging_sales_cast set expires_at = now(), viewers = '{}'::jsonb
        where tenant_id = ${member.tenant}`);
      return reply({});
    }
    if (host && body.action === "host") {
      const peer = viewers[String(body.viewer)];
      if (peer?.token && peer.token === body.token && typeof body.answer === "string" && body.answer.length <= 14000) {
        peer.answer = body.answer;
      }
    } else {
      if (!viewer || !["join", "watch"].includes(body.action)) return reply({}, 403);
      if (body.action === "join") {
        if (body.room !== room.room_id || typeof body.offer !== "string" || body.offer.length > 14000) return reply({}, 400);
        viewers[String(member.id)] = { token: randomUUID(), offer: body.offer, seen: Date.now() };
      } else {
        if (!viewer.token || viewer.token !== body.token || body.room !== room.room_id) return reply({}, 403);
        viewer.seen = Date.now();
      }
    }
    await tx.execute(sql`update public.staging_sales_cast set viewers = ${JSON.stringify(viewers)}::jsonb
      ${host ? sql`, expires_at = now() + interval '20 seconds'` : sql``} where tenant_id = ${member.tenant}`);
    if (host) {
      const activeMembers = await tx.execute<{ id: string }>(sql`select id from public.customer_users
        where tenant_id = ${member.tenant} and active and id::text in (
          select jsonb_object_keys(${JSON.stringify(viewers)}::jsonb)
        )`);
      const activeIds = new Set(activeMembers.map(user => String(user.id)));
      const peers = Object.entries(viewers).flatMap(([id, peer]) => activeIds.has(id) && peer.token && peer.offer &&
        Date.now() - (peer.seen ?? 0) < 12000 ? [{ id, token: peer.token, offer: peer.offer, answered: Boolean(peer.answer) }] : []);
      return reply({ peers });
    }
    const own = viewers[String(member.id)];
    return reply({ room: room.room_id, token: own.token, answer: own.answer });
  });
}

export async function GET(request: Request) {
  try { return await handle(request); } catch { return reply({}, 503); }
}

export const POST = GET;
