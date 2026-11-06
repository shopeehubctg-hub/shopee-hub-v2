import 'server-only';
import {sql} from 'drizzle-orm';
import type {getDb} from '../db';
import {supabaseRest} from './supabase-rest';
import {canonicalStoreId} from './live-calendar-model';
type Member={id:number;active:boolean};
function checkedIds(value:unknown):Set<string>{if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!id||id.length>200||canonicalStoreId(id)!==id))throw Error('Store access cannot be verified');return new Set(value);}
/** Fresh database policy for every request; never cache authorization or trust browser store IDs. */
export async function restStoreAccessIds(member:Member&{tenant_id:string}):Promise<Set<string>>{if(!member.active)return new Set();return checkedIds(await supabaseRest<unknown>('rpc/permission_effective_stores',{method:'POST',body:JSON.stringify({p_tenant:member.tenant_id,p_user_id:member.id})}));}
export async function dbStoreAccessIds(db:Awaited<ReturnType<typeof getDb>>,member:Member&{tenantId:string}):Promise<Set<string>>{if(!member.active)return new Set();const [result]=Array.from(await db.execute(sql`select public.permission_effective_stores(${member.tenantId},${member.id}) as ids`)) as Array<{ids:unknown}>;return checkedIds(result?.ids);}

/** A separate SQL policy preserves the explicitly granted all-store leaderboard without widening other modules. */
export async function restLeaderboardStoreIds(member:Member&{tenant_id:string}):Promise<Set<string>>{if(!member.active)return new Set();return checkedIds(await supabaseRest<unknown>('rpc/permission_effective_leaderboard_stores',{method:'POST',body:JSON.stringify({p_tenant:member.tenant_id,p_user_id:member.id})}));}
