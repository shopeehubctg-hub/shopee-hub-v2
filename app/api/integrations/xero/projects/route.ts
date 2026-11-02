import {xeroActor,xeroFailure,xeroUnavailable,xeroHeaders} from '../../../../xero-server';
import {readXeroConnection,currentXeroTokens} from '../../../../xero-store';
import {xeroReadPage} from '../../../../xero-client';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const actor=await xeroActor(request);if(actor instanceof Response)return actor;if(!actor.config)return xeroUnavailable();
 const stored=await readXeroConnection(actor,actor.config);if(!stored.connection)return Response.json({error:'Connect Xero first.'},{status:409,headers:xeroHeaders});
 const tokens=await currentXeroTokens(actor,actor.config,stored);
 const categories=await xeroReadPage(tokens,actor.config.organisationId,'TrackingCategories');
 const projects=categories.filter(row=>typeof row.Name==='string'&&row.Name.trim().replace(/\s+/g,' ').toLowerCase()==='projects');
 if(projects.length!==1)return Response.json({error:'Projects category must resolve uniquely.'},{status:409,headers:xeroHeaders});
 const category=projects[0];const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof category.TrackingCategoryID!=='string'||!uuid.test(category.TrackingCategoryID)||!Array.isArray(category.Options)||category.Options.length>1000)return xeroFailure();
 const seen=new Set<string>();const options=[];
 for(const raw of category.Options){if(!raw||typeof raw!=='object'||Array.isArray(raw))return xeroFailure();const row=raw as Record<string,unknown>;if(typeof row.TrackingOptionID!=='string'||!uuid.test(row.TrackingOptionID)||seen.has(row.TrackingOptionID)||typeof row.Name!=='string'||!row.Name.trim()||row.Name.length>240)return xeroFailure();seen.add(row.TrackingOptionID);options.push({id:row.TrackingOptionID,name:row.Name});}
 return Response.json({category:{id:category.TrackingCategoryID,name:category.Name},options},{headers:xeroHeaders});
 }catch{return xeroFailure();}}
