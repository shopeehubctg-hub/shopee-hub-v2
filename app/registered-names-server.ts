import 'server-only';
import {supabaseRest} from './supabase-rest';
export async function registeredNamesAvailable():Promise<boolean>{
 try{return await supabaseRest<boolean>('rpc/account_registered_names_available',{method:'POST'})===true;}
 catch(error){if(error instanceof Error&&/"code":"(PGRST202|PGRST205|42883)"/.test(error.message))return false;throw error;}
}
