import {and,eq,sql} from 'drizzle-orm';
import {getDb} from '../../../db';
import {customerUsers} from '../../../db/schema';
import {getChatGPTUser} from '../../chatgpt-auth';
import {canAccessModule,canAccessStore} from '../../module-access';
import {deploymentTarget} from '../../deployment-isolation';
import {BERLANCO_CATALOG_STORE} from '../../inventory-catalog-model';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 try{
  if(deploymentTarget()!=='staging')return Response.json({error:'Product search is available in Staging only.'},{status:404,headers});
  const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to search products.'},{status:401,headers});
  const db=await getDb();const [member]=await db.select().from(customerUsers).where(and(eq(customerUsers.email,user.email.toLowerCase()),eq(customerUsers.active,true))).limit(1);
  const url=new URL(request.url),storeId=url.searchParams.get('storeId')??'',q=(url.searchParams.get('q')??'').trim();
  if(!member||!await canAccessModule(db,member,'packages')||!await canAccessStore(db,member,storeId))return Response.json({error:'You do not have access to this project.'},{status:403,headers});
  if(storeId!==BERLANCO_CATALOG_STORE)return Response.json({error:'Product search is currently available for Berlanco only.'},{status:404,headers});
  if(q.length>200)return Response.json({error:'Search with up to 200 characters.'},{status:400,headers});
  const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  const products=await db.execute(sql`select sku,name from public.inventory_skus where tenant_id=${member.tenantId} and store_id=${storeId} and active=true and (sku ilike ${pattern} or name ilike ${pattern}) order by lower(sku),sku limit 100`);
  return Response.json({products:Array.from(products),storeId},{headers});
 }catch{return Response.json({error:'Product search is unavailable. Please retry.'},{status:503,headers});}
}
