import {cookies} from 'next/headers';
import {xeroActor,xeroFailure,xeroUnavailable,xeroHeaders,XERO_STATE_COOKIE} from '../../../../xero-server';
import {xeroAuthoriseUrl,randomXeroState,xeroDigest} from '../../../../xero-security';
import {xeroRpc} from '../../../../xero-store';
export async function POST(request:Request){try{const actor=await xeroActor(request,true);if(actor instanceof Response)return actor;if(!actor.config)return xeroUnavailable();const state=randomXeroState();await xeroRpc(actor,'xero_oauth_begin',{p_environment:actor.config.environment,p_organisation_id:actor.config.organisationId,p_state_digest:xeroDigest(state),p_expires_at:new Date(Date.now()+600000).toISOString()});(await cookies()).set(XERO_STATE_COOKIE,state,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/integrations/xero',maxAge:600});return Response.json({authorizeUrl:xeroAuthoriseUrl(actor.config,state)},{headers:xeroHeaders});}catch{return xeroFailure();}}
