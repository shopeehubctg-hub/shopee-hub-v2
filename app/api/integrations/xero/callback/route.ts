import {cookies} from 'next/headers';
import {xeroActor,xeroFailure,xeroUnavailable,xeroHeaders,XERO_STATE_COOKIE} from '../../../../xero-server';
import {xeroDigest,xeroStateMatches,encryptXeroToken} from '../../../../xero-security';
import {exchangeXeroToken,xeroConnections} from '../../../../xero-client';
import {xeroRpc,tokenBinding} from '../../../../xero-store';
export async function GET(request:Request){try{const actor=await xeroActor(request);if(actor instanceof Response)return actor;if(!actor.config)return xeroUnavailable();const url=new URL(request.url);const jar=await cookies();const state=url.searchParams.get('state')??'';
 if(!xeroStateMatches(state,jar.get(XERO_STATE_COOKIE)?.value))return Response.json({error:'Connection expired. Start again from Account.'},{status:400,headers:xeroHeaders});
 const consumed=await xeroRpc<{stateId:string}>(actor,'xero_oauth_consume',{p_environment:actor.config.environment,p_organisation_id:actor.config.organisationId,p_state_digest:xeroDigest(state)});
 jar.set(XERO_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/integrations/xero',maxAge:0});
 const code=url.searchParams.get('code');if(url.searchParams.has('error')||!code||code.length>4096)return Response.json({error:'Xero connection was not completed.'},{status:400,headers:xeroHeaders});
 const tokens=await exchangeXeroToken(actor.config,{code});const connections=await xeroConnections(tokens);const matches=connections.filter(connection=>connection.organisationId===actor.config!.organisationId);if(matches.length!==1)return Response.json({error:'Connect the approved organisation only.'},{status:403,headers:xeroHeaders});const connection=matches[0];
 await xeroRpc(actor,'xero_connection_save',{p_state_id:consumed.stateId,p_connection_id:connection.id,p_organisation_id:connection.organisationId,p_organisation_name:connection.name,p_environment:actor.config.environment,p_encrypted_tokens:encryptXeroToken(tokens,actor.config.key,tokenBinding(actor,actor.config)),p_scopes:tokens.scopes,p_token_expires_at:new Date(tokens.expiresAt).toISOString()});
 return Response.redirect(new URL('/?section=account&xero=connected',actor.config.redirectUri),303);
 }catch{return xeroFailure();}}
