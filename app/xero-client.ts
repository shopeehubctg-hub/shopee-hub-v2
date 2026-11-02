import 'server-only';
import {XERO_SCOPES,type XeroConfig} from './xero-security';
export type XeroTokens={accessToken:string;refreshToken:string;expiresAt:number;scopes:string[]};
export class XeroRemoteError extends Error{constructor(public code:'rate_limited'|'reconnect'|'remote_unavailable'|'invalid_response',public retryAfter=0){super(code);}}
/** Preserve exact decimal JSON numbers without rewriting digits inside quoted strings. */
export function parseXeroJson(text:string):unknown {
 if(text.length>8_000_000)throw new XeroRemoteError('invalid_response');
 let result='',quoted=false,escaped=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){result+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;result+=c;continue;}if(c==='-'||/[0-9]/.test(c)){const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));if(!number)throw new XeroRemoteError('invalid_response');result+=JSON.stringify(number[0]);i+=number[0].length-1;}else result+=c;}
 try{return JSON.parse(result);}catch{throw new XeroRemoteError('invalid_response');}
}
async function remote(url:string,init:RequestInit,fetcher:typeof fetch){let response:Response;try{response=await fetcher(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new XeroRemoteError('remote_unavailable');}if(response.status===429){const retry=Math.min(3600,Math.max(1,Number(response.headers.get('retry-after'))||60));throw new XeroRemoteError('rate_limited',retry);}if(response.status===400||response.status===401)throw new XeroRemoteError('reconnect');if(!response.ok)throw new XeroRemoteError('remote_unavailable');return response;}
export async function exchangeXeroToken(config:XeroConfig,grant:{code:string}|{refreshToken:string},fetcher:typeof fetch=fetch):Promise<XeroTokens>{
 const body:Record<string,string>='code'in grant?{grant_type:'authorization_code',code:grant.code,redirect_uri:config.redirectUri}:{grant_type:'refresh_token',refresh_token:grant.refreshToken};
 const response=await remote('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(config.clientId+':'+config.clientSecret).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)},fetcher);
 const raw=await response.json();const scopes=typeof raw.scope==='string'?raw.scope.split(' '):[];
 if(typeof raw.access_token!=='string'||!raw.access_token||typeof raw.refresh_token!=='string'||!raw.refresh_token||!Number.isFinite(raw.expires_in)||raw.expires_in<=0||raw.expires_in>7200||XERO_SCOPES.some(scope=>!scopes.includes(scope))||scopes.some((scope:string)=>scope.startsWith('accounting.')&&!scope.endsWith('.read')))throw new XeroRemoteError('invalid_response');
 return {accessToken:raw.access_token,refreshToken:raw.refresh_token,expiresAt:Date.now()+raw.expires_in*1000,scopes};
}
export async function xeroConnections(tokens:XeroTokens,fetcher:typeof fetch=fetch){const response=await remote('https://api.xero.com/connections',{headers:{Authorization:`Bearer ${tokens.accessToken}`,Accept:'application/json'}},fetcher);const rows=await response.json();if(!Array.isArray(rows)||rows.length>100)throw new XeroRemoteError('invalid_response');return rows.map(row=>{if(typeof row.id!=='string'||typeof row.tenantId!=='string'||typeof row.tenantName!=='string'||row.tenantType!=='ORGANISATION')throw new XeroRemoteError('invalid_response');return {id:row.id,organisationId:row.tenantId,name:row.tenantName};});}
export async function xeroReadPage(tokens:XeroTokens,organisationId:string,resource:'Invoices'|'Payments'|'TrackingCategories',query:Record<string,string>={},fetcher:typeof fetch=fetch){
 if(!['Invoices','Payments','TrackingCategories'].includes(resource))throw new XeroRemoteError('invalid_response');
 if(!/^[0-9a-f-]{36}$/i.test(organisationId))throw new XeroRemoteError('invalid_response');
 const url=new URL(`https://api.xero.com/api.xro/2.0/${resource}`);url.search=new URLSearchParams(query).toString();
 const response=await remote(url.toString(),{method:'GET',headers:{Authorization:`Bearer ${tokens.accessToken}`,'Xero-tenant-id':organisationId,Accept:'application/json'}},fetcher);
 const raw=parseXeroJson(await response.text()) as Record<string,unknown>;if(!raw||!Array.isArray(raw[resource]))throw new XeroRemoteError('invalid_response');return raw[resource] as Record<string,unknown>[];
}
