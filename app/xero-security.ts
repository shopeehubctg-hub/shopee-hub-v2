import 'server-only';
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {assertDeploymentIsolation} from './deployment-isolation';
export const XERO_SCOPES=['offline_access','accounting.invoices.read','accounting.payments.read','accounting.settings.read'] as const;
export type XeroConfig={clientId:string;clientSecret:string;redirectUri:string;key:Buffer;organisationId:string;environment:'staging'|'production'};
export function xeroConfig(env:NodeJS.ProcessEnv=process.env):XeroConfig|null {
 const target=assertDeploymentIsolation(env);
 if(target==='local'||env.XERO_ENABLED!=='1')return null;
 // Explicitly provision a separate sandbox app. A production app ID never authorises Stage.
 if(target==='staging'&&(env.XERO_SANDBOX_ONLY!=='1'||!env.XERO_APP_ID||env.XERO_APP_ID==='d715b129-6f0c-41eb-bb72-2a4093d74e61'))return null;
 const origin=target==='staging'?'https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app':'https://shopee-hub-v2-260731.vercel.app';
 const redirectUri=`${origin}/api/integrations/xero/callback`;
 if(!env.XERO_CLIENT_ID||!env.XERO_CLIENT_SECRET||env.XERO_REDIRECT_URI!==redirectUri||!env.XERO_ORGANISATION_ID)return null;
 const encoded=env.XERO_TOKEN_KEY??'';const key=Buffer.from(encoded,'base64');
 if(key.length!==32||key.toString('base64')!==encoded)return null;
 if(!/^[0-9a-f-]{36}$/i.test(env.XERO_CLIENT_ID)||! /^[0-9a-f-]{36}$/i.test(env.XERO_ORGANISATION_ID))return null;
 return {clientId:env.XERO_CLIENT_ID,clientSecret:env.XERO_CLIENT_SECRET,redirectUri,key,organisationId:env.XERO_ORGANISATION_ID,environment:target};
}
export function randomXeroState(){return randomBytes(32).toString('base64url');}
export function xeroDigest(value:string){return createHash('sha256').update(value).digest('hex');}
export function xeroStateMatches(raw:string,cookie:string|undefined){if(!cookie||! /^[A-Za-z0-9_-]{43}$/.test(raw)||raw.length!==cookie.length)return false;return timingSafeEqual(Buffer.from(raw),Buffer.from(cookie));}
/** AAD binds ciphertext to the deployment, Dashboard tenant and Xero organisation. */
export function encryptXeroToken(value:unknown,key:Buffer,binding:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(binding));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');}
export function decryptXeroToken<T>(value:string,key:Buffer,binding:string):T{const [version,iv,tag,data,...extra]=value.split('.');if(version!=='v1'||extra.length||!iv||!tag||!data)throw Error('Invalid token envelope');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8')) as T;}
export function xeroAuthoriseUrl(config:XeroConfig,state:string){const url=new URL('https://login.xero.com/identity/connect/authorize');url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:XERO_SCOPES.join(' '),state}).toString();return url.toString();}
