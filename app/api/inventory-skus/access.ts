import {and,eq} from 'drizzle-orm';
import {getDb} from '../../../db';
import {customerUsers} from '../../../db/schema';
import {getChatGPTUser} from '../../chatgpt-auth';
import {canAccessModule,canAccessStore} from '../../module-access';
export async function inventoryAccess(storeId:string){
 const user=await getChatGPTUser();if(!user)throw Object.assign(Error('Sign in to continue.'),{status:401});
 const db=await getDb();const [member]=await db.select().from(customerUsers).where(and(eq(customerUsers.email,user.email.toLowerCase()),eq(customerUsers.active,true))).limit(1);
 if(!member||!await canAccessModule(db,member,'packages')||!await canAccessStore(db,member,storeId))throw Object.assign(Error('You do not have access to this project.'),{status:403});
 return {db,member,user};
}
export const inventoryResponseError=(error:unknown)=>Response.json({error:error instanceof Error?error.message:'Unable to process products.'},{status:Number((error as {status?:number}).status)||409,headers:{'Cache-Control':'private, no-store'}});
