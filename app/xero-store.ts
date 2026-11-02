import 'server-only';
import {randomUUID} from 'node:crypto';
import {supabaseRest} from './supabase-rest';
import type {XeroActor} from './xero-server';
import {decryptXeroToken,encryptXeroToken,type XeroConfig} from './xero-security';
import {exchangeXeroToken,XeroRemoteError,type XeroTokens} from './xero-client';
export type XeroConnectionMetadata={organisationId:string;organisationName:string;status:string;lastSyncedAt:string|null;retryAt?:string|null;lastError?:string|null};
export type XeroStored={connection:XeroConnectionMetadata|null;encryptedTokens?:string;tokenVersion?:string;tokenExpiresAt?:string;snapshot?:unknown};
export function xeroRpc<T>(actor:XeroActor,name:string,args:Record<string,unknown>={}):Promise<T>{return supabaseRest<T>(`rpc/${name}`,{method:'POST',body:JSON.stringify({p_tenant:actor.tenantId,p_actor:actor.actorEmail,p_session_digest:actor.sessionDigest,p_stepup_digest:actor.stepupDigest,...args})});}
export function readXeroConnection(actor:XeroActor,config:XeroConfig){return xeroRpc<XeroStored>(actor,'xero_connection_read',{p_environment:config.environment});}
export function tokenBinding(actor:XeroActor,config:XeroConfig){return `${config.environment}:${actor.tenantId}:${config.organisationId}`;}
/** DB lease covers only ownership; no database transaction spans an external request. */
export async function currentXeroTokens(actor:XeroActor,config:XeroConfig,stored:XeroStored,fetcher:typeof fetch=fetch):Promise<XeroTokens>{
 if(!stored.encryptedTokens||!stored.tokenVersion||stored.connection?.organisationId!==config.organisationId)throw Error('XERO_RECONNECT');
 const tokens=decryptXeroToken<XeroTokens>(stored.encryptedTokens,config.key,tokenBinding(actor,config));
 if(tokens.expiresAt>Date.now()+60000)return tokens;
 const leaseId=randomUUID();const claim=await xeroRpc<{claimed:boolean;encryptedTokens:string;tokenVersion:string}>(actor,'xero_refresh_claim',{p_environment:config.environment,p_expected_version:stored.tokenVersion,p_lease_id:leaseId});
 if(!claim.claimed)throw Error('XERO_REFRESH_BUSY');
 const latest=decryptXeroToken<XeroTokens>(claim.encryptedTokens,config.key,tokenBinding(actor,config));
 let refreshed:XeroTokens;try{refreshed=await exchangeXeroToken(config,{refreshToken:latest.refreshToken},fetcher);}catch(error){try{await xeroRpc(actor,'xero_refresh_fail',{p_environment:config.environment,p_expected_version:claim.tokenVersion,p_lease_id:leaseId,p_error_code:error instanceof XeroRemoteError?error.code:'remote_unavailable',p_retry_after:error instanceof XeroRemoteError?error.retryAfter:0});}catch{/* The database lease expires if failure status cannot be recorded. */}throw error;}
 await xeroRpc(actor,'xero_refresh_complete',{p_environment:config.environment,p_expected_version:claim.tokenVersion,p_lease_id:leaseId,p_encrypted_tokens:encryptXeroToken(refreshed,config.key,tokenBinding(actor,config)),p_scopes:refreshed.scopes,p_token_expires_at:new Date(refreshed.expiresAt).toISOString()});
 return refreshed;
}
