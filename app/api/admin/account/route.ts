import { canonicalStoreId } from '../../../live-calendar-model';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { supabaseRest } from '../../../supabase-rest';
import { buildAccount, emptyAccount, malaysiaDate } from '../../../account-ledger';
import { accountRosterFallback, mergeAccountRoster } from '../../../account-roster';
import type { Cycle, Term, Assessment, Invoice, Receipt, Allocation } from '../../../account-ledger';
export const dynamic='force-dynamic';
// Select only public UI fields. Internal evidence, legal entity and raw source rows never leave the server.
async function rows<T>(table:string,select:string,tenant:string):Promise<T[]> {
  const output:T[]=[];
  for(let offset=0;;offset+=500) {
    const page=await supabaseRest<T[]>(`${table}?select=${select}&tenant_id=eq.${encodeURIComponent(tenant)}&order=id.asc&limit=500&offset=${offset}`);
    output.push(...page); if(page.length<500) return output;
    if(output.length>=50000) throw new Error('Ledger export required');
  }
}
export async function GET(request:Request) {
  const actor=await getChatGPTUser();
  if(!actor) return Response.json({error:'Authentication required'},{status:401});
  try {
    const memberships=await supabaseRest<Array<{tenant_id:string;active:boolean;role:string}>>(`customer_users?select=tenant_id,active,role&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
    const member=memberships[0];
    if(!member?.active||member.role!=='superadmin') return Response.json({error:'Super Admin access required'},{status:403});
    const tenants=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
    if(!tenants[0]?.active) return Response.json({error:'Account unavailable'},{status:403});
    const today=malaysiaDate();
    const invoiceMonth=new URL(request.url).searchParams.get('invoiceMonth')??today.slice(0,7);
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(invoiceMonth)) return Response.json({error:'Choose a valid invoice month'},{status:400});
    const stores=await rows<{id:string;name:string;display_name:string|null}>('stores','id,name,display_name',member.tenant_id);
    const storeNames=new Map(stores.filter(s=>canonicalStoreId(s.id)===s.id).map(s=>[s.id,s.display_name??s.name]));
    try {
      const [cycles,terms,assessments,invoices,receipts,allocations]=await Promise.all([
        rows<Cycle>('account_billing_cycles','id,statement_month,invoice_month,service_period_start,service_period_end,updated_at',member.tenant_id),
        rows<Term>('account_store_terms','id,roster_key,roster_project,store_id,currency,confirmed,effective_from,effective_to,updated_at',member.tenant_id),
        rows<Assessment>('account_assessments','id,cycle_id,term_id,expected_net_fee::text,status,updated_at',member.tenant_id),
        rows<Invoice>('account_invoices','id,assessment_id,gross_amount::text,credit_amount::text,status,updated_at',member.tenant_id),
        rows<Receipt>('account_receipts','id,collection_date,currency,amount::text,kind,status,updated_at',member.tenant_id),
        rows<Allocation>('account_receipt_allocations','id,invoice_id,receipt_id,amount::text,updated_at',member.tenant_id),
      ]);
      const account=buildAccount({cycles,terms,assessments,invoices,receipts,allocations,storeNames},invoiceMonth,today);
      return Response.json(mergeAccountRoster(account,accountRosterFallback(member.tenant_id,invoiceMonth,today,storeNames)));
    } catch(error) {
      // Missing migration is an explicit setup state; permission/network/data errors are failures.
      if(error instanceof Error&&(/"code":"(PGRST205|42P01)"/.test(error.message))) return Response.json(accountRosterFallback(member.tenant_id,invoiceMonth,today,storeNames)??emptyAccount(invoiceMonth,today,'not_configured'));
      throw error;
    }
  } catch {
    return Response.json({error:'Unable to load Account. Please try again.'},{status:503});
  }
}
