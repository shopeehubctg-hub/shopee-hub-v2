import 'server-only';
import roster from './account-roster-data.json';
import {cookies} from 'next/headers';
import {getChatGPTUser,PORTAL_SESSION_COOKIE,readPortalSessionWithId} from './chatgpt-auth';
import {createHash} from 'node:crypto';
import {ACCOUNT_STEPUP_COOKIE,accountSecurityGate} from './account-security-server';
import {supabaseRest} from './supabase-rest';
import {xeroConfig,type XeroConfig} from './xero-security';
export const XERO_STATE_COOKIE='shopee_xero_state';
export type XeroActor={tenantId:string;actorEmail:string;sessionDigest:string;stepupDigest:string|null;config:XeroConfig|null};
export async function xeroActor(request?:Request,mutation=false):Promise<XeroActor|Response>{
 const locked=await accountSecurityGate();if(locked)return locked;
 const actor=await getChatGPTUser();if(!actor)return Response.json({error:'Sign in to continue.'},{status:401});
 const jar=await cookies();const primary=readPortalSessionWithId(jar.get(PORTAL_SESSION_COOKIE)?.value);
 if(!primary?.sessionId||primary.email!==actor.email.toLowerCase())return Response.json({error:'Sign in to continue.'},{status:401});
 const members=await supabaseRest<Array<{tenant_id:string;role:string;active:boolean}>>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(primary.email)}&limit=1`);
 const member=members[0];if(!member?.active||member.role!=='superadmin'||member.tenant_id!==roster.tenantId)return Response.json({error:'Super Admin access required.'},{status:403});
 const tenants=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
 if(!tenants[0]?.active)return Response.json({error:'Account unavailable.'},{status:403});
 const config=xeroConfig();
 if(request&&config&&new URL(request.url).origin!==new URL(config.redirectUri).origin)return Response.json({error:'Open the current Dashboard to continue.'},{status:403});
 if(mutation&&request&&(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin))return Response.json({error:'Reload Account before continuing.'},{status:403});
 return {tenantId:member.tenant_id,actorEmail:primary.email,sessionDigest:createHash('sha256').update(Buffer.from(primary.sessionId,'base64url')).digest('hex'),stepupDigest:sessionDigest(jar.get(ACCOUNT_STEPUP_COOKIE)?.value),config};
}
export const xeroHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export function xeroUnavailable(){return Response.json({error:'Xero connection is not configured in this environment.'},{status:503,headers:xeroHeaders});}
export function xeroFailure(){return Response.json({error:'Unable to load Xero. Please try again.'},{status:503,headers:xeroHeaders});}

function sessionDigest(value:string|undefined){if(!value||! /^[A-Za-z0-9_-]{43}$/.test(value))return null;const bytes=Buffer.from(value,'base64url');return bytes.length===32?createHash('sha256').update(bytes).digest('hex'):null;}
